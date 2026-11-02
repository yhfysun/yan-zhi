/**
 * P2.5.2 命名与分布启发式：
 *  ① 列名 → 显示名（词表映射，未知词保留原名）；
 *  ② 角色推断（主键/外键/时间/度量/枚举/维度）；
 *  ③ 生成结果补 displayName/role/候选枚举，且不覆盖已有值。
 */
import { describe, it, expect } from 'vitest';
import { humanizeColumn, inferFieldRole, applyFieldHeuristics } from '../src/services/ontology-heuristics.js';
import type { ColumnProfile, TableProfile } from '../src/services/ontology-profile.js';

function col(column: string, extra: Partial<ColumnProfile> = {}): ColumnProfile {
  return {
    column, type: 'varchar', total: 100, nonNull: 100, nullCount: 0, nullRate: 0,
    distinctCount: 5, samples: [], values: [], ...extra,
  };
}

describe('humanizeColumn', () => {
  it('常见词表映射', () => {
    expect(humanizeColumn('user_id')).toBe('用户编号');
    expect(humanizeColumn('created_at')).toBe('创建时间');
    expect(humanizeColumn('pay_amount')).toBe('支付金额');
    expect(humanizeColumn('id')).toBe('编号');
  });

  it('未知词保留原名', () => {
    expect(humanizeColumn('foo_bar')).toBe('foo_bar');
    expect(humanizeColumn('')).toBe('');
  });
});

describe('inferFieldRole', () => {
  it('主键 / 外键 / 时间 / 度量', () => {
    expect(inferFieldRole({ name: 'id', pk: true })).toBe('identifier');
    expect(inferFieldRole({ name: 'order_id', type: 'int' })).toBe('foreign_key');
    expect(inferFieldRole({ name: 'created_at', type: 'datetime' })).toBe('time');
    expect(inferFieldRole({ name: 'amount', type: 'decimal(18,2)', profile: col('amount', { distinctCount: 500, values: undefined }) })).toBe('measure');
  });

  it('低基数文本 → 枚举；高基数文本 → 维度', () => {
    expect(inferFieldRole({ name: 'status', type: 'varchar', profile: col('status', { values: ['paid', 'refund'] }) })).toBe('enum');
    expect(inferFieldRole({ name: 'remark', type: 'varchar', profile: col('remark', { distinctCount: 900, values: undefined }) })).toBe('dimension');
  });

  it('低基数数值 → 枚举；无取值时仍按度量', () => {
    expect(inferFieldRole({ name: 'level', type: 'int', profile: col('level', { type: 'int', values: ['1', '2', '3'] }) })).toBe('enum');
    expect(inferFieldRole({ name: 'qty', type: 'int', profile: col('qty', { type: 'int', distinctCount: 400, values: undefined }) })).toBe('measure');
  });
});

describe('applyFieldHeuristics', () => {
  const profile: TableProfile = {
    table: 'orders', rowCount: 100, warnings: [],
    columns: [
      col('status', { values: ['paid', 'refund'] }),
      col('remark', { distinctCount: 900, values: undefined }),
      col('created_at', { type: 'datetime' }),
      col('amount', { type: 'decimal', distinctCount: 900, values: undefined }),
    ],
  };

  it('维度补显示名/角色/枚举；时间与度量角色固定', () => {
    const gen = {
      dimensions: [
        { name: 'status' },
        { name: 'remark' },
        { name: 'user_id' },
        { name: 'custom', displayName: '人工名', role: 'dimension' as const },
      ],
      timeDimensions: [{ name: 'created_at' }],
      measures: [{ name: 'amount' }],
    };
    const out = applyFieldHeuristics(gen, profile);
    expect(out.dimensions[0]).toMatchObject({ displayName: '状态', role: 'enum', enums: ['paid', 'refund'] });
    expect(out.dimensions[1]).toMatchObject({ displayName: '备注', role: 'dimension' });
    expect(out.dimensions[2]).toMatchObject({ displayName: '用户编号', role: 'foreign_key' });
    // 已有值不被覆盖
    expect(out.dimensions[3]).toMatchObject({ displayName: '人工名', role: 'dimension' });
    expect(out.timeDimensions[0]).toMatchObject({ displayName: '创建时间', role: 'time' });
    expect(out.measures[0]).toMatchObject({ displayName: '金额', role: 'measure' });
  });
});
