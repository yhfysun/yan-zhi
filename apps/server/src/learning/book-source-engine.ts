import { load } from 'cheerio';

export type BookSourceFieldRules = {
  readonly bookList?: string;
  readonly name?: string;
  readonly author?: string;
  readonly intro?: string;
  readonly coverUrl?: string;
  readonly bookUrl?: string;
  readonly kind?: string;
  readonly wordCount?: string;
  readonly lastChapter?: string;
  readonly tocUrl?: string;
};

export type NormalizedBookSource = {
  readonly name: string;
  readonly group: string;
  readonly baseUrl: string;
  readonly searchUrl: string;
  readonly exploreUrl?: string;
  readonly ruleSearch: BookSourceFieldRules & { readonly bookList: string };
  readonly ruleExplore?: BookSourceFieldRules & { readonly bookList?: string };
  readonly ruleBookInfo?: BookSourceFieldRules;
  readonly ruleToc: {
    readonly chapterList: string;
    readonly chapterName: string;
    readonly chapterUrl: string;
  };
  readonly ruleContent: {
    readonly content: string;
    readonly replaceRegex?: string;
  };
};

export type SourceBookSummary = {
  readonly title: string;
  readonly author: string;
  readonly bookUrl: string;
  readonly contentUrl?: string;
  readonly coverUrl?: string;
  readonly description: string;
  readonly kind?: string;
  readonly wordCount?: string;
  readonly lastChapter?: string;
};

export type SourceBookInfo = Omit<SourceBookSummary, 'bookUrl'> & {
  readonly bookUrl: string;
  readonly tocUrl?: string;
};

export type SourceChapter = {
  readonly title: string;
  readonly url: string;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireString(value: unknown, message: string): string {
  const text = readString(value);
  if (!text) throw new Error(message);
  return text;
}

function normalizeBaseUrl(value: unknown): string {
  const raw = requireString(value, '书源缺少 bookSourceUrl');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('书源地址必须是完整 URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('书源地址必须使用 HTTP 或 HTTPS');
  }
  parsed.hash = '';
  return parsed.toString().endsWith('/') ? parsed.toString() : `${parsed.toString()}/`;
}

function normalizeFieldRules(value: unknown, requireBookUrl = false): BookSourceFieldRules {
  const input = asRecord(value);
  const bookList = readString(input.bookList);
  return {
    ...(bookList ? { bookList } : {}),
    ...(readString(input.name) ? { name: readString(input.name) } : {}),
    ...(readString(input.author) ? { author: readString(input.author) } : {}),
    ...(readString(input.intro) ? { intro: readString(input.intro) } : {}),
    ...(readString(input.coverUrl) ? { coverUrl: readString(input.coverUrl) } : {}),
    ...(readString(input.bookUrl) || requireBookUrl ? { bookUrl: requireString(input.bookUrl, '搜索规则缺少 bookUrl') } : {}),
    ...(readString(input.kind) ? { kind: readString(input.kind) } : {}),
    ...(readString(input.wordCount) ? { wordCount: readString(input.wordCount) } : {}),
    ...(readString(input.lastChapter) ? { lastChapter: readString(input.lastChapter) } : {}),
    ...(readString(input.tocUrl) ? { tocUrl: readString(input.tocUrl) } : {}),
  };
}

export function normalizeBookSource(value: unknown): NormalizedBookSource {
  const input = asRecord(value);
  const ruleSearch = normalizeFieldRules(input.ruleSearch, true);
  const bookList = requireString(ruleSearch.bookList, '搜索规则缺少 bookList');
  if (!ruleSearch.name) throw new Error('搜索规则缺少 name');
  const toc = asRecord(input.ruleToc);
  const content = asRecord(input.ruleContent);
  return {
    name: requireString(input.bookSourceName || input.name, '书源缺少名称'),
    group: readString(input.bookSourceGroup || input.group),
    baseUrl: normalizeBaseUrl(input.bookSourceUrl || input.url),
    searchUrl: requireString(input.searchUrl, '书源缺少 searchUrl'),
    ...(readString(input.exploreUrl) ? { exploreUrl: readString(input.exploreUrl) } : {}),
    ruleSearch: { ...ruleSearch, bookList },
    ...(Object.keys(asRecord(input.ruleExplore)).length
      ? { ruleExplore: normalizeFieldRules(input.ruleExplore) }
      : {}),
    ...(Object.keys(asRecord(input.ruleBookInfo)).length
      ? { ruleBookInfo: normalizeFieldRules(input.ruleBookInfo) }
      : {}),
    ruleToc: {
      chapterList: requireString(toc.chapterList, '目录规则缺少 chapterList'),
      chapterName: requireString(toc.chapterName, '目录规则缺少 chapterName'),
      chapterUrl: requireString(toc.chapterUrl, '目录规则缺少 chapterUrl'),
    },
    ruleContent: {
      content: requireString(content.content, '正文规则缺少 content'),
      ...(readString(content.replaceRegex) ? { replaceRegex: readString(content.replaceRegex) } : {}),
    },
  };
}

export function parseBookSourcePayload(text: string): NormalizedBookSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('书源 JSON 格式无效');
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length) throw new Error('书源 JSON 为空');
  return items.map((item) => normalizeBookSource(item));
}

export function parseBookSourceBatch(text: string): {
  readonly total: number;
  readonly sources: NormalizedBookSource[];
  readonly errors: Array<{ readonly index: number; readonly name: string; readonly reason: string }>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('书源 JSON 格式无效');
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length) throw new Error('书源 JSON 为空');
  const sources: NormalizedBookSource[] = [];
  const errors: Array<{ index: number; name: string; reason: string }> = [];
  items.forEach((item, index) => {
    try {
      sources.push(normalizeBookSource(item));
    } catch (error) {
      const candidate = asRecord(item);
      errors.push({
        index: index + 1,
        name: readString(candidate.bookSourceName || candidate.name) || `书源 ${index + 1}`,
        reason: error instanceof Error ? error.message : '书源格式无效',
      });
    }
  });
  return { total: items.length, sources, errors };
}

export function buildSourceRequestUrl(
  template: string,
  variables: { readonly baseUrl: string; readonly key?: string; readonly page?: number },
): string {
  const page = Math.max(1, Math.floor(variables.page || 1));
  const key = variables.key || '';
  const rendered = template
    .replace(/\{\{\s*(key|searchKey|query)\s*\}\}/gi, encodeURIComponent(key))
    .replace(/\{\{\s*(page|searchPage)\s*\}\}/gi, String(page))
    .replace(/\{(key|searchKey|query)\}/gi, encodeURIComponent(key))
    .replace(/\{(page|searchPage)\}/gi, String(page));
  let url: URL;
  try {
    url = new URL(rendered, variables.baseUrl);
  } catch {
    throw new Error('书源请求地址无效');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('书源请求必须使用 HTTP 或 HTTPS');
  }
  return url.toString();
}

function cssSelector(rule: string): string {
  return rule.replace(/^@css\s*:\s*/i, '').trim();
}

function selectionText(selection: any): string {
  return String(selection?.text?.() || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function resolveRemoteUrl(raw: string, pageUrl: string): string {
  if (!raw) return '';
  try {
    const url = new URL(raw, pageUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function readField(context: any, rule: string | undefined, pageUrl: string, urlField = false): string {
  if (!rule) return '';
  const valueRule = rule.trim();
  const suffixMatch = valueRule.match(/^(.*)@(text|html|href|src|content|value|title)$/i);
  const selector = cssSelector(suffixMatch?.[1] || valueRule);
  const suffix = (suffixMatch?.[2] || 'text').toLowerCase();
  if (!selector) return '';
  let selected: any;
  try {
    selected = context.find(selector).first();
  } catch {
    return '';
  }
  const value = suffix === 'text'
    ? selectionText(selected)
    : suffix === 'html'
      ? String(selected.html() || '').trim()
      : String(selected.attr(suffix) || '').trim();
  return urlField ? resolveRemoteUrl(value, pageUrl) : value;
}

function parseJsonBody(body: string): unknown | null {
  const trimmed = body.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function isJsonRule(rule: string | undefined): boolean {
  return !!rule && (/^@json\s*:/i.test(rule.trim()) || rule.trim().startsWith('$'));
}

function selectJsonPath(root: unknown, rule: string): unknown[] {
  const path = rule.replace(/^@json\s*:\s*/i, '').trim();
  if (!path || path === '$') return [root];
  const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+|\[\*\]|\[\d+\]/g) || [];
  let values: unknown[] = [root];
  for (const token of tokens) {
    if (token === '[*]') {
      values = values.flatMap((value) => Array.isArray(value) ? value : []);
      continue;
    }
    const indexMatch = token.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      const index = Number(indexMatch[1]);
      values = values.flatMap((value) => Array.isArray(value) && value[index] != null ? [value[index]] : []);
      continue;
    }
    values = values.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const next = (value as UnknownRecord)[token];
      return next == null ? [] : [next];
    });
  }
  return values;
}

function readJsonField(context: unknown, rule: string | undefined, pageUrl: string, urlField = false): string {
  if (!rule || !isJsonRule(rule)) return '';
  const value = selectJsonPath(context, rule)[0];
  const text = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  return urlField ? resolveRemoteUrl(text, pageUrl) : text;
}

function searchItemNodes(source: NormalizedBookSource, html: string): { $: any; items: any[] } {
  const $ = load(html);
  const selector = cssSelector(source.ruleSearch.bookList);
  try {
    return { $, items: $(selector).toArray() };
  } catch {
    return { $, items: [] };
  }
}

export function parseSearchResults(source: NormalizedBookSource, html: string, pageUrl: string): SourceBookSummary[] {
  const json = parseJsonBody(html);
  if (json !== null && isJsonRule(source.ruleSearch.bookList)) {
    return selectJsonPath(json, source.ruleSearch.bookList).flatMap((item) => {
      const title = readJsonField(item, source.ruleSearch.name, pageUrl);
      const bookUrl = readJsonField(item, source.ruleSearch.bookUrl, pageUrl, true);
      if (!title || !bookUrl) return [];
      return [{
        title,
        author: readJsonField(item, source.ruleSearch.author, pageUrl) || '佚名',
        bookUrl,
        description: readJsonField(item, source.ruleSearch.intro, pageUrl),
        ...(readJsonField(item, source.ruleSearch.coverUrl, pageUrl, true)
          ? { coverUrl: readJsonField(item, source.ruleSearch.coverUrl, pageUrl, true) }
          : {}),
        ...(readJsonField(item, source.ruleSearch.kind, pageUrl)
          ? { kind: readJsonField(item, source.ruleSearch.kind, pageUrl) }
          : {}),
        ...(readJsonField(item, source.ruleSearch.wordCount, pageUrl)
          ? { wordCount: readJsonField(item, source.ruleSearch.wordCount, pageUrl) }
          : {}),
        ...(readJsonField(item, source.ruleSearch.lastChapter, pageUrl)
          ? { lastChapter: readJsonField(item, source.ruleSearch.lastChapter, pageUrl) }
          : {}),
      }];
    });
  }
  const { $, items } = searchItemNodes(source, html);
  return items.map((item) => {
    const context = $(item);
    return {
      title: readField(context, source.ruleSearch.name, pageUrl),
      author: readField(context, source.ruleSearch.author, pageUrl) || '佚名',
      bookUrl: readField(context, source.ruleSearch.bookUrl, pageUrl, true),
      description: readField(context, source.ruleSearch.intro, pageUrl),
      ...(readField(context, source.ruleSearch.coverUrl, pageUrl, true)
        ? { coverUrl: readField(context, source.ruleSearch.coverUrl, pageUrl, true) }
        : {}),
      ...(readField(context, source.ruleSearch.kind, pageUrl)
        ? { kind: readField(context, source.ruleSearch.kind, pageUrl) }
        : {}),
      ...(readField(context, source.ruleSearch.wordCount, pageUrl)
        ? { wordCount: readField(context, source.ruleSearch.wordCount, pageUrl) }
        : {}),
      ...(readField(context, source.ruleSearch.lastChapter, pageUrl)
        ? { lastChapter: readField(context, source.ruleSearch.lastChapter, pageUrl) }
        : {}),
    };
  }).filter((item) => item.title && item.bookUrl);
}

export function parseBookInfo(source: NormalizedBookSource, html: string, bookUrl: string): SourceBookInfo | null {
  const json = parseJsonBody(html);
  const rules = source.ruleBookInfo;
  if (json !== null && rules && isJsonRule(rules.name)) {
    const title = readJsonField(json, rules.name, bookUrl);
    if (!title) return null;
    return {
      title,
      author: readJsonField(json, rules.author, bookUrl) || '佚名',
      bookUrl,
      description: readJsonField(json, rules.intro, bookUrl),
      ...(readJsonField(json, rules.coverUrl, bookUrl, true)
        ? { coverUrl: readJsonField(json, rules.coverUrl, bookUrl, true) }
        : {}),
      ...(readJsonField(json, rules.kind, bookUrl) ? { kind: readJsonField(json, rules.kind, bookUrl) } : {}),
      ...(readJsonField(json, rules.wordCount, bookUrl) ? { wordCount: readJsonField(json, rules.wordCount, bookUrl) } : {}),
      ...(readJsonField(json, rules.lastChapter, bookUrl) ? { lastChapter: readJsonField(json, rules.lastChapter, bookUrl) } : {}),
      ...(readJsonField(json, rules.tocUrl, bookUrl, true) ? { tocUrl: readJsonField(json, rules.tocUrl, bookUrl, true) } : {}),
    };
  }
  const $ = load(html);
  const body = $('body');
  const title = readField(body, rules?.name, bookUrl);
  if (!title) return null;
  return {
    title,
    author: readField(body, rules?.author, bookUrl) || '佚名',
    bookUrl,
    description: readField(body, rules?.intro, bookUrl),
    ...(readField(body, rules?.coverUrl, bookUrl, true)
      ? { coverUrl: readField(body, rules?.coverUrl, bookUrl, true) }
      : {}),
    ...(readField(body, rules?.kind, bookUrl) ? { kind: readField(body, rules?.kind, bookUrl) } : {}),
    ...(readField(body, rules?.wordCount, bookUrl) ? { wordCount: readField(body, rules?.wordCount, bookUrl) } : {}),
    ...(readField(body, rules?.lastChapter, bookUrl) ? { lastChapter: readField(body, rules?.lastChapter, bookUrl) } : {}),
    ...(readField(body, rules?.tocUrl, bookUrl, true) ? { tocUrl: readField(body, rules?.tocUrl, bookUrl, true) } : {}),
  };
}

export function parseChapterList(source: NormalizedBookSource, html: string, pageUrl: string): SourceChapter[] {
  const json = parseJsonBody(html);
  if (json !== null && isJsonRule(source.ruleToc.chapterList)) {
    return selectJsonPath(json, source.ruleToc.chapterList).flatMap((item) => {
      const title = readJsonField(item, source.ruleToc.chapterName, pageUrl);
      const url = readJsonField(item, source.ruleToc.chapterUrl, pageUrl, true);
      return title && url ? [{ title, url }] : [];
    });
  }
  const $ = load(html);
  let items: any[] = [];
  try {
    items = $(cssSelector(source.ruleToc.chapterList)).toArray();
  } catch {
    return [];
  }
  return items.map((item) => {
    const context = $(item);
    return {
      title: readField(context, source.ruleToc.chapterName, pageUrl),
      url: readField(context, source.ruleToc.chapterUrl, pageUrl, true),
    };
  }).filter((chapter) => chapter.title && chapter.url);
}

export function parseChapterContent(source: NormalizedBookSource, html: string, pageUrl: string): string[] {
  const json = parseJsonBody(html);
  if (json !== null && isJsonRule(source.ruleContent.content)) {
    let text = readJsonField(json, source.ruleContent.content, pageUrl);
    if (!text) return [];
    if (source.ruleContent.replaceRegex) {
      try {
        text = text.replace(new RegExp(source.ruleContent.replaceRegex, 'g'), '');
      } catch {
        throw new Error('正文替换规则无效');
      }
    }
    return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }
  const $ = load(html);
  let content: any;
  try {
    content = $(cssSelector(source.ruleContent.content)).first();
  } catch {
    return [];
  }
  if (!content.length) return [];
  const fragment = content.clone();
  fragment.find('script, style, iframe, noscript, ins, .ads, .advert, [id*="ad-"], [class*="ad-"]').remove();
  fragment.find('br').replaceWith('\n');
  fragment.find('p, div, section, article, li, h1, h2, h3, h4, h5, h6, blockquote').each((_: number, node: any) => {
    $(node).after('\n');
  });
  let text = String(fragment.text() || '').replace(/\u00a0/g, ' ');
  if (source.ruleContent.replaceRegex) {
    try {
      text = text.replace(new RegExp(source.ruleContent.replaceRegex, 'g'), '');
    } catch {
      throw new Error('正文替换规则无效');
    }
  }
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean);
}
