/**
 * 目录级操作正式测试类：远程递归删除 + 本地 fs 路由。
 *
 * 背景（用户实报）：「目录管理里面右击删除/重命名/复制都没了？目录和文件都要支持」
 * 根因有两处：
 *   ① 远程删除只调了 `rmdir` —— **非空目录必失败**，而界面对目录也显示「删除」；
 *   ② 本地栏**整个没有右键菜单**，重命名/删除/新建目录全缺。
 *
 * 这里守住后端这一半：递归删除的深度优先与条目上限、本地 fs 的两道自保
 * （拒绝根路径、删目录必须显式 recursive）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// crypto 依赖 data.db（取主密钥），单测里换成可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import {
  MAX_RECURSIVE_DELETE_ENTRIES, opsShellModule, removeRemoteRecursive,
} from '../src/plugins/ops-shell.js';

// ---------- A. 远程递归删除 ----------

/** 极简假 SFTP：只实现 stat / readdir / rmdir / unlink，够跑递归删除 */
function fakeSftp(nodes: Record<string, 'dir' | 'file'>) {
  const calls: string[] = [];
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  const sftp: any = {
    stat(p: string, cb: any) {
      const kind = nodes[norm(p)];
      if (!kind) { cb(new Error('no such file')); return; }
      cb(null, { mode: kind === 'dir' ? 0o040755 : 0o100644, size: 1, mtime: 1 });
    },
    readdir(p: string, cb: any) {
      const prefix = norm(p) === '/' ? '/' : `${norm(p)}/`;
      const names = Object.keys(nodes)
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => ({ filename: k.slice(prefix.length) }));
      calls.push(`ls ${norm(p)}`);
      cb(null, names);
    },
    rmdir(p: string, cb: any) { calls.push(`rmdir ${norm(p)}`); delete nodes[norm(p)]; cb(null); },
    unlink(p: string, cb: any) { calls.push(`unlink ${norm(p)}`); delete nodes[norm(p)]; cb(null); },
  };
  return { sftp: sftp as never, calls, nodes };
}

describe('removeRemoteRecursive · 目录连同内容一起删', () => {
  it('单个文件 → 直接 unlink，不去 readdir', async () => {
    const { sftp, calls } = fakeSftp({ '/a.txt': 'file' });
    await removeRemoteRecursive(sftp, '/a.txt');
    expect(calls).toEqual(['unlink /a.txt']);
  });

  it('★ 非空目录不再失败（这正是旧实现 rmdir 必挂的场景）', async () => {
    const { sftp, calls, nodes } = fakeSftp({ '/d': 'dir', '/d/a.txt': 'file', '/d/b.txt': 'file' });
    await removeRemoteRecursive(sftp, '/d');
    expect(Object.keys(nodes)).toHaveLength(0);
    // 先删子项、最后才 rmdir 自己（顺序反了会因目录非空而失败）
    expect(calls[calls.length - 1]).toBe('rmdir /d');
    expect(calls.filter((c) => c.startsWith('unlink')).sort()).toEqual(['unlink /d/a.txt', 'unlink /d/b.txt']);
  });

  it('★ 多级嵌套深度优先：子目录在父目录之前被删', async () => {
    const { sftp, calls, nodes } = fakeSftp({
      '/d': 'dir', '/d/sub': 'dir', '/d/sub/deep.txt': 'file', '/d/top.txt': 'file',
    });
    await removeRemoteRecursive(sftp, '/d');
    expect(Object.keys(nodes)).toHaveLength(0);
    const rmdirSub = calls.indexOf('rmdir /d/sub');
    const rmdirTop = calls.indexOf('rmdir /d');
    expect(rmdirSub).toBeGreaterThanOrEqual(0);
    expect(rmdirSub).toBeLessThan(rmdirTop);
    expect(calls.indexOf('unlink /d/sub/deep.txt')).toBeLessThan(rmdirSub);
  });

  it('忽略 . 与 .. （readdir 通常会带上，不能当子项去删）', async () => {
    const unlinked: string[] = [];
    const sftp: any = {
      stat: (_p: string, cb: any) => cb(null, { mode: 0o040755, size: 0, mtime: 0 }),
      readdir: (_p: string, cb: any) => cb(null, [{ filename: '.' }, { filename: '..' }]),
      rmdir: (_p: string, cb: any) => cb(null),
      unlink: (p: string, cb: any) => { unlinked.push(p); cb(null); },
    };
    await removeRemoteRecursive(sftp, '/empty');
    expect(unlinked).toEqual([]);   // 没有对 . / .. 发过 unlink
  });

  it('★ 条目超上限就中止（几万条的目录不该把这条连接占死）', async () => {
    const { sftp } = fakeSftp({ '/d': 'dir' });
    await expect(removeRemoteRecursive(sftp, '/d', { n: MAX_RECURSIVE_DELETE_ENTRIES }))
      .rejects.toThrow(/条目超过/);
  });

  it('路径里的尾斜杠不影响结果', async () => {
    const { sftp, nodes } = fakeSftp({ '/d': 'dir', '/d/a.txt': 'file' });
    await removeRemoteRecursive(sftp, '/d/');
    expect(Object.keys(nodes)).toHaveLength(0);
  });
});

// ---------- B. 本地 fs 路由 ----------

type Handler = (req: unknown, res: unknown) => Promise<void> | void;
function makeStorage() {
  const store = new Map<string, unknown>();
  return {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => { store.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); },
  };
}
function mockRes() {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { res.statusCode = c; return res; },
    json(d: unknown) { res.body = d; return res; },
  };
  return res;
}

let root: string;
let routes: Array<{ method: string; pattern: string; handler: Handler }>;

async function activate() {
  routes = [];
  const ctx = {
    id: 'ops-shell', log: () => {}, adapter: {}, config: {},
    registerTool: () => ({ dispose: () => {} }),
    registerBackendRoute: (setup: (app: unknown) => void) => {
      const app = {
        get: (p: string, h: Handler) => routes.push({ method: 'GET', pattern: p, handler: h }),
        post: (p: string, h: Handler) => routes.push({ method: 'POST', pattern: p, handler: h }),
        put: (p: string, h: Handler) => routes.push({ method: 'PUT', pattern: p, handler: h }),
        delete: (p: string, h: Handler) => routes.push({ method: 'DELETE', pattern: p, handler: h }),
      };
      setup(app);
      return { dispose: () => {} };
    },
    registerWebSocket: () => ({ dispose: () => {} }),
    storage: makeStorage(), emit: () => {}, on: () => ({ dispose: () => {} }),
  };
  await opsShellModule.activate(ctx as never);
}

async function call(method: string, path: string, body: Record<string, unknown> = {}) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method) continue;
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) { ok = false; break; }
    }
    if (!ok) continue;
    const res = mockRes();
    await r.handler({ body, params, query: {} }, res);
    return res;
  }
  throw new Error(`路由未注册: ${method} ${path}`);
}
const errOf = (res: ReturnType<typeof mockRes>) => (res.body as { error?: string }).error;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'ops-local-'));
  await activate();
});
afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('本地 fs 路由 · 新建 / 重命名 / 删除', () => {
  it('新建目录（含不存在的父级）', async () => {
    const p = join(root, 'a', 'b');
    const res = await call('POST', '/local/mkdir', { path: p });
    expect(res.statusCode).toBe(200);
    expect(existsSync(p)).toBe(true);
  });

  it('路径为空 → 400', async () => {
    expect((await call('POST', '/local/mkdir', { path: '  ' })).statusCode).toBe(400);
  });

  it('重命名', async () => {
    const from = join(root, 'old.txt');
    writeFileSync(from, 'x');
    const to = join(root, 'new.txt');
    const res = await call('POST', '/local/rename', { from, to });
    expect(res.statusCode).toBe(200);
    expect(existsSync(to)).toBe(true);
    expect(existsSync(from)).toBe(false);
  });

  it('★ 拒绝操作文件系统根路径（删了不可挽回）', async () => {
    expect((await call('POST', '/local/rename', { from: '/', to: join(root, 'x') })).statusCode).toBe(400);
    expect((await call('POST', '/local/delete', { path: '/', recursive: true })).statusCode).toBe(400);
    expect((await call('POST', '/local/delete', { path: 'C:', recursive: true })).statusCode).toBe(400);
  });

  it('★ 删目录必须显式带 recursive（纯本地接口，静默递归删整棵树太容易误伤）', async () => {
    const dir = join(root, 'd');
    mkdirSync(dir);
    const res = await call('POST', '/local/delete', { path: dir });
    expect(res.statusCode).toBe(400);
    expect(errOf(res)).toMatch(/recursive/);
    expect(existsSync(dir)).toBe(true);          // 没删掉
  });

  it('★ 带文件的目录也能删（用户要的就是这条）', async () => {
    const dir = join(root, 'd');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'a.txt'), 'x');
    writeFileSync(join(dir, 'sub', 'b.txt'), 'x');
    const res = await call('POST', '/local/delete', { path: dir, recursive: true });
    expect(res.statusCode).toBe(200);
    expect(existsSync(dir)).toBe(false);
  });

  it('删单个文件不需要 recursive', async () => {
    const f = join(root, 'one.txt');
    writeFileSync(f, 'x');
    expect((await call('POST', '/local/delete', { path: f })).statusCode).toBe(200);
    expect(existsSync(f)).toBe(false);
  });

  it('不存在的路径 → 500 且带原因（不是静默成功）', async () => {
    const res = await call('POST', '/local/delete', { path: join(root, 'nope') });
    expect(res.statusCode).toBe(500);
    expect(errOf(res)).toBeTruthy();
  });
});
