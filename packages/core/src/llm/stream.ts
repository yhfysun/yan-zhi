// SSE 流式响应解析
import type { ChatChunk } from '@yan-zhi/shared';

const DONE = 'DONE';
/** ★ SSE 的标准结束哨兵是 `data: [DONE]`（**带方括号**，见 OpenAI 流式约定）。
 *  旧实现只比 `DONE` → `[DONE]` 落入 JSON.parse 失败分支被静默跳过，从未被识别为收尾。
 *  两种写法都认，避免不同网关的差异。 */
const DONE_BRACKETED = '[DONE]';

/** OpenAI 兼容的 `finish_reason` 终态值（见到任一即认为本轮已正常说完） */
const TERMINAL_FINISH_REASONS = new Set(['stop', 'tool_calls', 'length', 'content_filter', 'function_call']);

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
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<ChatChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /** 是否见到终态（finish_reason 或 [DONE]） */
  let terminated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
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