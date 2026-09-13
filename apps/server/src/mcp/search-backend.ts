// web_search 后端集合 —— 纯 API 实现，不开浏览器（对齐豆包）。
//
// 设计原则：web_search 本来就不应该开浏览器。搜索是 API 调用，不是浏览器自动化。
// 默认 DuckDuckGo（纯 fetch 零依赖）→ Bing API（YANZHI_BING_API_KEY）→ 外部 endpoint（YANZHI_SEARCH_ENDPOINT）。
// 三者都是 HTTP fetch，零浏览器依赖，不会出现 Target.createTarget / chromium 未安装等问题。
//
// PlaywrightSearchBackend 已删除：抓搜索引擎结果页 DOM 是错误路径，反爬/验证码/改版都会崩，
// 且依赖宿主机 chromium 安装。需要 Bing/Baidu 结果请用 Bing API（YANZHI_BING_API_KEY）。
import { FetchSearchBackend, DuckDuckGoSearchBackend, BingApiSearchBackend, type SearchBackend, type SearchResult, type SearchSummarizer } from '@yan-zhi/core';

// Re-export 给 server 测试用（避免测试里 import @yan-zhi/core 后 instanceof 比对失败）
export { FetchSearchBackend, DuckDuckGoSearchBackend, BingApiSearchBackend };
export type { SearchBackend, SearchResult };

// TimeRange 内联定义（避免 core 构建产物未更新导致 import 失败）
type TimeRange = 'day' | 'week' | 'month' | 'year' | 'recent';

/**
 * 降级链 SearchBackend：依次尝试 primary → fallbacks，任一成功即用，全部失败抛聚合错误。
 */
export class FallbackSearchBackend implements SearchBackend {
  constructor(private chain: Array<{ name: string; backend: SearchBackend }>) {}

  async search(query: string, maxResults: number, timeRange?: any): Promise<SearchResult[]> {
    const errors: string[] = [];
    for (const { name, backend } of this.chain) {
      try {
        const results = await backend.search(query, maxResults, timeRange);
        if (results && results.length > 0) return results;
        errors.push(`${name}: 空结果`);
      } catch (e: any) {
        errors.push(`${name}: ${e?.message || String(e)}`);
      }
    }
    throw new Error(
      `web_search 后端全部不可用：\n${errors.map((e) => `  - ${e}`).join('\n')}\n` +
        `建议：\n` +
        `  1. 配置 Bing Search API：YANZHI_BING_API_KEY=<your-key>（https://www.microsoft.com/en-us/bing/apis/bing-web-search-api）\n` +
        `  2. 或配置外部搜索 API：YANZHI_SEARCH_ENDPOINT=https://your-search-api?q={query}\n` +
        `  3. 或确认网络可达 html.duckduckgo.com`,
    );
  }
}

/**
 * 解析 web_search 后端（同步版本，保留向后兼容）：
 * - 默认 DuckDuckGo（纯 fetch 零依赖，不开浏览器）
 * - duckduckgo → DuckDuckGo HTML 端点（零依赖）
 * - endpoint=<URL> → 外部 API（带占位符 {query}/{maxResults}/{timeRange}）
 *
 * 注意：bing/baidu 引擎已移除（PlaywrightSearchBackend 已删）。需要 Bing 结果请用 Bing API。
 */
export function resolveSearchBackend(): SearchBackend {
  const engine = (process.env.YANZHI_SEARCH_ENGINE || '').toLowerCase();
  if (engine === 'duckduckgo') {
    return new DuckDuckGoSearchBackend();
  }
  const endpoint = process.env.YANZHI_SEARCH_ENDPOINT;
  if (endpoint) {
    return new FetchSearchBackend({
      endpoint,
      extractResults: (data: unknown) => (data as { results?: Array<{ title?: string; url?: string; snippet?: string }> })?.results?.map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.snippet || '',
      })) || [],
    });
  }
  // 默认：DuckDuckGo（零依赖纯 fetch，不开浏览器，对齐豆包）
  return new DuckDuckGoSearchBackend();
}

/**
 * 构造降级链 SearchBackend（不探测，运行时 FallbackSearchBackend 依次试错）：
 * - 默认（未配置）：DuckDuckGo → BingApi(若有 key) → ExternalEndpoint(若有)
 * - engine=duckduckgo → DuckDuckGo
 * - engine=bing/baidu/sogou/auto/multi → 已废弃，回退到默认链（Bing API 优先于 DuckDuckGo）
 *
 * web_search 永远不开浏览器。PlaywrightSearchBackend 已删除。
 */
export async function resolveSearchBackendWithFallback(): Promise<SearchBackend> {
  const engine = (process.env.YANZHI_SEARCH_ENGINE || '').toLowerCase();
  const endpoint = process.env.YANZHI_SEARCH_ENDPOINT;
  const bingApiKey = process.env.YANZHI_BING_API_KEY;
  const chain: Array<{ name: string; backend: SearchBackend }> = [];

  // 1) 用户显式配置 duckduckgo
  if (engine === 'duckduckgo') {
    chain.push({ name: 'DuckDuckGo', backend: new DuckDuckGoSearchBackend() });
  }

  // 2) Bing API（零浏览器依赖，对齐豆包搜索 API 路径）
  if (bingApiKey) {
    chain.push({ name: 'BingApi', backend: new BingApiSearchBackend(bingApiKey) });
  }

  // 3) 外部 endpoint
  if (endpoint) {
    chain.push({
      name: `ExternalEndpoint(${endpoint.slice(0, 40)})`,
      backend: new FetchSearchBackend({
        endpoint,
        extractResults: (data: unknown) => (data as { results?: Array<{ title?: string; url?: string; snippet?: string }> })?.results?.map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.snippet || '',
        })) || [],
      }),
    });
  }

  // 4) DuckDuckGo 兜底（若未显式配置且无 Bing API key）
  if (!chain.find((c) => c.name === 'DuckDuckGo')) {
    chain.push({ name: 'DuckDuckGo', backend: new DuckDuckGoSearchBackend() });
  }

  // bing/baidu/sogou/auto/multi 引擎已废弃（PlaywrightSearchBackend 已删），静默回退到 API 链
  if (engine && engine !== 'duckduckgo' && engine !== 'bingapi') {
    console.warn(`[search] YANZHI_SEARCH_ENGINE=${engine} 已废弃（PlaywrightSearchBackend 已删，web_search 不再开浏览器），回退到 API 降级链`);
  }

  return new FallbackSearchBackend(chain);
}

/**
 * 单例：异步等待降级链解析完成后返回 backend。
 */
let _fallbackBackend: SearchBackend | null = null;
let _fallbackPromise: Promise<SearchBackend> | null = null;
export async function getSearchBackendWithFallback(): Promise<SearchBackend> {
  if (_fallbackBackend) return _fallbackBackend;
  if (!_fallbackPromise) {
    _fallbackPromise = resolveSearchBackendWithFallback().then((b) => {
      _fallbackBackend = b;
      return b;
    });
  }
  return _fallbackPromise;
}

/** 同步单例（保留向后兼容） */
let _searchBackend: SearchBackend | null = null;
export function getSearchBackend(): SearchBackend {
  if (!_searchBackend) _searchBackend = resolveSearchBackend();
  return _searchBackend;
}

/**
 * 同步获取降级链 backend：优先返回已异步解析缓存的 fallback backend，
 * 未就绪时回退到 getSearchBackend()（默认 DuckDuckGo，不开浏览器）。
 */
export function getSearchBackendSync(): SearchBackend {
  return _fallbackBackend || getSearchBackend();
}

// ===== Layer 3：LLM 结果总结 =====
// 挑便宜快速模型（flash/mini/haiku/lite/free 优先，否则第一个 llm 模型）做单轮总结。
// 一切失败（无模型/无平台/调用失败）返回 null，web_search 静默退回原始结果列表。
const CHEAP_MODEL_RE = /flash|mini|haiku|lite|free|turbo/i;

/** 抽取为纯函数便于测试：从模型行列表挑出总结用模型 */
export function pickSummarizerModel(models: Array<{ model_id?: string; alias?: string }>): number {
  const idx = models.findIndex((m) => CHEAP_MODEL_RE.test(m.model_id || '') || CHEAP_MODEL_RE.test(m.alias || ''));
  return idx >= 0 ? idx : 0;
}

export function createLlmSummarizer(): SearchSummarizer {
  return async (query, results) => {
    try {
      const [{ db }, { LlmClient }] = await Promise.all([import('../db.js'), import('@yan-zhi/core')]);
      const models = db.prepare("SELECT id, platform_id, model_id, alias FROM model WHERE type = 'llm' OR type IS NULL").all() as any[];
      if (models.length === 0) return null;
      const picked = models[pickSummarizerModel(models)];
      const prow = db.prepare('SELECT * FROM platform WHERE id = ?').get(picked.platform_id) as any;
      if (!prow?.api_url) return null;

      const platform = {
        id: prow.id,
        name: prow.name,
        protocol: prow.protocol || 'openai',
        apiUrl: prow.api_url,
        headers: (() => { try { return JSON.parse(prow.headers_json || '{}'); } catch { return {}; } })(),
      };
      const model = {
        id: picked.id,
        platformId: picked.platform_id,
        modelId: picked.model_id,
        alias: picked.alias,
        type: 'llm',
        contextWindow: 8000,
        capabilities: [],
      };
      const client = new LlmClient(platform as any, model as any);

      const list = results.slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${(r.snippet || '').slice(0, 300)}`)
        .join('\n');
      const messages = [
        { id: 'sys', conversationId: '', role: 'system' as const, content: '你是搜索结果摘要助手。只基于给定结果输出简明中文摘要，不编造结果里没有的信息。', createdAt: 0 },
        {
          id: 'u', conversationId: '', role: 'user' as const, createdAt: 0,
          content: `搜索词：${query}\n\n结果列表：\n${list}\n\n请输出：每条结果用一句话概括内容要点（保持编号）；最后一行以「总体结论：」开头给一句综合判断。`,
        },
      ];
      const out = await client.chat(messages as any, { maxTokens: 500 });
      const text = String(out?.delta?.content || '').trim();
      return text || null;
    } catch {
      return null;
    }
  };
}
