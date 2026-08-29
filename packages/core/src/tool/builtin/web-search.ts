import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchBackend {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
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

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = this.config.endpoint
      .replace('{query}', encodeURIComponent(query))
      .replace('{maxResults}', String(maxResults));

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

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const limit = Math.min(maxResults || this.defaultMaxResults, 10);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
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
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    let token: string | null = null;
    try { token = localStorage.getItem('auth_token'); } catch { /* 非浏览器环境 */ }
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `/api/search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`搜索服务返回 HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return (json.data as SearchResult[]) || [];
  }
}

export class WebSearchTool implements BuiltInTool {
  name = 'web_search';
  description = 'Search the web for information. Returns a list of results with titles, URLs, and snippets.';

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
    },
    required: ['query'],
  };

  private backend: SearchBackend | null = null;

  setBackend(backend: SearchBackend): void {
    this.backend = backend;
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

    if (!query) {
      return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
    }

    try {
      const results = await this.backend.search(query, maxResults);
      const text = results.length === 0
        ? 'No results found.'
        : results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Search error: ${msg}` }], isError: true };
    }
  }
}
