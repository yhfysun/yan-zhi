// @vitest-environment jsdom
/**
 * Models（模型平台管理）· 平台模型计数 **真挂载**回归测试
 *
 * 背景（用户实报 2026-10-15）：
 *   点某平台「管理模型」看到模型列表后，**其他平台的「N 个模型」全部变成 0**。
 *   根因：modelCount() 原来读 platformStore.models 共享缓存，而 PlatformDetail
 *   onMounted 会 `store.loadModels(pid)` 把该缓存**整体替换**成单平台清单
 *   （与候选池下拉曾静默变空同根因，见 stores/model-pool.ts 文件头注释）。
 *
 * ★ 本测试回答的问题（三层里的第三层：UI 是否真的把计数画对）：
 *   ① 计数来自独立的 /platforms/all-models 全量清单，**不是**共享缓存；
 *   ② 共享缓存真的被单平台加载污染后（真实链路复现：点「管理模型」→
 *      PlatformDetail 挂载 → loadModels(pid)），各平台计数**不能**跟着变；
 *   ③ 首屏不等任何「别人先拉过全量」——本页自己拉（旧代码首屏恒 0）。
 *
 * 依赖只 mock 掉数据源（api client / pinia store / 后端就绪等待）与两个重子组件
 * （PlatformDetail / LocalModelMarket 用 stub），Element Plus / FormDialog /
 * SearchToolbar / StatusActionBar 一律走真组件。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { h } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 假数据：三个平台，模型数 2 / 0 / 1（贴近截图里的百炼 262 / 本地 0 / ag 0） */
const hm = vi.hoisted(() => {
  const platforms = [
    { id: 'p1', name: '四维大模型', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode', protocol: 'openai', status: 'healthy', llmEnabled: true },
    { id: 'p2', name: '本地模型', apiUrl: 'http://127.0.0.1:11434', protocol: 'openai', status: 'unknown', llmEnabled: true },
    { id: 'p3', name: 'ag', apiUrl: 'https://api.alphax.agi-ok', protocol: 'openai', status: 'healthy', llmEnabled: true },
  ];
  const allRows = [
    { id: 'm1', platform_id: 'p1', model_id: 'qwen-max', alias: null, type: 'llm', context_window: 32768, enabled: 1, is_default: 1 },
    { id: 'm2', platform_id: 'p1', model_id: 'qwen-turbo', alias: null, type: 'llm', context_window: 32768, enabled: 1, is_default: 0 },
    { id: 'm3', platform_id: 'p3', model_id: 'gpt-4o-mini', alias: null, type: 'llm', context_window: 128000, enabled: 1, is_default: 0 },
  ];
  const state = {
    /** 共享缓存（platformStore.models 的替身）：被 loadModels(pid) 整体替换的那一份 */
    models: [] as any[],
    allModelsGets: 0,
  };
  const store = {
    platforms,
    apiKeys: [],
    loading: false,
    platformsLoaded: true,
    modelsLoaded: true,
    get models() { return state.models; },
    loadPlatforms: vi.fn(async () => {}),
    // ★ 复现真实污染链：loadModels(pid) 把共享缓存整体替换成**单平台**清单
    loadModels: vi.fn(async (pid?: string) => {
      state.models = pid
        ? allRows.filter((r) => r.platform_id === pid).map((r) => ({ ...r, platformId: r.platform_id }))
        : allRows.map((r) => ({ ...r, platformId: r.platform_id }));
    }),
    testConnectivity: vi.fn(async () => ({ ok: true, msg: '连通正常' })),
    testPlatformConfig: vi.fn(async () => ({ ok: true, msg: '连通正常' })),
    fetchModelsPreview: vi.fn(async () => ({ ok: true, models: [] as { id: string }[], msg: '共 0 个' })),
    updatePlatform: vi.fn(async () => {}),
    addApiKey: vi.fn(async () => {}),
    addPlatform: vi.fn(async () => 'p_new'),
    addModel: vi.fn(async () => 'm_new'),
    deletePlatform: vi.fn(async () => {}),
    loadApiKeys: vi.fn(async () => {}),
    resetApiKeyFailCount: vi.fn(async () => {}),
    updateApiKey: vi.fn(async () => {}),
    deleteApiKey: vi.fn(async () => {}),
    testApiKey: vi.fn(async () => ({ ok: true, message: 'Key 有效' })),
  };
  return { platforms, allRows, state, store };
});

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async (p: string) => {
      if (p === '/platforms/all-models') {
        hm.state.allModelsGets++;
        return { data: hm.allRows };
      }
      return { data: [] };
    }),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('../api/backend-ready', () => ({ waitForBackend: vi.fn(async () => {}) }));

vi.mock('../stores', () => ({ usePlatformStore: () => hm.store }));

/** PlatformDetail stub：进挂载就按真实口径 loadModels(pid) —— 共享缓存被整体替换。
 *  ⚠️ 必须**同步** setup：async setup 在 jsdom 里首帧只渲染占位注释，断言不到 DOM。 */
vi.mock('./PlatformDetail.vue', () => ({
  default: {
    name: 'PlatformDetailStub',
    props: { platformId: { type: String, default: '' }, embedded: { type: Boolean, default: false } },
    setup(props: { platformId: string }) {
      hm.store.loadModels(props.platformId);
      return () => h('div', { class: 'platform-detail-stub' }, `stub:${props.platformId}`);
    },
  },
}));

vi.mock('../components/LocalModelMarket.vue', () => ({
  default: { name: 'LocalModelMarketStub', setup: () => () => h('div', { class: 'local-market-stub' }) },
}));

let Models: any;
let app: App | null = null;

beforeAll(async () => {
  Models = (await import('./Models.vue')).default;
});

/** 挂载组件到真实 DOM（onMounted 是 async：等后端 + 两个请求，多给几个 tick） */
async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(Models);
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
  return host;
}

/** 各平台卡的 meta 行文本（去空白后形如「协议：openai·2个模型」） */
function cardMetas(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.platform-card .platform-meta')]
    .map((el) => (el.textContent || '').replace(/\s+/g, ''));
}

describe('Models 真挂载 · 平台模型计数来自独立全量清单', () => {
  it('首屏三平台分别显示 2 / 0 / 1 个模型（本页自己拉 /platforms/all-models）', async () => {
    const host = await mount();
    expect(hm.state.allModelsGets).toBeGreaterThan(0);
    const metas = cardMetas(host);
    expect(metas).toHaveLength(3);
    expect(metas[0]).toContain('2个模型'); // p1 四维大模型
    expect(metas[1]).toContain('0个模型'); // p2 本地模型（库里确实没有）
    expect(metas[2]).toContain('1个模型'); // p3 ag
  });

  it('★ 回归：点「管理模型」→ 共享缓存被单平台清单整体替换，其他平台计数不变 0', async () => {
    const host = await mount();
    const before = cardMetas(host);

    // 真实用户路径：点第一张卡的「管理模型」→ el-dialog 挂载 PlatformDetail
    const firstCard = host.querySelectorAll('.platform-card')[0];
    const btn = [...firstCard.querySelectorAll('button')].find((b) => (b.textContent || '').includes('管理模型'));
    expect(btn, '管理模型按钮必须渲染出来').toBeTruthy();
    btn!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    // ① 守门：污染链真的发生了（stub 挂载 + 共享缓存被换成 p1 单平台清单）
    expect(document.querySelector('.platform-detail-stub'), '管理模型弹窗应挂载 PlatformDetail').toBeTruthy();
    expect(hm.store.loadModels).toHaveBeenCalledWith('p1');
    expect(hm.state.models).toHaveLength(2);
    expect(hm.state.models.every((m: any) => m.platformId === 'p1')).toBe(true);

    // ② 断言「生效」：卡片计数一个都没变（旧代码此刻 p2/p3 会翻成 0）
    expect(cardMetas(host)).toEqual(before);
    expect(cardMetas(host)[1]).toContain('0个模型'); // p2 本来就是 0
    expect(cardMetas(host)[2]).toContain('1个模型'); // p3 不能跟着变 0
  });
});

describe('Models · 计数接线守门（静态断言：只做一半 = 筛选/计数静默失效）', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  /** 剥注释，避免注释里的字样被当成真代码 */
  function code(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  }
  const SRC = code(readFileSync(path.resolve(here, './Models.vue'), 'utf8'));

  it('modelCount 读 modelCounts，不再读 platformStore.models 共享缓存', () => {
    expect(SRC).toMatch(/function modelCount\(platformId: string\) \{\s*return modelCounts\.value\[platformId\]/);
    expect(SRC).not.toMatch(/store\.models/);
  });

  it('计数清单来自 /platforms/all-models（跨实体视图自带独立清单）', () => {
    expect(SRC).toContain("'/platforms/all-models'");
  });

  it('管理模型弹窗关闭后重拉计数（@closed 已接线）', () => {
    expect(SRC).toMatch(/@closed="refreshModelCounts"/);
  });

  it('新增/编辑平台保存后重拉计数', () => {
    expect(SRC).toMatch(/await refreshModelCounts\(\);\s*\n\s*showAdd\.value = false/);
  });

  it('删除平台后重拉计数', () => {
    expect(SRC).toMatch(/await store\.deletePlatform\(id\);\s*\n\s*await refreshModelCounts\(\)/);
  });

  it('本地模型商城关闭后也重拉计数', () => {
    expect(SRC).toMatch(/watch\(showLocalMarket/);
  });
});
