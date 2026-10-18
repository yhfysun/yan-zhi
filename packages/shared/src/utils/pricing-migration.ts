/**
 * 定价单位落库迁移：**元/千 token → 元/百万 token**（2026-10-18）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么必须「落库迁移」，光有读时兜底不够
 *
 * `normalizePricing()`（`model-cost.ts`）读到 `unit` 缺失的旧数据会 ×1000，所以**金额永远是对的**。
 * 但「单位」这件事在**两端各有一份库写路径**：
 *   · server 端：`routes/platforms.ts` 写 `model.pricing_json`
 *   · UI 端（离线直连库）：`packages/ui/src/stores/platform.ts` 也直接写 `model` 表
 * 只迁移一端 ⇒ 用户在另一端编辑模型时，把已经换算好的「元/百万」值**当成元/千原样写回**
 * （或反过来把旧的元/千值写回去）⇒ 同一条记录两端单位不一致，
 * 表现为「这台机器上算出来的钱不对」，且极难复现。
 *
 * ⇒ **同一段迁移逻辑本模块收口，两端各调一次**（坑 #20）。
 *
 * ---
 * ## 三层兜底（缺一不可）
 *
 * | 层         | 位置                                             | 作用                     |
 * | --------- | ---------------------------------------------- | ---------------------- |
 * | 落库（server） | `apps/server/src/services/pricing-unit-migration.ts` | 启动时把存量行改写成 per_1m     |
 * | 落库（UI）    | `packages/ui/src/stores/platform.ts` 离线分支            | 同上（UI 端也直接写库）          |
 * | 读时         | `normalizePricing()`                           | 迁移漏跑 / 旧版本写回旧格式时仍不出错 |
 *
 * ---
 * ## ★ 幂等性：不靠标记位也安全
 *
 * 判据是「`unit !== 'per_1m'` 才改写」，改写后必然带 `unit:'per_1m'`
 * ⇒ 第二次跑**必然 0 写**。标记位（`app_config`）只是省一次全表扫描，
 * **写标记位失败不影响正确性**（读时兜底仍在）。
 * ⚠️ 反过来：标记位一旦置上就不会再扫，若将来旧版本程序又写回旧格式，
 *   靠的是读时兜底兜住 —— 这正是标记位不能替代读时兜底的理由。
 *
 * ---
 * ## ★ 换算只此一处
 *
 * ×1000 的语义**不再本模块重写**，直接复用 `normalizePricing()`
 * （`model-cost.ts`）—— 迁移与读时是同一个换算实现，不会漂移。
 */

import { normalizePricing } from './model-cost.js';

/** 标记位 key（`app_config`）：已跑过一次落库迁移 */
export const PRICING_UNIT_FLAG_KEY = 'model_pricing_unit_per1m_v1';

export interface PricingMigrationRow {
  id: string;
  /** `model.pricing_json` 原值；字段名为兼容两端（better-sqlite3 与 UI adapter 都返回蛇形） */
  pricing_json?: string | null;
  pricingJson?: string | null;
}

export interface PricingMigrationUpdate {
  id: string;
  /** 改写后的 `pricing_json`（必定带 `unit:'per_1m'`） */
  pricingJson: string;
}

/**
 * ★ 迁移逻辑的唯一实现（**纯函数，零 DB 依赖，可单测**）。
 *
 * @returns 改写后的 JSON 串；`null` = 无需改写（已是 per_1m / 空定价 / 非法 JSON）
 *
 * 跳过规则：
 * · 空 / `null` / `{}` —— 没有可换算的数字，改写只会制造无意义的写放大；
 * · 已 `unit:'per_1m'` —— 迁移过了（幂等的关键）；
 * · 非法 JSON —— 别动，读时 `normalizePricing` 会当"未配价"处理。
 */
export function migratePricingJsonText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '{}' || s === '[]') return null;

  let parsed: unknown;
  try { parsed = JSON.parse(s); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const p = parsed as Record<string, unknown>;
  if (p.unit === 'per_1m') return null; // 已迁移

  // ★ 复用唯一换算实现：unit 缺失 或 'per_1k' ⇒ ×1000（含 cacheRead/cacheWrite）
  const n = normalizePricing(p);
  if (!n) return null;

  return JSON.stringify({ ...n, updatedAt: n.updatedAt ?? Date.now() });
}

/** 批量规划（纯函数）：给定行 → 需要改写的行 */
export function planPricingUnitMigration(rows: PricingMigrationRow[]): PricingMigrationUpdate[] {
  const out: PricingMigrationUpdate[] = [];
  for (const r of rows) {
    const next = migratePricingJsonText(r.pricing_json ?? r.pricingJson ?? null);
    if (next !== null) out.push({ id: r.id, pricingJson: next });
  }
  return out;
}

/**
 * 迁移动驱要求的 DB 最小接口。
 *
 * ★ 为什么方法可以是同步的：server 端是 better-sqlite3（同步），UI 端是 adapter（异步）。
 *   驱动内部一律 `await`，同步实现就地返回 ⇒ 两端共用同一段驱动逻辑，不写两份。
 */
export interface PricingMigrationDb {
  query<T = any>(sql: string, params?: unknown[]): T[] | Promise<T[]>;
  exec(sql: string, params?: unknown[]): unknown | Promise<unknown>;
}

export interface PricingMigrationResult {
  /** false = 标记位已置，跳过（或连表都读不了） */
  ran: boolean;
  /** 扫到的 model 行数 */
  scanned: number;
  /** 实际改写行数 */
  updated: number;
  /** 改写失败的行 id（逐个 try，坏行不拖累好行） */
  failed: string[];
  /** 标记位是否写进 `app_config`（UI 端该表可能不存在 ⇒ false，无害） */
  flagWritten: boolean;
}

function truthyFlag(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return !!(p && typeof p === 'object' && (p as any).done === true);
    } catch { return false; }
  }
  return false;
}

/**
 * 跑一次落库迁移（**两端共用的唯一驱动**）。
 *
 * ★ 全部 IO 逐个 try/catch：启动路径上的迁移**不允许**因为某个库缺表、某行是坏 JSON
 *   就把整个启动流程炸掉 —— 最坏情况退化为"没迁移"，而读时兜底仍在。
 */
export async function runPricingUnitMigration(
  db: PricingMigrationDb,
  opts: { flagKey?: string; now?: number; force?: boolean } = {},
): Promise<PricingMigrationResult> {
  const flagKey = opts.flagKey ?? PRICING_UNIT_FLAG_KEY;
  const now = opts.now ?? Date.now();
  const empty = (ran: boolean): PricingMigrationResult =>
    ({ ran, scanned: 0, updated: 0, failed: [], flagWritten: false });

  // ① 标记位（表不存在 ⇒ 视作未迁移，继续跑，跑完再试写标记）
  if (!opts.force) {
    try {
      const rows = await db.query<any>('SELECT value FROM app_config WHERE key = ?', [flagKey]);
      if (truthyFlag(rows?.[0]?.value)) return empty(false);
    } catch { /* 无 app_config 表：按未迁移处理 */ }
  }

  // ② 扫描
  let rows: any[] = [];
  try {
    rows = (await db.query<any>('SELECT id, pricing_json FROM model')) || [];
  } catch {
    return empty(false); // model 表都读不了 ⇒ 这里不是该跑迁移的地方
  }
  const plan = planPricingUnitMigration(rows as PricingMigrationRow[]);

  // ③ 改写
  const failed: string[] = [];
  for (const u of plan) {
    try {
      await db.exec('UPDATE model SET pricing_json = ? WHERE id = ?', [u.pricingJson, u.id]);
    } catch {
      failed.push(u.id);
    }
  }

  // ④ 写标记位（失败无所谓：迁移本身幂等，下次重扫一遍而已）
  let flagWritten = false;
  try {
    await db.exec(
      'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [flagKey, JSON.stringify({ done: true, updated: plan.length - failed.length, at: now }), now],
    );
    flagWritten = true;
  } catch { /* UI 端 core schema 没有 app_config ⇒ 走"每次启动重扫"路径 */ }

  return {
    ran: true,
    scanned: rows.length,
    updated: plan.length - failed.length,
    failed,
    flagWritten,
  };
}
