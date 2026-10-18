/**
 * 费用账本 —— 用**真 SQLite** 跑**共享的那份 SQL**（2026-10-17）。
 *
 * ★ 为什么这里直接 import SQL 常量而不是"照着抄一份建表语句"：
 *   抄一份的话，"累加改成读改写"这种退化**测不出来**（复制品会跟着一起退化）。
 *   用真 SQL + 真 SQLite，才能钉住"原子累加"与"明细/累计对账一致"。
 *
 * ★ 变异验证：
 *   · 把 `UPSERT_CONVERSATION_USAGE` 的 `cost_cny = cost_cny + excluded.cost_cny`
 *     改成 `cost_cny = excluded.cost_cny`（= 覆盖而非累加）⇒ 累加用例**必须**打红；
 *   · 把 `UPDATE_NOTICE_STATE` 里 `cost_warned_at` 的 CASE 去掉（允许回退）⇒ 去重用例**必须**打红。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  CONVERSATION_USAGE_SCHEMA,
  USAGE_EVENT_SCHEMA,
  UPSERT_CONVERSATION_USAGE,
  INSERT_USAGE_EVENT,
  UPDATE_NOTICE_STATE,
} from '../src/usage-ledger-sql.js';
import { resolveModelPricing } from '../src/services/usage-ledger.js';
import { maybeNoticeCost, DEFAULT_COST_BUDGET, type CostNoticeState } from '@yan-zhi/shared';

let db: Database.Database;

function freshDb(): Database.Database {
  const d = new Database(':memory:');
  d.exec(CONVERSATION_USAGE_SCHEMA);
  d.exec(USAGE_EVENT_SCHEMA);
  return d;
}

/** 模拟"记一次调用"：写明细 + 原子累加（与 services/usage-ledger.ts 的 recordUsage 同序） */
function record(
  d: Database.Database,
  convId: string,
  ev: { modelId: string; input: number; read: number; write: number; output: number; cost: number; unpriced?: boolean },
): void {
  const now = Date.now();
  d.prepare(INSERT_USAGE_EVENT).run(
    `e_${Math.random().toString(36).slice(2)}`, convId, null, 'guest', 'p1', ev.modelId,
    'main', 'token', null,
    ev.input, ev.read, ev.write, ev.output,
    ev.cost, null, 0, now,
  );
  d.prepare(UPSERT_CONVERSATION_USAGE).run(
    convId, 'guest', ev.input, ev.read, ev.write, ev.output, ev.cost, ev.unpriced ? 1 : 0, now,
  );
}

beforeEach(() => {
  db = freshDb();
});

describe('★ 原子累加：多次调用必须累加，不是覆盖', () => {
  it('3 次调用 → 金额与 token 都是三者之和', () => {
    record(db, 'c1', { modelId: 'm', input: 100, read: 0, write: 0, output: 10, cost: 0.01 });
    record(db, 'c1', { modelId: 'm', input: 200, read: 50, write: 0, output: 20, cost: 0.02 });
    record(db, 'c1', { modelId: 'm', input: 300, read: 0, write: 80, output: 30, cost: 0.03 });

    const row = db.prepare('SELECT * FROM conversation_usage WHERE conversation_id = ?').get('c1') as any;
    expect(row.input_tokens).toBe(600);
    expect(row.cache_read_tokens).toBe(50);
    expect(row.cache_write_tokens).toBe(80);
    expect(row.output_tokens).toBe(60);
    expect(row.cost_cny).toBeCloseTo(0.06, 6);
  });

  it('★ 不同会话互不干扰', () => {
    record(db, 'c1', { modelId: 'm', input: 1, read: 0, write: 0, output: 1, cost: 1 });
    record(db, 'c2', { modelId: 'm', input: 1, read: 0, write: 0, output: 1, cost: 2 });
    const c1 = db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get('c1') as any;
    const c2 = db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get('c2') as any;
    expect(c1.cost_cny).toBe(1);
    expect(c2.cost_cny).toBe(2);
  });
});

describe('★ 账本一致：明细之和 == 会话累计（验收标准 6）', () => {
  it('N 次调用后对账相等', () => {
    const costs = [0.001, 0.0025, 0.0004, 0.03, 0.125];
    costs.forEach((c, i) => record(db, 'c9', {
      modelId: `m${i % 2}`, input: 10 * (i + 1), read: i, write: 0, output: i + 1, cost: c,
      unpriced: i === 4,
    }));

    const sum = db.prepare('SELECT SUM(cost_cny) AS s, SUM(input_tokens) AS t FROM usage_event WHERE conversation_id=?').get('c9') as any;
    const acc = db.prepare('SELECT * FROM conversation_usage WHERE conversation_id=?').get('c9') as any;

    expect(acc.cost_cny).toBeCloseTo(sum.s, 8);
    expect(acc.input_tokens).toBe(sum.t);
    // 未计价调用被计数（绝不能静默当 ¥0）
    expect(acc.unpriced_calls).toBe(1);
  });
});

describe('★ 提醒去重状态落库（不放内存、不靠前端）', () => {
  it('跨过档位后写回 noticedUnits，再判定不再提醒', () => {
    const cfg = DEFAULT_COST_BUDGET; // limit 5 / warnRatio 0.8 / hardStop 0
    const readState = (): CostNoticeState => {
      const r = db.prepare('SELECT cost_noticed_units, cost_warned_at FROM conversation_usage WHERE conversation_id=?').get('c1') as any;
      return { noticedUnits: r?.cost_noticed_units || 0, warned: (r?.cost_warned_at || 0) > 0 };
    };
    const saveState = (s: CostNoticeState) => {
      db.prepare(UPDATE_NOTICE_STATE).run('c1', Date.now(), s.noticedUnits, s.warned ? Date.now() : 0);
    };

    // 先花到 ¥5.2（已跨第 1 档）
    record(db, 'c1', { modelId: 'm', input: 1, read: 0, write: 0, output: 1, cost: 5.2 });
    const used = (db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get('c1') as any).cost_cny;

    const r1 = maybeNoticeCost(used, cfg, readState());
    expect(r1.kind).toBe('exceeded');
    saveState(r1.next);

    // 再花一点（未跨第 2 档）→ 不应再提醒
    record(db, 'c1', { modelId: 'm', input: 1, read: 0, write: 0, output: 1, cost: 0.5 });
    const used2 = (db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get('c1') as any).cost_cny;
    expect(maybeNoticeCost(used2, cfg, readState()).kind).toBeNull();

    // 跨到第 2 档 → 再提醒一次
    record(db, 'c1', { modelId: 'm', input: 1, read: 0, write: 0, output: 1, cost: 5 });
    const used3 = (db.prepare('SELECT cost_cny FROM conversation_usage WHERE conversation_id=?').get('c1') as any).cost_cny;
    const r3 = maybeNoticeCost(used3, cfg, readState());
    expect(r3.kind).toBe('exceeded');
    expect(r3.units).toBe(2);
  });

  it('★ warned 一旦为真不回退（否则每轮都会重发预警）', () => {
    db.prepare(UPDATE_NOTICE_STATE).run('c2', Date.now(), 0, 12345);
    const a = db.prepare('SELECT cost_warned_at FROM conversation_usage WHERE conversation_id=?').get('c2') as any;
    expect(a.cost_warned_at).toBe(12345);
    // 再写一次 warned=false（0）不应把已预警状态清掉
    db.prepare(UPDATE_NOTICE_STATE).run('c2', Date.now(), 0, 0);
    const b = db.prepare('SELECT cost_warned_at FROM conversation_usage WHERE conversation_id=?').get('c2') as any;
    expect(b.cost_warned_at).toBe(12345);
  });
});

describe('resolveModelPricing：用户配置优先，内置兜底', () => {
  it('用户配了价且 configured ⇒ 用用户的', () => {
    const p = resolveModelPricing('deepseek-v4-pro', { unit: 'per_1m', input: 99, output: 88, configured: true });
    expect(p?.input).toBe(99);
  });

  it('★ 没配价 ⇒ 回落到内置参考价（否则费用恒 ¥0、阈值永不触发）', () => {
    const p = resolveModelPricing('deepseek-v4-pro', undefined);
    expect(p?.configured).toBe(true);
    expect(p?.input).toBeCloseTo(9, 6);
  });

  it('用户配置但未 configured（旧数据全 0）⇒ 用内置的，不当成免费', () => {
    const p = resolveModelPricing('deepseek-v4-pro', { input: 0, output: 0 });
    expect(p?.configured).toBe(true);
    expect(p?.input).toBeCloseTo(9, 6);
  });

  it('内置表也没收录的模型 ⇒ undefined（调用方按「未配价」处理，标 unpriced）', () => {
    expect(resolveModelPricing('gpt-5.6', undefined)).toBeUndefined();
  });
});
