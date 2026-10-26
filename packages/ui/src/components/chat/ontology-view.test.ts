import { describe, it, expect } from 'vitest';
import { buildOntologyIntent, ontologyRowsToChartData } from './ontology-view';

describe('buildOntologyIntent', () => {
  it('组装时间维度/多维度/多度量/过滤器', () => {
    const intent = buildOntologyIntent({
      dimensions: ['类型', '状态'],
      timeDimension: { name: '创建时间', grain: 'month' },
      measures: [{ name: '金额', agg: 'sum' }, { name: 'row_count' }],
      filters: ['已删除'],
      limit: 200,
    });
    expect(intent).toEqual({
      limit: 200,
      dimensions: ['类型', '状态'],
      timeDimension: { name: '创建时间', grain: 'month' },
      measures: [{ name: '金额', agg: 'sum' }, { name: 'row_count' }],
      filters: ['已删除'],
    });
  });

  it('limit 越界收敛到 1..1000，缺省 500', () => {
    expect(buildOntologyIntent({ limit: 99999 }).limit).toBe(1000);
    expect(buildOntologyIntent({ limit: 0 }).limit).toBe(1);
    expect(buildOntologyIntent({}).limit).toBe(500);
  });

  it('丢弃空维度/空度量，不产生空数组字段', () => {
    const intent = buildOntologyIntent({ dimensions: ['', '  '], measures: [{ name: '' }], filters: [] });
    expect('dimensions' in intent).toBe(false);
    expect('measures' in intent).toBe(false);
    expect('filters' in intent).toBe(false);
  });
});

describe('ontologyRowsToChartData', () => {
  const rows = [
    { 类型: 'A', row_count: 3 },
    { 类型: 'B', row_count: 7 },
    { 类型: 'A', row_count: 2 },
  ];

  it('无系列：按 X 值归并并求和，series 为度量名', () => {
    const data = ontologyRowsToChartData(rows, { xField: '类型', measures: ['row_count'] });
    expect(data.series).toEqual(['row_count']);
    expect(data.dim).toBe('类型');
    expect(data.measure).toBe('row_count');
    expect(data.points).toEqual([
      { key: 'A', values: [5] },
      { key: 'B', values: [7] },
    ]);
    expect(data.total).toBe(2);
  });

  it('多度量：每个度量一条系列', () => {
    const data = ontologyRowsToChartData(
      [{ 类型: 'A', 金额: 10, row_count: 2 }],
      { xField: '类型', measures: ['金额', 'row_count'] },
    );
    expect(data.series).toEqual(['金额', 'row_count']);
    expect(data.points).toEqual([{ key: 'A', values: [10, 2] }]);
  });

  it('第二维度拆系列：系列名为「度量 · 系列值」，缺值补 0', () => {
    const data = ontologyRowsToChartData(
      [
        { 类型: 'A', 渠道: '线上', 金额: 5 },
        { 类型: 'B', 渠道: '线下', 金额: 8 },
      ],
      { xField: '类型', measures: ['金额'], seriesField: '渠道' },
    );
    expect(data.series).toEqual(['金额 · 线上', '金额 · 线下']);
    expect(data.points).toEqual([
      { key: 'A', values: [5, 0] },
      { key: 'B', values: [0, 8] },
    ]);
  });

  it('topN 按合计降序截断', () => {
    const data = ontologyRowsToChartData(
      [{ 类型: 'A', v: 1 }, { 类型: 'B', v: 9 }, { 类型: 'C', v: 5 }],
      { xField: '类型', measures: ['v'], topN: 2 },
    );
    expect(data.points.map((p) => p.key)).toEqual(['B', 'C']);
  });

  it('percent 按系列合计换算成百分比', () => {
    const data = ontologyRowsToChartData(
      [{ 类型: 'A', v: 1 }, { 类型: 'B', v: 3 }],
      { xField: '类型', measures: ['v'], percent: true },
    );
    expect(data.points).toEqual([
      { key: 'A', values: [25] },
      { key: 'B', values: [75] },
    ]);
  });

  it('非数值/null 记 0，不产生 NaN', () => {
    const data = ontologyRowsToChartData(
      [{ 类型: 'A', v: null }, { 类型: 'B', v: 'abc' }, { 类型: 'C', v: '4' }],
      { xField: '类型', measures: ['v'] },
    );
    expect(data.points.map((p) => p.values[0])).toEqual([0, 0, 4]);
  });

  it('空结果返回空 points', () => {
    const data = ontologyRowsToChartData([], { xField: '类型', measures: ['v'] });
    expect(data.points).toEqual([]);
    expect(data.total).toBe(0);
  });
});
