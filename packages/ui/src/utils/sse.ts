// UI 侧 SSE 流式解码唯一出口（P5 遗留收口，2026-10-04）。
//
// ★ 背景：前端曾有 7 份手写 fetch + reader.read() 解码循环（聊天主链路 / 子智能体 /
//   运维·安全控制台 / 本地终端 / SFTP 进度 / CI-CD / 运行调试面板），分帧逻辑各自
//   复刻且细节漂移（有的按 '\n' 切行、有的不跳注释帧、有的 trim 有的不 trim）。
//   统一为：按 SSE 标准分帧（'\n\n'），取帧内第一条 data: 行，跳过注释帧（':xxx'）。
//
// ★ 语义约定（与既有各实现的最大公约数）：
// - payload 去掉 'data:' 前缀后 **trim**（base64 / JSON 均不受影响）；
// - 以 ':' 开头的 payload 是注释帧（如 ':connected'），不投递；
// - 非 JSON 帧不在此层报错 —— onData 拿到原始字符串，由调用方自行解析（终端流是 base64）。

/** 从累积 buffer 中抽取完整的 SSE data 载荷；返回剩余不完整帧。纯函数（可单测）。 */
export function extractSsePayloads(buffer: string): { payloads: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() || '';
  const payloads: string[] = [];
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload.startsWith(':')) continue;
    payloads.push(payload);
  }
  return { payloads, rest };
}

/**
 * 消费一条 SSE 响应体流：读到流结束为止，每个完整 data 载荷回调一次 onData。
 * onData 返回 false 表示不再需要后续帧（如任务已完成）→ 立即停止读取并正常返回。
 * abort（AbortSignal）会让 reader.read() reject 并原样上抛 —— 调用方按需 try/catch。
 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onData: (payload: string) => void | false | Promise<void | false>,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { payloads, rest } = extractSsePayloads(buffer);
      buffer = rest;
      // 逐帧 await：事件处理器可能是 async（如聊天主链路逐条处理工具调用），保持串行语义
      for (const p of payloads) {
        if ((await onData(p)) === false) return;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* 已释放/已取消 */ }
  }
}

/** JSON 帧 convenience：解析失败（非 JSON / 空帧）返回 null，不抛错。 */
export function parseSseJson<T = unknown>(payload: string): T | null {
  try { return JSON.parse(payload) as T; } catch { return null; }
}
