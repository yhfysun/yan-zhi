/**
 * 表 → 本体规格生成器单元测试（纯函数）。
 * 用户规则：描述默认取表备注；数值列→度量、日期时间列→时间维度、其余列→维度、主键→主实体。
 */
import { describe, it, expect } from 'vitest';
import { buildTableOntologySpec, sanitizeCode } from '../src/services/ontology-table-gen.js';

const TABLE = {
  name: 't_order',
  kind: 'table' as const,
  comment: '订单表：一笔订单=一个用户一次下单',
  columns: [
    { name: 'id', type: 'INTEGER', pk: true },
    { name: 'user_id', type: 'INTEGER', pk: false },
    { name: 'region', type: 'TEXT', pk: false },
    { name: 'status', type: 'TEXT', pk: false },
    { name: 'pay_amount', type: 'DECIMAL(12,2)', pk: false },
    { name: 'created_at', type: 'DATETIME', pk: false },
  ],
};

describe('buildTableOntologySpec', () => {
  const gen = buildTableOntologySpec(TABLE, '言智项目库');

  it('名称/描述默认取表备注', () => {
    expect(gen.name).toBe('订单表：一笔订单=一个用户一次下单');
    expect(gen.description).toContain('订单表');
    expect(gen.description).toContain('言智项目库.t_order');
  });

  it('无备注回退为 表名 + 库.表说明', () => {
    const g2 = buildTableOntologySpec({ ...TABLE, comment: undefined }, '数仓 ODS');
    expect(g2.name).toBe('t_order');
    expect(g2.description).toContain('数仓 ODS.t_order');
    expect(g2.description).toContain('待补充');
  });

  it('来源 SQL 逐列显式别名（过校验的前提）', () => {
    expect(gen.sourceSql).toContain('"id" AS "id"');
    expect(gen.sourceSql).toContain('FROM "t_order"');
    expect(gen.sourceSql.split('AS').length - 1).toBe(TABLE.columns.length);
  });

  it('数值列 → sum 度量（带类型描述）；主键不生成度量', () => {
    expect(gen.measures).toEqual([
      { name: 'pay_amount_sum', expr: 'pay_amount', agg: 'sum', description: '数值列，类型 DECIMAL(12,2)' },
    ]);
  });

  it('日期时间列 → 时间维度（带类型描述）', () => {
    expect(gen.timeDimensions).toEqual([
      { name: 'created_at', expr: 'created_at', description: '时间列，类型 DATETIME' },
    ]);
  });

  it('文本列 → 维度；主键 → 主实体', () => {
    expect(gen.dimensions.map((d) => d.name).sort()).toEqual(['region', 'status', 'user_id'].sort());
    expect(gen.entities).toEqual([{ name: 't_order', type: 'primary', expr: 'id' }]);
  });

  it('度量名与维度名冲突时自动让位', () => {
    const g3 = buildTableOntologySpec(
      {
        name: 't', kind: 'table',
        columns: [
          { name: 'pay_amount_sum', type: 'TEXT', pk: false }, // 文本维度，名字恰好像度量
          { name: 'pay_amount_sum', type: 'INT', pk: false },  // 重名数值列
        ],
      },
      'ds',
    );
    const names = g3.measures.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(g3.dimensions.map((d) => d.name));
  });

  it('全数值表无维度时兜底首列为维度', () => {
    const g4 = buildTableOntologySpec(
      { name: 'metrics', kind: 'table', columns: [{ name: 'cnt', type: 'INT', pk: true }] },
      'ds',
    );
    expect(g4.dimensions.length).toBe(1);
    expect(g4.dimensions[0].name).toBe('cnt');
  });

  it('视图 kind 不影响生成，code 取表名', () => {
    const g5 = buildTableOntologySpec({ ...TABLE, kind: 'view' }, 'ds');
    expect(g5.code).toBe('t_order');
  });
});

describe('sanitizeCode（本体 code 规则 ^[a-z][a-z0-9_]*$）', () => {
  it('大写转小写、连字符转下划线', () => {
    expect(sanitizeCode('T-Order')).toBe('t_order');
  });
  it('数字开头补前缀', () => {
    expect(sanitizeCode('123_table')).toBe('t_123_table');
  });
  it('特殊字符与首尾下划线清理', () => {
    expect(sanitizeCode('_t_order_')).toBe('t_order');
    // 全非法字符 → 清理后为空 → 兜底 'table'
    expect(sanitizeCode('订单表!!')).toBe('table');
  });
  it('Oracle 大写列名场景', () => {
    expect(sanitizeCode('GOV_MAIN')).toBe('gov_main');
  });
});
