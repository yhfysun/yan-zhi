import simpleGit, { type SimpleGit } from 'simple-git';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPlatformAdapter } from '@yan-zhi/core';

/** 面板缓存：仓库内的隐藏目录（应用独有，随仓库走，不进版本库） */
const CACHE_DIR = '.yan-zhi';
const CACHE_FILE = 'git-cache.json';
const CACHE_VERSION = 1;
/** 缓存文件体积上限，超出按梯度裁剪 */
const MAX_CACHE_BYTES = 512 * 1024;

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  gitStatus?: string;
  size?: number;
}

/** 将 simple-git 状态码映射为可读标记 */
function mapStatus(code: string): string | undefined {
  if (!code || code === ' ') return undefined;
  const m: Record<string, string> = {
    M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'conflict', '?': 'untracked',
  };
  return m[code] || 'modified';
}

/** 判断路径是否落在应用缓存目录 .yan-zhi 下 */
function isCachePath(p: unknown): boolean {
  if (typeof p !== 'string') return false;
  return p === CACHE_DIR || p.startsWith(CACHE_DIR + '/') || p.startsWith(CACHE_DIR + '\\');
}

/** 从 status 结果中剔除缓存目录条目，避免它变成「未跟踪」噪音 */
function stripCacheEntries<T>(st: T): T {
  const obj = st as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') return st;
  for (const key of ['files', 'not_added', 'created', 'deleted', 'modified', 'renamed', 'conflicted', 'staged']) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    obj[key] = arr.filter((f) => !isCachePath(typeof f === 'string' ? f : (f as { path?: unknown })?.path));
  }
  return st;
}

export class GitService {
  private repos = new Map<string, SimpleGit>();

  private async getWorkspaceDir(): Promise<string> {
    try {
      const raw = await getPlatformAdapter().keyring.get('settings:app');
      if (raw) return (JSON.parse(raw) as { workspaceDir?: string }).workspaceDir || '';
    } catch {
      /* ignore */
    }
    return '';
  }

  private assertWithinWorkspace(repo: string, workspaceDir: string): void {
    if (!path.isAbsolute(repo)) throw new Error('仓库路径必须是绝对路径');
    if (workspaceDir) {
      const ws = path.resolve(workspaceDir);
      const r = path.resolve(repo);
      if (r !== ws && !r.startsWith(ws + path.sep)) {
        throw new Error(`路径不在工作目录内: ${repo}`);
      }
    }
  }

  private open(repo: string): SimpleGit {
    let g = this.repos.get(repo);
    if (!g) {
      g = simpleGit(repo);
      this.repos.set(repo, g);
    }
    return g;
  }

  async discover(dir: string): Promise<string | null> {
    try {
      const root = await simpleGit(dir).revparse(['--show-toplevel']);
      return root.trim() || null;
    } catch {
      return null;
    }
  }

  async status(repo: string) {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const st = await this.open(repo).status();
    return stripCacheEntries(st);
  }

  async diff(repo: string, opts: { file?: string; staged?: boolean } = {}): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args: string[] = [];
    if (opts.staged) args.push('--cached');
    if (opts.file) args.push('--', opts.file);
    return this.open(repo).diff(args);
  }

  async log(repo: string, opts: { branch?: string; n?: number } = {}) {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args: string[] = ['-n', String(opts.n ?? 50)];
    if (opts.branch) args.unshift(opts.branch);
    return this.open(repo).log(args);
  }

  /** 带-parent/refs 的提交历史，供前端画分支图 */
  async graph(repo: string, opts: { n?: number } = {}): Promise<Array<{
    hash: string; parents: string[]; refs: string[]; subject: string;
    authorName: string; authorEmail: string; date: string;
  }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const n = opts.n ?? 50;
    const raw = await this.open(repo).raw([
      'log', '--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ae%x1f%aI', '-n', String(n),
    ]);
    return raw.trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\x1f');
      return {
        hash: parts[0] || '',
        parents: (parts[1] || '').split(' ').filter(Boolean),
        refs: (parts[2] || '').split(',').map((r) => r.trim()).filter(Boolean),
        subject: parts[3] || '',
        authorName: parts[4] || '',
        authorEmail: parts[5] || '',
        date: parts[6] || '',
      };
    });
  }

  async branches(repo: string): Promise<string[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const b = await this.open(repo).branchLocal();
    return b.all;
  }

  async fileTree(repo: string, subPath = ''): Promise<FileNode[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const root = subPath ? path.join(repo, subPath) : repo;
    const entries = await fs.readdir(root, { withFileTypes: true });
    const statusMap = new Map<string, string>();
    try {
      const st = await this.open(repo).status();
      for (const f of st.files) {
        const code = f.working_dir !== ' ' ? f.working_dir : f.index;
        const mapped = mapStatus(code);
        if (mapped) statusMap.set(f.path, mapped);
      }
    } catch {
      /* 非 git 仓库 */
    }
    const nodes: FileNode[] = [];
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === CACHE_DIR) continue;
      const fullPath = path.join(root, e.name);
      const relPath = path.relative(repo, fullPath).replace(/\\/g, '/');
      let size: number | undefined;
      if (e.isFile()) {
        try {
          size = (await fs.stat(fullPath)).size;
        } catch {
          /* ignore */
        }
      }
      nodes.push({
        name: e.name,
        path: relPath,
        type: e.isDirectory() ? 'dir' : 'file',
        gitStatus: statusMap.get(relPath),
        size,
      });
    }
    return nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    );
  }

  async add(repo: string, files: string[]): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).add(files);
  }

  async commit(repo: string, message: string, files?: string[]): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const g = this.open(repo);
    if (files?.length) await g.add(files);
    await g.commit(message);
  }

  /** 追加到上次提交（--amend，不改提交信息则复用；不产生新提交） */
  async commitAmend(repo: string, message?: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args = ['commit', '--amend'];
    if (message) args.push('-m', message);
    else args.push('--no-edit');
    await this.open(repo).raw(args);
  }

  async pull(repo: string, branch?: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).pull(branch ? ['origin', branch] : undefined);
  }

  async push(repo: string, branch?: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).push(branch ? ['origin', branch] : undefined);
  }

  async checkout(repo: string, branch: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).checkout(branch);
  }

  async restore(repo: string, files: string[]): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).checkout(['--', ...files]);
  }

  /** 变更行数统计（git diff --numstat），用于变更列表显示 +n / −m */
  async numstat(repo: string): Promise<Array<{ path: string; added: number; deleted: number }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['diff', '--numstat']);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [a, d, ...rest] = line.split('\t');
        const path = rest.join('\t');
        return {
          path,
          added: a === '-' ? 0 : Number(a) || 0,
          deleted: d === '-' ? 0 : Number(d) || 0,
        };
      });
  }

  /** 本地分支相对上游的领先/落后提交数（git rev-list --left-right --count） */
  async aheadBehind(repo: string, branch?: string): Promise<{ ahead: number; behind: number }> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const ref = branch || 'HEAD';
    try {
      const out = await this.open(repo).raw([
        'rev-list', '--left-right', '--count', `${ref}...@{upstream}`,
      ]);
      const [behind, ahead] = out.trim().split(/\s+/).map((n) => Number(n) || 0);
      return { ahead, behind };
    } catch {
      // 无上游（未 push / 本地新仓库）时无法计算，返回 0
      return { ahead: 0, behind: 0 };
    }
  }

  /** 撤销暂存（git reset HEAD -- files），对应「取消暂存」 */
  async unstage(repo: string, files: string[]): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    if (!files.length) return;
    await this.open(repo).raw(['reset', 'HEAD', '--', ...files]);
  }

  /** 新建并切换到指定分支（git checkout -b） */
  async createBranch(repo: string, name: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['checkout', '-b', name]);
  }

  /** 全量文件列表（git ls-files），用于文件树视图一次取全 */
  async lsTree(repo: string): Promise<Array<{ path: string; type: 'file' }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['ls-files']);
    return out
      .split('\n')
      .filter(Boolean)
      .map((p) => ({ path: p, type: 'file' as const }));
  }

  async readFile(repo: string, filePath: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const full = path.resolve(repo, filePath);
    const repoRoot = path.resolve(repo);
    if (full !== repoRoot && !full.startsWith(repoRoot + path.sep)) {
      throw new Error('非法路径');
    }
    return fs.readFile(full, 'utf-8');
  }

  /** 读取 git 中的文件版本（默认 HEAD），用于 diff 对比 */
  async show(repo: string, filePath: string, ref = 'HEAD'): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    try {
      return await this.open(repo).show([`${ref}:${filePath}`]);
    } catch {
      return '';
    }
  }

  // ===== 合并 / 冲突解决（IDEA 式页内冲突处理）=====

  /** 未合并（冲突）文件清单：git status --porcelain 中 XY 处于未合并状态组合的文件 */
  async conflicts(repo: string): Promise<string[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['status', '--porcelain']);
    const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => ({ x: line.slice(0, 1), y: line.slice(1, 2), path: line.slice(3) }))
      .filter((e) => UNMERGED.has(e.x + e.y))
      .map((e) => e.path);
  }

  /** 读取冲突文件三个版本：base(:1) / ours(:2) / theirs(:3)；某侧不存在返回空串 */
  async conflictVersions(repo: string, filePath: string): Promise<{ base: string; ours: string; theirs: string }> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const read = async (stage: number): Promise<string> => {
      try {
        return await this.open(repo).raw(['show', `:${stage}:${filePath}`]);
      } catch {
        return '';
      }
    };
    const [base, ours, theirs] = await Promise.all([read(1), read(2), read(3)]);
    return { base, ours, theirs };
  }

  /** 合并分支；冲突时不抛错，返回冲突文件清单 */
  async merge(repo: string, branch: string): Promise<{ ok: boolean; conflicts: string[]; message: string }> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    try {
      const out = await this.open(repo).raw(['merge', branch]);
      return { ok: true, conflicts: [], message: out.trim() || '合并完成' };
    } catch (e) {
      let conflicts: string[] = [];
      try { conflicts = await this.conflicts(repo); } catch { /* ignore */ }
      return { ok: false, conflicts, message: (e as Error).message };
    }
  }

  /** 中止合并，恢复到合并前状态（git merge --abort） */
  async abortMerge(repo: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['merge', '--abort']);
  }

  /** 标记冲突已解决（git add file） */
  async resolveConflict(repo: string, filePath: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).add([filePath]);
  }

  // ===== fetch / stash / tag / blame / revert / reset / cherry-pick / rebase =====

  /** 抓取远程更新（不合并） */
  async fetch(repo: string, remote = 'origin', branch?: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args = branch ? [remote, branch] : [remote];
    return this.open(repo).raw(['fetch', ...args]);
  }

  /** 储藏当前改动（git stash push -m message） */
  async stashSave(repo: string, message?: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args = ['stash', 'push'];
    if (message) args.push('-m', message);
    return this.open(repo).raw(args);
  }

  /** 储藏列表（git stash list） */
  async stashList(repo: string): Promise<string[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['stash', 'list']);
    return out.split('\n').filter(Boolean);
  }

  /** 弹出储藏（git stash pop） */
  async stashPop(repo: string, index = 0): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['stash', 'pop', `stash@{${index}}`]);
  }

  /** 应用储藏（git stash apply，不删除） */
  async stashApply(repo: string, index = 0): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['stash', 'apply', `stash@{${index}}`]);
  }

  /** 删除储藏（git stash drop） */
  async stashDrop(repo: string, index = 0): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['stash', 'drop', `stash@{${index}}`]);
  }

  /** 创建标签（git tag [-a] name [-m message] [ref]） */
  async tagCreate(repo: string, name: string, message?: string, ref?: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const args = ['tag'];
    if (message) args.push('-a', name, '-m', message);
    else args.push(name);
    if (ref) args.push(ref);
    await this.open(repo).raw(args);
  }

  /** 标签列表（git tag） */
  async tagList(repo: string): Promise<string[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['tag']);
    return out.split('\n').filter(Boolean);
  }

  /** 删除标签（git tag -d name） */
  async tagDelete(repo: string, name: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['tag', '-d', name]);
  }

  /** 追溯（git blame --line-porcelain file），返回结构化行信息 */
  async blame(repo: string, file: string): Promise<Array<{ hash: string; author: string; line: number; content: string }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['blame', '--line-porcelain', '--', file]);
    const lines = out.split('\n');
    const result: Array<{ hash: string; author: string; line: number; content: string }> = [];
    let i = 0;
    while (i < lines.length) {
      const header = lines[i];
      if (!header) { i++; continue; }
      const parts = header.split(' ');
      const hash = parts[0];
      const origLine = Number(parts[1]) || 0;
      let author = '';
      let content = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('\t')) {
        if (lines[i].startsWith('author ')) author = lines[i].slice(7);
        i++;
      }
      if (i < lines.length && lines[i].startsWith('\t')) {
        content = lines[i].slice(1);
        i++;
      }
      result.push({ hash: hash === '0000000000000000000000000000000000000000' ? '(未提交)' : hash.slice(0, 8), author, line: origLine, content });
    }
    return result;
  }

  /** 撤销提交（git revert commit），产生一个反向提交 */
  async revert(repo: string, commit: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['revert', '--no-edit', commit]);
  }

  /** 重置 HEAD 到指定目标（git reset --mode target） */
  async reset(repo: string, mode: 'soft' | 'mixed' | 'hard', target: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['reset', `--${mode}`, target]);
  }

  /** 挑选提交（git cherry-pick commit） */
  async cherryPick(repo: string, commit: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['cherry-pick', '--no-edit', commit]);
  }

  /** 变基（git rebase branch） */
  async rebase(repo: string, branch: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    return this.open(repo).raw(['rebase', branch]);
  }

  /** 中止变基（git rebase --abort） */
  async rebaseAbort(repo: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['rebase', '--abort']);
  }

  /** 远程分支列表（git branch -r），用于分支面板分组显示 */
  async remoteBranches(repo: string): Promise<string[]> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    try {
      const out = await this.open(repo).raw(['branch', '-r']);
      return out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.includes('->'));
    } catch {
      return [];
    }
  }

  /** 删除本地分支（git branch -d name） */
  async deleteBranch(repo: string, name: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['branch', '-d', name]);
  }

  /** 重命名分支（git branch -m oldName newName） */
  async renameBranch(repo: string, oldName: string, newName: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await this.open(repo).raw(['branch', '-m', oldName, newName]);
  }

  /** 某提交的变更文件列表（git diff-tree --no-commit-id --name-status -r commit） */
  async diffTree(repo: string, commit: string): Promise<Array<{ status: string; path: string }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    const out = await this.open(repo).raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commit]);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t');
        return { status: status.trim(), path: rest.join('\t') };
      });
  }

  /** 某提交的完整 diff（git show --format= commit 或 git diff commit^ commit） */
  async commitDiff(repo: string, commit: string, file?: string): Promise<string> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    if (file) {
      return this.open(repo).raw(['diff', `${commit}^`, commit, '--', file]);
    }
    return this.open(repo).raw(['show', '--format=', '--no-color', commit]);
  }

  /** 扫描目录下所有子目录中的 git 仓库（仅一层） */
  async discoverAll(dir: string): Promise<Array<{ path: string; branch: string; ahead: number; behind: number }>> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(dir, ws);
    const results: Array<{ path: string; branch: string; ahead: number; behind: number }> = [];
    const addIfRepo = async (p: string) => {
      try {
        const isRepo = await simpleGit(p).checkIsRepo();
        if (!isRepo) return;
        const st = await simpleGit(p).status();
        let ahead = 0, behind = 0;
        try { const ab = await this.aheadBehind(p, st.current || undefined); ahead = ab.ahead; behind = ab.behind; } catch { /* no upstream */ }
        results.push({ path: p, branch: st.current || '', ahead, behind });
      } catch { /* not a repo */ }
    };
    await addIfRepo(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      await addIfRepo(path.join(dir, e.name));
    }
    return results;
  }

  /** 批量拉取 */
  async batchPull(repos: string[]): Promise<Array<{ repo: string; ok: boolean; error?: string }>> {
    const results: Array<{ repo: string; ok: boolean; error?: string }> = [];
    for (const r of repos) {
      try { await this.pull(r); results.push({ repo: r, ok: true }); }
      catch (e) { results.push({ repo: r, ok: false, error: (e as Error).message }); }
    }
    return results;
  }

  /** 批量推送 */
  async batchPush(repos: string[]): Promise<Array<{ repo: string; ok: boolean; error?: string }>> {
    const results: Array<{ repo: string; ok: boolean; error?: string }> = [];
    for (const r of repos) {
      try { await this.push(r); results.push({ repo: r, ok: true }); }
      catch (e) { results.push({ repo: r, ok: false, error: (e as Error).message }); }
    }
    return results;
  }

  // ===== 面板缓存（仓库内隐藏目录 .yan-zhi/git-cache.json）=====

  private cachePath(repo: string): string {
    return path.join(repo, CACHE_DIR, CACHE_FILE);
  }

  /** 读取面板缓存；不存在或版本不兼容返回 null */
  async readCache(repo: string): Promise<Record<string, unknown> | null> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    try {
      const parsed = JSON.parse(await fs.readFile(this.cachePath(repo), 'utf-8')) as Record<string, unknown>;
      if (!parsed || parsed.version !== CACHE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** 写入面板缓存（tmp + rename 原子替换）；超限时按梯度裁剪 graph/log */
  async writeCache(repo: string, payload: Record<string, unknown>): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await fs.mkdir(path.join(repo, CACHE_DIR), { recursive: true });
    await this.ensureGitExclude(repo);
    const file = this.cachePath(repo);
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, serializeCache(payload), 'utf-8');
    await fs.rename(tmp, file);
  }

  /** 删除面板缓存（刷新失败或用户强制刷新时用） */
  async clearCache(repo: string): Promise<void> {
    const ws = await this.getWorkspaceDir();
    this.assertWithinWorkspace(repo, ws);
    await fs.rm(this.cachePath(repo), { force: true });
  }

  /** 把 .yan-zhi/ 追加到 .git/info/exclude：本地生效，不改动仓库已跟踪的 .gitignore */
  private async ensureGitExclude(repo: string): Promise<void> {
    try {
      const gitDir = path.join(repo, '.git');
      // worktree/子模块的 .git 是文件而非目录，此时跳过
      if (!(await fs.stat(gitDir)).isDirectory()) return;
      const infoDir = path.join(gitDir, 'info');
      await fs.mkdir(infoDir, { recursive: true });
      const excludeFile = path.join(infoDir, 'exclude');
      const raw = await fs.readFile(excludeFile, 'utf-8').catch(() => '');
      const has = raw.split(/\r?\n/).some((l) => l.trim() === CACHE_DIR || l.trim() === CACHE_DIR + '/');
      if (has) return;
      await fs.appendFile(excludeFile, `${raw && !raw.endsWith('\n') ? '\n' : ''}${CACHE_DIR}/\n`, 'utf-8');
    } catch {
      /* 只读仓库 / 无 .git 目录时静默跳过 */
    }
  }

  /** 批量切换分支 */
  async batchCheckout(repos: string[], branch: string): Promise<Array<{ repo: string; ok: boolean; error?: string }>> {
    const results: Array<{ repo: string; ok: boolean; error?: string }> = [];
    for (const r of repos) {
      try { await this.checkout(r, branch); results.push({ repo: r, ok: true }); }
      catch (e) { results.push({ repo: r, ok: false, error: (e as Error).message }); }
    }
    return results;
  }
}

/** 序列化缓存：按梯度裁剪（完整 → 截短 log/graph → 去 graph → 只留核心字段） */
function serializeCache(payload: Record<string, unknown>): string {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, unknown>;
  const ui = raw.ui;
  const cap = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : v);
  const capLog = (v: unknown, n: number) => {
    if (v && typeof v === 'object' && Array.isArray((v as { all?: unknown[] }).all)) {
      return { ...(v as object), all: (v as { all: unknown[] }).all.slice(0, n) };
    }
    return v;
  };
  const capRepos = (v: unknown, graphN: number, logN: number) =>
    Array.isArray(v)
      ? v.map((g) => {
          const r = (g || {}) as Record<string, unknown>;
          return { ...r, graph: cap(r.graph, graphN), log: cap(r.log, logN) };
        })
      : v;

  const gradients: Array<Record<string, unknown>> = [
    { ...data },
    { ...data, graph: cap(data.graph, 20), log: capLog(data.log, 20), multiRepoChanges: capRepos(data.multiRepoChanges, 20, 10) },
    { ...data, graph: [], multiRepoChanges: capRepos(data.multiRepoChanges, 0, 5) },
    {
      status: data.status,
      branches: data.branches,
      currentBranch: data.currentBranch,
      numstat: data.numstat,
      aheadBehind: data.aheadBehind,
      remoteBranches: data.remoteBranches,
      tags: data.tags,
      stash: data.stash,
    },
  ];

  let out = '';
  for (const g of gradients) {
    out = JSON.stringify({ version: CACHE_VERSION, ts: Date.now(), data: g, ui });
    if (Buffer.byteLength(out, 'utf-8') <= MAX_CACHE_BYTES) break;
  }
  return out;
}

export const gitService = new GitService();