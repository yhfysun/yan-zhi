import type { ModelHealthState, ModelHealthView } from '@yan-zhi/shared';
import type { YzSqliteDb } from './sqlite-driver.js';

const FAIL_WINDOW_MS = 30 * 60 * 1000;
const COOLDOWN_BASE_MS = 60 * 1000;
const COOLDOWN_MAX_MS = 10 * 60 * 1000;
const UNKNOWN_HEALTH_SCORE = 0.75;

export interface ModelHealthRow {
  modelId: string;
  platformId: string;
  failCount: number;
  lastFailAt: number | null;
  lastSuccessAt: number | null;
  cooldownUntil: number;
  lastError: string | null;
}

/** 失败后的短冷却，避免刚失败的模型立刻被下一轮重新选中；连续失败最多冷却 10 分钟。 */
export function cooldownMsForFailCount(failCount: number): number {
  const n = Math.max(1, Math.floor(failCount));
  return Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** Math.min(n - 1, 4));
}

export function healthStateAt(row: ModelHealthRow | undefined, now = Date.now()): ModelHealthState {
  if (!row) return 'unknown';
  if (row.cooldownUntil > now) return 'cooling';
  if (!row.lastFailAt || now - row.lastFailAt > FAIL_WINDOW_MS) return 'healthy';
  if (row.lastSuccessAt && row.lastSuccessAt >= row.lastFailAt) return 'healthy';
  return 'degraded';
}

export function modelHealthScoreAt(row: ModelHealthRow | undefined, now = Date.now()): number {
  if (!row) return UNKNOWN_HEALTH_SCORE;
  if (row.cooldownUntil > now) return 0;
  if (!row.lastFailAt || now - row.lastFailAt > FAIL_WINDOW_MS) return 1;
  if (row.lastSuccessAt && row.lastSuccessAt >= row.lastFailAt) return 1;
  return Math.max(0.1, 1 / (1 + Math.max(1, row.failCount)));
}

/** 稳定排序：同分保持用户在候选池里的原始顺序。 */
export function stableHealthOrder<T>(items: T[], scoreOf: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreOf(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function rowFromDb(row: any): ModelHealthRow {
  return {
    modelId: String(row.model_id || ''),
    platformId: String(row.platform_id || ''),
    failCount: Number(row.fail_count) || 0,
    lastFailAt: row.last_fail_at == null ? null : Number(row.last_fail_at),
    lastSuccessAt: row.last_success_at == null ? null : Number(row.last_success_at),
    cooldownUntil: Number(row.cooldown_until) || 0,
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export function loadModelHealthMap(
  db: YzSqliteDb,
  userId: string,
  modelIds: string[],
): Map<string, ModelHealthRow> {
  const ids = [...new Set(modelIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const rows = db.prepare(
      `SELECT model_id, platform_id, fail_count, last_fail_at, last_success_at, cooldown_until, last_error
         FROM model_health
        WHERE user_id = ? AND model_id IN (${ids.map(() => '?').join(',')})`,
    ).all(userId, ...ids) as any[];
    return new Map(rows.map((row) => [String(row.model_id), rowFromDb(row)]));
  } catch {
    // 旧迷你库/迁移前数据库没有健康表时按无记录处理，不能阻断选模。
    return new Map();
  }
}

export function listModelHealth(db: YzSqliteDb, userId: string, now = Date.now()): ModelHealthView[] {
  try {
    const rows = db.prepare(
      `SELECT model_id, platform_id, fail_count, last_fail_at, last_success_at, cooldown_until, last_error
         FROM model_health
        WHERE user_id = ?
        ORDER BY cooldown_until DESC, last_fail_at DESC`,
    ).all(userId) as any[];
    return rows.map((raw) => {
      const row = rowFromDb(raw);
      return {
        modelId: row.modelId,
        platformId: row.platformId,
        state: healthStateAt(row, now),
        score: modelHealthScoreAt(row, now),
        failCount: row.failCount,
        cooldownUntil: row.cooldownUntil,
        lastFailAt: row.lastFailAt,
        lastSuccessAt: row.lastSuccessAt,
        ...(row.lastError ? { lastError: row.lastError } : {}),
      };
    });
  } catch {
    return [];
  }
}

/** 供应商 API 模型名 → 言智 model 主键（健康表、候选池均以主键为准）。 */
export function resolveModelPrimaryId(
  db: YzSqliteDb,
  userId: string,
  platformId: string,
  apiOrPrimaryModelId: string,
): string | null {
  try {
    const byPrimary = db.prepare(
      'SELECT id FROM model WHERE id = ? AND platform_id = ? LIMIT 1',
    ).get(apiOrPrimaryModelId, platformId) as { id?: string } | undefined;
    if (byPrimary?.id) return byPrimary.id;
    const row =
      (db.prepare(
        'SELECT id FROM model WHERE platform_id = ? AND model_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      ).get(platformId, apiOrPrimaryModelId, userId) as { id?: string } | undefined) ||
      (db.prepare(
        'SELECT id FROM model WHERE platform_id = ? AND model_id = ? ORDER BY created_at DESC LIMIT 1',
      ).get(platformId, apiOrPrimaryModelId) as { id?: string } | undefined);
    return row?.id || null;
  } catch {
    return null;
  }
}

export function recordModelFailure(
  db: YzSqliteDb,
  userId: string,
  platformId: string,
  modelId: string,
  error: unknown,
  now = Date.now(),
): void {
  if (!userId || !platformId || !modelId) return;
  try {
    const previous = db.prepare(
      'SELECT fail_count FROM model_health WHERE user_id = ? AND model_id = ?',
    ).get(userId, modelId) as { fail_count?: number } | undefined;
    const failCount = (Number(previous?.fail_count) || 0) + 1;
    const cooldownUntil = now + cooldownMsForFailCount(failCount);
    const message = String(error ?? '').slice(0, 1_000);
    db.prepare(`
      INSERT INTO model_health
        (user_id, model_id, platform_id, fail_count, last_fail_at, last_success_at,
         cooldown_until, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(user_id, model_id) DO UPDATE SET
        platform_id = excluded.platform_id,
        fail_count = excluded.fail_count,
        last_fail_at = excluded.last_fail_at,
        cooldown_until = excluded.cooldown_until,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).run(userId, modelId, platformId, failCount, now, cooldownUntil, message, now);
  } catch {
    // 健康记录是旁路，绝不阻断真正的模型调用与错误返回。
  }
}

export function recordModelSuccess(
  db: YzSqliteDb,
  userId: string,
  platformId: string,
  modelId: string,
  now = Date.now(),
): void {
  if (!userId || !platformId || !modelId) return;
  try {
    db.prepare(`
      INSERT INTO model_health
        (user_id, model_id, platform_id, fail_count, last_fail_at, last_success_at,
         cooldown_until, last_error, updated_at)
      VALUES (?, ?, ?, 0, NULL, ?, 0, NULL, ?)
      ON CONFLICT(user_id, model_id) DO UPDATE SET
        platform_id = excluded.platform_id,
        fail_count = 0,
        last_success_at = excluded.last_success_at,
        cooldown_until = 0,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).run(userId, modelId, platformId, now, now);
  } catch {
    // 同上：健康状态只影响下次排序，不能影响调用结果。
  }
}
