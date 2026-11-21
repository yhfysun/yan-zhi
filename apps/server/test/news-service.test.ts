import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractNewsArticle,
  getNewsArticle,
  getNewsMarket,
  mergeNewsItems,
  parseChinaNewsRss,
  parseEastmoneyKlinePayload,
  parseEastmoneyQuotePayload,
  parseTencentKlinePayload,
  parseTencentQuotePayload,
  resolveAllowedNewsUrl,
  searchQuotes,
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
      sourceName: '中国新闻网',
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

  it('parses Tencent daily K-line rows into OHLCV bars', () => {
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

    expect(parseTencentKlinePayload(payload, 'sh600519')).toEqual([
      { date: '2026-11-18', open: 1450, close: 1442.66, high: 1456, low: 1431.7, volume: 29847 },
      { date: '2026-11-19', open: 1442, close: 1460.21, high: 1464.99, low: 1432.1, volume: 42692 },
    ]);
    expect(parseTencentKlinePayload('{broken', 'sh600519')).toEqual([]);
  });

  it('parses Eastmoney daily K-line CSV rows into OHLCV bars', () => {
    const payload = JSON.stringify({
      data: {
        klines: [
          '2026-11-18,1450.00,1442.66,1456.00,1431.70,29847',
          '2026-11-19,1442.00,1460.21,1464.99,1432.10,42692',
        ],
      },
    });

    expect(parseEastmoneyKlinePayload(payload)).toEqual([
      { date: '2026-11-18', open: 1450, close: 1442.66, high: 1456, low: 1431.7, volume: 29847 },
      { date: '2026-11-19', open: 1442, close: 1460.21, high: 1464.99, low: 1432.1, volume: 42692 },
    ]);
    expect(parseEastmoneyKlinePayload('{broken')).toEqual([]);
  });

  it('parses HK quotes from the Eastmoney payload (stocks and indices)', () => {
    const payload = JSON.stringify({
      rc: 0,
      data: {
        diff: [
          { f12: 'HSI', f13: 100, f14: '恒生指数', f2: 26451.31, f3: 0.91, f4: 238.94, f18: 26212.37 },
          { f12: '00700', f13: 116, f14: '腾讯控股', f2: 682.5, f3: 1.26, f4: 8.5, f18: 674.0 },
        ],
      },
    });

    const quotes = parseEastmoneyQuotePayload(payload);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({ code: 'hkHSI', name: '恒生指数', price: 26451.31 });
    expect(quotes[1]).toMatchObject({ code: 'hk00700', name: '腾讯控股', price: 682.5 });
  });

  it('parses US quotes and disambiguates indices via the secid map', () => {
    const payload = JSON.stringify({
      rc: 0,
      data: {
        diff: [
          { f12: 'DJIA', f13: 100, f14: '道琼斯', f2: 48220.5, f3: 0.42, f4: 201.3, f18: 48019.2 },
          { f12: 'NVDA', f13: 105, f14: '英伟达', f2: 187.32, f3: -1.08, f4: -2.05, f18: 189.37 },
        ],
      },
    });
    const secidMap = new Map([
      ['100.DJIA', 'usDJI'],
      ['105.NVDA', 'usNVDA'],
    ]);

    const quotes = parseEastmoneyQuotePayload(payload, secidMap);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({ code: 'usDJI', name: '道琼斯' });
    expect(quotes[1]).toMatchObject({ code: 'usNVDA', name: '英伟达' });
  });

  it('parses Eastmoney UTF-8 market quotes without a GBK decoder', () => {
    const payload = JSON.stringify({
      rc: 0,
      data: {
        total: 2,
        diff: [
          { f12: '000001', f13: 1, f14: '上证指数', f2: 3511.27, f3: -1.85, f4: -66.35, f18: 3577.62 },
          { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1439.5, f3: -1.42, f4: -20.71, f18: 1460.21 },
        ],
      },
    });

    const quotes = parseEastmoneyQuotePayload(payload);

    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({
      code: 'sh000001',
      name: '上证指数',
      price: 3511.27,
      previousClose: 3577.62,
      change: -66.35,
      changePercent: -1.85,
    });
    expect(quotes[1].code).toBe('sh600519');
  });

  it('uses the UTF-8 Eastmoney provider for Android-compatible market data', async () => {
    const payload = JSON.stringify({
      rc: 0,
      data: {
        diff: [
          { f12: '000001', f13: 1, f14: '上证指数', f2: 3511.27, f3: -1.85, f4: -66.35, f18: 3577.62 },
          { f12: '399001', f13: 0, f14: '深证成指', f2: 11234.56, f3: 0.52, f4: 58.1, f18: 11176.46 },
          { f12: 'HSI', f13: 100, f14: '恒生指数', f2: 26451.31, f3: 0.91, f4: 238.94, f18: 26212.37 },
        ],
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('push2.eastmoney.com')) {
        return new Response(payload, {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      throw new Error(`不应请求非 UTF-8 行情源: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const market = await getNewsMarket(true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('push2.eastmoney.com'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(market.source).toBe('东方财富行情');
    const cnIndex = market.groups.find((group) => group.id === 'cn-index');
    const hk = market.groups.find((group) => group.id === 'hk');
    expect(cnIndex?.quotes[0]).toMatchObject({
      code: 'sh000001',
      name: '上证指数',
      price: 3511.27,
    });
    expect(hk?.quotes[0]).toMatchObject({ code: 'hkHSI', name: '恒生指数' });
  });

  it('maps suggest results to unified quote codes for full-market search', async () => {
    const payload = JSON.stringify({
      QuotationCodeTable: {
        Data: [
          { Code: '600519', Name: '贵州茅台', QuoteID: '1.600519', SecurityTypeName: '沪A' },
          { Code: '00700', Name: '腾讯控股', QuoteID: '116.00700', SecurityTypeName: '港股' },
          { Code: 'NVDA', Name: '英伟达', QuoteID: '105.NVDA', SecurityTypeName: '美股' },
          { Code: '999999', Name: '垃圾数据', QuoteID: '999.999999', SecurityTypeName: '未知' },
        ],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(payload, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })));

    const results = await searchQuotes('600519');

    expect(results).toHaveLength(3);
    expect(results.map((item) => item.code)).toEqual(['sh600519', 'hk00700', 'usNVDA']);
    expect(results[0]).toMatchObject({ name: '贵州茅台', market: '沪A' });

    // 空查询直接返回空，不发起请求
    expect(await searchQuotes('')).toEqual([]);
  });
});
