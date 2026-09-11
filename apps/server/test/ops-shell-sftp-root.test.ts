/**
 * ops-shell SFTP 起始目录解析 / 本地目录创建的正式测试类。
 *
 * 背景：远程起始目录原先固定取 sftpPath || '/'，未配置时直接列根目录 ——
 * 很多服务器上既没内容也可能无权限，界面上表现为「文件列表什么都没有」。
 * 现在未配置时用 realpath('.') 取登录用户 home（即远程「用户目录」）。
 *
 * 本文件覆盖 resolveRemoteRoot 的全部分支 + ensureLocalDir 的递归创建。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SFTPWrapper } from 'ssh2';

// crypto 依赖 data.db（app_config 取主密钥），单测里替换为可逆的假加解密，
// 否则 import ops-shell 会连带加载 better-sqlite3（与当前 Node ABI 不匹配）
vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `ENC:${s}`,
  decrypt: (s: string) => String(s).replace(/^ENC:/, ''),
}));

import { resolveRemoteRoot, ensureLocalDir } from '../src/plugins/ops-shell.js';

/** 构造只提供 realpath 的假 SFTPWrapper（其余方法用不到）。注意 ssh2 的签名是 realpath(path, cb) */
type RealpathCb = (err: Error | null, p?: string) => void;
function fakeSftp(impl: (path: string, cb: RealpathCb) => void): SFTPWrapper {
  return { realpath: impl } as unknown as SFTPWrapper;
}

const okSftp = (home: string) => fakeSftp((_p, cb) => cb(null, home));
const errSftp = (msg: string) => fakeSftp((_p, cb) => cb(new Error(msg)));

describe('resolveRemoteRoot · 远程用户目录解析', () => {
  it('已配置绝对路径 → 规范化后原样返回，不去问 realpath', async () => {
    let called = false;
    const sftp = fakeSftp((cb) => { called = true; cb(null, '/home/other'); });
    expect(await resolveRemoteRoot(sftp, '/data/www')).toBe('/data/www');
    expect(called).toBe(false);
  });

  it('已配置相对路径 → 补成根下绝对路径', async () => {
    const sftp = errSftp('不应被调用');
    expect(await resolveRemoteRoot(sftp, 'www/html')).toBe('/www/html');
  });

  it('已配置路径带 ../ 穿越 → 消除穿越', async () => {
    const sftp = errSftp('不应被调用');
    expect(await resolveRemoteRoot(sftp, '/data/../etc')).toBe('/etc');
  });

  it('未配置 + realpath 成功 → 返回登录用户 home', async () => {
    const sftp = okSftp('/root');
    expect(await resolveRemoteRoot(sftp, undefined)).toBe('/root');
  });

  it('未配置 + home 末尾带斜杠 → 归一化掉多余斜杠', async () => {
    const sftp = okSftp('/home/deploy/');
    expect(await resolveRemoteRoot(sftp, '')).toBe('/home/deploy');
  });

  it('未配置 + realpath 报错 → 回退根目录', async () => {
    const sftp = errSftp('permission denied');
    expect(await resolveRemoteRoot(sftp, undefined)).toBe('/');
  });

  it('未配置 + realpath 返回空串 → 回退根目录（不返回空路径）', async () => {
    const sftp = okSftp('');
    expect(await resolveRemoteRoot(sftp, undefined)).toBe('/');
  });

  it('已配置但只有空白 → 视为未配置，走 realpath', async () => {
    const sftp = okSftp('/home/dev');
    expect(await resolveRemoteRoot(sftp, '   ')).toBe('/home/dev');
  });
});

describe('ensureLocalDir · 本地下载目录创建', () => {
  const created: string[] = [];
  const track = (p: string) => { created.push(p); return p; };
  afterEach(() => {
    for (const p of created.splice(0)) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('多级不存在目录 → 递归建出来', () => {
    const root = track(mkdtempSync(join(tmpdir(), 'ops-ensure-')));
    const deep = join(root, 'a', 'b', 'c');
    expect(existsSync(deep)).toBe(false);
    ensureLocalDir(deep);
    expect(existsSync(deep)).toBe(true);
  });

  it('目录已存在 → 不抛错（幂等）', () => {
    const root = track(mkdtempSync(join(tmpdir(), 'ops-ensure-')));
    ensureLocalDir(root);
    expect(() => ensureLocalDir(root)).not.toThrow();
    expect(existsSync(root)).toBe(true);
  });

  it('路径不可用（指向已存在文件下）→ 吞掉异常，不向外抛', () => {
    const root = track(mkdtempSync(join(tmpdir(), 'ops-ensure-')));
    // root 是目录，其「子路径」必然创建失败：root/a 先作为文件存在时再往其下建目录
    const asFile = join(root, 'file');
    ensureLocalDir(asFile);
    expect(() => ensureLocalDir(join(asFile, 'nested'))).not.toThrow();
  });
});
