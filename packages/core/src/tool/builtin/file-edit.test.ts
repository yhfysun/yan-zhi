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
