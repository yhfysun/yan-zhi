// @vitest-environment jsdom
/**
 * 「主列表默认收起浏览器页面对话」的查询口径（2026-10-16）。
 *
 * ★ 为什么真跑 store 而不是只断源码文本：这条链的错法是**静默的** ——
 *   参数名拼错、只在某个分支里加、或者过滤留在前端（"看不见"但批量删除仍会扫到），
 *   表现都是"看着正常，但页面对话又混回任务列表了"。钉住"发出去的 URL 到底带没带
 *   excludeSource"才是可验证的判据。
 *
 * 只 mock HTTP 边界（api client / getWithRetry），store 与查询拼装走真实现。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));
vi.mock('./platform', () => ({
  getWithRetry: vi.fn(async () => ({ data: [] })),
  usePlatformStore: () => ({ platforms: [], models: [], resolveModel: () => null }),
}));

import { getWithRetry } from './platform';
import { useChatStore } from './chat';

const retry = getWithRetry as unknown as ReturnType<typeof vi.fn>;
const lastUrl = () => String(retry.mock.calls[retry.mock.calls.length - 1][0]);

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('★ 主列表：默认收起浏览器页面对话', () => {
  it('默认（没设过偏好）就带 excludeSource=browser-page，且 mode / scope 照旧传', async () => {
    const store = useChatStore();
    await store.loadConversations();
    const url = lastUrl();
    expect(url).toContain('excludeSource=browser-page');
    expect(url).toContain('scope=active');
    expect(url).toContain('mode=');
    // ★ 排除必须下推到**服务端**：前端过滤只是"看不见"，批量删除/计数这类扫全量的逻辑仍会扫到
    expect(url.startsWith('/conversations?')).toBe(true);
  });

  it('开关打开后不再传 excludeSource（用户就是要在列表里看到全部会话）', async () => {
    const store = useChatStore();
    store.setShowPageConvs(true);
    await store.loadConversations();
    expect(lastUrl()).not.toContain('excludeSource');
    expect(lastUrl()).toContain('mode=');
  });

  it('偏好跨会话持久化（写 localStorage，与 yz_conv_root_collapsed 同口径）', () => {
    const store = useChatStore();
    expect(store.showPageConvs).toBe(false);   // 默认收起
    store.setShowPageConvs(true);
    expect(localStorage.getItem('yz_show_page_convs')).toBe('1');
    store.setShowPageConvs(false);
    expect(localStorage.getItem('yz_show_page_convs')).toBe('0');
  });

  it('已设过偏好时新建 store 读回它（不是每次都回落默认）', () => {
    localStorage.setItem('yz_show_page_convs', '1');
    setActivePinia(createPinia());
    expect(useChatStore().showPageConvs).toBe(true);
  });
});
