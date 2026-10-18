import { describe, it, expect } from 'vitest';
import {
  migratePricingJsonText,
  planPricingUnitMigration,
  runPricingUnitMigration,
  PRICING_UNIT_FLAG_KEY,
  type PricingMigrationDb,
} from './pricing-migration.js';
import { normalizePricing, computeCost } from './model-cost.js';

/**
 * 定价单位落库迁移（元/千 → 元/百万，2026-10-18）。
 *
 * ★ 变异验证要求：
 *   · 把 `migratePricingJsonText` 里的 `normalizePricing` 换成"原样返回"（不 ×1000）
 *     ⇒ 「0.002 元/千 → 2 元/百万」用例**必须**打红；
 *   · 把 `p.unit === 'per_1m'` 的短路删掉 ⇒ 幂等用例**必须**打红（第二次跑会重复乘）；
 *   · 把驱动里 `UPDATE` 的字段顺序写反（值/参数错位）⇒ 真库用例（server 侧）打红；
 *   · 把标记位判定删掉 ⇒ 「标记位已置 ⇒ 跳过」用例打红。
 */
describe('migratePricingJsonText：单条改写（纯函数）', () => {
  it('★ 老值 0.002 元/千 → 2 元/百万（坑 #20 的核心抽样）', () => {
    const next = migratePricingJsonText(JSON.stringify({ input: 0.002, output: 0.008 }))!;
    expect(next).toBeTruthy();
    const p = JSON.parse(next);
    expect(p.unit).toBe('per_1m');
    expect(p.input).toBe(2);
    expect(p.output).toBe(8);
    expect(p.configured).toBe(true);
  });

  it('显式 per_1k 也按元/千换算（旧格式两种写法都要兜住）', () => {
    const p = JSON.parse(migratePricingJsonText(JSON.stringify({ unit: 'per_1k', input: 1, output: 4 }))!);
    expect(p.unit).toBe('per_1m');
    expect(p.input).toBe(1000);
    expect(p.output).toBe(4000);
  });

  it('cacheRead / cacheWrite 同步 ×1000（含旧式下划线字段）', () => {
    const p = JSON.parse(migratePricingJsonText(
      JSON.stringify({ input: 0.002, output: 0.008, cache_read: 0.0005, cacheWrite: 0.004 }),
    )!);
    expect(p.cacheRead).toBeCloseTo(0.5, 10);
    expect(p.cacheWrite).toBeCloseTo(4, 10);
  });

  it('★ 幂等：已是 per_1m 的行返回 null（第二次跑必然 0 写）', () => {
    expect(migratePricingJsonText(JSON.stringify({ unit: 'per_1m', input: 2, output: 8, configured: true }))).toBeNull();
  });

  it('空定价 / null / 非法 JSON 一律不动（不制造写放大、不炸）', () => {
    expect(migratePricingJsonText(null)).toBeNull();
    expect(migratePricingJsonText(undefined)).toBeNull();
    expect(migratePricingJsonText('')).toBeNull();
    expect(migratePricingJsonText('{}')).toBeNull();
    expect(migratePricingJsonText('null')).toBeNull();
    expect(migratePricingJsonText('{oops')).toBeNull();
  });

  it('全 0 定价：改写后仍是 0，但打上 per_1m（读时不再二次 ×1000）', () => {
    const p = JSON.parse(migratePricingJsonText(JSON.stringify({ input: 0, output: 0 }))!);
    expect(p.unit).toBe('per_1m');
    expect(p.input).toBe(0);
    expect(p.configured).toBe(false); // 「全是 0」= 没配价，不冒充免费
  });

  it('美元平台保留 currency，source / 原 updatedAt 不丢', () => {
    const p = JSON.parse(migratePricingJsonText(
      JSON.stringify({ currency: 'USD', input: 0.001, output: 0.002, source: 'manual', updatedAt: 111 }),
    )!);
    expect(p.currency).toBe('USD');
    expect(p.source).toBe('manual');
    expect(p.updatedAt).toBe(111);
  });

  it('★ 迁移后与「读时兜底」同口径（双端单位一致的判据）', () => {
    const old = { input: 0.002, output: 0.008 };
    const detail = { inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500 };
    // 未迁移时的读时兜底金额
    const viaFallback = computeCost(detail, normalizePricing(old)).cny;
    // 迁移后落库的值再读出来（此时 unit=per_1m，读时不再 ×1000）
    const viaMigrated = computeCost(
      detail,
      normalizePricing(JSON.parse(migratePricingJsonText(JSON.stringify(old))!)),
    ).cny;
    expect(viaMigrated).toBeCloseTo(viaFallback, 12);
    expect(viaMigrated).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 12);
  });
});

describe('planPricingUnitMigration：批量规划', () => {
  it('只挑出需要改写的行', () => {
    const plan = planPricingUnitMigration([
      { id: 'm1', pricing_json: JSON.stringify({ input: 0.002, output: 0.008 }) },
      { id: 'm2', pricing_json: JSON.stringify({ unit: 'per_1m', input: 2, output: 8 }) },
      { id: 'm3', pricing_json: '{}' },
      { id: 'm4', pricing_json: null },
      { id: 'm5', pricingJson: JSON.stringify({ input: 0.003 }) }, // 驼峰字段（Web adapter 形态）也认
    ]);
    expect(plan.map((p) => p.id)).toEqual(['m1', 'm5']);
    expect(JSON.parse(plan[0].pricingJson).input).toBe(2);
    expect(JSON.parse(plan[1].pricingJson).input).toBe(3);
  });
});

/** 内存假库：同步实现（server 端 better-sqlite3 形态） */
function fakeDb(rows: { id: string; pricing_json: string | null }[], opts: { withConfigTable?: boolean } = {}): {
  db: PricingMigrationDb;
  rows: { id: string; pricing_json: string | null }[];
  config: Map<string, string>;
  calls: string[];
} {
  const config = new Map<string, string>();
  const calls: string[] = [];
  const db: PricingMigrationDb = {
    query(sql, params): any {
      calls.push(`query:${sql}`);
      if (sql.includes('app_config')) {
        if (!opts.withConfigTable) throw new Error('no such table: app_config');
        const key = String((params || [])[0]);
        return config.has(key) ? [{ value: config.get(key) }] : [];
      }
      return rows.map((r) => ({ id: r.id, pricing_json: r.pricing_json }));
    },
    exec(sql, params) {
      calls.push(`exec:${sql}`);
      if (sql.includes('app_config')) {
        if (!opts.withConfigTable) throw new Error('no such table: app_config');
        config.set(String((params || [])[0]), String((params || [])[1]));
        return;
      }
      const id = String((params || [])[1]);
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error('no row');
      row.pricing_json = String((params || [])[0]);
    },
  };
  return { db, rows, config, calls };
}

describe('runPricingUnitMigration：驱动（两端共用）', () => {
  it('★ 真改写：旧格式行被写成 per_1m，已迁移行不动', async () => {
    const { db, rows } = fakeDb([
      { id: 'm1', pricing_json: JSON.stringify({ input: 0.002, output: 0.008 }) },
      { id: 'm2', pricing_json: JSON.stringify({ unit: 'per_1m', input: 2, output: 8 }) },
      { id: 'm3', pricing_json: '{}' },
    ]);
    const r = await runPricingUnitMigration(db);
    expect(r.ran).toBe(true);
    expect(r.scanned).toBe(3);
    expect(r.updated).toBe(1);
    expect(r.failed).toEqual([]);
    expect(JSON.parse(rows[0].pricing_json!).input).toBe(2);
    expect(rows[1].pricing_json).toBe(JSON.stringify({ unit: 'per_1m', input: 2, output: 8 }));
    expect(rows[2].pricing_json).toBe('{}');
  });

  it('★ 幂等：连跑两次，第二次 updated = 0（标记位存在时直接 ran=false）', async () => {
    const { db, config } = fakeDb(
      [{ id: 'm1', pricing_json: JSON.stringify({ input: 0.002 }) }],
      { withConfigTable: true },
    );
    const a = await runPricingUnitMigration(db);
    expect(a.updated).toBe(1);
    expect(config.get(PRICING_UNIT_FLAG_KEY)).toContain('"done":true');

    const b = await runPricingUnitMigration(db);
    expect(b.ran).toBe(false);
    expect(b.updated).toBe(0);

    // force 重跑：此时已无行需要改写
    const c = await runPricingUnitMigration(db, { force: true });
    expect(c.ran).toBe(true);
    expect(c.updated).toBe(0);
  });

  it('无 app_config 表（UI 端 core schema）：迁移照跑，标记位写失败但不报错', async () => {
    const { db, rows } = fakeDb([{ id: 'm1', pricing_json: JSON.stringify({ input: 0.002 }) }]);
    const r = await runPricingUnitMigration(db);
    expect(r.ran).toBe(true);
    expect(r.updated).toBe(1);
    expect(r.flagWritten).toBe(false);
    expect(JSON.parse(rows[0].pricing_json!).input).toBe(2);
  });

  it('异步 DB 也走同一驱动（UI adapter 形态）', async () => {
    const { db, rows } = fakeDb([{ id: 'm1', pricing_json: JSON.stringify({ output: 0.008 } ) }]);
    const asyncDb: PricingMigrationDb = {
      query: async (sql, params) => db.query(sql, params) as any,
      exec: async (sql, params) => db.exec(sql, params),
    };
    const r = await runPricingUnitMigration(asyncDb);
    expect(r.updated).toBe(1);
    expect(JSON.parse(rows[0].pricing_json!).output).toBe(8);
  });

  it('坏行不拖累好行：改写失败的 id 进 failed，其余照改', async () => {
    const { db } = fakeDb([
      { id: 'm1', pricing_json: JSON.stringify({ input: 0.002 }) },
      { id: 'm2', pricing_json: JSON.stringify({ input: 0.002 }) },
    ]);
    const flaky: PricingMigrationDb = {
      query: (sql, params) => db.query(sql, params),
      exec: (sql, params) => {
        if (String((params || [])[1]) === 'm2') throw new Error('disk I/O error');
        return db.exec(sql, params);
      },
    };
    const r = await runPricingUnitMigration(flaky);
    expect(r.updated).toBe(1);
    expect(r.failed).toEqual(['m2']);
  });

  it('model 表读不了 ⇒ 安静跳过（不抛）', async () => {
    const r = await runPricingUnitMigration({
      query: () => { throw new Error('no such table: model'); },
      exec: () => undefined,
    });
    expect(r.ran).toBe(false);
    expect(r.updated).toBe(0);
  });
});
