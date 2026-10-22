/**
 * 远程权限管理（chmod）的单元测试。
 *
 * 背景（用户要求）：「运维模式，服务器文件新增权限管理功能可以改变目录及其文件的权限」。
 * 这里守住三个容易写错的点：
 *   ① 权限输入的解析 —— 必须按八进制收，且拒绝非法字符（8/9/超长）；
 *   ② 递归改权限**不能穿过软链** —— SFTP 的 chmod 作用于链接目标，穿过去就是改别人的文件；
 *   ③ 单个条目失败不能中断整棵树，失败明细要能回传；条目上限要真的拦住。
 */
import { describe, it, expect, vi } from 'vitest';

// ops-shell 依赖 data.db（取主密钥），单测里换成可逆的假加解密
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import {
  MAX_CHMOD_FAILURES, MAX_RECURSIVE_CHMOD_ENTRIES, chmodRemote, parseModeInput,
} from '../src/plugins/ops-shell.js';

// ---------- A. 权限输入解析 ----------

describe('parseModeInput · 只收八进制', () => {
  it('常见写法都能解析', () => {
    expect(parseModeInput('755')).toBe(0o755);
    expect(parseModeInput('0755')).toBe(0o755);
    expect(parseModeInput('644')).toBe(0o644);
    expect(parseModeInput('4755')).toBe(0o4755); // setuid
    expect(parseModeInput(' 700 ')).toBe(0o700);
    expect(parseModeInput(755)).toBe(0o755);     // 数字按其字面八进制理解，与界面一致
  });

  it('★ 非法输入一律拒绝（8/9 不是八进制数字，超过 4 位也不行）', () => {
    for (const bad of ['8', '999', '12345', '', '   ', 'rwx', '-1', '0o755', null, undefined]) {
      expect(parseModeInput(bad), `应拒绝 ${String(bad)}`).toBeNull();
    }
  });

  it('★ 十进制数字不会蒙混过关（493 含 9，必须报错而不是变成 0755）', () => {
    expect(parseModeInput(493)).toBeNull();
  });
});

// ---------- B. 递归改权限 ----------

/**
 * 极简假 SFTP：lstat / readdir / chmod。
 * 节点值：'dir' | 'file' | `link:<目标>`。
 * 与真实 SFTP 对齐的关键语义：lstat 不跟随软链，chmod 作用于路径本身
 * （若实现方没做软链判断，这里就会把目标文件的 mode 改掉 —— 测试能抓到）。
 */
function fakeSftp(nodes: Record<string, string>, failOn: string[] = []) {
  const chmodCalls: Array<{ path: string; mode: number }> = [];
  const norm = (p: string) => p.replace(/\/+$/, '') || '/';
  const resolve = (p: string, followLast: boolean): string | null => {
    const segs = norm(p).split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < segs.length; i++) {
      cur += '/' + segs[i];
      const kind = nodes[cur];
      if (!kind) return null;
      if (kind.startsWith('link:') && (followLast || i < segs.length - 1)) {
        cur = norm(kind.slice(5));
        // 目标也必须存在，否则与真实服务器一样报 ENOENT
        if (!nodes[cur]) return null;
      }
    }
    return cur || '/';
  };
  const attrs = (real: string) => ({
    mode: nodes[real] === 'dir' ? 0o040755 : String(nodes[real]).startsWith('link:') ? 0o120777 : 0o100644,
    size: 1,
    mtime: 1,
  });
  const sftp: any = {
    lstat(p: string, cb: any) {
      const r = resolve(p, false);
      if (!r || !nodes[r]) { cb(new Error('No such file')); return; }
      cb(null, attrs(r));
    },
    readdir(p: string, cb: any) {
      const r = resolve(p, true);
      if (!r || nodes[r] !== 'dir') { cb(new Error('Not a directory')); return; }
      const prefix = norm(r) + '/';
      const list = Object.keys(nodes)
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => ({ filename: k.slice(prefix.length), attrs: attrs(k) }));
      list.push({ filename: '.', attrs: attrs(r) }, { filename: '..', attrs: attrs(r) });
      cb(null, list);
    },
    chmod(p: string, mode: number, cb: any) {
      const r = resolve(p, false);
      if (!r || !nodes[r]) { cb(new Error('No such file')); return; }
      if (failOn.includes(r)) { cb(new Error('Permission denied')); return; }
      chmodCalls.push({ path: r, mode });
      cb(null);
    },
  };
  return { sftp, chmodCalls };
}

const TREE = {
  '/root': 'dir',
  '/root/a.txt': 'file',
  '/root/sub': 'dir',
  '/root/sub/b.txt': 'file',
  '/root/link': 'link:/outside',
  '/outside': 'file',
};

describe('chmodRemote · 递归与软链', () => {
  it('★ 递归改整棵目录（含文件与子目录）', async () => {
    const { sftp, chmodCalls } = fakeSftp(TREE);
    const changed = await chmodRemote(sftp, '/root', 0o750, true);
    expect(changed).toBe(4);
    expect(chmodCalls.map((c) => c.path).sort()).toEqual(
      ['/root', '/root/a.txt', '/root/sub', '/root/sub/b.txt'].sort(),
    );
    expect(chmodCalls.every((c) => c.mode === 0o750)).toBe(true);
  });

  it('★ 软链被跳过，且软链目标（/outside）不受影响', async () => {
    const { sftp, chmodCalls } = fakeSftp(TREE);
    await chmodRemote(sftp, '/root', 0o700, true);
    const paths = chmodCalls.map((c) => c.path);
    expect(paths).not.toContain('/root/link');
    expect(paths, '★ 穿软链改了目标文件 —— 这就是「改别人的数据」').not.toContain('/outside');
  });

  it('不递归时只改目标本身', async () => {
    const { sftp, chmodCalls } = fakeSftp(TREE);
    const changed = await chmodRemote(sftp, '/root/sub', 0o600, false);
    expect(changed).toBe(1);
    expect(chmodCalls).toEqual([{ path: '/root/sub', mode: 0o600 }]);
  });

  it('顶层目标是软链时一次都不改（路由层还会直接报错）', async () => {
    const { sftp, chmodCalls } = fakeSftp(TREE);
    const changed = await chmodRemote(sftp, '/root/link', 0o777, false);
    expect(changed).toBe(0);
    expect(chmodCalls).toHaveLength(0);
  });
});

describe('chmodRemote · 失败与上限', () => {
  it('★ 单个条目失败不中断整棵树，失败明细可回传', async () => {
    const { sftp, chmodCalls } = fakeSftp(TREE, ['/root/a.txt']);
    const failures: Array<{ path: string; error: string }> = [];
    const changed = await chmodRemote(sftp, '/root', 0o755, true, { n: 0 }, failures);
    expect(changed).toBe(3);
    expect(failures).toHaveLength(1);
    expect(failures[0].path).toBe('/root/a.txt');
    expect(failures[0].error).toMatch(/Permission denied/);
    // 失败之后仍继续处理了子目录
    expect(chmodCalls.map((c) => c.path)).toContain('/root/sub/b.txt');
  });

  it('失败明细有上限，不会无限膨胀', async () => {
    const nodes: Record<string, string> = { '/d': 'dir' };
    const failOn: string[] = [];
    for (let i = 0; i < MAX_CHMOD_FAILURES + 10; i++) {
      nodes[`/d/f${i}`] = 'file';
      failOn.push(`/d/f${i}`);
    }
    const { sftp } = fakeSftp(nodes, failOn);
    const failures: Array<{ path: string; error: string }> = [];
    const changed = await chmodRemote(sftp, '/d', 0o644, true, { n: 0 }, failures);
    expect(changed).toBe(1); // 只有目录本身成功
    expect(failures).toHaveLength(MAX_CHMOD_FAILURES);
  });

  it('★ 条目数超过上限时中止（避免长时间占用连接）', async () => {
    const { sftp } = fakeSftp({ '/a': 'file' });
    await expect(
      chmodRemote(sftp, '/a', 0o755, false, { n: MAX_RECURSIVE_CHMOD_ENTRIES }),
    ).rejects.toThrow(/超过/);
  });
});
