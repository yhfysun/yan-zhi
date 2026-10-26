// 内置浏览器路由 —— Playwright headless/headed 浏览器自动化
// 懒加载 playwright：未安装时返回友好错误，不影响服务启动
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { recordBrowserMemoryEvent, readBrowserMemory } from '../services/browser-memory.js';
import { withTimeout as sharedWithTimeout, KeyedStreak } from '@yan-zhi/shared';
import { createLogger } from '../services/logger.js';
const logger = createLogger('browser');

const router = Router();
router.use(optionalAuth); // 浏览器功能不需要登录，有 token 就解析（可选）

/**
 * ★★★ 浏览器**写操作**进程级串行（2026-10-09）。
 *
 * 为什么必须串行：服务端 Playwright 是**进程级单例** —— `browserInstance` / `pageInstance` /
 * `activeTabId` 都是模块级单值，"当前活动页"全进程只有一份。多个 pageAgent（或一批并发
 * browser_* 调用）同时操作会互相抢活动页：后到的 navigate 覆盖前一页，读取只能读到"当前页"，
 * 表现为「多个 pageAgent 只有一个在动 / 结果错乱」（与前端 BrowserView 同一类问题）。
 *
 * ★ 只串行**会改动浏览器状态的操作**（navigate / action / back / forward / refresh / close / focus），
 *   **不**串行只读查询（state / screenshot / downloads / history / stats）—— 后者不改状态，
 *   且常被 UI 轮询；串行它们会让轮询排在长操作后面，UI 卡住。
 *
 * 为什么挂在 router 层而不是逐个 handler 里包：本模块入口多，逐个包必漏（"入口漂移"教训）。
 * 中间件统一包装，新增写路由只需在下面的白名单里加一条。
 */
const browserQueue: Array<() => void> = [];
let browserBusy = false;
/** 需串行的写操作路径（按 router 注册路径判定）
 *
 * ★★★ 2026-10-09 补（A1）：白名单此前**漏了三个真正的写操作**，它们都改页面状态：
 *   · `GET /render`（`:1726`）→ `page.goto()` + `setViewportSize()` —— **导航就是写**，
 *     且被预览面板（BrowserPanel）高频调用；与并发 `/action` 抢同一 `pageInstance`
 *     → 跨会话错页（A 会话的读取拿到 B 刚导航的页面）。
 *   · `POST /login-saved`（`:2394`）→ `goto()` + `locator().click()`
 *   · `POST /passwords/:id/fill`（`:2372`）→ `locator().fill()`
 * ★ 判据（本模块注释自己写过「逐个包必漏」）：**判定依据是"该 handler 是否改页面状态"，
 *   不是"HTTP 方法是不是 POST"** —— `/render` 用 GET 却在导航，正是按方法判定的漏网之鱼。
 */
const BROWSER_SERIAL_PATHS = new Set([
  '/navigate', '/action', '/back', '/forward', '/refresh', '/close', '/focus',
  // ★ 2026-10-09 补：三个改页面状态的旁路写入口
  '/render', '/login-saved',
]);
/** 含路径参数的写路由（无法用精确 Set 匹配，用前缀/正则判定） */
const BROWSER_SERIAL_PATTERN = /^\/passwords\/[^/]+\/fill$/;
function isBrowserSerialPath(p: string): boolean {
  return BROWSER_SERIAL_PATHS.has(p) || BROWSER_SERIAL_PATTERN.test(p);
}
function withBrowserLock(handler: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response) => {
    if (!isBrowserSerialPath(req.path)) return handler(req, res); // 读操作直通
    // 排队等锁（先到先得，FIFO）
    if (browserBusy) {
      await new Promise<void>((resolve) => browserQueue.push(resolve));
    }
    browserBusy = true;
    try {
      await handler(req, res);
    } catch (e: any) {
      // handler 内部通常自带 try/catch；这里兜底防未捕获导致锁不释放
      logger.warn('[browser] 处理异常:', e?.message || e);
      try { if (!res.headersSent) res.status(500).json({ error: e?.message || '浏览器操作失败' }); } catch { /* ignore */ }
    } finally {
      const next = browserQueue.shift();
      if (next) next(); else browserBusy = false;
    }
  };
}

// Playwright 单例（懒启动）
let chromiumModule: any = null;
let browserInstance: any = null;
let pageInstance: any = null;
let lastActivityAt = 0;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟空闲后关闭

// 下载记录（Playwright download 事件收集，内存中保留最近 50 条）
interface DownloadRecord { url: string; filename: string; time: number; savedPath?: string; state?: string; bytes?: number; }
const downloadRecords: DownloadRecord[] = [];
/** download action 显式 savePath 的临时覆盖（执行期间有效，与桌面端 main.cjs 同口径） */
let pendingDownloadSavePath = '';
/** 最近一次动作下发的工作目录（下载保存基准；listener 拿不到 args，只能靠它） */
let lastAgentWorkspaceDir = '';

/** 下载保存基准目录：工作目录优先，兜底进程 cwd 下的 workspace/downloads */
function downloadBaseDir(): string {
  return lastAgentWorkspaceDir ? path.join(lastAgentWorkspaceDir, 'downloads') : path.resolve('workspace/downloads');
}

/** 等一条"本次动作之后"完成的下载记录（download action / 事后查询共用） */
async function waitForDownloadRecord(sinceTime: number, timeoutMs: number): Promise<DownloadRecord | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rec = downloadRecords.find((r) => r.time >= sinceTime && r.state && r.state !== 'progressing');
    if (rec) return rec;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/**
 * ★★★ 会话 → 活动页 绑定表（A4 根治，2026-10-10）。
 *
 * ★ 为什么必须（实测缺陷）：本服务端是**进程级单例** —— `pageInstance` / `activeTabId`
 *   全局单值，而 `GET /state` / `GET /screenshot` 等**读路由直读它** ⇒
 *   **A 会话导航中、B 会话截图会拿到 A 的页面**，且**静默无报错**
 *   （模型据此继续决策，全程作用在错页面上 —— 最难查的一类）。
 * ★ 会话标识来源：core 的 `callBrowserApi` 透传的 `x-yz-conversation-id`
 *   （上游是 `ToolContext.conversationId`）。
 * ★ 与既有"写路由串行"的分工：串行（`withBrowserLock`）解决"同时写互相踩"；
 *   本表解决"**读**到别人的页"。两者互补，都必要。
 * ★ 键是会话 id；值是该会话**最近一次操作所在的 page**。
 *   读路由优先取本会话的页：取不到（该会话还没操作过）→ **明确报错**而不是
 *   静默返回全局活动页（那正是本次要消灭的"静默错页"）。
 */
const activePageByConv = new Map<string, any>();

/** 取请求里的会话标识（core 透传；缺失返回 null —— 老调用方/非会话场景） */
function convIdOf(req: Request): string | null {
  const h = req.headers['x-yz-conversation-id'];
  const v = Array.isArray(h) ? h[0] : h;
  const s = String(v || '').trim();
  return s || null;
}

/** 记录"该会话当前在哪个 page 上"（写路由成功后调用） */
function bindConvPage(convId: string | null, page: any): void {
  if (!convId || !page) return;
  activePageByConv.set(convId, page);
  // 上限兜底：会话很多时淘汰最早的（Map 插入序）
  while (activePageByConv.size > 200) {
    const oldest = activePageByConv.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    activePageByConv.delete(oldest);
  }
}

// ============================================================
// 表单快照与差异（2026-10-13）—— 与桌面链路（main.cjs 同名函数）保持同口径。
//
// ★ 为什么要有（会话 253bd3f4 实测）：模型填完字段后无法知道"表单整体现在什么状态"，
//   只能从上百条可交互元素平铺清单里自己比对当前值（值还常被截断），判错就再填一遍。
//   读页时直接给出「字段=当前值」+「自上次读取哪些字段变了」，模型才不用猜。
//   Claude（computer use）每步拿到状态差异，正是它不反复填的关键。
//
// ★ 快照绑定 URL：跨页导航后不与上一页比较（否则整页字段都算"变了"，噪声淹没信号）。
//   键用 `srv:<url>`（服务端这条链路是 pageInstance 单页模型，没有 tabId 概念）。
// ============================================================
const lastFormSnapshots = new Map<string, { url: string; fields: Map<string, string> }>();

/** 字段身份键：标签优先，空标签退化到 selector（与桌面链路同规则） */
function formFieldKey(f: any): string {
  const label = String((f && f.label) || '').trim();
  return label || String((f && f.selector) || '');
}

/** 与上次读取比较，返回值级变化列表；同时更新快照（最多 20 条） */
function diffFormSnapshot(tabKey: string, url: string, fields: unknown): Array<{ field: string; from: string; to: string; filled: boolean }> {
  const list = Array.isArray(fields) ? (fields as any[]) : [];
  const now = new Map<string, string>();
  for (const f of list) now.set(formFieldKey(f), String(f && f.value != null ? f.value : ''));
  const prev = lastFormSnapshots.get(tabKey);
  const changes: Array<{ field: string; from: string; to: string; filled: boolean }> = [];
  if (prev && prev.url === url) {
    for (const f of list) {
      const key = formFieldKey(f);
      const before = prev.fields.get(key);
      const after = String(f && f.value != null ? f.value : '');
      // 只报"上次见过且值变了"的字段：新出现的字段不算变化（SPA 重渲染/懒加载会刷假变化）
      if (before !== undefined && before !== after) {
        changes.push({ field: key, from: before.slice(0, 60), to: after.slice(0, 60), filled: !!after });
      }
    }
  }
  lastFormSnapshots.set(tabKey, { url, fields: now });
  // 上限兜底：快照按 URL 累积（长时间运行会攒很多页）
  while (lastFormSnapshots.size > 200) {
    const oldest = lastFormSnapshots.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    lastFormSnapshots.delete(oldest);
  }
  return changes.slice(0, 20);
}

/**
 * ★★★ 解析"本次读取该用哪个 page"（A4 根治的核心判定，抽成**纯函数**便于真跑验证）。
 *
 * 语义（三条，缺一条都会退回"静默错页"）：
 *   ① 无会话标识（老调用方/非会话场景）→ 退回全局活动页（**保持向后兼容**，不制造破坏）；
 *   ② 有会话标识且该会话已绑定页 → 用**它自己的页**（隔离生效）；
 *   ③ 有会话标识但未绑定 → **返回 null**（调用方必须**明确报错**，
 *      绝不能静默用全局活动页 —— 那就是"读到别人的页面"）。
 */
export function resolveReadPage(
  convId: string | null,
  boundPage: any,
  globalPage: any,
): { page: any; reason: 'global' | 'bound' | 'unbound-conv' } {
  if (!convId) return { page: globalPage, reason: 'global' };
  if (boundPage) return { page: boundPage, reason: 'bound' };
  return { page: null, reason: 'unbound-conv' };
}

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

// ========== 阶段一改造：超时兜底 + 健康探针 + CDP 模式 + headless 可配置 ==========
const BROWSER_MODE = (process.env.BROWSER_MODE || 'launch') as 'launch' | 'cdp';
// ★★★ B8（2026-10-09）：端点改为**可在连接失败时重解析**（此前是启动期固定常量）。
//
// 真缺口：桌面端 CDP 端口默认**自动分配**（`remote-debugging-port=0`，实际端口写在
//   userData/DevToolsActivePort）。主进程把解析结果经 env 注入服务端 —— 这条路径本身是对的。
//   但**服务端是独立进程**：桌面主进程崩溃/重启后（新端口）而服务端仍活着时，
//   服务端会拿旧端点**永远** ECONNREFUSED（重试也没用，因为端口根本变了）。
//   ⇒ 连接失败时重读 DevToolsActivePort 再试一次，让服务端能自愈到新端口。
//
// ★ 与 `bin/dev.mjs` / `main.cjs` 的 `resolveCdpEndpoint` **同源**（同一份目录候选与校验），
//   不另造判据。★ 只在**失败后**才重解析（成功路径零开销、不改变既有行为）。
let CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';

/**
 * 重读 userData/DevToolsActivePort 解析真实 CDP 端点（失败返回 null）。
 * ★ 目录候选与 `bin/dev.mjs:readDevToolsActivePortEndpoint` 一致（dev 与打包两套 userData）。
 */
function reResolveCdpEndpoint(): string | null {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const candidates =
      process.platform === 'darwin'
        ? [path.join(home, 'Library', 'Application Support', 'yan-zhi-dev'), path.join(home, 'Library', 'Application Support', 'yan-zhi')]
        : process.platform === 'win32'
          ? [path.join(appData, 'yan-zhi-dev'), path.join(appData, 'yan-zhi')]
          : [path.join(home, '.config', 'yan-zhi-dev'), path.join(home, '.config', 'yan-zhi')];
    for (const dir of candidates) {
      try {
        const port = parseInt(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0], 10);
        if (port > 0 && port < 65536) {
          const ep = `http://127.0.0.1:${port}`;
          if (ep !== CDP_ENDPOINT) logger.info(`[browser] CDP 端点重解析: ${CDP_ENDPOINT} → ${ep}`);
          return ep;
        }
      } catch { /* 未就绪/不存在 */ }
    }
  } catch { /* 环境异常 → 静默（连接层会给出原始错误） */ }
  return null;
}
// 修复：launch 模式强制 headless。此前 BROWSER_HEADLESS=false 可在 launch 模式弹出独立
// Chromium 有头窗口（模型调浏览器工具时桌面突然多出一个浏览器），与「单一执行面」冲突——
// 有界面只允许 Electron 自身的 BrowserView（桌面端 BROWSER_MODE=cdp 连自己）。
const BROWSER_HEADLESS = true;
const OP_TIMEOUT_MS = 15000; // 所有 page 操作统一超时（解决僵尸实例导致的永久挂起）

/** 操作超时兜底：任何 page 操作超过 OP_TIMEOUT_MS 则 reject（实现收口 shared.withTimeout，P6） */
function withTimeout<T>(p: Promise<T>, msg = '浏览器操作超时'): Promise<T> {
  return sharedWithTimeout(p, OP_TIMEOUT_MS, `${msg}，实例可能已假死，将自动重建`);
}

/** 浏览器健康探针：真正执行一次 version() 请求，比 isConnected() 更可靠 */
async function isBrowserAlive(b: any): Promise<boolean> {
  if (!b) return false;
  if (b.isConnected?.() === false) return false;
  try {
    await withTimeout(b.version?.() ?? Promise.resolve('ok'), '浏览器心跳超时');
    return true;
  } catch {
    return false;
  }
}

/** 强制重置浏览器状态（实例假死时调用） */
async function resetBrowser() {
  try { if (pageInstance && !pageInstance.isClosed?.()) await pageInstance.close().catch(() => {}); } catch {}
  try { if (browserInstance) await browserInstance.close().catch(() => {}); } catch {}
  browserInstance = null;
  pageInstance = null;
  tabs.clear();
  activeTabId = -1;
  nextTabId = 0;
}

/**
 * ★ B1（2026-10-11）：连接级断开监听 —— 补"断了但系统不知道"的缺口。
 *   此前只在下一次操作前被动 version() 探活（isBrowserAlive），从断开到被发现
 *   之间隔着"下一次调用"；监听 disconnected 即时置脏单例，下一次 getBrowser()/
 *   getPage() 直接走重建（getPage 假死分支已含 lastKnownUrl 恢复，行为闭环）。
 *   ★ 只置脏、不在事件回调里重建 —— 回调里重建会与进行中的操作竞态。
 */
function attachBrowserDisconnectWatch(browser: any) {
  if (!browser || browser.__yzDisconnectWired) return;
  try {
    browser.__yzDisconnectWired = true;
    browser.once('disconnected', () => {
      console.log('[browser] 连接断开（disconnected）→ 置脏单例，等待下一次调用重建');
      browserInstance = null;
      pageInstance = null;
      tabs.clear();
      activeTabId = -1;
      nextTabId = 0;
    });
  } catch { /* 事件 API 不可用则维持被动探活 */ }
}

/** CDP 连接瞬时故障重试：ECONNREFUSED（启动竞态/浏览器重启瞬间）退避重试 2 次 */
async function connectCdpWithRetry(chromium: any, endpoint: string): Promise<any> {
  let lastErr: any;
  let ep = endpoint;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await chromium.connectOverCDP(ep);
    } catch (e: any) {
      lastErr = e;
      // ★★★ B8（2026-10-09）：重试**之前**先重读 DevToolsActivePort。
      //   桌面主进程崩溃/重启后 CDP 端口会**重新自动分配**，而本进程仍持有旧端点
      //   → 不重解析的话三次重试全打在已经没人监听的端口上（永远失败）。
      //   ★ 只在失败后才重解析：成功路径零开销、行为不变。
      const fresh = reResolveCdpEndpoint();
      if (fresh && fresh !== ep) {
        ep = fresh;
        CDP_ENDPOINT = fresh; // 写回，后续 getBrowser 直接用新端点
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const detail = lastErr?.message || String(lastErr);
  throw new Error(
    `CDP 连接失败（已重试 3 次，含端点重解析）: ${ep} —— 预览面板浏览器未就绪或调试端口被占用，可在预览面板重开浏览器后重试。原始错误: ${detail}`,
  );
}

/** 获取或启动浏览器实例（支持 launch / cdp 两种模式，headless 可配置） */
async function getBrowser() {
  const { chromium } = await loadChromium();
  // 健康探针：isConnected 不够，真正发一次请求验证存活
  if (browserInstance && (await isBrowserAlive(browserInstance))) {
    lastActivityAt = Date.now();
    return browserInstance;
  }
  // 实例假死：先清理再重建
  if (browserInstance) await resetBrowser();
  if (BROWSER_MODE === 'cdp') {
    // CDP 模式：连接 Electron 自身 BrowserView（端点由桌面 main.cjs 经 env 注入）。
    // 瞬时故障重试（2026-10-06）：应用启动竞态 / 预览面板浏览器重启瞬间会 ECONNREFUSED，
    // 长任务不该被一次抖动杀死 → 退避重试 2 次（1.5s/3s）。
    browserInstance = await withTimeout(connectCdpWithRetry(chromium, CDP_ENDPOINT), 'CDP 连接失败');
  } else {
    // launch 模式：强制 headless（不允许环境变量切有头，避免弹独立浏览器窗口）
    browserInstance = await withTimeout(chromium.launch({ headless: BROWSER_HEADLESS }), '浏览器启动失败');
  }
  // ★ B1（2026-10-11）：实例建好后立即挂断开监听（见函数注释）
  attachBrowserDisconnectWatch(browserInstance);
  lastActivityAt = Date.now();
  scheduleIdleCheck();
  return browserInstance;
}

/** 给 page 挂载下载与网络请求监听 */
function attachPageListeners(page: any) {
  // ★ B4（原生弹窗）：Playwright 未注册 dialog handler 时**会自动 dismiss**（与服务端语义对齐，
  //   不在此显式注册 handler 以避免与桌面端实现反向漂移 —— 见 native-dialog.test.ts ④）。
  // 监听下载事件，记录到 downloadRecords
  page.on('download', async (download: any) => {
    const filename = download.suggestedFilename();
    // 保存到 workspace/downloads/（绝对化后再回传，模型可直接用文件工具读取）；
    // download action 显式给了 savePath 时用它的临时覆盖值。
    const savePath = pendingDownloadSavePath || path.join(downloadBaseDir(), filename);
    const rec: DownloadRecord = { url: download.url(), filename, time: Date.now(), savedPath: savePath, state: 'progressing' };
    downloadRecords.unshift(rec);
    if (downloadRecords.length > 50) downloadRecords.pop();
    try {
      try { await fs.promises.mkdir(path.dirname(savePath), { recursive: true }); } catch {}
      await download.saveAs(savePath);
      rec.state = 'completed';
      try { rec.bytes = (await fs.promises.stat(savePath)).size; } catch {}
    } catch (e: any) {
      rec.state = 'failed';
      logger.warn(`[download] 保存失败: ${e?.message || e}`);
    }
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

/**
 * CDP 模式安全闸门：附着的是 Electron 自身（或用户真实浏览器），pages 列表里混着
 * "应用壳窗口"（主窗口 file://dist、dev server localhost、devtools、about:blank）。
 * 一旦选中并 goto，会命中主窗口的 will-navigate → 主进程 shell.openExternal(url) →
 * 弹出系统浏览器独立窗口（实测 bug：智能体/任务调浏览器工具弹独立浏览器窗口）。
 */
function isUnsafeCdpPage(page: any): boolean {
  let u = '';
  try { u = page.url() || ''; } catch { return true; }
  if (!u || u === 'about:blank') return true;
  if (u.startsWith('file:') || u.startsWith('devtools:') || u.startsWith('chrome:') || u.startsWith('edge:')) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(u)) return true;
  return false;
}

/** CDP 模式选页：只挑"真实网页" target；没有就返回 null（调用方处理，禁止 newPage —— Electron 上 newPage 会弹新窗口） */
function pickCdpPage(browser: any): any | null {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (!isUnsafeCdpPage(p)) return p;
    }
  }
  return null;
}

/**
 * CDP 模式下没有可用网页 target 时，驱动**应用壳页**自动打开预览面板（2026-10-05）。
 * 全自动链路要求 agent 能自己把面板开起来，而不是报错等用户手动开。
 * 做法（实测有效）：壳页切到 #/browser 路由 → 地址栏 input.url-input 用原生 setter
 * 写入目标 URL → 派发 Enter（keydown+keyup，Vue 需 keyup）。壳页 = dev localhost:1420
 * 或打包 file://index.html。
 * @returns 是否成功驱动壳页（不代表 webview 一定出现，调用方需轮询 pickCdpPage）
 */
async function ensureWebviewViaShell(browser: any, url?: string): Promise<boolean> {
  let shell: any = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      let u = '';
      try { u = p.url() || ''; } catch { continue; }
      if (u.includes('localhost:1420') || u.includes('127.0.0.1:1420') || /index\.html/i.test(u)) { shell = p; break; }
    }
    if (shell) break;
  }
  if (!shell) return false;
  const target = url || 'https://kol.fanqieopen.com/';
  try {
    await shell.evaluate(() => {
      if (location.hash.indexOf('#/browser') !== 0) location.hash = '#/browser';
      return true;
    });
    await shell.waitForTimeout(800);
    await shell.evaluate((t: string) => {
      const el = Array.from(document.querySelectorAll('input.url-input')).find((e: any) => e.offsetParent !== null) as HTMLInputElement | undefined;
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, t);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const ko = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
      el.dispatchEvent(new KeyboardEvent('keydown', ko));
      el.dispatchEvent(new KeyboardEvent('keyup', ko));
      return true;
    }, target);
  } catch {
    return false;
  }
  return true;
}

/** 创建一个新的 context + page（多标签页基础单元），可选导航到 url */
async function createTabPage(url?: string): Promise<any> {
  const browser = await getBrowser();
  let context: any;
  let page: any;
  if (BROWSER_MODE === 'cdp') {
    // CDP 模式：只复用"真实网页" target（绝不选中应用壳窗口、绝不 newPage 弹新窗口，见 pickCdpPage）
    page = pickCdpPage(browser);
    if (!page) {
      // 全自动（2026-10-05）：没有可用 target 时驱动应用壳页自动打开预览面板，
      // 而不是报错等用户手动开（旧报错会把全自动任务卡死在浏览器连接层）
      const opened = await ensureWebviewViaShell(browser, url);
      if (opened) {
        for (let i = 0; i < 30 && !page; i++) {
          await new Promise((r) => setTimeout(r, 500));
          page = pickCdpPage(browser);
        }
      }
    }
    if (!page) {
      throw new Error('CDP 模式下未找到可用的网页 target，且自动打开预览面板失败。请手动在应用预览面板打开任意网页后重试。');
    }
    context = page.context();
  } else {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'zh-CN',
    });
    page = await context.newPage();
  }
  // 注入 __name polyfill：esbuild keepNames 会给 ensureYzReg 内部嵌套函数注入 __name helper，
  // page.evaluate 序列化函数体到浏览器执行时 __name 未定义会报 ReferenceError。此处全局兜底。
  // ★ addInitScript 只在「下一次导航」生效 —— 首个 page 创建时已是 about:blank、不再导航，
  //   polyfill 永远不会跑（dev 实测 get_page_content 仍报 __name is not defined）→ 补一次立即注入。
  await page.addInitScript({ content: 'window.__name = window.__name || ((t) => t);' });
  await page.evaluate('window.__name = window.__name || ((t) => t);').catch(() => { /* 页面瞬断不影响 */ });
  attachPageListeners(page);
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  return page;
}

/** page 健康探针：执行一次轻量 evaluate 验证 page 存活 */
async function isPageAlive(p: any): Promise<boolean> {
  if (!p || p.isClosed?.()) return false;
  try {
    await withTimeout(p.evaluate(() => 1), 'page 心跳超时');
    return true;
  } catch {
    return false;
  }
}

/**
 * ★★★ 判定"重建页面后是否要恢复 URL"（2026-10-09，抽成**纯函数**以便真跑验证）。
 *
 * ★ 为什么必须抽出来：这个判定的三个条件（曾经有 page / 有记录 URL / 当前不在该 URL）
 *   如果内联在 `getPage()` 里，就只能用"源码里有没有这段字符串"来守门 —— 而那是**假绿**：
 *   实测把 `hadPage` 写死成 `false`（恢复永不发生）时，字符串断言**全部通过**。
 *   ⇒ 抽成纯函数后，"语义"才可被真正验证（本项目一贯做法）。
 *
 * @param hadPage 重建前是否已有 page（false = 首次创建 / 空闲超时已清空 → **不该**恢复）
 * @param lastKnownUrl 上一次成功导航记录的 URL（空 = 无可恢复）
 * @param currentUrl 新建 page 的当前 URL
 */
export function shouldRestorePageUrl(hadPage: boolean, lastKnownUrl: string, currentUrl: string): boolean {
  if (!hadPage) return false;              // 不是"坏了重建"出来的 → 别把新任务拽到旧页面
  if (!lastKnownUrl) return false;         // 没记录过 → 无可恢复
  if (!currentUrl) return true;            // 拿不到当前 URL（异常页）→ 尝试恢复更安全
  return currentUrl !== lastKnownUrl;      // 已在目标 URL → 不必重载
}

/** 获取或创建页面（当前活动标签页），含健康检查 */
async function getPage() {
  if (pageInstance && (await isPageAlive(pageInstance))) {
    lastActivityAt = Date.now();
    return pageInstance;
  }
  // ★★★ page 假死/丢失：重建时要**恢复 URL**（2026-10-09 接线，见下方注释）。
  //   `hadPage` 用于区分两种情况，避免误用陈旧 URL：
  //     · true  = 正在用的 page 坏了 → 任务原先在某个网页上 → 应回到那个 URL
  //     · false = 首次创建 / 空闲超时已清空（`scheduleIdleCheck` 会置 `pageInstance=null`）
  //               → 不该导航到"上一个任务的 URL"（那会让新任务凭空跳到旧页面）
  const hadPage = !!pageInstance;
  if (pageInstance) {
    try { await pageInstance.close().catch(() => {}); } catch {}
    pageInstance = null;
  }
  // 首次：创建主标签页（tab 0）
  const page = await createTabPage();
  pageInstance = page;
  activeTabId = 0;
  tabs.set(0, page);
  nextTabId = 1;
  lastActivityAt = Date.now();
  // ★★★ 恢复任务所在 URL（2026-10-09）。此前这里只重建 page、**不恢复 URL**：
  //   `createTabPage` 在 CDP 模式走 `pickCdpPage`（挑真实网页 target）、launch 模式是全新
  //   `about:blank` 页 —— 于是"page 坏掉重建"会把任务**静默换到另一个页面**，
  //   模型下一步的点击/读取全都作用在错的页面上，而且**不报错**（最难查的一类）。
  //   `recordPageState` 早已在 /navigate 与 /action 成功后记录了 `lastKnownUrl`，
  //   `recoverSession` 也早已实现了"导航回去"的逻辑 —— **但从未被接线调用**（死代码）。
  //   ⇒ 这里把它接上（只取"导航回去"这一条已验证价值的能力，
  //     不整体改用 `recoverSession` —— 那个函数没有 `ensureWebviewViaShell` 自动开面板的能力，
  //     整体替换会**丢掉** createTabPage 更完整的兜底）。
  if (hadPage && lastKnownUrl) {
    try {
      const cur = (() => { try { return page.url(); } catch { return ''; } })();
      // ★ 判定委托给纯函数（`shouldRestorePageUrl`）—— 内联判定无法被真跑验证，只能查字符串（假绿）。
      if (shouldRestorePageUrl(hadPage, lastKnownUrl, cur)) {
        await withTimeout(page.goto(lastKnownUrl, { waitUntil: 'domcontentloaded' }), '恢复页面超时').catch((e) => {
          logger.warn('[browser] 重建后恢复 URL 失败（不影响本次调用）:', e?.message || e);
        });
      }
    } catch { /* 恢复 URL 失败不阻塞本次调用 */ }
  }
  return page;
}

// ========== 阶段二：会话自动恢复 ==========
let lastKnownUrl = '';
let lastKnownTitle = '';

/** 记录最近访问的 URL（用于会话恢复） */
function recordPageState(url: string, title?: string) {
  if (url && url !== 'about:blank') { lastKnownUrl = url; }
  if (title != null) { lastKnownTitle = title; }
}

/** 会话恢复：browser 还在但 page 丢了 → 重建 page 并导航到最近 URL
 *
 * ★★★ 接线状态说明（2026-10-09 核实）：本函数**仍然没有直接调用点**，但**不再是死代码** ——
 *   它最有价值的两个能力，已分别由 `getBrowser()` 与 `getPage()` 承担：
 *     · 「浏览器实例假死 → 重建」：`getBrowser()` 用 `isBrowserAlive`（真发一次 `version()`）探活，
 *       假死则 `resetBrowser()` + 重连（CDP 模式带 3 次退避重试）。**比本函数更完整**；
 *     · 「page 丢失 → 重建并回到原 URL」：`getPage()` 已接线（2026-10-09 补 `lastKnownUrl` 恢复）。
 *   ⇒ 本函数保留作为**独立可调用的恢复入口**（如需一个"显式恢复会话"的 API/工具可继续用它），
 *     ★ 但**不要**把它整体替换进 `getPage()` —— 它缺 `ensureWebviewViaShell`
 *       （自动驱动应用壳打开预览面板）这个兜底，替换会**削弱**现有的自动恢复能力。
 *   ★ 判据（本项目反复踩）：**"函数被定义"≠"能力可用"** —— 判断某能力是否真的存在，
 *     要看调用链是否闭合，而不是 grep 到函数名就认为有。
 */
async function recoverSession(): Promise<{ recovered: boolean; url: string }> {
  let page: any = null;
  try {
    if (!browserInstance || !(await isBrowserAlive(browserInstance))) {
      return { recovered: false, url: '' };
    }
    if (BROWSER_MODE === 'cdp') {
      // CDP 模式：同样只挑真实网页 target，绝不选中应用壳窗口 / newPage 弹新窗口
      page = pickCdpPage(browserInstance);
      if (!page) return { recovered: false, url: '' };
    } else {
      const contexts = browserInstance.contexts();
      for (const ctx of contexts) {
        const pages = ctx.pages();
        if (pages.length > 0) { page = pages[0]; break; }
      }
      if (!page) {
        const ctx = contexts.length > 0 ? contexts[0] : await browserInstance.newContext({ viewport: { width: 1280, height: 800 } });
        page = await ctx.newPage();
        attachPageListeners(page);
      }
    }
    pageInstance = page;
    if (lastKnownUrl && lastKnownUrl !== page.url()) {
      try { await page.goto(lastKnownUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); } catch {}
    }
    return { recovered: true, url: page.url() };
  } catch (e) {
    return { recovered: false, url: '' };
  }
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
router.post('/navigate', withBrowserLock(async (req: Request, res: Response) => {
  try {
    const { url, viewport, tabId } = req.body || {};
    if (!url) { res.status(400).json({ error: 'url 为必填项' }); return; }
    // tabId 定向：导航到指定标签页（同批多导航/多页并行场景），并切为活动页
    let page: any;
    const tid = tabId !== undefined && tabId !== null ? Number(tabId) : null;
    if (tid !== null && tabs.has(tid) && !tabs.get(tid)?.isClosed?.()) {
      page = tabs.get(tid);
      pageInstance = page;
      activeTabId = tid;
    } else {
      page = await getPage();
    }
    // 同步前端视口大小
    if (viewport && viewport.width && viewport.height) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height }).catch(() => {});
    }
    await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }), '导航超时');
    const title = await withTimeout(page.title(), '获取标题超时');
    const currentUrl = page.url();
    lastActivityAt = Date.now();
    recordPageState(currentUrl, String(title || ''));
    // 浏览器记忆：?src=agent（内置浏览器工具调用，见 core callBrowserApi）→ agent 操作；其余按用户浏览记录。
    // 60s 内相同 url 自动去重（browser-memory 内处理），fire-and-forget 不阻塞导航响应。
    void recordBrowserMemoryEvent({
      url: currentUrl,
      title: String(title || ''),
      source: req.query.src === 'agent' ? 'agent' : 'user',
    });
    // ★ A4 根治：记录"本会话现在在这个页上"（读路由据此隔离）
    bindConvPage(convIdOf(req), page);
    res.json({ data: { url: currentUrl, title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '导航失败' });
  }
}));


// POST /api/browser/action —— 执行浏览器动作（click/type/press/scroll/hover/get_text/get_dom/wait）
// 页面内元素注册表 + 编号 + 稳定选择器生成（自包含无闭包，供 page.evaluate 注入）。
// browser_get_page_info / browser_get_dom 收集可交互元素时注册并返回 index + ref，
// browser_click / browser_type 优先用 ref（d1:e12 格式）定位，回退到 index，免手写动态 hash class 选择器。

// ========== 阶段二：DOM Ref 系统（d1:e12 格式，替代易失效的全局 index） ==========
// scopeId: 主文档=d1，同源 iframe 按发现顺序=d2,d3...
// elementId: 元素在当前 scope 内的递增编号
// 优势: ref 绑定文档 scope，页面内局部刷新不失效；iframe 元素有独立 scope 不会冲突
function ensureYzRefs() {
  const w = window as any;
  if (w.__yzRefs) return w.__yzRefs;
  w.__yzRefMap = w.__yzRefMap || new WeakMap();
  w.__yzScopeCounter = w.__yzScopeCounter || 1;
  w.__yzScopes = w.__yzScopes || new Map(); // document -> scopeId

  const getScopeId = (doc: Document): string => {
    const R = w.__yzRefs;
    if (R.scopes.has(doc)) return R.scopes.get(doc);
    const sid = 'd' + (R.scopeCounter++);
    R.scopes.set(doc, sid);
    // 给文档挂一个 elementId 计数器
    (doc as any).__yzElCounter = (doc as any).__yzElCounter || 0;
    return sid;
  };

  const register = (el: Element): string => {
    const R = w.__yzRefs;
    const existing = R.refMap.get(el);
    if (existing) return existing;
    const doc = el.ownerDocument || document;
    const sid = getScopeId(doc);
    const eid = ++((doc as any).__yzElCounter);
    const ref = sid + ':e' + eid;
    try { R.refMap.set(el, ref); } catch { /* ignore */ }
    return ref;
  };

  const resolve = (ref: string): Element | null => {
    const R = w.__yzRefs;
    const m = /^(d\d+):e(\d+)$/.exec(ref);
    if (!m) return null;
    const targetSid = m[1];
    const targetEid = Number(m[2]);
    // 遍历所有 scope 文档，找匹配的元素
    for (const [doc, sid] of R.scopes.entries()) {
      if (sid !== targetSid) continue;
      // 在该文档内遍历所有元素，找 __yzRef 匹配的
      const all = doc.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const r = R.refMap.get(el);
        if (r === ref) return el;
      }
    }
    return null;
  };

  w.__yzRefs = {
    refMap: w.__yzRefMap,
    scopeCounter: w.__yzScopeCounter,
    scopes: w.__yzScopes,
    register,
    resolve,
    getScopeId,
  };
  return w.__yzRefs;
}

// ★★★ P2（2026-10-20）表单填写聚焦高亮（与桌面端 main.cjs 的 FIELD_FLASH_BODY **同源同款**）：
//   fill_form / type 操作字段时在页内画蓝色 focus 框 + 「⌨ 值」角标（~1.8s 淡出 / 2.4s 移除），
//   让用户实时看到"agent 正在往哪个字段填什么"。蓝色 #3b82f6 区分 P0 编号层的橙色 #f97316。
// ★ id 单例（__yz_field_flash）：连续填多字段时"当前字段"覆盖前一个。
// ★ 纯视觉辅助：任何失败静默，不进动作回执。片段约定：作用域里必须有 `el` 与 `v`。
//   （服务端这份通过 page.evaluate 的**字符串表达式**执行 —— 与桌面端一样是模板拼接，
//     正文不能出现反引号；Playwright evaluate 接受字符串源码。）
const FIELD_FLASH_BODY = `var OLDID='__yz_field_flash';var old=document.getElementById(OLDID);if(old)old.remove();var r=el.getBoundingClientRect();var ov=document.createElement('div');ov.id=OLDID;ov.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border:2px solid #3b82f6;box-sizing:border-box;pointer-events:none;z-index:2147483647;border-radius:2px;box-shadow:0 0 0 2px rgba(59,130,246,.35);transition:opacity .4s;';var tg=document.createElement('div');tg.textContent='⌨ '+String(v==null?'':v).slice(0,24);tg.style.cssText='position:fixed;left:'+r.left+'px;top:'+Math.max(0,r.top-20)+'px;background:#3b82f6;color:#fff;font:bold 12px/16px sans-serif;padding:0 6px;border-radius:2px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;';document.documentElement.appendChild(ov);document.documentElement.appendChild(tg);setTimeout(function(){try{ov.style.opacity='0';tg.style.opacity='0';}catch(e){}},1800);setTimeout(function(){try{ov.remove();tg.remove();}catch(e){}},2400);`;

/** 按选择器定位字段并画聚焦框（fill_form 逐字段 / type 的 selector 路径用） */
async function flashFieldBySelector(page: any, selector: string, value: unknown): Promise<void> {
  try {
    await page.evaluate(`(function(){
      try{
        var el=document.querySelector(${JSON.stringify(String(selector || ''))});
        var v=${JSON.stringify(String(value ?? ''))};
        if(el){${FIELD_FLASH_BODY}}
      }catch(e){}
    })()`);
  } catch { /* 纯视觉辅助，失败静默 */ }
}

/**
 * fill_form 单字段失败分档（2026-10-24）：
 *   deferred —— 原生下拉的选项此刻不存在（省市区级联 / 异步加载）：先填上游，回头再补，不要原样重试；
 *   skipped  —— 目标不是原生 select（自定义下拉 / 组件库伪控件）：fill_form 做不到，改用 click 展开再选；
 *   failed   —— 其余真失败（选择器错、只读、被遮挡、超时）。
 * 全都塞进 failed 时，模型只能反复重试同一批参数 —— 这是本项目"反复填表"的头号来源。
 */
function classifyFillFailure(ftype: string, msg: string): 'deferred' | 'skipped' | 'failed' {
  if (ftype !== 'select') return 'failed';
  if (/not a <select>|not a select element/i.test(msg)) return 'skipped';
  if (/did not find some options|option[s]? not found|no option/i.test(msg)) return 'deferred';
  return 'failed';
}

/** 按 ref/index 解析链定位字段并画聚焦框（type 的 ref/index 路径用；与桌面端 CDP 补刀同构） */
async function flashFieldOnPage(page: any, locate: { ref?: string | null; index?: number | null; selector?: string | null }, value: string): Promise<void> {
  try {
    await page.evaluate(`(function(){
      try{
        var a=${JSON.stringify(locate || {})};
        var v=${JSON.stringify(String(value ?? ''))};
        var el=null;
        var R=window.__yzReg;var Refs=window.__yzRefs;
        if(a.ref&&Refs){el=Refs.resolve(a.ref);}
        if((!el||!el.isConnected)&&a.index!=null&&R){el=R.get(a.index);
          if((!el||!el.isConnected)&&R.selOf){var snap=R.selOf(a.index);if(snap){var f=document.querySelector(snap);if(f)el=f;}}}
        if((!el||!el.isConnected)&&a.selector){el=document.querySelector(a.selector);}
        if(el){${FIELD_FLASH_BODY}}
      }catch(e){}
    })()`);
  } catch { /* 纯视觉辅助，失败静默 */ }
}

function ensureYzReg() {
  const w = window as any;
  if (w.__yzReg) return w.__yzReg;
  w.__yzElements = w.__yzElements || [];
  w.__yzMeta = w.__yzMeta || {};
  const esc = (s: string) => String(s).replace(/"/g, '\\"');
  // 文本模糊匹配：:has-text / :contains 文本漂移时的二级降级（与桌面端同口径）
  const textNorm = (s: unknown) => String(s ?? '').replace(/\s+/g, '').trim();
  const textScore = (a: unknown, b: unknown): number => {
    const x = textNorm(a); const y = textNorm(b);
    if (!x || !y) return 0;
    if (x === y) return 3;
    if (x.includes(y) || y.includes(x)) return 2;
    const seen = new Set(x.split(''));
    let hit = 0;
    for (const ch of y) if (seen.has(ch)) hit++;
    return hit / Math.max(x.length, y.length) >= 0.7 ? 1 : 0;
  };
  const fuzzyFind = (meta: any): Element | null => {
    if (!meta) return null;
    const tag = meta.tag && /^[a-z0-9-]+$/i.test(meta.tag) ? meta.tag : '*';
    let els: Element[] = [];
    try { els = Array.from(document.querySelectorAll(tag)); } catch { return null; }
    let best: Element | null = null; let bestScore = 0;
    for (const el of els) {
      if ((el as any).offsetParent === null) continue;
      const score = Math.max(textScore(el.textContent, meta.text), textScore(el.getAttribute('aria-label'), meta.aria));
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 2 ? best : null;
  };
  const resolveFuzzy = (sel: string): Element[] => {
    const m = String(sel || '').match(/^([\s\S]*?)(?::contains|:has-text)\(\s*["']([\s\S]*?)["']\s*\)\s*$/);
    if (!m) return [];
    const base = m[1] || '*'; const target = m[2]; const out: Element[] = [];
    let els: Element[] = [];
    try { els = Array.from(document.querySelectorAll(base)); } catch { return []; }
    for (const el of els) {
      if ((el as any).offsetParent === null) continue;
      if (textScore(el.textContent, target) >= 2) out.push(el);
    }
    return out;
  };
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
      // 记录 index → 稳定 selector 快照，供 index 失效时自动降级重定位
      const sel = genSel(el);
      if (sel) { w.__yzSelMap = w.__yzSelMap || new Map(); try { w.__yzSelMap.set(i, sel); } catch { /* ignore */ } }
      // 文本/标签快照：选择器也失效时按「同标签 + 相似文本/aria」二级重定位
      try {
        w.__yzMeta[i] = {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 80),
          aria: (el.getAttribute && el.getAttribute('aria-label') || '').trim().slice(0, 80),
        };
      } catch { /* ignore */ }
      return i;
    },
    get(i: number) { return w.__yzElements[i]; },
    selOf(i: number) { return (w.__yzSelMap || new Map()).get(i); },
    metaOf(i: number) { return (w.__yzMeta || {})[i]; },
    fuzzyFind,
    resolveFuzzy,
    genSel,
  };
  return w.__yzReg;
}

// 变化检测：这些 action 可能改变页面状态，执行后对比前后快照
const CHANGE_ACTIONS = new Set(['click', 'type', 'press', 'select_option', 'check', 'uncheck', 'submit_form', 'search', 'next_page', 'prev_page']);
// ★★★ B7（2026-10-09）：由模块级单值改为**按 tab 分桶**。
//   单值会让"A 页面卡住"与"B 页面正常"互相污染（B 收到假告警 / A 的真告警被清零），
//   两个方向都错且不报错。按 tab 分桶是因为：① 语义上这是页面状态；
//   ② 服务端 `/action` **拿不到会话标识**（单活动页架构）；③ 两链路都能拿到 tabId。
const noChangeStreaks = new KeyedStreak({ threshold: 3 });
/** 统一 click/type 结果：补稳定 status，便于模型按同一套字段判断成败 */
function unifyActionStatus(result: any): any {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (result.status) return result;
  if (result.ambiguous) result.status = 'ambiguous';
  else if (result.error) {
    const msg = String(result.error);
    result.status = /已失效/.test(msg) ? 'stale_index'
      : /未找到/.test(msg) ? 'not_found'
        : /未提供定位/.test(msg) ? 'invalid_args'
          : 'error';
  } else if (result.success === false || result.applied === false) result.status = 'failed';
  else result.status = 'ok';
  return result;
}
const snapshotFn = () => { try { const d = document.body; return { url: location.href, t: (d ? d.innerText : '').slice(0, 2000), n: document.querySelectorAll('a,button,input,select,textarea').length }; } catch { return null; } };

router.post('/action', withBrowserLock(async (req: Request, res: Response) => {
  try {
    const args = req.body || {};
    const { action, text, key, x, y, timeout } = args;
    const selector = args.selector ? String(args.selector).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")') : args.selector;
    if (!action) { res.status(400).json({ error: 'action 为必填项' }); return; }
    let page = await withTimeout(getPage(), '获取浏览器页面超时（实例可能已假死，将自动重建，请重试）');
    // tabId 定向：在指定标签页上执行动作（不切换活动页），供"按 tabId 读取/操作"场景
    const reqTabId = args.tabId !== undefined && args.tabId !== null ? Number(args.tabId) : null;
    if (reqTabId !== null && tabs.has(reqTabId) && !tabs.get(reqTabId)?.isClosed?.()) {
      page = tabs.get(reqTabId);
    }
    let result: unknown = null;
    let _actionRetried = false;
    // ★ 工作目录随动作下发（2026-10-26）：下载监听器（attachPageListeners）拿不到 args，
    //   在每次动作入口记一份，供「导出/下载」触发时决定落盘目录（工作目录/downloads）。
    if (typeof args.__workspaceDir === 'string' && args.__workspaceDir.trim()) {
      lastAgentWorkspaceDir = args.__workspaceDir.trim();
    }

    // 变化检测：操作前采集页面快照
    let beforeState: any = null;
    if (CHANGE_ACTIONS.has(String(action))) {
      beforeState = await page.evaluate(snapshotFn).catch(() => null);
    }

    switch (action) {
      case 'click': {
        // 阶段二：优先用 ref (d1:e12) 定位，回退到 index
        const clickRef = args.ref ? String(args.ref) : null;
        if (clickRef || args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          await page.evaluate(ensureYzRefs);
          const pos = await page.evaluate((p: { ref: string | null; idx: number | null }) => {
            const R = (window as any).__yzReg;
            const Refs = (window as any).__yzRefs;
            let el: Element | null = null;
            let locator = '';
            let degraded = false;
            if (p.ref && Refs) {
              el = Refs.resolve(p.ref);
              locator = 'ref=' + p.ref;
            }
            if (!el && p.idx != null) {
              el = R.get(p.idx);
              locator = 'index=' + p.idx;
            }
            // 自动降级：ref/index 失效（SPA 重渲染导致元素对象被替换）时，用注册时记录的稳定 selector 重定位一次，
            // 避免智能体多一次 get_page_info 往返
            if ((!el || !el.isConnected) && p.idx != null) {
              const snap = R.selOf(p.idx);
              if (snap) {
                const found = document.querySelector(snap);
                if (found) { el = found as Element; locator = 'index=' + p.idx + '→selector=' + snap; degraded = true; }
              }
            }
            // 二级降级：选择器也失效时，按「同标签 + 相似文本/aria」模糊重定位（文本漂移兜底）
            if ((!el || !el.isConnected) && p.idx != null) {
              const meta = R.metaOf ? R.metaOf(p.idx) : null;
              const found = meta && R.fuzzyFind ? R.fuzzyFind(meta) : null;
              if (found) { el = found; locator = 'index=' + p.idx + '→fuzzy'; degraded = true; }
            }
            if (!el || !el.isConnected) return { error: `${locator} 已失效（页面已变化），请重新调用 get_page_info 获取最新 ref/index 列表` };
            // 原生 checkbox 护栏（与桌面端 runBrowserAction 同口径，2026-10-24）：逐个点既多花步数又容易漏勾，
            // 拒绝并把整页 checkbox 候选回传，逼模型改用一次 fill_form；同一目标拒满 2 次后放行，换页清零。
            // 自定义控件（role=checkbox/switch、组件库 class）不拦 —— 那些本来就只能点。
            const cbCustom = (n: Element): boolean => {
              const role = String(n.getAttribute('role') || '').toLowerCase();
              const cls = typeof (n as HTMLElement).className === 'string' ? (n as HTMLElement).className : '';
              return role === 'checkbox' || role === 'switch'
                || /(^|\s)(el-checkbox|ant-checkbox|n-checkbox|checkbox-wrapper|v-checkbox)/i.test(cls);
            };
            const isNativeCb = (n: Element | null): boolean =>
              !!n && n.tagName === 'INPUT' && String((n as HTMLInputElement).type).toLowerCase() === 'checkbox';
            if (isNativeCb(el) && !cbCustom(el)) {
              const key = locator || ('index=' + p.idx);
              const prev: any = (window as any).__yzCbGuard;
              const state = (!prev || prev.url !== location.href) ? { url: location.href, counts: {} as Record<string, number> } : prev;
              const seen = state.counts[key] || 0;
              if (seen < 2) {
                state.counts[key] = seen + 1;
                (window as any).__yzCbGuard = state;
                const labelOf = (n: Element): string => {
                  const al = n.getAttribute('aria-label');
                  if (al && al.trim()) return al.trim().slice(0, 40);
                  const id = (n as HTMLElement).id;
                  if (id) { const lb = document.querySelector('label[for="' + id + '"]'); if (lb) return (lb.textContent || '').trim().slice(0, 40); }
                  const wrapped = n.closest('label');
                  if (wrapped) return (wrapped.textContent || '').trim().slice(0, 40);
                  const nm = n.getAttribute('name');
                  return nm ? nm.slice(0, 40) : '(无标签)';
                };
                const reg: any[] = (window as any).__yzElements || [];
                const candidates: any[] = [];
                for (let i = 0; i < reg.length && candidates.length < 40; i++) {
                  const n = reg[i];
                  if (!isNativeCb(n) || !n.isConnected || cbCustom(n)) continue;
                  candidates.push({ index: i, label: labelOf(n), checked: !!(n as HTMLInputElement).checked });
                }
                return { rejected: true, status: 'rejected', reason: 'native_checkbox',
                  error: '已拒绝点击「' + key + '」处的原生 checkbox：逐个点既多花步数又容易漏勾。',
                  hint: '改用 browser_fill_form 一次勾选：fields 传 [{index,value:"true"}]；两个以上要勾的 checkbox 请放进同一次调用（取消勾选传 "false"）。',
                  candidates };
              }
            }
            el.scrollIntoView({ block: 'center' });
            const rect = el.getBoundingClientRect();
            if (el.ownerDocument === document) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, degraded };
            // iframe 内元素：坐标相对 iframe 视口，直接派发 DOM 事件
            const o = { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, view: el.ownerDocument.defaultView };
            el.dispatchEvent(new MouseEvent('mousedown', o));
            el.dispatchEvent(new MouseEvent('mouseup', o));
            el.dispatchEvent(new MouseEvent('click', o));
            return { via: 'dom-events', iframe: true, degraded };
          }, { ref: clickRef, idx: args.index != null ? Number(args.index) : null });
          if ((pos as any)?.error) {
            result = pos;
          } else if ((pos as any)?.x !== undefined) {
            await page.mouse.click((pos as any).x, (pos as any).y);
            result = { success: true, index: args.index, via: 'real-mouse', autoRelocated: !!(pos as any).degraded };
          } else {
            result = { success: true, index: args.index, via: 'dom-events', iframe: true, autoRelocated: !!(pos as any).degraded };
          }
          break;
        }
        // 空参兜底：ref/index/selector/坐标一个都没传 → 引导性报错（此前静默返回 {clicked:true}，什么都没点）
        if (!selector && x === undefined && y === undefined) {
          result = {
            error: '未提供定位参数（index / selector / x+y）',
            hint: '请先调用 get_page_info 或 get_page_content 获取带编号的可交互元素列表，再以 { "index": <编号> } 重新调用 click；不要传空参数。',
          };
          break;
        }
        // 真实鼠标点击：先 move 再 click
        if (selector) {
          // 多匹配歧义检测：返回带编号的候选列表
          const count = await page.locator(selector).count().catch(() => -1);
          if (count === 0) {
            // 二级降级：文本漂移（:has-text 原文本对不上）时按同标签+相似文本重定位
            await page.evaluate(ensureYzReg);
            const fuzzy = await page.evaluate((sel: string) => {
              const R = (window as any).__yzReg;
              const els = R.resolveFuzzy ? R.resolveFuzzy(sel) : [];
              if (!els.length) return null;
              const el = els[0];
              el.scrollIntoView({ block: 'center' });
              const r = el.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent || '').trim().slice(0, 40) };
            }, String(args.selector)).catch(() => null);
            if (fuzzy) {
              await page.mouse.click((fuzzy as any).x, (fuzzy as any).y);
              result = { success: true, via: 'fuzzy-text', autoRelocated: 'fuzzy-text', matchedText: (fuzzy as any).text };
              break;
            }
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
        const typeRef = args.ref ? String(args.ref) : null;
        if (typeRef || args.index !== undefined && args.index !== null) {
          await page.evaluate(ensureYzReg);
          await page.evaluate(ensureYzRefs);
          const r = await page.evaluate((p: { ref: string | null; idx: number | null; text: string }) => {
            const R = (window as any).__yzReg;
            const Refs = (window as any).__yzRefs;
            let el: any = null;
            let locator = '';
            if (p.ref && Refs) { el = Refs.resolve(p.ref) as any; locator = 'ref=' + p.ref; }
            if (!el && p.idx != null) { el = R.get(p.idx); locator = 'index=' + p.idx; }
            // 自动降级：ref/index 失效时用注册时的 selector 快照重定位一次
            if ((!el || !el.isConnected) && p.idx != null) {
              const snap = R.selOf(p.idx);
              if (snap) {
                const found = document.querySelector(snap);
                if (found) { el = found as any; locator = 'index=' + p.idx + '→selector=' + snap; }
              }
            }
            // 二级降级：选择器也失效时，按「同标签 + 相似文本/aria」模糊重定位
            if ((!el || !el.isConnected) && p.idx != null) {
              const meta = R.metaOf ? R.metaOf(p.idx) : null;
              const found = meta && R.fuzzyFind ? R.fuzzyFind(meta) : null;
              if (found) { el = found as any; locator = 'index=' + p.idx + '→fuzzy'; }
            }
            if (!el || !el.isConnected) return { error: `${locator} 已失效（页面已变化），请重新调用 get_page_info 获取最新 ref/index 列表` };
            el.scrollIntoView({ block: 'center' });
            el.focus();
            // ★ 受控组件兼容：React/Vue 覆盖了实例 value setter，直接 el.value= 不触发 onChange；
            // 必须用原型上的原生 setter 写入再派发 input 事件。
            const isCE = el.isContentEditable === true;
            const set = (!isCE && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
              ? Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set ?? null
              : null;
            const put = (v: string) => {
              if (set) (set as (val: string) => void).call(el, v);
              else if (isCE) el.textContent = v;
              else el.value = v;
            };
            put('');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            let acc = '';
            for (const ch of p.text) {
              acc += ch;
              put(acc);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const got = (!isCE && el.value != null) ? String(el.value) : (el.textContent || '');
            // ★★★ 2026-10-14：判据由**严格相等**放宽（与桌面端 main.cjs 的 looseTextEqual 对齐）。
            //   此前 `got === p.text`，而页面只要对文本做了规整（trim / 折叠空白 / 换行规范化 /
            //   maxlength 截断 / 站点格式化），回读值就 ≠ 期望值 ⇒ 误判 applied:false ⇒
            //   提示语诱导模型"核验并重填" ⇒ **同一字段被反复填**（用户实报"填好了又重填"）。
            //   而文本其实早已进入输入框。桌面端已修、服务端这条是漏改（同一语义两处判定漂移）。
            //   判据：规范化空白后，二者任一**包含**对方即视为已填入；`normalized:true` 表示
            //   "不是逐字相等但判定已填入"，调用方据此回中性文案、不再诱导重填。
            const normTxt = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
            const ng = normTxt(got);
            const ne = normTxt(p.text);
            const exact = got === p.text;
            const applied = exact || (ng.length > 0 && ne.length > 0 && (ng.includes(ne) || ne.includes(ng)));
            const out: Record<string, unknown> = {
              success: applied, index: p.idx, typed: p.text.length, applied,
              ...(applied && !exact ? { normalized: true } : {}),
              value: got.slice(0, 120),
            };
            if (!applied) out.hint = '输入框未接受文本（可能为受控组件且拦截了程序化输入，或输入被页面重置）。请用 browser_get_page_content 核验该字段当前值，**不要盲目重复填写**。';
            return out;
          }, { ref: typeRef, idx: args.index != null ? Number(args.index) : null, text: String(text || '') });
          if (args.pressEnter && !(r as any)?.error) {
            // 按 index 定位时页面焦点已在目标输入框，真实键盘 Enter 即提交
            await page.keyboard.press('Enter').catch(() => {});
            (r as any).entered = true;
          }
          // ★ P2 聚焦高亮：type 成功后按 ref/index 解析链补画蓝框 + 值角标（与桌面端 CDP 路径同构）
          if ((r as any)?.applied) {
            void flashFieldOnPage(page, { ref: typeRef, index: args.index != null ? Number(args.index) : null }, String(text || ''));
          }
          result = r;
          break;
        }
        // 真实键盘输入：逐字符 type
        if (selector) {
          const count = await page.locator(selector).count().catch(() => -1);
          if (count === 0) {
            // 二级降级：文本漂移时按同标签+相似文本重定位，再聚焦输入
            await page.evaluate(ensureYzReg);
            const fuzzy = await page.evaluate((sel: string) => {
              const R = (window as any).__yzReg;
              const els = R.resolveFuzzy ? R.resolveFuzzy(sel) : [];
              if (!els.length) return null;
              const el = els[0];
              el.scrollIntoView({ block: 'center' });
              const r = el.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent || '').trim().slice(0, 40) };
            }, String(args.selector)).catch(() => null);
            if (!fuzzy) {
              result = { error: `元素未找到: ${args.selector}`, hint: '建议先调用 get_page_info 获取编号元素列表，再用 index 参数定位' };
              break;
            }
            await page.mouse.click((fuzzy as any).x, (fuzzy as any).y);
            await page.keyboard.type(text || '', { delay: 30 });
            // ★ P2 聚焦高亮：模糊重定位路径也补一刀（按 ref 链拿不到，这里用原始 selector 尽力定位）
            void flashFieldBySelector(page, String(args.selector || ''), String(text || ''));
            const fuzzyOut: Record<string, unknown> = {
              typed: text?.length || 0, via: 'fuzzy-text',
              autoRelocated: 'fuzzy-text', matchedText: (fuzzy as any).text,
            };
            if (args.pressEnter) { await page.keyboard.press('Enter'); fuzzyOut.entered = true; }
            result = fuzzyOut;
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
        // ★ P2 聚焦高亮：selector 路径补画（同 fill_form，用原始 selector 尽力定位）
        void flashFieldBySelector(page, String(args.selector || ''), String(text || ''));
        const out: Record<string, unknown> = { typed: text?.length || 0 };
        if (args.pressEnter) { await page.keyboard.press('Enter'); out.entered = true; }
        result = out;
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
        if (args.annotate) {
          // 元素标注截图：注入覆盖层给每个可交互元素画编号框，截图后移除（豆包/WorkBuddy 级视觉辅助）
          await page.evaluate(ensureYzReg);
          const overlayId = '__yz_annotate_overlay';
          await page.evaluate((oid: string) => {
            const prev = document.getElementById(oid); if (prev) prev.remove();
            const R = (window as any).__yzReg;
            const S = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],[tabindex]';
            const ov = document.createElement('div');
            ov.id = oid;
            ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
            const visible = (el: any) => { const r = el.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 && r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth; };
            const paint = (root: any) => {
              let found: any[] = [];
              try { found = Array.from(root.querySelectorAll(S)); } catch { return; }
              for (const el of found) {
                if (!visible(el)) continue;
                const idx = R.register(el);
                const r = el.getBoundingClientRect();
                const b = document.createElement('div');
                b.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px solid #f97316;box-sizing:border-box;`;
                const tag = document.createElement('span');
                tag.textContent = String(idx);
                tag.style.cssText = `position:fixed;left:${r.left}px;top:${Math.max(0, r.top - 18)}px;background:#f97316;color:#fff;font:bold 12px/16px sans-serif;padding:0 5px;border-radius:2px;`;
                ov.appendChild(b); ov.appendChild(tag);
              }
              if ((root as any).shadowRoot) paint((root as any).shadowRoot);
              let all: any[] = [];
              try { all = Array.from(root.querySelectorAll('*')); } catch { return; }
              for (const n of all) if (n.tagName === 'IFRAME') { try { const cd = n.contentDocument; if (cd) paint(cd.body); } catch {} }
            };
            paint(document.documentElement);
            document.documentElement.appendChild(ov);
          }, overlayId);
          try {
            const buf = await page.screenshot({ fullPage: false });
            result = { base64: buf.toString('base64'), annotated: true };
          } finally {
            await page.evaluate((oid: string) => { const p = document.getElementById(oid); if (p) p.remove(); }, overlayId).catch(() => {});
          }
        } else {
          // fullPage=true 截整页长图（Playwright 滚动拼接，与窗口/面板是否显示完整无关）；默认只截视口
          const fullPage = !!args.fullPage;
          const buf = await page.screenshot({ fullPage });
          result = { base64: buf.toString('base64'), ...(fullPage ? { fullPage: true } : {}) };
        }
        break;
      }
      case 'fill_form': {
        const fields = Array.isArray(args.fields) ? args.fields : [];
        const filled: string[] = [];
        // ★ B3（2026-10-10）：逐字段失败原因（与桌面端同结构）。
        //   此前 `locator` 抛错会让整批 fill_form 直接失败（前面已填的也白填、且无部分结果），
        //   而 Desktop 侧是静默跳过 —— 两条链路「部分成功」的语义不一致。
        //   ⇒ 统一为「尽力填 + 明确报告失败项」：单个字段失败不中断其余字段。
        const failed: Array<{ selector: string; reason: string }> = [];
        // ★ P1-2（2026-10-24）：失败分档。deferred = 上游未就绪（级联下拉的选项还没出现），
        //   skipped = fill_form 根本不支持这个控件。两者混进 failed 会诱导模型原样重试。
        const deferred: Array<{ selector: string; reason: string; hint: string }> = [];
        const skipped: Array<{ selector: string; reason: string; hint: string }> = [];
        // ★ P2-1（2026-10-24）观察内联：逐字段回读，和桌面端同结构（此前服务端不返回 state，
        //   工具层拿不到回读值，模型只能再读一次页面核对）。
        const state: Array<{ selector: string; value: string }> = [];
        const toPw = (s: string) => String(s).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")');
        for (const f of fields) {
          const sel = toPw(f.selector);
          if (!sel) { failed.push({ selector: String(f?.selector || ''), reason: '缺少 selector' }); continue; }
          const ftype = String(f.type || 'text').toLowerCase();
          try {
            if (ftype === 'select') {
              const opt = f.label !== undefined ? { label: String(f.label) } : String(f.value ?? '');
              await page.locator(sel).selectOption(opt as any);
            } else if (ftype === 'checkbox' || ftype === 'radio') {
              if (f.value === false || f.value === 'false') await page.locator(sel).uncheck();
              else await page.locator(sel).check();
            } else {
              await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
              await page.locator(sel).fill(String(f.value ?? ''));
            }
            filled.push(sel);
            // ★ P2-1 回读：填完立刻取值，回执里带上，省掉"填完再读页核对"这一轮
            try {
              const loc = page.locator(sel).first();
              let v = '';
              if (ftype === 'checkbox' || ftype === 'radio') {
                v = (await loc.isChecked()) ? 'true' : 'false';
              } else if (ftype === 'select') {
                v = String(await loc.evaluate((el: any) =>
                  (el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].textContent) || el.value || ''));
              } else {
                v = String(await loc.inputValue().catch(() =>
                  loc.evaluate((el: any) => String(el.innerText || el.value || ''))));
              }
              state.push({ selector: sel, value: v.slice(0, 60) });
            } catch { /* 回读失败不改变"已填"的结论 */ }
            // ★ P2 聚焦高亮（Web 端与桌面端同款）：本字段画蓝框 + 值角标。
            //   用**原始 selector**（toPw 的 :has-text 是 Playwright 方言，querySelector 不认；
            //   解析不到就静默跳过）。
            void flashFieldBySelector(page, String(f?.selector || ''),
              ftype === 'checkbox' || ftype === 'radio'
                ? (f.value === false || f.value === 'false' ? '✗' : '✓')
                : (f.label !== undefined ? String(f.label) : String(f.value ?? '')));
          } catch (e: any) {
            const msg = e?.message ? String(e.message).slice(0, 160) : '填写失败';
            const b = classifyFillFailure(ftype, msg);
            if (b === 'failed') failed.push({ selector: sel, reason: msg });
            else if (b === 'deferred') deferred.push({ selector: sel, reason: msg, hint: '可能上游字段未选或选项异步加载：先填上游，再回头补这一项；不要原样重试' });
            else skipped.push({ selector: sel, reason: msg, hint: '不是原生下拉（自定义/组件库控件）：用 click 展开后按 index 选一项' });
          }
        }
        // ★ P1-3（2026-10-24）熔断：同页连续 2 次"有字段真失败"→ 回执里明确降级；
        //   deferred/skipped 不计入（那是用户在等上游，不是 fill_form 出了问题）；换页自动清零。
        const strikes = await page.evaluate((hadFail: boolean) => {
          const w = window as any;
          const prev = w.__yzFillDegrade;
          const st = (!prev || prev.url !== location.href) ? { url: location.href, strikes: 0 } : prev;
          st.strikes = hadFail ? (st.strikes || 0) + 1 : 0;
          w.__yzFillDegrade = st;
          return st.strikes;
        }, failed.length > 0).catch(() => 0);
        const degraded = strikes >= 2;
        result = {
          filled: filled.length, fields: filled, failed, deferred, skipped, state,
          degraded,
          degradeNote: degraded
            ? '批量填表在本页已连续 2 次出现字段失败，已降级：改用 click / type 单步操作，或先 get_page_content 重新获取元素编号后再试一次；不要用同一批参数重复调用 fill_form。'
            : undefined,
        };
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
        // ★ P2-1（2026-10-24）观察内联：提交后立刻回一段页面判定，省掉"提交→再读页确认"这一轮。
        //   只是证据不是结论；整页导航时 evaluate 会失败，按 null 处理，不影响已完成的提交。
        await page.waitForTimeout(600).catch(() => {});
        const verdict = await page.evaluate(() => {
          const body = String(document.body?.innerText || '');
          const SUCCESS = ['保存成功', '提交成功', '发布成功', '操作成功', '添加成功', '创建成功'];
          const INVALID = ['请填写', '请选择', '必填', '不能为空', '格式不正确', '保存失败', '提交失败', '校验失败', '请输入'];
          const hit = (list: string[]) => list.find((t) => body.includes(t)) || '';
          let inputs = 0;
          try { inputs = document.querySelectorAll('input:not([type=hidden]),textarea,select').length; } catch { /* ignore */ }
          let forms = 0;
          try {
            for (const f of Array.from(document.querySelectorAll('form'))) {
              if ((f as HTMLElement).offsetParent !== null) forms++;
            }
          } catch { /* ignore */ }
          return { validText: hit(INVALID), successText: hit(SUCCESS), inputs, forms, url: location.href };
        }).catch(() => null);
        result = { submitted: true, url: page.url(), title: await page.title().catch(() => ''), verdict };
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
        await page.evaluate(ensureYzRefs);
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
          const Refs = (window as any).__yzRefs;
          for (let k = 0; k < els.length && out.length < 300; k++) {
            const el = els[k] as any;
            const idx = R.register(el);
            const ref = Refs ? Refs.register(el) : String(idx);
            const o: any = { index: idx, ref, tag: el.tagName.toLowerCase(), selector: R.genSel(el), text: (el.textContent || '').trim().slice(0, 60) };
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
          return { url: location.href, title: document.title, interactiveCount: els.length, interactive: out, hint: '可交互元素已编号（index 字段）并带屏幕坐标 x/y/w/h，browser_click / browser_type 可用 index 参数定位，也可用 selector 或 x+y 坐标' };
        });
        break;
      }
      // ========== 阶段二：observe-act-observe 组合工具 ==========
      case 'action_and_observe': {
        // 执行一个子动作后自动返回最新页面状态（减少智能体往返调用）
        const subAction = args.sub_action;
        if (!subAction) { result = { error: 'sub_action 为必填项' }; break; }
        // 构造子动作参数
        const subArgs = { ...args, action: subAction };
        delete subArgs.sub_action;
        // 递归执行子动作（通过内部函数避免 HTTP 往返）
        const subReq = { body: subArgs } as Request;
        const subRes = { json: (d: any) => { result = d?.data ?? d; }, status: () => subRes } as any;
        // 直接复用 action 处理逻辑（简化：手动执行关键子动作）
        if (subAction === 'click' && (subArgs.ref || subArgs.index != null)) {
          await page.evaluate(ensureYzReg);
          await page.evaluate(ensureYzRefs);
          const pos = await page.evaluate((p: { ref: string | null; idx: number | null }) => {
            const R = (window as any).__yzReg;
            const Refs = (window as any).__yzRefs;
            let el: Element | null = null;
            if (p.ref && Refs) el = Refs.resolve(p.ref);
            if (!el && p.idx != null) el = R.get(p.idx);
            if (!el || !el.isConnected) return { error: '元素已失效' };
            el.scrollIntoView({ block: 'center' });
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }, { ref: subArgs.ref ? String(subArgs.ref) : null, idx: subArgs.index != null ? Number(subArgs.index) : null });
          if ((pos as any)?.x !== undefined) {
            await page.mouse.click((pos as any).x, (pos as any).y);
          }
        } else if (subAction === 'type' && (subArgs.ref || subArgs.index != null)) {
          await page.evaluate(ensureYzReg);
          await page.evaluate(ensureYzRefs);
          await page.evaluate((p: { ref: string | null; idx: number | null; text: string }) => {
            const R = (window as any).__yzReg;
            const Refs = (window as any).__yzRefs;
            let el: any = null;
            if (p.ref && Refs) el = Refs.resolve(p.ref) as any;
            if (!el && p.idx != null) el = R.get(p.idx) as any;
            if (!el || !el.isConnected) return { error: '元素已失效' };
            el.focus();
            for (const ch of p.text) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
          }, { ref: subArgs.ref ? String(subArgs.ref) : null, idx: subArgs.index != null ? Number(subArgs.index) : null, text: String(subArgs.text || '') });
        } else if (subAction === 'press') {
          await page.keyboard.press(subArgs.key || 'Enter');
        } else if (subAction === 'wait') {
          await page.waitForTimeout(Math.min(subArgs.timeout || 1000, 10000));
        }
        // 等待页面稳定后自动返回最新状态
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        await page.evaluate(ensureYzReg);
        await page.evaluate(ensureYzRefs);
        const pageInfo = await page.evaluate(() => {
          const R = (window as any).__yzReg;
          const Refs = (window as any).__yzRefs;
          const S = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          const els: Element[] = [];
          const visible = (el: any) => {
            if (el.disabled === true) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return false;
            if (el.offsetParent === null) {
              try { const st = el.ownerDocument.defaultView.getComputedStyle(el).position; if (st !== 'fixed' && st !== 'sticky') return false; } catch { return false; }
            }
            return true;
          };
          const collect = (root: any) => {
            try { const found = root.querySelectorAll(S) as NodeListOf<Element>; for (const el of Array.from(found)) { if (visible(el)) els.push(el); } } catch {}
            try { const all = root.querySelectorAll('*') as NodeListOf<Element>; for (const n of Array.from(all)) {
              if ((n as any).shadowRoot) collect((n as any).shadowRoot);
              if (n.tagName === 'IFRAME' || n.tagName === 'FRAME') { try { const cd = (n as any).contentDocument; if (cd && cd.body) collect(cd.body); } catch {} }
            }} catch {}
          };
          collect(document.documentElement);
          const out: any[] = [];
          for (let k = 0; k < els.length && out.length < 100; k++) {
            const el = els[k] as any;
            out.push({ index: R.register(el), ref: Refs ? Refs.register(el) : '', tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 50) });
          }
          return { url: location.href, title: document.title, interactiveCount: els.length, interactive: out };
        }).catch(() => ({ url: page.url(), title: '', interactiveCount: 0, interactive: [] }));
        recordPageState(pageInfo.url, pageInfo.title);
        result = { action: subAction, pageInfo };
        break;
      }

      // ========== 聚合读页：title + url + 可见正文 + 可交互元素一次返回（与桌面端 IPC 对齐） ==========
      case 'get_page_content': {
        const maxText = Math.min(Number(args.maxTextLength) || 5000, 20000);
        const maxInteractive = Math.min(Number(args.maxInteractive) || 50, 300);
        await page.evaluate(ensureYzReg);
        await page.evaluate(ensureYzRefs);
        result = await page.evaluate((a: { maxText: number; maxInteractive: number }) => {
          const R = (window as any).__yzReg;
          const Refs = (window as any).__yzRefs;
          const visibleText = (el: Element): string => {
            let s = '';
            for (const n of Array.from(el.childNodes)) {
              if (n.nodeType === 3) { const t = (n.textContent || '').trim(); if (t) s += t + ' '; }
              else if (n.nodeType === 1) {
                const st = getComputedStyle(n as Element);
                if (st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0') s += visibleText(n as Element);
              }
            }
            return s;
          };
          const S = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          const els: Element[] = [];
          const visible = (el: any) => {
            if (el.disabled === true) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return false;
            if (el.offsetParent === null) {
              try { const st = el.ownerDocument.defaultView.getComputedStyle(el).position; if (st !== 'fixed' && st !== 'sticky') return false; } catch { return false; }
            }
            return true;
          };
          const collect = (root: any) => {
            try { const found = root.querySelectorAll(S) as NodeListOf<Element>; for (const el of Array.from(found)) { if (visible(el)) els.push(el); } } catch {}
            try { const all = root.querySelectorAll('*') as NodeListOf<Element>; for (const n of Array.from(all)) {
              if ((n as any).shadowRoot) collect((n as any).shadowRoot);
              if (n.tagName === 'IFRAME' || n.tagName === 'FRAME') { try { const cd = (n as any).contentDocument; if (cd && cd.body) collect(cd.body); } catch { /* 跨域跳过 */ } }
            }} catch {}
          };
          collect(document.documentElement);
          const out: any[] = [];
          for (let k = 0; k < els.length && out.length < a.maxInteractive; k++) {
            const el = els[k] as any;
            const idx = R.register(el);
            const o: any = { index: idx, ref: Refs ? Refs.register(el) : '', tag: el.tagName.toLowerCase(), selector: R.genSel(el), text: (el.textContent || '').trim().slice(0, 60) };
            // P1-7 a11y 语义（2026-10-07）：优先 computedRole（浏览器计算的 ARIA 角色，Chromium 132+）；
            // 引擎不支持时按「标签 + type」推断隐式角色（ARIA in HTML 的常用子集）。
            // 'generic'/null 无信息量跳过。两路都拿不到就不出 axRole 字段。
            try { const cr = (el as any).computedRole; if (cr && cr !== 'generic') o.axRole = cr; } catch { /* 引擎不支持 */ }
            if (!o.axRole) {
              try {
                const t = el.tagName; const ty = String(el.type || '').toLowerCase();
                let role: string | null = null;
                if (t === 'A' && el.hasAttribute('href')) role = 'link';
                else if (t === 'BUTTON' || (t === 'INPUT' && /^(button|submit|reset|image)$/.test(ty))) role = 'button';
                else if (t === 'INPUT') {
                  if (ty === 'checkbox') role = 'checkbox';
                  else if (ty === 'radio') role = 'radio';
                  else if (ty === 'range') role = 'slider';
                  else if (ty === 'number') role = 'spinbutton';
                  else role = 'textbox';
                }
                else if (t === 'TEXTAREA') role = 'textbox';
                else if (t === 'SELECT') role = 'combobox';
                else if (t === 'OPTION') role = 'option';
                else if (t === 'SUMMARY') role = 'button';
                else if (t === 'PROGRESS') role = 'progressbar';
                else if (t === 'METER') role = 'meter';
                else if (el.isContentEditable) role = 'textbox';
                if (role) o.axRole = role;
              } catch { /* 防御 */ }
            }
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
          // ── 表单语义段（2026-10-13）：与桌面链路同口径（见 main.cjs 同名分支）。
          //   回答"表单现在是什么状态"（字段名/类型/必填/当前值）—— 这是模型判断
          //   "我填的到底生效没有"的判据；只有可交互元素平铺清单时它会误判并重复填写。
          const FSEL = 'input,textarea,select,[contenteditable="true"]';
          const fel: any[] = [];
          const collectFields = (root: any) => {
            try { for (const el of Array.from(root.querySelectorAll(FSEL)) as any[]) {
              try { if (el.type === 'hidden' || el.disabled) continue; } catch {}
              const r = el.getBoundingClientRect();
              if (!el.isContentEditable && r.width < 2 && r.height < 2) continue;   // 富文本容器可 0 尺寸
              fel.push(el);
            } } catch {}
            try { for (const n of Array.from(root.querySelectorAll('*')) as any[]) {
              if (n.shadowRoot) collectFields(n.shadowRoot);
              if (n.tagName === 'IFRAME' || n.tagName === 'FRAME') { try { const cd = n.contentDocument; if (cd && cd.body) collectFields(cd.body); } catch {} }
            } } catch {}
          };
          collectFields(document.documentElement);
          const fieldLabel = (el: any): string => {
            let lb = '';
            try { if (el.placeholder) lb = el.placeholder; } catch {}
            if (!lb) { try { const al = el.getAttribute && el.getAttribute('aria-label'); if (al) lb = al; } catch {} }
            if (!lb && el.id) { try { const lf = document.querySelector('label[for="' + el.id + '"]'); if (lf) lb = (lf.textContent || '').trim(); } catch {} }
            if (!lb) { try { const lp = el.closest && el.closest('label'); if (lp) lb = (lp.textContent || '').trim(); } catch {} }
            return String(lb || '').replace(/[\s ]+/g, ' ').trim().slice(0, 30);
          };
          const fieldValue = (el: any): string => {
            try {
              if (el.tagName === 'SELECT') { const o = el.options[el.selectedIndex]; return o ? String(o.textContent || '').trim() : ''; }
              if (el.isContentEditable) return String(el.innerText || '').trim();
              if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '(已选)' : '(未选)';
              return String(el.value == null ? '' : el.value);
            } catch { return ''; }
          };
          const formFields: any[] = [];
          for (const fe of fel) {
            if (formFields.length >= 40) break;
            const fv = fieldValue(fe);
            const ml = (fe.maxLength && fe.maxLength > 0) ? fe.maxLength : 0;
            const o2: any = {
              index: R.register(fe), selector: R.genSel(fe), label: fieldLabel(fe),
              kind: fe.isContentEditable ? 'richtext' : (fe.tagName === 'SELECT' ? 'select' : (fe.type || 'text')),
              value: fv.slice(0, 80), valueLen: fv.length,
              required: !!(fe.required || (fe.getAttribute && fe.getAttribute('aria-required') === 'true')),
            };
            if (ml) o2.maxLength = ml;
            formFields.push(o2);
          }
          return {
            url: location.href,
            title: document.title,
            text: visibleText(document.body).trim().slice(0, a.maxText),
            interactiveCount: els.length,
            interactive: out,
            formFields,
            hint: '可交互元素已编号（index 字段），browser_click / browser_type 可直接用 index 参数定位',
          };
        }, { maxText, maxInteractive }).catch(() => ({ url: page.url(), title: '', text: '', interactiveCount: 0, interactive: [], formFields: [] }));
        // 表单变化差异（与桌面链路同口径）：按"会话+页面"留快照算值级 diff。
        // ★ 服务端这条链路没有 tabId 概念（pageInstance 单页），故用 url 作快照键。
        try {
          const rAny: any = result;
          rAny.formChanges = diffFormSnapshot(`srv:${rAny.url || page.url()}`, rAny.url || '', rAny.formFields);
        } catch { /* 差异计算失败不影响读页 */ }
        recordPageState((result as any).url, (result as any).title);
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
        if (p.isClosed?.()) { tabs.delete(tid); noChangeStreaks.forget(String(tid)); result = { error: `tabId ${tid} 已关闭` }; break; }
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
        // ★ B7：tab 关闭 → 删掉它的 streak 桶（否则"tabId 复用"会继承旧计数）
        noChangeStreaks.forget(String(tid));
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
        // filechooser 模式（2026-10-07）：点「上传」按钮 → 拦截文件选择器 → 投递本地文件。
        // 适用按钮不暴露裸 input[type=file] 的站点（抖音创作者平台等，点按钮才动态创建 input）。
        if (args.clickSelector || args.clickIndex !== undefined || args.clickX !== undefined) {
          try {
            const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
            let clickSel: string | null = null;
            if (args.clickSelector) {
              clickSel = String(args.clickSelector).replace(/:contains\(\s*["']([\s\S]*?)["']\s*\)/g, ':has-text("$1")');
            } else if (args.clickIndex !== undefined && args.clickIndex !== null) {
              await page.evaluate(ensureYzReg);
              clickSel = await page.evaluate((idx: number) => {
                const R = (window as any).__yzReg;
                const el = R.get(idx);
                if (!el || !el.isConnected) return null;
                el.setAttribute('data-yz-click-once', '1');
                return '[data-yz-click-once="1"]';
              }, Number(args.clickIndex));
              if (!clickSel) { result = { error: `clickIndex ${args.clickIndex} 已失效` }; break; }
            }
            const clickPromise = clickSel
              ? page.locator(clickSel).click({ timeout: 10000 })
              : page.mouse.click(Number(args.clickX), Number(args.clickY));
            const chooser = await chooserPromise;
            await clickPromise.catch(() => {});
            await chooser.setFiles([fp]);
            result = { uploaded: true, via: 'filechooser', filePath: fp };
          } catch (e: any) {
            result = { error: `filechooser 模式失败: ${e?.message || e}` };
          }
          break;
        }
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
        // 保存统一由 attachPageListeners 的 download 监听完成（唯一实现，避免两处 saveAs 抢同一文件）；
        // 这里只负责触发 + 等记录。显式 savePath 通过 pendingDownloadSavePath 覆盖。
        const since = Date.now();
        const explicit = args.savePath ? String(args.savePath).trim() : '';
        pendingDownloadSavePath = explicit
          ? (path.isAbsolute(explicit) ? explicit : path.join(downloadBaseDir(), explicit))
          : '';
        try {
          if (args.url) {
            await page.goto(String(args.url), { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
          } else if (selector) {
            await page.locator(selector).click().catch(() => {});
          } else if (args.index !== undefined && args.index !== null) {
            await page.evaluate(ensureYzReg);
            await page.evaluate((idx: number) => {
              const R = (window as any).__yzReg;
              const el = R.get(idx);
              if (el) el.click();
            }, Number(args.index)).catch(() => {});
          } else {
            result = { error: 'download 需要 url / selector / index 之一（都不传请改用 downloads 查询最近下载）' };
            break;
          }
          const rec = await waitForDownloadRecord(since, 15000);
          if (!rec) { result = { error: '未触发下载（超时）' }; break; }
          if (rec.state === 'failed') { result = { error: '下载保存失败', filename: rec.filename }; break; }
          result = { filename: rec.filename, savedPath: rec.savedPath, url: rec.url, bytes: rec.bytes };
        } finally {
          pendingDownloadSavePath = '';
        }
        break;
      }
      // ========== C11b 最近下载查询 ==========
      case 'downloads': {
        const n = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
        result = {
          dir: downloadBaseDir(),
          records: downloadRecords.slice(0, n).map((r) => ({
            filename: r.filename,
            savedPath: r.savedPath,
            state: r.state || 'completed',
            bytes: r.bytes,
            time: r.time,
          })),
        };
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
      // ========== P1-5 代码模式（2026-10-07）：页面上下文执行受限 JS（Astra/Stagehand 式） ==========
      case 'run_script': {
        let script = String(args.script || '');
        if (!script.trim()) { result = { error: 'script is required' }; break; }
        if (script.length > 64000) { result = { error: 'script too long (max 64000 chars)' }; break; }
        // ★ 顶层 return 容错（2026-10-07，与桌面端 main.cjs 同步）：模型常写裸 return 的脚本，
        //   直接 evaluate 会抛 SyntaxError，模型只看到 "Script failed to execute" 无法自纠。
        //   检测到顶层 return 且未包成函数/IIFE 就自动包一层。
        const _stripCode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        const _bare = _stripCode(script);
        const _alreadyWrapped = /^\s*(\(|async\s*\(|function\b|async\s+function\b)/.test(_bare)
          || /^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?(\(|function\b)/.test(_bare);
        let _autoWrapped = false;
        if (!_alreadyWrapped && /\breturn\b/.test(_bare)) {
          script = `() => { ${script}\n}`;
          _autoWrapped = true;
        }
        try {
          const evalRes = await Promise.race([
            page.evaluate(script) as Promise<any>,
            new Promise((_, rej) => setTimeout(() => rej(new Error('script 执行超时（30s）')), 30000)),
          ]);
          result = { url: page.url(), title: await page.title().catch(() => ''), result: evalRes === undefined ? null : evalRes, ...(_autoWrapped ? { autoWrapped: true } : {}) };
        } catch (e: any) {
          result = {
            error: e?.message || String(e),
            hint: _autoWrapped
              ? '脚本已自动包裹为函数执行。若仍失败请检查语法；要返回数据直接 return 即可（已在包裹函数内）。'
              : '执行失败。若脚本含顶层 return，请包成 (() => { ... })() 或改写为表达式。',
          };
        }
        break;
      }
      case 'highlight': {
        // 常驻元素编号高亮（2026-10-20）：与桌面端 main.cjs 的 runHighlight 同语义，两处保持一致。
        const wantOn = args.on !== false;
        await page.evaluate(ensureYzReg);
        const overlayId = '__yz_highlight_overlay';
        const S = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],[tabindex]';
        result = await page.evaluate((opts: { overlayId: string; S: string; off: boolean }) => {
          const w = window as any;
          const { overlayId, S, off } = opts;
          if (off) {
            // ★ 2026-10-23：与桌面端 main.cjs 同步 —— 关闸不依赖页面助手，
            //   助手未注入时也要能删掉残留覆盖层（否则编号框永远留在页面上）。
            const h = w.__yzHighlight;
            if (h && h.dispose) { try { h.dispose(); } catch { /* ignore */ } }
            w.__yzHighlight = null;
            const mo = w.__yzHighlightObs;
            if (mo) { try { mo.disconnect(); } catch { /* ignore */ } w.__yzHighlightObs = null; }
            const p = document.getElementById(overlayId); if (p) p.remove();
            return { highlight: false };
          }
          const R = w.__yzReg;
          if (!R) return { error: '页面助手未注入' };
          // 幂等重入：先清理上一次的覆盖层与监听（避免 tab 切换 / 重注入叠加重复监听）
          const prev = w.__yzHighlight;
          if (prev && prev.dispose) { try { prev.dispose(); } catch { /* ignore */ } }
          w.__yzHighlight = null;
          const vis = (el: any) => {
            if (el.disabled === true) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return false;
            return true;
          };
          let ov = document.getElementById(overlayId) as HTMLDivElement | null;
          if (!ov) {
            ov = document.createElement('div');
            ov.id = overlayId;
            ov.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;';
            document.documentElement.appendChild(ov);
          }
          const paint = () => {
            ov!.innerHTML = '';
            let n = 0;
            const walk = (root: any) => {
              if (n >= 250) return;
              let found: Element[] = [];
              try { found = Array.from(root.querySelectorAll(S)); } catch { return; }
              for (const el of found) {
                if (n >= 250) return;
                if (!vis(el)) continue;
                const idx = R.register(el);
                const r = el.getBoundingClientRect();
                const b = document.createElement('div');
                b.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px solid #f97316;box-sizing:border-box;`;
                const t = document.createElement('span');
                t.textContent = String(idx);
                t.style.cssText = `position:fixed;left:${r.left}px;top:${Math.max(0, r.top - 18)}px;background:#f97316;color:#fff;font:bold 12px/16px sans-serif;padding:0 5px;border-radius:2px;`;
                ov!.appendChild(b); ov!.appendChild(t); n++;
              }
              if (root.shadowRoot) walk(root.shadowRoot);
              let all: Element[] = [];
              try { all = Array.from(root.querySelectorAll('*')); } catch { return; }
              for (const nd of all) {
                if (nd.tagName === 'IFRAME') { try { const cd = (nd as any).contentDocument; if (cd) walk(cd.body); } catch { /* ignore */ } }
              }
            };
            walk(document.documentElement);
            return n;
          };
          const count = paint();
          let raf: number | null = null;
          let lastPaint = 0;
          let disposed = false;
          const schedule = () => {
            if (disposed) return;
            const now = Date.now(); if (now - lastPaint < 150) return;
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = null; lastPaint = Date.now(); if (!disposed) paint(); });
          };
          const dispose = () => {
            disposed = true;
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            const mo = w.__yzHighlightObs;
            if (mo) { try { mo.disconnect(); } catch { /* ignore */ } w.__yzHighlightObs = null; }
            const p = document.getElementById(overlayId); if (p) p.remove();
          };
          window.addEventListener('scroll', schedule, true);
          window.addEventListener('resize', schedule);
          if (!w.__yzHighlightObs) {
            try { const mo = new MutationObserver(schedule); mo.observe(document.body, { childList: true, subtree: true }); w.__yzHighlightObs = mo; } catch { /* ignore */ }
          }
          w.__yzHighlight = { refresh: paint, dispose };
          return { highlight: true, count };
        }, { overlayId, S, off: !wantOn });
        break;
      }
      default:
        res.status(400).json({ error: '未知 action: ' + action }); return;
    }
    // 统一 click/type 结果结构（P0）：status 与 pageChanged / urlChanged 同一套口径
    if (action === 'click' || action === 'type') result = unifyActionStatus(result);
    // 变化检测：操作后对比快照，为模型提供 pageChanged / noChangeStreak 反馈
    const r = result as any;
    if (beforeState && r && !r.error && !r.ambiguous) {
      await page.waitForTimeout(500).catch(() => {});
      const after = await page.evaluate(snapshotFn).catch(() => null);
      if (after) {
        const urlChanged = after.url !== beforeState.url;
        const changed = urlChanged || after.t !== beforeState.t || after.n !== beforeState.n;
        // ★ B7：按 tab 分桶（`reqTabId` 为空时归到活动页桶；文案统一由 KeyedStreak 给出）
        const streakKey = reqTabId !== null ? String(reqTabId) : String(activeTabId);
        const st = noChangeStreaks.record(streakKey, changed);
        r.pageChanged = changed;
        r.urlChanged = urlChanged;
        r.noChangeStreak = st.streak;
        if (st.warning) r.warning = st.warning;
      }
    }
    lastActivityAt = Date.now();
    // ★ A4 根治：把本次操作所在的页绑定到该会话（读路由据此隔离，避免读到别人的页）
    bindConvPage(convIdOf(req), page);
    res.json({ data: result });
  } catch (e: any) {
    const msg = e?.message || '浏览器动作失败';
    if (/超时|假死|Target closed|Execution context|Protocol error|browserContext|page.closed|Connection closed/i.test(msg)) {
      logger.warn('[browser] 检测到浏览器异常，自动重置实例:', msg);
      await resetBrowser().catch(() => {});
    }
    res.status(500).json({ error: msg, recoverable: true });
  }
}));

// GET /api/browser/state —— 获取当前浏览器状态
router.get('/state', async (req: Request, res: Response) => {
  try {
    // ★★★ A4 根治（2026-10-10）：按会话解析该用哪个页，不再直读全局单值。
    const convId = convIdOf(req);
    const picked = resolveReadPage(convId, convId ? activePageByConv.get(convId) : null, pageInstance);
    if (picked.reason === 'unbound-conv') {
      // ★ 该会话还没操作过浏览器 → **明确告知**，而不是静默返回别人的页面
      res.json({ data: { active: false, error: 'CONV_HAS_NO_PAGE', hint: '本会话尚未在浏览器上执行任何操作；请先用 browser_navigate 打开页面' } });
      return;
    }
    const page = picked.page;
    if (!browserInstance || !page || page.isClosed?.()) {
      res.json({ data: { active: false } });
      return;
    }
    const url = page.url();
    const title = await page.title().catch(() => '');
    res.json({ data: { active: true, url, title, convScoped: picked.reason === 'bound' } });
  } catch (e: any) {
    res.json({ data: { active: false, error: e?.message } });
  }
});

// POST /api/browser/focus —— 聚焦浏览器窗口（置于前台）
router.post('/focus', withBrowserLock(async (_req: Request, res: Response) => {
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
}));

// POST /api/browser/back —— 后退（返回 url + title）
router.post('/back', withBrowserLock(async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '后退失败' });
  }
}));

// POST /api/browser/forward —— 前进（返回 url + title）
router.post('/forward', withBrowserLock(async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '前进失败' });
  }
}));

// POST /api/browser/refresh —— 刷新当前页（返回 url + title）
router.post('/refresh', withBrowserLock(async (_req: Request, res: Response) => {
  try {
    const page = await getPage();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const title = await page.title().catch(() => '');
    res.json({ data: { url: page.url(), title } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '刷新失败' });
  }
}));

// POST /api/browser/close —— 关闭浏览器
router.post('/close', withBrowserLock(async (_req: Request, res: Response) => {
  try {
    if (pageInstance && !pageInstance.isClosed?.()) await pageInstance.close();
    if (browserInstance) await browserInstance.close();
    pageInstance = null;
    browserInstance = null;
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '关闭失败' });
  }
}));

// GET /api/browser/screenshot —— 当前页面截图（PNG）。?fullPage=true 截长图，?download=文件名 下载
router.get('/screenshot', async (req: Request, res: Response) => {
  try {
    // ★★★ A4 根治：截图也必须截**本会话**的页（否则 A 导航中、B 截图拿到 A 的页面）。
    const convId = convIdOf(req);
    const picked = resolveReadPage(convId, convId ? activePageByConv.get(convId) : null, pageInstance);
    if (picked.reason === 'unbound-conv') {
      res.status(400).json({ error: 'CONV_HAS_NO_PAGE', hint: '本会话尚未在浏览器上执行任何操作；请先用 browser_navigate 打开页面后再截图' });
      return;
    }
    const pageInstance2 = picked.page;
    if (!pageInstance2 || pageInstance2.isClosed?.()) {
      res.status(400).json({ error: '浏览器未启动' });
      return;
    }
    const fullPage = req.query.fullPage === 'true';
    const downloadName = req.query.download as string | undefined;
    // ★ 必须用 pageInstance2（会话解析结果）—— 若仍用全局 pageInstance，隔离等于没做
    const screenshot = await pageInstance2.screenshot({ type: 'png', fullPage });
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
router.get('/render', withBrowserLock(async (req: Request, res: Response) => {
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
}));

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
    // 同步沉淀到浏览器记忆文件（user 来源；fire-and-forget，失败不影响历史记录）
    void recordBrowserMemoryEvent({ url: u, title: entry.title || parsed.host, source: 'user' });
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

// GET /api/browser/memory?days=3 —— 读取浏览器记忆文件（近 N 天浏览/操作记录，Markdown 文本）
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days || '3'), 10) || 3, 1), 30);
    const content = await readBrowserMemory(days);
    res.json({ data: { content, days } });
  } catch {
    res.json({ data: { content: '', days: 3 } });
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
router.post('/passwords/:id/fill', withBrowserLock(async (req: Request, res: Response) => {
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
}));

// POST /api/browser/login-saved —— 用已存凭证登录目标站点
// body: { host?, url? } —— 按 host 匹配凭证；若提供 url 先导航；自动找登录表单→填→提交→判断
router.post('/login-saved', withBrowserLock(async (req: Request, res: Response) => {
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
}));

export default router;
