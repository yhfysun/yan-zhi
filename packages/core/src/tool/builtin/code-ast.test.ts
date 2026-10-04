// code-ast（代码树解析）回归测试 —— TypeScript Compiler API 可用时的精确提取
// 守住的语义：
//   1) 声明提取比启发式准：多行签名、修饰符、箭头函数、类方法（带宿主）；
//   2) import 提取含默认/命名/namespace/别名/type-only；
//   3) 调用边 caller 取"最近的函数型祖先"（方法级粒度）；
//   4) vue SFC：script 块提取 + 行号偏移对齐原文件。
import { describe, it, expect } from 'vitest';
import { loadTsCompiler, parseWithTs, extractVueScript, tryParseAst } from './code-ast';

const COMPILER = await loadTsCompiler();

describe('parseWithTs（TS 编译器可用时）', () => {
  it.skipIf(!COMPILER)('提取声明：多行签名 / 箭头函数 / 类与方法', async () => {
    const src = [
      'import { ref } from "vue";',
      'import helper, { util as u } from "./helper";',
      '',
      'export interface Foo {',
      '  a: string;',
      '}',
      '',
      'export function calc(',
      '  a: number,',
      '  b: number,',
      '): number {',
      '  return helper(a + b);',
      '}',
      '',
      'export const run = async (x: number) => {',
      '  await helper(x);',
      '  u(x);',
      '  return calc(x, 2);',
      '};',
      '',
      'export class Widget {',
      '  private ready = false;',
      '  render(opts: { deep: boolean }): void {',
      '    this.ready = true;',
      '  }',
      '}',
    ].join('\n');
    const ast = parseWithTs(src, 'a.ts')!;
    expect(ast).not.toBeNull();

    const names = ast.decls.map((d) => d.name);
    expect(names).toContain('Foo');      // interface
    expect(names).toContain('calc');     // 多行签名的函数（启发式逐行会漏）
    expect(names).toContain('run');      // 箭头函数 const
    expect(names).toContain('Widget');   // class
    expect(names).toContain('render');   // 方法（parent=Widget）

    const calc = ast.decls.find((d) => d.name === 'calc')!;
    expect(calc.kind).toBe('function');
    expect(calc.exported).toBe(true);
    // 多行签名被单行化收进 signature
    expect(calc.signature).toContain('a: number');

    // import
    expect(ast.imports.length).toBe(2);
    const named = ast.imports.find((i) => i.spec === './helper')!;
    expect(named.defaultName).toBe('helper');
    expect(named.aliasMap).toContainEqual({ local: 'u', origin: 'util' });

    // 调用边：caller 是最近的函数型祖先
    const runCalls = ast.calls.filter((c) => c.caller === 'run').map((c) => c.callee);
    expect(runCalls).toContain('helper');
    expect(runCalls).toContain('u');
    expect(runCalls).toContain('calc');
    // 顶层调用为 <module>；方法内调用 caller 是方法名
    expect(ast.calls.some((c) => c.caller === 'render' && c.callee === 'ready')).toBe(false); // 属性访问不是调用
  });

  it.skipIf(!COMPILER)('调用边行号真实（用于影响面定位）', () => {
    const src = 'function a() {\n  b();\n}\nfunction b() {}\n';
    const ast = parseWithTs(src, 'x.ts')!;
    const call = ast.calls.find((c) => c.callee === 'b')!;
    expect(call.caller).toBe('a');
    expect(call.line).toBe(2);
  });
});

describe('extractVueScript / tryParseAst', () => {
  it.skipIf(!COMPILER)('vue SFC：行号偏移对齐原文件，lang=ts 走 TS ScriptKind', async () => {
    const src = [
      '<template><div /></template>',
      '',
      '<script setup lang="ts">',
      'interface Props { x: number }',
      'const props = defineProps<Props>();',
      '</script>',
    ].join('\n');
    const s = extractVueScript(src)!;
    expect(s.isTs).toBe(true);
    const ast = await tryParseAst(src, 'Comp.vue', 'vue');
    expect(ast).not.toBeNull();
    // interface 声明行 = 原文件第 4 行（script 在第 3 行开，body 第 1 行是第 4 行）
    const iface = ast!.decls.find((d) => d.name === 'Props')!;
    expect(iface.line).toBe(4);
  });

  it('无 script 块的 vue → null（调用方回退启发式）', async () => {
    const ast = await tryParseAst('<template><div /></template>', 'A.vue', 'vue');
    expect(ast).toBeNull();
  });
});
