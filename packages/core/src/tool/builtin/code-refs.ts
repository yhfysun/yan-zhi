// code_refs 内置工具 — 符号定义与引用定位（启发式 + 别名感知，纯 FsAdapter 实现三端可用）
// 对标 CodeBuddy/Codex 的 go-to-definition / find-references：
// 1) 声明形态匹配 → 定义候选（function/class/interface/type/enum/const/方法/def/func）
// 2) 词边界匹配 → 引用列表（排除定义行）
// 3) 别名感知：import { A as B } / export { A as B } / 默认导入（模块名对齐）→
//    在别的文件里通过别名 B 使用的 A 也计入引用（标注 via 别名）
// 非完整 LSP 语义树：语义级精确导航由 IDE 完成；这里解决智能体在无 IDE 场景的符号导航，
// 与 code_search（文本检索）、code_outline（单文件结构）、code_graph（依赖图）构成代码理解工具族。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { walkCodeFiles, extractDeclarations, extractImportAliases, type SymbolDecl } from './code-symbols';

const MAX_DEFINITIONS = 20;
const MAX_REFERENCES = 60;

interface Hit { path: string; line: number; text: string; via?: string }

export class CodeRefsTool implements BuiltInTool {
  name = 'code_refs';
  description = '查找一个符号（函数/类/接口/变量/方法名）在工作区里的「定义位置」与「引用位置」。返回定义候选（声明形态匹配，含 kind 标注）+ 引用列表（词边界匹配、排除定义行），并做别名感知（import { A as B }、export { A as B } 再导出、默认导入的别名使用也计入）。比 code_search 更适合回答"这个函数在哪定义、谁在调用"。配合 code_outline（单文件结构）、code_search（文本检索）、code_graph（调用依赖图）构成代码定位四件套。';

  inputSchema = {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Symbol name to locate, e.g. "useChat" or "FileEditTool".' },
      path: { type: 'string', description: 'Root directory (absolute or relative). Default "." (workspace root).' },
      include: { type: 'string', description: 'Comma-separated glob filename filters, e.g. "*.ts,*.vue". Omit to search all code files.' },
      maxDepth: { type: 'number', description: 'Max recursion depth (default 12).' },
    },
    required: ['symbol'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const symbol = String(args.symbol || '').trim();
    if (!symbol || !/^[\w$]+$/.test(symbol)) {
      return { content: [{ type: 'text', text: 'Error: symbol 必须是合法标识符（字母/数字/_/$）' }], isError: true };
    }

    const root = (args.path as string) || '.';
    const maxDepth = Math.min(Math.max(Number(args.maxDepth) || 12, 1), 30);
    const globFilter = typeof args.include === 'string' && args.include.trim()
      ? args.include.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const rootExists = await fs.exists(root).catch(() => false);
    if (!rootExists) {
      return { content: [{ type: 'text', text: `Error: directory not found: ${root}` }], isError: true };
    }

    const files = await walkCodeFiles(fs, root, { maxDepth, maxFiles: 5000, globFilter });
    const definitions: Array<Hit & { kind: string }> = [];
    const references: Hit[] = [];
    let truncated = false;

    const refPattern = new RegExp(`(?<![\\w$])${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`, 'g');

    for (const filePath of files) {
      let content: string;
      try { content = await fs.readFile(filePath); } catch { continue; }
      if (content.length > 1024 * 1024 || content.indexOf('\u0000') !== -1) continue;

      // 1) 定义候选（共享声明规则，含 kind 标注）
      const decls: SymbolDecl[] = extractDeclarations(filePath, content)
        .filter((d) => d.name === symbol);
      for (const d of decls) {
        if (definitions.length < MAX_DEFINITIONS) definitions.push({ path: d.file, line: d.line, text: d.text, kind: d.kind });
        else { truncated = true; break; }
      }
      const declLines = new Set(decls.map((d) => d.line - 1));

      // 2) 本名引用（排除定义行）
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && references.length < MAX_REFERENCES; i++) {
        if (declLines.has(i)) continue;
        refPattern.lastIndex = 0;
        if (refPattern.test(lines[i])) {
          references.push({ path: filePath, line: i + 1, text: lines[i].trim().slice(0, 160) });
        }
      }
      if (references.length >= MAX_REFERENCES) { truncated = true; break; }

      // 3) 别名感知：本文件 import { A as B } 把 B 绑到 symbol A → 统计 B 的使用
      const aliases = extractImportAliases(content);
      const aliasNames = [...aliases.entries()].filter(([, origin]) => origin === symbol).map(([local]) => local);
      for (const alias of aliasNames) {
        const aliasPattern = new RegExp(`(?<![\\w$.])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`, 'g');
        // 别名出现在 import/export 行本身不算使用
        for (let i = 0; i < lines.length && references.length < MAX_REFERENCES; i++) {
          if (declLines.has(i)) continue;
          if (/^\s*(?:import|export)\b/.test(lines[i])) continue;
          aliasPattern.lastIndex = 0;
          if (aliasPattern.test(lines[i])) {
            references.push({ path: filePath, line: i + 1, text: lines[i].trim().slice(0, 160), via: alias });
          }
        }
        if (references.length >= MAX_REFERENCES) { truncated = true; break; }
      }
      if (truncated) break;
    }

    // 排序：定义在前（按 kind 权重），引用按文件聚合
    const kindWeight: Record<string, number> = { class: 0, interface: 1, function: 2, def: 3, func: 3, type: 4, enum: 5, const: 6, method: 7 };
    definitions.sort((a, b) => (kindWeight[a.kind] ?? 9) - (kindWeight[b.kind] ?? 9) || a.path.localeCompare(b.path));

    const out: string[] = [];
    out.push(`# 符号「${symbol}」`);
    out.push(`定义候选（${definitions.length}${truncated ? '+' : ''}）：`);
    if (definitions.length === 0) out.push('  （无声明形态匹配 —— 可能是局部变量/参数/纯引用，或换了名字）');
    for (const d of definitions) out.push(`  [${d.kind}] ${d.path}:${d.line}: ${d.text}`);
    out.push(`引用（${references.length}${truncated ? '+' : ''}，已排除定义行；"via B"= 通过 import 别名 B 使用）：`);
    if (references.length === 0) out.push('  （无其他引用）');
    for (const r of references) out.push(`  ${r.path}:${r.line}: ${r.text}${r.via ? `   (via ${r.via})` : ''}`);
    if (truncated) out.push('（结果被截断，可缩小 path/include 范围重查）');

    return { content: [{ type: 'text', text: out.join('\n') }] };
  }
}
