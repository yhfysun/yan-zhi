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
  async readFile(filePath: string) {
    return readFile(filePath, 'utf8');
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

    let stdout = '';
    let stderr = '';
    let settled = false;

    // 采集硬上限：防止超长输出占满内存（工具层还有 64KB 字符级二次截断）
    const MAX_CAPTURE_BYTES = 512 * 1024;
    let outBytes = 0;
    let errBytes = 0;

    const timeout = options?.timeout || 30000;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ stdout, stderr, exitCode: 124 });
      }
    }, timeout);

    child.stdout.on('data', (chunk) => {
      if (outBytes >= MAX_CAPTURE_BYTES) return;
      const s = chunk.toString();
      stdout += s;
      outBytes += Buffer.byteLength(s);
      if (outBytes >= MAX_CAPTURE_BYTES) stdout += '\n[stdout truncated at 512KB capture limit]';
    });
    child.stderr.on('data', (chunk) => {
      if (errBytes >= MAX_CAPTURE_BYTES) return;
      const s = chunk.toString();
      stderr += s;
      errBytes += Buffer.byteLength(s);
      if (errBytes >= MAX_CAPTURE_BYTES) stderr += '\n[stderr truncated at 512KB capture limit]';
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr: error.message, exitCode: 1 });
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      }
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

