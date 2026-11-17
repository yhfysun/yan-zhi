import type { BrowserAnnotation, BrowserAnnotationStatus } from '@yan-zhi/shared';

export const ANNOTATION_HISTORY_LIMIT = 500;

export function annotationPageKey(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    parsed.hash = parsed.hash || '';
    return parsed.href;
  } catch {
    return raw;
  }
}

export function annotationBelongsTo(
  item: BrowserAnnotation,
  tabId: string,
  pageUrl: string,
): boolean {
  if (item.tabId && tabId && item.tabId !== tabId) return false;
  const pageKey = annotationPageKey(pageUrl);
  if (item.pageKey && pageKey && item.pageKey !== pageKey) return false;
  if (!item.pageKey && pageKey && item.pageUrl && annotationPageKey(item.pageUrl) !== pageKey) return false;
  return true;
}

export function annotationsForPage(
  items: BrowserAnnotation[],
  tabId: string,
  pageUrl: string,
  status?: BrowserAnnotationStatus,
): BrowserAnnotation[] {
  return items
    .filter((item) => annotationBelongsTo(item, tabId, pageUrl))
    .filter((item) => !status || (item.status || 'draft') === status)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function withAnnotationStatus(
  items: BrowserAnnotation[],
  ids: Iterable<string>,
  status: BrowserAnnotationStatus,
  now = Date.now(),
): BrowserAnnotation[] {
  const wanted = new Set(ids);
  return items.map((item) => wanted.has(item.id) ? { ...item, status, updatedAt: now } : item);
}

export function mergeAnnotationHistory(
  current: BrowserAnnotation[],
  incoming: BrowserAnnotation[],
): BrowserAnnotation[] {
  const byId = new Map<string, BrowserAnnotation>();
  for (const item of [...current, ...incoming]) {
    if (!item?.id || !item.comment?.trim()) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return [...byId.values()]
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .slice(0, ANNOTATION_HISTORY_LIMIT);
}

export interface AnnotationStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function historyKey(scope: string): string {
  return `yz.browser.annotations.v2.${scope || 'page'}`;
}

export function loadAnnotationHistory(
  scope: string,
  storage?: AnnotationStorageLike | null,
): BrowserAnnotation[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(historyKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return mergeAnnotationHistory([], parsed as BrowserAnnotation[]);
  } catch {
    return [];
  }
}

export function saveAnnotationHistory(
  scope: string,
  items: BrowserAnnotation[],
  storage?: AnnotationStorageLike | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(historyKey(scope), JSON.stringify(mergeAnnotationHistory([], items)));
  } catch {
    // 存储满/隐私模式失败不阻断批注本身。
  }
}

export function browserLocalStorage(): AnnotationStorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore
  }
  return null;
}

export function annotationDisplayIndex(
  item: BrowserAnnotation,
  visible: BrowserAnnotation[],
): number {
  const index = visible.findIndex((candidate) => candidate.id === item.id);
  return index >= 0 ? index + 1 : 1;
}
