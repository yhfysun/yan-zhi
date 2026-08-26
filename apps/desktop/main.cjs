const { app, BrowserWindow, BrowserView, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');

let mainWindow = null;
let serverProcess = null;
let browserView = null;

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
function startServer() {
  const serverDir = path.join(__dirname, '..', 'server');

  if (!app.isPackaged) {
    // 开发模式：用 Electron 的 Node.js + tsx 运行 TypeScript 源码
    const tsxPath = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(tsxPath)) {
      console.log('[后端] 用 Electron Node.js + tsx 启动:', tsxPath);
      serverProcess = spawn(process.execPath, [tsxPath, 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
    } else {
      // 回退：npx tsx（可能 ABI 不兼容，但至少能启动）
      console.warn('[后端] tsx CLI 未找到，回退到 npx tsx（可能 ABI 不兼容）');
      serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: serverDir,
        stdio: 'inherit',
        shell: true,
      });
    }
    serverProcess.on('error', (err) => console.error('后端启动失败:', err));
  } else {
    // 生产模式：用 Electron 作为 Node.js（ELECTRON_RUN_AS_NODE=1）运行后端编译产物
    const serverPath = path.join(process.resourcesPath, 'server', 'dist', 'apps', 'server', 'src', 'index.js');
    serverProcess = spawn(process.execPath, [serverPath], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    serverProcess.on('error', (err) => console.error('后端启动失败:', err));
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
  mainWindow = new BrowserWindow({
    icon: getAppIconPath(),
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    frame: false,           // 无边框窗口（自定义标题栏）
    titleBarStyle: 'hidden',
    transparent: true,      // 透明背景：让 Windows 11 原生圆角可见
    webPreferences: {
      // 不再使用 <webview> 标签，改用 BrowserView
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  // 拦截主窗口键盘事件：当 BrowserView 可见时，Ctrl+R/F5 刷新 BrowserView 而非主窗口
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!browserView) return;
    const key = input.key.toLowerCase();
    // Ctrl+R 或 F5 → 刷新 BrowserView
    if ((input.control && key === 'r') || key === 'f5') {
      event.preventDefault();
      browserView.webContents.reload();
    }
    // Alt+Left → 后退
    if (input.alt && key === 'arrowleft') {
      event.preventDefault();
      if (browserView.webContents.navigationHistory?.canGoBack?.() || browserView.webContents.canGoBack?.()) {
        browserView.webContents.goBack();
      }
    }
    // Alt+Right → 前进
    if (input.alt && key === 'arrowright') {
      event.preventDefault();
      if (browserView.webContents.navigationHistory?.canGoForward?.() || browserView.webContents.canGoForward?.()) {
        browserView.webContents.goForward();
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

  mainWindow.on('closed', () => {
    // 清理 BrowserView
    if (browserView) {
      try { mainWindow?.setBrowserView(null); } catch {}
      try { browserView.webContents?.destroy?.(); } catch {}
      browserView = null;
    }
    mainWindow = null;
  });

  // BrowserView 延迟创建：只在用户首次导航时才创建，避免白屏覆盖主窗口
}

// ============================================================
// BrowserView：嵌入外部网页（替代 <webview> 标签，支持精确 setBounds）
// ============================================================
/** 按需创建 BrowserView 并附加到主窗口（延迟创建，避免初始白屏） */
function ensureBrowserView() {
  if (browserView) return browserView;
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  browserView = new BrowserView({
    webPreferences: {
      // 独立 partition：与主窗口 session 隔离，主窗口的 CSP 注入不影响 BrowserView 加载的第三方网页
      partition: 'browser-view',
      // document-start 阶段先注入滚动条样式，避免第三方页面先闪一下原生滚动条
      preload: path.join(__dirname, 'browser-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });
  mainWindow.setBrowserView(browserView);
  // 初始设为不可见
  browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  const wc = browserView.webContents;

  // 监听导航事件，通知前端地址栏更新
  wc.on('did-navigate', (_e, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:navigated', url);
    }
    // did-navigate 比 dom-ready 更早，先注入一次可进一步减少原生滚动条闪现；
    // 若当前文档尚不能插入 CSS，下面的 dom-ready 会兜底重试。
    injectBrowserViewScrollbar();
  });
  wc.on('did-navigate-in-page', (_e, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:navigated', url);
    }
  });
  // 每次真正导航到新文档时，把旧文档的 inserted CSS 状态清掉。
  // dom-ready 阶段再注入，避免上一页的 key 被误当成新页已注入而跳过。
  wc.on('did-start-navigation', () => {
    scrollbarCssKey = null;
    browserViewInjectedTheme = null;
  });
  // DOM 就绪时先注入滚动条样式，尽量缩小原生滚动条闪现窗口
  wc.on('dom-ready', () => {
    browserView?.webContents.send('browser-view:scrollbar-theme', browserViewTheme);
    injectBrowserViewScrollbar();
  });
  // 页面加载完成，通知前端
  wc.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browserView:loaded', wc.getURL());
    }
    // 主进程侧直接注入滚动条主题样式（不依赖前端 IPC 往返，避免时序错位导致漏注入）
    injectBrowserViewScrollbar();
    // 恢复上一次的页面缩放级别（loadURL 可能重置 zoom）
    try { browserView.webContents.setZoomFactor(browserViewZoom); } catch { /* ignore */ }
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

  return browserView;
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
// 用 BrowserView 替代 <webview> 标签，通过 setBounds 精确控制尺寸
// ============================================================
ipcMain.handle('browserView:load', async (e, url) => {
  if (!url) return;
  // 按需创建 BrowserView（首次导航时创建）
  const bv = ensureBrowserView();
  if (!bv) return;
  // 重新附加到主窗口（hide 时会分离）
  mainWindow.setBrowserView(bv);
  await bv.webContents.loadURL(url);
});

ipcMain.handle('browserView:back', () => {
  if (!browserView) return;
  if (browserView.webContents.navigationHistory) {
    if (browserView.webContents.navigationHistory.canGoBack()) {
      browserView.webContents.goBack();
    }
  } else if (browserView.webContents.canGoBack?.()) {
    browserView.webContents.goBack();
  }
});

ipcMain.handle('browserView:forward', () => {
  if (!browserView) return;
  if (browserView.webContents.navigationHistory) {
    if (browserView.webContents.navigationHistory.canGoForward()) {
      browserView.webContents.goForward();
    }
  } else if (browserView.webContents.canGoForward?.()) {
    browserView.webContents.goForward();
  }
});

ipcMain.handle('browserView:reload', () => {
  if (!browserView) return;
  browserView.webContents.reload();
});

ipcMain.handle('browserView:resize', (e, x, y, width, height) => {
  if (!browserView) return;
  // bounds 坐标使用 CSS 像素（Electron 33 setBounds 用逻辑像素，不需要乘 DPR）
  browserView.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  });
});

ipcMain.handle('browserView:getUrl', () => {
  if (!browserView) return '';
  return browserView.webContents.getURL();
});

ipcMain.handle('browserView:hide', () => {
  if (!browserView) return;
  // 隐藏 BrowserView（bounds 设为 0），让主页可见
  browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
});

// 设置 BrowserView 网页缩放级别（对应前端 [−]/[+] 缩放控件）
let browserViewZoom = 1;
ipcMain.handle('browserView:setZoomFactor', (_e, factor) => {
  browserViewZoom = factor;
  if (!browserView) return;
  try { browserView.webContents.setZoomFactor(factor); } catch { /* ignore */ }
});

// ── 滚动条主题样式：由主进程在页面加载完成时注入（BrowserView 是原生图层，无法用 HTML 叠加）──
let browserViewTheme = 'light';
let scrollbarCssKey = null;
let browserViewInjectedTheme = null;

function buildScrollbarCss(theme) {
  const dark = theme === 'dark';
  const thumb = dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.18)';
  const thumbHover = dark ? 'rgba(255,255,255,0.36)' : 'rgba(15,23,42,0.32)';
  const thumbActive = dark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.45)';
  return `
    ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
    ::-webkit-scrollbar-track { background: transparent !important; }
    ::-webkit-scrollbar-thumb { background: ${thumb} !important; border: none !important; border-radius: 999px !important; }
    ::-webkit-scrollbar-thumb:hover { background: ${thumbHover} !important; }
    ::-webkit-scrollbar-thumb:active { background: ${thumbActive} !important; }
    ::-webkit-scrollbar-corner { background: transparent !important; }
  `;
}

let scrollbarInjectQueue = Promise.resolve();

function injectBrowserViewScrollbar() {
  scrollbarInjectQueue = scrollbarInjectQueue.then(async () => {
    if (!browserView) { console.log('[browser] scrollbar inject skipped: no browserView yet'); return; }
    // 主题未变化且当前文档已有注入，避免 did-finish-load 对同主题重复 remove/insert
    // 造成瞬间退回原生滚动条；页面导航时 did-start-navigation 会清掉这两个状态。
    if (scrollbarCssKey && browserViewInjectedTheme === browserViewTheme) {
      return;
    }
    const css = buildScrollbarCss(browserViewTheme);
    try {
      if (scrollbarCssKey) {
        try { await browserView.webContents.removeInsertedCSS(scrollbarCssKey); } catch (e) { console.log('[browser] removeInsertedCSS failed', e); }
        scrollbarCssKey = null;
      }
      scrollbarCssKey = await browserView.webContents.insertCSS(css);
      browserViewInjectedTheme = browserViewTheme;
      console.log('[browser] scrollbar CSS injected, theme =', browserViewTheme);
    } catch (e) {
      console.log('[browser] insertCSS failed', e);
    }
  });
  return scrollbarInjectQueue;
}

// BrowserView preload 在 document-start 阶段同步读取当前主题，避免注入延迟。
ipcMain.on('browserView:getTheme', (event) => {
  event.returnValue = browserViewTheme;
});

// 前端在深浅主题切换时通知主进程，重新注入对应主题色的滚动条样式
ipcMain.handle('browserView:setTheme', (_e, theme) => {
  browserViewTheme = theme === 'dark' ? 'dark' : 'light';
  browserView?.webContents.send('browser-view:scrollbar-theme', browserViewTheme);
  injectBrowserViewScrollbar();
});

// 兼容旧调用（前端历史版本可能仍 invoke 此方法）：统一走主进程注入
ipcMain.handle('browserView:insertScrollbarCSS', async () => {
  injectBrowserViewScrollbar();
});

ipcMain.handle('browserView:canGoBack', () => {
  if (!browserView) return false;
  // 兼容新旧 API：新版用 navigationHistory，旧版用 canGoBack()
  if (browserView.webContents.navigationHistory) {
    return browserView.webContents.navigationHistory.canGoBack();
  }
  return browserView.webContents.canGoBack?.() || false;
});

ipcMain.handle('browserView:canGoForward', () => {
  if (!browserView) return false;
  if (browserView.webContents.navigationHistory) {
    return browserView.webContents.navigationHistory.canGoForward();
  }
  return browserView.webContents.canGoForward?.() || false;
});

// ============================================================
// IPC：数据库（better-sqlite3）
// ============================================================
ipcMain.handle('db:exec', (e, sql, params) => {
  const d = getDb();
  if (params && params.length > 0) {
    d.prepare(sql).run(...params);
  } else {
    d.exec(sql);
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
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);  // 移除默认菜单栏

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
  // 等待后端启动（给 1.5 秒）
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  // 关闭所有 MCP 子进程
  for (const [id, entry] of mcpChildren) {
    try { entry.child.kill('SIGTERM'); } catch {}
  }
  mcpChildren.clear();
  // 关闭数据库
  if (db) {
    try { db.close(); } catch {}
    db = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
