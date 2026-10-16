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
  MAX_RECURSIVE_DELETE_ENTRIES, MAX_UPLOAD_CONCURRENCY, auditPathTail, opsShellModule,
  removeRemoteRecursive, runWithConcurrency,
} from '../src/plugins/ops-shell.js';

// ---------- A. 远程递归删除 ----------

/** 极简假 SFTP：stat / lstat / readdir / rmdir / unlink。
 *  节点值：'dir' | 'file' | `link:<目标路径>`。
 *  ★ 语义对齐真实 SFTP（否则「删软链会不会删穿目标」根本测不出来）：
 *    stat / readdir **跟随**软链（父目录总是跟随），lstat 不跟随，unlink/rmdir 作用于解析后的路径，
 *    且 rmdir 对软链必失败（真实服务器就是这样）。 */
function fakeSftp(nodes: Record<string, string>) {
  const calls: string[] = [];
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  /** 逐段解析软链；followLast=false 时最后一段保留为链接自身 */
  const resolve = (p: string, followLast: boolean): string | null => {
    const segs = norm(p).split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < segs.length; i++) {
      cur += '/' + segs[i];
      const kind = nodes[cur];
      if (!kind) return null;
      if (kind.startsWith('link:') && (followLast || i < segs.length - 1)) cur = norm(kind.slice(5));
    }
    return cur || '/';
  };
  const attrsOf = (real: string) => ({
    mode: nodes[real] === 'dir' ? 0o040755 : nodes[real].startsWith('link:') ? 0o120777 : 0o100644,
    size: 1,
    mtime: 1,
  });
  const sftp: any = {
    stat(p: string, cb: any) { const r = resolve(p, true); if (!r || !nodes[r]) { cb(new Error('No such file')); return; } cb(null, attrsOf(r)); },
    lstat(p: string, cb: any) { const r = resolve(p, false); if (!r || !nodes[r]) { cb(new Error('No such file')); return; } cb(null, attrsOf(r)); },
    readdir(p: string, cb: any) {
      const r = resolve(p, true);
      if (!r || !nodes[r]) { cb(new Error('No such file')); return; }
      const prefix = r === '/' ? '/' : `${r}/`;
      const names = Object.keys(nodes)
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => ({ filename: k.slice(prefix.length) }));
      calls.push(`ls ${r}`);
      cb(null, names);
    },
    rmdir(p: string, cb: any) {
      const r = resolve(p, false);
      if (!r || !nodes[r]) { cb(new Error('No such file')); return; }
      if (nodes[r].startsWith('link:')) { cb(new Error('Failure')); return; }
      calls.push(`rmdir ${r}`); delete nodes[r]; cb(null);
    },
    unlink(p: string, cb: any) {
      const r = resolve(p, false);
      if (!r || !nodes[r]) { cb(new Error('No such file')); return; }
      calls.push(`unlink ${r}`); delete nodes[r]; cb(null);
    },
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
      lstat: (_p: string, cb: any) => cb(null, { mode: 0o040755, size: 0, mtime: 0 }),
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

  // ★★ 2026-10-16 用户实报「删除失败: No such file」。
  //   根因：删除侧用的是 stat（**跟随**软链），目录里的**断链**（目标已删）stat 必 ENOENT，
  //   于是界面上这个软链永远删不掉。列表侧一直是按 readdir 的 mode 判类型、不跟随，两边口径不一致。
  it('★ 断链（目标已删的软链）能删掉，不再报 No such file', async () => {
    const { sftp, calls, nodes } = fakeSftp({ '/app': 'dir', '/app/current': 'link:/app/v1-gone' });
    await removeRemoteRecursive(sftp, '/app/current');
    expect(calls).toEqual(['unlink /app/current']);
    expect(nodes['/app/current']).toBeUndefined();
  });

  // ★★ 同一个根因更危险的一面：跟随软链 ⇒ 指向**目录**的软链被判成 dir ⇒ 递归把
  //   **目标目录的内容全删掉**，最后 rmdir 一个软链还必失败。删软链 = 删别人的真数据。
  it('★★ 指向目录的软链只删链接本身，绝不递归删穿目标（数据安全）', async () => {
    const { sftp, calls, nodes } = fakeSftp({
      '/app': 'dir', '/app/current': 'link:/srv/data', '/srv/data': 'dir', '/srv/data/keep.txt': 'file',
    });
    await removeRemoteRecursive(sftp, '/app/current');
    expect(calls).toEqual(['unlink /app/current']);
    expect(nodes['/srv/data/keep.txt'], '★★ 软链目标里的文件被删了 —— 这是数据损失').toBe('file');
    expect(nodes['/app/current']).toBeUndefined();
  });
});

// ---------- A2. 删除留痕（用户要求：删目录时要能实时看到删了哪些文件 + 要有记录）----------

describe('removeRemoteRecursive · onDeleted 逐条回调', () => {
  it('按**实际删除顺序**回调每个条目，且目录必然在它的子项之后', async () => {
    const { sftp } = fakeSftp({
      '/d': 'dir', '/d/a.txt': 'file', '/d/sub': 'dir', '/d/sub/b.txt': 'file',
    });
    const seen: Array<[string, boolean]> = [];
    await removeRemoteRecursive(sftp, '/d', { n: 0 }, (p, isDir) => seen.push([p, isDir]));
    // 界面是拿这个顺序当"实时删除列表"滚动的，顺序错了用户看到的就是乱的
    expect(seen).toEqual([
      ['/d/a.txt', false],
      ['/d/sub/b.txt', false],
      ['/d/sub', true],
      ['/d', true],
    ]);
  });

  it('传了 onDeleted 也不改删除结果（回调只记账，不许动手）', async () => {
    const { sftp, nodes } = fakeSftp({ '/d': 'dir', '/d/a.txt': 'file' });
    await removeRemoteRecursive(sftp, '/d', { n: 0 }, () => { /* 只记账 */ });
    expect(Object.keys(nodes)).toHaveLength(0);
  });

  it('软链只回调链接自身（不穿透回调目标里的文件）', async () => {
    const { sftp } = fakeSftp({
      '/app': 'dir', '/app/current': 'link:/srv/data', '/srv/data': 'dir', '/srv/data/keep.txt': 'file',
    });
    const seen: string[] = [];
    await removeRemoteRecursive(sftp, '/app/current', { n: 0 }, (p) => seen.push(p));
    expect(seen).toEqual(['/app/current']);
  });

  it('不传 onDeleted 时行为与老调用方完全一致（可空参数不该有副作用）', async () => {
    const { sftp, calls } = fakeSftp({ '/d': 'dir', '/d/a.txt': 'file' });
    await removeRemoteRecursive(sftp, '/d');
    expect(calls).toEqual(['ls /d', 'unlink /d/a.txt', 'rmdir /d']);
  });
});

describe('auditPathTail · 审计详情里的路径样本', () => {
  it('空数组 → 空串（详情里不该多出一个孤零零的冒号）', () => {
    expect(auditPathTail([])).toBe('');
  });

  it('少量路径全列出', () => {
    expect(auditPathTail(['/a', '/b'])).toBe('：/a、/b');
  });

  it('★ 最多 12 条：删十万个文件时审计详情不能被撑爆', () => {
    const many = Array.from({ length: 500 }, (_, i) => `/f${i}`);
    const out = auditPathTail(many);
    expect(out.endsWith('…（共 500 项）')).toBe(true);
    expect(out.length).toBeLessThan(600);        // 总长上限（12 条 × 路径 + 后缀）
    expect(out.split('、')).toHaveLength(12);    // 恰好 12 条
  });

  it('★ 总长限制：单条极长路径不会被无限拼接', () => {
    const long = Array.from({ length: 12 }, (_, i) => `/${'x'.repeat(200)}${i}`);
    expect(auditPathTail(long).length).toBeLessThan(600);
  });
});

// ---------- A3. 上传的并发闸门（用户要求："1000 个文件不能同时传"）----------

describe('runWithConcurrency · 有界并发窗口', () => {
  it('★ 同时在飞的数量永不超过上限，且每个条目恰好跑一次', async () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    const seen: number[] = [];
    let flying = 0;
    let peak = 0;
    await runWithConcurrency(items, 4, async (n) => {
      flying += 1;
      peak = Math.max(peak, flying);
      await new Promise((r) => setTimeout(r, 1));
      seen.push(n);
      flying -= 1;
    });
    expect(peak, '同时跑起来的数量超了上限').toBeLessThanOrEqual(4);
    expect(peak, '根本没有并发（退化成串行了）').toBeGreaterThan(1);
    expect(seen.sort((a, b) => a - b), '有条目漏跑或多跑').toEqual(items);
  });

  it('上限大于条目数时按条目数起 worker（不会空转、也不会漏）', async () => {
    const seen: number[] = [];
    let peak = 0;
    let flying = 0;
    await runWithConcurrency([1, 2], 10, async (n) => {
      flying += 1; peak = Math.max(peak, flying);
      await new Promise((r) => setTimeout(r, 1));
      flying -= 1; seen.push(n);
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(seen.sort()).toEqual([1, 2]);
  });

  it('★ 单个条目出错 → 不再领新活，全部收尾后抛**第一个**错误', async () => {
    // 语义很关键：出错就停发新活（在飞的让它跑完），否则会出现"任务已标失败、后台还在传"
    const started: number[] = [];
    let flying = 0;
    let peak = 0;
    await expect(runWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      started.push(n);
      flying += 1; peak = Math.max(peak, flying);
      await new Promise((r) => setTimeout(r, 1));
      flying -= 1;
      if (n === 1) throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(started, '出错后还在继续领新活').toContain(1);
    expect(started.length, '出错后把整批都跑完了').toBeLessThan(20);
  });

  it('空清单直接返回（不 throw、不空转）', async () => {
    let called = 0;
    await expect(runWithConcurrency([], 4, async () => { called += 1; })).resolves.toBeUndefined();
    expect(called).toBe(0);
  });

  it('★ 上限被改成 0 / 负数 / NaN 时按 1 串行跑，绝不"什么都不做"', async () => {
    // 配置是用户可手改的（插件配置项），改坏了不能变成"上传卡住不动"
    for (const bad of [0, -3, Number.NaN]) {
      const seen: number[] = [];
      await runWithConcurrency([1, 2, 3], bad, async (n) => { seen.push(n); });
      expect(seen, `limit=${String(bad)} 时没跑完`).toEqual([1, 2, 3]);
    }
  });

  it('并发上限常量是正的、且有合理上界（单条 SFTP 通道开不了太多路）', () => {
    expect(MAX_UPLOAD_CONCURRENCY).toBeGreaterThan(0);
    expect(MAX_UPLOAD_CONCURRENCY).toBeLessThanOrEqual(64);
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
