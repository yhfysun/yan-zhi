import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type {
  DatabaseAdapter,
  DirEntryInfo,
  FsAdapter,
  KeyringAdapter,
  LlmKeyPoolAdapter,
  PlatformAdapter,
  ShellAdapter,
} from '@yan-zhi/core';
import { decodeTextBytes, encodeTextBytes, type TextEncoding } from '@yan-zhi/shared';
import { pickToken, recordFailure, recordSuccess, hasTokenPool } from './services/token-pool.js';
import { decideWriteEncoding } from './services/text-write-encoding.js';
import { quoteArgsForWindowsShell, quoteCmdArg } from './services/shell-quote.js';
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

/**
 * 路径 → 上次读出的编码（写回时原样还原）。
 * ★★★ 2026-10-21 用户实报：「默认都 utf-8？gbk 也要支持啊，修改文件肯定要根据文件编码类型啊」
 *   读侧早就会识别 GBK/UTF-16，但写侧写死 'utf8' ⇒ 模型改一次 GBK 的 .bat/.txt，
 *   整份文件被悄悄转成 UTF-8，cmd/记事本/老程序立刻乱码，而且**没有任何提示**。
 *   这里记住读出来的编码 + BOM，落盘时按原样写回（看不到就按盘上现有字节判断）。
 */
const pathEncoding = new Map<string, { encoding: TextEncoding; bom?: TextEncoding }>();
const encKey = (p: string) => p.replace(/\\/g, '/').toLowerCase();

const fsAdapter: FsAdapter = {
  // ★ 不能写死 'utf8'（2026-09-27 乱码根因）：GBK/ANSI 中文 txt 用 UTF-8 解会满屏 U+FFFD。
  //   先读字节再走 shared 的自动识别（BOM → 严格 UTF-8 → GB18030 兜底）。
  async readFile(filePath: string) {
    const buf = await readFile(filePath);
    const decoded = decodeTextBytes(new Uint8Array(buf));
    pathEncoding.set(encKey(filePath), { encoding: decoded.encoding, bom: decoded.bom });
    return decoded.text;
  },
  async readFileBase64(filePath: string) {
    return readFile(filePath).then((buf) => buf.toString('base64'));
  },
  async writeFile(filePath: string, content: string) {
    await mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);

    // ① 定编码：本进程读过 → 用读到的；没读过但盘上有 → 用盘上的；都没有 → 按新文件规则
    const key = encKey(filePath);
    let meta = pathEncoding.get(key);
    if (!meta) {
      const existing = await readFile(filePath).catch(() => null);
      if (existing) {
        const decoded = decodeTextBytes(new Uint8Array(existing));
        meta = { encoding: decoded.encoding, bom: decoded.bom };
      }
    }

    const plan = decideWriteEncoding(filePath, content, meta);
    const body = plan.crlf ? content.replace(/\r?\n/g, '\r\n') : content;
    const bytes = encodeTextBytes(body, plan.encoding, { withBom: plan.withBom });
    await writeFile(filePath, bytes);
    pathEncoding.set(key, { encoding: plan.encoding, bom: plan.withBom ? plan.encoding : undefined });
  },
  async writeFileBase64(filePath: string, b64: string) {
    await mkdir(path.dirname(filePath), { recursive: true }).catch(() => undefined);
    await writeFile(filePath, Buffer.from(b64, 'base64'));
    // ★ 字节级写入后，路径上记的"原编码"就过期了：file_transcode 把 GBK 转成 UTF-8 之后，
    //   若缓存还留着 gb18030，紧接着的一次 file_edit 会把内容按 GBK 写回去 —— 转码等于没转。
    pathEncoding.delete(encKey(filePath));
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

/**
 * 按**进程树**杀子进程（2026-10-23）。
 * ★ 为什么：win32 下 `shell:true` 会多一层 `cmd.exe /d /s /c`，`child.kill()` 只终止
 *   这层壳，真正的 python / ffmpeg 会变成孤儿继续跑（用户实报：任务已停，黑窗口里的
 *   `[tts] seg_xxx` 还在刷）。`taskkill /T /F` 按进程树清；POSIX 直接 SIGKILL。
 */
function killTree(child: import('node:child_process').ChildProcess): void {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    try {
      // ★ 必须**同步**等 taskkill 跑完：异步 spawn 出去后调用方立刻 resolve/退出，
      //   taskkill 可能还没执行就被一起带走（实测：python 活着、cmd 壳已被回收）。
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      return;
    } catch { /* taskkill 不可用 → 走兜底 */ }
  }
  try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
}

function execCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; env?: Record<string, string>; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const useShell = process.platform === 'win32';
    // 命令本身是带空格的路径（如安装目录下的 python.exe）也要加引号；但含 shell 元字符的
    // 「整条命令行」不能包引号（会改变语义），只在纯路径形态下处理。
    const spawnCmd = useShell && /\s/.test(command) && !/[&|<>^(]/.test(command)
      ? quoteCmdArg(command)
      : command;
    const child = spawn(spawnCmd, useShell ? quoteArgsForWindowsShell(args) : args, {
      cwd: options?.cwd || serverState.workspaceDir || process.cwd(),
      env: { ...process.env, ...(options?.env || {}) },
      shell: useShell,
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
      if (onAbort) options?.signal?.removeEventListener('abort', onAbort);
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
      killTree(child);
      finish(124);
    }, timeout);

    // ★ 任务中止（用户点「停止」）要真的停：此前 abort 只让上层不再等，子进程照跑到底
    //   （实测：停掉任务后 python 仍在出片，黑窗口一直在刷）。这里把信号接到进程树上。
    const onAbort = (): void => {
      if (settled) return;
      killTree(child);
      finish(143, '已停止（用户中止）');
    };
    if (options?.signal) {
      if (options.signal.aborted) { onAbort(); return; }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

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
  async hasAny(platformId: string) {
    // ★ 供 core 区分「从未建池（可回退 keyring）」与「建过池但全停用（禁回退，防过期 Key 复活）」
    return hasTokenPool(platformId);
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

