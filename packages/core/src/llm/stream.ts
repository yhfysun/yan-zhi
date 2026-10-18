// SSE 流式响应解析
import type { ChatChunk } from '@yan-zhi/shared';
import { normalizeOpenAiUsage } from '@yan-zhi/shared';

const DONE = 'DONE';
/** ★ SSE 的标准结束哨兵是 `data: [DONE]`（**带方括号**，见 OpenAI 流式约定）。
 *  旧实现只比 `DONE` → `[DONE]` 落入 JSON.parse 失败分支被静默跳过，从未被识别为收尾。
 *  两种写法都认，避免不同网关的差异。 */
const DONE_BRACKETED = '[DONE]';

/** OpenAI 兼容的 `finish_reason` 终态值（见到任一即认为本轮已正常说完） */
const TERMINAL_FINISH_REASONS = new Set(['stop', 'tool_calls', 'length', 'content_filter', 'function_call']);

/**
 * 上游流「静默」超时（毫秒）：连接**没关**但**长时间不吐任何数据**时的兜底。
 *
 * ★★★ 为什么需要（2026-10-15，稳定性）：`reader.read()` 是裸调用，没有空闲计时器。
 *   若上游接了连接、之后既不吐数据也不关连接（网关挂起 / 中间设备静默丢包），
 *   `read()` 会**一直 pending**：`consumeStream` 永不返回，该步既不失败也不结束，
 *   整个任务卡死 —— 唯一的逃生口只有用户手动中止或 2 小时看门狗。
 *
 * ★ 取值 10 分钟：**任何正常上游都不会连续 10 分钟一个字节都不发**（首 token 慢的推理模型
 *   也远低于此；SSE 期间还有心跳/分帧），所以它只会在真正静默时触发，不会误杀。
 *   可用环境变量 `YANZHI_LLM_IDLE_TIMEOUT_MS` 覆盖，设 0 = 关闭本兜底（回到旧行为）。
 *   ★ 与"终止判定"（terminated）是**两件事**：那个管"流是不是正常说完"，这个管"流是不是死了"。
 */
export const DEFAULT_LLM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** 解析生效的空闲超时：显式传参 > 环境变量 > 默认 10 分钟；<=0 关闭。 */
export function resolveLlmIdleTimeoutMs(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.max(0, explicit);
  const env = Number(process.env.YANZHI_LLM_IDLE_TIMEOUT_MS);
  if (Number.isFinite(env)) return Math.max(0, env);
  return DEFAULT_LLM_IDLE_TIMEOUT_MS;
}

/**
 * 带空闲超时的 `reader.read()`。
 *
 * ★ 超时时必须 `reader.cancel()`：否则那个 pending 的读会一直挂在底层流上（连接不释放）。
 * ★ 只有**本函数的超时**才 cancel —— 网络自身报错时交由原调用链处理（保持既有语义）。
 */
export async function readWithIdleTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  idleMs: number,
): Promise<ReadableStreamReadResult<T>> {
  const readPromise = reader.read();
  if (!(idleMs > 0)) return readPromise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    return await Promise.race([
      readPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`上游流 ${Math.round(idleMs / 1000)} 秒无数据（连接未关闭但已静默）—— 已中止本次流读取，避免任务无限挂起`));
        }, idleMs);
      }),
    ]);
  } catch (e) {
    if (timedOut) {
      void readPromise.catch(() => { /* 取消后 pending 的读会 reject，吞掉即可 */ });
      try { await reader.cancel(); } catch { /* 流可能已关闭，忽略 */ }
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 解析 OpenAI 兼容的 SSE 流。
 *
 * ★★★ 为什么必须跟踪「终态」（2026-10-09，实据诊断 P0）：
 *   上游/代理常用 **TCP FIN 半途关闭 SSE 连接**，此时 `reader.read()` 是
 *   **正常 resolve `{done:true}` 而不是抛错**（只有 RST/超时才抛）。
 *   旧实现只看 `done` 就 break —— 半截流被当成正常收尾：
 *   content 为空、reasoning 只有一半，调用方却 emit `task:completed`
 *   （实测库内 12 条 assistant 记录正是此形状，用户体感"转半天不出话"）。
 *
 *   判据：**见到 `finish_reason` 或 `data: [DONE]` 之一**才算正常收尾。
 *   流结束时若二者皆未见，吐出最后一个 `terminated: false` 的 chunk ——
 *   调用方（LlmClient.chatStream / 任务循环）据此判「截断」，走续写或报错，
 *   而**不是**当作完成。这样 `chatStream` 的消费方无需各自重复这套判定。
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
  opts?: { idleTimeoutMs?: number },
): AsyncIterable<ChatChunk> {
  const reader = stream.getReader();
  const idleMs = resolveLlmIdleTimeoutMs(opts?.idleTimeoutMs);
  const decoder = new TextDecoder();
  let buffer = '';
  /** 是否见到终态（finish_reason 或 [DONE]） */
  let terminated = false;

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader, idleMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === DONE || data === DONE_BRACKETED) { terminated = true; continue; }
        if (!data) continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          const finishReason = json.choices?.[0]?.finish_reason;
          if (finishReason && TERMINAL_FINISH_REASONS.has(String(finishReason))) terminated = true;
          yield {
            delta: {
              content: delta?.content,
              reasoningContent: delta?.reasoning_content,
              toolCalls: delta?.tool_calls,
            },
            finishReason,
            usage: json.usage
              ? {
                  promptTokens: json.usage.prompt_tokens,
                  completionTokens: json.usage.completion_tokens,
                  // ★ D1 可观测（2026-10-09）：OpenAI 把缓存命中放在 prompt_tokens_details.cached_tokens
                  cachedTokens: json.usage.prompt_tokens_details?.cached_tokens,
                  // ★ 计价明细（2026-10-17）：在**协议边界**归一化，计价层只认 TokenUsageDetail。
                  //   注意 OpenAI 的 cached 是 prompt 的子集 ⇒ 全价输入要减掉（不能直接用 promptTokens）。
                  detail: normalizeOpenAiUsage(json.usage),
                }
              : undefined,
          };
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 收尾标记：false = 流被上游/代理提前掐断（未见 finish_reason 也未见 [DONE]）。
  // 有的端点把 finish_reason 放在最后一帧的其它位置，故只要任一帧见到即算收尾。
  yield { terminated };
}