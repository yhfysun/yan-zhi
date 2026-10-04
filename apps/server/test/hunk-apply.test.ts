// hunk-apply 核心算法回归测试（P2-2）
// 守住的语义：
//   1) computeHunks：hunk 边界（新/老文件坐标、上下文包含、变更行数）；
//   2) applyHunkSelection：选中 → after；未选中 → before；等同行两侧同文；
//   3) 全选 = after；全不选/空选择 = null（不静默无操作）；
//   4) 新增行与删除行混合的场景（最易错位）。
import { describe, it, expect } from 'vitest';
import { computeHunks, applyHunkSelection } from '../src/services/hunk-apply.js';

describe('computeHunks', () => {
  it('三处相距较远的修改 → 三个 hunk，坐标为新/老文件 1-based 行号', () => {
    const before = Array.from({ length: 20 }, (_, i) => `old${i + 1}`).join('\n');
    const after = before.replace('old2', 'NEW2').replace('old10', 'NEW10').replace('old19', 'NEW19');
    const hunks = computeHunks(before, after);
    expect(hunks.length).toBe(3);
    // 第一个 hunk 必须覆盖新文件第 2 行
    expect(hunks[0].newStart).toBeLessThanOrEqual(2);
    expect(hunks[0].newEnd).toBeGreaterThanOrEqual(2);
    expect(hunks[0].changes).toBe(2); // 1 del + 1 ins（对齐 git diffstat 的 +/- 合计口径）
    // 第三个 hunk 覆盖第 19 行
    const last = hunks[hunks.length - 1];
    expect(last.newStart).toBeLessThanOrEqual(19);
    expect(last.newEnd).toBeGreaterThanOrEqual(19);
  });

  it('无差异 → 空 hunk 列表', () => {
    expect(computeHunks('a\nb', 'a\nb')).toEqual([]);
  });

  it('相邻变更（间隔 ≤ 2×上下文）合并为一个 hunk', () => {
    const before = 'a\nb\nc\nd\ne\nf\ng';
    const after = 'a\nB\nc\nD\ne\nf\ng'; // 第 2、4 行改，间隔 1 行 ≤ 6 → 合并
    const hunks = computeHunks(before, after);
    expect(hunks.length).toBe(1);
    expect(hunks[0].changes).toBe(4); // 2 处 × (1 del + 1 ins)
  });
});

describe('applyHunkSelection', () => {
  const before = [
    'function f() {',
    '  const a = 1;',
    '  const b = 2;',
    '  const c = 3;',
    '  const d = 4;',
    '  const e = 5;',
    '  const f2 = 6;',
    '  const g2 = 7;',
    '  return a + b + c + d + e + f2 + g2;',
    '}',
  ].join('\n');
  const after = [
    'function f() {',
    '  const a = 100;',
    '  const b = 2;',
    '  const c = 3;',
    '  const d = 4;',
    '  const e = 5;',
    '  const f2 = 6;',
    '  const g2 = 7;',
    '  return a + b + c + d + e + f2 + g2;',
    '}',
    '',
    'function g() {',
    '  return 42;',
    '}',
  ].join('\n');
  it('只接受第一个 hunk：a 的修改生效，g() 不出现', () => {
    const hunks = computeHunks(before, after);
    expect(hunks.length).toBe(2);
    const merged = applyHunkSelection(before, after, [hunks[0]])!;
    expect(merged).toContain('const a = 100;');
    expect(merged).not.toContain('function g');
    expect(merged).toContain('return a + b + c');
  });

  it('只接受第二个 hunk：a 保持 before 原值，g() 追加', () => {
    const hunks = computeHunks(before, after);
    const merged = applyHunkSelection(before, after, [hunks[1]])!;
    expect(merged).toContain('const a = 1;');
    expect(merged).not.toContain('const a = 100;');
    expect(merged).toContain('function g() {');
    expect(merged).toContain('return 42;');
  });

  it('全选 = after', () => {
    const merged = applyHunkSelection(before, after, computeHunks(before, after))!;
    expect(merged).toBe(after);
  });

  it('选择与实际 hunk 完全不匹配 → null（不静默无操作）', () => {
    expect(applyHunkSelection(before, after, [])).toBeNull();
    expect(applyHunkSelection(before, after, [{ newStart: 999, newEnd: 1000, oldStart: 999, oldEnd: 1000, changes: 0 }])).toBeNull();
  });

  it('删除行的取舍：未选中的删除保留 before 行', () => {
    const b = 'l1\nl2\nl3\nl4';
    const a2 = 'l1\nl3\nl4'; // 删除 l2
    const h = computeHunks(b, a2);
    // 不选 → 保留 before
    expect(applyHunkSelection(b, a2, [])).toBeNull();
    // 选 → after
    expect(applyHunkSelection(b, a2, h)).toBe(a2);
  });

  it('文件末尾新增块的选择合并（新文件行号坐标）', () => {
    const b = 'x\ny';
    const a3 = 'x\ny\nz1\nz2';
    const h = computeHunks(b, a3);
    expect(h.length).toBe(1);
    expect(h[0].newStart).toBeLessThanOrEqual(3); // 含上下文，向前延伸合法
    expect(h[0].newEnd).toBeGreaterThanOrEqual(4);
    expect(applyHunkSelection(b, a3, h)).toBe(a3);
  });
});
