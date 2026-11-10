// @vitest-environment jsdom
// 共享服务 pane 挂载守门（2026-11-08）：导出壳安装包 / multi 开关的 UI 入口。
//
// 为什么真挂载：pane 的可见性取决于「window.electronAPI.hasLocalBackend」（运行形态标记，
// 主进程经 additionalArguments 下发、preload 解析），且首启信息加载挂在 tab watch 的
// immediate 回调里 —— 静态断言证明不了「挂载即拉取 info」这条链路（paneSync 同款教训）。
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

// ── 白名单 mock（与 Settings.paneSync.mount.test.ts 同一批，主链路加导出必须同步） ──
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
    load: vi.fn(async () => {}), save: vi.fn(async () => {}), update: vi.fn(async () => {}),
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
  const cost = {
    budget: null, usageByConv: {}, noticesByConv: {}, usageLoading: {},
    loadBudget: vi.fn(async () => {}), saveBudget: vi.fn(async () => true),
    loadUsage: vi.fn(async () => {}),
    usageOf: () => ({ costCny: 0, unpricedCalls: 0, byModel: [], bySource: [], recent: [], limitCny: 5 }),
    costOf: () => 0, applyCostEvent: vi.fn(), applyNoticeEvent: vi.fn(),
    dismissNotice: vi.fn(), activeNotice: () => null, resetNoticeView: vi.fn(),
  };
  return {
    useSettingsStore: () => settings, usePlatformStore: () => platform, useModelPoolStore: () => pool,
    useCostStore: () => cost,
  };
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
vi.mock('../stores/pet', () => ({
  usePetStore: () => ({
    settings: {
      enabled: false, renderer: '2d', pack: '', scale: 1, walk: true, bubble: true,
      notifyMode: 'toast', vrmMode: 'builtin', vrmBuiltin: '', vrmPath: '', slots: [],
    },
    init: vi.fn(), update: vi.fn(),
  }),
  PET_SLOT_DEFS: { chat: '对话', tasks: '任务', browser: '浏览器', clip: '剪辑', settings: '设置' },
  PET_SLOT_DEFAULTS: ['chat', 'tasks', 'browser', 'clip', 'settings'],
  setPetSlot: (slots: string[], i: number, key: string) => slots.map((s, j) => (j === i ? key : s)),
}));
vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => ({ data: { ips: [], port: 3001 } })) },
  API_BASE: '', isCapacitor: false, isElectron: false,
  getMobileApiBase: () => '', setMobileApiBase: () => {},
  getBakedServerBase: () => '', getEffectiveServerBase: () => '',
  getServerBase: () => '', setServerBase: () => '',
}));
vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => ({ platform: 'web', smsForward: undefined }),
}));

let Settings: any;
let app: App | null = null;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(async () => {
  Settings = (await import('./Settings.vue')).default;
}, 60_000);

afterEach(() => {
  delete (window as any).electronAPI;
  app?.unmount();
  app = null;
});

async function mount(pane: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(Settings, { embedded: true, pane }) });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.use(createPinia());
  app.mount(host);
  await nextTick(); await nextTick();
  return host;
}

const SHARED_MARK = '共享服务模式';
function paneOf(host: HTMLElement, mark: string): HTMLElement | undefined {
  return [...host.querySelectorAll('.el-tab-pane')].find((p) => (p.textContent || '').includes(mark)) as HTMLElement | undefined;
}
const isVisible = (el: HTMLElement | undefined) =>
  !!el && !el.style.display.includes('none') && el.getAttribute('aria-hidden') !== 'true';

describe('共享服务 pane（导出壳安装包 / multi 开关）', () => {
  it('★★★ 完整版（hasLocalBackend）：pane 可见，挂载即拉取 info（authMode/地址烘焙草稿）', async () => {
    const infoSpy = vi.fn(async () => ({
      ok: true, authMode: 'guest', isPackaged: true, version: '1.0.0', apiPort: 3001,
      lanIps: [{ name: '以太网', address: '192.168.1.50' }],
    }));
    (window as any).electronAPI = {
      hasLocalBackend: true, isShellMode: false,
      sharedServer: {
        info: infoSpy,
        firewallStatus: vi.fn(async () => ({ ok: true, exists: true })),
      },
    };
    const host = await mount('shared');
    expect(isVisible(paneOf(host, SHARED_MARK)), '完整版下共享服务 pane 应可见').toBe(true);
    expect(infoSpy).toHaveBeenCalled();
    // info 拉回后地址草稿自动填默认值（内网 IP + 端口）。
    // ★ el-input 的值是 DOM property 不是 attribute —— innerHTML 里看不到，必须查 .value
    await nextTick();
    const input = host.querySelector<HTMLInputElement>('.shared-row input.el-input__inner');
    expect(input?.value, '地址草稿应自动填内网 IP + 端口').toBe('http://192.168.1.50:3001');
    expect(host.innerHTML).toContain('端口 3001');
    (app as any)?.unmount();
  });

  it('★ 轻量壳（isShellMode）：pane 不渲染（壳自己不能当共享主机）', async () => {
    (window as any).electronAPI = { hasLocalBackend: false, isShellMode: true };
    const host = await mount('shared');
    expect(paneOf(host, SHARED_MARK), '壳模式下不应渲染共享服务 pane').toBeUndefined();
  });

  it('★ 非 Electron（Web/移动端）：pane 不渲染', async () => {
    const host = await mount('shared');
    expect(paneOf(host, SHARED_MARK)).toBeUndefined();
  });
});
