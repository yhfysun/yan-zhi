const { app, BrowserWindow, BrowserView, webContents, dialog, ipcMain, Menu, session, shell, clipboard, Tray, globalShortcut, desktopCapturer, nativeImage, screen: electronScreen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const http = require('http');
// 实例配置单一真相源：端口 / userData / 共享目录一律从这里取，禁止在本文件再硬编码。
// 目的见 instance.cjs 顶部注释（dev 与安装版的运行期隔离）。
const inst = require('./instance.cjs');
// ★ 外链协议白名单（纯函数模块，有单测）—— 必须在**顶部** require：
//   guardNavigation 在 ~800 行（主窗口创建处）就要用，靠后的 const 会 TDZ 抛错。
//   四道闸门：① shell:openExternal 白名单 ② 主窗口 windowOpenHandler
//   ③ 任意 webContents 的 will-navigate + will-frame-navigate（guardNavigation，子帧靠它）
//   ④ guest 的 popup 重定向。判据见 url-guard.cjs 顶部注释。
const { isSafeExternalUrl, isAllowedGuestNavigation, guardNavigation } = require('./url-guard.cjs');

let mainWindow = null;

/** 是否开发实例（由 dev 编排器注入 YANZHI_DEV_INSTANCE=1） */
const IS_DEV_INSTANCE = inst.isDevInstance(process.env);
/**
 * 本实例后端监听端口。
 * ★ 2026-10-10 起：开发实例与安装版**同端口 3001**（用户诉求：dev 直接测真实数据）。
 *   两实例不能同时运行；临时并存可用 YANZHI_API_PORT 覆盖。
 * 渲染层通过 preload 暴露的 electronAPI.apiPort 取同一个值。
 */
const API_PORT = inst.resolveApiPort(process.env);
const API_ORIGIN = 'http://127.0.0.1:' + API_PORT;

// ============================================================
// userData 目录固定与历史数据迁移（productName 言智 → yan-zhi 配套）
// db / keyring / models / server-data 全存在 Electron 默认 userData
// （%APPDATA%\<productName>）下，productName 改名后默认目录随之变化。
// 这里显式固定为 %APPDATA%\yan-zhi，首次启动时把历史目录整体搬入，
// 避免升级后数据库、本地模型"全丢"。必须在 ready 前执行。
//
// ★★★ 实例隔离变更（2026-10-10）：开发实例**不再**用 `yan-zhi-dev`，
//   改为与安装版**共用** `yan-zhi`（用户诉求「dev 直接启动就能测真实数据」）——
//   即 dev 与安装版读写同一份 localStorage / 密钥 / 数据库。
//   ⚠️ 代价：dev 的改动直接作用于真实数据；两实例不能同时启动。
//   （历史行为 2026-09-27：曾用 `yan-zhi-dev` 隔离，理由是"别让 dev 改掉装好的软件设置"，
//     现按用户明确要求反向。）
//   models / bin 一如既往**有意共用**（1.1GB 模型不重复下载）。
// ============================================================
(function migrateUserDataDir() {
  const appData = app.getPath('appData');
  const dirs = inst.resolveUserDataDirs(appData, IS_DEV_INSTANCE);
  const userDataRoot = dirs.userData;
  const legacyCandidates = [
    path.join(appData, '言智'),                 // 0.1.x（productName=言智）
    path.join(appData, '@yan-zhi', 'desktop'), // 更早（包名 fallback）
    path.join(appData, '@yan-zhidesktop'),     // 更早变体
  ];
  if (!fs.existsSync(userDataRoot)) {
    const legacy = legacyCandidates.find((p) => fs.existsSync(p));
    if (legacy) {
      // 同盘 rename 瞬时完成；失败（跨盘/占用）退化为递归复制
      try { fs.renameSync(legacy, userDataRoot); }
      catch { try { fs.cpSync(legacy, userDataRoot, { recursive: true }); } catch {} }
    } else if (dirs.seedFrom && fs.existsSync(dirs.seedFrom)) {
      // 开发实例首次启动：从安装版目录复制一份"用户状态"作起点。
      // 目的：开发者不必重新授权、重配界面设置才能调试（否则会以为"功能坏了"）。
      // ★ 只带小体积状态项，**不带** models/bin（走共享目录）与各类缓存。
      // ★ 仅目标不存在时执行一次；此后 dev 的改动不会回写生产，互不污染。
      try {
        fs.mkdirSync(userDataRoot, { recursive: true });
        const SEED_ITEMS = [
          'keyring.json',       // 授权码 / API Key（DPAPI 加密，同一台机器可解）
          'Preferences',        // Electron 偏好
          'Local Storage',      // 界面设置（主题、语言等）
          'IndexedDB',          // 前端结构化存储
          'data.db', 'data.db-wal', 'data.db-shm', // 老版本遗留（现数据在 server-data，兼容带上）
        ];
        let copied = 0;
        for (const name of SEED_ITEMS) {
          const dest = path.join(userDataRoot, name);
          if (fs.existsSync(dest)) continue;
          const src = path.join(dirs.seedFrom, name);
          if (!fs.existsSync(src)) continue;
          try {
            fs.cpSync(src, dest, { recursive: true });
            copied++;
          } catch { /* 单项失败不阻断其余 */ }
        }
        console.log(`[实例] 开发实例首次启动：已从生产目录引导 ${copied} 项用户状态作起点`);
      } catch (e) {
        console.warn('[实例] 从生产目录引导失败（不影响启动）:', e && e.message);
      }
    }
  }
  app.setPath('userData', userDataRoot);
  // ★★★ 主进程日志落盘（2026-10-10）：必须**紧跟 setPath 之后**、且在其它模块打日志之前 ——
  //   此时 userData 已定稿（`<userData>/logs/main-YYYY-MM-DD.log`），才能把启动全过程收进去。
  //   ★ 见 main-log.cjs 顶部注释：此前主进程 50 处 console 只进终端，devtools 一关就什么线索都没有，
  //     是"应用不打印日志、排障只能靠猜"的直接原因。
  try { require('./main-log.cjs').installMainLogger(userDataRoot); } catch (e) { console.warn('[main-log] 安装失败:', e && e.message); }
  console.log(`[实例] ${IS_DEV_INSTANCE ? '开发' : '生产'}实例 | userData=${userDataRoot} | 端口=${API_PORT}`);
})();

/**
 * 大文件缓存目录（models / bin）：**两个实例共用生产目录**。
 * 见 instance.cjs 的 sharedDataName 注释：隔离的是状态，不是 GB 级缓存。
 * 仅当共享目录与自身 userData 不同（即开发实例）时才有意义；否则直接用 userData。
 */
function sharedDataDir(sub) {
  const dirs = inst.resolveUserDataDirs(app.getPath('appData'), IS_DEV_INSTANCE);
  const base = dirs.shared === dirs.userData ? app.getPath('userData') : dirs.shared;
  const p = sub ? path.join(base, sub) : base;
  try { fs.mkdirSync(p, { recursive: true }); } catch { /* ignore */ }
  return p;
}

let serverProcess = null;
let tray = null;

// ★★★ 启动加载壳（splash，2026-10-12）：后端健康检查期间显示，主窗 ready-to-show 后销毁。
//   背景：tsx 冷启动曾 >30s，旧逻辑 30s 超时后**强制创建主窗** → 前端请求全被拒
//   （ERR_CONNECTION_REFUSED / 白屏）。现在超时不再建窗，改在 splash 上显示失败态。
let splashWindow = null;
let splashLastUpdate = null;   // splashAPI.getLastUpdate 的数据源（防错过已推送状态）
const SPLASH_HEALTH_TIMEOUT_MS = 120000; // dev tsx 冷编译实测 60s+，30s 太紧
function pushSplashUpdate(update) {
  splashLastUpdate = update;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:update', update);
  }
}
function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  splashWindow = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#1D1D1C',
    show: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });
  void splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}
function destroySplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    try { splashWindow.destroy(); } catch { /* 已销毁则忽略 */ }
  }
  splashWindow = null;
}
let isQuitting = false;
// BrowserView 多标签页管理：tabId → entry
//   entry = { view, cacheClearPromise, scrollbarCssKey, attached, visible, bounds,
//             zoomFactor, url, lastActiveAt, suspended, ownerWindow }
//   attached — 真实挂载态：BrowserView 是否已 attach 到 BrowserWindow
//   visible  — 业务可见态：渲染层是否要求它可见（右栏开 + 该 tab 激活）
//   bounds   — 渲染层最后一次同步的矩形 { x, y, width, height }，null 表示未知
//   zoomFactor — 页面缩放单一真相源（setZoomFactor 写入，did-finish-load 回放）
//   url      — 最近导航地址（did-navigate 持续更新；挂起卸载后靠它复活）
//   lastActiveAt — 最近激活时间戳（LRU 逐出 / 空闲卸载 / closeTab 顶替的排序依据）
//   suspended — R4 挂起态：true = webContents 已销毁、tab 壳保留，激活时复活
//   ownerWindow — R6 多窗口预留：创建时的宿主窗口（单窗口下与 mainWindow 等价）
// 两个字段必须分开：早期版本混用单个 hidden 字段，导致 hide 后再展开时
// resize 被自己的状态位拦死（"隐藏墓碑"），页面再也回不来。
// 所有挂载/摘除一律走 applyVisibility(entry)，禁止业务代码各自 setBrowserView
// 或用 setBounds(0,0,0,0) 冒充隐藏（Windows GPU 加速下会残留图层吞点击）。
const browserViews = new Map();
let activeTabId = null;
// 最近一次有效矩形（由 browserView:resize 写入），首次导航/强制重挂时作为兜底，
// 取代写死的 480px，避免首次导航因 bounds 未同步而被判为不可见。
let lastGoodBounds = null;

/**
 * 浏览器面板当前是否可见（2026-10-14 新增，**只记录、不改变任何行为**）。
 *
 * ★★★ 为什么要它（截图必失败的真实根因）：webview 引擎下，**面板收起时 CSS 只是
 *   宽度过渡归 0 + 透明（并非 display:none）**（见 BrowserPanel.vue 注释）——
 *   `<webview>` 的合成 surface 随之消失，于是 `wc.capturePage()` 必抛
 *   `Current display surface not available for capture`；而 guest webContents 仍活着，
 *   `get_page_content` / `run_script` / `click` 照常成功。
 *   实测吻合（conv 96125908，2026-10-14 16:45:51→16:51:27）：8 次截图**全失败**，
 *   同期所有 JS 类动作**全成功**；16:55:55 面板重新就绪后自动恢复。
 *   ⇒ 但主进程原先在 webview 引擎下对 `browserView:resize` / `browserView:hide`
 *     **双双早返回**（「webview 由渲染层 CSS 控制显隐」），于是"截图为什么必失败"
 *     在主进程侧**完全不可诊断**，只能靠翻日志反推。
 *   ⇒ 这两个 IPC 渲染层本来就在发，这里只顺势记下可见性，不新增 IPC、不动显隐逻辑。
 *   保守默认 true：拿不到信号时按"可见"处理，避免误判成不可见而拒截。
 */
let webviewPanelVisible = true;

// ============================================================
// 浏览器引擎：'webview'（DOM 内嵌 <webview>，浮层可覆盖）| 'browserview'（旧原生图层）
// webview 模式下不再创建 BrowserView：guest 由渲染层 <webview> 元素承载，
// 主进程用 webContents.fromId(guestId) 拿到 guest，复用原有全部 action 实现（零改动）。
// 回退：把 BROWSER_ENGINE_DEFAULT 改成 'browserview' 即整体回到旧链路。
// ============================================================
const BROWSER_ENGINE_DEFAULT = 'webview';
let browserEngine = BROWSER_ENGINE_DEFAULT;
// tabId → { scope, lastActiveAt, wcId }（wcId 由渲染层 <webview> 挂载后注册）
const webviewTabs = new Map();

function isWebviewEngine() { return browserEngine === 'webview'; }
/** 取 guest webContents（webview 模式）；未注册/已销毁返回 null */
function guestWebContents(tabId) {
  const t = webviewTabs.get(tabId);
  if (!t || !t.wcId) return null;
  try {
    const wc = webContents.fromId(t.wcId);
    return wc && !wc.isDestroyed() ? wc : null;
  } catch { return null; }
}
/** 等待渲染层注册 guest（<webview> 创建需要一帧）
 *
 * ★★★ 2026-10-11 二次改造：轮询 → **事件驱动 + 低频轮询兜底**（晚绑定）。
 *
 *   背景（当日 12:02 实测日志）：渲染主线程被大会话（403 条消息全量渲染）饱和时，
 *   IPC 事件迟到 **34.3 秒**（主进程广播 tabCreated 12:02:34 → 渲染层收到 12:03:08），
 *   而本函数当时只等 8s ⇒ `wc=NULL(8s 超时)` ⇒ 建页动作失败。
 *   纯轮询在这种场景下无能为力：不管间隔多密，guest 在 34s 时才注册，8s 的窗口内
 *   怎么轮都是空。⇒ 必须让"guest 注册"这个事件本身来唤醒 waiter。
 *
 *   机制：
 *     ① `browser:wv:register` IPC 到达时，立即 resolve 该 tabId 上的全部挂起 waiter
 *        （`guestWaiters`，见下方 register handler）—— 健康路径 0 额外延迟；
 *     ② 保留低频轮询（500ms）兜底 —— 防 register 事件被吞的边缘情况（重注册/竞态）；
 *     ③ 自建路径（navigate 无 guest → 广播 tabCreated 后等待）把上限放宽到 30s：
 *        事件驱动下 guest 一到就返回，长上限在健康路径**零开销**；渲染层卡顿时
 *        把「34s 迟到 = 失败」变成「慢成功」。
 *
 *   语义不变：仍然最多等 `timeoutMs`，命中即返回，超时返回 null。
 */
const guestWaiters = new Map(); // tabId → Set<() => void>
function wakeGuestWaiters(tabId) {
  const set = guestWaiters.get(tabId);
  if (!set) return;
  guestWaiters.delete(tabId);
  for (const wake of set) { try { wake(); } catch { /* ignore */ } }
}
async function waitForGuest(tabId, timeoutMs = 5000) {
  if (!tabId) return null;
  const started = Date.now();
  // 立即命中（guest 已就绪的绝大多数场景）：零延迟返回
  {
    const wc = guestWebContents(tabId);
    if (wc) return wc;
  }
  for (;;) {
    const elapsed = Date.now() - started;
    if (elapsed > timeoutMs) return null;
    // 等待「register 事件」或「兜底轮询节拍」二者先到者
    let wake;
    const registered = new Promise((r) => { wake = r; });
    let set = guestWaiters.get(tabId);
    if (!set) { set = new Set(); guestWaiters.set(tabId, set); }
    set.add(wake);
    // ★ 超时退出路径必须摘掉自己的 waiter（否则 Set 里留死函数，同 tab 反复等待会累积）
    const tick = new Promise((r) => setTimeout(r, 500));
    const timeoutP = new Promise((r) => setTimeout(r, Math.max(timeoutMs - elapsed + 10, 10)));
    const outcome = await Promise.race([
      registered.then(() => 'w'),
      tick.then(() => 't'),
      timeoutP.then(() => 'x'),
    ]);
    // 清理本次挂起的 waiter（'w' 路径 wakeGuestWaiters 已整组删除，delete 无害）
    try { set.delete(wake); } catch { /* ignore */ }
    if (outcome === 'x') {
      // 兜底再查一次（可能 register 与超时同刻到达），查不到才真超时
      const wc = guestWebContents(tabId);
      if (wc) return wc;
      return null;
    }
    const wc = guestWebContents(tabId);
    if (wc) return wc;
  }
}
/** 统一入口：按当前引擎解析 tabId 对应的 webContents */
function resolveTabWebContents(tabId) {
  const tid = tabId || activeTabId;
  if (!tid) return null;
  if (isWebviewEngine()) return guestWebContents(tid) || (activeTabId ? guestWebContents(activeTabId) : null);
  const entry = browserViews.get(tid);
  return entry?.view?.webContents || null;
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 会话 → tab 锚定（「浏览器执行面直连化」P0-2，2026-10-10）
//
// ★★★ 为什么必须下沉到主进程：
//   直连化后，命令由**服务端**经本地端点直接送进来（见 browser-bridge.cjs），
//   服务端只知道 `convId`（`ToolContext.conversationId`，A4 已打通），**不知道 tabId**。
//   而"某会话当前锚在哪个 tab"此前由**渲染层** `agentAnchoredTabs`（chat.ts:50）持有 ——
//   渲染层不再执行浏览器工具后，那个锚就没人维护了 ⇒ 主进程必须自己持有。
//
// ★★★ 只能有一处生效（这是本方案最贵的一条判据）：
//   渲染层 `resolvePreviewTabId`(chat.ts:111) 与这里语义**完全一致**，
//   若两处同时锚 ⇒ 「两个 activeTabId 体系」那个历史坑的翻版（一边锚 A、一边锚 B，
//   动作落到错误的页上且不报错）。⇒ bridge 生效时渲染层不再执行、天然不锚；
//   `browserView:action` 的 **IPC 路径（SSE 委托）始终显式传 tabId**，不读本表 ⇒ 两者不会打架。
//
// ★ 与 `activeTabId` 的分工：`activeTabId` 是"用户当前在看哪个"（UI 语义）；
//   `convAnchors` 是"某流的操作目标"（执行语义）。两者可以不同，不该互相顶替。
// ============================================================
// ★ 维度 = **流键**（`${convId}::${flow}`，见 browser-target.cjs 的 flowKeyOf），不是 convId：
//   同一会话内会有多条执行流（主面板流 + 各自申请的后台标签页流）。只按 convId 存，后台流的锚
//   就会覆盖主面板的"当前操作页"（两个流抢同一个锚，且不报错）。
//   ★ 缺省 flow → 共享主面板流 ⇒ **今天的语义逐字不变**。
const convAnchors = new Map(); // flowKey → tabId

/**
 * agent 经桥/工具操作过、**需要任务收尾关闭**的 tab：tabId → **flowKey**。
 *
 * ★★★ 为什么必须（「直连化」可见性契约，2026-10-10）：
 *   桥路径下**渲染层不执行** browser_* 工具 ⇒ 渲染层 `agentOpenedTabs` 记账
 *   （在 `dispatchToolCall` 里）**永远为空** ⇒ 任务收尾的 `closeAgentTabs()`
 *   （按 `agentOpened` 过滤）**关不掉任何东西** ⇒ 「任务跑了半天，一堆 agent 页面
 *   留在预览面板不关」——既有功能静默退化。
 *   ⇒ 改为**主进程自己按会话收口**：谁操作的页由谁收，不依赖渲染层、也不依赖 agentOpened 标记。
 *
 * ★ 只记 **preview 空间** 的 tab（`preview` / `preview:<convId>`）：
 *   `/browser` 独立浏览器页（scope='page'）是**用户自己的空间**，agent 收尾不该碰
 *   （与 agentOpened 的既有安全边界一致：agent 只收拾自己打开的页）。
 * ★ 用 Map 而非 Set：需要知道"哪个会话该关哪些页"，收尾时按 convId 前缀过滤
 *   （值现在是 flowKey = `${convId}::${flow}`，前缀即会话）。
 */
const agentTouchedTabs = new Map();

/**
 * tab 最近一次广播/导航的 URL（2026-10-12）：navigate 自建分支"同 URL 复用"的判据。
 * ★ 写入点：① 自建路径广播 tabCreated 前；② tabClosed 时清除（防陈旧复用）。
 *   只存主进程已知的 URL（渲染层自行导航的 URL 不强求覆盖 —— 复用判定保守，
 *   找不到就新建，行为与修复前一致，不会错杀）。
 * ★ 上限兜底：与 agentTouchedTabs 同手法（Map 插入序淘汰最老）。
 */
const broadcastTabUrl = new Map();

/** tab 的归属空间（取不到时回落 'preview'，与既有 `scopeOf` 口径一致） */
function scopeOfTab(tabId) {
  if (!tabId) return 'preview';
  const meta = isWebviewEngine() ? webviewTabs.get(tabId) : browserViews.get(tabId);
  return (meta && meta.scope) || 'preview';
}

/** tab 是否属于预览空间（agent 执行面）。`/browser` 页的 'page' 空间不在此列。 */
function isPreviewScope(tabId) {
  return String(scopeOfTab(tabId)).startsWith('preview');
}

/**
 * 登记"本流操作过某个 tab"（**不**改当前锚）。
 *
 * ★ 为什么与"设锚"拆开：一个动作可能**不改写操作目标**，但**确实用了**那个页 ——
 *   典型是 `get_page_content(tabId=B)`（定向读取）与 `new_tab`（开新页）。
 *   这些页必须登记：
 *     ① 后续要能继续读它们（越权闸门认"本流操作过"）；
 *     ② 任务收尾要能关掉它们（`closeConvTabs` 按本表过滤）。
 *   ★ 早期版本把两件事糅在 `setConvAnchor` 里 ⇒ 只能"设锚即登记"，无法表达
 *     "用了但不切换" ⇒ 要么漏登记（越权/堆积），要么被迫改锚（打到错页）。
 */
function markFlowTabTouched(flowKey, tabId) {
  if (!flowKey || !tabId) return;
  const tid = String(tabId);
  if (isPreviewScope(tid)) agentTouchedTabs.set(tid, String(flowKey));
}

/** 记录"该流当前的操作目标 tab"（**会**改锚）+ 登记操作过它。tab 关闭时必须失效。 */
function setFlowAnchor(flowKey, tabId) {
  if (!flowKey || !tabId) return;
  const key = String(flowKey);
  const tid = String(tabId);
  const prev = convAnchors.get(key);
  // 换锚：老锚那个 tab 记下"本流用过"（收尾要一并关，否则中间页堆积）
  if (prev && prev !== tid) markFlowTabTouched(key, prev);
  markFlowTabTouched(key, tid);
  convAnchors.set(key, tid);
  // 上限兜底：流很多时淘汰最早的（Map 插入序）——与 A4 的 activePageByConv 同手法
  while (convAnchors.size > 200) {
    const oldest = convAnchors.keys().next().value;
    if (oldest === undefined) break;
    convAnchors.delete(oldest);
  }
  while (agentTouchedTabs.size > 400) {
    const oldest = agentTouchedTabs.keys().next().value;
    if (oldest === undefined) break;
    agentTouchedTabs.delete(oldest);
  }
}
/** 取某流的锚定 tabId；未锚定返回 null（**不回落 activeTabId** —— 那会把动作打到别人的页上） */
function resolveTabIdForFlow(flowKey) {
  if (!flowKey) return null;
  const tid = convAnchors.get(String(flowKey));
  if (!tid) return null;
  // 锚定的 tab 已不存在 → 清掉并返回 null（不返回幽灵 tabId）
  const alive = isWebviewEngine() ? webviewTabs.has(tid) : browserViews.has(tid);
  if (!alive) { convAnchors.delete(String(flowKey)); return null; }
  return tid;
}
/** tab 关闭时的收口：把所有指向它的锚一并失效（唯一入口，避免某条关闭路径漏清） */
function clearFlowAnchorsForTab(tabId) {
  if (!tabId) return;
  const tid = String(tabId);
  for (const [key, t] of convAnchors) {
    if (t === tid) convAnchors.delete(key);
  }
  // ★ 锁定页也要一起清（P3-6）：tab 都没了，锁定就是幽灵 —— 留着会让
  //   `resolveFlowPinForFlow` 返回不存在的 id（虽然那边有 isAlive 兜底，但这里清掉更直白）。
  flowPins.clearForTab(tid);
  agentTouchedTabs.delete(tid);
}

/** 需建立/切换页面（写）的 action —— 未锚定时**允许**回落 activeTabId（首次 navigate 要能自发建 tab）。
 *  其余（读/交互）在"带 convId 但未锚定"时必须**明确报错**，绝不静默打到全局活动页
 *  （与 A4 的 `resolveReadPage` 语义同源：绝不静默返回别人的页）。
 *
 *  ★★ 判定本体在 `browser-target.cjs`（纯函数模块）—— 这里只引入，**不复制一份**：
 *    判定错了的表现是"动作打到错的页且不报错"（最难查），故必须能被 vitest **真跑**验证，
 *    而 main.cjs 依赖 electron 无法在测试里加载（静态断言抓不住"分支顺序/条件短路"类缺陷）。 */
const {
  resolveTarget: resolveBrowserTarget,
  decideAnchorUpdate,
  flowKeyOf,
  isBackgroundFlow,
  createFlowPinRegistry,
} = require('./browser-target.cjs');

/**
 * 流 → **锁定页**（P3-6，2026-10-16）：页面对话任务开始时由面板钉住那一页，任务期间不许换页。
 *
 * ★ 与 `convAnchors`（锚）的区别，别混：
 *   · 锚 = "最近一次操作目标"，**随动作漂移**（navigate 到别页、切 tab 都会改它）；
 *   · 锁定 = "本次任务开始时用户指的那一页"，**任务期间不可改**，在 `resolveTarget` 里优先于锚。
 *   "面板跟随锚"（下方 :5055 那段）照旧 —— 页内导航仍会让面板跟着走；
 *   锁定只禁止"跳到**别的标签页**"。
 *
 * ★ 判定本体在 browser-target.cjs 的工厂里（可真跑验证）；这里只持有实例 + 注入"tab 还在不在"。
 *   （位置在 `clearFlowAnchorsForTab` 之后，但那边只在**调用时**读 `flowPins`，
 *     而它在模块初始化完成后才会被调用 —— 不是 TDZ 问题。）
 */
const flowPins = createFlowPinRegistry({
  isAlive: (t) => (isWebviewEngine() ? webviewTabs.has(t) : browserViews.has(t)),
});

/** 取某流的锁定页（tab 已不存在时工厂内部会自清并返回 null） */
function resolveFlowPinForFlow(flowKey) {
  return flowPins.resolve(flowKey);
}


// R3：摘除即静音 —— 收起右栏/切走 tab 后视频音乐不再出声（"收起了就该安静"）。
// 如果有意保留后台音乐（如挂机听歌），把该开关设为 false 即可一行回退。
const MUTE_ON_DETACH = true;
// R4：tab 内存管理 —— 每个 tab 一个完整渲染进程（Chromium 约 60~120MB），
// 不设上限开 15 个 tab 就是 1~2GB。
const MAX_TABS = 8;                          // 同时存活的 webContents 上限
const TAB_IDLE_UNLOAD_MS = 10 * 60 * 1000;   // 非激活 tab 空闲多久后卸载

// ============================================================
// 数据库（better-sqlite3，主进程单例）
// ============================================================
let db = null;
/** 初始化 better-sqlite3 单例 */
function getDb() {
  if (db) return db;
  const BetterSqlite3 = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'yan-zhi.db');
  db = new BetterSqlite3(dbPath);
  // 启用外键约束
  db.pragma('foreign_keys = ON');
  // 加载 sqlite-vec 扩展（向量记忆检索 memory_vec 表依赖此扩展）
  // sqlite-vec 是 SQLite 原生扩展（非 Node addon），无需 electron-rebuild
  try {
    const sqliteVec = require('sqlite-vec');
    const vecPath = sqliteVec.getLoadablePath();
    db.loadExtension(vecPath);
    console.log('[db] sqlite-vec 扩展已加载:', vecPath);
  } catch (err) {
    console.warn('[db] sqlite-vec 扩展加载失败，向量检索功能不可用:', err && err.message ? err.message : err);
  }
  return db;
}

/**
 * 历史遗留诊断智能体清理（IPC 库 yan-zhi.db）。
 *
 * `diag_min_loop` 是 2026-09 排查 loop 节点时手工建的 workflow 调试载体，不是内置智能体，
 * 只残留在数据里。后端 data.db 那份由 server 启动时自行清理（cleanupLegacyDiagAgents），
 * 但本库是 Electron 主进程独占的单例，后端进程碰不到，所以在这里单独清一次。
 *
 * 幂等：删完 WHERE 不再命中。带 is_builtin = 0 兜底，避免误删将来复用了该 id 的内置智能体。
 */
function cleanupLegacyDiagAgent() {
  try {
    const d = getDb();
    const row = d.prepare("SELECT id FROM agent WHERE id = 'diag_min_loop' AND is_builtin = 0").get();
    if (!row) return;
    const convs = d.prepare("UPDATE conversation SET agent_id = NULL WHERE agent_id = 'diag_min_loop'").run().changes;
    const n = d.prepare("DELETE FROM agent WHERE id = 'diag_min_loop' AND is_builtin = 0").run().changes;
    console.log(`[cleanup] 已清理遗留诊断智能体 diag_min_loop（agent ${n} 行${convs ? `，解绑会话 ${convs} 个` : ''}）`);
  } catch (err) {
    console.warn('[cleanup] 遗留诊断智能体清理失败:', err && err.message ? err.message : err);
  }
}

// ============================================================
// Keyring（JSON 文件存储，主进程单例缓存）
//
// 敏感值（授权码 / 平台 API Key）用 Electron safeStorage 加密后落盘：
// 底层是 Windows DPAPI / macOS Keychain / Linux libsecret，密钥绑当前用户账户，
// 把 keyring.json 复制到别的机器或别的账户下解不开 —— 明文时代任何拿到该文件的
// 人都能直接读走平台 API Key（真实上游密钥），这比授权码泄露严重得多。
//
// 加解密纯逻辑在 keyring-crypto.cjs（可单测、零依赖），这里只负责 IO 与接线。
// ============================================================
const {
  isSensitiveKeyringKey,
  encryptKeyringValue,
  decryptKeyringValue,
} = require('./keyring-crypto.cjs');

function getKeyringPath() {
  return path.join(app.getPath('userData'), 'keyring.json');
}

/** 读取 keyring JSON（不存在时返回空对象） */
async function readKeyring() {
  const p = getKeyringPath();
  try {
    const raw = await fsp.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    // 文件不存在或解析失败，返回空对象
    return {};
  }
}
/** 写回 keyring JSON */
async function writeKeyring(data) {
  const p = getKeyringPath();
  // 确保目录存在
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================
// MCP 子进程管理（childId -> ChildProcess 映射）
// ============================================================
const mcpChildren = new Map();
let mcpChildSeq = 0;

/** 启动后端服务器（apps/server）
 *  重要：better-sqlite3 是原生模块，编译为 Electron 的 ABI。
 *  后端必须用 Electron 的 Node.js（ELECTRON_RUN_AS_NODE=1）启动，否则 ABI 不兼容。
 */

/** 生产模式：后端数据目录与程序分离。
 *  旧版把 data.db 落在 resources/server/dist/apps/server/（安装目录内），
 *  NSIS 覆盖安装时卸载旧版会清空安装目录导致用户数据丢失。
 *  现统一放 userData/server-data，并把旧位置的数据一次性迁移过来。
 *
 *  ★★★ dev 模式也必须给 DATA_DIR（2026-10-08 修，血泪教训）：
 *    此前这里是 `if (!app.isPackaged) return null;` —— dev 下返回 null，
 *    上层 `...(dataDir ? {DATA_DIR: dataDir} : {})` 于是不注入 → 后端 db.ts 退回
 *    `apps/server/`（**源码目录**）建库。后果：
 *      ① dev 与安装版各写一份库，数据互不可见；
 *      ② 实测该库发生过 B 树损坏（conversation/message 两棵树）→ 会话接口全 500。
 *    dev 下 Electron 的 userData 已被 instance.cjs 设为 `yan-zhi-dev`
 *    （YANZHI_DEV_INSTANCE=1），所以这里的 server-data 天然落在
 *    `%APPDATA%/yan-zhi-dev/server-data`，与安装版彻底分开。
 *  ★ 显式传入的 DATA_DIR（bin/dev.mjs 下发）优先，避免 Electron 与裸 server 两条
 *    启动路径拿到不同的目录。 */
function ensureServerDataDir() {
  const explicit = (process.env.DATA_DIR || '').trim();
  if (explicit) {
    fs.mkdirSync(explicit, { recursive: true });
    return explicit;
  }
  const dataDir = path.join(app.getPath('userData'), 'server-data');
  fs.mkdirSync(dataDir, { recursive: true });
  if (app.isPackaged) {
    // 生产：把旧位置（安装目录内）的数据一次性搬迁过来
    const newPath = path.join(dataDir, 'data.db');
    if (!fs.existsSync(newPath)) {
      const legacyDir = path.join(process.resourcesPath, 'server', 'dist', 'apps', 'server');
      for (const f of ['data.db', 'data.db-wal', 'data.db-shm']) {
        const src = path.join(legacyDir, f);
        if (fs.existsSync(src)) {
          try { fs.copyFileSync(src, path.join(dataDir, f)); } catch {}
        }
      }
    }
  }
  return dataDir;
}

/**
 * 版本档环境变量：从 `edition.json`（打包期由 scripts/set-edition.cjs 生成）读出，
 * 传给后端进程。后端据此算「构建档 ∩ 授权档」并把放行模式随 /api/license/verify 下发。
 *
 * 为什么必须显式传：electron-builder 的 env 段只作用于**构建进程**，而运行时的后端进程
 * 是 main.cjs 自己 spawn 的 —— 不传就等于这个包没有档位信息，会落到兜底档。
 *
 * ★ 开发模式恒为 pro 全量：开发者要能见到所有模式与入口。否则改 dev/ops/sec 相关代码时
 *   界面上根本没入口，得先想办法弄一张 pro 码才能调 —— 本末倒置。
 *
 * 为什么用 `app.isPackaged` 而不是环境变量开关：**env 是客户可改的**，
 * 用它做档位开关等于把分档作废（客户设 `YZ_EDITION=pro` 就白拿高级版）。
 * `app.isPackaged` 由 Electron 依据「是否从 asar 包启动」判定，运行期无法伪造。
 *
 * 文件缺失（如打包产物未登记 edition.json）时返回空对象：后端会用自己的默认档兜底，
 * 不因读不到档位而启动失败。
 */
function readEditionEnv() {
  if (!app.isPackaged) {
    console.log('[版本档] 开发模式 → 高级版全量（pro，构建档与预置码档均为 pro）');
    return { YZ_EDITION: 'pro', YZ_DEFAULT_EDITION: 'pro' };
  }
  try {
    const p = path.join(__dirname, 'edition.json');
    if (!fs.existsSync(p)) {
      console.warn('[版本档] 未找到 edition.json，后端将使用默认档（basic）');
      return {};
    }
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!cfg || typeof cfg.edition !== 'string') return {};
    const env = { YZ_EDITION: cfg.edition };
    // 预置码档位与构建档是两件事（高级包带基础版码），故单独传，不合并。
    if (typeof cfg.defaultEdition === 'string') env.YZ_DEFAULT_EDITION = cfg.defaultEdition;
    console.log('[版本档] 构建档=' + cfg.edition + ' 预置码档=' + (cfg.defaultEdition || '(默认)'));
    return env;
  } catch (e) {
    console.warn('[版本档] edition.json 读取失败，后端将使用默认档:', e && e.message);
    return {};
  }
}

const editionEnv = readEditionEnv();

/**
 * 授权门禁开关：`YZ_LICENSE_GUARD=1` 时后端会校验每个 `/api` 请求的 x-license 头，
 * 未激活/过期一律 403（见 apps/server/src/license-guard.ts）。
 *
 * ★ **只在打包版开启，dev 保持关闭**（用户 2026-09-19 拍板「开」）：
 *   - 不开的话，前端路由守卫 + localStorage 是唯一防线 —— 改一行 localStorage 或
 *     直接 curl /api 就能绕过整个授权，等于没做授权。
 *   - dev 不开是因为：本地恒 guest、开发调试/冒烟脚本/seed 脚本都会因无授权码被 403，
 *     本地开发环境开这个只有坏处没有好处（客户拿不到 dev 环境）。
 *
 * 返回对象而非常量：与 editionEnv 一起展开进 spawn 的 env，保持注入方式一致。
 */
function readGuardEnv() {
  if (!app.isPackaged) return {};
  console.log('[授权门禁] 打包版已开启（YZ_LICENSE_GUARD=1）');
  return { YZ_LICENSE_GUARD: '1' };
}

/** 预置试用码文件（构建时现签，pre-sign-license.cjs 产出 → extraResources/license/）。
 *  server 的 license.ts 优先读它；文件不存在（dev / 显式跳过）时 server 回退源码常量。 */
function readLicenseCodesEnv() {
  if (!app.isPackaged) return {};
  const f = path.join(process.resourcesPath, 'license', 'default-codes.json');
  if (!fs.existsSync(f)) return {};
  console.log('[license] 预置码来源: 构建时现签');
  return { YZ_LICENSE_CODES_FILE: f };
}

const guardEnv = readGuardEnv();

function startServer() {
  const serverDir = path.join(__dirname, '..', 'server');
  // CDP 端点此刻必须已定稿（Chromium 已随 ready 就绪），server env 一次性带下去
  const cdpEndpoint = resolveCdpEndpoint();
  // ★ 浏览器桥的 URL/token（「执行面直连化」P0-3）：桥已在 whenReady 里 start() 过（见调用点注释）。
  //   档位不是 off 时返回两条 env，服务端据此直连；off 时返回 {} ⇒ 服务端走原有 SSE 委托。
  const bridgeEnv = browserBridge.envForServer();
  // 模型目录统一放**共享** models（两实例复用同一份 gguf，不重复下载 1.1GB，见 instance.cjs）
  const modelsDir = sharedDataDir('models');
  // 开发模式：把源码目录已有的模型文件同步到 userData/models（一次性，不覆盖）
  if (!app.isPackaged) {
    const srcModelsDir = path.join(serverDir, 'models');
    try {
      for (const f of fs.readdirSync(srcModelsDir)) {
        if (f.toLowerCase().endsWith('.gguf')) {
          const dest = path.join(modelsDir, f);
          if (!fs.existsSync(dest)) fs.copyFileSync(path.join(srcModelsDir, f), dest);
        }
      }
    } catch {}
  }

  if (!app.isPackaged) {
    // 开发模式：用 Electron 的 Node.js + tsx 运行 TypeScript 源码
    //
    // ★★★ 必须注入 YZ_HOT_RELOAD=1（2026-10-09，high）：
    //   dev 后端是 `tsx watch` → **每改一次源码就重启进程**，正在跑的任务被
    //   `markOrphanTasksInterrupted()`（llm-task-manager）整批回收。
    //   该函数**已实现**按此标记分流：设了标记 → 标 `resumable` + 文案「热重载暂停，
    //   发『继续』即可」；没设 → 标 `interrupted` + 文案「应用重启，任务已中断」。
    //   ★ 此前只在 `apps/server/scripts/dev.cjs` 注入，**本文件（桌面 dev 路径）没注入** ——
    //     而用户日常跑的就是这条路径（`bin/dev.mjs desktop` → 本文件的 dev 分支 spawn 后端），
    //     于是本该是「可续的暂停」被当成「真中断」：DB 里实测落的是非热重载分支的
    //     「服务重启，任务被中断」，用户看到「刚发了个继续直接失败」。
    //   ⇒ 注入后两条 dev 启动路径口径一致（与 dev.cjs 同源，不臆造判据）。
    //   ★ 只加在 dev 分支：生产分支（下方 else）**不设** → 打包版行为完全不变。
    //
    // ★★★ 2026-10-11 删除 dev 分支的 WEB_DIST 注入（根治「dev 前端被旧快照冒充」）：
    //   原先这里注入 `WEB_DIST = <repo>/apps/web/dist`，但**该目录在仓库里从不存在**
    //   （monorepo 源码相对路径，dev 从未构建过 apps/web/dist）⇒ 后端 resolveWebDist()
    //   第 ① 条落空 ⇒ 退回第 ② 条"向上爬目录猜" ⇒ **恰好爬中 apps/desktop/dist
    //   （陈旧打包快照，存在）** ⇒ 后端把旧前端托管到 3001 ⇒ **盖掉 Vite (1420)**
    //   ⇒ 窗口加载的是旧快照，当天所有前端修复全部不生效（浏览器工具全挂、页面卡死）。
    //   ⇒ 修法：dev **不注入 WEB_DIST**（与 bin/dev.mjs、apps/server/scripts/dev.cjs 同源）。
    //     窗口走 Vite (1420) 热更新；resolveWebDist() 也已同步删除"爬目录猜"分支，
    //     dev 默认**不托管**前端。确需局域网访问 dev 前端时才显式给 YZ_SERVE_WEB_DIST。
    const tsxPath = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(tsxPath)) {
      console.log('[后端] 用 Electron Node.js + tsx 启动:', tsxPath);
      serverProcess = spawn(process.execPath, [tsxPath, 'watch', 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(API_PORT), YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: cdpEndpoint, YZ_HOT_RELOAD: '1', ...bridgeEnv, ...editionEnv, ...guardEnv, ...readLicenseCodesEnv() },
      });
    } else {
      // 回退：npx tsx（可能 ABI 不兼容，但至少能启动）
      console.warn('[后端] tsx CLI 未找到，回退到 npx tsx（可能 ABI 不兼容）');
      serverProcess = spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: String(API_PORT), YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: cdpEndpoint, YZ_HOT_RELOAD: '1', ...bridgeEnv, ...editionEnv, ...guardEnv, ...readLicenseCodesEnv() },
      });
    }
    serverProcess.on('error', (err) => console.error('后端启动失败:', err));
  } else {
    // 生产模式：用 Electron 作为 Node.js（ELECTRON_RUN_AS_NODE=1）运行后端编译产物
    const serverPath = path.join(process.resourcesPath, 'server', 'dist', 'apps', 'server', 'src', 'index.js');
    const dataDir = ensureServerDataDir();
    // 后端日志落盘：新电脑排障必须有据可查（黑屏时无控制台可见）
    const logPath = path.join(app.getPath('userData'), 'server.log');
    try { if (fs.statSync(logPath).size > 5 * 1024 * 1024) fs.unlinkSync(logPath); } catch {}
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
    logStream.write(`\n===== [${stamp()}] 后端启动 =====\n`);
    serverProcess = spawn(process.execPath, [serverPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(API_PORT), YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: cdpEndpoint, WEB_DIST: path.join(process.resourcesPath, 'server', 'web-dist'), ...(dataDir ? { DATA_DIR: dataDir } : {}), ...bridgeEnv, ...editionEnv, ...guardEnv, ...readLicenseCodesEnv() },
    });
    serverProcess.stdout.on('data', (d) => logStream.write(d));
    serverProcess.stderr.on('data', (d) => logStream.write(d));
    serverProcess.on('error', (err) => { logStream.write(`[${stamp()}] 后端进程启动失败: ${err.stack || err}\n`); console.error('后端启动失败:', err); });
    serverProcess.on('exit', (code) => logStream.write(`\n===== [${stamp()}] 后端退出 code=${code} =====\n`));
    console.log('后端服务器启动中:', serverPath);
  }
}

/** 获取应用图标路径（开发/打包两套目录）。
 *  ★ dev 用 icon-dev.bmp.ico 而非 icon.ico/icon.png（2026-10-05 Win32 实测）：
 *  仓库 icon.ico 是 PNG 压缩 ico、icon.png 是大尺寸 PNG —— 两者经 Electron 转 HICON
 *  后得到 24x24 / 1024x1024 的**坏图标**（WM_GETICON 实测渲染全黑），任务栏因此回退
 *  electron 默认图标。BMP 压缩多尺寸 ico（16-256）是 LoadImage 原生格式，必不翻车。
 *  打包版走 resourcesPath/icon.ico（electron-builder 有自己的 ico 处理链）不受影响。 */
function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  const bmpIco = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon-dev.bmp.ico');
  if (fs.existsSync(bmpIco)) return bmpIco;
  return path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico');
}

/** 创建主窗口 */
function createWindow() {
  // 防重入：窗口已存在且未销毁时直接返回
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    icon: getAppIconPath(),
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    frame: false,           // 无边框窗口（自定义标题栏）
    titleBarStyle: 'hidden',
    backgroundColor: '#1D1D1C',  // 匹配 dark 主题 --glass-bg，消除窗口创建到首屏渲染间的黑屏
    show: false,            // 延迟到 ready-to-show 再显示，彻底消除黑屏/闪烁
    // 不开 transparent：Windows 11 上 frame:false + 非 transparent 时 DWM 仍提供原生圆角+阴影，
    // 且 maximize/unmaximize 与边缘 resize 走原生 NCA，避免透明窗口下"全屏后缩不回/拖边缩不了"的 bug
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // webview 引擎：启用 <webview> 标签（DOM 内嵌，应用内浮层可覆盖网页）
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      // 最小化/隐藏窗口时暂停页面合成与导航事件 —— 会让"AI 上网查资料+用户最小化去干别的"时
      // guest 导航卡在 started 而 didn't-fire did-navigate，UI 还停在首页。关闭全局后台节流。
      backgroundThrottling: false,
      // ★ 把**主进程算好的** API 端口显式下发给渲染层（preload 读 process.argv）。
      //   为什么不用 process.env：直启 `electron .` 时环境里没有 YANZHI_API_PORT，
      //   主进程会算出实例默认（2026-10-10 起 dev/生产同为 3001），而 preload 读 env 可能取不到 → 两边不一致。
      //   用 additionalArguments 保证「主进程算什么、渲染层就用什么」。
      additionalArguments: ['--yz-api-port=' + API_PORT, ...(IS_DEV_INSTANCE ? ['--yz-dev-instance'] : [])],
    },
  });

  // ★★★ 渲染进程控制台落盘（2026-10-10）：浏览器面板（导航 / guest / BrowserView）的全部逻辑
  //   都在渲染层，其 `console.*` 只出现在 devtools —— 用户一关 devtools 就再无任何线索。
  //   这里挂 `console-message` 把 warn/error（及带 [browser] 前缀的信息）收进主进程日志。
  try { require('./main-log.cjs').attachRendererConsole(mainWindow.webContents, 'renderer'); } catch { /* 不影响启动 */ }

  // 页面首屏渲染完成后再显示窗口，配合 show:false 彻底消除黑屏
  mainWindow.once('ready-to-show', () => {
    // dev 下窗口 icon 再补一道运行时设置：构造参数 icon 在部分 Windows/驱动组合下
    // 不落到任务栏按钮（frame:false + 自定义 AUMID 时），setIcon 走 WM_SETICON 强制生效
    if (!app.isPackaged) {
      try {
        const iconPath = getAppIconPath();
        const iconOk = fs.existsSync(iconPath);
        console.log('[dev-icon]', iconPath, 'exists=' + iconOk);
        if (iconOk) mainWindow.setIcon(iconPath);
      } catch (e) { console.warn('[dev-icon] setIcon 失败:', e && e.message); }
    }
    mainWindow?.show();
    // ★ splash 生命周期收口：主窗真正可见后才销毁（无缝衔接，不白闪）。
    //   挂在 ready-to-show 里而非健康检查通过处 —— 建窗 ≠ 可见。
    destroySplashWindow();
  });

  // 关闭窗口时隐藏而非销毁（守护模式：后端保持运行，可通过托盘重新打开）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // 外链（http/https）用系统浏览器打开，避免在应用窗口内导航离开。
  // 例外：dev 模式下应用自身经 http://localhost:1420 提供 —— 同源导航（含 hash 路由）
  // 是应用内跳转，绝不能甩给系统浏览器（打包版走 file:// 无此问题，此坑只在 dev 暴露）。
  const isDevServe = process.argv.includes('--dev') && !app.isPackaged;
  const selfOrigin = isDevServe ? 'http://localhost:1420' : null;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[nav] window-open:', url);
    if (isSafeExternalUrl(url) && !(selfOrigin && url.startsWith(selfOrigin))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    console.log('[nav] will-navigate:', url, '| from:', current);
    if (!isSafeExternalUrl(url) || url === current) return;
    // dev 同源 = 应用自身，放行留在应用内（阻止被误判为外链）
    if (selfOrigin && url.startsWith(selfOrigin)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  // ★ 子帧（iframe）导航（2026-10-12 补）：Electron 33 起子帧**不再触发 will-navigate**，
  //   只触发 will-frame-navigate —— 上面那处主帧 handler 覆盖不到 iframe。
  //   应用自身页面里的 iframe 若跳自定义协议，同样会把 Shell 拉起来弹窗 ⇒ 一并拦。
  //   （同步的全局 web-contents-created 也会挂，这里是显式声明，便于阅读与单测锚定。）
  guardNavigation(mainWindow.webContents);

  // webview 引擎：guest 安全加固 —— 无论渲染层怎么声明，guest 一律无 node 集成 + 上下文隔离 +
  // 不加载任何 preload。外部网页永远拿不到 Node 能力与本地文件访问。
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegrationInWorker = false;
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    // ★★★ 原生弹窗（B4，2026-10-09）：webview 引擎的 guest 同样要禁用原生对话框。
    //   ★ 为什么必须在这里也加：webview 引擎下 guest 由渲染层的 <webview> 承载，
    //     其 webPreferences **由此钩子最终决定** —— 只改 BrowserView 那处会漏掉整个
    //     webview 引擎（两引擎并存是本项目的既定设计，见 isWebviewEngine()）。
    //   ★ 语义：页面 alert/confirm/prompt 被直接忽略（不阻塞 renderer 的 JS 执行），
    //     与服务端 Playwright"未注册 handler 时自动 dismiss"的行为对齐。
    webPreferences.disableDialogs = true;
  });

  // 渲染进程完整重载（HMR full-reload / F5）时，隐藏并摘除所有 BrowserView。
  // BrowserView 是主进程原生图层，生命周期不跟随渲染进程 DOM；HMR 只替换渲染模块、
  // 主进程 browserViews Map 不动，旧组件 onUnmounted 的 hide 可能因模块闭包替换而失效，
  // 导致预览面板已关、网页却还浮在窗口上。这里在导航起点统一摘除，是不依赖渲染状态的兜底。
  // SPA 内部路由（pushState）不会触发 did-start-navigation，不误伤。
  mainWindow.webContents.on('did-start-navigation', (_e, _url) => {
    for (const entry of browserViews.values()) {
      if (!entry.view) continue;
      entry.visible = false;
      entry.bounds = null;
      applyVisibility(entry);
    }
  });

  // 渲染层重载完成（did-finish-load）后通知渲染层"重认领"BrowserView。
  // did-start-navigation 兜底摘除后，恢复完全依赖渲染层重挂链路；若 BrowserPanel
  // 已挂载但占位尺寸无变化、ResizeObserver 不再触发，会一直停在摘除态（黑屏/首页占位）。
  // 此事件让渲染层主动重跑一次 bounds 同步闸门，补齐"任何一环断了"的最后一环。
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:resync');
    }
  });

  // 右键菜单：在可编辑区域（输入框/textarea）显示剪切/复制/粘贴/全选
  // 注意「全选」不能用 role:'selectAll' —— 它会全选整个应用文档（弹窗底下的界面一起选中）。
  // 这里改为限定作用域：输入框内只选该输入框；其余按渲染层 selectAllScope 的容器规则选。
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const template = [
      { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
      { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
      { type: 'separator' },
      {
        label: '全选',
        click: () => {
          mainWindow.webContents.executeJavaScript(
            '(() => { const a = document.activeElement; if (!a) return;' +
            ' if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) { a.select(); return; }' +
            ' if (document.execCommand) document.execCommand("selectAll", false); })()'
          ).catch(() => {});
        },
      },
    ];
    Menu.buildFromTemplate(template).popup(mainWindow);
  });

  // 拦截主窗口键盘事件：当 BrowserView 可见时，Ctrl+R/F5 刷新 BrowserView 而非主窗口
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const entry = activeTabId ? browserViews.get(activeTabId) : null;
    if (!entry || !entry.attached) return;
    const bv = entry.view;
    const key = input.key.toLowerCase();
    // Ctrl+R 或 F5 → 刷新 BrowserView
    if ((input.control && key === 'r') || key === 'f5') {
      event.preventDefault();
      bv.webContents.reload();
    }
    // Alt+Left → 后退
    if (input.alt && key === 'arrowleft') {
      event.preventDefault();
      if (bv.webContents.navigationHistory?.canGoBack?.() || bv.webContents.canGoBack?.()) {
        bv.webContents.goBack();
      }
    }
    // Alt+Right → 前进
    if (input.alt && key === 'arrowright') {
      event.preventDefault();
      if (bv.webContents.navigationHistory?.canGoForward?.() || bv.webContents.canGoForward?.()) {
        bv.webContents.goForward();
      }
    }
  });

  // --dev 标志：用 Vite dev server；默认加载 dist/index.html（preview/production）
  const forceDev = process.argv.includes('--dev');
  const isDev = forceDev && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:1420');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 预览/生产模式：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // 窗口几何变化后同步 BrowserView。分两类处理：
  //
  // 【强制重挂】restore / maximize / unmaximize / show / 进出全屏 ——
  //   Windows 下这些操作后 GPU 合成层不会自动重绘 BrowserView，表现为黑块残留或
  //   bounds 错位；必须摘了再挂（removeBrowserView + setBrowserView）强制重新合成。
  //   这些是离散事件，摘挂代价可接受。
  //
  // 【仅更新 bounds】resize ——
  //   拖拽边缘缩放时每帧触发，逐帧摘挂会明显闪烁；此处只走 applyVisibility
  //   （已 attached 时仅 setBounds），配合渲染层 ResizeObserver 的 100ms 节流兜住露白。
  for (const ev of ['restore', 'maximize', 'unmaximize', 'show', 'enter-full-screen', 'leave-full-screen']) {
    mainWindow.on(ev, () => {
      scheduleBoundsRefresh(true);
      // 同时让渲染层重跑一次同步闸门：若隐藏期间 entry 已被置为
      // visible=false / bounds=null（如 0 尺寸 resize 的墓碑态），
      // 上面的强制重挂会直接跳过它且永远等不到 ResizeObserver（窗口隐藏期间
      // 布局不变），只有渲染层重新上报有效 bounds 才能复活，否则该区域永久黑屏。
      notifyRendererResync();
    });
  }
  mainWindow.on('resize', () => scheduleBoundsRefresh(false));

  mainWindow.on('closed', () => {
    if (boundsRefreshTimer) { clearTimeout(boundsRefreshTimer); boundsRefreshTimer = null; }
    if (tabIdleTimer) { clearInterval(tabIdleTimer); tabIdleTimer = null; } // R4：停掉空闲卸载巡检
    // 清理所有 BrowserView
    for (const [id, entry] of browserViews) {
      try { entry.view?.webContents?.destroy?.(); } catch {} // R4：挂起态 view 为 null
    }
    browserViews.clear();
    activeTabId = null;
    mainWindow = null;
  });

  // BrowserView 延迟创建：只在用户首次导航时才创建，避免白屏覆盖主窗口
}

// ============================================================
// BrowserView：嵌入外部网页（替代 <webview> 标签，支持精确 setBounds）
// 多标签页：每个 tabId 对应一个独立 BrowserView 实例
// ============================================================
/**
 * 为 entry 创建底层 BrowserView 实例并挂接全部 wc 事件。
 * 首次创建与挂起复活（R4）共用此函数，保证两条路径行为一致
 * （崩溃重载 / 滚动条注入 / 缩放回放 / 快捷键拦截）。
 */
function createBrowserViewFor(tabId, entry) {
  const bv = new BrowserView({
    webPreferences: {
      // 持久化 partition：cookie/localStorage 落盘，跨会话保留登录态（如即梦扫码登录后无需重复扫码）
      partition: 'persist:browser-view',
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      // ★★★ 原生弹窗（B4，2026-10-09）：**禁用页面原生对话框**。
      //
      // ★ 缺口（实测）：桌面端此前无任何 dialog 处理 →
      //   页面弹 `window.alert/confirm/prompt` 时会**同步阻塞该 renderer 的 JS 执行**，
      //   pageAgent 后续所有 `executeJavaScript` / `capturePage` 一起挂起到 18s 总闸
      //   （甚至永久）—— 用户体感是"浏览器工具突然全部卡死"。
      // ★ 为什么服务端没这问题：Playwright **未注册 dialog handler 时会自动 dismiss**，
      //   同一页面在服务端链路正常 ⇒ 两链路行为不一致（B6/B7 同族）。
      // ★ 用**官方选项**而不是自己猜 API：`disableDialogs` 是 Electron webPreferences 的
      //   正式字段（"Whether to disable dialogs completely. Overrides safeDialogs."）
      //   ⇒ 页面调用 alert/confirm/prompt 会被直接忽略（不再阻塞），
      //     且 `beforeunload` 的确认也不会拦住导航。与服务端"自动 dismiss"语义对齐。
      disableDialogs: true,
      // 显式背景色：避免未加载/加载失败时默认黑底
      backgroundColor: '#ffffff',
    },
  });
  entry.view = bv;
  entry.attached = false;
  // 初始不挂载到主窗口（延迟到激活 + 有有效 bounds 时由 applyVisibility 挂载）
  bv.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  const wc = bv.webContents;

  // 页面 title 变化 → 推送渲染层更新 tab 标题（真实网站名，而非 URL fallback）
  wc.on('did-page-title-updated', (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:pageTitle', tabId, title);
    }
  });

  // persist partition 的 HTTP 磁盘缓存损坏会导致 BrowserView 渲染全黑（Windows 常见）。
  // clearCache 只清 HTTP 缓存，不清 cookie/localStorage，登录态不受影响。
  // 注意：必须 await 完成后再放行 loadURL —— clearCache 与页面加载并发会中止加载（ERR_ABORTED -3）导致黑屏。
  entry.cacheClearPromise = wc.session.clearCache().catch(() => { /* ignore */ });

  // 渲染进程崩溃（GPU/内存等）后页面变黑且不再响应：自动重载恢复。
  // 三个必须处理的点：
  //   1) 次数上限 —— 页面本身有问题（死循环/OOM）时无限重载会打转，吃满 CPU
  //   2) 事件去重 —— Electron 新版 render-process-gone 与 crashed 会同时触发，
  //      不去掉重则计数翻倍、reload 跑两遍
  //   3) 通知前端 —— 重载期间右栏空白且 loading 转圈不停，超限后需让前端收尾
  let crashCount = 0;
  let lastCrashAt = 0;
  const CRASH_RELOAD_LIMIT = 3;
  const CRASH_DEDUPE_MS = 1000;

  function onBrowserViewCrash(reason) {
    const now = Date.now();
    if (now - lastCrashAt < CRASH_DEDUPE_MS) return;   // 双事件去重
    lastCrashAt = now;
    crashCount += 1;
    console.warn(`[browserView] render-process-gone (${crashCount}/${CRASH_RELOAD_LIMIT}):`, reason);
    if (crashCount > CRASH_RELOAD_LIMIT) {
      // 超过上限：停止自动重载，通知渲染层收尾（停 loading / 显示错误态）
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browserView:crashed', tabId, reason || 'unknown');
      }
      return;
    }
    try { wc.reload(); } catch { /* ignore */ }
  }

  wc.on('render-process-gone', (_e, details) => onBrowserViewCrash(details?.reason));
  wc.on('crashed' /* 兼容旧事件名 */, () => onBrowserViewCrash('crashed'));

  // 监听导航事件，通知前端地址栏更新（带 tabId）
  wc.on('did-navigate', (_e, url) => {
    entry.url = url; // R4：挂起卸载后靠它复活
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:navigated', tabId, url);
    }
  });
  wc.on('did-navigate-in-page', (_e, url) => {
    entry.url = url; // R4：同上
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:navigated', tabId, url);
    }
  });

  // ★ 自定义协议闸门（2026-10-09 初版 / 2026-10-12 收口）：BrowserView 引擎的 guest 此前只挂了
  //   setWindowOpenHandler（拦 window.open/target=_blank），没拦页面自身的导航 ——
  //   pageAgent 点击 bitbrowser:// / tel: / mailto: 等未知协议链接时，Electron 把
  //   导航交给系统 Shell → 本机无处理器 → Windows 反复弹「没有可打开此链接的应用」。
  //   ★ 2026-10-12：改用 url-guard.cjs 的 guardNavigation 统一装配（同时挂
  //     will-navigate + will-frame-navigate）—— 子帧 iframe 只触发后者（实测），
  //     旧版只挂 will-navigate 时推广位 iframe 会漏网（用户报"还是会出来"的真因）。
  guardNavigation(wc);
  // 页面加载完成，通知前端
  wc.on('did-finish-load', () => {
    // 成功渲染后清零崩溃计数：只有"连续"崩溃才停手，偶尔一次崩溃不应永久拉黑页面
    crashCount = 0;
    // 反自动化检测：移除 navigator.webdriver 等特征，避免百度等站点触发验证码
    try {
      wc.executeJavaScript(`(function(){
        try { Object.defineProperty(navigator,'webdriver',{get:function(){return false;}}); } catch(e){}
        try { Object.defineProperty(navigator,'languages',{get:function(){return ['zh-CN','zh','en'];}}); } catch(e){}
        try { Object.defineProperty(navigator,'plugins',{get:function(){return [1,2,3,4,5];}}); } catch(e){}
      })()`).catch(function(){});
    } catch (e) {}
    // 导航到新页面会重置已注入的 CSS，需重新注入自定义滚动条 + 虚拟鼠标
    injectScrollbarCss(tabId);
    // 跨源导航会重置页面缩放，按 entry.zoomFactor 回放，避免 UI 百分比与实际缩放脱节
    if (entry.zoomFactor && entry.zoomFactor !== 1) {
      try { wc.setZoomFactor(entry.zoomFactor); } catch { /* ignore */ }
    }
    injectYzAssistant(wc);
    entry.url = wc.getURL(); // R4：挂起卸载后靠它复活
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:loaded', tabId, wc.getURL());
    }
  });

  // 拦截 BrowserView 内的快捷键：Ctrl+R/F5 刷新、Alt+Left/Right 导航
  wc.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    // Ctrl+R 或 F5 → 刷新
    if ((input.control && key === 'r') || key === 'f5') {
      event.preventDefault();
      wc.reload();
    }
    // Alt+Left → 后退
    if (input.alt && key === 'arrowleft') {
      event.preventDefault();
      if (wc.navigationHistory?.canGoBack?.() || wc.canGoBack?.()) wc.goBack();
    }
    // Alt+Right → 前进
    if (input.alt && key === 'arrowright') {
      event.preventDefault();
      if (wc.navigationHistory?.canGoForward?.() || wc.canGoForward?.()) wc.goForward();
    }
  });

  // 弹窗拦截：BrowserView 内页面请求 window.open / target=_blank / 中键新开时，
  // 在预览面板同空间新开一个 tab 承载新页面，而不是弹出独立 BrowserWindow。
  // （此前未设置该 handler，Electron 默认行为是弹新窗口 —— pageAgent 点击
  // "新标签打开"的链接时会突然弹出系统级浏览器弹窗，脱离预览执行面。）
  wc.setWindowOpenHandler(({ url }) => {
    try {
      if (/^https?:\/\//i.test(url)) {
        evictLruTabIfNeeded();
        const newTabId = 'tab-' + (++tabSeq);
        ensureBrowserView(newTabId);
        const ne = browserViews.get(newTabId);
        if (ne) ne.scope = entry.scope || 'preview';
        activateTab(newTabId);
        ensureFallbackBounds(ne);
        try { ne?.view?.webContents?.loadURL?.(url).catch(() => {}); } catch { /* ignore */ }
        // 广播给渲染层补建 tab 壳（与 ensureActiveTab 兜底自建同一协议），预览面板即时可见
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browserView:tabCreated', newTabId, url, entry.scope || 'preview');
        }
      }
    } catch { /* ignore */ }
    return { action: 'deny' };
  });

  return bv;
}

/** 按需为指定标签创建 BrowserView 并附加到主窗口（延迟创建，避免初始白屏）；挂起态自动复活 */
function ensureBrowserView(tabId) {
  if (!tabId) return null;
  const existing = browserViews.get(tabId);
  if (existing) {
    // R4 挂起复活：只重建视图不导航 —— activateTab 会补 loadURL(entry.url)，load 路径直接加载新地址。
    // 复活一个就多一个 webContents，先按 LRU 腾位（当前激活 tab 永不逐出），保证存活 ≤ MAX_TABS。
    if (existing.suspended || !existing.view) {
      if (!mainWindow || mainWindow.isDestroyed()) return null;
      evictLruTabIfNeeded();
      createBrowserViewFor(tabId, existing);
      existing.suspended = false;
    }
    return existing.view;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const entry = {
    view: null,
    cacheClearPromise: null,
    scrollbarCssKey: null,
    attached: false,
    visible: false,
    bounds: null,
    zoomFactor: 1, // 缩放单一真相源：setZoomFactor 写入，did-finish-load 跨源导航后回放
    url: null,                    // R4：最近导航地址，挂起卸载后靠它复活
    lastActiveAt: Date.now(),     // R4：LRU 逐出 / 空闲卸载 / closeTab 顶替的排序依据
    suspended: false,             // R4：true = webContents 已销毁、tab 壳保留
    ownerWindow: mainWindow,      // R6：多窗口预留（单窗口下与模块级 mainWindow 等价）
  };
  browserViews.set(tabId, entry);
  scheduleTabIdleCheck();
  return createBrowserViewFor(tabId, entry);
}

// ============================================================
// R4：tab 内存管理 —— webContents 上限 + LRU 逐出 + 空闲卸载 + 挂起复活
// 每个 tab 一个完整渲染进程（Chromium 约 60~120MB），不设上限开 15 个就是 1~2GB。
// 挂起 = 销毁 webContents 释放内存，保留 entry（url/zoom/bounds），tab 壳不消失；
// 激活时复活重建。滚动位置/表单内容明确不保留（要保留得存 sessionStorage 快照，成本不值）。
// ============================================================

/** 挂起指定 tab：摘除 + 销毁 webContents（挂起目标本就应是非激活 tab，摘除是保险） */
function suspendBrowserViewEntry(tabId, entry) {
  if (!entry || entry.suspended || !entry.view) return;
  entry.visible = false;
  applyVisibility(entry);
  try { entry.view.webContents?.destroy?.(); } catch { /* ignore */ }
  entry.view = null;
  entry.suspended = true;
  entry.attached = false;
  entry.scrollbarCssKey = null; // 文档已随 webContents 销毁，key 失效；复活后 did-finish-load 重注入
}

/** 当前存活（未挂起）的 webContents 数 */
function countLiveEntries() {
  let n = 0;
  for (const e of browserViews.values()) if (!e.suspended && e.view) n++;
  return n;
}

/** 超限按 LRU 挂起最久未激活的非当前 tab（当前激活 tab 永不逐出） */
function evictLruTabIfNeeded() {
  let guard = 0;
  while (countLiveEntries() >= MAX_TABS && guard++ < 32) {
    let lruId = null, lruAt = Infinity;
    for (const [id, e] of browserViews) {
      if (e.suspended || !e.view) continue;
      if (id === activeTabId) continue;
      if (tabActionBusy.has(id)) continue;        // ★ 正在跑动作：不逐（见 tabActionBusy 注释）
      const t = e.lastActiveAt || 0;
      if (t < lruAt) { lruAt = t; lruId = id; }
    }
    if (!lruId) break; // 只剩当前激活 tab，无处可逐
    console.log('[browserView] LRU 逐出挂起:', lruId);
    suspendBrowserViewEntry(lruId, browserViews.get(lruId));
  }
}

/**
 * webview 引擎的 tab 上限收口（2026-10-10 三次根因修复）。
 *
 * ★★★ 为什么必须：`evictLruTabIfNeeded` / `MAX_TABS` / 空闲巡检**只遍历 `browserViews`**
 *   （旧 BrowserView 引擎），webview 分支此前是**无保护缺口**。而 webview 引擎下
 *   **每个 tab = 渲染层一个 `<webview>` = 一个 Chromium 渲染进程**，
 *   agent 反复重试（或任何 tab 泄漏路径）会无上限堆积 ⇒ `MaxListenersExceededWarning`
 *   + CPU/内存爆炸 ⇒ **整个应用卡死**（用户实报"pageAgent 一跑就卡住"）。
 *
 * ★ 与 BrowserView 版的关键差异：这里**不能"挂起保留壳"**（guest 归渲染层所有），
 *   必须**真正移除 + 广播 tabClosed** 让渲染层销毁 `<webview>` 元素 → 否则进程不释放。
 *   保护的 tab：当前激活 tab、本会话 agent 正在用的锚定 tab（防逐出正在操作的页）。
 */
function evictLruWebviewTabIfNeeded() {
  let guard = 0;
  while (webviewTabs.size >= MAX_TABS && guard++ < 32) {
    let lruId = null, lruAt = Infinity;
    // 受保护的 tab：当前激活 + 正被某会话锚定的（防逐出 agent 正在操作的页）
    const pinned = new Set(convAnchors.values());
    for (const [id, t] of webviewTabs) {
      if (id === activeTabId) continue;                       // 当前激活：永不逐
      if (pinned.has(id)) continue;                           // 正被某会话锚定：永不逐
      if (tabActionBusy.has(id)) continue;                    // ★ 正在跑动作：永不逐（见 tabActionBusy 注释）
      const at = t.lastActiveAt || 0;
      if (at < lruAt) { lruAt = at; lruId = id; }
    }
    if (!lruId) break; // 只剩受保护的 tab，无处可逐
    console.log(`[browserView] LRU 逐出 webview tab: ${lruId}（当前 ${webviewTabs.size} 个）`);
    webviewTabs.delete(lruId);
    // 让渲染层销毁对应 <webview> 元素（不广播的话元素与 guest 进程都会残留）
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browserView:tabClosed', lruId);
      }
    } catch { /* ignore */ }
    // 锚/touched 记账一并失效（唯一收口，避免留下幽灵 tabId）
    clearFlowAnchorsForTab(lruId);
    clearFormSnapshot(lruId);   // 表单快照同生命周期（防 Map 随长时间运行累积）
  }
}

// 空闲卸载巡检：每分钟扫一次，非激活且超过 TAB_IDLE_UNLOAD_MS 未用即挂起
let tabIdleTimer = null;
function scheduleTabIdleCheck() {
  if (tabIdleTimer) return;
  tabIdleTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, e] of browserViews) {
      if (e.suspended || !e.view) continue;
      if (id === activeTabId) continue;
      if (tabActionBusy.has(id)) continue;        // ★ 正在跑动作：不挂起（见 tabActionBusy 注释）
      if (now - (e.lastActiveAt || 0) > TAB_IDLE_UNLOAD_MS) {
        console.log('[browserView] 空闲卸载挂起:', id, e.url || '');
        suspendBrowserViewEntry(id, e);
      }
    }
    // ★★★ webview 引擎空闲回收（2026-10-13，内存治理 A）：
    //   旧巡检只遍历 browserViews —— 而现役引擎是 webview（每 tab = 一个完整 Chromium
    //   渲染进程）。实测（会话 253bd3f4）：弹窗转出的 tab-2 全天 0 次使用却白挂 8 小时
    //   （≈0.5GB）。这里对 webview 补同一语义：非激活、未被任何会话锚定、空闲超过
    //   TAB_IDLE_UNLOAD_MS 的 tab，广播 tabClosed 让渲染层销毁 <webview> 元素（壳与
    //   url 由渲染层 tab 记账保留，切回时按 url 重载）——与 LRU 逐出同一条链路，行为一致。
    if (isWebviewEngine()) {
      const pinned = new Set(convAnchors.values());
      for (const [id, t] of webviewTabs) {
        if (id === activeTabId) continue;           // 当前激活：不回收
        if (pinned.has(id)) continue;               // 某会话锚定（agent 正在操作）：不回收
        if (tabActionBusy.has(id)) continue;        // ★ 正在跑动作：不回收（见 tabActionBusy 注释）
        if ((t.lastActiveAt || 0) > now - TAB_IDLE_UNLOAD_MS) continue;
        console.log('[browserView] webview 空闲回收:', id, '（空闲超过', TAB_IDLE_UNLOAD_MS / 60000, '分钟）');
        try {
          webviewTabs.delete(id);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browserView:tabClosed', id);
          }
        } catch { /* ignore */ }
        clearFlowAnchorsForTab(id);
        clearFormSnapshot(id);
      }
    }
    // ★★★ 后台 tab 降帧（2026-10-13，内存/卡顿治理 C）：
    //   主窗口 backgroundThrottling 全局关闭（防最小化导航卡死，见 WebPreferences 注释），
    //   代价是后台 tab 的渲染合成全速跑——重页面（抖音等长列表 + 定时器）把渲染主线程
    //   拖住是"任务一跑界面就卡"的传导链第一环。这里按帧率维度补局部节流：
    //   非激活/未锚定 guest 降到 1fps（定时器仍跑，但合成开销趋零），激活/锚定恢复满帧。
    if (isWebviewEngine()) {
      const pinned2 = new Set(convAnchors.values());
      for (const [id, t] of webviewTabs) {
        try {
          const g = t.wcId ? webContents.fromId(t.wcId) : null;
          if (!g || g.isDestroyed()) continue;
          const isActive = id === activeTabId;
          const isPinned = pinned2.has(id);
          const target = (isActive || isPinned) ? 60 : 1;
          if (typeof g.setFrameRate === 'function' && g.getFrameRate && g.getFrameRate() !== target) {
            g.setFrameRate(target);
          }
          // ★ 顺带清 HTTP 磁盘/内存缓存（B3，内存治理）：空闲即非工作集，cache 可随时重下，
          //   cookie/localStorage/登录态不受影响。空闲超过 10 分钟的 tab 通常累积了
          //   几十~上百 MB 图片缓存。每次巡检只对"上次清理距今 >5 分钟"的执行，避免反复清。
          if (!isActive && !isPinned && (now - (t.lastActiveAt || 0) > TAB_IDLE_UNLOAD_MS)) {
            if (!(t.__lastCacheClear) || now - t.__lastCacheClear > 5 * 60 * 1000) {
              t.__lastCacheClear = now;
              g.session.clearCache().catch(() => { /* 清理失败不影响 */ });
            }
          }
        } catch { /* ignore */ }
      }
    }
  }, 60 * 1000);
}

/**
 * 唯一收敛函数：把 entry 的实际挂载态对齐到「可见意图 && 有有效 bounds」。
 * 所有改变挂载态的地方都必须调它，业务代码不得自行 setBrowserView / setBounds(0,0,0,0)。
 */
function applyVisibility(entry) {
  if (!entry || !entry.view) return; // R4：挂起态无视图，无挂载可言
  const win = entry.ownerWindow || mainWindow; // R6：优先 entry 记录的宿主窗口
  if (!win || win.isDestroyed()) return;
  const b = entry.bounds;
  const hasValidBounds = !!b && b.width >= 1 && b.height >= 1;
  const shouldShow = !!entry.visible && hasValidBounds;

  if (shouldShow) {
    if (!entry.attached) {
      try {
        win.setBrowserView(entry.view);
        entry.attached = true;
      } catch { return; }
    }
    try {
      entry.view.setBounds({
        x: Math.round(b.x), y: Math.round(b.y),
        width: Math.round(b.width), height: Math.round(b.height),
      });
    } catch { /* ignore */ }
    // 恢复渲染节流关闭，保证页面正常绘制
    try { entry.view.webContents.setBackgroundThrottling(false); } catch { /* ignore */ }
    // R3：可见即恢复发声（与摘除静音成对出现）
    if (MUTE_ON_DETACH) { try { entry.view.webContents.setAudioMuted(false); } catch { /* ignore */ } }
    return;
  }

  if (entry.attached) {
    // 双保险摘除：removeBrowserView 会触发 GPU 合成层清理，根治 Windows 下的图层残留；
    // 老版本 Electron 可能没有该 API，回退到 setBrowserView(null)。
    try { win.removeBrowserView(entry.view); } catch { /* ignore */ }
    try { win.setBrowserView(null); } catch { /* ignore */ }
    try { entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } catch { /* ignore */ }
    try { entry.view.webContents.setBackgroundThrottling(true); } catch { /* ignore */ }
    // R3：摘除即静音 —— 收起右栏/切走 tab 后视频音乐不再出声（开关 MUTE_ON_DETACH）
    if (MUTE_ON_DETACH) { try { entry.view.webContents.setAudioMuted(true); } catch { /* ignore */ } }
    entry.attached = false;
  }
}

/**
 * 窗口几何变化后强制重挂所有可见 BrowserView。
 * Windows 下窗口最小化恢复 / 最大化还原时，GPU 合成层不会自动重绘 BrowserView，
 * 表现为黑块残留或 bounds 错位；单纯 setBounds 不触发重绘，
 * 必须先摘除（removeBrowserView + setBrowserView(null)）再经 applyVisibility 挂回。
 */
function refreshAllBrowserViewBounds(forceReattach = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const entry of browserViews.values()) {
    if (!entry.visible || !entry.view) continue; // R4：挂起态无视图，跳过
    // 无有效 bounds（首次导航、渲染层还没同步过）时先兜底一个矩形：
    // 否则下面强制摘挂后会因"无尺寸可挂"直接不挂载，且 DOM 尺寸没变化不会再触发
    // ResizeObserver，页面就此永久消失。
    if (!entry.bounds) ensureFallbackBounds(entry);
    const win = entry.ownerWindow || mainWindow; // R6
    // 只有 forceReattach 才摘了重挂：拖拽边缘缩放时每帧摘挂会明显闪烁，
    // 那种场景只需要更新 bounds（applyVisibility 在已 attached 时只调 setBounds）。
    if (forceReattach && entry.attached) {
      try { win.removeBrowserView(entry.view); } catch { /* ignore */ }
      try { win.setBrowserView(null); } catch { /* ignore */ }
      entry.attached = false;
    }
    applyVisibility(entry);
    // 强制重挂后主动触发一次重绘：窗口隐藏/最小化恢复后，BrowserView 的
    // webContents 可能被合成器标记为「无需产出新帧」，仅摘挂偶发仍显示黑块，
    // invalidate 强制其立即重绘一帧（幂等，重复调用无副作用）。
    if (forceReattach) {
      try { entry.view.webContents.invalidate?.(); } catch { /* ignore */ }
    }
  }
}

/**
 * 窗口几何事件的合并器：拖拽边缘缩放时 resize 每帧触发，
 * 逐个重挂会造成明显闪烁，统一合并到 50ms 后执行一次。
 */
let boundsRefreshTimer = null;
let boundsRefreshForce = false;

/** 通知渲染层重跑 BrowserView 可见性/bounds 同步闸门（did-finish-load 兜底同款通道） */
function notifyRendererResync() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  try { win.webContents.send('browserView:resync'); } catch { /* ignore */ }
}

function scheduleBoundsRefresh(forceReattach = false) {
  // 合并期间只要有一次请求强制重挂，就按强制处理（不能让后续的轻量 resize 把它降级）
  boundsRefreshForce = boundsRefreshForce || forceReattach;
  if (boundsRefreshTimer) return;
  boundsRefreshTimer = setTimeout(() => {
    boundsRefreshTimer = null;
    const force = boundsRefreshForce;
    boundsRefreshForce = false;
    refreshAllBrowserViewBounds(force);
  }, 50);
}

/** 首次导航时渲染层可能还没同步过 bounds，给一个兜底矩形，避免挂载后被判为不可见 */
function ensureFallbackBounds(entry) {
  if (!entry || entry.bounds) return;
  const win = entry.ownerWindow || mainWindow; // R6
  if (!win || win.isDestroyed()) return;
  try {
    const [w, h] = win.getContentSize();
    let bounds;
    if (lastGoodBounds && lastGoodBounds.width > 0 && lastGoodBounds.height > 0) {
      // 复用最近一次有效矩形（来自 resize），比写死 480px 准确，跨 session 仍合法
      bounds = { ...lastGoodBounds };
    } else {
      const width = Math.min(480, Math.max(1, w));
      bounds = { x: Math.max(0, w - width), y: 0, width, height: Math.max(1, h) };
    }
    entry.bounds = bounds;
    applyVisibility(entry);
  } catch { /* ignore */ }
}

/** 激活指定标签：显示其 BrowserView，隐藏其他所有标签的 BrowserView */
function activateTab(tabId) {
  // 1) 先把其他标签全部摘除：setBrowserView 是单槽，必须先清场再挂目标
  for (const [id, entry] of browserViews) {
    if (id !== tabId) {
      entry.visible = false;
      applyVisibility(entry);
    }
  }
  // 2) 再挂目标标签（有 bounds 才挂，没有则等渲染层下一次 resize）
  activeTabId = tabId;
  const entry = browserViews.get(tabId);
  if (entry) {
    // R4 挂起复活：ensureBrowserView 内部会先 LRU 腾位再重建视图，
    // 这里补懒加载记忆的 url。加载失败回退为空白页（不静默崩溃），用户可刷新/重输地址。
    if (entry.suspended || !entry.view) {
      ensureBrowserView(tabId);
      if (entry.url && entry.view) {
        entry.view.webContents.loadURL(entry.url).catch(() => { /* ignore */ });
      }
    }
    entry.lastActiveAt = Date.now();
    entry.visible = true;
    applyVisibility(entry);
  }
}

// BrowserView 自定义滚动条（隐藏默认 + 圆角自定义），按网页自身背景亮度选色
function scrollbarCssForTheme(theme) {
  const dark = theme === 'dark';
  const thumb = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
  const thumbHover = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
  return `
    ::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
    ::-webkit-scrollbar-track { background: transparent !important; }
    ::-webkit-scrollbar-thumb {
      background-color: ${thumb} !important;
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: ${thumbHover} !important; background-clip: padding-box; }
    ::-webkit-scrollbar-corner { background: transparent !important; }
  `;
}

// 检测网页根/body 背景亮度，判断是否深色页面（避免暗色应用主题下浅色网页滚动条看不清）
async function detectPageDark(wc) {
  try {
    const dark = await wc.executeJavaScript(`(function(){
      try {
        function lum(c){ var m=c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m) return 255; return 0.299*(+m[1])+0.587*(+m[2])+0.114*(+m[3]); }
        var s = lum(getComputedStyle(document.documentElement).backgroundColor);
        var b = lum(getComputedStyle(document.body).backgroundColor);
        return Math.min(s, b) < 128;
      } catch(e){ return false; }
    })()`);
    return !!dark;
  } catch { return false; }
}

async function injectScrollbarCss(tabId) {
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry || !entry.view) return; // R4：挂起态无视图；复活后 did-finish-load 会重注入
  const bv = entry.view;
  await injectScrollbarForWC(bv.webContents, { keyHolder: entry });
}

// 统一的滚动条注入本体：BrowserView 的 guest(bv.webContents) 与 webview 引擎的 guest(fromId) 共用。
// 目标观感一致：隐藏原生粗白条 → 注入半透明细圆角 overlay 滚动条，并随网页深浅背景自动选色。
// 这是对 guest 本身 insertCSS（仅操纵该页样式，无 node/无 IPC 暴露），不新增任何外部攻击面。
async function injectScrollbarForWC(wc, opts = {}) {
  const keyHolder = opts.keyHolder || null;
  try {
    if (!wc) return;
    const keyProp = keyHolder ? () => keyHolder.scrollbarCssKey : () => wc.__yzScrollbarCssKey;
    const setKey = keyHolder ? (k) => { keyHolder.scrollbarCssKey = k; } : (k) => { wc.__yzScrollbarCssKey = k; };
    const cur = keyProp();
    if (cur && typeof wc.removeInsertedCSS === 'function') {
      try { await wc.removeInsertedCSS(cur); } catch { /* ignore */ }
      setKey(null);
    }
    const pageDark = await detectPageDark(wc);
    const key = await wc.insertCSS(scrollbarCssForTheme(pageDark ? 'dark' : 'light'));
    setKey(key);
  } catch { /* 跨域/页面未就绪时忽略 */ }
}

// ============================================================
// IPC：窗口控制（自定义标题栏按钮调用）
// ------------------------------------------------------------
// ★ 一律按 **事件发起方所在窗口** 解析（winOf），不能固定操作 mainWindow：
//   子窗口（diff 独立窗口）复用同一套 preload，若这里写死 mainWindow，
//   在子窗口点最小化/最大化会作用到主窗口上。
// ============================================================
/**
 * 取事件发起方所在的窗口。
 * 注意：主窗口若已被销毁，BrowserWindow.fromWebContents 仍可能返回子窗口，
 * 因此这里只在「确实解析不到」时才回落到 mainWindow。
 */
function winOf(event) {
  try {
    return BrowserWindow.fromWebContents(event.sender) || mainWindow;
  } catch {
    return mainWindow;
  }
}

/** 子窗口登记表：key → BrowserWindow（同 key 只允许一个，重复打开则聚焦） */
const childWindows = new Map();

/** 取子窗口的 URL：与主窗口同源同路径，只换 hash（dev 是 http，打包是 file）
 *  带上 szwin=1 标记：渲染层据此知道「自己跑在独立子窗口里」，
 *  从而渲染「回到主窗口」这类只在子窗口才成立的操作。 */
function childUrl(hashRoute) {
  const base = mainWindow?.webContents.getURL() || '';
  const clean = base.split('#')[0];
  if (!clean) return null; // 主窗口还没就绪（正常不会走到）
  const sep = hashRoute.includes('?') ? '&' : '?';
  return `${clean}#${hashRoute}${sep}szwin=1`;
}

ipcMain.on('window-minimize', (event) => winOf(event)?.minimize());
ipcMain.on('window-maximize', (event) => {
  const w = winOf(event);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.on('window-close', (event) => {
  const w = winOf(event);
  // 主窗口关闭 = 隐藏到托盘（守护模式）；子窗口关闭 = 真正关闭
  if (w && w !== mainWindow) w.close();
  else mainWindow?.close();
});
ipcMain.handle('window-is-maximized', (event) => winOf(event)?.isMaximized() || false);
// splash 状态回拉：splash 渲染层加载完成后立即取一次最新推送，避免错过已发状态
ipcMain.handle('splash:get-last-update', () => splashLastUpdate);
// 界面刷新（顶栏刷新按钮）：走 webContents.reloadIgnoringCache 而非渲染层 location.reload()，
// 前者会丢弃渲染进程缓存的旧资源，界面卡死/白屏后更容易恢复
ipcMain.on('window-reload', (event) => winOf(event)?.webContents.reloadIgnoringCache());

// ============================================================
// IPC：独立子窗口（diff / 冲突解决等需要「像 IDE 那样另开一个窗口」的场景）
// ------------------------------------------------------------
// 设计要点：
//   · 子窗口复用主窗口的 preload，窗口控制通道按 winOf 解析（见上）。
//   · 加载同一应用的专用 hash 路由，不需要另建打包入口。
//   · 非模态：不设 parent，可自由拖到另一块屏幕 / 与主窗口并排（IDE 的 separate window 语义）。
// ============================================================
ipcMain.handle('child-window:open', (event, opts = {}) => {
  const key = String(opts.key || 'default');
  const route = String(opts.route || '/diff-window');
  const existing = childWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return { ok: true, reused: true };
  }
  const url = childUrl(route);
  if (!url) return { ok: false, error: 'main window not ready' };

  const win = new BrowserWindow({
    icon: getAppIconPath(),
    width: Number(opts.width) || 1280,
    height: Number(opts.height) || 860,
    minWidth: 640,
    minHeight: 420,
    frame: false,              // 与主窗口一致：无边框 + 自定义标题栏
    titleBarStyle: 'hidden',
    backgroundColor: '#1D1D1C',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  // 关窗即清理登记，避免 key 被已销毁窗口占住
  win.on('closed', () => { childWindows.delete(key); });
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (isSafeExternalUrl(u)) shell.openExternal(u);
    return { action: 'deny' };
  });

  void win.loadURL(url);
  childWindows.set(key, win);
  return { ok: true, reused: false };
});

/** 子窗口是否处于最大化（渲染层据此切换按钮图标） */
ipcMain.handle('child-window:is-maximized', (event) => winOf(event)?.isMaximized() || false);

/** 聚焦主窗口（子窗口里「回到主窗口」用） */
ipcMain.handle('child-window:focus-main', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
  return true;
});

/**
 * 子窗口的初始载荷中转。
 * 渲染层无法直接把 Vue 状态交给另一个窗口，故开窗前先 put、子窗口就绪后 take。
 * 只保留最近一次（子窗口按 key 唯一，语义足够）；子窗口取走后立即清除。
 */
const childPayloads = new Map();
ipcMain.handle('child-window:put-payload', (_e, key, payload) => {
  childPayloads.set(String(key), payload);
  return true;
});
ipcMain.handle('child-window:take-payload', (_e, key) => {
  const k = String(key);
  const v = childPayloads.get(k);
  childPayloads.delete(k);
  return v ?? null;
});

// ============================================================
// IPC：BrowserView 导航控制（前进/后退/刷新/resize/URL）
// 多标签页：所有通道带 tabId 参数，操作对应标签的 BrowserView
// ============================================================

// ---- webview 引擎：guest 注册 / 引擎查询 ----
// 渲染层 <webview> 挂载后把 guest 的 webContentsId 注册进来，
// 主进程即可用 webContents.fromId 复用全部 action 实现。
ipcMain.handle('browser:engine', () => browserEngine);
ipcMain.handle('browser:setEngine', (_e, engine) => {
  browserEngine = engine === 'browserview' ? 'browserview' : 'webview';
  return browserEngine;
});
// 弹窗广播去重 + 归属空间标注。
// 一次 target=_blank 点击会同时命中「guest 级 + session 级」两个 setWindowOpenHandler，
// 两条路各广播一次 → 渲染层（还有它反复挂载残留的监听器）就会开出 2~N 个 tab。
// 收敛成"同一 URL 1.5 秒窗口内只广播一次"，并带上 scope 让对应空间的面板独享。
const popupBroadcastGuard = new Map();
function currentTabScope() {
  try {
    const t = activeTabId ? webviewTabs.get(activeTabId) : null;
    return (t && t.scope) || 'preview';
  } catch { return 'preview'; }
}
function broadcastOpenTab(url, scope) {
  if (!url || !mainWindow || mainWindow.isDestroyed()) return;
  const now = Date.now();
  const last = popupBroadcastGuard.get(url) || 0;
  if (now - last < 1500) return;         // 同一次点击的第二条通道：丢弃
  popupBroadcastGuard.set(url, now);
  for (const [u, t] of popupBroadcastGuard) if (now - t > 10000) popupBroadcastGuard.delete(u);
  // ★★★ 同站复用优先（2026-10-13，内存治理 B）：弹窗/新开 tab 的 URL 若与既有 tab
  //   「同 host+同 path」，广播 openTab 会让渲染层**再开一个完整 Chromium 渲染进程**
  //   （实测 tab-2：10:52 弹窗开出的第二个抖音 tab，与 tab-1 同站，全天 0 次使用白挂 8 小时）。
  //   ⇒ 命中已有 tab 时改广播 forceOpen（原地导航到该 URL + 激活它），不开新进程；
  //     确需强制新开由调用方传 forceNew（保留出口）。
  try {
    if (!broadcastOpenTab.__forceNew) {
      const norm = (u) => { try { const x = new URL(u); return x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, ''); } catch { return String(u || ''); } };
      const target = norm(url);
      for (const [tid, t] of webviewTabs) {
        if ((t.scope || 'preview') !== (scope || currentTabScope())) continue;
        const wc = t.wcId ? webContents.fromId(t.wcId) : null;
        if (!wc || wc.isDestroyed()) continue;
        if (norm(wc.getURL()) === target) {
          console.log('[bridge] popup 同站复用: 已有 tab', tid, '在', wc.getURL(), '→ 原地导航，不新建');
          mainWindow.webContents.send('browser:wv:forceOpen', url, scope || currentTabScope(), tid);
          return;
        }
      }
    }
  } catch { /* 探测失败按原路径广播 */ }
  mainWindow.webContents.send('browser:wv:openTab', url, scope || currentTabScope());
}

// webview 引擎的 popup 重定向：给 guest 自身的 webContents 设 windowOpenHandler。
// session 级 handler 拦不住 webview+allowpopups 转到二级 popup BrowserWindow 的逃逸；
// 在每个 guest 宿主 wc 上设，才能把 window.open / target=_blank 统一重定向回【应用内新标签页】。
function setupGuestPopupRedirect(wc, scope) {
  if (!wc || wc.__yzPopupWired) return;
  wc.__yzPopupWired = true;
  wc.setWindowOpenHandler(({ url }) => {
    // 弹窗一律转为应用内新标签页：重定向到当前所属容器的 BrowserView 面板新建 tab
    if (url && /^https?:/i.test(url)) {
      broadcastOpenTab(url, scope || currentTabScope());
    }
    return { action: 'deny' };
  });
  // ★ 自定义协议闸门（2026-10-08 初版 / 2026-10-12 收口）：guest 页面内点击
  // bitbrowser:// / tel: / mailto: 等未知协议时，Electron 会尝试交给系统 Shell 处理
  // → 本机无处理器 → Windows 弹「没有可打开此链接的应用」。
  // ★ 2026-10-12：改用 guardNavigation 统一装配 —— 除 will-navigate 外还挂
  //   will-frame-navigate（iframe 子帧只触发后者，实测；推广位 iframe 曾因此漏网）。
  guardNavigation(wc);
  // ★ B4（webview 引擎的原生弹窗接管在 will-attach-webview 里用 disableDialogs 字段完成，
  //   见下方 will-attach-webview 处理：Electron webContents 本身没有 dialog 事件，
  //   主进程给 webContents 注册 dialog 监听永远不会触发，故不在此处重复（native-dialog.test.ts ② 禁止臆造该事件）。
  //   alert/confirm/prompt 由 disableDialogs 直接抑制，与服务端 Playwright「未注册 handler 时自动 dismiss」语义对齐。
}

// ★★★ 全局兜底：任何 webContents 创建时就挂上「非 http(s) 导航闸门」（2026-10-12 收口）。
//
// ★ 为什么必须有这一层（这次"修了还是会弹窗"的真根因）：
//   此前守卫靠**逐个已知容器手挂**（主窗口 / 各 guest / BrowserView），而 webview 引擎的
//   兜底分支 `app.on('web-contents-created')` 里写着 `if (type === 'webview') return`
//   —— 理由是"guest 各自处理"。但那个 return 把**整个 webview 类型**排除在安全装配之外：
//   · guest 只在 `setupGuestPopupRedirect` 被调到的那些 wc 上生效（容器自治路径）；
//   · 更关键的是 Electron 33 起**子帧（iframe）导航不再触发 will-navigate，只触发
//     will-frame-navigate**（2026-10-12 实测：iframe src=… 与随后 iframe 内
//     location.href='bitbrowser://…' 都只出 will-frame-navigate、isMainFrame=false）。
//   ⇒ 小说推文站点页里的推广位 iframe 一跳自定义协议就无人拦 → 系统弹窗。
//
// ★ 判据（本项目一贯）：**按实现收口，不按容器枚举** —— 枚举必然漏（新增容器/新增事件
//   都会漏）。这里以「webContents 创建」这一个必然发生的时机做装配点，
//   对**所有类型**统一挂 guardNavigation（幂等，已挂的不重复）。
//   main 窗口/guest 各自的既有 hander 保留（它们还要做 popup 重定向等额外事）。
app.on('web-contents-created', (_e, contents) => {
  // 对所有 webContents 类型（window / webview / browserView / backgroundPage…）统一挂闸门
  try { guardNavigation(contents); } catch { /* ignore */ }
  if (!isWebviewEngine()) return;               // 以下仅 webview 引擎的 popup 重定向
  const type = contents.getType && contents.getType();
  if (type === 'window' || type === 'webview') return; // 主窗口与 guest 各自处理，跳过防双重拦截
  setupGuestPopupRedirect(contents);
});

ipcMain.handle('browser:wv:register', (_e, tabId, wcId, scope) => {
  const t = webviewTabs.get(tabId) || { scope: scope || 'preview', lastActiveAt: Date.now(), wcId: null };
  t.wcId = wcId;
  if (scope) t.scope = scope;
  t.lastActiveAt = Date.now();
  webviewTabs.set(tabId, t);
  if (!activeTabId) activeTabId = tabId;
  // ★ 事件驱动晚绑定（2026-10-11）：guest 注册即唤醒所有等这个 tab 的 waitForGuest
  //   （渲染主线程饱和时 IPC 迟到 30s+，纯轮询等不到 —— 见 waitForGuest 注释）
  wakeGuestWaiters(tabId);
  // ★★★ 消误报（2026-10-13）：`MaxListenersExceededWarning: 11 did-stop-loading listeners`。
  //   这批监听是 **Electron webview 内部实现**在 guest WebContents 上按 attach 维护的
  //   事件转发器（dom-ready 重发/re-attach 都会增加），实测**有界**（连续两天日志里
  //   警告都是恰好 11，达到后不再增长），并非应用层泄漏 —— 挂上去卸不掉也无需卸。
  //   ⇒ 给 guest 提高上限到 30，消掉误报（日志干净了，真泄漏才显眼），同时保留
  //     超过 30 的真异常报警能力。
  try {
    const wcReg = webContents.fromId(wcId);
    if (wcReg && !wcReg.isDestroyed() && typeof wcReg.setMaxListeners === 'function') wcReg.setMaxListeners(30);
  } catch { /* wcId 无效/已销毁则忽略 */ }
  // 给这个 guest 宿主 wc 挂弹窗重定向（window.open/target=_blank → 应用内新标签页）
  try {
    const wc = webContents.fromId(wcId);
    setupGuestPopupRedirect(wc, t.scope);
  } catch { /* wcId 无效/已销毁则忽略，导航后会随新 did-finish 再注册 */ }
  return true;
});
ipcMain.handle('browser:wv:unregister', (_e, tabId) => {
  const t = webviewTabs.get(tabId);
  if (t) { t.wcId = null; t.lastActiveAt = Date.now(); }
  return true;
});

// 创建新标签页，返回 tabId。
// scope：tab 归属空间（'preview'=对话页预览面板（agent 执行面）| 'page'=/browser 独立浏览器页）。
// 渲染层两边 tab 列表隔离，主进程只负责记录归属，供 ensureActiveTab(scope)/R5 顶替按空间匹配。
//
// ★★★ agentOpened：tab 的**归属标记**（2026-10-08）。安全边界 ——
//   agent 只能关闭**它自己打开的**标签页，用户手动开的 tab 一律不可被 agent 关闭。
//   必须做在主进程（这里是唯一知道"谁发起的创建"的地方）：
//     · `browserView:createTab`（本 handler，渲染层调用）→ 来自 UI（用户点击/面板自建）
//     · `browserView:action` 的 `new_tab`（agent 工具链）→ **agentOpened: true**
//   只靠提示词约束不可靠（模型可能传错 tabId、或被页面内容诱导），权限必须在执行侧强制。
let tabSeq = 0;
/**
 * 建一个新的浏览器 tab（**唯一实现**）—— `browserView:createTab` IPC 与
 * "会话首次导航时自建 guest" 两条路径共用（防两处实现漂移）。
 * @returns 新 tabId
 */
function createBrowserTab(scope) {
  const newTabId = 'tab-' + (++tabSeq);
  if (isWebviewEngine()) {
    // ★ webview 引擎同样要启动空闲回收/降帧巡检（2026-10-13）：
    //   此前 scheduleTabIdleCheck 只在旧引擎 ensureBrowserView 里调 —— webview 模式下
    //   巡检从未启动，"10 分钟空闲卸载"对现役引擎形同虚设（tab-2 幽灵挂 8 小时的根因）。
    scheduleTabIdleCheck();
    // ★★★ 2026-10-10 三次根因修复：webview 引擎必须**同样有上限 + LRU 收口**。
    //
    //   现场（用户实报"pageAgent 一跑整个应用卡死"）：navigate 因锚未建立而反复重试，
    //   每次重试都走自建分支 → `webviewTabs` **无上限地堆 tab** → 渲染层
    //   `v-for="t in tabs"` 为每个 tab 建一个 `<webview>` = **一个 Chromium 渲染进程**
    //   ⇒ 实测 3 分钟堆出十几个 guest ⇒ `MaxListenersExceededWarning: 11 did-stop-loading
    //     listeners added to [WebContents]` + CPU/内存爆炸 ⇒ **整个应用卡死**。
    //   ⇒ `evictLruTabIfNeeded` / `MAX_TABS` / 空闲巡检此前**只遍历 `browserViews`**（旧引擎），
    //     webview 分支是个**无保护缺口** —— 这里补上。
    evictLruWebviewTabIfNeeded();
    // webview 模式：只分配 tabId 与空间归属，guest 由渲染层 <webview> 元素创建后注册
    webviewTabs.set(newTabId, { scope: scope || 'preview', lastActiveAt: Date.now(), wcId: null, agentOpened: false });
    if (!activeTabId) activeTabId = newTabId;
    return newTabId;
  }
  // R4：超限先按 LRU 挂起最久未激活的 tab（壳保留、激活复活），再新建，
  // 保证同时存活的 webContents ≤ MAX_TABS
  // ★ 抽出本函数时**顺手修掉一处笔误**：原 IPC handler 在此分支又 `++tabSeq` 一次
  //   （生成第二个 id 却只用了一个）⇒ browserview 引擎下每次建 tab 编号跳两格。
  //   现在复用同一 `newTabId`，编号连续。**只影响 id 编号，不影响任何功能**。
  evictLruTabIfNeeded();
  ensureBrowserView(newTabId);
  const entry = browserViews.get(newTabId);
  if (entry) { entry.scope = scope || 'preview'; entry.agentOpened = false; }
  return newTabId;
}

ipcMain.handle('browserView:createTab', (_e, scope) => createBrowserTab(scope));

// 关闭标签页，销毁对应 BrowserView
// fromUi=true 表示 UI 路径（渲染层会自行顶替相邻 tab，主进程不顶替不广播，避免双顶替抖动）；
// 非 UI 路径（pageAgent 工具 / 页面 window.close）没有渲染层参与，主进程必须在这里收口。
// 关闭单个 tab 的纯逻辑（IPC handler + closeAllTabs 共用）
function closeTabById(tabId, fromUi) {
  // ★ B7（2026-10-09）：tab 关闭 → 删掉它的 streak 桶。
  //   放在这个**收敛入口**（注释说明"IPC handler + closeAllTabs 共用"）——
  //   只在一个地方清理，避免"某条关闭路径漏了"导致桶缓慢泄漏。
  //   （Map 另有 200 上限兜底，双保险。）
  try { noChangeStreaks.delete(String(tabId == null ? 'default' : tabId)); } catch (e) { /* ignore */ }
  if (isWebviewEngine()) {
    const meta = webviewTabs.get(tabId);
    const closedScope = meta?.scope || 'preview';
    webviewTabs.delete(tabId);
    clearFormSnapshot(tabId);
    // ★ 广播 tab 关闭（2026-10-09）：渲染层据此摘除 tab 壳（webview 引擎下 agent 的
    //   close_tab / 收尾自动收拾此前只删主进程 meta，渲染层残留幽灵壳）。
    //   渲染层对不认识的 tabId 幂等忽略，UI 路径重复收到也无害。
    broadcastTabClosed(tabId);
    if (activeTabId === tabId) {
      activeTabId = null;
      // 非 UI 路径（pageAgent / window.close）：主进程顶替同空间内最近激活的 tab 并广播
      if (!fromUi) {
        let next = null, newest = -1;
        for (const [id, t] of webviewTabs) {
          if ((t.scope || 'preview') !== closedScope) continue;
          if ((t.lastActiveAt || 0) >= newest) { newest = t.lastActiveAt || 0; next = id; }
        }
        if (next) {
          activeTabId = next;
          webviewTabs.get(next).lastActiveAt = Date.now();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browserView:tabActivated', next);
          }
        }
      }
    }
    return;
  }
  const entry = browserViews.get(tabId);
  // 记住被关 tab 的归属空间：R5 顶替只在同空间内找，避免把另一空间的 tab 顶进激活位
  const closedScope = entry?.scope || 'preview';
  if (entry) {
    // 统一走收敛函数摘除（无论当前是否挂载），再销毁 webContents
    entry.visible = false;
    entry.bounds = null;
    applyVisibility(entry);
    try { entry.view?.webContents?.destroy?.(); } catch { /* ignore */ }
    browserViews.delete(tabId);
  }
  broadcastTabClosed(tabId);
  if (activeTabId === tabId) {
    activeTabId = null;
    // R5：非 UI 路径关掉当前 tab 时主进程自行顶替同空间内最近激活的剩余 tab 并广播。
    // UI 路径渲染层也会顶替：收到 tabActivated 时若 activeTabId 已一致则忽略，幂等不打架。
    if (!fromUi) {
      let next = null, newest = -1;
      for (const [id, e] of browserViews) {
        if ((e.scope || 'preview') !== closedScope) continue;
        const t = e.lastActiveAt || 0;
        if (t >= newest) { newest = t; next = id; }
      }
      if (next) {
        activateTab(next);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browserView:tabActivated', next);
        }
      }
    }
  }
}

ipcMain.handle('browserView:closeTab', (_e, tabId, fromUi) => {
  closeTabById(tabId, !!fromUi);
});

/** tab 关闭广播：渲染层（BrowserPanel）据此摘除 tab 壳，幂等 */
function broadcastTabClosed(tabId) {
  // ★ 收口：**所有**关闭路径都会经过这里（closeTabById 两处 + `case 'close_tab'`），
  //   把"指向该 tab 的**流锚**"一并失效 —— 逐条路径各清一次必然漏（`case 'close_tab'`
  //   此前就没走 closeTabById，正是活证）。放在广播处是唯一不漏的位置。
  clearFlowAnchorsForTab(tabId);
  broadcastTabUrl.delete(String(tabId));   // 同步清 URL 记账（防陈旧复用）
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:tabClosed', tabId);
    }
  } catch { /* ignore */ }
}

// ★ 收尾自动收拾（2026-10-09）：关闭全部 agent 打开的 tab（agentOpened===true）。
//   背景：pageAgent 任务跑完后页面一直留在预览面板堆积 —— 此前只给用户弹提示，
//   用户拍板改为任务收尾自动关。安全边界不变：只关 agentOpened 的，用户手开的不碰。
//   由渲染层在任务收尾回调里调用（此时模型已跑完、结果页该截图的已截图）。
ipcMain.handle('browserView:closeAgentTabs', () => {
  const ids = [];
  if (isWebviewEngine()) {
    for (const [id, t] of webviewTabs) if (t.agentOpened === true) ids.push(id);
  } else {
    for (const [id, e] of browserViews) if (e.agentOpened === true) ids.push(id);
  }
  for (const id of ids) {
    try { closeTabById(id, false); } catch { /* ignore */ }
  }
  return { closed: ids.length };
});

// 关闭某空间下的所有 tab（多会话隔离：BrowserPanel 卸载/切换会话时调用，避免 tab 在主进程长期堆积占满 MAX_TABS）。
// UI 路径（fromUi=true）下不做 R5 顶替——调用方就是要离开。
ipcMain.handle('browserView:closeAllTabs', (_e, scope, fromUi) => {
  const wantScope = scope || 'preview';
  const ids = [];
  if (isWebviewEngine()) {
    for (const [id, t] of webviewTabs) if ((t.scope || 'preview') === wantScope) ids.push(id);
  } else {
    for (const [id, e] of browserViews) if ((e.scope || 'preview') === wantScope) ids.push(id);
  }
  for (const id of ids) {
    try { closeTabById(id, !!fromUi); } catch { /* ignore */ }
  }
  return { closed: ids.length };
});

// ★★★ 按**会话**关闭 agent 操作过的页面（「直连化」可见性契约，2026-10-10）。
//
// ★ 为什么需要（而不是复用 closeAgentTabs）：桥路径下渲染层不执行 browser_* 工具 ⇒
//   渲染层的 `agentOpenedTabs` 记账恒为空 ⇒ `closeAgentTabs()`（按 agentOpened 过滤）
//   **关不掉任何东西** —— 任务收尾"自动关闭 AI 打开的页面"会静默失效。
//   ⇒ 主进程按会话自己的记账（`agentTouchedTabs`）收口，不依赖渲染层、不依赖 agentOpened。
//
// ★ 安全边界（与既有 agentOpened 一致）：只关 **preview 空间** 且**被该会话操作过**的 tab；
//   `/browser` 独立页（scope='page'，用户自己的空间）一律不碰。
// ★ 幂等：未知 convId / 已关闭的 tab 直接忽略。
ipcMain.handle('browserView:closeConvTabs', (_e, convId) => {
  const cid = convId != null ? String(convId) : '';
  if (!cid) return { closed: 0 };
  // ★ 记账值现在是 **flowKey**（`${convId}::${flow}`）⇒ 按"会话前缀"匹配，把本会话的**所有流**
  //   操作过的页一并收掉（收尾语义仍以会话为单位；`owner === cid` 兼容任何纯 convId 的历史值）。
  const convPrefix = cid + '::';
  const ids = [];
  for (const [tid, owner] of agentTouchedTabs) {
    const o = String(owner);
    if (o === cid || o.startsWith(convPrefix)) ids.push(tid);
  }
  for (const tid of ids) {
    // fromUi=true：这是一次"离开/收尾"清理，主进程不再做 R5 顶替（与 closeAllTabs 同口径）
    try { closeTabById(tid, true); } catch { /* ignore */ }
  }
  // 锚一并失效（closeTabById 内部经 broadcastTabClosed 已清，这里再清一次防漏）
  for (const key of [...convAnchors.keys()]) {
    const k = String(key);
    if (k === cid || k.startsWith(convPrefix)) convAnchors.delete(key);
  }
  // 锁定页同样按会话收口（P3-6）：收尾了就不该还钉着某一页
  for (const key of [...flowPins.keys()]) {
    const k = String(key);
    if (k === cid || k.startsWith(convPrefix)) flowPins.clear(key);
  }
  return { closed: ids.length };
});

/**
 * 目标页锁定（P3-6，2026-10-16）—— 浏览器面板在页面对话任务开始 / 结束时调用。
 *
 * ★ 为什么由**面板**来钉而不是服务端：tabId 是渲染层的东西（面板正在显示哪一页），
 *   服务端只知道 convId；面板也知道这次任务的 convId（page 空间=本 tab 自己的会话，
 *   preview 空间=当前主会话），所以两端合起来才凑得出 flowKey。
 * ★ 为什么钉的是 tab 而不是 URL：页内导航（点链接→翻页）是任务本身的一部分；
 *   要禁的是"跳到别的标签页"（另开一页作答 / 切走之后答别的页）。
 * ★ 幂等且可重复：重复钉同一页无副作用；`unpin` 对没钉过的 key 是 no-op
 *   （任务异常结束时多调一次不会误伤别人）。
 */
ipcMain.handle('browserView:pinTarget', (_e, convId, flow, tabId) => {
  const key = flowKeyOf(convId, flow);
  if (!key || !tabId) return { ok: false };
  flowPins.set(key, String(tabId));
  return { ok: true, flowKey: key, tabId: String(tabId) };
});

ipcMain.handle('browserView:unpinTarget', (_e, convId, flow) => {
  const key = flowKeyOf(convId, flow);
  if (!key) return { ok: false };
  flowPins.clear(key);
  return { ok: true, flowKey: key };
});

// 激活标签页：显示其 BrowserView，隐藏其他
ipcMain.handle('browserView:activateTab', (_e, tabId) => {
  if (isWebviewEngine()) {
    activeTabId = tabId;
    const t = webviewTabs.get(tabId);
    if (t) t.lastActiveAt = Date.now();
    return;
  }
  const entry = browserViews.get(tabId);
  if (!entry) return;
  activateTab(tabId);
});

// 确保 main.cjs 有一个属于指定空间的激活 browser tab，返回 tabId。
// pageAgent 调 browser_* 工具时用此获取 tabId（scope='preview'），避免 tabId=null 与前端脱节，
// 也避免用户刚在 /browser 页（page 空间）浏览过、主进程激活位还留在 page tab 上时，
// agent 误把 page 空间的 tab 当作预览执行面（两边 tab 已隔离）。
// 逻辑：激活 tab 属于目标 scope 直接返回；否则在同空间内找最近激活的 tab；都没有则轮询等待
// BrowserPanel onMounted 创建（最多 3s）；超时自建（带 scope 标记并广播）。
ipcMain.handle('browserView:ensureActiveTab', async (_e, scope) => {
  const wantScope = scope || 'preview';
  if (isWebviewEngine()) {
    const scopeOfWv = (t) => (t && t.scope) || 'preview';
    const activeMeta = activeTabId ? webviewTabs.get(activeTabId) : null;
    if (activeMeta && scopeOfWv(activeMeta) === wantScope) return activeTabId;
    for (let i = 0; i < 30; i++) {
      await sleepMs(100);
      const am = activeTabId ? webviewTabs.get(activeTabId) : null;
      if (am && scopeOfWv(am) === wantScope) return activeTabId;
      let best = null, newest = -1;
      for (const [id, t] of webviewTabs) {
        if (scopeOfWv(t) !== wantScope) continue;
        if ((t.lastActiveAt || 0) >= newest) { newest = t.lastActiveAt || 0; best = id; }
      }
      if (best) { activeTabId = best; webviewTabs.get(best).lastActiveAt = Date.now(); return best; }
    }
    // ★★★ 2026-10-11：改走 `createBrowserTab()`（此前自己 `tabSeq++` + `webviewTabs.set`）。
    //   ★ 为什么：`createBrowserTab` 是 tab 创建的**唯一收口**（内含 `MAX_TABS` + LRU 逐出）。
    //     本分支是"3s 等不到面板建 tab → 主进程兜底自建"，**agent 会真实走到**
    //     （实测日志 `ensureActiveTab 超时自建`）⇒ 绕过收口 ⇒ 又是无上限堆积的缺口。
    //   ★ 这是"平行实现漂移"的第 N 例：同一个"建 tab"语义散在 4 处，改一处必须全改。
    const tabId = createBrowserTab(wantScope);
    activeTabId = tabId;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:tabCreated', tabId, null, wantScope);
    }
    return tabId;
  }
  const scopeOf = (e) => (e && e.scope) || 'preview';
  const findInScope = () => {
    let best = null, newest = -1;
    for (const [id, e] of browserViews) {
      if (scopeOf(e) !== wantScope) continue;
      const t = e.lastActiveAt || 0;
      if (t >= newest) { newest = t; best = id; }
    }
    return best;
  };
  const activeEntry = activeTabId ? browserViews.get(activeTabId) : null;
  if (activeEntry && scopeOf(activeEntry) === wantScope) {
    return activeTabId;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const ae = activeTabId ? browserViews.get(activeTabId) : null;
    if (ae && scopeOf(ae) === wantScope) return activeTabId;
    const inScope = findInScope();
    if (inScope) { activateTab(inScope); return inScope; }
  }
  evictLruTabIfNeeded();
  const tabId = 'tab-' + (++tabSeq);
  ensureBrowserView(tabId);
  const entry = browserViews.get(tabId);
  if (entry) entry.scope = wantScope;
  activateTab(tabId);
  // 兜底自建的 tab 广播给渲染层补建 tab 壳，否则渲染层无壳即忽略 → 导航黑洞
  // （pageAgent 在预览面板看不到任何变化，但导航真实发生了）。广播带 scope，渲染层按空间过滤。
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browserView:tabCreated', tabId, null, wantScope);
  }
  return tabId;
});

ipcMain.handle('browserView:load', async (e, tabId, url) => {
  if (!url) return { error: 'url 为空' };
  // URL 清洗：剥离模型以 markdown 反引号/引号包裹传来的格式字符
  let cleanUrl = String(url).trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
  if (!/^https?:\/\//i.test(cleanUrl)) return { error: `无效 URL: ${cleanUrl}` };
  if (isWebviewEngine()) {
    // webview 模式：guest 由渲染层 <webview> 承载，等其注册后直接用 guest 导航
    const wc = await waitForGuest(tabId);
    if (!wc) return { error: '浏览器视图未就绪（<webview> 尚未挂载）' };
    activeTabId = tabId || activeTabId;
    const t = webviewTabs.get(tabId);
    if (t) t.lastActiveAt = Date.now();
    try {
      await wc.loadURL(cleanUrl);
      return { url: wc.getURL(), title: wc.getTitle() };
    } catch (err) {
      return { error: `页面加载失败（${err?.code || err?.errno || ''}）: ${cleanUrl}` };
    }
  }
  // 按需为该标签创建 BrowserView
  const bv = ensureBrowserView(tabId);
  if (!bv) return { error: '主窗口不可用' };
  const entry = browserViews.get(tabId);
  // 等待首次缓存清理完成（并发会中止加载导致黑屏）
  if (entry.cacheClearPromise) { await entry.cacheClearPromise; entry.cacheClearPromise = null; }
  // 激活该标签（挂载由 applyVisibility 统一处理）
  activateTab(tabId);
  ensureFallbackBounds(entry);
  try {
    await bv.webContents.loadURL(cleanUrl);
    return { url: bv.webContents.getURL() };
  } catch (err) {
    return { error: `页面加载失败（${err?.code || err?.errno || ''}）: ${cleanUrl}` };
  }
});

ipcMain.handle('browserView:back', (_e, tabId) => {
  if (isWebviewEngine()) {
    const wc = resolveTabWebContents(tabId);
    if (!wc) return;
    if (wc.navigationHistory) { if (wc.navigationHistory.canGoBack()) wc.goBack(); }
    else if (wc.canGoBack?.()) wc.goBack();
    return;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry || !entry.view) return; // R4：挂起态无导航历史，直接忽略
  const wc = entry.view.webContents;
  if (wc.navigationHistory) {
    if (wc.navigationHistory.canGoBack()) wc.goBack();
  } else if (wc.canGoBack?.()) {
    wc.goBack();
  }
});

ipcMain.handle('browserView:forward', (_e, tabId) => {
  if (isWebviewEngine()) {
    const wc = resolveTabWebContents(tabId);
    if (!wc) return;
    if (wc.navigationHistory) { if (wc.navigationHistory.canGoForward()) wc.goForward(); }
    else if (wc.canGoForward?.()) wc.goForward();
    return;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry || !entry.view) return; // R4：挂起态无导航历史，直接忽略
  const wc = entry.view.webContents;
  if (wc.navigationHistory) {
    if (wc.navigationHistory.canGoForward()) wc.goForward();
  } else if (wc.canGoForward?.()) {
    wc.goForward();
  }
});

ipcMain.handle('browserView:reload', (_e, tabId) => {
  if (isWebviewEngine()) {
    resolveTabWebContents(tabId)?.reload();
    return;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return;
  // R4：挂起态等价于复活 —— 重建视图并重新加载记忆的 url
  if (!entry.view) {
    if (entry.url) {
      ensureBrowserView(tabId || activeTabId);
      entry.view?.webContents?.loadURL?.(entry.url).catch(() => { /* ignore */ });
    }
    return;
  }
  entry.view.webContents.reload();
});

// ============================================================
// pageAgent 浏览器操作 IPC 直连（统一通道 browser:call）
// 前端 dispatchToolCall 中 browser_* 工具直接走 IPC，操作当前活动 BrowserView，
// 预览面板就是操作的页面，100% 同步可见，不依赖后端 Playwright。
// ============================================================

/** 检查 BrowserView entry 是否存活（view 存在且 webContents 未销毁） */
function isBrowserViewAlive(entry) {
  return !!(entry && entry.view && entry.view.webContents && !entry.view.webContents.isDestroyed());
}

/** 获取当前活动的 BrowserView，没有则创建一个默认 tab */
function getActiveBrowserViewForAgent() {
  // 优先用当前活动 tab
  if (activeTabId && browserViews.has(activeTabId)) {
    const entry = browserViews.get(activeTabId);
    if (entry) {
      if (!isBrowserViewAlive(entry)) {
        // 已销毁或挂起，重新创建
        entry.suspended = true;
        entry.view = null;
        ensureBrowserView(activeTabId);
      }
      if (isBrowserViewAlive(entry)) {
        return entry.view;
      }
    }
  }
  // 找任意一个存活的 BrowserView
  for (const [id, entry] of browserViews) {
    if (isBrowserViewAlive(entry)) {
      activateTab(id);
      return entry.view;
    }
  }
  // 都没有，创建一个默认 tab
  const defaultTabId = 'page-agent-default';
  const bv = ensureBrowserView(defaultTabId);
  if (bv) {
    activateTab(defaultTabId);
    return bv;
  }
  return null;
}

/** 超时保护 */
function withIpcTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg || '操作超时')), ms || 15000)),
  ]);
}

/** 元素注册表：为可交互元素分配 index（注入到页面执行） */
const ELEMENT_REGISTRY_SCRIPT = `
(function() {
  const w = window;
  w.__yzElementRegistry = w.__yzElementRegistry || { elements: [], counter: 1 };
  const reg = w.__yzElementRegistry;
  reg.elements = [];
  reg.counter = 1;
  const SELECTOR = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  function collect(root, scopeId) {
    const nodes = root.querySelectorAll(SELECTOR);
    for (const el of nodes) {
      if (el.offsetParent === null && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const idx = reg.counter++;
      el.setAttribute('data-yz-index', idx);
      reg.elements.push({
        index: idx,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        text: (el.innerText || el.value || el.placeholder || '').trim().slice(0, 100),
        href: el.href || '',
        placeholder: el.placeholder || '',
        disabled: el.disabled || false,
      });
    }
  }
  collect(document, 'd1');
  // 穿透同源 iframe
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    try {
      if (iframe.contentDocument) {
        collect(iframe.contentDocument, 'd' + (reg.counter + 1));
      }
    } catch(e) { /* cross-origin */ }
  }
  return reg.elements;
})();
`;

// [deprecated] browser:call 已废弃，pageAgent 统一走 browserView:action
/** 统一 IPC 通道：browser:call */
ipcMain.handle('browser:call', async (event, action, args) => {
  args = args || {};
  let wc = null;
  if (isWebviewEngine()) {
    wc = await waitForGuest(activeTabId, 3000);
  } else {
    const bv = getActiveBrowserViewForAgent();
    wc = bv?.webContents;
  }
  if (!wc) return { ok: false, error: '无法获取浏览器视图' };
  if (wc.isDestroyed()) return { ok: false, error: '浏览器视图已销毁' };

  try {
    switch (action) {
      // === 核心工具 ===
      case 'navigate': {
        let url = String(args.url || '').trim();
        if (!url) return { ok: false, error: 'url is required' };
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        await withIpcTimeout(wc.loadURL(url), 30000, '导航超时');
        return { ok: true, url: wc.getURL(), title: wc.getTitle() };
      }

      case 'get_page_info': {
        // 注入元素注册表
        const elements = await wc.executeJavaScript(ELEMENT_REGISTRY_SCRIPT).catch(() => []);
        return {
          ok: true,
          url: wc.getURL(),
          title: wc.getTitle(),
          elements: elements || [],
        };
      }

      case 'click': {
        const { index, selector, x, y } = args;
        if (index != null) {
          const result = await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector('[data-yz-index="${index}"]');
              if (!el) return { ok: false, error: '元素未找到' };
              el.click();
              return { ok: true };
            })();
          `);
          return result;
        }
        if (selector) {
          await wc.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`).catch(() => {});
          return { ok: true };
        }
        if (x != null && y != null) {
          // 坐标点击
          wc.sendInputEvent({ type: 'mouseDown', x: Number(x), y: Number(y), button: 'left' });
          wc.sendInputEvent({ type: 'mouseUp', x: Number(x), y: Number(y), button: 'left' });
          return { ok: true };
        }
        return { ok: false, error: 'click 需要 index/selector/x+y 参数' };
      }

      case 'type': {
        // ⚠️ 已废弃通道（`browser:call`）的实现 —— 前端自 2026-10-08 起统一走
        //   `browserView:action`（那里的 `case 'type'` 才是**唯一在用的**实现，
        //   且已升级为 CDP 真键盘 + JS 兜底补齐事件序列）。
        //   本分支保留仅为兼容 preload 仍暴露的 `browser.call()`，行为不再单独演进。
        const { index, selector, text } = args;
        if (!text) return { ok: false, error: 'text is required' };
        const sel = index != null ? `[data-yz-index="${index}"]` : (selector || '');
        const idxNum = index != null ? Number(index) : -1;
        const pressEnter = args.pressEnter === true;
        const res = await wc.executeJavaScript(`(function(){
          var sel=${JSON.stringify(sel)};
          var text=${JSON.stringify(String(text))};
          var idx=${idxNum};
          var el=null;
          if(!sel){
            el=document.activeElement;
          }else{
            el=document.querySelector(sel);
            // index 失效时尝试注册表回填（与 click/upload 分支同一套 __yzElements / __yzSelMap）
            if(!el && idx>=0 && window.__yzElements && window.__yzElements[idx]) el=window.__yzElements[idx];
            if(!el && idx>=0 && window.__yzSelMap && window.__yzSelMap[idx]) el=document.querySelector(window.__yzSelMap[idx]);
          }
          if(!el) return { applied:false, error: sel ? ('元素未找到: '+sel+'（如为编号元素，请重新调用 browser_get_page_info 获取最新编号）') : '无聚焦元素' };
          el.scrollIntoView({block:'center'});
          if(window.__yzAssistant){ try{var r=el.getBoundingClientRect();window.__yzAssistant.showCursor(r.x+r.width/2,r.y+r.height/2,'输入');}catch(e){} }
          el.focus();
          var isCE=el.isContentEditable===true;
          var proto=(el instanceof HTMLTextAreaElement)?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          var d=Object.getOwnPropertyDescriptor(proto,'value');
          var set=(!isCE&&d&&d.set)?d.set:null;
          var put=function(v){ if(set){set.call(el,v);} else if(isCE){el.textContent=v;} else {el.value=v;} };
          put('');
          el.dispatchEvent(new Event('input',{bubbles:true}));
          for(var i=0;i<text.length;i++){
            put(text.slice(0,i+1));
            el.dispatchEvent(new Event('input',{bubbles:true}));
          }
          el.dispatchEvent(new Event('change',{bubbles:true}));
          var got=(!isCE&&el.value!=null)?String(el.value):(el.textContent||'');
          var out={ applied:got===text, typed:text.length, value:got.slice(0,120) };
          if(!out.applied){ out.hint='输入框未接受文本（受控组件拦截了程序化输入或页面重置了值）。建议截图核验实际值。'; }
          if(${pressEnter}){
            var ko={bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13,which:13};
            el.dispatchEvent(new KeyboardEvent('keydown',ko));
            el.dispatchEvent(new KeyboardEvent('keypress',ko));
            el.dispatchEvent(new KeyboardEvent('keyup',ko));
            out.entered=true;
          }
          return out;
        })()`).catch((e) => ({ applied: false, error: String((e && e.message) || e) }));
        if (res && res.error) return { ok: false, error: res.error };
        return { ok: true, ...(res || {}) };
      }

      case 'press_key': {
        const key = String(args.key || args.keyCode || '');
        if (!key) return { ok: false, error: 'key is required' };
        const keyMap = {
          'Enter': 'Enter', 'Tab': 'Tab', 'Escape': 'Escape', 'Esc': 'Escape',
          'Backspace': 'Backspace', 'Delete': 'Delete', 'ArrowUp': 'ArrowUp',
          'ArrowDown': 'ArrowDown', 'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
          ' ': 'Space', 'Space': 'Space',
        };
        const keyCode = keyMap[key] || key;
        wc.sendInputEvent({ type: 'keyDown', keyCode });
        wc.sendInputEvent({ type: 'keyUp', keyCode });
        return { ok: true };
      }

      case 'screenshot': {
        const image = await wc.capturePage();
        const dataUrl = image.toDataURL('image/png');
        return { ok: true, dataUrl };
      }

      case 'get_visible_text': {
        const text = await wc.executeJavaScript(`
          (function() {
            const style = document.createElement('style');
            return document.body ? document.body.innerText : '';
          })();
        `).catch(() => '');
        return { ok: true, text: String(text || '').slice(0, 10000) };
      }

      case 'wait': {
        const ms = Math.min(Number(args.ms || args.time || 1000), 10000);
        await new Promise(r => setTimeout(r, ms));
        return { ok: true };
      }

      case 'get_url': {
        return { ok: true, url: wc.getURL(), title: wc.getTitle() };
      }

      case 'back': {
        if (wc.navigationHistory?.canGoBack?.()) wc.goBack();
        else if (wc.canGoBack?.()) wc.goBack();
        return { ok: true };
      }

      case 'forward': {
        if (wc.navigationHistory?.canGoForward?.()) wc.goForward();
        else if (wc.canGoForward?.()) wc.goForward();
        return { ok: true };
      }

      case 'reload': {
        wc.reload();
        return { ok: true };
      }

      default:
        return { ok: false, error: 'Unknown browser action: ' + action };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('browserView:resize', (e, tabId, x, y, width, height) => {
  // ★ 记录面板可见性（见 webviewPanelVisible 注释）：渲染层只在面板可见时才同步非零 bounds
  webviewPanelVisible = Math.max(0, Math.round(width)) > 0 && Math.max(0, Math.round(height)) > 0;
  if (isWebviewEngine()) return; // webview 由 CSS 布局，无需 bounds 同步
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return;
  const w = Math.max(0, Math.round(width));
  const h = Math.max(0, Math.round(height));
  // 只有当前激活标签才允许实际挂载；非激活 tab 仅记录 bounds，
  // 否则单槽机制下会顶掉正在显示的那个 BrowserView。
  const isActive = !tabId || tabId === activeTabId;
  if (w < 1 || h < 1) {
    // 0 尺寸 = 隐藏请求：清空 bounds 并统一摘除
    // 注意：不要在这里清 entry.scrollbarCssKey —— 见 hide handler 的说明
    entry.bounds = null;
    entry.visible = false;
    applyVisibility(entry);
    return;
  }
  entry.bounds = { x: Math.round(x), y: Math.round(y), width: w, height: h };
  // 记住最近一次有效矩形，作为首次导航/强制重挂时的兜底（比写死 480px 准确）
  lastGoodBounds = { ...entry.bounds };
  entry.visible = isActive;
  applyVisibility(entry);
});

ipcMain.handle('browserView:getUrl', (_e, tabId) => {
  if (isWebviewEngine()) return resolveTabWebContents(tabId)?.getURL() || '';
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return '';
  if (!entry.view) return entry.url || ''; // R4：挂起态返回记忆的 url
  return entry.view.webContents.getURL();
});

ipcMain.handle('browserView:hide', (_e, tabId) => {
  webviewPanelVisible = false; // ★ 记录面板可见性（见 webviewPanelVisible 注释）
  if (isWebviewEngine()) return; // webview 由渲染层 CSS 控制显隐
  // 隐藏指定标签或当前激活标签
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return;
  // 统一走收敛函数：removeBrowserView + setBrowserView(null) 双保险 + 后台节流
  entry.visible = false;
  entry.bounds = null;
  applyVisibility(entry);
  // 关键：不要在这里清 entry.scrollbarCssKey。
  // 隐藏 BrowserView 不会重新加载页面，insertCSS 注入的样式表仍在文档内，
  // key 是 removeInsertedCSS 的唯一凭证 —— 丢了 key 就永久多留一份样式表，
  // 反复「收起 → 展开」会在页面里叠加 N 份滚动条规则（长会话下拖慢样式计算，
  // 且某次注入失败时会停留在上一个主题的旧样式）。
  // 导航后 key 会变成陈旧值，但 injectScrollbarCss 的 removeInsertedCSS 外面
  // 套着 try/catch，陈旧 key 无害，did-finish-load 会立刻覆盖成新 key。
});

ipcMain.handle('browserView:canGoBack', (_e, tabId) => {
  if (isWebviewEngine()) {
    const wc = resolveTabWebContents(tabId);
    if (!wc) return false;
    if (wc.navigationHistory) return wc.navigationHistory.canGoBack();
    return wc.canGoBack?.() || false;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry || !entry.view) return false; // R4：挂起态无导航历史
  const wc = entry.view.webContents;
  if (wc.navigationHistory) return wc.navigationHistory.canGoBack();
  return wc.canGoBack?.() || false;
});

ipcMain.handle('browserView:canGoForward', (_e, tabId) => {
  if (isWebviewEngine()) {
    const wc = resolveTabWebContents(tabId);
    if (!wc) return false;
    if (wc.navigationHistory) return wc.navigationHistory.canGoForward();
    return wc.canGoForward?.() || false;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry || !entry.view) return false; // R4：挂起态无导航历史
  const wc = entry.view.webContents;
  if (wc.navigationHistory) return wc.navigationHistory.canGoForward();
  return wc.canGoForward?.() || false;
});

// 页面缩放（BrowserView 原生 setZoomFactor）
ipcMain.handle('browserView:setZoomFactor', (_e, tabId, factor) => {
  if (isWebviewEngine()) {
    const wc = resolveTabWebContents(tabId);
    const f = Number(factor) || 1;
    try { wc?.setZoomFactor(f); } catch { /* ignore */ }
    return;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return;
  const f = Number(factor) || 1;
  // 真值先落账：挂起态（无视图）也生效，复活后由 did-finish-load 回放
  entry.zoomFactor = f;
  try { entry.view.webContents.setZoomFactor(f); } catch { /* ignore */ }
});

// 取当前实际缩放因子（单一真相源）：切换标签/恢复时前端据此校正 UI 显示
ipcMain.handle('browserView:getZoomFactor', (_e, tabId) => {
  if (isWebviewEngine()) {
    try { return resolveTabWebContents(tabId)?.getZoomFactor() || 1; } catch { return 1; }
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  if (!entry) return 1;
  try { return entry.view.webContents.getZoomFactor() || entry.zoomFactor || 1; } catch { return entry.zoomFactor || 1; }
});

// 同步滚动条主题（应用主题切换时重新注入，颜色按网页背景自动选择）
ipcMain.handle('browserView:setTheme', async (_e, tabId) => {
  if (isWebviewEngine()) {
    // webview 引擎：guest 由渲染层承载，用 fromId 拿 guest webContents 注入自定义滚动条样式
    // （与 BrowserView 观感一致：隐藏原生粗滚动条 → 半透明细圆角，随页面临深色自动选色）
    const wc = guestWebContents(tabId) || guestWebContents(activeTabId);
    if (wc) await injectScrollbarForWC(wc);
    return;
  }
  injectScrollbarCss(tabId);
});

// 已移除 browserView:insertScrollbarCSS：全仓无调用方，且不追踪 insertCSS 返回的 key
// （无法 removeInsertedCSS，每次调用永久多留一份样式表）。
// 滚动条统一由主进程 injectScrollbarCss() 管理，前端只通过 browserView:setTheme 触发。

// ============================================================
// IPC：BrowserView 自动化操作（pageAgent 直接操作可见的 BrowserView）
// 虚拟鼠标光标 + click/type/scroll/hover/screenshot/get_page_info 等
// ============================================================

// 虚拟鼠标光标 CSS
const YZ_CURSOR_CSS = `
  #__yz-cursor{position:fixed;z-index:2147483647;pointer-events:none;width:28px;height:28px;margin:-14px 0 0 -14px;transition:left .12s ease,top .12s ease;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cpath d='M5 3L5 20L10 16L13 22L16 21L13 15L19 15Z' fill='%234a9eff' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat center;}
  #__yz-cursor.clicking{transform:scale(.6);transition:transform .08s;}
  #__yz-ring{position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #4a9eff;border-radius:50%;width:36px;height:36px;margin:-18px 0 0 -18px;opacity:0;}
  #__yz-ring.active{animation:__yz-ring-anim .5s ease-out;}
  @keyframes __yz-ring-anim{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.8);opacity:0}}
  #__yz-badge{position:fixed;z-index:2147483647;pointer-events:none;background:#4a9eff;color:white;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:16px;margin-top:16px;box-shadow:0 2px 8px rgba(0,0,0,.3);transition:left .12s ease,top .12s ease;}
`;

// 注入虚拟鼠标 + 操作助手到 BrowserView 页面
async function injectYzAssistant(wc) {
  // ★★★ 2026-10-11：按需注入（此前每次 navigate 都无条件重跑整段大脚本）。
  //   动机（用户实报"卡"+"轮询效率肯定差啊"）：navigate 每次收尾都调本函数，脚本很长
  //   （含光标/输入辅助/元素编号等，数千字符的字符串注入 + 跨进程 executeJavaScript）。
  //   而 agent 的典型流程是同一页上连续动作（get_page_content → click → type …），
  //   每次 navigate（含 SPA 内跳转）都重注入一遍是纯浪费 —— 而且注入是幂等的
  //   （脚本内 if(!c) 已保证不重复建节点），所以"跳过"完全安全。
  //   ⇒ 先做一次轻量探测（只取一个标记位），已注入就整段跳过。
  //   ★ 为什么用 window.__yzAssistant 当标记：脚本末尾会给它赋值（见下），
  //     比查 DOM 节点更快、也不受页面是否已有同名元素干扰。
  try {
    const already = await wc.executeJavaScript('!!(window.__yzAssistant && window.__yzAssistant.__yzVersion)');
    if (already) return;
  } catch { /* 探测失败（页面未就绪等）→ 照常注入，行为与修复前一致 */ }
  try { await wc.insertCSS(YZ_CURSOR_CSS); } catch { /* ignore */ }
  await wc.executeJavaScript(`(function(){
    if(!document.body)return;
    var c=document.getElementById('__yz-cursor');
    var r=document.getElementById('__yz-ring');
    var b=document.getElementById('__yz-badge');
    if(!c){c=document.createElement('div');c.id='__yz-cursor';c.style.display='none';document.body.appendChild(c);}
    if(!r){r=document.createElement('div');r.id='__yz-ring';document.body.appendChild(r);}
    if(!b){b=document.createElement('div');b.id='__yz-badge';b.style.display='none';document.body.appendChild(b);}
    function showCursor(x,y,label){c.style.display='';c.style.left=x+'px';c.style.top=y+'px';
      if(label){b.style.display='';b.textContent=label;b.style.left=x+'px';b.style.top=y+'px';}else{b.style.display='none';}
      window.__yzLastCursor={x:x,y:y,label:label||'',at:Date.now()};}
    function hideCursor(){c.style.display='none';b.style.display='none';}
    function clickAt(x,y){c.style.display='';c.style.left=x+'px';c.style.top=y+'px';c.classList.add('clicking');
      window.__yzLastCursor={x:x,y:y,label:'',at:Date.now(),kind:'click'};
      r.style.display='';r.style.left=x+'px';r.style.top=y+'px';r.classList.remove('active');void r.offsetWidth;r.classList.add('active');
      setTimeout(function(){c.classList.remove('clicking');},200);
      var el=document.elementFromPoint(x,y);if(el){var o={bubbles:true,cancelable:true,clientX:x,clientY:y,view:window};
        el.dispatchEvent(new MouseEvent('mousemove',o));el.dispatchEvent(new MouseEvent('mousedown',o));
        el.dispatchEvent(new MouseEvent('mouseup',o));el.dispatchEvent(new MouseEvent('click',o));}return el?el.tagName+'.'+(el.className||''):null;}
    // ★ 受控组件兼容：React/Vue 会用原型属性覆盖 value setter，直接 el.value= 赋值不触发其 onChange。
    // 必须用原型上的原生 value setter（native setter）写入再派发 input 事件，框架才能感知到变化。
    function nativeValueSetter(el){
      var proto=(el instanceof HTMLTextAreaElement)?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      var d=Object.getOwnPropertyDescriptor(proto,'value');return d&&d.set?d.set:null;
    }
    /**
     * ★★★ 输入文本（JS 兜底实现）—— 2026-10-08 大幅补强。
     *
     * 主路径是 CDP 真键盘（见 cdpTypeText），本函数只在 CDP 不可用时兜底
     * （Web 端 Playwright 路径 / CDP 被占用）。但它仍要尽量接近人的输入，
     * 因为很多页面就是靠这些事件驱动 UI 的。
     *
     * 补齐的事件序列（对照真人打字）：
     *   focusin → compositionstart → [逐字: compositionupdate → input] → compositionend
     *         → keydown/composition 路径后的 input → change → blur 前保持焦点
     *   ★ 为什么必须发 composition 事件：中文输入法组词走的就是这条链路，
     *     评论框/搜索框普遍监听 compositionend 收值 —— 缺了它"看着有字、提交是空的"。
     *   ★ 为什么 contenteditable 改走 execCommand insertText：富文本编辑器
     *     （ProseMirror/Slate/Draft.js）只认编辑管线（beforeinput/input），
     *     直接给 textContent 赋值它们的内部 model 不同步 → 提交时取不到内容。
     *     execCommand insertText 会触发完整编辑事件链，兼容性远好于直改 DOM。
     *     （execCommand 虽被标记 deprecated，但**没有替代品**能触发富文本编辑管线，
     *      各大自动化工具（Playwright/Puppeteer 的 fill）至今都在用它。）
     */
    function typeIn(el,text){
      var t=String(text==null?'':text);
      var isCE=el.isContentEditable===true;
      var isForm=!isCE&&(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement);
      var set=isForm?nativeValueSetter(el):null;

      // ① 聚焦事件（真人点击输入框：focus 之前会有 focusin；部分组件靠 focusin 初始化）
      el.focus();
      try{el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}catch(e){}

      function fireInput(inputType,data){
        // input 事件带 inputType/data（富文本与部分组件按它分支处理）
        var ok=false;
        try{el.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:false,inputType:inputType||'insertText',data:data==null?null:String(data)}));ok=true;}catch(e){}
        if(!ok){try{el.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}}
      }

      // ② 清空现有内容（真人会先全选再覆盖）
      if(isForm){
        if(set){set.call(el,'');}else{el.value='';}
      }else if(isCE){
        try{
          var r=document.createRange();r.selectNodeContents(el);
          var s=window.getSelection();s.removeAllRanges();s.addRange(r);
          if(!document.execCommand('delete',false)){el.textContent='';}
        }catch(e){el.textContent='';}
      }
      fireInput('deleteContentBackward','');

      // ③ 输入内容
      if(isCE){
        // 富文本：走编辑管线（唯一能让编辑器 model 同步的方式）
        var inserted=false;
        try{inserted=document.execCommand('insertText',false,t);}catch(e){}
        if(!inserted){el.textContent=t;}
        fireInput('insertText',t);
      }else{
        // 表单控件：走 IME 组合序列（中文场景的必经链路）+ 逐字 input
        try{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));}catch(e){}
        if(set){set.call(el,t);}else{el.value=t;}
        try{el.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:t}));}catch(e){}
        fireInput('insertText',t);
        try{el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:t}));}catch(e){}
        // 组合结束后再补一次 input：部分组件只在 compositionend 之后才读值
        fireInput('insertText',t);
      }

      // ④ 真实按键事件：让监听 keydown/keyup 的逻辑（Enter 提交、快捷键、字数统计）能响应
      //   ★ 只发事件不阻止默认行为 —— 与真人敲键一致（这里是"已输入完"的补充信号）
      if(t){
        var kd={bubbles:true,cancelable:true,key:t.slice(-1),code:'',keyCode:0,which:0};
        try{el.dispatchEvent(new KeyboardEvent('keydown',kd));el.dispatchEvent(new KeyboardEvent('keyup',kd));}catch(e){}
      }

      // ⑤ change + 失焦确认（真人输入完通常会点别处/提交，change 是表单校验的触发点）
      try{el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}

      // 回读核验（宽松等价，2026-10-12 P0-2）：页面常对文本做 trim/折叠空白/maxlength 截断，
      // 用严格相等会误判"未生效"→ 模型反复重填。规范化空白后：相等 / 互相包含 任一即算填入。
      var got=isCE?(el.textContent||''):(el.value!=null?String(el.value):'');
      var _n=function(s){return String(s==null?'':s).replace(/\\s+/g,' ').trim();};
      var _ga=_n(got),_ex=_n(t);
      // ★ 非空守卫：回读为空时 _ex.indexOf('') 恒为 0 → 会把“组件重置为空”误判成已填入。
      var _applied=(_ga===_ex)||(!!_ex&&!!_ga&&(_ga.indexOf(_ex)>=0||_ex.indexOf(_ga)>=0));
      return{applied:_applied,normalized:_applied&&String(got)!==String(t),value:got.slice(0,120)};
    }
    // 为元素生成尽量稳定的唯一 CSS 选择器
    function genSel(el){
      function esc(s){return String(s).replace(/"/g,'\\\\"');}
      if(el.id&&/^[A-Za-z][\\w-]*$/.test(el.id)){try{if(document.querySelectorAll('#'+el.id).length===1)return '#'+el.id;}catch(e){}}
      var tid=el.getAttribute('data-testid');if(tid)return '[data-testid="'+esc(tid)+'"]';
      var t=el.getAttribute('data-test');if(t)return '[data-test="'+esc(t)+'"]';
      var al=el.getAttribute('aria-label');if(al){var s=el.tagName.toLowerCase()+'[aria-label="'+esc(al)+'"]';try{if(document.querySelectorAll(s).length===1)return s;}catch(e){}}
      var cls=(typeof el.className==='string'?el.className:'').trim().split(/\\s+/).filter(Boolean);
      for(var i=0;i<cls.length;i++){var s2=el.tagName.toLowerCase()+'.'+cls[i].replace(/[^\\w-]/g,'');try{if(s2&&document.querySelectorAll(s2).length===1)return s2;}catch(e){}}
      var nm=el.getAttribute('name');if(nm){var s3=el.tagName.toLowerCase()+'[name="'+esc(nm)+'"]';try{if(document.querySelectorAll(s3).length===1)return s3;}catch(e){}}
      var ph=el.getAttribute('placeholder');if(ph){var s4=el.tagName.toLowerCase()+'[placeholder="'+esc(ph)+'"]';try{if(document.querySelectorAll(s4).length===1)return s4;}catch(e){}}
      var path=[],cur=el,depth=0;
      while(cur&&cur.nodeType===1&&cur!==document.body&&depth<6){
        var pe=cur.parentElement;if(!pe)break;
        var sibs=Array.from(pe.children).filter(function(c){return c.tagName===cur.tagName;});
        var idx=sibs.indexOf(cur)+1;
        path.unshift(cur.tagName.toLowerCase()+(sibs.length>1?':nth-of-type('+idx+')':''));
        cur=pe;depth++;
      }
      return path.length?path.join(' > '):el.tagName.toLowerCase();
    }
    // 元素注册表：可交互元素编号（index），供 click/type 直接按编号定位
    if(!window.__yzElements)window.__yzElements=[];
    if(!window.__yzSelMap)window.__yzSelMap={};
    function register(el){
      if(el&&el.__yzIndex!=null&&window.__yzElements[el.__yzIndex]===el)return el.__yzIndex;
      var i=window.__yzElements.push(el)-1;
      try{el.__yzIndex=i;}catch(e){/* 跨域对象不可挂属性时忽略 */}
      var sel=genSel(el);if(sel)window.__yzSelMap[i]=sel;
      return i;
    }
    // 解析选择器为元素数组（:contains 伪选择器返回全部匹配）
    function resolveAll(sel){
      if(!sel)return[];
      var m=String(sel).match(/^([\s\S]*?):contains\(\s*["']([\s\S]*?)["']\s*\)\s*$/);
      if(m){
        var base=m[1]||'*';var text=m[2];var out=[];
        var els;try{els=document.querySelectorAll(base);}catch(e){return[];}
        for(var i=0;i<els.length;i++){var el=els[i];
          if((el.textContent||'').trim().indexOf(text)>=0&&el.offsetParent!==null)out.push(el);}
        return out;
      }
      try{return Array.prototype.slice.call(document.querySelectorAll(sel));}catch(e){return[];}
    }
    function resolve(sel){var a=resolveAll(sel);return a.length?a[0]:null;}
    window.__yzAssistant={showCursor:showCursor,hideCursor:hideCursor,clickAt:clickAt,typeIn:typeIn,resolve:resolve,resolveAll:resolveAll,genSel:genSel,register:register,
      /* 注入版本标记（2026-10-11）：injectYzAssistant 的"已注入"探测靠它（见该函数入口）。
         改了上面的脚本内容时要同时递增这里的值（否则新脚本在旧页面里不会被重注入）。
         ★ 注意：本段位于模板字符串内，注释只能用块注释、且不得出现反引号。 */
      __yzVersion:1};
  })()`);
}

// 通用 action handler
// 变化检测：这些 action 可能改变页面状态，执行后对比前后快照，防止模型盲操作死循环
const CHANGE_ACTIONS = new Set(['click', 'type', 'press', 'select_option', 'check', 'uncheck', 'submit_form', 'search', 'next_page', 'prev_page']);
// ★★★ B7（2026-10-09）：由模块级单值改为**按 tab 分桶**，与服务端（server/routes/browser.ts）同口径。
//   单值会让"甲页面卡住"与"乙页面正常"互相污染：乙收到"连续 3 次无变化"的**假告警**
//   （它其实只操作了一次），而甲的真告警会被乙的成功操作**清零** —— 两个方向都错且不报错。
//   ★ 为什么按 tab 而不是按会话：① 语义上这是"页面的状态"；② 服务端 /action 拿不到会话标识；
//     ③ 两链路都能拿到 tabId（桌面这里首参就是 tabId）。
//   ★ 为什么内联而不 require('@yan-zhi/shared')：main.cjs 是 **CJS**，而 shared 是
//     `type: module` + TS 源码（`main: ./src/index.ts`）→ CJS require 不了（实测）。
//     ⇒ 内联一份等价实现，并用 `apps/desktop/test/keyed-streak-parity.test.cjs`
//       钉住"与服务端 KeyedStreak 行为一致"（含文案逐字一致）。
const NO_CHANGE_THRESHOLD = 3;
const noChangeStreaks = new Map();
function recordNoChange(tabKey, changed) {
  const k = String(tabKey == null ? 'default' : tabKey);
  if (changed) { noChangeStreaks.set(k, 0); return { streak: 0 }; }
  const next = (noChangeStreaks.get(k) || 0) + 1;
  noChangeStreaks.set(k, next);
  // 上限兜底：关 tab 路径若有漏网，淘汰最早插入的桶（Map 迭代序=插入序）
  while (noChangeStreaks.size > 200) {
    const oldest = noChangeStreaks.keys().next().value;
    if (oldest === undefined) break;
    noChangeStreaks.delete(oldest);
  }
  if (next >= NO_CHANGE_THRESHOLD) {
    return { streak: next, warning: '连续 ' + next + ' 次操作页面无任何变化，操作可能未生效。请停止重复同类操作：改用 index 精确定位（先 browser_get_page_info 获取最新编号）、重新分析页面、或 ask_user 请求人工介入。' };
  }
  return { streak: next };
}
const STATE_SNAPSHOT_JS = `(function(){try{var d=document.body;return{url:location.href,t:(d?d.innerText:'').slice(0,2000),n:document.querySelectorAll('a,button,input,select,textarea').length};}catch(e){return null;}})()`;

/**
 * 输入回读的「宽松等价」判据（2026-10-12，诊断报告 P0-2）。
 *
 * ★★★ 为什么必须放宽（用户实报"填表单反复填写"）：
 *   此前回读核验用 `got === expected` **严格相等**。页面只要对文本做了规整
 *   （trim / 折叠空白 / 换行规范化 / maxlength 截断 / 站点格式化），回读值就 ≠ 期望值
 *   ⇒ 误判 `applied:false` ⇒ 提示语引导模型"核验并重填" ⇒ **同一字段被反复填**。
 *   而文本其实早已进入输入框。
 *
 * ★ 判据（规范化空白后，三者任一即视为"已填入"）：
 *   ① 完全相等；
 *   ② 回读值**包含**期望值（页面加了前后缀/格式化）；
 *   ③ 期望值包含回读值（页面按 maxlength 截断）。
 *   返回 `{ applied, normalized }`：`normalized:true` 表示"不是逐字相等但已判定填入"，
 *   调用方据此回中性文案、**不再诱导重填**。
 */
function looseTextEqual(got, expected) {
  // ★ 2026-10-13 合并本轮修复：补一层零宽字符过滤。
  //   上游版已做了空白折叠 + 双向包含 + normalized 信号；但 U+200B/200C/200D/FEFF 这类
  //   不可见字符会让"肉眼看完全一样"的文本判不相等（页面/复制粘贴常见），误判成"没填上"。
  //   ★ 刻意用码点比较，不写 /[​-‍﻿]/ —— 源码里直接落不可见字符、
  //   或反斜杠个数写错，都会变成"看着对、实际错"；码点写法在源码里是纯 ASCII。
  const stripZeroWidth = (s) => {
    let out = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff) continue;
      out += ch;
    }
    return out;
  };
  const norm = (s) => stripZeroWidth(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();
  const rawGot = String(got == null ? '' : got);
  const rawExp = String(expected == null ? '' : expected);
  const a = norm(rawGot);
  const b = norm(rawExp);
  let applied;
  if (a === b) applied = true;                                 // 规范化后完全相等
  else if (!b) applied = a === '';                             // 期望为空：只有回读也为空才算
  else applied = !!(a && (a.includes(b) || b.includes(a)));    // 互相包含（页面加前后缀 / maxlength 截断）
  // normalized=true：原始值**并不逐字相等**，是"规范化后判定已填入"（页面规整过）。
  // ★ 注意 `a && (...)` 里的 `a` 非空守卫：若回读为空（''），`b.includes('')` 恒为 true
  //   ⇒ 会把"受控组件重置为空"误判成"已填入"（原信号必须保住）。
  return { applied, normalized: applied && rawGot !== rawExp };
}

/**
 * ★★★ 真键盘输入（CDP 通道）—— 2026-10-08 用户诉求「能否完全模拟人的操作」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 为什么必须走 CDP，而不是 JS 里 setter/赋值：
 *
 * `typeIn`（JS 实现）本质是**程序化改值**，缺的是"人打字"产生的整套事件与编辑语义：
 *   · **无 `keydown`/`keypress`/`keyup`** → 页面上靠 keydown 做的提交拦截、快捷键、
 *     字数统计、Enter 发送，一个都不响应；
 *   · **无 `compositionstart/update/end`** → 中文输入法（IME）组词路径完全不触发。
 *     中文评论框几乎都监听 composition 事件收值 → "看着有字、提交是空的"；
 *   · contenteditable 走 `textContent = 值` → **富文本编辑器（ProseMirror / Slate / Draft.js）
 *     的内部 model 不同步** —— 它们只认 `beforeinput`/`input` 的编辑操作，不认 DOM 直改。
 *     这是评论框（知乎/抖音/头条等）填不进去的直接原因；
 *   · 无 `inputType`（`insertText` / `insertFromPaste`）→ 部分组件按 inputType 分支处理，收不到就忽略。
 *
 * CDP 的 `Input.insertText` 是 Chromium **官方推荐的文本注入方式**：它走真实的编辑管线，
 * 会派发 `beforeinput`（inputType=insertText）+ `input`，富文本编辑器与受控组件都能正确接收；
 * `Input.dispatchKeyEvent` 派发真实按键（含 Enter/Tab/方向键）。
 * ★ 与已落地的 `upload`（DOM.setFileInputFiles）是同一套模式：Electron 内置 CDP 客户端，
 *   对 <webview> guest 同样有效，不引入新依赖。
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @returns 成功返回 {applied, typed, value}；不可用/失败返回 {error} 或 null（调用方回落 JS 实现）
 */
async function cdpTypeText(wc, target, text, pressEnter) {
  if (!wc || typeof wc.debugger === 'undefined') return null;
  const dbg = wc.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); attachedHere = true; }
    const send = (method, params) => dbg.sendCommand(method, params);

    // ① 定位并**聚焦**目标：聚焦后键盘事件才会路由到正确的元素。
    //    用 JS 做（DOM 操作是 JS 的强项），CDP 只负责"打字"。
    const sel = target?.selector != null ? String(target.selector) : '';
    const idx = Number.isFinite(Number(target?.index)) ? Number(target.index) : -1;
    const focusRes = await wc.executeJavaScript(`(function(){
      var sel=${JSON.stringify(sel)};var idx=${idx};
      var el=null;
      if(idx>=0){el=window.__yzElements&&window.__yzElements[idx];}
      if(!el&&sel){try{el=document.querySelector(sel);}catch(e){}}
      if(!el&&idx>=0&&window.__yzSelMap&&window.__yzSelMap[idx]){el=document.querySelector(window.__yzSelMap[idx]);}
      if(!el)return{error:sel?('元素未找到: '+sel):(idx>=0?('index '+idx+' 已失效（页面已变化），请重新调用 browser_get_page_info 获取最新编号'):'无聚焦元素')};
      if(!el.isConnected)return{error:'元素已从页面移除（index/selector 已过期），请重新获取页面元素列表'};
      try{el.scrollIntoView({block:'center'});}catch(e){}
      el.focus();
      // 富文本/输入框：先清空（选中全部再删），避免与已有内容拼接
      try{
        if(el.isContentEditable){
          var r=document.createRange();r.selectNodeContents(el);
          var s=window.getSelection();s.removeAllRanges();s.addRange(r);
          document.execCommand('delete',false);
        }else if(typeof el.select==='function'){ el.select(); }
      }catch(e){}
      try{ if(window.__yzAssistant){var rc=el.getBoundingClientRect();window.__yzAssistant.showCursor(rc.x+rc.width/2,rc.y+rc.height/2,'输入');} }catch(e){}
      return {ok:true, isCE:el.isContentEditable===true, tag:el.tagName};
    })()`).catch((e) => ({ error: String((e && e.message) || e) }));

    if (!focusRes || focusRes.error) {
      // 定位失败不是"CDP 不可用"，而是真错误 —— 交给调用方按原逻辑回报（不回落，避免重复报错）
      return { locateError: (focusRes && focusRes.error) || '目标元素定位失败' };
    }
    let formVia = ''; // 表单分支实际走的注入路径（guest-typein / cdp-keyboard），回填到 via

    // ② 真实文本注入。
    //   ★ contenteditable（富文本 / 字节 editor-kit 等受控编辑器）：CDP 的 browser-level
    //     Input.insertText 常被 React 重置（回读为空、字数计数不涨，抖音创作者中心作品描述框即此）。
    //     改用 guest 内 execCommand('insertText')：① 渲染进程内闭环，不会像 browser-level 输入那样
    //     泄漏到宿主聚焦元素（聊天输入框）；② 触发编辑器完整 beforeinput 管线，其内部 model 能同步。
    //     实测抖音描述框以此方式才被计数识别（39 / 1000）。
    //   ★ 普通 input/textarea（2026-10-11 泄漏修复，**guest 内闭环优先**）：
    //     此前一律走 browser-level CDP Input.insertText —— 实测（16:11 抖音搜索）文本会同时
    //     落进宿主聚焦元素（聊天输入框出现「我出生那天」），因为 webview guest 未持有系统级
    //     焦点时 browser-level 注入会路由到当前聚焦的宿主输入框。现在表单分支先走 guest 内
    //     typeIn（native setter + IME 组合事件，中文/受控组件都认，且带回读核验），CDP 仅兜底。
    if (text) {
      if (focusRes && focusRes.isCE) {
        const ceOk = await wc.executeJavaScript(
          `(function(){try{return document.execCommand('insertText',false,${JSON.stringify(String(text))});}catch(e){return false;}})()`
        ).catch(() => false);
        if (!ceOk) await send('Input.insertText', { text: String(text) });
      } else {
        const formRes = await wc.executeJavaScript(`(function(){
          var A=window.__yzAssistant; var el=null;
          var idx=${idx}; var s=${JSON.stringify(sel)};
          if(idx>=0){el=window.__yzElements&&window.__yzElements[idx];}
          if(!el&&s){try{el=document.querySelector(s);}catch(e){}}
          if(!el){el=document.activeElement;}
          if(!el||!A)return {applied:false,value:''};
          var r=A.typeIn(el,${JSON.stringify(String(text))});
          return {applied:!!r.applied,value:String(r.value==null?'':r.value)};
        })()`).catch(() => ({ applied: false, value: '' }));
        if (formRes && formRes.applied) {
          formVia = 'guest-typein';
        } else {
          // guest 内未生效（助手未注入 / 受控组件拒绝程序化输入）→ CDP 真键盘兜底
          await send('Input.insertText', { text: String(text) });
        }
      }
    }

    // ③ 回车（提交/搜索）：必须用真实按键，不是 JS 造 KeyboardEvent ——
    //    部分页面对 synthetic 事件做了 isTrusted 检查而忽略。
    if (pressEnter) {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, text: '\r', unmodifiedText: '\r' });
      await send('Input.dispatchKeyEvent', { type: 'char', ...key, text: '\r', unmodifiedText: '\r' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    }

    // ④ 回读核验 + 失败兜底：CDP 真键盘若未生效（受控组件重置 / 聚焦错配到宿主），
    //   退回 guest 内 typeIn（renderer-scoped，不会泄漏到宿主；已按 contenteditable / 表单分别
    //   走 execCommand / IME 序列），保证"替换语义"输入真正落到目标元素。
    const verify = await wc.executeJavaScript(`(function(){
      var sel=${JSON.stringify(sel)};var idx=${idx};
      var el=null;
      if(idx>=0){el=window.__yzElements&&window.__yzElements[idx];}
      if(!el&&sel){try{el=document.querySelector(sel);}catch(e){}}
      if(!el)el=document.activeElement;
      if(!el)return '';
      return el.isContentEditable===true?(el.textContent||''):(el.value!=null?String(el.value):'');
    })()`).catch(() => '');

    let got = String(verify ?? '');
    const expected = String(text || '');
    // ★ 2026-10-12 P0-2：严格相等 → 宽松等价（见 looseTextEqual 注释）。
    let cmp = looseTextEqual(got, expected);
    let applied = cmp.applied;
    let fallback = false;
    if (!applied && text) {
      const fb = await wc.executeJavaScript(`(function(){
        var A=window.__yzAssistant; var el=null;
        var idx=${idx}; var s=${JSON.stringify(sel)};
        if(idx>=0){el=window.__yzElements&&window.__yzElements[idx];}
        if(!el&&s){try{el=document.querySelector(s);}catch(e){}}
        if(!el){el=document.activeElement;}
        if(!el||!A)return {applied:false,value:''};
        var r=A.typeIn(el,${JSON.stringify(String(text))});
        return {applied:r.applied,value:r.value};
      })()`).catch(() => ({ applied: false, value: '' }));
      if (fb && fb.applied) { applied = true; cmp = { applied: true, normalized: false }; got = String(fb.value || ''); fallback = true; }
    }

    return {
      applied,
      // normalized=true：不是逐字相等，但规范化后判定已填入（页面做了格式化/截断）
      normalized: cmp.normalized,
      typed: expected.length,
      value: got.slice(0, 120),
      via: fallback ? 'js-typein' : (formVia || (focusRes && focusRes.isCE ? 'ce-execcommand' : 'cdp-keyboard')),
      ...(applied
        ? {}
        : { hint: '输入未生效（受控组件重置或输入被页面拦截）。已尝试 guest 内 typeIn 兜底仍失败 —— 请用 browser_get_page_content 核验输入框当前值后再决定，**不要盲目重复输入**。' }),
    };
  } catch (e) {
    // CDP 不可用（未就绪/被占用/引擎不支持）→ 返回 null 让调用方回落 JS 实现
    return null;
  } finally {
    if (attachedHere) { try { dbg.detach(); } catch { /* ignore */ } }
  }
}


/**
 * ★★★ 桌面端浏览器 action 的**能力清单**（B5 根治，2026-10-10）。
 *
 * ★ 为什么必须显式列出（实测缺口）：主进程的 action 分发是 `switch`（无法枚举），
 *   而渲染层 `chat.ts` 的 `actionMap` 是**另一份硬编码清单** ⇒ **两份清单必然失同步**：
 *   实测主进程已实现 **40 个 action**，而 `actionMap` 只映射 27 个 →
 *   11 个**明明已实现**的能力落到兜底、报「桌面端暂不支持 XX」（**能力在、入口断**）。
 * ★ 修法：本清单作为**单一真相源**，经 `browserView:actions` 暴露给渲染层；
 *   渲染层据此判断"能不能走桌面端"，不再依赖自己那份会漂移的硬编码。
 * ★ 加新 action 时**必须同时**：① 在 `switch` 里加 case ② 在此清单加名字。
 *   （测试 `browser-desktop-action-parity.test.ts` 会比对两者，漏一处即红。）
 */
const DESKTOP_BROWSER_ACTIONS = [
  'upload', 'navigate', 'click', 'type', 'press', 'scroll', 'hover', 'screenshot',
  'get_page_info', 'get_visible_text', 'get_page_content', 'fill_form', 'submit_form',
  'search', 'next_page', 'prev_page', 'wait_for', 'select_option', 'check', 'uncheck',
  'get_text', 'get_dom', 'wait', 'back', 'forward', 'reload', 'get_url',
  'new_tab', 'switch_tab', 'close_tab', 'get_tabs', 'wait_for_request', 'get_network_log',
  'extract_list', 'visual_locate', 'download', 'scroll_into_view', 'is_visible', 'drag',
  'run_script',
];

/** 渲染层可查询桌面端支持哪些 action（避免两份硬编码清单漂移） */
ipcMain.handle('browserView:actions', () => DESKTOP_BROWSER_ACTIONS.slice());

// ============================================================
// 表单快照与差异（2026-10-13）
//
// ★ 为什么需要（会话 253bd3f4 实测的"反复填同一个表单"机制）：
//   模型填完一个字段后**无法知道"现在表单整体是什么状态"** —— `applied` 只回答
//   "本次调用写进去了没有"，回答不了"标题改了、描述还剩旧值、哪个字段还空着"。
//   于是它只能再读一轮页面自己比对；而读回来的是**平铺的可交互元素清单**
//   （几十上百条，值被截断、顺序随 SPA 重渲染漂移），从中推断"我填的到底生效没"
//   极易判错 → 判定没生效 → 再填一遍。实测该会话 9 次 browser_type 里同一段文字
//   填了 2~3 遍，全天 180 次 run_script 里相当一部分是手写脚本回读表单值。
//
// ★ 修法：读页时**顺带给出表单语义段 + 与上次读取的差异**（值级 diff）。
//   模型一眼看到「作品描述: "XXTESTXX我出生那天…" → 含测试前缀」就不用再猜；
//   看到「本次无字段变化」就知道上一步白做了，该换定位方式而不是重填。
//   Claude（computer use）每步拿到"状态差异"正是它不反复填的关键。
//
// ★ 快照按 tab 存、并绑定 URL：跨页导航后不与上一页比较（否则整页字段都算"变了"，
//   噪声淹没信号）。上限 40 字段、值 80 字，避免自己变成新的内存/日志负担。
// ============================================================
const lastFormSnapshots = new Map();   // tabKey → { url, fields: Map<key, value> }

/** 依据「字段标签（退化到 selector）」建稳定 key —— 标签为空时用 selector 兜底 */
function formFieldKey(f) {
  const label = String((f && f.label) || '').trim();
  return label || String((f && f.selector) || '');
}

/**
 * 与上次读取比较，返回字段级变化列表；同时更新快照。
 * @returns {Array<{field:string,from:string,to:string,filled:boolean}>} 最多 20 条
 */
function diffFormSnapshot(tabKey, url, fields) {
  const list = Array.isArray(fields) ? fields : [];
  const now = new Map();
  for (const f of list) now.set(formFieldKey(f), String(f && f.value != null ? f.value : ''));
  const prev = lastFormSnapshots.get(tabKey);
  const changes = [];
  if (prev && prev.url === url) {
    for (const f of list) {
      const key = formFieldKey(f);
      const before = prev.fields.get(key);
      const after = String(f && f.value != null ? f.value : '');
      // 只报"上次见过且值变了"的字段：新出现的字段（上次没读到）不算变化，
      // 否则 SPA 重渲染/懒加载会让每次读页都刷出一堆假变化。
      if (before !== undefined && before !== after) {
        changes.push({
          field: key,
          from: before.slice(0, 60),
          to: after.slice(0, 60),
          filled: !!after,
        });
      }
    }
  }
  lastFormSnapshots.set(tabKey, { url, fields: now });
  // 上限兜底：正常由 clearFormSnapshot 在 tab 关闭/逐出/回收时清理，但 tabId 单调递增，
  // 任何一条遗漏路径都会让 Map 慢慢长大 → 这里再兜一层（超 200 条按插入序淘汰最早的）。
  while (lastFormSnapshots.size > 200) {
    const oldest = lastFormSnapshots.keys().next().value;
    if (oldest === undefined) break;
    lastFormSnapshots.delete(oldest);
  }
  return changes.slice(0, 20);
}

/** tab 关闭/回收时清快照（防 Map 随会话长时间累积） */
function clearFormSnapshot(tabKey) {
  try { lastFormSnapshots.delete(tabKey); } catch { /* ignore */ }
}

/**
 * ★★★ 浏览器 action 的**唯一实现**（「执行面直连化」P0-1，2026-10-10）。
 *
 * ★ 为什么必须抽出来：本函数有两个调用方 ——
 *   ① `ipcMain.handle('browserView:action')`（SSE 委托路径，渲染层调用）
 *   ② `browser-bridge.cjs` 的本地端点（直连路径，服务端调用）
 *   若桥自己复制一份 `switch`，两处的 action 行为**必然漂移**（本项目一贯判据：
 *   同一语义只能有一处实现）。⇒ 桥只做"鉴权 + 白名单 + 调本函数"。
 *
 * @param convId 会话标识（服务端经桥透传；IPC 调用传 null —— 渲染层自己已锚定 tabId）
 * @param tabId  目标 tab；null 表示"按会话锚定解析 / 回落活动页"
 */
// ★★★ 桥路径同 tab 动作**串行化**（2026-10-14）：实现抽到 ./browser-op-chain.cjs ——
//   main.cjs 需要 Electron 才能加载，对它的测试只能做源码文本断言（太弱），
//   而这里要防的两件事（串行顺序、排队上限放行）都是**行为级**的，必须真跑；
//   该模块有行为测试（test/browser-op-chain.test.cjs）。
//   ★ 为什么只在桥路径做、为什么必须有排队上限：见该文件头注。
//   ★ 简言之：渲染层路径已有 chainBrowserOp 串行（且不该让用户点工具栏排队），
//     桥路径此前**全链路零串行** —— 那才是"超时后两个动作在同一页面上打架"的缺口。
const { chainTabAction } = require('./browser-op-chain.cjs');
/** 同 tab 串行链（key = tabId；链的维护与上限见 browser-op-chain.cjs） */
const tabActionChains = new Map();
/**
 * ★★★ 正在**执行**动作的 tab（key 与 tabActionChains 同形）—— 空闲回收 / LRU 逐出**不得动**它们。
 *
 * 为什么必须（2026-10-15 查实）：单次浏览器动作最长可到 8 分钟（导航慢档 7 分钟 + 独立排队宽限 60 秒），
 * 而空闲回收/逐出的判据是"`lastActiveAt` 超过 10 分钟没用过" —— 只要这次动作**开始得早**，
 * 回收就会在动作还在飞的时候把那个页抽走 ⇒ 工具随后莫名失败或读到空白页，
 * 且回执里说不清真正的原因（本项目最怕的一类：看着像"页面自己变了"）。
 * ⇒ 登记范围只覆盖"正在执行"这一段（不含排队段），Set 也小（每个 tab 至多一个）。
 */
const tabActionBusy = new Set();

async function runBrowserAction(convId, tabId, action, args, flow) {
  args = args || {};
  // ★★★ 2026-10-15：本执行流的**流键** = `${convId}::${flow}`（判定本体在 browser-target.cjs 的 flowKeyOf）。
  //   「锚」与「归属」都按它隔离 —— 这是后台标签页方案（docs/background-tab-parallel-plan.md §4.3）的地基：
  //   同一会话里将来有多条流（主面板流 + 各自的后台标签页流），只按 convId 一个维度会让后台流
  //   覆盖主面板的"当前操作页"。
  //   ★ 缺省 `flow` → 共享主面板流 ⇒ **今天的语义逐字不变**（后端目前一律传 SHARED_FLOW）。
  //   ★ 渲染层 IPC 路径（SSE 委托）`convId` 传 null ⇒ flowKey 也是 null ⇒ 不参与主进程锚定，行为不变。
  const flowKey = flowKeyOf(convId, flow);
  // ★★★ 后台流（`browserTarget:'background'`，键形如 `bg:sub:<tcId>`）：它的页是**给 agent 自己用的**，
  //   一切"给人看"的副作用都必须挡掉 —— 见下三处（不回落用户当前页 / 不激活它建的页 / 不切标签页）。
  //   判据只在 browser-target.cjs 的 isBackgroundFlow 一处（前后端不各写一份）。
  const bgFlow = isBackgroundFlow(flow);
  // ★★★ 浏览器动作全链路日志（2026-10-10）：这是"面板开了却没导航"这类静默失效的**唯一可靠线索**。
  //   此前 grep 全仓：浏览器动作路径**零日志** —— 出问题时既看不到"有没有收到 action"，
  //   也看不到"tabId/scope 解析成什么"、"guest 拿到没有"，只能靠读代码猜。
  //   ★ 只记关键摘要（action 名 + tabId + url），不记截图 base64 等大字段，避免日志爆炸。
  //   ★ 这里**不拆函数**：`browser-bridge-direct.test.ts` 钉住「runBrowserAction 是唯一实现」，
  //     必须在同一函数体内保留唯一那处 `switch(action)`。
  try {
    const _a = { ...args };
    if (typeof _a.base64 === 'string') _a.base64 = `<${_a.base64.length} chars>`;
    if (typeof _a.script === 'string' && _a.script.length > 200) _a.script = _a.script.slice(0, 200) + '…';
    // ★ 带 flow：多流并行后"这条动作属于哪条流"是定位互踩的第一线索（缺省流打 shared）
    console.log(`[browser-action] ${action} conv=${convId || '-'} flow=${flow || 'shared'} tabId=${tabId || '-'} args=${JSON.stringify(_a).slice(0, 300)}`);
  } catch { /* 日志失败绝不影响动作 */ }
  // ★★★ 2026-10-11：`browser_navigate(openInNewTab:true)` → **直接委派给 `new_tab`**。
  //
  //   ★ 先纠一个"看似有、实则失效"的缺口：
  //     该参数的处理**原先只写在渲染层**（`packages/ui/src/stores/chat.ts` 里读 `args.openInNewTab`）。
  //     而执行面直连化（2026-10-10）后，`browser_*` 由**服务端直连主进程**执行、
  //     渲染层 `tool:execute` 守卫直接跳过 ⇒ 那段代码**根本不会跑**
  //     ⇒ `openInNewTab` 被静默忽略 ⇒ 退化成"覆盖当前页"（正是工具描述承诺的反面）。
  //
  //   ★ 语义（用户拍板）：**开新页 ≠ 抢锚** —— 新开 tab 并返回 tabId，
  //     但**不改变"本会话当前操作页"**。这与 `new_tab` 的语义**逐字一致**：
  //       · 开新页 + 返回 tabId
  //       · `decideAnchorUpdate('new_tab', …)` → **`touch`（不抢锚）**
  //       · 已有完整实现：黄金通道 `tabCreated` 建壳 / tab 上限收口 / `agentOpened` 记账 / url 落位
  //   ⇒ 所以**只做一次 action 改写**，复用 new_tab 全套 —— **绝不抄第二份建壳逻辑**
  //     （本项目反复栽在"平行实现漂移"上，见 browser-target.cjs 与前述 scope 两条通道的教训）。
  //   ★ 位置：必须在 `resolveBrowserTarget` **之前** —— 它按 action 决定"建页类是否回落活动页"，
  //     改写后再解析才符合 new_tab 语义（new_tab 是建页类，且不需要锚）。
  if (action === 'navigate' && args.openInNewTab === true) {
    console.log('[browser-action] openInNewTab=true → 委派 new_tab（编排层注入，锚跟随新页）');
    action = 'new_tab';
    // ★★★ 2026-10-15（「导航跑偏」P0-②）：记录"本次 new_tab 是编排层委派的"。
    args._orchestratedNewTab = true;
  }
  // ★★★ P0-2（2026-10-10）：执行目标解析 —— **判定本体在 `browser-target.cjs`**（纯函数、可真跑验证）。
  //   三条语义（缺一条就会"打到错的页"且不报错）：
  //   ① 显式 tabId **优先**（工具契约："可传 tabId 读取指定标签页，不必先切换标签页"）；
  //   ② 显式 tabId 必须**属于本会话**（否则跨会话越权）；
  //   ③ 无显式 tabId → 用锚；未锚定且非建页类 → **明确报错**（绝不静默用全局活动页）。
  //   ★ 返回 ok:false 时直接回错误，不往下走。
  {
    const r = resolveBrowserTarget(convId, tabId, action, {
      anchored: resolveTabIdForFlow(flowKey),
      // ★★★ P3-6（2026-10-16）：**目标页锁定** —— 页面对话任务开始时面板钉住的那一页。
      //   有锁定时：无显式 tabId 的动作一律落在锁定页（不再走锚、更不回落 activeTabId），
      //   new_tab / switch_tab 直接拒绝 —— 治掉"另开一页 / 切走之后答的是别的页"这一整类漂移
      //   （面板此前只能事后提示「结果可能来自新页面」）。语义与判定本体见 browser-target.cjs。
      //   ★ 后台流不会被锁定：它有自己的流键（`conv::bg:x`），面板只钉前台的 `::shared`。
      pinned: resolveFlowPinForFlow(flowKey),
      // ★ 建页类动作未锚定时的回落目标（见 browser-target.cjs 的 `activeTabId` 注释）：
      //   首次 navigate 必须能从"当前活动页"出发，否则锚永不建立 → 读类动作全被拒 → 模型疯狂重试。
      // ★★★ 但**后台流不给回落**（传 null）：否则它的首次 navigate 会直接导航走用户正在看的那页
      //   —— 后台流的第一页必须是**它自己新建的**（tabId 保持 null → 走自建分支）。
      activeTabId: bgFlow ? null : activeTabId,
      isMine: (t) => agentTouchedTabs.get(t) === flowKey,
      // ★★★ 2026-10-10 四次根因修复：仅靠 `isMine` **挡不住**首次 navigate。
      //   因为 `agentTouchedTabs` 只在动作**成功执行后**登记 ⇒ 首次 navigate 时该 tab 未登记
      //   ⇒ `isMine` 返回 false ⇒ 回落不生效 ⇒ 锚建不起来（前三次修复等于白改）。
      //   ⇒ 补一道"就是本面板当前活动页"的放行（UI 语义：用户肉眼可见的页 = 本会话可见的页）。
      //   跨会话越权的真实威胁是"显式传别的会话的 tabId"，那条由 resolveTarget ①② 分支拦，未动。
      isCurrentView: (t) => t === activeTabId,
      // ★★★ 2026-10-15（「导航跑偏」第三层，跨会话）：当前活动页若**已被别的会话**操作过，
      //   不回落 —— 否则后启动的会话会把前一个会话正在用的页导航走（用户实报的
      //   "上两个并发任务把预览面板搞乱了"），且前者的下一次读取会读到后者的页面、不报错。
      //   归属真相源仍是 `agentTouchedTabs`（tab → 认领它的 **flowKey**）。
      isOwnedByOther: (t) => {
        const owner = agentTouchedTabs.get(String(t));
        return !!owner && owner !== flowKey;
      },
    });
    if (!r.ok) return { error: r.error };
    tabId = r.tabId;
  }
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  let wc = null;
  if (isWebviewEngine()) {
    // webview 引擎：guest 由渲染层 <webview> 承载，fromId 拿到后复用下面全部 action 实现
    wc = await waitForGuest(tabId || activeTabId, 3000);
    // navigate 是特例：面板停在"浏览器首页/主页"（无任何已导航页）时还没有 <webview>、
    // guest 自然不存在。此时不能直接报"未打开"——应先让渲染层在该 scope 打开目标页并建出
    // <webview>（:src=url → dom-ready → 注册 guest），再等 guest 出现后继续导航。
    if (!wc && action === 'navigate' && args.url) {
      const cleanUrl = String(args.url || '').trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
      // ★★★ 自建步骤：面板停在"浏览器首页/主页"（无任何已导航页）时还没有 <webview>、
      //   guest 自然不存在。此时不能直接报"未打开"——先让渲染层在该 scope 打开目标页并建出
      //   <webview>（:src=url → dom-ready → 注册 guest），再等 guest 出现后继续导航。
      //
      //   ★★★ 关键（2026-10-10 修真缺陷）：**必须把新 tab 登记成本流的操作过页面**。
      //     渲染层建 guest 时调的是 `browserView:createTab`（**不是** `switch(action)` 的
      //     `case 'new_tab'`）⇒ 该 tab 不会经过任何登记点 ⇒ 后续动作若带显式 tabId
      //     （agent 常带）会被"越权闸门"**误拒**（报"不属于本会话"），且 agent 首导航后
      //     第二次带 tabId 的读/写**必然失败**（表现为"打开网页后就读不了"）。
      //     ⇒ 这里显式登记（`agentTouchedTabs` 是"本流用过"的唯一真相源）。
      if (convId) {
        const scopeMeta0 = (tabId ? webviewTabs.get(tabId) : null);
        // ★ 2026-10-15：浏览器改为**应用级单例**（三级归属模型：浏览器=整个应用一份，
        //   Git/文件=工作空间级，控制台=会话级）⇒ 执行面 scope 固定裸 'preview'，
        //   与渲染层 BrowserPanel（scope='preview'）和 tabCreated 广播同源。
        //   此前兜底用 `preview:${convId}`：面板 scope 已改为 'preview' 后
        //   onTabCreated 的 belong 匹配不上 ⇒ 壳建不出来 ⇒ waitForGuest 超时。
        const wantScope = (scopeMeta0 && scopeMeta0.scope) || 'preview';
        // ===NAV-REUSE-START=== 同 URL 复用（2026-10-12）；navigate-reuse-tab.test.cjs 经此哨兵抽取真实代码
        // ★★★ 同 URL 复用：自建前先找**本流已登记**的 tab 里有没有"同 URL 且存活"的
        //   —— 有就复用，不再新建。
        //   为什么必须（2026-10-12 14:35~14:40 实测）：渲染层被堵时 guest 迟迟建不出，
        //   navigate 30s 超时 → 模型重试 → **每次重试都走到这里新建一个 tab 壳并广播**
        //   （tab-1~tab-6 连号同 URL）→ 渲染层恢复后 6 个壳同时 spawn 8 个 guest 进程
        //   → CPU/内存尖峰 = 「更新后应用变卡」的直接推手之一。
        //   复用口径：只认 `agentTouchedTabs` 里 **flowKey 等于本流**的 tab（agent 自己的页，
        //   绝不碰用户手开的，也绝不并入同会话另一条流的页），URL 归一化后相同（与 alreadyOpen 同 normUrl 口径）。
        const normUrlLoc = (u) => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
        let reused = null;
        for (const [tid, owner] of agentTouchedTabs) {
          if (owner !== flowKey) continue;
          const meta = webviewTabs.get(tid);
          if (!meta) continue;                       // 已被 LRU 逐出/关闭
          const existed = broadcastTabUrl.get(tid);
          if (existed && normUrlLoc(existed) === normUrlLoc(cleanUrl)) { reused = tid; break; }
        }
        if (reused) {
          tabId = reused;
          console.log(`[browser-action] navigate 自建前复用同 URL tab: ${reused} url=${cleanUrl}`);
        } else {
          try {
            tabId = createBrowserTab(wantScope);
            // ★ 登记"本流操作过"——否则后续带显式 tabId 的动作会被越权闸门**误拒**
            //   （见上方长注释：渲染层建 guest 走 createTab，不经过 action 登记点）。
            markFlowTabTouched(flowKey, tabId);
          } catch { /* 建 tab 失败 → 退回下方广播路径（行为与修复前一致） */ }
        }
        // ===NAV-REUSE-END===
        // ★★★ 归属标记（2026-10-15 修漏标）：这条路径是 **agent 工具链**（agent 自己 navigate 触发的自建/复用），
        //   建的页属于 agent ⇒ 必须标 agentOpened。漏标的两个可观测后果：
        //     ① `browser_get_tabs` 把 agent 自己建的页显示成 `[用户页·勿关]` ⇒ 模型不去关它
        //        （这正是 P1-⑤ 备注的"两天 close_tab 调用 = 0"的另一半成因 —— 不全是批量形态的锅）；
        //     ② `browser_close_tab` 的权限闸门（`agentOpened !== true` 即拒）会拒掉它自己的页 ⇒
        //        agent 建的页只能等任务收尾被动清理，中途卡死的页清不掉、继续污染后续导航。
        //   ★ 这是**收窄**而非放宽：本分支只在"agent 要用页"时跑；复用也只复用**本流登记过**的页
        //     （登记只发生在 agent 动作成功之后）⇒ 不会把用户手开的页标成 agent 的。
        const selfMeta = webviewTabs.get(String(tabId));
        if (selfMeta) selfMeta.agentOpened = true;
      }
      // ★★★ 2026-10-10 二次根因修复：**改用 `browserView:tabCreated` 通道**（与 `new_tab` 同口径）。
      //
      //   实测（23:40 日志）：走 `browser:wv:forceOpen` 时 8s 必超时（`wc=NULL`），
      //   而 `new_tab` 分支用 `tabCreated` 是**现网验证可用**的黄金路径（截图里"新标签页"就是它建的壳）。
      //   两条通道语义重叠但实现不一致 = 平行实现漂移，是本次反复失败的直接原因。
      //   ⇒ 统一到 tabCreated：渲染层 `onTabCreated` 直接 push 壳 + 设 activeTabId，
      //     壳的 `:src` 驱动 `<webview>` 新建 → dom-ready → 注册 guest（不再依赖 forceOpen 分支）。
      //
      //   ★ scope 必须用**裸 `'preview'`**（与 new_tab 完全一致）：渲染层 `browserScope` 是
      //     `preview:<convId>`，`onTabCreated` 已放宽为「裸 preview 匹配任意 preview:*」。
      const scope = 'preview';
      // 幂等：渲染层 onTabCreated 对已有壳的 tabId 会直接忽略，重复广播无副作用。
      const waitForGuestStart = Date.now();
      try {
        if (tabId) broadcastTabUrl.set(String(tabId), cleanUrl);   // 同 URL 复用判据（2026-10-12）
        mainWindow.webContents.send('browserView:tabCreated', tabId || null, cleanUrl, scope, bgFlow);
        console.log(`[browser-action] 已广播 tabCreated: url=${cleanUrl} scope=${scope} tab=${tabId || '-'}`);
      } catch { /* ignore */ }
      // 给渲染层建 <webview>(dom-ready)+注册 guest 的时间
      // ★ 2026-10-11：8s → 30s。waitForGuest 已事件驱动化（register 即唤醒），
      //   健康路径 guest 一到就返回，上限放宽零开销；渲染主线程被大会话拖卡时
      //   IPC 迟到可达 30s+（实测 34.3s），8s 窗口必然失败 —— 放宽把"迟到=失败"
      //   变成"慢成功"。
      const waitedTab = tabId || activeTabId;
      wc = await waitForGuest(waitedTab, 30000);
      // ★★★ 这条路径此前**零日志**（静默失效家族）：失败时只有下面 `wc.loadURL` 的原生
      //   TypeError，看不出"广播出去了没""等的是哪个 tab""等到没有"。2026-10-10 实报
      //   "页面打不开"就是靠读库反推才定位到 `wc=null`。⇒ 补一条可诊断日志。
      console.log(`[browser-action] 自建后等待 guest: tab=${waitedTab || '-'} scope=${scope} wc=${wc ? 'ok' : 'NULL(30s 超时)'} 耗时=${Date.now() - (waitForGuestStart || Date.now())}ms`);
      // ★★★ 仍然拿不到就**明确报错**，绝不走到 `wc.loadURL` 抛原生 TypeError：
      //   原生 TypeError 对模型毫无信息量（表现为模型自己编"前端不可达"），对开发者也没有线索。
      if (!wc) {
        // ★★★ 2026-10-16（用户：治「30s 超时重试导致的 tab 膨胀」）：
        //   旧文案是「请重试一次」—— 模型照做，而"重试"= 再 navigate 一次 ⇒
        //   若 URL 与上次不同（或复用判据没命中）就**又建一个新 tab**（实测 11:24–11:27
        //   三个 30s 超时换来 tab-2/tab-3/tab-6/tab-7 四个页）。而 tab 其实**已经建出来了**，
        //   只是渲染层建 guest 慢（实测 14s ~ 73s）⇒ 文案改为"别重开、按 tabId 接着读"。
        return { error: `浏览器页面未就绪：已请求预览面板打开该页，但 30s 内未建出页面（tab=${waitedTab || '-'}）。`
          + `⚠️ **不要再 navigate 同一个 URL**（会再建一个 tab，越堆越多）；该页仍在创建中：`
          + `先 ` + '`browser_get_tabs`' + ` 看它是否已就绪，再用 ` + '`browser_get_page_content`'
          + ` 传 tabId=${waitedTab || 'N'} 重试读取。若始终是空页，请让用户展开浏览器预览面板（收起状态会拖住页面创建）。` };
      }
    }
    // 某些动作即便没有已建 host 也应执行（自建 / 纯查询 / 首次导航）
    const NO_HOST_REQUIRED = new Set(['navigate', 'new_tab', 'switch_tab', 'close_tab', 'get_tabs']);
    if (!wc && !NO_HOST_REQUIRED.has(action)) {
      return { error: '浏览器未打开，请先导航到页面或稍后重试（<webview> 尚未就绪）' };
    }
    if (wc) {
      activeTabId = tabId || activeTabId;
      // webview 引擎：agent 全程远程控制、常无人物理点过 guest 窗口，需显式让 guest 成为
      // 活动输入目标，保证后续 sendInputEvent(press Enter/快捷键) / 滚动/焦点能稳定路由到它。
      // webContents.focus() 只聚焦窗口本身(不造成闪烁)，不影响页面内现有 activeElement。
      try { if (typeof wc.focus === 'function') wc.focus(); } catch { /* ignore */ }
    }
  } else {
    if (!entry) return { error: '浏览器未打开，请先导航到页面' };
    // R4：挂起复活 —— pageAgent 的 navigate 等操作可能指向被 LRU 逐出/空闲卸载的 tab
    if (!entry.view) {
      ensureBrowserView(tabId || activeTabId);
      if (!entry.view) return { error: '浏览器未打开，请先导航到页面' };
    }
    wc = entry.view.webContents;
  }
  try {
    // 确保助手已注入。navigate 在 loadURL 完成后自行注入（见 case 'navigate'）；
    // 其余 action 加 3s 超时兜底 —— 从未提交过文档的空 tab 上 executeJavaScript 可能挂起，
    // 曾导致 get_page_info 等操作 20s IPC 超时。无 host 的动作(见 NO_HOST_REQUIRED)本就无文档可注入。
    if (action !== 'navigate' && wc) {
      await Promise.race([injectYzAssistant(wc), new Promise((r) => setTimeout(r, 3000))]);
    }

    // ★★★ 加载中前置等待闸（2026-10-13，"动作 30s 饿死"根因修复）。
    //
    //   现场（会话 253bd3f4 全天日志）：creator.douyin.com 的 SPA 在 12s 内从不加载完成
    //   （navigate 恒定 ~14.3s 返回 = loadURL 12s 竞速超时），此时 get_page_content /
    //   run_script 等 executeJavaScript 类动作在"文档仍在换"的页面上与导航竞速被**饿死**，
    //   26/32 次错误全是"30s 内未返回"——每个动作固定烧满 30~45s，任务预算被烧光，
    //   防失控闸门还把重试计成循环 → 循环闸门硬停。
    //
    //   修法：executeJavaScript 类动作执行前若页面 isLoading，先**限时等待**它停下
    //   （dom-ready 事件或 8s 上限，二者先到）。等待是有界的，健康路径（页面已就绪）
    //   **零开销**；慢站路径把"30s 饿死+模型重试"变成"先等一下再一次成功"。
    //   navigate 不在此列：它自身管理 loadURL 竞速（12s），语义不同。
    if (action !== 'navigate' && wc && typeof wc.isLoading === 'function') {
      let loadingNow = false;
      try { loadingNow = !!wc.isLoading(); } catch { /* 取不到按未加载处理 */ }
      if (loadingNow) {
        const SETTLE_MS = 8000;
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; try { wc.removeListener('dom-ready', finish); } catch { /* ignore */ } clearTimeout(timer); resolve(); } };
          const timer = setTimeout(finish, SETTLE_MS);
          try { wc.on('dom-ready', finish); } catch { clearTimeout(timer); resolve(); }
        });
        console.log(`[browser-action] ${action} 前置等待：页面加载中，已等至就绪/上限(${SETTLE_MS}ms)`);
      }
    }

    const doAction = async () => {
    switch (action) {
      case 'upload': {
        // 桌面端文件上传（2026-10-07，v2 真 filechooser 拦截）：用 CDP 的 DOM.setFileInputFiles 注入本地文件。
        // ★ 为什么必须走 CDP 而不是 executeJavaScript：
        //   JS 无法伪造带本地路径的 File 对象（安全沙箱），只有 CDP 协议能真正设置 input.files。
        //   Electron webContents.debugger 就是内置 CDP 客户端，对 <webview> guest 同样有效。
        // 两种模式：
        //   ① clickSelector/clickIndex/clickX+clickY：【filechooser 模式】先点「上传」按钮，CDP 层用
        //      Page.setInterceptFileChooserDialog(true) 拦截 Page.fileChooserOpened 事件，拿到
        //      backendNodeId 后直接投递文件（抖音创作者平台等：点按钮直接弹原生文件框、
        //      DOM 里根本不出现 input[type=file]）。
        //      ★ 这是对旧实现的根因修复：旧实现只 click 后死等 800ms 再
        //        querySelectorAll('input[type=file]')，原生对话框弹出时页面上没有这种节点 → 必然失败。
        //   ② selector/index：直接定位 input[type=file] 注入（保留为回落路径）。
        const fp = String(args.filePath || '');
        if (!fp) return { error: 'filePath 为必填项' };
        try {
          if (!fs.existsSync(fp)) return { error: `文件不存在: ${fp}` };
          // webview 引擎下 wc 来自 waitForGuest；BrowserView 引擎下来自 entry.view
          if (!wc) return { error: '浏览器未就绪（无 webContents）' };
          const dbg = wc.debugger;
          let attachedHere = false;
          // ★ B3（2026-10-11）：attach 失败必须有可区分错误（被其他调试客户端占用等），
          //   不能落到外层 catch 变成不可诊断的"文件注入失败: ..."
          if (!dbg.isAttached()) {
            try { dbg.attach('1.3'); attachedHere = true; }
            catch (e) { return { error: `CDP 调试器附加失败（可能被 DevTools 等其他客户端占用）: ${e && e.message || e}`, code: 'debugger_attach_failed' }; }
          }
          const send = (method, params) => dbg.sendCommand(method, params);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          // 探测候选 file input：只判「存活 + 未禁用」，可见性单独记录。
          // ★★ B5（2026-10-11）：可见性只能用来**选哪个**，不能用来**否决能不能注入** ——
          //   React/抖音这类站点的上传 input 常是 display:none / 0x0 的隐藏 input（由按钮 click 触发），
          //   而 CDP 的 DOM.setFileInputFiles **不要求元素可见**（它直接给节点赋文件并触发 change）。
          //   上一版（B3）把"不可见"当成不可用 → 抖音这类站点必然报 no_visible_input，上传全灭。
          const probeInput = async (nid) => {
            try {
              const { object } = await send('DOM.resolveNode', { nodeId: nid });
              if (!object || !object.objectId) return null;
              const { result } = await send('Runtime.callFunctionOn', {
                objectId: object.objectId,
                functionDeclaration: 'function(){var r=this.getBoundingClientRect();var s=getComputedStyle(this);return {alive:!!this.isConnected,disabled:!!this.disabled,visible:!!(r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none")};}',
                returnByValue: true,
              });
              const v = result && result.value;
              if (!v || !v.alive || v.disabled) return null;
              return { nodeId: nid, visible: !!v.visible };
            } catch { /* 单个节点解析失败不影响整体 */ return null; }
          };
          // 优先可见的（页面常有多个上传口：头像/封面/视频，可见的更符合用户点击的入口）；
          // 全隐藏时回落第一个「存活且未禁用」的节点 —— 仍比盲投 nodeIds[0] 安全（已排除失效/禁用）。
          const pickInjectable = async (ids) => {
            const all = [];
            for (const nid of ids) { const p = await probeInput(nid); if (p) all.push(p); }
            return all.find((p) => p.visible) || all[0] || null;
          };
          await send('Page.enable');
          await send('DOM.enable');
          await send('Runtime.enable');

          const useChooser = args.clickSelector != null || args.clickIndex !== undefined
            || (args.clickX !== undefined && args.clickY !== undefined);
          let result = null;

          // ① filechooser 模式：拦截原生文件对话框
          if (useChooser) {
            let chooserBackendId = null;
            let chooserErr = null;
            const onMessage = (_e, method, params) => {
              if (method === 'Page.fileChooserOpened') {
                if (params && params.backendNodeId != null) chooserBackendId = params.backendNodeId;
                else chooserErr = 'fileChooserOpened 未返回 backendNodeId，无法投递文件';
              }
            };
            let interceptOn = false;
            try { await send('Page.setInterceptFileChooserDialog', { enabled: true }); interceptOn = true; }
            catch { /* 协议不支持时保持关闭，走下面的 DOM 回落 */ }
            dbg.on('message', onMessage);
            // ★★★ 2026-10-12 P1-A：**并发探测** DOM input[type=file]。
            //   实测（日志）：模型用 `clickIndex` 时编号常已漂移 → 「上传」按钮没点到 →
            //   fileChooserOpened **永不出现** → 旧实现仍死等满 10s 才回落 DOM ⇒ 单次上传 ~11s
            //   （日志 11116ms；而 clickSelector 模式只 ~1.4s）。点击后若页面上已挂出可注入的
            //   input（React/抖音这类站点的隐藏 input，pickInjectable 已支持），本可**立刻注入**。
            //   ⇒ 等 chooser 的同时每 ~450ms 探一次 DOM，先命中者胜 —— 省掉整段 10s 空等。
            let domPick = null; // { nodeId, visible }
            const probeDomInput = async () => {
              try {
                const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
                const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
                if (nodeIds && nodeIds.length) { const p = await pickInjectable(nodeIds); if (p) domPick = p; }
              } catch { /* 探测失败不影响 chooser 主路径 */ }
            };
            try {
              const clickArgs = { selector: args.clickSelector, index: args.clickIndex, x: args.clickX, y: args.clickY };
              // 复用页面内助手（与用户看到的点击一致）；__yzAssistant.resolve 只接受 selector，
              // index 用注册表 __yzElements，x/y 用真实鼠标
              const clickRes = await wc.executeJavaScript(`(function(){
                var a=${JSON.stringify(clickArgs)};
                var A=window.__yzAssistant;
                if(!A) return {error:'助手未注入'};
                var el=null;
                // ★ 上传按钮**优先 selector、index 作兜底**（2026-10-13 修，实测口径）：
                //   index 在「弹窗 / 懒挂载 / 上传控件后挂」这类场景常已漂移，点击落空 →
                //   filechooser 根本不会弹 → 白等满 10s 才回落 DOM 模式。
                //   诊断报告实测同一个上传：clickIndex 模式 11s（10116/11041ms）vs
                //   clickSelector 模式 1.4s（1383ms）。此处只换优先级，不减少任何兜底能力。
                if(a.selector){el=A.resolve(a.selector);}
                if(!el && a.index!=null){el=(window.__yzElements&&window.__yzElements[a.index])||null;
                  if((!el||!el.isConnected)&&window.__yzSelMap&&window.__yzSelMap[a.index]){el=document.querySelector(window.__yzSelMap[a.index]);}}
                if(el){el.scrollIntoView({block:'center'});el.click();return{clicked:true};}
                if(a.x!=null&&a.y!=null){var t=A.clickAt(a.x,a.y);return{clicked:true,via:'real-mouse',tag:t};}
                return {error:'未找到上传按钮（index 已失效？请重新 get_page_info）'};
              })()`).catch((e) => ({ error: String((e && e.message) || e) }));
              if (clickRes && clickRes.error) chooserErr = clickRes.error;
              // 等 fileChooserOpened（最多 10s，事件一到立即退出）。★ 2026-10-12：并发探测 DOM，
              //   命中即可提前结束，不必为等不到的 chooser 空等 10s（见上）。
              const t0 = Date.now();
              let tick = 0;
              while (!chooserBackendId && !chooserErr && !domPick && Date.now() - t0 < 10000) {
                await wait(150);
                if (!chooserBackendId && !domPick && (++tick % 3 === 0)) await probeDomInput();
              }
            } finally {
              dbg.removeListener('message', onMessage);
              // ★ 必须关掉拦截：无论成功/失败都要还原，否则页面后续的 filechooser 会被一直劫持
              // （用户自己点上传也不会弹框，表现为"页面坏了"）
              if (interceptOn) { try { await send('Page.setInterceptFileChooserDialog', { enabled: false }); } catch { /* ignore */ } }
            }
            if (chooserBackendId != null) {
              await send('DOM.setFileInputFiles', { files: [fp], backendNodeId: chooserBackendId });
              result = { uploaded: true, via: 'filechooser', filePath: fp };
            } else if (domPick) {
              // 并发探测命中：直接注入（等价下面的 DOM 回落，但省掉 10s 空等）。标记便于排障。
              await send('DOM.setFileInputFiles', { files: [fp], nodeId: domPick.nodeId });
              result = { uploaded: true, via: 'cdp', filePath: fp, hiddenInput: domPick.visible === false, concurrentProbe: true };
            }
          }

          // ② 回落：DOM 定位 input[type=file]（也覆盖 filechooser 拦截未命中的场景）
          if (!result) {
            if (useChooser) await wait(800); // 等 React 侧动态挂载 input
            const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
            const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
            if (!nodeIds || !nodeIds.length) {
              result = { error: '页面上未找到 input[type=file]，且未捕获到文件选择器：请确认「上传」按钮已点击、文件选择框确实弹出。' };
            } else {
              const picked = await pickInjectable(nodeIds);
              let target = picked ? picked.nodeId : null;
              // ★ B5：只有「一个存活且未禁用的节点都没有」才报错（此时 nodeId 确实失效，盲投会撞
              //   "Either nodeId, backendNodeId or objectId must be specified"）。
              if (!target) {
                result = { error: '页面上有 input[type=file] 但节点已失效或全部禁用（no_valid_input）。建议：重新 get_page_info 取新编号，或改用 filechooser 模式——用 clickSelector/clickIndex 指定「上传」按钮重试。', code: 'no_valid_input' };
              } else {
                // ★ B3 复验：定位与注入之间 nodeId 可能因页面重渲染失效，先 describeNode 确认还活着；
                //   失效则重新 getDocument+querySelectorAll 取一轮（最多一次），仍失败才报错。
                try {
                  await send('DOM.describeNode', { nodeId: target });
                } catch {
                  const fresh = await send('DOM.getDocument', { depth: -1, pierce: true })
                    .then(({ root }) => send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' }))
                    .catch(() => null);
                  const freshIds = fresh && fresh.nodeIds ? fresh.nodeIds : [];
                  const freshPick = freshIds.length ? await pickInjectable(freshIds) : null;
                  target = freshPick ? freshPick.nodeId : null;
                  if (!target) {
                    result = { error: 'input[type=file] 节点在定位后失效且重取仍失败（node_stale）。建议：重新 get_page_info 后用新编号重试。', code: 'node_stale' };
                  }
                }
              }
              // ★★ 参数名必须是单数 nodeId（CDP 协议：DOM.setFileInputFiles 接受 nodeId | backendNodeId | objectId）。
              //    曾误写成复数 nodeIds → CDP 静默忽略 → 三个标识符全缺 →
              //    抛 "Either nodeId, backendNodeId or objectId must be specified"，
              //    表现为「所有上传方式都报同一个错」（抖音上传 19 次尝试全灭的根因）。
              //    DOM.querySelectorAll 的**返回值**才叫 nodeIds（复数），别把请求参数也写成复数。
              if (target) {
                // hidden=true 表示注入到隐藏 input（React 站点常见）——setFileInputFiles 不要求可见，
                // 仍会触发页面 change 处理；把它回传给模型，避免"看不到可见元素"时被误判为失败。
                const hidden = !!(picked && picked.visible === false);
                await send('DOM.setFileInputFiles', { files: [fp], nodeId: target });
                result = { uploaded: true, via: 'cdp', filePath: fp, inputCount: nodeIds.length, hiddenInput: hidden };
              }
            }
          }
          // ★★★ 2026-10-12（诊断报告 P0-3）：上传"成功"后**回读页面证据**再回报。
          //   此前只报 `uploaded:true`，模型拿不到"页面确实收到了文件"的证据 ⇒ 不确定就
          //   **再传一遍**（用户实报"上传重试多"）。这里回读：input[type=file] 的 files
          //   是否含该文件 + 页面文本是否出现文件名/上传中提示，作为 verified 依据。
          //   ★ 核验失败只降级为"未回读到证据"，绝不改变"文件已投递"这个事实本身。
          if (result && result.uploaded) {
            try {
              const base = String(fp).split(/[/\\]/).pop() || String(fp);
              const ev = await wc.executeJavaScript(`(function(){
                var name=${JSON.stringify(base)};
                var inputs=document.querySelectorAll('input[type=file]');
                var inFiles=false,count=0;
                for(var i=0;i<inputs.length;i++){
                  var fl=inputs[i].files||[];count+=fl.length;
                  for(var j=0;j<fl.length;j++){if(fl[j]&&fl[j].name===name){inFiles=true;}}
                }
                var t=(document.body&&document.body.innerText||'').slice(0,20000);
                var inText=!!name&&t.indexOf(name)>=0;
                var busy=/上传中|正在上传|处理中|上传进度|上传完成|已上传/.test(t);
                return {inFiles:inFiles,fileCount:count,inText:inText,busy:busy};
              })()`).catch(function(){return null;});
              if (ev) {
                result.verified = !!(ev.inFiles || ev.inText);
                result.evidence = ev;
                if (result.verified) {
                  result.note = '已核验：文件已进入页面（' + (ev.inFiles ? 'input[type=file] 已含该文件' : '页面已出现文件名') + '）。**上传已成功，请勿重复调用 upload**。';
                } else if (ev.busy) {
                  result.note = '文件已投递，页面显示"上传中/处理中"——属于进行中，**请勿重复调用 upload**；可用 browser_get_page_content 轮询进度。';
                } else {
                  result.note = '文件已投递给页面，但未从页面回读到明显证据（可能仍在解析或站点未即时渲染）。**请先观察/轮询页面，不要立即重复 upload**。';
                }
              }
            } catch { /* 核验失败不影响上传本身的结果 */ }
          }
          if (attachedHere) { try { dbg.detach(); } catch { /* ignore */ } }
          return result;
        } catch (e) {
          return { error: `文件注入失败: ${e && e.message || e}` };
        }
      }
      case 'navigate': {
        // URL 清洗：剥离模型以 markdown 反引号/引号包裹传来的格式字符
        let cleanUrl = String(args.url || '').trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
        // ★★★ 2026-10-11：放行 `about:blank`（用户实报的诊断项之一）。
        //   旧实现只认 `^https?://`，模型想"重置/清空当前页"时传 `about:blank` **必被拒**
        //   （报"无效 URL"），而模型拿不到有效反馈就会**换别的 URL 继续试** —— 实测日志里
        //   它依次试了 `about:blank` / `example.com/` / `example.com/?x=1` / `douyin.com/`，
        //   白烧好几轮。`about:blank` 是 Chromium 的合法内置页（`<webview src>` 默认值就是它），
        //   渲染层模板也已在用（`:src="t.srcUrl || 'about:blank'"`）⇒ 放行是安全的。
        const isBlank = /^about:blank$/i.test(cleanUrl);
        if (!isBlank && !/^https?:\/\//i.test(cleanUrl)) return { error: `无效 URL: ${cleanUrl}` };
        // ★★★ 同 URL 幂等（2026-10-11）：模型反复 navigate 到"当前已经在这个 URL"＝重新导航，
        //   页面/表单全部重置 —— 抖音发布实测 23:08/23:13/23:19 三次 navigate 回
        //   /content/upload，已上传视频与已填标题全丢，任务陷入"填了→没了→再填"死循环。
        //   ⇒ 归一化后与当前地址相同就直接返回 alreadyOpen，**不触发真实导航**；
        //     确需刷新时显式传 force:true 才真的 loadURL（保留出口，不把路堵死）。
        const normUrl = (u) => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
        const curUrl = (wc && wc.getURL) ? wc.getURL() : '';
        if (!isBlank && args.force !== true && curUrl && normUrl(curUrl) === normUrl(cleanUrl)) {
          const curTitle = (wc && wc.getTitle) ? wc.getTitle() : '';
          return {
            url: curUrl, title: curTitle, alreadyOpen: true, loading: !!(wc && wc.isLoading && wc.isLoading()),
            note: '当前页面已经就是该 URL，未重复导航（重复导航会重置页面/清空已填表单）。**不要换 URL 重试**；要读当前内容用 browser_get_page_content。页面上若已有已填内容，**不要**用 force:true 刷新（会被拒绝并说明原因）。',
          };
        }
        // ★★★ 2026-10-14：`force:true` 是**唯一**能绕过上面同 URL 守卫的出口，而它正是
        //   "已填表单被清空"的最后一条路 —— 经验档里曾**明确教**模型"页面卡住就用
        //   browser_navigate 带 force:true 强制刷新"，用户因此实报
        //   「表单都填好了又去刷新页面重新填写」。
        //   ⇒ 同 URL + force + 页面上还有**未提交的已填字段** → 拒绝，并给出不破坏页面的出路。
        //   ★ 只在"同 URL 刷新"这一种情形拦：**导航去别的页面不拦** —— 那是正常流程
        //     （提交后跳到下一步时，表单里残留的值不该成为障碍）。
        if (!isBlank && args.force === true && curUrl && normUrl(curUrl) === normUrl(cleanUrl)) {
          const filled = await wc.executeJavaScript(`(function(){
            var els = document.querySelectorAll('input, textarea, [contenteditable="true"]');
            var n = 0, sample = [];
            for (var i = 0; i < els.length; i++) {
              var el = els[i];
              if (el.readOnly === true || el.disabled === true) continue;
              var v = el.isContentEditable ? (el.innerText || '') : (el.value || '');
              if (!String(v).trim()) continue;
              n++;
              if (sample.length < 3) sample.push(String(el.getAttribute('placeholder') || el.tagName).slice(0, 20));
            }
            return { n: n, sample: sample };
          })()`).catch(() => null);
          if (filled && filled.n > 0) {
            return {
              error: `拒绝刷新：当前页面上还有 ${filled.n} 个已填写的字段（${filled.sample.join(' / ')}）。`
                + '该页面**不存草稿**，刷新会把它们全部清空 —— 这正是"填好了又被刷新重填"的成因。'
                + '请改走：① 先提交当前内容（browser_click 提交按钮），或 ② 用 browser_get_page_content '
                + '读取当前状态确认结果；确需放弃这些内容并强制刷新时，先向用户确认。**不要重复传 force:true**。',
            };
          }
        }
        // ★★★ 2026-10-11：`openInNewTab` 已在**进入 switch 之前**被改写为 `new_tab`
        //   （见 `doAction` 之前的 `if (args.openInNewTab) action = 'new_tab'`）——
        //   语义与 `new_tab` **完全一致**（开新页 + 返回 tabId + `decideAnchorUpdate` 判 touch 不抢锚），
        //   且 new_tab 已有现成实现（黄金通道 tabCreated / tab 上限收口 / agentOpened 记账）。
        //   ⇒ 本 case 只在"非 openInNewTab"时执行（否则根本进不到这里）。
        // webview 引擎没有 entry（无 bounds / 无缓存清理流程），只有 BrowserView 分支需要处理
        if (entry) {
          activateTab(tabId || activeTabId);
          ensureFallbackBounds(entry);
          // 等待首次缓存清理完成（并发会中止加载导致黑屏），加超时防缓存异常挂起
          if (entry.cacheClearPromise) {
            await Promise.race([entry.cacheClearPromise.catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
            entry.cacheClearPromise = null;
          }
        }
        // loadURL 等完整加载（did-finish-load），慢站/挂起资源会远超渲染层 20s IPC 竞速 →
        // "IPC 导航超时"。限时 12s：超时视为"已开始加载"，提前返回当前状态（内部各段限时
        // 合计 < 18s 总闸），让模型用 browser_get_page_content / browser_wait_for 轮询加载结果。
        let loadErr = null;
        let timedOut = false;
        await Promise.race([
          wc.loadURL(cleanUrl).catch((e) => { loadErr = e; }),
          new Promise((r) => setTimeout(() => { timedOut = true; r(null); }, 12000)),
        ]);
        if (loadErr && !/ERR_ABORTED/.test(loadErr?.message || '')) {
          // 真失败（DNS/拒绝连接等）才报错；ERR_ABORTED 是导航被新导航接替，视为正常
          return { error: `页面加载失败（${loadErr?.code || loadErr?.errno || ''}）: ${cleanUrl}` };
        }
        await Promise.race([injectYzAssistant(wc), new Promise((r) => setTimeout(r, 1500))]);
        // ★★★ 2026-10-11：**显式区分"加载完成"与"超时仍在加载"** —— 修"模型把超时误判为失败"。
        //   12s 超时是**故意的**（慢站不该把工具卡死），但旧返回值不带任何"仍在加载"的标记，
        //   模型看到 navigate 返回后 get_page_content 读不到期望内容 → 以为**导航没生效**
        //   → 换 URL 重试（实测 3 分钟 36 次穷举换 URL，每次还都自建新 tab → 堆积 → 应用卡死）。
        //   ⇒ 返回体加 `loading` / `timedOut` 字段 + 明确提示，让模型知道"已开始加载、请用
        //     browser_wait_for 或 get_page_content 轮询"，而不是"换一个 URL 再试"。
        const stillLoading = timedOut || wc.isLoading();
        // ★★★ 2026-10-15「导航跑偏」P1-④：回执带上 `visibilityState`。
        //   实测（经验档 creator.douyin.com.md 10-15 条目 + 当天 12 次 navigate）：
        //   creator-micro 微前端在 `document.visibilityState=hidden`（面板收起/失焦）时
        //   **永远停在"加载中，请稍候…"不挂载内容**，模型读不到东西 → 判定导航失败 →
        //   反复 force 刷新（对隐藏态无效）。把状态直接带回，模型当场知道该换招。
        let visibilityState = '';
        try {
          visibilityState = String(await Promise.race([
            wc.executeJavaScript('document.visibilityState').catch(() => ''),
            new Promise((r) => setTimeout(() => r(''), 800)),
          ]) || '');
        } catch { /* 取不到不阻塞导航结果 */ }
        const result = { url: wc.getURL() || cleanUrl, title: wc.getTitle(), loading: stillLoading };
        if (visibilityState) result.visibilityState = visibilityState;
        if (timedOut) {
          result.note = '页面已开始加载，但 12s 内未完成（慢站/资源多）。**不要换 URL 重试**；请用 browser_wait_for 等待或 browser_get_page_content 读取当前内容。';
        }
        if (visibilityState === 'hidden') {
          result.note = (result.note ? result.note + '\n' : '') +
            '页面处于**隐藏态**（预览面板收起/未显示）：creator.douyin.com 等微前端站点在此状态下可能永远停在"加载中"不渲染内容（document.visibilityState=hidden 时异步 chunk 加载被暂停）。**刷新无用、不要 force 刷新**；① 纯取数请改用 browser_run_script 在页面内 fetch 接口（比等渲染更可靠）；② 需要看页面 UI 时先让用户展开预览面板，再读取。';
        }
        // ★★★ 2026-10-15「导航跑偏」P2-⑦：把**接口地址当页面导航**的引导。
        //   实测（10-14 晚 conv 13822a0d 21:17 起）：模型直接用 navigate 打开
        //   /web/api/mix/list/... 这类 JSON 端点当 HTTP 客户端 —— 能跑通，但每次占用
        //   一次导航 + 渲染，还会把"当前操作页"带到一屏 JSON 上（后续读到的是 JSON 而不是业务页）。
        //   ⇒ 回执给一句更省的一招（页内 fetch 带登录态，经验档已验证可行）。
        if (/\/api\/|\.json(\?|$)/i.test(cleanUrl)) {
          result.note = (result.note ? result.note + '\n' : '') +
            '这看起来是**接口地址**（JSON 端点）：直接导航会占用导航+渲染，并把"当前操作页"带到 JSON 上。取数优先用 browser_run_script 在页面内 fetch（credentials:"include" 可带登录态），比导航更稳更快。';
        }
        return result;
      }
      case 'click': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var A=window.__yzAssistant;
          // ===OCCLUSION-START=== 遮挡感知 + 自动关闭遮挡层（2026-10-12）；click-occlusion.test.cjs 经此哨兵抽取真实代码
          // ★ 遮挡检测（2026-10-12）：目标中心点若被其它元素盖住，很多悬浮层会给底层按钮
          //   加 pointer-events:none 或在 handler 里判"弹窗开着就忽略"，导致 DOM 点击派发了却不生效。
          //   ⇒ 先检测遮挡，被挡则尝试自动关闭遮挡层（点其关闭控件 / Esc）后再点真实目标。
          function detectOcclusion(el){
            try{
              var r=el.getBoundingClientRect();
              if(r.width<1||r.height<1)return null;
              var cx=r.x+r.width/2, cy=r.y+r.height/2;
              if(cx<0||cy<0||cx>window.innerWidth||cy>window.innerHeight)return null;
              var top=document.elementFromPoint(cx,cy);
              if(!top)return null;
              if(top===el||el.contains(top))return null;
              return {coveringEl:top, covering:{tag:top.tagName.toLowerCase(),
                text:(top.textContent||'').trim().slice(0,40), selector:A.genSel(top)}};
            }catch(e){return null;}
          }
          // ★ 尝试关闭遮挡层：优先点其子树里的显式关闭控件（× / 关闭 / 取消 / aria close），
          //   找不到再退 Esc。只点"关闭类"控件，绝不点"确定/确认"等肯定动作（避免误触发布）。
          async function tryDismiss(coveringEl){
            if(!coveringEl)return false;
            try{
              var sel='button,[role="button"],a,span,i,svg,[aria-label]';
              var list;try{list=Array.prototype.slice.call(coveringEl.querySelectorAll(sel));}catch(e){list=[];}
              list.push(coveringEl);
              for(var i=0;i<list.length;i++){var n=list[i];
                var t=(n.textContent||'').trim();
                var al=(n.getAttribute&&n.getAttribute('aria-label')||'').trim();
                var cls=(typeof n.className==='string'?n.className:'');
                var isClose=/^[×xX✕✖]$/.test(t)||/关闭|取消|收起|知道了/.test(t+al)||/modal-close|dialog-close|close-btn|icon-close/i.test(cls);
                if(isClose){
                  try{
                    n.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
                    n.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
                    n.click();return true;
                  }catch(e){}
                }
              }
              document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));
              document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));
              return true;
            }catch(e){return false;}
          }
          async function clickEl(el){
            // 先滚入视口（instant，避免 smooth 异步未到位导致后续坐标过期）
            try{el.scrollIntoView({block:'center'});}catch(e){}
            var occ=detectOcclusion(el);
            var autoDismissed=false, coveringInfo=null;
            if(occ){coveringInfo=occ.covering; autoDismissed=await tryDismiss(occ.coveringEl);
              await new Promise(function(r){setTimeout(r,350);});}
            // ★ 优先 DOM 点击：不受视口裁切影响（被裁切但已渲染的元素也能触发），
            //   直接派发到目标元素，不依赖坐标换算。坐标点击在元素被裁切/位于视口外时
            //   会落在视口外（elementFromPoint 返回 null）而无效（抖音"发布"按钮实测）。
            try{
              el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
              el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
              el.click(); // 原生 click：触发默认动作（onClick / 链接跳转 / 表单提交）
              var res={success:true,via:'dom-click',tag:el.tagName.toLowerCase()};
              if(occ){res.occluded=true;res.autoDismissed=autoDismissed;res.covering=coveringInfo;
                res.note='目标中心被悬浮层遮挡；'+(autoDismissed?'已尝试自动关闭遮挡层，':'未找到可关闭的遮挡层，')+'已直接对目标派发 DOM 点击。请用 get_page_content 复核是否真的生效（未生效说明遮挡层仍阻断，需手动关闭后重试）。';}
              return res;
            }catch(e){
              // 兜底：真实鼠标坐标点击（极少数只认真实坐标的场景）
              var rect=el.getBoundingClientRect();
              var x=rect.x+rect.width/2,y=rect.y+rect.height/2;
              var tag=A.clickAt(x,y);
              var res2={success:true,via:'real-mouse',tag:tag};
              if(occ){res2.occluded=true;res2.autoDismissed=autoDismissed;res2.covering=coveringInfo;}
              return res2;
            }
          }
          // ===OCCLUSION-END===
          // ===NOTFOUND-START=== 未命中时的候选清单；notfound-candidates.test.cjs 经此哨兵抽取真实代码
          // ★★★ 2026-10-15：未命中时**附上候选清单**，而不是只丢一句"未找到"。
          //   实测（conv 7e99207b）：当天 34 次「元素未找到」，其中 6 次在同一个
          //   '.arco-drawer-footer button:contains(...)' 上反复试 —— 模型不知道页面上**实际有什么**，
          //   只能换文案/换选择器猜；猜够次数撞上循环闸门后，改去写 run_script 穷举 DOM（189 次）。
          //   给出"同一基选择器下当前可见元素的编号+文本" ⇒ 一次往返就能改对（编号可直接点）。
          //   ★ 这段注释在 executeJavaScript 的模板字符串内部：注释里的反引号会**提前终止模板**，
          //     后面的注入代码被当外层 JS 解析 → "missing ) after argument list"（Node 22 必炸，
          //     2026-10-16 实测 dev 启动失败）。所以本段及同模板内任何注释都禁止出现反引号，
          //     需要引用代码名一律用引号。
          function notFound(sel){
            var out={error:'元素未找到: '+sel,hint:'建议先调用 browser_get_page_info 获取编号元素列表，再用 index 参数定位'};
            try{
              var base=String(sel).replace(/:contains\(\s*["'][\s\S]*?["']\s*\)/g,'')||'*';
              var els;
              try{els=document.querySelectorAll(base);}
              catch(e){els=document.querySelectorAll('button,a,[role="button"],li,tr,td,span');}
              var cands=[];
              for(var i=0;i<els.length&&cands.length<10;i++){
                var el=els[i];
                if(el.offsetParent===null)continue;                 // 只列**可见**的（要点的东西得看得见）
                cands.push({index:A.register(el),tag:el.tagName.toLowerCase(),
                  text:(el.textContent||'').trim().slice(0,40),selector:A.genSel(el)});
              }
              if(cands.length){
                out.candidates=cands;
                out.hint='选择器没匹配到。下面是**同一基选择器**下当前**可见**的元素（含各自文本）——'
                  +'请从中挑一个 index 重试（比继续换选择器快得多）。若目标不在其中，说明它此刻还没渲染出来：'
                  +'先用 browser_hover / browser_click 展开对应菜单或滚到该区域，再重读页面；不要继续换选择器硬试。';
              }
            }catch(e){/* 候选清单是增益，失败就退回原提示 */}
            return out;
          }
          // ===NOTFOUND-END===
          if(a.index!=null){
            var el=window.__yzElements&&window.__yzElements[a.index];
            // 自动降级：index 失效时用注册时记录的 selector 快照重定位一次，避免多一次 get_page_info 往返
            if((!el||!el.isConnected)&&window.__yzSelMap&&window.__yzSelMap[a.index]){
              var snap=window.__yzSelMap[a.index];
              var f=document.querySelector(snap);if(f){el=f;el.__yzIndex=a.index;window.__yzElements[a.index]=el;}
            }
            if(!el||!el.isConnected)return{error:'index '+a.index+' 已失效（页面已变化）。请重新调用 browser_get_page_info / browser_get_dom 获取最新编号列表。'};
            return clickEl(el).then(function(r){r.index=a.index;return r;});
          }
          if(a.selector){
            var els=A.resolveAll(a.selector);
            // ★ 隐藏回退（2026-10-11）：:contains 伪选择器只收可见元素（offsetParent!==null），
            //   折叠菜单/弹层里的按钮会**报"未找到"**，模型因此反复换选择器乱试
            //   （实测抖音「继续编辑」按钮即此场景）。改为：可见优先，无可见时放宽到
            //   "DOM 中存在即可"并明确标注 —— DOM click 不受视口裁切影响（见 clickEl）。
            if(els.length===0){
              var loose=[];
              try{
                var cm=String(a.selector).match(/^([\s\S]*?):contains\(\s*["']([\s\S]*?)["']\s*\)\s*$/);
                if(cm){
                  var bels=document.querySelectorAll(cm[1]||'*');
                  for(var li=0;li<bels.length;li++){var be=bels[li];
                    if((be.textContent||'').trim().indexOf(cm[2])>=0)loose.push(be);}
                }
              }catch(e){}
              if(loose.length===0)return notFound(a.selector);
              // clickEl 返回 Promise（executeJavaScript 会自动 await），故用 then 修饰结果
              return clickEl(loose[0]).then(function(r){
                r.hiddenFallback=true;
                r.hint='元素在 DOM 中但当前不可见（折叠菜单/弹层/未滚到视口），已按 DOM 点击执行；如未生效请先展开对应菜单或滚动到该区域再点。';
                return r;
              });
            }
            if(els.length>1){
              var cands=els.slice(0,10).map(function(el){
                return{index:A.register(el),tag:el.tagName.toLowerCase(),text:(el.textContent||'').trim().slice(0,40),selector:A.genSel(el)};
              });
              return{ambiguous:true,matched:els.length,candidates:cands,hint:'该选择器匹配多个元素，请从候选列表选一个 index 重新调用 click'};
            }
            return clickEl(els[0]);
          }
          if(a.x!=null&&a.y!=null){var tag=A.clickAt(a.x,a.y);return{success:true,via:'real-mouse',x:a.x,y:a.y,tag:tag};}
          return{error:'需要 index、selector 或 x/y'};
        })()`);
      }
      case 'type': {
        // ★★★ 主路径：CDP 真键盘输入（2026-10-08）。见 cdpTypeText 注释 ——
        //   JS 改值缺 keydown/keyup/composition、富文本内部 model 不同步，
        //   而评论框/搜索框正是这些场景。
        //   成功则直接用其结果；不可用（CDP 未就绪）才回落下面的 JS 实现。
        const cdpRes = await cdpTypeText(wc, { index: args.index, selector: args.selector }, args.text, args.pressEnter === true);
        if (cdpRes && cdpRes.locateError) {
          // 定位失败是真错误（元素不存在/编号过期），原样回报 —— 回落 JS 只会重复同一个失败
          return { error: cdpRes.locateError };
        }
        if (cdpRes) return { success: !!cdpRes.applied, ...cdpRes };
        // ↓ CDP 不可用 → 回落 JS 实现（Web 端 / CDP 被占用等）
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var A=window.__yzAssistant;
          function typeEl(el){
            el.scrollIntoView({behavior:'smooth',block:'center'});
            var rect=el.getBoundingClientRect();A.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'输入');
            var r=A.typeIn(el,a.text);
            var out={success:r.applied,typed:(a.text||'').length,applied:r.applied,value:r.value,via:'js-fallback'};
            if(!r.applied)out.hint='输入框未接受文本（可能为受控组件且拦截了程序化输入，或输入被页面重置）。建议截图核验实际值；若被重置，改用 browser_press_key 逐键或让用户手输。';
            if(a.pressEnter){
              var ko={bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13,which:13};
              el.dispatchEvent(new KeyboardEvent('keydown',ko));el.dispatchEvent(new KeyboardEvent('keypress',ko));el.dispatchEvent(new KeyboardEvent('keyup',ko));
              out.entered=true;
            }
            return out;
          }
          if(a.index!=null){
            var el=window.__yzElements&&window.__yzElements[a.index];
            if((!el||!el.isConnected)&&window.__yzSelMap&&window.__yzSelMap[a.index]){
              var snap=window.__yzSelMap[a.index];
              var f=document.querySelector(snap);if(f){el=f;el.__yzIndex=a.index;window.__yzElements[a.index]=el;}
            }
            if(!el||!el.isConnected)return{error:'index '+a.index+' 已失效（页面已变化）。请重新调用 browser_get_page_info / browser_get_dom 获取最新编号列表。'};
            return typeEl(el);
          }
          if(a.selector){
            var els=A.resolveAll(a.selector);
            if(els.length===0)return{error:'元素未找到: '+a.selector,hint:'建议先调用 browser_get_page_info 获取编号元素列表，再用 index 参数定位'};
            if(els.length>1){
              var cands=els.slice(0,10).map(function(el){
                return{index:A.register(el),tag:el.tagName.toLowerCase(),text:(el.textContent||'').trim().slice(0,40),selector:A.genSel(el)};
              });
              return{ambiguous:true,matched:els.length,candidates:cands,hint:'该选择器匹配多个元素，请从候选列表选一个 index 重新调用 type'};
            }
            return typeEl(els[0]);
          }
          var el=document.activeElement;if(!el)return{error:'无聚焦元素'};
          var r=A.typeIn(el,a.text);return{success:r.applied,typed:(a.text||'').length,applied:r.applied,value:r.value};
        })()`);
      }
      case 'press': {
        await wc.sendInputEvent({ type: 'keyDown', keyCode: args.key });
        await wc.sendInputEvent({ type: 'keyUp', keyCode: args.key });
        return { success: true };
      }
      case 'scroll': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          if(window.__yzAssistant&&a.selector){var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到: '+a.selector};
            el.scrollIntoView({block:'center'});return{success:true};}
          // 缺省处理：x/y 都没给时默认向下滚 300（避免"调用了但没给 y→0 位移=白滚"）
          var dx=a.x!=null?a.x:(a.dx||0), dy=a.y!=null?a.y:(a.dy!=null?a.dy:300);
          // 找真正承载滚动的容器：大量页面滚动体不是 window 而是某个可滚动 div
          function getScroller(){
            var e=document.scrollingElement||document.documentElement;
            if(e && e.scrollHeight>e.clientHeight+2)return e;
            var cands=document.querySelectorAll('*');
            for(var i=0;i<cands.length;i++){var c=cands[i];
              if(c.scrollHeight>c.clientHeight+24&&/auto|scroll|overlay/.test(getComputedStyle(c).overflowY))return c;}
            return e||document.documentElement;
          }
          var sc=getScroller();
          // 瞬时滚动(非 smooth)：agent 需滚后立即回读，smooth 动画会滞留导致下一条 get 读到旧区
          sc.scrollBy({left:dx,top:dy});
          var afterSt=sc.scrollTop||0;
          if(window.__yzAssistant){
            var cr=sc.getBoundingClientRect?sc.getBoundingClientRect():null;
            var cx=sc===document.scrollingElement?(sc.scrollX||0):(cr?cr.left+cr.width/2:50);
            var cy=sc===document.scrollingElement?(window.innerHeight/2):(cr?cr.top+cr.height/2:50);
            window.__yzAssistant.showCursor(cx,cy,'滚动 '+(dy>=0?'↓':'↑'));
            setTimeout(function(){window.__yzAssistant.hideCursor();},600);
          }
          return{success:true,containerTag:sc===document.documentElement?'document':sc.tagName.toLowerCase(),scrollTop:afterSt,scrolledBy:dy};
        })()`);
      }
      case 'hover': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          if(a.selector){var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到: '+a.selector};
            el.scrollIntoView({behavior:'smooth',block:'center'});
            var rect=el.getBoundingClientRect();window.__yzAssistant.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'悬停');
            var o={bubbles:true,cancelable:true,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,view:window};
            el.dispatchEvent(new MouseEvent('mousemove',o));el.dispatchEvent(new MouseEvent('mouseover',o));
            return{success:true};}
          return{error:'需要 selector'};
        })()`);
      }
      case 'screenshot': {
        // 2026-10-09：截图同步落盘存档（userData/screenshots/screenshot-<ts>.png），
        // 路径随结果回传；服务端据此复制进会话产物目录并登记 conversation_file（留证归档）。
        // 存档失败不影响截图本身返回。
        const saveShotArchive = async (image) => {
          try {
            const path = require('node:path');
            const dir = path.join(app.getPath('userData'), 'screenshots');
            await require('node:fs').promises.mkdir(dir, { recursive: true });
            const file = path.join(dir, `screenshot-${Date.now()}.png`);
            await require('node:fs').promises.writeFile(file, image.toPNG());
            return file;
          } catch { return undefined; }
        };
        // ★★★ 截图必失败的真实根因（2026-10-14 定位，详见 webviewPanelVisible 头注）：
        //   webview 引擎下**面板收起时 webview 只是宽度归 0 + 透明**，合成 surface 随之消失 →
        //   capturePage 抛 `Current display surface not available for capture`，而页面仍在运行。
        //   实测 conv 96125908：该状态下 8 次截图**全失败**、同期 JS 类动作**全成功**，
        //   且**持续 6 分钟不自愈**（16:45:51 → 16:51:27，中间隔 20s 重试同样失败）。
        //   ⇒ 面板已知不可见时**直接快速失败**：既省掉后面的"等页面就绪"（页面早就就绪了，
        //     是画面没了，等它毫无意义 —— 实测每次白等 8s），也不让模型再白试几轮。
        if (isWebviewEngine() && !webviewPanelVisible) {
          return {
            error: '截图不可用：浏览器面板当前处于收起/隐藏状态 —— 面板收起时该页面的合成画面不存在，'
              + 'Chromium 无法截图（但页面仍在运行，读页类工具照常可用）。'
              + '**不要重复调用 browser_screenshot**：改用 browser_get_page_content（正文 + 带编号的'
              + '可交互元素）或 browser_get_page_info（元素坐标）读取页面，二者都不依赖可见画面；'
              + '确实需要视觉定位时，请让用户先把浏览器面板展开。',
          };
        }
        // 面板可见却仍失败 → 属窗口被遮挡/最小化一类，重试一次再报（措辞与上面**区分开**，
        // 避免把"面板收起"和"窗口被挡"两种成因混成一句话，那样谁都定位不了）
        const capturePageWithRetry = async () => {
          try {
            return await wc.capturePage();
          } catch (e1) {
            await new Promise((r) => setTimeout(r, 400));
            try {
              return await wc.capturePage();
            } catch (e2) {
              throw new Error(
                '截图不可用：应用窗口被其他窗口遮挡或最小化时无法截取画面（重试一次仍失败）。'
                + '**不要再调用 browser_screenshot**：改用 browser_get_page_content / '
                + 'browser_get_page_info 读页面结构，二者不依赖可见画面。'
                + `原始错误: ${(e2 && e2.message) || e2}`,
              );
            }
          }
        };
        if (args.annotate) {
          // 元素标注截图：注入覆盖层画编号框（与 server Playwright 端对齐），截图后移除
          const overlayId = '__yz_annotate_overlay';
          await wc.executeJavaScript(`(function(){
            var oid=${JSON.stringify(overlayId)};
            var prev=document.getElementById(oid);if(prev)prev.remove();
            var A=window.__yzAssistant;if(!A)return false;
            var S='a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],[tabindex]';
            var ov=document.createElement('div');ov.id=oid;
            ov.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
            function visible(el){var r=el.getBoundingClientRect();return r.width>=2&&r.height>=2&&r.top>=0&&r.left>=0&&r.bottom<=window.innerHeight&&r.right<=window.innerWidth;}
            function paint(root){
              var found;try{found=root.querySelectorAll(S);}catch(e){return;}
              for(var i=0;i<found.length;i++){var el=found[i];if(!visible(el))continue;
                var idx=A.register(el);var r=el.getBoundingClientRect();
                var b=document.createElement('div');
                b.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border:2px solid #f97316;box-sizing:border-box;';
                var t=document.createElement('span');t.textContent=idx;
                t.style.cssText='position:fixed;left:'+r.left+'px;top:'+Math.max(0,r.top-18)+'px;background:#f97316;color:#fff;font:bold 12px/16px sans-serif;padding:0 5px;border-radius:2px;';
                ov.appendChild(b);ov.appendChild(t);
              }
              if(root.shadowRoot)paint(root.shadowRoot);
              var all;try{all=root.querySelectorAll('*');}catch(e){return;}
              for(var j=0;j<all.length;j++){var n=all[j];if(n.tagName==='IFRAME'){try{var cd=n.contentDocument;if(cd)paint(cd.body);}catch(e){}}}
            }
            paint(document.documentElement);
            document.documentElement.appendChild(ov);
            return true;
          })()`);
          const image = await capturePageWithRetry();
          await wc.executeJavaScript(`(function(){var p=document.getElementById(${JSON.stringify(overlayId)});if(p)p.remove();})()`).catch(() => {});
          const archivedFile = await saveShotArchive(image);
          return { base64: image.toDataURL().split(',')[1], annotated: true, ...(archivedFile ? { file: archivedFile } : {}) };
        }
        const image = await capturePageWithRetry();
        const archivedFile = await saveShotArchive(image);
        return { base64: image.toDataURL().split(',')[1], ...(archivedFile ? { file: archivedFile } : {}) };
      }
      case 'get_page_info': {
        // 穿透 iframe / Shadow DOM 收集可交互元素并编号注册（含 iframe 内弹窗元素）
        return await wc.executeJavaScript(`(function(){
          var A=window.__yzAssistant;
          var S='a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          var els=[];
          function visible(el){
            if(el.disabled===true)return false;
            var rect=el.getBoundingClientRect();if(rect.width<2||rect.height<2)return false;
            if(el.offsetParent===null){
              try{var st=el.ownerDocument.defaultView.getComputedStyle(el).position;
                if(st!=='fixed'&&st!=='sticky')return false;}catch(e){return false;}
            }
            return true;
          }
          function collect(root){
            var found;try{found=root.querySelectorAll(S);}catch(e){return;}
            for(var i=0;i<found.length;i++){var el=found[i];if(visible(el))els.push(el);}
            var all;try{all=root.querySelectorAll('*');}catch(e){return;}
            for(var j=0;j<all.length;j++){var n=all[j];
              if(n.shadowRoot)collect(n.shadowRoot);
              if(n.tagName==='IFRAME'||n.tagName==='FRAME'){try{var cd=n.contentDocument;if(cd&&cd.body)collect(cd.body);}catch(e){}}
            }
          }
          collect(document.documentElement);
          var out=[];
          for(var k=0;k<els.length&&out.length<300;k++){var el=els[k];
            var idx=A.register(el);
            var o={index:idx,tag:el.tagName.toLowerCase(),selector:A.genSel(el),text:(el.textContent||'').trim().slice(0,60)};
            if(el.ownerDocument!==document){o.iframe=true;}
            else{var rect=el.getBoundingClientRect();o.x=Math.round(rect.x);o.y=Math.round(rect.y);o.w=Math.round(rect.width);o.h=Math.round(rect.height);}
            if(el.id)o.id=el.id;
            if(el.type)o.type=el.type;
            if(el.href)o.href=el.href.slice(0,200);
            if(el.placeholder)o.placeholder=el.placeholder;
            if(el.value&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'))o.value=String(el.value).slice(0,80);
            if(el.getAttribute('aria-label'))o.ariaLabel=el.getAttribute('aria-label');
            if(el.name)o.name=el.name;
            if(el.getAttribute('role'))o.role=el.getAttribute('role');
            if(el.required)o.required=true;
            if(el.tagName==='SELECT'){o.options=Array.from(el.options).slice(0,30).map(function(op){return{v:op.value,t:op.text.trim().slice(0,40),s:op.selected}});}
            if(el.tagName==='INPUT'&&(el.type==='radio'||el.type==='checkbox'))o.checked=!!el.checked;
            out.push(o);
          }
          return{url:location.href,title:document.title,interactiveCount:els.length,interactive:out,
            hint:els.length>300?'可交互元素超过 300 个，仅返回前 300 个':'可交互元素已编号（index 字段），browser_click / browser_type 可直接用 index 参数定位（优先于 selector）'};
        })()`);
      }
      case 'get_visible_text': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          function visibleText(el){var s='';el.childNodes.forEach(function(n){
            if(n.nodeType===3){var t=n.textContent.trim();if(t)s+=t+' ';}
            else if(n.nodeType===1){var st=getComputedStyle(n);if(st.display!=='none'&&st.visibility!=='hidden'&&st.opacity!=='0')s+=visibleText(n);}
          });return s;}
          var root=a.selector?window.__yzAssistant.resolve(a.selector):document.body;
          if(!root)return{error:'元素未找到'};
          return{text:visibleText(root).trim().slice(0,5000)};
        })()`);
      }
      case 'get_page_content': {
        // 聚合 action：title + url + 可见正文 + 可交互元素一次返回（pageAgent 四件套之"读页"），
        // 合并 get_page_info 采集与 get_visible_text 正文，减少一次 IPC 往返
        // ★ 2026-10-13：返回值多带 `formFields`（表单语义段）；差异在下方主进程侧补算
        const r = await wc.executeJavaScript(`(function(){
          var A=window.__yzAssistant;
          var a=${JSON.stringify(args)};
          function visibleText(el){var s='';el.childNodes.forEach(function(n){
            if(n.nodeType===3){var t=n.textContent.trim();if(t)s+=t+' ';}
            else if(n.nodeType===1){var st=getComputedStyle(n);if(st.display!=='none'&&st.visibility!=='hidden'&&st.opacity!=='0')s+=visibleText(n);}
          });return s;}
          var S='a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          var els=[];
          function visible(el){
            if(el.disabled===true)return false;
            var rect=el.getBoundingClientRect();if(rect.width<2||rect.height<2)return false;
            if(el.offsetParent===null){
              try{var st=el.ownerDocument.defaultView.getComputedStyle(el).position;
                if(st!=='fixed'&&st!=='sticky')return false;}catch(e){return false;}
            }
            return true;
          }
          function collect(root){
            var found;try{found=root.querySelectorAll(S);}catch(e){return;}
            for(var i=0;i<found.length;i++){var el=found[i];if(visible(el))els.push(el);}
            var all;try{all=root.querySelectorAll('*');}catch(e){return;}
            for(var j=0;j<all.length;j++){var n=all[j];
              if(n.shadowRoot)collect(n.shadowRoot);
              if(n.tagName==='IFRAME'||n.tagName==='FRAME'){try{var cd=n.contentDocument;if(cd&&cd.body)collect(cd.body);}catch(e){}}
            }
          }
          collect(document.documentElement);
          var maxInteractive=a.maxInteractive||50;
          var out=[];
          for(var k=0;k<els.length&&out.length<maxInteractive;k++){var el=els[k];
            var idx=A.register(el);
            // ★★★ 补 selector（B6，2026-10-09）：本聚合动作此前只回 index/tag/text 等，
            //   **漏了 selector** —— 而它的同族动作 get_page_info（见上方 :2803）
            //   一直都有 selector:A.genSel(el)；工具描述与提示词也都承诺
            //   "元素含 selector 可直接作为 selector 参数"。
            //   后果：同一 prompt 在**桌面端**拿不到 selector（模型只能靠 index，SPA 重渲染后
            //   index 失效就只好重新读页），而**服务端 Playwright 链路**是有的 →
            //   同工具两条执行链行为不一致，是最难查的一类 bug。
            //   ⇒ 用同一 A.genSel（与 get_page_info / chat.ts:2614 同源），零新增逻辑。
            //   ★ 注意：本段位于 executeJavaScript 的**模板字符串内部**，注释里
            //     **绝不能出现反引号**（会提前闭合模板串，报 "missing ) after argument list"）。
            var o={index:idx,tag:el.tagName.toLowerCase(),selector:A.genSel(el),text:(el.textContent||'').trim().slice(0,60)};
            // P1-7 a11y 语义（2026-10-07）：优先 computedRole（Chromium 132+），引擎不支持时
            // 按「标签 + type」推断隐式角色；'generic'/null 无信息量跳过，两路都拿不到就不出字段。
            try{var cr=el.computedRole;if(cr&&cr!=='generic')o.axRole=cr;}catch(e){}
            if(!o.axRole){
              try{
                var tn=el.tagName,it=(el.type||'').toLowerCase(),role=null;
                if(tn==='A'&&el.hasAttribute('href'))role='link';
                else if(tn==='BUTTON'||(tn==='INPUT'&&/^(button|submit|reset|image)$/.test(it)))role='button';
                else if(tn==='INPUT'){if(it==='checkbox')role='checkbox';else if(it==='radio')role='radio';else if(it==='range')role='slider';else if(it==='number')role='spinbutton';else role='textbox';}
                else if(tn==='TEXTAREA')role='textbox';
                else if(tn==='SELECT')role='combobox';
                else if(tn==='OPTION')role='option';
                else if(tn==='SUMMARY')role='button';
                else if(tn==='PROGRESS')role='progressbar';
                else if(tn==='METER')role='meter';
                else if(el.isContentEditable)role='textbox';
                if(role)o.axRole=role;
              }catch(e){}
            }
            if(el.type)o.type=el.type;
            try{var al=el.getAttribute('aria-label');if(al)o.ariaLabel=al;}catch(e){}
            try{var rl=el.getAttribute('role');if(rl)o.role=rl;}catch(e){}
            if(el.placeholder)o.placeholder=el.placeholder;
            if(el.href)o.href=el.href.slice(0,200);
            out.push(o);
          }
          var maxText=a.maxTextLength||5000;
          // ── 表单语义段（2026-10-13）：字段名 / 类型 / 必填 / 当前值 ──
          //   与上面的 interactive 平铺清单互补：那个回答"页面上有什么可点可填"，
          //   这个回答"表单现在是什么状态"——后者才是"填了没填上"的判据。
          var FSEL='input,textarea,select,[contenteditable="true"]';
          var fel=[];
          function collectFields(root){
            var found;try{found=root.querySelectorAll(FSEL);}catch(e){return;}
            for(var i=0;i<found.length;i++){
              var el=found[i];
              try{if(el.type==='hidden'||el.disabled)continue;}catch(e){}
              var r;try{r=el.getBoundingClientRect();}catch(e){r={width:0,height:0};}
              // 富文本容器（contenteditable）常是 0 尺寸但可编辑 → 不能按尺寸否决
              if(!el.isContentEditable&&r.width<2&&r.height<2)continue;
              fel.push(el);
            }
            var all;try{all=root.querySelectorAll('*');}catch(e){return;}
            for(var j=0;j<all.length;j++){var n=all[j];
              if(n.shadowRoot)collectFields(n.shadowRoot);
              if(n.tagName==='IFRAME'||n.tagName==='FRAME'){try{var cd=n.contentDocument;if(cd&&cd.body)collectFields(cd.body);}catch(e){}}
            }
          }
          collectFields(document.documentElement);
          function fieldLabel(el){
            var lb='';
            try{if(el.placeholder)lb=el.placeholder;}catch(e){}
            if(!lb){try{var al=el.getAttribute&&el.getAttribute('aria-label');if(al)lb=al;}catch(e){}}
            if(!lb&&el.id){try{var lf=document.querySelector('label[for="'+el.id+'"]');if(lf)lb=(lf.textContent||'').trim();}catch(e){}}
            if(!lb){try{var lp=el.closest&&el.closest('label');if(lp)lb=(lp.textContent||'').trim();}catch(e){}}
            return String(lb||'').replace(/[\s ]+/g,' ').trim().slice(0,30);
          }
          function fieldValue(el){
            try{
              if(el.tagName==='SELECT'){var o=el.options[el.selectedIndex];return o?String(o.textContent||'').trim():'';}
              if(el.isContentEditable)return String(el.innerText||'').trim();
              if(el.type==='checkbox'||el.type==='radio')return el.checked?'(已选)':'(未选)';
              return String(el.value==null?'':el.value);
            }catch(e){return '';}
          }
          var formFields=[];
          for(var fi=0;fi<fel.length&&formFields.length<40;fi++){
            var fe=fel[fi];var fv=fieldValue(fe);
            var ml=0;try{ml=(fe.maxLength&&fe.maxLength>0)?fe.maxLength:0;}catch(e){}
            var o2={index:A.register(fe),selector:A.genSel(fe),label:fieldLabel(fe),
              kind:fe.isContentEditable?'richtext':(fe.tagName==='SELECT'?'select':(fe.type||'text')),
              value:fv.slice(0,80),valueLen:fv.length,required:false};
            try{o2.required=!!(fe.required||(fe.getAttribute&&fe.getAttribute('aria-required')==='true'));}catch(e){}
            if(ml)o2.maxLength=ml;
            formFields.push(o2);
          }
          return{url:location.href,title:document.title,
            text:visibleText(document.body).trim().slice(0,maxText),
            interactiveCount:els.length,interactive:out,
            formFields:formFields,
            hint:'可交互元素已编号（index 字段），browser_click / browser_type 可直接用 index 参数定位'};
        })()`);
        // ★ 表单变化差异由主进程算（需跨次调用的快照）：把结果挂到同一返回体上，
        //   工具层据此渲染「表单状态 + 自上次读取的变化」两段给模型。
        try {
          const snapKey = tabId || activeTabId || 'default';
          r.formChanges = diffFormSnapshot(snapKey, r.url || '', r.formFields);
        } catch { /* 差异计算失败不影响读页 */ }
        return r;
      }
      case 'fill_form': {
        // ★★★ B3/B5（2026-10-10）：本实现此前**违背工具契约**三处（服务端都支持）——
        //   工具 schema 明确声明 `type is "text"|"select"|"checkbox"|"radio"` 且
        //   "For select use **label or value**"，而这里有：
        //   ① **不支持 radio**（只判 select/checkbox → radio 字段走 else 分支当成文本框填！
        //      对 <input type=radio> 调 typeIn 会设 .value 却不改 checked ⇒ 单选**根本没选中**，
        //      且返回值里仍把它算作"已填"—— 模型以为填好了）；
        //   ② **不支持 label**（下拉只能按 value 选 ⇒ 模型给显示文本就选不中）；
        //   ③ **静默跳过**（`if(!el)continue`）：元素没找到时**不报错**，
        //      返回值里也不出现该字段 ⇒ 模型无法区分"填了"与"没填到"。
        //   ⇒ 一并按服务端（browser.ts 同名分支）语义对齐。
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};var fields=a.fields||[];
          var filled=[],failed=[];
          function setNativeValue(el,v){
            // 受控组件必须走 native setter，否则 React 的 value tracker 认不出变化
            try{
              var d=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value');
              if(d&&d.set){d.set.call(el,v);return true;}
            }catch(e){}
            try{el.value=v;return true;}catch(e){return false;}
          }
          for(var i=0;i<fields.length;i++){
            var f=fields[i];var sel=f.selector;
            var el=window.__yzAssistant.resolve(sel);
            if(!el){
              // ★ 不再静默跳过：记入 failed（含原因），让调用方与模型都能看见
              failed.push({selector:sel,reason:'元素未找到'});
              continue;
            }
            el.scrollIntoView({behavior:'smooth',block:'center'});
            var rect=el.getBoundingClientRect();
            window.__yzAssistant.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'填写');
            var ftype=String(f.type||'text').toLowerCase();
            try{
              if(ftype==='select'){
                // ★ 支持 label（显示文本）与 value 两种选法（与服务端一致）
                var target=null;
                if(f.label!==undefined){
                  var lbl=String(f.label);
                  for(var oi=0;oi<el.options.length;oi++){
                    if(String(el.options[oi].textContent||'').trim()===lbl.trim()){target=el.options[oi];break;}
                  }
                }
                if(!target){
                  var val=String(f.value==null?'':f.value);
                  for(var oj=0;oj<el.options.length;oj++){
                    if(String(el.options[oj].value)===val){target=el.options[oj];break;}
                  }
                }
                if(target){el.value=target.value;}else{failed.push({selector:sel,reason:'选项未找到: '+(f.label!==undefined?f.label:f.value)});window.__yzAssistant.hideCursor();continue;}
                el.dispatchEvent(new Event('input',{bubbles:true}));
                el.dispatchEvent(new Event('change',{bubbles:true}));
              }
              else if(ftype==='checkbox'){
                var wantC=!(f.value===false||f.value==='false'||f.value===0||f.value==='0');
                if(el.checked!==wantC){el.click();} // 用 click 触发完整事件链
              }
              else if(ftype==='radio'){
                // ★ 新增 radio：按 click 触发（改 checked 不触发事件，组件收不到）
                var wantR=!(f.value===false||f.value==='false'||f.value===0||f.value==='0');
                if(wantR){
                  if(!el.checked){el.click();}
                  if(!el.checked){ // click 未生效（如被遮挡/disabled）→ 兜底直改 + 事件
                    el.checked=true;setNativeValue(el,String(f.value==null?'on':f.value));
                    el.dispatchEvent(new Event('input',{bubbles:true}));
                    el.dispatchEvent(new Event('change',{bubbles:true}));
                  }
                } else if(el.checked){el.click();}
              }
              else{
                // 文本类：先探测 contenteditable 富文本（Slate/ProseMirror 等，nativeSetter 对其无效）——
                // 走"focus→全选→typeIn"路径：typeIn 内部经 CDP insertText 派发真实编辑事件，
                // 富文本编辑器认的是 beforeinput/input 事件链而不是 value 属性。
                // 10-13 实测（抖音编辑页）：作品描述是 contenteditable，旧实现当普通文本框填 →
                // 表面成功实际没写进 → 模型反复重填（"反复填写一个表单"的机制之一）。
                if(el.isContentEditable){
                  try{ el.focus(); }catch(e2){}
                  var sel2=window.getSelection();
                  try{ sel2.selectAllChildren(el); }catch(e2){ var rg=document.createRange();rg.selectNodeContents(el);sel2.removeAllRanges();sel2.addRange(rg); }
                  var r2=window.__yzAssistant.typeIn(el,String(f.value==null?'':f.value));
                  if(r2&&r2.applied===false){failed.push({selector:sel,reason:'富文本值未生效 当前值='+String(r2.value||'').slice(0,40)});window.__yzAssistant.hideCursor();continue;}
                }else{
                  // 普通文本：沿用 typeIn（清空→nativeSetter→IME 序列→input→change→回读核验）
                  var r=window.__yzAssistant.typeIn(el,String(f.value==null?'':f.value));
                  if(r&&r.applied===false){failed.push({selector:sel,reason:'值未生效（受控组件未接受）当前值='+r.value});window.__yzAssistant.hideCursor();continue;}
                }
              }
              filled.push(sel);
            }catch(e){
              failed.push({selector:sel,reason:'填写异常: '+(e&&e.message?e.message:String(e))});
            }
          }
          // ★ 表单终态回执（2026-10-13）：逐字段回读当前值，模型一次拿到
          //   "哪个改了/哪个没改/当前值是什么"，不再需要"再读一轮页面猜是否填上"
          //   （此前 applied 只回答"本次调用写没写进去"，回答不了"表单现在什么状态"，
          //     截断/乱序的二次读页曾把模型引向重复填写）。
          var state=[];
          try{
            for(var si=0;si<fields.length;si++){
              var sf=fields[si];var se=window.__yzAssistant.resolve(sf.selector);
              var sv=se?(se.isContentEditable?String(se.innerText||''):String(se.value==null?'':se.value)):'(元素不存在)';
              state.push({selector:sf.selector,value:sv.slice(0,60)});
            }
          }catch(e2){}
          setTimeout(function(){window.__yzAssistant.hideCursor();},500);
          return{filled:filled.length,fields:filled,failed:failed,state:state};
        })()`);
      }
      case 'submit_form': {
        var r = await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          if(a.selector){var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到: '+a.selector};
            var rect=el.getBoundingClientRect();window.__yzAssistant.clickAt(rect.x+rect.width/2,rect.y+rect.height/2);
            return{success:true};}
          var form=document.querySelector('form');if(form){form.submit();return{success:true};}
          return{error:'未找到表单'};
        })()`);
        if (r.error) return r;
        return { submitted: true, url: wc.getURL(), title: wc.getTitle() };
      }
      case 'search': {
        var r = await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var inp=a.input_selector?window.__yzAssistant.resolve(a.input_selector):document.querySelector('input[type=search],input[placeholder*=搜索 i],input[placeholder*=search i]');
          if(!inp)return{error:'未找到搜索框'};
          inp.scrollIntoView({behavior:'smooth',block:'center'});
          var rect=inp.getBoundingClientRect();window.__yzAssistant.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'搜索');
          window.__yzAssistant.typeIn(inp,a.query);
          inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          inp.form?inp.form.submit():inp.dispatchEvent(new Event('search',{bubbles:true}));
          return{success:true};
        })()`);
        if (r.error) return r;
        return { searched: args.query, url: wc.getURL(), title: wc.getTitle() };
      }
      case 'next_page':
      case 'prev_page': {
        var label = action === 'next_page' ? '下一页' : '上一页';
        var patterns = action === 'next_page' ? ['下一页','下页','Next','›','>>','»'] : ['上一页','上页','Prev','‹','<<','«'];
        var r = await wc.executeJavaScript(`(function(){
          var pats=${JSON.stringify(patterns)};
          var links=Array.from(document.querySelectorAll('a,button,[role=button]'));
          for(var i=0;i<pats.length;i++){var p=pats[i];
            var match=links.find(function(l){return(l.textContent||'').trim()===p||(l.getAttribute('aria-label')||'')===p;});
            if(match){match.scrollIntoView({behavior:'smooth',block:'center'});
              var rect=match.getBoundingClientRect();window.__yzAssistant.clickAt(rect.x+rect.width/2,rect.y+rect.height/2);
              return{clicked:p};}}
          return{error:'未找到按钮'};
        })()`);
        if (r.error) return { error: '未找到' + label + '按钮' };
        return { paged: action, clicked: r.clicked, url: wc.getURL(), title: wc.getTitle() };
      }
      case 'wait_for': {
        var timeout = args.timeout || 10000;
        var start = Date.now();
        while (Date.now() - start < timeout) {
          var result = await wc.executeJavaScript(`(function(){
            var a=${JSON.stringify(args)};
            if(a.selector){var el=window.__yzAssistant.resolve(a.selector);if(el&&el.offsetParent!==null)return{ready:true};}
            if(a.text){if(document.body.innerText.includes(a.text))return{ready:true};}
            if(a.url){if(location.href.includes(a.url))return{ready:true};}
            return{ready:false};
          })()`);
          if (result.ready) return { waited: 'ready', selector: args.selector, url: args.url, text: args.text };
          await new Promise(r => setTimeout(r, 300));
        }
        return { error: '等待超时' };
      }
      case 'select_option': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到'};
          el.value=a.value;el.dispatchEvent(new Event('change',{bubbles:true}));return{success:true};
        })()`);
      }
      case 'check':
      case 'uncheck': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到'};
          el.checked=${action === 'check'};el.dispatchEvent(new Event('change',{bubbles:true}));return{success:true};
        })()`);
      }
      case 'get_text': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          if(a.selector){var el=window.__yzAssistant.resolve(a.selector);if(!el)return{error:'元素未找到'};return{text:el.textContent.trim()};}
          return{text:document.body.innerText.slice(0,10000)};
        })()`);
      }
      case 'get_dom': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var maxDepth=a.depth||12,maxNodes=a.maxNodes||1000;
          var skip=new Set(['SCRIPT','STYLE','SVG','NOSCRIPT','TEMPLATE','LINK','META','HEAD']);
          var SELS='a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[onclick],label[for],summary,details,[tabindex]';
          var count=0,sameOriginIframes=0,crossOriginIframes=0,shadowRoots=0;
          function walk(el,depth){
            if(count>=maxNodes||skip.has(el.tagName)||depth>maxDepth)return null;
            var st=getComputedStyle(el);
            if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')return null;
            count++;
            var node={tag:el.tagName.toLowerCase()};
            // 可交互节点附加编号，供 browser_click / browser_type 用 index 定位
            try{if(el.matches&&el.matches(SELS)&&window.__yzAssistant)node.index=window.__yzAssistant.register(el);}catch(e){}
            if(el.id)node.id=el.id;
            var cls=(typeof el.className==='string'?el.className:'').trim();
            if(cls)node.class=cls.slice(0,80);
            if(el.getAttribute('role'))node.role=el.getAttribute('role');
            if(el.getAttribute('aria-label'))node.ariaLabel=el.getAttribute('aria-label');
            if(el.getAttribute('href'))node.href=el.getAttribute('href').slice(0,120);
            if(el.getAttribute('placeholder'))node.placeholder=el.getAttribute('placeholder');
            if(el.getAttribute('type'))node.type=el.getAttribute('type');
            if(el.getAttribute('name'))node.name=el.getAttribute('name');
            if(el.getAttribute('value')&&el.tagName==='INPUT')node.value=String(el.value).slice(0,60);
            var directText=Array.from(el.childNodes).filter(function(n){return n.nodeType===3;}).map(function(n){return n.textContent.trim();}).filter(Boolean).join(' ');
            if(directText)node.text=directText.slice(0,100);
            var kids=[];
            for(var i=0;i<el.children.length;i++){var c=walk(el.children[i],depth+1);if(c)kids.push(c);}
            if(el.shadowRoot){shadowRoots++;for(var si=0;si<el.shadowRoot.children.length;si++){var sc=walk(el.shadowRoot.children[si],depth+1);if(sc){sc.shadowRoot=true;kids.push(sc);}}}
            if((el.tagName==='IFRAME'||el.tagName==='FRAME')){
              try{var cd=el.contentDocument||el.contentWindow&&el.contentWindow.document;if(cd&&cd.body){sameOriginIframes++;var ic=walk(cd.body,depth+1);if(ic){ic.iframe=true;ic.src=el.getAttribute('src')||'';kids.push(ic);}}else{crossOriginIframes++;}}catch(e){crossOriginIframes++;}
            }
            if(kids.length)node.children=kids;
            return node;
          }
          var root=a.selector?window.__yzAssistant.resolve(a.selector):document.body;
          if(!root)return{error:'元素未找到'};
          return{url:location.href,title:document.title,dom:walk(root,0),nodeCount:count,iframes:{sameOrigin:sameOriginIframes,crossOriginSkipped:crossOriginIframes},shadowRoots:shadowRoots};
        })()`);
      }
      case 'wait': {
        const ms = Math.min(args.timeout || 1000, 10000);
        await new Promise(r => setTimeout(r, ms));
        return { waited: ms };
      }
      // ========== 导航控制（从 browser:call 统一迁移） ==========
      case 'back': {
        if (wc.navigationHistory?.canGoBack?.()) { wc.goBack(); return { success: true }; }
        if (wc.canGoBack?.()) { wc.goBack(); return { success: true }; }
        return { error: '无法后退' };
      }
      case 'forward': {
        if (wc.navigationHistory?.canGoForward?.()) { wc.goForward(); return { success: true }; }
        if (wc.canGoForward?.()) { wc.goForward(); return { success: true }; }
        return { error: '无法前进' };
      }
      case 'reload': {
        wc.reload(); return { success: true };
      }
      case 'get_url': {
        return { url: wc.getURL(), title: wc.getTitle() };
      }
      // ========== C4 多标签页管理（桌面端单 BrowserView，降级提示） ==========
      case 'new_tab': {
        // ★ [newtab-url-guard] 2026-10-14：new_tab 此前**完全没有 URL 校验** —— 而
        //   browser_navigate(openInNewTab:true) 在进 switch 前就被改写成 new_tab（见 :3153），
        //   于是 navigate 分支的白名单被整个绕过：模型传 file://…/xxx.md 会被**直接开进预览
        //   浏览器**（实测 conv 96125908 把本地 .yan-zhi/experience/sites/douyin.md 开了出来）。
        //   这里套用与 navigate 相同的白名单（http/https/about:blank/空）。
        {
          const rawNewTabUrl = String(args.url || '').trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
          const isBlankNewTabUrl = !rawNewTabUrl || /^about:blank$/i.test(rawNewTabUrl);
          if (!isBlankNewTabUrl && !/^https?:\/\//i.test(rawNewTabUrl)) return { error: `无效 URL: ${rawNewTabUrl}` };
        }
        // 多标签页：webview 引擎下每个 host 是一个 <webview>，支持真新建并返回 tabId。
        if (isWebviewEngine()) {
          // 归属空间固定 preview：agent/browser_new_tab 面向对话右栏的浏览器 host 新开页，
          // 不跟随 activeTab 的空间——否则若上次在 /browser(page 空间)浏览、当前又在右栏(preview)，
          // 广播 tabCreated(scope=page) 会被 preview 的 BrowserPanel 按空间过滤而看不到新标签。
          const scope = 'preview';
          const target = (() => { const u = String(args.url || '').trim(); return u; })();
          // ★★★ 2026-10-11：**改走 `createBrowserTab()`**（此前自己 `tabSeq++` + `webviewTabs.set`）。
          //   ★ 为什么要改（真漏洞）：`createBrowserTab` 是 tab 创建的**唯一收口**，它内部调
          //     `evictLruWebviewTabIfNeeded()` 做 `MAX_TABS` + LRU 逐出。
          //     而本分支此前**绕过它自建** ⇒ agent 的 `browser_new_tab` / `navigate(openInNewTab)`
          //     这条路径**完全没有上限保护** ⇒ agent 反复开新页时 tab 无上限堆积
          //     （每 tab = 一个 Chromium 渲染进程）⇒ 整机卡死。
          //     ★ 这正是 R2 的漏洞残留：08d 修了 `createBrowserTab` 的 webview 分支，
          //       但**没修"绕过它的第二个建 tab 点"** —— 又一例"平行实现漂移"。
          const tabId = createBrowserTab(scope);
          // webviewTabs 条目已由 createBrowserTab 建好；这里只补 agent 专有标记
          const meta = webviewTabs.get(tabId);
          if (meta) {
            // ★ agentOpened: true —— 这条路径是 agent 工具链（browser_new_tab / navigate openInNewTab），
            //   标记后它才**允许被 agent 关闭**（权限闸门见 close_tab 分支）。用户手开的 tab 永远是 false。
            meta.agentOpened = true;
          }
          // ★★★ 开新页要不要抢用户视野 —— 两条来源：
          //   ① 后台流（`bg:`）：它的页是给 agent 自己用的，一律不抢；
          //   ② 模型显式 `background:true`（2026-10-16 新增，用户拍板"让模型自己选"）：
          //      中间页不该打断用户当前正在看的页面。
          //   前台流 + 缺省 ⇒ 开新页即切过去（模型的意图就是"我导航到了这里"）。
          const wantBackground = bgFlow || args.background === true;
          if (!wantBackground) activeTabId = tabId;
          // 通知渲染层补建 host tab 壳(:src=url 会驱动新建 <webview> 并注册 guest)；
          // 是否切换过去由第 4 个参数（background）决定，渲染层据此决定要不要改 activeTabId。
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (target) broadcastTabUrl.set(String(tabId), target);   // 同 URL 复用判据（2026-10-12）
            mainWindow.webContents.send('browserView:tabCreated', tabId, target || null, scope, wantBackground);
          }
          // 等 guest spawn + 注册(渲染层 :src 后 dom-ready) → 返回新 tab 元信息
          let wc2 = await waitForGuest(tabId, 6000);
          if (target && wc2) {
            try { await wc2.loadURL(/^https?:\/\//i.test(target) ? target : 'https://' + target); } catch { /* ignore */ }
          }
          return { tabId, url: target || (wc2 && wc2.getURL()) || '', title: (wc2 && wc2.getTitle()) || '' };
        }
        return { error: '该浏览器引擎不支持 new_tab' };
      }
      case 'switch_tab': {
        // ★★★ 后台流不得切换用户正在看的页（`switch_tab` 是"给人看"的动作）。
        //   按方案 §4.4 的口径：这不是"失败"，而是**明确拒绝 + 给出替代做法** ——
        //   否则模型会换招重试（历史上"白烧步数"的来源）。
        if (bgFlow) {
          return { error: '后台流不能切换可见标签页（switch_tab 会把用户正在看的页面切走）。'
            + '你已经有自己的操作页：直接调 browser_get_page_content / browser_click / browser_navigate 等即可，'
            + '它们默认作用在**本流自己的页面**上；要指定某一页请传 tabId。' };
        }
        if (isWebviewEngine()) {
          const tid = String(args.tabId ?? activeTabId ?? '');
          if (webviewTabs.has(tid)) {
            activeTabId = tid;
            webviewTabs.get(tid).lastActiveAt = Date.now();
            // ★ 2026-10-16：`switch_tab` 此前**只改主进程、不广播** ⇒ 面板纹丝不动。
            //   用户实报「模型没有切换激活 tab 的工具」，真相是切了但界面不跟随。
            //   渲染层 `onTabActivated` 是幂等实现（activeTabId 已一致则忽略），重复广播无副作用。
            if (mainWindow && !mainWindow.isDestroyed()) {
              try { mainWindow.webContents.send('browserView:tabActivated', tid); } catch { /* ignore */ }
            }
            return { activeTabId: tid };
          }
          return { error: '标签页不存在: ' + tid };
        }
        return { error: '该浏览器引擎不支持 switch_tab' };
      }
      case 'close_tab': {
        if (!isWebviewEngine()) return { error: '该浏览器引擎不支持 close_tab' };
        // ★★★ 2026-10-15（「导航跑偏」P1-⑤，复审 HIGH）：**批量形态必须在主进程也生效**。
        //   工具描述明确推荐 `tabIds` 数组（"收尾时批量关闭用这个"），而本 case 此前只读
        //   `args.tabId` —— 桥路径（默认档）下模型按描述传数组时 `args.tabId` 为 undefined，
        //   下面 `?? activeTabId` 兜底会把**当前活动页**关掉（关错页、真正卡死的页还留着）。
        //   归一化 'tab-N' 与纯数字两种写法（与 browser-target.cjs 的 tabIdCandidates 同口径）。
        const normTab = (v) => {
          const s = String(v == null ? '' : v).trim();
          if (!s) return '';
          return /^\d+$/.test(s) ? 'tab-' + s : s;
        };
        const batchIds = Array.isArray(args.tabIds) ? args.tabIds.map(normTab).filter(Boolean) : [];
        if (batchIds.length) {
          // 逐个走**同一道**权限闸门；关闭本体复用唯一实现 closeTabById（不抄第二份摘壳逻辑）
          const closedIds = [];
          const failed = [];
          for (const tid of batchIds) {
            const m = webviewTabs.get(tid);
            if (!m) { failed.push(`${tid}（不存在）`); continue; }
            if (m.agentOpened !== true) { failed.push(`${tid}（非 agent 打开，无权关闭）`); continue; }
            closeTabById(tid, false);
            closedIds.push(tid);
          }
          return {
            closed: closedIds.length > 0,
            tabIds: closedIds,
            failed: failed.length ? failed : undefined,
          };
        }
        const tid = normTab(args.tabId ?? activeTabId);
        const meta = webviewTabs.get(tid);
          // ★★★ 权限闸门（2026-10-08，安全边界）：**agent 只能关闭自己打开的标签页**。
          //   本分支是 `browserView:action`，调用方恒为 agent 工具链（用户关 tab 走
          //   `browserView:closeTab` IPC，是另一条路径，不受此限）。
          //   为什么必须在主进程拦：agent 可能传错 tabId，也可能被页面内容诱导去关用户的页
          //   （如"关掉其他页签以继续"）；只靠提示词约束不构成权限边界。
          //   ⇒ 非 agentOpened 的 tab 一律拒绝，并把原因回给模型（让它知道该换 tab 或放弃）。
          if (meta && meta.agentOpened !== true) {
            return { error: '该标签页不是本次 agent 打开的，无权关闭（用户手动打开的页面只能由用户关闭）。请勿再次尝试关闭它。' };
          }
          // ★★★ 2026-10-15：关闭本体复用**唯一实现** closeTabById（内已含 broadcastTabClosed
          //   → 清锚 + 渲染层摘壳，以及活动页项替 + 广播）—— 此前这里抄了半份，
          //   正是 broadcastTabClosed 注释里点名的"活证"（关闭路径各清一次必然漏）。
          closeTabById(tid, false);
          return { closed: true };
      }
      case 'get_tabs': {
        if (!isWebviewEngine()) return { tabs: [] };
        const tabs2 = [];
        for (const [id, t] of webviewTabs) {
          const wc2 = guestWebContents(id);
          // ★ agentOpened 随列表返回（2026-10-08）：让模型**先知道**哪些页能关，
          //   而不是关失败了才知道 —— 配合 close_tab 的权限闸门，形成"事前可见 + 事后强制"。
          tabs2.push({ tabId: id, url: wc2 ? wc2.getURL() : '', title: wc2 ? wc2.getTitle() : '', scope: t.scope || 'preview', agentOpened: t.agentOpened === true, active: id === activeTabId, loading: wc2 && typeof wc2.isLoading === 'function' ? !!wc2.isLoading() : false });
        }
        return { tabs: tabs2, activeTabId };
      }
      // ========== C5 网络请求监听（桌面端用 performance API 轮询） ==========
      case 'wait_for_request': {
        const pat = String(args.urlPattern || '');
        if (!pat) return { error: 'urlPattern 为必填项' };
        const to = Math.min(args.timeout || 10000, 30000);
        const start = Date.now();
        while (Date.now() - start < to) {
          const r = await wc.executeJavaScript(`(function(){
            var pat=${JSON.stringify(pat)};
            var entries = performance.getEntriesByType('resource').filter(function(e){return e.name.indexOf(pat)>=0;});
            if (entries.length) { var e = entries[entries.length-1]; return { url: e.name, method: 'GET', status: (e.responseStatus||0) }; }
            return null;
          })()`).catch(() => null);
          if (r) return r;
          await new Promise(r => setTimeout(r, 300));
        }
        return { error: '等待超时未匹配到 ' + pat };
      }
      case 'get_network_log': {
        const pat = args.urlPattern ? String(args.urlPattern) : null;
        const n = Math.min(args.lastN || 20, 100);
        const entries = await wc.executeJavaScript(`(function(){
          return performance.getEntriesByType('resource').slice(-100).map(function(e){
            return { url: e.name, method: 'GET', status: 0, responseSize: e.transferSize || 0, time: Date.now() };
          });
        })()`).catch(() => []);
        let list = entries || [];
        if (pat) list = list.filter(function(e) { return e.url.indexOf(pat) >= 0; });
        return { entries: list.slice(-n).reverse() };
      }
      // ========== C6 结构化数据提取 ==========
      case 'extract_list': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var limit=a.limit||20; var fields=a.fields||null;
          var containerSel=a.selector;
          if(!containerSel){
            var candidates=['.goods-item','.product-item','.item','.card','li','article','[role="listitem"]'];
            for(var i=0;i<candidates.length;i++){if(document.querySelectorAll(candidates[i]).length>=2){containerSel=candidates[i];break;}}
          }
          if(!containerSel)return{error:'未指定 selector 且无法自动识别列表项容器，请传 selector'};
          var containers=Array.from(document.querySelectorAll(containerSel));
          if(!containers.length)return{error:'未匹配到列表项: '+containerSel};
          var autoFields=fields||{title:{selector:'.title, h3, h2, .name',attr:'text'},price:{selector:'.price, .cost',attr:'text'},link:{selector:'a',attr:'href'}};
          var items=[];
          for(var ci=0;ci<containers.length;ci++){if(items.length>=limit)break;var c=containers[ci];var item={};
            for(var fname in autoFields){var fdef=autoFields[fname];var sel=fdef.selector;var attr=fdef.attr||'text';var el=c.querySelector(sel);
              if(!el){item[fname]=null;continue;}
              if(attr==='text')item[fname]=(el.textContent||'').trim();
              else if(attr==='html')item[fname]=el.innerHTML;
              else item[fname]=el.getAttribute(attr);}
            items.push(item);}
          return{count:items.length,items:items};
        })()`);
      }
      // ========== C9 视觉定位闭环（桌面端截图保存到临时文件） ==========
      case 'visual_locate': {
        const image = await wc.capturePage();
        const buf = image.toPNG();
        const ts = Date.now();
        const dir = path.join(require('os').tmpdir(), 'yz_visual_locate');
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        const savePath = path.join(dir, 'screenshot_' + ts + '.png');
        fs.writeFileSync(savePath, buf);
        return { path: savePath };
      }
      // ========== C11 文件上传/下载 ==========
      // 注意：本 switch 中 'upload' 已在前面（C11 区块之前的真 filechooser 实现）统一处理并 return，
      // 这里不再重复定义 case —— 旧实现用 DataTransfer 造假 File 对象，受浏览器安全限制
      // 无法真正写入本地文件路径（input.files 只读），一律失败，属于已废弃路径。
      // 需要改上传实现时，只改前面那处 case 'upload'（唯一实现处），不要在此处另开分支。
      case 'download': {
        const savePath = args.savePath ? String(args.savePath) : null;
        const sess = wc.session;
        const downloadP = new Promise((resolve) => {
          let settled = false;
          sess.once('will-download', (e, item) => {
            const filename = item.getFilename();
            const sp = savePath || path.join(require('os').tmpdir(), filename);
            try { fs.mkdirSync(path.dirname(sp), { recursive: true }); } catch {}
            item.setSavePath(sp);
            item.once('done', () => { if (!settled) { settled = true; resolve({ filename, savedPath: sp, url: item.getURL() }); } });
            item.once('interrupted', () => { if (!settled) { settled = true; resolve({ error: '下载中断' }); } });
          });
          setTimeout(() => { if (!settled) { settled = true; resolve({ error: '未触发下载（超时）' }); } }, 15000);
        });
        if (args.url) {
          wc.downloadURL(String(args.url));
        } else if (args.selector) {
          await wc.executeJavaScript(`(function(){var el=window.__yzAssistant.resolve(${JSON.stringify(args.selector)});if(el)el.click();return !!el;})()`).catch(() => null);
        }
        return await downloadP;
      }
      // ========== C12 滚动到元素 / 可见性检测 ==========
      case 'scroll_into_view': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var el=null;
          if(a.index!=null&&window.__yzElements){el=window.__yzElements[a.index];}
          else if(a.selector){el=window.__yzAssistant.resolve(a.selector);}
          if(!el)return{error:'元素未找到'};
          el.scrollIntoView({behavior:'smooth',block:'center'});return{success:true};
        })()`);
      }
      case 'is_visible': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var el=null;
          if(a.index!=null&&window.__yzElements){el=window.__yzElements[a.index];}
          else if(a.selector){el=window.__yzAssistant.resolve(a.selector);}
          if(!el)return{visible:false,reason:'元素未找到'};
          if(!el.isConnected)return{visible:false,reason:'元素已从 DOM 移除'};
          var rect=el.getBoundingClientRect();
          if(rect.width<2||rect.height<2)return{visible:false,reason:'尺寸过小'};
          if(el.offsetParent===null){var st=getComputedStyle(el).position;if(st!=='fixed'&&st!=='sticky')return{visible:false,reason:'offsetParent 为 null（display:none 或祖先隐藏）'};}
          var cs=getComputedStyle(el);
          if(cs.visibility==='hidden')return{visible:false,reason:'visibility:hidden'};
          if(cs.opacity==='0')return{visible:false,reason:'opacity:0'};
          return{visible:true,reason:'可见'};
        })()`);
      }
      // ========== C13 拖拽（桌面端用 sendInputEvent 模拟鼠标） ==========
      case 'drag': {
        const from = await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          function resolve(prefix){
            var idx=prefix==='from'?a.fromIndex:a.toIndex;
            var sel=prefix==='from'?a.fromSelector:a.toSelector;
            if(idx!=null&&window.__yzElements){var el=window.__yzElements[idx];if(!el||!el.isConnected)return null;el.scrollIntoView({block:'center'});var r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};}
            if(sel){var el=window.__yzAssistant.resolve(sel);if(!el)return null;el.scrollIntoView({block:'center'});var r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};}
            var px=prefix==='from'?a.fromX:a.toX;var py=prefix==='from'?a.fromY:a.toY;
            if(px!=null&&py!=null)return{x:px,y:py};
            return null;
          }
          return{from:resolve('from'),to:resolve('to')};
        })()`);
        if (!from || !from.from) return { error: '无法解析起点坐标（index/selector/x+y 失效）' };
        if (!from.to) return { error: '无法解析终点坐标（index/selector/x+y 失效）' };
        await wc.sendInputEvent({ type: 'mouseMoved', x: from.from.x, y: from.from.y });
        await wc.sendInputEvent({ type: 'mouseButtonDown', button: 'left', x: from.from.x, y: from.from.y });
        // 分步移动模拟真实拖拽
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const x = from.from.x + (from.to.x - from.from.x) * i / steps;
          const y = from.from.y + (from.to.y - from.from.y) * i / steps;
          await wc.sendInputEvent({ type: 'mouseMoved', x, y });
        }
        await wc.sendInputEvent({ type: 'mouseButtonUp', button: 'left', x: from.to.x, y: from.to.y });
        return { dragged: true, from: from.from, to: from.to };
      }
      case 'run_script': {
        // P1-5 代码模式（2026-10-07）：在页面上下文执行受限 JS（Astra/Stagehand 式"写脚本替自己操作"）。
        // 脚本在页面主世界执行、返回值 JSON 可序列化；总闸 18s 在外层兜底（与其它 action 一致）。
        let script = String(args.script || '');
        if (!script.trim()) return { error: 'script is required' };
        if (script.length > 64000) return { error: 'script too long (max 64000 chars)' };
        // ★ 顶层 return 容错（2026-10-07）：模型常把脚本写成 `const x=...; return ...`（裸 return），
        //   直接丢给 executeJavaScript 会抛 SyntaxError → 模型只看到 "Script failed to execute"，
        //   无法自纠（当天连犯 3 次）。这里若检测到脚本含顶层 return 且未包成函数/IIFE，就自动包一层。
        const _stripCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        const _bare = _stripCode(script);
        const _wrapped = /^\s*(\(|async\s*\(|function\b|async\s+function\b|\(function|\(\(\))/.test(_bare)
          || /^\s*(const|let|var)\s+\w+\s*=\s*(async\s*)?(\(|function\b)/.test(_bare);
        let _autoWrapped = false;
        if (!_wrapped && /\breturn\b/.test(_bare)) {
          script = `(() => { ${script}\n})()`;
          _autoWrapped = true;
        }
        try {
          const r = await wc.executeJavaScript(script, false);
          return { url: (typeof wc.getURL === 'function' ? wc.getURL() : '') || '', result: r === undefined ? null : r, ...(_autoWrapped ? { autoWrapped: true } : {}) };
        } catch (e) {
          // ★★★ 2026-10-15：失败时**二次取证**，把页面真实异常带回给模型。
          //
          // 为什么必须这么做：`catch (e)` 里拿到的 `e.message` 是 Electron
          // `executeJavaScript` 的 rejection 文案 —— 页面内抛出的异常被它统一成一句
          // "Script failed to execute... Check the renderer console for the error."，
          // 而**模型看不到 console**。于是模型只知道"失败了"，不知道"哪一行、什么错"，
          // 只能换着选择器盲试（实测 10-14 单日 12 次，是当前最高频的失败）。
          //
          // 取证方式：把同一段脚本再在**页面内 try/catch** 里跑一次，把真实的
          // message/stack 当**正常返回值**取回。**成功路径完全不变** —— 只在已失败后走这里。
          // · 表达式脚本（IIFE）→ 内层函数体里当语句执行，副作用与首次一致；
          // · 裸 return 脚本 → 内层是函数体，`return` 合法，甚至能返回正确值。
          // ★ 已知边界（勿当成 bug）：**纯语法错误取不回** —— 注入的脚本文本会成为探测自身的
          //   源码，编译期就失败，内层 try/catch 捕不到；此时探测同样 reject，下面的 `detail`
          //   留空、退回原始文案（行为与修复前一致，不会更差）。而实测高频的
          //   "Script failed to execute…" 本身就是**运行期抛错**（Electron 对解析失败给的是另一种
          //   SyntaxError 文案），正是本探测能覆盖的那类。
          // 2s 限时：取证只是锦上添花，绝不能因为探测本身挂起而拖慢动作。
          let detail = '';
          try {
            const probe = `(function(){ try { (function(){ ${script}\n }).call(this); return ''; } catch (e) { return String((e && (e.stack || e.message)) || e); } })()`;
            detail = String((await Promise.race([
              wc.executeJavaScript(probe, false),
              new Promise((r) => setTimeout(() => r(''), 2000)),
            ])) || '');
          } catch { /* 取证失败：退回原始文案（行为与修复前一致） */ }
          const real = detail || ((e && e.message) || String(e));
          // 按**真实**异常类型给可自纠的指引，而不是笼统的"检查语法"
          const hint = /SyntaxError/.test(real)
            ? '这是**运行期 SyntaxError**（脚本已开始执行后抛出，如 JSON.parse 收到非法文本）。请按报错修正数据来源后重发。'
            : _autoWrapped
              ? '脚本已自动包裹为函数执行，但仍抛错。请按上面的真实异常修正（常见："Cannot read properties of null" = 选择器没匹配到元素）。'
              : '执行失败（页面脚本抛异常，常见于选择器失效：hash class 如 .xxx-N8BqC1 在重渲染后不存在、或目标元素未加载）。**不要换同类 hash class 重试**——先用 browser_get_page_content 重新定位元素，或改用专用工具（click/type）。';
          return {
            error: `脚本执行抛错：${real}`,
            hint,
          };
        }
      }
      default:
        return { error: '未知操作: ' + action };
    }
    };

    // 变化检测：对可能改变页面的操作做前后快照对比，为模型提供 pageChanged / noChangeStreak 反馈
    let beforeState = null;
    if (CHANGE_ACTIONS.has(action)) {
      beforeState = await Promise.race([
        wc.executeJavaScript(STATE_SNAPSHOT_JS).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 3000)),
      ]);
    }
    // 总闸：默认任何 action 最多 30s；慢动作（upload/screenshot）60s。
    //   ★★★ 2026-10-12 修正（诊断报告 P0-1，用户实报"pageAgent 一跑整个应用就卡"）：
    //     此前默认 **18s**，且超时文案末尾写着「请稍后用 browser_get_page_content 重试」——
    //     对抖音创作者中心这类重页面，读/执行类动作（尤其是 run_script / get_page_content）
    //     经常 >18s ⇒ **每次都判超时 → 模型照文案不停重试 → 主循环被 18s×N 占满 →
    //     SSE 会话流断连重连 → 整个应用看起来卡死**（实测：单会话 168 次超时 / 50 次循环拦截）。
    //   ⇒ 两处纠正：
    //     ① 默认窗口 18s → 30s（读/执行类动作不再轻易误判；30s 仍远小于服务端快档 90s 上限）。
    //     ② 超时**不是"失败"**：返回 `timedOut` / `stillLoading` 结构化字段，文案明确写
    //        「不代表失败、**不要重复调用同一动作**」——删掉那句诱导重试的措辞。
    const SLOW_ACTIONS = new Set(['upload', 'screenshot']);
    // ★★★ 2026-10-14：默认档 30s → **15s**（读/执行类动作）。
    //   依据（三份主进程日志共 1330 次真实动作，脚本按"桥墙钟"分档统计，非推测）：
    //     · 成功动作耗时：p50=538ms / p90=9.9s / p95=14.3s / p99=23.9s —— 15s 仍覆盖 p95；
    //     · **一旦超过 20s 就几乎注定拿不到结果**：20~30s 档 63 次里只成功 11 次（17%），
    //       ≥30s 档 98 次里只成功 6 次（6%）；
    //     · ≥20s 的 161 次动作占全部墙钟的 **59.9%（88 分钟）**，其中 **76 次是超时白等
    //       （49.4 分钟）**，最大头是 get_page_content（33 次/22.0 分钟）与 run_script（34 次/21.2 分钟）。
    //   把默认档压到 15s：可省下约 **30.4 分钟**白等，代价是 3 天内 30 次"本来会成功"的动作
    //   被提前截断（各多一次往返，约 1 分钟量级）—— 净收益约 29 分钟。
    //   ★ navigate 不进这一档：慢站导航实测常 14.5s（本项目自己注释过），30s 窗口是它的正常需求。
    //   ★ 超时**不会中断**已发出的 doAction（Promise.race 只是提前交还控制权），
    //     所以压窗口不会破坏操作本身，只让模型早十几秒知道"这页很慢"。
    const NAV_ACTIONS = new Set(['navigate']);
    const actionTimeout = SLOW_ACTIONS.has(action) ? 60000 : (NAV_ACTIONS.has(action) ? 30000 : 15000);
    // ★★★ 桥路径串行执行（2026-10-14，见 chainBridgeAction 头注）：同 tab 上同一时刻只跑一个动作，
    //   消除"超时后 doAction 仍在跑、模型又发下一个"造成的并发打架。
    //   ★ 只对桥路径（convId 非空）加锁：渲染层路径已有 chainBrowserOp，且不该让用户点工具栏排队。
    //   ★ 排队耗时同时记日志并回执（queuedMs）—— 用户要求把"排队"这件事量出来，不能再靠猜。
    const enqueuedAt = Date.now();
    let queuedMs = 0;
    const actionKey = String(tabId || activeTabId || '__global__');
    const actionPromise = convId
      ? chainTabAction(tabActionChains, actionKey, () => {
          const waited = Date.now() - enqueuedAt;
          if (waited > 200) {
            console.log(`[browser-action] ${action} 排队等待 ${waited}ms（同 tab 上一个动作尚未结束）`);
          }
          queuedMs = waited;
          // ★ 执行期间登记"这个 tab 正忙"（见 tabActionBusy 注释）：回收/逐出据此避让，
          //   避免在任何一次长动作（最长 8 分钟）飞在半空时把页抽走。
          tabActionBusy.add(actionKey);
          return doAction().finally(() => tabActionBusy.delete(actionKey));
        })
      : doAction();
    const result = await Promise.race([
      actionPromise,
      new Promise((r) => setTimeout(() => {
        let stillLoading = true;
        try { stillLoading = !!(wc && !wc.isDestroyed() && wc.isLoading()); } catch { /* 取不到按加载中处理 */ }
        r({
          // ★ 文案按"改道"写，不再引导"等一会儿再读同一个"（那正是"重试→再烧一轮"的来源）
          error: `浏览器操作 ${action} 在 ${actionTimeout / 1000}s 内未返回（页面正忙，**不代表失败**）。`
            + '**不要原地重试同一动作** —— 重试只会再等一轮。按性质改道：'
            + '① 纯读取 → 用 browser_get_page_content 并调小 maxTextLength，或直接 browser_run_script 只取需要的字段；'
            + '② 刚做过导航/上传、页面还在加载 → 用 browser_wait_for 等**一次**再继续；'
            + '③ 同一个动作连续两次这样 → 判定该页假死，停下汇报（页面上的已填内容刷新即丢，**不要用刷新"恢复"**）。',
          timedOut: true,
          stillLoading,
        });
      }, actionTimeout)),
    ]);
    // ★ 把真实排队耗时带回执（观测量；0 = 没排队。用户要求把"排队耗时"量出来，不再靠猜）
    if (result && queuedMs > 0) result.queuedMs = queuedMs;
    if (result && !result.error && !result.ambiguous && beforeState) {
      await new Promise(r => setTimeout(r, 500)); // 等待页面响应
      const after = await wc.executeJavaScript(STATE_SNAPSHOT_JS).catch(() => null);
      if (after) {
        const urlChanged = after.url !== beforeState.url;
        const changed = urlChanged || after.t !== beforeState.t || after.n !== beforeState.n;
        // ★ B7：按 tab 分桶（拿不到 tabId 时归到活动页桶；文案统一由 recordNoChange 给出）
        const streakKey = tabId != null ? tabId : activeTabId;
        const st = recordNoChange(streakKey, changed);
        result.pageChanged = changed;
        result.urlChanged = urlChanged;
        result.noChangeStreak = st.streak;
        if (st.warning) result.warning = st.warning;
      }
    }

    // Agent 虚拟鼠标广播：动作若触发了 guest 内光标（click/type/scroll/hover 等），
    // 读回最后坐标，按页面缩放换算后广播给渲染层在 webview 上方画宿主层常驻光标。
    // guest 内瞬时光标（0.5s 闪现 + 被 shield 盖住）用户看不见，宿主层这一份才是给用户看的。
    if (wc && !wc.isDestroyed()) {
      const tabIdForCursor = tabId || activeTabId;
      const CURSOR_READ_JS = `(function(){try{var L=window.__yzLastCursor;if(!L)return null;
        window.__yzLastCursor=null;return{cx:L.x,cy:L.y,label:L.label||'',kind:L.kind||''};}catch(e){return null;}})()`;
      const cur = await Promise.race([
        wc.executeJavaScript(CURSOR_READ_JS).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 800)),
      ]);
      if (cur && cur.cx != null && mainWindow && !mainWindow.isDestroyed()) {
        let zoom = 1;
        try { zoom = await Promise.race([wc.getZoomFactor(), new Promise((r) => setTimeout(() => r(1), 300))]); } catch { /* ignore */ }
        const zx = (typeof cur.cx === 'number') ? cur.cx * zoom : cur.cx;
        const zy = (typeof cur.cy === 'number') ? cur.cy * zoom : cur.cy;
        try { mainWindow.webContents.send('browserView:cursor', tabIdForCursor, zx, zy, cur.label || '', cur.kind || ''); } catch { /* ignore */ }
      }
    }

    // ★★★ P0-2 锚定建立（2026-10-10，已修"显式 tabId / new_tab 改写锚"两个缺陷）：
    //   动作**成功**后才锚（失败不锚 —— 否则后续动作会指到一个没真正成为目标的页）。
    //   ★ 判定规则说明见 `browser-target.cjs` 的 `decideAnchorUpdate` 顶部注释（单一真相源）。
    if (convId && result && !result.error && !result.ambiguous) {
      // ★★★ 记账更新判定在纯函数模块里（**唯一实现**，可真跑验证）：
      //   'anchor' = 改"当前操作页" / 'touch' = 只用不改锚（定向读 / new_tab 开的页）/ 'none' = 不动。
      const upd = decideAnchorUpdate(action, args.tabId != null && args.tabId !== '', tabId, result.tabId, {
        orchestratedNewTab: args._orchestratedNewTab === true,
      });
      // ★ 诊断：锚定决策必须可观测（"navigate 成功后读不到页"的唯一线索）；带 flow 便于多流定位
      console.log(`[browser-action] 锚定决策: flow=${flow || 'shared'} action=${action} resolvedTabId=${tabId || '-'} resultTabId=${result.tabId || '-'} → ${upd.mode}${upd.tabId ? ':' + upd.tabId : ''}`);
      if (upd.mode === 'anchor') {
        setFlowAnchor(flowKey, upd.tabId);
        // ★★★ 2026-10-16（用户拍板「面板跟随锚」）：前台流一旦换了"当前操作页"，
        //   主进程 `activeTabId` 与渲染层面板都要跟过去。
        //   为什么必须：`activeTabId`（用户在看哪个）与 `convAnchors`（流在哪操作）本可以不同，
        //   但此前**没有任何机制让面板跟随执行目标** ⇒ 实拍（2026-10-16 11:39）模型在 tab-1 上
        //   做番茄回填并提交成功，面板却停在最后新建的快手 tab（tab-7）上 ——
        //   用户看到"两个 tab 卡在快手、任务像死了"，而真正的回填发生在看不见的页上。
        //   后台流（`bg:`）不在此列：它的页是给 agent 自己用的，不该抢用户视野。
        if (!bgFlow && upd.tabId && upd.tabId !== activeTabId) {
          activeTabId = upd.tabId;
          const m = isWebviewEngine() ? webviewTabs.get(String(upd.tabId)) : null;
          if (m) m.lastActiveAt = Date.now();   // 刚被 agent 用过，别让空闲回收把它卸了
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('browserView:tabActivated', String(upd.tabId)); } catch { /* ignore */ }
          }
        }
      }
      else if (upd.mode === 'touch') markFlowTabTouched(flowKey, upd.tabId);
    }
    // ★ 动作结果日志（与入口日志配对）—— 失败时打印 error，便于一眼看出"卡在哪一步"
    try {
      console.log(`[browser-action] ${action} → ${result && result.error ? 'ERROR: ' + result.error : 'ok'}`);
    } catch { /* ignore */ }
    return result;
  } catch (e) {
    try { console.error(`[browser-action] ${action} → THREW: ${(e && e.stack) || e}`); } catch { /* ignore */ }
    return { error: e?.message || String(e) };
  }
}

// IPC 入口：SSE 委托路径（渲染层调用）。渲染层自己维护锚定与 tabId，
// 故 convId 传 null —— 不走主进程的会话锚定（避免与渲染层"两个锚"打架，见 convAnchors 注释）。
ipcMain.handle('browserView:action', async (_e, tabId, action, args) =>
  runBrowserAction(null, tabId, action, args));

// ============================================================
// 浏览器桥（「执行面直连化」P0-3）：loopback HTTP 端点，服务端直连。
// 见 browser-bridge.cjs 顶部注释（安全边界 / 白名单 / 灰度）。
// ============================================================
const browserBridge = require('./browser-bridge.cjs');
browserBridge.attach({
  runAction: runBrowserAction,
  allowedActions: DESKTOP_BROWSER_ACTIONS,
  log: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
});

// ============================================================
// IPC：数据库（better-sqlite3）
// ============================================================
ipcMain.handle('db:exec', (e, sql, params) => {
  const d = getDb();
  try {
    if (params && params.length > 0) {
      d.prepare(sql).run(...params);
    } else {
      d.exec(sql);
    }
  } catch (err) {
    // 迁移类错误静默忽略：列已存在 / 旧表不存在
    if (err && err.code === 'SQLITE_ERROR' && /duplicate column|no such table/i.test(err.message)) return;
    throw err;
  }
});

ipcMain.handle('db:query', (e, sql, params) => {
  const d = getDb();
  if (params && params.length > 0) {
    return d.prepare(sql).all(...params);
  }
  return d.prepare(sql).all();
});

// 事务：接收 SQL 数组，在事务中依次执行
// 注意：platform.ts 中的 transaction(fn) 不走此通道，而是用 BEGIN/COMMIT/ROLLBACK 手动控制
ipcMain.handle('db:transaction', (e, sqls) => {
  const d = getDb();
  const result = [];
  const tx = d.transaction(() => {
    for (const item of sqls) {
      // item 可以是字符串 { sql, params? }
      if (typeof item === 'string') {
        result.push(d.exec(item));
      } else if (item && typeof item === 'object' && item.sql) {
        if (item.params && item.params.length > 0) {
          result.push(d.prepare(item.sql).run(...item.params));
        } else {
          result.push(d.prepare(item.sql).all());
        }
      }
    }
  });
  tx();
  return result;
});

// ============================================================
// IPC：文件系统（Node.js fs）
// ============================================================
ipcMain.handle('fs:readFile', (e, p) => fsp.readFile(p, 'utf-8'));

ipcMain.handle('fs:readFileBase64', async (e, p) => {
  const buf = await fsp.readFile(p);
  return buf.toString('base64');
});

ipcMain.handle('fs:writeFile', (e, p, content) => fsp.writeFile(p, content, 'utf-8'));

ipcMain.handle('fs:writeFileBase64', (e, p, b64) => fsp.writeFile(p, Buffer.from(b64, 'base64')));

ipcMain.handle('fs:exists', (e, p) => fs.existsSync(p));

// 文件元信息（预览面板大小/修改时间展示用）
ipcMain.handle('fs:stat', async (e, p) => {
  const st = await fsp.stat(p);
  return { size: st.size, mtimeMs: st.mtimeMs, isDir: st.isDirectory() };
});

// 用户主目录（SFTP 本地栏的起始目录）
ipcMain.handle('fs:homeDir', () => app.getPath('home'));

ipcMain.handle('fs:mkdir', (e, p) => fsp.mkdir(p, { recursive: true }));

ipcMain.handle('fs:remove', (e, p) => fsp.rm(p, { recursive: true, force: true }));

ipcMain.handle('fs:readDir', async (e, p) => {
  const entries = await fsp.readdir(p, { withFileTypes: true });
  return entries.map((entry) => entry.name);
});

ipcMain.handle('fs:listDirEntries', async (e, p) => {
  const entries = await fsp.readdir(p, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    path: path.join(p, entry.name),
    isDir: entry.isDirectory(),
  }));
});

// 带 size/mtime 的目录列举（SFTP 文件管理器的本地栏用；与 listDirEntries 分离以免拖慢递归遍历类工具）
ipcMain.handle('fs:listDetailed', async (e, p) => {
  const entries = await fsp.readdir(p, { withFileTypes: true });
  return Promise.all(
    entries.map(async (entry) => {
      const full = path.join(p, entry.name);
      let size = 0;
      let mtime = 0;
      try {
        const st = await fsp.lstat(full); // lstat：不跟随符号链接，链接失效也不抛
        size = st.size;
        mtime = st.mtimeMs;
      } catch { /* 无法读取时保持 0 */ }
      return { name: entry.name, path: full, isDir: entry.isDirectory(), size, mtime };
    }),
  );
});

// ============================================================
// IPC：Keyring（JSON 文件存储；敏感值 safeStorage 加密）
// ============================================================
ipcMain.handle('keyring:set', async (e, key, value) => {
  const data = await readKeyring();
  if (isSensitiveKeyringKey(key)) {
    const enc = encryptKeyringValue(safeStorage, value);
    // 加密不可用时退回明文：宁可弱保护也不能让用户存不进 API Key（否则应用不可用）
    data[key] = enc !== null ? enc : value;
  } else {
    data[key] = value;
  }
  await writeKeyring(data);
});

ipcMain.handle('keyring:get', async (e, key) => {
  const data = await readKeyring();
  if (!Object.prototype.hasOwnProperty.call(data, key)) return null;
  if (!isSensitiveKeyringKey(key)) return data[key];
  const dec = decryptKeyringValue(safeStorage, data[key]);
  if (!dec.ok) {
    // 解密失败 = 换机器/换账户/文件被拷走。返回 null（等同未设置）并明确告警 ——
    // 绝不要把 enc:v1: 这串密文当 API Key 返回，否则上游 401 且无从排查。
    console.warn(`[keyring] 键 ${key} 解密失败，按未设置处理:`, dec.reason);
    return null;
  }
  return dec.value;
});

ipcMain.handle('keyring:delete', async (e, key) => {
  const data = await readKeyring();
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    delete data[key];
    await writeKeyring(data);
  }
});

// ============================================================
// IPC：Clipboard
// ============================================================
ipcMain.handle('clipboard:readText', () => clipboard.readText());
ipcMain.handle('clipboard:writeText', (_e, text) => clipboard.writeText(String(text ?? '')));

// 写入图片到系统剪贴板（渲染层传 dataURL）。图片右键「复制」走这里，
// 比 navigator.clipboard.write 可靠——后者在 Electron 里对 image/png blob 支持不稳。
ipcMain.handle('clipboard:writeImage', (_e, dataUrl) => {
  try {
    const img = nativeImage.createFromDataURL(String(dataUrl || ''));
    if (img.isEmpty()) return { ok: false, error: '图片数据为空' };
    clipboard.writeImage(img);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ============================================================
// IPC：Save Dialog（另存为）
// ============================================================
// dataUrl：内存里的图片（右键另存为，源可能是远端/接口地址）
// sourcePath：磁盘上的已有文件（视频等大文件走复制，不经过渲染层）
ipcMain.handle('dialog:saveFile', async (_e, opts) => {
  const { defaultName, dataUrl, sourcePath, filePath } = opts || {};
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  try {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: defaultName || path.basename(String(filePath || sourcePath || 'download')),
    });
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
    if (dataUrl) {
      const m = String(dataUrl).match(/^data:[^;,]*;base64,([\s\S]+)$/);
      await fsp.writeFile(r.filePath, Buffer.from(m ? m[1] : String(dataUrl), 'base64'));
    } else {
      await fsp.copyFile(String(sourcePath || filePath), r.filePath);
    }
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ============================================================
// IPC：Shell（child_process）
// ============================================================
/**
 * ★★★ 子进程输出**不做 UTF-8 解码**（2026-10-01 用户实报「安装包任务里工具输出乱码」）：
 *   Windows 下子进程按 OEM 代码页（GBK/CP936）输出（`cmd /c echo 中文`、`dir`，
 *   以及无 `PYTHONIOENCODING` 的 Python），原先这里写死 `toString('utf-8')` → 满屏 U+FFFD。
 *   渲染层拿不到原始字节就无法识别编码，所以这里**原样传 base64**，
 *   由渲染层（apps/desktop/src/platform.ts）走 shared 的 decodeTextBytes 自动识别
 *   （BOM → 严格 UTF-8 → GB18030 兜底）。
 *   ★ 顺带修掉老隐患：execFile 的 stdout/stderr 是**整段 Buffer**（非流式），
 *     不存在多字节字符跨 chunk 被解坏的问题。
 */
ipcMain.handle('shell:exec', (e, command, args, options) => {
  return new Promise((resolve) => {
    const opts = {};
    if (options?.cwd) opts.cwd = options.cwd;
    if (options?.env) opts.env = { ...process.env, ...options.env };
    const toB64 = (v) => (Buffer.isBuffer(v) ? v.toString('base64')
      : Buffer.from(String(v || ''), 'utf-8').toString('base64'));
    const child = execFile(command, args ?? [], opts, (err, stdout, stderr) => {
      resolve({
        stdoutB64: toB64(stdout),
        stderrB64: toB64(stderr),
        exitCode: err ? (err.code ?? 1) : 0,
      });
    });
    if (options?.timeout && typeof options.timeout === 'number' && options.timeout > 0) {
      setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
      }, options.timeout);
    }
  });
});

ipcMain.handle('shell:openPath', (_e, p) => {
  if (!p) return;
  try { shell.openPath(p); } catch {}
});

// 在系统文件管理器中定位文件（Explorer/Finder 高亮选中）
ipcMain.handle('shell:showItemInFolder', (_e, p) => {
  if (!p) return;
  try { shell.showItemInFolder(p); } catch {}
});

// ★ 外链协议白名单（2026-10-08）：只允许 http/https 交给系统 Shell，其余一律拒绝。
// 动机：页面里的 bitbrowser:// / tel: / mailto: / ms-* 等自定义协议一旦被 openExternal 甩给
// Windows Shell，而本机又没有注册对应处理器，系统就会弹「没有可打开此链接的应用」——
// 表现为任务运行中反复弹窗（小说推文的站点页面里混有第三方协议的推广位）。
// 宁可静默丢弃，也绝不把未知协议交给 Shell。实现见 url-guard.cjs（纯函数，有单测）。
// ★ 2026-10-12：新增 guardNavigation 统一装配点（同时挂 will-navigate + will-frame-navigate）
//   —— 子帧 iframe 导航只触发后者，此前逐容器手挂 will-navigate 会漏（用户报"还是会出来"）。
//   ⚠️ require 已提到文件**顶部**（见开头）：guardNavigation 在窗口创建处（~800 行）就要用，
//      留在这里会因 TDZ（const 未初始化）抛 ReferenceError。

// 用系统默认浏览器打开外链（http/https），不在应用窗口内导航离开
ipcMain.handle('shell:openExternal', (_e, url) => {
  if (!isSafeExternalUrl(url)) {
    console.log('[nav] shell:openExternal 拒绝非 http(s) 协议:', url);
    return;
  }
  console.log('[nav] shell:openExternal IPC:', url);
  try { shell.openExternal(url); } catch {}
});

// 原生文件夹/文件选择对话框，返回选中路径（取消返回 null）
ipcMain.handle('dialog:showOpenDir', async (_e, options) => {
  const props = (options && options.directory === false) ? ['openFile'] : ['openDirectory'];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: props,
    title: (options && options.title) || '选择文件夹',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// 多选文件（SFTP 上传），返回绝对路径数组；取消返回 []
ipcMain.handle('dialog:showOpenFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '选择要上传的文件',
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

// ============================================================
// IPC：MCP 子进程（child_process + JSON-RPC over stdin/stdout）
// ============================================================
ipcMain.handle('mcp:start', (e, command, args, env) => {
  const childId = `mcp-${++mcpChildSeq}-${crypto.randomBytes(4).toString('hex')}`;
  const childEnv = { ...process.env, ...(env || {}) };
  const child = spawn(command, args || [], {
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 缓冲 stdout，按换行解析 JSON-RPC 响应
  let stdoutBuf = '';
  // 等待响应的 Promise resolve 队列（按顺序）
  const pendingResolvers = [];

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf-8');
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx).trim();
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const resolver = pendingResolvers.shift();
        if (resolver) resolver(msg);
      } catch (err) {
        // 非 JSON 行（日志输出），忽略
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    console.error(`[mcp:${childId}] stderr:`, chunk.toString('utf-8'));
  });

  child.on('error', (err) => {
    console.error(`[mcp:${childId}] spawn error:`, err);
    // 失败时拒绝所有 pending 调用
    while (pendingResolvers.length) {
      const resolver = pendingResolvers.shift();
      resolver({ error: { code: -1, message: String(err) } });
    }
  });

  child.on('exit', (code, signal) => {
    console.log(`[mcp:${childId}] exited code=${code} signal=${signal}`);
    mcpChildren.delete(childId);
    while (pendingResolvers.length) {
      const resolver = pendingResolvers.shift();
      resolver({ error: { code: -1, message: `process exited code=${code} signal=${signal}` } });
    }
  });

  mcpChildren.set(childId, { child, pendingResolvers });
  return childId;
});

ipcMain.handle('mcp:call', (e, childId, method, params) => {
  const entry = mcpChildren.get(childId);
  if (!entry) {
    return { error: { code: -2, message: `unknown childId: ${childId}` } };
  }
  const { child, pendingResolvers } = entry;
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params: params ?? null, id: pendingResolvers.length });
    try {
      child.stdin.write(msg + '\n');
    } catch (err) {
      // 写入失败：从 pending 队列中移除刚加入的 resolver 并返回错误
      const idx = pendingResolvers.indexOf(resolve);
      if (idx >= 0) pendingResolvers.splice(idx, 1);
      resolve({ error: { code: -3, message: String(err) } });
    }
  });
});

ipcMain.handle('mcp:kill', (e, childId) => {
  const entry = mcpChildren.get(childId);
  if (!entry) return;
  try { entry.child.kill('SIGTERM'); } catch {}
  mcpChildren.delete(childId);
});


// ============================================================
// 屏幕截图（聊天输入框「截图」按钮 / 全局快捷键，桌面端专属）
// 流程（对齐微信截图）：desktopCapturer 抓全部屏幕原始分辨率「冻结画面」→
// 光标所在显示器铺全屏框选窗（加载完立刻亮出深色遮罩，冻结图随后异步换上，
// 绝不让用户「点了没反应」）→ 拖拽选区（Enter/双击确认，Esc/右键取消）→
// 主进程按 物理/逻辑 比例裁剪原图 → PNG dataURL 返回发起截图的渲染进程。
// hideApp=false 时主窗口不隐藏（用户想截自己界面时用，设置页可开关）。
// ============================================================
let snipSession = null;

/** 黑帧样本落盘（每次覆盖），排障时可直接看这张"黑图"到底是什么 */
function saveBlackSample(img) {
  try {
    fs.mkdirSync(snipLogDir(), { recursive: true });
    fs.writeFileSync(path.join(snipLogDir(), 'snip-black.png'), img.toPNG());
    snipLog('black frame sample saved: logs/snip-black.png');
  } catch {}
}
/** snip 专用日志：终端 + 落盘双写（排障时直接读 %APPDATA%/yan-zhi/logs/snip.log） */
const snipLogDir = () => path.join(app.getPath('userData'), 'logs');
function snipLog(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log('[snip]', line);
  try {
    fs.mkdirSync(snipLogDir(), { recursive: true });
    fs.appendFileSync(path.join(snipLogDir(), 'snip.log'), new Date().toISOString() + ' ' + line + '\n', 'utf8');
  } catch {}
}

// ============================================================
// 原生 GDI 抓屏（对齐微信/QQ/截图工具的技术路线）
// Electron 的 desktopCapturer 经 Chromium GPU 进程转发，部分 NVIDIA 机器上
// 缩略图全黑。原生工具（微信/QQ/PixPin/Snipaste）都走系统级 GDI/DXGI。
// 这里用 Windows 自带的 .NET 编译器（csc，所有 Win10/11 都有）在首次使用时
// 现编一个几十 KB 的抓屏小工具（CopyFromScreen，GDI），之后每次截屏直接调
// 它，毫秒级返回，完全绕开 Chromium。编译失败自动落回 desktopCapturer 管线。
// ============================================================
const GDI_CAP_CS = `
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

static class ScreenCap {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

  // ===== 窗口枚举（微信式 hover 识别的原始数据源）=====
  // Per-Monitor-DPI-Aware 意义重大：不设的话进程被 DPI 虚拟化后 GetWindowRect
  // 在高 DPI 副屏上返回错误坐标，hover 高亮会整体错位。
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int nIndex);
  [DllImport("user32.dll")] static extern int GetWindowTextW(IntPtr h, [MarshalAs(UnmanagedType.LPWStr)] StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern int GetClassNameW(IntPtr h, [MarshalAs(UnmanagedType.LPWStr)] StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lParam);
  // DWMWA_CLOAKED = 14：1=应用自己 cloak，2=shell cloak（Win10 UWP 幽灵窗口），非 0 都不可见
  const int DWMWA_CLOAKED = 14;
  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;

  // JSON 字符串转义用字符码拼，避免在源码里写反斜杠/引号字面量
  static string Esc(string s) {
    var sb = new StringBuilder();
    foreach (char ch in s) {
      if (ch == (char)92) { sb.Append((char)92); sb.Append((char)92); }
      else if (ch == (char)34) { sb.Append((char)92); sb.Append((char)34); }
      else sb.Append(ch);
    }
    return sb.ToString();
  }

  // 只收「真实可见的应用窗口」：可见、非最小化、未被 cloak、非工具窗/悬浮挂件、
  // 尺寸不小于 24px 且未占满整个虚拟屏（Progman/WorkerW 桌面本身）。
  static List<RECT> gRects = new List<RECT>();
  static List<long> gHwnds = new List<long>();
  static List<string> gTitles = new List<string>();
  static List<string> gClasses = new List<string>();
  static List<uint> gPids = new List<uint>();

  static void CollectWindows() {
    gRects.Clear(); gHwnds.Clear(); gTitles.Clear(); gClasses.Clear(); gPids.Clear();
    int vsX = GetSystemMetrics(76), vsY = GetSystemMetrics(77);
    int vsW = GetSystemMetrics(78), vsH = GetSystemMetrics(79);
    EnumWindows((h, lp) => {
      try {
        if (!IsWindowVisible(h) || IsIconic(h)) return true;
        int ex = GetWindowLong(h, GWL_EXSTYLE);
        if ((ex & WS_EX_TOOLWINDOW) != 0) return true;       // 输入法候选框之类
        if ((ex & WS_EX_NOACTIVATE) != 0) return true;       // 悬浮挂件
        int cloaked = 0;
        DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4);
        if (cloaked != 0) return true;
        RECT r;
        if (!GetWindowRect(h, out r)) return true;
        int w = r.R - r.L, hh = r.B - r.T;
        if (w < 24 || hh < 24) return true;                  // 微小杂窗
        if (w >= vsW && hh >= vsH) return true;              // 占满虚拟屏 = 桌面本身
        var t = new StringBuilder(256); GetWindowTextW(h, t, 256);
        var c = new StringBuilder(256); GetClassNameW(h, c, 256);
        uint pid; GetWindowThreadProcessId(h, out pid);
        gRects.Add(r); gHwnds.Add(h.ToInt64()); gTitles.Add(t.ToString());
        gClasses.Add(c.ToString()); gPids.Add(pid);
      } catch {}
      return true;
    }, IntPtr.Zero);
  }

  static string WindowsJson() {
    var sb = new StringBuilder("[");
    for (int j = 0; j < gRects.Count; j++) {
      if (j > 0) sb.Append((char)44);
      RECT r = gRects[j];
      sb.Append((char)123);
      sb.Append((char)34).Append("x").Append((char)34).Append((char)58).Append(r.L).Append((char)44);
      sb.Append((char)34).Append("y").Append((char)34).Append((char)58).Append(r.T).Append((char)44);
      sb.Append((char)34).Append("width").Append((char)34).Append((char)58).Append(r.R - r.L).Append((char)44);
      sb.Append((char)34).Append("height").Append((char)34).Append((char)58).Append(r.B - r.T).Append((char)44);
      sb.Append((char)34).Append("hwnd").Append((char)34).Append((char)58).Append(gHwnds[j]).Append((char)44);
      sb.Append((char)34).Append("title").Append((char)34).Append((char)58).Append((char)34).Append(Esc(gTitles[j])).Append((char)34).Append((char)44);
      sb.Append((char)34).Append("cls").Append((char)34).Append((char)58).Append((char)34).Append(Esc(gClasses[j])).Append((char)34).Append((char)44);
      sb.Append((char)34).Append("pid").Append((char)34).Append((char)58).Append(gPids[j]);
      sb.Append((char)125);
    }
    sb.Append(']');
    return sb.ToString();
  }

  static int Main(string[] args) {
    try { SetProcessDpiAwarenessContext((IntPtr)(-4)); } catch {}  // PER_MONITOR_AWARE_V2
    try { SetProcessDPIAware(); } catch {}
    try {
      // --win：只枚举窗口不抓屏，输出一行 JSON（框选窗 hover 轮询用，几十毫秒返回）
      for (int i = 0; i < args.Length; i++) {
        if (args[i] == "--win") {
          CollectWindows();
          Console.WriteLine(WindowsJson());
          return 0;
        }
      }
      string outPath = args.Length > 0 ? args[0] : "screen.png";
      int x = GetSystemMetrics(76), y = GetSystemMetrics(77);
      int w = GetSystemMetrics(78), h = GetSystemMetrics(79);
      if (w <= 0 || h <= 0) { Console.Error.WriteLine("no screen"); return 2; }
      using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
      using (Graphics g = Graphics.FromImage(bmp)) {
        g.CopyFromScreen(x, y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
        bmp.Save(outPath, ImageFormat.Png);
      }
      // 抓屏同时产出窗口清单（第二行 JSON），一次进程调用拿全数据
      CollectWindows();
      Console.WriteLine("OK " + w.ToString() + "x" + h.ToString());
      Console.WriteLine(WindowsJson());
      return 0;
    } catch (Exception e) {
      Console.Error.WriteLine(e.Message);
      return 1;
    }
  }
}
`;
let gdiExePath = null;
let gdiCompileTried = false;

async function ensureGdiCapExe() {
  if (gdiExePath || gdiCompileTried) return gdiExePath;
  gdiCompileTried = true;
  if (process.platform !== 'win32') return null;
  try {
    const dir = path.join(app.getPath('userData'), 'bin');
    // v2：带窗口枚举（--win / 抓屏附窗口清单）。改名让老 exe 自动重编，
    // 不用用户手动清缓存。
    const exe = path.join(dir, 'yan-zhi-screencap-v2.exe');
    if (fs.existsSync(exe)) { gdiExePath = exe; return exe; }
    const csc = ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe', 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe']
      .find((p) => fs.existsSync(p));
    if (!csc) { snipLog('WARN no csc, gdi pipeline unavailable'); return null; }
    fs.mkdirSync(dir, { recursive: true });
    const srcPath = path.join(dir, 'screencap-v2.cs');
    fs.writeFileSync(srcPath, GDI_CAP_CS, 'utf8');
    await new Promise((resolve, reject) => {
      execFile(csc, ['/nologo', '/out:' + exe, '/r:System.Drawing.dll', srcPath], { timeout: 30000, windowsHide: true }, (err, so, se) => {
        if (err) reject(new Error((se || err.message || '').trim()));
        else resolve();
      });
    });
    gdiExePath = exe;
    snipLog('gdi helper compiled:', exe);
  } catch (e) {
    snipLog('WARN gdi helper compile failed:', e?.message || e);
  }
  return gdiExePath;
}

/** 把主进程的窗口枚举 JSON 行解析成对象数组（容错：解析失败返回 []） */
function parseWindowListLine(line) {
  try {
    const arr = JSON.parse(line);
    if (!Array.isArray(arr)) return [];
    return arr.filter((w) => w && typeof w.x === 'number' && typeof w.y === 'number'
      && typeof w.width === 'number' && typeof w.height === 'number');
  } catch { return []; }
}

/**
 * GDI 抓整个虚拟屏幕（物理像素），裁出目标显示器矩形；同时产出窗口清单。
 * 返回 { image, windows } 或 null。windows 为虚拟屏物理坐标（含跨屏窗口），
 * 由调用方换算到目标显示器的逻辑坐标系。
 */
async function captureViaGdi(targetDisplay) {
  try {
    const exe = await ensureGdiCapExe();
    if (!exe) return null;
    const out = path.join(app.getPath('temp'), 'yz-snip-' + Date.now() + '.png');
    const stdout = await new Promise((resolve, reject) => {
      execFile(exe, [out], { timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, so) => (err ? reject(err) : resolve(String(so || ''))));
    });
    let full = nativeImage.createFromPath(out);
    try { fs.unlinkSync(out); } catch {}
    if (full.isEmpty()) return null;
    // stdout 第二行 = 窗口清单 JSON（虚拟屏物理像素坐标）
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const winList = lines.length >= 2 ? parseWindowListLine(lines[1]) : [];
    const sf = targetDisplay.scaleFactor || 1;
    const size = full.getSize();
    const x = Math.max(0, Math.round(targetDisplay.bounds.x * sf));
    const y = Math.max(0, Math.round(targetDisplay.bounds.y * sf));
    const w = Math.min(size.width - x, Math.round(targetDisplay.bounds.width * sf));
    const h = Math.min(size.height - y, Math.round(targetDisplay.bounds.height * sf));
    const image = (w <= 0 || h <= 0) ? full : full.crop({ x, y, width: w, height: h });
    // 窗口矩形：虚拟屏物理坐标 → 目标显示器物理坐标 → 目标显示器逻辑坐标。
    // 框选窗是逻辑像素坐标系，页面直接拿这份数据画高亮即可，无需二次换算。
    const winRects = winList
      .map((win) => ({
        x: (win.x - x) / sf,
        y: (win.y - y) / sf,
        width: win.width / sf,
        height: win.height / sf,
        title: String(win.title || ''),
        hwnd: win.hwnd,
      }))
      // 完全不在目标显示器内的窗口对框选无意义，剔除（留 4px 余量避免边缘毛刺）
      .filter((win) => win.x + win.width > 4 && win.y + win.height > 4
        && win.x < targetDisplay.size.width - 4 && win.y < targetDisplay.size.height - 4)
      .map((win) => ({
        ...win,
        x: Math.max(0, win.x),
        y: Math.max(0, win.y),
        width: Math.min(win.width, targetDisplay.size.width - win.x),
        height: Math.min(win.height, targetDisplay.size.height - win.y),
      }))
      .filter((win) => win.width >= 12 && win.height >= 12);
    return { image, windows: winRects };
  } catch (e) {
    snipLog('WARN gdi capture failed:', e?.message || e);
    return null;
  }
}

/** 黑帧检测：部分显卡硬件加速下 desktopCapturer 返回全黑缩略图。5×5 采样 25 点全黑即判定 */
function isAllBlackImage(img) {
  try {
    const { width, height } = img.getSize();
    if (!width || !height) return true;
    const buf = img.toBitmap(); // BGRA
    const stride = Math.floor(buf.length / height);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const x = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / 5));
        const y = Math.min(height - 1, Math.floor(((gy + 0.5) * height) / 5));
        const o = y * stride + x * 4;
        if (buf[o] > 8 || buf[o + 1] > 8 || buf[o + 2] > 8) return false;
      }
    }
    return true;
  } catch {
    return false; // 采样失败不误判，放行走正常流程
  }
}

/** 收尾：关框选窗、还原主窗口、结算 invoke 的 Promise（幂等，重复调用无害） */
function finishSnip(result) {
  const s = snipSession;
  if (!s || s.settled) return;
  s.settled = true;
  snipSession = null;
  // 会话结束统一留痕：此前 confirm / cancel / blur 三条出口都不写日志，日志会断在
  // 「overlay shown」之后，无法区分「用户正常按 Esc」与「被 blur 误取消」。原因是
  // 排障时最该知道的信息，交给这一次调用兜底输出。
  try {
    const how = result && result.ok ? 'ok'
      : result && result.cancelled ? 'cancelled'
      : 'error';
    const detail = result && result.error ? ' (' + result.error + ')' : '';
    snipLog('finish: ' + how + detail);
  } catch {}
  try { if (s.timer) clearTimeout(s.timer); } catch {}
  try { if (s.readyTimer) clearTimeout(s.readyTimer); } catch {}
  try { if (s.composeTimer) clearTimeout(s.composeTimer); } catch {}
  // 框选窗不销毁只隐藏：销毁的话下次截图要重新 loadFile 冷启动 renderer（300ms+），
  // 复用后第二次截图页面上次的状态都还在，整体感接近微信。
  try { if (s.overlay && !s.overlay.isDestroyed() && s.overlay.isVisible()) s.overlay.hide(); } catch {}
  try { if (s.win && !s.win.isDestroyed() && !s.win.isVisible()) s.win.show(); } catch {}
  try { s.resolve(result); } catch {}
}

/** 常驻框选窗：首次创建后复用。返回已加载完页面的隐藏窗口 */
async function getOverlayWindow() {
  if (gSnipOverlay && !gSnipOverlay.isDestroyed()) return gSnipOverlay;
  const overlay = new BrowserWindow({
    x: -10000, y: -10000, width: 10, height: 10,
    frame: false, show: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    enableLargerThanScreen: true, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: true,
    // 透明窗：框选期间实时屏幕透过窗口可见，用户是「直接在屏幕上画框」，
    // 不再是「先抓一帧图、再在图上选」。抓屏推迟到确认/保存那一刻。
    transparent: true, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'snip-preload.cjs'),
      nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
    },
  });
  // 框选窗排障通道：页面 console / preload 加载失败 / 渲染进程崩溃 全部转发到主进程日志
  overlay.webContents.on('console-message', (...args) => {
    const ev = args[0];
    const msg = ev && typeof ev === 'object' && typeof ev.message === 'string' ? ev.message : args[2];
    snipLog('page>', msg);
  });
  overlay.webContents.on('preload-error', (_ev, pp, err) => snipLog('WARN preload error:', pp, String(err?.message || err)));
  overlay.webContents.on('render-process-gone', (_ev, d) => {
    snipLog('WARN renderer gone:', d?.reason);
    gSnipOverlay = null; // 崩溃后丢弃，下次重建
    finishSnip({ ok: false, error: '截图窗口崩溃（' + (d?.reason || 'unknown') + '）' });
  });
  await overlay.loadFile(path.join(__dirname, 'snip-overlay.html'));
  gSnipOverlay = overlay;
  snipLog('overlay created (persistent)');
  return overlay;
}
let gSnipOverlay = null;
let gLastFramePath = null;

ipcMain.handle('screenshot:capture', async (e, opts) => {
  // hideApp 由渲染层按设置传入；缺省/旧渲染层一律按隐藏处理（兼容行为不变）
  const hideApp = !(opts && opts.hideApp === false);
  snipLog('capture start, hideApp=' + hideApp);
  // 上一次会话还可能挂着（用户没确认也没取消就切回主窗口再次点按钮 / 再按一次快捷键）。
  // 这时把旧会话静默取消、直接开新的一次，而不是抛「已有截图会话进行中」把用户卡死——
  // 卡死后没有任何 UI 能清理它，只能重启应用。
  if (snipSession) finishSnip({ ok: false, cancelled: true });
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  try {
    // 0. 框选窗提前准备好：首次调用会冷启动 renderer（唯一的一次 300ms+），
    //    之后全程复用。预热与窗口隐藏并行，不占时序。
    const overlayP = getOverlayWindow();

    // 1. 隐藏主窗口（可关）。30ms 足够 DWM 把窗口摘掉。
    if (win && hideApp) win.hide();
    await sleepMs(30);

    // 2. 透明框选窗直接铺满光标所在显示器并亮出——实时屏幕透过窗口可见，
    //    框选体验是「在屏幕上画框」，没有任何「先截图再选图」的中间帧。
    const overlay = await overlayP;
    const targetDisplay = electronScreen.getDisplayNearestPoint(electronScreen.getCursorScreenPoint());
    const b = targetDisplay.bounds;
    try {
      overlay.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    } catch {}
    overlay.setAlwaysOnTop(true, 'screen-saver');
    let resolveFn;
    const p = new Promise((resolve) => { resolveFn = resolve; });
    snipSession = { sender: e.sender, win, display: targetDisplay, overlay, settled: false, armedAt: Date.now(), busy: false, resolve: resolveFn };
    // 焦点离开框选窗（用户切到别的软件/点了别的地方）即自动取消——对齐微信截图。
    // busy（合成/保存对话框进行中，窗口主动 hide）期间不取消。
    // armedAt 保护：窗口刚 show 的头 500ms 内系统可能先派发一次 blur，忽略以免尚未开始就被关掉。
    overlay.removeAllListeners('blur');
    overlay.on('blur', () => {
      const s = snipSession;
      const elapsed = s ? Date.now() - s.armedAt : -1;
      const guarded = elapsed <= 500;
      // 记录每次 blur 及距 show 的时长。blur 是「穿透 → 下层被激活 → 本窗失焦」这条
      // 故障链的必经点：穿透时 elapsed 通常远大于 500ms（用户是看清界面后才点的），
      // 据此可与「刚 show 就被系统抢焦点」的正常情况区分开。
      snipLog('overlay blur, elapsed=' + elapsed + 'ms' + (guarded ? ' (armed guard, ignored)' : ''));
      if (s && !s.busy && !guarded) finishSnip({ ok: false, cancelled: true });
    });
    // 终极兜底：极端情况下（进程收不到 closed/blur、用户跑开不回来）也能在 5 分钟后自愈，
    // 保证 snipSession 不会永久占位。
    snipSession.timer = setTimeout(() => {
      if (snipSession && snipSession.overlay === overlay) finishSnip({ ok: false, cancelled: true });
    }, 5 * 60 * 1000);
    // 通知页面重置为新会话；页面回报 ready（纯状态重置，无图可等，<10ms）后亮窗。
    overlay.webContents.send('snip:new-session');
    await new Promise((resolve) => {
      const s0 = snipSession;
      if (!s0 || s0.overlay !== overlay) return resolve();
      s0.readyTimer = setTimeout(() => {
        snipLog('WARN ready timeout, force show');
        resolve();
      }, 400);
      s0.onReady = () => resolve();
    });
    const s2 = snipSession;
    if (s2 && s2.overlay === overlay) {
      s2.armedAt = Date.now();
      try {
        overlay.show(); overlay.focus();
        // 个别 Windows 环境下 show 后焦点会被系统收回，补一次 webContents 级聚焦，
        // 保证键盘 Esc / Enter 一定生效。
        try { overlay.webContents.focus(); } catch {}
        snipLog('overlay shown');
      } catch (err) { snipLog('WARN show failed', String(err)); }
    }
    return await p;
  } catch (err) {
    finishSnip({ ok: false, error: '截图失败: ' + (err?.message || err) });
    return { ok: false, error: '截图失败: ' + (err?.message || err) };
  }
});

/** 抓一帧干净桌面（无遮罩入镜）：GDI 优先，失败退 desktopCapturer 重试 */
async function captureFrameClean(display) {
  const gdi = await captureViaGdi(display);
  if (gdi && !isAllBlackImage(gdi.image)) return { image: gdi.image, windows: gdi.windows || [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleepMs(attempt === 0 ? 0 : 300);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.ceil(display.size.width * display.scaleFactor),
        height: Math.ceil(display.size.height * display.scaleFactor),
      },
    });
    if (!sources.length) break;
    const source = sources.find((x) => String(x.display_id) === String(display.id))
      || sources.slice().sort((a, b2) => {
        const ta = a.thumbnail.getSize(), tb = b2.thumbnail.getSize();
        const ar = display.size.width / display.size.height;
        return Math.abs(ta.width / ta.height - ar) - Math.abs(tb.width / tb.height - ar);
      })[0];
    const img = source?.thumbnail;
    if (img && !img.isEmpty() && !isAllBlackImage(img)) return { image: img, windows: [] };
    if (img) saveBlackSample(img);
  }
  return null;
}

// 框选窗 hover 时的窗口清单刷新：框选过程中用户可能切了程序（Alt+Tab 后回来），
// 窗口位置变了。重新枚举一次（不抓屏，几十毫秒），保证高亮框跟着真实窗口走。
ipcMain.handle('snip:list-windows', async (e) => {
  const s = snipSession;
  if (!s || !s.overlay || e.sender !== s.overlay.webContents) return [];
  try {
    const exe = await ensureGdiCapExe();
    if (!exe) return [];
    const stdout = await new Promise((resolve, reject) => {
      execFile(exe, ['--win'], { timeout: 4000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, so) => (err ? reject(err) : resolve(String(so || ''))));
    });
    const line = stdout.split(/\r?\n/).filter(Boolean).pop() || '';
    const sf = s.display.scaleFactor || 1;
    const b = s.display.bounds;
    return parseWindowListLine(line)
      .map((win) => ({
        x: (win.x - b.x * sf) / sf,
        y: (win.y - b.y * sf) / sf,
        width: win.width / sf,
        height: win.height / sf,
        title: String(win.title || ''),
        hwnd: win.hwnd,
      }))
      .filter((win) => win.x + win.width > 4 && win.y + win.height > 4
        && win.x < s.display.size.width - 4 && win.y < s.display.size.height - 4)
      .map((win) => ({
        ...win,
        x: Math.max(0, win.x),
        y: Math.max(0, win.y),
        width: Math.min(win.width, s.display.size.width - win.x),
        height: Math.min(win.height, s.display.size.height - win.y),
      }))
      .filter((win) => win.width >= 12 && win.height >= 12);
  } catch (err) {
    snipLog('WARN list-windows failed:', err?.message || err);
    return [];
  }
});

// 页面状态重置完成 → 主进程亮窗（透明遮罩无图可等，重置 <10ms）。
// 附带一次补抢焦点：个别 Windows 环境下 show 后焦点会被系统收回，键盘 Esc/Enter 才能生效
ipcMain.on('snip:ready', (e) => {
  const s = snipSession;
  if (!s || !s.overlay || e.sender !== s.overlay.webContents) return;
  s.ready = true;
  try { if (s.readyTimer) clearTimeout(s.readyTimer); } catch {}
  try { if (s.onReady) { s.onReady(); s.onReady = null; } } catch {}
});

/**
 * 合成成品图：框选是实时屏幕（透明窗），确认/保存那一刻才抓干净帧——
 * 先 hide 框选窗（遮罩出画），等 DWM 一帧，再 GDI 抓屏，把全屏帧发给页面，
 * 由页面裁剪 + 重绘标注后回传 dataUrl。超时兜底直接给无标注裁剪图。
 */
function requestCompose(s, action, rect) {
  s.busy = true;               // hide 窗口会触发 blur，busy 期间 blur 不取消会话
  s.pendingAction = action;
  s.pendingRect = rect;
  try { s.overlay.hide(); } catch {}
  setTimeout(async () => {
    try {
      const cap = await captureFrameClean(s.display);
      if (!cap) {
        const msg = '屏幕画面捕获异常（全黑）。已把样本存到 logs/snip-black.png，请联系开发者排查';
        if (action === 'confirm') finishSnip({ ok: false, error: msg });
        else { s.busy = false; try { s.overlay.webContents.send('snip:save-result', { ok: false, error: msg }); } catch {} }
        return;
      }
      const framePath = path.join(app.getPath('temp'), 'yz-snip-frame-' + Date.now() + '.png');
      try { fs.writeFileSync(framePath, cap.image.toPNG()); } catch {}
      try { if (gLastFramePath && gLastFramePath !== framePath) { try { fs.unlinkSync(gLastFramePath); } catch {} } } catch {}
      gLastFramePath = framePath;
      const size = cap.image.getSize();
      const ratio = size.width / s.display.size.width;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const cx = clamp(Math.round(rect.x * ratio), 0, size.width - 1);
      const cy = clamp(Math.round(rect.y * ratio), 0, size.height - 1);
      const cw = clamp(Math.round(rect.width * ratio), 1, size.width - cx);
      const ch = clamp(Math.round(rect.height * ratio), 1, size.height - cy);
      s.cropRect = { x: cx, y: cy, w: cw, h: ch };
      s.composeTimer = setTimeout(() => {
        // 页面合成超时兜底：直接交无标注裁剪图
        snipLog('WARN compose timeout, fallback to raw crop');
        const c = cap.image.crop({ x: cx, y: cy, width: cw, height: ch });
        onComposed(s, action, c.toDataURL());
      }, 2000);
      s.composeImage = cap.image;
      try {
        s.overlay.webContents.send('snip:compose', {
          action,
          frameUrl: 'file:///' + encodeURI(framePath.replace(/\\/g, '/')),
          x: cx, y: cy, w: cw, h: ch,
        });
      } catch {}
    } catch (err) {
      const msg = '截图失败: ' + (err?.message || err);
      if (action === 'confirm') finishSnip({ ok: false, error: msg });
      else { s.busy = false; try { s.overlay.webContents.send('snip:save-result', { ok: false, error: msg }); } catch {} }
    }
  }, 90); // hide 后等 DWM 把窗口从合成树摘掉
}

/** 成品图就绪：confirm 结算会话；save 弹保存框后恢复框选窗继续编辑 */
function onComposed(s, action, dataUrl) {
  try { if (s.composeTimer) { clearTimeout(s.composeTimer); s.composeTimer = null; } } catch {}
  if (action === 'confirm') {
    finishSnip({ ok: true, dataUrl, width: s.cropRect.w, height: s.cropRect.h });
    return;
  }
  (async () => {
    try {
      const ts = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `截图_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
      let pictures = '';
      try { pictures = app.getPath('pictures'); } catch { pictures = app.getPath('userData'); }
      const r = await dialog.showSaveDialog({
        title: '保存截图',
        defaultPath: path.join(pictures || app.getPath('userData'), name),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      });
      let result;
      if (r.canceled || !r.filePath) result = { ok: false, cancelled: true };
      else {
        await fsp.writeFile(r.filePath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
        snipLog('saved to', r.filePath);
        result = { ok: true, path: r.filePath };
      }
      s.busy = false;
      try { s.overlay.webContents.send('snip:save-result', result); } catch {}
      // 恢复框选窗继续编辑（标注/选区都在）
      try { s.overlay.show(); s.overlay.focus(); } catch {}
    } catch (err) {
      s.busy = false;
      try { s.overlay.webContents.send('snip:save-result', { ok: false, error: String(err?.message || err) }); } catch {}
      try { s.overlay.show(); s.overlay.focus(); } catch {}
    }
  })();
}

// 确认选区：rect 为框选窗逻辑像素，抓屏裁剪与标注合成走 requestCompose
ipcMain.on('snip:confirm', (e, rect) => {
  const s = snipSession;
  if (!s || !s.overlay || e.sender !== s.overlay.webContents) return;
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
  requestCompose(s, 'confirm', rect);
});

ipcMain.on('snip:cancel', (e) => {
  const s = snipSession;
  if (s && s.overlay && e.sender === s.overlay.webContents) finishSnip({ ok: false, cancelled: true });
});

// 「保存到本地」：同样走合成管线拿成品图，保存后框选窗恢复，可继续编辑
ipcMain.on('snip:save-request', (e, rect) => {
  const s = snipSession;
  if (!s || !s.overlay || e.sender !== s.overlay.webContents) return;
  const r = rect && rect.width > 0 && rect.height > 0
    ? rect
    : { x: 0, y: 0, width: s.display.size.width, height: s.display.size.height };
  requestCompose(s, 'save', r);
});

// 页面合成完成回传
ipcMain.on('snip:composed', (e, payload) => {
  const s = snipSession;
  if (!s || e.sender !== s.overlay.webContents || !s.pendingAction) return;
  const action = s.pendingAction;
  s.pendingAction = null;
  const dataUrl = payload && payload.dataUrl;
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png')) {
    onComposed(s, action, dataUrl);
  }
  // dataUrl 无效时静默：composeTimer 超时兜底会交无标注裁剪图
});

// ============================================================
// 截图全局快捷键
// 为什么必须有：截图是"在外面看到什么东西想发给智能体"的动作，此时 yan-zhi 多半
// 不在前台（用户正在看钉钉/Excel/浏览器）。globalShortcut 由系统层面注册，任意应用
// 在前台都能触发；触发后先还原主窗口（可能最小化/隐藏）再通知渲染层走同一条框选流程。
// ============================================================
const DEFAULT_SHOT_ACCEL = 'Control+Alt+A';
let shotAccel = null;

/** 热键实际动作：把主窗口拉回前台，再通知渲染层开始框选 */
function triggerScreenshotHotkey() {
  if (snipSession) return; // 已在框选中，忽略重复按下
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (!win) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    // 留一帧让窗口完成显示/聚焦，紧接着的 hide+抓屏才不会截到半透明过渡态
    setTimeout(() => {
      try { win.webContents.send('shortcut:screenshot'); } catch {}
    }, 80);
  } catch {}
}

/**
 * 注册（或重注册）截图热键；传空串表示禁用。
 * 返回 { ok, accelerator, error? } —— 注册失败几乎都是被系统或其它应用占用，
 * 需要把原因回传渲染层提示用户换一个，而不是静默失效。
 */
function setScreenshotHotkey(accel) {
  try { if (shotAccel) { globalShortcut.unregister(shotAccel); shotAccel = null; } } catch {}
  const target = String(accel || '').trim();
  if (!target) {
    console.log('[hotkey] 截图快捷键已禁用');
    return { ok: true, accelerator: '', disabled: true };
  }
  try {
    const okReg = globalShortcut.register(target, () => triggerScreenshotHotkey());
    if (!okReg) {
      console.warn('[hotkey] 截图快捷键注册失败（已被占用）:', target);
      return { ok: false, accelerator: target, error: '快捷键已被系统或其它应用占用，请换一个组合' };
    }
    shotAccel = target;
    console.log('[hotkey] 已注册截图快捷键 ' + target);
    return { ok: true, accelerator: target };
  } catch (err) {
    return { ok: false, accelerator: target, error: String(err?.message || err) };
  }
}

// 渲染层主动清理：截图界面上任何入口在开始新一次截图前先调一次，
// 保证上一次残留的会话不会把自己挡在门外（同样的判重在 screenshot:capture 入口也有，
// 双层保险：一层给未升级的主进程，一层给从别处发起的调用）。
ipcMain.handle('screenshot:cancel', () => {
  if (!snipSession) return { ok: true, cancelled: false };
  finishSnip({ ok: false, cancelled: true });
  return { ok: true, cancelled: true };
});

ipcMain.handle('shortcut:getScreenshot', () => ({ accelerator: shotAccel || '' }));
ipcMain.handle('shortcut:setScreenshot', (_e, accel) => setScreenshotHotkey(accel));


// ============================================================
// 应用启动
// ============================================================

// CDP 统一架构：开启远程调试端口，后端 Playwright 通过 CDP 连接到 Electron BrowserView，
// 所有 browser_ 工具操作同一个浏览器实例，预览面板就是这个 BrowserView（与豆包 CNGC Browser Use 架构一致）。
// 端口可通过环境变量 YANZHI_CDP_PORT 显式指定；默认用 0 让 Chromium 自动挑空闲端口，
// 实际端口写入 userData/DevToolsActivePort 文件（resolveCdpEndpoint 读它）。
// ★ 背景（2026-10-06 小说推文 ch05 排障）：固定 9222 被其它/残留进程占用时，Chromium
//   绑定失败**静默继续**，服务端 connectOverCDP 表现为 ECONNREFUSED/502 且重连全败 ——
//   自动选端口从根上消除抢占。
const CDP_PORT_EXPLICIT = process.env.YANZHI_CDP_PORT || '';
let CDP_PORT = CDP_PORT_EXPLICIT || '0';
let CDP_ENDPOINT = CDP_PORT_EXPLICIT ? 'http://127.0.0.1:' + CDP_PORT_EXPLICIT : '';
app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT);
console.log(`[cdp] 远程调试端口: ${CDP_PORT_EXPLICIT ? '固定 ' + CDP_PORT_EXPLICIT : '自动分配(DevToolsActivePort)'}`);

/** 同步休眠（仅启动期短等待用） */
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* 忽略 */ }
}

/** 解析实际 CDP 端点：显式指定直接用；自动模式下读 userData/DevToolsActivePort 首行。
 *  Chromium 就绪后立即写该文件，ready 触发时通常已存在；给最多 ~4s 兜底重试。 */
function resolveCdpEndpoint() {
  if (CDP_ENDPOINT) return CDP_ENDPOINT;
  const file = path.join(app.getPath('userData'), 'DevToolsActivePort');
  for (let i = 0; i < 20; i++) {
    try {
      const firstLine = parseInt(fs.readFileSync(file, 'utf8').split(/\r?\n/)[0], 10);
      if (firstLine > 0 && firstLine < 65536) {
        CDP_PORT = String(firstLine);
        CDP_ENDPOINT = 'http://127.0.0.1:' + CDP_PORT;
        console.log(`[cdp] 实际调试端口(DevToolsActivePort): ${CDP_ENDPOINT}`);
        return CDP_ENDPOINT;
      }
    } catch { /* 文件未就绪，稍候重试 */ }
    sleepSync(200);
  }
  console.warn('[cdp] 未能读取 DevToolsActivePort，浏览器工具可能不可用（CDP 未就绪）');
  return CDP_ENDPOINT || 'http://127.0.0.1:9222';
}

// Windows 下禁用原生窗口遮挡计算：窗口最小化/隐藏后，Chromium 会把 BrowserView 的
// webContents 标记为「被完全遮挡」而停止产出新帧；恢复显示后合成器偶发不重新绘制，
// 表现为预览面板全黑（GPU 合成层残留）。关掉该特性可从根上规避。
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

// 单实例锁：确保**同一实例**同一时间只有一个进程，避免安装新版本后旧进程残留导致数据冲突。
//
// ★ 锁是按 userData 路径取的 —— 而 userData 已按实例隔离（yan-zhi / yan-zhi-dev），
//   所以「安装版」与「开发版」**互不抢锁，可同时运行**；只有同一实例重复双击才会被挡。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[single-instance] 已有实例在运行，退出当前实例');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 第二个实例启动时，激活当前实例的窗口
    console.log('[single-instance] 检测到第二个实例启动，激活当前窗口');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);  // 移除默认菜单栏
  if (process.platform === 'win32') {
    // ★ Windows 任务栏图标（2026-10-05 定案）：任务栏按钮图标 = **窗口 icon**（WM_SETICON）。
    //   千万不要给 dev 设自定义 AUMID —— 自定义 AUMID 没有开始菜单快捷方式时，Explorer
    //   会放弃窗口 icon 改用 exe 默认图标（electron 黑底原子标），这正是"dev 任务栏默认
    //   图标"的根因；注册表 IconPath/换哈希 AUMID 都救不回来，已实测证伪。
    //   分组语义：dev 跑在 electron.exe、安装版是 yan-zhi.exe，exe 路径不同本就不会并组；
    //   仅同 exe 双 dev 实例才会并组（罕见，可接受）。安装版保持 setAppUserModelId。
    if (!IS_DEV_INSTANCE) {
      app.setAppUserModelId('com.yanzhi.desktop');
    }
    // ★ dev 下所有新开窗口（DevTools/悬浮窗等）都自动设置图标（2026-10-06）：
    //   DevTools 窗口没有 icon，与主窗口同组时会把任务栏组图标拖成 exe 默认
    //   （实测：关 DevTools 图标即恢复）。统一在窗口创建时补 icon，一劳永逸。
    if (IS_DEV_INSTANCE) {
      app.on('browser-window-created', (_e, win) => {
        try {
          const p = getAppIconPath();
          if (fs.existsSync(p)) win.setIcon(p);
        } catch { /* 观感问题不阻塞 */ }
      });
    }
  }

  // ============================================================
  // UA 伪装：去掉 Electron 标识与应用名，输出标准 Chrome UA。
  // 百度/淘宝等站点对 Electron 默认 UA 风控严格（高频弹验证码）。
  // BrowserView 使用独立 persist:browser-view partition，两个 session 都要设。
  // ============================================================
  (function disguiseUserAgent() {
    try {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ua = session.defaultSession.getUserAgent()
        .replace(new RegExp('\\s*Electron\\/[\\d.]+', 'g'), '')
        .replace(new RegExp('\\s*' + esc(app.getName()) + '\\/[\\d.]+', 'g'), '');
      const cleanUA = ua.replace(/\s{2,}/g, ' ').trim();
      session.defaultSession.setUserAgent(cleanUA);
      session.fromPartition('persist:browser-view').setUserAgent(cleanUA);
    } catch { /* ignore */ }
  })();

  // webview 引擎：网页 window.open / target=_blank / 中键新开 ——
  // 在 partition 上统一拦截（webview 元素事件无法可靠阻止弹窗），转成应用内新标签页，
  // 不让它逃逸成独立系统窗口。BrowserView 引擎走各自的 setWindowOpenHandler，不受影响。
  (function interceptWebviewPopups() {
    try {
      session.fromPartition('persist:browser-view').setWindowOpenHandler(({ url }) => {
        broadcastOpenTab(url);
        return { action: 'deny' };
      });
    } catch { /* ignore */ }
  })();

  // ============================================================
  // Content-Security-Policy：注入到主窗口所在 session 的响应头
  // BrowserView 使用独立 partition（'browser-view'），不受此 CSP 影响，可正常加载第三方网页
  // 不含 'unsafe-eval'/'unsafe-inline'(script)：消除 Electron Insecure CSP 安全警告
  // ============================================================
  const forceDev = process.argv.includes('--dev');
  const isDev = forceDev && !app.isPackaged;
  // ★ connect-src 必须放行**本实例实际端口**（2026-10-10 起 dev/生产同为 3001；
  //   若用 YANZHI_API_PORT 临时错开则自动跟随 API_PORT），
  //   写死端口会让实例的所有 fetch 被 CSP 拦掉（表现为"界面正常但全功能 403/失败"）。
  //
  // ★★ 2026-10-16 补：**ws: 必须单独放行** —— CSP 的 `http:`/`https:` 源**不匹配** `ws://`，
  //   只写 http 源等于把所有 WebSocket 都拦了。实测代价：运维终端连不上 WS，
  //   控制台刷 `Connecting to 'ws://127.0.0.1:3001/api/plugin/ops-shell/term/ws...' violates
  //   the following Content Security Policy directive` 并**静默降级成 SSE**
  //   （功能还能用，所以只表现为"偶发连不上 WS"，极难归因）。插件 WS 与终端/日志流同端口。
  const wsOrigins = `ws://127.0.0.1:${API_PORT} ws://localhost:${API_PORT}`;
  const csp = isDev
    ? "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https: http:; " +
      "media-src 'self' blob: data: https: http:; " +
      "font-src 'self' data:; " +
      `connect-src 'self' ws://localhost:1420 wss://localhost:1420 ${wsOrigins} ${API_ORIGIN} http://localhost:${API_PORT} https: http:;`
    : "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https: http:; " +
      "media-src 'self' blob: data: https: http:; " +
      "font-src 'self' data:; " +
      `connect-src 'self' ${wsOrigins} ${API_ORIGIN} http://localhost:${API_PORT} https: http:;`;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // 预初始化数据库，避免首次 IPC 调用时阻塞过久
  try {
    getDb();
  } catch (err) {
    console.error('数据库初始化失败:', err);
  }
  cleanupLegacyDiagAgent();
  // ★★★ 浏览器桥必须在 startServer() **之前**启动并 await（「执行面直连化」P0-3）：
  //   startServer 会 spawn 后端并把 `envForServer()` 的 URL/token 注入子进程 env ——
  //   桥没起就没有端口/token，注入为空 ⇒ 服务端 `browserBridgeAvailable()` 为 false，
  //   静默退回 SSE 委托（不报错，但直连没生效）。顺序错了是**静默失效**，故显式注释钉住。
  //   ★ 必须 **await**：`server.listen()` 是异步的，不等就取 envForServer() 会拿到空 url/token
  //     （真跑测试实测抓到的缺陷）→ 同样是静默失效。
  await browserBridge.start();
  startServer();

  // computer-use 急停热键：Ctrl+Alt+Esc → 通知后端 panic（冻结输入工具并禁用插件）。
  // 插件未启用时后端返回 404，静默忽略；请求失败也不影响本进程。
  try {
    const ok = globalShortcut.register('Control+Alt+Escape', () => {
      const req = http.request(API_ORIGIN + '/api/plugin/computer-use/panic', { method: 'POST', timeout: 3000 }, (res) => {
        res.resume();
      });
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
      req.end();
      console.log('[panic] 急停热键触发');
    });
    if (ok) console.log('[panic] 已注册急停热键 Ctrl+Alt+Esc');
  } catch (e) {
    console.warn('[panic] 急停热键注册失败:', e);
  }

  // 截图热键：先按内置默认值占坑；渲染层读到本地设置后会用保存过的组合重注册一次
  // （默认组合被占用时静默降级为"未注册"，由设置页显示冲突让用户改）
  setScreenshotHotkey(DEFAULT_SHOT_ACCEL);

  // 健康检查：轮询后端 /api/health，就绪后创建窗口（替代固定 1.5s 延迟）。
  // ★★★ 2026-10-12 改造：启动即显示 splash 加载壳；
  //   ① 超时**不再强制 createWindow**（旧逻辑把必然白屏/拒连的窗口丢给用户），
  //      改为 splash 显示「启动失败」态（见 server.log）；
  //   ② dev 模式额外等 Vite(1420) 就绪 —— Vite 未起时建主窗同样白屏。
  const viteOrigin = 'http://localhost:1420';
  const checkVite = (retries, onReady) => {
    const req = http.get(viteOrigin, (res) => {
      res.resume();
      onReady();
    });
    req.on('error', () => setTimeout(() => checkVite(retries + 1, onReady), 500));
    req.setTimeout(2000, () => { req.destroy(); setTimeout(() => checkVite(retries + 1, onReady), 500); });
  };
  const onBackendReady = () => {
    console.log('[后端] 健康检查通过');
    if (process.argv.includes('--dev') && !app.isPackaged) {
      checkVite(0, () => {
        console.log('[vite] dev server 就绪，创建窗口');
        createWindow();
      });
    } else {
      createWindow();
    }
  };
  const startedAt = Date.now();
  const checkHealth = (retries = 0) => {
    if (Date.now() - startedAt >= SPLASH_HEALTH_TIMEOUT_MS) {
      console.error('[后端] 启动超时（120 秒），不创建主窗，splash 显示失败态');
      try { fs.appendFileSync(path.join(app.getPath('userData'), 'server.log'), `[${new Date().toLocaleString('zh-CN', { hour12: false })}] [后端] 120 秒健康检查超时，后端未就绪（大概率后端启动失败，见上方日志）；主窗未创建，请在 splash 结束后重启应用\n`); } catch {}
      pushSplashUpdate({
        failed: true,
        caption: '启动失败：后端服务未能在 120 秒内就绪。\n请查看日志后重启应用。\n' + path.join(app.getPath('userData'), 'server.log'),
      });
      return;
    }
    // 每 10 次重试（约 5 秒）刷新一次等待文案，避免用户面对静止画面
    if (retries > 0 && retries % 10 === 0) {
      const sec = Math.round((Date.now() - startedAt) / 1000);
      pushSplashUpdate({ caption: `正在启动后端服务…（已等待 ${sec} 秒）` });
    }
    const req = http.get(API_ORIGIN + '/api/health', (res) => {
      res.resume();
      if (res.statusCode === 200) {
        onBackendReady();
      } else {
        setTimeout(() => checkHealth(retries + 1), 500);
      }
    });
    req.on('error', () => setTimeout(() => checkHealth(retries + 1), 500));
    req.setTimeout(2000, () => { req.destroy(); setTimeout(() => checkHealth(retries + 1), 500); });
  };
  createSplashWindow();
  setTimeout(checkHealth, 300);

  // 创建系统托盘图标（关闭窗口时后端保持守护运行，通过托盘退出）
  const createTray = () => {
    const iconPath = getAppIconPath();
    if (!fs.existsSync(iconPath)) return;
    tray = new Tray(iconPath);
    // 托盘提示带实例标识 —— 两个实例可同时运行，不能让用户分不清哪个是哪个
    tray.setToolTip(IS_DEV_INSTANCE ? `言智（开发实例 · 端口 ${API_PORT}）` : '言智');
    const updateTrayMenu = () => {
      const menu = Menu.buildFromTemplate([
        {
          label: mainWindow && mainWindow.isVisible() ? '隐藏主窗口' : '显示主窗口',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isVisible()) { mainWindow.hide(); }
              else { mainWindow.show(); mainWindow.focus(); }
            } else {
              createWindow();
            }
          },
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => { isQuitting = true; app.quit(); },
        },
      ]);
      tray.setContextMenu(menu);
    };
    updateTrayMenu();
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) { mainWindow.hide(); }
        else { mainWindow.show(); mainWindow.focus(); }
      } else {
        createWindow();
      }
    });
    // 窗口可见性变化时更新菜单
    if (mainWindow) {
      mainWindow.on('show', updateTrayMenu);
      mainWindow.on('hide', updateTrayMenu);
    }
  };
  createTray();
});

app.on('window-all-closed', () => {
  // 守护模式：关闭窗口不杀后端，用户通过托盘退出
  if (!isQuitting && process.platform === 'darwin') {
    // macOS: 不做任何事，应用保持活跃
  } else if (!isQuitting) {
    // Windows/Linux: 窗口已关闭但后端保持运行，用户可通过托盘重新打开
  }
});

// 真正退出时清理后端 + MCP + 数据库
app.on('before-quit', () => {
  isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch {}
  try { browserBridge.close(); } catch { /* 端口自动分配，异常退出也无需处理残留 */ }
  if (serverProcess) { try { serverProcess.kill('SIGTERM'); } catch {} serverProcess = null; }
  for (const [id, entry] of mcpChildren) {
    try { entry.child.kill('SIGTERM'); } catch {}
  }
  mcpChildren.clear();
  if (db) {
    try { db.close(); } catch {}
    db = null;
  }
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
