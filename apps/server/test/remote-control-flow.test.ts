/**
 * 远控配对/授予**链路**层面的回归测试（真插件模块 + 假 socket）。
 *
 * 为什么需要这一层：纯函数单测（remote-control.test.ts）覆盖了 evaluatePair 等判定，
 * 但 2026-10-30 实报「被控端点了允许，控制端一直停在等待确认；再连报已有会话独占」
 * 恰恰发生在**判定之外的投递环节** —— session.granted 只发一次，控制端那条 socket
 * 当时没建好/已丢包，就永久丢失；而授予成功的会话没有任何回收路径，于是独占锁
 * 被一个没人用的会话占住 30 分钟。这里把 pair → 确认 → 授予 → 重连 整条链跑一遍，
 * 钉住三条不可回退的行为：
 *   1. 正常链路：控制端必须收到 session.granted（带 token）；
 *   2. 授予早于控制端连通道：控制端事后凭 confirmId 连上来必须补发 granted（自愈）；
 *   3. 授予后控制端始终没连上：会话必须自动回收，重连不能再报「独占」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@yan-zhi/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yan-zhi/core')>();
  return {
    ...actual,
    getPluginManager: () => ({
      get: () => ({ state: 'enabled' }),
      disable: async () => undefined,
    }),
  };
});

import { remoteControlModule } from '../src/plugins/remote-control.js';

type Handler = (req: unknown, res: unknown) => unknown;
type Route = { method: string; pattern: string; handler: Handler };

/** 最小可用的假 WebSocket：记录发送内容、可手动触发 message/close */
class FakeWs {
  sent: Record<string, unknown>[] = [];
  readyState = 1;
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  on(ev: string, cb: (...a: unknown[]) => void): void {
    (this.handlers[ev] ||= []).push(cb);
  }
  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
  emit(ev: string, ...args: unknown[]): void {
    for (const cb of this.handlers[ev] || []) cb(...args);
  }
  /** 模拟被控端渲染层发消息 */
  msg(data: Record<string, unknown>): void {
    this.emit('message', Buffer.from(JSON.stringify(data)), false);
  }
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
  all(type: string): Record<string, unknown>[] {
    return this.sent.filter((m) => m.type === type);
  }
}

function makeStorage(): { get: <T>(k: string) => Promise<T | undefined>; set: (k: string, v: unknown) => Promise<void> } {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => store.get(k) as T | undefined,
    set: async (k: string, v: unknown) => {
      store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    },
  };
}

let routes: Route[];
let wsHandler: ((ws: unknown, req: { url: string; headers?: Record<string, string> }) => void) | null;

async function activate(): Promise<void> {
  routes = [];
  wsHandler = null;
  const ctx = {
    id: 'remote-control',
    config: {},
    log: () => undefined,
    storage: makeStorage(),
    registerTool: () => ({ dispose: () => undefined }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (p: string, h: Handler) => routes.push({ method: 'GET', pattern: p, handler: h }),
        post: (p: string, h: Handler) => routes.push({ method: 'POST', pattern: p, handler: h }),
        put: (p: string, h: Handler) => routes.push({ method: 'PUT', pattern: p, handler: h }),
        delete: (p: string, h: Handler) => routes.push({ method: 'DELETE', pattern: p, handler: h }),
      };
      setup(app);
      return { dispose: () => undefined };
    },
    registerWebSocket: (path: string, handler: (ws: unknown, req: unknown) => void) => {
      expect(path).toBe('/session/ws');
      wsHandler = handler as typeof wsHandler;
      return { dispose: () => undefined };
    },
    emit: () => undefined,
    on: () => ({ dispose: () => undefined }),
  };
  await remoteControlModule.activate(ctx as never);
}

/** 调路由并等它把响应体吐出来（/pair 等处理器本身是异步的） */
async function call(
  method: string,
  pattern: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: unknown }> {
  const route = routes.find((r) => r.method === method && r.pattern === pattern);
  if (!route) throw new Error(`路由未注册: ${method} ${pattern}`);
  const req = {
    body,
    headers,
    query: {},
    socket: { remoteAddress: '192.168.1.20' },
    readableEnded: true,
    on: () => undefined,
  };
  return await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c: number) {
        res.statusCode = c;
        return res;
      },
      json(d: unknown) {
        resolve({ statusCode: res.statusCode, body: d });
        return res;
      },
    };
    route.handler(req, res);
  });
}

function connectWs(url: string): FakeWs {
  if (!wsHandler) throw new Error('WS 路由未注册');
  const ws = new FakeWs();
  wsHandler(ws, { url });
  return ws;
}

async function hostKey(): Promise<string> {
  const res = await call('GET', '/hostkey');
  return String((res.body as { data: { key: string } }).data.key);
}

/** 被控端渲染层连上 host 通道（就绪态：能提供 WebRTC 采集） */
async function connectHost(): Promise<{ ws: FakeWs; key: string }> {
  const key = await hostKey();
  const ws = connectWs(`/session/ws?role=host&key=${encodeURIComponent(key)}`);
  ws.msg({ type: 'rtc.ready' });
  return { ws, key };
}

const CODE = 'abcdef';

async function pair(deviceId = 'dev-1', deviceName = '桌面 Windows') {
  await call('POST', '/code/custom', { code: CODE });
  return await call('POST', '/pair', { code: CODE, deviceId, deviceName });
}

const dataOf = (res: { body: unknown }) => (res.body as { data?: Record<string, unknown>; error?: string });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] });
  await activate();
});
afterEach(async () => {
  await remoteControlModule.deactivate?.();
  vi.useRealTimers();
});

describe('远控配对投递链路', () => {
  it('正常链路：被控端允许后控制端收到 session.granted（带会话令牌）', async () => {
    const host = await connectHost();
    const paired = await pair();
    const pending = dataOf(paired).data!;
    expect(pending.status).toBe('pending');

    const controller = connectWs(`/session/ws?confirmId=${String(pending.confirmId)}`);
    expect(controller.last('pair.pending')).toBeTruthy();
    expect(host.ws.last('session.pending')).toBeTruthy();

    host.ws.msg({ type: 'decision', confirmId: pending.confirmId, action: 'allow' });
    await vi.advanceTimersByTimeAsync(0);

    const granted = controller.last('session.granted');
    expect(granted).toBeTruthy();
    expect(String(granted!.token || '')).toHaveLength(64);
    expect(granted!.mode).toBe('webrtc');
    // 被控端同时收到采集启动指令
    expect(host.ws.last('rtc.start')).toBeTruthy();
  });

  it('★授予早于控制端建通道：事后凭 confirmId 连上来必须补发 granted（自愈）', async () => {
    const host = await connectHost();
    const pending = dataOf(await pair()).data!;

    // 被控端先点了允许（控制端的 WS 还没建立 —— 真机实测就死在这里）
    host.ws.msg({ type: 'decision', confirmId: pending.confirmId, action: 'allow' });
    await vi.advanceTimersByTimeAsync(0);

    // 控制端随后才连通道：不能用「会话不存在」直接打发
    const controller = connectWs(`/session/ws?confirmId=${String(pending.confirmId)}`);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.last('session.ended')).toBeFalsy();
    const granted = controller.last('session.granted');
    expect(granted).toBeTruthy();
    expect(String(granted!.token || '')).toHaveLength(64);
  });

  it('★授予后控制端始终没连上：会话自动回收，重连不再报「独占」', async () => {
    const host = await connectHost();
    const pending = dataOf(await pair()).data!;
    host.ws.msg({ type: 'decision', confirmId: pending.confirmId, action: 'allow' });
    await vi.advanceTimersByTimeAsync(0);

    // 独占锁先挡住同设备的再次配对（防止两个控制端抢同一台机）
    const blocked = dataOf(await pair()).error || '';
    expect(blocked).toContain('独占');

    // 但没人接的会话不能长期占锁：宽限期一过必须释放
    await vi.advanceTimersByTimeAsync(60_000);
    const retry = dataOf(await pair());
    expect(retry.error || '').toBe('');
    expect(retry.data!.status).toBe('pending');
  });
});
