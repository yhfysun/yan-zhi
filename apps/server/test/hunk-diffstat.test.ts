// 汇总卡「修改行数」的唯一算法来源（hunk-apply 的 LCS 复用）
//
// ★ 为什么单独钉：聊天卡上写 `+12 −3`，用户点开 diff 就必须看到 12 行新增 / 3 行删除。
//   行数口径一旦和 hunk 级接受（computeHunks / applyHunkSelection）不一致，
//   用户第一次核对就会不信这个数字，整个 review 功能等于白做。
import { describe, it, expect } from 'vitest';
import { diffStatLines } from '../src/services/hunk-apply.js';

describe('diffStatLines（改动行数统计）', () => {
  it('纯新增 / 纯删除 / 替换分别计数', () => {
    expect(diffStatLines('a\nb\n', 'a\nb\nc\n')).toEqual({ added: 1, deleted: 0, truncated: false });
    expect(diffStatLines('a\nb\nc\n', 'a\nc\n')).toEqual({ added: 0, deleted: 1, truncated: false });
    expect(diffStatLines('a\nb\nc\n', 'a\nX\nc\n')).toEqual({ added: 1, deleted: 1, truncated: false });
  });

  it('新建文件（before 为空串 / null 走 ?? \'\'）全部算新增', () => {
    expect(diffStatLines('', 'l1\nl2\nl3\n')).toEqual({ added: 3, deleted: 0, truncated: false });
  });

  it('无差异 → 0/0（内容完全一致时不能因为末尾换行差异虚报）', () => {
    expect(diffStatLines('a\nb\n', 'a\nb\n')).toEqual({ added: 0, deleted: 0, truncated: false });
  });

  it('★ CRLF 与 LF 视为同一行：只改行尾风格不算改动', () => {
    // 否则 Windows 上每个被工具重写过的文件都会显示「整个文件都改了」，行数彻底失去参考价值
    expect(diffStatLines('a\r\nb\r\n', 'a\nb\n')).toEqual({ added: 0, deleted: 0, truncated: false });
  });

  it('空文件 → 空文件 也是 0/0', () => {
    expect(diffStatLines('', '')).toEqual({ added: 0, deleted: 0, truncated: false });
  });

  it('★ 超 LCS 护栏（5000 行）→ truncated，不返回假数字', () => {
    const big = Array.from({ length: 6000 }, (_, i) => `line ${i}`).join('\n');
    const stat = diffStatLines(big, `${big}\nline 6000`);
    expect(stat.truncated).toBe(true);
    expect(stat.added).toBe(0);
    expect(stat.deleted).toBe(0);
  });
});
