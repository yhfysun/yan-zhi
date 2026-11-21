import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import type {
  KlineBar,
  MarketGroupId,
  MarketQuote,
  NewsArticle,
  NewsArticleBlock,
  NewsCategory,
  NewsFeedResult,
  NewsItem,
  NewsMarketResult,
  NewsSourceStatus,
  QuoteDetail,
  QuoteListPage,
  QuoteSearchResult,
  SectorSnapshot,
} from '@yan-zhi/shared';

interface NewsSourceDefinition {
  id: Exclude<NewsCategory, 'top'>;
  name: string;
  url: string;
  /** 条目来源媒体标签（RSS 源可能与分类域名不同）。 */
  sourceName: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const NEWS_SOURCES: NewsSourceDefinition[] = [
  { id: 'domestic', name: '国内', url: 'https://www.chinanews.com.cn/rss/china.xml', sourceName: '中国新闻网' },
  { id: 'world', name: '国际', url: 'https://www.chinanews.com.cn/rss/world.xml', sourceName: '中国新闻网' },
  { id: 'finance', name: '财经', url: 'https://www.chinanews.com.cn/rss/finance.xml', sourceName: '中国新闻网' },
  { id: 'society', name: '社会', url: 'https://www.chinanews.com.cn/rss/society.xml', sourceName: '中国新闻网' },
  { id: 'tech', name: '科技', url: 'https://www.ithome.com/rss', sourceName: 'IT之家' },
  { id: 'game', name: '游戏', url: 'https://www.gcores.com/rss', sourceName: '机核' },
  { id: 'sports', name: '体育', url: 'https://www.chinanews.com.cn/rss/sports.xml', sourceName: '中国新闻网' },
  { id: 'culture', name: '文化', url: 'https://www.chinanews.com.cn/rss/culture.xml', sourceName: '中国新闻网' },
  { id: 'edu', name: '教育', url: 'https://www.chinanews.com.cn/rss/edu.xml', sourceName: '中国新闻网' },
  { id: 'health', name: '健康', url: 'https://www.chinanews.com.cn/rss/jk.xml', sourceName: '中国新闻网' },
  { id: 'chinese', name: '华人', url: 'https://www.chinanews.com.cn/rss/chinese.xml', sourceName: '中国新闻网' },
];

const SOURCE_BY_CATEGORY = new Map(NEWS_SOURCES.map((source) => [source.id, source]));

interface MarketGroupDefinition {
  id: MarketGroupId;
  label: string;
  codes: string[];
}

/**
 * 行情分组：A股指数 / 热门A股 / 港股（指数 + 权重股）/ 美股（指数 + 权重股）。
 * 代码口径见 shared MarketQuote 注释；换源只需调整 GROUPS 与 codeToEastmoneySecid。
 * 列表只放精选；详情页内可通过搜索覆盖全市场任意品种。
 */
const MARKET_GROUPS: MarketGroupDefinition[] = [
  { id: 'cn-index', label: 'A股指数', codes: ['sh000001', 'sz399001', 'sz399006', 'sh000300'] },
  {
    id: 'cn-hot',
    label: '热门A股',
    codes: ['sh600519', 'sz300750', 'sz002594', 'sh688981', 'sz300059', 'sh601318', 'sh601899', 'sz000858'],
  },
  { id: 'hk', label: '港股', codes: ['hkHSI', 'hkHSCEI', 'hk00700', 'hk09988', 'hk01810', 'hk03690'] },
  { id: 'us', label: '美股', codes: ['usDJI', 'usIXIC', 'usSPX', 'usNVDA', 'usAAPL', 'usTSLA', 'usMSFT', 'usBABA'] },
  { id: 'metal', label: '贵金属', codes: ['auAUTD', 'auAUM', 'sh518880', 'sh518800', 'auGC00Y', 'auSI00Y'] },
];

const FEED_TTL_MS = 5 * 60_000;
const ARTICLE_TTL_MS = 30 * 60_000;
const MARKET_TTL_MS = 60_000;
const QUOTE_TTL_MS = 60_000;
const KLINE_BARS = 60;
const ALLOWED_NEWS_HOSTS = new Set([
  'www.chinanews.com.cn',
  'www.chinanews.com',
  'www.ithome.com',
  'ithome.com',
  'www.gcores.com',
  'gcores.com',
]);
const COPYRIGHT_NOTE = '正文由公开 RSS 与来源页面整理，仅供个人阅读；版权归原媒体及作者所有。';

const sourceCache = new Map<string, CacheEntry<NewsItem[]>>();
const feedCache = new Map<NewsCategory, CacheEntry<NewsFeedResult>>();
const articleCache = new Map<string, CacheEntry<NewsArticle>>();
const marketCache = new Map<string, CacheEntry<NewsMarketResult>>();
const quoteCache = new Map<string, CacheEntry<QuoteDetail>>();
const searchCache = new Map<string, CacheEntry<QuoteSearchResult[]>>();

/** 非常规市场代码 → 东方财富 secid（美股 NYSE / 上金所 / 上期所 / COMEX）。
 *  上金所（市场 118）的 ulist 实测只认 AUTD；Au99.99 符号带点号会被 secid 解析吞掉，不可用。 */
const SECID_OVERRIDES: Record<string, string> = {
  usBABA: '106.BABA',
  auAUTD: '118.AUTD',
  auAUM: '113.aum',
  auAGM: '113.agm',
  auGC00Y: '101.GC00Y',
  auSI00Y: '101.SI00Y',
};

/** 港股/美股指数符号 → 行情代码（f13=100 同时涵盖两类，需要符号反查消歧）。 */
const INDEX_SYMBOL_TO_CODE: Record<string, string> = {
  HSI: 'hkHSI',
  HSCEI: 'hkHSCEI',
  DJIA: 'usDJI',
  IXIC: 'usIXIC',
  SPX: 'usSPX',
  NDX: 'usNDX',
};

/** 行情代码 → 东方财富 secid：sh→1.、sz→0.、港股个股→116.、港股/美股指数→100.、美股→105/106/107.、板块→90.、商品→113/101. */
function codeToEastmoneySecid(code: string): string {
  if (/^sh\d{6}$/.test(code)) return `1.${code.slice(2)}`;
  if (/^sz\d{6}$/.test(code)) return `0.${code.slice(2)}`;
  if (/^hk/.test(code)) {
    const symbol = code.slice(2);
    return /^\d+$/.test(symbol) ? `116.${symbol}` : `100.${symbol}`;
  }
  if (/^us[A-Za-z]{1,10}$/.test(code)) {
    return SECID_OVERRIDES[code] || `105.${code.slice(2)}`;
  }
  if (/^au[A-Za-z0-9]{2,8}$/.test(code)) {
    return SECID_OVERRIDES[code] || `113.${code.slice(2).toLowerCase()}`;
  }
  if (/^bk\d{3,6}$/i.test(code)) return `90.${code.slice(2).toUpperCase()}`;
  return '';
}

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
      source: source.sourceName,
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
        // 部分站点（IT之家等）会按 UA 拦截非浏览器请求，统一带标准浏览器前缀
        'user-agent': 'Mozilla/5.0 (Linux; Android 16; Mobile) YanZhiNews/1.0',
      },
      redirect,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`资讯源返回 HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return decodeBytes(bytes, encoding);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 2026-11-21 真机实报：nodejs-mobile 的 libnode 不带 full-icu，
 * `new TextDecoder('gbk')` 直接 RangeError（桌面 Node 是 full-icu 所以正常），
 * 腾讯行情源 qt.gtimg.cn 是 GBK 编码 → 手机上行情整体 500。
 * 先走系统 TextDecoder（桌面零变化），构造失败时回退 iconv-lite（纯 JS，无原生依赖）。
 */
function decodeBytes(bytes: Uint8Array, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    if (!iconv.encodingExists(encoding)) throw error;
    return iconv.decode(Buffer.from(bytes), encoding);
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
  const sources = category === 'top' ? NEWS_SOURCES : [SOURCE_BY_CATEGORY.get(category as Exclude<NewsCategory, 'top'>)].filter(Boolean) as NewsSourceDefinition[];
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
    });
  }
  return quotes;
}

/**
 * 东方财富行情是 UTF-8 JSON，Android 内嵌 Node 的 TextDecoder 不支持 GBK，
 * 因此作为行情主链路；腾讯 GBK 接口仅保留为支持该编码的环境下的回退。
 * f13 市场：1=沪 0=深 116=港股个股 100=港股/美股指数 105/106/107=美股。
 * secidMap（可选）：secid → 行情代码 精确反查表；f13=100 同时覆盖港股与美股指数，
 * 带上它才能正确区分 hkHSI 与 usDJI，否则走启发式兜底。
 */
export function parseEastmoneyQuotePayload(payload: string, secidMap?: Map<string, string>): MarketQuote[] {
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
      const rawSymbol = String(row.f12 ?? '').trim();
      const market = String(row.f13 ?? '').trim();
      const name = normalizeText(String(row.f14 ?? ''));
      const price = Number(row.f2);
      const change = Number(row.f4);
      const changePercent = Number(row.f3);
      const previousClose = Number(row.f18);
      let code = secidMap?.get(`${market}.${rawSymbol}`) || '';
      if (!code) {
        if (market === '1' && /^\d{1,6}$/.test(rawSymbol)) code = `sh${rawSymbol.padStart(6, '0')}`;
        else if (market === '0' && /^\d{1,6}$/.test(rawSymbol)) code = `sz${rawSymbol.padStart(6, '0')}`;
        else if (market === '116' && /^\d{1,5}$/.test(rawSymbol)) code = `hk${rawSymbol.padStart(5, '0')}`;
        else if (market === '105' || market === '106' || market === '107') code = `us${rawSymbol}`;
        else if (market === '100') code = INDEX_SYMBOL_TO_CODE[rawSymbol] || `hk${rawSymbol}`;
      }
      if (!code || !name || !Number.isFinite(price) || !Number.isFinite(changePercent)) continue;
      quotes.push({
        code,
        name,
        price,
        previousClose: Number.isFinite(previousClose) ? previousClose : price,
        change: Number.isFinite(change) ? change : price - previousClose,
        changePercent,
        updatedAt,
      });
    }
    return quotes;
  } catch {
    return [];
  }
}

/** 东方财富日 K（fields2 f51-f56：日期,开,收,高,低,量）。 */
export function parseEastmoneyKlinePayload(payload: string): KlineBar[] {
  try {
    const parsed = JSON.parse(payload) as { data?: { klines?: unknown } };
    const rows = Array.isArray(parsed?.data?.klines) ? (parsed.data.klines as unknown[]) : [];
    const bars: KlineBar[] = [];
    for (const row of rows) {
      if (typeof row !== 'string') continue;
      const parts = row.split(',');
      const date = (parts[0] || '').trim();
      const open = Number(parts[1]);
      const close = Number(parts[2]);
      const high = Number(parts[3]);
      const low = Number(parts[4]);
      const volume = Number(parts[5]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (![open, close, high, low].every(Number.isFinite)) continue;
      bars.push({ date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 });
    }
    return bars;
  } catch {
    return [];
  }
}

/** 腾讯日 K 回退（qfqday/hfqday/day 行：[日期, 开, 收, 高, 低, 量, ...]）。 */
export function parseTencentKlinePayload(payload: string, code: string): KlineBar[] {
  try {
    const parsed = JSON.parse(payload) as any;
    const stock = parsed?.data?.[code];
    const rows = stock?.qfqday || stock?.hfqday || stock?.day;
    if (!Array.isArray(rows)) return [];
    const bars: KlineBar[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const date = String(row[0] || '');
      const open = Number(row[1]);
      const close = Number(row[2]);
      const high = Number(row[3]);
      const low = Number(row[4]);
      const volume = Number(row[5]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (![open, close, high, low].every(Number.isFinite)) continue;
      bars.push({ date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 });
    }
    return bars;
  } catch {
    return [];
  }
}

function allMarketCodes(): string[] {
  return [...new Set(MARKET_GROUPS.flatMap((group) => group.codes))];
}

/** secid → 行情代码 反查表（f13=100 需要精确区分港股/美股指数）。 */
function buildSecidMap(codes: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const code of codes) {
    const secid = codeToEastmoneySecid(code);
    if (secid) map.set(secid, code);
  }
  return map;
}

function buildMarketGroups(byCode: Map<string, MarketQuote>, fallbackUpdatedAt: number): NewsMarketResult {
  const groups = MARKET_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    quotes: group.codes.map((code) => byCode.get(code)).filter((quote): quote is MarketQuote => !!quote),
  })).filter((group) => group.quotes.length > 0);
  return {
    groups,
    updatedAt: fallbackUpdatedAt || Date.now(),
    stale: false,
    source: '',
  };
}

async function getEastmoneyMarket(): Promise<NewsMarketResult> {
  const secids = allMarketCodes()
    .map((code) => codeToEastmoneySecid(code))
    .filter(Boolean)
    .join(',');
  const payload = await fetchText(
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f14,f2,f3,f4,f18&secids=${secids}`,
    'utf-8',
    8_000,
  );
  const quotes = parseEastmoneyQuotePayload(payload, buildSecidMap(allMarketCodes()));
  if (!quotes.length) throw new Error('东方财富行情返回为空');
  const byCode = new Map(quotes.map((quote) => [quote.code, quote]));
  const result = buildMarketGroups(byCode, 0);
  result.source = '东方财富行情';
  result.updatedAt = quotes.reduce((latest, quote) => Math.max(latest, quote.updatedAt), 0) || Date.now();
  return result;
}

async function getTencentMarket(): Promise<NewsMarketResult> {
  const quoteText = await fetchText(`https://qt.gtimg.cn/q=${allMarketCodes().join(',')}`, 'gbk', 8_000);
  const quotes = parseTencentQuotePayload(quoteText);
  if (!quotes.length) throw new Error('腾讯行情返回为空');
  const byCode = new Map(quotes.map((quote) => [quote.code, quote]));
  const result = buildMarketGroups(byCode, 0);
  result.source = '腾讯行情';
  result.updatedAt = quotes.reduce((latest, quote) => Math.max(latest, quote.updatedAt), 0) || Date.now();
  return result;
}

export async function getNewsMarket(force = false): Promise<NewsMarketResult> {
  const cached = marketCache.get('cn-hk-equities');
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const errors: string[] = [];
  for (const provider of [getEastmoneyMarket, getTencentMarket]) {
    try {
      const result = await provider();
      // 虚拟币组：Gate.io 源失败不拖累股市行情（各自独立降级）
      try {
        const crypto = await fetchCryptoTickers(force);
        result.groups.push({ id: 'crypto', label: '虚拟币', quotes: crypto.slice(0, 8) });
      } catch {
        /* 币圈源不可用时仅少一个分组 */
      }
      marketCache.set('cn-hk-equities', { value: result, expiresAt: Date.now() + MARKET_TTL_MS });
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (cached) {
    marketCache.set('cn-hk-equities', { value: cached.value, expiresAt: Date.now() + MARKET_TTL_MS });
    return { ...cached.value, stale: true };
  }
  throw new Error(`行情源暂不可用：${errors.join(' / ')}`);
}

function isValidMarketCode(code: string): boolean {
  return /^(sh\d{6}|sz\d{6}|hk(\d{1,5}|[A-Za-z]{2,8})|us[A-Za-z]{1,10}|au[A-Za-z0-9]{2,8}|bk\d{3,6})$/.test(code);
}

/** 东方财富日 K 主链路（UTF-8，Android 兼容），腾讯为回退。 */
async function fetchKlineBars(code: string): Promise<KlineBar[]> {
  const secid = codeToEastmoneySecid(code);
  if (secid) {
    try {
      const payload = await fetchText(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}`
          + `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=${KLINE_BARS}`,
        'utf-8',
        8_000,
      );
      const bars = parseEastmoneyKlinePayload(payload);
      if (bars.length) return bars;
    } catch {
      // 落到腾讯回退
    }
  }
  const payload = await fetchText(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,${KLINE_BARS},qfq`,
    'utf-8',
    6_000,
  );
  return parseTencentKlinePayload(payload, code);
}

/** 个股/指数详情：实时快照 + 近 60 根日 K，供行情详情页与 K 线图渲染。 */
export async function getNewsQuoteDetail(rawCode: string, force = false): Promise<QuoteDetail> {
  const code = normalizeText(rawCode).toLowerCase();
  // 虚拟币（c 前缀）走 Gate.io 独立链路，与股市代码体系隔离
  if (isCryptoCode(code)) {
    return getCryptoQuoteDetail(cryptoSymbolFromCode(code), code, force);
  }
  if (!isValidMarketCode(code)) throw new Error('不支持的商品代码');
  const cached = quoteCache.get(code);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  // 快照：优先东方财富（UTF-8），腾讯 GBK 回退
  let quote: MarketQuote | null = null;
  let source = '';
  const secid = codeToEastmoneySecid(code);
  if (secid) {
    try {
      const payload = await fetchText(
        `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f13,f14,f2,f3,f4,f18&secids=${secid}`,
        'utf-8',
        8_000,
      );
      const found = parseEastmoneyQuotePayload(payload, buildSecidMap([code])).find((item) => item.code === code);
      if (found) {
        quote = found;
        source = '东方财富行情';
      }
    } catch {
      // 落到腾讯回退
    }
  }
  if (!quote) {
    const quoteText = await fetchText(`https://qt.gtimg.cn/q=${code}`, 'gbk', 8_000);
    const found = parseTencentQuotePayload(quoteText).find((item) => item.code === code);
    if (!found) throw new Error('未找到该商品的实时行情');
    quote = found;
    source = '腾讯行情';
  }

  const kline = await fetchKlineBars(code);
  const detail: QuoteDetail = { quote, kline, fetchedAt: Date.now(), source };
  setBoundedCache(quoteCache, code, { value: detail, expiresAt: Date.now() + QUOTE_TTL_MS }, 40);
  return detail;
}

const SEARCH_TTL_MS = 60_000;
const SEARCH_ENDPOINT = 'https://searchapi.eastmoney.com/api/suggest/get'
  + '?token=D43BF722C8E33BDC906FB84D85E326E8&type=14&count=10';

/**
 * 全市场搜索：按代码或名称前缀 suggest（东方财富）。返回统一口径的行情代码，
 * 详情页拿到 code 后直接走 /news/quote 渲染 K 线。
 */
export async function searchQuotes(rawQuery: string): Promise<QuoteSearchResult[]> {
  const query = normalizeText(rawQuery);
  if (!query || query.length > 24) return [];
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const payload = await fetchText(`${SEARCH_ENDPOINT}&input=${encodeURIComponent(query)}`, 'utf-8', 6_000);
  const results: QuoteSearchResult[] = [];

  // 虚拟币匹配（币种符号/中文名模糊）：东财挂不挂都保证能搜到币
  for (const coin of CRYPTO_COINS) {
    if (coin.symbol.toLowerCase().includes(key) || coin.name.includes(query)) {
      results.push({ code: `c${coin.symbol}`, name: coin.name, market: '虚拟币' });
      if (results.length >= 4) break;
    }
  }

  try {
    const parsed = JSON.parse(payload) as {
      QuotationCodeTable?: { Data?: Array<Record<string, unknown>> };
    };
    const rows = parsed.QuotationCodeTable?.Data || [];
    const seen = new Set<string>();
    for (const row of rows) {
      // suggest 返回的行情 secid 字段名为 QuoteID（形如 1.600519 / 116.00700 / 105.NVDA）
      const quotationCode = String(row.QuoteID ?? row.QuotationCode ?? '').trim();
      const name = normalizeText(String(row.Name ?? ''));
      const market = normalizeText(String(row.SecurityTypeName ?? ''));
      if (!quotationCode.includes('.') || !name) continue;
      const [marketPart, symbol] = quotationCode.split('.', 2);
      let code = '';
      if (marketPart === '1' && /^\d{6}$/.test(symbol)) code = `sh${symbol}`;
      else if (marketPart === '0' && /^\d{6}$/.test(symbol)) code = `sz${symbol}`;
      else if (marketPart === '116' && /^\d{1,5}$/.test(symbol)) code = `hk${symbol.padStart(5, '0')}`;
      else if (marketPart === '105' || marketPart === '106' || marketPart === '107') code = `us${symbol}`;
      else if (marketPart === '100') code = INDEX_SYMBOL_TO_CODE[symbol] || (symbol && /^[A-Za-z]+$/.test(symbol) ? `hk${symbol}` : '');
      if (!code || !isValidMarketCode(code) || seen.has(code)) continue;
      seen.add(code);
      results.push({ code, name, market: market || '行情' });
      if (results.length >= 8) break;
    }
  } catch {
    // 东财 suggest 失败时虚拟币匹配结果仍然返回
  }
  setBoundedCache(searchCache, key, { value: results, expiresAt: Date.now() + SEARCH_TTL_MS }, 60);
  return results;
}

const SECTOR_TTL_MS = 60_000;
const SECTOR_SOURCE = '东方财富行业板块';
const sectorCache = new Map<string, CacheEntry<SectorSnapshot>>();

/**
 * 行业板块动向：东方财富 BK 板块指数（fs=m:90 t:2），按涨跌幅排序取红榜/绿榜。
 * 板块 code（bk 开头）可直接走 /news/quote 拉板块 K 线 —— 这份结构化数据也是
 * 后续大模型做市场分析的基础输入之一。
 */
export async function getSectorSnapshot(force = false): Promise<SectorSnapshot> {
  const cached = sectorCache.get('industry');
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const payload = await fetchText(
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&fid=f3'
      + '&fs=m:90+t:2&fields=f12,f14,f3,f128,f136',
    'utf-8',
    8_000,
  );
  const parsed = JSON.parse(payload) as { data?: { diff?: unknown } };
  const raw = parsed?.data?.diff;
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const items = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const boardCode = String(record.f12 ?? '').trim();
    const name = normalizeText(String(record.f14 ?? ''));
    const changePercent = Number(record.f3);
    if (!/^BK\d{3,6}$/.test(boardCode) || !name || !Number.isFinite(changePercent)) continue;
    items.push({
      code: `bk${boardCode}`,
      name,
      changePercent,
      leader: normalizeText(String(record.f128 ?? '')),
      leaderChangePercent: Number(record.f136) || 0,
    });
  }
  if (items.length < 12) throw new Error('行业板块数据不足');

  const sorted = items.sort((a, b) => b.changePercent - a.changePercent);
  const snapshot: SectorSnapshot = {
    leaders: sorted.slice(0, 8),
    laggards: sorted.slice(-6).reverse(),
    updatedAt: Date.now(),
    source: SECTOR_SOURCE,
    stale: false,
  };
  sectorCache.set('industry', { value: snapshot, expiresAt: Date.now() + SECTOR_TTL_MS });
  return snapshot;
}

const QUOTE_LIST_PAGE_SIZE = 20;
/** 全市场列表的 clist 筛选集：A股沪深主板/创业板/科创版，港股全市场，美股三大所。 */
const QUOTE_LIST_FS: Record<'cn' | 'hk' | 'us', string> = {
  cn: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
  hk: 'm:116',
  us: 'm:105,m:106,m:107',
};/**
 * 全市场股票分页列表（行情详情「列表页」数据源），按涨跌幅降序。
 * 返回统一口径代码，前端点选后走 /news/quote 渲染 K 线。
 * market=crypto 时走 Gate.io 虚拟币清单（单页全量）。
 */
export async function getQuoteListPage(market: 'cn' | 'hk' | 'us' | 'crypto', pn: number): Promise<QuoteListPage> {
  if (market === 'crypto') {
    const quotes = await fetchCryptoTickers();
    return { items: quotes, pn: 1, hasMore: false };
  }
  const fs = QUOTE_LIST_FS[market];
  if (!fs) throw new Error('不支持的市场');
  const page = Number.isFinite(pn) && pn >= 1 ? Math.floor(pn) : 1;
  const payload = await fetchText(
    `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${QUOTE_LIST_PAGE_SIZE}&po=1&np=1&fltt=2&fid=f3`
      + `&fs=${encodeURIComponent(fs)}&fields=f12,f13,f14,f2,f3,f4,f18`,
    'utf-8',
    8_000,
  );
  const parsed = JSON.parse(payload) as { data?: { total?: number; diff?: unknown } };
  const quotes = parseEastmoneyQuotePayload(payload);
  const total = Number(parsed?.data?.total) || 0;
  return {
    items: quotes,
    pn: page,
    hasMore: page * QUOTE_LIST_PAGE_SIZE < total,
  };
}

// ── 虚拟币行情（Gate.io 公共接口，国内直连可达；东财/腾讯无币圈数据）。
//    代码口径：`c` + 大写币种符号（cBTC / cSUI …），计价一律 USDT。
//    K 线 candlesticks 数组字段序（实测校验，跨日收盘/开盘连续性吻合）：
//    [time(秒), quoteVolume, close, high, low, open, baseVolume, confirmed]，升序。
const CRYPTO_SOURCE = 'Gate.io 行情';
const GATE_BASE = 'https://api.gateio.ws/api/v4';
const CRYPTO_TTL_MS = 30_000;
const cryptoTickerCache = new Map<string, CacheEntry<MarketQuote[]>>();

const CRYPTO_COINS = [
  { symbol: 'BTC', name: '比特币' },
  { symbol: 'ETH', name: '以太坊' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'BNB', name: '币安币' },
  { symbol: 'XRP', name: '瑞波币' },
  { symbol: 'DOGE', name: '狗狗币' },
  { symbol: 'ADA', name: '艾达币' },
  { symbol: 'SUI', name: 'Sui' },
  { symbol: 'LTC', name: '莱特币' },
  { symbol: 'LINK', name: 'Chainlink' },
] as const;

function cryptoSymbolFromCode(code: string): string {
  return code.slice(1).toUpperCase();
}

function isCryptoCode(code: string): boolean {
  if (!/^c[a-z0-9]{2,10}$/.test(code)) return false;
  const symbol = cryptoSymbolFromCode(code);
  return CRYPTO_COINS.some((coin) => coin.symbol === symbol);
}

async function fetchCryptoTickers(force = false): Promise<MarketQuote[]> {
  const cached = cryptoTickerCache.get('all');
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  // 单币对失败（下架/停牌等）只跳过该币，不拖垮整组
  const settled = await Promise.allSettled(
    CRYPTO_COINS.map(async (coin) => {
      const payload = await fetchText(`${GATE_BASE}/spot/tickers?currency_pair=${coin.symbol}_USDT`, 'utf-8', 8_000);
      const rows = JSON.parse(payload) as Array<Record<string, unknown>>;
      const row = rows[0];
      if (!row) throw new Error(`${coin.name}行情缺失`);
      const price = Number(row.last);
      const changePercent = Number(row.change_percentage);
      // Gate 不直接给昨收：由 24h 涨跌幅反推（与股市口径统一，供涨跌额/颜色计算）
      const previousClose = Number.isFinite(price) && Number.isFinite(changePercent) && changePercent !== -100
        ? price / (1 + changePercent / 100)
        : price;
      return {
        code: `c${coin.symbol}`,
        name: coin.name,
        price,
        previousClose,
        change: price - previousClose,
        changePercent,
        updatedAt: Date.now(),
      } satisfies MarketQuote;
    }),
  );
  const quotes = settled
    .filter((entry) => entry.status === 'fulfilled')
    .map((entry) => entry.value as MarketQuote);
  if (!quotes.length) throw new Error('虚拟币行情源不可用');
  cryptoTickerCache.set('all', { value: quotes, expiresAt: Date.now() + CRYPTO_TTL_MS });
  return quotes;
}

async function fetchCryptoKline(symbol: string): Promise<KlineBar[]> {
  const payload = await fetchText(
    `${GATE_BASE}/spot/candlesticks?currency_pair=${symbol}_USDT&interval=1d&limit=${KLINE_BARS}`,
    'utf-8',
    8_000,
  );
  const rows = JSON.parse(payload) as string[][];
  const bars: KlineBar[] = [];
  for (const row of rows) {
    const ts = Number(row[0]) * 1000;
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const open = Number(row[5]);
    const volume = Number(row[6]);
    const day = new Date(ts);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (![open, close, high, low].every(Number.isFinite)) continue;
    bars.push({ date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return bars;
}

/** 虚拟币详情：Gate.io 实时 ticker + 近 60 根日 K。 */
async function getCryptoQuoteDetail(symbol: string, code: string, force: boolean): Promise<QuoteDetail> {
  const cacheKey = code.toLowerCase();
  const cached = quoteCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const tickers = await fetchCryptoTickers(force);
  const quote = tickers.find((item) => item.code === `c${symbol}`);
  if (!quote) throw new Error('未找到该虚拟币的实时行情');
  const kline = await fetchCryptoKline(symbol);
  const detail: QuoteDetail = { quote, kline, fetchedAt: Date.now(), source: CRYPTO_SOURCE };
  setBoundedCache(quoteCache, cacheKey, { value: detail, expiresAt: Date.now() + CRYPTO_TTL_MS }, 40);
  return detail;
}
