// server 统一 logger（P4b，2026-10-04；文件落盘 2026-10-10）。
//
// ★ 设计取舍：调用方（各模块）继续携带自己的 `[模块名]` 前缀串 —— 本模块只统一
//   补**时间戳**并提供 transport（文件/控制台）的单点。
//   此前时间戳有三种格式混用（toLocaleString('zh-CN') / Date.now() / toISOString），
//   排障对时间线困难；现在统一为本格式。
// ★ codemod（tmp/p4b-logger-codemod.cjs）已把 apps/server 的 console 调用批量迁移
//   到这里；新代码禁止直接 console.*（lint 后续可加规则）。
//
// ★★★ 2026-10-10 新增文件落盘（用户实测痛点：「应用都不打印日志，出问题只能靠猜」）：
//   此前本模块只写 stdout/stderr —— dev 模式下由 `bin/dev.mjs` 以 `stdio: 'inherit'`
//   直接打到终端，**不落任何文件**。后果：
//     · 终端一滚屏/一关窗，现场就没了；
//     · 排障只能靠"读数据库 + 反推"，效率极低且容易归因错误
//       （实测 2026-10-10 那次「任务卡住」排查，就是因为拿不到日志而绕了很久）。
//   ⇒ 现在**同时**落 `DATA_DIR/logs/server-YYYY-MM-DD.log`（按天切分，保留最近 N 天）。
//   ★ 为什么按天 + 保留 N 天：单文件会无限增长（本项目跑长任务一天能出几十 MB），
//     分天便于"按出事时间点直接翻那个文件"，自动清理避免撑爆磁盘。
//   ★ 为什么用同步追加：日志量不大（每天几十 MB 级），且**进程崩溃时异步写会丢最后几条**
//     —— 而崩溃前那几条恰恰是排障最需要的。同步写入牺牲一点性能换"断电不丢日志"。
//   ★ 落盘失败绝不能影响业务：所有文件 IO 包 try/catch，失败后**降级为仅控制台**
//     （并只提示一次，避免刷屏）。

import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** 日志目录（懒解析一次；由 `configureLogger` 注入，未注入时尝试从 env 推导） */
let logDir: string | null = null;
/** 当前打开的日志文件（按天轮转：跨天时重开） */
let logStream: fs.WriteStream | null = null;
let logStreamDate = '';
/** 落盘失败只提示一次，避免刷屏 */
let fileWarned = false;
/** 保留天数 */
const RETAIN_DAYS = 7;

/**
 * 注入日志目录（`index.ts` 启动早期调用一次）。
 * ★ 显式注入而非在模块顶层推导：本模块被大量纯逻辑模块引用，
 *   顶层做 IO（读 env / 建目录）会让单测出现意外副作用。
 */
export function configureLogger(dir: string): void {
  try {
    logDir = dir;
    fs.mkdirSync(dir, { recursive: true });
    cleanupOldLogs();
  } catch (e) {
    console.warn('[logger] 日志目录初始化失败，降级为仅控制台输出:', e);
    logDir = null;
  }
}

/** 当前日志文件路径（测试/排障用） */
export function currentLogFile(): string | null {
  return logDir ? path.join(logDir, `server-${today()}.log`) : null;
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 清理超过保留期的日志文件（失败静默，不影响业务） */
function cleanupOldLogs(): void {
  if (!logDir) return;
  try {
    const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(logDir)) {
      if (!/^server-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
      const fp = path.join(logDir, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch { /* 单个文件清理失败不影响其它 */ }
    }
  } catch { /* 目录不可读则跳过 */ }
}

/** 取当前天的写入流（跨天自动轮转），失败返回 null（调用方降级） */
function getStream(): fs.WriteStream | null {
  if (!logDir) return null;
  const day = today();
  if (logStream && logStreamDate === day) return logStream;
  try {
    // 跨天：关旧开新
    if (logStream) { try { logStream.end(); } catch { /* ignore */ } }
    // ★ 用 append 流（同一天多次启动 server 时追加而非覆盖 —— 重启不该抹掉上一段现场）
    logStream = fs.createWriteStream(path.join(logDir, `server-${day}.log`), { flags: 'a' });
    logStream.on('error', () => { logStream = null; });
    logStreamDate = day;
    return logStream;
  } catch (e) {
    if (!fileWarned) { fileWarned = true; console.warn('[logger] 日志文件打开失败，降级为仅控制台:', e); }
    logStream = null;
    return null;
  }
}

/** 把任意参数安全序列化成一行文本（对象走 JSON，Error 取 stack） */
function stringify(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || a.message;
  try {
    return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a);
  } catch {
    return String(a);
  }
}

function ts(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function emit(level: LogLevel, module: string, args: unknown[]): void {
  const line = `[${ts()}] [${module}]`;
  const text = args.map(stringify).join(' ');
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
  // ★ 文件落盘：与控制台**同源同格式**（带日期前缀，便于跨天翻文件时定位）
  const s = getStream();
  if (s) {
    try {
      s.write(`[${today()} ${ts()}] [${level.toUpperCase()}] [${module}] ${text}\n`);
    } catch { /* 写入失败静默（流错误已由 error 事件处理） */ }
  }
}

/** 创建模块级 logger：module 一般取文件内的既有前缀名（如 'llm-task'、'path-guard'） */
export function createLogger(module: string): Logger {
  return {
    info: (...args) => emit('info', module, args),
    warn: (...args) => emit('warn', module, args),
    error: (...args) => emit('error', module, args),
  };
}
