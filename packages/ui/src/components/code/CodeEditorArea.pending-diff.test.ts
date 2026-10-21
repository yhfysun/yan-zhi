// @vitest-environment jsdom
// 编辑器「点聊天卡里的文件 → 直接进 diff」的联动守门测试（2026-10-21）
//
// ★ 为什么必须真挂载：这条链有三段（聊天卡 store.openDiff → CodeEditorArea 打开文件 →
//   showDiff=true 渲染 AiDiffView），其中藏着一次**时序竞争**：
//     openFile() 会改 activePath → 触发"切标签就关 diff"的 watch → 若它无条件清掉
//     forcedChange，等 await loadContent 回来时 activeAiChange 已是 null ⇒ 用户点了没反应。
//   只测 store 信号（pendingDiff 有值）完全抓不到这个 bug，所以这里把子组件 stub 掉、
//   真挂 CodeEditorArea，断言 AiDiffView 被渲染且拿到正确的 changeId。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FILE_PATH = 'C:\\proj\\shutter\\apps\\mobile\\lib\\home_page.dart';

vi.mock('../../api/client', () => {
  const get = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/workspace/file?')) {
      return { data: { content: 'void main() {}\n', name: 'home_page.dart', mtime: 1, encoding: 'utf-8' } };
    }
    if (u.startsWith('/git/discover')) return { data: { repo: null } };
    if (u.startsWith('/git/conflicts')) return { data: [] };
    if (u.startsWith('/workspace/changes')) return { data: { items: [] } };
    // 其余（终端会话等）给个形状合理的空对象：编辑器区域挂了控制台面板，
    // 返回 null 会让它 onMounted 时读 r.data.sessionId 抛未处理拒绝（与本次改动无关的噪声）
    return { data: { sessionId: 'sess-1' } };
  });
  return {
    isElectron: false, isCapacitor: false, isLocalClient: false,
    LOCAL_API_PORT: 0, LOCAL_API_BASE: 'http://127.0.0.1:0/api', API_BASE: 'http://127.0.0.1:0/api',
    wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
    getMobileApiBase: () => '', setMobileApiBase: () => '', getLicenseCode: () => null,
    setToken: () => undefined, buildRequestHeaders: () => ({}),
    apiFetch: vi.fn(async () => ({ data: null })),
    api: {
      get,
      post: vi.fn(async () => ({ data: { sessionId: 'sess-1' } })),
      patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    },
  };
});

// 子组件 stub：绕开 CodeMirror（jsdom 下不需要真渲染也能验证「谁被渲染、拿到什么 props」）
vi.mock('./AiDiffView.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      name: 'AiDiffView',
      props: { changeId: { type: String, default: '' }, path: { type: String, default: '' } },
      render(this: Record<string, unknown>) {
        return h('div', {
          class: 'stub-ai-diff',
          'data-id': String(this.changeId ?? ''),
          'data-path': String(this.path ?? ''),
        });
      },
    },
  };
});
vi.mock('./CodeEditorPane.vue', async () => {
  const { h } = await import('vue');
  return { default: { name: 'CodeEditorPane', props: ['value', 'fileName'], render: () => h('div', { class: 'stub-pane' }) } };
});
vi.mock('./MarkdownPreview.vue', async () => {
  const { h } = await import('vue');
  return { default: { name: 'MarkdownPreview', props: ['value'], render: () => h('div', { class: 'stub-md' }) } };
});
vi.mock('./BreadcrumbDropdown.vue', async () => {
  const { h } = await import('vue');
  return { default: { name: 'BreadcrumbDropdown', render: () => h('div', { class: 'stub-crumbs' }) } };
});

import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { useCodeStore } from '../../stores/code';
import CodeEditorArea from './CodeEditorArea.vue';

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountEditor(): Promise<{ app: App; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(CodeEditorArea as never) });
  app.use(pinia);
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('CodeEditorArea · 从聊天「本次修改」卡跳转', () => {
  it('★ openDiff → 打开该文件并直接渲染 diff（不是停在普通编辑器）', async () => {
    const { app, host } = await mountEditor();
    const code = useCodeStore();
    expect(host.querySelector('.stub-ai-diff')).toBeNull();

    code.openDiff(FILE_PATH, 'fc_1');
    await settle();

    expect(code.activePath).toBe(FILE_PATH);
    const diff = host.querySelector('.stub-ai-diff') as HTMLElement | null;
    expect(diff).toBeTruthy();
    expect(diff!.getAttribute('data-id')).toBe('fc_1');
    expect(diff!.getAttribute('data-path')).toBe(FILE_PATH);
    app.unmount();
  });

  it('★ 关掉 diff 后再点同一文件，仍能重新打开（信号带 ts，不因值相同被吞）', async () => {
    const { app, host } = await mountEditor();
    const code = useCodeStore();

    code.openDiff(FILE_PATH, 'fc_1');
    await settle();
    expect(host.querySelector('.stub-ai-diff')).toBeTruthy();

    // 用户切到别的标签（模拟）：activePath 变化会关掉 diff
    code.openDiff('C:\\proj\\shutter\\README.md', 'fc_2');
    await settle();
    expect(code.activePath).toBe('C:\\proj\\shutter\\README.md');

    code.openDiff(FILE_PATH, 'fc_1');
    await settle();
    expect(code.activePath).toBe(FILE_PATH);
    expect(host.querySelector('.stub-ai-diff')).toBeTruthy();
    app.unmount();
  });
});
