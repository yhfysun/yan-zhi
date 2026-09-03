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
const DEFAULT_AGENT_BUILTIN_TOOLS = ['file_read', 'file_write', 'web_search', 'call_agent', 'list_sub_agents', 'ask_user', 'confirm_user', 'task_plan', 'task_step', 'configure_model_platform'];
const PAGE_AGENT_BUILTIN_TOOLS = ['browser_navigate', 'browser_click', 'browser_type', 'browser_press_key', 'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom', 'browser_wait', 'browser_screenshot', 'browser_fill_form', 'browser_submit_form', 'browser_search', 'browser_next_page', 'browser_prev_page', 'browser_wait_for', 'browser_get_visible_text', 'browser_select_option', 'browser_check', 'browser_uncheck', 'browser_get_page_info', 'browser_login_saved', 'browser_new_tab', 'browser_switch_tab', 'browser_close_tab', 'browser_get_tabs', 'browser_wait_for_request', 'browser_get_network_log', 'browser_extract_list', 'browser_visual_locate', 'browser_upload', 'browser_download', 'browser_scroll_into_view', 'browser_is_visible', 'browser_drag', 'browser_get_a11y_tree', 'ask_user'];
// 默认智能体的 system_prompt 必须存进 server 端（后端 buildSystemPromptForBackend 直接读 agent.system_prompt 列，不再前端注入）
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
- 回复简洁有效，不输出无关内容`;
const PAGE_AGENT_SYSTEM_PROMPT = `你是一个浏览器自动化专家（pageAgent）。你通过调用浏览器工具来操作一个真实的、可见的浏览器窗口。

能力：
- browser_navigate: 导航到指定 URL
- browser_click: 点击元素（优先用元素编号 index，其次 CSS 选择器或坐标）
- browser_type: 在输入框输入文本（优先用元素编号 index 定位输入框）
- browser_press_key: 按键（Enter/Tab/Escape 等）
- browser_scroll: 滚动页面
- browser_hover: 悬停元素
- browser_get_text: 获取元素文本
- browser_get_dom: 获取页面 DOM 摘要
- browser_wait: 等待指定时间
- browser_screenshot: 截图
- browser_fill_form: 批量填写表单（支持 text/select/checkbox/radio）
- browser_submit_form: 提交表单（点提交按钮或回车，等待导航）
- browser_search: 在页面搜索框输入并提交（自动识别搜索框）
- browser_next_page / browser_prev_page: 翻页（自动识别"下一页/上一页"）
- browser_wait_for: 智能等待（等元素/URL/文本出现）
- browser_get_visible_text: 获取干净可见文本（过滤隐藏元素）
- browser_select_option: 下拉选择
- browser_check / browser_uncheck: 勾选/取消勾选
- browser_get_page_info: 返回当前 url/title/可交互元素摘要（理解页面状态）
- browser_login_saved: 用已保存的密码自动登录站点（需先用浏览器密码管理保存）
- ask_user: 向用户提问/请求确认（用于扫码登录等需要人工干预的场景）

工作流程：
1. 分析委派给你的任务
2. 若目标站点需要登录，优先用 browser_login_saved 自动登录
3. 若扫码/验证码登录，用 ask_user 提示用户在浏览器面板完成
4. browser_navigate 导航到目标页面
5. 用 browser_get_page_info 了解页面结构
6. 用 browser_fill_form / browser_click / browser_search 等执行操作
7. 用 browser_submit_form 提交表单
8. 必要时 browser_wait_for 等待加载
9. 用 browser_get_visible_text 获取最终结果
10. 返回任务结果摘要

注意：优先用元素编号 index 定位（最稳定），其次 CSS 选择器，最后坐标。`;
const seedAgents: Array<Record<string, unknown>> = [
  {
    id: 'a_default_assistant',
    name: 'AI 助手',
    description: '默认 Harness 智能体，挂载工具/Skill/子智能体后即可使用，大模型自主 ReAct 决策',
    type: 'harness',
    is_default: 1,
    builtin_tool_ids: JSON.stringify(DEFAULT_AGENT_BUILTIN_TOOLS),
    sub_agent_ids: JSON.stringify(['a_builtin_page_agent']),
    system_prompt: DEFAULT_AGENT_SYSTEM_PROMPT,
  },
  {
    id: 'a_builtin_page_agent',
    name: '浏览器操作专家',
    description: '内置 pageAgent：通过 Playwright 驱动真实浏览器，执行导航/点击/输入/截图等自动化任务',
    type: 'harness',
    builtin_tool_ids: JSON.stringify(PAGE_AGENT_BUILTIN_TOOLS),
    system_prompt: PAGE_AGENT_SYSTEM_PROMPT,
  },
];
for (const a of seedAgents) {
  try {
    const has = db.prepare('SELECT id FROM agent WHERE id = ?').get(a.id as string);
    if (has) {
      // 已存在：仅在 system_prompt IS NULL 时填入（避免覆盖用户后续编辑）
      db.prepare(
        'UPDATE agent SET is_public = 1, user_id = COALESCE(user_id, ?), builtin_tool_ids = ?, sub_agent_ids = ?, type = ?, system_prompt = COALESCE(system_prompt, ?) WHERE id = ?'
      ).run('guest', a.builtin_tool_ids as string, (a.sub_agent_ids as string) || '[]', a.type as string, a.system_prompt as string, a.id as string);
    } else {
      db.prepare(
        'INSERT INTO agent (id, user_id, name, description, system_prompt, type, builtin_tool_ids, sub_agent_ids, is_default, is_public, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)',
      ).run(a.id, 'guest', a.name, a.description, a.system_prompt as string, a.type, a.builtin_tool_ids, (a.sub_agent_ids as string) || '[]', a.is_default || 0, Date.now(), Date.now());
    }
  } catch {}
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
      `# 网站自动化任务\n\n用内置 pageAgent 驱动真实浏览器完成网站操作任务。配合「浏览器记住密码」可自动登录已保存凭证的站点；配合「定时任务」可每日自动执行。\n\n## 流程\n1. 确认目标站点密码已在「浏览器 → 密码管理」保存\n2. 委派 pageAgent：\n   - browser_login_saved { host } 自动登录\n   - browser_get_page_info 了解页面\n   - browser_fill_form / browser_click / browser_search / browser_submit_form 执行操作\n   - browser_next_page 翻页\n   - browser_get_visible_text 获取结果\n3. 周期任务：创建 scheduled_task（cron + prompt + 绑定默认助理）\n\n## 示例\n- 每日签到：browser_login_saved → 找签到按钮 → browser_click → 确认积分\n- 制作视频：browser_login_saved → 进创作页 → browser_fill_form 填文案 → 生成 → 等待完成\n\n详见 .claude/skills/web-task-automation/SKILL.md`,
      '自动化', 'yan-zhi', 1, 0, 'builtin', Date.now(),
    );
  } else {
    db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?").run(skillId);
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
      `# 即梦每日签到领灵感值\n\n自动登录即梦（Dreamina，jimeng.jianying.com）完成每日签到，领取灵感值/积分。配合定时任务可每日自动执行。\n\n## ⚠️ 重要约束\n- 目标站固定 https://jimeng.jianying.com/，禁止访问 dreamina.ai 等国际版。\n- 登录只走扫码（ask_user），禁止代填手机号/验证码。\n- 登录态由 persist:browser-view partition 持久化，首次扫码后复用。\n\n## 登录说明\n即梦用抖音扫码/手机号验证码登录（非账密表单）。pageAgent 通过 ask_user 弹窗让用户在浏览器面板扫码，登录后 cookie 保留可复用。优先扫码，不要代填验证码。\n\n## 流程\n1. browser_navigate { url: "https://jimeng.jianying.com/" }\n2. browser_get_page_info → 检查登录状态（有头像=已登录，有登录按钮=未登录）\n3. 若未登录：ask_user { question: "请在浏览器面板中扫码登录即梦，登录完成后点击确认" } → 用户扫码+确认 → browser_get_page_info 确认已登录\n4. browser_get_page_info → 找"签到/打卡/领灵感"按钮\n5. browser_click { selector: "签到按钮" }\n6. browser_get_visible_text → 确认"签到成功/获得 X 灵感值"（若"今日已签到"则正常结束）\n7. 周期任务：scheduled_task cron "0 9 * * *" + prompt "登录即梦签到领灵感值"\n\n详见 .claude/skills/jimeng-daily-checkin/SKILL.md`,
      '自动化', 'yan-zhi', 1, 0, 'builtin', Date.now(),
    );
  } else {
    db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?").run(skillId);
  }
} catch {}

// 预置内置 skill：文档处理 / 代码安全 / 清华 AIR 开源（批量 upsert）
try {
  const builtinSkills = [
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
      body: `# 多平台购物对比\n\n用 pageAgent 去淘宝/京东/拼多多搜索同一关键词，跨平台对比。\n\n## 维度\n价格/划线价/到手价、销量/月销、评分+评论摘要、优惠/券/满减/百亿补贴、物流/发货地、店铺信息\n\n## 工具\n- web_search(timeRange) 搜候选平台；browser_new_tab/switch_tab/close_tab/get_tabs 多标签并行打开各平台搜索页\n- browser_extract_list 批量提取商品列表（title/price/link/sales/rating/shop）；browser_wait_for_request 确认异步加载\n- browser_visual_locate+image_analyze 识别弹窗；browser_scroll_into_view/is_visible 处理懒加载\n- compare_products 汇总：同款匹配+到手价归一化+可信度评分+评论情感分析 → Markdown 对比报告\n\n## 流程（推荐）\n1. 确认关键词与筛选（官方/旗舰/规格）\n2. web_search(timeRange="近7天") 搜候选平台与价格区间\n3. browser_new_tab 并行打开淘宝/京东/拼多多搜索页\n4. browser_wait_for_request 等列表异步加载完成\n5. browser_extract_list 提取各平台前 N 商品；提取不到用 scroll_into_view 触发懒加载或 get_page_info+get_visible_text 兜底\n6. 按需 browser_click 进详情补评分/评论/优惠/物流\n7. compare_products 汇总比价 → 对比表+排序+评论摘要+推荐\n8. 给建议（价格/可信度/物流/售后综合）\n\n## 注意\n- 登录由 pageAgent 自处理（C3）：未登录时 pageAgent 自己 ask_user 扫码，父智能体不处理登录、不代填账号密码；cookie 持久化复用\n- 不写死选择器，每步 get_page_info 动态识别\n- 价格以详情页为准；结果仅供参考，下单以实时价为准\n- 控制节奏防反爬，遇验证码 ask_user\n\n详见 .claude/skills/multi-platform-shopping-compare/SKILL.md`,
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
  const insertStmt = db.prepare(
    'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, author, enabled, installs, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const updateStmt = db.prepare("UPDATE skill SET source = 'builtin' WHERE id = ?");
  for (const s of builtinSkills) {
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

export { db };
