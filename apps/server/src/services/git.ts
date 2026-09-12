import simpleGit, { type SimpleGit } from 'simple-git';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPlatformAdapter } from '@yan-zhi/core';

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
    return this.open(repo).status();
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
    const logOpts: { max: number; ref?: string } = { max: opts.n ?? 50 };
    if (opts.branch) logOpts.ref = opts.branch;
    return this.open(repo).log(logOpts);
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
      if (e.name === '.git' || e.name === 'node_modules') continue;
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
}

export const gitService = new GitService();