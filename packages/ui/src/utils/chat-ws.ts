// 聊天主链路 WebSocket 客户端（2026-10-20，SSE→WS 迁移）。
//
// ★ 单一长连接 + 请求/应答关联 + 事件分发。取代聊天主链路的「每任务一条 SSE 流」：
//   - create_task / subscribe_task / inject / tool_result / abort / pause / resume 走 `request`；
//   - 任务/会话事件经 `onTaskEvent` / `onConvEvent` 回调（与 SSE 的 event 结构一致，复用同一套事件 switch）。
//
// ★ 断线重连：指数退避（1s→15s）。重连后**必须重新订阅**（subscribe_task 的 since 由调用方按
//   taskEventCounts 传入），本模块不记忆订阅 —— 订阅生命周期由 store 管，这里只管传输。

import { API_BASE } from '../api/client';

type TaskEventCb = (taskId: string, event: any) => void;
type ConvEventCb = (conversationId: string, event: any) => void;

let ws: WebSocket | null = null;
let msgSeq = 0;
let manualClose = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

// ★★★ 心跳与半开连接探测（2026-10-26 用户实报「任务发出去后没了」）：
//   症状：后端重启后点发送，界面静默 30 秒才报「WS 请求超时: create_task」，
//     用户消息既不落库也不显示，连「调用失败」提示都写不进会话（addMessage 同样走 WS）。
//   根因：TCP **半开连接** —— 后端进程已死/已重启，而浏览器端 `socket.readyState`
//     仍是 OPEN。`send()` 不报错、消息石沉大海，`ensureSocket()` 只看 readyState
//     就复用了这条死连接。WebSocket 协议层没有自动保活，不主动探活就无从得知。
//   ⇒ 定时 ping + 无入站超时判定：把「连接还活着」从假设变成可观测量。
//     超时即 close，交给既有的 onclose → 指数退避重连。
const HEARTBEAT_INTERVAL_MS = 15_000;
/** 超过这个时长没有任何入站消息（含 pong）即判定连接已死 */
const HEARTBEAT_DEAD_MS = 35_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastInboundAt = 0;

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const taskEventCbs = new Set<TaskEventCb>();
const convEventCbs = new Set<ConvEventCb>();
const closeCbs = new Set<() => void>();

/** ws:// 地址：API_BASE 形如 http(s)://host[:port]/api，去掉 /api 换 ws 协议再挂 /ws/chat */
function wsUrl(): string {
  const base = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
  const origin = base.replace(/\/api\/?$/, '');
  return origin.replace(/^http/, 'ws') + '/ws/chat';
}

export function chatWsUrl(): string {
  return wsUrl();
}

function connect(): void {
  manualClose = false;
  const sock = new WebSocket(wsUrl());
  ws = sock;

  sock.onopen = () => {
    reconnectDelay = 1000;
    lastInboundAt = Date.now();
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      // 连接已被替换（重连换了新 socket）→ 旧计时器自行退出，不误判新连接
      if (sock !== ws || sock.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastInboundAt > HEARTBEAT_DEAD_MS) {
        // 半开：对端早就不在了。close 触发 onclose → 按退避重连，下一次发送走新连接
        try { sock.close(); } catch { /* onclose 兜底 */ }
        return;
      }
      try { sock.send(JSON.stringify({ type: 'ping' })); } catch { /* onclose 兜底 */ }
    }, HEARTBEAT_INTERVAL_MS);
  };
  sock.onerror = () => { /* onclose 兜底 */ };

  sock.onmessage = (ev) => {
    lastInboundAt = Date.now();
    let msg: any;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg && typeof msg.id === 'string' && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.error || 'WS 请求失败'));
      else p.resolve(msg);
      return;
    }
    if (msg?.type === 'task_event' && msg.event) {
      for (const cb of [...taskEventCbs]) { try { cb(msg.taskId, msg.event); } catch { /* 单个回调异常不影响其余 */ } }
      return;
    }
    if (msg?.type === 'conv_event' && msg.event) {
      for (const cb of [...convEventCbs]) { try { cb(msg.conversationId, msg.event); } catch { /* 同上 */ } }
    }
  };

  sock.onclose = () => {
    ws = null;
    stopHeartbeat();
    for (const [, p] of pending) p.reject(new Error('WS 已断开'));
    pending.clear();
    // ★ 先通知断开、再排重连：订阅方（store）在回调里决定重订节奏，
    //   与本模块的 socket 重连退避互不干扰（服务端订阅已随连接释放，重订是必须的）。
    for (const cb of [...closeCbs]) { try { cb(); } catch { /* 单个回调异常不影响其余 */ } }
    if (!manualClose) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    }
  };
}

function ensureSocket(): WebSocket {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return ws;
  connect();
  return ws!;
}

/** 单向发送（不等待应答） */
export function sendChatWs(type: string, payload: Record<string, unknown> = {}): void {
  const sock = ensureSocket();
  const fire = () => { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type, ...payload })); };
  if (sock.readyState === WebSocket.OPEN) fire();
  else sock.addEventListener('open', fire, { once: true });
}

/** 请求/应答：返回 Promise，resolve 服务端 `ok` 帧（含 data），reject `error` 帧 */
export function requestChatWs<T = any>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sock = ensureSocket();
    const id = `c${++msgSeq}`;
    pending.set(id, { resolve, reject });
    const fire = () => { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ id, type, ...payload })); };
    if (sock.readyState === WebSocket.OPEN) fire();
    else sock.addEventListener('open', fire, { once: true });
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`WS 请求超时: ${type}`));
      // ★ 超时即视为连接可能已半开（心跳最多 35s 才发现，用户可能正好落在这个窗口里）：
      //   主动关闭触发重连，避免用户重试时又对着同一条死连接等满 30 秒。
      if (sock === ws && sock.readyState === WebSocket.OPEN) {
        try { sock.close(); } catch { /* onclose 兜底 */ }
      }
    }, 30000);
  });
}

/** 订阅任务事件，返回退订函数（重连后需调用方重新订阅） */
export function onTaskEvent(cb: TaskEventCb): () => void {
  taskEventCbs.add(cb);
  ensureSocket();
  return () => { taskEventCbs.delete(cb); };
}

/** 订阅会话事件，返回退订函数 */
export function onConvEvent(cb: ConvEventCb): () => void {
  convEventCbs.add(cb);
  ensureSocket();
  return () => { convEventCbs.delete(cb); };
}

export function closeChatWs(): void {
  manualClose = true;
  stopHeartbeat();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  ws?.close();
  ws = null;
}

export function isChatWsOpen(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

/**
 * 订阅「连接断开」通知，返回退订函数。
 *
 * ★ 断开意味着**服务端所有订阅已随连接释放**（server 端 close 时统一清 subs），
 *   需要续传的调用方（chat store 的任务/会话订阅）在此挂回调做重订。
 *   socket 本身的重连仍由本模块负责（指数退避），两层互不替代：
 *   这里只负责「断了这个事实」，重订由业务层按 since 游标发起。
 */
export function onChatWsClose(cb: () => void): () => void {
  closeCbs.add(cb);
  return () => { closeCbs.delete(cb); };
}
