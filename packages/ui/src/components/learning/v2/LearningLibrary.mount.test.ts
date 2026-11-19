// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLearningV2Library } from '@yan-zhi/shared';
import LearningLibrary from './LearningLibrary.vue';

let app: App | null = null;

async function mountLibrary(onReadBook?: (entry: unknown) => void): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(LearningLibrary, {
    records: getLearningV2Library(),
    accent: '#8d4638',
    tint: '#f7ece8',
    onReadBook,
  });
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LearningLibrary', () => {
  it('keeps navigation and primary actions neutral instead of coloring the whole dialog with the subject accent', () => {
    const css = readFileSync(resolve(__dirname, 'learning-library.css'), 'utf8');

    expect(css).toMatch(/\.ll-nav nav button\.active \{[^}]*background: #f1f4f2;[^}]*color: #26352f;/);
    expect(css).toMatch(/\.ll-categories button\.active,\s*\.ll-collections button\.active \{[^}]*background: #f7f8f7;[^}]*color: #26352f;/);
    expect(css).toMatch(/\.ll-book-card\.selected \{[^}]*background: #f7f8f7;/);
    expect(css).toMatch(/\.ll-detail-actions button:last-child[^{]*\{[^}]*background: #17211e;/);
  });

  it('renders categorized classics, zhiguai, authorized web novels and comics', async () => {
    const host = await mountLibrary();

    expect(host.textContent).toContain('经典名著');
    expect(host.textContent).toContain('志怪小说');
    expect(host.textContent).toContain('网络小说');
    expect(host.textContent).toContain('漫画');
    expect(host.textContent).toContain('三国演义');
    expect(host.textContent).toContain('聊斋志异');
    expect(host.textContent).toContain('番茄小说官方书库');
    expect(host.textContent).toContain('公版漫画阅览室');
  });

  it('opens a built-in book in the in-app reader instead of leaving the app', async () => {
    const onReadBook = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const host = await mountLibrary(onReadBook);

    const card = [...host.querySelectorAll('.ll-book-card')]
      .find((item) => item.textContent?.includes('三国演义')) as HTMLElement;
    const read = card.querySelector('[data-read-book]') as HTMLButtonElement;
    read.click();
    await nextTick();

    expect(onReadBook).toHaveBeenCalledWith(expect.objectContaining({
      id: 'classics-three-kingdoms',
      readingMode: 'builtin',
      assetKey: expect.any(String),
    }));
    expect(open).not.toHaveBeenCalled();
  });

  it('uses the native source reader for readable Gutenberg and MediaWiki catalog entries', async () => {
    const onReadBook = vi.fn();
    const host = await mountLibrary(onReadBook);
    const input = host.querySelector('[data-library-search]') as HTMLInputElement;
    input.value = '物种起源';
    input.dispatchEvent(new Event('input'));
    await nextTick();

    const card = [...host.querySelectorAll('.ll-book-card')]
      .find((item) => item.textContent?.includes('物种起源')) as HTMLElement;
    (card.querySelector('[data-read-book]') as HTMLButtonElement).click();
    await nextTick();

    expect(onReadBook).toHaveBeenCalledWith(expect.objectContaining({
      readingMode: 'source',
      source: expect.objectContaining({ provider: 'gutendex' }),
      bookUrl: 'https://www.gutenberg.org/ebooks/1228',
    }));
  });

  it('offers a local TXT import path for authorized web novels', async () => {
    const host = await mountLibrary();

    const input = host.querySelector('[data-import-book-input]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('.txt');
    expect(input.accept).toContain('image/*');
    expect(host.textContent).toContain('导入书/漫画');
  });

  it('switches between cover cards and the detailed list view', async () => {
    const host = await mountLibrary();
    expect(host.querySelector('.ll-card-grid')?.classList.contains('view-card')).toBe(true);

    const listButton = host.querySelector('[aria-label="列表模式"]') as HTMLButtonElement;
    listButton.click();
    await nextTick();

    expect(host.querySelector('.ll-card-grid')?.classList.contains('view-list')).toBe(true);
    expect(listButton.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('yz.learning.v2.library.book-view.v1')).toBe('list');
  });

  it('filters the catalog and persists bookshelf choices locally', async () => {
    const host = await mountLibrary();
    const search = host.querySelector('[data-library-search]') as HTMLInputElement;
    search.value = '聊斋';
    search.dispatchEvent(new Event('input'));
    await nextTick();

    const card = [...host.querySelectorAll('.ll-book-card')]
      .find((item) => item.textContent?.includes('聊斋志异')) as HTMLButtonElement;
    expect(card).toBeTruthy();
    card.click();
    await nextTick();
    const shelfButton = [...host.querySelectorAll('.ll-detail-actions button')]
      .find((item) => item.textContent?.includes('加入书架')) as HTMLButtonElement;
    shelfButton.click();
    await nextTick();

    expect(host.textContent).toContain('移出书架');
    expect(localStorage.getItem('yz.learning.v2.library.shelf.v1')).toContain('reading:zhiguai-liaozhai');

    (host.querySelectorAll('.ll-nav nav button')[1] as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('聊斋志异');
  });

  it('creates nested shelf folders and moves a book into a folder', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[1] as HTMLButtonElement).click();
    await nextTick();

    (host.querySelector('.ll-create-folder') as HTMLButtonElement).click();
    await nextTick();
    const folderInput = host.querySelector('.ll-folder-form input') as HTMLInputElement;
    folderInput.value = '古典小说';
    folderInput.dispatchEvent(new Event('input'));
    (host.querySelector('.ll-folder-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(host.textContent).toContain('古典小说');

    (host.querySelectorAll('.ll-nav nav button')[0] as HTMLButtonElement).click();
    await nextTick();
    const card = [...host.querySelectorAll('.ll-book-card')]
      .find((item) => item.textContent?.includes('三国演义')) as HTMLElement;
    card.click();
    await nextTick();
    const shelfButton = [...host.querySelectorAll('.ll-detail-actions button')]
      .find((item) => item.textContent?.includes('加入书架')) as HTMLButtonElement;
    shelfButton.click();
    await nextTick();

    const select = host.querySelector('.ll-move-book select') as HTMLSelectElement;
    const folderOption = [...select.options].find((option) => option.textContent?.includes('古典小说')) as HTMLOptionElement;
    select.value = folderOption.value;
    select.dispatchEvent(new Event('change'));
    await nextTick();

    (host.querySelectorAll('.ll-nav nav button')[1] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-folder-open') as HTMLButtonElement).click();
    await nextTick();
    expect(host.textContent).toContain('三国演义');
    expect(localStorage.getItem('yz.learning.v2.library.folders.v1')).toContain('古典小说');
  });

  it('adds only explicit HTTPS custom sources and keeps their license note', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '我的授权书库';
    inputs[1].value = 'https://example.com/books';
    inputs[2].value = '作者授权测试来源';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(host.textContent).toContain('我的授权书库');
    expect(host.textContent).toContain('作者授权测试来源');
    expect(host.querySelector('.ll-source-detail-head')).toBeTruthy();
    expect(host.querySelector('.ll-source-badges')).toBeTruthy();
    expect(host.querySelectorAll('.ll-source-detail-section')).toHaveLength(2);
    expect(host.textContent).toContain('阅读与授权');
    expect(host.textContent).toContain('站点地址');
    expect(host.textContent).toContain('example.com');
    expect(localStorage.getItem('yz.learning.v2.library.sources.v1')).toContain('https://example.com/books');
  });

  it('imports a standard JSON book source instead of saving a dead website link', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          total: 1,
          imported: 1,
          skipped: 0,
          errors: [],
          sources: [{
            name: '规则书源',
            url: 'https://books.example.com/',
            group: '测试',
            rule: {
              searchUrl: '/search?q={{key}}',
              ruleSearch: { bookList: '.book-item', name: '.title@text', bookUrl: 'a@href' },
              ruleToc: { chapterList: '#toc li', chapterName: 'a@text', chapterUrl: 'a@href' },
              ruleContent: { content: '#content' },
            },
          }],
        },
      }),
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '本地导入';
    inputs[2].value = '测试授权';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[2].dispatchEvent(new Event('input'));
    const json = host.querySelector('.ll-source-form textarea') as HTMLTextAreaElement;
    json.value = '{"bookSourceName":"规则书源"}';
    json.dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(host.textContent).toContain('规则书源');
    });
    expect(host.querySelector('.ll-source-detail-head')).toBeTruthy();
    expect(localStorage.getItem('yz.learning.v2.library.sources.v1')).toContain('"rule"');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/learning/library/sources/import'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('imports valid entries from a batch and reports skipped sources', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          total: 3,
          imported: 2,
          skipped: 1,
          errors: [{ index: 3, name: '坏书源', reason: '搜索规则缺少 bookList' }],
          sources: [
            {
              name: '规则书源甲',
              url: 'https://books.example.com/',
              group: '批量',
              rule: {
                searchUrl: '/search?q={{key}}',
                ruleSearch: { bookList: '.book-item', name: '.title@text', bookUrl: 'a@href' },
                ruleToc: { chapterList: '#toc li', chapterName: 'a@text', chapterUrl: 'a@href' },
                ruleContent: { content: '#content' },
              },
            },
            {
              name: '规则书源乙',
              url: 'http://legacy.example.com/',
              group: '批量',
              rule: {
                searchUrl: '/search?q={{key}}',
                ruleSearch: { bookList: '.book-item', name: '.title@text', bookUrl: 'a@href' },
                ruleToc: { chapterList: '#toc li', chapterName: 'a@text', chapterUrl: 'a@href' },
                ruleContent: { content: '#content' },
              },
            },
          ],
        },
      }),
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[2].value = '批量测试授权';
    inputs[2].dispatchEvent(new Event('input'));
    const json = host.querySelector('.ll-source-form textarea') as HTMLTextAreaElement;
    json.value = '[{"bookSourceName":"规则书源甲"},{"bookSourceName":"规则书源乙"}]';
    json.dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(host.textContent).toContain('规则书源甲');
      expect(host.textContent).toContain('规则书源乙');
    });
    expect(host.querySelector('[data-source-import-summary]')?.textContent).toContain('已导入 2 条，跳过 1 条');
    expect(host.textContent).toContain('坏书源');
  });

  it('offers a local JSON file picker for single or batch sources', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const fileInput = host.querySelector('[data-source-json-file]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.accept).toContain('.json');
    expect(fileInput.accept).toContain('.txt');
    expect(host.textContent).toContain('选择 JSON 文件');
  });

  it('searches an imported book source, adds the result to the shelf and opens it in the in-app reader', async () => {
    localStorage.setItem('yz.learning.v2.library.sources.v1', JSON.stringify([{
      id: 'custom-rule-source',
      name: '规则书源',
      url: 'https://books.example.com/',
      category: 'web-novel',
      access: 'authorized-platform',
      license: '测试授权来源',
      description: '支持规则搜索',
      rule: {
        searchUrl: '/search?q={{key}}',
        ruleSearch: {
          bookList: '.book-item',
          name: '.title@text',
          author: '.author@text',
          bookUrl: 'a@href',
        },
        ruleToc: {
          chapterList: '#toc li',
          chapterName: 'a@text',
          chapterUrl: 'a@href',
        },
        ruleContent: { content: '#content' },
      },
    }]));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          page: 1,
          hasMore: false,
          items: [{
            title: '斗破苍穹',
            author: '天蚕土豆',
            bookUrl: 'https://books.example.com/book/42',
            description: '少年萧炎重新崛起。',
          }],
        },
      }),
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const onReadBook = vi.fn();
    const host = await mountLibrary(onReadBook);

    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    const sourceItem = [...host.querySelectorAll('.ll-source-list > button')]
      .find((item) => item.textContent?.includes('规则书源')) as HTMLButtonElement;
    sourceItem.click();
    await nextTick();

    const sourceSearch = host.querySelector('[data-source-search]') as HTMLInputElement;
    sourceSearch.value = '斗破';
    sourceSearch.dispatchEvent(new Event('input'));
    (host.querySelector('[data-source-search-submit]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(host.textContent).toContain('斗破苍穹');
    });

    (host.querySelector('[data-source-shelf]') as HTMLButtonElement).click();
    await nextTick();
    expect(localStorage.getItem('yz.learning.v2.library.shelf.v1')).toContain('source-book:');

    (host.querySelector('[data-source-read]') as HTMLButtonElement).click();
    await nextTick();
    expect(onReadBook).toHaveBeenCalledWith(expect.objectContaining({
      title: '斗破苍穹',
      readingMode: 'source',
      bookUrl: 'https://books.example.com/book/42',
      source: expect.objectContaining({ id: 'custom-rule-source' }),
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/learning/library/source/search'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps the mobile source sheet above the TabBar', () => {
    const css = readFileSync(resolve(__dirname, 'learning-library.css'), 'utf8');
    expect(css).toMatch(/\.ll-detail\s*\{[\s\S]*?bottom:\s*calc\(var\(--mobile-tabbar-h/);
    expect(css).toMatch(/\.ll-detail\s*\{[\s\S]*?max-height:\s*min\([\s\S]*?var\(--mobile-topbar-h/);
  });

  it('keeps batch import, file selection and source results usable on narrow screens', () => {
    const css = readFileSync(resolve(__dirname, 'learning-library.css'), 'utf8');
    expect(css).toMatch(/\.ll-source-file-field \{ grid-template-columns: 1fr; align-items: stretch; \}/);
    expect(css).toMatch(/\.ll-source-file-field button \{ width: 100%; justify-content: center; \}/);
    expect(css).toMatch(/\.ll-source-import-result \{ max-height: 190px; overflow-y: auto; \}/);
    expect(css).toMatch(/\.ll-source-result footer \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(css).toMatch(/\.ll-source-search > button \{ width: 100%; justify-content: center; \}/);
  });

  it('accepts legacy HTTP sources but marks them as insecure', async () => {
    const host = await mountLibrary();
    (host.querySelectorAll('.ll-nav nav button')[2] as HTMLButtonElement).click();
    await nextTick();
    (host.querySelector('.ll-source-head > button') as HTMLButtonElement).click();
    await nextTick();

    const inputs = host.querySelectorAll('.ll-source-form input') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '非安全来源';
    inputs[1].value = 'http://example.com';
    inputs[2].value = '测试许可';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].dispatchEvent(new Event('input'));
    inputs[2].dispatchEvent(new Event('input'));
    (host.querySelector('.ll-source-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(host.textContent).toContain('HTTP 不安全');
    expect(localStorage.getItem('yz.learning.v2.library.sources.v1')).toContain('http://example.com');
  });
});
