// @vitest-environment jsdom
// 底部状态栏「当前上下文」按模式换口径 —— 真实挂载守门测试（2026-11-02）
//
// ★ 为什么要有它：状态栏第二项写死成「工作区」，而店铺运营/剪辑的上下文是**项目**
//   （= 会话），开发是**项目目录**，只有办公才是工作区。用户实报：
//   「店铺运营模式下最下面显示『工作区 未设置』，这应该是项目吧，而且应该适配不同模式」。
//   这里钉住：
//     ① 店铺 → 项目 = 当前会话标题；没选会话给明确文案；
//     ② 开发 → 项目 = 代码工程目录名；③ 办公 → 工作区 = 工作目录名；
//     ④ 运维/安全/工作流/剪辑 → 读工作台回填的当前项（连接/目标/工作流/项目），
//        没回填过就整项不渲染（不硬凑「工作区」）；并钉住四个工作台确实在回填。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

vi.mock('../api/client', () => ({
  isElectron: false, isCapacitor: false, isLocalClient: false,
  LOCAL_API_PORT: 0, LOCAL_API_BASE: 'http://127.0.0.1:0/api', API_BASE: 'http://127.0.0.1:0/api',
  wsUrl: (p: string) => `ws://127.0.0.1:0${p}`,
  getMobileApiBase: () => '', setMobileApiBase: () => '', getLicenseCode: () => null,
  setToken: () => undefined, buildRequestHeaders: () => ({}), mediaAuthQuery: () => '',
  apiFetch: vi.fn(async () => ({ data: null })),
  api: {
    // 切项目目录会触发 code store 的 fetchAiChanges（GET /workspace/changes），给足 items
    get: vi.fn(async () => ({ data: { items: [] } })),
    post: vi.fn(async () => ({ data: { ok: true } })),
    patch: vi.fn(async () => ({ data: null })),
    put: vi.fn(async () => ({ data: null })),
    delete: vi.fn(async () => ({ data: null })),
  },
}));

import { setMode, type AppMode } from '../stores/mode';
import { setWorkbenchContext } from '../stores/workbenchContext';
import { useChatStore } from '../stores/chat';
import { useSettingsStore } from '../stores/settings';
import { useCodeStore } from '../stores/code';
import AppStatusBar from './AppStatusBar.vue';

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < times; i++) await nextTick();
}

async function mountWith(mode: AppMode): Promise<{ app: App; host: HTMLElement }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  setMode(mode);

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(AppStatusBar) });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  app.use(pinia);
  app.use(router);
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  setWorkbenchContext('shop', null);
});

describe('AppStatusBar · 当前上下文随模式换口径', () => {
  it('店铺运营：第二项是「项目」= 当前会话标题，不再出现「工作区」', async () => {
    const { app, host } = await mountWith('shop');
    const chat = useChatStore();
    chat.conversations = [{ id: 'c1', title: '抖店-家居收纳' } as never];
    chat.currentConvId = 'c1';
    await settle();

    const text = host.textContent || '';
    expect(text).toContain('店铺运营模式');
    expect(text).toContain('项目');
    expect(text).toContain('抖店-家居收纳');
    expect(text).not.toContain('工作区');
    app.unmount();
  });

  it('店铺运营：没选项目时给明确文案，不是空白', async () => {
    const { app, host } = await mountWith('shop');
    await settle();
    expect(host.textContent || '').toContain('未选择项目');
    app.unmount();
  });

  it('店铺运营：新任务草稿态仍显示工作台回填的当前项目', async () => {
    const { app, host } = await mountWith('shop');
    setWorkbenchContext('shop', { label: '项目', value: '抖店-家居收纳' });
    await settle();

    const text = host.textContent || '';
    expect(text).toContain('项目');
    expect(text).toContain('抖店-家居收纳');
    expect(text).not.toContain('未选择项目');
    app.unmount();
  });

  it('剪辑模式：项目来自剪辑工作台回填的项目（编辑中 = 项目名）', async () => {
    const { app, host } = await mountWith('clip');
    setWorkbenchContext('clip', { label: '项目', value: '口播成片-v3' });
    await settle();

    const text = host.textContent || '';
    expect(text).toContain('项目');
    expect(text).toContain('口播成片-v3');
    expect(text).not.toContain('工作区');
    app.unmount();
  });

  it('开发模式：项目 = 代码工程目录名', async () => {
    const { app, host } = await mountWith('dev');
    const code = useCodeStore();
    code.projectDir = 'D:/code/myshop';
    await settle();

    const text = host.textContent || '';
    expect(text).toContain('项目');
    expect(text).toContain('myshop');
    app.unmount();
  });

  it('办公模式：工作区 = 工作目录名', async () => {
    const { app, host } = await mountWith('office');
    const settings = useSettingsStore();
    settings.settings.workspaceDir = 'C:/work/文档库';
    await settle();

    const text = host.textContent || '';
    expect(text).toContain('工作区');
    expect(text).toContain('文档库');
    app.unmount();
  });

  it('运维 / 安全 / 工作流：第二项由工作台回填（没回填过就不渲染，不硬凑「工作区」）', async () => {
    // 顺序敏感：本条必须排在这三类模式的回填测试之前（registry 是模块级状态，本文件内不复位）
    const fresh = await mountWith('sec');
    expect(fresh.host.textContent || '').not.toContain('工作区');
    expect(fresh.host.textContent || '').not.toContain('未选择项目');
    fresh.app.unmount();

    const ops = await mountWith('ops');
    setWorkbenchContext('ops', { label: '连接', value: 'prod-01' });
    await settle();
    expect(ops.host.textContent || '').toContain('连接');
    expect(ops.host.textContent || '').toContain('prod-01');
    ops.app.unmount();

    const wf = await mountWith('wf');
    setWorkbenchContext('wf', { label: '工作流', value: '日报生成' });
    await settle();
    expect(wf.host.textContent || '').toContain('工作流');
    expect(wf.host.textContent || '').toContain('日报生成');
    wf.app.unmount();

    const sec = await mountWith('sec');
    setWorkbenchContext('sec', { label: '目标', value: '共 3 个授权' });
    await settle();
    expect(sec.host.textContent || '').toContain('目标');
    expect(sec.host.textContent || '').toContain('共 3 个授权');
    sec.app.unmount();
  });
});

describe('AppStatusBar · 各工作台确实会回填', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('四个工作台都向 workbenchContext 回填自己的模式 key', () => {
    expect(read('views/plugin/OpsConsole.vue')).toMatch(/setWorkbenchContext\('ops'/);
    expect(read('views/plugin/SecConsole.vue')).toMatch(/setWorkbenchContext\('sec'/);
    expect(read('views/WorkflowWorkbench.vue')).toMatch(/setWorkbenchContext\('wf'/);
    expect(read('views/ClipWorkbench.vue')).toMatch(/setWorkbenchContext\('clip'/);
  });
});
