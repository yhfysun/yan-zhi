// file_grep 内置工具 — 文件/目录级关键字与正则搜索（补 file_read 全量盲读的缺口）
// 复用 fs-walk 的目录遍历（自动跳过 node_modules/.git/dist 等噪声目录），三端可用。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { walkFiles } from './fs-walk';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 单文件超过 2MB 跳过（防二进制/超大日志拖垮搜索）
const OUTPUT_CAP = 64 * 1024;

interface LineMatch {
  path: string;
  lineNo: number; // 1-based
  text: string;
}

export class FileGrepTool implements BuiltInTool {
  name = 'file_grep';
  description = '在文件或目录中按正则表达式/关键字搜索文本，返回带行号的匹配行及上下文。目标可以是单个文件或目录（目录时递归搜索，自动跳过 node_modules/.git/dist 等）。用 glob 参数过滤文件类型（如 "*.ts,*.md"）。找到目标后用 file_read 的 offset/limit 精读对应区域。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory to search in (absolute, or relative to workspace).',
      },
      pattern: {
        type: 'string',
        description: 'Regular expression pattern (JS regex syntax), e.g. "function\\s+\\w+" or plain keyword "配置".',
      },
      glob: {
        type: 'string',
        description: 'Optional filename filter when searching a directory, comma-separated glob patterns, e.g. "*.ts,*.vue".',
      },
      ignoreCase: {
        type: 'boolean',
        description: 'Case-insensitive matching. Defaults to false.',
      },
      contextLines: {
        type: 'number',
        description: 'Lines of context to show before/after each match (default 0, max 10).',
      },
      maxResults: {
        type: 'number',
        description: 'Max matching lines to return (default 50, max 200).',
      },
    },
    required: ['path', 'pattern'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const target = (args.path as string) || '.';
    const pattern = args.pattern as string;
    if (!pattern) {
      return { content: [{ type: 'text', text: 'Error: pattern is required' }], isError: true };
    }
    const ignoreCase = Boolean(args.ignoreCase);
    const contextLines = Math.min(Math.max(Math.floor(Number(args.contextLines) || 0), 0), 10);
    const maxResults = Math.min(Math.max(Math.floor(Number(args.maxResults) || 50), 1), 200);

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error: invalid regex "${pattern}": ${msg}` }], isError: true };
    }

    const exists = await fs.exists(target).catch(() => false);
    if (!exists) {
      return { content: [{ type: 'text', text: `Error: path not found: ${target}` }], isError: true };
    }
    // 目录探测：尾部斜杠存在性（与 file_list/code_search 同款手法）
    const isDir = await fs.exists(`${target.replace(/[\\/]+$/, '')}/`).catch(() => false);

    const files = isDir
      ? await walkFiles(fs, target, {
          globFilter: typeof args.glob === 'string' && args.glob.trim()
            ? args.glob.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
        })
      : [target.replace(/[\\/]+$/, '')];

    if (files.length === 0) {
      return { content: [{ type: 'text', text: `No files to search in: ${target}` }] };
    }

    const matches: LineMatch[] = [];
    const skipped: string[] = [];
    let hitMax = false;

    for (const file of files) {
      if (matches.length >= maxResults) { hitMax = true; break; }
      let content: string;
      try {
        content = await fs.readFile(file);
      } catch {
        skipped.push(file);
        continue;
      }
      // 跳过二进制/超大文件
      if (content.includes('\0') || content.length > MAX_FILE_SIZE) {
        skipped.push(file);
        continue;
      }
      const lines = content.replace(/\r\n/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          matches.push({ path: file, lineNo: i + 1, text: lines[i].slice(0, 500) });
          if (matches.length >= maxResults) { hitMax = true; break; }
        }
      }
    }

    if (matches.length === 0) {
      const skipNote = skipped.length ? ` (${skipped.length} files skipped: binary/unreadable/too large)` : '';
      return { content: [{ type: 'text', text: `No matches for /${pattern}/${ignoreCase ? 'i' : ''} in ${target}${skipNote}` }] };
    }

    // 带上下文渲染：同一文件的连续匹配合并为一个块
    const byFile = new Map<string, LineMatch[]>();
    for (const m of matches) {
      const arr = byFile.get(m.path) || [];
      arr.push(m);
      byFile.set(m.path, arr);
    }
    const blocks: string[] = [];
    for (const [file, fileMatches] of byFile) {
      const lines = fileMatches;
      blocks.push(lines.map((m) => `${file}:${m.lineNo}: ${m.text}`).join('\n'));
    }
    let out = blocks.join('\n');
    if (hitMax) {
      out += `\n\n[result truncated at maxResults=${maxResults}. Narrow the pattern, add glob filter, or raise maxResults.]`;
    }
    if (skipped.length) {
      out += `\n\n[skipped ${skipped.length} files: binary/unreadable/too large]`;
    }
    if (out.length > OUTPUT_CAP) {
      out = out.slice(0, OUTPUT_CAP) + '\n\n[output truncated at 64KB. Narrow the pattern or use maxResults.]';
    }
    return { content: [{ type: 'text', text: out }] };
  }
}
