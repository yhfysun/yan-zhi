// 内置浏览器路由 —— Playwright headless/headed 浏览器自动化
// 懒加载 playwright：未安装时返回友好错误，不影响服务启动
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();
router.use(optionalAuth); // 浏览器功能不需要登录，有 token 就解析（可选）

// Playwright 单例（懒启动）
let chromiumModule: any = null;
let browserInstance: any = null;
let pageInstance: any = null;
let lastActivityAt = 0;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟空闲后关闭

// 下载记录（Playwright download 事件收集，内存中保留最近 50 条）
interface DownloadRecord { url: string; filename: string; time: number; }
const downloadRecords: DownloadRecord[] = [];

/** 懒加载 playwright 模块 */
async function loadChromium() {
  if (chromiumModule) return chromiumModule;
  try {
    chromiumModule = await import('playwright');
    return chromiumModule;
  } catch {
    throw new Error('playwright 未安装，请在 apps/server 执行 pnpm add playwright 并运行 npx playwright install chromium');
  }
}

/** 获取或启动浏览器实例（headless 模式：不弹窗；截屏/导航/下载照常工作） */
async function getBrowser() {
  const { chromium } = await loadChromium();
  if (browserInstance && browserInstance.isConnected?.()) {
    lastActivityAt = Date.now();
    return browserInstance;
  }
  // headless：headless: true 默认，不弹出可见窗口
  browserInstance = await chromium.launch({ headless: true });
  lastActivityAt = Date.now();
  // 注册空闲超时关闭
  scheduleIdleCheck();
  return browserInstance;
}

/** 获取或创建页面 */
async function getPage() {
  const browser = await getBrowser();
  if (pageInstance && !pageInstance.isClosed?.()) {
    lastActivityAt = Date.now();
    return pageInstance;
  }
  // 创建 context 时设置合理默认值：viewport、user agent、locale
  // 远程浏览器方案下，前端会动态同步 viewport 尺寸，这里给一个合理初始值
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'zh-CN',
  });
  pageInstance = await context.newPage();
  // 监听下载事件，记录到 downloadRecords
  pageInstance.on('download', async (download: any) => {
    try {
      const filename = download.suggestedFilename();
      const url = download.url();
      downloadRecords.unshift({ url, filename, time: Date.now() });
      if (downloadRecords.length > 50) downloadRecords.pop();
      // 保存到 workspace/downloads/
      const savePath = `workspace/downloads/${filename}`;
      await download.saveAs(savePath);
    } catch {}
  });
  lastActivityAt = Date.now();
  return pageInstance;
}

/** 空闲超时检查：关闭浏览器释放资源 */
function scheduleIdleCheck() {
  setTimeout(async () => {
    if (Date.now() - lastActivityAt > IDLE_TIMEOUT_MS) {
      try {
        if (pageInstance && !pageInstance.isClosed?.()) await pageInstance.close();
        if (browserInstance) await browserInstance.close();
      } catch {}
      pageInstance = null;
      browserInstance = null;
    } else {
      scheduleIdleCheck();
    }
  }, IDLE_TIMEOUT_MS);
}

// POST /api/browser/navigate —— 导航到 URL（返回 url + title，前端用 /render 获取 DOM）
router.post('/navigate', async (req: Request, res: Response) => {
  try {
    const { url, viewport } = req.body || {};
    if (!url) { res.status(400).json({ error: 'url 为必填项' }); return; }
    const page = await getPage();
    // 同步前端视口大小
    if (viewport && viewport.width && viewport.height) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height }).catch(() => {});
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    const currentUrl = page.url();
    lastActivityAt = Date.now();
    res.json({ data: { url: currentUrl, title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '导航失败' });
  }
});


// POST /api/browser/action —— 执行浏览器动作（click/type/press/scroll/hover/get_text/get_dom/wait）
router.post('/action', async (req: Request, res: Response) => {
  try {
    const { action, selector, text, key, x, y, timeout } = req.body || {};
    if (!action) { res.status(400).json({ error: 'action 为必填项' }); return; }
    const page = await getPage();
    let result: unknown = null;

    switch (action) {
      case 'click': {
        // 真实鼠标点击：先 move 再 click
        if (selector) {
          await page.locator(selector).scrollIntoViewIfNeeded().catch(() => {});
          const box = await page.locator(selector).boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          } else {
            await page.click(selector);
          }
        } else if (x !== undefined && y !== undefined) {
          await page.mouse.click(x, y);
        }
        result = { clicked: true };
        break;
      }
      case 'type': {
        // 真实键盘输入：逐字符 type
        if (selector) await page.locator(selector).click().catch(() => {});
        await page.keyboard.type(text || '', { delay: 30 });
        result = { typed: text?.length || 0 };
        break;
      }
      case 'press': {
        // 真实键盘按键
        await page.keyboard.press(key || 'Enter');
        result = { pressed: key || 'Enter' };
        break;
      }
      case 'scroll': {
        if (selector) {
          await page.locator(selector).scrollIntoViewIfNeeded().catch(() => {});
        } else {
          await page.mouse.wheel(x || 0, y || 300);
        }
        result = { scrolled: true };
        break;
      }
      case 'hover': {
        if (selector) {
          const box = await page.locator(selector).boundingBox();
          if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        } else if (x !== undefined && y !== undefined) {
          await page.mouse.move(x, y);
        }
        result = { hovered: true };
        break;
      }
      case 'get_text': {
        result = selector ? await page.locator(selector).textContent() : await page.content();
        break;
      }
      case 'get_dom': {
        // 获取简化 DOM 结构（可见元素摘要）
        const html = await page.content();
        result = { length: html.length, preview: html.slice(0, 2000) };
        break;
      }
      case 'wait': {
        const ms = Math.min(timeout || 1000, 10000);
        await page.waitForTimeout(ms);
        result = { waited: ms };
        break;
      }
      case 'screenshot': {
        const buf = await page.screenshot({ fullPage: false });
        result = { base64: buf.toString('base64') };
        break;
      }
      default:
        res.status(400).json({ error: '未知 action: ' + action }); return;
    }
    lastActivityAt = Date.now();
    res.json({ data: result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '浏览器动作失败' });
  }
});

// GET /api/browser/state —— 获取当前浏览器状态
router.get('/state', async (_req: Request, res: Response) => {
  try {
    if (!browserInstance || !pageInstance) {
      res.json({ data: { active: false } });
      return;
    }
    const url = pageInstance.url();
    const title = await pageInstance.title().catch(() => '');
    res.json({ data: { active: true, url, title } });
  } catch (e: any) {
    res.json({ data: { active: false, error: e?.message } });
  }
});

// POST /api/browser/focus —— 聚焦浏览器窗口（置于前台）
router.post('/focus', async (_req: Request, res: Response) => {
  try {
    if (!browserInstance) { res.status(400).json({ error: '浏览器未启动' }); return; }
    // headed 模式下，通过新建 page 并关闭来唤起窗口焦点
    const page = await getPage();
    await page.bringToFront();
    lastActivityAt = Date.now();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '聚焦失败' });
  }
});

// POST /api/browser/back —— 后退（返回 url + title）
router.post('/back', async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '后退失败' });
  }
});

// POST /api/browser/forward —— 前进（返回 url + title）
router.post('/forward', async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '前进失败' });
  }
});

// POST /api/browser/refresh —— 刷新当前页（返回 url + title）
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '刷新失败' });
  }
});

// POST /api/browser/close —— 关闭浏览器
router.post('/close', async (_req: Request, res: Response) => {
  try {
    if (pageInstance && !pageInstance.isClosed?.()) await pageInstance.close();
    if (browserInstance) await browserInstance.close();
    pageInstance = null;
    browserInstance = null;
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '关闭失败' });
  }
});

// GET /api/browser/screenshot —— 当前页面截图（PNG）。?fullPage=true 截长图，?download=文件名 下载
router.get('/screenshot', async (req: Request, res: Response) => {
  try {
    if (!pageInstance || pageInstance.isClosed?.()) {
      res.status(400).json({ error: '浏览器未启动' });
      return;
    }
    const fullPage = req.query.fullPage === 'true';
    const downloadName = req.query.download as string | undefined;
    const screenshot = await pageInstance.screenshot({ type: 'png', fullPage });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (downloadName) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    }
    res.send(screenshot);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '截图失败' });
  }
});

// GET /api/browser/downloads —— 获取页面下载记录（Playwright download 事件收集）
router.get('/downloads', async (_req: Request, res: Response) => {
  try {
    res.json({ data: downloadRecords });
  } catch {
    res.json({ data: [] });
  }
});

// GET /api/browser/render?url=... —— Playwright 预渲染：获取已渲染 DOM，移除 script，重写 URL
// 流程：用 Playwright 加载页面 → 等待渲染 → 取完整 HTML → 移除 script/noscript/CSP meta →
//       重写资源 URL 为代理 URL → 注入样式修复 → 返回 HTML（由前端 iframe 显示）
router.get('/render', async (req: Request, res: Response) => {
  try {
    const target = String(req.query.url || '');
    if (!/^https?:\/\//i.test(target)) {
      res.status(400).json({ error: 'url 需以 http:// 或 https:// 开头' });
      return;
    }
    const parsed = new URL(target);
    const page = await getPage();

    // 设置 viewport（从 query 参数获取，默认 1280x800）
    const vw = parseInt(String(req.query.w || '1280'), 10) || 1280;
    const vh = parseInt(String(req.query.h || '800'), 10) || 800;
    await page.setViewportSize({ width: vw, height: vh }).catch(() => {});

    // 导航并等待渲染
    await page.goto(target, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {
      // networkidle 可能超时，忽略，继续获取已有 DOM
    });
    // 额外等待确保 SPA 渲染完成
    await page.waitForTimeout(1000).catch(() => {});

    // 获取已渲染的完整 HTML
    let html = await page.content();
    lastActivityAt = Date.now();

    // 1) 移除所有 <script> 标签（防止 JS 重新执行导致 iframe 检测/重复请求等问题）
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // 2) 移除 <noscript> 标签内容
    html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
    // 3) 删除 CSP / X-Frame-Options meta 标签
    html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
    html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

    // 4) 重写所有资源 URL 为代理 URL
    const baseOrigin = parsed.origin;
    html = rewriteRenderUrls(html, baseOrigin);

    // 5) 注入样式修复（移除 body 限制、确保正常滚动）
    const fixStyle = `<style>html,body{margin:0!important;padding:0!important;overflow:auto!important;height:auto!important;max-height:none!important;}</style>`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${fixStyle}`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html([^>]*)>/i, `<html$1><head>${fixStyle}</head>`);
    } else {
      html = fixStyle + html;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 剥离反嵌入头
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.removeHeader('content-security-policy-report-only');
    res.send(html);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '渲染失败' });
  }
});

// GET /api/browser/proxy —— 同源反向代理（内置浏览器核心）
// 1) 剥离 X-Frame-Options / CSP(frame-ancestors) 等反嵌入头，使目标站能在 iframe 内真实渲染
// 2) 重写 HTML 内 href/src/action 为代理 URL，使点击/资源/表单提交都走代理（维持代理壳，否则点链接就被挡白屏）
// 3) 维护按 host 的 cookie jar，在后端透传登录态，使代理模式下可正常登录、持续浏览
// 直连模式（iframe src=目标URL）对允许嵌入的内部系统体验最佳；代理模式用于禁嵌入的公网站点。
router.all('/proxy', async (req: Request, res: Response) => {
  try {
    const target = String(req.query.url || '');
    if (!/^https?:\/\//i.test(target)) {
      res.status(400).json({ error: 'url 需以 http:// 或 https:// 开头' });
      return;
    }
    const parsed = new URL(target);
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    // 表单登录等 POST 场景：读取原始请求体转发给目标站（app 级 json 中间件不消费 urlencoded，故可读到）
    const bodyBuffer = (method === 'GET' || method === 'HEAD') ? undefined : await readRawBody(req);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const init: any = {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': getCookieHeader(parsed.host),
      },
    };
    if (bodyBuffer && bodyBuffer.length) {
      init.body = bodyBuffer;
      const ct = req.headers['content-type'];
      if (ct) init.headers['Content-Type'] = ct;
    }
    const upstream = await fetch(target, init);
    clearTimeout(timer);

    const setCookieHeaders: string[] = [];
    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === 'set-cookie') setCookieHeaders.push(v);
    }
    storeCookies(parsed.host, setCookieHeaders);

    const contentType = upstream.headers.get('content-type') || '';
    const buf = Buffer.from(await upstream.arrayBuffer());

    // 剥离反嵌入响应头（若透传非 HTML 资源时会带上来）
    ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only'].forEach(h => {
      res.removeHeader(h);
    });

    if (contentType.toLowerCase().includes('text/html')) {
      let html = buf.toString('utf8');
      html = rewriteProxyUrls(html, parsed.origin);
      // 注入 iframe 检测覆盖脚本：让 window.top/parent/self 都返回 window，frameElement 返回 null
      // 解决 GitHub 等站点检测到自己在 iframe 中拒绝渲染的问题
      const iframeBypassScript = `<script>(function(){try{Object.defineProperty(window,'top',{get:function(){return window;}});Object.defineProperty(window,'parent',{get:function(){return window;}});Object.defineProperty(window,'self',{get:function(){return window;}});Object.defineProperty(window,'frameElement',{get:function(){return null;}});}catch(e){}})();</script>`;
      // 注入 fetch/XHR/Image/动态脚本拦截：把 JS 动态请求的 URL 转为代理 URL
      const proxyInterceptScript = `<script>(function(){
  var ORIGIN=${JSON.stringify(parsed.origin)};
  function wrap(u){try{if(!u||/^(data:|blob:|#|javascript:|mailto:|tel:|about:)/i.test(u))return u;var abs;if(/^\\/\\//.test(u))abs=location.protocol+u;else if(/^\\//.test(u))abs=ORIGIN+u;else if(/^https?:/i.test(u))abs=u;else abs=new URL(u,ORIGIN+'/').href;return '/api/browser/proxy?url='+encodeURIComponent(abs);}catch(e){return u;}}
  var origFetch=window.fetch;
  window.fetch=function(input,init){try{if(typeof input==='string')input=wrap(input);else if(input&&input.url)input=new Request(wrap(input.url),input);}catch(e){}return origFetch.call(this,input,init);};
  var origOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){try{arguments[1]=wrap(url);}catch(e){}return origOpen.apply(this,arguments);};
  var ImgSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  if(ImgSrc&&ImgSrc.set){Object.defineProperty(HTMLImageElement.prototype,'src',{set:function(v){ImgSrc.set.call(this,wrap(v));},get:function(){return ImgSrc.get.call(this);},configurable:true});}
  var origCreate=document.createElement;
  document.createElement=function(tag){var el=origCreate.call(this,tag);if(tag.toLowerCase()==='script'){var desc=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');if(desc&&desc.set){Object.defineProperty(el,'src',{set:function(v){desc.set.call(this,wrap(v));},get:function(){return desc.get.call(this);}});}}return el;};
})();</script>`;
      const inject = iframeBypassScript + proxyInterceptScript;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
      } else if (/<html[^>]*/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
      } else {
        html = inject + html;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else if (contentType.toLowerCase().includes('text/css')) {
      // CSS 文件：重写内部 url() 引用（背景图/字体等），避免指向原站被阻止
      let css = buf.toString('utf8');
      css = rewriteCssUrls(css, parsed.origin);
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.send(css);
    } else {
      // 非 HTML 资源（图片/js 等）透传；静态资源跨域加载不受 CORS 限制
      res.setHeader('Content-Type', contentType);
      upstream.headers.forEach((v, k) => {
        const lk = k.toLowerCase();
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lk)) {
          res.setHeader(k, v);
        }
      });
      res.send(buf);
    }
  } catch (e: any) {
    res.status(502).json({ error: '代理请求失败: ' + (e?.message || e) });
  }
});

// 读取原始请求体（用于代理转发表单登录等 POST 场景）
function readRawBody(req: Request): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

// 把任意 URL 转为同源代理 URL（保留协议相对/绝对/相对路径语义）
// 跳过锚点、特殊协议（javascript/mailto/tel/data/about）等不应代理的 URL
function wrapProxyUrl(u: string, baseOrigin: string): string {
  if (!u || /^(#|javascript:|mailto:|tel:|data:|about:)/i.test(u)) return u;
  let abs: string;
  if (/^\/\//.test(u)) abs = baseOrigin.split(':')[0] + ':' + u;
  else if (/^\//.test(u)) abs = baseOrigin + u;
  else if (/^https?:\/\//i.test(u)) abs = u;
  else { try { abs = new URL(u, baseOrigin + '/').href; } catch { return u; } }
  return '/api/browser/proxy?url=' + encodeURIComponent(abs);
}

// 重写 CSS 内容中的 url(...) 引用（背景图、字体等）
// 跳过 data: URI 和锚点，其余 url() 一律改为代理 URL，避免 CSS 内资源指向原站被阻止
function rewriteCssUrls(css: string, baseOrigin: string): string {
  return css.replace(/url\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, quote: string, url: string) => {
    if (/^(data:|#)/i.test(url)) return m; // data URI 和锚点不重写
    const wrapped = wrapProxyUrl(url, baseOrigin);
    return `url(${quote}${wrapped}${quote})`;
  });
}

// 把 HTML 中的各类 URL 改为同源代理 URL，使 iframe 内所有导航与资源都走代理
// 处理：href/src/action、srcset、poster、内联 style 属性、内联 <style> 标签、meta refresh
// 同时删除 HTML 中的 meta CSP / meta X-Frame-Options（响应头已被剥离，但 meta 仍会生效）
function rewriteProxyUrls(html: string, baseOrigin: string): string {
  const wrap = (u: string): string => wrapProxyUrl(u, baseOrigin);

  // 1) 删除 HTML 中的 CSP / X-Frame-Options meta 标签
  //    响应头剥离不足以让 iframe 渲染：HTML 内 <meta http-equiv="Content-Security-Policy"> 仍会生效
  html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

  // 2) 重写 href/src/action（双引号 + 单引号）
  html = html.replace(/(href|src|action)=(")([^"]*)(")/gi, (_m, attr: string, oq: string, val: string, cq: string) => `${attr}=${oq}${wrap(val)}${cq}`);
  html = html.replace(/(href|src|action)=(')([^']*)(')/gi, (_m, attr: string, oq: string, val: string, cq: string) => `${attr}=${oq}${wrap(val)}${cq}`);

  // 3) 重写 srcset 属性：格式 "url1 1x, url2 2x" 或 "url1 100w, url2 200w"
  html = html.replace(/srcset\s*=\s*"([^"]*)"/gi, (_m, val: string) => {
    const rewritten = val.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const url = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
      const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : '';
      return wrap(url) + descriptor;
    }).join(', ');
    return `srcset="${rewritten}"`;
  });
  html = html.replace(/srcset\s*=\s*'([^']*)'/gi, (_m, val: string) => {
    const rewritten = val.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const url = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
      const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : '';
      return wrap(url) + descriptor;
    }).join(', ');
    return `srcset='${rewritten}'`;
  });

  // 4) 重写 poster 属性（video poster 图）
  html = html.replace(/poster\s*=\s*"([^"]*)"/gi, (_m, val: string) => `poster="${wrap(val)}"`);
  html = html.replace(/poster\s*=\s*'([^']*)'/gi, (_m, val: string) => `poster='${wrap(val)}'`);

  // 5) 重写内联 style 属性中的 url()
  html = html.replace(/style\s*=\s*"([^"]*)"/gi, (_m, val: string) => `style="${rewriteCssUrls(val, baseOrigin)}"`);
  html = html.replace(/style\s*=\s*'([^']*)'/gi, (_m, val: string) => `style='${rewriteCssUrls(val, baseOrigin)}'`);

  // 6) 重写内联 <style> 标签中的 url()
  html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => {
    return `<style${attrs}>${rewriteCssUrls(css, baseOrigin)}</style>`;
  });

  // 7) 重写 <meta http-equiv="refresh" content="...;url=..."> 中的 URL
  html = html.replace(/<meta([^>]*http-equiv=["']?refresh["']?[^>]*)>/gi, (_m, attrs: string) => {
    return '<meta' + attrs.replace(/url\s*=\s*([^\s;]+)/gi, (mm: string, u: string) => `url=${wrap(u)}`) + '>';
  });

  return html;
}

/**
 * 重写渲染后 HTML 中的资源 URL 为代理 URL（用于 /render 路由）。
 * 与 rewriteProxyUrls 的差异：不重写 <a> 的 href（链接由前端拦截），
 * 只重写资源类引用（link/img/source/video/audio/embed/iframe/track/srcset/poster/style url()/meta refresh）。
 */
function rewriteRenderUrls(html: string, baseOrigin: string): string {
  const wrap = (u: string): string => wrapProxyUrl(u, baseOrigin);

  // 1) 重写 <link> 的 href（CSS 等）
  html = html.replace(/<link\b[^>]*>/gi, (m) => {
    return m.replace(/href\s*=\s*"([^"]*)"/gi, (mm, val: string) => `href="${wrap(val)}"`)
            .replace(/href\s*=\s*'([^']*)'/gi, (mm, val: string) => `href='${wrap(val)}'`);
  });

  // 2) 重写 src（img/source/video/audio/embed/iframe/track）
  html = html.replace(/src\s*=\s*"([^"]*)"/gi, (m, val: string) => {
    if (/^(data:|blob:|#|javascript:|mailto:|tel:|about:)/i.test(val)) return m;
    return `src="${wrap(val)}"`;
  });
  html = html.replace(/src\s*=\s*'([^']*)'/gi, (m, val: string) => {
    if (/^(data:|blob:|#|javascript:|mailto:|tel:|about:)/i.test(val)) return m;
    return `src='${wrap(val)}'`;
  });

  // 3) 重写 srcset
  html = html.replace(/srcset\s*=\s*"([^"]*)"/gi, (_m, val: string) => {
    const rewritten = val.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const url = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
      const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : '';
      return wrap(url) + descriptor;
    }).join(', ');
    return `srcset="${rewritten}"`;
  });
  html = html.replace(/srcset\s*=\s*'([^']*)'/gi, (_m, val: string) => {
    const rewritten = val.split(',').map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const url = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
      const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : '';
      return wrap(url) + descriptor;
    }).join(', ');
    return `srcset='${rewritten}'`;
  });

  // 4) 重写 poster（video）
  html = html.replace(/poster\s*=\s*"([^"]*)"/gi, (_m, val: string) => `poster="${wrap(val)}"`);
  html = html.replace(/poster\s*=\s*'([^']*)'/gi, (_m, val: string) => `poster='${wrap(val)}'`);

  // 5) 重写内联 <style> 标签中的 url()
  html = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => {
    return `<style${attrs}>${rewriteCssUrls(css, baseOrigin)}</style>`;
  });

  // 6) 重写 style 属性中的 url()
  html = html.replace(/style\s*=\s*"([^"]*)"/gi, (_m, val: string) => `style="${rewriteCssUrls(val, baseOrigin)}"`);
  html = html.replace(/style\s*=\s*'([^']*)'/gi, (_m, val: string) => `style='${rewriteCssUrls(val, baseOrigin)}'`);

  // 7) 重写 <meta refresh> 中的 URL
  html = html.replace(/<meta([^>]*http-equiv=["']?refresh["']?[^>]*)>/gi, (m, attrs: string) => {
    return '<meta' + attrs.replace(/url\s*=\s*([^\s;]+)/gi, (mm: string, u: string) => `url=${wrap(u)}`) + '>';
  });

  return html;
}

// 代理 cookie jar：按 host 维护，后端透传登录态（前端 iframe 无感知）
const cookieJar = new Map<string, Map<string, string>>();
function getCookieHeader(host: string): string {
  const m = cookieJar.get(host);
  if (!m || m.size === 0) return '';
  return Array.from(m.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}
function storeCookies(host: string, setCookies: string[]): void {
  if (!setCookies.length) return;
  if (!cookieJar.has(host)) cookieJar.set(host, new Map());
  const m = cookieJar.get(host)!;
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    const maxAgeAttr = attrs.find(a => /^max-age/i.test(a.split('=')[0]));
    if (maxAgeAttr) {
      const v = parseInt(maxAgeAttr.split('=')[1] || '0', 10);
      if (v <= 0) { m.delete(name); continue; }
    }
    m.set(name, value);
  }
}

// ───────────────────────────────────────────────────────────
// 浏览历史 + 每日 AI 分析
// 历史落盘到 workspace/browser-history.json（不依赖会崩溃的 db），
// 供前端「最近浏览/常用网站」展示，以及每日 AI 分析使用。
// ───────────────────────────────────────────────────────────
const HISTORY_FILE = path.resolve(process.cwd(), 'workspace', 'browser-history.json');
const ANALYSIS_FILE = path.resolve(process.cwd(), 'workspace', 'browser-analysis-latest.json');
const MAX_HISTORY = 2000;

function ensureBrowserDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHistory(): any[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const arr = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function loadAnalysis(): any | null {
  try {
    if (!fs.existsSync(ANALYSIS_FILE)) return null;
    return JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveAnalysis(a: any) {
  try {
    ensureBrowserDataDir();
    fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(a, null, 2));
  } catch { /* ignore */ }
}

/** 记录一次浏览（异步落盘，仅保留最近 MAX_HISTORY 条，不阻塞请求） */
async function recordVisit(entry: { url: string; title?: string; proxy?: boolean }) {
  try {
    const u = String(entry.url || '');
    if (!/^https?:\/\//i.test(u)) return;
    const parsed = new URL(u);
    const hist = loadHistory();
    hist.push({
      url: u,
      host: parsed.host,
      title: entry.title || parsed.host,
      proxy: !!entry.proxy,
      time: Date.now(),
    });
    const trimmed = hist.length > MAX_HISTORY ? hist.slice(hist.length - MAX_HISTORY) : hist;
    ensureBrowserDataDir();
    await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/** 按时间窗口聚合：返回最近访问 + 按 host 频次排序的常用站点 */
function aggregate(hist: any[], opts: { days?: number; limit?: number }) {
  const days = opts.days ?? 30;
  const since = Date.now() - days * 86400000;
  const windowed = hist.filter(h => h.time >= since);
  const freq = new Map<string, number>();
  for (const h of windowed) freq.set(h.host, (freq.get(h.host) || 0) + 1);
  const frequent = Array.from(freq.entries())
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, opts.limit ?? 12);
  const limit = opts.limit ?? 20;
  const recent = windowed.slice(-limit).reverse(); // 最新在前
  return { recent, frequent };
}

// 站点分类规则（用于启发式分析）
const CATEGORY_RULES: Record<string, RegExp> = {
  社交: /weibo|zhihu|weixin|qq\.com|tieba|douyin|xiaohongshu|twitter|x\.com/i,
  购物: /taobao|tmall|jd\.com|pinduoduo|amazon|1688/i,
  开发: /github|gitlab|stackoverflow|gitee|npmjs|juejin|csdn|dev\.to/i,
  视频: /bilibili|youku|iqiyi|youtube|douyin|v\.qq\.com/i,
  搜索: /baidu|google|bing|sogou|duckduckgo/i,
  新闻: /news|163\.com|sina|people|thepaper|qq\.com/i,
  文档: /docs\.qq|notion|feishu|yuque|confluence|wps/i,
};

/**
 * 浏览统计：供前端用「模型平台」（LlmClient）生成每日 AI 分析。
 * 服务端不持有模型 API Key（keyring 在前端），故 AI 文案由前端生成后回存缓存；
 * 这里仅提供结构化统计数据 + 读写每日分析缓存，不再自行编造文案。
 */
function getStats() {
  const hist = loadHistory();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sinceTs = todayStart.getTime();
  const today = hist.filter(h => h.time >= sinceTs);
  const byHost = new Map<string, number>();
  for (const h of today) byHost.set(h.host, (byHost.get(h.host) || 0) + 1);
  const topSites = Array.from(byHost.entries())
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const cats: Record<string, number> = {};
  for (const h of today) {
    for (const [cat, re] of Object.entries(CATEGORY_RULES)) {
      if (re.test(h.host)) { cats[cat] = (cats[cat] || 0) + 1; break; }
    }
  }
  const { recent, frequent } = aggregate(hist, { days: 30, limit: 12 });
  return {
    date: todayStart.toISOString().slice(0, 10),
    today: { total: today.length, distinct: byHost.size, topSites, categories: cats },
    recent: recent.slice(0, 10),
    frequent: frequent.slice(0, 12),
  };
}

// POST /api/browser/history —— 记录一次浏览（异步落盘，不阻塞请求）
router.post('/history', (req: Request, res: Response) => {
  try {
    const { url, title, proxy } = req.body || {};
    void recordVisit({ url, title, proxy });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: '记录失败' });
  }
});

// GET /api/browser/history —— 最近访问 + 常用站点聚合
// ?days=30&limit=20
router.get('/history', (req: Request, res: Response) => {
  try {
    const days = parseInt(String(req.query.days || '30'), 10) || 30;
    const limit = parseInt(String(req.query.limit || '20'), 10) || 20;
    const { recent, frequent } = aggregate(loadHistory(), { days, limit });
    res.json({ data: { recent, frequent } });
  } catch {
    res.json({ data: { recent: [], frequent: [] } });
  }
});

// GET /api/browser/stats —— 供前端用模型平台生成每日分析的结构化数据
router.get('/stats', (_req: Request, res: Response) => {
  try {
    res.json({ data: getStats() });
  } catch {
    res.json({ data: null });
  }
});

// GET /api/browser/analysis —— 读取已缓存的每日分析（当天由前端用模型生成后回存）
router.get('/analysis', (_req: Request, res: Response) => {
  try {
    res.json({ data: loadAnalysis() });
  } catch {
    res.json({ data: null });
  }
});

// POST /api/browser/analysis —— 前端用配置的模型平台生成后回存缓存（按 date 每日一份）
router.post('/analysis', (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const a = {
      date: b.date || new Date().toISOString().slice(0, 10),
      summary: b.summary || '',
      suggestion: b.suggestion || '',
      highlights: Array.isArray(b.highlights) ? b.highlights : [],
      topSites: b.topSites || [],
      categories: b.categories || {},
      total: b.total ?? 0,
      model: b.model || '',
    };
    saveAnalysis(a);
    res.json({ data: a });
  } catch {
    res.status(500).json({ error: '保存分析失败' });
  }
});

export default router;
