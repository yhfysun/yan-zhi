// 内置浏览器路由 —— Playwright headless/headed 浏览器自动化
// 懒加载 playwright：未安装时返回友好错误，不影响服务启动
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { encrypt, decrypt } from '../utils/crypto.js';

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

// C4 多标签页管理：tabId -> page（tab 0 为主标签页，pageInstance 始终指向当前活动页）
const tabs = new Map<number, any>();
let nextTabId = 0;
let activeTabId = -1;

// C5 网络请求日志缓冲（最近 100 条，page requestfinished 事件收集）
interface NetworkLogEntry { url: string; method: string; status: number; responseSize: number; time: number; }
const networkLog: NetworkLogEntry[] = [];
const NETWORK_LOG_MAX = 100;

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

/** 给 page 挂载下载与网络请求监听 */
function attachPageListeners(page: any) {
  // 监听下载事件，记录到 downloadRecords
  page.on('download', async (download: any) => {
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
  // C5 网络请求完成事件，记录到 networkLog
  page.on('requestfinished', async (req: any) => {
    try {
      const resp = await req.response().catch(() => null);
      let responseSize = 0;
      try { if (resp) { const body = await resp.body().catch(() => null); if (body) responseSize = body.length; } } catch {}
      const entry: NetworkLogEntry = {
        url: req.url(),
        method: req.method(),
        status: resp ? resp.status() : 0,
        responseSize,
        time: Date.now(),
      };
      networkLog.unshift(entry);
      if (networkLog.length > NETWORK_LOG_MAX) networkLog.pop();
    } catch {}
  });
}

/** 创建一个新的 context + page（多标签页基础单元），可选导航到 url */
async function createTabPage(url?: string): Promise<any> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  // 注入 __name polyfill：esbuild keepNames 会给 ensureYzReg 内部嵌套函数注入 __name helper，
  // page.evaluate 序列化函数体到浏览器执行时 __name 未定义会报 ReferenceError。此处全局兜底。
  await page.addInitScript({ content: 'window.__name = window.__name || ((t) => t);' });
  attachPageListeners(page);
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  return page;
}

/** 获取或创建页面（当前活动标签页） */
async function getPage() {
  if (pageInstance && !pageInstance.isClosed?.()) {
    lastActivityAt = Date.now();
    return pageInstance;
  }
  // 首次：创建主标签页（tab 0）
  const page = await createTabPage();
  pageInstance = page;
  activeTabId = 0;
  tabs.set(0, page);
  nextTabId = 1;
  lastActivityAt = Date.now();
  return page;
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
      tabs.clear();
      activeTabId = -1;
      nextTabId = 0;
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
// 页面内元素注册表 + 编号 + 稳定选择器生成（自包含无闭包，供 page.evaluate 注入）。
// browser_get_page_info / browser_get_dom 收集可交互元素时注册并返回 index，
// browser_click / browser_type 用 index 直接定位，免手写动态 hash class 选择器。
function ensureYzReg() {
  const w = window as any;
  if (w.__yzReg) return w.__yzReg;
  w.__yzElements = w.__yzElements || [];
  const esc = (s: string) => String(s).replace(/"/g, '\\"');
  const genSel = (el: any): string => {
    const tag = el.tagName.toLowerCase();
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) { try { if (document.querySelectorAll('#' + el.id).length === 1) return '#' + el.id; } catch {} }
    const tid = el.getAttribute('data-testid'); if (tid) return `[data-testid="${esc(tid)}"]`;
    const t = el.getAttribute('data-test'); if (t) return `[data-test="${esc(t)}"]`;
    const al = el.getAttribute('aria-label');
    if (al) { const s = `${tag}[aria-label="${esc(al)}"]`; try { if (document.querySelectorAll(s).length === 1) return s; } catch {} }
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean);
    for (const c of cls) { const s = `${tag}.${c.replace(/[^\w-]/g, '')}`; try { if (s && document.querySelectorAll(s).length === 1) return s; } catch {} }
    const nm = el.getAttribute('name'); if (nm) { const s = `${tag}[name="${esc(nm)}"]`; try { if (document.querySelectorAll(s).length === 1) return s; } catch {} }
    const ph = el.getAttribute('placeholder'); if (ph) { const s = `${tag}[placeholder="${esc(ph)}"]`; try { if (document.querySelectorAll(s).length === 1) return s; } catch {} }
    const path: string[] = []; let cur: any = el; let depth = 0;
    while (cur && cur.nodeType === 1 && cur !== document.body && depth < 6) {
      const pe = cur.parentElement; if (!pe) break;
      const sibs = Array.from(pe.children).filter((c: any) => c.tagName === cur.tagName);
      const idx = sibs.indexOf(cur) + 1;
      path.unshift(sibs.length > 1 ? `${cur.tagName.toLowerCase()}:nth-of-type(${idx})` : cur.tagName.toLowerCase());
      cur = pe; depth++;
    }
    return path.length ? path.join(' > ') : tag;
  };
  w.__yzReg = {
    register(el: any) {
      if (el && el.__yzIndex != null && w.__yzElements[el.__yzIndex] === el) return el.__yzIndex;
      const i = w.__yzElements.push(el) - 1;
      try { el.__yzIndex = i; } catch { /* ignore */ }
      return i;
    },
    get(i: number) { return w.__yzElements[i]; },
    genSel,
  };
  return w.__yzReg;
}

// 变化检测：这些 action 可能改变页面状态，执行后对比前后快照
const CHANGE_ACTIONS = new Set(['click', 'type', 'press', 'select_option', 'check', 'uncheck', 'submit_form', 'search', 'next_page', 'prev_page']);
let noChangeStreak = 0;
const snapshotFn = () => { try { const d = document.body; return { url: location.href, t: (d ? d.innerText : '').slice(0, 2000), n: document.querySelectorAll('a,button,input,select,textarea').length }; } catch { return null; } };

router.post('/action', async (req: Request, res: Response) => {
  try {
    const args = req.body || {};
    const { action, text, key, x, y, timeout } = args;
    const selector = args.selector ? String(args.selector).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")') : args.selector;
    if (!action) { res.status(400).json({ error: 'action 为必填项' }); return; }
    const page = await getPage();
    let result: unknown = null;

    // 变化检测：操作前采集页面快照
    let beforeState: any = null;
    if (CHANGE_ACTIONS.has(String(action))) {
      beforeState = await page.evaluate(snapshotFn).catch(() => null);
    }

    switch (action) {
      case 'click': {
        if (args.index !== undefined && args.index !== null) {
          // 元素编号定位（优先）：从页面注册表取元素并点击
          await page.evaluate(ensureYzReg);
          const pos = await page.evaluate((idx: number) => {
            const R = (window as any).__yzReg;
            const el = R.get(idx);
            if (!el || !el.isConnected) return { error: `index ${idx} 已失效（页面已变化），请重新调用 get_page_info 获取编号列表` };
            el.scrollIntoView({ block: 'center' });
            const rect = el.getBoundingClientRect();
            if (el.ownerDocument === document) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            // iframe 内元素：坐标相对 iframe 视口，直接派发 DOM 事件
            const o = { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, view: el.ownerDocument.defaultView };
            el.dispatchEvent(new MouseEvent('mousedown', o));
            el.dispatchEvent(new MouseEvent('mouseup', o));
            el.dispatchEvent(new MouseEvent('click', o));
            return { via: 'dom-events', iframe: true };
          }, Number(args.index));
          if ((pos as any)?.error) {
            result = pos;
          } else if ((pos as any)?.x !== undefined) {
            await page.mouse.click((pos as any).x, (pos as any).y);
            result = { success: true, index: args.index, via: 'real-mouse' };
          } else {
            result = { success: true, index: args.index, via: 'dom-events', iframe: true };
          }
          break;
        }
        // 真实鼠标点击：先 move 再 click
        if (selector) {
          // 多匹配歧义检测：返回带编号的候选列表
          const count = await page.locator(selector).count().catch(() => -1);
          if (count === 0) {
            result = { error: `元素未找到: ${args.selector}`, hint: '建议先调用 get_page_info 获取编号元素列表，再用 index 参数定位' };
            break;
          }
          if (count > 1) {
            await page.evaluate(ensureYzReg);
            const cands = await page.evaluate((sel: string) => {
              const R = (window as any).__yzReg;
              // selector 可能含 :has-text() Playwright 伪选择器，DOM 无法解析 → 退化为宽泛收集
              let els: Element[] = [];
              try { els = Array.from(document.querySelectorAll(sel)); } catch { els = []; }
              if (!els.length) {
                // 回退：按标签+文本粗筛（如 button:has-text("登录")）
                const m = String(sel).match(/^([a-z*]+):has-text\(["']?([\s\S]*?)["']?\)$/i);
                if (m) {
                  els = Array.from(document.querySelectorAll(m[1])).filter((el: any) => (el.textContent || '').includes(m[2]));
                }
              }
              return els.slice(0, 10).map((el: any) => ({ index: R.register(el), tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40), selector: R.genSel(el) }));
            }, String(args.selector)).catch(() => [] as any[]);
            result = { ambiguous: true, matched: count, candidates: cands, hint: '该选择器匹配多个元素，请从候选列表选一个 index 重新调用 click' };
            break;
          }
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
        if (args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          const r = await page.evaluate((p: { idx: number; text: string }) => {
            const R = (window as any).__yzReg;
            const el = R.get(p.idx);
            if (!el || !el.isConnected) return { error: `index ${p.idx} 已失效（页面已变化），请重新调用 get_page_info 获取编号列表` };
            el.scrollIntoView({ block: 'center' });
            el.focus();
            for (const ch of p.text) {
              el.value += ch;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, index: p.idx, typed: p.text.length };
          }, { idx: Number(args.index), text: String(text || '') });
          result = r;
          break;
        }
        // 真实键盘输入：逐字符 type
        if (selector) {
          const count = await page.locator(selector).count().catch(() => -1);
          if (count === 0) {
            result = { error: `元素未找到: ${args.selector}`, hint: '建议先调用 get_page_info 获取编号元素列表，再用 index 参数定位' };
            break;
          }
          if (count > 1) {
            await page.evaluate(ensureYzReg);
            const cands = await page.evaluate(() => {
              const R = (window as any).__yzReg;
              const els = Array.from(document.querySelectorAll('input,textarea')).filter((el: any) => el.offsetParent !== null);
              return els.slice(0, 10).map((el: any) => ({ index: R.register(el), tag: 'input', placeholder: el.placeholder || '', selector: R.genSel(el) }));
            }).catch(() => [] as any[]);
            result = { ambiguous: true, matched: count, candidates: cands, hint: '该选择器匹配多个元素，请从候选列表选一个 index 重新调用 type' };
            break;
          }
          await page.locator(selector).click().catch(() => {});
        }
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
        await page.evaluate(ensureYzReg);
        result = await page.evaluate((args: any) => {
          const maxDepth = args?.depth || 12;
          const maxNodes = args?.maxNodes || 1000;
          const skip = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'HEAD']);
          const SELS = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          let count = 0, sameOriginIframes = 0, crossOriginIframes = 0, shadowRoots = 0;
          const walk = (el: Element, depth: number): any => {
            if (count >= maxNodes || skip.has(el.tagName) || depth > maxDepth) return null;
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return null;
            count++;
            const node: any = { tag: el.tagName.toLowerCase() };
            // 可交互节点附加编号，供 browser_click / browser_type 用 index 定位
            try { if ((el as any).matches && (el as any).matches(SELS)) { const R = (window as any).__yzReg; if (R) node.index = R.register(el); } } catch { /* ignore */ }
            if (el.id) node.id = el.id;
            const cls = (typeof (el as any).className === 'string' ? (el as any).className : '').trim();
            if (cls) node.class = cls.slice(0, 80);
            if (el.getAttribute('role')) node.role = el.getAttribute('role');
            if (el.getAttribute('aria-label')) node.ariaLabel = el.getAttribute('aria-label');
            if (el.getAttribute('href')) node.href = el.getAttribute('href')!.slice(0, 120);
            if (el.getAttribute('placeholder')) node.placeholder = el.getAttribute('placeholder');
            if (el.getAttribute('type')) node.type = el.getAttribute('type');
            if (el.getAttribute('name')) node.name = el.getAttribute('name');
            if (el.getAttribute('value') && el.tagName === 'INPUT') node.value = String((el as any).value).slice(0, 60);
            const directText = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent!.trim()).filter(Boolean).join(' ');
            if (directText) node.text = directText.slice(0, 100);
            const kids: any[] = [];
            for (let i = 0; i < el.children.length; i++) { const c = walk(el.children[i], depth + 1); if (c) kids.push(c); }
            if ((el as any).shadowRoot) { shadowRoots++; const sr = (el as any).shadowRoot; for (let si = 0; si < sr.children.length; si++) { const sc = walk(sr.children[si], depth + 1); if (sc) { sc.shadowRoot = true; kids.push(sc); } } }
            if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
              try { const cd = (el as any).contentDocument || ((el as any).contentWindow && (el as any).contentWindow.document); if (cd && cd.body) { sameOriginIframes++; const ic = walk(cd.body, depth + 1); if (ic) { ic.iframe = true; ic.src = el.getAttribute('src') || ''; kids.push(ic); } } else { crossOriginIframes++; } } catch { crossOriginIframes++; }
            }
            if (kids.length) node.children = kids;
            return node;
          };
          const root = args?.selector ? document.querySelector(args.selector) : document.body;
          if (!root) return { error: '元素未找到' };
          return { url: location.href, title: document.title, dom: walk(root, 0), nodeCount: count, iframes: { sameOrigin: sameOriginIframes, crossOriginSkipped: crossOriginIframes }, shadowRoots };
        }, args);
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
      case 'fill_form': {
        const fields = Array.isArray(args.fields) ? args.fields : [];
        const filled: string[] = [];
        const toPw = (s: string) => String(s).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")');
        for (const f of fields) {
          const sel = toPw(f.selector);
          if (!sel) continue;
          const ftype = String(f.type || 'text').toLowerCase();
          if (ftype === 'select') {
            const opt = f.label !== undefined ? { label: String(f.label) } : String(f.value ?? '');
            await page.locator(sel).selectOption(opt as any);
          } else if (ftype === 'checkbox' || ftype === 'radio') {
            if (f.value === false || f.value === 'false') await page.locator(sel).uncheck().catch(() => {});
            else await page.locator(sel).check().catch(() => {});
          } else {
            await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
            await page.locator(sel).fill(String(f.value ?? ''));
          }
          filled.push(sel);
        }
        result = { filled: filled.length, fields: filled };
        break;
      }
      case 'submit_form': {
        if (selector) {
          await page.locator(selector).scrollIntoViewIfNeeded().catch(() => {});
          await page.locator(selector).click();
        } else {
          await page.keyboard.press('Enter');
        }
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        result = { submitted: true, url: page.url(), title: await page.title().catch(() => '') };
        break;
      }
      case 'search': {
        const query = String(args.query || '');
        if (!query) { res.status(400).json({ error: 'query 为必填项' }); return; }
        const toPwSel = (s: string) => String(s).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")');
        const inputSel = args.input_selector ? toPwSel(args.input_selector)
          || 'input[type="search"], input[role="searchbox"], input[name*="search" i], input[name*="q" i], input[placeholder*="搜索" i], input[placeholder*="search" i]' : 'input[type="search"], input[role="searchbox"], input[name*="search" i], input[name*="q" i], input[placeholder*="搜索" i], input[placeholder*="search" i]';
        const input = page.locator(inputSel).first();
        await input.click().catch(() => {});
        await input.fill(query);
        if (args.submit_selector) {
          await page.locator(toPwSel(args.submit_selector)).click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        result = { searched: query, url: page.url(), title: await page.title().catch(() => '') };
        break;
      }
      case 'next_page': {
        const sel = selector
          || 'a:has-text("下一页"), a:has-text("下页"), a:has-text("›"), a:has-text("»"), a:has-text("Next"), button:has-text("下一页"), button:has-text("Next"), a[rel="next"]';
        await page.locator(sel).first().click();
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        result = { paged: 'next', url: page.url(), title: await page.title().catch(() => '') };
        break;
      }
      case 'prev_page': {
        const sel = selector
          || 'a:has-text("上一页"), a:has-text("上页"), a:has-text("‹"), a:has-text("«"), a:has-text("Prev"), button:has-text("上一页"), button:has-text("Prev"), a[rel="prev"]';
        await page.locator(sel).first().click();
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        result = { paged: 'prev', url: page.url(), title: await page.title().catch(() => '') };
        break;
      }
      case 'wait_for': {
        const to = Math.min(args.timeout || 10000, 30000);
        if (selector) {
          await page.waitForSelector(selector, { timeout: to });
          result = { waited: 'selector', selector };
        } else if (args.url) {
          await page.waitForURL(args.url, { timeout: to }).catch(() => {});
          result = { waited: 'url', url: page.url() };
        } else if (args.text) {
          await page.waitForFunction((t: string) => (document.body?.innerText || '').includes(t), args.text as string, { timeout: to }).catch(() => {});
          result = { waited: 'text', text: args.text };
        } else {
          await page.waitForTimeout(to);
          result = { waited: 'timeout', ms: to };
        }
        break;
      }
      case 'get_visible_text': {
        result = await page.evaluate((sel: string | undefined) => {
          const root = sel ? document.querySelector(sel) : document.body;
          return root ? (root as any).innerText : '';
        }, selector as string | undefined);
        break;
      }
      case 'select_option': {
        const opt = args.label !== undefined ? { label: String(args.label) } : String(args.value ?? '');
        await page.locator(selector as string).selectOption(opt as any);
        result = { selected: true };
        break;
      }
      case 'check': {
        await page.locator(selector as string).check();
        result = { checked: true };
        break;
      }
      case 'uncheck': {
        await page.locator(selector as string).uncheck();
        result = { unchecked: true };
        break;
      }
      case 'get_page_info': {
        // 穿透 iframe / Shadow DOM 收集可交互元素并编号注册（含 iframe 内弹窗元素）
        await page.evaluate(ensureYzReg);
        result = await page.evaluate(() => {
          const R = (window as any).__yzReg;
          const S = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          const els: Element[] = [];
          const visible = (el: any) => {
            if (el.disabled === true) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return false;
            if (el.offsetParent === null) {
              try {
                const st = el.ownerDocument.defaultView.getComputedStyle(el).position;
                if (st !== 'fixed' && st !== 'sticky') return false;
              } catch { return false; }
            }
            return true;
          };
          const collect = (root: any) => {
            let found: NodeListOf<Element> | Element[];
            try { found = root.querySelectorAll(S); } catch { return; }
            for (const el of Array.from(found)) { if (visible(el)) els.push(el); }
            let all: NodeListOf<Element> | Element[];
            try { all = root.querySelectorAll('*'); } catch { return; }
            for (const n of Array.from(all)) {
              if ((n as any).shadowRoot) collect((n as any).shadowRoot);
              if (n.tagName === 'IFRAME' || n.tagName === 'FRAME') {
                try { const cd = (n as any).contentDocument; if (cd && cd.body) collect(cd.body); } catch { /* 跨域跳过 */ }
              }
            }
          };
          collect(document.documentElement);
          const out: any[] = [];
          for (let k = 0; k < els.length && out.length < 300; k++) {
            const el = els[k] as any;
            const idx = R.register(el);
            const o: any = { index: idx, tag: el.tagName.toLowerCase(), selector: R.genSel(el), text: (el.textContent || '').trim().slice(0, 60) };
            if (el.ownerDocument !== document) { o.iframe = true; }
            else { const rect = el.getBoundingClientRect(); o.x = Math.round(rect.x); o.y = Math.round(rect.y); o.w = Math.round(rect.width); o.h = Math.round(rect.height); }
            if (el.id) o.id = el.id;
            if (el.type) o.type = el.type;
            if (el.href) o.href = String(el.href).slice(0, 200);
            if (el.placeholder) o.placeholder = el.placeholder;
            if (el.value && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) o.value = String(el.value).slice(0, 80);
            if (el.getAttribute('aria-label')) o.ariaLabel = el.getAttribute('aria-label');
            if (el.name) o.name = el.name;
            if (el.getAttribute('role')) o.role = el.getAttribute('role');
            if (el.required) o.required = true;
            if (el.tagName === 'SELECT') o.options = Array.from(el.options).slice(0, 30).map((op: any) => ({ v: op.value, t: op.text.trim().slice(0, 40), s: op.selected }));
            if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) o.checked = !!el.checked;
            out.push(o);
          }
          return { url: location.href, title: document.title, interactiveCount: els.length, interactive: out, hint: '可交互元素已编号（index 字段），browser_click / browser_type 可直接用 index 参数定位（优先于 selector）' };
        });
        break;
      }
      // ========== C4 多标签页管理 ==========
      case 'new_tab': {
        const newPage = await createTabPage(args.url);
        const tabId = nextTabId++;
        tabs.set(tabId, newPage);
        pageInstance = newPage;
        activeTabId = tabId;
        result = { tabId, url: newPage.url(), title: await newPage.title().catch(() => '') };
        break;
      }
      case 'switch_tab': {
        const tid = Number(args.tabId);
        if (!tabs.has(tid)) { result = { error: `tabId ${tid} 不存在` }; break; }
        const p = tabs.get(tid);
        if (p.isClosed?.()) { tabs.delete(tid); result = { error: `tabId ${tid} 已关闭` }; break; }
        pageInstance = p;
        activeTabId = tid;
        result = { tabId: tid, url: p.url(), title: await p.title().catch(() => '') };
        break;
      }
      case 'close_tab': {
        const tid = args.tabId !== undefined && args.tabId !== null ? Number(args.tabId) : activeTabId;
        if (!tabs.has(tid)) { result = { error: `tabId ${tid} 不存在` }; break; }
        const p = tabs.get(tid);
        await p.close().catch(() => {});
        tabs.delete(tid);
        if (activeTabId === tid) {
          const rest = Array.from(tabs.keys());
          if (rest.length) { activeTabId = rest[0]; pageInstance = tabs.get(rest[0]); }
          else { activeTabId = -1; pageInstance = null; }
        }
        result = { closedTabId: tid, remaining: tabs.size };
        break;
      }
      case 'get_tabs': {
        const list: any[] = [];
        for (const [tid, p] of tabs) {
          if (p.isClosed?.()) { tabs.delete(tid); continue; }
          list.push({ id: tid, url: p.url(), title: await p.title().catch(() => ''), active: tid === activeTabId });
        }
        result = { tabs: list };
        break;
      }
      // ========== C5 网络请求监听 ==========
      case 'wait_for_request': {
        const pat = String(args.urlPattern || '');
        if (!pat) { result = { error: 'urlPattern 为必填项' }; break; }
        const to = Math.min(args.timeout || 10000, 30000);
        let regex: RegExp;
        try { regex = new RegExp(pat); } catch { regex = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
        const match = (u: string) => u.includes(pat) || regex.test(u);
        // 先在已有日志里找
        const found = networkLog.find((e) => match(e.url));
        if (found) { result = { url: found.url, method: found.method, status: found.status }; break; }
        // 等待新请求完成
        const start = Date.now();
        const r = await new Promise((resolve) => {
          const onReq = async (req: any) => {
            const u = req.url();
            if (!match(u)) return;
            page.off('requestfinished', onReq);
            try {
              const resp = await req.response().catch(() => null);
              resolve({ url: u, method: req.method(), status: resp ? resp.status() : 0 });
            } catch { resolve({ url: u, method: req.method(), status: 0 }); }
          };
          page.on('requestfinished', onReq);
          setTimeout(() => { page.off('requestfinished', onReq); resolve(null); }, to);
        });
        result = r || { error: `等待超时（${to}ms）未匹配到 ${pat}` };
        break;
      }
      case 'get_network_log': {
        const pat = args.urlPattern ? String(args.urlPattern) : null;
        const n = Math.min(args.lastN || 20, 100);
        let entries = networkLog.slice();
        if (pat) {
          let regex: RegExp;
          try { regex = new RegExp(pat); } catch { regex = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
          entries = entries.filter((e) => e.url.includes(pat) || regex.test(e.url));
        }
        entries = entries.slice(0, n);
        result = { entries };
        break;
      }
      // ========== C6 结构化数据提取 ==========
      case 'extract_list': {
        result = await page.evaluate((a: any) => {
          const limit = a.limit || 20;
          const fields = a.fields || null;
          // 自动识别常见列表项选择器
          let containerSel = a.selector;
          if (!containerSel) {
            const candidates = ['.goods-item', '.product-item', '.item', '.card', 'li', 'article', '[role="listitem"]'];
            for (const c of candidates) {
              const els = document.querySelectorAll(c);
              if (els.length >= 2) { containerSel = c; break; }
            }
          }
          if (!containerSel) return { error: '未指定 selector 且无法自动识别列表项容器，请传 selector' };
          const containers = Array.from(document.querySelectorAll(containerSel));
          if (!containers.length) return { error: `未匹配到列表项: ${containerSel}` };
          const autoFields = fields || {
            title: { selector: '.title, h3, h2, .name', attr: 'text' },
            price: { selector: '.price, .cost', attr: 'text' },
            link: { selector: 'a', attr: 'href' },
          };
          const items: any[] = [];
          for (const c of containers) {
            if (items.length >= limit) break;
            const item: any = {};
            for (const [fname, fdef] of Object.entries(autoFields)) {
              const sel = (fdef as any).selector;
              const attr = (fdef as any).attr || 'text';
              const el = c.querySelector(sel);
              if (!el) { item[fname] = null; continue; }
              if (attr === 'text') item[fname] = (el.textContent || '').trim();
              else if (attr === 'html') item[fname] = (el as any).innerHTML;
              else item[fname] = el.getAttribute(attr);
            }
            items.push(item);
          }
          return { count: items.length, items };
        }, args);
        break;
      }
      // ========== C9 视觉定位闭环 ==========
      case 'visual_locate': {
        const buf = await page.screenshot({ fullPage: false });
        const ts = Date.now();
        const dir = 'workspace/visual_locate';
        try { await fs.promises.mkdir(dir, { recursive: true }); } catch {}
        const savePath = `${dir}/screenshot_${ts}.png`;
        await fs.promises.writeFile(savePath, buf);
        result = { path: savePath };
        break;
      }
      // ========== C11 文件上传/下载 ==========
      case 'upload': {
        const fp = String(args.filePath || '');
        if (!fp) { result = { error: 'filePath 为必填项' }; break; }
        let locator: any = null;
        if (args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          const sel = await page.evaluate((idx: number) => {
            const R = (window as any).__yzReg;
            const el = R.get(idx);
            if (!el || !el.isConnected) return null;
            return R.genSel(el);
          }, Number(args.index));
          if (!sel) { result = { error: `index ${args.index} 已失效` }; break; }
          locator = page.locator(sel);
        } else if (selector) {
          locator = page.locator(selector);
        } else {
          locator = page.locator('input[type="file"]').first();
        }
        await locator.setInputFiles(fp);
        result = { uploaded: true, filePath: fp };
        break;
      }
      case 'download': {
        const savePath = args.savePath ? String(args.savePath) : null;
        const waitP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        if (args.url) {
          await page.goto(String(args.url), { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
        } else if (selector) {
          await page.locator(selector).click().catch(() => {});
        }
        const download: any = await waitP;
        if (!download) { result = { error: '未触发下载（超时）' }; break; }
        const filename = download.suggestedFilename();
        const sp = savePath || `workspace/downloads/${filename}`;
        try { await fs.promises.mkdir(path.dirname(sp), { recursive: true }); } catch {}
        await download.saveAs(sp);
        result = { filename, savedPath: sp, url: download.url() };
        break;
      }
      // ========== C12 滚动到元素 / 可见性检测 ==========
      case 'scroll_into_view': {
        if (args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          result = await page.evaluate((idx: number) => {
            const R = (window as any).__yzReg;
            const el = R.get(idx);
            if (!el || !el.isConnected) return { error: `index ${idx} 已失效` };
            el.scrollIntoView({ block: 'center' });
            return { success: true };
          }, Number(args.index));
          break;
        }
        if (selector) {
          await page.locator(selector).scrollIntoViewIfNeeded();
          result = { success: true };
          break;
        }
        result = { error: '需要 index 或 selector' };
        break;
      }
      case 'is_visible': {
        if (args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          result = await page.evaluate((idx: number) => {
            const R = (window as any).__yzReg;
            const el = R.get(idx);
            if (!el || !el.isConnected) return { visible: false, reason: `index ${idx} 已失效或已移除` };
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return { visible: false, reason: '尺寸过小' };
            if (el.offsetParent === null) {
              const st = el.ownerDocument.defaultView.getComputedStyle(el).position;
              if (st !== 'fixed' && st !== 'sticky') return { visible: false, reason: 'offsetParent 为 null（display:none 或祖先隐藏）' };
            }
            const cs = el.ownerDocument.defaultView.getComputedStyle(el);
            if (cs.visibility === 'hidden') return { visible: false, reason: 'visibility:hidden' };
            if (cs.opacity === '0') return { visible: false, reason: 'opacity:0' };
            return { visible: true, reason: '可见' };
          }, Number(args.index));
          break;
        }
        if (selector) {
          const count = await page.locator(selector).count().catch(() => 0);
          if (count === 0) { result = { visible: false, reason: '元素未找到' }; break; }
          const isVisible = await page.locator(selector).isVisible();
          result = { visible: isVisible, reason: isVisible ? '可见' : '元素存在但不可见（display:none / visibility:hidden / 视口外等）' };
          break;
        }
        result = { error: '需要 index 或 selector' };
        break;
      }
      // ========== C13 拖拽 ==========
      case 'drag': {
        const resolvePoint = async (prefix: 'from' | 'to'): Promise<{ x?: number; y?: number; error?: string }> => {
          const idx = prefix === 'from' ? args.fromIndex : args.toIndex;
          const sel = prefix === 'from' ? args.fromSelector : args.toSelector;
          if (idx !== undefined && idx !== null) {
            await page.evaluate(ensureYzReg);
            const r = await page.evaluate((i: number) => {
              const R = (window as any).__yzReg;
              const el = R.get(i);
              if (!el || !el.isConnected) return null;
              el.scrollIntoView({ block: 'center' });
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }, Number(idx));
            if (!r) return { error: `index ${idx} 已失效` };
            return r;
          }
          if (sel) {
            const loc = page.locator(String(sel));
            const cnt = await loc.count().catch(() => 0);
            if (cnt === 0) return { error: `元素未找到: ${sel}` };
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            const box = await loc.boundingBox();
            if (!box) return { error: `无法获取元素边界: ${sel}` };
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          }
          const px = prefix === 'from' ? args.fromX : args.toX;
          const py = prefix === 'from' ? args.fromY : args.toY;
          if (px !== undefined && py !== undefined) return { x: Number(px), y: Number(py) };
          return { error: `缺少 ${prefix} 定位参数` };
        };
        const from = await resolvePoint('from');
        if (from.error) { result = from; break; }
        const to = await resolvePoint('to');
        if (to.error) { result = to; break; }
        await page.mouse.move(from.x!, from.y!);
        await page.mouse.down();
        await page.mouse.move(to.x!, to.y!, { steps: 10 });
        await page.mouse.up();
        result = { dragged: true, from, to };
        break;
      }
      // ========== C14 Accessibility Tree ==========
      case 'get_a11y_tree': {
        const maxNodes = args.maxNodes || 200;
        let count = 0;
        const prune = (node: any): any => {
          if (!node || count >= maxNodes) return null;
          count++;
          const out: any = { role: node.role };
          if (node.name) out.name = node.name;
          if (node.value) out.value = node.value;
          if (node.checked !== undefined) out.checked = node.checked;
          if (node.level !== undefined) out.level = node.level;
          if (node.selected !== undefined) out.selected = node.selected;
          if (node.children) {
            const kids: any[] = [];
            for (const c of node.children) { const k = prune(c); if (k) kids.push(k); }
            if (kids.length) out.children = kids;
          }
          return out;
        };
        const snap = await page.accessibility.snapshot().catch(() => null);
        const tree = prune(snap);
        result = { tree, nodeCount: count };
        break;
      }
      default:
        res.status(400).json({ error: '未知 action: ' + action }); return;
    }
    // 变化检测：操作后对比快照，为模型提供 pageChanged / noChangeStreak 反馈
    const r = result as any;
    if (beforeState && r && !r.error && !r.ambiguous) {
      await page.waitForTimeout(500).catch(() => {});
      const after = await page.evaluate(snapshotFn).catch(() => null);
      if (after) {
        const urlChanged = after.url !== beforeState.url;
        const changed = urlChanged || after.t !== beforeState.t || after.n !== beforeState.n;
        noChangeStreak = changed ? 0 : noChangeStreak + 1;
        r.pageChanged = changed;
        r.urlChanged = urlChanged;
        r.noChangeStreak = noChangeStreak;
        if (noChangeStreak >= 3) {
          r.warning = '连续 ' + noChangeStreak + ' 次操作页面无任何变化，操作可能未生效。请停止重复同类操作：改用 index 精确定位（先 get_page_info 获取编号列表）、重新分析页面、或 ask_user 请求人工介入。';
        }
      }
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

// ========== 浏览器记住密码：站点凭证 CRUD + 自动填充/登录 ==========
function pwdUserId(req: Request): string {
  return req.user?.userId || 'guest';
}

/** 自动识别当前页登录表单字段选择器（优先 id > name > type） */
async function findLoginFields(page: any): Promise<{ userSelector?: string; passwordSelector?: string; submitSelector?: string } | null> {
  return await page.evaluate(() => {
    const pwd = document.querySelector('input[type="password"]') as HTMLInputElement | null;
    if (!pwd) return null;
    const form = (pwd.closest('form') as HTMLElement) || document.body;
    const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[];
    let userField: HTMLInputElement | null = null;
    for (const inp of inputs) {
      if (inp === pwd) break;
      const t = (inp.type || '').toLowerCase();
      if (t === 'text' || t === 'email' || t === 'tel' || t === '') userField = inp;
    }
    const sel = (el: Element | null): string | undefined => {
      if (!el) return undefined;
      if (el.id) return '#' + ((window as any).CSS?.escape ? (window as any).CSS.escape(el.id) : el.id);
      const n = el.getAttribute('name');
      if (n) return `${el.tagName.toLowerCase()}[name="${n}"]`;
      const t = (el as HTMLInputElement).type;
      if (t) return `${el.tagName.toLowerCase()}[type="${t}"]`;
      return el.tagName.toLowerCase();
    };
    const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    return { userSelector: sel(userField), passwordSelector: sel(pwd), submitSelector: sel(submit) };
  });
}

// GET /api/browser/passwords —— 列表（不返回明文密码）
router.get('/passwords', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT id, host, url, name, username, form_meta_json, created_at, updated_at FROM saved_password WHERE user_id = ? ORDER BY updated_at DESC').all(pwdUserId(req)) as any[];
    res.json({ data: rows.map(r => ({ id: r.id, host: r.host, url: r.url, name: r.name, username: r.username, form_meta: r.form_meta_json ? JSON.parse(r.form_meta_json) : null, created_at: r.created_at, updated_at: r.updated_at })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '查询失败' });
  }
});

// POST /api/browser/passwords —— 保存/更新（按 host+username 去重 upsert）
router.post('/passwords', (req: Request, res: Response) => {
  try {
    const { host, url, name, username, password, form_meta } = req.body || {};
    if (!host || !username || !password) { res.status(400).json({ error: 'host/username/password 为必填项' }); return; }
    const uid = pwdUserId(req);
    const now = Date.now();
    const enc = encrypt(String(password));
    const metaJson = form_meta ? JSON.stringify(form_meta) : null;
    const existing = db.prepare('SELECT id FROM saved_password WHERE user_id = ? AND host = ? AND username = ?').get(uid, host, username) as any;
    if (existing) {
      db.prepare('UPDATE saved_password SET url=?, name=?, password_enc=?, form_meta_json=?, updated_at=? WHERE id=?').run(url || null, name || null, enc, metaJson, now, existing.id);
      res.json({ data: { id: existing.id, updated: true } });
    } else {
      const id = 'pw_' + crypto.randomUUID();
      db.prepare('INSERT INTO saved_password (id, user_id, host, url, name, username, password_enc, form_meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, uid, host, url || null, name || null, username, enc, metaJson, now, now);
      res.json({ data: { id, created: true } });
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '保存失败' });
  }
});

// PUT /api/browser/passwords/:id —— 更新
router.put('/passwords/:id', (req: Request, res: Response) => {
  try {
    const { host, url, name, username, password, form_meta } = req.body || {};
    const row = db.prepare('SELECT id FROM saved_password WHERE id = ? AND user_id = ?').get(req.params.id, pwdUserId(req)) as any;
    if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
    const now = Date.now();
    const metaJson = form_meta ? JSON.stringify(form_meta) : null;
    if (password) {
      const enc = encrypt(String(password));
      db.prepare('UPDATE saved_password SET host=?, url=?, name=?, username=?, password_enc=?, form_meta_json=?, updated_at=? WHERE id=?').run(host || '', url || null, name || null, username || '', enc, metaJson, now, req.params.id);
    } else {
      db.prepare('UPDATE saved_password SET host=?, url=?, name=?, username=?, form_meta_json=?, updated_at=? WHERE id=?').run(host || '', url || null, name || null, username || '', metaJson, now, req.params.id);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '更新失败' });
  }
});

// DELETE /api/browser/passwords/:id
router.delete('/passwords/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM saved_password WHERE id = ? AND user_id = ?').run(req.params.id, pwdUserId(req));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '删除失败' });
  }
});

// POST /api/browser/passwords/:id/reveal —— 返回明文密码（管理弹窗查看时用）
router.post('/passwords/:id/reveal', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT password_enc FROM saved_password WHERE id = ? AND user_id = ?').get(req.params.id, pwdUserId(req)) as any;
    if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
    res.json({ data: { password: decrypt(row.password_enc) } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '解密失败' });
  }
});

// POST /api/browser/passwords/:id/fill —— 用已存凭证自动填充当前页登录表单（不提交）
router.post('/passwords/:id/fill', async (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT username, password_enc, form_meta_json FROM saved_password WHERE id = ? AND user_id = ?').get(req.params.id, pwdUserId(req)) as any;
    if (!row) { res.status(404).json({ error: '凭证不存在' }); return; }
    const password = decrypt(row.password_enc);
    const page = await getPage();
    const meta = row.form_meta_json ? JSON.parse(row.form_meta_json) : null;
    const fields = meta && meta.passwordSelector ? meta : await findLoginFields(page);
    if (!fields || !fields.passwordSelector) { res.status(400).json({ error: '当前页面未找到登录表单' }); return; }
    if (fields.userSelector) {
      await page.locator(fields.userSelector).first().fill(row.username).catch(() => {});
    }
    await page.locator(fields.passwordSelector).first().fill(password);
    lastActivityAt = Date.now();
    res.json({ data: { filled: true, submitted: false } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '填充失败' });
  }
});

// POST /api/browser/login-saved —— 用已存凭证登录目标站点
// body: { host?, url? } —— 按 host 匹配凭证；若提供 url 先导航；自动找登录表单→填→提交→判断
router.post('/login-saved', async (req: Request, res: Response) => {
  try {
    const { host, url } = req.body || {};
    const uid = pwdUserId(req);
    let targetHost = host;
    if (!targetHost && url) { try { targetHost = new URL(url).host; } catch {} }
    if (!targetHost) { res.status(400).json({ error: 'host 或 url 为必填项' }); return; }
    const row = db.prepare('SELECT url, username, password_enc, form_meta_json FROM saved_password WHERE user_id = ? AND host = ? ORDER BY updated_at DESC LIMIT 1').get(uid, targetHost) as any;
    if (!row) { res.status(404).json({ error: `未找到 ${targetHost} 的已保存凭证` }); return; }
    const password = decrypt(row.password_enc);
    const page = await getPage();
    const navUrl = url || row.url;
    if (navUrl) {
      await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    const meta = row.form_meta_json ? JSON.parse(row.form_meta_json) : null;
    let fields = meta && meta.passwordSelector ? meta : await findLoginFields(page);
    if (!fields || !fields.passwordSelector) {
      const loginLink = page.locator('a:has-text("登录"), a:has-text("Login"), a:has-text("Sign in"), a[href*="login" i]').first();
      if (await loginLink.count().catch(() => 0) > 0) {
        await loginLink.click().catch(() => {});
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        fields = await findLoginFields(page);
      }
    }
    if (!fields || !fields.passwordSelector) { res.status(400).json({ error: '未找到登录表单，可能已登录或需要手动指定选择器' }); return; }
    if (fields.userSelector) {
      await page.locator(fields.userSelector).first().fill(row.username).catch(() => {});
    }
    await page.locator(fields.passwordSelector).first().fill(password);
    if (fields.submitSelector) {
      await page.locator(fields.submitSelector).first().click().catch(() => {});
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});
    const stillHasPwd = await page.locator('input[type="password"]').count().catch(() => 0);
    lastActivityAt = Date.now();
    res.json({ data: { loggedIn: stillHasPwd === 0, url: page.url(), title: await page.title().catch(() => '') } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '登录失败' });
  }
});

export default router;
