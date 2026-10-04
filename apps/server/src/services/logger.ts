// server 统一 logger（P4b，2026-10-04）。
//
// ★ 设计取舍：调用方（各模块）继续携带自己的 `[模块名]` 前缀串 —— 本模块只统一
//   补**时间戳**并提供未来切换 transport（文件/远端/静默）的单点。
//   此前时间戳有三种格式混用（toLocaleString('zh-CN') / Date.now() / toISOString），
//   排障对时间线困难；现在统一为本格式。
// ★ codemod（tmp/p4b-logger-codemod.cjs）已把 apps/server 的 console 调用批量迁移
//   到这里；新代码禁止直接 console.*（lint 后续可加规则）。

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function ts(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function emit(level: LogLevel, module: string, args: unknown[]): void {
  const line = `[${ts()}] [${module}]`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

/** 创建模块级 logger：module 一般取文件内的既有前缀名（如 'llm-task'、'path-guard'） */
export function createLogger(module: string): Logger {
  return {
    info: (...args) => emit('info', module, args),
    warn: (...args) => emit('warn', module, args),
    error: (...args) => emit('error', module, args),
  };
}
