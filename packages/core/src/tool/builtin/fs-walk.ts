// 共享文件遍历工具 — file_list / code_search 复用（仅依赖 FsAdapter，三端可用）
import type { DirEntryInfo, FsAdapter } from '../../platform/types';

/** 默认跳过的目录（依赖/构建产物等，搜索与递归列表均不进入） */
export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'dist-release', 'dist-release2',
  'dist_electron', 'build', 'out', 'output', 'coverage', '.vite', '.cache', '.next',
  '.nuxt', '__pycache__', '.gradle', '.idea', '.vscode', 'target', 'venv',
]);

/** 路径拼接（统一用 /，Windows 下 fs 也接受） */
export function joinPath(dir: string, name: string): string {
  const d = dir.replace(/[\\/]+$/, '');
  return d ? `${d}/${name}` : name;
}

/** 取小写扩展名（无点） */
export function getExt(name: string): string {
  const base = name.split(/[\\/]/).pop() || '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export interface WalkOptions {
  maxFiles?: number;
  maxDepth?: number;
  skipDirs?: Set<string>;
  /** 只保留这些扩展名的文件（小写无点），如 ['ts','js'] */
  extFilter?: string[];
  /** glob 过滤，如 ['*.ts', '*.vue']（匹配文件名） */
  globFilter?: string[];
}

function globMatch(name: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const trimmed = p.trim().toLowerCase();
    if (!trimmed) return false;
    if (trimmed === '*') return true;
    if (trimmed.startsWith('*.')) return getExt(name) === trimmed.slice(2);
    return (name.split(/[\\/]/).pop() || '').toLowerCase() === trimmed;
  });
}

/** 递归遍历目录，返回文件路径列表（不含目录本身）。失败/无权限的子目录静默跳过。 */
export async function walkFiles(fs: FsAdapter, root: string, opts: WalkOptions = {}): Promise<string[]> {
  const files: string[] = [];
  const maxFiles = opts.maxFiles ?? 3000;
  const maxDepth = opts.maxDepth ?? 12;
  const skipDirs = opts.skipDirs ?? DEFAULT_SKIP_DIRS;

  async function listEntries(dir: string): Promise<DirEntryInfo[]> {
    if (fs.listDirEntries) {
      try { return await fs.listDirEntries(dir); } catch { return []; }
    }
    // 无 listDirEntries 的适配器：readDir + 尾部斜杠探测目录
    const names = await fs.readDir(dir).catch(() => [] as string[]);
    const out: DirEntryInfo[] = [];
    for (const name of names) {
      const p = joinPath(dir, name);
      const isDir = await fs.exists(`${p}/`).catch(() => false);
      out.push({ name, path: p, isDir });
    }
    return out;
  }

  async function walk(dir: string, depth: number): Promise<void> {
    if (files.length >= maxFiles || depth > maxDepth) return;
    const entries = await listEntries(dir);
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.isDir) {
        if (skipDirs.has(entry.name)) continue;
        await walk(entry.path, depth + 1);
      } else {
        if (opts.extFilter && !opts.extFilter.includes(getExt(entry.name))) continue;
        if (opts.globFilter && !globMatch(entry.name, opts.globFilter)) continue;
        files.push(entry.path);
      }
    }
  }

  await walk(root, 0);
  return files;
}
