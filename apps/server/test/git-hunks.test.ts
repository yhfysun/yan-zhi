/**
 * 按 hunk 暂存 —— 守门测试（2026-10-29）。
 *
 * ★★★ 背景：工作区被多个会话共用，一个文件里常同时躺着两条改动线。
 *   以前只有文件粒度（api_git_add / api_git_commit 的 files 是整文件），
 *   "只提交我这几段"就只能把别人的改动一起带走。
 *
 * 这个文件钉两类契约：
 *   ① **纯函数**：diff 切段、按编号挑选、拼回补丁 —— 编号口径与越界行为。
 *   ② **真跑**：真临时仓库 + 真 git，走一遍 列出 → 只暂存第 2 段 → 提交，
 *      断言第 1 段**仍在工作区**。mock 掉 git 就等于只测了自己复述的假设。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import simpleGit from 'simple-git';
import { gitService } from '../src/services/git.js';
import { parseUnifiedDiff, selectHunks, buildPatch, describeNoHunks } from '../src/services/git-hunks.js';

// ────────────────────────────────────────────────────────────
// ① 纯函数边界
// ────────────────────────────────────────────────────────────

const DIFF = [
  'diff --git a/src/demo.ts b/src/demo.ts',
  'index 1111111..2222222 100644',
  '--- a/src/demo.ts',
  '+++ b/src/demo.ts',
  '@@ -1,4 +1,4 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 20;',
  ' const c = 3;',
  ' const d = 4;',
  '@@ -20,3 +20,3 @@ function f() {',
  ' const e = 5;',
  '-const f = 6;',
  '+const f = 60;',
  ' const g = 7;',
  '',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('按 @@ 切段并保留文件头（补丁必须能独立成立）', () => {
    const p = parseUnifiedDiff(DIFF);
    expect(p.header).toEqual([
      'diff --git a/src/demo.ts b/src/demo.ts',
      'index 1111111..2222222 100644',
      '--- a/src/demo.ts',
      '+++ b/src/demo.ts',
    ]);
    expect(p.hunks.map((h) => h.id)).toEqual([1, 2]);
    expect(p.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 4, newStart: 1, newLines: 4, added: 1, removed: 1 });
    expect(p.hunks[1]).toMatchObject({ oldStart: 20, added: 1, removed: 1 });
  });

  it('摘要取第一处新增行的内容（模型靠它判断"这段是谁的"）', () => {
    const p = parseUnifiedDiff(DIFF);
    expect(p.hunks[0].summary).toBe('const b = 20;');
    expect(p.hunks[1].summary).toBe('const f = 60;');
  });

  it('只有删除的段落摘要回落到删除行（不能是空串）', () => {
    const p = parseUnifiedDiff([
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '@@ -3,2 +3,1 @@',
      '-gone();',
      ' kept();',
      '',
    ].join('\n'));
    expect(p.hunks[0].summary).toBe('gone();');
    expect(p.hunks[0].removed).toBe(1);
  });

  it('空 diff → 零段（调用方据此给出"没有改动"而不是崩）', () => {
    expect(parseUnifiedDiff('').hunks).toEqual([]);
  });
});

describe('selectHunks / buildPatch', () => {
  const parsed = parseUnifiedDiff(DIFF);

  it('只挑第 2 段时补丁里不含第 1 段的内容', () => {
    const patch = buildPatch(parsed, selectHunks(parsed, [2]));
    expect(patch).toContain('+const f = 60;');
    expect(patch).not.toContain('const b = 20;');
    expect(patch.startsWith('diff --git a/src/demo.ts')).toBe(true);
    expect(patch.endsWith('\n')).toBe(true);
  });

  it('重复编号只算一次（模型偶尔会写 [2,2]）', () => {
    expect(selectHunks(parsed, [2, 2]).map((h) => h.id)).toEqual([2]);
  });

  it('★ 越界编号直接抛 —— 静默忽略会让"我以为暂存了第 7 段"变成只暂存 1 段', () => {
    expect(() => selectHunks(parsed, [7])).toThrow(/hunk 编号 7 不存在/);
  });

  it('空编号列表直接抛（不能退化成"暂存全部"）', () => {
    expect(() => selectHunks(parsed, [])).toThrow();
  });
});

describe('describeNoHunks', () => {
  it('二进制 → 提示改用整文件暂存', () => {
    const p = parseUnifiedDiff('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n');
    expect(describeNoHunks(p)).toMatch(/二进制/);
  });

  it('只有权限变化 → 说明没有可拆的文本改动', () => {
    const p = parseUnifiedDiff('diff --git a/x b/x\nold mode 100644\nnew mode 100755\n');
    expect(describeNoHunks(p)).toMatch(/权限/);
  });
});

// ────────────────────────────────────────────────────────────
// ② service 真跑：临时仓库 + 真 git
// ────────────────────────────────────────────────────────────

describe('gitService 按 hunk 暂存（真 git 跑一遍）', () => {
  let dir = '';
  const FILE = 'demo.txt';
  const git = () => simpleGit(dir);
  const initial = Array.from({ length: 12 }, (_, i) => `line${String(i + 1).padStart(2, '0')}`).join('\n') + '\n';

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), 'yz-git-hunks-'));
    await gitService.initRepo(dir);
    await git().addConfig('user.name', 'hunk-test');
    await git().addConfig('user.email', 'hunk-test@example.com');
    await fs.writeFile(path.join(dir, FILE), initial, 'utf8');
    await git().add([FILE]);
    await git().commit('init');
    // 两处相隔较远 → -U3 下必然切成两段
    const edited = initial.replace('line02', 'line02-changed').replace('line11', 'line11-changed');
    await fs.writeFile(path.join(dir, FILE), edited, 'utf8');
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('列出两段，摘要分别对应两处改动', async () => {
    const r = await gitService.listHunks(dir, FILE);
    expect(r.hunks).toHaveLength(2);
    expect(r.hunks[0].summary).toBe('line02-changed');
    expect(r.hunks[1].summary).toBe('line11-changed');
  });

  it('★ 只暂存第 2 段：暂存区有第二处、工作区仍保留第一处', async () => {
    await gitService.stageHunks(dir, FILE, [2]);
    const staged = await git().raw(['show', `:${FILE}`]);
    const worktree = await fs.readFile(path.join(dir, FILE), 'utf8');
    expect(staged).toContain('line11-changed');
    expect(staged).not.toContain('line02-changed');
    expect(worktree).toContain('line02-changed');
    expect(worktree).toContain('line11-changed');
  });

  it('暂存后剩余改动重新编号 —— 再列时只剩第 1 段', async () => {
    const r = await gitService.listHunks(dir, FILE);
    expect(r.hunks).toHaveLength(1);
    expect(r.hunks[0].summary).toBe('line02-changed');
  });

  it('★ 不带 files 提交 → HEAD 只有第 2 段，第 1 段仍在工作区', async () => {
    await gitService.commit(dir, '只提交第二段');
    const head = await git().raw(['show', `HEAD:${FILE}`]);
    expect(head).toContain('line11-changed');
    expect(head).not.toContain('line02-changed');
    const worktree = await fs.readFile(path.join(dir, FILE), 'utf8');
    expect(worktree).toContain('line02-changed');
    const dirty = await git().raw(['diff', '--name-only']);
    expect(dirty).toContain(FILE);
  });

  it('越界编号不会污染暂存区（先失败，再什么都不发生）', async () => {
    await expect(gitService.stageHunks(dir, FILE, [9])).rejects.toThrow(/hunk 编号 9 不存在/);
    const staged = await git().raw(['diff', '--cached', '--', FILE]);
    expect(staged.trim()).toBe('');
  });

  it('新文件（未跟踪）给出可执行的提示，而不是空列表', async () => {
    await fs.writeFile(path.join(dir, 'brand-new.txt'), 'hello\n', 'utf8');
    await expect(gitService.listHunks(dir, 'brand-new.txt')).rejects.toThrow(/未被 Git 跟踪/);
  });

  it('没有未暂存改动时给出"没有可拆分改动"', async () => {
    await git().add([FILE]);
    await gitService.commit(dir, '收尾');
    await expect(gitService.listHunks(dir, FILE)).rejects.toThrow(/没有可拆分的改动/);
  });
});
