import crypto from 'node:crypto';
import type { GatewayClientKeyView, GatewayUsageToday } from '@yan-zhi/shared';
import type { YzSqliteDb } from './sqlite-driver.js';

const MAX_TOKENS_LIMIT = 10_000_000_000;
const MAX_COST_LIMIT_CNY = 1_000_000;
const MAX_RPM_LIMIT = 100_000;

export interface GatewayClientKeyRecord {
  id: string;
  userId: string;
  name: string;
  allowedModels: string[];
  dailyTokenLimit: number;
  dailyCostLimitCny: number;
  rpmLimit: number;
  expiresAt: number | null;
}

export interface GatewayLimitInput {
  dailyTokenLimit: number;
  dailyCostLimitCny: number;
  rpmLimit: number;
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function decimalInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeAllowedModels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['*'];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const item = value.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item.slice(0, 200));
    if (out.length >= 200) break;
  }
  return out.length ? out : ['*'];
}

function parseAllowedModels(raw: string | null | undefined): string[] {
  try {
    return sanitizeAllowedModels(JSON.parse(raw || '["*"]'));
  } catch {
    return ['*'];
  }
}

function rowToView(row: any): GatewayClientKeyView {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    keyPrefix: String(row.key_prefix || ''),
    allowedModels: parseAllowedModels(row.allowed_models_json),
    dailyTokenLimit: Number(row.daily_token_limit) || 0,
    dailyCostLimitCny: Number(row.daily_cost_limit_cny) || 0,
    rpmLimit: Number(row.rpm_limit) || 0,
    enabled: Number(row.enabled) !== 0,
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export function createGatewayClientKey(
  db: YzSqliteDb,
  userId: string,
  input: {
    name?: unknown;
    allowedModels?: unknown;
    dailyTokenLimit?: unknown;
    dailyCostLimitCny?: unknown;
    rpmLimit?: unknown;
    expiresAt?: unknown;
  },
  now = Date.now(),
): { view: GatewayClientKeyView; key: string } {
  const id = crypto.randomUUID();
  const key = `yzg_${crypto.randomBytes(24).toString('hex')}`;
  const name = String(input.name || '').trim().slice(0, 100) || '本地网关密钥';
  const allowedModels = sanitizeAllowedModels(input.allowedModels);
  const dailyTokenLimit = numberInRange(input.dailyTokenLimit, 0, MAX_TOKENS_LIMIT, 0);
  const dailyCostLimitCny = decimalInRange(input.dailyCostLimitCny, 0, MAX_COST_LIMIT_CNY, 0);
  const rpmLimit = numberInRange(input.rpmLimit, 1, MAX_RPM_LIMIT, 60);
  const expiresAt = Number(input.expiresAt) > 0 ? Number(input.expiresAt) : null;
  db.prepare(`
    INSERT INTO gateway_client_key
      (id, user_id, name, key_hash, key_prefix, allowed_models_json,
       daily_token_limit, daily_cost_limit_cny, rpm_limit, enabled,
       expires_at, last_used_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)
  `).run(
    id, userId, name, hashKey(key), key.slice(0, 12), JSON.stringify(allowedModels),
    dailyTokenLimit, dailyCostLimitCny, rpmLimit, expiresAt, now, now,
  );
  const row = db.prepare('SELECT * FROM gateway_client_key WHERE id = ?').get(id);
  return { view: rowToView(row), key };
}

export function listGatewayClientKeys(db: YzSqliteDb, userId: string): GatewayClientKeyView[] {
  return (db.prepare(
    'SELECT * FROM gateway_client_key WHERE user_id = ? ORDER BY created_at DESC',
  ).all(userId) as any[]).map(rowToView);
}

export function updateGatewayClientKey(
  db: YzSqliteDb,
  userId: string,
  keyId: string,
  patch: {
    name?: unknown;
    allowedModels?: unknown;
    dailyTokenLimit?: unknown;
    dailyCostLimitCny?: unknown;
    rpmLimit?: unknown;
    enabled?: unknown;
    expiresAt?: unknown;
  },
  now = Date.now(),
): GatewayClientKeyView | null {
  const existing = db.prepare(
    'SELECT * FROM gateway_client_key WHERE id = ? AND user_id = ?',
  ).get(keyId, userId) as any;
  if (!existing) return null;
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(String(patch.name || '').trim().slice(0, 100) || existing.name);
  }
  if (patch.allowedModels !== undefined) {
    sets.push('allowed_models_json = ?');
    values.push(JSON.stringify(sanitizeAllowedModels(patch.allowedModels)));
  }
  if (patch.dailyTokenLimit !== undefined) {
    sets.push('daily_token_limit = ?');
    values.push(numberInRange(patch.dailyTokenLimit, 0, MAX_TOKENS_LIMIT, existing.daily_token_limit));
  }
  if (patch.dailyCostLimitCny !== undefined) {
    sets.push('daily_cost_limit_cny = ?');
    values.push(decimalInRange(patch.dailyCostLimitCny, 0, MAX_COST_LIMIT_CNY, existing.daily_cost_limit_cny));
  }
  if (patch.rpmLimit !== undefined) {
    sets.push('rpm_limit = ?');
    values.push(numberInRange(patch.rpmLimit, 1, MAX_RPM_LIMIT, existing.rpm_limit));
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?');
    const expiresAt = Number(patch.expiresAt);
    values.push(expiresAt > 0 ? expiresAt : null);
  }
  if (sets.length === 0) return rowToView(existing);
  sets.push('updated_at = ?');
  values.push(now, keyId, userId);
  db.prepare(`UPDATE gateway_client_key SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
  return rowToView(db.prepare('SELECT * FROM gateway_client_key WHERE id = ?').get(keyId));
}

export function deleteGatewayClientKey(db: YzSqliteDb, userId: string, keyId: string): boolean {
  return db.prepare('DELETE FROM gateway_client_key WHERE id = ? AND user_id = ?').run(keyId, userId).changes > 0;
}

export function resolveGatewayClientKey(
  db: YzSqliteDb,
  authorization: string | null | undefined,
  now = Date.now(),
): GatewayClientKeyRecord | null {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim());
  if (!match?.[1]) return null;
  const row = db.prepare(
    'SELECT * FROM gateway_client_key WHERE key_hash = ? AND enabled = 1',
  ).get(hashKey(match[1].trim())) as any;
  if (!row) return null;
  if (row.expires_at != null && Number(row.expires_at) <= now) return null;
  db.prepare('UPDATE gateway_client_key SET last_used_at = ? WHERE id = ?').run(now, row.id);
  const view = rowToView(row);
  return {
    id: view.id,
    userId: String(row.user_id),
    name: view.name,
    allowedModels: view.allowedModels,
    dailyTokenLimit: view.dailyTokenLimit,
    dailyCostLimitCny: view.dailyCostLimitCny,
    rpmLimit: view.rpmLimit,
    expiresAt: view.expiresAt,
  };
}

export function gatewayUsageToday(db: YzSqliteDb, keyId: string, now = Date.now()): GatewayUsageToday {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const row = db.prepare(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(input_tokens + cache_read_tokens + cache_write_tokens + output_tokens), 0) AS tokens,
           COALESCE(SUM(cost_cny), 0) AS cost_cny
      FROM gateway_usage
     WHERE key_id = ? AND created_at >= ?
  `).get(keyId, start.getTime()) as any;
  return {
    requests: Number(row?.requests) || 0,
    tokens: Number(row?.tokens) || 0,
    costCny: Number(row?.cost_cny) || 0,
  };
}

export function checkGatewayKeyLimits(
  limits: GatewayLimitInput,
  usage: GatewayUsageToday,
): { ok: true } | { ok: false; code: string; message: string } {
  if (limits.dailyTokenLimit > 0 && usage.tokens >= limits.dailyTokenLimit) {
    return { ok: false, code: 'daily_token_limit', message: '今日 token 额度已用尽' };
  }
  if (limits.dailyCostLimitCny > 0 && usage.costCny >= limits.dailyCostLimitCny) {
    return { ok: false, code: 'daily_cost_limit', message: '今日费用额度已用尽' };
  }
  return { ok: true };
}

interface RateBucket {
  minute: number;
  count: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function consumeGatewayRate(
  keyId: string,
  limit: number,
  now = Date.now(),
): { ok: true } | { ok: false; code: 'rpm_limit'; message: string } {
  const minute = Math.floor(now / 60_000);
  const current = rateBuckets.get(keyId);
  if (!current || current.minute !== minute) {
    rateBuckets.set(keyId, { minute, count: 1 });
    return { ok: true };
  }
  if (current.count >= Math.max(1, limit)) {
    return { ok: false, code: 'rpm_limit', message: '每分钟请求数已超限' };
  }
  current.count++;
  return { ok: true };
}

export function resetGatewayRateLimitForTests(): void {
  rateBuckets.clear();
}

export interface GatewayUsageInput {
  keyId: string;
  userId: string;
  requestId: string;
  protocol: string;
  requestedModel?: string | null;
  platformId?: string | null;
  modelId?: string | null;
  status: 'ok' | 'error' | 'aborted';
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  costCny?: number;
  estimated?: boolean;
  latencyMs?: number;
  errorCode?: string | null;
  createdAt?: number;
}

export function recordGatewayUsage(db: YzSqliteDb, input: GatewayUsageInput): void {
  try {
    db.prepare(`
      INSERT INTO gateway_usage
        (id, key_id, user_id, request_id, protocol, requested_model, platform_id,
         model_id, status, input_tokens, cache_read_tokens, cache_write_tokens,
         output_tokens, cost_cny, estimated, latency_ms, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), input.keyId, input.userId, input.requestId, input.protocol,
      input.requestedModel || null, input.platformId || null, input.modelId || null,
      input.status, Math.max(0, input.inputTokens || 0), Math.max(0, input.cacheReadTokens || 0),
      Math.max(0, input.cacheWriteTokens || 0), Math.max(0, input.outputTokens || 0),
      Math.max(0, input.costCny || 0), input.estimated ? 1 : 0,
      Math.max(0, input.latencyMs || 0), input.errorCode || null, input.createdAt || Date.now(),
    );
  } catch {
    // 网关审计旁路不能阻断模型调用本身。
  }
}
