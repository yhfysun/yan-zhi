// file_edit 多 hunk + 模糊匹配的回归测试（2026-10-03 P0 反馈闭环配套）
// 守住的语义：
//   1) edits 数组一次改多处，原子生效 —— 任一 hunk 未命中则整个调用不落盘；
//   2) 行尾空白容忍的模糊回退 —— 精确未命中但 rtrim 后逐行相等也能替换（标注 fuzzy）；
//   3) 单 old_string/new_string 老用法完全兼容。
import { describe, it, expect, beforeEach } from 'vitest';
import { FileEditTool } from './file-edit';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';

/** 内存文件系统（只实现 file_edit 用到的面） */
function makeMemFs(files: Map<string, string>): Pick<PlatformAdapter, 'fs'>['fs'] {
  return {
    async readFile(p: string) {
      const c = files.get(p);
      if (c === undefined) throw new Error(`no such file: ${p}`);
      return c;
    },
    async writeFile(p: string, content: string) { files.set(p, content); },
    async exists(p: string) { return files.has(p); },
  } as unknown as PlatformAdapter['fs'];
}

const FILE = 'C:/work/proj/src/a.ts';
const CONTENT = [
  'import { x } from "./x";',
  '',
  'export function alpha() {',
  '  return 1;   ',
  '}',
  '',
  'export function beta() {',
  '  return 2;',
  '}',
].join('\n');

async function run(files: Map<string, string>, args: Record<string, unknown>) {
  const tool = new FileEditTool();
  const adapter = { platform: 'desktop', fs: makeMemFs(files) } as unknown as PlatformAdapter;
  setPlatformAdapter(adapter);
  return tool.execute(args, { workspaceDir: 'C:/work/proj' });
}

describe('file_edit multi-hunk', () => {
  let files: Map<string, string>;
  beforeEach(() => { files = new Map([[FILE, CONTENT]]); });

  it('edits 数组一次改两处，全部生效', async () => {
    const r = await run(files, {
      path: FILE,
      edits: [
        { old_string: 'export function alpha() {', new_string: 'export function alpha(name: string) {' },
        { old_string: '  return 2;', new_string: '  return 22;' },
      ],
    });
    expect(r.isError).toBeFalsy();
    const next = files.get(FILE)!;
    expect(next).toContain('export function alpha(name: string) {');
    expect(next).toContain('return 22;');
    expect(next).toContain('return 1;'); // 未匹配的 hunk 内容原样保留
  });

  it('任一 hunk 未命中 → 报错且不落盘（原子）', async () => {
    const r = await run(files, {
      path: FILE,
      edits: [
        { old_string: 'export function alpha() {', new_string: 'export function alpha(q) {' },
        { old_string: 'THIS DOES NOT EXIST', new_string: 'x' },
      ],
    });
    expect(r.isError).toBe(true);
    expect(files.get(FILE)).toBe(CONTENT); // 内容原封不动
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('2/2'); // 指明失败的是第 2 个 hunk
    expect(text).toContain('未落盘');
  });

  it('第二个 hunk 与第一个替换结果相邻也能按序套用', async () => {
    const r = await run(files, {
      path: FILE,
      edits: [
        { old_string: '  return 1;', new_string: '  const v = 1;\n  return v;' },
        { old_string: '  const v = 1;', new_string: '  const v = 10;' },
      ],
    });
    expect(r.isError).toBeFalsy();
    expect(files.get(FILE)).toContain('const v = 10;');
  });
});

describe('file_edit 模糊匹配（行尾空白容忍）', () => {
  let files: Map<string, string>;
  beforeEach(() => { files = new Map([[FILE, CONTENT]]); });

  it('精确未命中但 rtrim 逐行相等 → 模糊命中并替换', async () => {
    // 文件里是 '  return 1;   '（行尾 3 空格），模型给的 old_string 带 2 个尾随空格
    // —— 精确子串匹配失败（第 3 个空格挡住换行），模糊回退应命中并整窗替换
    const r = await run(files, {
      path: FILE,
      old_string: '  return 1;  \n}',
      new_string: '  return 100;\n}',
    });
    expect(r.isError).toBeFalsy();
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('trailing-whitespace tolerance');
    expect(files.get(FILE)).toContain('  return 100;\n}');
    expect(files.get(FILE)).toContain('return 2;');
  });

  it('多命中且无 replace_all → 报错引导扩大上下文', async () => {
    const r = await run(files, {
      path: FILE,
      old_string: '}', // 两处函数收尾
      new_string: '};',
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('匹配到 3 处'); // alpha/beta 收尾 + import { x } 里各一个
  });

  it('精确唯一命中时不走模糊（行为不变）', async () => {
    const r = await run(files, {
      path: FILE,
      old_string: 'export function beta() {',
      new_string: 'export function beta(tag: string) {',
    });
    expect(r.isError).toBeFalsy();
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).not.toContain('tolerance');
  });
});

describe('file_edit 单 hunk 兼容（老用法）', () => {
  it('old_string 缺失给出 edits 引导', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, { path: FILE, new_string: 'x' });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('edits');
  });
});

// 2026-10-21 实报（conv 9e9bcd12）：449 行文件上连续 5 次 old_string 未命中，
// 唯一的反馈是「文件头 300 字符」⇒ 模型反复整读文件再猜。未命中必须指向落点。
describe('file_edit 未命中反馈（指向落点）', () => {
  it('回带行号的最接近片段，供模型照抄修正', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, {
      path: FILE,
      old_string: 'export function alpha() {\n  return 999;\n}',
      new_string: 'export function alpha2() {}',
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/最接近的片段在第 \d+-\d+ 行/);
    expect(text).toContain('export function alpha() {');
    expect(text).toContain('return 1;'); // 窗口里带着真实原文
    expect(text).toContain('逐字照抄');
    expect(text).not.toContain('File head preview'); // 旧的无效线索必须消失
    expect(files.get(FILE)).toBe(CONTENT); // 仍然不落盘
  });

  it('找不到相近片段时引导 grep，而不是给一个错落点', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, {
      path: FILE,
      old_string: 'zzz qqq unrelated payload\nsecond line',
      new_string: 'x',
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('找不到相近片段');
    expect(text).toContain('file_grep');
    expect(text).not.toMatch(/最接近的片段在第/);
  });

  it('提示行号按「已套用前几个 hunk 后」的内容计数', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, {
      path: FILE,
      edits: [
        { old_string: 'export function alpha() {', new_string: 'export function alpha() {\n  // inserted' },
        { old_string: 'export function beta() {\n  return 9999;\n}', new_string: 'x' },
      ],
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('已套用前几个 hunk 后');
  });
});

// 2026-10-21 用户要求「文件格式对齐 trae / codex / claude code」：
// 三家生态的入参命名与补丁格式都认，别让模型按训练习惯发参数时被判"缺参/未命中"。
describe('file_edit 格式兼容（trae / claude code / codex）', () => {
  it('file_path 别名等价于 path（Claude Code / Codex 命名）', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, {
      file_path: FILE,
      old_string: 'export function beta() {',
      new_string: 'export function beta(x: number) {',
    });
    expect(r.isError).toBeFalsy();
    expect(files.get(FILE)).toContain('export function beta(x: number) {');
  });

  it('Trae / Cline 的 SEARCH/REPLACE 块（<<<<<<< 风格）', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const block = [
      '<<<<<<< SEARCH',
      'export function beta() {',
      '  return 2;',
      '}',
      '=======',
      'export function beta() {',
      '  return 22;',
      '}',
      '>>>>>>> REPLACE',
    ].join('\n');
    const r = await run(files, { path: FILE, search_replace: block });
    expect(r.isError).toBeFalsy();
    expect(files.get(FILE)).toContain('return 22;');
    expect(files.get(FILE)).toContain('return 1;'); // 未涉及的 alpha 原样
  });

  it('Cline 的 ------- SEARCH / +++++++ REPLACE 写法也认', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const block = ['------- SEARCH', '  return 1;', '=======', '  return 11;', '+++++++ REPLACE'].join('\n');
    const r = await run(files, { file_path: FILE, diff: block });
    expect(r.isError).toBeFalsy();
    expect(files.get(FILE)).toContain('return 11;');
  });

  it('多块一次原子生效：任一块不匹配则整份不落盘', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const okBlock = ['<<<<<<< SEARCH', '  return 1;', '=======', '  return 111;', '>>>>>>> REPLACE'].join('\n');
    const badBlock = ['<<<<<<< SEARCH', 'THIS DOES NOT EXIST', '=======', 'x', '>>>>>>> REPLACE'].join('\n');
    const r = await run(files, { path: FILE, search_replace: `${okBlock}\n${badBlock}` });
    expect(r.isError).toBe(true);
    expect(files.get(FILE)).toBe(CONTENT); // 原子：一个字都没写
  });

  it('块结构不完整 → 明确报错（不静默当成 old_string 去乱改）', async () => {
    const files = new Map([[FILE, CONTENT]]);
    const r = await run(files, { path: FILE, search_replace: '<<<<<<< SEARCH\n  return 1;\n' });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('SEARCH/REPLACE');
    expect(files.get(FILE)).toBe(CONTENT);
  });
});
