import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** 时间过滤范围（用于提升搜索结果新鲜度，避免返回过期旧数据） */
export type TimeRange = 'day' | 'week' | 'month' | 'year' | 'recent';

export interface SearchBackend {
  search(query: string, maxResults: number, timeRange?: TimeRange): Promise<SearchResult[]>;
}

/** 把外部传入的 timeRange/freshness 规范化为 TimeRange，非法值返回 undefined */
function normalizeTimeRange(raw: unknown): TimeRange | undefined {
  if (raw == null) return undefined;
  const v = String(raw).toLowerCase().trim();
  if (v === 'day' || v === 'week' || v === 'month' || v === 'year' || v === 'recent') return v;
  return undefined;
}

/**
 * 时间过滤兜底：当后端不支持原生时间参数时，在 query 末尾追加时间限定词提升新鲜度。
 * - year → 当前年份（如 2026）
 * - month → 当前年月（如 2026年8月）
 * - week → "最近一周"
 * - day → "最近24小时"
 * - recent → "最新"
 */
function applyTimeRangeFallback(query: string, timeRange?: TimeRange): string {
  if (!timeRange) return query;
  const now = new Date();
  let suffix: string;
  switch (timeRange) {
    case 'year':
      suffix = String(now.getFullYear());
      break;
    case 'month':
      suffix = `${now.getFullYear()}年${now.getMonth() + 1}月`;
      break;
    case 'week':
      suffix = '最近一周';
      break;
    case 'day':
      suffix = '最近24小时';
      break;
    case 'recent':
      suffix = '最新';
      break;
    default:
      return query;
  }
  return `${query} ${suffix}`;
}

export interface FetchSearchConfig {
  /** API endpoint URL. Supports {query} and {maxResults} placeholders. */
  endpoint: string;
  /** Headers to include (e.g. Authorization for paid APIs). */
  headers?: Record<string, string>;
  /** Extract SearchResult[] from the JSON response body. */
  extractResults: (data: unknown) => SearchResult[];
}

export class FetchSearchBackend implements SearchBackend {
  constructor(private config: FetchSearchConfig) {}

  async search(query: string, maxResults: number, timeRange?: TimeRange): Promise<SearchResult[]> {
    // 后端无原生时间参数时，在 query 末尾追加时间限定词兜底
    const finalQuery = applyTimeRangeFallback(query, timeRange);
    const url = this.config.endpoint
      .replace('{query}', encodeURIComponent(finalQuery))
      .replace('{maxResults}', String(maxResults))
      .replace('{timeRange}', timeRange ?? '');

    const res = await fetch(url, { headers: this.config.headers });
    if (!res.ok) {
      throw new Error(`Search API returned HTTP ${res.status}`);
    }
    const data = await res.json();
    return this.config.extractResults(data);
  }
}

/**
 * DuckDuckGo HTML 搜索后端 —— 纯 fetch + 正则解析，零依赖（无需 Playwright/Chromium/API Key）。
 * 抓取 https://html.duckduckgo.com/html/?q=... 结果页，解析 result__a / result__snippet。
 * 前后端共享（放 core 包），作为 web_search 的默认后端。
 */
export class DuckDuckGoSearchBackend implements SearchBackend {
  constructor(private defaultMaxResults = 5) {}

  async search(query: string, maxResults: number, timeRange?: TimeRange): Promise<SearchResult[]> {
    const limit = Math.min(maxResults || this.defaultMaxResults, 10);
    // DuckDuckGo HTML 端点不支持原生时间过滤参数，在 query 末尾追加时间词兜底
    const finalQuery = applyTimeRangeFallback(query, timeRange);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(finalQuery)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) {
      throw new Error(`DuckDuckGo 返回 HTTP ${res.status}`);
    }
    const html = await res.text();
    return this.parse(html, limit);
  }

  private parse(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snipRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [...html.matchAll(linkRe)];
    const snips = [...html.matchAll(snipRe)];
    for (let i = 0; i < links.length && results.length < limit; i++) {
      const rawUrl = links[i][1];
      const title = this.stripTags(links[i][2]).trim();
      const snippet = snips[i] ? this.stripTags(snips[i][1]).trim() : '';
      const resolved = this.resolveDdgUrl(rawUrl);
      if (!resolved || !title) continue;
      results.push({ title, url: resolved, snippet });
    }
    return results;
  }

  private stripTags(s: string): string {
    return s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'");
  }

  private resolveDdgUrl(raw: string): string {
    try {
      const u = raw.startsWith('//') ? 'https:' + raw : raw;
      const parsed = new URL(u);
      const uddg = parsed.searchParams.get('uddg');
      return uddg || u;
    } catch {
      return raw;
    }
  }
}

/**
 * 服务端代理搜索后端（前端用）—— 前端直接 fetch DuckDuckGo 会被 CORS 拦截，
 * 故走服务端 /api/search 代理。仅在有 window 的浏览器环境使用。
 */
export class ServerSearchBackend implements SearchBackend {
  async search(query: string, maxResults: number, timeRange?: TimeRange): Promise<SearchResult[]> {
    let token: string | null = null;
    try { token = localStorage.getItem('auth_token'); } catch { /* 非浏览器环境 */ }
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // query 末尾追加时间词兜底；同时把 timeRange 透传给服务端，服务端可按需转成搜索引擎原生时间参数
    const finalQuery = applyTimeRangeFallback(query, timeRange);
    // Electron 桌面端用 loadFile 加载本地文件，页面 origin 为 file://，相对路径 /api 会解析成
    // file:///api 导致 "Failed to fetch"。此处与 packages/ui/src/api/client.ts 的 API_BASE 保持一致：
    // 检测到 Electron 环境时改用后端绝对地址 http://127.0.0.1:3001/api。
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
    const apiBase = isElectron ? 'http://127.0.0.1:3001/api' : '/api';
    let url = `${apiBase}/search?q=${encodeURIComponent(finalQuery)}&maxResults=${maxResults}`;
    if (timeRange) url += `&timeRange=${encodeURIComponent(timeRange)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // 先尝试读取服务端返回的具体错误原因，避免只报 "HTTP 500" 丢失根因
      let detail = '';
      try { const j = await res.json() as { error?: string }; if (j?.error) detail = String(j.error); } catch { /* body 非 JSON */ }
      throw new Error(`搜索服务返回 HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return (json.data as SearchResult[]) || [];
  }
}

/**
 * LLM 总结器注入点（Layer 3）：core 保持零 LLM 依赖，
 * 由宿主（server/desktop）注入实现（如 cheap 模型单轮调用）。
 * 返回 null 或抛错 = 总结失败，web_search 静默退回原始结果列表。
 */
export type SearchSummarizer = (query: string, results: SearchResult[]) => Promise<string | null>;

export class WebSearchTool implements BuiltInTool {
  name = 'web_search';
  description = 'Search the web for information. Returns a list of results with titles, URLs, and snippets. 支持 timeRange/freshness 时间过滤（day/week/month/year/recent）以优先返回最近的结果；推荐/资讯类查询建议传 timeRange=year 优先返回最近一年结果，避免返回过期旧数据。sites 白名单可限定搜索来源域（如 ["arxiv.org","*.edu.cn"]），同域名默认最多保留 2 条防 SEO spam。summarize=true 时由内置 LLM 对结果生成简明摘要（更慢、消耗 token，默认关闭）。';

  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10).',
      },
      timeRange: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year', 'recent'],
        description: '时间过滤范围：day=最近一天，week=最近一周，month=最近一月，year=最近一年，recent=最新。推荐/资讯类查询建议传 year。',
      },
      freshness: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year', 'recent'],
        description: 'timeRange 的同义别名，兼容性参数，行为与 timeRange 完全一致。',
      },
      sites: {
        type: 'array',
        items: { type: 'string' },
        description: '域名白名单，仅返回匹配这些域名的结果。支持通配符，如 ["arxiv.org", "*.edu.cn"]。空数组 = 不过滤。',
      },
      summarize: {
        type: 'boolean',
        description: '为 true 时由内置 LLM 对结果列表生成摘要（每条 1~2 句 + 总体结论）。更慢且消耗额外 token，默认关闭。',
      },
    },
    required: ['query'],
  };

  private backend: SearchBackend | null = null;
  private summarizer: SearchSummarizer | null = null;

  setBackend(backend: SearchBackend): void {
    this.backend = backend;
  }

  setSummarizer(fn: SearchSummarizer | null): void {
    this.summarizer = fn;
  }

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    if (!this.backend) {
      return {
        content: [{ type: 'text', text: 'Error: no search backend configured. Call webSearchTool.setBackend() first.' }],
        isError: true,
      };
    }

    const query = args.query as string;
    const maxResults = Math.min((args.maxResults as number) || 5, 10);
    // freshness 为 timeRange 的同义别名，两者任一有效即采用
    const timeRange = normalizeTimeRange(args.timeRange ?? args.freshness);
    const sites = Array.isArray(args.sites) ? (args.sites as unknown[]).filter((s): s is string => typeof s === 'string') : [];
    const wantSummary = args.summarize === true;

    if (!query) {
      return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
    }

    try {
      // 多取一些结果，方便 sites/dedupe 后还能凑够 maxResults
      const fetchCount = Math.min((maxResults || 5) * 2, 20);
      let results = await this.backend.search(query, fetchCount, timeRange);

      // 1) sites 白名单过滤（仅在白名单非空时生效）
      if (sites.length > 0) {
        results = results.filter((r) => sites.some((pat) => matchDomain(r.url, pat)));
      }

      // 2) 同域名去重（cap=2 防 SEO spam / 镜像站占位）
      results = dedupeByDomain(results, 2);

      // 3) 按相关性重排（snippet 信息量 > 域名权威 > 标题长度）
      results = rankByQuality(results);

      // 4) 截断到 maxResults
      results = results.slice(0, maxResults);

      if (results.length === 0) {
        const text = sites.length > 0
          ? `No results matched sites=${JSON.stringify(sites)} for "${query}".`
          : 'No results found.';
        return { content: [{ type: 'text', text }] };
      }

      // 5) 可选 LLM 总结（Layer 3）—— summarizer 未注入/失败时静默退回原始列表
      if (wantSummary && this.summarizer) {
        try {
          const summary = await this.summarizer(query, results);
          if (summary) {
            const raw = results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n\n');
            return { content: [{ type: 'text', text: `【摘要】\n${summary}\n\n【原始结果】\n${raw}` }] };
          }
        } catch { /* 总结失败静默降级 */ }
      }

      const text = results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n\n');
      return { content: [{ type: 'text', text }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Search error: ${msg}` }], isError: true };
    }
  }
}

// ===== 后处理工具函数（导出用于测试） =====

/**
 * URL 域名匹配：支持通配符 `*.example.com`（仅前缀通配），容忍 pattern 带 protocol/path。
 * - "example.com" 精确匹配 host 等于 example.com
 * - "*.example.com" 匹配 host 以 .example.com 结尾（即 foo.example.com / bar.example.com 都匹配）
 * - "https://example.com/path" → 剥掉 protocol/path 再匹配 host
 */
export function matchDomain(url: string, pattern: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    let pat = pattern.toLowerCase().trim();
    // 容忍 pattern 带 protocol/path（如 "https://example.com/path"）
    pat = pat.replace(/^https?:\/\//, '').split('/')[0].trim();
    if (pat.startsWith('*.')) {
      const suffix = pat.slice(1); // ".example.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pat;
  } catch {
    return false;
  }
}

/**
 * 同域名去重：同一 host 最多保留 cap 条，超出的丢弃（保留前 cap 条，按原顺序）。
 */
export function dedupeByDomain(results: SearchResult[], cap = 2): SearchResult[] {
  const seen = new Map<string, number>();
  const out: SearchResult[] = [];
  for (const r of results) {
    let host = '';
    try { host = new URL(r.url).hostname.toLowerCase(); } catch { host = r.url; }
    const c = seen.get(host) || 0;
    if (c >= cap) continue;
    seen.set(host, c + 1);
    out.push(r);
  }
  return out;
}

/**
 * 基础相关性重排：
 * - snippet 长度 80~400 字加分（太短信息量低，太长可能是被污染的整页文本）
 * - 短 host（如 arxiv.org / github.com / *.edu.cn）轻微加分
 * - 标题含 query 关键词加分
 */
export function rankByQuality(results: SearchResult[]): SearchResult[] {
  return [...results]
    .map((r, i) => ({ r, score: qualityScore(r), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.r);
}

function qualityScore(r: SearchResult): number {
  let s = 0;
  const len = (r.snippet || '').length;
  if (len >= 80 && len <= 400) s += 2;
  else if (len > 400 && len <= 800) s += 1;
  // 短 host 加分（权威域往往短）
  try {
    const host = new URL(r.url).hostname.toLowerCase();
    const partCount = host.split('.').length;
    if (partCount <= 2) s += 1;
    // .edu / .gov / .org 权威域（含 .edu.cn / .gov.uk 等二级域变体）
    if (/\.(edu|gov|org)(\.|$)/.test(host)) s += 1;
  } catch { /* 忽略 */ }
  // 标题非空 + 长度合理加分
  if (r.title && r.title.length >= 8 && r.title.length <= 120) s += 1;
  return s;
}
