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

  it('数值列 → sum 度量（带类型描述）；主键不生成度量；额外生成 row_count 行计数度量', () => {
    // row_count 是 2026-09-08 新增能力（expr='*' + agg='count' → COUNT(*)）：
    // 「有多少条/多少个」是最常见的数据问法，只给 *_sum 的话模型会拿 SUM(某列) 凑数或退化写裸 SQL。
    // 它无对应物理列，故 description 走固定文案、没有「类型 X」后缀。
    expect(gen.measures).toEqual([
      {
        name: 'row_count', expr: '*', agg: 'count', additive: 'additive',
        description: '行数（记录条数）：回答「有多少/多少个/多少条」时用它',
      },
      { name: 'pay_amount_sum', expr: 'pay_amount', agg: 'sum', description: '类型 DECIMAL(12,2)' },
    ]);
    // 主键（id，INTEGER）不生成 *_sum 度量
    expect(gen.measures.some((m) => m.expr === 'id')).toBe(false);
  });

  it('日期时间列 → 时间维度（描述优先取内置列词典）', () => {
    // 描述优先级：表词典 → COMMON_FIELD_DOCS → 「类型 X」兜底。
    // created_at 命中 ontology-docs.ts 的通用列词典，故不再退化成类型描述。
    expect(gen.timeDimensions).toEqual([
      { name: 'created_at', expr: 'created_at', description: '创建时间（毫秒时间戳）' },
    ]);
    // 未命中词典的列才回退类型描述（此处 status 命中词典、region 无词典 → 类型兜底）
    const region = gen.dimensions.find((d) => d.name === 'region');
    expect(region?.description).toBe('类型 TEXT');
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
