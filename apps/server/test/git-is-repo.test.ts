/**
 * Git 探针与一键初始化 —— 守门测试（2026-10-16）。
 *
 * ★★★ 背景（用户实报）：工作目录是普通文件夹时，前端 Git 区一次进入齐刷刷四条 400
 *   （status/branches/conflicts/log 都会被 simple-git 的 `fatal: not a git repository` 打回）。
 *   修法是**先探针再拉数据**，所以探针本身必须满足两条硬性口径：
 *     ① 「不是仓库」是**正常结论**，不是错误 —— 必须不抛异常地返回 isRepo:false，
 *        抛了前端就只能走 400 分支，等于没修；
 *     ② 探针要能识别**上级目录**上的仓库（`git rev-parse --show-toplevel` 的语义），
 *        而不是只看目标目录下有没有 `.git` —— 用户在仓库子目录里也该正常用 Git。
 *
 * 这里用真实临时目录 + 真实 `git init` 跑，不 mock simple-git：本模块的价值全在
 * "真的调了 git 之后结论对不对"，mock 掉 git 就等于只测了自己复述的假设。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitService } from '../src/services/git.js';

/** Windows 路径归一化：tmpdir() 在 Windows 上可能返回 8.3 短名（C:\Users\ADMINI~1\...），
 *  而 `git rev-parse --show-toplevel` 返回的是规范长名（C:\Users\Administrator\...），
 *  path.resolve 不做这两种归一化 → 直接字符串比对必炸（实测两处 root 断言全挂）。
 *  realpathSync.native 走 GetFinalPathNameByHandle：展开短名 + 纠正大小写；
 *  再统一小写兜底（Windows 文件系统大小写不敏感）。 */
const canonWin = (p: string): string => realpathSync.native(p).toLowerCase();

let dir = '';

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'yz-git-probe-'));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe('gitService.isRepo：普通目录必须得到一个"正常结论"，不是异常', () => {
  it('★ 未初始化的目录 → 不抛异常，isRepo:false 且 root 为 null', async () => {
    const r = await gitService.isRepo(dir);
    expect(r.isRepo).toBe(false);
    expect(r.root).toBeNull();
  });

  it('★ initRepo 之后 → isRepo:true，且 root 就是该目录', async () => {
    await gitService.initRepo(dir);
    const r = await gitService.isRepo(dir);
    expect(r.isRepo).toBe(true);
    expect(canonWin(r.root as string)).toBe(canonWin(dir));
  });

  it('★★ 仓库的**子目录**也判为 isRepo:true（rev-parse 会往上找，语义不能退化成"看有没有 .git"）', async () => {
    const sub = path.join(dir, 'novel', '第一本');
    await fs.mkdir(sub, { recursive: true });
    const r = await gitService.isRepo(sub);
    expect(r.isRepo).toBe(true);
    expect(canonWin(r.root as string)).toBe(canonWin(dir));
  });

  it('相对路径仍被工作目录守卫拒绝（探针没有开后门）', async () => {
    await expect(gitService.isRepo('some-relative-dir')).rejects.toThrow();
  });
});
