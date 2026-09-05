/**
 * 本体查询编译引擎 v1 单元测试（sqlite 方言为主，跨方言抽查）
 *
 * 单本体 DSL → SQL：维度/度量/时间粒度/过滤器/排序/分页，
 * 幻觉字段拦截（意图引用不存在的维度/度量/时间维度必须在编译期报错）。
 */
import { describe, it, expect } from 'vitest';
import { compileOntologyQuery, type OntologySpec } from '../src/services/ontology-compiler.js';

const SPEC: OntologySpec = {
  sourceSql: `SELECT o.id AS order_id, o.user_id AS user_id, o.region AS region,
       o.pay_amount AS pay_amount, o.status AS status, o.created_at AS created_at
FROM t_order o WHERE o.is_deleted = 0`,
  aliases: ['order_id', 'user_id', 'region', 'pay_amount', 'status', 'created_at'],
  dimensions: [
    { name: 'region', expr: 'region' },
    { name: 'status', expr: 'status' },
  ],
  timeDimensions: [{ name: 'created_at', expr: 'created_at', granularities: ['day', 'month'] }],
  measures: [
    { name: 'order_count', expr: 'order_id', agg: 'count_distinct', additive: 'additive' },
    { name: 'pay_amount_sum', expr: 'pay_amount', agg: 'sum', additive: 'additive' },
    { name: 'avg_order_value', expr: 'pay_amount', agg: 'avg', additive: 'non_additive' },
  ],
  filters: [],
};

describe('compileOntologyQuery · sqlite', () => {
  it('纯度量：无 GROUP BY，全表聚合', () => {
    const r = compileOntologyQuery('sqlite', SPEC, { measures: [{ name: 'order_count' }] });
    expect(r.sql).toContain('COUNT(DISTINCT order_id) AS "order_count"');
    expect(r.sql).toContain('FROM (');
    expect(r.sql).toContain('LIMIT 200');
    expect(r.sql).not.toContain('GROUP BY');
  });

  it('维度 + 度量：GROUP BY 按维度表达式', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {
      dimensions: ['region'],
      measures: [{ name: 'pay_amount_sum' }],
    });
    expect(r.sql).toContain('region AS "region"');
    expect(r.sql).toContain('SUM(pay_amount) AS "pay_amount_sum"');
    expect(r.sql).toContain('GROUP BY region');
  });

  it('时间维度：按粒度分桶并参与 GROUP BY', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {
      timeDimension: { name: 'created_at', grain: 'month' },
      measures: [{ name: 'order_count' }],
    });
    expect(r.sql).toContain("strftime('%Y-%m', created_at) AS \"created_at\"");
    expect(r.sql).toContain('GROUP BY');
  });

  it('过滤器注入 WHERE（裸条件原样放行，外层加括号）+ 行级策略语义由 source_sql 承担', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {
      measures: [{ name: 'pay_amount_sum' }],
      filters: ["status = 'paid'", 'pay_amount > 100'],
    });
    expect(r.sql).toContain("WHERE (status = 'paid')\n  AND (pay_amount > 100)");
  });

  it('默认意图取第一个度量', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {});
    expect(r.sql).toContain('"order_count"');
  });

  it('排序：仅允许输出列，未知排序被忽略', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {
      dimensions: ['region'],
      measures: [{ name: 'pay_amount_sum' }],
      orderBy: [{ name: 'pay_amount_sum', dir: 'desc' }, { name: 'order_count' }],
    });
    expect(r.sql).toContain('ORDER BY "pay_amount_sum" DESC');
    expect(r.sql).not.toContain('"order_count" DESC'); // order_count 不在输出列 → 忽略
    expect(r.warnings.some((w) => w.includes('order_count'))).toBe(true);
  });

  it('幻觉维度报错并给出可用列表', () => {
    expect(() =>
      compileOntologyQuery('sqlite', SPEC, { dimensions: ['user_nickname'] }),
    ).toThrow(/不存在/);
  });

  it('幻觉度量报错', () => {
    expect(() => compileOntologyQuery('sqlite', SPEC, { measures: [{ name: 'gmv' }] })).toThrow(/gmv/);
  });

  it('幻觉时间维度报错', () => {
    expect(() =>
      compileOntologyQuery('sqlite', SPEC, { timeDimension: { name: 'paid_at' } }),
    ).toThrow(/paid_at/);
  });

  it('不支持的粒度报错', () => {
    expect(() =>
      compileOntologyQuery('sqlite', SPEC, { timeDimension: { name: 'created_at', grain: 'decade' as never } }),
    ).toThrow(/粒度/);
  });

  it('空意图（无任何选择器）报错', () => {
    const emptySpec: OntologySpec = { ...SPEC, measures: [], dimensions: [], timeDimensions: [] };
    expect(() => compileOntologyQuery('sqlite', emptySpec, {})).toThrow(/意图为空/);
  });

  it('limit 上限钳到 1000', () => {
    const r = compileOntologyQuery('sqlite', SPEC, { measures: [{ name: 'order_count' }], limit: 99999 });
    expect(r.sql).toContain('LIMIT 1000');
  });
});

describe('compileOntologyQuery · 非加度量保护与跨方言', () => {
  it('non_additive 度量拒绝改写聚合并按定义执行', () => {
    const r = compileOntologyQuery('sqlite', SPEC, {
      measures: [{ name: 'avg_order_value', agg: 'sum' }],
    });
    expect(r.warnings.some((w) => w.includes('不可加'))).toBe(true);
    expect(r.sql).toContain('AVG(pay_amount)'); // 按定义 avg，不是 SUM
  });

  it('mysql 方言：时间桶用 DATE_FORMAT，分页用 LIMIT', () => {
    const r = compileOntologyQuery('mysql', SPEC, {
      timeDimension: { name: 'created_at', grain: 'month' },
      measures: [{ name: 'order_count' }],
    });
    expect(r.sql).toContain("DATE_FORMAT(created_at, '%Y-%m')");
    expect(r.sql).toContain('LIMIT 200');
  });

  it('oracle 方言：时间桶用 TO_CHAR，分页用 FETCH FIRST', () => {
    const r = compileOntologyQuery('oracle', SPEC, {
      timeDimension: { name: 'created_at', grain: 'month' },
      measures: [{ name: 'order_count' }],
      limit: 50,
    });
    expect(r.sql).toContain("TO_CHAR(created_at, 'YYYY-MM')");
    expect(r.sql).toContain('FETCH FIRST 50 ROWS ONLY');
  });

  it('postgres 方言：date_trunc', () => {
    const r = compileOntologyQuery('postgres', SPEC, {
      timeDimension: { name: 'created_at', grain: 'month' },
      measures: [{ name: 'order_count' }],
    });
    expect(r.sql).toContain("date_trunc('month', created_at)");
  });
});
