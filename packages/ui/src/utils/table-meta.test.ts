// 表格列元信息单测。
import { describe, it, expect } from 'vitest';
import { formatCell, inferColumnMeta, splitColumnRoles } from './table-meta';

describe('splitColumnRoles（图表只能拿数值列当指标）', () => {
  it('数值列进指标，文本/日期进维度', () => {
    const roles = splitColumnRoles(
      ['智能体', '类型', '调用次数', '成本元', '日期'],
      [
        { 智能体: '小说推文助手', 类型: 'harness', 调用次数: 6016, 成本元: 117.55, 日期: '2026-10-26' },
        { 智能体: '抖音运营助手', 类型: 'agent', 调用次数: 339, 成本元: 2.1, 日期: '2026-10-25' },
      ],
    );
    expect(roles.measures).toEqual(['调用次数', '成本元']);
    expect(roles.dims).toEqual(['智能体', '类型', '日期']);
  });

  it('数字字符串也算指标；整列空值两边都不进', () => {
    const roles = splitColumnRoles(
      ['v', 'empty', 'name'],
      [{ v: '12', empty: null, name: 'a' }, { v: '3', empty: '', name: 'b' }],
    );
    expect(roles.measures).toEqual(['v']);
    expect(roles.dims).toEqual(['name']);
  });
});

describe('inferColumnMeta', () => {
  it('数字右对齐，ID 给更宽，长文本给足宽度', () => {
    const meta = inferColumnMeta(
      ['cnt', 'user_id', 'title'],
      [
        { cnt: 1, user_id: '4f3a2b1c-9d8e-7f60-5a4b-3c2d1e0f9a8b', title: '这是一段比较长的标题，需要给足宽度才能看清内容' },
        { cnt: 12, user_id: '4f3a2b1c-9d8e-7f60-5a4b-3c2d1e0f9a8b', title: '短标题' },
      ],
    );
    expect(meta.cnt.align).toBe('right');
    expect(meta.cnt.kind).toBe('number');
    expect(meta.user_id.kind).toBe('id');
    expect(meta.user_id.width).toBeGreaterThanOrEqual(150);
    expect(meta.title.width).toBeGreaterThanOrEqual(140);
  });

  it('布尔居中、日期识别、空列降级', () => {
    const meta = inferColumnMeta(
      ['pinned', 'created_at', 'nothing'],
      [{ pinned: 1, created_at: '2026-10-26 10:00:00', nothing: null }],
    );
    expect(meta.pinned.kind).toBe('boolean');
    expect(meta.pinned.align).toBe('center');
    expect(meta.created_at.kind).toBe('date');
    expect(meta.nothing.kind).toBe('empty');
  });

  it('整列都是空数组/空对象 → empty（工作台自动隐藏这类噪声列）', () => {
    const meta = inferColumnMeta(['skills', 'meta'], [{ skills: [], meta: {} }, { skills: [], meta: {} }]);
    expect(meta.skills.kind).toBe('empty');
    expect(meta.meta.kind).toBe('empty');
  });
});

describe('formatCell', () => {
  it('空值 / 空数组 / 空对象显示破折号', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell(undefined)).toBe('—');
    expect(formatCell('')).toBe('—');
    expect(formatCell([])).toBe('—');
    expect(formatCell({})).toBe('—');
  });

  it('布尔转中文，对象转 JSON', () => {
    expect(formatCell(true)).toBe('是');
    expect(formatCell(false)).toBe('否');
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
    expect(formatCell('文本')).toBe('文本');
  });

  it('数字加千分位，数字字符串保持原样', () => {
    expect(formatCell(4567864)).toBe('4,567,864');
    expect(formatCell(22.06)).toBe('22.06');
    expect(formatCell(0)).toBe('0');
    // 数字字符串可能是编码/年份，不能被当数值改写
    expect(formatCell('20261019')).toBe('20261019');
  });
});
