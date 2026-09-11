// code_graph 内置工具 — 仓库级符号依赖图（代码图）：谁调用它 / 它调用谁
// 与 code_refs（定义+引用平面列表）、code_outline（单文件结构）互补：
//   - 给定 symbol：输出定义 + 上游 callers（谁引用了它，按引用次数排序）+ 下游 callees（它引用了仓库内哪些符号）
//   - 不给 symbol：输出仓库概览（符号总数/边数 + 引用最多的 hub 符号 + 零引用符号数）
// 实现：全仓声明索引（code-symbols.extractDeclarations，多语言形态）+ 逐文件词法扫描建边；
//       import 别名（import { A as B } / 默认导入）先归一化到原名再建边；调用者是"最近外层声明"（方法级粒度）。
// 启发式图，非编译级精确（无类型解析/动态调用不可见）；足够回答"改动 X 会影响哪些模块"这类导航问题。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { walkCodeFiles, extractDeclarations, extractImportAliases, type SymbolDecl } from './code-symbols';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LIST = 25;

/** callerKey -> callee -> 引用次数 / callee -> callerKey -> 引用次数 */
type EdgeMap = Map<string, Map<string, number>>;

/** 高频局部标识符停用词：作为 const/方法名会污染全局符号图（hub 全是 name/text/push 这类） */
const COMMON_LOCAL_NAMES = new Set([
  'name', 'text', 'content', 'data', 'path', 'type', 'push', 'file', 'line', 'error', 'result',
  'item', 'value', 'key', 'index', 'options', 'props', 'state', 'rows', 'list', 'info', 'target',
  'query', 'config', 'args', 'res', 'ret', 'out', 'parts', 'lines', 'decls', 'node', 'nodes',
  'entry', 'entries', 'count', 'total', 'id', 'url', 'title', 'label', 'desc', 'status', 'event',
  'ctx', 'store', 'map', 'set', 'get', 'val', 'self', 'root', 'base', 'dir', 'name_', 'main',
  'init', 'load', 'run', 'start', 'stop', 'close', 'open', 'size', 'len', 'arr', 'obj', 'fn',
]);

function isNoiseSymbol(name: string): boolean {
  return name.length < 3 || COMMON_LOCAL_NAMES.has(name);
}

function topEntries(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export class CodeGraphTool implements BuiltInTool {
  name = 'code_graph';
  description = '构建仓库级符号依赖图（代码图）：给定 symbol 返回「定义 + 上游 callers（谁在用它）+ 下游 callees（它在用谁）」，不给 symbol 则返回引用最多的 hub 符号概览。调用粒度为方法级，import 别名已归一化。用于评估改动影响面、理清模块调用链（"改这个函数会牵连哪些地方"）。启发式图：动态调用/反射/跨语言调用不可见，精确语义导航仍以 IDE 为准。';

  inputSchema = {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'Focus symbol name (e.g. "useChat"). Omit to get repo overview (hub symbols).' },
      path: { type: 'string', description: 'Root directory (absolute or relative). Default "." (workspace root).' },
      include: { type: 'string', description: 'Comma-separated glob filename filters, e.g. "*.ts,*.vue".' },
      maxDepth: { type: 'number', description: 'Max recursion depth (default 12).' },
    },
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const focus = String(args.symbol || '').trim();
    if (focus && !/^[\w$]+$/.test(focus)) {
      return { content: [{ type: 'text', text: 'Error: symbol 必须是合法标识符' }], isError: true };
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

    const files = await walkCodeFiles(fs, root, { maxDepth, maxFiles: 1500, globFilter });

    // ① 声明索引：name → 全部声明；file → 该文件声明（按行序，供"最近外层声明"定位）
    const symbolDecls = new Map<string, SymbolDecl[]>();
    const fileDecls = new Map<string, SymbolDecl[]>();
    for (const file of files) {
      let content: string;
      try { content = await fs.readFile(file); } catch { continue; }
      if (content.length > MAX_FILE_BYTES || content.indexOf('\u0000') !== -1) continue;
      const decls = extractDeclarations(file, content).filter((d) =>
        // 普通局部 const/let/var 不进全局图（局部状态不是可导航符号）；导出的 const 进
        !(d.kind === 'const' && !d.exported) && !isNoiseSymbol(d.name),
      );
      if (decls.length === 0) continue;
      fileDecls.set(file, decls);
      for (const d of decls) {
        const arr = symbolDecls.get(d.name);
        if (arr) arr.push(d);
        else symbolDecls.set(d.name, [d]);
      }
    }
    const known = new Set(symbolDecls.keys());

    // ② 建边：caller(最近外层声明) → callee(仓库内符号)，值 = 引用次数
    //    别名先归一化：本文件未声明 B 且 B 是 import 别名 → 边指向原符号 A
    const outEdges: EdgeMap = new Map();
    const inEdges: EdgeMap = new Map();
    const bump = (m: EdgeMap, a: string, b: string) => {
      const inner = m.get(a);
      if (inner) inner.set(b, (inner.get(b) || 0) + 1);
      else m.set(a, new Map([[b, 1]]));
    };
    const TOKEN_RE = /[A-Za-z_$][\w$]{1,64}/g;
    for (const [file, decls] of fileDecls) {
      let content: string;
      try { content = await fs.readFile(file); } catch { continue; }
      const localNames = new Set(decls.map((d) => d.name));
      const aliases = extractImportAliases(content);
      const lines = content.split('\n');
      let k = 0; // decls 指针（decls 已按行序）
      for (let i = 0; i < lines.length; i++) {
        // 外层声明取"严格在本行之前"的最近声明：避免语句自身的 const 声明把自己当调用者
        while (k < decls.length && decls[k].line - 1 < i) k++;
        const enclosing = k > 0 ? decls[k - 1] : null;
        // 注释行不参与词法建边（文档里提到的符号不是引用）
        if (/^\s*(?:\/\/|\/\*|\*|#|<!--)/.test(lines[i])) continue;
        const isImportLine = /^\s*(?:import|export)\b/.test(lines[i]);
        const callerKey = enclosing
          ? `${enclosing.name}@${file.split('/').pop()}`
          : `(module)@${file.split('/').pop()}`;
        let m: RegExpExecArray | null;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(lines[i])) !== null) {
          let name = m[0];
          if (!known.has(name)) {
            // 别名归一化：B → 原名 A（仅当 B 非本地声明、且原名是仓库符号）
            if (!localNames.has(name) && aliases.has(name) && known.has(aliases.get(name)!)) {
              name = aliases.get(name)!;
            } else {
              continue;
            }
          }
          // import/export 行上的本名符号 = 导入/导出声明本身，不算引用边
          if (isImportLine && name === m[0]) continue;
          bump(outEdges, callerKey, name);
          bump(inEdges, name, callerKey);
        }
      }
    }

    const out: string[] = [];
    if (focus) {
      const decls = symbolDecls.get(focus) || [];
      out.push(`# 代码图：${focus}`);
      out.push(`定义（${decls.length}）：`);
      if (decls.length === 0) {
        out.push('  （仓库内未找到该符号的声明 —— 检查拼写，或它来自依赖包而非本仓库）');
        return { content: [{ type: 'text', text: out.join('\n') }] };
      }
      for (const d of decls.slice(0, 5)) out.push(`  [${d.kind}] ${d.file}:${d.line}`);
      if (decls.length > 5) out.push(`  …共 ${decls.length} 处声明（重载/同名）`);

      const callerMap = inEdges.get(focus) || new Map<string, number>();
      out.push(`上游 callers（${callerMap.size}，谁在用它，按引用次数排序）：`);
      if (callerMap.size === 0) out.push('  （无引用 —— 可能是入口/未被接线，注意死代码可能）');
      for (const [callerKey, count] of topEntries(callerMap, MAX_LIST)) {
        out.push(`  ${callerKey}  ×${count}`);
      }
      if (callerMap.size > MAX_LIST) out.push(`  …共 ${callerMap.size} 个调用方`);

      // 下游 callees：所有以 focus 为外层声明的 callerKey 的出边聚合
      const calleeMap = new Map<string, number>();
      for (const [key, callees] of outEdges) {
        if (!key.startsWith(`${focus}@`)) continue;
        for (const [name, count] of callees) {
          calleeMap.set(name, (calleeMap.get(name) || 0) + count);
        }
      }
      out.push(`下游 callees（${calleeMap.size}，它在用谁，按引用次数排序）：`);
      if (calleeMap.size === 0) out.push('  （无仓库内依赖 —— 纯逻辑/叶子函数或仅调用依赖包）');
      for (const [name, count] of topEntries(calleeMap, MAX_LIST)) {
        out.push(`  ${name}  ×${count}`);
      }
      if (calleeMap.size > MAX_LIST) out.push(`  …共 ${calleeMap.size} 个依赖`);
    } else {
      let totalEdges = 0;
      const hubTotal = new Map<string, number>();
      for (const [name, callers] of inEdges) {
        let sum = 0;
        for (const c of callers.values()) sum += c;
        totalEdges += sum;
        hubTotal.set(name, sum);
      }
      const orphans = [...symbolDecls.keys()].filter((n) => !inEdges.has(n)).length;
      out.push('# 代码图：仓库概览');
      out.push(`- 扫描文件 ${fileDecls.size}，声明符号 ${symbolDecls.size}，引用边 ${totalEdges}`);
      out.push(`- 零引用符号 ${orphans} 个（入口/导出给外部/死代码）`);
      out.push('');
      out.push('引用最多的 hub 符号（改动前优先评估影响面）：');
      for (const [name, count] of topEntries(hubTotal, 20)) {
        const primary = symbolDecls.get(name)![0];
        out.push(`  ${name}  ← ${count} 处引用   ${primary.file}:${primary.line}`);
      }
      out.push('');
      out.push('提示：传 symbol 参数可查看具体符号的 callers / callees。');
    }

    return { content: [{ type: 'text', text: out.join('\n') }] };
  }
}
