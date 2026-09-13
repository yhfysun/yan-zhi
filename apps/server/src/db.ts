import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dataDir 单一真相源：以 db.ts 所在目录为基准，其他模块一律 import 复用，禁止自行重算
export const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = path.join(dataDir, 'data.db');

const db = new Database(DB_PATH);

// ===== 内置种子覆盖策略（由打包/运行参数控制）=====
// YZ_BUILTIN_OVERWRITE 取值：
//   'always'  (默认) —— 内置 agent/skill 定义以代码为准，启动时强制覆盖旧库（历史行为）
//   'never'   —— 永不覆盖用户对内置项的改动（用户改了保留）
//   'migrate' —— 仅新增缺项/补空，不覆盖已存在的内置项（最保守）
export type BuiltinOverwriteMode = 'always' | 'never' | 'migrate';
function resolveOverwriteMode(): BuiltinOverwriteMode {
  const v = (process.env.YZ_BUILTIN_OVERWRITE || 'always').toLowerCase();
  if (v === 'never') return 'never';
  if (v === 'migrate') return 'migrate';
  return 'always';
}
export const BUILTIN_OVERWRITE_MODE: BuiltinOverwriteMode = resolveOverwriteMode();
/** 强制覆盖是否开启（always 时内置定义以代码为准） */
const overwriteEnabled = BUILTIN_OVERWRITE_MODE === 'always';

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
    description TEXT,
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
`);
// 会话级内置工具挂载（合并到智能体级，允许会话临时追加工具）
try {
  const convCols = db.prepare(`SELECT name FROM pragma_table_info('conversation')`).all() as Array<{ name: string }>;
  if (!convCols.some((c) => c.name === 'builtin_tool_ids_json')) {
    db.exec(`ALTER TABLE conversation ADD COLUMN builtin_tool_ids_json TEXT DEFAULT '[]'`);
  }
} catch {}

db.exec(`
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
    -- 智能体分类：main=主智能体（会话可选中）/ sub=子智能体（仅供其他智能体引用委派）
    agent_kind TEXT DEFAULT 'main',
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
    category TEXT NOT NULL DEFAULT '其他',
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

  -- 模型文件修改快照：file_write / file_edit 落盘前后内容，供前端 Diff 对比 / 应用 / 回退
  CREATE TABLE IF NOT EXISTS file_change (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    conversation_id TEXT,
    task_id TEXT,
    path TEXT NOT NULL,
    before_content TEXT,
    after_content TEXT,
    tool TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_file_change_path ON file_change(path);
  CREATE INDEX IF NOT EXISTS idx_file_change_status ON file_change(status);
`);

// 迁移 mcp_tool 表（添加 alias, remark 列）
for (const col of ['alias', 'remark']) {
  try { db.exec(`ALTER TABLE mcp_tool ADD COLUMN ${col} TEXT`); } catch {}
}
// enabled 列：前端 store 一直在读写它，但建表语句里从未创建过，老库会直接报 no such column
try { db.exec('ALTER TABLE mcp_tool ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1'); } catch {}

// 迁移平台/模型表（添加内置标记）
for (const table of ['platform', 'model']) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0`); } catch {}
}

// 迁移平台表（添加停顿时间范围配置，用于多 Token 轮询的请求节流）
try { db.exec('ALTER TABLE platform ADD COLUMN pause_min_ms INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE platform ADD COLUMN pause_max_ms INTEGER NOT NULL DEFAULT 0'); } catch {}

// 平台多 API Key 池：一个平台可配置多个 Token，轮询使用、失败自动切换、按失败次数优先选择。
// fail_count 按时间窗口衰减（超过窗口未失败则视为 0），避免临时性错误永久拉低优先级。
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_api_key (
    id TEXT PRIMARY KEY,
    platform_id TEXT NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    api_key TEXT NOT NULL,
    label TEXT,
    fail_count INTEGER NOT NULL DEFAULT 0,
    last_fail_at INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_platform_api_key_platform ON platform_api_key(platform_id, enabled, fail_count ASC);
`);

// 迁移：把 platform.api_key_enc 中的存量 Key 导入 platform_api_key 表（幂等，已存在则跳过）
try {
  const rows = db.prepare("SELECT id, user_id, api_key_enc FROM platform WHERE api_key_enc IS NOT NULL AND api_key_enc != ''").all() as any[];
  const hasKey = db.prepare('SELECT 1 FROM platform_api_key WHERE platform_id = ? LIMIT 1');
  const insertKey = db.prepare(
    'INSERT INTO platform_api_key (id, platform_id, user_id, api_key, label, fail_count, enabled, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?)',
  );
  for (const r of rows) {
    if (hasKey.get(r.id)) continue;
    insertKey.run(`pak_${r.id}_migrated`, r.id, r.user_id || 'guest', r.api_key_enc, '迁移Key', Date.now());
  }
} catch {}

// 迁移 conversation 表（添加 space_id 列）
try { db.exec('ALTER TABLE conversation ADD COLUMN space_id TEXT'); } catch {}
// 迁移完成后才能创建引用 space_id 的索引（旧库迁移场景）
try { db.exec('CREATE INDEX IF NOT EXISTS idx_conversation_space ON conversation(space_id)'); } catch {}

// 迁移 message 表（添加 system_prompt_snapshot 列 + 子智能体归属列）
try { db.exec('ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT'); } catch {}
for (const col of ['parent_tool_call_id TEXT', 'sub_agent_id TEXT', 'sub_agent_name TEXT', 'sub_agent_depth INTEGER']) {
  const [name] = col.split(' ');
  try { db.exec(`ALTER TABLE message ADD COLUMN ${col}`); } catch {}
  void name;
}

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
  // 智能体归属用户（guest=未登录/桌面本地；放开登录后按真实用户隔离）
  try { db.exec('ALTER TABLE agent ADD COLUMN user_id TEXT'); } catch {}
  // 智能体分类：main=主智能体（会话可选中）/ sub=子智能体（仅供其他智能体引用委派）
  try { db.exec("ALTER TABLE agent ADD COLUMN agent_kind TEXT NOT NULL DEFAULT 'main'"); } catch {}
} catch {}

// 迁移：把历史 agent_id 为 NULL 的会话回填为 a_default_assistant。
// 之前 createConversation 绑定的是 selectedId，selectedId 为空时落 NULL → 子智能体/工具挂载失效。
// 一次性回填所有用户（无 agent_id 且 a_default_assistant 存在）的会话。
try {
  const defaultExists = db.prepare("SELECT 1 FROM agent WHERE id = 'a_default_assistant'").get();
  if (defaultExists) {
    db.exec("UPDATE conversation SET agent_id = 'a_default_assistant' WHERE agent_id IS NULL OR agent_id = ''");
  }
} catch {}

// 迁移：custom_tool / agent 新增 installs 计数列（商城安装计数）
for (const t of ['custom_tool', 'agent']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN installs INTEGER NOT NULL DEFAULT 0`); } catch {}
}

// 迁移：custom_tool 新增 category 分类列（自定义工具归类；旧数据回填为「其他」）
try { db.exec("ALTER TABLE custom_tool ADD COLUMN category TEXT NOT NULL DEFAULT '其他'"); } catch {}

// 迁移：model 新增 description 列（模型描述，供 list_models 工具与前端展示）
try { db.exec('ALTER TABLE model ADD COLUMN description TEXT'); } catch {}

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

  -- IM 联系人 → 会话映射：同一 connector + 同一外部用户 复用同一 conversation，保证上下文连续
  CREATE TABLE IF NOT EXISTS im_conversation_map (
    connector_id TEXT NOT NULL,
    external_user TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (connector_id, external_user)
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_im_connector_user ON im_connector(user_id, provider)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_im_inbound_provider ON im_inbound_event(provider, created_at)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_im_conv_map_conv ON im_conversation_map(conversation_id)'); } catch {}

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

// 预置内置智能体：默认「日常办公助手」+ 子智能体「浏览器操作助手（pageAgent）」。
// 智能体完整定义（含 system_prompt 等）存前端本地库；此处种子仅为了让后端能解析
// 默认智能体的工具挂载与子智能体关系（会话绑定默认智能体后 call_agent/list_sub_agents 可用）。
// server agent 表无 user_id 列，归属靠 is_public=1 全局共享。
// 注：此处是「默认助手可用工具」的白名单，必须与 builtin/index.ts 里 registry.register 的非 browser_* 工具对齐，
// 否则会出现「已注册但智能体调不到」的断链（典型：内置 skill 里写了 compare_products，默认助手却没挂它）。
// 已注册未挂载 = 工具在 UI 里看得见、LLM 调不了。新增内置工具时记得同步这里。
const DEFAULT_AGENT_BUILTIN_TOOLS = [
  // 文件读写
  'file_read', 'file_write', 'file_list',
  // 代码工具
  'code_search', 'code_outline', 'js_exec', 'python_exec',
  // 命令执行
  'cmd_exec',
  // 联网搜索
  // web_search / web_fetch 工具已从项目移除：联网检索与网页内容获取统一委派 pageAgent
  // （真实浏览器 browser_get_page_content 已覆盖抓正文能力）
  // 网络安全
  'http_request', 'dns_lookup', 'port_scan', 'tcp_send', 'udp_send',
  // 子智能体
  'call_agent', 'list_sub_agents',
  // 模型查询（列出可用平台/模型/能力/描述，供选型与 call_agent 指定模型）
  'list_models',
  // 用户交互
  'ask_user', 'confirm_user',
  // 任务规划
  'task_plan', 'task_step',
  // 模型配置
  'configure_model_platform',
  // 多模态 / 商品对比
  'image_analyze', 'compare_products',
  // 浏览器核心工具（阶段三：默认助手可直接调用，复杂多步任务仍可委派 pageAgent）
  'browser_navigate', 'browser_get_page_info', 'browser_action_and_observe',
  'browser_click', 'browser_type', 'browser_press_key',
  'browser_get_visible_text', 'browser_wait_for', 'browser_screenshot',
  // 电脑使用（computer-use 内置插件，默认启用；本机 GUI 自动化：截屏/鼠标/键盘/窗口）
  'plugin_computer-use__computer_screenshot',
  'plugin_computer-use__computer_list_windows',
  'plugin_computer-use__computer_activate_window',
  'plugin_computer-use__computer_mouse_move',
  'plugin_computer-use__computer_mouse_click',
  'plugin_computer-use__computer_mouse_drag',
  'plugin_computer-use__computer_scroll',
  'plugin_computer-use__computer_type',
  'plugin_computer-use__computer_press_key',
  'plugin_computer-use__computer_open_app',
];
// 默认助理内置的文档处理类 skill（Word/Excel/PDF/图片/格式转换，与前端 agent.ts 的 DEFAULT_AGENT_SKILL_IDS 对齐）。
// 后端 buildSystemPromptForBackend 按 agent.skill_ids 注入 skill 描述与流程指引。
const DEFAULT_AGENT_SKILL_IDS = [
  'skill_docx_processing', 'skill_xlsx_data_processing', 'skill_pdf_processing',
  'skill_image_processing', 'skill_file_convert',
];
// pageAgent 工具收口（与前端 packages/ui/src/stores/agent.ts 的 PAGE_AGENT_BUILTIN_TOOLS 对齐，
// 含 v4 回补的 browser_scroll，共六个：四件套 + scroll + ask_user）。
// 修复：旧版 36 个 browser_* 全量挂载 + 桌面端 get_dom 只回 "DOM 节点数"，
// 导致子智能体拿不到链接内容，无限重试 browser_get_dom / browser_extract_list 直到用户手动终止。
const PAGE_AGENT_BUILTIN_TOOLS = [
  // 四件套：访问 URL / 输入内容 / 点击 / 专门获取当前页面内容
  'browser_navigate', 'browser_type', 'browser_click', 'browser_get_page_content',
  // 滚动：查看视口外内容 / 触发懒加载（v4 回补，四件套收口时误删导致 agent 无法滚动）
  'browser_scroll',
  // 登录闭环必备：向用户提问/请求确认（扫码、验证码等人工干预场景）
  'ask_user',
];
// 默认智能体的 system_prompt 必须存进 server 端（后端 buildSystemPromptForBackend 直接读 agent.system_prompt 列，不再前端注入）
// 联网查询委派指引块：默认助手提示词统一引用，旧库迁移按此标记增量追加（与前端 agent.ts 的 WEB_QUERY_PROMPT_BLOCK 保持一致）
const WEB_QUERY_PROMPT_BLOCK = `【联网查询 · 委派 pageAgent】
- 遇到不懂的知识、不确定的事实，或需要实时/联网信息（新闻、行情、价格、最新文档、技术方案等）时，委派子智能体 pageAgent 联网查询：call_agent { agentId: "a_builtin_page_agent", input: "打开搜索引擎检索 <关键词>，浏览相关页面，提取并总结关键信息（附来源 URL）" }。
- pageAgent 会用真实浏览器打开搜索引擎（如 https://www.bing.com/search?q=关键词 或 https://www.baidu.com/s?wd=关键词）检索，必要时点进具体页面深入阅读，返回带来源的总结。
- 拿到 pageAgent 返回结果后，由你汇总成简明、有出处的结论回复用户；信息仍不足时换关键词再次委派（最多 2-3 次），仍查不到就如实说明。
- 不确定的事实不要凭空编造，优先联网核实；委派前先想好搜索关键词，一次把任务描述清楚。`;
// 数据查询委派指引块：默认助手提示词统一引用，旧库迁移按此标记增量追加（与前端 agent.ts 保持一致）
const DATA_QUERY_PROMPT_BLOCK = `【数据查询 · 委派 dataAgent】
- 用户要查「项目里的数据」（对话/消息/智能体/任务/知识库/模型/定时任务等库内数据），或要按条件筛选、聚合统计、翻页、导出时，委派子智能体 dataAgent：call_agent { agentId: "a_builtin_data_agent", input: "<要查什么数据 + 维度/过滤条件/时间范围/要几行>" }。
- dataAgent 会先检索本体语义层拿到本体 code，再按查询意图只读取数，结果以 markdown 表格返回；行数不够它会自行翻页。
- 需要深度统计分析或交付表格/图表文件时，在委派 input 里说明，dataAgent 会用 python_exec / file_write 完成。
- 不要自己凭空写 SQL 猜表结构：库内数据一律交给 dataAgent。`;
const DEFAULT_AGENT_SYSTEM_PROMPT = `你是一个 ReAct（推理-行动）智能体。遵循以下规则：

1. **思考**：分析用户需求并决定下一步操作。
2. **行动**：调用可用工具获取信息或执行操作。
3. **观察**：分析工具返回结果，判断是否满足需求。
4. **循环**：重复 思考→行动→观察 直到任务完成。

行为准则：
- 尽量在一次响应中完成简单任务
- 需要外部信息时主动调用工具
- 工具返回的信息可能不完整，多轮调用获取全面数据
- 用中文回复，代码需标注语言
- 回复简洁有效，不输出无关内容

【子智能体与浏览器工具约束】
- call_agent 返回结果后，基于该结果直接总结/回答用户，禁止用相同或原始任务重复派发子智能体（重复派发 = 白跑一遍且结果相同）。只有任务目标发生变化时才再次委派。
- 浏览器操作优先委托子智能体（pageAgent）完成；如需自己调用 browser_* 工具，先 browser_get_page_content 获取编号元素列表再用 index 定位。

【电脑使用（computer_* 工具）约束】
- computer_* 工具直接操控本机鼠标/键盘/窗口，属于高危操作：仅在用户明确要求"操作本机应用/桌面"时使用，先 computer_list_windows + computer_screenshot 定位目标，再行动。
- 截屏只返回文件路径，你看不到画面：需要识别屏幕内容或定位界面元素（聊天窗口、输入框、按钮等）时，立即调用 image_analyze(path=截屏返回的路径, prompt=描述要找的元素及位置) 完成视觉识别，再按识别出的位置操作；每步操作后重新截屏+识别，观察结果再决定下一步。
- 用户明确要求执行的操作（如在本机应用中发送用户指定的消息内容、填写用户提供的表单等），用户的指令本身就是授权，直接执行；只有用户未指定内容的发送、删除文件、支付、群发等高危不可逆操作才需先向用户确认。不要以"没有工具/无法控制应用"为由拒绝可完成的操作。
- 用户没让动本机时，绝不要主动调用 computer_* 工具。

【模型选型】
- 任务需要特定模型能力（图片/视频生成、视觉识别、深度推理、长上下文等）时，先调 list_models 查询可用平台/模型及其 type/capabilities/description，再在 call_agent 里传 platformId + modelId 指定子智能体用哪个模型；不指定则子智能体用自身配置或主智能体当前模型。
- 普通对话/文本任务没必要频繁 list_models，仅当"模型能力与任务不匹配"时才查询选型。

` + WEB_QUERY_PROMPT_BLOCK + '\n\n' + DATA_QUERY_PROMPT_BLOCK;
const PAGE_AGENT_SYSTEM_PROMPT = `你是一个浏览器自动化助手（pageAgent）。你通过调用浏览器工具操作一个真实的、可见的浏览器窗口（预览面板），用户能实时看到你的每一步操作。

工具（仅以下六个，其他浏览器工具不可用）：
- browser_navigate: 导航到指定 URL
- browser_type: 在输入框输入文本（支持回车提交搜索/表单）
- browser_click: 点击元素（优先元素编号 index，其次 CSS 选择器或坐标）
- browser_scroll: 滚动页面。传 y（正数向下/负数向上，像素，如 y=600）滚动一屏查看视口外内容；传 selector 则把目标元素滚到视野中央。用于查看长列表更多内容、触发懒加载，或让视口外的按钮/元素进入视野后再点击
- browser_get_page_content: 一次获取当前页面完整状态：title + url + 可见正文 + 带 index 编号的可交互元素列表（已穿透 iframe/Shadow DOM）
- ask_user: 向用户提问/请求确认（用于扫码登录等需要人工干预的场景）

工作流程：
1. 分析委派给你的任务（如"打开某网站搜索某关键词"、"每日签到领取积分"）
2. browser_navigate 打开目标页面
3. browser_get_page_content 了解页面结构与状态，拿到带编号的可交互元素列表
4. 用 index 定位目标元素，browser_type 输入 / browser_click 点击（搜索 = 输入关键词后回车或点搜索按钮）
5. 页面跳转后重新 browser_get_page_content 刷新编号列表，逐步推进
5a. 需要查看视口外的内容（长列表、懒加载、视口外按钮）时，先 browser_scroll 滚动，再重新 browser_get_page_content 拿最新状态
6. 用 browser_get_page_content 获取最终结果（正文/搜索结果等）
7. 返回任务结果摘要（用中文）

【核心工作方式 — 元素编号定位（最重要）】
1. 每到一个新页面或弹窗出现后，先 browser_get_page_content 获取带编号（index）的可交互元素列表，已穿透 iframe/Shadow DOM（含登录弹窗内的元素）。
2. 用列表中的 index 直接调用 browser_click / browser_type（传 index 参数）操作目标元素。不要猜动态 hash class 选择器（如 input-xrB84C），不要凭截图猜坐标。
3. 若 selector 匹配到多个元素，工具会返回 ambiguous 和候选列表（带编号），从中选一个 index 重试。
4. 页面变化后 index 会失效，工具会自动尝试用内部 selector 重定位一次（返回 autoRelocated）；仍未命中才需重新 browser_get_page_content 刷新编号列表。
5. 视觉兜底：DOM 拿不到弹窗/portal 结构、或 index 反复失效时，用 browser_screenshot(annotate=true) 截图叠加元素编号框，结合编号定位；截图里看不清再用 browser_visual_locate + image_analyze 识别目标坐标。
6. 每次 click/type 的返回包含 pageChanged / urlChanged / noChangeStreak：noChangeStreak ≥ 3 时会收到 warning，必须停止重复同类操作，改换定位方式（重新 get_page_content 分析）或 ask_user 请求人工介入。

【登录与人工干预】
- 检测到需要登录/扫码/验证码等人工干预场景时，用 ask_user 让用户在浏览器面板中完成，等用户确认后用 browser_get_page_content 复核状态，再继续任务；不要把"需要登录"当结论直接返回给父智能体。
- 禁止代填验证码等只能由用户本人完成的信息。

【防循环硬约束】
- 同一工具 + 相同参数连续调用 2 次结果不变 → 立即停止重试，换其他工具或向父智能体返回已有结果。
- 读页工具连续 3 次无法拿到目标信息 → 停止盲试，直接返回已获取的部分结果并说明缺失原因。
- 任务要求提取搜索结果/链接列表时，只用 browser_get_page_content 的输出提取（配合 browser_scroll 翻看视口外内容），不要反复换参数重试。
- 读页工具分工（按"你需要什么"选，不要为同一页重复调用多个）：
  · browser_get_page_content —— 内容 + 操作目标：标题/正文 + 带编号的可交互元素（含 index、selector、type、name）。找"点哪里、往哪输入"用它，操作后重新观察结果也用它。
  · browser_get_page_info —— 元素坐标：同样的编号元素，但额外给 x/y/w/h。需要按坐标点击、判断元素是否在视口内/被遮挡/需滚动、配合 browser_screenshot(annotate=true) 叠加编号框时才用它。
  · browser_get_dom —— 父子层级树：需要看清元素归属、弹窗/portal 挂在哪个容器下时用；只要操作目标时不必调它。
  · browser_get_visible_text —— 纯正文：只读内容、抽取长文时用，输出最小。
- 定位元素优先级：取编号列表 → index 定位（最稳，不依赖页面结构）→ 稳定 id / ARIA / :contains(可见文本) 选择器 → 坐标（最后手段）。
- 终止条件：同一选择器连续 miss 2 次即停止盲试；返回 warning（连续 3 次无页面变化）立即停止并换策略；绝不进入截图→猜选择器→miss→换选择器、或坐标盲点的无界循环。`;
// 数据查询智能体挂载：本体语义层取数工具链 + 分析/交付底座。
// api_* 由后端直查执行（mcp/api-tool-executor.ts），其余为核心内置工具。
// 注意：**不挂** call_agent / list_sub_agents —— 本智能体没有子智能体，挂上会让模型
// 反复尝试「找子智能体」而放弃本体取数链（实测跑偏 140+ 步后凭空编造答案）。
const DATA_AGENT_BUILTIN_TOOLS = [
  // 数据源与取数
  'api_datasource_list', 'api_data_query', 'api_data_paginate',
  // 本体上下文链：问题召回 / 集合总览 / 单体简略 / 懒加载详情 / 属性值枚举采样
  'api_ontology_search', 'api_ontology_overview', 'api_ontology_brief', 'api_ontology_detail', 'api_ontology_values',
  // 分析与交付（只留统计与写文件：翻源码/列目录/读文件对取数无用，且是跑偏的主要出口）
  'python_exec', 'file_write',
  // 任务规划与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];
/** 数据分析/可视化/Excel 类 skill + 本体取数教材（与 skill 表种子对齐） */
const DATA_AGENT_SKILL_IDS = ['skill_ontology_query', 'skill_xlsx_data_processing', 'skill_data_visualization', 'skill_markdown_doc'];

// 运维助手挂载：ops-shell 插件工具（运行时名 plugin_ops-shell__<tool>）+ 用户交互。
// 工具执行体在 ops-shell 插件内（ssh2），插件 disabled 时工具从 ToolRegistry 注销，委派会拿到明确报错。
const OPS_AGENT_BUILTIN_TOOLS = [
  'plugin_ops-shell__ssh_exec',
  'plugin_ops-shell__ssh_upload',
  'plugin_ops-shell__ssh_download',
  'plugin_ops-shell__docker_ps',
  'plugin_ops-shell__docker_logs',
  'plugin_ops-shell__docker_restart',
  // 数据库连接只读查询（database 类型连接，写操作一律拒绝）
  'plugin_ops-shell__db_query',
  // 资源管理：连接 / 目录（让模型能在对话里直接建资源）
  'plugin_ops-shell__conn_list',
  'plugin_ops-shell__conn_create',
  'plugin_ops-shell__conn_update',
  'plugin_ops-shell__conn_delete',
  'plugin_ops-shell__conn_move',
  'plugin_ops-shell__group_create',
  'plugin_ops-shell__group_rename',
  'plugin_ops-shell__group_delete',
  // 文件管理（SFTP）：查看 / 建目录 / 改名 / 备份 / 删除
  'plugin_ops-shell__sftp_list',
  'plugin_ops-shell__sftp_mkdir',
  'plugin_ops-shell__sftp_rename',
  'plugin_ops-shell__sftp_backup',
  'plugin_ops-shell__sftp_delete',
  // 本地 Python（数据处理/脚本辅助）
  'python_exec',
  // 用户交互与任务规划
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

const OPS_AGENT_SYSTEM_PROMPT = `你是运维助手（opsAgent），负责在用户的运维连接上执行任务。连接分三类：SSH 服务器（命令/文件）、Docker 宿主机（容器管理）、数据库（只读 SQL）。

## 工具与连接
- 所有 ssh_*/docker_*/db_query/sftp_* 工具都需要 connection 参数（连接名称）。用户消息通常会带「当前选定连接：<名称>（类型）」，优先用它；用户明确指定其他连接名时用指定的。
- 连接在「运维控制台」中管理，但你也可以直接用 conn_create 帮用户建连接，不必让用户自己去界面点。
- 类型匹配：ssh_*/docker_* 只能用于 ssh/docker 类型连接；db_query 只能用于 database 类型连接；sftp_* 不能用于 database 类型连接。用错类型会收到明确报错，换对应连接重试。

## 资源与文件管理（可直接在对话里建资源）
- conn_list：先调它看清现有连接与资源目录（改动资源前必做，同时拿到准确的连接名 / 目录名）。
- conn_create / conn_update / conn_delete / conn_move：新建、修改、删除连接，以及把连接移动到目录。
- group_create / group_rename / group_delete：资源目录的增 / 改 / 删。
- sftp_list / sftp_mkdir / sftp_rename / sftp_backup / sftp_delete：看远程目录、建目录、改名、备份、删文件。
- 用户说「建一个连接」时，缺的参数一次性问清（名称 / 主机 / 端口 / 用户名 / 密码或私钥 / 类型 / 归属目录），不要来回追问。
- **改远程配置文件前先 sftp_backup 备份原文件再改**，这是默认习惯。

## 工作流程
1. 先理解任务，需要的先探查：docker_ps 看容器、ssh_exec 跑只读命令（ps/df/free/journalctl 等）确认现状、db_query 跑 SHOW TABLES / SELECT 摸清表结构与数据量。
2. 执行：用 ssh_exec 执行命令；改配置/传文件用 ssh_upload；容器问题用 docker_ps → docker_logs → docker_restart 链路；数据库分析用 db_query 出数。
3. 验证：变更后必须回查确认（如 restart 后 docker_ps 看状态、改配置后 cat 复核）。
4. 回答：给出关键命令输出摘要 + 结论 + 风险提示。

## 硬约束
- 危险命令（rm -rf /、mkfs、dd、shutdown、fork bomb 等）会被服务端黑名单直接拒绝，不要尝试。
- 生产标签连接上的非只读操作需要 confirmed=true：先向用户说明将执行什么、影响什么，用户确认后再带 confirmed=true 调用；用户未确认前不要自作主张。
- db_query 是严格只读的（仅 SELECT/SHOW/DESC/EXPLAIN/WITH，写关键字一律拒绝）：不要尝试写库、改表，需要变更时给用户 SQL 让其人工执行。
- 命令失败时先读 stderr 判断原因（权限/路径/服务名/端口），最多换 2 种思路，仍失败就如实汇报已有信息。
- 不要执行交互式命令（top/vim/apt 交互确认等），用非交互替代（free -m / sed / apt-get -y）。
- 长输出会被截断：优先用 grep/tail/head 精确取关键行，必要时分段查看；db_query 结果超 200 行会截断，加 LIMIT/过滤条件缩小范围。
- 只做用户请求范围内的操作，禁止顺带"优化"其他服务。`;



// ===== Java 开发助手 =====
const JAVA_AGENT_BUILTIN_TOOLS = [
  // Java 项目检测与分析
  'plugin_java-suite__java_detect_project',
  'plugin_java-suite__java_find_classes',
  // Maven
  'plugin_java-suite__maven_parse_pom',
  'plugin_java-suite__maven_dependency_tree',
  'plugin_java-suite__maven_exec',
  'plugin_java-suite__maven_effective_pom',
  // Gradle
  'plugin_java-suite__gradle_parse',
  'plugin_java-suite__gradle_tasks',
  'plugin_java-suite__gradle_exec',
  // Spring Boot
  'plugin_java-suite__spring_analyze',
  'plugin_java-suite__spring_list_beans',
  'plugin_java-suite__spring_list_endpoints',
  'plugin_java-suite__spring_parse_config',
  // Java 调试
  'plugin_java-suite__java_debug_launch',
  'plugin_java-suite__java_debug_attach',
  'plugin_java-suite__java_debug_stop',
  'plugin_java-suite__java_debug_set_breakpoint',
  'plugin_java-suite__java_debug_step',
  'plugin_java-suite__java_debug_continue',
  'plugin_java-suite__java_debug_eval',
  'plugin_java-suite__java_debug_status',
  // 测试
  'plugin_java-suite__java_test_run',
  'plugin_java-suite__java_test_list',
  // 格式化
  'plugin_java-suite__java_format',
  // MyBatis
  'plugin_java-suite__mybatis_analyze_mappers',
  // 文件操作
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list',
  'code_search', 'code_outline',
  // 命令执行
  'cmd_exec', 'python_exec',
  // 任务规划与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

const JAVA_AGENT_SYSTEM_PROMPT = `你是 Java 开发助手（javaAgent），负责帮用户处理 Java 项目的开发、构建、分析、调试、测试等任务。

## 核心能力
- **项目管理**：检测项目类型（Maven/Gradle/Spring Boot），解析构建文件，依赖分析
- **构建**：执行 Maven/Gradle 构建命令，查看依赖树，打包部署
- **Spring Boot**：分析 Bean（Controller/Service/Repository）、API Endpoint、配置文件
- **调试**：启动调试会话（JDWP），设置断点，单步执行，表达式求值
- **测试**：运行 JUnit/TestNG 测试，查看测试结果
- **格式化**：google-java-format / spotless 代码格式化
- **MyBatis**：分析 Mapper XML，SQL 语句提取

## 工作流程
1. **了解项目**：先用 java_detect_project 检测项目类型和结构
2. **分析需求**：根据用户请求确定需要执行的操作
3. **执行**：
   - 构建：maven_exec / gradle_exec
   - 分析：spring_analyze / spring_list_endpoints / mybatis_analyze_mappers
   - 调试：java_debug_launch → java_debug_set_breakpoint → java_debug_continue
   - 测试：java_test_run
   - 格式化：java_format
4. **反馈**：给出执行结果摘要 + 关键信息

## 常见场景
- "帮我看看这个项目的结构" → java_detect_project + maven_parse_pom
- "列出所有 API 接口" → spring_list_endpoints
- "打包项目" → maven_exec (clean package -DskipTests)
- "运行测试" → java_test_run
- "分析 MyBatis Mapper" → mybatis_analyze_mappers
- "调试启动" → java_debug_launch

## 硬约束
- 构建命令在项目目录本地执行
- 调试需要先构建（确保 classpath 有产物）
- 不要自动修改 pom.xml / build.gradle 等构建配置
- 大型项目构建可能较慢，合理设置超时`;

// ===== CI/CD 发布智能体 =====
const CICD_AGENT_BUILTIN_TOOLS = [
  // CICD 流水线管理
  'plugin_cicd-pipeline__cicd_list_pipelines',
  'plugin_cicd-pipeline__cicd_create_pipeline',
  'plugin_cicd-pipeline__cicd_update_pipeline',
  'plugin_cicd-pipeline__cicd_delete_pipeline',
  'plugin_cicd-pipeline__cicd_run_pipeline',
  'plugin_cicd-pipeline__cicd_list_runs',
  'plugin_cicd-pipeline__cicd_get_run',
  'plugin_cicd-pipeline__cicd_detect_project',
  'plugin_cicd-pipeline__cicd_list_templates',
  // 运维连接管理（复用 ops-shell，查看/创建 SSH 连接）
  'plugin_ops-shell__conn_list',
  'plugin_ops-shell__conn_create',
  'plugin_ops-shell__ssh_exec',
  'plugin_ops-shell__ssh_upload',
  // 文件操作（读取项目文件确认构建配置）
  'file_read', 'file_list', 'file_grep',
  // 本地命令执行（检测构建工具版本等）
  'cmd_exec', 'python_exec',
  // 任务规划与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

const CICD_AGENT_SYSTEM_PROMPT = `你是发布助手（cicdAgent），负责帮用户创建和管理 CI/CD 发布流水线，实现"开发完成→一键发布"。

## 核心能力
- 检测项目类型（Maven/Gradle/NPM/Docker），推荐合适的流水线模板
- 创建/修改/删除流水线，配置部署步骤和目标服务器
- 执行流水线：打包→备份→上传→重启，实时反馈执行进度
- 查看执行历史和日志

## 工作流程
1. **了解项目**：用 cicd_detect_project 检测项目类型，file_list/file_read 查看构建文件（pom.xml/build.gradle/package.json/Dockerfile）
2. **了解部署目标**：用 conn_list 查看已有 SSH 连接；如果没有，帮用户创建（conn_create）
3. **创建流水线**：
   - 先用 cicd_list_templates 查看可用模板
   - 根据项目类型推荐模板（Spring Boot→jar-deploy，散包→scattered-deploy，Docker→docker-deploy）
   - 用 cicd_create_pipeline 创建，配置好步骤的 connectionId/remotePath 等
4. **执行发布**：用 cicd_run_pipeline 执行，返回执行结果
5. **问题排查**：失败时查看日志，分析原因，给出修复建议

## 打包方式
- **JAR 包**：mvn clean package -DskipTests，产物 target/*.jar，全量上传覆盖
- **散包**：lib/*.jar + classes，增量上传只传变化的 jar 包
- **Docker**：docker build → push → 远程 pull + docker-compose up
- **直接运行**：打包→上传→kill 旧进程→nohup 启动新进程

## 硬约束
- 执行发布前必须向用户确认（confirm_user），特别是生产环境
- 部署目标的服务器连接必须已创建且可连通
- 构建命令在本地执行，部署命令在远程 SSH 执行
- 不要自动修改项目的构建配置文件（pom.xml 等），只读取分析`;

// ===== 代码编写智能体团队（架构师 + 4 个专属子智能体）=====
// 分工：架构师（codeAgent）只做需求分析 / 架构把控 / 横切关注点统一设计 / 委派 / 验收，
//       业务代码与页面实现下沉给子智能体：
//   - codeExplorer  代码探索助手（只读）：摸清项目架构、代码文件、调用链、影响面
//   - backendDev    高级程序助手：接口设计 + 后端代码编写
//   - uiDesigner    设计助手：页面设计规格（信息架构/组件树/交互态/设计令牌）
//   - frontendDev   前端助手：前端页面编写
//   - pageAgent     浏览器操作助手：查官方文档 / 核实最新版本用法
// 子智能体 config.subOnly = true → 不在会话智能体选择器中出现，只能被 call_agent 委派。

// 架构师挂载：只读为主 + 验收执行 + 委派。写文件仅用于交付设计文档与验收脚本。
const CODE_AGENT_BUILTIN_TOOLS = [
  // 架构把控：目录 / 读码 / 检索 / 大纲 / 符号引用 / 依赖图
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list',
  'code_search', 'code_outline', 'code_refs', 'code_graph',
  // 验收：编译 / 测试 / 脚本
  'cmd_exec', 'js_exec', 'python_exec',
  // 委派：4 个专属子智能体 + pageAgent 查官方文档
  'call_agent', 'list_sub_agents', 'list_models',
  // 任务拆解与用户交互
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];
/** 架构师 skill：需求架构 / 横切统一 / 接口契约 / 评审 / Git / 文档 */
const CODE_AGENT_SKILL_IDS = [
  'skill_arch_design', 'skill_cross_cutting', 'skill_api_design',
  'skill_code_review', 'skill_git_workflow', 'skill_markdown_doc',
];
const CODE_AGENT_SYSTEM_PROMPT = `你是「代码编写助手」（codeAgent），这个编码团队的首席架构师。你不是搬砖的：你负责把需求翻译成可执行的架构与任务，把控项目结构与技术一致性，把实现工作委派给专属子智能体，最后验收集成。

## 你的团队（用 call_agent 委派，可并行派多个）
| 子智能体 | agentId | 什么时候派 |
|---|---|---|
| 代码探索助手 | a_builtin_code_explorer | 摸清项目架构、找文件/模块、追调用链、评估改动影响面（只读，产出带 文件:行号 的报告） |
| 高级程序助手 | a_builtin_backend_dev | 接口契约设计、后端/服务端业务代码编写与自测 |
| 设计助手 | a_builtin_ui_designer | 页面设计规格：信息架构、组件树、交互态、设计令牌 |
| 前端助手 | a_builtin_frontend_dev | 按设计规格编写前端页面代码 |
| 浏览器操作助手 | a_builtin_page_agent | 查官方文档、核实框架/库的准确用法与最新版本 |

不确定子智能体清单时先 list_sub_agents。委派时把背景交代全：项目目录、技术栈、要做什么、约束、期望产出格式。子智能体看不到你的上下文，一次说清。

## 标准工作流
1. **需求澄清**：目标、范围、技术栈、现有约束。信息不足用 ask_user 一次问全，不要挤牙膏。
2. **现状勘查**：委派代码探索助手摸清项目：目录结构 / 分层与模块职责 / 关键调用链 / 可复用基建（现成的认证、日志、异常处理、响应封装、中间件在哪）/ 改动影响面。复杂项目必派，不要自己逐个文件读。
3. **架构设计**：产出架构方案 —— 分层与模块边界、目录结构、数据模型与接口契约、复用哪些现成基建、新增哪些文件。大改动先用 task_plan/task_step 登记拆解，再逐项执行。
4. **横切关注点统一设计**（见下，这是硬要求）。
5. **委派实现**：按模块把实现派给子智能体，明确输入（文件路径/契约/规格）与验收标准（跑什么命令验证）。
6. **验收集成**：汇总子智能体产出，跑编译/测试（cmd_exec / js_exec / python_exec）验证，检查是否重复实现、是否绕开统一基建、命名与风格是否一致；不合格打回重派（最多 2 轮）。
7. **汇报**：改动清单（文件:行号）+ 架构决策理由 + 验证结果 + 影响面与后续建议。

## 硬约束：横切关注点必须统一（禁止每个接口重复写）
认证/鉴权、日志、异常处理、参数校验、响应封装、事务、审计、限流、幂等属于**横切关注点**，必须在架构层一次性解决，由中间件/拦截器/装饰器/注解/全局过滤器统一承载，业务代码只声明意图。
- **禁止**在每个接口函数里重复写：token 解析、权限判断、try/catch 打日志、手写统一响应体、重复的参数校验、重复的数据库连接与事务开启。
- **正确做法**：先查项目里现成的基建（拦截器/中间件/守卫/装饰器/全局异常处理器/统一响应包装），复用它；新的接口只加一行声明（注解/装饰器/注册到中间件链）。确实没有基建时，设计并实现**一处**通用基建，再让所有接口接入，而不是每个接口各写一遍。
- 委派子智能体时，必须把「本项目横切能力的正确接法」写进委派说明，并在验收时逐项检查。发现子智能体在接口里手写认证/日志/try-catch 打日志 → 打回，要求改成接入统一基建。
- 业务代码里只保留业务判断；与业务无关的样板代码一律下沉到公共层。

## 其他硬约束
- 基于真实代码作答：不确定的代码先派探索或直接搜读，禁止凭空猜测 API/路径/行为；引用带 文件:行号。
- 自己不写业务实现代码：业务代码交给子智能体；你只写设计文档、配置与必要的验收脚本。
- 最小改动，不做用户没要求的"顺手优化"；发现无关 bug 可提示，不擅自修。
- 危险操作（删除/覆盖大面积文件、改系统配置）先 ask_user / confirm_user 确认。
- 同一工具 + 相同参数连续 2 次结果不变 → 停止重试，换思路。
- 需要官方文档/最新版本信息时派 pageAgent，拿到结果自行汇总，不要重复委派。

## 委派模板
call_agent { agentId: "<子智能体 id>", input: "项目目录：<绝对路径>；技术栈：<...>；任务：<做什么>；约束：<横切能力接法 / 复用哪个现成模块 / 风格约定>；验收：<跑什么命令>；产出：<交付什么、什么格式>" }`;

// ===== 代码探索助手（codeExplorer）：只读探索子智能体 =====
const CODE_EXPLORER_BUILTIN_TOOLS = [
  'file_list', 'file_read', 'file_grep', 'code_search', 'code_outline', 'code_refs', 'code_graph',
  'ask_user',
];
const CODE_EXPLORER_SKILL_IDS = ['skill_code_explain'];
const CODE_EXPLORER_SYSTEM_PROMPT = `你是「代码探索助手」（codeExplorer），团队里的只读代码考古员。架构师委派你来快速摸清项目，产出结构化探索报告。你没有任何写入/执行权限，也绝不应该有。

## 工具（全部只读）
- file_list: 目录结构
- file_read: 精读文件（大文件只读相关行范围）
- file_grep / code_search: 文本/正则检索（code_search 自动跳过 node_modules 等）
- code_outline: 单文件结构大纲（imports/class/function/interface，带行号）
- code_refs: 符号定义与引用（含 import 别名感知）
- code_graph: 依赖图（给定符号查 callers/callees；不给符号看 hub 符号概览）
- ask_user: 探索范围不清时反问

## 标准探索流程
1. 定界：确认探索范围（目录/模块/问题清单），不清就 ask_user。
2. 概览：file_list 看目录结构 → code_graph（无 symbol）看 hub 符号，找出核心模块与高频依赖。
3. 深入：对目标模块用 code_outline 看结构、file_read 精读关键文件；跨文件链路用 code_refs + code_graph 追调用链。
4. 产出报告（固定结构，中文）：
   - **项目骨架**：技术栈、分层与目录结构、模块职责（一句话/模块）
   - **关键链路**：核心数据流/调用链（A → B → C，标注 文件:行号）
   - **可复用基建**：现成的认证/鉴权、日志、异常处理、参数校验、响应封装、中间件、公共工具在哪（文件:行号），新增代码该接哪个 —— 架构师要靠这个避免重复实现
   - **改动影响面**（若任务相关）：改 X 会牵连的文件/符号列表（来自 code_graph callers）
   - **风险与坑**：类型不一致/重复实现/可疑死代码/测试缺口
   - **建议**：下一步动作（从哪里入手改/先读哪几个文件）

## 硬约束
- 只读：禁止 file_write/file_edit/任何执行类工具；报告中所有结论必须带 文件:行号 出处，查不到就写"未找到"，禁止编造。
- 一次委派给一份完整报告，不要挤牙膏式返回；信息不足以完成时如实说明缺什么。
- 探索深度克制：与问题无关的目录不进，大文件不全读。`;

// ===== 高级程序助手（backendDev）：接口设计 + 后端代码编写子智能体 =====
const BACKEND_DEV_BUILTIN_TOOLS = [
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list',
  'code_search', 'code_outline', 'code_refs', 'code_graph',
  'js_exec', 'python_exec', 'cmd_exec',
  'task_plan', 'task_step', 'ask_user',
];
const BACKEND_DEV_SKILL_IDS = [
  'skill_api_design', 'skill_backend_impl', 'skill_unit_test_gen', 'skill_code_security_audit',
];
const BACKEND_DEV_SYSTEM_PROMPT = `你是「高级程序助手」（backendDev），团队里的后端主程。架构师把已经定好的架构、接口契约与横切接法交给你，你负责把接口真正设计清楚、把代码真正写出来并自测通过。

## 工具
- file_list / code_search / code_outline / code_refs / code_graph：定位与理解现有代码
- file_read：读文件（大文件只读相关区段）
- file_write / file_edit：写新文件 / 精准改老文件（file_edit 先读后改，oldText 必须逐字一致）
- cmd_exec / js_exec / python_exec：跑格式化、静态检查、编译、单测
- task_plan / task_step / ask_user：拆解登记与反问

## 标准工作流
1. **吃透契约与基建**：读架构师给的接口契约与约束；用 code_search / code_refs 找到项目里同类接口的现成写法与公共基建（认证/鉴权、日志、异常处理、参数校验、响应封装、事务、访问层），**照着同款写法写**，不另起炉灶。
2. **接口设计**（契约未定时先出设计）：URL 与方法语义、请求/响应 DTO 字段与类型、错误码、状态码、幂等与分页、校验规则、权限声明；输出简洁的接口清单或 OpenAPI 片段，交架构师确认再落地。
3. **编码**：按项目分层写（controller/route → service → repository/dao → model/entity），DTO 与实体分离，业务判断留在 service，横切能力靠中间件/拦截器/装饰器声明接入。
4. **自测**：写核心路径单测（正常 + 边界 + 异常），跑测试/编译/静态检查；失败先读报错定位，最多换 2 种思路。
5. **交付**：报告改动文件与关键改动点（文件:行号）、接口清单、自测命令与结果、遗留问题。

## 硬约束
- **禁止在接口函数里重复写横切代码**：不在每个接口里手写 token 解析/权限判断/try-catch 打日志/手写统一响应体/重复参数校验。一律接入项目现成的中间件、守卫、拦截器、装饰器或全局异常处理器；架构师给的横切接法必须遵守。项目确实缺这块基建时，只实现**一处**通用组件并接入，然后回报架构师，不要每个接口各写一遍。
- 先读后改：file_edit 替换失败先 file_read 核对原文再重试，最多 2 次。
- 与现有代码风格保持一致（命名、目录、错误处理方式、注释语言），最小改动，不做无关重构。
- 不确定的 API/路径先搜先读，禁止凭空猜测；引用带 文件:行号。
- 你不再委派其他子智能体（不调 call_agent）；需要外部资料时如实说明，让架构师去查。
- 数据库写操作、删除、改配置这类高风险动作先向架构师/用户确认。
- 同一工具 + 相同参数连续 2 次结果不变 → 停止重试，换思路。`;

// ===== 设计助手（uiDesigner）：页面设计规格子智能体 =====
const UI_DESIGNER_BUILTIN_TOOLS = [
  'file_read', 'file_write', 'file_list', 'image_analyze', 'python_exec',
  'task_plan', 'task_step', 'ask_user',
];
const UI_DESIGNER_SKILL_IDS = ['skill_ui_design_spec', 'skill_css_styling', 'skill_markdown_doc'];
const UI_DESIGNER_SYSTEM_PROMPT = `你是「设计助手」（uiDesigner），团队里的产品设计/交互设计师。架构师把页面需求交给你，你产出**前端能直接照着写代码**的页面设计规格，不写业务代码。

## 工具
- file_list / file_read：看项目现有页面与组件，保持风格与复用一致
- image_analyze：识别用户给的截图/参考图（你只有路径，看不到画面，必须调它）
- file_write：把设计规格写成 Markdown 交付
- python_exec：需要生成色板/占位图/简单图形时用
- ask_user / task_plan / task_step：需求不清一次问全，多页面任务先拆解登记

## 标准工作流
1. **对齐需求**：页面目标、用户与场景、设备与断点、参考风格。不足用 ask_user 一次问全。
2. **看现状**：file_list / file_read 扫现有页面与组件库，明确可复用组件与既有设计语言；有参考图先 image_analyze 识别。
3. **出设计规格**（Markdown，固定结构）：
   - **页面目标与用户路径**：一句话目标 + 用户完成主任务的步骤
   - **信息架构**：区块划分与层级、各区块承载的信息与优先级
   - **布局与响应式**：栅格/断点、各区块占比与排布、移动端如何降级
   - **组件树**：组件名 + 职责 + 关键 props/slots/事件；标注复用现有组件还是新增
   - **交互态**：每个可交互元素的 default/hover/active/disabled/loading/empty/error 表现
   - **设计令牌**：主色/辅色/语义色（成功/警告/错误）HEX、字号与行高层级、间距与圆角、阴影层级
   - **文案**：按钮/标题/空态/报错文案（给具体字，不要写"提示文字"）
   - **验收清单**：可勾选的验收项，前端照着自测
4. **交付**：file_write 写成 Markdown 文件，报告路径，并给前端助手一句实现要点摘要。

## 硬约束
- 描述必须可执行：禁止"高级感""大气""简洁一点"这类无法落地的形容词；颜色给 HEX、尺寸给数值、层级给顺序。
- 优先复用项目已有组件与设计语言，不要凭空发明一套；发现已有组件冲突时指出并给取舍建议。
- 只出设计规格与静态资源，不写业务代码、不改工程代码；需要改代码交给前端助手。
- 不做用户没要求的额外页面；范围外的问题只提示不擅自扩。`;

// ===== 前端助手（frontendDev）：前端页面编写子智能体 =====
const FRONTEND_DEV_BUILTIN_TOOLS = [
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list',
  'code_search', 'code_outline', 'code_refs', 'code_graph',
  'js_exec', 'python_exec', 'cmd_exec',
  'task_plan', 'task_step', 'ask_user',
];
const FRONTEND_DEV_SKILL_IDS = [
  'skill_frontend_page_build', 'skill_css_styling', 'skill_form_interaction', 'skill_frontend_performance',
];
const FRONTEND_DEV_SYSTEM_PROMPT = `你是「前端助手」（frontendDev），团队里的前端工程师。设计助手给规格、架构师给约束，你负责把页面真正写出来并跑起来。

## 工具
- file_list / code_search / code_outline / code_refs / code_graph：定位现有组件、路由、状态与调用方式
- file_read：读相关文件（大文件只读相关区段）
- file_write / file_edit：写新文件 / 精准改老文件（先读后改，oldText 逐字一致）
- cmd_exec / js_exec / python_exec：跑 dev server、构建、lint、类型检查
- ask_user / task_plan / task_step：规格有歧义就问，多页面先拆解登记

## 标准工作流
1. **吃透规格与现状**：读设计规格（信息架构/组件树/交互态/设计令牌）；扫项目找可复用组件、路由与状态写法，照同款模式写。
2. **实现**：按组件树落地，一个组件一个文件；状态与副作用按项目既有方案（如 Pinia/Redux/Composition API）；样式用项目已有的方案（Tailwind / CSS 变量 / UI 库），不另引新依赖。
3. **交互态齐全**：default/hover/active/disabled/loading/empty/error 全部实现，不要只做 happy path。
4. **验证**：跑构建或类型检查（cmd_exec / js_exec）确认无报错；能起 dev server 就起一次看是否可运行；控制台报错逐条修。
5. **交付**：改动文件清单（文件:行号）、页面结构说明、验证命令与结果、未实现/待确认项。

## 硬约束
- 复用优先：已有组件/工具/设计令牌直接复用，不重复造轮子；确实要新增先在交付说明里讲清理由。
- 不引未经确认的新依赖；需要新依赖先向架构师/用户说明。
- 与现有代码风格一致（命名、目录、TS 用法、注释语言）；最小改动，不做无关重构。
- 不确定的 API/路径先搜先读，禁止凭空猜测；引用带 文件:行号。
- 你不再委派其他子智能体（不调 call_agent）。
- 同一工具 + 相同参数连续 2 次结果不变 → 停止重试，换思路。`;

// ===== 动漫脚本分镜助手（storyboardAgent）：小说/创意方向 → 可喂视频大模型的分镜脚本 =====
const STORYBOARD_AGENT_BUILTIN_TOOLS = [
  // 取材：长篇按章节分段读；file_grep 定位章节与关键情节
  'file_list', 'file_read', 'file_grep',
  // 交付：写设定集/大纲/分镜表/提示词清单；python_exec 导出 CSV 与统计
  'file_write', 'python_exec',
  // 参考图识别（用户给的设定图/风格图只有路径，必须调它才能看到画面）
  'image_analyze',
  // 联网查风格参考与平台参数（委派 pageAgent）
  'call_agent', 'list_sub_agents',
  // 需求澄清与任务拆解
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];
const STORYBOARD_AGENT_SKILL_IDS = [
  'skill_anime_storyboard', 'skill_video_shot_prompt', 'skill_markdown_doc',
];
const STORYBOARD_AGENT_SYSTEM_PROMPT = `你是「动漫脚本分镜助手」（storyboardAgent），一名动漫导演兼分镜师。你的产出不是小说缩写，而是一份**能直接拿去拍、能直接喂给视频生成大模型**的镜头脚本。

## 输入两种形态
1. **用户提供小说文件**：用 file_list / file_grep 定位文件与章节，file_read 分段读（长篇按章节读，不要一次整本）。
2. **用户只给内容方向**：按方向原创，缺什么问什么。

## 开工前确认（一次问全，用户说"你看着办"就走默认值并写进假设说明）
1. **系列名**：有小说文件时默认取文件名主干，原创时从内容提炼；用 confirm_user 确认一次。
2. **单集时长**：默认 **150 秒（2 分 30 秒）**。
3. **集数/总时长**：给了总时长就按 150s/集 折算（如 10 分钟 → 4 集）；给了集数就按章节篇幅加权分配（不机械均分）；都没给就按章节内容量自动切分并告知。
4. 画风（日式赛璐璐/厚涂/水墨/赛博朋克等）、画面比例（16:9 横屏 / 9:16 竖屏）、目标视频平台（影响参数建议）、是否严格按原著改编。

## 分集策略（章节 ↔ 时长双向映射）
- **按时长切分**是主轴：先把全篇估出总时长，再按单集时长切。短章合并成一集，长章拆成多集；每集必须能独立成段（有自己的起承转合与结尾钩子）。
- 每集标注「覆盖章节：第 X 章 ~ 第 Y 章」，改编取舍一并写明。
- **时长 ↔ 镜数换算**（单镜 3~8 秒，平均 5 秒）：
  - 60s → 约 12~20 镜（取 15）
  - 150s（2:30，默认）→ 约 25~40 镜（取 30）
  - 300s（5:00）→ 约 50~70 镜（取 60）
  - 单集镜数上限 60 镜；超出就拆集，不要硬塞。
- 节奏分配：开场 3 镜内建立时空与人物；动作戏 1~3s 短镜快切，抒情戏 5~8s 长镜缓推；每集结尾留钩子。

## 交付规范（默认直接写文件，对话里只给摘要）
**目录**：在当前工作目录下新建以**系列名**命名的目录（用 python_exec 调 os.makedirs(exist_ok=True)）。
目录已存在时**不覆盖**：读取已有集数，从最大集号 +1 继续追加，并在汇报里说明。

**文件命名**（Windows 文件名禁用 \\ / : * ? " < > |，系列名与集标题先清洗）：
- 标题内用中文写法「第一集：xxx」，**文件名里冒号换成短横**
- 每集三个文件：「第一集-标题.md」（分镜表）、「第一集-标题.csv」（同表 CSV）、「第一集-标题-提示词.md」（逐镜视频提示词）

**目录结构示例**：
  系列名/
    00-设定集.md
    01-分集大纲.md
    第一集-雾隐镇的来客.md
    第一集-雾隐镇的来客.csv
    第一集-雾隐镇的来客-提示词.md
    第二集-xxx.md / .csv / -提示词.md

**单集分镜文件结构**：
  # 第一集：雾隐镇的来客
  时长 150s｜镜数 30｜覆盖章节 第1-2章
  ## 本集梗概
  ## 场次与分镜（表格：镜号|场次|时长(s)|景别|运镜|机位角度|画面内容|情绪节奏|台词或旁白|音效 SFX|BGM|转场|一致性锚点）
   景别枚举：大远景 / 远景 / 全景 / 中景 / 近景 / 特写 / 大特写
   运镜枚举：定镜 / 推 / 拉 / 摇 / 移 / 跟 / 升降 / 环绕 / 手持 / 甩镜
   机位角度枚举：平视 / 俯拍 / 仰拍 / 过肩 / 主观视角 / 鸟瞰
  ## 本集改编取舍与风险
  CSV 用 UTF-8 BOM 导出（Excel 打开中文不乱码），表头与 Markdown 表格一致。

**提示词文件结构**（逐镜一条）：
  ## SC-001
  - 中文画面：...
  - EN Prompt：镜头运动 → 主体与动作 → 场景环境 → 光线色彩 → 风格画质 → 技术参数
  - Negative：...
  - 首帧 / 尾帧：...（供图生视频与首尾帧模式）
  - 参数：5s / 16:9 / 24fps

## 标准工作流
1. **取材与理解**：读原文或吃透方向；长篇先用 file_grep 列出章节结构，标出关键情节与名场面。
2. **定系列名与分集方案**：确认系列名、单集时长、集数；输出分集方案（每集标题 + 覆盖章节 + 预估时长）再动笔。
3. **建目录与写设定集**（一致性锚点，最关键）：写 00-设定集.md
   - 世界观与美术风格：一句话风格描述 + 参考风格类型 + 主色调
   - 角色卡：姓名 / 年龄 / 外貌（发型、发色、瞳色、体型）/ 服装配色 / 标志性道具 / 性格关键词 —— 这段文本就是**角色锚点**，后面每个镜头提示词原样复用
   - 场景卡：地点 / 时间 / 光线 / 主色调 —— 这段文本就是**场景锚点**
4. **分集大纲**：写 01-分集大纲.md，每集一句话梗概 + 场次列表 + 情绪曲线 + 对应文件名。
5. **逐集产出**（一集一集来，写完立即落盘，不要攒到最后一次性输出）：
   分镜表 md → 同表 CSV（python_exec 导出）→ 该集提示词 md。
   镜号全片连续编号（SC-001 起，跨集不重置）。
6. **汇报**：交付目录绝对路径 + 文件清单 + 统计（集数 / 总场次 / 总镜数 / 总时长 / 单集分布）+ 采用的默认假设 + 需要用户确认的改编取舍。

## 硬约束
- **一致性优先**：角色与场景描述全片严格一致；换装、受伤、时间流逝等状态变化必须显式改写锚点，并在设定集登记。
- **一镜一动作**：禁止一条提示词塞多个镜头动作或多个角色动作，会导致模型生成崩坏。
- 画面内容必须具体到可拍摄：谁、在哪、做什么、什么光线、什么情绪；禁止"气氛很好""很燃"这类空话。
- 台词单独成列，不混进画面描述；音效与 BGM 分别标注。
- 需要参考风格资料或平台最新参数时，委派 pageAgent 联网查：call_agent { agentId: "a_builtin_page_agent", input: "<查什么风格/平台参数，要提取什么>" }。
- 识别用户给的参考图/设定图必须先 image_analyze（你只有路径，看不到画面）。
- 改编受版权保护的作品前，提醒用户确认有改编授权。
- 大任务先用 task_plan/task_step 拆解登记；文件写到当前工作目录下以系列名新建的目录，交付后报告绝对路径。
- **默认直接产出文件**，不在对话里长篇贴分镜表（对话只给摘要 + 路径 + 统计）；用户明确说"先给我看看"时才先在对话里给方案。
- 集数较多时逐集写盘，中途失败也保留已完成的部分；重跑时读已有集数续写，不覆盖已完成的集。`;

// 设计创意助手挂载：视觉分析 + 图片生成/处理 + 文件交付，联网找灵感/生成图委派 pageAgent。
const DESIGN_AGENT_BUILTIN_TOOLS = [
  // 文件读写（交付 HTML/SVG/文案/设计稿说明）
  'file_read', 'file_write', 'file_list',
  // 图片处理与视觉识别（python Pillow 生成/处理；image_analyze 识别截图/素材）
  'python_exec', 'image_analyze',
  // 浏览器核心三件（打开参考站看一眼；多步操作委派 pageAgent）
  'browser_navigate', 'browser_get_page_content',
  // 子智能体（pageAgent 联网找灵感/操作文生图平台）与模型选型（挑图片生成模型）
  'call_agent', 'list_sub_agents', 'list_models',
  // 用户交互与任务规划
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];
/** 设计创意类 skill（设计方法论/AI 绘图提示词/图片处理/PPT/文档交付，与 skill 表种子对齐） */
const DESIGN_AGENT_SKILL_IDS = [
  'skill_design_creation', 'skill_ai_image_prompt', 'skill_image_processing',
  'skill_pptx_creation', 'skill_markdown_doc',
];
const DESIGN_AGENT_SYSTEM_PROMPT = `你是「设计创意助手」（designAgent），一名创意设计伙伴，负责海报/配图/品牌/UI 等视觉方向的方案与产出。

## 标准工作流
1. **理解需求**：用途、受众、投放渠道、风格偏好；信息不足时用 ask_user 问清（一次问全）。
2. **先出方向**：给 2~3 个差异化的创意方向（每个附一句立意说明），让用户确认后再深化，不一稿定死。
3. **细化产出**（按确认的方向）：
   - 视觉描述具体到可执行：配色（给色值）、构图与比例、字体气质、留白、光线、素材建议
   - 文案/命名输出多组候选并做差异化
   - 可落地的交付物用工具产出：SVG/HTML 海报用 file_write 写文件；简单图形/二维码/裁剪缩放用 python_exec（Pillow）
4. **AI 生图**：需要真实图片成品时，先 list_models 看是否有图片生成模型（capabilities 含 image generation），有则委派子智能体用对应模型生成；没有则委派 pageAgent 打开文生图平台操作：call_agent { agentId: "a_builtin_page_agent", input: "<平台 + 完整提示词 + 要执行的操作>" }。
5. **参考与灵感**：委派 pageAgent 检索设计参考站（如 Dribbble/Behance 关键词页），提取风格要点；不要凭空描述"参考某大师风格"。

## 硬约束
- 提示词工程遵循「skill_ai_image_prompt」的结构：主体 + 场景 + 风格 + 构图 + 光线 + 质量词，一次写完整，不要让用户再猜。
- image_analyze 用于识别用户提供的截图/素材内容（截图只有路径，你看不到画面，必须调它）。
- 交付文件后报告路径；HTML/SVG 交付时说明用什么打开预览。
- 同一工具 + 相同参数连续 2 次结果不变 → 停止重试换思路；生成类委派最多重试 2 次。`;
const DATA_AGENT_SYSTEM_PROMPT = `你是「数据查询分析助手」。你通过「本体语义层」对已接入的数据源做只读取数、分析与交付，不直接猜表结构写 SQL。

## 每轮输出格式（强制，先输出再调用）
每次回复必须先写下面三行小结，然后**最多调用一个工具**：
【目标】本轮要达成什么
【上一步】上一个工具返回的要点（首轮写"无"）
【下一步】调用哪个工具、为什么选它
- 禁止不写小结就直接调用工具；禁止一轮同时调用多个工具；禁止调用【下一步】之外的工具。
- 拿到 api_data_query 的 rows 后输出最终答案，不再调用工具。

## 通用取数流程（任何数据问题都走这一条路）
1. 【选本体】调 api_ontology_overview 浏览全部已发布本体（或用 api_ontology_search 带 question 召回）。
   返回里有本体 = 有可用本体：从返回的 code 里挑与用户问题最相关的一个，在【下一步】里说明理由，然后直接进入第 2 步。不要因为"描述不完全匹配"就断定没有可用本体。
2. 【看字段】overview 返回里已含 dimensions/measures 字段名；查"有多少/多少条/多少个"直接用度量 row_count，可跳过本步。拿不准口径时调 api_ontology_brief（字段清单+过滤器名）或 api_ontology_detail（懒加载表达式/聚合/粒度，include 按需）。
3. 【取数】api_data_query { ontology: "<code>", intent: {...} }：
   - measures：度量名 + 聚合（sum / count / count_distinct / avg / min / max），计数用 { name: "row_count" }
   - dimensions：分组/展示的维度名；timeDimension：时间维度名 + 粒度（year/quarter/month/week/day/hour/minute）
   - selections：本体选择列名（一组命名字段展开并入 SELECT）；filters：过滤器名或带比较符的裸 SQL 条件
   - 过滤器的值拿不准 → 先 api_ontology_values 采样真实取值，禁止猜值
   - orderBy / limit：默认 100 行，上限 1000；行数不够用 api_data_paginate 翻页，禁止一次拉全表
4. 【回答】用 markdown 表格呈现关键列，说明口径：本体 code、过滤器、时间范围、行数。需要统计/建模用 python_exec（仅限已拿到 rows 后）；交付文件用 file_write。

## 硬约束
- **工具结果即事实**：api_data_query 返回的 rows 是唯一可信数据源。最终答案里的每一个数字都必须能对应到某次 rows 里的值，对不上就不许写。
- **ontologyCount 不是业务数据**：api_ontology_overview 的 ontologyCount 是「本体（语义视图）的个数」，与任何业务数据的数量无关，严禁当作答案或参与回答。
- **成功结果必须采信**：工具正常返回后禁止以"再验证一次"为由重复同样的调用；怀疑口径就换 intent（换度量/维度/加过滤器）查证，而不是原样重发。拿到 rows 后立即进入回答，不要继续调用工具。
- **必须真正取数才能回答**：走到 api_data_query 拿到 rows 后再作答。没有取到数 = 没有答案，禁止凭常识、记忆或推测编造数字/列表/表格。
- **答案里禁止出现工具结果之外的分布/明细**：如"按状态分布""按模型分布"这类分组，必须真的用对应维度 group 查过 rows 才能写；没查过就一个字都不许编。
- **只能用本体取数链拿数据**：禁止翻源码、列目录、读文件去猜表结构。
- **禁止空参调用与原地打转**：api_ontology_search 必须带 question；同一工具连续 2 次没进展就换流程下一步。
- **不要找子智能体**：你没有子智能体，禁止 list_sub_agents / call_agent。
- **不要用知识库/记忆查库内数据**：api_kb_search / api_memory_search 查不到库内数据。
- **只读取数**：禁止 INSERT / UPDATE / DELETE / DDL；兜底 SQL 有只读护栏。
- **字段只能引用本体已声明的维度/度量/时间维度/过滤器**，报「字段不存在」时按报错里的可用字段改名重试，最多 2 次；连续 2 次取数失败就停下如实说明原因与已尝试的本体 code。
- 结果可能截断：关注 truncated 标记，必要时加过滤器缩小范围或翻页。`;

export const seedAgents: Array<Record<string, unknown>> = [
  {
    id: 'a_default_assistant',
    name: '日常办公助手',
    description: '默认 Harness 智能体，挂载工具/Skill/子智能体后即可使用，大模型自主 ReAct 决策',
    type: 'harness',
    is_default: 1,
    builtin_tool_ids: JSON.stringify(DEFAULT_AGENT_BUILTIN_TOOLS),
    // pageAgent（联网/浏览器） + 数据查询分析助手（库内数据只读取数）
    sub_agent_ids: JSON.stringify(['a_builtin_page_agent', 'a_builtin_data_agent']),
    skill_ids: JSON.stringify(DEFAULT_AGENT_SKILL_IDS),
    system_prompt: DEFAULT_AGENT_SYSTEM_PROMPT,
  },
  {
    id: 'a_builtin_page_agent',
    name: '浏览器操作助手',
    description: '内置 pageAgent：直接操作预览面板中的真实浏览器窗口（BrowserView），执行导航/输入/点击/取内容等任务，操作全程可见',
    type: 'harness',
    builtin_tool_ids: JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS),
    system_prompt: PAGE_AGENT_SYSTEM_PROMPT,
    // 内置 pageAgent 定义由代码收敛，强制覆盖旧库残留（旧版 36 工具全量挂载导致死循环）
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 50 }),
  },
  {
    id: 'a_builtin_data_agent',
    name: '数据查询分析助手',
    description:
      '内置数据智能体：先检索本体语义层（项目库全表自动本体），再按查询意图只读取数、过滤、翻页，可用 python 做统计分析并交付表格/图表文件',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(DATA_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(DATA_AGENT_SKILL_IDS),
    system_prompt: DATA_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词/步数配置以代码为准，强制同步旧库残留
    force_sync: true,
    // 取数是短链路（overview → brief? → query → 回答），16 步足够；
    // 放宽步数只会让跑偏的模型在无关工具上原地打转更久。
    config_json: JSON.stringify({ maxReActSteps: 16 }),
  },
  {
    id: 'a_builtin_ops_agent',
    name: '运维助手',
    description:
      '内置运维助手：在 SSH 服务器连接上执行命令/传文件/管理 Docker 容器，配合「运维」插件的运维控制台使用（对话模式）；危险命令黑名单 + 生产连接二次确认',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(OPS_AGENT_BUILTIN_TOOLS),
    system_prompt: OPS_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    id: 'a_builtin_java_agent',
    name: 'Java 开发助手',
    description:
      '内置 Java 开发助手：项目检测、Maven/Gradle 构建、Spring Boot 分析（Bean/Endpoint/配置）、Java 调试（JDWP）、JUnit 测试、代码格式化、MyBatis Mapper 分析',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(JAVA_AGENT_BUILTIN_TOOLS),
    system_prompt: JAVA_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    id: 'a_builtin_cicd_agent',
    name: '发布助手',
    description:
      '内置发布助手：检测项目类型→创建 CI/CD 流水线→一键打包部署（打包→备份→上传→重启）。支持 JAR 包/散包/Docker/直接运行四种部署模式，复用运维插件的 SSH 连接',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(CICD_AGENT_BUILTIN_TOOLS),
    system_prompt: CICD_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    // 代码编写助手（架构师）：绑定「代码开发」场景（前端场景卡片切换到此智能体）
    // 定位：需求澄清 + 架构把控 + 横切关注点统一设计 + 委派子智能体 + 验收集成，不亲自写业务代码
    id: 'a_builtin_code_agent',
    name: '代码编写助手',
    description:
      '内置编程团队主智能体（架构师）：分析需求、把控项目架构与分层、统一横切能力（认证/日志/异常/校验/响应封装）避免每个接口重复实现，再把实现委派给专属子智能体（代码探索/高级程序/设计/前端）并验收集成',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(CODE_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(CODE_AGENT_SKILL_IDS),
    // 4 个专属子智能体 + pageAgent（官方文档/联网核实）
    sub_agent_ids: JSON.stringify([
      'a_builtin_code_explorer', 'a_builtin_backend_dev',
      'a_builtin_ui_designer', 'a_builtin_frontend_dev',
      'a_builtin_page_agent',
    ]),
    system_prompt: CODE_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 40 }),
  },
  {
    // 动漫脚本分镜助手：小说/创意方向 → 设定集 + 分集大纲 + 分镜表 + 视频大模型镜头提示词
    id: 'a_builtin_storyboard_agent',
    name: '动漫脚本分镜助手',
    description:
      '内置分镜导演：读小说或按内容方向，按单集时长（默认 150 秒）自动分集并映射章节，产出世界观与角色设定（一致性锚点）、分集大纲，逐集落盘为「第一集-标题.md/.csv/-提示词.md」，默认写入以系列名新建的目录；每个镜头附可直接喂视频大模型的提示词（中英双语 + 负面提示词 + 首尾帧）',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(STORYBOARD_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(STORYBOARD_AGENT_SKILL_IDS),
    // pageAgent：查风格参考与视频平台最新参数
    sub_agent_ids: JSON.stringify(['a_builtin_page_agent']),
    system_prompt: STORYBOARD_AGENT_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'main',
    // 分镜链路长（取材 → 设定 → 大纲 → 分镜 → 提示词 → 导出），给足步数
    config_json: JSON.stringify({ maxReActSteps: 50 }),
  },
  {
    // 设计创意助手：绑定「设计创意」场景（前端场景卡片切换到此智能体）
    id: 'a_builtin_design_agent',
    name: '设计创意助手',
    description:
      '内置创意设计伙伴：海报/配图/品牌/UI 方向提案与产出，图片生成/处理（python + 委派生成模型或 pageAgent 操作文生图平台），交付 SVG/HTML/文案文件',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(DESIGN_AGENT_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(DESIGN_AGENT_SKILL_IDS),
    sub_agent_ids: JSON.stringify(['a_builtin_page_agent']),
    system_prompt: DESIGN_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    // 代码探索助手：代码编写助手的专属只读探索子智能体（对标 CodeBuddy codebase-explorer）
    id: 'a_builtin_code_explorer',
    name: '代码探索助手',
    description:
      '内置只读代码考古助手：探索项目架构、代码文件与关键调用链，定位可复用基建（认证/日志/异常/响应封装在哪），产出带 文件:行号 的结构化探索报告与改动影响面；由代码编写助手委派，不可写不可执行',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(CODE_EXPLORER_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(CODE_EXPLORER_SKILL_IDS),
    system_prompt: CODE_EXPLORER_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    // sub：仅作为子智能体被代码编写助手引用委派，不在会话的智能体选择器中出现
    agent_kind: 'sub',
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    // 高级程序助手：代码编写助手的专属子智能体，接口设计 + 后端/服务端代码编写
    id: 'a_builtin_backend_dev',
    name: '高级程序助手',
    description:
      '内置后端主程子智能体：接口契约设计（URL/DTO/错误码/校验/幂等）+ 后端代码编写与自测，遵循项目现成分层与横切基建，禁止每个接口重复写认证/日志；由代码编写助手委派',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(BACKEND_DEV_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(BACKEND_DEV_SKILL_IDS),
    system_prompt: BACKEND_DEV_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'sub',
    config_json: JSON.stringify({ maxReActSteps: 40 }),
  },
  {
    // 设计助手：代码编写助手的专属子智能体，页面设计规格（不写业务代码）
    id: 'a_builtin_ui_designer',
    name: '设计助手',
    description:
      '内置产品设计子智能体：产出前端可直接照做的页面设计规格（信息架构/布局与响应式/组件树/交互态/设计令牌 HEX/文案/验收清单）；由代码编写助手委派',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(UI_DESIGNER_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(UI_DESIGNER_SKILL_IDS),
    system_prompt: UI_DESIGNER_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'sub',
    config_json: JSON.stringify({ maxReActSteps: 30 }),
  },
  {
    // 前端助手：代码编写助手的专属子智能体，按设计规格编写前端页面
    id: 'a_builtin_frontend_dev',
    name: '前端助手',
    description:
      '内置前端工程子智能体：按设计规格编写页面代码（组件拆分/状态管理/样式与响应式/交互态齐全），复用项目既有组件与设计令牌，跑构建与类型检查自测；由代码编写助手委派',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(FRONTEND_DEV_BUILTIN_TOOLS),
    skill_ids: JSON.stringify(FRONTEND_DEV_SKILL_IDS),
    system_prompt: FRONTEND_DEV_SYSTEM_PROMPT,
    force_sync: true,
    agent_kind: 'sub',
    config_json: JSON.stringify({ maxReActSteps: 40 }),
  },
];
for (const a of seedAgents) {
  try {
    const has = db.prepare('SELECT id FROM agent WHERE id = ?').get(a.id as string);
    if (has) {
      // 已存在：普通种子仅补空（避免覆盖用户后续编辑）；
      // force_sync（内置 pageAgent/dataAgent）：工具/提示词/步数配置以代码为准强制同步。
      // 受 BUILTIN_OVERWRITE_MODE 控制：mode='never' 时彻底不覆盖用户改动。
      if (a.force_sync && overwriteEnabled) {
        db.prepare(
          'UPDATE agent SET is_public = 1, is_builtin = ?, user_id = COALESCE(user_id, ?), name = ?, builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, type = ?, system_prompt = ?, config_json = ?, agent_kind = ? WHERE id = ?'
        ).run(a.is_builtin || 0, 'guest', a.name as string, a.builtin_tool_ids as string, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.type as string, a.system_prompt as string, (a.config_json as string) || null, (a.agent_kind as string) || 'main', a.id as string);
      } else {
        db.prepare(
          'UPDATE agent SET is_public = 1, user_id = COALESCE(user_id, ?), builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, type = ?, system_prompt = COALESCE(system_prompt, ?) WHERE id = ?'
        ).run('guest', a.builtin_tool_ids as string, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.type as string, a.system_prompt as string, a.id as string);
      }
    } else {
      db.prepare(
        'INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, skill_ids, is_default, is_public, is_builtin, version, config_json, agent_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, ?)',
      ).run(a.id, 'guest', a.name, a.description, a.system_prompt as string, a.type, a.builtin_tool_ids, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.is_default || 0, a.is_builtin || 0, (a.config_json as string) || null, (a.agent_kind as string) || 'main', Date.now(), Date.now());
    }
  } catch {}
}

// 内置智能体统一改名（AI 助手 → 日常办公助手；XX专家/XX智能体 → XX助手）：
// 默认助手无 force_sync，仅当旧库仍为旧名称时才改名（不覆盖用户自定义名称）。
try {
  db.prepare("UPDATE agent SET name = '日常办公助手' WHERE id = 'a_default_assistant' AND name IN ('AI 助手', 'AI助手')").run();
} catch {}

// 旧库增量迁移：默认助手提示词升级（联网查询改由 pageAgent 承担）。
// server 端普通种子对 system_prompt 仅 COALESCE 补空（避免覆盖用户编辑），旧库拿不到新指引；
// 此处按标记增量追加，与前端 agent.ts 的 v9 迁移语义一致。
try {
  const MARKER = '【联网查询 · 委派 pageAgent】';
  const defRow = db.prepare("SELECT system_prompt FROM agent WHERE id = 'a_default_assistant'").get() as { system_prompt?: string | null } | undefined;
  if (defRow && !(defRow.system_prompt || '').includes(MARKER)) {
    const next = (defRow.system_prompt || DEFAULT_AGENT_SYSTEM_PROMPT) + '\n\n' + WEB_QUERY_PROMPT_BLOCK;
    db.prepare("UPDATE agent SET system_prompt = ? WHERE id = 'a_default_assistant'").run(next);
  }
} catch {}

// 旧库增量迁移：默认助手挂载「数据查询分析助手」子智能体 + 追加委派指引（同上，按标记增量）。
// 子智能体关系：仅补齐缺失项，不覆盖用户后续自己增删的子智能体。
try {
  const DATA_AGENT_ID = 'a_builtin_data_agent';
  const MARKER = '【数据查询 · 委派 dataAgent】';
  const row = db
    .prepare("SELECT system_prompt, sub_agent_ids FROM agent WHERE id = 'a_default_assistant'")
    .get() as { system_prompt?: string | null; sub_agent_ids?: string | null } | undefined;
  if (row) {
    let ids: string[] = [];
    try { ids = JSON.parse(row.sub_agent_ids || '[]'); } catch { ids = []; }
    if (Array.isArray(ids) && !ids.includes(DATA_AGENT_ID)) {
      db.prepare("UPDATE agent SET sub_agent_ids = ? WHERE id = 'a_default_assistant'").run(
        JSON.stringify([...ids, DATA_AGENT_ID]),
      );
    }
    if (!(row.system_prompt || '').includes(MARKER)) {
      const next = (row.system_prompt || DEFAULT_AGENT_SYSTEM_PROMPT) + '\n\n' + DATA_QUERY_PROMPT_BLOCK;
      db.prepare("UPDATE agent SET system_prompt = ? WHERE id = 'a_default_assistant'").run(next);
    }
  }
} catch {}

// 旧库增量迁移：电脑使用约束升级（截屏→image_analyze 视觉闭环 + 用户明确指定内容的发送直接执行）。
// 按旧约束原句定位替换（仅默认助手带该约束块），已升级过的库不含旧句则跳过。
try {
  const OLD_LINE =
    '- 每一步操作后用 computer_screenshot 观察结果再决定下一步；涉及删除文件、提交表单、发送消息等不可逆操作前，必须先向用户确认。';
  const NEW_LINES = [
    '- 截屏只返回文件路径，你看不到画面：需要识别屏幕内容或定位界面元素（聊天窗口、输入框、按钮等）时，立即调用 image_analyze(path=截屏返回的路径, prompt=描述要找的元素及位置) 完成视觉识别，再按识别出的位置操作；每步操作后重新截屏+识别，观察结果再决定下一步。',
    '- 用户明确要求执行的操作（如在本机应用中发送用户指定的消息内容、填写用户提供的表单等），用户的指令本身就是授权，直接执行；只有用户未指定内容的发送、删除文件、支付、群发等高危不可逆操作才需先向用户确认。不要以"没有工具/无法控制应用"为由拒绝可完成的操作。',
  ].join('\n');
  const row = db.prepare("SELECT system_prompt FROM agent WHERE id = 'a_default_assistant'").get() as { system_prompt?: string | null } | undefined;
  if (row?.system_prompt && row.system_prompt.includes(OLD_LINE)) {
    db.prepare("UPDATE agent SET system_prompt = ? WHERE id = 'a_default_assistant'").run(row.system_prompt.replace(OLD_LINE, NEW_LINES));
  }
} catch {}

// 预置示例自定义工具（JS + node:vm 沙箱）——开箱即用的演示/实用工具
// 幂等：按 name 查重，已存在不覆盖（用户可能已编辑）
const seedCustomTools: Array<{
  name: string; description: string; inputSchema: Record<string, unknown>;
  entry: string; code: string;
}> = [
  {
    name: 'text_stats',
    description: '【示例】文本统计：返回字符数、词数、行数、非空白字符数。入参 { text: string }。',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: '要统计的文本' } }, required: ['text'] },
    entry: 'textStats',
    code: `function textStats(input) {
  var text = String(input && input.text || '');
  var words = text.split(/\\s+/).filter(function (w) { return w.length > 0; });
  var lines = text.split(/\\r?\\n/);
  var nonBlank = text.replace(/\\s/g, '');
  return { chars: text.length, words: words.length, lines: lines.length, nonBlankChars: nonBlank.length };
}`,
  },
  {
    name: 'json_extract',
    description: '【示例】JSON 提取：按点号路径从 JSON 对象取值，如 path="a.b.0.c"。取不到返回 null。',
    inputSchema: {
      type: 'object',
      properties: { data: { type: 'object', description: 'JSON 对象' }, path: { type: 'string', description: '点号路径，如 "user.tags.0"' } },
      required: ['data', 'path'],
    },
    entry: 'jsonExtract',
    code: `function jsonExtract(input) {
  var cur = input && input.data;
  var parts = String(input && input.path || '').split('.').filter(function (p) { return p.length > 0; });
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return null;
    cur = cur[parts[i]];
  }
  return cur === undefined ? null : cur;
}`,
  },
  {
    name: 'timestamp_convert',
    description: '【示例】时间戳⇄日期互转：传 timestamp（毫秒）返回日期字符串；传 dateStr（如 2026-09-05 20:00:00）返回毫秒时间戳。二者传一。',
    inputSchema: {
      type: 'object',
      properties: {
        timestamp: { type: 'number', description: '毫秒时间戳（与 dateStr 二选一）' },
        dateStr: { type: 'string', description: '日期字符串，如 "2026-09-05 20:00:00"' },
      },
    },
    entry: 'timestampConvert',
    code: `function timestampConvert(input) {
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmt(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
      + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  if (input && input.timestamp !== undefined && input.timestamp !== null && input.timestamp !== '') {
    var ms = Number(input.timestamp);
    if (isNaN(ms)) return { error: 'timestamp 不是有效数字' };
    return { date: fmt(new Date(ms)), timestamp: ms };
  }
  if (input && input.dateStr) {
    var s = String(input.dateStr).replace(/-/g, '/').replace('T', ' ');
    var t = new Date(s).getTime();
    if (isNaN(t)) return { error: '无法解析日期字符串: ' + input.dateStr };
    return { date: fmt(new Date(t)), timestamp: t };
  }
  return { error: '需提供 timestamp 或 dateStr 之一' };
}`,
  },
  {
    name: 'regex_test',
    description: '【示例】正则测试：返回 pattern 对 text 的全部匹配（含捕获组与位置），最多 50 条。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式（不含定界符）' },
        flags: { type: 'string', description: '正则标志，默认 "g"' },
        text: { type: 'string', description: '被测文本' },
      },
      required: ['pattern', 'text'],
    },
    entry: 'regexTest',
    code: `function regexTest(input) {
  var pattern = String(input && input.pattern || '');
  var flags = String((input && input.flags) || 'g');
  if (flags.indexOf('g') === -1) flags += 'g';
  var text = String((input && input.text) || '');
  var re;
  try { re = new RegExp(pattern, flags); } catch (e) { return { error: '正则无效: ' + e.message }; }
  var out = [], m;
  while ((m = re.exec(text)) !== null) {
    out.push({ match: m[0], index: m.index, groups: m.slice(1) });
    if (out.length >= 50) break;
    if (m[0].length === 0) re.lastIndex++;
  }
  return { count: out.length, matches: out };
}`,
  },
  {
    name: 'unit_convert',
    description: '【示例】单位换算：长度（m/km/ft/mi）、重量（kg/g/lb）、温度（C/F/K）。入参 { value, from, to }，如 { value: 100, from: "km", to: "mi" }。',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: '数值' },
        from: { type: 'string', description: '源单位' },
        to: { type: 'string', description: '目标单位' },
      },
      required: ['value', 'from', 'to'],
    },
    entry: 'unitConvert',
    code: `function unitConvert(input) {
  var v = Number(input && input.value);
  var from = String((input && input.from) || '').toLowerCase();
  var to = String((input && input.to) || '').toLowerCase();
  if (isNaN(v)) return { error: 'value 不是有效数字' };
  var toBase = {
    m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, mi: 1609.344, inch: 0.0254,
  };
  var weightBase = { kg: 1, g: 0.001, mg: 0.000001, t: 1000, lb: 0.45359237, oz: 0.028349523 };
  var temps = { c: 1, f: 1, k: 1 };
  function toC(x, u) {
    if (u === 'c') return x;
    if (u === 'f') return (x - 32) * 5 / 9;
    if (u === 'k') return x - 273.15;
    return NaN;
  }
  function fromC(x, u) {
    if (u === 'c') return x;
    if (u === 'f') return x * 9 / 5 + 32;
    if (u === 'k') return x + 273.15;
    return NaN;
  }
  var result;
  if (toBase[from] !== undefined && toBase[to] !== undefined) {
    result = v * toBase[from] / toBase[to];
  } else if (weightBase[from] !== undefined && weightBase[to] !== undefined) {
    result = v * weightBase[from] / weightBase[to];
  } else if (temps[from] !== undefined && temps[to] !== undefined) {
    result = fromC(toC(v, from), to);
  } else {
    return { error: '不支持的单位组合: ' + from + ' -> ' + to };
  }
  return { value: v, from: from, to: to, result: Math.round(result * 1e6) / 1e6 };
}`,
  },
];
for (const t of seedCustomTools) {
  try {
    const has = db.prepare('SELECT id FROM custom_tool WHERE name = ?').get(t.name);
    if (has) continue;
    const id = 'ct_preset_' + t.name;
    const now = Date.now();
    // 注意：列顺序与 .run() 实参必须严格一一对应（code 位此前误写成 NULL，
    // 导致 ? 只有 10 个而实参有 11 个 → better-sqlite3 抛参数过多，被 catch 吞掉，5 条预置工具一条都没插进去）。
    db.prepare(
      `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
       runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, is_public, installs, updated_at, created_at)
       VALUES (?,?,?,?,?,NULL,'node',?,?,?,?,NULL,1,'local',0,0,?,?)`,
    ).run(id, 'guest', t.name, t.description, JSON.stringify(t.inputSchema), t.entry, t.code, JSON.stringify([]), 5000, now, now);
  } catch (e: unknown) {
    console.error('[db] seedCustomTools 插入失败:', t.name, e instanceof Error ? e.message : e);
  }
}

// 预置内置 skill：网站自动化任务（web-task-automation）—— pageAgent + 记住密码 + 定时任务
try {
  const skillId = 'skill_web_task_automation';
  const hasSkill = db.prepare('SELECT id FROM skill WHERE id = ?').get(skillId);
  if (!hasSkill) {
    db.prepare(
      'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      skillId, 'guest', '网站自动化任务',
      '用 pageAgent 驱动浏览器完成登录、签到、领积分、填表单、搜索、翻页、提交、制作内容等网站自动化任务，支持用已存密码自动登录，可配合定时任务每日执行。',
      JSON.stringify(['每日签到', '自动登录', '领取积分', '制作视频', '填写表单', '网站自动化']),
      `# 网站自动化任务\n\n用内置 pageAgent 驱动真实浏览器（预览面板）完成网站操作任务。pageAgent 仅挂载六件套工具：browser_navigate / browser_type / browser_click / browser_scroll / browser_get_page_content / ask_user，其余浏览器工具（get_dom/fill_form/search/翻页等）不可用。配合「定时任务」可每日自动执行。\n\n## 流程\n1. 委派 pageAgent：call_agent { agentId: "a_builtin_page_agent", input: "<任务描述：目标站点 + 要执行的操作/要提取的信息>" }\n   - browser_navigate 打开目标站点\n   - browser_get_page_content 获取页面正文 + 带编号（index）可交互元素列表\n   - 需要登录时 pageAgent 会 ask_user 请用户在浏览器面板完成（扫码/验证码），确认后复核\n   - 用 index 定位：browser_type 输入 / browser_click 点击，browser_scroll 翻看视口外内容\n   - browser_get_page_content 提取最终结果并返回摘要\n2. 周期任务：创建 scheduled_task（cron + prompt + 绑定默认助理）\n\n## 示例\n- 每日签到：browser_navigate → browser_get_page_content 找签到入口 → browser_click → browser_get_page_content 确认积分\n- 搜索并提取结果：browser_navigate 搜索页 → browser_type 关键词回车 → browser_get_page_content + browser_scroll 提取结果列表\n\n详见 .claude/skills/web-task-automation/SKILL.md`,
      '自动化', 'yan-zhi', 1, 0, 'builtin', Date.now(),
    );
  } else {
    // 内置 skill 属产品定义：文档与工具收口（六件套）保持同步，覆盖旧版残留。
    // 受 BUILTIN_OVERWRITE_MODE 控制：mode='never' 时只标记内置来源，不覆盖用户改动的 body/描述/触发词。
    if (overwriteEnabled) {
      db.prepare("UPDATE skill SET body = ?, description = ?, triggers_json = ?, source = 'builtin' WHERE id = ?").run(
        `# 网站自动化任务\n\n用内置 pageAgent 驱动真实浏览器（预览面板）完成网站操作任务。pageAgent 仅挂载六件套工具：browser_navigate / browser_type / browser_click / browser_scroll / browser_get_page_content / ask_user，其余浏览器工具（get_dom/fill_form/search/翻页等）不可用。配合「定时任务」可每日自动执行。\n\n## 流程\n1. 委派 pageAgent：call_agent { agentId: "a_builtin_page_agent", input: "<任务描述：目标站点 + 要执行的操作/要提取的信息>" }\n   - browser_navigate 打开目标站点\n   - browser_get_page_content 获取页面正文 + 带编号（index）可交互元素列表\n   - 需要登录时 pageAgent 会 ask_user 请用户在浏览器面板完成（扫码/验证码），确认后复核\n   - 用 index 定位：browser_type 输入 / browser_click 点击，browser_scroll 翻看视口外内容\n   - browser_get_page_content 提取最终结果并返回摘要\n2. 周期任务：创建 scheduled_task（cron + prompt + 绑定默认助理）\n\n## 示例\n- 每日签到：browser_navigate → browser_get_page_content 找签到入口 → browser_click → browser_get_page_content 确认积分\n- 搜索并提取结果：browser_navigate 搜索页 → browser_type 关键词回车 → browser_get_page_content + browser_scroll 提取结果列表\n\n详见 .claude/skills/web-task-automation/SKILL.md`,
        '用 pageAgent 驱动浏览器完成登录、签到、领积分、搜索、提取内容等网站自动化任务，可配合定时任务每日执行。',
        JSON.stringify(['每日签到', '自动登录', '领取积分', '网站自动化']),
        skillId,
      );
    } else {
      db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?").run(skillId);
    }
  }
} catch {}

// 预置内置 skill：即梦每日签到（jimeng-daily-checkin）—— 即梦 Dreamina 每天签到领灵感值
try {
  const skillId = 'skill_jimeng_daily_checkin';
  const hasSkill = db.prepare('SELECT id FROM skill WHERE id = ?').get(skillId);
  if (!hasSkill) {
    db.prepare(
      'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      skillId, 'guest', '即梦每日签到',
      '每天自动登录即梦（Dreamina，字节跳动 AI 创作平台）并签到领取灵感值/积分。即梦用抖音扫码登录，首次需手动扫码，之后配合定时任务每日自动签到。',
      JSON.stringify(['即梦签到', '即梦每天签到', '即梦领积分', '即梦灵感值', 'Dreamina签到', '每日签到']),
      `# 即梦每日签到领灵感值\n\n自动登录即梦（jimeng.jianying.com）完成每日签到，领取灵感值/积分。配合定时任务可每日自动执行。\n\n## ⚠️ 业务约束（随委派 input 传给 pageAgent）\n- 目标站固定 https://jimeng.jianying.com/，禁止访问 dreamina.ai 等国际版。\n- 登录只走扫码（pageAgent 会 ask_user），禁止代填手机号/验证码。\n- 登录态由 persist:browser-view partition 持久化，首次扫码后复用。\n- 已知稳定选择器：即梦"领积分"入口 #SiderMenuCredit。\n\n## 委派流程\n1. call_agent { agentId: "a_builtin_page_agent", input: "打开 https://jimeng.jianying.com/ 并检查登录状态（有头像=已登录）；未登录则 ask_user 提示用户在浏览器面板扫码登录，用户确认后用 browser_get_page_content 复核；进入'领积分'入口（#SiderMenuCredit），找到'签到/打卡/领灵感'按钮点击签到，用 browser_get_page_content 确认结果并返回摘要。目标站固定 jimeng.jianying.com，禁止访问国际版，禁止代填验证码。" }\n2. 周期任务：scheduled_task cron "0 9 * * *" + prompt "登录即梦签到领灵感值"\n\n详见 .claude/skills/jimeng-daily-checkin/SKILL.md`,
      '自动化', 'yan-zhi', 1, 0, 'builtin', Date.now(),
    );
  } else {
    // 内置 skill 属产品定义：pageAgent 收口六件套后，登录/操作指引随委派 input 下发，覆盖旧版残留。
    // 受 BUILTIN_OVERWRITE_MODE 控制：mode='never' 时只标记内置来源，不覆盖用户改动。
    if (overwriteEnabled) {
      db.prepare("UPDATE skill SET body = ?, description = ?, source = 'builtin' WHERE id = ?").run(
        `# 即梦每日签到领灵感值\n\n自动登录即梦（jimeng.jianying.com）完成每日签到，领取灵感值/积分。配合定时任务可每日自动执行。\n\n## ⚠️ 业务约束（随委派 input 传给 pageAgent）\n- 目标站固定 https://jimeng.jianying.com/，禁止访问 dreamina.ai 等国际版。\n- 登录只走扫码（pageAgent 会 ask_user），禁止代填手机号/验证码。\n- 登录态由 persist:browser-view partition 持久化，首次扫码后复用。\n- 已知稳定选择器：即梦"领积分"入口 #SiderMenuCredit。\n\n## 委派流程\n1. call_agent { agentId: "a_builtin_page_agent", input: "打开 https://jimeng.jianying.com/ 并检查登录状态（有头像=已登录）；未登录则 ask_user 提示用户在浏览器面板扫码登录，用户确认后用 browser_get_page_content 复核；进入'领积分'入口（#SiderMenuCredit），找到'签到/打卡/领灵感'按钮点击签到，用 browser_get_page_content 确认结果并返回摘要。目标站固定 jimeng.jianying.com，禁止访问国际版，禁止代填验证码。" }\n2. 周期任务：scheduled_task cron "0 9 * * *" + prompt "登录即梦签到领灵感值"\n\n详见 .claude/skills/jimeng-daily-checkin/SKILL.md`,
        '每天自动登录即梦（Dreamina，字节跳动 AI 创作平台）并签到领取灵感值/积分。即梦用抖音扫码登录，首次需手动扫码，之后配合定时任务每日自动签到。',
        skillId,
      );
    } else {
      db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?").run(skillId);
    }
  }
} catch {}

// 预置内置 skill：本体取数与分析 —— 数据查询分析助理的「教材」：解释本体工具链/YAML 含义/SQL 生成/脚本桥接
const ONTOLOGY_QUERY_DESC = '解释本体（语义层）工具链与 YAML 字段含义，指导按「总览→简略→详情→采值→取数」标准流程查询数据，含 SQL 生成规范与 js_exec 脚本桥接（dataQuery）用法。';
const ONTOLOGY_QUERY_BODY = `# 本体取数与分析指南

本 skill 是「数据查询分析助手」的操作教材：解释本体工具的作用、本体 YAML 各字段含义，以及如何生成 SQL / 脚本取数。

## 一、本体是什么（YAML 字段含义）
一个「本体」= 把一段查询 SQL 包装成有业务语义的对象，大模型只看语义不看物理实现：
- **code**：唯一标识（小写下划线），所有查询工具都用它引用本体
- **name / description / domain**：名称、业务口径描述、所属域——选本体的依据
- **synonyms**：同义词，用于语义检索命中
- **dimensions（维度）**：离散的分组/展示列，如 user_id、category、status
- **measures（度量）**：可聚合的数值列，自带聚合方式（sum/count/avg/min/max）
- **timeDimensions（时间维度）**：时间列，可按 year/quarter/month/week/day/hour/minute 粒度截断
- **filters（过滤器）**：预定义的 WHERE 条件，按名字引用（如「近30天」）；**policies（行级策略）**是强制注入的条件，无需也不可取消
- **selections（选择列）**：命名的一组查询字段 = { 名称, 描述（即召回关键字）, 字段列表 }；intent.selections 按名称引用，展开为该组字段进 SELECT
- **refAttr（标准属性）**：字段挂载的企业级统一口径（类型/单位/枚举）；带枚举的标准属性是过滤取值的权威来源
- **relations（关联关系）**：本体之间的连接（1:1/1:N/N:1/N:N）
- **source_sql（物理 SQL）**：只读的底层实现，大模型无需读取；字段表达式（expr）必须引用它的输出别名

## 二、工具链（严格按序使用）
1. **api_ontology_overview**：列出全部已发布本体（code/名称/描述/数据源 id·名称·类型）——第一站
2. **api_ontology_search**：按自然语言问题召回最相关本体（含语义摘要）；问题明确可替代 overview
3. **api_ontology_brief**：单本体的字段名清单 + 过滤器名 + 选择列契约 + 所属数据源
4. **api_ontology_detail**：懒加载完整定义（字段表达式/聚合/粒度/过滤器条件全文/行级策略），include 选择性加载
5. **api_ontology_values**：对字段采样取值/枚举（优先标准属性枚举 → 缓存样本 → DISTINCT 采样）；**填过滤器的值前必须调用**
6. **api_data_query**：取数（见下）
7. **api_data_paginate**：翻页（offset/limit，单页 ≤200）

## 三、api_data_query 的两种用法
**① 本体模式（推荐）**——语义层编译，字段受本体约束：
\`\`\`json
{ "ontology": "conversation", "intent": { "dimensions": ["user_id"], "measures": [{"name":"pinned_sum","agg":"sum"}], "filters": ["近30天"], "limit": 100 } }
\`\`\`
**② SQL 执行模式**——就是通用 SQL 执行工具：输入数据源 id + SQL，返回二维表 \`{ columns, rows, rowCount, truncated }\`：
\`\`\`json
{ "datasourceId": "ds_project_guest", "sql": "SELECT status AS status, COUNT(*) AS cnt FROM conversation GROUP BY status" }
\`\`\`
SQL 要求：单条只读 SELECT（DDL/写语句被护栏拦截）；输出列尽量带 AS 别名；能找到本体时优先用本体模式。

## 四、js_exec 脚本桥接（多步处理数据）
服务端已在 js_exec 沙箱注入异步函数 \`dataQuery({ sql, datasourceId?, limit? })\`（只读，返回同上二维表），可在脚本里多次调用做聚合/关联/格式化后一次返回：
\`\`\`js
const a = await dataQuery({ sql: "SELECT agent_id AS agent_id, COUNT(*) AS cnt FROM conversation GROUP BY agent_id" });
const top = a.rows.sort((x, y) => y.cnt - x.cnt).slice(0, 5);
return { top: top, total: a.rowCount };
\`\`\`
适用：需要多步查询、中间聚合、和 python 一样的数据处理流程；仍是只读，写语句会被拦截。

## 五、硬约束
- 只读；禁止 INSERT/UPDATE/DELETE/DDL
- 字段只能来自本体声明（或 SQL 模式下确认存在的列）；报「字段不存在」按提示改名重试，最多 2 次
- 过滤器的值先 api_ontology_values 采样，禁止编造取值
- 结果注明口径：本体 code + 过滤器 + 时间范围 + 行数`;

try {
  const skillId = 'skill_ontology_query';
  const hasSkill = db.prepare('SELECT id FROM skill WHERE id = ?').get(skillId);
  if (!hasSkill) {
    db.prepare(
      'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      skillId, 'guest', '本体取数与分析',
      ONTOLOGY_QUERY_DESC,
      JSON.stringify(['本体', '本体查询', '数据查询', '查库', 'YAML含义', '怎么查数据', 'text2sql']),
      ONTOLOGY_QUERY_BODY,
      '数据分析', 'yan-zhi', 1, 0, 'builtin', Date.now(),
    );
  } else {
    // 内置 skill 属产品定义：文档随工具链演进，覆盖旧版残留。mode='never' 时只标记来源不覆盖。
    if (overwriteEnabled) {
      db.prepare("UPDATE skill SET body = ?, description = ?, category = '数据分析', source = 'builtin' WHERE id = ?").run(
        ONTOLOGY_QUERY_BODY, ONTOLOGY_QUERY_DESC, skillId,
      );
    } else {
      db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?").run(skillId);
    }
  }
} catch {}

// 预置内置 skill：文档处理 / 代码安全 / 清华 AIR 开源（批量 upsert）
// 提升为模块级常量：seed 循环与「恢复默认」reset 接口共用同一份默认定义（数据单一来源）。
export const builtinSkillDefaults: Array<{ id: string; name: string; category: string; description: string; triggers: string[]; body: string }> = [
  {
    id: 'skill_pptx_creation', name: 'PPT 制作', category: '文档处理',
    description: '创建、编辑、解析 PowerPoint 演示文稿（.pptx）。通过 python-pptx 生成专业幻灯片，支持自定义布局、图表、图片、表格、演讲者备注。',
    triggers: ['做PPT', '制作幻灯片', '生成演示文稿', '解析PPT', 'PPT制作', 'presentation'],
    body: `# PPT 制作与编辑\n\n用 python-pptx 创建、编辑、解析 PowerPoint 演示文稿，通过 shell 执行 Python 脚本生成 .pptx。\n\n## 依赖\n\`\`\`bash\npip install python-pptx Pillow\n\`\`\`\n\n## 流程\n1. 理解需求：主题、页数、每页内容、风格\n2. 编写 python-pptx 脚本（标题页 + 内容页 + 图表/图片）\n3. shell 执行脚本生成 .pptx\n4. 回报文件路径\n\n## 设计要点\n- 配色与主题相关，深色背景配浅色文字\n- 每页有视觉元素（图片/图表/色块），避免纯文字\n- 标题 36-44pt，正文 14-16pt\n- 坐标用 Inches()，颜色用 RGBColor(r,g,b)\n\n详见 .claude/skills/pptx-creation/SKILL.md`,
  },
    {
      id: 'skill_docx_processing', name: 'Word 文档处理', category: '文档处理',
      description: '创建、编辑、解析 Word 文档（.docx）。通过 python-docx 生成带格式文档，支持标题、目录、表格、图片、页眉页脚、样式。',
      triggers: ['写Word文档', '生成报告', '制作合同', '编辑docx', '提取Word内容', 'Word文档'],
      body: `# Word 文档处理\n\n用 python-docx 创建、编辑、解析 Word 文档，通过 shell 执行 Python 脚本生成 .docx。\n\n## 依赖\n\`\`\`bash\npip install python-docx\n\`\`\`\n\n## 流程\n1. 理解需求：文档类型（报告/合同/信函）、结构、内容\n2. 编写 python-docx 脚本（标题 + 段落 + 表格 + 图片）\n3. shell 执行生成 .docx\n4. 回报文件路径\n\n## 要点\n- 不要用 \\n 换行，用多个 add_paragraph\n- 表格用 style='Table Grid' 才有边框\n- 图片需指定 width\n\n详见 .claude/skills/docx-processing/SKILL.md`,
    },
    {
      id: 'skill_xlsx_data_processing', name: 'Excel/数据处理', category: '文档处理',
      description: '处理 Excel/CSV 电子表格数据。通过 pandas + openpyxl 读写数据、计算公式、格式化、图表，支持数据清洗、聚合、透视、多表合并。',
      triggers: ['处理Excel', '分析表格数据', '清洗数据', '生成报表', '合并CSV', '数据处理'],
      body: `# Excel/数据处理\n\n用 pandas + openpyxl 处理 Excel/CSV 数据，通过 shell 执行 Python 脚本。\n\n## 依赖\n\`\`\`bash\npip install pandas openpyxl xlsxwriter\n\`\`\`\n\n## 流程\n1. 读取数据（read_excel/read_csv）\n2. 数据清洗（去重/填充空值/类型转换）\n3. 聚合分析（groupby/pivot_table/筛选/排序）\n4. 写入输出（to_excel + openpyxl 格式化）\n5. 回报行数列数 + 输出路径\n\n## 要点\n- CSV 中文用 encoding="utf-8-sig"\n- 公式以 = 开头写入单元格\n\n详见 .claude/skills/xlsx-data-processing/SKILL.md`,
    },
    {
      id: 'skill_pdf_processing', name: 'PDF 处理', category: '文档处理',
      description: '处理 PDF 文件：提取文本表格、合并/拆分、旋转/水印、创建新 PDF、OCR 扫描件、加密解密。通过 pypdf + pdfplumber + reportlab 处理。',
      triggers: ['提取PDF', '合并PDF', '拆分PDF', 'PDF加水印', 'PDF处理', '创建PDF'],
      body: `# PDF 处理\n\n用 pypdf + pdfplumber + reportlab 处理 PDF，通过 shell 执行 Python 脚本。\n\n## 依赖\n\`\`\`bash\npip install pypdf pdfplumber reportlab\n# OCR 可选：pip install pytesseract pdf2image\n\`\`\`\n\n## 能力\n- 提取文本/表格：pdfplumber\n- 合并/拆分/旋转/水印/加密：pypdf\n- 创建新 PDF：reportlab\n- OCR 扫描件：pytesseract（需 tesseract + chi_sim）\n\n详见 .claude/skills/pdf-processing/SKILL.md`,
    },
    {
      id: 'skill_code_security_audit', name: '代码安全审计', category: '代码工程',
      description: '代码安全审计与漏洞扫描。检查 SQL 注入、XSS、硬编码密钥、路径遍历、命令注入、不安全反序列化等常见漏洞，支持多语言，结合 semgrep/bandit 工具扫描 + 人工审查清单。',
      triggers: ['安全审计', '漏洞扫描', '代码安全检查', '安全审查', '代码安全'],
      body: `# 代码安全审计\n\n对代码进行安全审计，检查 OWASP Top 10 常见漏洞。结合静态分析工具 + 人工审查清单。\n\n## 工具\n- semgrep（多语言通用）：semgrep --config auto ./src\n- bandit（Python）：bandit -r ./src\n- eslint-plugin-security（JS/TS）\n- 依赖审计：npm audit / pip-audit\n\n## 检查清单\n1. SQL 注入（参数化查询？）\n2. XSS（innerHTML 转义？）\n3. 硬编码密钥（环境变量？）\n4. 路径遍历（路径校验？）\n5. 命令注入（shell=True？）\n6. 不安全反序列化（pickle/eval？）\n7. 认证授权（接口鉴权？）\n8. 传输安全（HTTPS？）\n\n## 输出\n按严重/高危/中危/低危分类，每项给修复建议和代码示例。\n\n详见 .claude/skills/code-security-audit/SKILL.md`,
    },
    {
      id: 'skill_codegeex_chatglm', name: '对接清华开源大模型', category: '平台配置',
      description: '对接清华开源大模型（CodeGeeX 代码生成 / ChatGLM 对话 / 智谱 GLM 系列）。指导在平台管理中添加智谱 AI 的 OpenAI 兼容 API，配置模型并测试连通性。',
      triggers: ['配置CodeGeeX', '接入ChatGLM', '用智谱API', '切换GLM模型', '清华大模型', '智谱AI'],
      body: `# 对接清华开源大模型\n\n指导在言智平台配置清华开源大模型（CodeGeeX / ChatGLM / 智谱 GLM 系列），通过 OpenAI 兼容 API 接入。\n\n## 流程\n1. 获取 API Key：https://open.bigmodel.cn/ 注册创建\n2. 平台管理添加：\n   - 名称：智谱 AI\n   - 协议：openai\n   - API 地址：https://open.bigmodel.cn/api/paas/v4/\n   - API Key：用户密钥\n3. 配置模型：glm-4-plus / glm-4-air / glm-4-flash(免费) / codegeex-4(代码) / glm-4v(视觉)\n4. 测试连通性\n\n## CodeGeeX 用途\n代码补全/生成/翻译/注释/Bug修复，编程场景优先选 codegeex-4\n\n## 自建部署\nvLLM 部署 GLM-4-9B，暴露 OpenAI 兼容接口，API 地址填 http://<IP>:8000/v1/\n\n详见 .claude/skills/codegeex-chatglm/SKILL.md`,
    },
    {
      id: 'skill_openbiomed', name: 'OpenBioMed 生物医药 AI', category: '科研',
      description: '对接清华 AIR（智能产业研究院）OpenBioMed 生物医药 AI 开源工具链。覆盖药物发现、分子生成、蛋白质结构预测、医学影像分析、生物信息学等场景。',
      triggers: ['药物发现', '分子生成', '蛋白质结构预测', '医学影像分析', 'OpenBioMed', '生物信息学'],
      body: `# OpenBioMed 生物医药 AI\n\n对接清华 AIR 主导的 OpenBioMed 开源生物医药 AI 工具链。\n\n## 能力\n- 药物发现：靶点识别、虚拟筛选、活性预测\n- 分子生成：按属性约束生成新分子（SMILES）\n- 蛋白质分析：结构预测、功能注释、对接\n- 医学影像：CT/MRI/病理 AI 辅助\n- 生物信息学：序列分析、基因表达\n\n## 依赖\n\`\`\`bash\npip install torch rdkit-pypi biopython numpy scipy pandas\n# OpenBioMed 工具链从清华 AIR 获取\n\`\`\`\n\n## 注意\n- 结果仅供参考，不能替代专业医学判断\n- 患者数据需脱敏，遵守隐私法规\n- 部分模型需 GPU\n\n详见 .claude/skills/openbiomed-skills/SKILL.md`,
    },
    {
      id: 'skill_openmaic_education', name: 'OpenMAIC 教育 AI', category: '科研',
      description: '对接清华 AIR（智能产业研究院）OpenMAIC 教育 AI 开源平台。覆盖智能出题、学情分析、个性化学习路径、自动批改、教学辅助等场景。',
      triggers: ['智能出题', '学情分析', '个性化学习', '自动批改', 'OpenMAIC', '教育AI'],
      body: `# OpenMAIC 教育 AI\n\n对接清华 AIR 主导的 OpenMAIC 开源教育 AI 平台。\n\n## 能力\n- 智能出题：按知识点/难度/题型自动生成带解析的题目\n- 学情分析：分析答题数据，诊断知识薄弱点\n- 个性化学习：基于学情生成学习路径和推荐\n- 自动批改：客观题判分 + 主观题 AI 评分\n- 教学辅助：教案生成、知识点讲解\n\n## 依赖\n\`\`\`bash\npip install torch transformers\n# OpenMAIC 平台从清华 AIR 获取\n\`\`\`\n\n## 注意\n- AI 出题需教师审核\n- 主观题评分仅供参考\n- 学生数据需脱敏存储\n\n详见 .claude/skills/openmaic-education/SKILL.md`,
    },
    {
      id: 'skill_code_review', name: '代码审查', category: '代码工程',
      description: '代码审查（Code Review）。基于最佳实践检查代码质量、可读性、性能、错误处理、命名、重复、安全，按严重度分级输出报告，支持多语言。',
      triggers: ['代码审查', 'review代码', '代码走查', '审查代码', '代码review'],
      body: `# 代码审查\n\n对代码系统化审查，按严重度分级输出问题与改进建议。\n\n## 检查清单\n1. 正确性（边界/异步/错误吞掉/资源释放）\n2. 可读性（命名/长函数/深嵌套）\n3. 重复与抽象\n4. 性能（循环IO/低效查找）\n5. 错误处理\n6. 安全（简要，深挖见 code-security-audit）\n7. 测试覆盖\n\n## 工具\n- eslint/ruff/golangci-lint 静态扫描\n- 圈复杂度：cr\n\n## 输出\n按 阻塞/重要/建议/表扬 分类，每项给位置+修复+代码示例。\n\n详见 .claude/skills/code-review/SKILL.md`,
    },
    {
      id: 'skill_code_refactor', name: '代码重构', category: '代码工程',
      description: '代码重构。识别代码坏味道（长函数/重复/深嵌套/魔法数/大类/霰弹手术），给出重构手法与重构后代码，保证行为不变。',
      triggers: ['重构代码', '代码重构', '消除重复', '降低复杂度', '重构一下'],
      body: `# 代码重构\n\n不改行为前提下改善结构，识别坏味道并选重构手法。\n\n## 坏味道→手法\n- 长函数→提取函数\n- 深嵌套→提前返回（Guard Clauses）\n- 重复→提取公共函数/超类\n- 魔法数→命名常量\n- 大类（God Object）→拆分职责\n- switch/类型码→多态\n- 依恋情结→移动函数到数据所在类\n\n## 原则\n- 行为不变（每步跑测试）\n- 小步前进\n- 重构与加功能分开\n- 先有测试兜底再重构\n\n详见 .claude/skills/code-refactor/SKILL.md`,
    },
    {
      id: 'skill_code_explain', name: '代码解读', category: '代码工程',
      description: '代码解读。用通俗语言解释代码逻辑、调用关系、设计模式，可画调用链/时序图，帮助快速理解陌生代码库。',
      triggers: ['解释代码', '代码解读', '读懂代码', '梳理逻辑', '这个函数干嘛的'],
      body: `# 代码解读\n\n帮助理解陌生代码，分层解释职责与逻辑，可配 mermaid 画调用链/时序。\n\n## 流程\n1. 定位代码\n2. 通读 + 依赖 + 调用方\n3. 先整体后细节（先做什么再怎么做）\n4. 关系梳理（调用方/被调用/数据流）\n5. 可视化（mermaid graph/sequence）\n6. 一句话总结核心职责\n\n## 建心智模型\n找入口→看目录分层→走一个典型用例→理核心数据模型\n\n详见 .claude/skills/code-explain/SKILL.md`,
    },
    {
      id: 'skill_unit_test_gen', name: '单元测试生成', category: '代码工程',
      description: '单元测试生成。为函数/类/模块生成单测，支持 pytest/jest/vitest/go test/JUnit，覆盖正常/边界/异常，遵循 AAA 结构。',
      triggers: ['写单测', '生成测试', '补测试用例', '加单元测试', '单元测试'],
      body: `# 单元测试生成\n\n为已有代码生成单测，覆盖正常/边界/异常，AAA 结构。\n\n## 框架\n- Python: pytest\n- JS/TS: jest / vitest\n- Go: go test\n- Java: JUnit\n\n## 用例\n正常路径 + 边界值（空/0/负/越界）+ 异常分支\n\n## 要点\n- 隔离依赖（mock/stub 外部）\n- 单一断言、命名达意\n- 不测私有实现，通过公开接口测行为\n- 生成后跑一遍修失败\n- 覆盖率：pytest --cov / vitest --coverage\n\n详见 .claude/skills/unit-test-gen/SKILL.md`,
    },
    {
      id: 'skill_git_workflow', name: 'Git 工作流', category: '代码工程',
      description: 'Git 工作流助手。覆盖分支管理、合并冲突解决、commit 规范、PR 创建、cherry-pick、rebase、回滚，含命令速查与常见报错处理。',
      triggers: ['解决冲突', '合并分支', '规范commit', '发PR', 'cherry-pick', 'rebase', 'git工作流'],
      body: `# Git 工作流\n\n分支/合并/冲突/commit/PR/cherry-pick/rebase/回滚。\n\n## 常用\n- 冲突：编辑文件删标记 → git add → commit（放弃 git merge --abort）\n- commit 规范：feat/fix/docs/refactor/perf/test/chore(scope): subject\n- rebase：个人分支可 rebase，公共分支用 revert 不改历史\n- PR：gh pr create --title --body --base\n- 回滚：未提交 checkout/reset；已提交 revert（安全）\n\n## 原则\n- commit 写"为什么"\n- 危险操作（force push/reset --hard）前备份\n\n详见 .claude/skills/git-workflow/SKILL.md`,
    },
    {
      id: 'skill_api_design', name: 'API 设计', category: '代码工程',
      description: 'API 设计。覆盖 RESTful/GraphQL 设计规范、URL/方法/状态码/命名、OpenAPI 文档生成、接口 Mock，输出可对接的接口契约。',
      triggers: ['设计API', '定义接口', 'RESTful规范', 'OpenAPI文档', 'Mock接口', 'API设计'],
      body: `# API 设计\n\n设计规范可对接的接口契约。\n\n## RESTful\n- URL 名词复数、嵌套表从属、版本前缀（/v1/）\n- 方法语义：GET 查/POST 增/PUT 替/PATCH 改/DELETE 删\n- 状态码：200/201/204/400/401/403/404/409/422/429/500\n- 统一响应体 + 错误体（code/message/details）\n- 时间用 ISO 8601，id 用带前缀字符串\n\n## 工具\n- OpenAPI 文档：redocly\n- Mock：prism mock openapi.yaml\n\n详见 .claude/skills/api-design/SKILL.md`,
    },
    {
      id: 'skill_frontend_page_build', name: '前端页面开发', category: '前端',
      description: '前端页面开发。用 Vue3/React/原生 HTML+CSS+JS 生成响应式、组件化页面，含脚手架、路由、状态管理，支持 Element Plus/Ant Design/Tailwind。',
      triggers: ['做个页面', '写前端页面', '搭页面', '生成Vue页面', '生成React页面', '前端页面'],
      body: `# 前端页面开发\n\n生成可运行的前端页面，Vue3/React/原生三栈。\n\n## 流程\n1. 选技术栈与 UI 框架（Element Plus/Ant Design/Tailwind）\n2. 定页面类型（表单/列表/详情/仪表盘/落地页）\n3. 生成组件 + 路由 + 状态\n4. 响应式 + 主题\n\n## 套路\n表单页/列表页/详情页/仪表盘各有模板；组件化、移动优先、数据获取处理 loading/错误态\n\n详见 .claude/skills/frontend-page-build/SKILL.md`,
    },
    {
      id: 'skill_css_styling', name: 'CSS/Tailwind 样式', category: '前端',
      description: 'CSS/Tailwind 样式。覆盖 Flex/Grid 布局、动画、主题、响应式，含 Tailwind 类速查与暗色主题适配。',
      triggers: ['写样式', '调布局', '做响应式', '加动画', '暗色主题', 'Tailwind'],
      body: `# CSS/Tailwind 样式\n\n布局/动画/主题/响应式。\n\n## 布局\n- Flex 一维、Grid 二维\n- 居中：display:grid; place-items:center\n\n## 响应式\n移动优先 + 媒体查询（sm640/md768/lg1024/xl1280）\n\n## 暗色\nCSS 变量 + prefers-color-scheme + .dark 类切换\n\n## Tailwind 速查\nflex items-center / grid grid-cols-3 gap-4 / dark:bg-gray-900 / line-clamp-2\n\n## 要点\n动画用 transform/opacity（GPU）；对比度 ≥ 4.5:1\n\n详见 .claude/skills/css-styling/SKILL.md`,
    },
    {
      id: 'skill_frontend_performance', name: '前端性能优化', category: '前端',
      description: '前端性能优化。覆盖打包体积、懒加载、渲染性能、Web Vitals（LCP/CLS/INP），用 Lighthouse 跑分并给优化建议。',
      triggers: ['优化性能', '页面太慢', '首屏优化', '打包体积', 'WebVitals', '前端性能'],
      body: `# 前端性能优化\n\n测量→定位→优化→复测。\n\n## 指标\nLCP<2.5s / CLS<0.1 / INP<200ms / FCP<1.8s\n\n## 手法\n- 减体积：按需引入、代码分割、gzip/brotli、树摇、大依赖替换（moment→dayjs）\n- 首屏：路由懒加载、preload、SSR/SSG、CDN\n- 渲染：虚拟列表、防抖节流、memo、transform 动画\n- 网络：合并请求、HTTP/2、stale-while-revalidate\n\n## 工具\nlighthouse / vite-bundle-visualizer / web-vitals\n\n详见 .claude/skills/frontend-performance/SKILL.md`,
    },
    {
      id: 'skill_form_interaction', name: '表单与交互', category: '前端',
      description: '表单与交互。覆盖表单校验、弹窗/抽屉、拖拽、虚拟列表、动画交互，含 Element Plus/Ant Design 模式。',
      triggers: ['写表单', '加校验', '做个弹窗', '拖拽', '虚拟列表', '动画交互', '表单交互'],
      body: `# 表单与交互\n\n表单校验/弹窗/拖拽/虚拟列表/动画交互。\n\n## 校验\n- Element Plus el-form rules / Ant Design Form rules\n- 自定义校验器（validator）\n- 提交前 validate()，异步校验防抖\n\n## 交互\n- 弹窗：ElMessageBox.confirm / Modal.confirm（await 后再执行）\n- 拖拽：vue-draggable / @dnd-kit（dragover.prevent）\n- 虚拟列表：vue-virtual-scroller / react-window\n- 动画：transition / framer-motion（transform/opacity）\n\n详见 .claude/skills/form-interaction/SKILL.md`,
    },
    {
      id: 'skill_markdown_doc', name: 'Markdown 文档写作', category: '文档处理',
      description: 'Markdown 文档写作。生成结构化文档，支持 mermaid 流程图/时序图/类图、表格、代码块、目录，适合 README/API 文档/技术方案/博客。',
      triggers: ['写文档', '写README', '写API文档', '写技术方案', '写博客', 'Markdown文档'],
      body: `# Markdown 文档写作\n\n生成结构化可渲染文档。\n\n## 类型\nREADME / API 文档 / 技术方案 / 变更记录 / 博客\n\n## 元素\n- mermaid 流程/时序/类图\n- 表格、代码块（带语言）、目录、折叠 details、提示框 [!NOTE]、徽章\n\n## 要点\n- 一级标题只用一次\n- README 首屏讲清"是什么/怎么装"\n- API 文档每接口给请求/响应示例\n\n详见 .claude/skills/markdown-doc/SKILL.md`,
    },
    {
      id: 'skill_email_compose', name: '邮件撰写', category: '办公',
      description: '邮件撰写。生成商务邮件、通知、邀请、回复、催办、致歉，支持多语气（正式/委婉/直接）与中英文，含主题行与署名。',
      triggers: ['写邮件', '回邮件', '写通知', '写邀请函', '商务邮件', '催办邮件'],
      body: `# 邮件撰写\n\n通知/邀请/回复/催办/致歉，多语气多语言。\n\n## 结构\n主题行 + 称呼 + 正文 + 行动号召 + 署名\n\n## 语气\n正式（对外/上级）/ 委婉（请求催办）/ 直接（内部/紧急）\n\n## 要点\n- 主题具体，加【类型】前缀\n- 一邮一旨，行动号召明确（做什么+何时）\n- 时间写绝对日期，附件正文提及\n\n详见 .claude/skills/email-compose/SKILL.md`,
    },
    {
      id: 'skill_meeting_notes', name: '会议纪要', category: '办公',
      description: '会议纪要。从录音转写/聊天记录/零散文字整理成结构化纪要，提取议题、决议、待办（负责人+截止时间）、遗留问题。',
      triggers: ['整理会议纪要', '总结会议', '录音整理纪要', '提取待办', '会议纪要'],
      body: `# 会议纪要\n\n从转写/记录整理成结构化纪要。\n\n## 结构\n议题与讨论 / 决议 / 待办（负责人+截止时间）/ 遗留问题\n\n## 待办要点\n- 动宾短语、具体人名、绝对日期\n- 缺则标"待定"提醒补全\n\n## 录音\nwhisper 转写后再整理\n\n## 要点\n客观记录、会后 24h 发出、敏感信息脱敏\n\n详见 .claude/skills/meeting-notes/SKILL.md`,
    },
    {
      id: 'skill_image_processing', name: '图片处理', category: '办公',
      description: '图片处理。用 Pillow 批量压缩、格式转换、加水印、裁剪、拼接、调尺寸、调色，通过 shell 执行 Python 脚本。',
      triggers: ['压缩图片', '批量转格式', '加水印', '裁剪拼接', '调尺寸', '图片处理'],
      body: `# 图片处理\n\nPillow 批量处理图片。\n\n## 能力\n压缩/转格式/加水印/裁剪/拼接/调尺寸/调色\n\n## 要点\n- PNG→JPEG 先 convert('RGB') 去透明通道\n- 压缩 quality=80~90，WebP 优先（更小+透明）\n- 水印中文用系统中文字体（msyh.ttc）\n- 保留原图，输出到新目录避免覆盖\n\n详见 .claude/skills/image-processing/SKILL.md`,
    },
    {
      id: 'skill_file_convert', name: '文件格式转换', category: '办公',
      description: '文件格式转换。文档/图片/音视频格式互转，pandoc（文档）+ ffmpeg（音视频）+ Pillow（图片）。',
      triggers: ['转格式', 'Markdown转Word', 'PDF转Word', '视频转MP4', '音频转MP3', 'HEIC转JPG', '文件转换'],
      body: `# 文件格式转换\n\n文档/图片/音视频互转。\n\n## 工具\n- 文档：pandoc（MD↔Word/HTML/PDF，中文 PDF 需 xelatex+CJK 字体）\n- PDF→Word：pdf2docx\n- 音视频：ffmpeg（libx264 + aac + faststart，-crf 23 默认/28 高压缩）\n- 图片：Pillow / pillow-heif（HEIC）\n\n## 要点\n批量先建输出目录；转换后检查能否正常打开\n\n详见 .claude/skills/file-convert/SKILL.md`,
    },
    {
      id: 'skill_data_visualization', name: '数据可视化', category: '办公',
      description: '数据可视化。用 matplotlib/plotly/echarts 生成柱状/折线/饼/散点/热力/组合图，可存图片或交互 HTML。',
      triggers: ['画图', '生成图表', '可视化数据', '柱状图', '折线图', '饼图', '热力图'],
      body: `# 数据可视化\n\nmatplotlib/plotly/echarts 三选一。\n\n## 选型\n- 比较→柱状 / 趋势→折线 / 占比→饼 / 相关→散点 / 分布→箱线 / 密度→热力\n- 静态报告→matplotlib / 交互→plotly(write_html) / 网页→echarts\n\n## 要点\n- 中文设 SimHei，axes.unicode_minus=False\n- 保存 dpi=150 + bbox_inches=tight\n- 轴标签/标题/图例齐全\n\n详见 .claude/skills/data-visualization/SKILL.md`,
    },
    {
      id: 'skill_shopping_compare', name: '多平台购物对比', category: '购物',
      description: '多平台购物对比。用 pageAgent 去淘宝/京东/拼多多搜索同一关键词，抓取价格/销量/评分/评论/优惠/物流/店铺，汇总对比表与购买建议。',
      triggers: ['帮我比价', '对比淘宝京东拼多多', '跨平台比价', '手机比价', '零食比价', '哪个平台便宜'],
      body: `# 多平台购物对比\n\n用 pageAgent 去淘宝/京东/拼多多搜索同一关键词，跨平台对比。\n\n## 维度\n价格/划线价/到手价、销量/月销、评分+评论摘要、优惠/券/满减/百亿补贴、物流/发货地、店铺信息\n\n## 工具\n- 联网检索统一委派 pageAgent（真实浏览器搜索引擎）；browser_new_tab/switch_tab/close_tab/get_tabs 多标签并行打开各平台搜索页\n- browser_extract_list 批量提取商品列表（title/price/link/sales/rating/shop）；browser_wait_for_request 确认异步加载\n- browser_visual_locate+image_analyze 识别弹窗；browser_scroll_into_view/is_visible 处理懒加载\n- compare_products 汇总：同款匹配+到手价归一化+可信度评分+评论情感分析 → Markdown 对比报告\n\n## 流程（推荐）\n1. 确认关键词与筛选（官方/旗舰/规格）\n2. 委派 pageAgent 用真实浏览器搜候选平台与价格区间\n3. browser_new_tab 并行打开淘宝/京东/拼多多搜索页\n4. browser_wait_for_request 等列表异步加载完成\n5. browser_extract_list 提取各平台前 N 商品；提取不到用 scroll_into_view 触发懒加载或 get_page_info+get_visible_text 兜底\n6. 按需 browser_click 进详情补评分/评论/优惠/物流\n7. compare_products 汇总比价 → 对比表+排序+评论摘要+推荐\n8. 给建议（价格/可信度/物流/售后综合）\n\n## 注意\n- 登录由 pageAgent 自处理（C3）：未登录时 pageAgent 自己 ask_user 扫码，父智能体不处理登录、不代填账号密码；cookie 持久化复用\n- 不写死选择器，每步 get_page_info 动态识别\n- 价格以详情页为准；结果仅供参考，下单以实时价为准\n- 控制节奏防反爬，遇验证码 ask_user\n\n详见 .claude/skills/multi-platform-shopping-compare/SKILL.md`,
    },
    {
      id: 'skill_openspec_propose', name: 'OpenSpec 提案', category: '工程规范',
      description: 'OpenSpec 提案。一步创建变更并生成全部产物（proposal/design/specs/tasks），用于快速描述要构建什么并产出完整提案。',
      triggers: ['openspec提案', '新建变更提案', 'propose change', 'openspec propose'],
      body: `# OpenSpec 提案（propose）\n\n一步创建变更并生成全部产物：proposal.md（what & why）/ design.md / specs / tasks。\n\n## 何时用\n想快速描述要构建什么，拿到完整提案进入实施。\n\n## 前置\n需 openspec CLI。\n\n详见 .claude/skills/openspec-propose/SKILL.md`,
    },
    {
      id: 'skill_openspec_explore', name: 'OpenSpec 探索', category: '工程规范',
      description: 'OpenSpec 探索模式。作为思考伙伴探索想法、调研问题、澄清需求，只思考不实现，可创建 OpenSpec 产物捕捉思考。',
      triggers: ['openspec探索', '探索模式', 'explore ideas', 'openspec explore'],
      body: `# OpenSpec 探索（explore）\n\n思考伙伴模式：探索想法、调研问题、澄清需求。\n\n## 约束\n- 只思考不实现（可读文件/搜索，不写代码）\n- 可创建 OpenSpec 产物（proposal/design/spec）捕捉思考\n\n详见 .claude/skills/openspec-explore/SKILL.md`,
    },
    {
      id: 'skill_openspec_archive', name: 'OpenSpec 归档变更', category: '工程规范',
      description: 'OpenSpec 归档变更。实现完成后定稿并归档变更，把已完成的变更从活跃区移入归档。',
      triggers: ['openspec归档', '归档变更', 'archive change', 'openspec archive'],
      body: `# OpenSpec 归档变更（archive）\n\n实现完成后定稿并归档变更。\n\n## 流程\n确认实现完成 → 归档（可选指定变更名，缺省从上下文推断，模糊则提示选择）\n\n详见 .claude/skills/openspec-archive-change/SKILL.md`,
    },
    {
      id: 'skill_openspec_apply', name: 'OpenSpec 实施变更', category: '工程规范',
      description: 'OpenSpec 实施变更。按变更的 tasks 开始或继续实施，逐项完成实现任务。',
      triggers: ['openspec实施', '实施变更', 'apply change', 'openspec apply', '继续实施'],
      body: `# OpenSpec 实施变更（apply）\n\n按变更的 tasks 开始/继续实施。\n\n## 流程\n读取变更 tasks → 逐项实现 → 标记完成\n\n详见 .claude/skills/openspec-apply-change/SKILL.md`,
    },
    {
      id: 'skill_design_creation', name: '设计创意方法论', category: '设计创意',
      description: '海报/配图/品牌/UI 等视觉设计的标准方法论：需求澄清 → 多方向提案 → 视觉细化（配色/构图/字体/留白）→ 交付（SVG/HTML/文案）。',
      triggers: ['海报设计', '设计一张图', '品牌设计', 'UI设计', '视觉方案', '创意设计'],
      body: `# 设计创意方法论\n\n## 流程\n1. 需求澄清：用途/受众/渠道/风格偏好，一次问全\n2. 多方向提案：给 2~3 个差异化立意（每个一句话理由），确认后深化\n3. 视觉细化：\n   - 配色：主色+辅色+点缀，全部给 HEX 色值，说明比例（60/30/10）\n   - 构图：版式类型（居中/三栏/对角线/网格）、视觉动线、留白比例\n   - 字体：标题/正文字体气质（衬线/无衬线/手写）与字号层级\n   - 素材：图片风格、图标体系、装饰元素\n4. 交付：SVG/HTML 海报写文件交付；文案给多组候选；说明打开预览方式\n\n## 要点\n- 视觉描述必须可执行，禁止"高级感""大气"等模糊词\n- 参考真实设计语言（如孟菲斯/瑞士国际主义/新拟态）而非编造大师名\n\n详见 .claude/skills/design-creation/SKILL.md`,
    },
    {
      id: 'skill_ai_image_prompt', name: 'AI 绘图提示词工程', category: '设计创意',
      description: '为文生图平台（即梦/Midjourney/DALL·E 等）撰写高质量提示词：主体+场景+风格+构图+光线+质量词结构，中英文双语与参数建议。',
      triggers: ['生成图片', '画一张图', '文生图', '绘图提示词', 'AI绘图', 'image prompt'],
      body: `# AI 绘图提示词工程\n\n## 提示词结构（六要素，一次写全）\n1. 主体：画面核心对象 + 细节特征\n2. 场景：环境/背景/时间氛围\n3. 风格：摄影/插画/3D/水墨/赛博朋克等，可叠加艺术家风格类型（不冒充在世艺术家署名）\n4. 构图：视角（俯视/平视/特写）+ 景别 + 留白\n5. 光线：光源方向/色调（黄金时刻/霓虹/柔光棚拍）\n6. 质量词：高细节/8K/专业色彩等收尾\n\n## 输出规范\n- 中文提示词 + 英文翻译版各一份\n- 负面提示词（不想要什么）单独列出\n- 平台参数建议：比例（--ar 16:9）、风格化强度等\n- 一次给 2~3 个差异化变体供挑选\n\n## 委派生成\n- 有图片生成模型：list_models 查 capabilities 后委派\n- 无模型：pageAgent 操作文生图平台（如即梦）粘贴提示词生成并取回\n\n详见 .claude/skills/ai-image-prompt/SKILL.md`,
    },
    {
      id: 'skill_arch_design', name: '需求分析与架构设计', category: '代码工程',
      description: '需求分析与架构设计。把模糊需求澄清为可执行的架构方案：分层与模块边界、目录结构、数据模型、接口契约、技术选型、影响面与实施拆解。',
      triggers: ['架构设计', '需求分析', '技术方案', '项目结构', '模块划分', '技术选型', '重构方案'],
      body: `# 需求分析与架构设计\n\n把需求翻译成"能照着写代码"的架构方案，不写业务代码。\n\n## 流程\n1. 需求澄清：目标 / 用户 / 范围边界 / 非功能要求（性能、安全、可扩展）/ 现有约束。信息不足一次问全。\n2. 现状勘查：技术栈、分层与目录结构、可复用模块与基建、同类功能既有写法、改动影响面。\n3. 方案设计：\n   - 分层与模块边界（每层职责一句话说清，依赖方向单向）\n   - 目录结构与新增/修改文件清单\n   - 数据模型（实体、字段、关系、索引）\n   - 接口契约（URL / 方法 / DTO / 错误码）\n   - 技术选型与取舍理由（给对比，不堆名词）\n   - 横切能力的接入点（认证 / 日志 / 异常 / 校验 / 响应封装）\n4. 风险与影响面：破坏性变更、数据迁移、性能瓶颈、需要协调的模块。\n5. 实施拆解：可勾选的任务清单，按依赖排序，标注验证方式。\n\n## 输出模板\n- 背景与目标\n- 架构总览（文字 + mermaid 图）\n- 模块职责表（模块 / 职责 / 依赖 / 新增或修改）\n- 数据模型与接口契约\n- 横切能力接入方案\n- 风险与影响面\n- 实施任务清单\n\n## 要点\n- 架构决策必须给理由与代价，禁止"业界最佳实践"式空话。\n- 能复用就复用，新增模块要说明为什么现成的不行。\n- 方案落到具体文件路径，不停留在抽象层。\n\n详见 .claude/skills/arch-design/SKILL.md`,
    },
    {
      id: 'skill_cross_cutting', name: '横切关注点统一与通用代码抽取', category: '代码工程',
      description: '横切关注点统一设计。把认证鉴权、日志、异常处理、参数校验、响应封装、事务、限流、审计等从业务代码中抽到统一基建（中间件/拦截器/装饰器/全局处理器），杜绝每个接口重复实现。',
      triggers: ['统一认证', '统一日志', '全局异常处理', '响应封装', '抽取公共代码', '消除重复', '中间件', '拦截器'],
      body: `# 横切关注点统一与通用代码抽取\n\n## 什么是横切关注点\n与具体业务无关、却被所有接口反复需要的处理：认证与鉴权、日志与链路追踪、异常处理、参数校验、统一响应封装、事务、限流、幂等、审计、跨域、国际化。\n\n## 反模式（必须避免）\n- 每个接口函数开头都解析一次 token、判断一次权限\n- 每个接口里 try/catch 只为打一行日志\n- 每个接口手写一遍统一响应体（code / message / data）\n- 每个接口重复写参数非空校验、分页参数处理\n- 每个接口各自开连接、起事务\n\n## 统一落点（按语言/框架选一处实现）\n- 中间件 / 拦截器 / 管道：认证鉴权、日志、限流、跨域\n- 装饰器 / 注解：权限声明、事务、缓存、幂等\n- 全局异常处理器：把异常统一翻译成错误码与响应体，业务代码只 throw\n- 全局响应包装：成功/失败格式唯一出口，业务只返回数据\n- 校验层：DTO + 校验注解/装饰器，不手写 if\n- 模板方法 / 基类 / AOP：把固定流程骨架下沉，业务只填钩子\n\n## 抽取手法\n1. 发现：搜索重复片段（同一段 token 解析、同一段 try/catch 日志、同一段响应拼装）。\n2. 归类：确认它是横切能力还是业务逻辑（与业务无关的才下沉）。\n3. 定接口：先定统一接入方式（注解 / 中间件 / DTO），再改调用方。\n4. 实现一处：在公共层实现唯一版本，加单测。\n5. 批量接入：删除各接口重复实现，改为声明式接入。\n6. 验证：跑全量测试 + 抽查若干接口确认行为不变。\n\n## 验收清单\n- 全项目认证逻辑只有一处实现，接口侧只有声明\n- 日志格式与字段统一，业务代码无只为打日志的 try/catch\n- 错误码集中定义，响应格式唯一出口\n- 参数校验由校验层承担，接口里无重复判空\n- 事务边界清晰，不在 controller 里开事务\n\n详见 .claude/skills/cross-cutting/SKILL.md`,
    },
    {
      id: 'skill_backend_impl', name: '后端接口实现', category: '代码工程',
      description: '后端接口实现。按契约落地 controller/service/repository 分层代码：DTO 与实体分离、错误码与异常、事务与幂等、单测与自测，遵循项目既有写法。',
      triggers: ['写接口', '实现接口', '后端代码', '写服务端', 'controller', 'service', 'DTO', '写业务代码'],
      body: `# 后端接口实现\n\n按架构师给的契约写代码，先找同款再动手。\n\n## 流程\n1. 找同款：code_search / code_refs 找一个同类接口，照它的分层、命名、错误处理、日志方式写。\n2. 定契约：URL 与方法语义、请求/响应 DTO、错误码、校验规则、权限声明、幂等与分页。\n3. 分层落地：\n   - controller / route：只做参数接收与结果返回，不写业务逻辑\n   - service：业务判断与编排，事务边界\n   - repository / dao：数据访问，不写业务规则\n   - model / entity / DTO：数据定义与传输对象分离\n4. 横切接入：认证鉴权、日志、异常、校验、响应封装交给中间件 / 装饰器 / 全局处理器，业务代码只声明。\n5. 自测：核心路径单测（正常 + 边界 + 异常），跑编译 / 静态检查 / 测试。\n\n## 要点\n- 错误用统一错误码抛出，不吞异常、不返回裸 null\n- 入参校验放校验层，不在接口里手写判空\n- 事务边界放 service，避免长事务；写操作考虑幂等\n- 命名与目录对齐现有代码，注释与项目语言一致\n- 改动最小，不夹带无关重构\n\n详见 .claude/skills/backend-impl/SKILL.md`,
    },
    {
      id: 'skill_ui_design_spec', name: '页面设计规格', category: '前端',
      description: '页面设计规格。产出前端可直接照做的规格文档：信息架构、布局与响应式、组件树与 props、交互态、设计令牌（HEX/字号/间距）、文案与验收清单。',
      triggers: ['页面设计', '设计规格', '交互设计', '组件拆分', '页面结构', 'UI 规格', '设计稿说明'],
      body: `# 页面设计规格\n\n产出"前端照着就能写"的规格，不是氛围描述。\n\n## 输出结构\n1. 页面目标与用户路径：一句话目标 + 主任务步骤\n2. 信息架构：区块划分、信息层级与优先级\n3. 布局与响应式：栅格 / 断点（sm 640 / md 768 / lg 1024 / xl 1280）、各区块占比、移动端降级方式\n4. 组件树：组件名 + 职责 + 关键 props / slots / 事件 + 复用现有还是新增\n5. 交互态：default / hover / active / disabled / loading / empty / error 逐个写清\n6. 设计令牌：主色 / 辅色 / 语义色 HEX、字号行高层级、间距、圆角、阴影\n7. 文案：按钮、标题、空态、报错的具体文字\n8. 验收清单：可勾选项，前端自测用\n\n## 要点\n- 所有视觉描述必须可执行：颜色给 HEX、尺寸给数值、层级给顺序\n- 禁止"高级感""大气""简约"这类不可落地形容词\n- 优先复用项目已有组件与设计语言，新增组件要说明理由\n- 先扫现有页面再设计，避免风格割裂\n\n详见 .claude/skills/ui-design-spec/SKILL.md`,
    },
    {
      id: 'skill_anime_storyboard', name: '动漫分镜脚本', category: '影视创作',
      description: '动漫脚本与分镜表。从小说正文或内容方向出发，按单集时长自动分集，产出世界观与角色设定（一致性锚点）、分集大纲、逐集分镜表（景别/运镜/时长/画面/台词/音效/转场，Markdown + CSV）与逐镜视频提示词，默认写入以系列名新建的目录。',
      triggers: ['分镜', '分镜脚本', '动漫脚本', '动画脚本', '改编小说', '写分镜', '镜头脚本', '视频脚本'],
      body: `# 动漫分镜脚本\n\n把小说或内容方向变成可拍摄、可生成的镜头表，并**按集落盘成文件**。\n\n## 分集策略（按时长切分）\n- 默认单集时长 150 秒（2 分 30 秒）；给了总时长按 150s/集 折算，给了集数按章节篇幅加权分配（不机械均分）。\n- 短章合并成一集，长章拆成多集；每集必须能独立成段（有起承转合与结尾钩子）。\n- 每集标注「覆盖章节：第 X 章 ~ 第 Y 章」。\n- 时长与镜数换算（单镜 3~8s，平均 5s）：60s≈15 镜 / 150s≈30 镜 / 300s≈60 镜；单集上限 60 镜，超出拆集。\n\n## 交付规范（默认直接写文件）\n- 目录：当前工作目录下新建以**系列名**命名的目录（系列名默认取小说文件名主干或内容提炼，先确认一次）。\n- 目录已存在则不覆盖，读已有集数从最大集号 +1 续写。\n- 文件名：Windows 禁用 \\ / : * ? " < > |，标题里的冒号换成短横。\n- 每集三个文件：第一集-标题.md（分镜表）、第一集-标题.csv（同表，UTF-8 BOM）、第一集-标题-提示词.md（逐镜提示词）。\n- 固定文件：00-设定集.md、01-分集大纲.md。\n- 集数多时逐集写盘，不要攒到最后；失败也保留已完成部分。\n\n## 流程\n1. 取材：读小说原文（长篇按章节分段读），或按用户给的内容方向创作。信息不足一次问全：题材 / 受众 / 单集时长与集数 / 画风 / 平台与画面比例。\n2. 定系列名与分集方案：先输出分集方案（每集标题 + 覆盖章节 + 预估时长）再动笔。\n3. 改编取舍：提炼主线，删支线，确定每集的起承转合与钩子；保留原作关键名场面。\n4. 设定集（一致性锚点）：\n   - 世界观与美术风格（一句话风格描述 + 参考风格类型）\n   - 角色卡：姓名 / 年龄 / 外貌（发型发色瞳色）/ 服装配色 / 标志性道具 / 性格关键词\n   - 场景卡：地点 / 时间 / 光线 / 主色调\n   - 上述描述作为固定锚点文本，后续每个镜头提示词原样复用，防止画面漂移\n5. 分集大纲：每集一句话梗概 + 场次列表 + 情绪曲线 + 对应文件名\n6. 逐集产出：分镜表 md → CSV → 该集提示词 md；镜号全片连续（SC-001 起，跨集不重置）\n7. 汇报：目录绝对路径 + 文件清单 + 统计（集数 / 总场次 / 总镜数 / 总时长 / 单集分布）\n\n## 分镜表字段\n镜号 | 场次 | 时长(s) | 景别 | 运镜 | 机位角度 | 画面内容 | 情绪节奏 | 台词或旁白 | 音效 SFX | BGM | 转场 | 一致性锚点\n\n- 景别：大远景 / 远景 / 全景 / 中景 / 近景 / 特写 / 大特写\n- 运镜：定镜 / 推 / 拉 / 摇 / 移 / 跟 / 升降 / 环绕 / 手持 / 甩镜\n- 机位角度：平视 / 俯拍 / 仰拍 / 过肩 / 主观视角 / 鸟瞰\n- 单镜时长：3~8 秒，一个镜头只表达一个动作\n\n## 节奏要点\n- 开场 3 镜内建立时空与人物；每集结尾留钩子\n- 对话场景用正反打 + 反应镜头，避免连续同景别\n- 动作场景短镜快切（1~3s），抒情场景长镜缓推（5~8s）\n- 转场方式明确标注（切 / 叠化 / 淡入淡出 / 匹配剪辑）\n\n## 注意\n- 改编受版权保护的作品需确认用户有改编授权\n- 角色与场景描述在整部片中严格一致，换装或换场景时显式说明\n- 对话里只给摘要与路径，不要把整张分镜表贴出来\n\n详见 .claude/skills/anime-storyboard/SKILL.md`,
    },
    {
      id: 'skill_video_shot_prompt', name: '视频镜头提示词工程', category: '影视创作',
      description: '为视频生成大模型撰写单镜头提示词：镜头运动+主体动作+场景环境+风格画质+光线色彩，中英双语、负面提示词与参数建议，保证角色与场景一致性。',
      triggers: ['视频提示词', '镜头提示词', '文生视频', '生成视频', 'video prompt', 'AI视频', '首尾帧'],
      body: `# 视频镜头提示词工程\n\n让视频大模型一次生成对的分镜，靠的是结构化提示词 + 一致性锚点。\n\n## 单镜提示词结构（按顺序写）\n1. 镜头运动：推 / 拉 / 摇 / 移 / 跟 / 环绕 / 定镜，含速度与方向\n2. 主体与动作：角色锚点描述 + 一个明确动作（一个镜头只做一个动作）\n3. 场景环境：场景锚点描述 + 前景背景元素 + 时间氛围\n4. 光线与色彩：光源方向、色温、主色调\n5. 风格与画质：2D 日式动画 / 厚涂 / 赛璐璐 / 写实，画质词（高细节、电影感、4K）\n6. 技术参数：时长、比例（16:9 / 9:16）、帧率\n\n## 输出规范\n- 英文提示词为主（模型理解更稳），附中文对照\n- 负面提示词单独列出：手部畸形、多指、面部崩坏、文字乱码、闪烁、镜头抖动、多余人物\n- 首尾帧一致性：给出首帧描述 + 尾帧描述，供图生视频 / 首尾帧模式使用\n- 每个镜头一条，禁止一条提示词塞多个镜头动作\n\n## 一致性做法\n- 角色锚点文本固定：发型发色瞳色 + 服装配色 + 标志性道具，每镜原样复用\n- 场景锚点文本固定：地点 + 光线 + 主色调，每镜原样复用\n- 换装或状态变化显式改写锚点并在设定集登记\n- 同一场次共用同一段场景锚点，避免背景漂移\n\n## 参数建议\n- 单镜 3~8 秒（超过 8s 模型容易失控，长段落拆镜）\n- 动作幅度与时长匹配：大动作留足 5s 以上\n- 对话镜头用小幅运动，避免大范围运镜导致变形\n\n详见 .claude/skills/video-shot-prompt/SKILL.md`,
    },
];

// 批量 upsert 内置 skill：仅插入缺项 + 标记 source='builtin'，不覆盖用户改动的 body。
try {
  const insertStmt = db.prepare(
    'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const updateStmt = db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?");
  for (const s of builtinSkillDefaults) {
    try {
      const has = db.prepare('SELECT id FROM skill WHERE id = ?').get(s.id);
      if (!has) {
        insertStmt.run(s.id, 'guest', s.name, s.description, JSON.stringify(s.triggers), s.body, s.category, 'yan-zhi', 1, 0, 'builtin', Date.now());
      } else {
        updateStmt.run(s.id);
      }
    } catch {}
  }
} catch {}

// 内置 skill 定义下发（修正）：批量 upsert 刻意不覆盖已有 body，改了内置 skill 内容就拿不到新版。
// 这里按 id 白名单把 body 刷成代码最新定义；条件是「库中 body 与代码定义不一致」，
// 刷新后条件自然不成立，因此幂等。下次再改某个内置 skill，把它的 id 加进列表即可。
const SKILL_BODY_REFRESH_IDS = ['skill_anime_storyboard'];
try {
  const getBody = db.prepare('SELECT body FROM skill WHERE id = ?');
  const setDef = db.prepare('UPDATE skill SET name = ?, description = ?, triggers_json = ?, body = ?, category = ? WHERE id = ?');
  for (const id of SKILL_BODY_REFRESH_IDS) {
    const def = builtinSkillDefaults.find((s) => s.id === id);
    if (!def) continue;
    const row = getBody.get(id) as { body?: string | null } | undefined;
    if (!row || row.body === def.body) continue;
    setDef.run(def.name, def.description, JSON.stringify(def.triggers), def.body, def.category, id);
  }
} catch {}

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
  // 使用计数：记忆被注入/检索命中时 +1，供 Dreaming 整理判断"从未使用"的淘汰候选
  if (!cols.some((c) => c.name === 'use_count')) {
    db.exec(`ALTER TABLE memory ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`);
  }
} catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_user_agent ON memory(user_id, agent_id, last_used_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(user_id, type, last_used_at DESC)'); } catch {}

// ===== 记忆整理（Dreaming）日志：每次整理的统计与审计 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_dream_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    trigger TEXT NOT NULL DEFAULT 'scheduled',
    stats_json TEXT DEFAULT '{}',
    error TEXT
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_dream_log_user ON memory_dream_log(user_id, started_at DESC)'); } catch {}

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
// 定时任务类型：chat=对话式（走 createTask ReAct 循环）；workflow=工作流（走 startWorkflowRun）。bundle 随任务存库，前端关闭也能跑。
try { db.exec("ALTER TABLE scheduled_task ADD COLUMN task_type TEXT DEFAULT 'chat'"); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN workflow_bundle_json TEXT'); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN workflow_inputs_json TEXT'); } catch {}
try { db.exec("ALTER TABLE scheduled_task ADD COLUMN workflow_agent_id TEXT"); } catch {}
try { db.exec('ALTER TABLE conversation ADD COLUMN scheduled_task_id TEXT'); } catch {}
// 定时任务分组
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN group_id TEXT'); } catch {}
// 新调度模型：结构化调度配置 + 有效期（到期自动停用）
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN schedule_json TEXT'); } catch {}
try { db.exec('ALTER TABLE scheduled_task ADD COLUMN expire_at INTEGER'); } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_task_group (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_task_group_user ON scheduled_task_group(user_id, sort_order)'); } catch {}

// ===== 应用全局配置（key-value）=====
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL
  );
`);

// ===== 插件系统（plugin / plugin_storage）=====
// 这两张表是插件系统的持久化真相源：plugin 存 manifest/启停状态，plugin_storage 存插件私有 KV
// （ops-shell 的连接、审计记录等都落在这里）。
// 历史坑：@yan-zhi/core 的 PluginManager.ensureSchema() 也声明建表，但它走 adapter.db.exec，
// 而 server 侧 adapter 曾为空实现 → 建表静默失效；且本文件此前未包含这两张表 →
// 表从未创建，表现为「新增连接保存成功但列表永远为空」。
// 注意 plugin_storage 不设外键：插件可写非 plugin 行的私有标记（如 __app__ 迁移标记）。
db.exec(`
  CREATE TABLE IF NOT EXISTS plugin (
    id           TEXT PRIMARY KEY,
    manifest     TEXT NOT NULL,
    state        TEXT NOT NULL,
    config       TEXT,
    version      TEXT NOT NULL,
    source       TEXT NOT NULL,
    error        TEXT,
    installed_at INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS plugin_storage (
    plugin_id TEXT NOT NULL,
    key       TEXT NOT NULL,
    value     TEXT,
    PRIMARY KEY (plugin_id, key)
  );
`);

// ===== 浏览器记住密码（站点凭证，AES-256-GCM 加密存储）=====
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_password (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    host TEXT NOT NULL,
    url TEXT,
    name TEXT,
    username TEXT NOT NULL,
    password_enc TEXT NOT NULL,
    form_meta_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_saved_password_user ON saved_password(user_id, host)'); } catch {}

// ===== LLM 任务（ReAct 循环）持久化 =====
// 任务原本只存在内存 tasks Map 中，server 重启/崩溃后状态全丢，
// DB 里还会残留"助手空占位 + 缺 tool 结果"的半截消息。落库后可查询、可标记中断。
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_task (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT,
    origin TEXT NOT NULL DEFAULT 'chat',
    status TEXT NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    pending_tool_json TEXT,
    params_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_llm_task_user ON llm_task(user_id, status, updated_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_llm_task_conv ON llm_task(conversation_id, status)'); } catch {}

// ===== 工作流运行持久化 =====
// 与 llm_task 同思路：运行状态/节点日志/结果落库，前端断开后可回查，重启后遗留 running 标记 interrupted。
db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_run (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    agent_id TEXT,
    agent_name TEXT,
    bundle_json TEXT,
    inputs_json TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    result_json TEXT,
    logs_json TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_run_user ON workflow_run(user_id, created_at DESC)'); } catch {}

// ===== 多数据源（P1 数据源底座）=====
// 密码用 utils/crypto.ts 的 AES-256-GCM 加密（password_enc），接口永不回显明文。
// type: mysql|postgres|dm|oracle|sqlite|project（project=应用自身 data.db，builtin=1）
db.exec(`
  CREATE TABLE IF NOT EXISTS data_source (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    host TEXT,
    port INTEGER,
    database TEXT,
    service_name TEXT,
    file_path TEXT,
    username TEXT,
    password_enc TEXT,
    options_json TEXT DEFAULT '{}',
    readonly INTEGER NOT NULL DEFAULT 1,
    allow_write INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_test_at INTEGER,
    schema_synced_at INTEGER,
    table_count INTEGER,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_data_source_user_name ON data_source(user_id, name)'); } catch {}

// ===== 本体（text2sql 语义层，P3.1）=====
// source_sql 输出列必须显式 AS 别名（保存时 services/ontology-validator.ts 校验）；
// 维度/度量/时间维度/关系分段 JSON 存储，字段 expr 只能引用别名集合；
// status: draft（对智能体不可见）| published；发布即改智能体取数口径，bump version。
db.exec(`
  CREATE TABLE IF NOT EXISTS ontology (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    datasource_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    domain TEXT,
    description TEXT,
    synonyms_json TEXT DEFAULT '[]',
    source_sql TEXT NOT NULL,
    entities_json TEXT DEFAULT '[]',
    time_dimensions_json TEXT DEFAULT '[]',
    dimensions_json TEXT DEFAULT '[]',
    measures_json TEXT DEFAULT '[]',
    filters_json TEXT DEFAULT '[]',
    relations_json TEXT DEFAULT '[]',
    selections_json TEXT DEFAULT '[]',
    policies_json TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    builtin INTEGER NOT NULL DEFAULT 0,
    enriched_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    published_at INTEGER
  );
`);
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_ontology_user_code ON ontology(user_id, code)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_ontology_user_ds ON ontology(user_id, datasource_id, status)'); } catch {}
// 旧库迁移：filters_json（查询过滤器，命中才注入 WHERE；与行级策略 policies 不同）
try { db.exec("ALTER TABLE ontology ADD COLUMN filters_json TEXT DEFAULT '[]'"); } catch {}
// 旧库迁移：智能体挂载的本体集合（数据查询类智能体按挂载范围取数；'[]' = 不限，可见全部已发布本体）
try { db.exec("ALTER TABLE agent ADD COLUMN ontology_ids TEXT DEFAULT '[]'"); } catch {}

// ===== 本体包（分类树，P4.5）：支持多级嵌套（包下建包）；本体通过 group_id 归入包 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS ontology_group (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_ontology_group_user_parent ON ontology_group(user_id, parent_id)'); } catch {}
// 旧库迁移：本体所属包
try { db.exec('ALTER TABLE ontology ADD COLUMN group_id TEXT'); } catch {}

// ===== 标准属性库（P3.7 v1）：企业级统一字段口径；本体字段通过 refAttr 引用这里的 key =====
db.exec(`
  CREATE TABLE IF NOT EXISTS std_attribute (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    data_type TEXT DEFAULT 'string',
    unit TEXT,
    description TEXT,
    synonyms_json TEXT DEFAULT '[]',
    enum_json TEXT DEFAULT '[]',
    created_at INTEGER,
    updated_at INTEGER
  );
`);
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_std_attr_user_key ON std_attribute(user_id, key)'); } catch {}
// 树结构（P4.7）：kind=group 分组节点（可多级嵌套）/ attr 属性叶子（key/value/def）；parent_id 组装树
try { db.exec("ALTER TABLE std_attribute ADD COLUMN parent_id TEXT"); } catch {}
try { db.exec("ALTER TABLE std_attribute ADD COLUMN value TEXT"); } catch {}
try { db.exec("ALTER TABLE std_attribute ADD COLUMN kind TEXT DEFAULT 'attr'"); } catch {}
// 旧库迁移：selections_json（本体级选择列契约：默认直拼 + 非默认关键字召回）
try { db.exec("ALTER TABLE ontology ADD COLUMN selections_json TEXT DEFAULT '[]'"); } catch {}
// 回填选择列：selections_json 为空时，生成单组「全部字段」（新结构：{name, fields}），
// 让未补语义的旧本体的语义摘要立即可用（已补 selections 的本体不动；幂等）。
try {
  const blank = db
    .prepare(`SELECT id, dimensions_json, measures_json, time_dimensions_json FROM ontology WHERE selections_json IS NULL OR selections_json = '[]'`)
    .all() as Array<{ id: string; dimensions_json: string; measures_json: string; time_dimensions_json: string }>;
  if (blank.length) {
    const upd = db.prepare(`UPDATE ontology SET selections_json = ? WHERE id = ?`);
    for (const r of blank) {
      const dims = JSON.parse(r.dimensions_json || '[]') as Array<{ name: string }>;
      const meas = JSON.parse(r.measures_json || '[]') as Array<{ name: string }>;
      const times = JSON.parse(r.time_dimensions_json || '[]') as Array<{ name: string }>;
      const allFields = [...dims, ...times, ...meas].map((x) => x.name);
      if (allFields.length) upd.run(JSON.stringify([{ name: '全部字段', fields: allFields }]), r.id);
    }
    console.log(`[db] 回填选择列 ${blank.length} 条本体`);
  }
} catch {}

// ===== 内置数据「恢复默认」 =====
// 用户改过内置 agent 提示词 / skill 文档后，可一键恢复成代码内置默认值。
// 默认来源：agent 用 seedAgents，批量 skill 用 builtinSkillDefaults；3 个单独 skill 见下方内联。

/** 3 个单独内置 skill 的默认定义（与 seed 保持一致的单一来源，供 reset 恢复） */
const STANDALONE_SKILL_DEFAULTS: Record<string, { name: string; description: string; triggers: string[]; body: string; category: string }> = {
  skill_web_task_automation: {
    name: '网站自动化任务',
    category: '自动化',
    description: '用 pageAgent 驱动浏览器完成登录、签到、领积分、填表单、搜索、翻页、提交、制作内容等网站自动化任务，支持用已存密码自动登录，可配合定时任务每日执行。',
    triggers: ['每日签到', '自动登录', '领取积分', '制作视频', '填写表单', '网站自动化'],
    body: `# 网站自动化任务\n\n用内置 pageAgent 驱动真实浏览器（预览面板）完成网站操作任务。pageAgent 仅挂载六件套工具：browser_navigate / browser_type / browser_click / browser_scroll / browser_get_page_content / ask_user，其余浏览器工具（get_dom/fill_form/search/翻页等）不可用。配合「定时任务」可每日自动执行。\n\n## 流程\n1. 委派 pageAgent：call_agent { agentId: "a_builtin_page_agent", input: "<任务描述：目标站点 + 要执行的操作/要提取的信息>" }\n   - browser_navigate 打开目标站点\n   - browser_get_page_content 获取页面正文 + 带编号（index）可交互元素列表\n   - 需要登录时 pageAgent 会 ask_user 请用户在浏览器面板完成（扫码/验证码），确认后复核\n   - 用 index 定位：browser_type 输入 / browser_click 点击，browser_scroll 翻看视口外内容\n   - browser_get_page_content 提取最终结果并返回摘要\n2. 周期任务：创建 scheduled_task（cron + prompt + 绑定默认助理）\n\n## 示例\n- 每日签到：browser_navigate → browser_get_page_content 找签到入口 → browser_click → browser_get_page_content 确认积分\n- 搜索并提取结果：browser_navigate 搜索页 → browser_type 关键词回车 → browser_get_page_content + browser_scroll 提取结果列表\n\n详见 .claude/skills/web-task-automation/SKILL.md`,
  },
  skill_jimeng_daily_checkin: {
    name: '即梦每日签到',
    category: '自动化',
    description: '每天自动登录即梦（Dreamina，字节跳动 AI 创作平台）并签到领取灵感值/积分。即梦用抖音扫码登录，首次需手动扫码，之后配合定时任务每日自动签到。',
    triggers: ['即梦签到', '即梦每天签到', '即梦领积分', '即梦灵感值', 'Dreamina签到', '每日签到'],
    body: `# 即梦每日签到领灵感值\n\n自动登录即梦（jimeng.jianying.com）完成每日签到，领取灵感值/积分。配合定时任务可每日自动执行。\n\n## ⚠️ 业务约束（随委派 input 传给 pageAgent）\n- 目标站固定 https://jimeng.jianying.com/，禁止访问 dreamina.ai 等国际版。\n- 登录只走扫码（pageAgent 会 ask_user），禁止代填手机号/验证码。\n- 登录态由 persist:browser-view partition 持久化，首次扫码后复用。\n- 已知稳定选择器：即梦"领积分"入口 #SiderMenuCredit。\n\n## 委派流程\n1. call_agent { agentId: "a_builtin_page_agent", input: "打开 https://jimeng.jianying.com/ 并检查登录状态（有头像=已登录）；未登录则 ask_user 提示用户在浏览器面板扫码登录，用户确认后用 browser_get_page_content 复核；进入'领积分'入口（#SiderMenuCredit），找到'签到/打卡/领灵感'按钮点击签到，用 browser_get_page_content 确认结果并返回摘要。目标站固定 jimeng.jianying.com，禁止访问国际版，禁止代填验证码。" }\n2. 周期任务：scheduled_task cron "0 9 * * *" + prompt "登录即梦签到领灵感值"\n\n详见 .claude/skills/jimeng-daily-checkin/SKILL.md`,
  },
  skill_ontology_query: {
    name: '本体取数与分析',
    category: '数据分析',
    description: ONTOLOGY_QUERY_DESC,
    triggers: ['本体', '本体查询', '数据查询', '查库', 'YAML含义', '怎么查数据', 'text2sql'],
    body: ONTOLOGY_QUERY_BODY,
  },
};

/** 恢复内置 agent 默认值（system_prompt / 工具挂载 / 子智能体 / skill / config）。
 *  返回 true=已恢复，false=非内置或不存在。 */
export function resetBuiltinAgent(agentId: string): boolean {
  const seed = seedAgents.find((a) => a.id === agentId);
  if (!seed) return false;
  const row = db.prepare('SELECT id FROM agent WHERE id = ?').get(agentId);
  if (!row) return false;
  db.prepare(
    'UPDATE agent SET system_prompt = ?, builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, config_json = ?, type = ?, is_builtin = ?, agent_kind = ?, is_public = 1 WHERE id = ?'
  ).run(
    seed.system_prompt as string,
    (seed.builtin_tool_ids as string) || '[]',
    (seed.sub_agent_ids as string) || '[]',
    (seed.skill_ids as string) || '[]',
    (seed.config_json as string) || null,
    (seed.type as string) || 'harness',
    (seed.is_builtin as number) || 0,
    (seed.agent_kind as string) || 'main',
    agentId,
  );
  return true;
}

/** 恢复内置 skill 默认值（name/description/triggers/body/category）。
 *  返回 true=已恢复，false=非内置或不存在。 */
export function resetBuiltinSkill(skillId: string): boolean {
  const row = db.prepare('SELECT id FROM skill WHERE id = ?').get(skillId);
  if (!row) return false;

  // 3 个单独内置 skill（有覆盖语义的专用 skill）
  const standalone = (STANDALONE_SKILL_DEFAULTS as Record<string, any>)[skillId];
  if (standalone) {
    db.prepare("UPDATE skill SET name = ?, description = ?, triggers_json = ?, body = ?, category = ?, source = 'builtin' WHERE id = ?").run(
      standalone.name, standalone.description, JSON.stringify(standalone.triggers), standalone.body, standalone.category, skillId,
    );
    return true;
  }

  // 批量内置 skill
  const batch = builtinSkillDefaults.find((s) => s.id === skillId);
  if (batch) {
    db.prepare("UPDATE skill SET name = ?, description = ?, triggers_json = ?, body = ?, category = ?, source = 'builtin' WHERE id = ?").run(
      batch.name, batch.description, JSON.stringify(batch.triggers), batch.body, batch.category, skillId,
    );
    return true;
  }

  return false;
}

export { db };
