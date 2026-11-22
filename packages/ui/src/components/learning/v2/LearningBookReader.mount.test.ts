// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import LearningBookReader from './LearningBookReader.vue';

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('LearningBookReader', () => {
  it('loads bundled book text, renders the current chapter and keeps progress in the app', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(LearningBookReader, {
      book: {
        id: 'classics-three-kingdoms',
        title: '三国演义',
        author: '罗贯中',
        language: 'zh-Hant',
        readingMode: 'builtin',
        assetKey: 'three-kingdoms',
        sourceName: '内置公版全文',
        license: '公版',
        annotations: [{ term: '荆州', gloss: '古代九州之一，也是三国争夺要地。' }],
      },
    });
    app.mount(host);
    await vi.waitFor(() => {
      expect(host.textContent).toContain('三国演义');
      expect(host.querySelector('[data-reader-content]')).toBeTruthy();
    });

    expect(host.querySelector('[data-reader-chapters]')).toBeTruthy();
    expect(host.textContent).toContain('注释');
    expect(host.textContent).not.toContain('去来源阅读');

    (host.querySelector('[aria-label="阅读设置"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelectorAll('.lbr-theme-grid button')).toHaveLength(5);
    expect(host.textContent).toContain('行距');
    expect(host.textContent).toContain('字间距');
    expect(host.textContent).toContain('护眼模式');
    expect(host.textContent).toContain('关灯模式');

    const green = [...host.querySelectorAll('.lbr-theme-grid button')]
      .find((button) => button.textContent?.includes('护眼')) as HTMLButtonElement;
    green.click();
    await nextTick();
    expect(host.querySelector('.learning-book-reader')?.classList.contains('theme-green')).toBe(true);
    expect(localStorage.getItem('yz.learning.v2.reader.preferences.v1')).toContain('"theme":"green"');
  });

  it('loads a rule-source directory and current chapter in the native reader without embedding the website', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/library/source/book')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              title: '斗破苍穹',
              author: '天蚕土豆',
              bookUrl: 'https://books.example.com/book/42',
              chapters: [
                { title: '第一章 陨落的天才', url: 'https://books.example.com/chapter/1' },
                { title: '第二章 斗气大陆', url: 'https://books.example.com/chapter/2' },
              ],
            },
          }),
        } as Response;
      }
      if (url.includes('/library/source/content')) {
        const request = JSON.parse(String(init?.body || '{}'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: request.chapterUrl.endsWith('/1')
              ? { paragraphs: ['第一章 陨落的天才', '“斗之力，三段！”'] }
              : { paragraphs: ['第二章 斗气大陆', '这里是斗气大陆。'] },
          }),
        } as Response;
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(LearningBookReader, {
      book: {
        id: 'source-book:custom-rule-source:42',
        title: '斗破苍穹',
        author: '天蚕土豆',
        language: 'zh-Hans',
        readingMode: 'source',
        sourceId: 'custom-rule-source',
        source: {
          id: 'custom-rule-source',
          name: '规则书源',
          url: 'https://books.example.com/',
          category: 'web-novel',
          access: 'authorized-platform',
          license: '测试授权来源',
          description: '支持规则搜索',
          rule: {
            searchUrl: '/search?q={{key}}',
            ruleSearch: { bookList: '.book-item', name: '.title@text', bookUrl: 'a@href' },
            ruleToc: { chapterList: '#toc li', chapterName: 'a@text', chapterUrl: 'a@href' },
            ruleContent: { content: '#content' },
          },
        },
        bookUrl: 'https://books.example.com/book/42',
        sourceName: '规则书源',
        license: '测试授权来源',
        annotations: [],
      },
    });
    app.mount(host);

    await vi.waitFor(() => {
      expect(host.textContent).toContain('第一章 陨落的天才');
      expect(host.textContent).toContain('“斗之力，三段！”');
    });
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('[data-reader-chapters]')?.textContent).toContain('第二章 斗气大陆');

    const next = [...host.querySelectorAll('.lbr-paper footer button')]
      .find((button) => button.textContent?.includes('下一章')) as HTMLButtonElement;
    next.click();
    await vi.waitFor(() => {
      expect(host.textContent).toContain('这里是斗气大陆。');
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/source/content'))).toHaveLength(2);
  });

  it('collapses the chapter and annotation panels from their close buttons', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(LearningBookReader, {
      book: {
        id: 'collapse-check',
        title: '折叠测试',
        author: '测试',
        language: 'zh-Hans',
        readingMode: 'builtin',
        assetKey: 'three-kingdoms',
        sourceName: '内置公版全文',
        license: '公版',
        annotations: [{ term: '荆州', gloss: '古代九州之一。' }],
      },
    });
    app.mount(host);
    await vi.waitFor(() => expect(host.querySelector('[data-reader-content]')).toBeTruthy());

    const body = host.querySelector('.lbr-body') as HTMLElement;
    expect(body.classList.contains('chapters-closed')).toBe(false);
    expect(body.classList.contains('notes-closed')).toBe(false);

    (host.querySelector('.lbr-chapters header [aria-label="关闭目录"]') as HTMLButtonElement).click();
    await nextTick();
    expect(body.classList.contains('chapters-closed')).toBe(true);

    (host.querySelector('.lbr-notes header [aria-label="关闭注释"]') as HTMLButtonElement).click();
    await nextTick();
    expect(body.classList.contains('notes-closed')).toBe(true);
    expect(document.documentElement).toBeTruthy();
  });
});
