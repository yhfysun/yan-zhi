import { describe, expect, it } from 'vitest';
import {
  createBookSourceService,
  decodeSourceBytes,
  parseGutendexPayload,
  parseMediaWikiSearchPayload,
} from '../src/learning/book-source-service.js';
import { normalizeBookSource } from '../src/learning/book-source-engine.js';

const SOURCE = normalizeBookSource({
  bookSourceName: '样例书源',
  bookSourceUrl: 'https://books.example.com',
  searchUrl: '/search?q={{key}}&page={{page}}',
  ruleSearch: {
    bookList: '.book-item',
    name: '.title@text',
    author: '.author@text',
    bookUrl: 'a@href',
  },
  ruleBookInfo: {
    name: 'h1@text',
    author: '.author@text',
    tocUrl: '#toc-link@href',
  },
  ruleToc: {
    chapterList: '#toc li',
    chapterName: 'a@text',
    chapterUrl: 'a@href',
  },
  ruleContent: { content: '#content' },
});

describe('book source service', () => {
  it('decodes legacy Chinese book sites declared as GBK or GB18030', () => {
    const gbk = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]);

    expect(decodeSourceBytes(gbk, 'text/html; charset=gbk')).toBe('中文');
    expect(decodeSourceBytes(gbk, 'text/html')).toBe('中文');
  });

  it('searches a custom source through its rule and opens the directory', async () => {
    const requests: string[] = [];
    const service = createBookSourceService(async (url) => {
      requests.push(url);
      if (url.includes('/search')) {
        return `
          <div class="book-item">
            <a class="title" href="/book/42">斗破苍穹</a>
            <span class="author">天蚕土豆</span>
          </div>
        `;
      }
      if (url.endsWith('/book/42')) {
        return `
          <h1>斗破苍穹</h1>
          <span class="author">天蚕土豆</span>
          <a id="toc-link" href="/book/42/toc">目录</a>
        `;
      }
      if (url.endsWith('/book/42/toc')) {
        return `
          <ul id="toc">
            <li><a href="/chapter/1">第一章 陨落的天才</a></li>
            <li><a href="/chapter/2">第二章 斗气大陆</a></li>
          </ul>
        `;
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const search = await service.searchCustom(SOURCE, '斗破', 1);
    expect(search.items[0]).toMatchObject({ title: '斗破苍穹', bookUrl: 'https://books.example.com/book/42' });

    const book = await service.openCustom(SOURCE, search.items[0]);
    expect(book.title).toBe('斗破苍穹');
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters[1].url).toBe('https://books.example.com/chapter/2');
    expect(requests).toEqual([
      'https://books.example.com/search?q=%E6%96%97%E7%A0%B4&page=1',
      'https://books.example.com/book/42',
      'https://books.example.com/book/42/toc',
    ]);
  });

  it('fetches and normalizes one custom chapter on demand', async () => {
    const service = createBookSourceService(async () => `
      <article id="content">
        <p>第一章 陨落的天才</p>
        <p>“斗之力，三段！”</p>
        <script>alert('广告')</script>
      </article>
    `);

    const chapter = await service.readCustom(SOURCE, 'https://books.example.com/chapter/1');
    expect(chapter.paragraphs).toEqual(['第一章 陨落的天才', '“斗之力，三段！”']);
  });

  it('maps Gutendex results to books that can be read as plain text', () => {
    const items = parseGutendexPayload({
      results: [{
        id: 11,
        title: 'Alice in Wonderland',
        authors: [{ name: 'Carroll, Lewis' }],
        subjects: ['Fantasy'],
        formats: {
          'text/plain; charset=utf-8': 'https://www.gutenberg.org/cache/epub/11/pg11.txt',
        },
      }],
    });

    expect(items[0]).toMatchObject({
      title: 'Alice in Wonderland',
      author: 'Lewis Carroll',
      bookUrl: 'https://www.gutenberg.org/ebooks/11',
      contentUrl: 'https://www.gutenberg.org/cache/epub/11/pg11.txt',
    });
  });

  it('maps MediaWiki search results into readable article entries', () => {
    const items = parseMediaWikiSearchPayload({
      query: {
        search: [{
          title: '三国演义',
          snippet: '<span class="searchmatch">三国</span>演义是一部章回小说',
          pageid: 123,
        }],
      },
    }, 'https://zh.wikisource.org');

    expect(items[0]).toEqual({
      title: '三国演义',
      author: '维基文库',
      bookUrl: 'https://zh.wikisource.org/wiki/%E4%B8%89%E5%9B%BD%E6%BC%94%E4%B9%89',
      description: '三国演义是一部章回小说',
    });
  });
});
