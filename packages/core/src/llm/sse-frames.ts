/**
 * SSE 帧解析 —— 带 `event:` 行的那一类（Anthropic / OpenAI Responses 都用这种格式）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★ 为什么单独抽出来
 *
 * 项目里已经有两份内联的 SSE 解析：`stream.ts`（OpenAI Chat，只有 `data:` 行）和
 * `anthropic.ts`（`event:` + `data:`）。写 Responses 协议时是**第三处**需求 ——
 * 再抄一遍就变成三份各自漂移的实现，而"末帧不带换行"这类边界只会**在其中一处被修**，
 * 另外两处静默丢帧。
 *
 * ⇒ 新协议（Responses）**不复制**，改用本模块。`anthropic.ts` 的存量内联实现
 *   保持不动（改它要重跑既有用例，风险不值当），但已留 TODO，下次动它时收敛过来。
 *
 * ---
 * ## 与 OpenAI Chat 的 `parseSSE` 的区别（**不要合并**）
 *
 * `stream.ts` 的 `parseSSE` 只认 `data:` 行，且直接产出 `ChatChunk`；
 * 本模块只负责**把字节流切成帧**，不关心业务语义 —— 因为 Responses 与 Anthropic 的
 * 事件类型完全不同，只有"分帧"这一步是相同的。
 *
 * ---
 * ## ★ 边界（每条都是真实咬人的）
 *
 * 1. **末帧可能没有尾随空行** ⇒ 流结束要兜底 flush，否则丢最后一个事件。
 * 2. **最后一行可能没有换行结尾**（本模块写第一版时就栽在这里）：
 *    只按 `\n` 切的话，这一行会永远留在 buffer 里**不被解析** ⇒
 *    最后一个事件（常常正是 `response.completed`）丢失 ⇒
 *    上层把正常完成的流误判成"被掐断"，触发本不必要的续写/报错。
 *    ⇒ 流结束时必须把 buffer 剩余内容**当作一行**再处理一次。
 * 3. **CRLF**：Windows 侧网关会发 `\r\n` ⇒ 行尾要 trim 掉 `\r`。
 * 4. **网关可能省略 `event:` 行**，把类型放在 JSON 的 `type` 字段里
 *    ⇒ 本模块**不做**类型推断，两个来源都交给调用方（调用方最清楚自己的协议）。
 */

export interface SseFrame {
  /** `event:` 行的值；该帧没有 `event:` 行时为空串 */
  eventType: string;
  /** `data:` 行的原文（可能是 `[DONE]` 之类的哨兵） */
  data: string;
  /** data 解析后的 JSON；解析失败（或不是 JSON）时为 null */
  json: any | null;
}

/** 把 SSE 字节流切成帧。**只做分帧，不解释业务语义。** */
export async function* parseSseFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let dataStr = '';

  const reset = () => {
    eventType = '';
    dataStr = '';
  };

  /** 结算当前挂起的帧（空行触发 / 流末尾兜底） */
  const flush = (): SseFrame | null => {
    if (!dataStr) {
      reset();
      return null;
    }
    let json: any = null;
    try {
      json = JSON.parse(dataStr);
    } catch {
      json = null; // 非 JSON（如 `[DONE]`）交给调用方按哨兵处理
    }
    const frame: SseFrame = { eventType, data: dataStr, json };
    reset();
    return frame;
  };

  /** 单行处理：空行 = 结算；`event:` / `data:` = 累积；其余忽略。返回待产出的帧（可能为 null） */
  const handleLine = (line: string): SseFrame | null => {
    if (line === '') return flush();
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
      return null;
    }
    if (line.startsWith('data:')) {
      dataStr = line.slice(5).trim();
      return null;
    }
    return null; // `:` 心跳、`id:`、`retry:` 等
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        const f = handleLine(line);
        if (f) yield f;
      }
    }
    // ★ 兜底 ①：最后一行可能没有换行结尾 —— 不补处理它就永远留在 buffer 里
    if (buffer.trim()) {
      const f = handleLine(buffer.replace(/\r$/, ''));
      if (f) yield f;
    }
    // ★ 兜底 ②：末帧可能没有尾随空行 —— 不结算就丢最后一个事件
    const tail = flush();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** 把字符串直接切成帧（测试与"已有完整响应体"的场景用，省去构造 ReadableStream） */
export function parseSseFramesFromText(text: string): SseFrame[] {
  const out: SseFrame[] = [];
  let eventType = '';
  let dataStr = '';
  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    const line = lines[i].replace(/\r$/, '');
    // 最后一行无换行结尾时也要当作一行处理（与流式路径同判据）
    if (line === '' && !isLast) {
      if (dataStr) {
        let json: any = null;
        try { json = JSON.parse(dataStr); } catch { json = null; }
        out.push({ eventType, data: dataStr, json });
      }
      eventType = '';
      dataStr = '';
      continue;
    }
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
  }
  if (dataStr) {
    let json: any = null;
    try { json = JSON.parse(dataStr); } catch { json = null; }
    out.push({ eventType, data: dataStr, json });
  }
  return out;
}
