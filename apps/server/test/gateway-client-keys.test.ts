import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import {
  checkGatewayKeyLimits,
  consumeGatewayRate,
  createGatewayClientKey,
  gatewayUsageToday,
  listGatewayClientKeys,
  recordGatewayUsage,
  resetGatewayRateLimitForTests,
  resolveGatewayClientKey,
  updateGatewayClientKey,
} from '../src/services/gateway-client-keys.js';

const NOW = 1_800_000_000_000;

async function mkDb(): Promise<YzSqliteDb> {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE gateway_client_key (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      allowed_models_json TEXT NOT NULL DEFAULT '["*"]',
      daily_token_limit INTEGER NOT NULL DEFAULT 0,
      daily_cost_limit_cny REAL NOT NULL DEFAULT 0,
      rpm_limit INTEGER NOT NULL DEFAULT 60,
      enabled INTEGER NOT NULL DEFAULT 1,
      expires_at INTEGER,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE gateway_usage (
      id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      protocol TEXT NOT NULL,
      requested_model TEXT,
      platform_id TEXT,
      model_id TEXT,
      status TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_cny REAL NOT NULL DEFAULT 0,
      estimated INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

let db: YzSqliteDb;
beforeEach(async () => {
  db = await mkDb();
  resetGatewayRateLimitForTests();
});
afterEach(() => db.close());

describe('gateway-client-keys', () => {
  it('创建时只返回一次明文，库内只存哈希；列表不回显密钥', () => {
    const created = createGatewayClientKey(db, 'u1', {
      name: 'Claude Code',
      allowedModels: ['auto'],
      dailyTokenLimit: 100_000,
      dailyCostLimitCny: 5,
      rpmLimit: 30,
    }, NOW);
    expect(created.key).toMatch(/^yzg_/);
    expect(created.view.keyPrefix).toBe(created.key.slice(0, 12));
    expect(JSON.stringify(listGatewayClientKeys(db, 'u1'))).not.toContain(created.key);

    const resolved = resolveGatewayClientKey(db, `Bearer ${created.key}`, NOW);
    expect(resolved?.id).toBe(created.view.id);
    expect(resolved?.userId).toBe('u1');
  });

  it('每日费用保留小数，不被整数化', () => {
    const created = createGatewayClientKey(db, 'u1', {
      name: 'decimal', dailyCostLimitCny: 1.25,
    }, NOW);
    expect(created.view.dailyCostLimitCny).toBe(1.25);
  });

  it('停用或过期密钥一律拒绝', () => {
    const created = createGatewayClientKey(db, 'u1', { name: 'short', expiresAt: NOW + 10_000 }, NOW);
    expect(resolveGatewayClientKey(db, `Bearer ${created.key}`, NOW + 20_000)).toBeNull();
    updateGatewayClientKey(db, 'u1', created.view.id, { enabled: false }, NOW);
    expect(resolveGatewayClientKey(db, `Bearer ${created.key}`, NOW)).toBeNull();
  });

  it('每日 token 与费用上限按密钥分别累计', () => {
    const a = createGatewayClientKey(db, 'u1', {
      name: 'a', dailyTokenLimit: 100, dailyCostLimitCny: 1,
    }, NOW);
    const b = createGatewayClientKey(db, 'u1', {
      name: 'b', dailyTokenLimit: 100, dailyCostLimitCny: 1,
    }, NOW);
    recordGatewayUsage(db, {
      keyId: a.view.id, userId: 'u1', requestId: 'r1', protocol: 'openai-chat',
      status: 'ok', inputTokens: 60, outputTokens: 50, costCny: 0.8, createdAt: NOW,
    });
    expect(gatewayUsageToday(db, a.view.id, NOW).tokens).toBe(110);
    expect(checkGatewayKeyLimits({
      dailyTokenLimit: 100, dailyCostLimitCny: 1, rpmLimit: 60,
    }, gatewayUsageToday(db, a.view.id, NOW))).toMatchObject({ ok: false, code: 'daily_token_limit' });
    expect(gatewayUsageToday(db, b.view.id, NOW)).toMatchObject({ tokens: 0, costCny: 0, requests: 0 });
  });

  it('每分钟请求数超限后拒绝，窗口过去后恢复', () => {
    expect(consumeGatewayRate('k1', 2, NOW).ok).toBe(true);
    expect(consumeGatewayRate('k1', 2, NOW + 1).ok).toBe(true);
    expect(consumeGatewayRate('k1', 2, NOW + 2)).toMatchObject({ ok: false, code: 'rpm_limit' });
    expect(consumeGatewayRate('k1', 2, NOW + 61_000).ok).toBe(true);
  });
});
