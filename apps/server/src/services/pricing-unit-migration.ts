/**
 * 定价单位落库迁移（server 端接线，2026-10-18）：元/千 token → 元/百万 token。
 *
 * ★ 为什么不能只靠**读时兜底**（`normalizePricing`）：
 *   读时兜底保证「金额永远算对」，但**单位**这件事两端各有一份库写路径 ——
 *   server 端（`routes/platforms.ts`）与 UI 端离线直连库（`packages/ui/src/stores/platform.ts`）。
 *   只迁移一端 ⇒ 另一端编辑模型时会把已换算好的「元/百万」值**当成元/千原样写回**，
 *   同一条记录两端单位不一致 ⇒ 金额时大时小 1000 倍、且极难复现（坑 #20）。
 *
 * ⇒ 换算与驱动的**唯一实现在 `@yan-zhi/shared`**（`utils/pricing-migration.ts`），
 *   本文件只是把 server 的**同步** better-sqlite3 适配成驱动要求的接口（两端同一段逻辑）。
 *
 * ★ 幂等：`unit !== 'per_1m'` 才改写，改写后必带 `per_1m` ⇒ 第二次跑 0 写；
 *   `app_config` 标记位（key `model_pricing_unit_per1m_v1`）只用于省一次全表扫描。
 */

import { db } from '../db.js';
import {
  runPricingUnitMigration,
  type PricingMigrationResult,
  type PricingMigrationDb,
} from '@yan-zhi/shared';

/**
 * 同步 better-sqlite3 → 驱动接口。
 *
 * 驱动内部每步 `await`，同步实现就地返回 ⇒ 整段在同一轮微任务里跑完；
 * 调用方（`index.ts` 启动段）用 `void ... .catch()` 挂载即可，不必为了它把启动流程改成异步。
 */
const serverDb: PricingMigrationDb = {
  query: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as any[])) as T[],
  exec: (sql: string, params: unknown[] = []) => { db.prepare(sql).run(...(params as any[])); },
};

/** 跑一次迁移。**所有失败都在内部吞掉**（返回 `failed`），启动路径不允许因迁移炸掉。 */
export function migrateModelPricingUnit(opts?: { force?: boolean }): Promise<PricingMigrationResult> {
  return runPricingUnitMigration(serverDb, opts);
}
