import { describe, expect, it } from 'vitest';
import {
  buildSourceRequestUrl,
  normalizeBookSource,
  parseBookSourceBatch,
  parseBookSourcePayload,
  parseChapterContent,
  parseChapterList,
  parseSearchResults,
} from '../src/learning/book-source-engine.js';

const SOURCE = {
  bookSourceName: '样例书源',
  bookSourceUrl: 'https://books.example.com',
  bookSourceGroup: '玄幻',
  searchUrl: '/search?q={{key}}&page={{page}}',
  ruleSearch: {
    bookList: '.book-item',
    name: '.book-title@text',
    author: '.book-author@text',
    bookUrl: 'a@href',
    coverUrl: 'img@src',
    intro: '.book-intro@text',
  },
  ruleBookInfo: {
    name: 'h1@text',
    author: '.author@text',
    intro: '.intro@text',
    coverUrl: '.cover img@src',
    tocUrl: '.catalog a@href',
  },
  ruleToc: {
    chapterList: '#chapters li',
    chapterName: 'a@text',
    chapterUrl: 'a@href',
  },
  ruleContent: {
    content: 'article#content',
    replaceRegex: '请收藏本站.*?\\n|广告：.*?\\n',
  },
};

describe('book source engine', () => {
  it('normalizes a standard book source JSON and resolves templated search URLs', () => {
    const source = normalizeBookSource(SOURCE);

    expect(source.name).toBe('样例书源');
    expect(source.baseUrl).toBe('https://books.example.com/');
    expect(source.ruleSearch.bookList).toBe('.book-item');
    expect(buildSourceRequestUrl(source.searchUrl, {
      baseUrl: source.baseUrl,
      key: '斗破 苍穹',
      page: 2,
    })).toBe('https://books.example.com/search?q=%E6%96%97%E7%A0%B4%20%E8%8B%8D%E7%A9%B9&page=2');
  });

  it('parses book information from search results and resolves relative links', () => {
    const source = normalizeBookSource(SOURCE);
    const results = parseSearchResults(source, `
      <main>
        <article class="book-item">
          <a href="/book/42"><img src="/cover/42.jpg" alt=""></a>
          <h2 class="book-title"> 斗破苍穹 </h2>
          <span class="book-author">天蚕土豆</span>
          <p class="book-intro">少年萧炎从天才跌落，又重新崛起的故事。</p>
        </article>
        <article class="book-item">
          <a href="/book/43"><strong class="book-title">武动乾坤</strong></a>
          <span class="book-author">天蚕土豆</span>
          <p class="book-intro">另一段成长故事。</p>
        </article>
      </main>
    `, 'https://books.example.com/search?q=test');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: '斗破苍穹',
      author: '天蚕土豆',
      bookUrl: 'https://books.example.com/book/42',
      coverUrl: 'https://books.example.com/cover/42.jpg',
      description: '少年萧炎从天才跌落，又重新崛起的故事。',
    });
  });

  it('parses the chapter directory and keeps chapter URLs absolute', () => {
    const source = normalizeBookSource(SOURCE);
    const chapters = parseChapterList(source, `
      <section id="chapters">
        <ul>
          <li><a href="/book/42/1">第一章 陨落的天才</a></li>
          <li><a href="/book/42/2">第二章 斗气大陆</a></li>
        </ul>
      </section>
    `, 'https://books.example.com/book/42');

    expect(chapters).toEqual([
      { title: '第一章 陨落的天才', url: 'https://books.example.com/book/42/1' },
      { title: '第二章 斗气大陆', url: 'https://books.example.com/book/42/2' },
    ]);
  });

  it('extracts only article text, removes scripts and ads, and preserves paragraphs', () => {
    const source = normalizeBookSource(SOURCE);
    const paragraphs = parseChapterContent(source, `
      <html>
        <body>
          <article id="content">
            第一章 陨落的天才<br><br>
            “斗之力，三段！”<br>
            望着测验魔石碑上面闪亮得甚至有些刺眼的五个大字。<br>
            请收藏本站最新地址<br>
            广告：下载App阅读<br>
            <script>window.alert('弹窗')</script>
          </article>
        </body>
      </html>
    `, 'https://books.example.com/book/42/1');

    expect(paragraphs).toEqual([
      '第一章 陨落的天才',
      '“斗之力，三段！”',
      '望着测验魔石碑上面闪亮得甚至有些刺眼的五个大字。',
    ]);
  });

  it('accepts a single source or an array, including legacy HTTP sources', () => {
    expect(parseBookSourcePayload(JSON.stringify(SOURCE))).toHaveLength(1);
    expect(parseBookSourcePayload(JSON.stringify([SOURCE, { ...SOURCE, bookSourceName: '第二书源' }]))).toHaveLength(2);
    expect(normalizeBookSource({ ...SOURCE, bookSourceUrl: 'http://books.example.com' }).baseUrl)
      .toBe('http://books.example.com/');
  });

  it('supports common JSON-API book sources in addition to HTML rules', () => {
    const source = normalizeBookSource({
      bookSourceName: 'JSON 书源',
      bookSourceUrl: 'https://api.example.com',
      searchUrl: '/search?q={{key}}',
      ruleSearch: {
        bookList: '@json:$.data[*]',
        name: '@json:$.name',
        author: '@json:$.author',
        bookUrl: '@json:$.url',
        coverUrl: '@json:$.cover',
      },
      ruleToc: {
        chapterList: '@json:$.chapters[*]',
        chapterName: '@json:$.title',
        chapterUrl: '@json:$.url',
      },
      ruleContent: { content: '@json:$.content' },
    });

    expect(parseSearchResults(source, JSON.stringify({
      data: [{ name: '万相之王', author: '天蚕土豆', url: '/book/7', cover: '/cover/7.jpg' }],
    }), 'https://api.example.com/search?q=test')[0]).toMatchObject({
      title: '万相之王',
      author: '天蚕土豆',
      bookUrl: 'https://api.example.com/book/7',
      coverUrl: 'https://api.example.com/cover/7.jpg',
    });
    expect(parseChapterList(source, JSON.stringify({
      chapters: [{ title: '第一章', url: '/chapter/1' }],
    }), 'https://api.example.com/book/7')[0]).toEqual({
      title: '第一章',
      url: 'https://api.example.com/chapter/1',
    });
    expect(parseChapterContent(source, JSON.stringify({
      content: '第一段\n\n第二段',
    }), 'https://api.example.com/chapter/1')).toEqual(['第一段', '第二段']);
  });

  it('imports valid entries from a mixed batch and reports invalid entries separately', () => {
    const batch = parseBookSourceBatch(JSON.stringify([
      SOURCE,
      { ...SOURCE, bookSourceName: 'HTTP 书源', bookSourceUrl: 'http://books.example.com' },
      { bookSourceName: '缺规则书源', bookSourceUrl: 'https://missing.example.com' },
      { ...SOURCE, bookSourceName: '缺正文规则', bookSourceUrl: 'https://no-content.example.com', ruleContent: {} },
    ]));

    expect(batch.total).toBe(4);
    expect(batch.sources).toHaveLength(2);
    expect(batch.sources[0].name).toBe('样例书源');
    expect(batch.sources[1].baseUrl).toMatch(/^http:\/\//);
    expect(batch.errors).toHaveLength(2);
    expect(batch.errors.map((error) => error.index)).toEqual([3, 4]);
  });
});
