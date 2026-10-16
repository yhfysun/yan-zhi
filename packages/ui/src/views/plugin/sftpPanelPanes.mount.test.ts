// @vitest-environment jsdom
// SFTP 文件面板（SftpPanel.vue）的**真实挂载**守门测试。
//
// 为什么要有它（2026-10-16）：用户报「双栏里的本地栏没了、右键菜单也没有」。
//   本仓既有的 `opsSftpMenu.test.ts` 是**读源码做文本断言**——它能在源码里查到「新建目录」两处，
//   但**抓不到运行时**：某一栏没渲染、菜单事件没接上、紧凑模式没堆叠（本地栏被挤到窗口外）。
//   这一类只有真挂载才拦得住，故这里 createApp 挂真组件，钉住三件事：
//     ① 远程 / 本地两栏都渲染（少一栏 = 用户眼里的"本地工作目录没了"）
//     ② 紧凑模式走上下堆叠（is-stacked）——并排会把两栏各挤到 ~140px，等于看不见
//     ③ 两栏**各自**都能右键出菜单，且菜单项按栏分叉（旧实现只有远程栏有菜单）
//   挂载方式跟随仓库既有做法（createApp + ElementPlus，本包没有 @vue/test-utils）。
import { describe, it, expect, vi } from 'vitest';

// ★ 必须在组件模块被 import 之前装好 window.electronAPI：
//   SftpPanel 顶层的 `isElectron` 是**模块作用域**常量，晚一步就永远是 false（本地栏退化成「仅桌面端可用」）。
vi.hoisted(() => {
  (globalThis as unknown as { window: Record<string, unknown> }).window.electronAPI = {
    isElectron: true,
    fs: {
      homeDir: async () => 'C:/Users/probe',
      // 任何目录都能列出来：让 onMounted 的候选目录探测（Downloads → 下载 → 家目录）第一步就命中
      listDetailed: async (p: string) => ([
        { name: 'Downloads', path: `${p}/Downloads`, isDir: true, size: 0, mtime: 1 },
        { name: 'a.txt', path: `${p}/a.txt`, isDir: false, size: 12, mtime: 1 },
      ]),
      exists: async () => false,
      mkdir: async () => undefined,
    },
    dialog: { showOpenDir: async () => '', showOpenFiles: async () => [] },
  };
});

// 远程列表打桩：不发网络请求（本文件只验渲染与交互）
vi.mock('../../api/client', () => ({
  API_BASE: 'http://127.0.0.1:0/api',
  api: {
    get: async () => ({
      data: {
        path: '/home/app',
        root: '/home/app',
        entries: [
          { name: 'bin', type: 'dir', size: 0, mtime: 1, mode: 0 },
          { name: 'app.log', type: 'file', size: 12, mtime: 1, mode: 0 },
        ],
      },
    }),
    post: async () => ({ data: { ok: true } }),
  },
}));

import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import SftpPanel from './SftpPanel.vue';

const CONN = { id: 'c1', name: '探针连接', host: '10.0.0.1', username: 'app', tag: '', sftpPath: '/home/app' };

interface Mounted { host: HTMLElement; app: App }

async function mountPanel(): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(SftpPanel as never, { connectionId: 'c1', conn: CONN, compact: true }),
  });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  // 等 onMounted 里的远程/本地两次异步列表落地
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
  return { host, app };
}

const paneTags = (host: HTMLElement) => [...host.querySelectorAll('.sftp-pane-tag')].map((e) => e.textContent);
const rowsOf = (host: HTMLElement, pane: number) => host.querySelectorAll(`.sftp-panes > .sftp-pane:nth-child(${pane + 1}) .sftp-row`);

/** 右键某一行 → 读 Teleport 到 body 的菜单项文本（读不到返回 null） */
async function ctxMenuItemsAfterRightClick(row: Element | undefined): Promise<string[] | null> {
  expect(row).toBeTruthy();
  row!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 }));
  await nextTick();
  const menu = document.body.querySelector('.ctx-menu');
  if (!menu) return null;
  return [...menu.children].map((c) => (c.textContent || '').trim());
}

describe('SftpPanel · 双栏与右键菜单（真实挂载）', () => {
  it('★ 远程 / 本地两栏都渲染，且紧凑模式是上下堆叠（少一栏/并排都会让本地栏看不见）', async () => {
    const { host, app } = await mountPanel();
    expect(paneTags(host)).toEqual(['远程', '本地']);
    expect(host.querySelectorAll('.sftp-panes > .sftp-pane').length).toBe(2);
    // 并排（默认 grid 两列）会把每栏压到 ~140px；紧凑模式必须走 is-stacked
    expect(host.querySelector('.sftp-panes.is-stacked')).not.toBeNull();
    expect(host.querySelector('.sftp-panel.is-compact')).not.toBeNull();
    app.unmount();
  });

  it('★ 本地栏真的列出了本地目录内容（不是空的「未选择目录」）', async () => {
    const { host, app } = await mountPanel();
    const localRows = rowsOf(host, 1);
    expect(localRows.length).toBeGreaterThan(0);
    expect([...localRows].map((r) => r.querySelector('.sftp-name')?.textContent)).toContain('a.txt');
    // 本地栏当前目录来自 electronAPI.fs（Downloads 候选命中）
    expect(host.textContent).toContain('Downloads');
    app.unmount();
  });

  it('★ 远程行右键出菜单：打开 / 复制到本地 / 重命名 / 删除', async () => {
    const { host, app } = await mountPanel();
    const dirRow = [...rowsOf(host, 0)].find((r) => r.querySelector('.sftp-name')?.textContent === 'bin');
    const items = await ctxMenuItemsAfterRightClick(dirRow);
    expect(items).not.toBeNull();
    expect(items).toEqual(expect.arrayContaining(['打开', '复制到本地', '重命名', '删除']));
    // 目录不给「备份」（备份只对文件）
    expect(items).not.toContain('备份');
    app.unmount();
  });

  it('★ 本地行右键出菜单：复制到远程 / 重命名 / 删除（旧实现本地栏整个没有菜单）', async () => {
    const { host, app } = await mountPanel();
    const localDirRow = [...rowsOf(host, 1)].find((r) => r.querySelector('.sftp-name')?.textContent === 'Downloads');
    const items = await ctxMenuItemsAfterRightClick(localDirRow);
    expect(items).not.toBeNull();
    expect(items).toEqual(expect.arrayContaining(['打开', '复制到远程', '重命名', '删除']));
    app.unmount();
  });

  it('★ 两栏空白处右键各给各的菜单（远程：上传/新建目录；本地：只新建目录）', async () => {
    const { host, app } = await mountPanel();
    const blank = (pane: number) => host.querySelector(`.sftp-panes > .sftp-pane:nth-child(${pane + 1}) .sftp-list`) as Element;

    const remote = await ctxMenuItemsAfterRightClick(blank(0));
    expect(remote).toEqual(expect.arrayContaining(['上传文件', '上传文件夹', '新建目录']));

    // 先关掉上一份菜单，再右键本地栏空白处
    document.body.querySelector('.ctx-menu')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    const local = await ctxMenuItemsAfterRightClick(blank(1));
    expect(local).toEqual(['新建目录']);
    app.unmount();
  });
});
