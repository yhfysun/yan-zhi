const { app, BrowserWindow, BrowserView, webContents, dialog, ipcMain, Menu, session, shell, clipboard, Tray, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const http = require('http');

let mainWindow = null;

// ============================================================
// userData 目录固定与历史数据迁移（productName 言智 → yan-zhi 配套）
// db / keyring / models / server-data 全存在 Electron 默认 userData
// （%APPDATA%\<productName>）下，productName 改名后默认目录随之变化。
// 这里显式固定为 %APPDATA%\yan-zhi，首次启动时把历史目录整体搬入，
// 避免升级后数据库、本地模型"全丢"。必须在 ready 前执行。
// ============================================================
(function migrateUserDataDir() {
  const userDataRoot = path.join(app.getPath('appData'), 'yan-zhi');
  const legacyCandidates = [
    path.join(app.getPath('appData'), '言智'),                 // 0.1.x（productName=言智）
    path.join(app.getPath('appData'), '@yan-zhi', 'desktop'), // 更早（包名 fallback）
    path.join(app.getPath('appData'), '@yan-zhidesktop'),     // 更早变体
  ];
  if (!fs.existsSync(userDataRoot)) {
    const legacy = legacyCandidates.find((p) => fs.existsSync(p));
    if (legacy) {
      // 同盘 rename 瞬时完成；失败（跨盘/占用）退化为递归复制
      try { fs.renameSync(legacy, userDataRoot); }
      catch { try { fs.cpSync(legacy, userDataRoot, { recursive: true }); } catch {} }
    }
  }
  app.setPath('userData', userDataRoot);
})();

let serverProcess = null;
let tray = null;
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
/** 等待渲染层注册 guest（<webview> 创建需要一帧） */
async function waitForGuest(tabId, timeoutMs = 5000) {
  if (!tabId) return null;
  const started = Date.now();
  for (;;) {
    const wc = guestWebContents(tabId);
    if (wc) return wc;
    if (Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 100));
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

// ============================================================
// Keyring（JSON 文件存储，主进程单例缓存）
// ============================================================
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
 *  现统一放 userData/server-data，并把旧位置的数据一次性迁移过来。 */
function ensureServerDataDir() {
  if (!app.isPackaged) return null;
  const dataDir = path.join(app.getPath('userData'), 'server-data');
  fs.mkdirSync(dataDir, { recursive: true });
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
  return dataDir;
}

function startServer() {
  const serverDir = path.join(__dirname, '..', 'server');
  // 模型目录统一放在 Electron userData/models，商城下载/引擎加载都从这里找
  const modelsDir = path.join(app.getPath('userData'), 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
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
    const tsxPath = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(tsxPath)) {
      console.log('[后端] 用 Electron Node.js + tsx 启动:', tsxPath);
      serverProcess = spawn(process.execPath, [tsxPath, 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: 'http://127.0.0.1:' + CDP_PORT, WEB_DIST: path.join(__dirname, '..', '..', 'apps', 'web', 'dist') },
      });
    } else {
      // 回退：npx tsx（可能 ABI 不兼容，但至少能启动）
      console.warn('[后端] tsx CLI 未找到，回退到 npx tsx（可能 ABI 不兼容）');
      serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: 'http://127.0.0.1:' + CDP_PORT, WEB_DIST: path.join(__dirname, '..', '..', 'apps', 'web', 'dist') },
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
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', YANZHI_MODELS_DIR: modelsDir, BROWSER_MODE: 'cdp', CDP_ENDPOINT: 'http://127.0.0.1:' + CDP_PORT, WEB_DIST: path.join(process.resourcesPath, 'server', 'web-dist'), ...(dataDir ? { DATA_DIR: dataDir } : {}) },
    });
    serverProcess.stdout.on('data', (d) => logStream.write(d));
    serverProcess.stderr.on('data', (d) => logStream.write(d));
    serverProcess.on('error', (err) => { logStream.write(`[${stamp()}] 后端进程启动失败: ${err.stack || err}\n`); console.error('后端启动失败:', err); });
    serverProcess.on('exit', (code) => logStream.write(`\n===== [${stamp()}] 后端退出 code=${code} =====\n`));
    console.log('后端服务器启动中:', serverPath);
  }
}

/** 获取应用图标路径（开发/打包两套目录） */
function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
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
    },
  });

  // 页面首屏渲染完成后再显示窗口，配合 show:false 彻底消除黑屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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
    if (/^https?:\/\//i.test(url) && !(selfOrigin && url.startsWith(selfOrigin))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    console.log('[nav] will-navigate:', url, '| from:', current);
    if (!/^https?:\/\//i.test(url) || url === current) return;
    // dev 同源 = 应用自身，放行留在应用内（阻止被误判为外链）
    if (selfOrigin && url.startsWith(selfOrigin)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // webview 引擎：guest 安全加固 —— 无论渲染层怎么声明，guest 一律无 node 集成 + 上下文隔离 +
  // 不加载任何 preload。外部网页永远拿不到 Node 能力与本地文件访问。
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegrationInWorker = false;
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
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
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    const template = [
      { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
      { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
      { type: 'separator' },
      { label: '全选', role: 'selectAll' },
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
      const t = e.lastActiveAt || 0;
      if (t < lruAt) { lruAt = t; lruId = id; }
    }
    if (!lruId) break; // 只剩当前激活 tab，无处可逐
    console.log('[browserView] LRU 逐出挂起:', lruId);
    suspendBrowserViewEntry(lruId, browserViews.get(lruId));
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
      if (now - (e.lastActiveAt || 0) > TAB_IDLE_UNLOAD_MS) {
        console.log('[browserView] 空闲卸载挂起:', id, e.url || '');
        suspendBrowserViewEntry(id, e);
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
// ============================================================
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() || false);

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
// webview 引擎的 popup 重定向：给 guest 自身的 webContents 设 windowOpenHandler。
// session 级 handler 拦不住 webview+allowpopups 转到二级 popup BrowserWindow 的逃逸；
// 在每个 guest 宿主 wc 上设，才能把 window.open / target=_blank 统一重定向回【应用内新标签页】。
function setupGuestPopupRedirect(wc) {
  if (!wc || wc.__yzPopupWired) return;
  wc.__yzPopupWired = true;
  wc.setWindowOpenHandler(({ url }) => {
    // 弹窗一律转为应用内新标签页：重定向到当前所属容器的 BrowserView 面板新建 tab
    if (url && /^https?:/i.test(url) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:wv:openTab', url);
    }
    return { action: 'deny' };
  });
}

// 拦截网页通过 window 创建的真正二级窗口（session/guest handler 未覆盖的边缘路径），
// 绝不放开独立系统 BrowserWindow —— 全部 deny 并重定向回主窗口广播应用内新标签。
app.on('web-contents-created', (_e, contents) => {
  if (!isWebviewEngine()) return;               // 仅 webview 引擎启用；旧 BrowserView 走各自逻辑
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
  // 给这个 guest 宿主 wc 挂弹窗重定向（window.open/target=_blank → 应用内新标签页）
  try {
    const wc = webContents.fromId(wcId);
    setupGuestPopupRedirect(wc);
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
let tabSeq = 0;
ipcMain.handle('browserView:createTab', (_e, scope) => {
  const newTabId = 'tab-' + (++tabSeq);
  if (isWebviewEngine()) {
    // webview 模式：只分配 tabId 与空间归属，guest 由渲染层 <webview> 元素创建后注册
    webviewTabs.set(newTabId, { scope: scope || 'preview', lastActiveAt: Date.now(), wcId: null });
    if (!activeTabId) activeTabId = newTabId;
    return newTabId;
  }
  // R4：超限先按 LRU 挂起最久未激活的 tab（壳保留、激活复活），再新建，
  // 保证同时存活的 webContents ≤ MAX_TABS
  evictLruTabIfNeeded();
  const tabId = 'tab-' + (++tabSeq);
  ensureBrowserView(tabId);
  const entry = browserViews.get(tabId);
  if (entry) entry.scope = scope || 'preview';
  return tabId;
});

// 关闭标签页，销毁对应 BrowserView
// fromUi=true 表示 UI 路径（渲染层会自行顶替相邻 tab，主进程不顶替不广播，避免双顶替抖动）；
// 非 UI 路径（pageAgent 工具 / 页面 window.close）没有渲染层参与，主进程必须在这里收口。
ipcMain.handle('browserView:closeTab', (_e, tabId, fromUi) => {
  if (isWebviewEngine()) {
    const meta = webviewTabs.get(tabId);
    const closedScope = meta?.scope || 'preview';
    webviewTabs.delete(tabId);
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
    const tabId = 'tab-' + (++tabSeq);
    webviewTabs.set(tabId, { scope: wantScope, lastActiveAt: Date.now(), wcId: null });
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
        const { index, selector, text } = args;
        if (!text) return { ok: false, error: 'text is required' };
        let targetEl = null;
        if (index != null) {
          targetEl = await wc.executeJavaScript(`document.querySelector('[data-yz-index="${index}"]') ? true : false`);
        }
        if (targetEl || selector) {
          const sel = index != null ? `[data-yz-index="${index}"]` : selector;
          await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (!el) return;
              el.focus();
              el.value = '';
            })();
          `).catch(() => {});
        }
        // 用 insertText 输入（比 type 更可靠）
        for (const ch of String(text)) {
          wc.sendInputEvent({ type: 'char', keyCode: ch });
        }
        return { ok: true };
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
      if(label){b.style.display='';b.textContent=label;b.style.left=x+'px';b.style.top=y+'px';}else{b.style.display='none';}}
    function hideCursor(){c.style.display='none';b.style.display='none';}
    function clickAt(x,y){c.style.display='';c.style.left=x+'px';c.style.top=y+'px';c.classList.add('clicking');
      r.style.display='';r.style.left=x+'px';r.style.top=y+'px';r.classList.remove('active');void r.offsetWidth;r.classList.add('active');
      setTimeout(function(){c.classList.remove('clicking');},200);
      var el=document.elementFromPoint(x,y);if(el){var o={bubbles:true,cancelable:true,clientX:x,clientY:y,view:window};
        el.dispatchEvent(new MouseEvent('mousemove',o));el.dispatchEvent(new MouseEvent('mousedown',o));
        el.dispatchEvent(new MouseEvent('mouseup',o));el.dispatchEvent(new MouseEvent('click',o));}return el?el.tagName+'.'+(el.className||''):null;}
    function typeIn(el,text){el.focus();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));
      for(var i=0;i<text.length;i++){el.value+=text[i];el.dispatchEvent(new Event('input',{bubbles:true}));}
      el.dispatchEvent(new Event('change',{bubbles:true}));}
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
    window.__yzAssistant={showCursor:showCursor,hideCursor:hideCursor,clickAt:clickAt,typeIn:typeIn,resolve:resolve,resolveAll:resolveAll,genSel:genSel,register:register};
  })()`);
}

// 通用 action handler
// 变化检测：这些 action 可能改变页面状态，执行后对比前后快照，防止模型盲操作死循环
const CHANGE_ACTIONS = new Set(['click', 'type', 'press', 'select_option', 'check', 'uncheck', 'submit_form', 'search', 'next_page', 'prev_page']);
let noChangeStreak = 0;
const STATE_SNAPSHOT_JS = `(function(){try{var d=document.body;return{url:location.href,t:(d?d.innerText:'').slice(0,2000),n:document.querySelectorAll('a,button,input,select,textarea').length};}catch(e){return null;}})()`;

ipcMain.handle('browserView:action', async (_e, tabId, action, args) => {
  args = args || {};
  const entry = tabId ? browserViews.get(tabId) : (activeTabId ? browserViews.get(activeTabId) : null);
  let wc = null;
  if (isWebviewEngine()) {
    // webview 引擎：guest 由渲染层 <webview> 承载，fromId 拿到后复用下面全部 action 实现
    wc = await waitForGuest(tabId || activeTabId, 3000);
    // navigate 是特例：面板停在"浏览器首页/主页"（无任何已导航页）时还没有 <webview>、
    // guest 自然不存在。此时不能直接报"未打开"——应先让渲染层在该 scope 打开目标页并建出
    // <webview>（:src=url → dom-ready → 注册 guest），再等 guest 出现后继续导航。
    if (!wc && action === 'navigate' && args.url) {
      const scopeMeta = (activeTabId ? webviewTabs.get(activeTabId) : null);
      const scope = (scopeMeta && scopeMeta.scope) || 'preview';
      const cleanUrl = String(args.url || '').trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
      // 广播给渲染层：匹配 scope 的浏览器面板把此 URL 作为当前页打开（复用 openSite 通道）
      try { mainWindow.webContents.send('browser:wv:forceOpen', cleanUrl, scope); } catch { /* ignore */ }
      // 给渲染层建 <webview>(dom-ready)+注册 guest 的时间
      wc = await waitForGuest(tabId || activeTabId, 8000);
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

    const doAction = async () => {
    switch (action) {
      case 'navigate': {
        // URL 清洗：剥离模型以 markdown 反引号/引号包裹传来的格式字符
        let cleanUrl = String(args.url || '').trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
        if (!/^https?:\/\//i.test(cleanUrl)) return { error: `无效 URL: ${cleanUrl}` };
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
        await Promise.race([
          wc.loadURL(cleanUrl).catch((e) => { loadErr = e; }),
          new Promise((r) => setTimeout(r, 12000)),
        ]);
        if (loadErr && !/ERR_ABORTED/.test(loadErr?.message || '')) {
          // 真失败（DNS/拒绝连接等）才报错；ERR_ABORTED 是导航被新导航接替，视为正常
          return { error: `页面加载失败（${loadErr?.code || loadErr?.errno || ''}）: ${cleanUrl}` };
        }
        await Promise.race([injectYzAssistant(wc), new Promise((r) => setTimeout(r, 1500))]);
        return { url: wc.getURL() || cleanUrl, title: wc.getTitle(), loading: wc.isLoading() };
      }
      case 'click': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var A=window.__yzAssistant;
          function clickEl(el){
            el.scrollIntoView({behavior:'smooth',block:'center'});
            return new Promise(function(res){
              setTimeout(function(){
                var rect=el.getBoundingClientRect();
                var doc=el.ownerDocument;
                if(doc===document){
                  var x=rect.x+rect.width/2,y=rect.y+rect.height/2;
                  var tag=A.clickAt(x,y);
                  res({success:true,via:'real-mouse',tag:tag});
                }else{
                  // iframe 内元素：坐标相对 iframe 视口，改在元素上直接派发鼠标事件
                  var w=doc.defaultView;
                  var o={bubbles:true,cancelable:true,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,view:w};
                  el.dispatchEvent(new MouseEvent('mousemove',o));el.dispatchEvent(new MouseEvent('mousedown',o));
                  el.dispatchEvent(new MouseEvent('mouseup',o));el.dispatchEvent(new MouseEvent('click',o));
                  res({success:true,via:'dom-events',iframe:true,tag:el.tagName.toLowerCase()});
                }
              },300);
            });
          }
          function notFound(sel){return{error:'元素未找到: '+sel,hint:'建议先调用 browser_get_page_info 获取编号元素列表，再用 index 参数定位'};}
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
            if(els.length===0)return notFound(a.selector);
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
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};
          var A=window.__yzAssistant;
          function typeEl(el){
            el.scrollIntoView({behavior:'smooth',block:'center'});
            var rect=el.getBoundingClientRect();A.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'输入');
            A.typeIn(el,a.text);return{success:true,typed:(a.text||'').length};
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
          A.typeIn(el,a.text);return{success:true,typed:(a.text||'').length};
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
          const image = await wc.capturePage();
          await wc.executeJavaScript(`(function(){var p=document.getElementById(${JSON.stringify(overlayId)});if(p)p.remove();})()`).catch(() => {});
          return { base64: image.toDataURL().split(',')[1], annotated: true };
        }
        const image = await wc.capturePage();
        return { base64: image.toDataURL().split(',')[1] };
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
        return await wc.executeJavaScript(`(function(){
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
            var o={index:idx,tag:el.tagName.toLowerCase(),text:(el.textContent||'').trim().slice(0,60)};
            if(el.placeholder)o.placeholder=el.placeholder;
            if(el.href)o.href=el.href.slice(0,200);
            out.push(o);
          }
          var maxText=a.maxTextLength||5000;
          return{url:location.href,title:document.title,
            text:visibleText(document.body).trim().slice(0,maxText),
            interactiveCount:els.length,interactive:out,
            hint:'可交互元素已编号（index 字段），browser_click / browser_type 可直接用 index 参数定位'};
        })()`);
      }
      case 'fill_form': {
        return await wc.executeJavaScript(`(function(){
          var a=${JSON.stringify(args)};var fields=a.fields||[];var names=[];
          for(var i=0;i<fields.length;i++){var f=fields[i];var el=window.__yzAssistant.resolve(f.selector);
            if(!el)continue;el.scrollIntoView({behavior:'smooth',block:'center'});
            var rect=el.getBoundingClientRect();window.__yzAssistant.showCursor(rect.x+rect.width/2,rect.y+rect.height/2,'填写');
            if(f.type==='select'){el.value=f.value;el.dispatchEvent(new Event('change',{bubbles:true}));}
            else if(f.type==='checkbox'){el.checked=!!f.value;el.dispatchEvent(new Event('change',{bubbles:true}));}
            else{window.__yzAssistant.typeIn(el,String(f.value));}
            names.push(f.selector);}
          setTimeout(function(){window.__yzAssistant.hideCursor();},500);
          return{filled:names.length,fields:names};
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
        // 多标签页：webview 引擎下每个 host 是一个 <webview>，支持真新建并返回 tabId。
        if (isWebviewEngine()) {
          // 归属空间固定 preview：agent/browser_new_tab 面向对话右栏的浏览器 host 新开页，
          // 不跟随 activeTab 的空间——否则若上次在 /browser(page 空间)浏览、当前又在右栏(preview)，
          // 广播 tabCreated(scope=page) 会被 preview 的 BrowserPanel 按空间过滤而看不到新标签。
          const scope = 'preview';
          const target = (() => { const u = String(args.url || '').trim(); return u; })();
          const tabId = 'tab-' + (++tabSeq);
          webviewTabs.set(tabId, { scope, lastActiveAt: Date.now(), wcId: null });
          activeTabId = tabId;
          // 通知渲染层补建 host tab 壳(:src=url 会驱动新建 <webview> 并注册 guest)，并激活
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browserView:tabCreated', tabId, target || null, scope);
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
        if (isWebviewEngine()) {
          const tid = String(args.tabId ?? activeTabId ?? '');
          if (webviewTabs.has(tid)) { activeTabId = tid; webviewTabs.get(tid).lastActiveAt = Date.now(); return { activeTabId: tid }; }
          return { error: '标签页不存在: ' + tid };
        }
        return { error: '该浏览器引擎不支持 switch_tab' };
      }
      case 'close_tab': {
        if (isWebviewEngine()) {
          const tid = String(args.tabId ?? activeTabId ?? '');
          webviewTabs.delete(tid);
          if (activeTabId === tid) {
            activeTabId = null;
            const any1 = webviewTabs.keys().next();
            if (!any1.done) activeTabId = any1.value;
          }
          return { closed: true };
        }
        return { error: '该浏览器引擎不支持 close_tab' };
      }
      case 'get_tabs': {
        if (!isWebviewEngine()) return { tabs: [] };
        const tabs2 = [];
        for (const [id, t] of webviewTabs) {
          const wc2 = guestWebContents(id);
          tabs2.push({ tabId: id, url: wc2 ? wc2.getURL() : '', title: wc2 ? wc2.getTitle() : '', scope: t.scope || 'preview' });
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
      case 'upload': {
        const fp = String(args.filePath || '');
        if (!fp) return { error: 'filePath 为必填项' };
        try {
          const buf = await fsp.readFile(fp);
          const base64 = buf.toString('base64');
          const filename = path.basename(fp);
          return await wc.executeJavaScript(`(function(){
            var a=${JSON.stringify(args)};
            var base64=${JSON.stringify(base64)};
            var filename=${JSON.stringify(filename)};
            var b=atob(base64);var arr=new Uint8Array(b.length);for(var i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);
            var file=new File([arr],filename);var dt=new DataTransfer();dt.items.add(file);
            var input=null;
            if(a.index!=null&&window.__yzElements){input=window.__yzElements[a.index];}
            else if(a.selector){input=window.__yzAssistant.resolve(a.selector);}
            else{input=document.querySelector('input[type=file]');}
            if(!input)return{error:'未找到 input[type=file] 元素'};
            try{input.files=dt.files;}catch(e){return{error:'无法设置文件（浏览器安全限制）: '+e.message};}
            input.dispatchEvent(new Event('change',{bubbles:true}));
            return{uploaded:true,filename:filename};
          })()`);
        } catch (e) {
          return { error: '读取文件失败: ' + (e?.message || e) };
        }
      }
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
    // 总闸：任何 action 最多 18s（渲染层 20s 竞速之前返回明确错误，而非让渲染层猜超时）
    const result = await Promise.race([
      doAction(),
      new Promise((r) => setTimeout(() => r({ error: `浏览器操作 ${action} 超时（18s）：页面可能仍在加载或无响应，请稍后用 browser_get_page_content 重试` }), 18000)),
    ]);
    if (result && !result.error && !result.ambiguous && beforeState) {
      await new Promise(r => setTimeout(r, 500)); // 等待页面响应
      const after = await wc.executeJavaScript(STATE_SNAPSHOT_JS).catch(() => null);
      if (after) {
        const urlChanged = after.url !== beforeState.url;
        const changed = urlChanged || after.t !== beforeState.t || after.n !== beforeState.n;
        noChangeStreak = changed ? 0 : noChangeStreak + 1;
        result.pageChanged = changed;
        result.urlChanged = urlChanged;
        result.noChangeStreak = noChangeStreak;
        if (noChangeStreak >= 3) {
          result.warning = '连续 ' + noChangeStreak + ' 次操作页面无任何变化，操作可能未生效。请停止重复同类操作：改用 index 精确定位（先 browser_get_page_info 获取编号列表）、重新分析页面、或 ask_user 请求人工介入。';
        }
      }
    }
    return result;
  } catch (e) {
    return { error: e?.message || String(e) };
  }
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

ipcMain.handle('fs:exists', (e, p) => fs.existsSync(p));

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
// IPC：Keyring（JSON 文件存储）
// ============================================================
ipcMain.handle('keyring:set', async (e, key, value) => {
  const data = await readKeyring();
  data[key] = value;
  await writeKeyring(data);
});

ipcMain.handle('keyring:get', async (e, key) => {
  const data = await readKeyring();
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
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

// ============================================================
// IPC：Shell（child_process）
// ============================================================
ipcMain.handle('shell:exec', (e, command, args, options) => {
  return new Promise((resolve) => {
    const opts = {};
    if (options?.cwd) opts.cwd = options.cwd;
    if (options?.env) opts.env = { ...process.env, ...options.env };
    const child = execFile(command, args ?? [], opts, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ? stdout.toString('utf-8') : '',
        stderr: stderr ? stderr.toString('utf-8') : '',
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

// 用系统默认浏览器打开外链（http/https），不在应用窗口内导航离开
ipcMain.handle('shell:openExternal', (_e, url) => {
  console.log('[nav] shell:openExternal IPC:', url);
  if (!url || !/^https?:\/\//i.test(url)) return;
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
// 应用启动
// ============================================================

// CDP 统一架构：开启远程调试端口，后端 Playwright 通过 CDP 连接到 Electron BrowserView，
// 所有 browser_ 工具操作同一个浏览器实例，预览面板就是这个 BrowserView（与豆包 CNGC Browser Use 架构一致）。
// 端口可通过环境变量 YANZHI_CDP_PORT 覆盖，默认 9222。
const CDP_PORT = process.env.YANZHI_CDP_PORT || '9222';
app.commandLine.appendSwitch('remote-debugging-port', CDP_PORT);
console.log(`[cdp] 远程调试端口已开启: http://127.0.0.1:${CDP_PORT}`);

// Windows 下禁用原生窗口遮挡计算：窗口最小化/隐藏后，Chromium 会把 BrowserView 的
// webContents 标记为「被完全遮挡」而停止产出新帧；恢复显示后合成器偶发不重新绘制，
// 表现为预览面板全黑（GPU 合成层残留）。关掉该特性可从根上规避。
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

// 单实例锁：确保同一时间只有一个 yan-zhi 实例运行，避免安装新版本后旧进程残留导致数据冲突
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);  // 移除默认菜单栏
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.yanzhi.desktop');
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
        if (url && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browser:wv:openTab', url);
        }
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
  const csp = isDev
    ? "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https: http:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' ws://localhost:1420 wss://localhost:1420 http://localhost:3001 https: http:;"
    : "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https: http:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' http://localhost:3001 https: http:;";
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
  startServer();

  // computer-use 急停热键：Ctrl+Alt+Esc → 通知后端 panic（冻结输入工具并禁用插件）。
  // 插件未启用时后端返回 404，静默忽略；请求失败也不影响本进程。
  try {
    const ok = globalShortcut.register('Control+Alt+Escape', () => {
      const req = http.request('http://127.0.0.1:3001/api/plugin/computer-use/panic', { method: 'POST', timeout: 3000 }, (res) => {
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

  // 健康检查：轮询后端 /api/health，就绪后创建窗口（替代固定 1.5s 延迟）
  const checkHealth = (retries = 0) => {
    if (retries > 60) { // 最多等 30 秒
      console.error('[后端] 启动超时，强制创建窗口');
      try { fs.appendFileSync(path.join(app.getPath('userData'), 'server.log'), `[${new Date().toLocaleString('zh-CN', { hour12: false })}] [后端] 30 秒健康检查超时，后端未就绪，强制创建窗口（大概率后端启动失败，见上方日志）\n`); } catch {}
      createWindow();
      return;
    }
    const req = http.get('http://127.0.0.1:3001/api/health', (res) => {
      res.resume();
      if (res.statusCode === 200) {
        console.log('[后端] 健康检查通过，创建窗口');
        createWindow();
      } else {
        setTimeout(() => checkHealth(retries + 1), 500);
      }
    });
    req.on('error', () => setTimeout(() => checkHealth(retries + 1), 500));
    req.setTimeout(2000, () => { req.destroy(); setTimeout(() => checkHealth(retries + 1), 500); });
  };
  setTimeout(checkHealth, 300);

  // 创建系统托盘图标（关闭窗口时后端保持守护运行，通过托盘退出）
  const createTray = () => {
    const iconPath = getAppIconPath();
    if (!fs.existsSync(iconPath)) return;
    tray = new Tray(iconPath);
    tray.setToolTip('言智');
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
