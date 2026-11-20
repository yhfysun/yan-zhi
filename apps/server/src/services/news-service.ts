import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type {
  MarketQuote,
  NewsArticle,
  NewsArticleBlock,
  NewsCategory,
  NewsFeedResult,
  NewsItem,
  NewsMarketResult,
  NewsSourceStatus,
} from '@yan-zhi/shared';

interface NewsSourceDefinition {
  id: Exclude<NewsCategory, 'top'>;
  name: string;
  url: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const NEWS_SOURCES: NewsSourceDefinition[] = [
  { id: 'domestic', name: '国内', url: 'https://www.chinanews.com.cn/rss/china.xml' },
  { id: 'world', name: '国际', url: 'https://www.chinanews.com.cn/rss/world.xml' },
  { id: 'finance', name: '财经', url: 'https://www.chinanews.com.cn/rss/finance.xml' },
  { id: 'society', name: '社会', url: 'https://www.chinanews.com.cn/rss/society.xml' },
];

const SOURCE_BY_CATEGORY: Record<Exclude<NewsCategory, 'top'>, NewsSourceDefinition> = {
  domestic: NEWS_SOURCES[0],
  world: NEWS_SOURCES[1],
  finance: NEWS_SOURCES[2],
  society: NEWS_SOURCES[3],
};

const FEED_TTL_MS = 5 * 60_000;
const ARTICLE_TTL_MS = 30 * 60_000;
const MARKET_TTL_MS = 60_000;
const ALLOWED_NEWS_HOSTS = new Set(['www.chinanews.com.cn', 'www.chinanews.com']);
const COPYRIGHT_NOTE = '正文由公开 RSS 与来源页面整理，仅供个人阅读；版权归原媒体及作者所有。';

const sourceCache = new Map<string, CacheEntry<NewsItem[]>>();
const feedCache = new Map<NewsCategory, CacheEntry<NewsFeedResult>>();
const articleCache = new Map<string, CacheEntry<NewsArticle>>();
const marketCache = new Map<string, CacheEntry<NewsMarketResult>>();

const MARKET_INDICES = ['sh000001', 'sz399001', 'sz399006', 'sh000300'];
const MARKET_WATCHLIST = ['sh600519', 'sz300750', 'sz002594', 'sh688981', 'sz300059', 'sh601318'];
const EASTMONEY_SECID_BY_CODE: Record<string, string> = {
  sh000001: '1.000001',
  sz399001: '0.399001',
  sz399006: '0.399006',
  sh000300: '1.000300',
  sh600519: '1.600519',
  sz300750: '0.300750',
  sz002594: '0.002594',
  sh688981: '1.688981',
  sz300059: '0.300059',
  sh601318: '1.601318',
};

function setBoundedCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: CacheEntry<T>, maxEntries: number): void {
  if (!cache.has(key) && cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, value);
}

function decodeXmlText(value: string): string {
  const $ = cheerio.load(`<body>${value}</body>`, { xmlMode: false });
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return value.replace(/[\u3000\s]+/g, ' ').trim();
}

function absoluteHttpUrl(value: string, baseUrl?: string): string {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function stableNewsId(url: string, title: string): string {
  return createHash('sha1').update(`${url}\n${title}`).digest('hex').slice(0, 20);
}

export function resolveAllowedNewsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.port) return null;
    if (!ALLOWED_NEWS_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.protocol === 'http:') url.protocol = 'https:';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function parseChinaNewsRss(xml: string, source: NewsSourceDefinition): NewsItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: NewsItem[] = [];

  $('item').each((_, element) => {
    const node = $(element);
    const title = normalizeText(node.find('title').first().text());
    const url = resolveAllowedNewsUrl(node.find('link').first().text().trim());
    if (!title || !url) return;
    const summary = decodeXmlText(node.find('description').first().text()).slice(0, 360);
    const publishedAt = Date.parse(node.find('pubDate').first().text().trim()) || Date.now();
    items.push({
      id: stableNewsId(url, title),
      title,
      summary,
      source: '中国新闻网',
      category: source.id,
      categoryLabel: source.name,
      publishedAt,
      url,
    });
  });

  return mergeNewsItems(items);
}

export function mergeNewsItems(items: NewsItem[]): NewsItem[] {
  const merged = new Map<string, NewsItem>();
  for (const item of items) {
    const key = item.url || normalizeText(item.title).toLowerCase();
    const current = merged.get(key);
    if (
      !current
      || item.publishedAt > current.publishedAt
      || (item.publishedAt === current.publishedAt && item.summary.length >= current.summary.length)
    ) {
      merged.set(key, item);
    }
  }
  return [...merged.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

function candidateTextLength($: cheerio.CheerioAPI, element: any): number {
  const text = normalizeText($(element).text());
  return text.length + $(element).find('p').length * 40;
}

function selectArticleRoot($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  const selectors = [
    '.left_zw',
    '[itemprop="articleBody"]',
    '.article-content',
    '.article_body',
    '.content_desc',
    '#article_content',
    '#content',
    'article',
    'main',
  ];

  let best: cheerio.Cheerio<any> | null = null;
  let bestScore = 0;
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const score = candidateTextLength($, element);
      if (score > bestScore) {
        best = $(element);
        bestScore = score;
      }
    });
    if (bestScore > 320) break;
  }
  return best;
}

function extractBlocks($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>, pageUrl: string): NewsArticleBlock[] {
  const blocks: NewsArticleBlock[] = [];
  const pushBlock = (block: NewsArticleBlock) => {
    const last = blocks[blocks.length - 1];
    if (block.type === 'paragraph' && last?.type === 'paragraph') {
      last.text = `${last.text} ${block.text}`.trim();
    } else {
      blocks.push(block);
    }
  };

  root.find('script, style, nav, footer, aside, form, iframe, [class*="ad"], [id*="ad"]').remove();
  root.children().each((_, element) => {
    const node = $(element);
    const tag = element.tagName?.toLowerCase();
    if (!tag) return;

    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = normalizeText(node.text());
      if (text) pushBlock({ type: 'heading', text });
      return;
    }

    if (tag === 'figure' || tag === 'img') {
      const image = tag === 'img' ? node : node.find('img').first();
      const src = absoluteHttpUrl(image.attr('src') || '', pageUrl);
      if (src) pushBlock({ type: 'image', src, alt: normalizeText(image.attr('alt') || '') });
      return;
    }

    if (tag !== 'p' && tag !== 'blockquote') return;

    const image = node.find('img').first();
    const rawImageSrc = image.attr('src') || '';
    const imageSrc = rawImageSrc ? absoluteHttpUrl(rawImageSrc, pageUrl) : '';
    if (imageSrc) pushBlock({ type: 'image', src: imageSrc, alt: normalizeText(image.attr('alt') || '') });

    const text = normalizeText(node.text());
    if (!text) return;
    const strongText = normalizeText(node.find('strong, b').first().text());
    const looksLikeHeading = strongText && strongText === text && text.length <= 60;
    pushBlock({ type: looksLikeHeading ? 'heading' : 'paragraph', text });
  });

  if (blocks.length) return blocks;

  root.find('p').each((_, element) => {
    const text = normalizeText($(element).text());
    if (text) pushBlock({ type: 'paragraph', text });
  });
  return blocks;
}

export function extractNewsArticle(
  html: string,
  pageUrl: string,
): Pick<NewsArticle, 'blocks' | 'coverImage' | 'contentStatus'> & { title: string } {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside, form, iframe').remove();
  const root = selectArticleRoot($);
  const blocks = root ? extractBlocks($, root, pageUrl) : [];
  const title = normalizeText(
    $('meta[property="og:title"]').attr('content')
      || $('h1').first().text()
      || $('title').first().text(),
  );
  const rawCoverImage = $('meta[property="og:image"]').attr('content')
    || root?.find('img').first().attr('src')
    || '';
  const coverImage = rawCoverImage ? absoluteHttpUrl(rawCoverImage, pageUrl) : '';

  return {
    title,
    blocks,
    coverImage,
    contentStatus: blocks.length ? 'full' : 'summary',
  };
}

async function fetchText(
  url: string,
  encoding = 'utf-8',
  timeoutMs = 8_000,
  redirect: RequestRedirect = 'follow',
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
        'user-agent': 'Mozilla/5.0 YanZhiNews/1.0 (+personal RSS reader)',
      },
      redirect,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`资讯源返回 HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new TextDecoder(encoding).decode(buffer);
  } finally {
    clearTimeout(timer);
  }
}

async function loadSource(source: NewsSourceDefinition, force: boolean): Promise<NewsSourceStatus & { items: NewsItem[] }> {
  const cached = sourceCache.get(source.url);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return { id: source.id, name: source.name, status: 'ok', itemCount: cached.value.length, items: cached.value };
  }
  try {
    const xml = await fetchText(source.url);
    const items = parseChinaNewsRss(xml, source);
    sourceCache.set(source.url, { value: items, expiresAt: Date.now() + FEED_TTL_MS });
    return { id: source.id, name: source.name, status: 'ok', itemCount: items.length, items };
  } catch {
    return {
      id: source.id,
      name: source.name,
      status: 'error',
      itemCount: cached?.value.length || 0,
      items: cached?.value || [],
    };
  }
}

export async function getNewsFeed(category: NewsCategory, force = false): Promise<NewsFeedResult> {
  const cached = feedCache.get(category);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const sources = category === 'top' ? NEWS_SOURCES : [SOURCE_BY_CATEGORY[category]];
  const loaded = await Promise.all(sources.map((source) => loadSource(source, force)));
  const items = mergeNewsItems(loaded.flatMap((source) => source.items)).slice(0, category === 'top' ? 80 : 40);
  const result: NewsFeedResult = {
    items,
    sources: loaded.map(({ items: _items, ...status }) => status),
    updatedAt: Date.now(),
    stale: loaded.every((source) => source.status === 'error'),
  };
  if (items.length) feedCache.set(category, { value: result, expiresAt: Date.now() + FEED_TTL_MS });
  return result;
}

function findCachedNewsItem(url: string): NewsItem | undefined {
  for (const entry of sourceCache.values()) {
    const found = entry.value.find((item) => item.url === url);
    if (found) return found;
  }
  for (const entry of feedCache.values()) {
    const found = entry.value.items.find((item) => item.url === url);
    if (found) return found;
  }
  return undefined;
}

export async function getNewsArticle(rawUrl: string, force = false): Promise<NewsArticle> {
  const url = resolveAllowedNewsUrl(rawUrl);
  if (!url) throw new Error('仅支持读取已授权的公开资讯来源');
  const cached = articleCache.get(url);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const fallbackItem = findCachedNewsItem(url);
  const html = await fetchText(url, 'utf-8', 12_000, 'manual');
  const extracted = extractNewsArticle(html, url);
  const item = fallbackItem || {
    id: stableNewsId(url, extracted.title || url),
    title: extracted.title || '资讯正文',
    summary: '',
    source: '中国新闻网',
    category: 'domestic' as const,
    categoryLabel: '国内',
    publishedAt: Date.now(),
    url,
  };
  const blocks = extracted.blocks.length
    ? extracted.blocks
    : [{ type: 'paragraph' as const, text: item.summary || '来源暂未提供可提取的正文，请稍后刷新。' }];
  const article: NewsArticle = {
    item: { ...item, title: item.title || extracted.title },
    blocks,
    coverImage: extracted.coverImage,
    contentStatus: extracted.contentStatus,
    fetchedAt: Date.now(),
    copyrightNote: COPYRIGHT_NOTE,
  };
  setBoundedCache(articleCache, url, { value: article, expiresAt: Date.now() + ARTICLE_TTL_MS }, 80);
  return article;
}

function parseTencentTimestamp(value: string): number {
  if (!/^\d{14}$/.test(value)) return Date.now();
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`;
  return Date.parse(iso) || Date.now();
}

export function parseTencentQuotePayload(payload: string): MarketQuote[] {
  const quotes: MarketQuote[] = [];
  for (const match of payload.matchAll(/v_([a-z0-9]+)="([^"]+)";?/gi)) {
    const code = match[1];
    const fields = match[2].split('~');
    const name = normalizeText(fields[1] || '');
    const price = Number(fields[3]);
    const previousClose = Number(fields[4]);
    const change = Number(fields[31]);
    const changePercent = Number(fields[32]);
    if (!name || !Number.isFinite(price) || !Number.isFinite(changePercent)) continue;
    quotes.push({
      code,
      name,
      price,
      previousClose,
      change: Number.isFinite(change) ? change : price - previousClose,
      changePercent,
      updatedAt: parseTencentTimestamp(fields[30] || ''),
      points: [],
    });
  }
  return quotes;
}

/**
 * 东方财富行情是 UTF-8 JSON，Android 内嵌 Node 的 TextDecoder 不支持 GBK，
 * 因此作为行情主链路；腾讯 GBK 接口仅保留为支持该编码的环境下的回退。
 */
export function parseEastmoneyQuotePayload(payload: string): MarketQuote[] {
  try {
    const parsed = JSON.parse(payload) as { data?: { diff?: unknown } };
    const raw = parsed?.data?.diff;
    const rows = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw as Record<string, unknown>)
        : [];
    const quotes: MarketQuote[] = [];
    const updatedAt = Date.now();
    for (const item of rows) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const symbol = String(row.f12 ?? '').trim().padStart(6, '0');
      const market = String(row.f13 ?? '').trim();
      const name = normalizeText(String(row.f14 ?? ''));
      const price = Number(row.f2);
      const change = Number(row.f4);
      const changePercent = Number(row.f3);
      const previousClose = Number(row.f18);
      const code = market === '1' ? `sh${symbol}` : market === '0' ? `sz${symbol}` : '';
      if (!code || !name || !Number.isFinite(price) || !Number.isFinite(changePercent)) continue;
      quotes.push({
        code,
        name,
        price,
        previousClose: Number.isFinite(previousClose) ? previousClose : price,
        change: Number.isFinite(change) ? change : price - previousClose,
        changePercent,
        updatedAt,
        points: [],
      });
    }
    return quotes;
  } catch {
    return [];
  }
}

export function parseTencentKlinePayload(payload: string, code: string): number[] {
  try {
    const parsed = JSON.parse(payload) as any;
    const stock = parsed?.data?.[code];
    const rows = stock?.day || stock?.qfqday || stock?.hfqday;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row: unknown) => Array.isArray(row) ? Number(row[2]) : Number.NaN)
      .filter((value: number) => Number.isFinite(value))
      .slice(-10);
  } catch {
    return [];
  }
}

async function getMarketQuoteSeries(code: string): Promise<number[]> {
  try {
    const payload = await fetchText(
      `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,10,qfq`,
      'utf-8',
      6_000,
    );
    return parseTencentKlinePayload(payload, code);
  } catch {
    return [];
  }
}

async function getEastmoneyMarket(): Promise<NewsMarketResult> {
  const secids = [...MARKET_INDICES, ...MARKET_WATCHLIST]
    .map((code) => EASTMONEY_SECID_BY_CODE[code])
    .filter(Boolean)
    .join(',');
  const payload = await fetchText(
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f14,f2,f3,f4,f18&secids=${secids}`,
    'utf-8',
    8_000,
  );
  const quotes = parseEastmoneyQuotePayload(payload);
  if (!quotes.length) throw new Error('东方财富行情返回为空');
  const byCode = new Map(quotes.map((quote) => [quote.code, quote]));
  return {
    indices: MARKET_INDICES.map((code) => byCode.get(code)).filter((quote): quote is MarketQuote => !!quote),
    watchlist: MARKET_WATCHLIST.map((code) => byCode.get(code)).filter((quote): quote is MarketQuote => !!quote),
    updatedAt: quotes.reduce((latest, quote) => Math.max(latest, quote.updatedAt), 0) || Date.now(),
    stale: false,
    source: '东方财富行情',
  };
}

async function getTencentMarket(): Promise<NewsMarketResult> {
  const codes = [...MARKET_INDICES, ...MARKET_WATCHLIST];
  const quoteText = await fetchText(`https://qt.gtimg.cn/q=${codes.join(',')}`, 'gbk', 8_000);
  const quotes = parseTencentQuotePayload(quoteText);
  if (!quotes.length) throw new Error('腾讯行情返回为空');
  const series = await Promise.all(quotes.map((quote) => getMarketQuoteSeries(quote.code)));
  const withSeries = quotes.map((quote, index) => ({ ...quote, points: series[index] || [] }));
  const byCode = new Map(withSeries.map((quote) => [quote.code, quote]));
  return {
    indices: MARKET_INDICES.map((code) => byCode.get(code)).filter((quote): quote is MarketQuote => !!quote),
    watchlist: MARKET_WATCHLIST.map((code) => byCode.get(code)).filter((quote): quote is MarketQuote => !!quote),
    updatedAt: withSeries.reduce((latest, quote) => Math.max(latest, quote.updatedAt), 0) || Date.now(),
    stale: false,
    source: '腾讯行情',
  };
}

export async function getNewsMarket(force = false): Promise<NewsMarketResult> {
  const cached = marketCache.get('cn-equities');
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const errors: string[] = [];
  for (const provider of [getEastmoneyMarket, getTencentMarket]) {
    try {
      const result = await provider();
      marketCache.set('cn-equities', { value: result, expiresAt: Date.now() + MARKET_TTL_MS });
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (cached) {
    marketCache.set('cn-equities', { value: cached.value, expiresAt: Date.now() + MARKET_TTL_MS });
    return { ...cached.value, stale: true };
  }
  throw new Error(`行情源暂不可用：${errors.join(' / ')}`);
}
