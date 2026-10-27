// 多度量合并（图表「指标」多选）：按 X 键对齐成多系列。
import { describe, it, expect } from 'vitest';
import { mergeAggregates } from '../src/services/query-contract.js';

describe('mergeAggregates', () => {
  it('无系列维度：每个度量一条系列，键按首个度量顺序', () => {
    const out = mergeAggregates([
      { measure: '调用次数', series: ['调用次数'], points: [{ key: 'A', values: [3] }, { key: 'B', values: [5] }], total: 8 },
      { measure: '成本元', series: ['成本元'], points: [{ key: 'A', values: [1.5] }, { key: 'B', values: [2] }], total: 8 },
    ]);
    expect(out.series).toEqual(['调用次数', '成本元']);
    expect(out.points).toEqual([
      { key: 'A', values: [3, 1.5] },
      { key: 'B', values: [5, 2] },
    ]);
  });

  it('有系列维度：系列名 = 度量 · 系列值，缺失补 0', () => {
    const out = mergeAggregates([
      { measure: '调用次数', series: ['线上'], points: [{ key: 'A', values: [3] }], total: 3 },
      { measure: '成本元', series: ['线下'], points: [{ key: 'A', values: [2] }], total: 3 },
    ]);
    expect(out.series).toEqual(['调用次数 · 线上', '成本元 · 线下']);
    expect(out.points).toEqual([{ key: 'A', values: [3, 2] }]);
  });

  it('percent：按系列合计换算百分比', () => {
    const out = mergeAggregates([
      { measure: 'v', series: ['v'], points: [{ key: 'A', values: [1] }, { key: 'B', values: [3] }], total: 4 },
    ], true);
    expect(out.points).toEqual([
      { key: 'A', values: [25] },
      { key: 'B', values: [75] },
    ]);
  });
});
