// web_fetch 内置工具 —— 抓取网页并抽取正文，与 web_search 串成「搜索 → 详情」两步走。
// 零新依赖：不用 Readability，用轻量结构块抽取（p/h1-h6/li/blockquote/pre/td），
// 块抽取失败时回退到「剥所有标签」整页文本。多 URL 并发抓取（Promise.allSettled），单个失败不影响其它。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function stripEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return stripEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface ExtractedPage {
  title: string;
  description: string;
  text: string;
}

/**
 * 轻量正文抽取（导出用于测试）：
 * 1. 提取 <title> 与 <meta name="description">
 * 2. 剥 script/style/nav 等噪声块
 * 3. 收集结构文本块（p/h1-h6/li/blockquote/pre/td），过滤 <20 字符碎块
 * 4. 块内容 <200 字符时回退「剥所有标签」整页文本
 */
export function extractMainContent(html: string): ExtractedPage {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = stripEntities(
    (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] || '').trim(),
  );

  const body = html.replace(
    /<(script|style|noscript|svg|iframe|nav|header|footer|aside|form|button|select|template)[\s\S]*?<\/\1>/gi,
    ' ',
  );

  const blocks: string[] = [];
  const blockRe = /<(p|h[1-6]|li|blockquote|pre|td)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const text = stripTags(m[2]);
    if (text.length >= 20) blocks.push(text);
  }

  let text = blocks.join('\n');
  if (text.length < 200) {
    text = stripEntities(body.replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
  }
  return { title, description, text };
}

/** 单 URL 抓取（导出用于测试） */
export async function fetchPage(url: string, timeout: number, maxChars: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();
    // JSON/纯文本等非 HTML：直接给原文（截断）；HTML 走正文抽取
    if (!contentType.includes('html')) {
      const t = raw.slice(0, maxChars);
      return `内容类型: ${contentType || '未知'}\n\n${t}${raw.length > maxChars ? `\n... [已截断，共 ${raw.length} 字符]` : ''}`;
    }
    const { title, description, text } = extractMainContent(raw);
    const truncated = text.length > maxChars;
    const parts = [
      title ? `标题: ${title}` : '',
      description ? `描述: ${description}` : '',
      '',
      truncated ? `${text.slice(0, maxChars)}\n... [正文已截断，共 ${text.length} 字符]` : text,
    ].filter((s, i) => s !== '' || i < 2);
    return parts.join('\n');
  } finally {
    clearTimeout(timer);
  }
}

export class WebFetchTool implements BuiltInTool {
  name = 'web_fetch';
  description = 'Fetch one or more web pages (URLs from web_search results) and extract readable main content (title/description/body text). Use after web_search to dig into promising results. Accepts 1-5 URLs, fetches them concurrently, HTML main-content extracted, JSON/plain-text returned as-is.';

  inputSchema = {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'URLs to fetch (1-5 items). Typically from web_search results.',
      },
      maxChars: {
        type: 'number',
        description: 'Max main-content characters per URL (default 8000, max 20000).',
      },
      timeout: {
        type: 'number',
        description: 'Per-URL fetch timeout in ms (default 20000, max 60000).',
      },
    },
    required: ['urls'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const rawUrls = Array.isArray(args.urls) ? args.urls : [];
    const urls = rawUrls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim())).slice(0, 5);
    if (urls.length === 0) {
      return { content: [{ type: 'text', text: 'Error: urls 必须是 1~5 个 http(s):// 开头的 URL 数组' }], isError: true };
    }
    const maxChars = Math.min(Math.max(Number(args.maxChars) || 8000, 500), 20000);
    const timeout = Math.min(Math.max(Number(args.timeout) || 20000, 2000), 60000);

    const settled = await Promise.allSettled(urls.map((u) => fetchPage(u.trim(), timeout, maxChars)));

    const sections = settled.map((r, i) => {
      const url = urls[i].trim();
      if (r.status === 'fulfilled') {
        return `[${i + 1}] ${url}\n\n${r.value}`;
      }
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      const hint = /abort/i.test(reason) ? '（超时）' : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(reason) ? '（网络不可达或域名不存在）' : '';
      return `[${i + 1}] ${url}\n抓取失败: ${reason}${hint}`;
    });

    return { content: [{ type: 'text', text: sections.join('\n\n---\n\n') }] };
  }
}
