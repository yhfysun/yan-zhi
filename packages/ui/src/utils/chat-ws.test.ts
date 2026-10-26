/**
 * chat WS 心跳 / 半开连接自愈（2026-10-26 用户实报「任务发出去后没了」）
 *
 * 现场：
 *   后端重启后点发送，界面静默 30 秒才报「WS 请求超时: create_task」，
 *   用户消息既不落库也不显示，连「调用失败」提示都写不进会话（addMessage 同样走 WS）。
 *
 * 根因：TCP 半开连接 —— 对端进程已死，浏览器端 `readyState` 仍是 OPEN，
 *   `send()` 不报错、消息石沉大海，`ensureSocket()` 只看 readyState 就复用死连接。
 *
 * ★ 这两个行为都只能靠真跑模块 + 假定时器验证（纯 grep 源码抓不到"定时器挂了没生效"）：
 *   ① 无入站超过 35s → 主动 close（后续 onclose 触发重连）；
 *   ② 请求超时 → 主动 close，避免用户重试时又对着同一条死连接等满 30s。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../api/client', () => ({ API_BASE: 'http://127.0.0.1:3001/api' }));

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;

  constructor(public url: string) { FakeWebSocket.instances.push(this); }

  addEventListener(): void { /* 测试里不走 open 排队分支 */ }
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closeCalls++; this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }

  /** 模拟服务端接受连接 */
  fireOpen(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  /** 模拟收到一帧 */
  fireMessage(obj: unknown): void { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

describe('chat WS 心跳与半开自愈', () => {
  let mod: typeof import('./chat-ws');

  beforeEach(async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    vi.resetModules();
    mod = await import('./chat-ws');
  });

  afterEach(() => {
    mod.closeChatWs();
    vi.useRealTimers();
  });

  it('★★★ 无入站超过 35s → 主动关闭（半开连接必须能被发现，否则后续发送静默等满 30s）', () => {
    // Arrange：用 onTaskEvent 建连（不产生 pending 请求，排除「请求超时」这条路径的干扰）
    mod.onTaskEvent(() => {});
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    // Act：心跳每 15s 一次（判定点在 15/30/45s）；持续无入站，第 45s 那次检查必然超阈值
    vi.advanceTimersByTime(50_000);

    // Assert
    expect(socket.closeCalls, '无入站超时后必须 close —— 交给 onclose 重连').toBeGreaterThan(0);
  });

  it('★★★ 心跳期间收到 pong → 连接不被判定为死（正常连接不能被自己切断）', () => {
    // Arrange
    mod.onTaskEvent(() => {});
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    // Act：每 10s 回一帧 pong，持续 60s（远超 35s 判死阈值）
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(10_000);
      socket.fireMessage({ type: 'pong' });
    }

    // Assert
    expect(socket.closeCalls, '有入站就不能判死').toBe(0);
    expect(socket.sent.some((s) => s.includes('"ping"')), '心跳本身要真的发出去').toBe(true);
  });

  it('★★★ 请求超时后主动关闭连接（下次发送不能又对着死连接等 30s）', async () => {
    // Arrange
    const req = mod.requestChatWs('create_task', { a: 1 });
    const socket = FakeWebSocket.instances[0];
    socket.fireOpen();

    // Act
    vi.advanceTimersByTime(30_000);

    // Assert
    await expect(req).rejects.toThrow(/WS 请求超时/);
    expect(socket.closeCalls, '超时说明对端可能已半开：必须 close 触发重连').toBeGreaterThan(0);
  });
});

/**
 * 断连自动重发的前置条件（2026-10-26）：必须能等到「新连接真的 OPEN」再重发。
 *
 * ★ 为什么不能用「立刻重发」兜底：重连是**指数退避**（1s→15s），紧跟着重发几乎必然
 *   又落在还没连上的窗口里，等于把同一次失败重演一遍。
 * ★ 为什么等待方**不许自己 connect**：那会和退避定时器各开一条 socket 互相顶替
 *   （旧 socket 关闭时无条件 `ws = null`，会把新连接一起弄丢）。
 */
describe('chat WS 等待连接恢复（自动重发用）', () => {
  let mod: typeof import('./chat-ws');

  beforeEach(async () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    vi.resetModules();
    mod = await import('./chat-ws');
  });

  afterEach(() => {
    mod.closeChatWs();
    vi.useRealTimers();
  });

  it('连接已开 → 立即返回 true', async () => {
    mod.onTaskEvent(() => {});
    FakeWebSocket.instances[0].fireOpen();
    await expect(mod.waitForChatWsOpen(1000)).resolves.toBe(true);
  });

  it('断开后等到退避重连成功才 resolve(true)，且不自己另开连接', async () => {
    mod.onTaskEvent(() => {});
    const first = FakeWebSocket.instances[0];
    first.fireOpen();
    first.close(); // 断开 → 1s 后重连

    const wait = mod.waitForChatWsOpen(15_000);
    await vi.advanceTimersByTimeAsync(1000); // 退避到点：新 socket 建立（仍 CONNECTING）
    expect(FakeWebSocket.instances.length, '连接只由退避重连拉起，等待方不抢跑').toBe(2);

    FakeWebSocket.instances[1].fireOpen();
    await expect(wait).resolves.toBe(true);
  });

  it('超时仍未连上 → false（调用方据此回落到「让用户手动重试」）', async () => {
    mod.onTaskEvent(() => {});
    const first = FakeWebSocket.instances[0];
    first.fireOpen();
    first.close();

    const wait = mod.waitForChatWsOpen(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(wait).resolves.toBe(false);
  });
});
