import { describe, it, expect } from 'vitest';
import { buildOmniboxSuggestions } from './omnibox';
import type { BookmarkNode } from '../../utils/browserBookmarks';

function bookmark(title: string, url: string): BookmarkNode {
  return { id: url, type: 'url', title, url, createdAt: 1 };
}

const search = (q: string) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`;
const base = {
  searchName: '百度',
  searchUrl: search,
  bookmarks: [bookmark('抖音创作者中心', 'https://creator.douyin.com/')],
  history: [
    { title: '抖音 — 记录美好生活', url: 'https://www.douyin.com/' },
    { title: '创作者中心', url: 'https://creator.douyin.com/' },   // 与书签同 URL
  ],
};

describe('buildOmniboxSuggestions', () => {
  it('空输入不打扰（返回空数组）', () => {
    expect(buildOmniboxSuggestions({ ...base, query: '   ' })).toEqual([]);
  });

  it('书名/历史命中按相关度排序，搜索兜底永远在最后', () => {
    const items = buildOmniboxSuggestions({ ...base, query: '创作者' });
    // 历史里「创作者中心」是前缀命中（分更高），排在书签前面；同 URL 的重复项被去重
    expect(items.map(i => i.kind)).toEqual(['history', 'search']);
    expect(items[0].title).toBe('创作者中心');
    expect(items[items.length - 1].kind).toBe('search');
    expect(items[items.length - 1].url).toContain('wd=' + encodeURIComponent('创作者'));
  });

  it('同 URL 的书签与历史只出现一次（书签优先）', () => {
    const items = buildOmniboxSuggestions({ ...base, query: 'douyin' });
    const urls = items.filter(i => i.kind !== 'search').map(i => i.url);
    expect(urls.filter(u => u.startsWith('https://creator.douyin.com'))).toHaveLength(1);
    expect(items.find(i => i.url.startsWith('https://creator.douyin.com'))!.kind).toBe('bookmark');
    expect(items.some(i => i.kind === 'history' && i.url.includes('www.douyin.com'))).toBe(true);
  });

  it('完全没有命中时也留一条搜索，回车即可搜', () => {
    const items = buildOmniboxSuggestions({ ...base, query: 'zzz-not-exist' });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('search');
  });

  it('书签+历史受 limit 限制，搜索项不占名额', () => {
    const bookmarks = Array.from({ length: 20 }, (_, i) => bookmark(`测试站 ${i}`, `https://t${i}.example.com/`));
    const items = buildOmniboxSuggestions({ ...base, bookmarks, query: '测试', limit: 3 });
    expect(items.filter(i => i.kind !== 'search')).toHaveLength(3);
    expect(items[items.length - 1].kind).toBe('search');
  });

  it('主机名可直接命中（含主机名中的点）', () => {
    const items = buildOmniboxSuggestions({ ...base, query: 'creator.douyin' });
    expect(items[0].host).toBe('creator.douyin.com');
  });
});
