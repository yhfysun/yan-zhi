/**
 * 费用账本的 SQL —— **单一来源**（2026-10-17）。
 *
 * ★ 为什么单独放一个文件：`db.ts`（建表）与 `services/usage-ledger.ts`（读写）都要用到同一份 SQL，
 *   而测试还想**用真 SQLite 跑一遍**验证累加与对账。若三处各写一份，漂移是迟早的事
 *   （尤其"累加改成读改写"这种退化，复制品测试完全测不出来）。
 *
 * ⇒ 本模块**不 import 任何东西**（纯字符串），db / service / test 三方共享。
 */

/** 会话级累计表 */
export const CONVERSATION_USAGE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS conversation_usage (
    conversation_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'guest',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cny REAL NOT NULL DEFAULT 0,
    unpriced_calls INTEGER NOT NULL DEFAULT 0,
    cost_noticed_units INTEGER NOT NULL DEFAULT 0,
    cost_warned_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`;

/** 逐次调用明细表 */
export const USAGE_EVENT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS usage_event (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    task_id TEXT,
    user_id TEXT NOT NULL DEFAULT 'guest',
    platform_id TEXT,
    model_id TEXT,
    source TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'token',
    units INTEGER,
    input_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    output_tokens INTEGER,
    cost_cny REAL,
    price_snapshot_json TEXT,
    estimated INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`;

/**
 * ★★ 原子累加 —— **绝不能改成"先读再写"**。
 *
 * 并发（多端 / 多任务同会话）时"读改写"会丢账，表现为"金额偶尔变少"，极难复现。
 */
export const UPSERT_CONVERSATION_USAGE = `
  INSERT INTO conversation_usage
    (conversation_id, user_id, input_tokens, cache_read_tokens, cache_write_tokens,
     output_tokens, cost_cny, unpriced_calls, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    input_tokens = input_tokens + excluded.input_tokens,
    cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
    output_tokens = output_tokens + excluded.output_tokens,
    cost_cny = cost_cny + excluded.cost_cny,
    unpriced_calls = unpriced_calls + excluded.unpriced_calls,
    updated_at = excluded.updated_at
`;

export const INSERT_USAGE_EVENT = `
  INSERT INTO usage_event
    (id, conversation_id, task_id, user_id, platform_id, model_id, source, kind, units,
     input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
     cost_cny, price_snapshot_json, estimated, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`;

/** 写回提醒去重状态。`cost_warned_at` 只增不减（已预警过就不回退） */
export const UPDATE_NOTICE_STATE = `
  INSERT INTO conversation_usage (conversation_id, updated_at, cost_noticed_units, cost_warned_at)
  VALUES (?,?,?,?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    cost_noticed_units = excluded.cost_noticed_units,
    cost_warned_at = CASE WHEN excluded.cost_warned_at > 0 THEN excluded.cost_warned_at ELSE cost_warned_at END
`;

/** 建表语句（按依赖顺序） */
export const USAGE_LEDGER_SCHEMAS: string[] = [CONVERSATION_USAGE_SCHEMA, USAGE_EVENT_SCHEMA];
