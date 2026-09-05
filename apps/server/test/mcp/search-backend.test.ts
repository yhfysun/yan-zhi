// web_search 降级链 + 引擎选择测试。
// 覆盖 resolveSearchBackend() 同步映射、FallbackSearchBackend 顺序尝试/聚合错误。
//
// 注意：PlaywrightSearchBackend.search() 和 probePlaywright() 依赖真实的 chromium launch，
// 启动成本高且依赖外部网络（DDG HEAD），不在此测。已在 packages/core 测试里覆盖后处理管线。
import { describe, it, expect, afterEach, vi } from 'vitest';

// 必须在 import search-backend 前 mock playwright，避免真的 import 触发 chromium 检测
vi.mock('playwright', () => {
  return {
    chromium: {
      launch: vi.fn(async () => ({
        newContext: async () => ({
          newPage: async () => ({
            content: async () => '',
            title: async () => '',
            goto: async () => {},
            waitForTimeout: async () => {},
            isClosed: () => false,
            evaluate: async () => [],
          }),
        }),
        close: async () => {},
        isConnected: () => false,
      })),
    },
  };
});

// search-backend 通过环境变量决定 backend；保存/恢复避免污染其它测试
const ENV_SNAPSHOT: Record<string, string | undefined> = {
  YANZHI_SEARCH_ENGINE: process.env.YANZHI_SEARCH_ENGINE,
  YANZHI_SEARCH_ENDPOINT: process.env.YANZHI_SEARCH_ENDPOINT,
};
function setEnv(engine: string | undefined, endpoint: string | undefined): void {
  if (engine === undefined) delete process.env.YANZHI_SEARCH_ENGINE;
  else process.env.YANZHI_SEARCH_ENGINE = engine;
  if (endpoint === undefined) delete process.env.YANZHI_SEARCH_ENDPOINT;
  else process.env.YANZHI_SEARCH_ENDPOINT = endpoint;
}
afterEach(() => setEnv(ENV_SNAPSHOT.YANZHI_SEARCH_ENGINE, ENV_SNAPSHOT.YANZHI_SEARCH_ENDPOINT));

async function importBackend() {
  const mod = await import('../../src/mcp/search-backend.js');
  mod._resetSearchProbeCache();
  return mod;
}

describe('resolveSearchBackend() 引擎映射（同步）', () => {
  it('YANZHI_SEARCH_ENGINE=bing → PlaywrightSearchBackend', async () => {
    setEnv('bing', undefined);
    const { resolveSearchBackend, PlaywrightSearchBackend } = await importBackend();
    expect(resolveSearchBackend()).toBeInstanceOf(PlaywrightSearchBackend);
  });

  it('YANZHI_SEARCH_ENGINE=baidu → PlaywrightSearchBackend', async () => {
    setEnv('baidu', undefined);
    const { resolveSearchBackend, PlaywrightSearchBackend } = await importBackend();
    expect(resolveSearchBackend()).toBeInstanceOf(PlaywrightSearchBackend);
  });

  it('YANZHI_SEARCH_ENGINE=duckduckgo → DuckDuckGoSearchBackend', async () => {
    setEnv('duckduckgo', undefined);
    const { resolveSearchBackend, DuckDuckGoSearchBackend } = await importBackend();
    expect(resolveSearchBackend()).toBeInstanceOf(DuckDuckGoSearchBackend);
  });

  it('YANZHI_SEARCH_ENDPOINT 配 endpoint → FetchSearchBackend', async () => {
    setEnv(undefined, 'https://api.example.com/search?q={query}&n={maxResults}');
    const { resolveSearchBackend, FetchSearchBackend } = await importBackend();
    expect(resolveSearchBackend()).toBeInstanceOf(FetchSearchBackend);
  });

  it('默认（未配 env）→ PlaywrightSearchBackend(baidu)', async () => {
    setEnv(undefined, undefined);
    const { resolveSearchBackend, PlaywrightSearchBackend } = await importBackend();
    expect(resolveSearchBackend()).toBeInstanceOf(PlaywrightSearchBackend);
  });

  it('单例：多次调用 getSearchBackend() 返回同一对象', async () => {
    setEnv('baidu', undefined);
    const { getSearchBackend } = await importBackend();
    const a = getSearchBackend();
    const b = getSearchBackend();
    expect(a).toBe(b);
  });
});

describe('pickSummarizerModel()（Layer 3 便宜模型挑选）', () => {
  it('优先挑 model_id/alias 匹配 flash/mini/haiku/lite/free/turbo 的模型', async () => {
    const { pickSummarizerModel } = await importBackend();
    const models = [{ model_id: 'gpt-4' }, { model_id: 'gemini-2.5-flash' }, { model_id: 'o1' }];
    expect(pickSummarizerModel(models)).toBe(1);
  });

  it('alias 匹配也算便宜模型', async () => {
    const { pickSummarizerModel } = await importBackend();
    const models = [{ model_id: 'qwen-max', alias: '旗舰' }, { model_id: 'qwen-turbo', alias: '快速' }];
    expect(pickSummarizerModel(models)).toBe(1);
  });

  it('无便宜模型时回退第一个（idx 0）', async () => {
    const { pickSummarizerModel } = await importBackend();
    expect(pickSummarizerModel([{ model_id: 'gpt-4' }, { model_id: 'o1' }])).toBe(0);
    expect(pickSummarizerModel([])).toBe(0);
  });
});

describe('FallbackSearchBackend 顺序尝试', () => {
  it('第一个 backend 成功 → 直接采用，不调用后续', async () => {
    const { FallbackSearchBackend } = await importBackend();
    const calls: string[] = [];
    const a = { search: vi.fn(async () => { calls.push('a'); return [{ title: 'A', url: 'http://a', snippet: '' }]; }) };
    const b = { search: vi.fn(async () => { calls.push('b'); return []; }) };
    const chain = new FallbackSearchBackend([{ name: 'A', backend: a }, { name: 'B', backend: b }]);
    const out = await chain.search('q', 5);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('A');
    expect(calls).toEqual(['a']);
    expect(b.search).not.toHaveBeenCalled();
  });

  it('第一个 backend 返回空数组 → 继续尝试第二个', async () => {
    const { FallbackSearchBackend } = await importBackend();
    const a = { search: vi.fn(async () => []) };
    const b = { search: vi.fn(async () => [{ title: 'B', url: 'http://b', snippet: 'sb' }]) };
    const chain = new FallbackSearchBackend([{ name: 'A', backend: a }, { name: 'B', backend: b }]);
    const out = await chain.search('q', 5);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('B');
    expect(a.search).toHaveBeenCalled();
    expect(b.search).toHaveBeenCalled();
  });

  it('第一个 backend 抛错 → 继续尝试第二个', async () => {
    const { FallbackSearchBackend } = await importBackend();
    const a = { search: vi.fn(async () => { throw new Error('first failed'); }) };
    const b = { search: vi.fn(async () => [{ title: 'B', url: 'http://b', snippet: '' }]) };
    const chain = new FallbackSearchBackend([{ name: 'A', backend: a }, { name: 'B', backend: b }]);
    const out = await chain.search('q', 5);
    expect(out[0].title).toBe('B');
  });

  it('全部失败 → 抛聚合错误（含每条后端失败原因 + 安装指引）', async () => {
    const { FallbackSearchBackend } = await importBackend();
    const a = { search: vi.fn(async () => { throw new Error('chromium not found'); }) };
    const b = { search: vi.fn(async () => { throw new Error('DDG unreachable'); }) };
    const chain = new FallbackSearchBackend([{ name: 'Playwright', backend: a }, { name: 'DuckDuckGo', backend: b }]);
    await expect(chain.search('q', 5)).rejects.toThrow(
      /全部不可用[\s\S]*chromium not found[\s\S]*DDG unreachable[\s\S]*pnpm add.*playwright/,
    );
  });

  it('timeRange 透传给所有 backend', async () => {
    const { FallbackSearchBackend } = await importBackend();
    const calls: Array<{ q: string; n: number; tr: unknown }> = [];
    // 链里至少两个 backend，确保前一个失败时还会调用下一个
    const a = { search: vi.fn(async () => { calls.push({ q: 'hi', n: 7, tr: 'week', _from: 'a' }); return []; }) };
    const b = { search: vi.fn(async (_q: string, _n: number, tr: unknown) => { calls.push({ q: 'hi', n: 7, tr, _from: 'b' } as any); return [{ title: 'B', url: 'http://b', snippet: '' }]; }) };
    const chain = new FallbackSearchBackend([{ name: 'A', backend: a }, { name: 'B', backend: b }]);
    const out = await chain.search('hi', 7, 'week');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('B');
    expect(calls).toHaveLength(2);
    expect((calls[0] as any).tr).toBe('week');
    expect((calls[1] as any).tr).toBe('week');
  });
});