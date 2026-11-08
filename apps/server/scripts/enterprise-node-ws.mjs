'use strict';
/**
 * 节点侧 WS 控制通道协议层（Task 5）。
 *
 * ★ 抽成独立 .mjs：enterprise-node-agent.mjs 是带 main() 自启动的脚本，vitest 无法直接
 *   import；协议状态机（注册 / ready 节律 / 事件缓存与断线续传 / 重连 / 降级信号）在这里
 *   与服务端真连真跑（见 enterprise-runtime-ws.test.ts），宿主只做任务执行装配。
 *
 * ★ 续传模型：sendEvent 先入 pending 缓存再发送；收到 events_acked 才清缓存；
 *   重连成功后把 pending 全量重发 —— 服务端按 UNIQUE(task, seq) 幂等去重，重复不重复执行。
 *   HTTP 轮询降级由宿主判断：isActive() === false 时继续原有 claim 循环。
 */
import { WebSocket } from 'ws';

export function createRuntimeWsChannel(options) {
  const opts = options || {};
  const server = String(opts.server || '').replace(/\/+$/, '');
  const token = String(opts.token || '');
  const license = String(opts.license || '');
  const onTask = typeof opts.onTask === 'function' ? opts.onTask : () => {};
  const onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : () => {};
  const readyIntervalMs = Math.max(200, Number(opts.readyIntervalMs) || 2000);
  const reconnectDelayMs = Math.max(50, Number(opts.reconnectDelayMs) || 2000);
  const reconnectAttempts = Math.max(1, Number(opts.reconnectAttempts) || 0); // 0 = 无限重试

  let ws = null;
  let active = false;
  let stopped = false;
  let readyTimer = null;
  let reconnectTimer = null;
  /** taskId -> [{seq,kind,payload}]：已发出但未收到 events_acked 的事件（断线续传的依据）。 */
  const pendingEvents = new Map();

  function wsUrl() {
    const url = new URL('/api/runtime/v1/ws', server);
    url.searchParams.set('token', token);
    return url.toString();
  }

  function rawSend(frame) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(frame)); return true; } catch { /* 连接已断，留待重连 */ }
    }
    return false;
  }

  function flushPending() {
    for (const [taskId, evs] of pendingEvents) {
      if (evs.length) rawSend({ type: 'events', taskId, events: evs });
    }
  }

  function markDelivered(taskId) {
    pendingEvents.delete(String(taskId));
  }

  function sendEvent(taskId, ev) {
    const id = String(taskId);
    const list = pendingEvents.get(id) || [];
    list.push({ seq: Number(ev?.seq) || 0, kind: String(ev?.kind || 'message'), payload: ev?.payload ?? {} });
    pendingEvents.set(id, list);
    rawSend({ type: 'events', taskId: id, events: [list[list.length - 1]] });
  }

  function clearTimers() {
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function connect(attempt) {
    return new Promise((resolve) => {
      if (stopped) { resolve(false); return; }
      let settled = false;
      let sock;
      try {
        sock = new WebSocket(wsUrl(), license ? { headers: { 'x-license': license } } : undefined);
      } catch {
        resolve(false);
        return;
      }
      const giveUp = () => {
        if (settled) return;
        settled = true;
        active = false;
        try { sock.close(); } catch { /* ignore */ }
        if (!stopped && (reconnectAttempts === 0 || attempt < reconnectAttempts - 1)) {
          reconnectTimer = setTimeout(() => { connect(attempt + 1).then((v) => resolve(v)); }, reconnectDelayMs);
        } else {
          resolve(false);
        }
      };
      sock.on('open', () => {
        if (stopped) { try { sock.close(); } catch { /* ignore */ } resolve(false); return; }
        ws = sock;
        active = true;
        settled = true;
        if (!readyTimer) {
          readyTimer = setInterval(() => {
            // ready 兼作心跳与任务认领触发；空闲时服务端不回帧。
            rawSend({ type: 'ready' });
          }, readyIntervalMs);
        }
        rawSend({ type: 'ready' });
        flushPending();
        resolve(true);
      });
      sock.on('message', (raw) => {
        let frame;
        try { frame = JSON.parse(String(raw)); } catch { return; }
        if (frame?.type === 'events_acked') markDelivered(frame.taskId);
        if (frame?.type === 'task' && frame.task) { onTask(frame.task); return; }
        if (frame?.type !== 'events_acked') onFrame(frame);
      });
      sock.on('close', () => {
        // ★ 只有"当前活跃连接"断开才安排重连；被新连接顶掉的旧连接 close 不触发
        //   重连，否则新旧交替会形成重连风暴（每个新连接都顶掉上一个）。
        const wasCurrent = ws === sock;
        if (wasCurrent) {
          ws = null;
          active = false;
          if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
        }
        if (stopped) return;
        if (!settled) { giveUp(); return; }
        if (wasCurrent && !reconnectTimer) {
          reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(0).then(() => {}); }, reconnectDelayMs);
        }
      });
      sock.on('error', () => { /* close 事件会跟进 */ });
    });
  }

  async function start() {
    stopped = false;
    const ok = await connect(0);
    return ok && active;
  }

  function stop() {
    stopped = true;
    active = false;
    clearTimers();
    if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  }

  /** 测试钩子：模拟运行期断线（触发重连 + 续传路径）。 */
  function __simulateDrop() {
    if (ws) { try { ws.close(); } catch { /* ignore */ } }
  }

  return { start, stop, isActive: () => active, sendEvent, markDelivered, __simulateDrop };
}
