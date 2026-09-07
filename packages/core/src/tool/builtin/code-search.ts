// code_search 内置工具 — 工作区源码文本/正则搜索（grep 类，纯 FsAdapter 实现，三端可用）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { walkFiles } from './fs-walk';

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024; // 单文件超过 1MB 跳过
const MAX_LINE_DISPLAY = 240;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CodeSearchTool implements BuiltInTool {
  name = 'code_search';
  description = '在指定目录下搜索文本或正则（类似 grep）。自动跳过 node_modules/.git/dist 等噪声目录。匹配项以 "路径:行号: 内容" 形式返回。可用 include 过滤文件名（如 "*.ts" 或 "*.ts,*.vue"）。比逐文件读取便宜得多，常用于先定位代码再深入阅读。';

  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or regex pattern to search for.' },
      path: { type: 'string', description: 'Root directory to search (absolute or relative). Default "." (workspace root).' },
      include: { type: 'string', description: 'Comma-separated glob filename filters, e.g. "*.ts,*.vue". Omit to search all text files.' },
      isRegex: { type: 'boolean', description: 'Treat query as a regular expression. Default false.' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive matching. Default false.' },
      maxResults: { type: 'number', description: 'Max total matches returned (default 60, max 500).' },
      maxDepth: { type: 'number', description: 'Max recursion depth (default 12).' },
    },
    required: ['query'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const query = args.query as string;
    if (!query) return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };

    const root = (args.path as string) || '.';
    const maxResults = Math.min(Math.max(Number(args.maxResults) || 60, 1), 500);
    const maxDepth = Math.min(Math.max(Number(args.maxDepth) || 12, 1), 30);
    const globFilter = typeof args.include === 'string' && args.include.trim()
      ? args.include.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    let pattern: RegExp;
    try {
      pattern = new RegExp(
        args.isRegex ? query : escapeRegex(query),
        args.caseSensitive ? 'g' : 'gi',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error: 无效的正则表达式: ${msg}` }], isError: true };
    }

    const rootExists = await fs.exists(root).catch(() => false);
    if (!rootExists) {
      return { content: [{ type: 'text', text: `Error: directory not found: ${root}` }], isError: true };
    }

    const files = await walkFiles(fs, root, { maxDepth, maxFiles: 5000, globFilter });
    if (files.length === 0) {
      return { content: [{ type: 'text', text: `(未找到可搜索的文件) ${root}` }] };
    }

    const out: string[] = [];
    let total = 0;
    let scanned = 0;
    let hitLimit = false;

    for (const filePath of files) {
      if (total >= maxResults) { hitLimit = true; break; }
      let content: string;
      try { content = await fs.readFile(filePath); } catch { continue; }
      if (content.length > DEFAULT_MAX_FILE_BYTES || content.indexOf('\u0000') !== -1) continue; // 超大/二进制跳过
      scanned++;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        if (!pattern.test(lines[i])) continue;
        const text = lines[i].trim();
        out.push(`${filePath}:${i + 1}: ${text.length > MAX_LINE_DISPLAY ? `${text.slice(0, MAX_LINE_DISPLAY)}...` : text}`);
        total++;
        if (total >= maxResults) { hitLimit = true; break; }
      }
    }

    if (out.length === 0) {
      return { content: [{ type: 'text', text: `(无匹配) "${query}" — 已扫描 ${scanned} 个文件` }] };
    }
    const tail = hitLimit
      ? `\n... (已达 maxResults=${maxResults}，可提高 maxResults 或用 include 收窄范围)`
      : '';
    return { content: [{ type: 'text', text: out.join('\n') + tail }] };
  }
}
