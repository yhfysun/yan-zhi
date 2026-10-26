/**
 * 地址栏联想候选（纯函数）。
 *
 * 接入参考（AgentScope 客户端 OmniboxSuggest）：地址栏输入时下拉「书签 / 历史 / 搜索」三类候选，
 * 键盘上下选择、回车直达。只做候选组装，不碰 DOM / 状态，便于单测。
 */
import type { BookmarkNode } from '../../utils/browserBookmarks';
import { flattenUrls, hostOfUrl } from '../../utils/browserBookmarks';

export type OmniboxKind = 'bookmark' | 'history' | 'search';

export interface OmniboxItem {
  kind: OmniboxKind;
  title: string;
  url: string;
  /** 展示用主机名（搜索项为空串，模板退化显示 url） */
  host: string;
}

export interface BuildOmniboxInput {
  query: string;
  bookmarks: BookmarkNode[];
  history: Array<{ title?: string; url?: string }>;
  searchName: string;
  searchUrl: (q: string) => string;
  /** 书签+历史最多展示几条（搜索项永远额外一条），默认 8 */
  limit?: number;
}

/** 前缀命中排前面，其次是包含命中；不命中返回 0（不进候选） */
function scoreOf(text: string, q: string): number {
  const t = text.toLowerCase();
  if (!t) return 0;
  if (t.startsWith(q)) return 3;
  const at = t.indexOf(q);
  if (at < 0) return 0;
  // 主机名首段 / 词首命中比随机包含更相关
  return at === 0 || /[./\-_:\s]/.test(t[at - 1] || '') ? 2 : 1;
}

export function buildOmniboxSuggestions(input: BuildOmniboxInput): OmniboxItem[] {
  const q = String(input.query || '').trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const limit = Math.max(1, input.limit ?? 8);

  const scored: Array<{ item: OmniboxItem; score: number; order: number }> = [];
  let order = 0;

  for (const b of flattenUrls(input.bookmarks || [])) {
    if (!b.url) continue;
    const score = Math.max(scoreOf(b.title || '', lower), scoreOf(b.url, lower));
    if (score > 0) scored.push({ item: { kind: 'bookmark', title: b.title || b.url, url: b.url, host: hostOfUrl(b.url) }, score, order: order++ });
  }
  for (const h of input.history || []) {
    if (!h.url) continue;
    const score = Math.max(scoreOf(h.title || '', lower), scoreOf(h.url, lower));
    if (score > 0) scored.push({ item: { kind: 'history', title: h.title || h.url, url: h.url, host: hostOfUrl(h.url) }, score, order: order++ });
  }

  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  const out: OmniboxItem[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const key = s.item.url.toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) continue;   // 同 URL 只出现一次（相关度高的那条优先）
    seen.add(key);
    out.push(s.item);
    if (out.length >= limit) break;
  }

  // 搜索兜底永远在最后：输入不是网址时回车即搜
  out.push({
    kind: 'search',
    title: `用${input.searchName}搜索「${q}」`,
    url: input.searchUrl(q),
    host: '',
  });
  return out;
}
