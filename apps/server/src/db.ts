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

// 预置内置智能体：默认「AI 助手」+ 子智能体「浏览器操作专家（pageAgent）」。
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

【模型选型】
- 任务需要特定模型能力（图片/视频生成、视觉识别、深度推理、长上下文等）时，先调 list_models 查询可用平台/模型及其 type/capabilities/description，再在 call_agent 里传 platformId + modelId 指定子智能体用哪个模型；不指定则子智能体用自身配置或主智能体当前模型。
- 普通对话/文本任务没必要频繁 list_models，仅当"模型能力与任务不匹配"时才查询选型。

` + WEB_QUERY_PROMPT_BLOCK + '\n\n' + DATA_QUERY_PROMPT_BLOCK;
const PAGE_AGENT_SYSTEM_PROMPT = `你是一个浏览器自动化专家（pageAgent）。你通过调用浏览器工具操作一个真实的、可见的浏览器窗口（预览面板），用户能实时看到你的每一步操作。

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

// 运维智能体挂载：ops-shell 插件工具（运行时名 plugin_ops-shell__<tool>）+ 用户交互。
// 工具执行体在 ops-shell 插件内（ssh2），插件 disabled 时工具从 ToolRegistry 注销，委派会拿到明确报错。
const OPS_AGENT_BUILTIN_TOOLS = [
  'plugin_ops-shell__ssh_exec',
  'plugin_ops-shell__ssh_upload',
  'plugin_ops-shell__ssh_download',
  'plugin_ops-shell__docker_ps',
  'plugin_ops-shell__docker_logs',
  'plugin_ops-shell__docker_restart',
  // 用户交互与任务规划
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
];

const OPS_AGENT_SYSTEM_PROMPT = `你是服务器运维专家（opsAgent），负责在用户的 SSH 服务器连接上执行运维任务。

## 工具与连接
- 所有 ssh_*/docker_* 工具都需要 connection 参数（连接名称）。用户消息通常会带「当前选定连接：<名称>」，优先用它；用户明确指定其他连接名时用指定的。
- 连接在「运维控制台」中管理；没有可用连接时如实告知用户先到「更多 → 运维 → 新建连接」添加。

## 工作流程
1. 先理解任务，需要的先探查：docker_ps 看容器、ssh_exec 跑只读命令（ps/df/free/journalctl 等）确认现状。
2. 执行：用 ssh_exec 执行命令；改配置/传文件用 ssh_upload；容器问题用 docker_ps → docker_logs → docker_restart 链路。
3. 验证：变更后必须回查确认（如 restart 后 docker_ps 看状态、改配置后 cat 复核）。
4. 回答：给出关键命令输出摘要 + 结论 + 风险提示。

## 硬约束
- 危险命令（rm -rf /、mkfs、dd、shutdown、fork bomb 等）会被服务端黑名单直接拒绝，不要尝试。
- 生产标签连接上的非只读操作需要 confirmed=true：先向用户说明将执行什么、影响什么，用户确认后再带 confirmed=true 调用；用户未确认前不要自作主张。
- 命令失败时先读 stderr 判断原因（权限/路径/服务名/端口），最多换 2 种思路，仍失败就如实汇报已有信息。
- 不要执行交互式命令（top/vim/apt 交互确认等），用非交互替代（free -m / sed / apt-get -y）。
- 长输出会被截断：优先用 grep/tail/head 精确取关键行，必要时分段查看。
- 只做用户请求范围内的操作，禁止顺带"优化"其他服务。`;
const DATA_AGENT_SYSTEM_PROMPT = `你是「数据查询分析专家」。你通过「本体语义层」对已接入的数据源做只读取数、分析与交付，不直接猜表结构写 SQL。

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
    name: 'AI 助手',
    description: '默认 Harness 智能体，挂载工具/Skill/子智能体后即可使用，大模型自主 ReAct 决策',
    type: 'harness',
    is_default: 1,
    builtin_tool_ids: JSON.stringify(DEFAULT_AGENT_BUILTIN_TOOLS),
    // pageAgent（联网/浏览器） + 数据查询分析专家（库内数据只读取数）
    sub_agent_ids: JSON.stringify(['a_builtin_page_agent', 'a_builtin_data_agent']),
    skill_ids: JSON.stringify(DEFAULT_AGENT_SKILL_IDS),
    system_prompt: DEFAULT_AGENT_SYSTEM_PROMPT,
  },
  {
    id: 'a_builtin_page_agent',
    name: '浏览器操作专家',
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
    name: '数据查询分析专家',
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
    name: '运维智能体',
    description:
      '内置运维专家：在 SSH 服务器连接上执行命令/传文件/管理 Docker 容器，配合「运维」插件的运维控制台使用（对话模式）；危险命令黑名单 + 生产连接二次确认',
    type: 'harness',
    is_builtin: 1,
    builtin_tool_ids: JSON.stringify(OPS_AGENT_BUILTIN_TOOLS),
    system_prompt: OPS_AGENT_SYSTEM_PROMPT,
    // 内置定义由代码收敛：工具挂载/提示词以代码为准，强制同步旧库残留
    force_sync: true,
    config_json: JSON.stringify({ maxReActSteps: 30 }),
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
          'UPDATE agent SET is_public = 1, is_builtin = ?, user_id = COALESCE(user_id, ?), builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, type = ?, system_prompt = ?, config_json = ? WHERE id = ?'
        ).run(a.is_builtin || 0, 'guest', a.builtin_tool_ids as string, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.type as string, a.system_prompt as string, (a.config_json as string) || null, a.id as string);
      } else {
        db.prepare(
          'UPDATE agent SET is_public = 1, user_id = COALESCE(user_id, ?), builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, type = ?, system_prompt = COALESCE(system_prompt, ?) WHERE id = ?'
        ).run('guest', a.builtin_tool_ids as string, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.type as string, a.system_prompt as string, a.id as string);
      }
    } else {
      db.prepare(
        'INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, skill_ids, is_default, is_public, is_builtin, version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?)',
      ).run(a.id, 'guest', a.name, a.description, a.system_prompt as string, a.type, a.builtin_tool_ids, (a.sub_agent_ids as string) || '[]', (a.skill_ids as string) || '[]', a.is_default || 0, a.is_builtin || 0, (a.config_json as string) || null, Date.now(), Date.now());
    }
  } catch {}
}

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

// 旧库增量迁移：默认助手挂载「数据查询分析专家」子智能体 + 追加委派指引（同上，按标记增量）。
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

本 skill 是「数据查询分析专家」的操作教材：解释本体工具的作用、本体 YAML 各字段含义，以及如何生成 SQL / 脚本取数。

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

// ===== 应用全局配置（key-value）=====
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER NOT NULL
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
    'UPDATE agent SET system_prompt = ?, builtin_tool_ids = ?, sub_agent_ids = ?, skill_ids = ?, config_json = ?, type = ?, is_builtin = ?, is_public = 1 WHERE id = ?'
  ).run(
    seed.system_prompt as string,
    (seed.builtin_tool_ids as string) || '[]',
    (seed.sub_agent_ids as string) || '[]',
    (seed.skill_ids as string) || '[]',
    (seed.config_json as string) || null,
    (seed.type as string) || 'harness',
    (seed.is_builtin as number) || 0,
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
