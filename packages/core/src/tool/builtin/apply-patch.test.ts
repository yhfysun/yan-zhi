// apply_patch 协议回归测试（2026-10-19，对标 Codex 引入）。
//
// 守住的语义（每条都对应一个真实失败模式）：
//   ① 语法校验前置：结构不合法 → 落盘前报错，且错误带行号（不是执行到一半才发现）；
//   ② 按行上下文定位：不需要整段复述，也不会因 old_string 过短而"多处命中"；
//   ③ 上下文唯一性：命中多处时必须报错要求补上下文，绝不猜；
//   ④ 跨文件原子：任一文件失败 → 一个字节都不写；
//   ⑤ 新增/删除文件；CRLF 风格保留；行尾空白容忍。
import { describe, it, expect, beforeEach } from 'vitest';
import { parseApplyPatch, applyHunksToContent } from './apply-patch';
import { FileEditTool } from './file-edit';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';

/** 内存文件系统（实现 apply_patch 用到的面：read/write/exists/mkdir/remove） */
function makeMemFs(files: Map<string, string>): PlatformAdapter['fs'] {
  return {
    async readFile(p: string) {
      const c = files.get(p);
      if (c === undefined) throw new Error(`no such file: ${p}`);
      return c;
    },
    async writeFile(p: string, content: string) { files.set(p, content); },
    async exists(p: string) { return files.has(p); },
    async mkdir() { /* 内存 fs 无目录概念 */ },
    async remove(p: string) { files.delete(p); },
  } as unknown as PlatformAdapter['fs'];
}

const ROOT = 'C:/work/proj';
const A = `${ROOT}/src/a.ts`;
const B = `${ROOT}/src/b.ts`;

const A_CONTENT = [
  'import { x } from "./x";',
  '',
  'export function alpha() {',
  '  return 1;',
  '}',
  '',
  'export function beta() {',
  '  return 2;',
  '}',
].join('\n');

async function runPatch(files: Map<string, string>, patch: string) {
  const tool = new FileEditTool();
  const adapter = { platform: 'desktop', fs: makeMemFs(files) } as unknown as PlatformAdapter;
  setPlatformAdapter(adapter);
  return tool.execute({ patch }, { workspaceDir: ROOT });
}

const P = (...lines: string[]) => lines.join('\n');

describe('parseApplyPatch：结构错误在落盘前暴露', () => {
  it('缺少 *** Begin Patch → 报第 1 行', () => {
    const r = parseApplyPatch('*** Update File: a.ts\n*** End Patch');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('第 1 行');
    expect(r.error).toContain('*** Begin Patch');
  });

  it('缺少 *** End Patch（输出被截断）→ 明确报出来', () => {
    const r = parseApplyPatch(P('*** Begin Patch', '*** Update File: a.ts', ' x', '-y', '+z'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('*** End Patch');
  });

  it('无法识别的行 → 带行号', () => {
    const r = parseApplyPatch(P('*** Begin Patch', '*** Update File: a.ts', 'x y z', '*** End Patch'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('第 3 行');
  });

  it('块内只有 + 行（无上下文）→ 拒绝（无法定位，别猜）', () => {
    const r = parseApplyPatch(P('*** Begin Patch', '*** Update File: a.ts', '+new line', '*** End Patch'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('只有 "+" 新增行');
    expect(r.error).toContain('Add File');
  });

  it('同一文件出现多个段（同字面）→ 拒绝', () => {
    const r = parseApplyPatch(P(
      '*** Begin Patch',
      '*** Update File: a.ts', ' x', '-y', '+z',
      '*** Update File: a.ts', ' x', '-y', '+z',
      '*** End Patch',
    ));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('出现多次');
  });

  it('合法补丁 → 解析出 update/add/delete 三段', () => {
    const r = parseApplyPatch(P(
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@ alpha', ' export function alpha() {', '-  return 1;', '+  return 10;', ' }',
      '*** Add File: src/b.ts', '+export const b = 1;',
      '*** Delete File: src/old.ts',
      '*** End Patch',
    ));
    expect(r.ok).toBe(true);
    expect(r.ops.map((o) => o.kind)).toEqual(['update', 'add', 'delete']);
    expect(r.ops[0].hunks[0].header).toBe('alpha');
    expect(r.ops[1].addLines).toEqual(['export const b = 1;']);
  });
});

describe('applyHunksToContent：按行上下文定位', () => {
  const parse1 = (patch: string) => {
    const r = parseApplyPatch(patch);
    expect(r.ok).toBe(true);
    return r.ops[0].hunks;
  };

  it('带上下文的单块替换', () => {
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts',
      ' export function alpha() {', '-  return 1;', '+  return 10;', ' }',
      '*** End Patch',
    ));
    const r = applyHunksToContent(A_CONTENT, hunks);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('return 10;');
    expect(r.content).not.toContain('return 1;');
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
  });

  it('★ 命中多处 → 报错并列出行号（绝不猜一处改）', () => {
    const body = P('function f() {', '  return 1;', '}');
    const content = `${body}\n\n${body}`;
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts',
      ' function f() {', '   return 1;', '-}', '+} // changed',
      '*** End Patch',
    ));
    const r = applyHunksToContent(content, hunks);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('命中 2 处');
    expect(r.error).toContain('上下文');
  });

  it('多带上下文即可唯一命中', () => {
    const content = P('function f() {', '  return 1;', '}', '', 'function g() {', '  return 1;', '}');
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts',
      ' function g() {', '   return 1;', '-}', '+} // g',
      '*** End Patch',
    ));
    const r = applyHunksToContent(content, hunks);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('} // g');
    expect(r.content).toContain('function f() {\n  return 1;\n}'); // 另一处原样保留
  });

  it('行尾空白容忍（上下文行尾部丢空格也能命中）', () => {
    const content = 'const a = 1;   \nconst b = 2;\n';
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts',
      ' const a = 1;', '-const b = 2;', '+const b = 3;',
      '*** End Patch',
    ));
    const r = applyHunksToContent(content, hunks);
    expect(r.ok).toBe(true);
    expect(r.fuzzy).toBe(true);
    expect(r.content).toContain('const b = 3;');
  });

  it('同一补丁内多块顺序叠加', () => {
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts',
      '@@ alpha', ' export function alpha() {', '-  return 1;', '+  return 10;', ' }',
      '@@ beta', ' export function beta() {', '-  return 2;', '+  return 20;', ' }',
      '*** End Patch',
    ));
    const r = applyHunksToContent(A_CONTENT, hunks);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('return 10;');
    expect(r.content).toContain('return 20;');
    expect(r.added).toBe(2);
    expect(r.removed).toBe(2);
  });

  it('上下文对不上 → 报错且内容原样返回', () => {
    const hunks = parse1(P(
      '*** Begin Patch', '*** Update File: a.ts', ' 不存在的一行', '-x', '+y',
      '*** End Patch',
    ));
    const r = applyHunksToContent(A_CONTENT, hunks);
    expect(r.ok).toBe(false);
    expect(r.content).toBe(A_CONTENT);
    expect(r.error).toContain('file_read');
  });
});

describe('FileEditTool patch 模式：多文件 + 原子', () => {
  let files: Map<string, string>;
  beforeEach(() => { files = new Map([[A, A_CONTENT]]); });

  it('一次补丁改一个文件 + 新增一个文件', async () => {
    const r = await runPatch(files, P(
      '*** Begin Patch',
      '*** Update File: src/a.ts', ' export function beta() {', '-  return 2;', '+  return 20;', ' }',
      '*** Add File: src/b.ts', '+export const b = 1;', '+export const c = 2;',
      '*** End Patch',
    ));
    expect(r.isError).toBeFalsy();
    expect(files.get(A)).toContain('return 20;');
    expect(files.get(B)).toBe('export const b = 1;\nexport const c = 2;\n');
    const text = (r.content[0] as any).text as string;
    expect(text).toContain('M src/a.ts');
    expect(text).toContain('A src/b.ts');
    expect((r as any)._meta.changes).toHaveLength(2);
  });

  it('★★ 跨文件原子：第二个文件失败 → 第一个文件也不写', async () => {
    const before = files.get(A)!;
    const r = await runPatch(files, P(
      '*** Begin Patch',
      '*** Update File: src/a.ts', ' export function beta() {', '-  return 2;', '+  return 20;', ' }',
      '*** Add File: src/b.ts', '这行没有 + 前缀',
      '*** End Patch',
    ));
    expect(r.isError).toBe(true);
    expect(files.get(A)).toBe(before);
    expect(files.has(B)).toBe(false);
  });

  it('更新目标不存在 → 明确提示用 Add File', async () => {
    const r = await runPatch(files, P(
      '*** Begin Patch', '*** Update File: src/nope.ts', ' x', '-y', '+z', '*** End Patch',
    ));
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('*** Add File');
  });

  it('Add File 目标已存在 → 拒绝，且不覆盖', async () => {
    const r = await runPatch(files, P(
      '*** Begin Patch', '*** Add File: src/a.ts', '+覆盖内容', '*** End Patch',
    ));
    expect(r.isError).toBe(true);
    expect(files.get(A)).toBe(A_CONTENT);
  });

  it('Delete File', async () => {
    const r = await runPatch(files, P('*** Begin Patch', '*** Delete File: src/a.ts', '*** End Patch'));
    expect(r.isError).toBeFalsy();
    expect(files.has(A)).toBe(false);
    expect((r as any)._meta.changes[0].afterContent).toBeNull();
  });

  it('CRLF 文件保持 CRLF', async () => {
    files.set(A, A_CONTENT.replace(/\n/g, '\r\n'));
    const r = await runPatch(files, P(
      '*** Begin Patch', '*** Update File: src/a.ts',
      ' export function beta() {', '-  return 2;', '+  return 20;', ' }',
      '*** End Patch',
    ));
    expect(r.isError).toBeFalsy();
    const next = files.get(A)!;
    expect(next).toContain('\r\n');
    expect(next).not.toMatch(/[^\r]\n/);
  });

  it('★ 同一文件的不同写法（src/a.ts vs ./src/a.ts）→ 解析后仍判重复', async () => {
    const r = await runPatch(files, P(
      '*** Begin Patch',
      '*** Update File: src/a.ts', ' export function beta() {', '-  return 2;', '+  return 20;', ' }',
      '*** Update File: ./src/a.ts', ' export function beta() {', '-  return 2;', '+  return 30;', ' }',
      '*** End Patch',
    ));
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toContain('出现多次');
    expect(files.get(A)).toBe(A_CONTENT);
  });

  it('patch 与 old_string 同时传 → 拒绝（两种模式二选一）', async () => {
    const tool = new FileEditTool();
    setPlatformAdapter({ platform: 'desktop', fs: makeMemFs(files) } as unknown as PlatformAdapter);
    const r = await tool.execute(
      { patch: '*** Begin Patch\n*** Delete File: src/a.ts\n*** End Patch', old_string: 'x', new_string: 'y' },
      { workspaceDir: ROOT },
    );
    expect(r.isError).toBe(true);
    expect(files.has(A)).toBe(true);
  });

  it('只传 patch 不需要 path（schema 静态必填已让位给模式校验）', async () => {
    const tool = new FileEditTool();
    expect(tool.inputSchema.required).toEqual([]);
  });
});
