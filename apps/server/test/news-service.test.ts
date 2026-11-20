import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractNewsArticle,
  getNewsArticle,
  mergeNewsItems,
  parseChinaNewsRss,
  parseTencentKlinePayload,
  parseTencentQuotePayload,
  resolveAllowedNewsUrl,
} from '../src/services/news-service.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('news-service', () => {
  it('parses a ChinaNews RSS item and turns HTML descriptions into text', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[华强北的新订单]]></title>
            <link>https://www.chinanews.com.cn/cj/2026/11-20/10735075.shtml</link>
            <pubDate>Fri, 20 Nov 2026 10:06:19 +0800</pubDate>
            <description><![CDATA[<p>APEC 来了，<strong>订单爆了</strong>。</p>]]></description>
          </item>
          <item>
            <title>华强北的新订单</title>
            <link>https://www.chinanews.com.cn/cj/2026/11-20/10735075.shtml</link>
            <pubDate>Fri, 20 Nov 2026 10:06:19 +0800</pubDate>
          </item>
        </channel>
      </rss>`;

    const items = parseChinaNewsRss(xml, {
      id: 'finance',
      name: '财经',
      url: 'https://www.chinanews.com.cn/rss/finance.xml',
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '华强北的新订单',
      summary: 'APEC 来了，订单爆了。',
      source: '中国新闻网',
      category: 'finance',
      categoryLabel: '财经',
    });
    expect(items[0].publishedAt).toBe(Date.parse('2026-11-20T10:06:19+08:00'));
    expect(items[0].id).toBeTruthy();
    expect(items[0].url).toContain('chinanews.com.cn');
  });

  it('merges duplicate stories and keeps the newest source occurrence first', () => {
    const base = {
      id: 'a',
      title: '同一条重要消息',
      summary: '摘要',
      source: '中国新闻网',
      category: 'domestic' as const,
      categoryLabel: '国内',
      publishedAt: Date.parse('2026-11-20T09:00:00+08:00'),
      url: 'https://www.chinanews.com.cn/cj/2026/11-20/1.shtml',
    };
    const merged = mergeNewsItems([
      { ...base, publishedAt: Date.parse('2026-11-20T08:00:00+08:00') },
      { ...base, id: 'b', category: 'finance', categoryLabel: '财经' },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].category).toBe('finance');
  });

  it('only resolves article URLs from the approved news host', () => {
    expect(resolveAllowedNewsUrl('https://www.chinanews.com.cn/cj/2026/11-20/1.shtml'))
      .toBe('https://www.chinanews.com.cn/cj/2026/11-20/1.shtml');
    expect(resolveAllowedNewsUrl('http://www.chinanews.com.cn/cj/2026/11-20/1.shtml'))
      .toBe('https://www.chinanews.com.cn/cj/2026/11-20/1.shtml');
    expect(resolveAllowedNewsUrl('https://www.chinanews.com.cn.evil.example/cj/1.shtml')).toBeNull();
    expect(resolveAllowedNewsUrl('http://127.0.0.1:3000/private')).toBeNull();
    expect(resolveAllowedNewsUrl('javascript:alert(1)')).toBeNull();
  });

  it('extracts readable article blocks without ads or editor chrome', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="华强北的新订单">
      <meta property="og:image" content="//i2.chinanews.com.cn/cover.jpg">
      </head><body>
      <h1>页面外层标题</h1>
      <div class="left_zw">
        <p>　　APEC 来了，华强北的订单爆了。<strong>这是一段保留的正文。</strong></p>
        <table class="adInContent"><tr><td>广告</td></tr></table>
        <p>　　<strong>“深圳速度”的生动诠释</strong></p>
        <p>　　上午设计，下午打样，次日量产。</p>
        <p><img src="//i2.chinanews.com.cn/photo.jpg" alt="华强北现场"></p>
        <div class="adEditor">【编辑:测试】</div>
      </div>
      <script>alert('x')</script>
      </body></html>`;

    const article = extractNewsArticle(html, 'https://www.chinanews.com.cn/cj/2026/11-20/1.shtml');

    expect(article.title).toBe('华强北的新订单');
    expect(article.coverImage).toBe('https://i2.chinanews.com.cn/cover.jpg');
    expect(article.blocks).toEqual([
      { type: 'paragraph', text: 'APEC 来了，华强北的订单爆了。这是一段保留的正文。' },
      { type: 'heading', text: '“深圳速度”的生动诠释' },
      { type: 'paragraph', text: '上午设计，下午打样，次日量产。' },
      {
        type: 'image',
        src: 'https://i2.chinanews.com.cn/photo.jpg',
        alt: '华强北现场',
      },
    ]);
    expect(article.contentStatus).toBe('full');
  });

  it('does not use the article page URL as a fallback cover image', () => {
    const article = extractNewsArticle(
      '<html><body><article><p>只有正文，没有图片。</p></article></body></html>',
      'https://www.chinanews.com.cn/cj/2026/11-20/1.shtml',
    );

    expect(article.coverImage).toBe('');
  });

  it('does not follow article redirects that could leave the approved host', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:3001/private' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getNewsArticle('https://www.chinanews.com.cn/cj/2026/11-20/redirect.shtml', true),
    ).rejects.toThrow('HTTP 302');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.chinanews.com.cn/cj/2026/11-20/redirect.shtml',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('parses Tencent market quotes in GBK-decoded text', () => {
    const payload = [
      'v_sh000001="1~上证指数~000001~3511.27~3577.62~3527.30~187326365~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261120101603~-66.35~-1.85~3534.15~3509.87~3511.27/187326365/257114199945~187326365~25711420~0.38~16.09~~3534.15~3509.87~0.68~553675.48~613775.09~0.00~-1~-1~2.21~0~3523.27";',
      'v_sh600519="1~贵州茅台~600519~1439.50~1460.21~1450.89~10731~5262~5465~1439.50~2~1439.33~7~1439.26~3~1439.24~1~1439.22~1~1439.53~1~1439.98~1~1439.99~3~1440.00~5~1440.07~3~1440.00~3~1440.07~3~1440.00~3~~20261120101559~-20.71~-1.42~1459.00~1439.00~1439.50/10731/1551746306~10731~155175~0.09~21.90";',
    ].join('\n');

    const quotes = parseTencentQuotePayload(payload);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({
      code: 'sh000001',
      name: '上证指数',
      price: 3511.27,
      previousClose: 3577.62,
      change: -66.35,
      changePercent: -1.85,
    });
    expect(quotes[1].name).toBe('贵州茅台');
  });

  it('parses Tencent daily K-line close prices for sparklines', () => {
    const payload = JSON.stringify({
      code: 0,
      data: {
        sh600519: {
          qfqday: [
            ['2026-11-18', '1450.000', '1442.660', '1456.000', '1431.700', '29847.000'],
            ['2026-11-19', '1442.000', '1460.210', '1464.990', '1432.100', '42692.000'],
          ],
        },
      },
    });

    expect(parseTencentKlinePayload(payload, 'sh600519')).toEqual([1442.66, 1460.21]);
    expect(parseTencentKlinePayload('{broken', 'sh600519')).toEqual([]);
  });
});
