// tsserver 子进程管理（P2-5，2026-10-04）—— 代码导航的最后一块短板。
//
// ★ 为什么需要：`code_refs`/`code_graph` 走 AST（编译器可用时精确），但在 **re-export
//   场景停在转发行**（`resolveToolPath` 经 index.ts 转出，AST 命中 index.ts 而非实现行），
//   且没有语言服务级的 definition/quickinfo。本模块按工作目录 spawn 项目本地的
//   `tsserver.js`，走 tsserver 协议（非 LSP 标准 —— 省掉适配层，TypeScript 生态足够）。
//
// ★ 协议要点（tsserver，行分隔 JSON，不是 Content-Length 分帧）：
//   · 请求 `{seq, type:'request', command, arguments}`；响应 `{type:'response', request_seq, success, body}`；
//   · 事件（`type:'event'`）一律忽略（本项目只用请求-响应模式）；
//   · `definition` 的坐标：line 1-based，**offset 按 UTF-16 码元**（= JS 字符串下标 + 1），
//     CJK 行上"列号"不等于 offset —— 位置解析统一走 resolveTsserverPosition（纯函数，可测）。
//
// ★ 生命周期（方案 P2-5 拍板）：
//   · 每个工作目录一个实例（key = root），闲置 10 分钟回收（定时器 unref，不阻退出）；
//   · 进程意外退出自动重启一次（failures 计数），再失败进入熔断：该 root 直接返回
//     "tsserver 不可用，改用 code_refs" 的引导，不做无限重试（坏项目反复 spawn 更糟）；
//   · 请求 20s 超时兜底（tsserver 个别命令不保证有响应，不能永久挂起工具调用）。
//
// ★ 解释器：复用 stdio-client 的 node 运行时解析（bare node 优先 PATH，打包版
//   Electron 回退 process.execPath + ELECTRON_RUN_AS_NODE=1）；Windows 下 spawn 用
//   windowsHide 防闪黑窗。

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { resolveNodeRuntime } from '../mcp/stdio-client.js';
import { createLogger } from './logger.js';
const logger = createLogger('lsp-manager');

const IDLE_REAP_MS = 10 * 60_000;
const REQ_TIMEOUT_MS = 20_000;
/** 允许的意外退出重启次数；超限熔断（该 root 直接引导改用 code_refs） */
const MAX_FAILURES = 2;

interface PendingReq {
  resolve: (body: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ServerEntry {
  root: string;
  proc: ChildProcessWithoutNullStreams;
  seq: number;
  pending: Map<number, PendingReq>;
  stdoutBuf: string;
  lastUsed: number;
  failures: number;
  /** 是否为"已熔断"标记（不再重启，等待闲置回收后允许再试） */
  broken: boolean;
}

const servers = new Map<string, ServerEntry>();

/** 项目本地 tsserver 优先；缺失时回退 server 依赖的 typescript（开发/内置运行时场景） */
export function findTsserverScript(root: string): string | null {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'tsserver.js');
  if (existsSync(local)) return local;
  try {
    return createRequire(import.meta.url).resolve('typescript/lib/tsserver.js');
  } catch {
    return null;
  }
}

/**
 * 位置解析（纯函数，单测入口）：
 * 优先 column（1-based，与编辑器一致）；否则按 symbol 在行内首次出现定位；
 * 否则取行内第一个标识符。返回的 offset 是 tsserver 口径（1-based UTF-16 码元）。
 */
export function resolveTsserverPosition(
  content: string,
  line: number,
  column?: number | null,
  symbol?: string | null,
): { offset: number; lineText: string } | { error: string } {
  const lines = content.split(/\r\n|\n/);
  if (!Number.isFinite(line) || line < 1 || line > lines.length) {
    return { error: `行号 ${line} 超出文件范围（共 ${lines.length} 行）` };
  }
  const lineText = lines[line - 1];
  if (column != null && Number.isFinite(column) && column >= 1) {
    return { offset: Math.min(Math.floor(column), lineText.length + 1), lineText };
  }
  if (symbol && symbol.trim()) {
    const idx = lineText.indexOf(symbol.trim());
    if (idx >= 0) return { offset: idx + 1, lineText };
    return { error: `该行未找到符号 "${symbol}"：请确认行号正确，或显式传 column（1-based 列号）` };
  }
  const m = lineText.match(/[A-Za-z_$][\w$]*/);
  if (m && m.index !== undefined) return { offset: m.index + 1, lineText };
  return { error: '该行没有可定位的标识符：请显式传 symbol 或 column' };
}

/** 取某文件某行的预览文本（结果展示用；读不到返回空串） */
function linePreview(file: string, line: number): string {
  try {
    const lines = readFileSync(file, 'utf-8').split(/\r\n|\n/);
    return (lines[line - 1] || '').trim().slice(0, 200);
  } catch {
    return '';
  }
}

// ── 进程管理 ──────────────────────────────────────────────────────────────

function spawnServer(root: string, failures: number): ServerEntry | null {
  const script = findTsserverScript(root);
  if (!script) return null;
  const runtime = resolveNodeRuntime();
  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(runtime.command, [script, '--disableAutomaticTypingAcquisition'], {
      cwd: root,
      env: { ...process.env, ...runtime.extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;
  } catch {
    return null;
  }
  const entry: ServerEntry = {
    root, proc, seq: 0, pending: new Map(), stdoutBuf: '', lastUsed: Date.now(), failures, broken: false,
  };
  proc.stdout.setEncoding('utf-8');
  proc.stdout.on('data', (chunk: string) => {
    entry.stdoutBuf += chunk;
    // tsserver 是行分隔 JSON：按行切分，最后一段不完整留缓冲
    let nl: number;
    while ((nl = entry.stdoutBuf.indexOf('\n')) >= 0) {
      const raw = entry.stdoutBuf.slice(0, nl).trim();
      entry.stdoutBuf = entry.stdoutBuf.slice(nl + 1);
      if (!raw) continue;
      let msg: any;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg?.type !== 'response' || typeof msg.request_seq !== 'number') continue; // 事件/日志忽略
      const p = entry.pending.get(msg.request_seq);
      if (!p) continue;
      entry.pending.delete(msg.request_seq);
      clearTimeout(p.timer);
      entry.failures = 0; // 有应答即健康：重启计数归零，长跑后偶发崩溃不误熔断
      if (msg.success) p.resolve(msg.body);
      else p.reject(new Error(msg.message || `tsserver 请求失败（${msg.command || 'unknown'}）`));
    }
  });
  const onExit = () => {
    for (const p of entry.pending.values()) { clearTimeout(p.timer); p.reject(new Error('tsserver 进程已退出')); }
    entry.pending.clear();
    if (servers.get(root) !== entry) return; // 已被替换/清理（shutdown / 闲置回收），不做重启
    servers.delete(root);
    const failures = entry.failures + 1;
    if (failures >= MAX_FAILURES) {
      // 熔断：留一个 broken 标记占位，避免同一坏项目反复 spawn；闲置回收后自然允许重试
      servers.set(root, { ...entry, proc: null as any, broken: true, failures });
      logger.warn(`[lsp] tsserver 连续失败 ${failures} 次，熔断（root=${root}）`);
      return;
    }
    // 意外退出：自动重启一次，失败计数带入下一次
    const next = spawnServer(root, failures);
    if (next) {
      servers.set(root, next);
      logger.warn(`[lsp] tsserver 退出，已自动重启（root=${root}，失败计数 ${failures}/${MAX_FAILURES}）`);
    } else {
      servers.set(root, { ...entry, proc: null as any, broken: true, failures });
      logger.warn(`[lsp] tsserver 退出且无法重启，熔断（root=${root}）`);
    }
  };
  proc.on('exit', onExit);
  // spawn 失败（无 pid）不保证伴随 exit 事件，用 error 兜底；运行中进程的偶发 error 交给 exit
  proc.on('error', () => { if (!proc.pid) onExit(); });
  // 进程消亡后写 stdin 会抛 EPIPE / ERR_STREAM_DESTROYED：pending 由 exit 分支 reject，这里只防未处理的流错误
  proc.stdin.on('error', () => { /* 见上 */ });
  proc.stderr.on('data', () => { /* tsserver 的 stderr 噪音（版本提示等）不转发 */ });
  proc.unref?.();
  return entry;
}

function getServer(root: string): ServerEntry | { error: string } {
  const existing = servers.get(root);
  if (existing?.broken) {
    return { error: 'tsserver 在该项目上连续启动失败，已熔断。请改用 code_refs / code_outline（AST）定位，或检查项目 node_modules/typescript 是否损坏。' };
  }
  if (existing) { existing.lastUsed = Date.now(); return existing; }
  const fresh = spawnServer(root, 0);
  if (!fresh) {
    return { error: '未找到可用的 tsserver（项目未安装 typescript，且服务端依赖不可用）。请用 code_refs / code_outline 定位。' };
  }
  servers.set(root, fresh);
  return fresh;
}

function request(entry: ServerEntry, command: string, args: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    // 调用方可能持有已被替换的旧 entry（open 后进程恰好退出）：直接拒绝，不向死管道写入
    if (entry.proc.exitCode !== null || entry.proc.stdin.destroyed) {
      reject(new Error('tsserver 进程已退出'));
      return;
    }
    const seq = ++entry.seq;
    const timer = setTimeout(() => {
      entry.pending.delete(seq);
      reject(new Error(`tsserver 请求超时（${command} > ${REQ_TIMEOUT_MS / 1000}s）`));
    }, REQ_TIMEOUT_MS);
    entry.pending.set(seq, { resolve, reject, timer });
    try {
      entry.proc.stdin.write(JSON.stringify({ seq, type: 'request', command, arguments: args }) + '\n');
    } catch (e: any) {
      entry.pending.delete(seq);
      clearTimeout(timer);
      reject(new Error(`tsserver 写入失败：${e?.message || e}`));
    }
  });
}

/** 闲置回收（unref：不阻止进程退出） */
const reaper = setInterval(() => {
  const now = Date.now();
  for (const [root, entry] of servers) {
    if (now - entry.lastUsed < IDLE_REAP_MS) continue;
    try { entry.proc?.kill(); } catch { /* 已退出 */ }
    servers.delete(root);
  }
}, 60_000);
reaper.unref?.();

// ── 对外能力 ──────────────────────────────────────────────────────────────

export interface DefinitionHit {
  file: string;
  line: number;
  column: number;
  preview: string;
}

export type DefinitionResult =
  | { ok: true; defs: DefinitionHit[] }
  | { ok: false; error: string };

/**
 * 精确跳转定义。file 需为绝对路径；line/offset 由 resolveTsserverPosition 产出。
 * 首次使用某文件时先 `open`（触发项目加载）；随后 `definition`。
 */
export async function tsserverDefinition(
  root: string,
  file: string,
  line: number,
  offset: number,
): Promise<DefinitionResult> {
  const entry = getServer(root);
  if ('error' in entry) return { ok: false, error: entry.error };
  try {
    await request(entry, 'open', { file });
  } catch {
    // open 失败不阻断：definition 对部分文件类型（如 .json）仍可能给出结果
  }
  let body: any;
  try {
    body = await request(entry, 'definition', { file, line, offset });
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
  const arr: any[] = Array.isArray(body) ? body : body ? [body] : [];
  const defs: DefinitionHit[] = arr
    .filter((d) => d && typeof d.file === 'string' && d.start)
    .map((d) => ({
      file: d.file,
      line: Number(d.start.line) || 0,
      column: Number(d.start.offset) || 0,
      preview: linePreview(d.file, Number(d.start.line) || 0),
    }));
  return { ok: true, defs };
}

/** 关闭全部实例（测试/退出用） */
export function shutdownLspServers(): void {
  for (const entry of servers.values()) {
    try { entry.proc?.kill(); } catch { /* 已退出 */ }
  }
  servers.clear();
}

/** 自检/日志用 */
export function lspServerStats(): Array<{ root: string; idleMs: number; pending: number; broken: boolean }> {
  const now = Date.now();
  return [...servers.values()].map((e) => ({ root: e.root, idleMs: now - e.lastUsed, pending: e.pending.size, broken: e.broken }));
}