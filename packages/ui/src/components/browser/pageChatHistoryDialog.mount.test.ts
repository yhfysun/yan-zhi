// @vitest-environment jsdom
/**
 * PageChatHistoryDialog（页面会话「历史」）**真挂载**测试 —— 列表 / 打开 / 删除三件事。
 *
 * ★ 为什么必须有这一层（本仓老教训：断言存在 ≠ 断言生效）：
 *   纯函数测试（utils/pageChatHistory.test.ts）只证明"映射与过滤对"，
 *   源码静态断言只证明"代码里写了这三个按钮" —— 都不证明**界面上真能用**：
 *   点「打开」到底有没有切会话绑定、点「删除」到底有没有调删除、读失败时有没有如实说。
 *   这里真挂载、真点、真读 DOM。
 *
 * 依赖只 mock 数据源（page-chat store）；Element Plus 走真组件。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import ElementPlus, { ElMessageBox } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 假历史：两条本站（其中一条是当前会话）、一条别站（用来验「只看本站」） */
const ROWS = [
  {
    id: 'c_taobao', title: '提取本页表格', url: 'https://taobao.com/list?q=1', host: 'taobao.com',
    scope: 'page', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_600_000,
  },
  {
    id: 'c_jd', title: '浏览器 · jd.com', url: 'https://jd.com/', host: 'jd.com',
    scope: 'page', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_300_000,
  },
  {
    id: 'c_taobao2', title: '比价', url: 'https://taobao.com/detail', host: 'taobao.com',
    scope: 'page', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_900_000,
  },
];

// ── 假 store：只提供组件真正用到的面 ──
const state = {
  rows: [...ROWS] as any[],
  warning: '',
  openResult: { ok: true } as any,
  openCalls: [] as Array<{ tabId: string; s: any }>,
  deleteCalls: [] as string[],
};
const fakePageChatStore = {
  listSessions: vi.fn(async () => ({ rows: state.rows, warning: state.warning })),
  openSession: vi.fn(async (tabId: string, s: any) => { state.openCalls.push({ tabId, s }); return state.openResult; }),
  deleteSession: vi.fn(async (id: string) => { state.deleteCalls.push(id); return { ok: true }; }),
};

vi.mock('../../stores/page-chat', () => ({
  usePageChatStore: () => fakePageChatStore,
}));

import PageChatHistoryDialog from './PageChatHistoryDialog.vue';

let app: App | null = null;

async function flush() {
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

/**
 * 真挂载弹窗。
 * ★ 必须走「visible 由 false 变 true」这条真实路径：组件是在 watch(visible) 里拉列表的，
 *   一开始就以 visible:true 挂载 ⇒ watch 不触发 ⇒ 列表永远空，测试会**假失败**。
 * ★ 必须接住 `update:visible`（等价于真实用法的 `v-model:visible`）：只把它当普通 prop 传，
 *   子组件 emit 的"请关闭"没人接 ⇒ 弹窗永远开着，测出来的是夹具的错而不是组件的错。
 *   因此这里把每次 emit 都记进 `updates`，用"有没有请求关闭"来断言，而不是看 DOM
 *   （Element Plus 的 el-dialog 关掉后 overlay 仍在 DOM 里，display:none —— 看文本看不出来）。
 */
async function mountDialog(opts: { host?: string } = {}) {
  // 上一个用例的 el-dialog 是 append-to-body 的，不卸载会残留 DOM 干扰断言（真踩过）
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
  const visible = ref(false);
  const updates: boolean[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp({
    setup: () => () => h(PageChatHistoryDialog, {
      visible: visible.value,
      'onUpdate:visible': (v: boolean) => { updates.push(v); visible.value = v; },
      tabId: 'tab-1',
      currentConvId: 'c_taobao',
      currentHost: opts.host ?? 'taobao.com',
    }),
  });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(container);
  await flush();
  visible.value = true;
  await flush();
  return { container, updates, isVisible: () => visible.value };
}

/** el-dialog 默认 append-to-body ⇒ 内容在 body 上，不在挂载容器里 */
const bodyText = () => document.body.textContent || '';

function rowByText(text: string): HTMLElement {
  const row = [...document.body.querySelectorAll('.pch-row')].find((r) => r.textContent?.includes(text));
  if (!row) throw new Error(`未找到包含「${text}」的历史行`);
  return row as HTMLElement;
}

function clickBtn(root: HTMLElement, label: string) {
  const btn = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`未找到按钮「${label}」`);
  (btn as HTMLButtonElement).click();
}

beforeAll(() => {
  // jsdom 没有 ResizeObserver / matchMedia，Element Plus 的若干组件会用到
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).matchMedia = (globalThis as any).matchMedia
    || ((q: string) => ({
      matches: false, media: q,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent: () => false,
    }));
});

describe('★ P3-5：历史列表（真挂载）', () => {
  it('按来源拉取并逐条渲染：站点 + 标题；当前会话标「当前」（且只有一条）', async () => {
    await mountDialog();
    const text = bodyText();
    expect(fakePageChatStore.listSessions).toHaveBeenCalled();
    expect(text).toContain('taobao.com');
    expect(text).toContain('提取本页表格');
    expect(text).toContain('浏览器 · jd.com');
    expect((text.match(/当前/g) || []).length).toBe(1);
    expect(rowByText('提取本页表格').textContent).toContain('当前');
  });

  it('★ 读失败要如实说，不能显示成"还没有历史"', async () => {
    state.warning = '历史读取失败：网络不可达';
    try {
      await mountDialog();
      expect(bodyText()).toContain('历史读取失败');
      expect(bodyText()).not.toContain('还没有页面对话');
    } finally { state.warning = ''; }
  });

  it('「只看本站」勾选后只留当前站的会话', async () => {
    await mountDialog();
    expect(document.body.querySelectorAll('.pch-row').length).toBe(3);
    const cb = document.body.querySelector('.pch-only-host input') as HTMLInputElement;
    expect(cb, '★ 没渲染出「只看本站」开关').toBeTruthy();
    cb.click();
    await flush();
    const kept = [...document.body.querySelectorAll('.pch-row')].map((r) => r.textContent || '');
    expect(kept.length).toBe(2);
    expect(kept.join('|')).not.toContain('jd.com');
  });

  it('没有页面对话时给一条可读的空态文案', async () => {
    state.rows = [];
    try {
      await mountDialog();
      expect(bodyText()).toContain('还没有页面对话');
    } finally { state.rows = [...ROWS]; }
  });
});

describe('★ P3-5：打开 / 删除（真挂载）', () => {
  it('点「打开」→ 调 openSession(本 tab, 该行)，成功后请求关闭弹窗', async () => {
    state.openCalls = [];
    state.openResult = { ok: true };
    const fx = await mountDialog();
    clickBtn(rowByText('比价'), '打开');
    await flush();
    expect(state.openCalls.length).toBe(1);
    expect(state.openCalls[0].tabId).toBe('tab-1');
    expect(state.openCalls[0].s.id).toBe('c_taobao2');
    expect(fx.updates).toEqual([false]);          // 且只请求关闭一次
  });

  it('★ 打开失败（如在执行中）⇒ 不关弹窗，并把原因显示出来', async () => {
    state.openCalls = [];
    state.openResult = { ok: false, msg: '这一页正在执行，先停止或等它结束' };
    const fx = await mountDialog();
    clickBtn(rowByText('比价'), '打开');
    await flush();
    expect(state.openCalls.length).toBe(1);
    expect(fx.updates).toEqual([]);               // 没有请求关闭
    expect(bodyText()).toContain('这一页正在执行'); // 弹窗还在，且带原因
  });

  it('点「删除」→ 先确认，确认后调 deleteSession 且该行消失', async () => {
    state.deleteCalls = [];
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm' as any).mockResolvedValue('confirm' as any);
    try {
      await mountDialog();
      clickBtn(rowByText('比价'), '删除');
      await flush();
      expect(confirmSpy).toHaveBeenCalled();
      expect(state.deleteCalls).toEqual(['c_taobao2']);
      expect(bodyText()).not.toContain('比价');
    } finally { confirmSpy.mockRestore(); }
  });

  it('★ 确认框取消 ⇒ 一次删除都不发（删会话是"离开日常视野"的动作，不该误触发）', async () => {
    state.deleteCalls = [];
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm' as any).mockRejectedValue(new Error('cancel'));
    try {
      await mountDialog();
      clickBtn(rowByText('比价'), '删除');
      await flush();
      expect(state.deleteCalls).toEqual([]);
      expect(bodyText()).toContain('比价');            // 行还在
    } finally { confirmSpy.mockRestore(); }
  });
});

describe('★ 面板入口：历史 / 技能（PageChatDock 源码契约）', () => {
  const DOCK = readFileSync(resolve(__dirname, 'PageChatDock.vue'), 'utf8');

  it('头部有「历史」「技能」两个入口，且都挂上了对应弹窗', () => {
    expect(DOCK).toContain('🕘 历史');
    expect(DOCK).toContain('✨ 技能');
    expect(DOCK, '★ 历史弹窗没挂载 ⇒ 按钮点了没反应').toContain('<PageChatHistoryDialog');
    expect(DOCK, '★ 蒸馏弹窗没挂载 ⇒「总结成 skill」按钮点了没反应').toContain('<DistillDialog');
  });

  it('★ 蒸馏素材走 distillMessagesOf（过滤掉"已停止"这类本地面板提示）', () => {
    expect(DOCK).toContain('distillMessagesOf');
    expect(DOCK).not.toMatch(/:messages="state\.messages"/);
  });
});
