import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebFetchTool, extractMainContent, fetchPage } from './web-fetch';

function htmlPage(opts: { title?: string; desc?: string; body?: string }): string {
  return `<!DOCTYPE html>
<html><head>
<title>${opts.title || ''}</title>
<meta name="description" content="${opts.desc || ''}">
</head><body>
<nav>导航导航导航导航导航导航导航导航导航导航</nav>
${opts.body || ''}
<footer>页脚页脚页脚页脚页脚页脚页脚页脚页脚页脚</footer>
<script>var tracking = 1;</script>
</body></html>`;
}

function mockResponse(opts: { ok?: boolean; status?: number; text?: string; contentType?: string }): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? opts.contentType ?? 'text/html; charset=utf-8' : null) },
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

describe('extractMainContentTest', () => {
  it('提取 title 与 meta description', () => {
    const out = extractMainContent(htmlPage({ title: '页面标题', desc: '页面描述' }));
    expect(out.title).toBe('页面标题');
    expect(out.description).toBe('页面描述');
  });

  it('收集结构文本块（p/li/h2），剥掉内部标签与实体', () => {
    const body = '<p>第一段内容足够长可以被收集进结果里 ok</p><h2>标题二内容也足够长可以被收集</h2><ul><li>列表项内容足够长也可以被收集进来</li></ul>';
    const out = extractMainContent(htmlPage({ body }));
    expect(out.text).toContain('第一段内容足够长');
    expect(out.text).toContain('标题二内容');
    expect(out.text).toContain('列表项内容足够长');
  });

  it('剥掉 script/style/nav/footer 噪声块', () => {
    const body = '<p>正常段落内容足够长可以被收集进结果里</p><style>.x{color:red}</style><script>var a=1;</script>';
    const out = extractMainContent(htmlPage({ body }));
    expect(out.text).toContain('正常段落');
    expect(out.text).not.toContain('color:red');
    expect(out.text).not.toContain('var a=1');
    expect(out.text).not.toContain('页脚页脚');
  });

  it('短于 20 字符的碎块被过滤', () => {
    const body = '<p>短</p><p>这是一个足够长的段落可以被收集进来没问题</p>';
    const out = extractMainContent(htmlPage({ body }));
    expect(out.text).not.toContain('短\n');
    expect(out.text).toContain('足够长的段落');
  });

  it('块抽取内容不足 200 字符时回退到剥所有标签的整页文本', () => {
    const body = '<p>只有一个很短的块</p><div>裸 div 文本内容也不算结构块所以块抽取会不足然后走整页回退逻辑</div>';
    const out = extractMainContent(htmlPage({ body }));
    // 回退模式下裸 div 文本也应保留
    expect(out.text).toContain('裸 div 文本内容');
  });

  it('HTML 实体被正确解码', () => {
    const body = '<p>实体测试 &amp; &lt;tag&gt; &quot;引号&quot; &#39;单引号&#39; 还需要足够长才行</p>';
    const out = extractMainContent(htmlPage({ body }));
    expect(out.text).toContain('& <tag> "引号" \'单引号\'');
  });
});

describe('fetchPageTest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HTML 页面走正文抽取，输出标题/描述/正文', async () => {
    fetchMock.mockResolvedValue(mockResponse({ text: htmlPage({ title: 'T', desc: 'D', body: '<p>正文内容足够长可以被收集进结果里 ok</p>' }) }));
    const out = await fetchPage('https://example.com', 5000, 8000);
    expect(out).toContain('标题: T');
    expect(out).toContain('描述: D');
    expect(out).toContain('正文内容足够长');
  });

  it('非 HTML content-type 直接给原文（截断）', async () => {
    fetchMock.mockResolvedValue(mockResponse({ contentType: 'application/json', text: '{"a":1}' }));
    const out = await fetchPage('https://example.com/api', 5000, 8000);
    expect(out).toContain('application/json');
    expect(out).toContain('{"a":1}');
  });

  it('正文超过 maxChars 时截断并标注总长度', async () => {
    const longText = 'x'.repeat(100);
    fetchMock.mockResolvedValue(mockResponse({ text: htmlPage({ body: `<p>${longText}</p><p>${longText}</p><p>${longText}</p><p>${longText}</p>` }) }));
    const out = await fetchPage('https://example.com', 5000, 150);
    expect(out).toContain('[正文已截断');
  });

  it('请求带浏览器 UA 与 Accept-Language', async () => {
    fetchMock.mockResolvedValue(mockResponse({ text: htmlPage({ body: '<p>正文内容足够长可以被收集进结果里 ok</p>' }) }));
    await fetchPage('https://example.com', 5000, 8000);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Chrome/124');
    expect((init.headers as Record<string, string>)['Accept-Language']).toContain('zh-CN');
  });

  it('HTTP 非 2xx 抛错', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 404 }));
    await expect(fetchPage('https://example.com', 5000, 8000)).rejects.toThrow('HTTP 404');
  });
});

describe('WebFetchToolTest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let tool: WebFetchTool;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    tool = new WebFetchTool();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('元数据：name/description/schema 暴露 urls 必填', () => {
    expect(tool.name).toBe('web_fetch');
    expect(tool.description).toContain('web_search');
    expect(tool.inputSchema.required).toEqual(['urls']);
  });

  it('urls 为空/全非法时返回 isError', async () => {
    expect((await tool.execute({ urls: [] })).isError).toBe(true);
    expect((await tool.execute({ urls: ['ftp://x'] })).isError).toBe(true);
    expect((await tool.execute({})).isError).toBe(true);
  });

  it('最多取 5 个 URL', async () => {
    fetchMock.mockResolvedValue(mockResponse({ text: htmlPage({ body: '<p>正文内容足够长可以被收集进结果里 ok</p>' }) }));
    const urls = Array.from({ length: 8 }, (_, i) => `https://e.com/${i}`);
    await tool.execute({ urls });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('多 URL 并发抓取，成功用 --- 分隔', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      mockResponse({ text: htmlPage({ title: `T-${url}`, body: '<p>正文内容足够长可以被收集进结果里 ok</p>' }) }));
    const res = await tool.execute({ urls: ['https://a.com', 'https://b.com'] });
    const text = res.content[0].text!;
    expect(text).toContain('[1] https://a.com');
    expect(text).toContain('[2] https://b.com');
    expect(text).toContain('---');
  });

  it('单个 URL 失败不影响其它（allSettled 语义）', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('bad')) throw new Error('ENOTFOUND');
      return mockResponse({ text: htmlPage({ body: '<p>正文内容足够长可以被收集进结果里 ok</p>' }) });
    });
    const res = await tool.execute({ urls: ['https://a.com', 'https://bad.com/x'] });
    const text = res.content[0].text!;
    expect(res.isError).toBeUndefined();
    expect(text).toContain('[1] https://a.com');
    expect(text).toContain('抓取失败: ENOTFOUND');
    expect(text).toContain('（网络不可达或域名不存在）');
  });

  it('超时 abort 的失败带（超时）提示', async () => {
    fetchMock.mockImplementation(async () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      throw e;
    });
    const res = await tool.execute({ urls: ['https://slow.com'] });
    expect(res.content[0].text).toContain('（超时）');
  });
});
