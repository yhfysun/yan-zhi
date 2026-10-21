// @vitest-environment jsdom
// 任务结束后的「本次改了哪些文件」汇总卡 —— 真实挂载守门测试（2026-10-21）
//
// ★ 为什么要有它：用户实报「开发模式修改文件最后不会统计修改了哪些文件、哪些内容，
//   人工可以回退确认，就像 trae 一样」。后端 file_change + /changes/summary 都有测试，
//   但「界面上到底看不看得见、点得动」只有真挂载才看得见（本项目踩过"功能只写在 A 页面，
//   用户从 B 页面进 ⇒ 表现为功能不存在"的亏）。
//
// ★★ 第二轮（同日）：用户嫌旧交互「聊天里展开 diff」不好，要求「聊天框只给路径 + 修改行数，
//   点开走预览/编辑页，还要有全部保存」。故这里钉的是**新契约**：
//     ① 行内直接显示 `+N −M`（不点开也能看出改了多少）；
//     ② 开发模式下点一行 = 交给编辑器（store.pendingDiff），**不再**在聊天里取正文；
//     ③ 非开发模式（没有编辑器可跳）才兜底就地展开 diff —— 防能力倒退；
//     ④ 「全部保存」打的是 /changes/:id/apply（保留），「全部撤销」打 revert。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ITEMS = [
  {
    id: 'fc_1',
    path: 'C:\\proj\\shutter\\apps\\mobile\\lib\\home_page.dart',
    tool: 'file_edit',
    writes: 2,
    firstAt: 1792542000000,
    lastAt: 1792542500000,
    added: 12,
    deleted: 3,
    truncated: false,
  },
  {
    id: 'fc_2',
    path: 'C:\\proj\\shutter\\packages\\core\\lib\\naming_engine.dart',
    tool: 'file_write',
    writes: 1,
    firstAt: 1792542400000,
    lastAt: 1792542400000,
    added: 40,
    deleted: 0,
    truncated: false,
  },
];

vi.mock('../../api/client', () => {
  const get = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/workspace/changes/summary')) {
      return {
        data: {
          items: ITEMS,
          totalFiles: ITEMS.length,
          totalWrites: 3,
          totalAdded: 52,
          totalDeleted: 3,
        },
      };
    }
    if (u.startsWith('/workspace/changes/content')) {
      return { data: { before: 'line a\n', after: 'line a\nline b\n' } };
    }
    return { data: null };
  });
  const post = vi.fn(async () => ({ data: { item: { id: 'fc_1', status: 'applied' } } }));
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
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus, { ElMessageBox } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { useCodeStore } from '../../stores/code';
import { setMode } from '../../stores/mode';
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
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({
    render: () => h(ChatTaskChangeSummary as never, { conversationId: 'conv-1', streaming }),
  });
  app.use(pinia);
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  get.mockClear();
  post.mockClear();
  setMode('office'); // 默认离开开发模式：canOpenEditor=false，走兜底展开
});

describe('ChatTaskChangeSummary · 任务结束后的改动汇总（真实挂载）', () => {
  it('★ 结束后拉汇总并渲染文件数、文件名与行数', async () => {
    const { app, host } = await mountCard(false);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/summary?conversationId=conv-1'));
    const text = host.textContent || '';
    expect(text).toContain('本次修改 2 个文件');
    expect(text).toContain('home_page.dart');
    expect(text).toContain('naming_engine.dart');
    expect(text).toContain('2 次');        // 同一文件写了两次
    expect(text).toContain('+12');          // 文件级增删行数
    expect(text).toContain('−3');
    expect(text).toContain('+52');          // 合计
    app.unmount();
  });

  it('运行中不显示汇总（避免半截清单）', async () => {
    const { app, host } = await mountCard(true);
    expect(host.textContent || '').not.toContain('本次修改');
    app.unmount();
  });

  it('★ 开发模式点一行 → 交给编辑器（pendingDiff），聊天里不取正文', async () => {
    setMode('dev');
    const { app, host } = await mountCard(false);
    const code = useCodeStore();
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/changes/content'));

    const row = host.querySelector('.tcs-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    expect(code.pendingDiff?.path).toBe(ITEMS[0].path);
    expect(code.pendingDiff?.changeId).toBe('fc_1');
    // ★ 关键：开发模式下**不再**在聊天流里拉 diff 正文（用户嫌的就是这个）
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/changes/content'));
    app.unmount();
  });

  it('非开发模式（没有编辑器可跳）→ 兜底就地展开，能力不倒退', async () => {
    setMode('office');
    const { app, host } = await mountCard(false);
    const row = host.querySelector('.tcs-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/content?id=fc_1'));
    app.unmount();
  });

  it('★ 「全部保存」打的是 apply（保留），不是 revert', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const { app, host } = await mountCard(false);
    const buttons = [...host.querySelectorAll('button')];
    const save = buttons.find((b) => (b.textContent || '').includes('全部保存')) as HTMLButtonElement;
    expect(save).toBeTruthy();
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/fc_1/apply'), {});
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/fc_2/apply'), {});
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/revert'), {});
    confirmSpy.mockRestore();
    app.unmount();
  });

  it('★ 「全部撤销」打的是 revert', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const { app, host } = await mountCard(false);
    const buttons = [...host.querySelectorAll('button')];
    const revert = buttons.find((b) => (b.textContent || '').includes('全部撤销')) as HTMLButtonElement;
    expect(revert).toBeTruthy();
    revert.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/workspace/changes/fc_1/revert'), {});
    confirmSpy.mockRestore();
    app.unmount();
  });
});
