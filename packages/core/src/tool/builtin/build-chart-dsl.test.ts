// 图表取值口径：x=维度、y=数值指标（文本列不能当度量）。
import { describe, it, expect } from 'vitest';
import { inferMeasureColumns, pickColumns } from './build-chart-dsl';

const env = {
  columns: ['智能体', '类型', '调用次数', '成本元'],
  rows: [
    ['小说推文助手', 'harness', 6016, 117.55],
    ['抖音运营助手', 'agent', 339, 2.1],
  ],
};

describe('inferMeasureColumns', () => {
  it('只把数值列认成指标', () => {
    expect(inferMeasureColumns(env.columns, env.rows)).toEqual(['调用次数', '成本元']);
  });

  it('数字字符串也算；整列空值不算', () => {
    expect(inferMeasureColumns(['a', 'b', 'c'], [['12', null, 'x'], ['3', '', 'y']])).toEqual(['a']);
  });
});

describe('pickColumns', () => {
  it('缺省：x 取第一个非数值列（维度），y 取第一个数值列（指标）', () => {
    expect(pickColumns(env, undefined, undefined)).toEqual({ dim: '智能体', measures: ['调用次数'] });
  });

  it('显式给数值列当 y → 保留顺序（多系列）', () => {
    expect(pickColumns(env, '类型', ['成本元', '调用次数'])).toEqual({ dim: '类型', measures: ['成本元', '调用次数'] });
  });

  it('把文本列当 y → 直接报错并给出可选数值列（不再画一排 1）', () => {
    expect(() => pickColumns(env, '智能体', ['类型'])).toThrow(/不是数值列.*调用次数/);
  });

  it('没有数值列 → measures 为空，由调用方报错', () => {
    expect(pickColumns({ columns: ['a', 'b'], rows: [['x', 'y']] }, undefined, undefined)).toEqual({ dim: 'a', measures: [] });
  });
});
