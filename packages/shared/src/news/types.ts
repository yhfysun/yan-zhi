export const NEWS_CATEGORIES = [
  'top', 'domestic', 'world', 'finance', 'society', 'tech', 'game', 'sports', 'culture', 'edu', 'health', 'chinese',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface NewsSourceStatus {
  id: string;
  name: string;
  status: 'ok' | 'error';
  itemCount: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: Exclude<NewsCategory, 'top'>;
  categoryLabel: string;
  publishedAt: number;
  url: string;
}

export interface NewsFeedResult {
  items: NewsItem[];
  sources: NewsSourceStatus[];
  updatedAt: number;
  stale: boolean;
}

export type NewsArticleBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'image'; src: string; alt: string };

export interface NewsArticle {
  item: NewsItem;
  blocks: NewsArticleBlock[];
  coverImage: string;
  contentStatus: 'full' | 'summary';
  fetchedAt: number;
  copyrightNote: string;
}

/**
 * 行情代码统一口径：`sh`/`sz` + 6 位数字（A股），`hk` + 5 位数字（港股个股），
 * `hk` + 字母（港股指数，如 hkHSI / hkHSCEI），`us` + 字母代码（美股，如 usNVDA / usDJI）。
 */
export type MarketGroupId = 'cn-index' | 'cn-hot' | 'hk' | 'us' | 'metal' | 'crypto';

export interface MarketQuote {
  code: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  updatedAt: number;
}

export interface MarketGroup {
  id: MarketGroupId;
  label: string;
  quotes: MarketQuote[];
}

export interface NewsMarketResult {
  groups: MarketGroup[];
  updatedAt: number;
  stale: boolean;
  source: string;
}

/** 日 K 线单根：日期 + OHLC + 成交量（volume 单位与源一致，仅用于相对高度）。 */
export interface KlineBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** 个股详情：实时快照 + 近 60 根日 K（K 线图数据源）。 */
export interface QuoteDetail {
  quote: MarketQuote;
  kline: KlineBar[];
  fetchedAt: number;
  source: string;
}

/** 全市场搜索结果条目（suggest 接口整理后的最小集）。 */
export interface QuoteSearchResult {
  code: string;
  name: string;
  /** 来源侧的市场标签，如 A股 / 港股 / 美股。 */
  market: string;
}

/** 行业板块条目（东方财富 BK 板块指数）。code 可直接走 /news/quote 看 K 线。 */
export interface SectorItem {
  code: string;
  name: string;
  changePercent: number;
  /** 领涨股名称（可能为空）。 */
  leader: string;
  /** 领涨股涨跌幅（%）。 */
  leaderChangePercent: number;
}

/** 行业板块动向快照：红榜 + 绿榜，供「市场动向」版块与大模型分析消费。 */
export interface SectorSnapshot {
  leaders: SectorItem[];
  laggards: SectorItem[];
  updatedAt: number;
  source: string;
  stale: boolean;
}

/** 行情列表分页（全市场 A股 / 港股 / 美股）。 */
export interface QuoteListPage {
  items: MarketQuote[];
  /** 当前页码（1 起）。 */
  pn: number;
  /** 是否还有下一页。 */
  hasMore: boolean;
}
