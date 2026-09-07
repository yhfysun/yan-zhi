// file_list 内置工具 — 目录列表 / 递归树（补 file_read/file_write 缺失的"列目录"能力）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { DEFAULT_SKIP_DIRS, joinPath } from './fs-walk';

export class FileListTool implements BuiltInTool {
  name = 'file_list';
  description = '列出指定目录下的文件与子目录。depth=1（默认）只列当前层级；更大的 depth 渲染递归树（自动跳过 node_modules/.git/dist 等噪声目录）。常用于读取文件前先探索目录结构。';

  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (absolute, or relative to workspace). Use "." for the workspace root.' },
      depth: { type: 'number', description: 'Recursion depth. 1 = only direct children (default), 2-8 = recursive tree.' },
      include: { type: 'string', description: 'Optional filename filter, comma-separated glob patterns, e.g. "*.ts,*.vue".' },
      maxEntries: { type: 'number', description: 'Max entries to return (default 500, max 5000).' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const root = (args.path as string) || '.';
    const depth = Math.min(Math.max(Number(args.depth) || 1, 1), 8);
    const maxEntries = Math.min(Math.max(Number(args.maxEntries) || 500, 1), 5000);
    const globFilter = typeof args.include === 'string' && args.include.trim()
      ? args.include.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const exists = await fs.exists(root).catch(() => false);
    if (!exists) {
      return { content: [{ type: 'text', text: `Error: directory not found: ${root}` }], isError: true };
    }

    const lines: string[] = [];
    let truncated = false;

    const listDir = async (dir: string, prefix: string, curDepth: number): Promise<void> => {
      if (truncated) return;
      let entries: Array<{ name: string; isDir: boolean }> = [];
      if (fs.listDirEntries) {
        try { entries = await fs.listDirEntries(dir); } catch { return; }
      } else {
        const names = await fs.readDir(dir).catch(() => [] as string[]);
        for (const name of names) {
          const p = joinPath(dir, name);
          const isDir = await fs.exists(`${p}/`).catch(() => false);
          entries.push({ name, isDir });
        }
      }
      // 目录在前，各按名称排序
      entries.sort((a, b) => (a.isDir === b.isDir)
        ? a.name.localeCompare(b.name)
        : (a.isDir ? -1 : 1));
      for (const entry of entries) {
        if (lines.length >= maxEntries) { truncated = true; return; }
        if (depth > 1 && curDepth > 1 && DEFAULT_SKIP_DIRS.has(entry.name)) continue;
        if (globFilter && !entry.isDir) {
          const ok = globFilter.some((p) => {
            const t = p.toLowerCase();
            return t === '*' || (t.startsWith('*.') && entry.name.toLowerCase().endsWith(t.slice(1)));
          });
          if (!ok) continue;
        }
        lines.push(`${prefix}${entry.name}${entry.isDir ? '/' : ''}`);
        if (entry.isDir && curDepth < depth) {
          await listDir(joinPath(dir, entry.name), `${prefix}  `, curDepth + 1);
        }
      }
    };

    try {
      await listDir(root, '', 1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error listing directory: ${msg}` }], isError: true };
    }

    if (lines.length === 0) {
      return { content: [{ type: 'text', text: `(空目录) ${root}` }] };
    }
    const header = `${root}${depth > 1 ? ` (depth=${depth})` : ''}`;
    const tail = truncated ? `\n... (已达 maxEntries=${maxEntries} 上限，请用 include 过滤或提高 maxEntries)` : '';
    return { content: [{ type: 'text', text: `${header}\n${lines.join('\n')}${tail}` }] };
  }
}
