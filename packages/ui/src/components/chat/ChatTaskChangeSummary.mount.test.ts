// @vitest-environment jsdom
// 任务结束后的「本次改了哪些文件」汇总卡 —— 真实挂载守门测试（2026-10-21）
//
// ★ 为什么要有它：用户实报「开发模式修改文件最后不会统计修改了哪些文件、哪些内容，
//   人工可以回退确认，就像 trae 一样」。后端 file_change + /changes/summary 都有测试，
//   但「界面上到底看不看得见、点得动」只有真挂载才看得见（本项目踩过"功能只写在 A 页面，
//   用户从 B 页面进 ⇒ 表现为功能不存在"的亏）。
//   故这里钉三件事：
//     ① 挂载后按会话拉汇总，并把文件数 / 文件名渲染出来；
//     ② 展开某一行才去取 before/after（大文件不进汇总响应）；
//     ③ 「撤销」打的是 /changes/:id/revert（不是 apply）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ITEMS = [
  {
    id: 'fc_1',
    path: 'C:\\proj\\shutter\\apps\\mobile\\lib\\home_page.dart',
    tool: 'file_edit',
    writes: 2,
    firstAt: 1792542000000,
    lastAt: 1792542500000,
  },
  {
    id: 'fc_2',
    path: 'C:\\proj\\shutter\\packages\\core\\lib\\naming_engine.dart',
    tool: 'file_write',
    writes: 1,
    firstAt: 1792542400000,
    lastAt: 1792542400000,
  },
];

vi.mock('../../api/client', () => {
  const get = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/workspace/changes/summary')) {
      return { data: { items: ITEMS, totalFiles: ITEMS.length, totalWrites: 3 } };
    }
    if (u.startsWith('/workspace/changes/content')) {
      return { data: { before: 'line a\n', after: 'line a\nline b\n' } };
    }
    return { data: null };
  });
  const post = vi.fn(async () => ({ data: { item: { id: 'fc_1', status: 'reverted' } } }));
  return {
    isElectron: false, isCapacitor: false, isLocalClient: false,
    LOCAL_API_PORT: 0, LOCAL_API_BASE: 'http://127.0.0.1:0/api', API_BASE: 'http://127.0.0.1:0/api',
    wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
    getMobileApiBase: () => '', setMobileApiBase: () => '', getLicenseCode: () => null,
    setToken: () => undefined, buildRequestHeaders: () => ({}),
    apiFetch: vi.fn(async () => ({ data: null })),
    api: { get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn(async () => ({ data: null })) },
  };
});

import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { api } from '../../api/client';
import ChatTaskChangeSummary from './ChatTaskChangeSummary.vue';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountCard(streaming = false): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(ChatTaskChangeSummary as never, { conversationId: 'conv-1', streaming }),
  });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => { document.body.innerHTML = ''; get.mockClear(); post.mockClear(); });

describe('ChatTaskChangeSummary · 任务结束后的改动汇总（真实挂载）', () => {
  it('★ 结束后拉汇总并渲染文件数与文件名', async () => {
    const { app, host } = await mountCard(false);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/summary?conversationId=conv-1'));
    const text = host.textContent || '';
    expect(text).toContain('本次修改 2 个文件');
    expect(text).toContain('home_page.dart');
    expect(text).toContain('naming_engine.dart');
    expect(text).toContain('2 次'); // 同一文件写了两次
    app.unmount();
  });

  it('运行中不显示汇总（避免半截清单）', async () => {
    const { app, host } = await mountCard(true);
    expect(host.textContent || '').not.toContain('本次修改');
    app.unmount();
  });

  it('★ 展开才取 before/after（汇总接口不带正文）', async () => {
    const { app, host } = await mountCard(false);
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/changes/content'));
    const row = host.querySelector('.tcs-row-head') as HTMLElement;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/content?id=fc_1'));
    app.unmount();
  });

  it('★ 撤销打的是 revert（不是 apply）', async () => {
    const { app, host } = await mountCard(false);
    const buttons = [...host.querySelectorAll('button')];
    // 注意：页头还有「全部撤销」（会弹确认框），这里必须精确匹配行内的「撤销」
    const revert = buttons.find((b) => (b.textContent || '').trim() === '撤销') as HTMLButtonElement;
    expect(revert).toBeTruthy();
    revert.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/fc_1/revert'), {});
    app.unmount();
  });
});
