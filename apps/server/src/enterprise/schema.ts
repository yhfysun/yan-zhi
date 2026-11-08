/**
 * 企业工作台数据结构（2026-11-07）。
 *
 * 这里只负责建表和幂等迁移，不承载业务逻辑。所有表统一挂在现有 SQLite 实例上，
 * 后续切换 PostgreSQL 时按这些表逐项迁移。
 */
import { db } from '../db.js';

let initialized = false;

export function ensureEnterpriseSchema(): void {
  if (initialized) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_rule (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'user',
      priority INTEGER NOT NULL DEFAULT 100,
      required INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_team_rule_owner ON team_rule(owner_user_id, enabled, priority);

    CREATE TABLE IF NOT EXISTS resource_version (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(resource_type, resource_id, version_no)
    );
    CREATE INDEX IF NOT EXISTS idx_resource_version_lookup ON resource_version(resource_type, resource_id, version_no DESC);

    CREATE TABLE IF NOT EXISTS expert_manifest (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      manifest_hash TEXT NOT NULL,
      created_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expert_manifest_agent ON expert_manifest(agent_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS design_resource (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      kind TEXT NOT NULL DEFAULT 'template',
      name TEXT NOT NULL,
      description TEXT,
      content_json TEXT NOT NULL DEFAULT '{}',
      preview_url TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_public INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_design_resource_kind ON design_resource(kind, enabled, name);

    CREATE TABLE IF NOT EXISTS quota_policy (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'month',
      limit_cny REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(subject_type, subject_id, period)
    );
    CREATE INDEX IF NOT EXISTS idx_quota_policy_subject ON quota_policy(subject_type, subject_id, enabled);

    CREATE TABLE IF NOT EXISTS quota_account (
      id TEXT PRIMARY KEY,
      policy_id TEXT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      period TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      limit_cny REAL NOT NULL,
      used_cny REAL NOT NULL DEFAULT 0,
      reserved_cny REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER NOT NULL,
      UNIQUE(subject_type, subject_id, period, period_start)
    );
    CREATE INDEX IF NOT EXISTS idx_quota_account_subject ON quota_account(subject_type, subject_id, period_start DESC);

    CREATE TABLE IF NOT EXISTS credit_entry (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_cny REAL NOT NULL,
      frozen_cny REAL NOT NULL DEFAULT 0,
      ref_type TEXT,
      ref_id TEXT,
      note TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_credit_entry_account ON credit_entry(account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      method TEXT,
      path TEXT,
      before_json TEXT,
      after_json TEXT,
      ip TEXT,
      trace_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mcp_connector_provider (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      transport TEXT NOT NULL DEFAULT 'streamable_http',
      url TEXT NOT NULL,
      auth_mode TEXT NOT NULL DEFAULT 'header',
      header_names_json TEXT NOT NULL DEFAULT '[]',
      oauth_config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_connector (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      owner_user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      credential_mode TEXT NOT NULL DEFAULT 'independent',
      shared_secret_enc TEXT,
      shared_headers_json TEXT NOT NULL DEFAULT '{}',
      oauth_token_enc TEXT,
      tool_policy_json TEXT NOT NULL DEFAULT '{}',
      is_public INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_connector_provider ON mcp_connector(provider_id, enabled);

    CREATE TABLE IF NOT EXISTS mcp_connector_tool (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      input_schema_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      cost_cny REAL NOT NULL DEFAULT 0,
      discovered_at INTEGER NOT NULL,
      UNIQUE(connector_id, name)
    );

    CREATE TABLE IF NOT EXISTS mcp_call_log (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      tool_name TEXT,
      user_id TEXT,
      task_id TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      cost_cny REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_call_log_connector ON mcp_call_log(connector_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS runtime_node (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      org_id TEXT,
      name TEXT NOT NULL,
      platform TEXT,
      arch TEXT,
      version TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      last_seen_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_node_owner ON runtime_node(owner_user_id, status);

    CREATE TABLE IF NOT EXISTS runtime_task (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      conversation_id TEXT,
      task_id TEXT,
      workspace_id TEXT,
      kind TEXT NOT NULL DEFAULT 'command',
      payload_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL DEFAULT 'queued',
      result_json TEXT,
      error TEXT,
      exit_code INTEGER,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_task_queue ON runtime_task(node_id, state, created_at);
    CREATE INDEX IF NOT EXISTS idx_runtime_task_owner ON runtime_task(owner_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS runtime_event (
      id TEXT PRIMARY KEY,
      runtime_task_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      UNIQUE(runtime_task_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_event_task ON runtime_event(runtime_task_id, seq);

    CREATE TABLE IF NOT EXISTS runtime_workspace (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      image TEXT,
      cpu REAL,
      memory_mb INTEGER,
      status TEXT NOT NULL DEFAULT 'requested',
      ports_json TEXT NOT NULL DEFAULT '[]',
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_workspace_owner ON runtime_workspace(owner_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_runtime_workspace_expiry ON runtime_workspace(status, expires_at);

    CREATE TABLE IF NOT EXISTS runtime_artifact (
      id TEXT PRIMARY KEY,
      runtime_task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      sha256 TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_artifact_task ON runtime_artifact(runtime_task_id, created_at);
  `);

  try {
    db.exec('ALTER TABLE agent ADD COLUMN rule_ids_json TEXT');
  } catch {
    /* 已存在 */
  }
  for (const sql of [
    'ALTER TABLE mcp_connector_provider ADD COLUMN oauth_config_json TEXT NOT NULL DEFAULT \'{}\'',
    'ALTER TABLE mcp_connector ADD COLUMN oauth_token_enc TEXT',
  ]) {
    try { db.exec(sql); } catch { /* 已存在 */ }
  }
  initialized = true;
}

