// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import News from './News.vue';

const apiState = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../api/client', () => ({
  api: { get: apiState.get },
}));

const topItems = [
  {
    id: 'n-top-1',
    title: '华强北的亚太创新新周期',
    summary: '从电子第一街走向新质生产力策源地。',
    source: '中国新闻网',
    category: 'finance',
    categoryLabel: '财经',
    publishedAt: Date.parse('2026-11-20T10:06:19+08:00'),
    url: 'https://www.chinanews.com.cn/cj/2026/11-20/10735075.shtml',
  },
  {
    id: 'n-top-2',
    title: '微短剧出海成为文化新现象',
    summary: '公开数据披露了微短剧海外市场的最新变化。',
    source: '中国新闻网',
    category: 'society',
    categoryLabel: '社会',
    publishedAt: Date.parse('2026-11-20T10:03:41+08:00'),
    url: 'https://www.chinanews.com.cn/sh/2026/11-20/10735071.shtml',
  },
];

const worldItems = [{
  ...topItems[0],
  id: 'n-world-1',
  title: '国际社会关注区域合作新进展',
  category: 'world',
  categoryLabel: '国际',
  url: 'https://www.chinanews.com.cn/gj/2026/11-20/10735001.shtml',
}];

function success(data: unknown) {
  return { data };
}

let app: App | null = null;

beforeEach(() => {
  apiState.get.mockReset();
  apiState.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/news/feed?category=world')) {
      return success({
        items: worldItems,
        sources: [{ id: 'world', name: '国际', status: 'ok', itemCount: 1 }],
        updatedAt: Date.parse('2026-11-20T10:10:00+08:00'),
        stale: false,
      });
    }
    if (url.startsWith('/news/feed?')) {
      return success({
        items: topItems,
        sources: [
          { id: 'domestic', name: '国内', status: 'ok', itemCount: 1 },
          { id: 'world', name: '国际', status: 'ok', itemCount: 1 },
        ],
        updatedAt: Date.parse('2026-11-20T10:10:00+08:00'),
        stale: false,
      });
    }
    if (url.startsWith('/news/article?')) {
      return success({
        item: topItems[0],
        blocks: [
          { type: 'paragraph', text: 'APEC 来了，华强北的订单爆了。' },
          { type: 'heading', text: '深圳速度的生动诠释' },
          { type: 'paragraph', text: '上午设计，下午打样，次日量产。' },
          { type: 'image', src: 'https://example.invalid/broken.jpg', alt: '失效配图' },
        ],
        coverImage: 'https://www.chinanews.com.cn/cover-test.jpg',
        contentStatus: 'full',
        fetchedAt: Date.now(),
        copyrightNote: '版权归原媒体及作者所有。',
      });
    }
    if (url.startsWith('/news/market')) {
      return success({
        indices: [{
          code: 'sh000001',
          name: '上证指数',
          price: 3511.27,
          previousClose: 3577.62,
          change: -66.35,
          changePercent: -1.85,
          updatedAt: Date.parse('2026-11-20T10:16:03+08:00'),
          points: [3600, 3585, 3575, 3511],
        }],
        watchlist: [{
          code: 'sh600519',
          name: '贵州茅台',
          price: 1439.5,
          previousClose: 1460.21,
          change: -20.71,
          changePercent: -1.42,
          updatedAt: Date.parse('2026-11-20T10:15:59+08:00'),
          points: [1450, 1442, 1460, 1439],
        }],
        updatedAt: Date.parse('2026-11-20T10:16:03+08:00'),
        stale: false,
        source: '腾讯行情',
      });
    }
    return { error: 'not found' };
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function mountNews(): Promise<HTMLElement> {
  const host = document.createElement('div');
  host.className = 'app-shell';
  document.body.appendChild(host);
  app = createApp(News as unknown as App);
  app.mount(host);
  await nextTick();
  return host;
}

describe('资讯中心', () => {
  it('同时加载今日要闻与市场快照', async () => {
    const host = await mountNews();
    await vi.waitFor(() => {
      expect(host.textContent).toContain('今日重点');
      expect(host.textContent).toContain('华强北的亚太创新新周期');
      expect(host.textContent).toContain('上证指数');
      expect(host.textContent).toContain('贵州茅台');
      expect(host.querySelector('.news-lead-cover')).toBeTruthy();
      expect(host.querySelector('.news-channel-refresh')).toBeTruthy();
      expect(host.textContent).not.toContain('DAILY BRIEF');
    });
    expect(apiState.get).toHaveBeenCalledWith('/news/feed?category=top');
    expect(apiState.get).toHaveBeenCalledWith('/news/market');
  });

  it('切换国际分类会加载对应资讯', async () => {
    const host = await mountNews();
    await vi.waitFor(() => expect(host.textContent).toContain('华强北的亚太创新新周期'));

    const world = [...host.querySelectorAll<HTMLButtonElement>('.news-category')]
      .find((button) => button.textContent?.includes('国际'));
    world?.click();

    await vi.waitFor(() => {
      expect(apiState.get).toHaveBeenCalledWith('/news/feed?category=world');
      expect(host.textContent).toContain('国际社会关注区域合作新进展');
    });
  });

  it('点击资讯后在应用内打开可读正文，而不是跳转外部页面', async () => {
    const host = await mountNews();
    await vi.waitFor(() => expect(host.textContent).toContain('华强北的亚太创新新周期'));

    const story = host.querySelector<HTMLButtonElement>('.news-feed-story');
    story?.click();

    await vi.waitFor(() => {
      expect(apiState.get).toHaveBeenCalledWith(expect.stringContaining('/news/article?url='));
      expect(document.querySelector('.news-mobile-reader')).toBeTruthy();
      expect(document.querySelector('.news-reader-body')?.textContent).toContain('APEC 来了，华强北的订单爆了。');
      expect(document.querySelector('.news-reader-body')?.textContent).toContain('深圳速度的生动诠释');
      expect(document.querySelector<HTMLElement>('.news-reader-scroll')?.tabIndex).toBe(0);
      expect(document.querySelector('.news-reader')?.textContent).not.toContain('应用内阅读');
      expect(host.hasAttribute('inert')).toBe(true);
      expect(host.getAttribute('aria-hidden')).toBe('true');
    });

    const image = document.querySelector<HTMLImageElement>('.news-reader-body figure img');
    expect(image).toBeTruthy();
    image?.dispatchEvent(new Event('error'));
    expect(image?.closest('figure')?.getAttribute('style')).toContain('display: none');
  });

  it('退出移动阅读器后恢复底层应用的可访问性', async () => {
    const host = await mountNews();
    await vi.waitFor(() => expect(host.textContent).toContain('华强北的亚太创新新周期'));
    host.querySelector<HTMLButtonElement>('.news-feed-story')?.click();
    await vi.waitFor(() => expect(host.hasAttribute('inert')).toBe(true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await vi.waitFor(() => {
      expect(document.querySelector('.news-mobile-reader')).toBeFalsy();
      expect(host.hasAttribute('inert')).toBe(false);
      expect(host.hasAttribute('aria-hidden')).toBe(false);
    });
  });

  it('Android 返回手势先关闭资讯正文，不把页面带回上一路由', async () => {
    const host = await mountNews();
    await vi.waitFor(() => expect(host.textContent).toContain('华强北的亚太创新新周期'));
    host.querySelector<HTMLButtonElement>('.news-feed-story')?.click();
    await vi.waitFor(() => expect(host.hasAttribute('inert')).toBe(true));

    const back = new CustomEvent('yz:mobile-back', { cancelable: true });
    expect(document.dispatchEvent(back)).toBe(false);

    await vi.waitFor(() => {
      expect(document.querySelector('.news-mobile-reader')).toBeFalsy();
      expect(host.hasAttribute('inert')).toBe(false);
      expect(host.textContent).toContain('华强北的亚太创新新周期');
    });
  });

  it('较快返回的新正文不会被前一条慢请求覆盖', async () => {
    let resolveFirstArticle!: (value: unknown) => void;
    apiState.get.mockImplementation(async (url: string) => {
      if (url.includes(encodeURIComponent(topItems[0].url))) {
        return new Promise((resolve) => {
          resolveFirstArticle = resolve;
        });
      }
      if (url.startsWith('/news/article?')) {
        return success({
          item: topItems[1],
          blocks: [{ type: 'paragraph', text: '这是后点开的第二条正文。' }],
          coverImage: '',
          contentStatus: 'full',
          fetchedAt: Date.now(),
          copyrightNote: '版权归原媒体及作者所有。',
        });
      }
      if (url.startsWith('/news/feed?')) {
        return success({
          items: topItems,
          sources: [{ id: 'domestic', name: '国内', status: 'ok', itemCount: 2 }],
          updatedAt: Date.now(),
          stale: false,
        });
      }
      return success({
        indices: [],
        watchlist: [],
        updatedAt: Date.now(),
        stale: false,
        source: '腾讯行情',
      });
    });

    const host = await mountNews();
    await vi.waitFor(() => expect(host.querySelectorAll('.news-feed-story')).toHaveLength(2));
    const stories = host.querySelectorAll<HTMLButtonElement>('.news-feed-story');
    stories[0].click();
    stories[1].click();

    await vi.waitFor(() => {
      expect(document.querySelector('.news-reader-body')?.textContent).toContain('这是后点开的第二条正文。');
    });
    resolveFirstArticle(success({
      item: topItems[0],
      blocks: [{ type: 'paragraph', text: '这是较早请求的旧正文。' }],
      coverImage: '',
      contentStatus: 'full',
      fetchedAt: Date.now(),
      copyrightNote: '版权归原媒体及作者所有。',
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(document.querySelector('.news-reader-body')?.textContent).toContain('这是后点开的第二条正文。');
    expect(document.querySelector('.news-reader-body')?.textContent).not.toContain('这是较早请求的旧正文。');
  });

  it('桌面自动详情跟随当前带封面的重点稿，而不是固定第一条', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width: 901px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    apiState.get.mockImplementation(async (url: string) => {
      if (url.includes(encodeURIComponent(topItems[0].url))) {
        return success({
          item: topItems[0],
          blocks: [{ type: 'paragraph', text: '第一篇文章。' }],
          coverImage: '',
          contentStatus: 'full',
          fetchedAt: Date.now(),
          copyrightNote: '版权归原媒体及作者所有。',
        });
      }
      if (url.startsWith('/news/article?')) {
        return success({
          item: topItems[1],
          blocks: [{ type: 'paragraph', text: '第二篇文章。' }],
          coverImage: 'https://www.chinanews.com.cn/cover-second.jpg',
          contentStatus: 'full',
          fetchedAt: Date.now(),
          copyrightNote: '版权归原媒体及作者所有。',
        });
      }
      if (url.startsWith('/news/feed?')) {
        return success({
          items: topItems,
          sources: [{ id: 'domestic', name: '国内', status: 'ok', itemCount: 2 }],
          updatedAt: Date.now(),
          stale: false,
        });
      }
      return success({
        indices: [],
        watchlist: [],
        updatedAt: Date.now(),
        stale: false,
        source: '腾讯行情',
      });
    });

    const host = await mountNews();

    await vi.waitFor(() => {
      expect(host.querySelector('.news-lead-story')?.textContent).toContain(topItems[1].title);
      expect(host.querySelector('.news-lead-cover')).toBeTruthy();
      expect(host.querySelector('.news-reader')?.textContent).toContain(topItems[1].title);
    });
  });
});
