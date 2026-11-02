/**
 * 跨本体 JOIN 编译（P3.3 后续）：Steiner 最小连接子树 + 多路径/扇出拒绝。
 *
 * 钉住三类会真实咬人的行为：
 *  ① 多跳：A→B→C 自动串出两段 JOIN，中间本体字段也能引用；
 *  ② 多路径：同一对本体存在两条等价最短路 → 结果不唯一，必须拒绝而不是随便选一条；
 *  ③ 扇出：一对多/多对多 JOIN 会把聚合放大 → 带度量时拒绝，只查维度才放行。
 */
import { describe, it, expect } from 'vitest';
import { compileOntologyJoinQuery, type OntologySpecWithCode } from '../src/services/ontology-compiler.js';

function spec(
  code: string,
  opts: {
    dims?: string[];
    measures?: { name: string; expr: string; agg?: 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max' }[];
    relations?: OntologySpecWithCode['relations'];
  } = {},
): OntologySpecWithCode {
  return {
    code,
    sourceSql: `SELECT * FROM ${code}`,
    aliases: [],
    dimensions: (opts.dims || []).map((name) => ({ name, expr: name })),
    timeDimensions: [],
    measures: (opts.measures || []).map((m) => ({ ...m, agg: m.agg || 'sum' })),
    filters: [],
    relations: opts.relations || [],
  };
}

function compileOk(specs: OntologySpecWithCode[], intent: Parameters<typeof compileOntologyJoinQuery>[2]) {
  return compileOntologyJoinQuery('sqlite', specs, intent);
}
function compileErr(specs: OntologySpecWithCode[], intent: Parameters<typeof compileOntologyJoinQuery>[2]) {
  try {
    compileOntologyJoinQuery('sqlite', specs, intent);
  } catch (e) {
    return String((e as Error).message);
  }
  throw new Error('预期编译失败，但实际成功');
}

describe('跨本体 JOIN · 多跳', () => {
  const orders = spec('orders', {
    dims: ['region'],
    measures: [{ name: 'amount', expr: 'amount' }],
    relations: [{ source: 'orders', type: 'N:1', target: 'customers', sourceAttr: 'customer_id', targetAttr: 'id' }],
  });
  const customers = spec('customers', {
    dims: ['name'],
    relations: [{ source: 'customers', type: 'N:1', target: 'regions', sourceAttr: 'region_id', targetAttr: 'id' }],
  });
  const regions = spec('regions', { dims: ['region_name'] });

  it('A→B→C：自动展开两段 JOIN，字段限定到各自别名', () => {
    const r = compileOk([orders, customers, regions], {
      root: 'orders', join: ['regions'],
      dimensions: ['regions.region_name'], measures: [{ name: 'amount' }],
    });
    expect(r.sql).toContain('INNER JOIN (SELECT * FROM customers) t_customers');
    expect(r.sql).toContain('INNER JOIN (SELECT * FROM regions) t_regions');
    expect(r.sql).toContain('t_regions."region_name"');
    expect(r.sql).toContain('SUM(_ont."amount")');
  });

  it('中间本体字段可引用（customers.name）', () => {
    const r = compileOk([orders, customers, regions], {
      root: 'orders', join: ['regions'], dimensions: ['customers.name', 'regions.region_name'],
    });
    expect(r.sql).toContain('t_customers."name"');
  });

  it('目标不存在 / 无路径 → 明确报错', () => {
    expect(compileErr([orders, customers], { root: 'orders', join: ['nope'], dimensions: ['region'] })).toMatch(/不存在或未发布/);
    const isolated = spec('isolated', { dims: ['x'] });
    expect(compileErr([orders, isolated], { root: 'orders', join: ['isolated'], dimensions: ['region'] })).toMatch(/没有可达的关联路径/);
  });
});

describe('跨本体 JOIN · 多路径拒绝', () => {
  // A→B→D 与 A→C→D 都是长度 2，编译结果不唯一
  const a = spec('a', {
    dims: ['x'],
    relations: [
      { source: 'a', type: 'N:1', target: 'b', sourceAttr: 'b_id', targetAttr: 'id' },
      { source: 'a', type: 'N:1', target: 'c', sourceAttr: 'c_id', targetAttr: 'id' },
    ],
  });
  const b = spec('b', { relations: [{ source: 'b', type: 'N:1', target: 'd', sourceAttr: 'd_id', targetAttr: 'id' }] });
  const c = spec('c', { relations: [{ source: 'c', type: 'N:1', target: 'd', sourceAttr: 'd_id', targetAttr: 'id' }] });
  const d = spec('d', { dims: ['y'] });

  it('两条等价最短路 → 拒绝并指明多路径扇出', () => {
    expect(compileErr([a, b, c, d], { root: 'a', join: ['d'], dimensions: ['d.y'] }))
      .toMatch(/多条等价最短关联|多路径扇出/);
  });
});

describe('跨本体 JOIN · 扇出拒绝', () => {
  const orders = spec('orders', {
    measures: [{ name: 'amount', expr: 'amount' }],
    relations: [{ source: 'orders', type: '1:N', target: 'items', sourceAttr: 'id', targetAttr: 'order_id' }],
  });
  const items = spec('items', { dims: ['sku'] });

  it('一对多 + 度量 → 拒绝（聚合会被放大）', () => {
    expect(compileErr([orders, items], { root: 'orders', join: ['items'], measures: [{ name: 'amount' }] }))
      .toMatch(/扇出放大/);
  });

  it('一对多只查维度 → 放行', () => {
    const r = compileOk([orders, items], { root: 'orders', join: ['items'], dimensions: ['items.sku'] });
    expect(r.sql).toContain('t_items."sku"');
    expect(r.sql).not.toContain('SUM(');
  });

  it('多对一 + 度量 → 不放大，放行', () => {
    const orderRoot = spec('orders', {
      measures: [{ name: 'amount', expr: 'amount' }],
      relations: [{ source: 'orders', type: 'N:1', target: 'customers', sourceAttr: 'customer_id', targetAttr: 'id' }],
    });
    const customers = spec('customers', { dims: ['name'] });
    const r = compileOk([orderRoot, customers], { root: 'orders', join: ['customers'], dimensions: ['customers.name'], measures: [{ name: 'amount' }] });
    expect(r.sql).toContain('INNER JOIN');
  });
});

describe('跨本体 JOIN · N:N 中间表与反向边', () => {
  it('N:N 经中间表展开两次 JOIN（只查维度）', () => {
    const products = spec('products', {
      relations: [{
        source: 'products', type: 'N:N', target: 'tags', sourceAttr: 'id', targetAttr: 'id',
        via: { table: 'product_tags', sourceColumn: 'product_id', targetColumn: 'tag_id' },
      }],
    });
    const tags = spec('tags', { dims: ['tag_name'] });
    const r = compileOk([products, tags], { root: 'products', join: ['tags'], dimensions: ['tags.tag_name'] });
    expect(r.sql).toContain('INNER JOIN "product_tags" _via_0');
    expect(r.sql).toContain('_via_0."product_id" = _ont."id"');
    expect(r.sql).toContain('_via_0."tag_id" = t_tags."id"');
  });

  it('从被关联侧反向发起：ON 条件按 side 正确翻转', () => {
    const orders = spec('orders', {
      relations: [{ source: 'orders', type: 'N:1', target: 'customers', sourceAttr: 'customer_id', targetAttr: 'id' }],
    });
    const customers = spec('customers', { dims: ['name'] });
    const r = compileOk([orders, customers], { root: 'customers', join: ['orders'], dimensions: ['name'] });
    expect(r.sql).toContain('ON _ont."id" = t_orders."customer_id"');
  });
});
