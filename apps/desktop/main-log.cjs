// Electron 主进程统一日志（2026-10-10）。
//
// ★★★ 为什么需要（用户实测痛点：「你写的应用都不打印日志啊」）：
//   此前主进程的 50 处 `console.*` **只进终端**（dev）或 stdout（prod 打包后连终端都没有）
//   —— 渲染进程的 console 更是只在 devtools 里。后果：出问题（白屏/浏览器没反应/任务卡住）
//   时**没有任何可查的文件**，排障只能靠"读数据库反推"，效率极低且极易归因错误
//   （2026-10-10 那次「pageAgent 打不开页面」的排查就是被这一点拖住的）。
//
// ★ 设计要点：
//   · **落 `<userData>/logs/main-YYYY-MM-DD.log`**（与 server 日志同目录、按天切分、保留 7 天）——
//     userData 在卸载/清理时一并带走，不散落系统各处。
//   · **同步写入**：进程崩溃时异步写会丢最后几条，而崩溃前那几条恰恰最需要。
//   · **接管 console**：不用改 50 处调用点，`installMainLogger()` 直接包装
//     `console.log/warn/error` —— 既保留终端输出（dev 体验不变），又追加落盘。
//   · **落盘失败绝不影响业务**：全部 try/catch，失败后静默降级为仅控制台（提示一次）。
//   · ★ 同时收**渲染进程**的控制台（`console-message` 事件）—— 浏览器面板的前端逻辑
//     全在渲染层，不落盘就永远看不见它为什么没导航。

const fs = require('fs');
const path = require('path');

const RETAIN_DAYS = 7;
let logDir = null;
let stream = null;
let streamDate = '';
let warned = false;
let installed = false;

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ts() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** 安全序列化（对象 JSON、Error 取 stack，避免 circular 抛错） */
function stringify(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try {
    return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a);
  } catch {
    return String(a);
  }
}

function cleanupOld() {
  if (!logDir) return;
  try {
    const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(logDir)) {
      if (!/^main-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
      const fp = path.join(logDir, f);
      try { if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp); } catch { /* 单个失败不阻塞 */ }
    }
  } catch { /* 目录不可读则跳过 */ }
}

function getStream() {
  if (!logDir) return null;
  const day = today();
  if (stream && streamDate === day) return stream;
  try {
    if (stream) { try { stream.end(); } catch { /* ignore */ } }
    stream = fs.createWriteStream(path.join(logDir, `main-${day}.log`), { flags: 'a' });
    stream.on('error', () => { stream = null; });
    streamDate = day;
    return stream;
  } catch (e) {
    if (!warned) { warned = true; console.warn('[main-log] 日志文件打开失败，降级为仅控制台:', e); }
    stream = null;
    return null;
  }
}

/** 直接写一行（供内部与外部显式调用） */
function writeLine(tag, text) {
  const s = getStream();
  if (!s) return;
  try { s.write(`[${today()} ${ts()}] [${tag}] ${text}\n`); } catch { /* 流错误已由 error 事件处理 */ }
}

/**
 * 安装主进程日志（**必须在 app ready 之前调用**，越早越好）。
 * @param {string} userDataDir  app.getPath('userData')
 */
function installMainLogger(userDataDir) {
  if (installed) return;
  installed = true;
  try {
    logDir = path.join(userDataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    cleanupOld();
    writeLine('main', `===== 主进程日志启动 pid=${process.pid} =====`);
  } catch (e) {
    console.warn('[main-log] 初始化失败，降级为仅控制台:', e);
    logDir = null;
  }

  // ★ 包装 console：保留原有终端输出，同时落盘（不改任何既有调用点）
  for (const [level, tag] of [['log', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      writeLine('main', `[${tag}] ${args.map(stringify).join(' ')}`);
    };
  }
}

/**
 * 把某个 webContents 的控制台消息落盘（渲染进程日志）。
 * ★ 渲染层没有 fs，其 `console.*` 只能靠主进程的 `console-message` 事件收——
 *   浏览器面板（导航/guest/BrowserView）的逻辑全在渲染层，不收就永远查不到。
 * @param {Electron.WebContents} wc
 * @param {string} label 标识来源（如 'renderer' / 'browser-panel'）
 */
function attachRendererConsole(wc, label = 'renderer') {
  if (!wc || typeof wc.on !== 'function') return;
  try {
    wc.on('console-message', (...a) => {
      // 兼容两种签名：旧 (event, level, message, line, sourceId) / 新 (event, details)
      let level = 0; let message = ''; let line = ''; let source = '';
      if (a[1] && typeof a[1] === 'object') {
        level = a[1].level ?? 0;
        message = a[1].message ?? '';
        line = a[1].lineNumber ?? '';
        source = a[1].sourceId ?? '';
      } else {
        level = a[1]; message = a[2]; line = a[3]; source = a[4];
      }
      const lv = ['VERBOSE', 'INFO', 'WARN', 'ERROR'][Number(level)] || String(level);
      // 只落 warn/error + 带 [browser] 前缀的信息，避免渲染层噪音淹没（Vue devtools 等很吵）
      const isNoisy = level === 0 || (typeof message === 'string' && /DevTools|Vue Devtools|\[vite\]/i.test(message));
      if (isNoisy && lv !== 'ERROR') return;
      const src = source ? ` (${String(source).split('/').pop()}:${line})` : '';
      writeLine(`${label}`, `[${lv}] ${message}${src}`);
    });
  } catch { /* 不可用时跳过（非 Electron / 测试环境） */ }
}

module.exports = { installMainLogger, attachRendererConsole, writeLine, currentLogFile: () => (logDir ? path.join(logDir, `main-${today()}.log`) : null) };
