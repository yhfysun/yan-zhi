/**
 * 关联推断（P2.5.3 命名部分）单元测试：
 *  ① 表名归一化与单复数变体；
 *  ② `xxx_id` → 同名表主键给出 N:1 候选；
 *  ③ 多条候选（user / users）视为歧义，不猜；
 *  ④ 主键列本身不当作关联列。
 */
import { describe, it, expect } from 'vitest';
import { inferRelations, normalizeTableName, nameVariants } from '../src/services/ontology-relation-infer.js';
import type { TableSchemaLite } from '../src/services/ontology-table-gen.js';

function table(name: string, cols: { name: string; pk?: boolean }[]): TableSchemaLite {
  return {
    name,
    kind: 'table',
    columns: cols.map((c) => ({ name: c.name, type: 'text', pk: !!c.pk })),
  };
}

describe('表名归一化', () => {
  it('去 schema 前缀与 t_/tb_/tbl_ 前缀', () => {
    expect(normalizeTableName('public.Orders')).toBe('orders');
    expect(normalizeTableName('t_order')).toBe('order');
    expect(normalizeTableName('tbl_users')).toBe('users');
  });

  it('单复数变体', () => {
    expect(nameVariants('user')).toContain('users');
    expect(nameVariants('orders')).toContain('order');
    expect(nameVariants('categories')).toContain('category');
  });
});

describe('inferRelations', () => {
  it('user_id → users(id)：N:1 + 高置信', () => {
    const r = inferRelations([
      table('orders', [{ name: 'id', pk: true }, { name: 'user_id' }, { name: 'amount' }]),
      table('users', [{ name: 'id', pk: true }, { name: 'name' }]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      sourceTable: 'orders', sourceColumn: 'user_id', targetTable: 'users', targetColumn: 'id', type: 'N:1',
    });
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(r[0].reason).toContain('users');
  });

  it('目标表无主键标记时回落到 id', () => {
    const r = inferRelations([
      table('orders', [{ name: 'customer_id' }]),
      table('customers', [{ name: 'id' }, { name: 'name' }]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].targetColumn).toBe('id');
  });

  it('多个同名候选（user / users）视为歧义，不猜', () => {
    const r = inferRelations([
      table('orders', [{ name: 'user_id' }]),
      table('user', [{ name: 'id', pk: true }]),
      table('users', [{ name: 'id', pk: true }]),
    ]);
    expect(r).toEqual([]);
  });

  it('主键列不当作关联列；无匹配表不产出', () => {
    const r = inferRelations([
      table('orders', [{ name: 'id', pk: true }, { name: 'status_id' }]),
      table('users', [{ name: 'id', pk: true }]),
    ]);
    expect(r).toEqual([]);
  });

  it('输出按 sourceTable + sourceColumn 稳定排序', () => {
    const r = inferRelations([
      table('orders', [{ name: 'user_id' }, { name: 'product_id' }]),
      table('users', [{ name: 'id', pk: true }]),
      table('products', [{ name: 'id', pk: true }]),
    ]);
    expect(r.map((x) => x.sourceColumn)).toEqual(['product_id', 'user_id']);
  });
});
