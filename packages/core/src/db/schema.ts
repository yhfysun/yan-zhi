// 数据库表结构定义（SQLite DDL，三端共用）
export const SCHEMA_SQL = `
-- 平台
CREATE TABLE IF NOT EXISTS platform (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'openai',
  api_url TEXT NOT NULL,
  api_key_enc BLOB NOT NULL,
  headers_json TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  last_health_at TEXT,
  created_at INTEGER NOT NULL
);

-- 模型
CREATE TABLE IF NOT EXISTS model (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  alias TEXT,
  type TEXT NOT NULL DEFAULT 'llm',
  context_window INTEGER DEFAULT 4096,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  capabilities_json TEXT,
  pricing_json TEXT,
  last_chat_test_at INTEGER,
  last_chat_test_ok INTEGER,
  UNIQUE(platform_id, model_id)
);
CREATE INDEX IF NOT EXISTS idx_model_platform ON model(platform_id);

-- 会话
CREATE TABLE IF NOT EXISTS conversation (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent_id TEXT,
  platform_id TEXT,
  model_id TEXT,
  mcp_servers_json TEXT,
  skill_ids_json TEXT,
  system_prompt TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversation(updated_at DESC);

-- 消息
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  reasoning_content TEXT,
  system_prompt_snapshot TEXT,
  tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_conv ON message(conversation_id, created_at);

-- 工具调用记录
CREATE TABLE IF NOT EXISTS tool_call (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  mcp_server_id TEXT,
  tool_name TEXT NOT NULL,
  arguments_json TEXT,
  result_json TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_toolcall_msg ON tool_call(message_id);

-- MCP 服务
CREATE TABLE IF NOT EXISTS mcp_server (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  command TEXT,
  args_json TEXT,
  env_json TEXT,
  url TEXT,
  headers_json TEXT,
  status INTEGER NOT NULL DEFAULT 0,
  last_connected_at TEXT,
  auto_reconnect INTEGER NOT NULL DEFAULT 1,
  reconnect_interval INTEGER NOT NULL DEFAULT 5000,
  auto_connect INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- MCP 工具
CREATE TABLE IF NOT EXISTS mcp_tool (
  id TEXT PRIMARY KEY,
  mcp_server_id TEXT NOT NULL REFERENCES mcp_server(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  input_schema_json TEXT,
  alias TEXT,
  remark TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(mcp_server_id, name)
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_server ON mcp_tool(mcp_server_id);

-- 智能体
CREATE TABLE IF NOT EXISTS agent (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 2048,
  top_p REAL NOT NULL DEFAULT 1.0,
  frequency_penalty REAL NOT NULL DEFAULT 0,
  presence_penalty REAL NOT NULL DEFAULT 0,
  platform_id TEXT,
  model_id TEXT,
  workflow_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  inputs_schema_json TEXT,
  config_json TEXT,
  parent_agent_id TEXT,
  allow_sub_agent INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_parent ON agent(parent_agent_id);

-- 智能体节点（冗余备份表，便于按节点查询）
CREATE TABLE IF NOT EXISTS agent_node (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  position_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_node_agent ON agent_node(agent_id);

-- 记忆
CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags_json TEXT,
  embedding BLOB,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(agent_id, last_used_at DESC);

-- Skill
CREATE TABLE IF NOT EXISTS skill (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  path TEXT,
  frontmatter_json TEXT,
  body_md TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 模型调用日志
CREATE TABLE IF NOT EXISTS model_call (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modelcall_created ON model_call(created_at DESC);
`;

/** 迁移 SQL：为已有数据库添加新字段 */
export const MIGRATION_SQL = [
  `ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT`,
];

/** sqlite-vec 向量表（记忆向量检索） */
export const VECTOR_SCHEMA_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
  memory_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);
`;

/** 初始化所有表 */
export async function initSchema(execFn: (sql: string) => Promise<void>): Promise<void> {
  const statements = SCHEMA_SQL.split(';').filter((s) => s.trim());
  for (const stmt of statements) {
    await execFn(stmt + ';');
  }
  try {
    await execFn(VECTOR_SCHEMA_SQL);
  } catch {
    // sqlite-vec 扩展未加载时跳过
    console.warn('sqlite-vec 未加载，向量检索功能不可用');
  }
  // 轻量迁移：为旧版 model 表补充 capabilities_json / pricing_json 列
  for (const col of ['capabilities_json', 'pricing_json']) {
    try {
      await execFn(`ALTER TABLE model ADD COLUMN ${col} TEXT;`);
    } catch {
      // 列已存在则忽略
    }
  }
  // 迁移：为旧版 model 表补充聊天测试状态列
  for (const col of ['last_chat_test_at', 'last_chat_test_ok']) {
    try {
      await execFn(`ALTER TABLE model ADD COLUMN ${col} INTEGER;`);
    } catch {
      // 列已存在则忽略
    }
  }
  // 迁移：为旧版 agent 表补充聊天参数字段
  const agentCols = [
    { name: 'is_default',     def: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'system_prompt',  def: 'TEXT' },
    { name: 'platform_id',    def: 'TEXT' },
    { name: 'model_id',       def: 'TEXT' },
    { name: 'temperature',    def: 'REAL NOT NULL DEFAULT 0.7' },
    { name: 'max_tokens',     def: 'INTEGER NOT NULL DEFAULT 2048' },
    { name: 'top_p',          def: 'REAL NOT NULL DEFAULT 1.0' },
    { name: 'frequency_penalty', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'presence_penalty',  def: 'REAL NOT NULL DEFAULT 0' },
  ];
  for (const col of agentCols) {
    try { await execFn(`ALTER TABLE agent ADD COLUMN ${col.name} ${col.def};`); } catch { /* 列已存在 */ }
  }
  // 迁移：message.system_prompt_snapshot
  try { await execFn(`ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：从旧 agent_profile 表复制数据到 agent
  try {
    await execFn(`INSERT OR IGNORE INTO agent (id, name, description, system_prompt, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, platform_id, model_id, is_default, workflow_json, version, created_at, updated_at)
      SELECT id, name, description, COALESCE(system_prompt,''), temperature, max_tokens, COALESCE(top_p,1.0), COALESCE(frequency_penalty,0), COALESCE(presence_penalty,0), platform_id, model_id, is_default, '{"nodes":[],"edges":[]}', 1, created_at, created_at
      FROM agent_profile WHERE id NOT IN (SELECT id FROM agent)`);
  } catch { /* agent_profile 表不存在 */ }
  // 迁移：mcp_tool 添加 alias, remark 列
  for (const col of ['alias', 'remark']) {
    try { await execFn(`ALTER TABLE mcp_tool ADD COLUMN ${col} TEXT;`); } catch { /* 列已存在 */ }
  }
  try { await execFn(`ALTER TABLE mcp_tool ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;`); } catch { /* 列已存在 */ }
}
