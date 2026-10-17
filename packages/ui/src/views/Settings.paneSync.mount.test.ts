// @vitest-environment jsdom
// 设置弹窗「数据菜单串到通用里面」回归守门（2026-10-17 用户实报，附设置弹窗截图）
//
// 现象：设置弹窗左侧导航点「数据」（高亮正确），右侧内容却是**通用**分区
//   （深色模式 / 低内存模式 / 主题色 / 默认模型 / 全局候选池…）。
//
// 根因：Settings.vue 的 pane→tab 同步 watch **没有 immediate**：
//   `watch(() => props.pane, p => { if (p) tab.value = p })` 只在 prop **变化**时触发，
//   而 `tab` 初值写死 'general'。SettingsDialog 里 <Settings> 是 **v-if 挂载**的：
//   从 comp 类分区（模型服务 / 技能 / 工具与连接）切到 pane 类分区（数据等）时组件
//   **全新挂载**，props.pane 从「不存在」一步变成 'data' —— watch 不触发
//   ⇒ tab 停留 'general' ⇒ 左导航高亮「数据」、内容串到通用。
//   （同文件 verification 轮询 watch 本就带 immediate，是这条漏了。）
//
// 修法：watch 加 `{ immediate: true }`。
//
// 为什么用真挂载而不是源码锚点：这条 bug 的本质是「prop→state 同步在挂载时刻缺失」，
// 属于 Vue 运行时语义，静态断言只能证明"写了 immediate"，证明不了"挂载即同步"。
// 依赖按仓库既有做法（PlatformDetail.mount.test.ts）白名单 mock 掉数据源，
// Element Plus / 图标 / 子组件一律走真实现。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

// ── 白名单 mock：主链路每加一个 store 导出都必须同步，否则 setup 直接抛错 ──
vi.mock('../stores', () => {
  const settings = {
    settings: {
      darkMode: false, liteMode: false, palette: 'cinnabar', skin: '', layout: '默认布局',
      defaultPlatformId: '', defaultModelId: '', keepRecent: 20, enableCompression: true,
      memoryExtractPlatformId: '', memoryExtractModelId: '', sendKeyMode: 'enter',
      screenshotAccelerator: 'Control+Alt+A', screenshotHideApp: true, panicAccelerator: '',
      defaultLanIp: '', workspaceDir: '', browserTrustScriptCommands: false, appGuide: true,
    },
    loaded: true,
    load: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    applyPalette: vi.fn(), applySkin: vi.fn(), applyDarkMode: vi.fn(), applyLiteMode: vi.fn(),
    THEMES: {},
  };
  const platform = {
    platforms: [], models: [], apiKeys: [], loading: false,
    platformsLoaded: true, modelsLoaded: true,
    loadPlatforms: vi.fn(async () => {}), loadModels: vi.fn(async () => {}),
  };
  const pool = {
    globalPools: { llm: [], vision: [], image: [], video: [] },
    platformPools: {}, agentPlatformPools: {}, effectivePools: {},
    loaded: true, allModels: [], modelsLoaded: true,
    load: vi.fn(async () => {}), ensureModels: vi.fn(async () => {}),
    saveGlobal: vi.fn(async () => null), savePlatform: vi.fn(async () => null),
    loadPlatform: vi.fn(async () => ({ llm: [], vision: [], image: [], video: [] })),
    platformPoolOf: () => ({ llm: [], vision: [], image: [], video: [] }),
  };
  return { useSettingsStore: () => settings, usePlatformStore: () => platform, useModelPoolStore: () => pool };
});

vi.mock('../stores/plugin', () => ({
  usePluginStore: () => ({ plugins: [], loaded: true, layouts: [], themes: [], settingsTabs: [] }),
}));

vi.mock('../stores/tools', () => ({
  useToolsStore: () => ({
    builtinTools: [], customTools: [], remoteSources: [], remoteItems: [], loading: false,
    marketplaceEnabled: false, marketplaceAuth: { authType: 'none', token: '' }, marketplacePort: 3001,
    loadMarketplaceConfig: vi.fn(async () => {}), setMarketplaceConfig: vi.fn(async () => ({})),
  }),
}));

vi.mock('../stores/verification', () => ({
  useVerificationStore: () => ({
    latest: null, list: [], pairToken: '', loading: false,
    startPolling: vi.fn(), stopPolling: vi.fn(),
    refresh: vi.fn(async () => {}), resetPairToken: vi.fn(async () => ({})), clear: vi.fn(async () => {}),
  }),
}));

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => ({ data: { ips: [], port: 3001 } })) },
  API_BASE: '', isCapacitor: false,
  getMobileApiBase: () => '', setMobileApiBase: () => {},
}));

// useMobileShell 与 smsAdapter 都要 getPlatformAdapter；node 环境给个非移动端底座
vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => ({ platform: 'web', smsForward: undefined }),
}));

let Settings: any;
let app: App | null = null;

// jsdom 没有 matchMedia（useIsMobile 在模块加载时就调）—— 补最小桩，宽视口 = 非移动外壳
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(async () => {
  Settings = (await import('./Settings.vue')).default;
});

/** 挂载真组件；paneRef 为 ref 时支持挂载后改 prop（模拟左导航切换） */
async function mount(pane: string | { value: string }): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({
    render: () => h(Settings, { embedded: true, pane: typeof pane === 'string' ? pane : pane.value }),
  });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(host);
  await nextTick(); await nextTick();
  return host;
}

/** 数据分区独有文案 / 通用分区独有文案 */
const DATA_MARK = '导出全部数据';
const GENERAL_MARK = '低内存模式';

/**
 * 找到承载某文案的 el-tab-pane，并判断它是否**可见**。
 * 为什么要按可见性而不是 textContent：el-tab-pane 是 lazy 的 —— 一旦渲染过就常驻 DOM，
 * 切走只是 v-show 隐藏（display:none），textContent 永远含着旧分区文案
 * （第一版用例就栽在这：切到 data 后 general 文案仍在 DOM 里，误判"没切换"）。
 */
function paneOf(host: HTMLElement, mark: string): HTMLElement | undefined {
  return [...host.querySelectorAll('.el-tab-pane')].find(
    (p) => (p.textContent || '').includes(mark),
  ) as HTMLElement | undefined;
}
const isVisible = (el: HTMLElement | undefined) =>
  !!el && !el.style.display.includes('none') && el.getAttribute('aria-hidden') !== 'true';

describe('设置弹窗 pane 直取 · 挂载即同步（修「数据菜单串到通用」）', () => {
  it('★★★ 全新挂载 pane=data：数据分区可见，通用分区不可见', async () => {
    const host = await mount('data');
    const dataPane = paneOf(host, DATA_MARK);
    expect(dataPane, '数据分区未渲染').toBeTruthy();
    expect(isVisible(dataPane), '★ 挂载时 pane=data 但通用分区处于可见状态 —— watch 缺 immediate，tab 停留初值 general（用户实报：左导航高亮「数据」、内容串到通用）')
      .toBe(true);
    const generalPane = paneOf(host, GENERAL_MARK);
    expect(isVisible(generalPane), '★ 通用分区竟可见 —— 与上一行矛盾，说明挂载同步仍坏').toBe(false);
    app!.unmount();
  });

  it('★ 对照：全新挂载 pane=general 渲染通用分区（证明挂载链路本身没问题）', async () => {
    const host = await mount('general');
    expect(isVisible(paneOf(host, GENERAL_MARK))).toBe(true);
    expect(isVisible(paneOf(host, DATA_MARK))).toBe(false);
    app!.unmount();
  });

  it('★ prop 变化通道仍在：general → data 跟随切换（immediate 不能把原 watch 通道改坏）', async () => {
    const pane = ref('general');
    const host = await mount(pane);
    expect(isVisible(paneOf(host, GENERAL_MARK))).toBe(true);

    pane.value = 'data';
    await nextTick(); await nextTick();
    expect(isVisible(paneOf(host, DATA_MARK)), 'prop 变化后数据分区应可见').toBe(true);
    expect(isVisible(paneOf(host, GENERAL_MARK)), 'prop 变化后通用分区应被隐藏').toBe(false);
    app!.unmount();
  });
});
