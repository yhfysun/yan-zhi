// 基于项目内置 Playwright 浏览器的 web_search 后端。
// 当模型调用 web_search 时，用 Playwright 打开搜索引擎（默认必应）的关键字结果页，
// 返回清洗后的页面文本/链接给模型，复用项目已有的浏览器基础设施，无需外部搜索 API。
// 注：页面 DOM 原文含大量 script/style 噪音，这里返回清洗后的可见文本 + 结果链接，
//     更贴近「返回 DOM/文本就好」的诉求，且模型可直接据此判断并配合 browser_navigate 深挖。
import type { SearchBackend, SearchResult } from '@yan-zhi/core';

type EngineConfig = {
  url: (query: string) => string;
  strip: (raw: string) => string;
};

const ENGINES: Record<string, EngineConfig> = {
  bing: {
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    strip: (raw) =>
      raw
        // 移除 script/style/nav/表单等噪声块
        .replace(/<(script|style|noscript|svg|nav|header|footer|form|button|aside)[\s\S]*?<\/\1>/gi, ' ')
        // 移除所有其余标签，保留文本与链接
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h1|h2|h3|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        // 归一化空白
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim(),
  },
  baidu: {
    url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    strip: (raw) =>
      raw
        .replace(/<(script|style|noscript|svg|nav|header|footer|form|button|aside)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h1|h2|h3|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim(),
  },
};

let _pw: any = null;
async function loadPlaywright() {
  if (_pw) return _pw;
  try {
    _pw = await import('playwright');
    return _pw;
  } catch {
    throw new Error('playwright 未安装，请在 apps/server 执行 pnpm add playwright 并运行 npx playwright install chromium');
  }
}

// 缓存单个浏览器 + 页面实例（与 browser.ts 相同策略，避免每次搜索重复启动）
let _browser: any = null;
let _page: any = null;
async function getPage() {
  const { chromium } = await loadPlaywright();
  if (_browser && _browser.isConnected?.()) {
    if (!_page || _page.isClosed?.()) {
      const context = await _browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        locale: 'zh-CN',
      });
      _page = await context.newPage();
    }
    return _page;
  }
  _browser = await chromium.launch({ headless: true });
  const context = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'zh-CN',
  });
  _page = await context.newPage();
  return _page;
}

/** 搜索后端：用内置 Playwright 抓取搜索引擎结果页，返回清洗后的文本 */
export class PlaywrightSearchBackend implements SearchBackend {
  constructor(private engine: 'bing' | 'baidu' = 'bing', private maxTextChars = 20000) {}

  async search(query: string): Promise<SearchResult[]> {
    const cfg = ENGINES[this.engine] || ENGINES.bing;
    const page = await getPage().catch(() => null);
    if (!page) {
      throw new Error('浏览器后端不可用：playwright/chromium 未就绪');
    }
    const url = cfg.url(query);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    // 多等片刻让搜索结果显示
    await page.waitForTimeout(1200).catch(() => {});
    const raw = await page.content().catch(() => '');
    const title = (await page.title().catch(() => '')) || query;
    const text = cfg.strip(raw).slice(0, this.maxTextChars);
    return [
      {
        title,
        url,
        snippet: text || '（搜索结果页未返回内容，可能被搜索引擎拦截或网络不可达）',
      },
    ];
  }
}
