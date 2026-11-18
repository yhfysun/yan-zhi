/**
 * apiFetch 的「后端不可达退避重试」单测。
 *
 * 为什么值得测（2026-11-16）：
 *   移动端内嵌 Node 后端异步拉起，冷启动/重启窗口内所有请求都拿到 status:0（连接被拒）。
 *   学习各科目页面全是裸 api.get（无重试）⇒ 一进课程页就弹「学习路线加载失败」
 *   —— 这就是用户实报的「课程页面读取异常」。
 *   这里把三条契约钉死：
 *     ① GET 遇到 status:0 会重试（后端稍晚起来就自愈）；
 *     ② POST/PATCH 等写操作**绝不重试**（重试会重复写入）；
 *     ③ 4xx/5xx（后端明确答复）不重试（重试无意义，白白拖时间）。
 *     ④ 插件 GET 的启动期 404 单独短退避，避免页面先挂载时误弹“缺功能”。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './client';

const originalFetch = globalThis.fetch;

function mockFetchSequence(handlers: Array<() => Promise<any>>) {
  let i = 0;
  const spy = vi.fn(async () => {
    const h = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    return h();
  });
  (globalThis as any).fetch = spy;
  return spy;
}

function ok(data: any) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  });
}

function unreachable() {
  return async () => {
    throw new TypeError('Failed to fetch');
  };
}

function httpError(status: number) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({ error: `HTTP ${status}` }),
  });
}

describe('apiFetch · 后端不可达时的退避重试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).fetch = originalFetch;
  });

  it('★ GET 遇到连接被拒会重试：后端晚起就自愈（不再直接抛「加载失败」）', async () => {
    const spy = mockFetchSequence([unreachable(), unreachable(), ok({ tracks: [] })]);
    const p = apiFetch('/learning/zhouyi/paths');
    // 推进退避计时器
    await vi.runAllTimersAsync();
    const r = await p;
    expect(spy.mock.calls.length).toBe(3);
    expect('data' in r).toBe(true);
  });

  it('★ POST 遇到连接被拒**不重试**（重试会重复写入）', async () => {
    const spy = mockFetchSequence([unreachable()]);
    const p = apiFetch('/conversations', { method: 'POST', body: '{}' });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(spy.mock.calls.length).toBe(1);
    expect((r as any).status).toBe(0);
    expect((r as any).error).toBe('NETWORK_UNREACHABLE');
  });

  it('★ 4xx（后端明确拒绝）不重试', async () => {
    const spy = mockFetchSequence([httpError(404)]);
    const p = apiFetch('/learning/zhouyi/paths');
    await vi.runAllTimersAsync();
    const r = await p;
    expect(spy.mock.calls.length).toBe(1);
    expect((r as any).status).toBe(404);
    expect((r as any).error).toContain('当前后端缺少这个功能');
    expect((r as any).error).not.toMatch(/^HTTP\s*404/);
  });

  it('★ 插件 GET 启动期 404 会短退避，路由挂载后自愈', async () => {
    const spy = mockFetchSequence([httpError(404), httpError(404), ok({ ready: true })]);
    const p = apiFetch('/plugin/sec-lab/config');
    await vi.runAllTimersAsync();
    const r = await p;
    expect(spy.mock.calls.length).toBe(3);
    expect('data' in r).toBe(true);
  });

  it('★ 插件 POST 的 404 不重试（写操作不做语义猜测）', async () => {
    const spy = mockFetchSequence([httpError(404)]);
    const p = apiFetch('/plugin/sec-lab/run', { method: 'POST', body: '{}' });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(spy.mock.calls.length).toBe(1);
    expect((r as any).status).toBe(404);
  });

  it('★ GET 重试预算用尽后如实返回 status:0（不无限重试）', async () => {
    const spy = mockFetchSequence([unreachable()]);
    const p = apiFetch('/learning/zhouyi/paths');
    await vi.runAllTimersAsync();
    const r = await p;
    // 首次 + 3 次退避重试 = 4 次
    expect(spy.mock.calls.length).toBe(4);
    expect((r as any).error).toBe('NETWORK_UNREACHABLE');
  });
});
