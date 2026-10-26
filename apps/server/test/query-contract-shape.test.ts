// 聚合结果整形单测（P0 图表层）。
//
// 守住的语义：
//   1) 多系列按 key × series 展开，缺失组合补 0（图表不能出现空洞）；
//   2) TopN 按 key 总量取前 N，其余按系列分别求和合并成「其他」；
//   3) 占比按所有系列的总和计算，四舍五入到两位；
//   4) 系列过多直接报错（继续画也读不出信息）。
//
// ★ 只测纯函数；连接器执行链不在本测试覆盖。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-agg-shape-'));

let shapeAggregateRows: typeof import('../src/services/query-contract.js').shapeAggregateRows;

beforeAll(async () => {
  ({ shapeAggregateRows } = await import('../src/services/query-contract.js'));
});

describe('shapeAggregateRows', () => {
  it('单系列：直接输出键与值', () => {
    const r = shapeAggregateRows({
      rows: [{ __k: 'a', __m: 2 }, { __k: 'b', __m: 3 }],
      measureName: 'row_count',
    });
    expect(r.series).toEqual(['row_count']);
    expect(r.points).toEqual([{ key: 'a', values: [2] }, { key: 'b', values: [3] }]);
    expect(r.total).toBe(5);
  });

  it('多系列：按 key × series 展开，缺失组合补 0', () => {
    const r = shapeAggregateRows({
      rows: [
        { __k: '周一', __s: '北京', __m: 10 },
        { __k: '周一', __s: '上海', __m: 4 },
        { __k: '周二', __s: '北京', __m: 7 },
      ],
      seriesDim: 'region',
      measureName: 'amount',
    });
    expect(r.series).toEqual(['北京', '上海']);
    expect(r.points).toEqual([
      { key: '周一', values: [10, 4] },
      { key: '周二', values: [7, 0] },
    ]);
    expect(r.total).toBe(21);
  });

  it('TopN：前 N 保留，其余按系列合并为「其他」', () => {
    const r = shapeAggregateRows({
      rows: [
        { __k: 'a', __s: 'x', __m: 10 },
        { __k: 'b', __s: 'x', __m: 8 },
        { __k: 'c', __s: 'x', __m: 5 },
        { __k: 'd', __s: 'x', __m: 2 },
        { __k: 'd', __s: 'y', __m: 3 },
      ],
      seriesDim: 'region',
      measureName: 'amount',
      topN: 2,
    });
    expect(r.series).toEqual(['x', 'y']);
    expect(r.points.map((p) => p.key)).toEqual(['a', 'b', '其他']);
    expect(r.points[2].values).toEqual([7, 3]);
    expect(r.total).toBe(28);
  });

  it('占比：按总和换算成百分比', () => {
    const r = shapeAggregateRows({
      rows: [{ __k: 'a', __m: 1 }, { __k: 'b', __m: 3 }],
      measureName: 'cnt',
      percent: true,
    });
    expect(r.points).toEqual([{ key: 'a', values: [25] }, { key: 'b', values: [75] }]);
    expect(r.total).toBe(4);
  });

  it('系列过多：报错并提示收窄维度', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ __k: 'k', __s: `s${i}`, __m: 1 }));
    expect(() => shapeAggregateRows({ rows, seriesDim: 'series', measureName: 'cnt' }))
      .toThrow(/系列过多/);
  });

  it('空值键与空值系列统一显示为 (空)', () => {
    const r = shapeAggregateRows({
      rows: [{ __k: null, __s: null, __m: 1 }],
      seriesDim: 'region',
      measureName: 'cnt',
    });
    expect(r.points[0]).toEqual({ key: '(空)', values: [1] });
    expect(r.series).toEqual(['(空)']);
  });
});
