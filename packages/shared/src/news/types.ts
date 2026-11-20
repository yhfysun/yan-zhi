export const NEWS_CATEGORIES = ['top', 'domestic', 'world', 'finance', 'society'] as const;

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

export interface MarketQuote {
  code: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  updatedAt: number;
  points: number[];
}

export interface NewsMarketResult {
  indices: MarketQuote[];
  watchlist: MarketQuote[];
  updatedAt: number;
  stale: boolean;
  source: string;
}
