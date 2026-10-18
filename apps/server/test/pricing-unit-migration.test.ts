/**
 * 定价单位落库迁移（server 端，2026-10-18）—— **真 temp DB 真跑**。
 *
 * ★ 为什么必须有真库部分（本项目头号判据：断言"存在"≠断言"生效"）：
 *   shared 侧的单测只证明"改写逻辑对"，证明不了 server 这条链路真跑在库上 ——
 *   SQL 字段错位、标记位 key 写错、启动接线漏挂，单测全绿但线上不生效。
 *
 * 覆盖：
 *   · 旧格式行（无 unit）0.002 元/千 → 2 元/百万（坑 #20 的抽样断言）；
 *   · 显式 per_1k 同样换算；已 per_1m / 空 `{}` / 坏 JSON 不动；
 *   · 标记位落 `app_config` + 幂等（第二次 ran=false；force 重跑 0 写）；
 *   · **双端单位一致**：迁移后算出的金额 == 迁移前「读时兜底」算出的金额（验收 11）；
 *   · 静态守卫：`index.ts` 启动段真的调了 `migrateModelPricingUnit`（防接线漏挂）。
 *
 * ★ 变异验证：
 *   · 把驱动里的 `UPDATE model SET pricing_json = ? WHERE id = ?` 参数顺序反过来 ⇒ 改写用例打红；
 *   · 把标记位判定删掉 ⇒ 幂等用例打红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { migrateModelPricingUnit } from '../src/services/pricing-unit-migration.js';
import { normalizePricing, computeCost, PRICING_UNIT_FLAG_KEY } from '@yan-zhi/shared';

const REPO = resolve(__dirname, '..', '..', '..');
const PID = 'p_pricing_mig';

function seedModels(): void {
  db.prepare("INSERT OR IGNORE INTO platform (id, user_id, name, protocol, api_url, created_at) VALUES (?, 'guest', '迁移测试平台', 'openai', 'https://x.example.com/v1', ?)")
    .run(PID, Date.now());
  const ins = db.prepare(
    'INSERT OR REPLACE INTO model (id, platform_id, user_id, model_id, pricing_json, enabled, is_default, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?)',
  );
  const now = Date.now();
  ins.run('m_old', PID, 'guest', 'old-model', JSON.stringify({ input: 0.002, output: 0.008 }), now);
  ins.run('m_per1k', PID, 'guest', 'per1k-model', JSON.stringify({ unit: 'per_1k', input: 0.001, output: 0.004 }), now);
  ins.run('m_done', PID, 'guest', 'done-model', JSON.stringify({ unit: 'per_1m', input: 2, output: 8, configured: true }), now);
  ins.run('m_empty', PID, 'guest', 'empty-model', '{}', now);
  ins.run('m_bad', PID, 'guest', 'bad-model', '{不是JSON', now);
  ins.run('m_null', PID, 'guest', 'null-model', null, now);
}

function pricingOf(id: string): any {
  const r = db.prepare('SELECT pricing_json FROM model WHERE id = ?').get(id) as any;
  return r?.pricing_json ? JSON.parse(r.pricing_json) : undefined;
}

beforeEach(() => {
  db.prepare('DELETE FROM model WHERE platform_id = ?').run(PID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
  db.prepare('DELETE FROM app_config WHERE key = ?').run(PRICING_UNIT_FLAG_KEY);
  seedModels();
});

afterEach(() => {
  db.prepare('DELETE FROM model WHERE platform_id = ?').run(PID);
  db.prepare('DELETE FROM platform WHERE id = ?').run(PID);
  db.prepare('DELETE FROM app_config WHERE key = ?').run(PRICING_UNIT_FLAG_KEY);
});

describe('migrateModelPricingUnit：server 端真库迁移', () => {
  it('★ 旧格式（无 unit）0.002 元/千 → 2 元/百万；显式 per_1k 同样换算', async () => {
    const r = await migrateModelPricingUnit();
    expect(r.ran).toBe(true);
    expect(r.updated).toBe(2); // m_old + m_per1k
    expect(r.failed).toEqual([]);

    const a = pricingOf('m_old');
    expect(a.unit).toBe('per_1m');
    expect(a.input).toBe(2);
    expect(a.output).toBe(8);
    expect(a.configured).toBe(true);

    const b = pricingOf('m_per1k');
    expect(b.unit).toBe('per_1m');
    expect(b.input).toBe(1);
    expect(b.output).toBe(4);
  });

  it('已 per_1m / 空 {} / 坏 JSON / null 一律不动（不制造写放大）', async () => {
    await migrateModelPricingUnit();
    expect(pricingOf('m_done').input).toBe(2);
    expect(pricingOf('m_done').unit).toBe('per_1m');
    const raw = (db.prepare('SELECT pricing_json FROM model WHERE id = ?').get('m_empty') as any).pricing_json;
    expect(raw).toBe('{}');
    const bad = (db.prepare('SELECT pricing_json FROM model WHERE id = ?').get('m_bad') as any).pricing_json;
    expect(bad).toBe('{不是JSON');
    const nul = (db.prepare('SELECT pricing_json FROM model WHERE id = ?').get('m_null') as any).pricing_json;
    expect(nul).toBeNull();
  });

  it('★ 标记位落 app_config；第二次 ran=false；force 重跑 0 写', async () => {
    const first = await migrateModelPricingUnit();
    expect(first.flagWritten).toBe(true);
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(PRICING_UNIT_FLAG_KEY) as any;
    expect(JSON.parse(row.value).done).toBe(true);

    const second = await migrateModelPricingUnit();
    expect(second.ran).toBe(false);
    expect(second.updated).toBe(0);

    const forced = await migrateModelPricingUnit({ force: true });
    expect(forced.ran).toBe(true);
    expect(forced.updated).toBe(0); // 已迁移的行不会二次 ×1000
    expect(pricingOf('m_old').input).toBe(2);
  });

  it('★ 双端单位一致：迁移后金额 == 迁移前「读时兜底」金额（验收 11）', async () => {
    const detail = { inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500 };
    const before = computeCost(detail, normalizePricing(pricingOf('m_old'))).cny; // 读时兜底（×1000）
    await migrateModelPricingUnit();
    const after = computeCost(detail, normalizePricing(pricingOf('m_old'))).cny; // 落库已迁移（不 ×1000）
    expect(before).toBeCloseTo(after, 12);
    // 且等于「元/百万」口径的等式：1000×2 + 500×8
    expect(after).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 12);
  });
});

describe('启动接线守卫', () => {
  it('index.ts 真调了 migrateModelPricingUnit（防"写了但没挂"）', () => {
    const src = readFileSync(resolve(REPO, 'apps/server/src/index.ts'), 'utf8');
    expect(src).toMatch(/import \{[^}]*migrateModelPricingUnit[^}]*\} from '\.\/services\/pricing-unit-migration\.js'/);
    expect(src).toMatch(/migrateModelPricingUnit\(\)/);
  });
});
