import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WebSearchTool,
  FetchSearchBackend,
  DuckDuckGoSearchBackend,
  ServerSearchBackend,
  matchDomain,
  dedupeByDomain,
  rankByQuality,
  type SearchResult,
  type SearchBackend,
} from './web-search';

/**
 * 构造一个满足 web-search.ts 中使用到的 Response 子集的 mock 对象。
 * 同时支持 .json() 与 .text()，以适配不同后端的读取方式。
 */
function mockResponse(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}): Response {
  const ok = opts.ok ?? true;
  const status = opts.status ?? 200;
  return {
    ok,
    status,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

/** 构造一个最简的 SearchBackend stub，便于 WebSearchTool 测试。 */
function makeBackend(impl: (q: string, n: number) => Promise<SearchResult[]>): SearchBackend {
  return { search: impl };
}

describe('WebSearchToolTest', () => {
  let tool: WebSearchTool;

  beforeEach(() => {
    tool = new WebSearchTool();
  });

  it('应暴露正确的 name / description / inputSchema 元数据', () => {
    expect(tool.name).toBe('web_search');
    expect(tool.description).toContain('Search the web');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toEqual(['query']);
    expect(tool.inputSchema.properties).toHaveProperty('query');
    expect(tool.inputSchema.properties).toHaveProperty('maxResults');
  });

  it('未配置 backend 时 execute 返回 isError 且提示调用 setBackend', async () => {
    const res = await tool.execute({ query: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('no search backend configured');
    expect(res.content[0].text).toContain('setBackend');
  });

  it('setBackend 后 backend 被持有，后续 execute 可调用', async () => {
    const called = vi.fn(makeBackend(async () => [{ title: 'T', url: 'U', snippet: 'S' }]).search);
    tool.setBackend({ search: called });
    await tool.execute({ query: 'q' });
    expect(called).toHaveBeenCalledOnce();
  });

  it('query 为空字符串时返回 isError 且提示 query is required', async () => {
    tool.setBackend(makeBackend(async () => []));
    const res = await tool.execute({ query: '' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('query is required');
  });

  it('query 缺失（undefined）时同样返回 query is required', async () => {
    tool.setBackend(makeBackend(async () => []));
    const res = await tool.execute({});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('query is required');
  });

  it('正常返回多条结果时按 "i. title\\n   URL: url\\n   snippet" 格式拼接', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'http://a', snippet: 'sa' },
        { title: 'B', url: 'http://b', snippet: 'sb' },
      ]),
    );
    const res = await tool.execute({ query: 'q' });
    expect(res.isError).toBeUndefined();
    const text = res.content[0].text!;
    expect(text).toContain('1. A');
    expect(text).toContain('URL: http://a');
    expect(text).toContain('sa');
    expect(text).toContain('2. B');
    expect(text).toContain('URL: http://b');
    expect(text).toContain('sb');
    // 两条结果之间用空行分隔：第一条结尾 sa 后空行接第二条 "2. B"
    expect(text).toMatch(/sa\n\n2\. B/);
    // sb 位于第二条结果末尾，不应出现在 "2. B" 之前
    expect(text.indexOf('sb')).toBeGreaterThan(text.indexOf('2. B'));
  });

  it('backend 返回空数组时输出 "No results found."', async () => {
    tool.setBackend(makeBackend(async () => []));
    const res = await tool.execute({ query: 'q' });
    expect(res.content[0].text).toBe('No results found.');
  });

  it('maxResults 缺省时传给 backend 的值为 10（fetchCount = 2*5）', async () => {
    let received = -1;
    tool.setBackend(makeBackend(async (_q, n) => ((received = n), [])));
    await tool.execute({ query: 'q' });
    expect(received).toBe(10);
  });

  it('maxResults 超过 10 时被截断为 10，传给 backend 的 fetchCount=20', async () => {
    let received = -1;
    tool.setBackend(makeBackend(async (_q, n) => ((received = n), [])));
    await tool.execute({ query: 'q', maxResults: 99 });
    expect(received).toBe(20);
  });

  it('maxResults 为 0（falsy）时回退到默认 5，传给 backend 的 fetchCount=10', async () => {
    let received = -1;
    tool.setBackend(makeBackend(async (_q, n) => ((received = n), [])));
    await tool.execute({ query: 'q', maxResults: 0 });
    expect(received).toBe(10);
  });

  it('backend.search 抛 Error 时返回 "Search error: <message>" 且 isError=true', async () => {
    tool.setBackend(makeBackend(async () => {
      throw new Error('boom');
    }));
    const res = await tool.execute({ query: 'q' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('Search error: boom');
  });

  it('backend.search 抛非 Error 值时用 String(e) 兜底', async () => {
    tool.setBackend(makeBackend(async () => {
      throw 'string error';
    }));
    const res = await tool.execute({ query: 'q' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('Search error: string error');
  });

  it('summarize=true 但 summarizer 未注入时静默退回原始列表', async () => {
    tool.setBackend(
      makeBackend(async () => [{ title: 'A', url: 'https://a.com', snippet: 'sa' }]),
    );
    const res = await tool.execute({ query: 'q', summarize: true });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).not.toContain('【摘要】');
    expect(res.content[0].text).toContain('1. A');
  });

  it('summarize=true 且 summarizer 返回摘要时输出【摘要】+【原始结果】', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'https://a.com', snippet: 'sa' },
        { title: 'B', url: 'https://b.com', snippet: 'sb' },
      ]),
    );
    tool.setSummarizer(async (query, results) => `关于 ${query} 共 ${results.length} 条：都很有用`);
    const res = await tool.execute({ query: '测试词', summarize: true });
    const text = res.content[0].text!;
    expect(text).toContain('【摘要】');
    expect(text).toContain('关于 测试词 共 2 条');
    expect(text).toContain('【原始结果】');
    expect(text).toContain('1. A');
  });

  it('summarizer 抛错时静默退回原始列表', async () => {
    tool.setBackend(
      makeBackend(async () => [{ title: 'A', url: 'https://a.com', snippet: 'sa' }]),
    );
    tool.setSummarizer(async () => { throw new Error('llm down'); });
    const res = await tool.execute({ query: 'q', summarize: true });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).not.toContain('【摘要】');
    expect(res.content[0].text).toContain('1. A');
  });

  it('summarizer 返回 null（如无可用模型）时静默退回原始列表', async () => {
    tool.setBackend(
      makeBackend(async () => [{ title: 'A', url: 'https://a.com', snippet: 'sa' }]),
    );
    tool.setSummarizer(async () => null);
    const res = await tool.execute({ query: 'q', summarize: true });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).not.toContain('【摘要】');
  });

  it('summarize 缺省（false）时不调用 summarizer', async () => {
    tool.setBackend(
      makeBackend(async () => [{ title: 'A', url: 'https://a.com', snippet: 'sa' }]),
    );
    const fn = vi.fn(async () => 'should not be called');
    tool.setSummarizer(fn);
    await tool.execute({ query: 'q' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('结果 snippet 缺省（undefined）时仍能格式化且不出现 undefined', async () => {
    tool.setBackend(
      makeBackend(async () => [{ title: 'A', url: 'http://a', snippet: '' }]),
    );
    const res = await tool.execute({ query: 'q' });
    expect(res.content[0].text).not.toContain('undefined');
    expect(res.content[0].text).toContain('1. A');
  });

  it('sites 白名单生效：仅返回匹配域名的结果，其它域名被过滤掉', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'https://arxiv.org/abs/1234', snippet: 'sa' },
        { title: 'B', url: 'https://example.com/x', snippet: 'sb' },
        { title: 'C', url: 'https://cs.edu.cn/news', snippet: 'sc' },
      ]),
    );
    const res = await tool.execute({ query: 'q', maxResults: 5, sites: ['arxiv.org', '*.edu.cn'] });
    const text = res.content[0].text!;
    expect(text).toContain('arxiv.org');
    expect(text).toContain('cs.edu.cn');
    expect(text).not.toContain('example.com');
  });

  it('sites 数组为空数组时不过滤（视为未传）', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'https://a.com/x', snippet: 's' },
        { title: 'B', url: 'https://b.com/y', snippet: 's' },
      ]),
    );
    const res = await tool.execute({ query: 'q', sites: [] });
    expect(res.content[0].text).toContain('a.com');
    expect(res.content[0].text).toContain('b.com');
  });

  it('sites 全部不匹配时输出 "No results matched sites=..."', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'https://a.com/x', snippet: 's' },
      ]),
    );
    const res = await tool.execute({ query: 'q', sites: ['arxiv.org'] });
    expect(res.content[0].text).toContain('No results matched sites=');
    expect(res.content[0].text).toContain('arxiv.org');
  });

  it('sites 支持 *.example.com 通配匹配子域', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A', url: 'https://foo.example.com/x', snippet: 's' },
        { title: 'B', url: 'https://bar.example.com/y', snippet: 's' },
        { title: 'C', url: 'https://example.com/z', snippet: 's' }, // 精确 *.example.com 不匹配裸 example.com
      ]),
    );
    const res = await tool.execute({ query: 'q', maxResults: 5, sites: ['*.example.com'] });
    const text = res.content[0].text!;
    expect(text).toContain('foo.example.com');
    expect(text).toContain('bar.example.com');
    expect(text).not.toContain('1. C'); // 主域不被 *.example.com 命中
  });

  it('同域名去重：同一域名超过 2 条时被截断为 2 条', async () => {
    tool.setBackend(
      makeBackend(async () => [
        { title: 'A1', url: 'https://e.com/1', snippet: 'sa' },
        { title: 'A2', url: 'https://e.com/2', snippet: 'sa' },
        { title: 'A3', url: 'https://e.com/3', snippet: 'sa' }, // 第 3 条被丢
        { title: 'B',  url: 'https://other.com/1', snippet: 'sb' },
      ]),
    );
    const res = await tool.execute({ query: 'q', maxResults: 10 });
    const text = res.content[0].text!;
    expect(text).toContain('A1');
    expect(text).toContain('A2');
    expect(text).not.toContain('A3');
    expect(text).toContain('B');
  });

  it('rankByQuality 把权威短域（.edu）排在非权威长域之前', async () => {
    const r1 = { title: 'AAA very long title that exceeds 120 chars to drop the title length bonus significantly AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', url: 'https://foo.bar.example.longdomain.com/x', snippet: '' };
    const r2 = { title: 'T', url: 'https://cs.edu.cn/news', snippet: 'snippet here snippet here snippet here snippet here snippet here snippet here snippet here snippet here snippet' };
    const ranked = rankByQuality([r1, r2]);
    expect(ranked[0]).toBe(r2); // .edu 域 + 合理标题 + 中等 snippet → 第一
  });
});

describe('FetchSearchBackendTest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('endpoint 中 {query} 与 {maxResults} 占位符被正确替换并 encodeURIComponent query', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { items: [] } }));
    const backend = new FetchSearchBackend({
      endpoint: 'https://api.example.com/search?q={query}&n={maxResults}',
      extractResults: (d) => (d as { items: SearchResult[] }).items,
    });
    await backend.search('a b', 7);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://api.example.com/search?q=a%20b&n=7');
  });

  it('自定义 headers 被透传给 fetch', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { items: [] } }));
    const backend = new FetchSearchBackend({
      endpoint: 'https://api.example.com/search?q={query}&n={maxResults}',
      headers: { Authorization: 'Bearer TOKEN' },
      extractResults: () => [],
    });
    await backend.search('q', 3);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: 'Bearer TOKEN' });
  });

  it('extractResults 被调用并返回其结果', async () => {
    const fakeResults: SearchResult[] = [{ title: 'T', url: 'U', snippet: 'S' }];
    fetchMock.mockResolvedValue(mockResponse({ json: { data: fakeResults } }));
    const backend = new FetchSearchBackend({
      endpoint: 'https://api.example.com/search?q={query}&n={maxResults}',
      extractResults: (d) => (d as { data: SearchResult[] }).data,
    });
    const out = await backend.search('q', 3);
    expect(out).toEqual(fakeResults);
  });

  it('HTTP 非 2xx（!res.ok）时抛 "Search API returned HTTP <status>"', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 500, json: {} }));
    const backend = new FetchSearchBackend({
      endpoint: 'https://api.example.com/search?q={query}&n={maxResults}',
      extractResults: () => [],
    });
    await expect(backend.search('q', 3)).rejects.toThrow('Search API returned HTTP 500');
  });
});

describe('DuckDuckGoSearchBackendTest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 构造一份包含 n 条 result__a / result__snippet 的 DDG HTML。 */
  function ddgHtml(items: Array<{ title: string; uddg: string; snippet: string }>): string {
    const blocks = items
      .map(
        (it) =>
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(
            it.uddg,
          )}">${it.title}</a>` +
          `<a class="result__snippet">${it.snippet}</a>`,
      )
      .join('');
    return `<html><body>${blocks}</body></html>`;
  }

  it('请求 URL 指向 html.duckduckgo.com 并对 query 做 encodeURIComponent', async () => {
    fetchMock.mockResolvedValue(mockResponse({ text: ddgHtml([]) }));
    const backend = new DuckDuckGoSearchBackend();
    await backend.search('言 智', 5);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('言 智'));
  });

  it('请求携带 PC 浏览器 UA 与中文 Accept-Language', async () => {
    fetchMock.mockResolvedValue(mockResponse({ text: ddgHtml([]) }));
    const backend = new DuckDuckGoSearchBackend();
    await backend.search('q', 5);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('Chrome/124.0');
    expect(headers['Accept-Language']).toContain('zh-CN');
  });

  it('解析 result__a / result__snippet 并通过 uddg 还原真实 URL', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        text: ddgHtml([
          { title: 'Title 1', uddg: 'https://example.com/1', snippet: 'Snippet 1' },
          { title: 'Title 2', uddg: 'https://example.com/2', snippet: 'Snippet 2' },
        ]),
      }),
    );
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      title: 'Title 1',
      url: 'https://example.com/1',
      snippet: 'Snippet 1',
    });
    expect(out[1].url).toBe('https://example.com/2');
  });

  it('maxResults 大于 10 时被限制为 10', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      title: `T${i}`,
      uddg: `https://e.com/${i}`,
      snippet: `S${i}`,
    }));
    fetchMock.mockResolvedValue(mockResponse({ text: ddgHtml(items) }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 99);
    expect(out).toHaveLength(10);
  });

  it('maxResults 为 0（falsy）时回退到构造默认值', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `T${i}`,
      uddg: `https://e.com/${i}`,
      snippet: `S${i}`,
    }));
    fetchMock.mockResolvedValue(mockResponse({ text: ddgHtml(items) }));
    const backend = new DuckDuckGoSearchBackend(3);
    const out = await backend.search('q', 0);
    // falsy maxResults → 使用 defaultMaxResults=3
    expect(out).toHaveLength(3);
  });

  it('maxResults 超过默认但小于 10 时按 maxResults 截断', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `T${i}`,
      uddg: `https://e.com/${i}`,
      snippet: `S${i}`,
    }));
    fetchMock.mockResolvedValue(mockResponse({ text: ddgHtml(items) }));
    const backend = new DuckDuckGoSearchBackend(5);
    const out = await backend.search('q', 2);
    expect(out).toHaveLength(2);
  });

  it('snippet 数量少于 link 数量时缺失项以空字符串填充', async () => {
    // 仅 1 条 snippet，但 2 条 link
    const html =
      `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://a.com')}">A</a>` +
      `<a class="result__snippet">only one</a>` +
      `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://b.com')}">B</a>`;
    fetchMock.mockResolvedValue(mockResponse({ text: html }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(2);
    expect(out[0].snippet).toBe('only one');
    expect(out[1].snippet).toBe('');
  });

  it('title 为空（stripTags 后 trim 为空）的条目被跳过', async () => {
    const html =
      `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://a.com')}">   </a>` +
      `<a class="result__snippet">s</a>` +
      `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://b.com')}">B</a>`;
    fetchMock.mockResolvedValue(mockResponse({ text: html }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('B');
  });

  it('HTML 实体（&amp; &lt; &gt; &quot; &#x27; &#39;）与子标签被正确剥离', async () => {
    const html =
      `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://a.com')}">` +
      `<b>T</b> &amp; &lt;tag&gt; &quot;q&quot; &#x27;a&#39;` +
      `</a>` +
      `<a class="result__snippet"><i>S</i> &amp; more</a>`;
    fetchMock.mockResolvedValue(mockResponse({ text: html }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('T & <tag> "q" \'a\'');
    expect(out[0].snippet).toBe('S & more');
  });

  it('href 为无法解析的字符串时 resolveDdgUrl 回退为原始 raw', async () => {
    // 'not a url' 不会被 // 前缀处理，new URL 会抛错，catch 返回 raw
    const html =
      `<a class="result__a" href="not a url">A</a>` +
      `<a class="result__snippet">s</a>`;
    fetchMock.mockResolvedValue(mockResponse({ text: html }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('not a url');
  });

  it('href 以 // 开头但无 uddg 参数时返回带 https: 前缀的原始 URL', async () => {
    const html =
      `<a class="result__a" href="//example.com/path">A</a>` +
      `<a class="result__snippet">s</a>`;
    fetchMock.mockResolvedValue(mockResponse({ text: html }));
    const backend = new DuckDuckGoSearchBackend();
    const out = await backend.search('q', 10);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://example.com/path');
  });

  it('HTTP 非 2xx 时抛 "DuckDuckGo 返回 HTTP <status>"', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 503, text: '' }));
    const backend = new DuckDuckGoSearchBackend();
    await expect(backend.search('q', 5)).rejects.toThrow('DuckDuckGo 返回 HTTP 503');
  });
});

describe('ServerSearchBackendTest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let localStorageMock: { getItem: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorageMock = { getItem: vi.fn(() => null) };
    vi.stubGlobal('localStorage', localStorageMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('请求 URL 为 /api/search 且包含 encodeURIComponent(query) 与 maxResults', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: [] } }));
    const backend = new ServerSearchBackend();
    await backend.search('a b', 6);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('/api/search?q=a%20b&maxResults=6');
  });

  it('localStorage 存在 auth_token 时附加 Authorization: Bearer 头', async () => {
    localStorageMock.getItem.mockReturnValue('THE_TOKEN');
    fetchMock.mockResolvedValue(mockResponse({ json: { data: [] } }));
    const backend = new ServerSearchBackend();
    await backend.search('q', 5);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer THE_TOKEN');
  });

  it('localStorage 无 token 时不附加 Authorization 头', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { data: [] } }));
    const backend = new ServerSearchBackend();
    await backend.search('q', 5);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('localStorage.getItem 抛错时被吞掉并按无 token 处理（不附加 Authorization）', async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    fetchMock.mockResolvedValue(mockResponse({ json: { data: [] } }));
    const backend = new ServerSearchBackend();
    await backend.search('q', 5);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('正常返回 json.data 数组', async () => {
    const data: SearchResult[] = [{ title: 'T', url: 'U', snippet: 'S' }];
    fetchMock.mockResolvedValue(mockResponse({ json: { data } }));
    const backend = new ServerSearchBackend();
    const out = await backend.search('q', 5);
    expect(out).toEqual(data);
  });

  it('json.data 缺失时返回空数组', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: {} }));
    const backend = new ServerSearchBackend();
    const out = await backend.search('q', 5);
    expect(out).toEqual([]);
  });

  it('json.error 存在时抛该错误消息', async () => {
    fetchMock.mockResolvedValue(mockResponse({ json: { error: 'upstream failed' } }));
    const backend = new ServerSearchBackend();
    await expect(backend.search('q', 5)).rejects.toThrow('upstream failed');
  });

  it('HTTP 非 2xx 时抛 "搜索服务返回 HTTP <status>"', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 429, json: {} }));
    const backend = new ServerSearchBackend();
    await expect(backend.search('q', 5)).rejects.toThrow('搜索服务返回 HTTP 429');
  });
});

describe('matchDomainTest', () => {
  it('精确域名匹配：host 等于 pattern 时返回 true', () => {
    expect(matchDomain('https://example.com/path', 'example.com')).toBe(true);
  });

  it('精确域名匹配：子域不等于裸域', () => {
    expect(matchDomain('https://foo.example.com/path', 'example.com')).toBe(false);
  });

  it('通配符 *.example.com 匹配子域 foo.example.com', () => {
    expect(matchDomain('https://foo.example.com/path', '*.example.com')).toBe(true);
    expect(matchDomain('https://a.b.example.com/path', '*.example.com')).toBe(true);
  });

  it('通配符 *.example.com 不匹配裸 example.com（避免过宽）', () => {
    expect(matchDomain('https://example.com/path', '*.example.com')).toBe(false);
  });

  it('URL 解析失败（如无协议）时返回 false，不抛错', () => {
    expect(matchDomain('not-a-url', 'example.com')).toBe(false);
  });

  it('host 大小写归一化（URL hostname / pattern 都不区分大小写）', () => {
    expect(matchDomain('https://Example.COM/path', 'example.com')).toBe(true);
  });

  it('pattern 含协议前缀不影响匹配（用 URL 解析 host）', () => {
    expect(matchDomain('https://example.com/path', 'https://example.com')).toBe(true);
  });
});

describe('dedupeByDomainTest', () => {
  it('同一域名 cap=2 时保留前 2 条，丢弃后续', () => {
    const results: SearchResult[] = [
      { title: 'A1', url: 'https://e.com/1', snippet: '' },
      { title: 'A2', url: 'https://e.com/2', snippet: '' },
      { title: 'A3', url: 'https://e.com/3', snippet: '' },
    ];
    const out = dedupeByDomain(results, 2);
    expect(out.map((r) => r.title)).toEqual(['A1', 'A2']);
  });

  it('cap=1 时同域仅保留第一条（最强去重）', () => {
    const results: SearchResult[] = [
      { title: 'A1', url: 'https://e.com/1', snippet: '' },
      { title: 'A2', url: 'https://e.com/2', snippet: '' },
    ];
    const out = dedupeByDomain(results, 1);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('A1');
  });

  it('不同域名互不影响', () => {
    const results: SearchResult[] = [
      { title: 'A', url: 'https://e.com/1', snippet: '' },
      { title: 'B', url: 'https://f.com/1', snippet: '' },
      { title: 'C', url: 'https://g.com/1', snippet: '' },
    ];
    const out = dedupeByDomain(results, 2);
    expect(out).toHaveLength(3);
  });

  it('URL 无法解析时按 url 字符串本身作为 host key（不抛错）', () => {
    const results: SearchResult[] = [
      { title: 'A', url: 'not-a-url', snippet: '' },
      { title: 'B', url: 'not-a-url', snippet: '' },
    ];
    const out = dedupeByDomain(results, 2);
    expect(out).toHaveLength(2); // 都按 raw 视为同一 host，第一次出现允许，第二次也允许
  });
});

describe('rankByQualityTest', () => {
  it('中等长度 snippet（80~400）比空 snippet 排名更高', () => {
    const r1 = { title: 'A', url: 'https://e.com/1', snippet: '' };
    const r2 = { title: 'B', url: 'https://f.com/1', snippet: 'a'.repeat(200) };
    const ranked = rankByQuality([r1, r2]);
    expect(ranked[0]).toBe(r2);
  });

  it('.edu/.gov/.org 域加分', () => {
    const r1 = { title: 'A', url: 'https://foo.bar.commercial.com/1', snippet: 'a'.repeat(200) };
    const r2 = { title: 'B', url: 'https://cs.edu.cn/news', snippet: 'a'.repeat(200) };
    const ranked = rankByQuality([r1, r2]);
    expect(ranked[0]).toBe(r2);
  });

  it('同分时按原顺序稳定排序', () => {
    const r1 = { title: 'A', url: 'https://e.com/1', snippet: 'a'.repeat(200) };
    const r2 = { title: 'B', url: 'https://f.com/1', snippet: 'a'.repeat(200) };
    const ranked = rankByQuality([r1, r2]);
    expect(ranked).toEqual([r1, r2]);
  });

  it('超长 snippet（>800）减分，避免整页清洗文本塞前排', () => {
    const r1 = { title: 'A', url: 'https://e.com/1', snippet: 'a'.repeat(1500) };
    const r2 = { title: 'B', url: 'https://f.com/1', snippet: 'a'.repeat(200) };
    const ranked = rankByQuality([r1, r2]);
    expect(ranked[0]).toBe(r2);
  });
});