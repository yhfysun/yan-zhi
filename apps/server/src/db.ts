import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'openai',
    api_url TEXT,
    api_key_enc TEXT,
    headers_json TEXT DEFAULT '{}',
    status INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model (
    id TEXT PRIMARY KEY,
    platform_id TEXT NOT NULL REFERENCES platform(id),
    user_id TEXT NOT NULL REFERENCES user(id),
    model_id TEXT NOT NULL,
    alias TEXT,
    type TEXT DEFAULT 'llm',
    context_window INTEGER DEFAULT 8000,
    capabilities_json TEXT DEFAULT '[]',
    pricing_json TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    title TEXT NOT NULL,
    agent_id TEXT,
    platform_id TEXT,
    model_id TEXT,
    mcp_servers_json TEXT DEFAULT '[]',
    skill_ids_json TEXT DEFAULT '[]',
    system_prompt TEXT,
    pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversation(id),
    user_id TEXT NOT NULL REFERENCES user(id),
    role TEXT NOT NULL,
    content TEXT,
    tool_calls_json TEXT,
    tool_call_id TEXT,
    reasoning_content TEXT,
    system_prompt_snapshot TEXT,
    tokens INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mcp_server (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    transport TEXT NOT NULL DEFAULT 'stdio',
    command TEXT,
    args_json TEXT DEFAULT '[]',
    env_json TEXT DEFAULT '{}',
    url TEXT,
    headers_json TEXT DEFAULT '{}',
    status INTEGER DEFAULT 0,
    auto_reconnect INTEGER DEFAULT 1,
    reconnect_interval INTEGER DEFAULT 5000,
    auto_connect INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mcp_tool (
    id TEXT PRIMARY KEY,
    mcp_server_id TEXT NOT NULL REFERENCES mcp_server(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    input_schema_json TEXT,
    alias TEXT,
    remark TEXT,
    UNIQUE(mcp_server_id, name)
  );

  CREATE TABLE IF NOT EXISTS skill (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    description TEXT,
    triggers_json TEXT DEFAULT '[]',
    body TEXT,
    category TEXT,
    author TEXT,
    enabled INTEGER DEFAULT 1,
    installs INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversation_user ON conversation(user_id);
  CREATE INDEX IF NOT EXISTS idx_message_conv ON message(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_platform_user ON platform(user_id);
  CREATE INDEX IF NOT EXISTS idx_model_platform ON model(platform_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_user ON mcp_server(user_id);
  CREATE INDEX IF NOT EXISTS idx_skill_user ON skill(user_id);
`);

// 迁移 mcp_tool 表（添加 alias, remark 列）
for (const col of ['alias', 'remark']) {
  try { db.exec(`ALTER TABLE mcp_tool ADD COLUMN ${col} TEXT`); } catch {}
}

// 迁移 message 表（添加 system_prompt_snapshot 列）
try { db.exec('ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT'); } catch {}

export { db };
