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

/** 判断是否为绝对路径（Windows 盘符 / UNC / POSIX 根） */
export function isAbsolutePath(p: string): boolean {
  const s = (p || '').trim();
  if (!s) return false;
  // Windows: C:\  C:/  \\server\share
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
  if (s.startsWith('\\\\') || s.startsWith('//')) return true;
  // POSIX
  if (s.startsWith('/')) return true;
  return false;
}

/**
 * ★★★ 工具路径的统一解析出口（2026-09-30 修，high）。
 *
 * 背景（用户报「`{"path":"02-work"}` → Error: directory not found: 02-work……
 *   这个工具也有问题啊，不是工作目录是当前目录？」）：
 *
 *   此前**每个工具各自** `const root = args.path || '.'` 然后直接交给 `fs` ——
 *   而 fs 适配器（`node-adapter.ts`）用的是进程 cwd（= 后端启动目录），
 *   **不是用户的工作目录**。实测后果（生产库会话 aaa84c6c，09-30 08:27~08:28）：
 *     · `02-work` / `02-work/audio` → 全部 `directory not found`；
 *     · `.yan-zhi/tasks/<convId>` → 同样失败；
 *     · 模型被迫改用一长串绝对路径绕过（08:30 之后才恢复）——
 *       用户看到的就是"工具时好时坏、要反复试"。
 *
 *   ★ 设计取向与 `ToolContext.artifactDirs` **完全一致**（那是本项目的既有正确先例）：
 *     **调用方算好、直接传进来**，工具侧零业务知识（core 是平台无关层，
 *     不该知道 serverState / 会话表 / 空间目录的约定）。
 *
 *   解析规则（顺序即优先级）：
 *     1. 空 / 未给 → 工作目录根（有 workspaceDir 时）或 `.`；
 *     2. 绝对路径 → **原样返回**（用户/模型显式指定就别动它）；
 *     3. `.` 或 `./x` → 工作目录（及其子路径）—— 与 schema 里写的
 *        "Use \"." for the workspace root" 保持一致；
 *     4. 其他相对路径 → **拼接工作目录**（这是本次修复的核心：
 *        相对路径的基准必须是工作目录，不是进程 cwd）。
 *     5. **拿不到 workspaceDir**（如浏览器端/未配置）→ 原样返回，
 *        保持旧行为（不静默改变语义；定位由调用方补齐 ctx 解决）。
 */
export function resolveToolPath(input: unknown, workspaceDir?: string | null): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  const ws = typeof workspaceDir === 'string' ? workspaceDir.trim() : '';
  // 1) 未给路径 → 工作目录根（无工作目录时退回 '.'，即旧行为）
  if (!raw) return ws || '.';
  // ★ 绝不做路径规范化：`..` 保留原样 —— 是否越界由上层（权限/沙箱）决定，
  //   这里只负责"相对路径基于工作目录"这一件事（单一职责，不越权）。
  // 2) 绝对路径原样
  if (isAbsolutePath(raw)) return raw;
  // 5) 无工作目录 → 旧行为
  if (!ws) return raw;
  // 3) '.' / './x' → 工作目录
  if (raw === '.') return ws;
  if (raw.startsWith('./') || raw.startsWith('.\\')) return joinPath(ws, raw.slice(2));
  // 4) 其余相对路径 → 基于工作目录
  return joinPath(ws, raw);
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
