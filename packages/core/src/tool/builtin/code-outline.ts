// code_outline 内置工具 — JS/TS/Vue 源码结构大纲（imports/classes/functions/interfaces，带行号）
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

const MAX_SIG_LEN = 120;
const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'try',
  'new', 'typeof', 'await', 'yield', 'delete', 'throw', 'constructorOf',
]);

interface OutlineItem { line: number; sig: string; children?: OutlineItem[] }

function push(items: OutlineItem[], item: OutlineItem): void {
  items.push(item);
}

export class CodeOutlineTool implements BuiltInTool {
  name = 'code_outline';
  description = 'Show the structural outline of a JS/TS/Vue/MJS source file: imports, classes (with methods), functions, arrow functions, interfaces/types/enums — each with line numbers. Much cheaper than reading the full file for understanding code structure; follow up with file_read for specific line ranges.';

  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Source file path (.js/.ts/.mjs/.cjs/.jsx/.tsx/.vue).' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const filePath = args.path as string;
    if (!filePath) return { content: [{ type: 'text', text: 'Error: path is required' }], isError: true };

    const exists = await fs.exists(filePath).catch(() => false);
    if (!exists) {
      return { content: [{ type: 'text', text: `Error: file not found: ${filePath}` }], isError: true };
    }

    let source: string;
    try { source = await fs.readFile(filePath); } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error reading file: ${msg}` }], isError: true };
    }

    const ext = (filePath.split('.').pop() || '').toLowerCase();
    let offset = 0;
    let body = source;

    // Vue SFC：取首个 <script> 块，行号偏移保持与原文件一致
    if (ext === 'vue') {
      const m = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (!m) {
        return { content: [{ type: 'text', text: `(该 .vue 文件无 <script> 块，仅模板) ${filePath} (${source.split('\n').length} lines)` }] };
      }
      offset = source.slice(0, m.index!).split('\n').length; // script 内容首行的行号 - 1
      body = m[1];
    }

    const lines = body.split('\n');
    const imports: OutlineItem[] = [];
    const classes: OutlineItem[] = [];
    const functions: OutlineItem[] = [];
    const types: OutlineItem[] = [];
    let currentClass: OutlineItem | null = null;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
      const lineNo = i + 1 + offset;
      const sig = line.length > MAX_SIG_LEN ? `${line.slice(0, MAX_SIG_LEN)}...` : line;

      // import
      const im = line.match(/^import\s[^;]*?from\s*['"]([^'"]+)['"]/) || line.match(/^import\s*['"]([^'"]+)['"]/);
      if (im) { push(imports, { line: lineNo, sig: `import ... from '${im[1]}'` }); continue; }

      // class
      const cl = line.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
      if (cl) {
        const item: OutlineItem = { line: lineNo, sig: line };
        push(classes, item);
        currentClass = item;
        continue;
      }
      // 类结束：仅认零缩进的 "}"（字段初始化器收尾的 "};"/缩进 "}" 不算）
      if (currentClass && /^}\s*;?\s*$/.test(raw)) { currentClass = null; continue; }

      // 方法（类体内缩进行）：排除控制关键字
      if (currentClass && /^\s{2,}/.test(raw)) {
        const method = line.match(/^(?:(?:public|private|protected|static|readonly|async|get|set)\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/);
        if (method && !CONTROL_KEYWORDS.has(method[1]) && !line.includes('=') && /[){]\s*$/.test(line)) {
          (currentClass.children ||= []).push({ line: lineNo, sig });
          continue;
        }
      }

      // 函数声明
      const fn = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/);
      if (fn) { push(functions, { line: lineNo, sig }); continue; }

      // 箭头函数 / 函数表达式赋值
      const arrow = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/);
      if (arrow) { push(functions, { line: lineNo, sig }); continue; }

      // interface / type / enum
      const it = line.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
      if (it) { push(types, { line: lineNo, sig }); continue; }
      const tp = line.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/);
      if (tp) { push(types, { line: lineNo, sig }); continue; }
      const en = line.match(/^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/);
      if (en) { push(types, { line: lineNo, sig }); continue; }
    }

    const parts: string[] = [`${filePath} (${source.split('\n').length} lines)`];
    const section = (title: string, items: OutlineItem[], render: (item: OutlineItem, indent: string) => string) => {
      if (items.length === 0) return;
      parts.push(`${title} (${items.length}):`);
      for (const item of items) parts.push(render(item, '  '));
    };

    section('Imports', imports, (it, ind) => `${ind}L${it.line}: ${it.sig}`);
    section('Classes', classes, (it, ind) => {
      const head = `${ind}L${it.line}: ${it.sig}`;
      const methods = (it.children || []).map((c) => `    L${c.line}: ${c.sig}`);
      return methods.length > 0 ? `${head}\n${methods.join('\n')}` : head;
    });
    section('Functions', functions, (it, ind) => `${ind}L${it.line}: ${it.sig}`);
    section('Types', types, (it, ind) => `${ind}L${it.line}: ${it.sig}`);

    if (parts.length === 1) {
      parts.push('(未识别出结构 — 可能不是 JS/TS 源码，或全部为顶层语句)');
    }
    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
}
