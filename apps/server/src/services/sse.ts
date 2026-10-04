// 服务端 SSE 端点助手（P5 收敛，2026-10-04）。
//
// ★ 为什么必须单点：此前 6 个端点各手写「3 行 header → connected 帧 → subscribe →
//   close 退订」，llm-tasks 与 workflow 的 stream 端点结构完全相同；改协议（如补
//   心跳、换帧格式）不可能逐处同步。
//
// 协议约定（保持不变）：
//   · 帧格式 `data: ${JSON.stringify(event)}\n\n`；
//   · connected 事件不进事件数组、不推进前端 since 游标。

import type { Request, Response } from 'express';

export interface SseStreamOptions {
  /** connected 帧负载（seq 等由调用方给） */
  connected: Record<string, unknown>;
  /** 订阅后续事件，返回退订函数 */
  subscribe: (onEvent: (event: unknown) => void) => () => void;
}

/** 设 SSE header + 发 connected 帧 + 订阅 + 断开自动退订；返回发送函数（供扩展用） */
export function sseStream(req: Request, res: Response, opts: SseStreamOptions): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(`data: ${JSON.stringify({ type: 'connected', ...opts.connected })}\n\n`);
  const unsubscribe = opts.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  req.on('close', () => { unsubscribe(); });
}
