/**
 * 确定性画像采集（P2.5.1）单元测试：
 *  ① SQL 按方言 quote，表/列不裸拼；
 *  ② 空值率/基数/极值整形正确，样本值按出现次数截断；
 *  ③ 单列查询失败只跳过该列（记 warning），不拖垮整表；
 *  ④ 低基数判定是"候选枚举"的唯一口径。
 */
import { describe, it, expect } from 'vitest';
import {
  buildStatsSql,
  buildSamplesSql,
  profileTableWith,
  isLowCardinality,
  isLikelyNumericType,
  isLikelyTimeType,
  withSampleValues,
  type ProfileRunner,
  type TableProfile,
} from '../src/services/ontology-profile.js';

describe('画像 SQL 构造', () => {
  it('sqlite/pg 用双引号，mysql 用反引号，表列名不裸拼', () => {
    expect(buildStatsSql('sqlite', 'orders', 'amount')).toContain('FROM "orders"');
    expect(buildStatsSql('postgres', 'orders', 'amount')).toContain('FROM "orders"');
    expect(buildStatsSql('mysql', 'orders', 'amount')).toContain('FROM `orders`');
    expect(buildStatsSql('postgres', 'orders', 'amount')).toContain('COUNT(DISTINCT "amount")');
    expect(buildSamplesSql('sqlite', 'orders', 'status')).toContain('ORDER BY n DESC');
  });
});

describe('profileTableWith', () => {
  const runner = (responses: Record<string, Record<string, unknown>[]>): ProfileRunner => ({
    async query(sql: string) {
      for (const [mark, rows] of Object.entries(responses)) {
        if (sql.includes(mark)) return { rows };
      }
      throw new Error('unexpected sql');
    },
  });

  it('整形：空值率、基数、极值、样本值', async () => {
    const r = await profileTableWith(
      runner({
        'COUNT(*) AS total': [{ total: 100, nonnull: 80, dist: 4, mn: 'a', mx: 'z', av: 12.5 }],
        'GROUP BY': [{ v: 'paid', n: 50 }, { v: 'refund', n: 20 }],
      }),
      'sqlite',
      'orders',
      [{ name: 'status', type: 'varchar' }],
    );
    expect(r.rowCount).toBe(100);
    const c = r.columns[0];
    expect(c.nullCount).toBe(20);
    expect(c.nullRate).toBeCloseTo(0.2);
    expect(c.distinctCount).toBe(4);
    expect(c.min).toBe('a');
    expect(c.max).toBe('z');
    expect(c.avg).toBe('12.5');
    expect(c.samples).toEqual(['paid', 'refund']);
    expect(isLowCardinality(c)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('单列失败只跳过该列字段并记 warning', async () => {
    let statsCalls = 0;
    const failing: ProfileRunner = {
      async query(sql) {
        if (sql.includes('COUNT(*) AS total')) {
          statsCalls += 1;
          if (statsCalls === 1) throw new Error('permission denied');
          return { rows: [{ total: 10, nonnull: 10, dist: 2, mn: null, mx: null }] };
        }
        if (sql.includes('GROUP BY')) return { rows: [{ v: 'x', n: 3 }] };
        return { rows: [] };
      },
    };
    const r = await profileTableWith(failing, 'sqlite', 't', [
      { name: 'a', type: 'text' },
      { name: 'b', type: 'text' },
    ]);
    expect(r.warnings.some((w) => w.includes('a') && w.includes('统计失败'))).toBe(true);
    expect(r.columns[0].distinctCount).toBeUndefined();
    expect(r.columns[1].distinctCount).toBe(2);
    expect(r.rowCount).toBe(10);
  });

  it('样本值超长截断到 120 字符', async () => {
    const long = 'x'.repeat(200);
    const r = await profileTableWith(
      runner({
        'COUNT(*) AS total': [{ total: 1, nonnull: 1, dist: 1, mn: null, mx: null }],
        'GROUP BY': [{ v: long, n: 1 }],
      }),
      'sqlite',
      't',
      [{ name: 'c', type: 'text' }],
    );
    expect(r.columns[0].samples[0].length).toBeLessThanOrEqual(121);
    expect(r.columns[0].samples[0].endsWith('…')).toBe(true);
  });

  it('列数超上限只画像前 80 列并记 warning', async () => {
    const cols = Array.from({ length: 90 }, (_, i) => ({ name: `c${i}`, type: 'text' }));
    const r = await profileTableWith(
      { async query() { return { rows: [{ total: 1, nonnull: 1, dist: 1 }] }; } },
      'sqlite',
      'wide',
      cols,
    );
    expect(r.columns).toHaveLength(80);
    expect(r.warnings.some((w) => w.includes('超过 80'))).toBe(true);
  });
});

describe('类型启发式', () => {
  it('数值/时间类型识别', () => {
    expect(isLikelyNumericType('DECIMAL(18,2)')).toBe(true);
    expect(isLikelyNumericType('varchar')).toBe(false);
    expect(isLikelyTimeType('datetime')).toBe(true);
    expect(isLikelyTimeType('int')).toBe(false);
  });

  it('低基数：0 基数或全空不算候选枚举', () => {
    expect(isLowCardinality({ column: 'x', type: '', total: 10, nonNull: 10, nullCount: 0, nullRate: 0, distinctCount: 0, samples: [] })).toBe(false);
    expect(isLowCardinality({ column: 'x', type: '', total: 10, nonNull: 0, nullCount: 10, nullRate: 1, distinctCount: 1, samples: [] })).toBe(false);
    expect(isLowCardinality({ column: 'x', type: '', total: 10, nonNull: 10, nullCount: 0, nullRate: 0, distinctCount: 31, samples: [] })).toBe(false);
  });
});

describe('withSampleValues', () => {
  const profile: TableProfile = {
    table: 't', rowCount: 10, warnings: [],
    columns: [
      { column: 'status', type: 'text', total: 10, nonNull: 10, nullCount: 0, nullRate: 0, distinctCount: 3, samples: ['a', 'b', 'c'] },
      { column: 'order_id', type: 'text', total: 100, nonNull: 100, nullCount: 0, nullRate: 0, distinctCount: 50, samples: ['1', '2'] },
    ],
  };

  it('只给低基数列挂样本值，高基数与未匹配列不动，且不修改入参', () => {
    const dims = [{ name: 'status' }, { name: 'order_id' }, { name: 'other' }];
    const out = withSampleValues(dims, profile);
    expect(out[0].sampleValues).toEqual(['a', 'b', 'c']);
    expect(out[1].sampleValues).toBeUndefined();
    expect(out[2].sampleValues).toBeUndefined();
    expect(dims[0].sampleValues).toBeUndefined();
  });
});
