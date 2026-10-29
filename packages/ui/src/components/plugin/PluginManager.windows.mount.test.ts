// @vitest-environment jsdom
/**
 * 插件管理 · 桌面窗口入口（contributes.windows）真挂载测试。
 *
 * 为什么必须挂载而不是读源码：这条链上有三层判断（插件是否启用 / 宿主是否 Electron /
 * 清单是否声明了窗口），任何一层写错的表现都是「按钮不出现」—— 静态断言只能证明
 * 代码里写了字符串，证明不了卡片上真的多出一个能点的按钮。
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

interface FakePlugin {
  manifest: Record<string, unknown>;
  state: string;
  config: Record<string, unknown>;
  source: string;
}

/** 每个用例自行替换：mount 前设置 */
let PLUGINS: FakePlugin[] = [];

vi.mock('../../stores/plugin', () => ({
  usePluginStore: () => ({
    plugins: PLUGINS,
    loaded: true,
    refresh: vi.fn(async () => {}),
    enable: vi.fn(async () => null),
    disable: vi.fn(async () => null),
    setConfig: vi.fn(async () => null),
    uninstall: vi.fn(async () => null),
  }),
}));

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const FENCE_WINDOW = {
  id: 'fence',
  label: '围栏',
  entry: 'frontend/fence.html',
  placement: 'desktop',
};
const PANEL_WINDOW = {
  id: 'panel',
  label: '设置',
  entry: 'frontend/settings.html',
  placement: 'normal',
  rect: { x: 140, y: 100, w: 640, h: 720 },
  resizable: true,
};

function plugin(id: string, opts: { windows?: unknown[]; state?: string } = {}): FakePlugin {
  return {
    manifest: {
      id,
      name: id,
      version: '0.1.0',
      category: '功能',
      permissions: ['fs'],
      contributes: opts.windows ? { windows: opts.windows } : {},
    },
    state: opts.state || 'enabled',
    config: {},
    source: 'installed',
  };
}

let PluginManager: any;
let app: App | null = null;

beforeAll(async () => {
  PluginManager = (await import('./PluginManager.vue')).default;
});

/** 假宿主：只实现组件用到的那几个方法，并记录调用 */
function stubElectron() {
  const calls = { open: [] as unknown[], update: [] as unknown[] };
  let nextId = 1;
  (window as any).electronAPI = {
    pluginWindow: {
      open: vi.fn(async (opts: unknown) => {
        calls.open.push(opts);
        return { ok: true, windowId: 'pw-' + nextId++ };
      }),
      update: vi.fn(async (windowId: string, patch: unknown) => {
        calls.update.push({ windowId, patch });
        return { ok: true };
      }),
      on: vi.fn(() => () => {}),
    },
  };
  return calls;
}

async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(PluginManager);
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(host);
  await nextTick();
  await nextTick();
  return host;
}

/** 卡片上的按钮文案（不含工具条上的「开发模板 / 安装插件」） */
function cardButtons(host: HTMLElement, pluginId: string): string[] {
  const card = [...host.querySelectorAll('.pm-card')].find((c) =>
    c.querySelector('.pm-name')?.textContent?.trim() === pluginId,
  );
  if (!card) return [];
  return [...card.querySelectorAll('.pm-actions button')].map((b) => (b.textContent || '').trim());
}

async function clickCardButton(host: HTMLElement, label: string) {
  const btn = [...host.querySelectorAll('.pm-actions button')].find(
    (b) => (b.textContent || '').trim() === label,
  ) as HTMLButtonElement | undefined;
  expect(btn, `卡片上必须有「${label}」按钮`).toBeTruthy();
  btn!.click();
  await nextTick();
}

beforeEach(() => {
  PLUGINS = [];
  document.body.innerHTML = '';
});

afterEach(() => {
  app?.unmount();
  app = null;
  delete (window as any).electronAPI;
  document.body.innerHTML = '';
});

describe('插件管理 · 桌面窗口按钮', () => {
  it('启用且声明了 windows：卡片上出现对应按钮', async () => {
    stubElectron();
    PLUGINS = [plugin('desktop-manager', { windows: [PANEL_WINDOW, FENCE_WINDOW] })];
    const host = await mount();
    expect(cardButtons(host, 'desktop-manager')).toEqual(['设置', '围栏', '配置', '详情', '导出', '卸载']);
  });

  it('没声明 windows 的插件不多出按钮', async () => {
    stubElectron();
    PLUGINS = [plugin('office-core')];
    const host = await mount();
    expect(cardButtons(host, 'office-core')).toEqual(['配置', '详情', '导出', '卸载']);
  });

  it('停用的插件不给入口（唤起只会开出无后端的空壳）', async () => {
    stubElectron();
    PLUGINS = [plugin('desktop-manager', { windows: [FENCE_WINDOW], state: 'disabled' })];
    const host = await mount();
    expect(cardButtons(host, 'desktop-manager')).not.toContain('围栏');
  });

  it('非 Electron 宿主（web / 预览）不显示按钮', async () => {
    PLUGINS = [plugin('desktop-manager', { windows: [FENCE_WINDOW] })];
    const host = await mount();
    expect(cardButtons(host, 'desktop-manager')).not.toContain('围栏');
  });

  it('点「围栏」按清单声明的 entry / placement 开窗', async () => {
    const calls = stubElectron();
    PLUGINS = [plugin('desktop-manager', { windows: [PANEL_WINDOW, FENCE_WINDOW] })];
    const host = await mount();
    await clickCardButton(host, '围栏');
    expect(calls.open).toEqual([
      { pluginId: 'desktop-manager', entry: 'frontend/fence.html', placement: 'desktop' },
    ]);
  });

  it('点「设置」把清单里的 rect / resizable 一起传下去（否则面板会铺满整屏）', async () => {
    const calls = stubElectron();
    PLUGINS = [plugin('desktop-manager', { windows: [PANEL_WINDOW] })];
    const host = await mount();
    await clickCardButton(host, '设置');
    expect(calls.open).toEqual([
      {
        pluginId: 'desktop-manager',
        entry: 'frontend/settings.html',
        placement: 'normal',
        rect: { x: 140, y: 100, w: 640, h: 720 },
        resizable: true,
      },
    ]);
  });

  it('再点一次只把已有窗口叫回来，不叠第二个（两个围栏会互抢系统图标）', async () => {
    const calls = stubElectron();
    PLUGINS = [plugin('desktop-manager', { windows: [FENCE_WINDOW] })];
    const host = await mount();
    await clickCardButton(host, '围栏');
    await clickCardButton(host, '围栏');
    expect(calls.open).toHaveLength(1);
    expect(calls.update).toEqual([{ windowId: 'pw-1', patch: { visible: true } }]);
  });
});
