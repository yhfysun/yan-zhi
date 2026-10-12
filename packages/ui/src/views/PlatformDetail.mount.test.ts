// @vitest-environment jsdom
/**
 * PlatformDetail（模型管理弹窗）**真挂载**测试 —— 搜索 / 分类筛选端到端验证
 *
 * ★ 为什么还要这一层（前面已有两层）：
 *   ① utils/modelFilter.test.ts       → 过滤**语义**对不对（真跑，但不碰 UI）
 *   ② manageListSearchWiring.test.ts  → 接线**在不在**（读源码静态断言）
 *   两者加起来仍有一条缝：**UI 是否真的把过滤结果画出来**。
 *   用户实报的正是"页面难用"，所以这里把组件真挂进 jsdom、
 *   真敲关键字、真数卡片 DOM —— 证明「输入 → 过滤 → 渲染」整条链通。
 *
 * 依赖只 mock 掉数据源（pinia store）与路由（组件用不到跳转），
 * Element Plus / SearchToolbar / FormDialog 一律走**真组件**。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

/** 假数据：刻意混入不同类型、大小写、空别名，贴近真实库 */
const PLATFORM = { id: 'p1', name: '百炼大模型', apiUrl: 'https://dashscope.aliyuncs.com', protocol: 'openai', status: 'healthy' };
const MODELS = [
  { id: 'm1', platformId: 'p1', modelId: 'qwen3.8-omni-flash-realtime', alias: '通义实时语音', type: 'llm', description: '实时语音对话', enabled: true, contextWindow: 1048576 },
  { id: 'm2', platformId: 'p1', modelId: 'deepseek-v4.1-flash', alias: 'DeepSeek', type: 'llm', description: '通用对话', enabled: true, contextWindow: null },
  { id: 'm3', platformId: 'p1', modelId: 'text-embedding-v3', alias: '向量', type: 'embedding', description: '文本向量化', enabled: true, contextWindow: 8192 },
  { id: 'm4', platformId: 'p1', modelId: 'cosyvoice-v2', alias: 'CosyVoice', type: 'tts', description: '语音合成', enabled: true, contextWindow: 4096 },
];

// 只 mock 数据源：组件其余依赖全部用真实现
vi.mock('../stores', () => {
  const store = {
    platforms: [PLATFORM],
    models: MODELS,
    apiKeys: [],
    loading: false,
    loadPlatforms: vi.fn(async () => {}),
    loadModels: vi.fn(async () => {}),
    updateModel: vi.fn(async () => {}),
    updatePlatform: vi.fn(async () => {}),
    deleteModel: vi.fn(async () => {}),
    addModel: vi.fn(async () => {}),
    testModel: vi.fn(),
    testModelCapability: vi.fn(),
    fetchRemoteModels: vi.fn(async () => []),
  };
  return { usePlatformStore: () => store };
});

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { platformId: 'p1' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

let PlatformDetail: any;
let app: App | null = null;

beforeAll(async () => {
  PlatformDetail = (await import('./PlatformDetail.vue')).default;
});

/** 挂载组件到真实 DOM，返回容器（每个用例独立挂载，避免互相污染） */
async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(PlatformDetail, { platformId: 'p1', embedded: true });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.mount(host);
  await nextTick();
  await nextTick();
  return host;
}

/** 数**模型卡片**（排除末尾那张"添加模型"虚线卡，它是 .add-card） */
function cards(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll('.model-card:not(.add-card)')] as HTMLElement[];
}
function cardNames(host: HTMLElement): string[] {
  return cards(host).map((c) => c.querySelector('.model-card-name')?.textContent?.trim() || '');
}
/** 真实输入：改 value 并派发 input 事件（Vue 靠它同步 v-model） */
async function type(host: HTMLElement, text: string) {
  const input = host.querySelector('.st-input') as HTMLInputElement;
  expect(input, '搜索框必须真渲染出来').toBeTruthy();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  await nextTick();
}

describe('PlatformDetail 真挂载 · 搜索条真的画出来了', () => {
  it('搜索框 + 类型下拉 + 计数都渲染', async () => {
    const host = await mount();
    expect(host.querySelector('.st-input')).toBeTruthy();
    expect(host.querySelector('.model-filter-type')).toBeTruthy();
    // 全量时 4 张卡（外加 add-card）
    expect(cards(host)).toHaveLength(4);
  });
});

describe('PlatformDetail 真挂载 · 输入关键字 → 卡片真的被筛掉', () => {
  it('按 modelId 搜：只剩 1 张卡', async () => {
    const host = await mount();
    await type(host, 'deepseek');
    expect(cardNames(host)).toEqual(['DeepSeek']);
  });

  it('按别名（中文）搜也命中', async () => {
    const host = await mount();
    await type(host, '向量');
    expect(cardNames(host)).toEqual(['向量']);
  });

  it('按描述搜也命中', async () => {
    const host = await mount();
    await type(host, '语音合成');
    expect(cardNames(host)).toEqual(['CosyVoice']);
  });

  it('大小写不敏感', async () => {
    const host = await mount();
    await type(host, 'COSYVOICE');
    expect(cardNames(host)).toEqual(['CosyVoice']);
  });

  it('搜不到时卡片清空并显示空态（不是留一片空白）', async () => {
    const host = await mount();
    await type(host, '不存在的模型zzz');
    expect(cards(host)).toHaveLength(0);
    expect(host.textContent).toContain('没有匹配的模型');
  });

  it('清空关键字后恢复全量', async () => {
    const host = await mount();
    await type(host, 'deepseek');
    expect(cards(host)).toHaveLength(1);
    await type(host, '');
    expect(cards(host)).toHaveLength(4);
  });
});

describe('PlatformDetail 真挂载 · 类型筛选真的生效', () => {
  it('类型下拉只列本平台真实出现的类型', async () => {
    const host = await mount();
    // 打开下拉，读选项文本
    const trigger = host.querySelector('.model-filter-type') as HTMLElement;
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await nextTick();
    const opts = [...document.querySelectorAll('.el-select-dropdown__item')].map((o) => o.textContent?.trim());
    expect(opts).toContain('Embedding');
    expect(opts).toContain('语音合成(TTS)');
    // 不该出现平台里没有的类型
    expect(opts).not.toContain('图片生成');
  });
});

describe('PlatformDetail 真挂载 · 卸干净（不给下一个用例留 DOM）', () => {
  it('组件卸载后宿主清空', async () => {
    const host = await mount();
    app?.unmount();
    app = null;
    expect(host.innerHTML).toBe('');
  });
});