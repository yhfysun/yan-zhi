// code-ast.ts — TypeScript Compiler API 精确代码树解析（2026-10-03，用户要求「代码树解析」）
//
// ★ 背景：code-symbols.ts 的符号提取是**单行正则启发式**（自述「非 LSP 语义树」）——
//   多行函数签名、对象字面量方法、解构导出、泛型默认值等形态都会漏/误判。
//   本模块用真正的 AST（TypeScript Compiler API，workspace 已有 typescript 依赖）做精确解析：
//   声明（含修饰符/导出/多行签名）、import（含 type-only/namespace/别名）、调用边（谁调用谁，带行号）。
//
// ★ 可用性策略（关键约束）：packages/core 同时进浏览器构建 —— **不能静态 import 'typescript'**
//   （会把整个编译器打进浏览器 bundle）。用变量拼接 + @vite-ignore 动态 import：
//     · Node/服务端（开发模式主场景）：workspace 根有 typescript → 精确 AST；
//     · 浏览器端：import 失败 → loadTsCompiler() 返回 false，调用方**回退原启发式**（能力降级不缺失）。
//   典型解析耗时：单文件毫秒级，远低于 spawn tsc。
//
// ★ 类型策略：不 import TS 的类型定义（同理避免静态依赖），内部用 any + 局部窄化。

/** ts 模块缓存：undefined=未尝试，null=不可用（浏览器端），否则为编译器模块 */
let tsModule: any | null | undefined;

/** 探测 TypeScript 编译器是否可用（结果缓存，重复调用零开销） */
export async function loadTsCompiler(): Promise<any | null> {
  if (tsModule !== undefined) return tsModule;
  try {
    // 变量拼接模块名 + @vite-ignore：防止 vite/rollup 把 typescript 静态打进浏览器 bundle
    const mod = 'type' + 'script';
    tsModule = (await import(/* @vite-ignore */ mod)) as any;
    if (!tsModule?.createSourceFile) tsModule = null;
  } catch {
    tsModule = null;
  }
  return tsModule;
}

/** 供测试重置探测缓存 */
export function resetTsCompilerCache(): void {
  tsModule = undefined;
}

/** AST 解析覆盖的扩展名（与启发式 CODE_EXTS 的 TS 家族子集） */
const AST_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);

/** 某扩展名能否走 AST 解析（vue 单独处理：提取 script 块后也可） */
export function isAstExt(ext: string): boolean {
  return AST_EXTS.has(ext.toLowerCase());
}

export interface AstDecl {
  name: string;
  line: number; // 1-based
  kind: string; // function / class / interface / type / enum / const / method / get / set
  signature: string; // 单行化、截断后的声明签名
  exported: boolean;
  /** 所属 class/interface 名（method 类声明用） */
  parent?: string;
}

export interface AstImport {
  line: number;
  spec: string; // from '...' 的模块说明符
  names: string[]; // 命名导入（已展开 as：存「本地名 → 原名」中的原名）
  aliasMap: Array<{ local: string; origin: string }>;
  defaultName?: string;
  namespaceName?: string;
  typeOnly: boolean;
}

export interface AstCallEdge {
  caller: string; // 外层函数/方法名；顶层调用为 '<module>'
  callee: string; // 被调名（Identifier 或属性链尾名）
  line: number;
}

export interface AstFileSummary {
  decls: AstDecl[];
  imports: AstImport[];
  calls: AstCallEdge[];
}

/** 单行化签名：去换行/压缩空白/截断 */
function oneLine(s: string, max = 160): string {
  const line = s.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}...` : line;
}

/**
 * 用 TS Compiler API 解析单个源文件。
 * 任何异常都吞掉返回 null（调用方回退启发式）—— AST 是增强，绝不能让它把工具跑挂。
 * @param fileName 需带扩展名（决定 ts 的 ScriptKind：.ts/.tsx/.js/.jsx）
 * @param lineOffset vue script 块等场景的行号偏移（0-based 行数，结果统一 +offset）
 */
export function parseWithTs(source: string, fileName: string, lineOffset = 0): AstFileSummary | null {
  try {
    const ts = tsModule;
    if (!ts) return null;
    const kind = /\.tsx$/i.test(fileName) ? ts.ScriptKind.TSX
      : /\.ts$/i.test(fileName) ? ts.ScriptKind.TS
      : /\.jsx$/i.test(fileName) ? ts.ScriptKind.JSX
      : ts.ScriptKind.JS;
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, /* setParentNodes */ true, kind);
    if (!sf) return null;

    const decls: AstDecl[] = [];
    const imports: AstImport[] = [];
    const calls: AstCallEdge[] = [];
    const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1 + lineOffset;

    const hasExportModifier = (node: any) =>
      Array.isArray(node?.modifiers) && node.modifiers.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);

    const sigOf = (node: any): string => {
      const end = node.body ? node.body.getStart(sf) : node.getEnd();
      return oneLine(source.slice(node.getStart(sf), end));
    };

    // 调用边的 caller：向上找最近的函数型祖先名
    const enclosingName = (node: any): string => {
      let cur = node.parent;
      while (cur) {
        if (ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur) || ts.isArrowFunction(cur)
          || ts.isFunctionExpression(cur) || ts.isConstructorDeclaration(cur) || ts.isGetAccessorDeclaration(cur) || ts.isSetAccessorDeclaration(cur)) {
          if (cur.name && ts.isIdentifier(cur.name)) return cur.name.text;
          // 匿名函数形态：const run = () => {...} / const run = function() {...} → 取变量名
          if (cur.parent && ts.isVariableDeclaration(cur.parent) && ts.isIdentifier(cur.parent.name)) {
            return cur.parent.name.text;
          }
          // 方法/函数挂在对象/类上但名字是字面量等 → 用父名兜底
          if (cur.parent && (ts.isClassDeclaration(cur.parent) || ts.isClassExpression(cur.parent)) && cur.parent.name) return cur.parent.name.text;
          return '<anonymous>';
        }
        cur = cur.parent;
      }
      return '<module>';
    };

    const visit = (node: any): void => {
      // import
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const item: AstImport = {
          line: lineOf(node.getStart(sf)),
          spec: node.moduleSpecifier.text,
          names: [],
          aliasMap: [],
          typeOnly: !!clause?.isTypeOnly,
        };
        if (clause) {
          if (clause.name) item.defaultName = clause.name.text;
          const named = clause.namedBindings;
          if (named) {
            if (ts.isNamespaceImport(named)) {
              item.namespaceName = named.name.text;
            } else {
              for (const el of named.elements || []) {
                const origin = (el.propertyName || el.name).text;
                const local = el.name.text;
                item.names.push(origin);
                if (local !== origin) item.aliasMap.push({ local, origin });
              }
            }
          }
        }
        imports.push(item);
      }

      // 声明
      if (ts.isFunctionDeclaration(node) && node.name) {
        decls.push({ name: node.name.text, line: lineOf(node.getStart(sf)), kind: node.asteriskToken ? 'function*' : 'function', signature: sigOf(node), exported: hasExportModifier(node) });
      } else if (ts.isClassDeclaration(node) && node.name) {
        decls.push({ name: node.name.text, line: lineOf(node.getStart(sf)), kind: 'class', signature: sigOf(node), exported: hasExportModifier(node) });
      } else if (ts.isInterfaceDeclaration(node)) {
        decls.push({ name: node.name.text, line: lineOf(node.getStart(sf)), kind: 'interface', signature: sigOf(node), exported: hasExportModifier(node) });
      } else if (ts.isTypeAliasDeclaration(node)) {
        decls.push({ name: node.name.text, line: lineOf(node.getStart(sf)), kind: 'type', signature: sigOf(node), exported: hasExportModifier(node) });
      } else if (ts.isEnumDeclaration(node)) {
        decls.push({ name: node.name.text, line: lineOf(node.getStart(sf)), kind: 'enum', signature: sigOf(node), exported: hasExportModifier(node) });
      } else if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
        const name = node.name && ts.isIdentifier(node.name) ? node.name.text : (node.name?.getText(sf) ?? '');
        const parentName = node.parent && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent) || ts.isObjectLiteralExpression(node.parent))
          ? (node.parent.name?.text ?? '<object>') : '';
        decls.push({ name, line: lineOf(node.getStart(sf)), kind: ts.isMethodDeclaration(node) ? 'method' : (ts.isGetAccessorDeclaration(node) ? 'get' : 'set'), signature: sigOf(node), exported: hasExportModifier(node), parent: parentName || undefined });
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        // const/let/var：只有初始化器是函数形态才算"函数"声明（普通常量也记，kind=const）
        const isFnInit = node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
        // ★ export 修饰符在 VariableStatement（声明语句）上，不在 VariableDeclarationList 上
        //   —— 2026-10-03 集成自测实测：`export const bad` 的 exported 恒为 false。
        const exported = hasExportModifier(node.parent) || hasExportModifier(node.parent?.parent);
        decls.push({
          name: node.name.text,
          line: lineOf(node.getStart(sf)),
          kind: isFnInit ? 'function' : 'const',
          signature: oneLine(source.slice(node.parent.parent.getStart(sf), (node.initializer ? node.initializer.getEnd() : node.getEnd()))),
          exported,
        });
      } else if (ts.isCallExpression(node)) {
        const expr = node.expression;
        let callee = '';
        if (ts.isIdentifier(expr)) callee = expr.text;
        else if (ts.isPropertyAccessExpression(expr)) callee = expr.name.text;
        else if (ts.isElementAccessExpression(expr) && expr.argumentExpression) callee = expr.argumentExpression.getText(sf).replace(/^['"]|['"]$/g, '');
        if (callee) calls.push({ caller: enclosingName(node), callee, line: lineOf(node.getStart(sf)) });
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        calls.push({ caller: enclosingName(node), callee: `new ${node.expression.text}`, line: lineOf(node.getStart(sf)) });
      }

      node.forEachChild?.(visit);
    };
    sf.forEachChild(visit);

    return { decls, imports, calls };
  } catch {
    return null;
  }
}

/** vue SFC 的 <script> 块提取（返回正文 + 偏移行数 + 是否 lang="ts"），无 script 返回 null */
export function extractVueScript(source: string): { body: string; lineOffset: number; isTs: boolean } | null {
  const m = source.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  if (!m) return null;
  // ★ 剥掉开标签后的**恰好一个**换行（body 以 '\n' 开头会把所有行号顶后一行）；
  //   body 内再多空行保留 —— 行号对齐原文件是硬要求。
  const body = m[2].replace(/^\r?\n/, '');
  return {
    body,
    lineOffset: source.slice(0, m.index!).split('\n').length,
    isTs: /\blang\s*=\s*["']ts["']/.test(m[1]),
  };
}

/**
 * 单文件解析入口：探测编译器 → 解析。vue 自动取 script 块并修正行号与 ScriptKind。
 * 编译器不可用 / 无 script 块 / 解析异常 → null（调用方回退启发式）。
 */
export async function tryParseAst(
  source: string,
  filePath: string,
  ext: string,
  lineOffset = 0,
): Promise<AstFileSummary | null> {
  const ts = await loadTsCompiler();
  if (!ts) return null;
  const lower = ext.toLowerCase();
  let body = source;
  let offset = lineOffset;
  let pseudoName = filePath;
  if (lower === 'vue') {
    const s = extractVueScript(source);
    if (!s) return null;
    body = s.body;
    offset = s.lineOffset;
    // ScriptKind 由伪扩展名决定：lang="ts" → .ts，否则 .js
    pseudoName = `${filePath.replace(/\.vue$/i, '')}.${s.isTs ? 'ts' : 'js'}`;
  } else if (!isAstExt(lower)) {
    return null;
  }
  return parseWithTs(body, pseudoName, offset);
}
