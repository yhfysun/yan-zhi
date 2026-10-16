// @vitest-environment jsdom
// 「非 Git 目录」时源码管理面板的**真实挂载**守门测试（2026-10-16）。
//
// ★★★ 为什么必须有它（用户实报 + 截图）：打开的目录没有 `.git`，面板却显示
//   `master` / `变更 1` / `已暂存 1`（文件是上一个仓库的）。根因是 `gitStore.status` 是全局单槽，
//   而"有没有清干净"这件事只有**真挂载**看得见：
//     · 读源码断言查不出"模板里还有个 v-else 分支照样渲染列表"；
//     · store 单测（gitNonRepoState.test.ts）能证明数据被清了，证明不了界面不再显示它。
//   本文件把两者接起来：真挂载 + 真跑 init()，钉住四件事：
//     ① 顶栏 / 工具条 / 筛选框整块收起（不再有分支名、不再有"筛选变更文件"）
//     ② 四个分区（变更 / 储存库 / 图形 / 智能体审查）一个都不渲染
//     ③ 出现空态文案与「初始化 Git 仓库」按钮
//     ④ ★ 即使全局单槽里还残留着**别的仓库**的 status，界面上也看不到它的文件
//        （这正是用户截图里的那一屏）
//   挂载方式跟随仓库既有做法（views/plugin/sftpPanelPanes.mount.test.ts：createApp + ElementPlus，
//   本包没有 @vue/test-utils）。
import { describe, it, expect, vi } from 'vitest';

const NON_REPO = 'C:\\Users\\probe\\小说推文\\第一本';

// 面板用 useRoute 取当前路由（只读 path/query），这里给一个最小替身
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/code', query: {}, params: {}, name: 'code' }),
}));

// 后端打桩：只按 URL 回答这一条链（capability → cache → discoverAll → isRepo 探针）
vi.mock('../../api/client', () => {
  const get = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/git/capability')) return { data: { supported: true } };
    if (u.startsWith('/git/cache')) return { data: null };
    if (u.startsWith('/git/discoverAll')) return { data: [] };
    if (u.startsWith('/git/isRepo')) return { data: { isRepo: false, root: null } };
    return { data: {} };
  });
  const post = vi.fn(async () => ({ data: { ok: true } }));
  return {
    // 面板的依赖链里还有 DiffBody/childWindow 这类模块会读这些导出，
    // 漏一个就是 "No export is defined on the mock" 的整包失败（实测踩过 isElectron）
    isElectron: false,
    isCapacitor: false,
    isLocalClient: false,
    LOCAL_API_PORT: 0,
    LOCAL_API_BASE: 'http://127.0.0.1:0/api',
    API_BASE: 'http://127.0.0.1:0/api',
    wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
    getMobileApiBase: () => '',
    setMobileApiBase: () => '',
    getLicenseCode: () => null,
    setToken: () => undefined,
    buildRequestHeaders: () => ({}),
    apiFetch: vi.fn(async () => ({ data: null })),
    api: { get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn(async () => ({ data: null })) },
  };
});

import { createApp, h, nextTick, ref, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { useGitStore } from '../../stores/git';
import ChatGitPanel from './ChatGitPanel.vue';

const post = api.post as unknown as ReturnType<typeof vi.fn>;

type PanelApi = { init: (force?: boolean) => Promise<void> };

/** 真挂载面板并跑一遍 init()（面板自己不 init，由父级调用，见 defineExpose） */
async function mountAndInit(): Promise<{ host: HTMLElement; app: App }> {
  setActivePinia(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panelRef = ref<PanelApi | null>(null);
  const app = createApp({
    render: () => h(ChatGitPanel as never, { repo: NON_REPO, ref: panelRef }),
  });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  for (let i = 0; i < 4; i++) await nextTick();
  await panelRef.value!.init();
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
  return { host, app };
}

const sectionTitles = (host: HTMLElement) =>
  [...host.querySelectorAll('.git-section-title')].map((e) => (e.textContent || '').trim());

describe('ChatGitPanel · 非 Git 目录（真实挂载）', () => {
  it('★ 顶栏 / 工具条 / 筛选框整块收起（不再出现分支名与"筛选变更文件"）', async () => {
    const { host, app } = await mountAndInit();
    expect(host.querySelector('.git-top')).toBeNull();
    expect(host.querySelector('.git-toolbar')).toBeNull();
    expect(host.querySelector('.git-filter')).toBeNull();
    expect(host.textContent).not.toContain('筛选变更文件');
    app.unmount();
  });

  it('★ 四个分区一个都不渲染（截图里那四个「变更 / 储存库 / 图形 / 智能体审查」必须消失）', async () => {
    const { host, app } = await mountAndInit();
    expect(sectionTitles(host)).toEqual([]);
    expect(host.querySelectorAll('.git-section').length).toBe(0);
    app.unmount();
  });

  it('★ 给出空态说明 + 目录路径 + 「初始化 Git 仓库」按钮', async () => {
    const { host, app } = await mountAndInit();
    expect(host.textContent).toContain('该目录还不是 Git 仓库');
    expect(host.textContent).toContain(NON_REPO);
    const btn = host.querySelector('.git-nonrepo-btn');
    expect(btn, host.innerHTML.slice(0, 1500)).not.toBeNull();
    expect(btn!.textContent).toContain('初始化 Git 仓库');
    app.unmount();
  });

  it('★★ 回归（用户截图那一屏）：全局单槽里残留着**别的仓库**的 status，界面上也看不到它的文件', async () => {
    const { host, app } = await mountAndInit();
    // ① 先装作"刚看过另一个仓库"：直接往全局单槽里塞它的状态
    const store = useGitStore();
    store.status = {
      current: 'master',
      files: [{ path: '数据快照分析助手_提示词_v2.md', index: 'A', working_dir: ' ' }],
      staged: ['数据快照分析助手_提示词_v2.md'],
    };
    await nextTick();
    for (let i = 0; i < 4; i++) await nextTick();

    // ② 非 Git 目录的界面里既不该有分支名，也不该有那个文件的行
    expect(host.querySelector('.git-top')).toBeNull();
    expect(host.textContent).not.toContain('master');
    expect(host.textContent).not.toContain('数据快照分析助手');
    expect(host.querySelectorAll('.git-file-row').length).toBe(0);
    app.unmount();
  });

  it('★ 点「初始化 Git 仓库」→ 真的打 POST /git/init（面板自己的出口是通的）', async () => {
    const { host, app } = await mountAndInit();
    const btn = host.querySelector('.git-nonrepo-btn') as HTMLButtonElement;
    btn.click();
    for (let i = 0; i < 6; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(post).toHaveBeenCalledWith('/git/init', { repo: NON_REPO });
    app.unmount();
  });
});
