// @vitest-environment jsdom
/**
 * PageCommandsDialog（页面指令管理）**真挂载**测试 —— P2 的"信任"门控与只读边界。
 *
 * ★ 为什么必须有这一层（本仓的老教训：断言存在 ≠ 断言生效）：
 *   脚本型指令的免确认是**安全相关**的开关，它由两把锁共同把守：
 *     ① 全局设置「允许信任脚本指令」（默认关）；
 *     ② 单条指令的「信任」。
 *   纯函数测试只证明"匹配/插值对"，源码静态断言只证明"代码里写了这两把锁" ——
 *   都不证明**界面上真的锁着**（用户点得到、看得见提示）。这里真挂载、真读 DOM。
 *
 * 依赖只 mock 数据源（页面指令 store / 设置 store），Element Plus 走真组件。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, nextTick, ref, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

/** 假数据：一条内置任务型、一条内置脚本型（永远要确认）、一条用户脚本型（已信任） */
const ROWS = [
  {
    id: 'pc_summarize', name: '总结本页要点', description: '输出要点', kind: 'task', body: '总结这一页',
    match_host: '*', match_url: null, source: 'builtin', enabled: 1, need_confirm: 1, created_at: 1,
  },
  {
    id: 'pc_script_links_json', name: '导出本页链接（JSON）', description: '只读脚本', kind: 'script', body: 'return 1',
    match_host: '*', match_url: null, source: 'builtin', enabled: 1, need_confirm: 1, created_at: 2,
  },
  {
    id: 'pc_mine_script', name: '我的脚本', description: '我自己写的', kind: 'script', body: 'return 2',
    match_host: 'kol.fanqieopen.com', match_url: null, source: 'user', enabled: 1, need_confirm: 0, created_at: 3,
  },
];

// ── 假 store：只提供组件真正用到的面 ──
const trustSetting = ref(false);
const runsCalls: any[] = [];
const fakeCommandsStore = {
  list: ROWS,
  loaded: true,
  loading: false,
  warning: '',
  load: vi.fn(async () => {}),
  create: vi.fn(async () => ({ ok: true, row: ROWS[2] })),
  update: vi.fn(async () => ({ ok: true, row: ROWS[2] })),
  remove: vi.fn(async () => ({ ok: true })),
  markUsed: vi.fn(),
  reportRun: vi.fn(),
  listRuns: vi.fn(async (id?: string) => { runsCalls.push(id); return { rows: [], warning: '' }; }),
  matched: () => [ROWS[1], ROWS[0]],
};

vi.mock('../../stores/page-commands', () => ({
  usePageCommandsStore: () => fakeCommandsStore,
}));
// settings 用 **getter** 返回：测试中途改 trustSetting 后，组件下次读取就能拿到新值
// （对象字面量会把值定格在 setup 那一刻，导致"改了设置但界面没变"的假失败）
vi.mock('../../stores/settings', () => ({
  useSettingsStore: () => ({
    get settings() { return { browserTrustScriptCommands: trustSetting.value }; },
  }),
}));

import PageCommandsDialog from './PageCommandsDialog.vue';

let app: App | null = null;

async function mountDialog(url = 'https://kol.fanqieopen.com/book/1') {
  // ★ 上一个用例的 el-dialog 是 append-to-body 的，不卸载会残留 DOM 干扰断言（真踩过）
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp(PageCommandsDialog, { modelValue: true, url });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(container);
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));   // 让 el-dialog 内容就绪
  await nextTick();
  return container;
}

/** el-dialog 默认 append-to-body ⇒ 内容在 body 上，不在挂载容器里 */
function bodyEl(): HTMLElement { return document.body; }

function rowByText(text: string): HTMLElement {
  const row = [...bodyEl().querySelectorAll('.pc-row')].find((r) => r.textContent?.includes(text));
  if (!row) throw new Error(`未找到包含「${text}」的指令行`);
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

describe('★ P2：信任门控与只读边界（真挂载）', () => {
  it('列表：脚本型行标「脚本」；只有已信任的那条标「已信任 · 免确认」', async () => {
    await mountDialog();
    const text = bodyEl().textContent || '';
    expect(text).toContain('导出本页链接（JSON）');
    expect(text).toContain('脚本');                 // 脚本徽标
    expect(text).toContain('已信任 · 免确认');        // 只有 need_confirm=0 的那条
    // 只应有**一条**已信任标记（内置脚本必须仍是每次确认）
    expect((text.match(/已信任 · 免确认/g) || []).length).toBe(1);
  });

  it('内置指令（含脚本）不可编辑/不可删除：按钮是 disabled', async () => {
    await mountDialog();
    const builtinRow = rowByText('导出本页链接（JSON）');
    const btns = [...builtinRow.querySelectorAll('button')] as HTMLButtonElement[];
    const edit = btns.find((b) => b.textContent?.includes('编辑'))!;
    const del = btns.find((b) => b.textContent?.includes('删除'))!;
    expect(edit.disabled, '内置指令的「编辑」必须禁用').toBe(true);
    expect(del.disabled, '内置指令的「删除」必须禁用').toBe(true);
  });

  it('★ 全局设置关着时：编辑脚本指令，信任开关禁用且提示"需先开启"', async () => {
    trustSetting.value = false;
    await mountDialog();
    clickBtn(rowByText('我的脚本'), '编辑');
    await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick();

    expect(bodyEl().textContent).toContain('需先在「浏览器设置」里打开「允许信任脚本指令」');
    const switches = [...bodyEl().querySelectorAll('.el-switch')];
    expect(switches.length, '表单里应渲染出开关（启用 / 信任）').toBeGreaterThan(0);
    // 全局关着 → 信任开关处于禁用态（Element Plus 用 is-disabled 类）
    expect(switches.some((s) => s.className.includes('is-disabled'))).toBe(true);
  });

  it('★ 全局设置打开后：提示改为"不再弹确认"，且开关全部可用', async () => {
    trustSetting.value = true;
    await mountDialog();
    clickBtn(rowByText('我的脚本'), '编辑');
    await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick();

    expect(bodyEl().textContent).toContain('打开后这条指令执行时不再弹确认');
    const switches = [...bodyEl().querySelectorAll('.el-switch')];
    expect(switches.every((s) => !s.className.includes('is-disabled'))).toBe(true);
  });

  it('「记录」按钮走审计查询（带上该指令 id）', async () => {
    await mountDialog();
    runsCalls.length = 0;
    clickBtn(rowByText('导出本页链接（JSON）'), '记录');
    await nextTick(); await new Promise((r) => setTimeout(r, 0));
    expect(runsCalls).toContain('pc_script_links_json');
  });
});
