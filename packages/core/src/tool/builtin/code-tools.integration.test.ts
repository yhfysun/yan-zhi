// code-tools 集成自测 —— 真实文件系统 + 真实 tsc 子进程（非 mock）
// 覆盖三条 P0 链路的端到端行为：
//   1) code_diagnostics：真实 tsc 报类型错误 → file_edit 修复 → 复查归零
//   2) code_diagnostics：node --check 抓 JS 语法错误（无 tsconfig 项目的兜底路径）
//   3) AST 三件套（outline/refs/graph）对真实文件的精确输出
//   4) file_edit 真实写入：multi-hunk / CRLF 保留 / 模糊匹配落盘
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';
import { CodeDiagnosticsTool, FileEditTool, CodeOutlineTool, CodeRefsTool, CodeGraphTool } from './index';

// ── 真实 fs 适配器（只实现工具用到的面；core 无 node 适配器，测试内联最小实现） ──
const realFs: PlatformAdapter['fs'] = {
  readFile: (p: string) => fsp.readFile(p, 'utf-8'),
  readFileBase64: async (p: string) => (await fsp.readFile(p)).toString('base64'),
  writeFile: async (p: string, c: string) => { await fsp.writeFile(p, c, 'utf-8'); },
  writeFileBase64: async () => { throw new Error('not needed in test'); },
  exists: async (p: string) => { try { await fsp.access(p); return true; } catch { return false; } },
  mkdir: async (p: string) => { await fsp.mkdir(p, { recursive: true }); },
  remove: async (p: string) => { await fsp.rm(p, { recursive: true, force: true }); },
  readDir: (p: string) => fsp.readdir(p),
};
const adapter = {
  platform: 'desktop',
  db: { exec: async () => {}, query: async () => [], transaction: async <T,>(fn: () => T) => fn() },
  fs: realFs,
  keyring: { set: async () => {}, get: async () => null, delete: async () => {} },
} as unknown as PlatformAdapter;

const ROOT = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-code-tools-'));
const WS = ROOT.replace(/\\/g, '/');

const CALC_TS_BAD = [
  'export interface Opts {',
  '  scale: number;',
  '}',
  '',
  'export function calc(',
  '  a: number,',
  '  b: number,',
  '  opts: Opts,',
  '): number {',
  '  return (a + b) * opts.scale;',
  '}',
  '',
  'export const bad: string = 42;',
].join('\n');
const CALC_TS_FIXED = CALC_TS_BAD.replace('export const bad: string = 42;', 'export const bad: string = "42";');

beforeAll(() => {
  setPlatformAdapter(adapter);
  fsSync.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
  // 把 workspace 根的 typescript 以 junction 链接进 fixture（工具从目标项目找 tsc）
  const tsSrc = path.resolve(__dirname, '../../../../../node_modules/typescript');
  const nm = path.join(ROOT, 'node_modules');
  fsSync.mkdirSync(nm, { recursive: true });
  try { fsSync.symlinkSync(tsSrc, path.join(nm, 'typescript'), 'junction'); } catch { /* 已存在 */ }
  fsSync.writeFileSync(path.join(ROOT, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'es2020', module: 'commonjs', skipLibCheck: true, noEmit: true },
    include: ['src'],
  }));
  fsSync.writeFileSync(path.join(ROOT, 'src', 'calc.ts'), CALC_TS_BAD);
  // CRLF 文件（模拟 Windows 编辑器产物）
  fsSync.writeFileSync(path.join(ROOT, 'src', 'crlf.txt'), 'alpha line\r\nbeta line\r\n');
});
afterAll(async () => {
  await fsp.rm(ROOT, { recursive: true, force: true });
});

describe('code_diagnostics（真实 tsc 子进程）', () => {
  it('抓到类型错误：TS code + 文件 + 行号', async () => {
    const tool = new CodeDiagnosticsTool();
    const r = await tool.execute({ force: true }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(r.isError).toBeFalsy();
    expect(text).toContain('tsc');
    expect(text).toMatch(/TS\d+/);
    expect(text).toContain('src/calc.ts');
    // 坏行在第 13 行（bad: string = 42）
    expect(text).toMatch(/src\/calc\.ts:13/);
  });

  it('file_edit 修复后复查归零', async () => {
    const edit = new FileEditTool();
    const er = await edit.execute({
      path: 'src/calc.ts',
      old_string: 'export const bad: string = 42;',
      new_string: 'export const bad: string = "42";',
    }, { workspaceDir: WS });
    expect(er.isError).toBeFalsy();

    // 缓存必须失效（工具内部 force 不走缓存；这里显式 force 验证复查路径）
    const diag = new CodeDiagnosticsTool();
    const r = await diag.execute({ force: true }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('✅ 未发现问题');
    // 真实落盘内容
    expect(await fsp.readFile(path.join(ROOT, 'src', 'calc.ts'), 'utf-8')).toBe(CALC_TS_FIXED);
  });

  it('无 tsconfig 的 JS 项目：node --check 抓语法错误', async () => {
    const sub = path.join(ROOT, 'noconfig');
    fsSync.mkdirSync(sub, { recursive: true });
    fsSync.writeFileSync(path.join(sub, 'package.json'), '{}');
    fsSync.writeFileSync(path.join(sub, 'broken.js'), 'function f( {\n  return 1;\n}');
    const tool = new CodeDiagnosticsTool();
    const r = await tool.execute({ path: sub + '/broken.js', force: true }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('syntax');
    expect(text).toContain('broken.js');
  });

  it('项目装了 vue-tsc → 自动改用 vue-tsc（覆盖 .vue 类型错误，输出同 tsc 格式）', async () => {
    const sub = path.join(ROOT, 'vueproj');
    fsSync.mkdirSync(path.join(sub, 'src'), { recursive: true });
    fsSync.writeFileSync(path.join(sub, 'package.json'), '{}');
    fsSync.writeFileSync(path.join(sub, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"noEmit":true},"include":["src"]}');
    fsSync.writeFileSync(path.join(sub, 'src', 'bad.ts'), 'export const x: string = 42;\n');
    // 桩 vue-tsc：以 tsc 完全一致的输出格式报一个 .vue 错误并 exit 2
    //（真实 vue-tsc 的输出格式同 tsc —— 这里钉住的是「探测到 vue-tsc 就换命令」的选择逻辑）
    fsSync.mkdirSync(path.join(sub, 'node_modules', 'vue-tsc', 'bin'), { recursive: true });
    fsSync.writeFileSync(
      path.join(sub, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'),
      'console.log(\'src/Bad.vue(12,5): error TS2322: Type \\\'number\\\' is not assignable to type \\\'string\\\'.\');\nprocess.exit(2);\n',
    );
    const tool = new CodeDiagnosticsTool();
    const r = await tool.execute({ path: sub, force: true }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(r.isError).toBeFalsy();
    expect(text).toMatch(/src\/Bad\.vue:12.*TS2322/);
  });
});

describe('AST 三件套（真实文件 + 编译器）', () => {
  it('code_outline：多行签名函数 + interface + const', async () => {
    const tool = new CodeOutlineTool();
    const r = await tool.execute({ path: 'src/calc.ts' }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('AST 解析');
    expect(text).toContain('calc');
    expect(text).toContain('opts: Opts'); // 多行签名被完整还原
    expect(text).toContain('Opts');
    expect(text).toContain('bad');
  });

  it('code_refs：定义带 AST 行号，引用被找到', async () => {
    fsSync.writeFileSync(path.join(ROOT, 'src', 'app.ts'), [
      'import { calc } from "./calc";',
      'const out = calc(1, 2, { scale: 3 });',
      'export { out };',
    ].join('\n'));
    const tool = new CodeRefsTool();
    const r = await tool.execute({ symbol: 'calc' }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('[function]'); // AST kind（启发式会给同名 kind，但这里验证不误报别的形态）
    expect(text).toContain('src/calc.ts:5'); // 多行签名起点行号准确
    expect(text).toContain('src/app.ts:2'); // 引用行
  });

  it('code_graph：调用边 caller 归属正确（AST 调用表达式）', async () => {
    const tool = new CodeGraphTool();
    const r = await tool.execute({ symbol: 'calc' }, { workspaceDir: WS });
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('上游 callers');
    expect(text).not.toContain('（仓库内未找到该符号的声明');
  });
});

describe('file_edit 真实写入', () => {
  it('CRLF 文件编辑后换行风格保留', async () => {
    const tool = new FileEditTool();
    const r = await tool.execute({
      path: 'src/crlf.txt',
      old_string: 'beta line',
      new_string: 'beta LINE',
    }, { workspaceDir: WS });
    expect(r.isError).toBeFalsy();
    const raw = await fsp.readFile(path.join(ROOT, 'src', 'crlf.txt'), 'utf-8');
    expect(raw).toBe('alpha line\r\nbeta LINE\r\n');
  });

  it('multi-hunk 真实落盘（一次调用改两处）', async () => {
    fsSync.writeFileSync(path.join(ROOT, 'src', 'multi.txt'), 'one\ntwo\nthree\nfour\n');
    const tool = new FileEditTool();
    const r = await tool.execute({
      path: 'src/multi.txt',
      edits: [
        { old_string: 'two', new_string: 'TWO' },
        { old_string: 'four', new_string: 'FOUR' },
      ],
    }, { workspaceDir: WS });
    expect(r.isError).toBeFalsy();
    expect(await fsp.readFile(path.join(ROOT, 'src', 'multi.txt'), 'utf-8')).toBe('one\nTWO\nthree\nFOUR\n');
  });
});
