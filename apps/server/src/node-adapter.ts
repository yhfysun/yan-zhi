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

const dbAdapter: DatabaseAdapter = {
  async exec() {
    // 服务端工具通过 better-sqlite3 访问数据，不经过此适配器。
  },
  async query() {
    return [];
  },
  async transaction(fn) {
    return fn();
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

