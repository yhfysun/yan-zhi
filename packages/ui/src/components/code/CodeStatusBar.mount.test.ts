// @vitest-environment jsdom
// 编辑器状态栏的「编码」显示与转码入口 —— 真实挂载守门测试（2026-10-21）
//
// ★ 为什么要有它：状态栏此前把编码**硬编码成 "UTF-8"**，于是 GBK 文件在编辑器里整篇乱码，
//   用户连"这是编码问题"都看不出来（用户原话：「编辑器里面现在可以改变文件编码类型吗？」）。
//   这里钉两件事：
//     ① 显示的是**后端识别出的真实编码**（gb18030 → GBK），不是固定字符串；
//     ② 点击编码能选目标编码（菜单里有 GBK / Big5 / Shift_JIS 等，并标出当前编码）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/client', () => ({
  isElectron: false, isCapacitor: false, isLocalClient: false,
  LOCAL_API_PORT: 0, LOCAL_API_BASE: 'http://127.0.0.1:0/api', API_BASE: 'http://127.0.0.1:0/api',
  wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
  getMobileApiBase: () => '', setMobileApiBase: () => '', getLicenseCode: () => null,
  setToken: () => undefined, buildRequestHeaders: () => ({}),
  apiFetch: vi.fn(async () => ({ data: null })),
  api: {
    get: vi.fn(async () => ({ data: null })),
    post: vi.fn(async () => ({ data: { ok: true } })),
    patch: vi.fn(), put: vi.fn(), delete: vi.fn(async () => ({ data: null })),
  },
}));

import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import CodeStatusBar from './CodeStatusBar.vue';

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountWith(getEncoding: string | undefined): Promise<{ app: App; host: HTMLElement }> {
  setActivePinia(createPinia());
  const code = useCodeStore();
  code.openFiles = [{
    path: 'C:/work/proj/legacy.txt',
    name: 'legacy.txt',
    content: '构建完成',
    original: '构建完成',
    loading: false,
    error: '',
    saving: false,
    mtime: 0,
    encoding: getEncoding as string,
  }];
  code.activePath = 'C:/work/proj/legacy.txt';

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(CodeStatusBar) });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('CodeStatusBar · 编码显示', () => {
  it('★ 显示后端识别出的真实编码（GBK），而不是硬编码 UTF-8', async () => {
    const { app, host } = await mountWith('gb18030');
    const text = host.textContent || '';
    expect(text).toContain('GBK');
    expect(text).not.toContain('UTF-8');
    app.unmount();
  });

  it('UTF-8 文件显示 UTF-8', async () => {
    const { app, host } = await mountWith('utf-8');
    expect(host.textContent || '').toContain('UTF-8');
    app.unmount();
  });

  it('编码是一个可点击的入口（不是纯文本）', async () => {
    const { app, host } = await mountWith('gb18030');
    const trigger = host.querySelector('button.csb-seg[title*="当前编码"]') as HTMLElement | null;
    expect(trigger).toBeTruthy();
    expect(trigger?.title).toContain('GBK');
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    // 菜单渲染在 body（Element Plus teleport）：应能看到其它目标编码
    const menuText = document.body.textContent || '';
    expect(menuText).toContain('Big5');
    expect(menuText).toContain('Shift_JIS');
    expect(menuText).toContain('（当前）');
    app.unmount();
  });
});
