import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';
import {
  buildSourceRequestUrl,
  parseBookInfo,
  parseChapterContent,
  parseChapterList,
  parseSearchResults,
  type NormalizedBookSource,
  type SourceBookInfo,
  type SourceBookSummary,
  type SourceChapter,
} from './book-source-engine.js';

export type FetchText = (url: string) => Promise<string>;

export type BuiltinSourceInput = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly provider?: 'gutendex' | 'mediawiki';
};

export type SourceSearchPage = {
  readonly items: SourceBookSummary[];
  readonly page: number;
  readonly hasMore: boolean;
};

export type SourceBook = SourceBookInfo & {
  readonly chapters: SourceChapter[];
};

export type SourceChapterContent = {
  readonly title: string;
  readonly paragraphs: string[];
};

type FetchTextLike = (url: string) => Promise<string>;

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const privateHostPatterns = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

function assertSafeHost(hostname: string): void {
  if (privateHostPatterns.some((pattern) => pattern.test(hostname))) {
    throw new Error('不允许访问本机或内网地址');
  }
}

async function assertSafeRemoteUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('书源请求地址无效');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('书源请求必须使用 HTTP 或 HTTPS');
  }
  assertSafeHost(url.hostname);
  if (!isIP(url.hostname)) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    for (const address of addresses) assertSafeHost(address.address);
  }
  return url;
}

function normalizeCharset(value: string): string {
  const charset = value.trim().toLowerCase();
  if (charset === 'gb2312' || charset === 'gbk' || charset === 'x-gbk') return 'gb18030';
  if (charset === 'utf8') return 'utf-8';
  return charset;
}

export function decodeSourceBytes(bytes: Uint8Array, contentType = ''): string {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || '';
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 4096))).toString('latin1');
  const metaCharset = prefix.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1] || '';
  const declared = normalizeCharset(headerCharset || metaCharset);
  const candidates = declared ? [declared, 'utf-8', 'gb18030'] : ['utf-8', 'gb18030'];
  for (const charset of candidates) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
      // Try the next likely charset for older Chinese book sites.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function readResponseText(response: Response): Promise<string> {
  const publishedLength = Number(response.headers.get('content-length') || 0);
  if (publishedLength > MAX_REMOTE_BYTES) throw new Error('书源返回内容过大');
  const contentType = String(response.headers.get('content-type') || '');
  if (!response.body) return decodeSourceBytes(new Uint8Array(await response.arrayBuffer()), contentType);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_REMOTE_BYTES) throw new Error('书源返回内容过大');
    chunks.push(chunk);
  }
  return decodeSourceBytes(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), contentType);
}

export async function fetchRemoteSourceText(rawUrl: string): Promise<string> {
  let current = rawUrl;
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const url = await assertSafeRemoteUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
          'User-Agent': 'YanZhi-Library/1.0',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`书源重定向缺少地址：HTTP ${response.status}`);
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`书源请求失败：HTTP ${response.status}`);
      const type = String(response.headers.get('content-type') || '').toLowerCase();
      if (type && !/(text\/|html|json|xml|javascript)/i.test(type)) {
        throw new Error('书源返回了不支持的内容类型');
      }
      return await readResponseText(response);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('书源重定向次数过多');
}

function cleanInlineHtml(value: string): string {
  return load(`<div>${value}</div>`)('div')
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}

function authorName(raw: string): string {
  const name = raw.trim();
  if (!name.includes(',')) return name;
  const [family, ...given] = name.split(',').map((part) => part.trim()).filter(Boolean);
  return given.length ? `${given.join(' ')} ${family}` : name;
}

export function parseGutendexPayload(payload: unknown): SourceBookSummary[] {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const results = Array.isArray(root.results) ? root.results : [];
  return results.flatMap((item) => {
    const book = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = Number(book.id || 0);
    const title = String(book.title || '').trim();
    if (!id || !title) return [];
    const authors = Array.isArray(book.authors) ? book.authors : [];
    const formats = book.formats && typeof book.formats === 'object' ? book.formats as Record<string, unknown> : {};
    const contentUrl = String(
      formats['text/plain; charset=utf-8']
      || formats['text/plain']
      || formats['text/html; charset=utf-8']
      || '',
    ).trim();
    const subjects = Array.isArray(book.subjects)
      ? book.subjects.map((subject) => String(subject || '').trim()).filter(Boolean)
      : [];
    return [{
      title,
      author: authors.map((author) => authorName(String((author as Record<string, unknown>)?.name || ''))).filter(Boolean).join('、') || '佚名',
      bookUrl: `https://www.gutenberg.org/ebooks/${id}`,
      description: subjects.slice(0, 4).join(' · '),
      ...(contentUrl.startsWith('https://') ? { contentUrl } : {}),
    }];
  });
}

export function parseMediaWikiSearchPayload(payload: unknown, origin: string): SourceBookSummary[] {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const query = root.query && typeof root.query === 'object' ? root.query as Record<string, unknown> : {};
  const results = Array.isArray(query.search) ? query.search : [];
  return results.flatMap((item) => {
    const page = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const title = String(page.title || '').trim();
    if (!title) return [];
    const base = new URL(origin);
    const slug = title.replace(/ /g, '_');
    return [{
      title,
      author: base.hostname.includes('wikisource') ? '维基文库' : '维基百科',
      bookUrl: `${base.origin}/wiki/${encodeURIComponent(slug).replace(/%2F/gi, '/')}`,
      description: cleanInlineHtml(String(page.snippet || '')),
    }];
  });
}

function mediaWikiApi(origin: string, params: Record<string, string>): string {
  const url = new URL('/w/api.php', origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  return url.toString();
}

function pageTitleFromUrl(raw: string): string {
  const url = new URL(raw);
  const marker = '/wiki/';
  const index = url.pathname.indexOf(marker);
  if (index < 0) return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  return decodeURIComponent(url.pathname.slice(index + marker.length).replace(/\/+$/, '')).replace(/_/g, ' ');
}

function mediaWikiArticleParagraphs(payload: unknown): { title: string; paragraphs: string[] } {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const parse = root.parse && typeof root.parse === 'object' ? root.parse as Record<string, unknown> : {};
  const title = String(parse.title || '').trim();
  const html = String(parse.text || '');
  if (!html) return { title, paragraphs: [] };
  const $ = load(html);
  $('script,style,iframe,noscript,sup.reference,.mw-editsection,.navbox,.infobox,.metadata,.ambox,.sistersitebox').remove();
  $('br').replaceWith('\n');
  $('p, li, h2, h3, h4, blockquote').each((_: number, node: any) => {
    $(node).after('\n');
  });
  const paragraphs = $('#mw-content-text').length ? $('#mw-content-text').text() : $('body').text();
  return {
    title,
    paragraphs: paragraphs
      .replace(/\u00a0/g, ' ')
      .split(/\n+/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line) => line && line !== '跳转到内容' && line !== '导航'),
  };
}

function splitGutenbergChapters(text: string, bookUrl: string): SourceChapter[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');
  const headings: Array<{ index: number; title: string }> = [];
  const headingPattern = /^\s*(?:(?:CHAPTER|Chapter)\s+[IVXLCDM\d]+(?:[^\n]{0,100})|第[零〇一二两三四五六七八九十百千万0-9]+[章节回](?:\s+[^\n]{0,80})?)\s*$/;
  for (let index = 0; index < lines.length; index += 1) {
    const title = lines[index].trim();
    if (headingPattern.test(title)) headings.push({ index, title });
  }
  if (!headings.length) {
    const chunks: SourceChapter[] = [];
    const max = 30_000;
    for (let start = 0; start < normalized.length; start += max) {
      chunks.push({
        title: chunks.length ? `正文 ${chunks.length + 1}` : '正文',
        url: `gutenberg:${encodeURIComponent(bookUrl)}:${chunks.length}`,
      });
    }
    return chunks;
  }
  return headings.map((heading, index) => ({
    title: heading.title,
    url: `gutenberg:${encodeURIComponent(bookUrl)}:${index}`,
  }));
}

function gutenbergChapterParagraphs(text: string, chapterUrl: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');
  const headings: Array<{ index: number; title: string }> = [];
  const headingPattern = /^\s*(?:(?:CHAPTER|Chapter)\s+[IVXLCDM\d]+(?:[^\n]{0,100})|第[零〇一二两三四五六七八九十百千万0-9]+[章节回](?:\s+[^\n]{0,80})?)\s*$/;
  for (let index = 0; index < lines.length; index += 1) {
    const title = lines[index].trim();
    if (headingPattern.test(title)) headings.push({ index, title });
  }
  const index = Number(decodeURIComponent(chapterUrl).split(':').pop() || 0);
  const start = headings[index]?.index ?? index * Math.ceil(lines.length / Math.max(1, Math.ceil(normalized.length / 30_000)));
  const end = headings[index + 1]?.index ?? lines.length;
  const body = headings.length ? lines.slice(start + 1, end) : lines.slice(start, end);
  return body
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').trim())
    .filter((paragraph) => paragraph && !/^\*\*\* (START|END) OF (THE|THIS) PROJECT GUTENBERG/i.test(paragraph));
}

export function createBookSourceService(fetchText: FetchTextLike = fetchRemoteSourceText) {
  const gutenbergCache = new Map<string, string>();
  const mediaWikiChapterCache = new Map<string, SourceChapterContent>();

  async function fetchJson(url: string): Promise<unknown> {
    return JSON.parse(await fetchText(url));
  }

  async function searchCustom(source: NormalizedBookSource, query: string, page: number): Promise<SourceSearchPage> {
    const requestUrl = buildSourceRequestUrl(source.searchUrl, { baseUrl: source.baseUrl, key: query, page });
    const html = await fetchText(requestUrl);
    const items = parseSearchResults(source, html, requestUrl);
    return {
      items,
      page,
      hasMore: items.length > 0,
    };
  }

  async function openCustom(source: NormalizedBookSource, book: SourceBookSummary): Promise<SourceBook> {
    const bookHtml = await fetchText(book.bookUrl);
    const info = parseBookInfo(source, bookHtml, book.bookUrl);
    const directChapters = parseChapterList(source, bookHtml, book.bookUrl);
    const tocUrl = info?.tocUrl || book.bookUrl;
    const chapters = directChapters.length
      ? directChapters
      : tocUrl === book.bookUrl
        ? []
        : parseChapterList(source, await fetchText(tocUrl), tocUrl);
    return {
      ...book,
      ...(info || {}),
      bookUrl: book.bookUrl,
      chapters,
    };
  }

  async function readCustom(source: NormalizedBookSource, chapterUrl: string): Promise<SourceChapterContent> {
    const html = await fetchText(chapterUrl);
    return {
      title: '',
      paragraphs: parseChapterContent(source, html, chapterUrl),
    };
  }

  async function searchBuiltin(source: BuiltinSourceInput, query: string, page: number): Promise<SourceSearchPage> {
    if (source.provider === 'gutendex') {
      const url = new URL('https://gutendex.com/books');
      url.searchParams.set('search', query);
      url.searchParams.set('page', String(page));
      const items = parseGutendexPayload(await fetchJson(url.toString()));
      return { items, page, hasMore: items.length > 0 };
    }
    if (source.provider === 'mediawiki') {
      const origin = new URL(source.url).origin;
      const url = mediaWikiApi(origin, {
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: '20',
        sroffset: String(Math.max(0, page - 1) * 20),
      });
      const items = parseMediaWikiSearchPayload(await fetchJson(url), origin);
      return { items, page, hasMore: items.length >= 20 };
    }
    throw new Error('这个内置书源暂不支持应用内搜索');
  }

  async function openBuiltin(source: BuiltinSourceInput, book: SourceBookSummary): Promise<SourceBook> {
    if (source.provider === 'gutendex') {
      const idMatch = book.bookUrl.match(/\/ebooks\/(\d+)/);
      const id = idMatch?.[1] || '';
      const contentUrl = book.contentUrl || (id ? `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt` : '');
      if (!contentUrl) throw new Error('这本书没有可读取的公版文本');
      const text = await fetchText(contentUrl);
      gutenbergCache.set(book.bookUrl, text);
      return {
        ...book,
        description: book.description || 'Project Gutenberg 公版文本',
        chapters: splitGutenbergChapters(text, book.bookUrl),
      };
    }
    if (source.provider === 'mediawiki') {
      const origin = new URL(source.url).origin;
      const title = pageTitleFromUrl(book.bookUrl);
      const payload = await fetchJson(mediaWikiApi(origin, {
        action: 'parse',
        page: title,
        prop: 'text',
        disableeditsection: '1',
      }));
      const content = mediaWikiArticleParagraphs(payload);
      if (!content.paragraphs.length) throw new Error('没有从该页面提取到正文');
      mediaWikiChapterCache.set(book.bookUrl, {
        title: content.title || book.title,
        paragraphs: content.paragraphs,
      });
      return {
        ...book,
        chapters: [{ title: book.title, url: book.bookUrl }],
      };
    }
    throw new Error('这个内置书源暂不支持应用内阅读');
  }

  async function readBuiltin(
    source: BuiltinSourceInput,
    book: SourceBookSummary,
    chapterUrl: string,
  ): Promise<SourceChapterContent> {
    if (source.provider === 'gutendex') {
      let text = gutenbergCache.get(book.bookUrl);
      if (!text) {
        const idMatch = book.bookUrl.match(/\/ebooks\/(\d+)/);
        const contentUrl = book.contentUrl || (idMatch?.[1] ? `https://www.gutenberg.org/cache/epub/${idMatch[1]}/pg${idMatch[1]}.txt` : '');
        if (!contentUrl) throw new Error('这本书没有可读取的公版文本');
        text = await fetchText(contentUrl);
        gutenbergCache.set(book.bookUrl, text);
      }
      return { title: '', paragraphs: gutenbergChapterParagraphs(text, chapterUrl) };
    }
    if (source.provider === 'mediawiki') {
      const cached = mediaWikiChapterCache.get(book.bookUrl);
      if (cached) return cached;
      const origin = new URL(source.url).origin;
      const payload = await fetchJson(mediaWikiApi(origin, {
        action: 'parse',
        page: pageTitleFromUrl(book.bookUrl),
        prop: 'text',
        disableeditsection: '1',
      }));
      const content = mediaWikiArticleParagraphs(payload);
      const result = { title: content.title || book.title, paragraphs: content.paragraphs };
      mediaWikiChapterCache.set(book.bookUrl, result);
      return result;
    }
    throw new Error('这个内置书源暂不支持应用内阅读');
  }

  return {
    searchCustom,
    openCustom,
    readCustom,
    searchBuiltin,
    openBuiltin,
    readBuiltin,
  };
}

export type BookSourceService = ReturnType<typeof createBookSourceService>;
