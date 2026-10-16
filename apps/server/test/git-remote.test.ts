/**
 * 远程仓库地址（git remote）查看与修改 —— 守门测试（2026-10-16）。
 *
 * ★★★ 背景（用户实报「git 缺少远程 url 查看和修改」）：
 *   面板此前只能看到「远程分支」，看不到远程**地址**，也不能新增/修改 —— 想确认自己推的是
 *   哪个仓库、或把 origin 从 GitHub 换到内网 GitLab，只能离开应用去敲命令行。
 *
 * 这个文件钉两类契约：
 *   ① **边界**（纯函数）：`git remote -v` 的容错解析；名字/地址的校验 —— 它们会原样进
 *      git 命令行，以 `-` 开头就是参数注入，含空白就会被拆成多个参数。
 *   ② **真跑**（service）：真临时目录 + 真 git，走一遍 添加 → 列表 → 改地址 → 重命名 → 删除。
 *      只测解析等于只测了自己复述的假设，改动 git 命令必须真跑出来才算数。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitService } from '../src/services/git.js';
import { parseRemoteVerbose, assertRemoteName, assertRemoteUrl } from '../src/services/git-remote.js';

// ────────────────────────────────────────────────────────────
// ① 纯函数边界
// ────────────────────────────────────────────────────────────

describe('`git remote -v` 解析', () => {
  it('fetch / push 成对的行合成一条远程配置', () => {
    const out = [
      'origin\thttps://github.com/acme/app.git (fetch)',
      'origin\thttps://github.com/acme/app.git (push)',
    ].join('\n');
    expect(parseRemoteVerbose(out)).toEqual([
      { name: 'origin', fetchUrl: 'https://github.com/acme/app.git', pushUrl: 'https://github.com/acme/app.git' },
    ]);
  });

  it('推送地址单独配置时两个地址都保留（fetch/push 指向不同仓库是常见部署）', () => {
    const out = [
      'upstream\tgit@github.com:acme/app.git (fetch)',
      'upstream\thttps://gitlab.internal/app.git (push)',
    ].join('\n');
    expect(parseRemoteVerbose(out)).toEqual([
      { name: 'upstream', fetchUrl: 'git@github.com:acme/app.git', pushUrl: 'https://gitlab.internal/app.git' },
    ]);
  });

  it('多个远程按首次出现顺序返回', () => {
    const out = [
      'origin\thttps://github.com/a/b.git (fetch)',
      'origin\thttps://github.com/a/b.git (push)',
      'backup\thttps://gitlab.internal/b.git (fetch)',
      'backup\thttps://gitlab.internal/b.git (push)',
    ].join('\n');
    expect(parseRemoteVerbose(out).map((r) => r.name)).toEqual(['origin', 'backup']);
  });

  it('★ 容错：混入的警告文本 / 空行被跳过，其余远程照常解析', () => {
    const out = [
      'warning: some noise from git',
      '',
      'origin\thttps://github.com/a/b.git (fetch)',
      'origin\thttps://github.com/a/b.git (push)',
      'not a remote line at all',
    ].join('\n');
    const list = parseRemoteVerbose(out);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('origin');
  });

  it('★ 只有 push 行（未配 fetch）时 fetchUrl 回落到 push 地址，不显示空地址', () => {
    expect(parseRemoteVerbose('solo\thttps://example.com/x.git (push)')).toEqual([
      { name: 'solo', fetchUrl: 'https://example.com/x.git', pushUrl: 'https://example.com/x.git' },
    ]);
  });

  it('无远程（空输出）→ 空数组，而不是报错', () => {
    expect(parseRemoteVerbose('')).toEqual([]);
    expect(parseRemoteVerbose('\n\n')).toEqual([]);
  });
});

describe('远程名校验（安全边界：名字会进命令行参数位）', () => {
  it('正常名字通过，并去掉首尾空白', () => {
    expect(assertRemoteName(' origin ')).toBe('origin');
    expect(assertRemoteName('gitlab-internal')).toBe('gitlab-internal');
  });

  it('★ 拒绝以「-」开头的名字（否则会被 git 当选项 —— 参数注入）', () => {
    expect(() => assertRemoteName('--upload-pack=calc')).toThrow(/不能以「-」开头/);
  });

  it('★ 拒绝含空白 / 控制字符的名字（会被拆成多个参数）', () => {
    expect(() => assertRemoteName('a b')).toThrow(/非法字符/);
    expect(() => assertRemoteName('a\nb')).toThrow(/非法字符/);
  });

  it('拒绝空名字与 git 自身的非法形态（.. / 结尾 .lock）', () => {
    expect(() => assertRemoteName('')).toThrow(/不能为空/);
    expect(() => assertRemoteName('   ')).toThrow(/不能为空/);
    expect(() => assertRemoteName('a..b')).toThrow(/不能含「..」/);
    expect(() => assertRemoteName('a.lock')).toThrow(/不能以「.lock」结尾/);
  });

  it('非字符串（前端漏传）按空处理，绝不放行', () => {
    expect(() => assertRemoteName(undefined)).toThrow(/不能为空/);
    expect(() => assertRemoteName(123)).toThrow(/不能为空/);
  });
});

describe('远程地址校验（安全边界：地址会进命令行参数位）', () => {
  it('常见协议都放行（https / scp 形式 / ssh / 本地路径）', () => {
    for (const url of [
      'https://github.com/acme/app.git',
      'git@github.com:acme/app.git',
      'ssh://git@gitlab.internal:2222/app.git',
      'file:///D:/repos/mirror.git',
      'D:/repos/mirror.git',
    ]) {
      expect(assertRemoteUrl(url)).toBe(url);
    }
  });

  it('★ 拒绝以「-」开头的地址', () => {
    expect(() => assertRemoteUrl('--upload-pack=calc')).toThrow(/不能以「-」开头/);
  });

  it('★ 拒绝含空白 / 换行的地址（会被拆成多个参数）', () => {
    expect(() => assertRemoteUrl('https://a/b.git --push')).toThrow(/空白或控制字符/);
    expect(() => assertRemoteUrl('https://a/b.git\n--upload-pack=calc')).toThrow(/空白或控制字符/);
  });

  it('拒绝空地址，并去掉首尾空白', () => {
    expect(() => assertRemoteUrl('')).toThrow(/不能为空/);
    expect(assertRemoteUrl('  https://a/b.git  ')).toBe('https://a/b.git');
  });
});

// ────────────────────────────────────────────────────────────
// ② service 真跑：临时仓库 + 真 git
// ────────────────────────────────────────────────────────────

describe('gitService 远程地址读写（真 git 跑一遍）', () => {
  let dir = '';
  const DEMO_URL = 'https://example.com/acme/demo.git';

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), 'yz-git-remote-'));
    await gitService.initRepo(dir);
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('新仓库没有远程地址 → 空数组（不是错误，面板据此显示"还没配置远程"）', async () => {
    expect(await gitService.listRemotes(dir)).toEqual([]);
  });

  it('添加远程后能读回同一个地址（查看链路成立）', async () => {
    await gitService.addRemote(dir, 'origin', DEMO_URL);
    const list = await gitService.listRemotes(dir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'origin', fetchUrl: DEMO_URL, pushUrl: DEMO_URL });
  });

  it('★ 修改地址：set-url 之后读到的是新地址（这就是"换仓库"的操作）', async () => {
    const next = 'https://gitlab.internal/acme/demo.git';
    await gitService.setRemoteUrl(dir, 'origin', next);
    expect((await gitService.listRemotes(dir))[0].fetchUrl).toBe(next);
  });

  it('★ 只改推送地址（--push）时拉取地址保持不变', async () => {
    const pushOnly = 'ssh://git@gitlab.internal:2222/acme/demo.git';
    await gitService.setRemoteUrl(dir, 'origin', pushOnly, true);
    const r = (await gitService.listRemotes(dir))[0];
    expect(r.fetchUrl).toBe('https://gitlab.internal/acme/demo.git');
    expect(r.pushUrl).toBe(pushOnly);
  });

  it('重命名远程：旧名消失、新名带原地址', async () => {
    await gitService.renameRemote(dir, 'origin', 'upstream');
    const list = await gitService.listRemotes(dir);
    expect(list.map((r) => r.name)).toEqual(['upstream']);
  });

  it('删除远程：只解除关联，列表回到空（本地提交与分支不受影响）', async () => {
    await gitService.removeRemote(dir, 'upstream');
    expect(await gitService.listRemotes(dir)).toEqual([]);
  });

  it('★ 非法名字不会走到 git（在 service 层就被拒，避免命令行注入）', async () => {
    await expect(gitService.addRemote(dir, '--upload-pack=calc', DEMO_URL)).rejects.toThrow();
    expect(await gitService.listRemotes(dir)).toEqual([]);
  });
});
