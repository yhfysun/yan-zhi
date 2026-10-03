import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  DatabaseAdapter,
  DirEntryInfo,
  FsAdapter,
  KeyringAdapter,
  LlmKeyPoolAdapter,
  PlatformAdapter,
  ShellAdapter,
} from '@yan-zhi/core';
import { decodeTextBytes } from '@yan-zhi/shared';
import { pickToken, recordFailure, recordSuccess } from './services/token-pool.js';
import { serverState } from './state.js';

// 服务端 database adapter：委托真实的 better-sqlite3 实例（./db.ts 的 db）。
// 注意：此处绝不能是空实现 —— @yan-zhi/core 的 PluginManager 依赖 adapter.db 建表与读写
// plugin / plugin_storage，空实现会导致建表语句静默失效（曾致运维控制台连接保存后列表为空）。
// 走动态 import 避免循环依赖（db.ts 本身不依赖本模块）。
async function getDb() {
  const { db } = await import('./db.js');
  return db;
}

const dbAdapter: DatabaseAdapter = {
  async exec(sql: string, params?: unknown[]) {
    const db = await getDb();
    // 带参 → 预编译执行；无参 → 交给 exec（可含多条语句 / 建表 DDL）
    if (params && params.length) db.prepare(sql).run(...(params as never[]));
    else db.exec(sql);
  },
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await getDb();
    return db.prepare(sql).all(...((params || []) as never[])) as T[];
  },
  // better-sqlite3 是同步 API，这里用 BEGIN/COMMIT 包裹异步回调仅为接口对齐；
  // 插件系统的实际写入都是单条语句，不依赖此处的原子性。
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = await getDb();
    db.exec('BEGIN');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  },
};

const fsAdapter: FsAdapter = {
  // ★ 不能写死 'utf8'（2026-09-27 乱码根因）：GBK/ANSI 中文 txt 用 UTF-8 解会满屏 U+FFFD。
  //   先读字节再走 shared 的自动识别（BOM → 严格 UTF-8 → GB18030 兜底）。
  async readFile(filePath: string) {
    const buf = await readFile(filePath);
    return decodeTextBytes(new Uint8Array(buf)).text;
  },
  async readFileBase64(filePath: string) {
    return readFile(filePath).then((buf) => buf.toString('base64'));
  },
  async writeFile(filePath: string, content: string) {
    await mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);
    await writeFile(filePath, content, 'utf8');
  },
  async writeFileBase64(filePath: string, b64: string) {
    await mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);
    await writeFile(filePath, Buffer.from(b64, 'base64'));
  },
  async exists(filePath: string) {
    return stat(filePath).then(() => true).catch(() => false);
  },
  async mkdir(dirPath: string) {
    await mkdir(dirPath, { recursive: true });
  },
  async remove(filePath: string) {
    await rm(filePath, { recursive: true, force: true });
  },
  async readDir(dirPath: string) {
    return readdir(dirPath);
  },
  async listDirEntries(dirPath: string): Promise<DirEntryInfo[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const info = await stat(fullPath).catch(() => null);
        return {
          name: entry.name,
          path: fullPath,
          isDir: info?.isDirectory() ?? false,
        };
      }),
    );
  },
};

const keyringAdapter: KeyringAdapter = {
  async set() {},
  async get(key: string) {
    const m = key.match(/^platform:(.+):apikey$/);
    if (m) {
      try {
        const { getActiveApiKey } = await import('./services/token-pool.js');
        const tokenKey = getActiveApiKey(m[1]);
        if (tokenKey) return tokenKey;
      } catch {}
      const { db } = await import('./db.js');
      const row = db.prepare('SELECT api_key_enc FROM platform WHERE id = ?').get(m[1]) as any;
      return row?.api_key_enc || null;
    }
    return null;
  },
  async delete() {},
};

/**
 * 子进程输出按**字节**解码（唯一出口）。
 *
 * ★★★ 为什么必须这样（2026-10-01 用户实报「安装包任务里工具输出乱码」的真因）：
 *   Windows 下子进程的输出编码**不是 UTF-8**，而是 **OEM 代码页（GBK/CP936）**：
 *     · `cmd.exe /c echo 中文` / `dir` / `type` → GBK 字节（实测 15B `d6d0cec4…`）；
 *     · Python 在无 `PYTHONIOENCODING` 时 `sys.stdout.encoding = gbk` → 中文 print 是 GBK 字节。
 *   而这里原先写的是 `chunk.toString()`（无参 = 按 **UTF-8** 解）→ 每个汉字落到非法序列 →
 *   满屏 U+FFFD（用户看到的乱码）。dev 模式常常"没毛病"是因为终端/父进程注入了
 *   `PYTHONIOENCODING=utf-8`（WorkBuddy 环境即如此），安装版双击启动则没有 —— 这就是
 *   「安装包有问题、dev 正常」的典型成因。
 *   ⇒ 累积完整字节后统一走 shared 的自动识别（BOM → 严格 UTF-8 → GB18030 兜底），GBK 字节
 *     在严格 UTF-8 解码处抛错 → 落到 GB18030 分支 → 正确还原。
 *
 * ★ 顺带修掉的老隐患：原实现**逐块** `toString()`，多字节字符跨 chunk 边界会被解坏
 *   （累积后统一解则不会）。
 *
 * ⚠️ 多字节编码的**分块边界**：仍要求"累积完整再解"。不要退回逐块解码。
 */
function decodeChildOutput(buf: Buffer): string {
  if (!buf.length) return '';
  return decodeTextBytes(new Uint8Array(buf)).text;
}

function execCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options?.cwd || serverState.workspaceDir || process.cwd(),
      env: { ...process.env, ...(options?.env || {}) },
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    // 采集硬上限：防止超长输出占满内存（工具层还有 64KB 字符级二次截断）
    const MAX_CAPTURE_BYTES = 512 * 1024;
    // ★ 按字节累积（不做逐块 toString()，见 decodeChildOutput 说明）
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let outTruncated = false;
    let errTruncated = false;
    let settled = false;

    const finish = (exitCode: number, stderrOverride?: string): void => {
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: decodeChildOutput(Buffer.concat(outChunks)) +
          (outTruncated ? '\n[stdout truncated at 512KB capture limit]' : ''),
        stderr: stderrOverride ??
          (decodeChildOutput(Buffer.concat(errChunks)) +
            (errTruncated ? '\n[stderr truncated at 512KB capture limit]' : '')),
        exitCode,
      });
    };

    const timeout = options?.timeout || 30000;
    const timer = setTimeout(() => {
      if (settled) return;
      try { child.kill(); } catch { /* 已退出 */ }
      finish(124);
    }, timeout);

    child.stdout.on('data', (chunk: Buffer) => {
      if (outBytes >= MAX_CAPTURE_BYTES) return;
      outChunks.push(chunk);
      outBytes += chunk.length;
      if (outBytes >= MAX_CAPTURE_BYTES) outTruncated = true;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errBytes >= MAX_CAPTURE_BYTES) return;
      errChunks.push(chunk);
      errBytes += chunk.length;
      if (errBytes >= MAX_CAPTURE_BYTES) errTruncated = true;
    });
    child.on('error', (error) => {
      if (!settled) finish(1, error.message);
    });
    child.on('close', (code) => {
      if (!settled) finish(code ?? 0);
    });
  });
}

const shellAdapter: ShellAdapter = {
  async exec(command, args, options) {
    return execCommand(command, args, options);
  },
};

/** LLM Token 池适配：对接 services/token-pool，供 LlmClient 直连时换 Key 重试并回写失败记录 */
const llmKeyPoolAdapter: LlmKeyPoolAdapter = {
  async acquire(platformId: string, excludeIds: string[]) {
    const t = pickToken(platformId, excludeIds);
    return t ? { id: t.id, apiKey: t.apiKey } : null;
  },
  reportSuccess(id: string) {
    try { recordSuccess(id); } catch {}
  },
  reportFailure(id: string) {
    try { recordFailure(id); } catch {}
  },
};

export const nodeAdapter: PlatformAdapter = {
  platform: 'web',
  db: dbAdapter,
  fs: fsAdapter,
  keyring: keyringAdapter,
  llmKeyPool: llmKeyPoolAdapter,
  shell: shellAdapter,
};

