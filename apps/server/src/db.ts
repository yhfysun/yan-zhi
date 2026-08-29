import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = path.join(dataDir, 'data.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 加载 sqlite-vec 扩展（向量记忆检索 memory_vec 表 + 知识库向量检索依赖此扩展）
// sqlite-vec 是 SQLite 原生扩展（非 Node addon），无需 electron-rebuild
let sqliteVecLoaded = false;
try {
  const require = createRequire(import.meta.url);
  const sqliteVec = require('sqlite-vec');
  const vecPath = sqliteVec.getLoadablePath();
  db.loadExtension(vecPath);
  sqliteVecLoaded = true;
  console.log('[db] sqlite-vec 扩展已加载:', vecPath);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn('[db] sqlite-vec 扩展加载失败，向量检索功能将降级为关键词检索:', msg);
}
export const hasSqliteVec = sqliteVecLoaded;

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
    is_builtin INTEGER NOT NULL DEFAULT 0,
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
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS space (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    dir_path TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    title TEXT NOT NULL,
    agent_id TEXT,
    platform_id TEXT,
    model_id TEXT,
    space_id TEXT,
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

  -- 智能体（商城发布用：远程节点通过 /marketplace/agents/publish 把本地 agent 快照 upsert 到此表）
  CREATE TABLE IF NOT EXISTS agent (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    avatar TEXT,
    system_prompt TEXT,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 2048,
    top_p REAL DEFAULT 1.0,
    frequency_penalty REAL DEFAULT 0,
    presence_penalty REAL DEFAULT 0,
    platform_id TEXT,
    model_id TEXT,
    workflow_json TEXT DEFAULT '{"nodes":[],"edges":[]}',
    inputs_schema_json TEXT,
    config_json TEXT,
    parent_agent_id TEXT,
    allow_sub_agent INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    type TEXT DEFAULT 'harness',
    builtin_tool_ids TEXT,
    custom_tool_ids TEXT,
    mcp_tool_mounts TEXT,
    skill_ids TEXT,
    sub_agent_ids TEXT,
    source TEXT,
    remote_source_id TEXT,
    is_public INTEGER NOT NULL DEFAULT 0,
    version INTEGER DEFAULT 1,
    installs INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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
-- 注意：idx_conversation_space 引用 conversation.space_id，但该列由下方 ALTER TABLE 迁移添加。
-- 不能放在此处（旧库 conversation 表无 space_id 列会导致整个 db.exec() 失败，连带 conversation_file 等后续表也无法创建）。
-- 该索引已移至迁移代码块之后创建。
CREATE INDEX IF NOT EXISTS idx_space_user ON space(user_id);
  CREATE INDEX IF NOT EXISTS idx_message_conv ON message(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_platform_user ON platform(user_id);
  CREATE INDEX IF NOT EXISTS idx_model_platform ON model(platform_id);
  CREATE INDEX IF NOT EXISTS idx_mcp_user ON mcp_server(user_id);
  CREATE INDEX IF NOT EXISTS idx_skill_user ON skill(user_id);
  -- 注意：conversation_file 的索引必须在该表创建之后（见下方），否则 db.exec() 会因表不存在而中断。

  CREATE TABLE IF NOT EXISTS custom_tool (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    input_schema_json TEXT NOT NULL,
    output_schema_json TEXT,
    runtime TEXT NOT NULL DEFAULT 'node',
    entry TEXT NOT NULL,
    code TEXT NOT NULL,
    dependencies_json TEXT,
    timeout INTEGER DEFAULT 30000,
    env_json TEXT,
    enabled INTEGER DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'local',
    remote_source_id TEXT,
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS remote_marketplace (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'none',
    auth_config_enc TEXT,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS marketplace_cache (
    id TEXT PRIMARY KEY,
    remote_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    UNIQUE(remote_id, item_type, item_id)
  );

  CREATE TABLE IF NOT EXISTS marketplace_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    auth_type TEXT NOT NULL DEFAULT 'none',
    auth_token TEXT,
    port INTEGER NOT NULL DEFAULT 3001,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_file (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user(id),
    space_id TEXT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'intermediate',
    mime_type TEXT,
    size INTEGER DEFAULT 0,
    source TEXT DEFAULT 'agent',
    message_id TEXT,
    created_at INTEGER NOT NULL
  );

  -- conversation_file 的索引：必须在表创建之后才能创建
  CREATE INDEX IF NOT EXISTS idx_conv_file_conv ON conversation_file(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conv_file_cat ON conversation_file(conversation_id, category);
`);

// 迁移 mcp_tool 表（添加 alias, remark 列）
for (const col of ['alias', 'remark']) {
  try { db.exec(`ALTER TABLE mcp_tool ADD COLUMN ${col} TEXT`); } catch {}
}

// 迁移平台/模型表（添加内置标记）
for (const table of ['platform', 'model']) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0`); } catch {}
}

// 迁移 conversation 表（添加 space_id 列）
try { db.exec('ALTER TABLE conversation ADD COLUMN space_id TEXT'); } catch {}
// 迁移完成后才能创建引用 space_id 的索引（旧库迁移场景）
try { db.exec('CREATE INDEX IF NOT EXISTS idx_conversation_space ON conversation(space_id)'); } catch {}

// 迁移 message 表（添加 system_prompt_snapshot 列）
try { db.exec('ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT'); } catch {}

// 迁移 skill 表（添加商城相关字段）
for (const col of ['source', 'remote_source_id']) {
  try { db.exec(`ALTER TABLE skill ADD COLUMN ${col} TEXT`); } catch {}
}
try { db.exec('ALTER TABLE skill ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0'); } catch {}

// 迁移 agent 表（添加商城相关字段，如果 agent 表存在）
try {
  for (const col of ['source', 'remote_source_id']) {
    try { db.exec(`ALTER TABLE agent ADD COLUMN ${col} TEXT`); } catch {}
  }
  try { db.exec('ALTER TABLE agent ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0'); } catch {}
} catch {}

// 迁移 agent 表（Harness 模式 + 挂载字段）
try {
  try { db.exec("ALTER TABLE agent ADD COLUMN type TEXT NOT NULL DEFAULT 'harness'"); } catch {}
  for (const col of ['builtin_tool_ids', 'custom_tool_ids', 'mcp_tool_mounts', 'skill_ids', 'sub_agent_ids']) {
    try { db.exec(`ALTER TABLE agent ADD COLUMN ${col} TEXT`); } catch {}
  }
  // E4: 内置智能体标记（如 pageAgent）
  try { db.exec('ALTER TABLE agent ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0'); } catch {}
} catch {}

// 迁移：custom_tool / agent 新增 installs 计数列（商城安装计数）
for (const t of ['custom_tool', 'agent']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN installs INTEGER NOT NULL DEFAULT 0`); } catch {}
}

// ===== 客户端发现与聊天 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_peer (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    node_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'client',
    capabilities_json TEXT DEFAULT '[]',
    auth_token TEXT,
    status INTEGER NOT NULL DEFAULT 1,
    last_seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_message (
    id TEXT PRIMARY KEY,
    from_peer_id TEXT NOT NULL,
    to_peer_id TEXT NOT NULL,
    sender_name TEXT,
    content TEXT,
    file_json TEXT,
    direction TEXT NOT NULL DEFAULT 'incoming',
    created_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_chat_peer_status ON chat_peer(status, last_seen_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_chat_message_peers ON chat_message(to_peer_id, created_at)'); } catch {}

// ===== IM 连接器与入站事件 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS im_connector (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_inbound_event (
    id TEXT PRIMARY KEY,
    connector_id TEXT,
    provider TEXT NOT NULL,
    external_id TEXT,
    from_user TEXT,
    to_user TEXT,
    content TEXT,
    file_json TEXT,
    raw_json TEXT,
    created_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_im_connector_user ON im_connector(user_id, provider)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_im_inbound_provider ON im_inbound_event(provider, created_at)'); } catch {}

// ===== 知识库 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_base (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_doc (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    content TEXT,
    source_path TEXT,
    metadata_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunk (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES knowledge_doc(id) ON DELETE CASCADE,
    base_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_kb_base_user ON knowledge_base(user_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_kb_doc_base ON knowledge_doc(base_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_kb_chunk_base ON knowledge_chunk(base_id, doc_id)'); } catch {}

// 知识库向量检索：给 knowledge_chunk 加 embedding BLOB 列（存 Float32Array 的 buffer）
try { db.exec('ALTER TABLE knowledge_chunk ADD COLUMN embedding BLOB'); } catch {}

// ===== 知识库实体关系图谱（实体抽取 + 融合）=====
db.exec(`
  -- 实体：name 在本库内唯一（同名合并为同一实体 → 唯一标识）
  CREATE TABLE IF NOT EXISTS kb_entity (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_entity_base_name ON kb_entity(base_id, name);

  -- 实体间关系（有向边：source --relation--> target，均指实体名）
  CREATE TABLE IF NOT EXISTS kb_relation (
    id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    relation TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kb_rel_base ON kb_relation(base_id);

  -- 实体 → 来源切片（点实体可回溯到 N 个原文分片）
  CREATE TABLE IF NOT EXISTS kb_entity_chunk (
    entity_id TEXT NOT NULL REFERENCES kb_entity(id) ON DELETE CASCADE,
    chunk_id TEXT NOT NULL REFERENCES knowledge_chunk(id) ON DELETE CASCADE,
    base_id TEXT NOT NULL,
    PRIMARY KEY (entity_id, chunk_id)
  );
  CREATE INDEX IF NOT EXISTS idx_kb_ent_chunk ON kb_entity_chunk(chunk_id);

  -- 已抽取过实体图谱的文档（增量）
  CREATE TABLE IF NOT EXISTS kb_processed_doc (
    doc_id TEXT PRIMARY KEY,
    base_id TEXT NOT NULL,
    extracted_at INTEGER NOT NULL
  );
`);

// ===== 知识库共享级别（一套 DB，guest 建 public / 登录用户 private）=====
// knowledge_base 加 visibility 列（public=共享 / private=私有，默认 private）。安全 ALTER 兼容旧库。
try {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('knowledge_base')`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'visibility')) {
    db.exec(`ALTER TABLE knowledge_base ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`);
  }
} catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_kb_visibility ON knowledge_base(user_id, visibility)'); } catch {}

// 预置内置 guest 用户：未登录（web/桌面）统一用它作为访客身份访问服务端知识库。
// 该用户不可登录（占位哈希），其创建的知识库强制 public，供所有用户共享浏览。
try {
  const guest = db.prepare("SELECT id FROM user WHERE username = 'guest'").get();
  if (!guest) {
    db.prepare("INSERT INTO user (id, username, email, password_hash, created_at) VALUES ('guest', 'guest', NULL, '!guest-internal-account', 0)").run();
  }
} catch {}

// 记忆表：服务端 MCP 的 api_memory_* 需要可持久化。
db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    agent_id TEXT,
    content TEXT NOT NULL,
    tags_json TEXT,
    embedding BLOB,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
  );
`);
// 记忆多层类型：daily=每日聚合 / session=会话 / agent=智能体长期（默认）。安全 ALTER，兼容已存在库。
try {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('memory')`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'type')) {
    db.exec(`ALTER TABLE memory ADD COLUMN type TEXT NOT NULL DEFAULT 'agent'`);
  }
} catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_user_agent ON memory(user_id, agent_id, last_used_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(user_id, type, last_used_at DESC)'); } catch {}

// ===== 对话定时任务 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_task (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    prompt TEXT,
    cron_expr TEXT,
    interval_minutes INTEGER,
    conversation_id TEXT,
    enabled INTEGER DEFAULT 1,
    last_run_at INTEGER,
    next_run_at INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_task_user ON scheduled_task(user_id, enabled, next_run_at)'); } catch {}

// 定时任务绑定智能体/模型/空间；会话记录来源定时任务（用于列表显示定时标记）
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN agent_id TEXT'); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN platform_id TEXT'); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN model_id TEXT'); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN space_id TEXT'); } catch {}
try { db.exec('ALTER TABLE conversation ADD COLUMN scheduled_task_id TEXT'); } catch {}

// ===== 应用全局配置（key-value）=====
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL
  );
`);

export { db };
