// web_search 后端集合 —— 提供三种实现 + 自动降级链。
//
// 设计原则：内置工具不应硬依赖宿主环境。优先 Playwright（项目已有，复用浏览器基础设施），
// 探测失败时降级到 DuckDuckGo（纯 fetch，零依赖），DuckDuckGo 也失败时降级到用户配置的
// 外部 endpoint（如 Bing/Serper/Tavily/自建）。三者都不可用才抛清晰错误。
//
// 注：PlaywrightSearchBackend.search() 解析百度/必应的搜索结果列表 DOM，返回真正的多条
// {title,url,snippet}（不是「整页清洗文本塞一个结果」）。解析失败时回退到旧的整页文本行为
// 保持向后兼容，避免完全空白。
import { FetchSearchBackend, DuckDuckGoSearchBackend, type SearchBackend, type SearchResult, type SearchSummarizer } from '@yan-zhi/core';

// Re-export 给 server 测试用（避免测试里 import @yan-zhi/core 后 instanceof 比对失败）
export { FetchSearchBackend, DuckDuckGoSearchBackend };
export type { SearchBackend, SearchResult };

/**
 * 引擎配置：URL 构造 + DOM 选择器（标题 / 链接 / snippet）
 * - bing：`li.b_algo > h2 > a` + `p.b_lineclamp4`
 * - baidu：`div.result h2 > a` / `h2.c-title a` + `span.c-content` / `div.c-abstract`
 *   百度 class 历史上多次改名（`.result` / `.result-op` / `.c-container`），用"任一匹配"策略
 *   兜底各类改版。
 */
type EngineConfig = {
  url: (query: string) => string;
  /** 选择每条结果的容器（多个选择器任一命中即视为一条结果） */
  itemSelectors: string[];
  /** 从结果容器内抽取 title / url / snippet（用 page.evaluate 在浏览器内执行） */
  extract: string;
};

const ENGINES: Record<string, EngineConfig> = {
  bing: {
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    itemSelectors: ['li.b_algo', 'li.b_algo.b_algoBorderFixed'],
    extract: `(item) => {
      const a = item.querySelector('h2 > a') || item.querySelector('a');
      const p = item.querySelector('p.b_lineclamp4') || item.querySelector('p.b_caption') || item.querySelector('.b_caption p');
      return {
        title: a ? a.textContent.trim() : '',
        url: a ? a.href : '',
        snippet: p ? p.textContent.trim() : '',
      };
    }`,
  },
  baidu: {
    url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    // 旧版 .result、新版 .c-container、中间版 .result-op 都尝试
    itemSelectors: ['div.result', 'div.c-container', 'div.result-op'],
    extract: `(item) => {
      const a = item.querySelector('h2.c-title a') || item.querySelector('h2 a') || item.querySelector('h3 a') || item.querySelector('a');
      const s = item.querySelector('span.c-content') || item.querySelector('div.c-abstract') || item.querySelector('.c-abstract') || item.querySelector('.content-right_8Zs40');
      return {
        title: a ? a.textContent.trim() : '',
        url: a ? a.href : '',
        snippet: s ? s.textContent.trim() : '',
      };
    }`,
  },
};

// ===== Playwright 浏览器实例（与其它内置工具共享） =====
let _pw: any = null;
async function loadPlaywright() {
  if (_pw) return _pw;
  try {
    _pw = await import('playwright');
    return _pw;
  } catch {
    throw new Error('playwright 未安装，请执行 `pnpm add -w playwright -F @yan-zhi/server` 然后 `npx playwright install chromium`');
  }
}

// 缓存单个浏览器 + 页面实例（与 browser.ts 相同策略，避免每次搜索重复启动）
let _browser: any = null;
let _page: any = null;
async function getPage() {
  const { chromium } = await loadPlaywright();
  if (_browser && _browser.isConnected?.()) {
    if (!_page || _page.isClosed?.()) {
      const context = await _browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        locale: 'zh-CN',
      });
      _page = await context.newPage();
    }
    return _page;
  }
  _browser = await chromium.launch({ headless: true });
  const context = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'zh-CN',
  });
  _page = await context.newPage();
  return _page;
}

/**
 * 通用 HTML 标签清洗（保留文本与换行结构）
 */
function stripTags(raw: string): string {
  return raw
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Playwright 搜索后端：抓搜索引擎结果列表，解析为多条 {title,url,snippet}。
 * 解析失败（页面改版 / 被拦截 / 零结果）时回退为「整页清洗文本」作为单条结果，保持向后兼容。
 */
export class PlaywrightSearchBackend implements SearchBackend {
  constructor(private engine: 'bing' | 'baidu' = 'bing', private maxResults = 10, private maxTextChars = 20000) {}

  async search(query: string): Promise<SearchResult[]> {
    const cfg = ENGINES[this.engine] || ENGINES.bing;
    const page = await getPage().catch(() => null);
    if (!page) {
      throw new Error('PlaywrightSearchBackend: 浏览器后端不可用（playwright/chromium 未就绪）');
    }
    const url = cfg.url(query);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    // 多等片刻让搜索结果显示
    await page.waitForTimeout(1200).catch(() => {});

    // 第一优先：解析搜索结果列表（真正的多条结果）
    try {
      const selectorList = cfg.itemSelectors.join(',');
      const parsed: Array<{ title: string; url: string; snippet: string }> = await page.evaluate(
        ({ sels, fnStr }: { sels: string; fnStr: string }) => {
          // eslint-disable-next-line no-eval
          const fn = eval('(' + fnStr + ')');
          const out: Array<{ title: string; url: string; snippet: string }> = [];
          const items = document.querySelectorAll(sels);
          for (let i = 0; i < items.length; i++) {
            const r = fn(items[i]);
            if (r && r.title && r.url) {
              out.push({
                title: String(r.title).slice(0, 300),
                url: String(r.url).slice(0, 2048),
                snippet: String(r.snippet || '').slice(0, 600),
              });
            }
          }
          return out;
        },
        { sels: selectorList, fnStr: cfg.extract },
      ).catch(() => []);

      if (parsed && parsed.length > 0) {
        return parsed.slice(0, this.maxResults);
      }
    } catch {
      // 解析失败时回退到「整页文本」分支
    }

    // 回退：把整页清洗文本作为单条结果（保持向后兼容；至少给 LLM 一个能看的内容）
    const raw = await page.content().catch(() => '');
    const title = (await page.title().catch(() => '')) || query;
    const text = stripTags(raw).slice(0, this.maxTextChars);
    return [
      {
        title,
        url,
        snippet: text || '（搜索结果页未返回内容，可能被搜索引擎拦截或网络不可达）',
      },
    ];
  }
}

// ===== 探测 & 降级链 =====

/** 探测 Playwright 是否可用（不抛错，try/catch 后返回 boolean） */
async function probePlaywright(): Promise<boolean> {
  try {
    await loadPlaywright();
    // 再探一步：能否真的启动 chromium（避免 import 成功但二进制缺失）
    const { chromium } = await loadPlaywright();
    try {
      const b = await chromium.launch({ headless: true });
      await b.close().catch(() => {});
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/** 探测 DuckDuckGo 是否可用（HEAD 请求检查网络可达性 + 拦截） */
async function probeDuckDuckGo(): Promise<boolean> {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=test', {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || (res.status >= 200 && res.status < 400);
  } catch {
    return false;
  }
}

/**
 * 降级链 SearchBackend：依次尝试 primary → fallbacks，任一成功即用，全部失败抛聚合错误。
 * 避免「Playwright 没装就硬抛 chromium 错误」——自动切到 DuckDuckGo/外网 API。
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
        `  1. 在 server 端安装 playwright + chromium：pnpm add -w playwright -F @yan-zhi/server && npx playwright install chromium\n` +
        `  2. 或配置外部搜索 API：YANZHI_SEARCH_ENDPOINT=https://your-search-api?q={query}\n` +
        `  3. 或确认网络可达 html.duckduckgo.com`,
    );
  }
}

/**
 * 解析 web_search 后端（同步版本，保留向后兼容）：
 * - 默认 baidu（国内可达，Playwright 抓取）
 * - duckduckgo → DuckDuckGo HTML 端点（零依赖）
 * - endpoint=<URL> → 外部 API（带占位符 {query}/{maxResults}/{timeRange}）
 *
 * 注意：本函数不再探测实际可用性——若要降级链，请使用 `resolveSearchBackendWithFallback()`。
 */
export function resolveSearchBackend(): SearchBackend {
  const engine = (process.env.YANZHI_SEARCH_ENGINE || '').toLowerCase();
  // engine 显式配置优先；未配时才检查 endpoint
  if (engine === 'bing' || engine === 'baidu') {
    return new PlaywrightSearchBackend(engine as 'bing' | 'baidu');
  }
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
  return new PlaywrightSearchBackend('baidu');
}

/**
 * 异步探测并构造降级链 SearchBackend（推荐）：
 * 1. 用户显式配置的 engine / endpoint（最高优先，按 YANZHI_SEARCH_ENGINE 决定）
 * 2. 否则自动选第一个可用的：Playwright → DuckDuckGo → 外部 endpoint
 *
 * 自动探测在启动时一次完成并缓存（避免每次请求都 HEAD/launch）。
 */
let _probePromise: Promise<void> | null = null;
const _probeCache: { playwright?: boolean; duckduckgo?: boolean } = {};

async function probeAll(): Promise<void> {
  if (_probePromise) return _probePromise;
  _probePromise = (async () => {
    const [pw, ddg] = await Promise.all([probePlaywright(), probeDuckDuckGo()]);
    _probeCache.playwright = pw;
    _probeCache.duckduckgo = ddg;
  })();
  return _probePromise;
}

/** 重置探测缓存（用于测试） */
export function _resetSearchProbeCache(): void {
  _probeCache.playwright = undefined;
  _probeCache.duckduckgo = undefined;
  _probePromise = null;
}

export async function resolveSearchBackendWithFallback(): Promise<SearchBackend> {
  await probeAll();
  const engine = (process.env.YANZHI_SEARCH_ENGINE || '').toLowerCase();
  const endpoint = process.env.YANZHI_SEARCH_ENDPOINT;
  const chain: Array<{ name: string; backend: SearchBackend }> = [];

  // 1) 用户显式配置的最高优先
  if (engine === 'bing' || engine === 'baidu') {
    chain.push({ name: `Playwright(${engine})`, backend: new PlaywrightSearchBackend(engine as 'bing' | 'baidu') });
  } else if (engine === 'duckduckgo') {
    chain.push({ name: 'DuckDuckGo', backend: new DuckDuckGoSearchBackend() });
  } else if (endpoint) {
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

  // 2) 自动降级：探测到的可用后端，按 Playwright > DuckDuckGo > endpoint 顺序补链
  if (_probeCache.playwright) {
    if (!chain.find((c) => c.name.startsWith('Playwright'))) {
      chain.push({ name: 'Playwright(baidu)', backend: new PlaywrightSearchBackend('baidu') });
    }
  }
  if (_probeCache.duckduckgo) {
    if (!chain.find((c) => c.name === 'DuckDuckGo')) {
      chain.push({ name: 'DuckDuckGo', backend: new DuckDuckGoSearchBackend() });
    }
  }
  if (endpoint && !chain.find((c) => c.name.startsWith('ExternalEndpoint'))) {
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

  if (chain.length === 0) {
    // 用户什么都没配置，自动探测又全失败 —— 仍尝试按顺序硬试一次，让上层看到具体错误
    chain.push({ name: 'Playwright(baidu)', backend: new PlaywrightSearchBackend('baidu') });
    chain.push({ name: 'DuckDuckGo', backend: new DuckDuckGoSearchBackend() });
  }

  return new FallbackSearchBackend(chain);
}

/**
 * 单例：异步等待降级链探测完成后返回 backend。
 * 调用方应该 await；getSearchBackend() 同步版本保留向后兼容（直接用用户配置，不探测）。
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

/** 同步单例（保留向后兼容，不探测） */
let _searchBackend: SearchBackend | null = null;
export function getSearchBackend(): SearchBackend {
  if (!_searchBackend) _searchBackend = resolveSearchBackend();
  return _searchBackend;
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