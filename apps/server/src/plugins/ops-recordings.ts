// 运维终端会话录制（asciinema v2 `.cast`）。
//
// 为什么用 .cast：纯文本、逐行 append、无外部依赖。会话进行中就能落盘（掉线也不丢），
// 回放侧只按时间戳重放事件即可 —— 不需要装任何播放器依赖，前端用已有的 xterm 就能播。
//
// 格式（每行一条 JSON，首个「o」= 输出、「i」= 输入（用于命令审计）、「r」= 尺寸变更）：
//   {"version":2,"width":120,"height":32,"timestamp":1750000000,"env":{"TERM":"xterm-256color"}}
//   [0.248, "o", "$ ls\r\n"]
//   [1.001, "r", "132x43"]
//
// ★ 录像内容可能含敏感信息（终端里敲过的密码、打印出来的 token）。它只落在本机
//   <DATA_DIR>/ops-recordings/ 下，并且经由 /api 下发 —— 与其它运维接口同一道授权门禁。
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

/** 单条录像的字节上限：超过就停止记录并打截断标记，避免一次 `yes`/刷屏把磁盘写爆 */
export const MAX_RECORDING_BYTES = 8 * 1024 * 1024;
/** 保留条数上限：超出按开始时间淘汰最旧的（同时删掉它的 .cast 文件） */
export const MAX_RECORDINGS = 200;
/** 缓冲多少字节就落一次盘（太小=频繁 syscall，太大=掉线时丢的多） */
const FLUSH_BYTES = 64 * 1024;
const FLUSH_INTERVAL_MS = 1000;

export interface RecordingMeta {
  id: string;
  connectionId: string;
  connectionName: string;
  /** 通道来源：websocket | sse */
  transport: string;
  cols: number;
  rows: number;
  /** 开始时间（epoch ms） */
  startedAt: number;
  /** 结束时间（epoch ms）；仍在录制时为 undefined */
  endedAt?: number;
  /** 已写入的字节数（不含头行） */
  bytes: number;
  /** 时长（秒，3 位小数），未结束时为已录制时长 */
  durationSec: number;
  /** 是否因超限被截断 */
  truncated: boolean;
}

/** asciinema v2 头行 */
export function castHeader(cols: number, rows: number, startedAtMs: number): string {
  const header = {
    version: 2,
    width: Math.max(1, Math.floor(cols) || 80),
    height: Math.max(1, Math.floor(rows) || 24),
    timestamp: Math.floor(startedAtMs / 1000),
    env: { TERM: 'xterm-256color' },
  };
  return `${JSON.stringify(header)}\n`;
}

/** asciinema v2 事件行（时间戳统一 3 位小数秒） */
export function castEvent(tSec: number, type: 'o' | 'i' | 'r', data: string): string {
  const t = Math.max(0, Math.round(tSec * 1000) / 1000);
  return `${JSON.stringify([t, type, data])}\n`;
}

export interface ParsedCast {
  header: { version?: number; width?: number; height?: number; timestamp?: number } | null;
  events: Array<{ t: number; type: string; data: string }>;
  /** 解析不了的行的条数（脏数据不该让整段回放失败） */
  skipped: number;
}

/** 解析 .cast 文本。坏行只计数跳过，不抛错 —— 回放时宁可少放几帧也别整段打不开。 */
export function parseCast(text: string): ParsedCast {
  const lines = text.split('\n');
  let header: ParsedCast['header'] = null;
  const events: ParsedCast['events'] = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { skipped += 1; continue; }
    if (i === 0 && parsed && !Array.isArray(parsed)) {
      header = parsed as ParsedCast['header'];
      continue;
    }
    if (Array.isArray(parsed) && parsed.length >= 3 && typeof parsed[1] === 'string') {
      events.push({ t: Number(parsed[0]) || 0, type: parsed[1], data: String(parsed[2] ?? '') });
      continue;
    }
    skipped += 1;
  }
  return { header, events, skipped };
}

// ---------- 录像目录 ----------

let dirOverride: string | null = null;
/** 仅供单测：把录像目录指到临时目录（生产走 DATA_DIR） */
export function setRecordingsDirForTest(dir: string | null): void {
  dirOverride = dir;
}

/**
 * 录像目录。
 * ★ 刻意不 import db.ts 取 dataDir：db.ts 一加载就会拉起 better-sqlite3，
 *   单测里会因 Node ABI 不匹配直接炸（与本插件其它测试同样的理由）。
 *   这里与 computer-use 的 screenshotsDir 同口径。
 */
export function recordingsDir(): string {
  if (dirOverride) return dirOverride;
  const env = (process.env.DATA_DIR || '').trim();
  return env ? join(env, 'ops-recordings') : join(process.cwd(), 'ops-recordings');
}

/** 录像文件名：只允许 `<我们的 id>.cast`，杜绝路径穿越 */
export function recordingFile(id: string): string | null {
  if (!/^rec-[a-z0-9-]+$/.test(id)) return null;
  return join(recordingsDir(), `${id}.cast`);
}

// ---------- 录制器 ----------

export interface RecorderOptions {
  connectionId: string;
  connectionName: string;
  transport: string;
  cols: number;
  rows: number;
  /** 单条上限，默认 MAX_RECORDING_BYTES */
  maxBytes?: number;
  /** 取时间的方式（单测注入，避免依赖真实时钟） */
  now?: () => number;
}

/**
 * 一条会话的录制器。缓冲写入（非每条事件一次 syscall），
 * 定时 + 超阈值双触发落盘；超上限后停止写入并置 truncated。
 */
export class TermRecorder {
  readonly meta: RecordingMeta;
  private readonly path: string;
  private readonly startedAt: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private pending: string[] = [];
  private pendingBytes = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(opts: RecorderOptions) {
    const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.maxBytes = opts.maxBytes ?? MAX_RECORDING_BYTES;
    this.meta = {
      id,
      connectionId: opts.connectionId,
      connectionName: opts.connectionName,
      transport: opts.transport,
      cols: opts.cols,
      rows: opts.rows,
      startedAt: this.startedAt,
      bytes: 0,
      durationSec: 0,
      truncated: false,
    };
    mkdirSync(recordingsDir(), { recursive: true });
    this.path = join(recordingsDir(), `${id}.cast`);
    // 头行先落盘：即使会话立刻掉线，文件也是合法的 .cast（不会出现只有事件的坏文件）
    appendFileSync(this.path, castHeader(opts.cols, opts.rows, this.startedAt), 'utf8');

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  /** 当前已录制时长（秒） */
  private elapsed(): number {
    return (this.now() - this.startedAt) / 1000;
  }

  private push(line: string): void {
    if (this.stopped) return;
    const size = Buffer.byteLength(line, 'utf8');
    if (this.meta.bytes + this.pendingBytes + size > this.maxBytes) {
      // 超限：写一条截断标记后停止记录，文件本身仍可回放已录部分
      this.pending.push(castEvent(this.elapsed(), 'o', '\r\n[录制已达上限，后续内容未记录]\r\n'));
      this.meta.truncated = true;
      this.flush();
      this.stopped = true;
      return;
    }
    this.pending.push(line);
    this.pendingBytes += size;
    if (this.pendingBytes >= FLUSH_BYTES) this.flush();
  }

  /** PTY 输出（回放的内容主体） */
  output(data: string | Buffer): void {
    if (data === '' || (Buffer.isBuffer(data) && data.length === 0)) return;
    this.push(castEvent(this.elapsed(), 'o', typeof data === 'string' ? data : data.toString('utf8')));
  }

  /** 用户输入（命令审计用；回放时 asciinema 默认不显示输入） */
  input(data: string): void {
    if (!data) return;
    this.push(castEvent(this.elapsed(), 'i', data));
  }

  /** 尺寸变更（回放时按时间点重排，避免长行错位） */
  resize(cols: number, rows: number): void {
    this.meta.cols = cols;
    this.meta.rows = rows;
    this.push(castEvent(this.elapsed(), 'r', `${cols}x${rows}`));
  }

  flush(): void {
    if (!this.pending.length) return;
    const text = this.pending.join('');
    const size = this.pendingBytes;
    this.pending = [];
    this.pendingBytes = 0;
    try {
      appendFileSync(this.path, text, 'utf8');
      this.meta.bytes += size;
    } catch {
      // 落盘失败（磁盘满/权限）不该影响正在跑的终端会话：停止记录即可
      this.stopped = true;
    }
  }

  /** 结束录制，返回最终元数据（会记录 endedAt） */
  stop(): RecordingMeta {
    this.flush();
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    this.stopped = true;
    this.meta.endedAt = this.now();
    this.meta.durationSec = Math.max(0, Math.round(this.elapsed() * 1000) / 1000);
    return this.meta;
  }

  /** 磁盘上的 .cast 内容（回放用）；文件不在了返回 null */
  read(): string | null {
    try { return readFileSync(this.path, 'utf8'); } catch { return null; }
  }

  /** 删除 .cast 文件（淘汰 / 用户删除） */
  remove(): void {
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    this.stopped = true;
    try { unlinkSync(this.path); } catch { /* 已不在 */ }
  }
}

/** 删除某条录像的 .cast 文件（按 id，做路径校验） */
export function removeRecordingFile(id: string): void {
  const p = recordingFile(id);
  if (!p) return;
  try { unlinkSync(p); } catch { /* 已不在 */ }
}

/** 读出某条录像的内容；id 非法或文件缺失返回 null */
export function readRecordingFile(id: string): string | null {
  const p = recordingFile(id);
  if (!p || !existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

/**
 * 目录里的孤儿文件清理：索引里没有的 .cast 一律删掉。
 * 为什么需要：进程崩溃/强杀时 stop() 没跑到，索引没落库，但文件已经在磁盘上了。
 */
export function sweepOrphanRecordings(knownIds: string[]): number {
  const dir = recordingsDir();
  if (!existsSync(dir)) return 0;
  const known = new Set(knownIds);
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.cast')) continue;
      const id = basename(name, '.cast');
      if (known.has(id)) continue;
      try { unlinkSync(join(dir, name)); removed += 1; } catch { /* ignore */ }
    }
  } catch { /* 目录不可读，放弃本轮清理 */ }
  return removed;
}

/** 文件大小（诊断用；缺失返回 0） */
export function recordingFileSize(id: string): number {
  const p = recordingFile(id);
  if (!p || !existsSync(p)) return 0;
  try { return statSync(p).size; } catch { return 0; }
}
