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

/**
 * 心跳间隔（2026-10-08）。
 *
 * ★★★ 为什么必须有：本模块只写 `connected` 帧然后干等业务事件，而业务事件在两种常态下
 *   **长时间为零**：① LLM 推理（长思考模型单次可达数十秒）；② 前端执行工具期间
 *   （浏览器导航/截图/上传，主进程总闸已放宽到 60s）。这段静默期在**双向**都无字节：
 *   服务端不写、客户端 reader 也只在收到帧时才前进 —— 任何中间层（代理 / 长连接超时 /
 *   NAT 会话老化）都能判空闲掐断。前端 `consumeSseStream` 读到 `done` 与"任务真终态"
 *   **无从区分**（sseStream 从不 res.end()），于是 UI 显示已结束而后端仍在跑。
 *
 * ★ 注释帧（以 `:` 开头）是 SSE 标准的心跳形态：不会触发 `onmessage`，
 *   前端 `extractSsePayloads` 已显式跳过 `:` 开头载荷（utils/sse.ts:22）→ **零改动兼容**。
 *   也**不进** `task.events` 数组 → 不影响 `since` 游标语义。
 */
export const SSE_HEARTBEAT_MS = 15000;

/** 设 SSE header + 发 connected 帧 + 订阅 + 心跳 + 断开自动退订；返回发送函数（供扩展用） */
export function sseStream(req: Request, res: Response, opts: SseStreamOptions): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // 反向代理缓冲会攒批导致"帧到得极晚"，显式关闭（nginx 认这个头；无代理时无害）
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`data: ${JSON.stringify({ type: 'connected', ...opts.connected })}\n\n`);
  const unsubscribe = opts.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  // 心跳：纯注释帧保活。★ 必须在 close 时清除，否则连接断了定时器仍在写已关闭的 res
  //   （Node 下写已结束的响应会 emit error，长时间运行会积累泄漏）。
  const heartbeat = setInterval(() => {
    try { res.write(': hb\n\n'); } catch { /* 已断开，等 close 清定时器 */ }
  }, SSE_HEARTBEAT_MS);
  // 心跳定时器不得阻止进程退出
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
