// buildUnifiedDiff 回归测试 —— 聊天流 diff 卡片（ChatFileChangeCard）的素材构建器
// 守住的语义：hunk 头行号正确（1-based）、上下文行数、无差异返回空串、大文件护栏退化。
import { describe, it, expect } from 'vitest';
import { buildUnifiedDiff } from './text-diff';

describe('buildUnifiedDiff', () => {
  it('无差异 → 空串', () => {
    expect(buildUnifiedDiff('a\nb\n', 'a\nb\n')).toBe('');
    expect(buildUnifiedDiff('', '')).toBe('');
  });

  it('单行修改：hunk 头与 +/- 行正确', () => {
    const d = buildUnifiedDiff('const a = 1;\nconst b = 2;\nconst c = 3;\n', 'const a = 1;\nconst b = 20;\nconst c = 3;\n');
    const lines = d.split('\n');
    expect(lines[0]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
    expect(lines).toContain('-const b = 2;');
    expect(lines).toContain('+const b = 20;');
    // 上下文行
    expect(lines).toContain(' const a = 1;');
    expect(lines).toContain(' const c = 3;');
  });

  it('新增/删除块', () => {
    const d = buildUnifiedDiff('a\nb\nc', 'a\nc');
    expect(d).toContain('-b');
    // 除 @@ 头外没有 + 行
    expect(d.split('\n').filter((l) => !l.startsWith('@@') && l.startsWith('+'))).toEqual([]);

    const d2 = buildUnifiedDiff('a\nc', 'a\nb\nc');
    expect(d2).toContain('+b');
    expect(d2.split('\n').filter((l) => !l.startsWith('@@') && l.startsWith('-'))).toEqual([]);
  });

  it('新文件：before 为空 → 全部为 + 行', () => {
    const d = buildUnifiedDiff('', 'x\ny\n');
    expect(d.split('\n')[0]).toMatch(/^@@ -0,0 \+1,2 @@$/);
    expect(d).toContain('+x');
    expect(d).toContain('+y');
    expect(d).not.toMatch(/^-/m);
  });

  it('相距很远的两处修改 → 两个 hunk', () => {
    const before = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `line${n}`).join('\n');
    const after = before
      .replace('line2', 'LINE2')
      .replace('line9', 'LINE9');
    const d = buildUnifiedDiff(before, after);
    const hunkHeads = d.split('\n').filter((l) => l.startsWith('@@'));
    expect(hunkHeads.length).toBe(2);
  });

  it('超过 2000 行的护栏：退化为整文件替换', () => {
    const before = Array.from({ length: 2500 }, (_, i) => `old${i}`).join('\n');
    const after = Array.from({ length: 2500 }, (_, i) => `new${i}`).join('\n');
    const d = buildUnifiedDiff(before, after);
    // 只有一个 hunk，涵盖全部行
    expect(d.split('\n').filter((l) => l.startsWith('@@')).length).toBe(1);
    expect(d).toContain('-old0');
    expect(d).toContain('+new2499');
  });

  it('CRLF 输入按 LF 比较', () => {
    expect(buildUnifiedDiff('a\r\nb\r\n', 'a\nb\n')).toBe('');
  });
});
