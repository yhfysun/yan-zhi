// 短信转发（apps/mobile/src/sms-forward.ts）单测。
//
// 为什么值得测：
//   · 上报是"收到短信 → 发 HTTP"的**唯一**出口，去重逻辑一旦坏掉，同一条短信会被
//     反复 POST（部分 ROM 会重复派发广播），后端 UI 会看到一串重复验证码；
//   · 配置读写（enabled/upstream/token）是"重启 App 后自动恢复监听"的依据，
//     键名漂移会导致「明明开着却不再转发」这类静默失效，且真机验证成本极高。
//
// ★ 手法：mock @capacitor/core（真机才能跑的插件在 node 环境必须打桩）；
//   只 stub 真正的外部依赖，不 stub 被测的纯逻辑。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Array<(p: any) => void> = [];
const startMock = vi.fn(async () => ({ listening: true }));
const stopMock = vi.fn(async () => ({ listening: false }));
const getLastMock = vi.fn(async () => ({ sms: null as any }));
const permMock = vi.fn(async () => ({ sms: 'granted' }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    checkPermissions: () => permMock(),
    requestPermissions: () => permMock(),
    start: () => startMock(),
    stop: () => stopMock(),
    isListening: async () => ({ listening: true }),
    getLast: () => getLastMock(),
    addListener: async (_e: string, cb: (p: any) => void) => {
      listeners.push(cb);
      return { remove: async () => {} };
    },
  }),
}));

const fetchMock = vi.fn(async () => ({ ok: true }));
(globalThis as any).fetch = fetchMock;

// node 环境无 localStorage：本模块大量读写它（配置 + 去重指纹），补一个最小实现。
// 只补真正缺失的宿主能力，不 stub 被测逻辑。
if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

const mod = await import('./sms-forward');

beforeEach(() => {
  localStorage.clear();
  listeners.length = 0;
  fetchMock.mockClear();
  startMock.mockClear();
  stopMock.mockClear();
  getLastMock.mockClear();
  permMock.mockClear();
});

describe('配置读写', () => {
  it('set/get 往返一致，upstream 去尾斜杠', () => {
    mod.setSmsForwardConfig({ enabled: true, upstream: 'http://192.168.1.5:3001/api/verification-codes/', token: 'abc123' });
    const c = mod.getSmsForwardConfig();
    expect(c.enabled).toBe(true);
    expect(c.upstream).toBe('http://192.168.1.5:3001/api/verification-codes');
    expect(c.token).toBe('abc123');
  });

  it('enabled=false 清掉标记', () => {
    mod.setSmsForwardConfig({ enabled: true });
    mod.setSmsForwardConfig({ enabled: false });
    expect(mod.getSmsForwardConfig().enabled).toBe(false);
  });
});

describe('reportSms · 上报与去重', () => {
  it('未配置 upstream → 不上报、返回 false', async () => {
    const ok = await mod.reportSms({ sender: '10690', body: '验证码 123456', code: '123456', receivedAt: Date.now() });
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★ 同一条短信重复上报只发一次 POST（ROM 重复广播）', async () => {
    mod.setSmsForwardConfig({ upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok' });
    const p = { sender: '10690', body: '验证码 123456', code: '123456', receivedAt: 1 };
    expect(await mod.reportSms(p)).toBe(true);
    expect(await mod.reportSms(p)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('不同短信各发一次', async () => {
    mod.setSmsForwardConfig({ upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok' });
    await mod.reportSms({ sender: '10690', body: '验证码 111111', code: '111111', receivedAt: 1 });
    await mod.reportSms({ sender: '10690', body: '验证码 222222', code: '222222', receivedAt: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('上报必带 x-pair-token 头且 body 含 code/body/pairToken', async () => {
    mod.setSmsForwardConfig({ upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok-xyz' });
    await mod.reportSms({ sender: '10690', body: '验证码 333333', code: '333333', receivedAt: 1 });
    const [, init] = fetchMock.mock.calls[0] as any[];
    expect(init.headers['x-pair-token']).toBe('tok-xyz');
    const payload = JSON.parse(init.body);
    expect(payload.code).toBe('333333');
    expect(payload.pairToken).toBe('tok-xyz');
  });

  it('HTTP 非 2xx → false，且**不**记入去重（下次还会重试）', async () => {
    mod.setSmsForwardConfig({ upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok' });
    fetchMock.mockResolvedValueOnce({ ok: false } as any);
    const p = { sender: '1', body: '验证码 444444', code: '444444', receivedAt: 1 };
    expect(await mod.reportSms(p)).toBe(false);
    expect(await mod.reportSms(p)).toBe(true); // 第二次成功
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('startSmsForward · 权限与前置条件', () => {
  it('未填 upstream → 拒绝并给原因', async () => {
    const r = await mod.startSmsForward();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('上报地址');
  });

  it('权限被拒 → 不启动监听', async () => {
    mod.setSmsForwardConfig({ upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok' });
    permMock.mockResolvedValueOnce({ sms: 'denied' } as any).mockResolvedValueOnce({ sms: 'denied' } as any);
    const r = await mod.startSmsForward();
    expect(r.ok).toBe(false);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('授权 + 已配置 → 启动监听并绑定上报回调', async () => {
    mod.setSmsForwardConfig({ enabled: true, upstream: 'http://10.0.0.2:3001/api/verification-codes', token: 'tok' });
    const r = await mod.startSmsForward();
    expect(r.ok).toBe(true);
    expect(startMock).toHaveBeenCalled();
    expect(listeners.length).toBe(1);
    // 触发一次监听 → 应产生上报
    listeners[0]({ sender: '10690', body: '验证码 555555', code: '555555', receivedAt: 1 });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});