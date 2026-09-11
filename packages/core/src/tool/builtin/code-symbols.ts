// code_refs / code_graph 共享的符号解析基建（启发式，纯 FsAdapter，三端可用）
// 提取：声明符号（多语言形态）、import 别名映射（import { A as B } / 默认导入）、相对路径解析。
// 说明：非 LSP 语义树；覆盖 JS/TS/Vue/Py/Go/Java/C# 的主流声明形态 + 别名/再导出两类"动态"场景。
import type { FsAdapter } from '../../platform/types';
import { walkFiles, joinPath, getExt, type WalkOptions } from './fs-walk';

/** 参与符号索引的代码扩展名 */
export const CODE_EXTS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'py', 'go', 'java', 'cs', 'php', 'rb'];

export interface SymbolDecl {
  name: string;
  file: string;
  line: number; // 1-based
  kind: string; // function / class / interface / type / enum / const / method / def ...
  text: string;
  /** 是否 export 声明（图工具用：普通局部 const 不进全局图索引） */
  exported: boolean;
}

/** 单行声明形态（捕获符号名）。按语言分块，逐行匹配取首个命中。 */
const DECL_LINE_RULES: Array<{ kind: string; re: RegExp; group: number }> = [
  // JS/TS：export? default? abstract? async? function*/class/interface/type/enum/namespace NAME
  { kind: 'type', re: /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/, group: 2 },
  // JS/TS：export? const/let/var NAME = （含 export const NAME = ...）
  { kind: 'const', re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=/, group: 1 },
  // JS/TS class 方法/成员（public|private|static|async|get/set 修饰）
  { kind: 'method', re: /^\s+(?:(?:public|private|protected|static|readonly|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{;=\n]+)?\s*\{\s*$/, group: 1 },
  // Python：def NAME / class NAME
  { kind: 'def', re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, group: 1 },
  { kind: 'class', re: /^\s*class\s+([A-Za-z_]\w*)/, group: 1 },
  // Go：func (recv) NAME( / func NAME( / type NAME struct|interface
  { kind: 'func', re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/, group: 1 },
  { kind: 'type', re: /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/, group: 1 },
  // Java/C#：class/interface/enum NAME
  { kind: 'type', re: /^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+|abstract\s+|sealed\s+)?(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)/, group: 1 },
];

/** 控制流关键字不算方法声明 */
const NON_DECL_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'new', 'typeof', 'await', 'else', 'do', 'try']);

/** 提取文件内全部顶层/成员声明符号（逐行，去重同 line） */
export function extractDeclarations(file: string, content: string): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length > 400) continue;
    for (const rule of DECL_LINE_RULES) {
      const m = line.match(rule.re);
      if (!m) continue;
      const name = m[rule.group];
      if (!name || NON_DECL_NAMES.has(name)) break;
      const key = `${file}:${i}`;
      if (seen.has(key)) break;
      seen.add(key);
      out.push({
        name, file, line: i + 1, kind: rule.kind, text: line.trim().slice(0, 160),
        exported: /^\s*export\b/.test(line),
      });
      break;
    }
  }
  return out;
}

/**
 * 提取文件内的 import 别名映射：本地名 → 导入原名。
 * 覆盖：
 *  - import { A as B } / import type { A as B } from '...'   → B → A
 *  - import B from './mod'                                   → B → 模块 basename（默认导出按文件名对齐的启发式）
 *  - const B = require('./mod')                              → 同上
 *  - export { A as B } from '...' / export { A as B }        → B → A（再导出别名）
 */
export function extractImportAliases(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const put = (local: string, origin: string) => {
    if (local && origin && local !== origin && /^[A-Za-z_$][\w$]*$/.test(local)) map.set(local, origin);
  };
  const lines = content.split('\n');
  for (const line of lines) {
    // 命名导入别名
    const named = line.match(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from/);
    if (named) {
      for (const part of named[1].split(',')) {
        const mm = part.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (mm) put(mm[2] || mm[1], mm[1]);
      }
    }
    // 再导出别名：export { A as B }（可带 from）
    const reexp = line.match(/\bexport\s*\{([^}]*)\}/);
    if (reexp) {
      for (const part of reexp[1].split(',')) {
        const mm = part.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (mm) put(mm[2] || mm[1], mm[1]);
      }
    }
    // 默认导入：import B from '<path>' —— 启发式对齐到模块文件名
    const def = line.match(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/);
    if (def) {
      const base = (def[2].split('/').pop() || '').replace(/\.(ts|tsx|js|jsx|mjs|cjs|vue|py|go)$/, '');
      if (base && base !== 'index') put(def[1], base);
    }
    // CJS：const B = require('<path>')
    const req = line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/);
    if (req) {
      const base = (req[2].split('/').pop() || '').replace(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/, '');
      if (base && base !== 'index') put(req[1], base);
    }
  }
  return map;
}

/** 相对导入 spec（./x / ../x）→ 仓库内真实文件（补扩展名 / index 探测） */
export async function resolveRelativeImport(
  fs: FsAdapter,
  fromFile: string,
  spec: string,
  exts: string[] = CODE_EXTS,
): Promise<string | null> {
  if (!/^\.\.?\//.test(spec)) return null;
  const dir = fromFile.split('/').slice(0, -1).join('/');
  const base = joinPath(dir, spec);
  const candidates: string[] = [base];
  for (const e of exts) candidates.push(`${base}.${e}`);
  candidates.push(`${base}/index.ts`, `${base}/index.js`, `${base}/index.vue`);
  for (const c of candidates) {
    try { if (await fs.exists(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

/** 按 code 扩展名遍历目录（code_refs / code_graph 共用） */
export async function walkCodeFiles(
  fs: FsAdapter,
  root: string,
  opts: { maxFiles?: number; maxDepth?: number; globFilter?: string[] } = {},
): Promise<string[]> {
  const walkOpts: WalkOptions = {
    maxFiles: opts.maxFiles ?? 2000,
    maxDepth: opts.maxDepth ?? 12,
    extFilter: CODE_EXTS,
    globFilter: opts.globFilter,
  };
  const all = await walkFiles(fs, root, walkOpts);
  return all.filter((f) => CODE_EXTS.includes(getExt(f)));
}
