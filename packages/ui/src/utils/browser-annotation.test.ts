import { describe, expect, it } from 'vitest';
import type { BrowserAnnotation } from '@yan-zhi/shared';
import {
  annotationBelongsTo,
  annotationPageKey,
  annotationsForPage,
  loadAnnotationHistory,
  mergeAnnotationHistory,
  saveAnnotationHistory,
  withAnnotationStatus,
} from './browser-annotation';

function anno(over: Partial<BrowserAnnotation> = {}): BrowserAnnotation {
  return {
    id: 'a1',
    tabId: 'tab-1',
    pageKey: 'https://example.com/docs',
    type: 'element',
    label: 'button「保存」',
    rect: { x: 1, y: 2, w: 3, h: 4 },
    comment: '改一下',
    pageUrl: 'https://example.com/docs',
    createdAt: 1,
    status: 'draft',
    ...over,
  };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('browser annotation v2 helpers', () => {
  it('keeps SPA hash routes as distinct page keys', () => {
    expect(annotationPageKey('http://localhost:5173/#/learning-v2'))
      .toBe('http://localhost:5173/#/learning-v2');
    expect(annotationPageKey('http://localhost:5173/#/office'))
      .not.toBe(annotationPageKey('http://localhost:5173/#/learning-v2'));
  });

  it('isolates annotations by tab and page', () => {
    const item = anno();
    expect(annotationBelongsTo(item, 'tab-1', 'https://example.com/docs')).toBe(true);
    expect(annotationBelongsTo(item, 'tab-2', 'https://example.com/docs')).toBe(false);
    expect(annotationBelongsTo(item, 'tab-1', 'https://example.com/other')).toBe(false);
  });

  it('filters drafts for the active page without losing sent history', () => {
    const items = [
      anno({ id: 'draft' }),
      anno({ id: 'sent', status: 'sent' }),
      anno({ id: 'other', pageKey: 'https://example.com/other' }),
    ];
    expect(annotationsForPage(items, 'tab-1', 'https://example.com/docs', 'draft').map(i => i.id))
      .toEqual(['draft']);
    expect(annotationsForPage(items, 'tab-1', 'https://example.com/docs').map(i => i.id))
      .toEqual(['draft', 'sent']);
  });

  it('marks only the selected annotation ids as sent', () => {
    const next = withAnnotationStatus(
      [anno({ id: 'a' }), anno({ id: 'b' })],
      ['b'],
      'sent',
      42,
    );
    expect(next[0].status).toBe('draft');
    expect(next[1]).toMatchObject({ status: 'sent', updatedAt: 42 });
  });

  it('merges duplicate ids and keeps the newest payload', () => {
    const merged = mergeAnnotationHistory(
      [anno({ comment: '旧内容' })],
      [anno({ comment: '新内容', updatedAt: 9 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].comment).toBe('新内容');
  });

  it('persists and restores history per browser scope', () => {
    const storage = memoryStorage();
    saveAnnotationHistory('preview', [anno()], storage);
    expect(loadAnnotationHistory('preview', storage)).toHaveLength(1);
    expect(loadAnnotationHistory('page', storage)).toEqual([]);
  });
});
