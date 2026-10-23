// 数据库表结构定义（SQLite DDL，三端共用）
/**
 * 浏览器「页面指令」表 DDL —— **单一来源**（2026-10-16 · 页面内对话与页面指令方案 §5 P1）。
 *
 * 为什么单独抽出来（而不是只写在 SCHEMA_SQL 里）：这张表由**服务端路由**真实读取，
 * 而服务端并不调用 initSchema（schema 一直是客户端启动时建的）。为了不出现
 * "客户端建了表 / 服务端那条链路没有表 ⇒ 接口 500 且只在真机上暴露"，
 * 服务端启动时用同一份文本按需建表 —— 同一语义两处各写一份 DDL 是本项目的经典翻车点。
 */
export const PAGE_COMMAND_DDL = `CREATE TABLE IF NOT EXISTS browser_page_command (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,                                    -- NULL = 内置（所有人可见）；否则为创建者
  name          TEXT NOT NULL,
  description   TEXT,
  kind          TEXT NOT NULL DEFAULT 'task',             -- 'task'（P1 唯一可用）| 'script'（P2）
  body          TEXT NOT NULL,                            -- 任务描述 / 脚本源码；模板占位符形如 \${url} \${selection} \${input:提示}
  match_host    TEXT NOT NULL DEFAULT '*',                -- 'www.baidu.com' / '*.fanqieopen.com' / '*'
  match_url     TEXT,                                     -- 可选 URL 正则，优先级高于 match_host
  source        TEXT NOT NULL DEFAULT 'user',             -- 'user' | 'builtin'（与 skill.source 同口径）
  enabled       INTEGER NOT NULL DEFAULT 1,
  need_confirm  INTEGER NOT NULL DEFAULT 1,               -- P2 脚本执行前是否二次确认
  run_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);`;

/**
 * 脚本型指令的**执行审计**表（2026-10-16 · 方案 §5.4 硬约束③"审计留痕"）。
 *
 * 只记**元信息**，不存页面内容：脚本能在页面主世界读到的一切（登录态、表单值、页面正文）
 * 都不落库；`result_digest` 是执行结果的**摘要**（长度 + 短哈希），够回答"跑没跑、成没成、
 * 结果多大"，不足以还原数据。
 * ★ 与指令表同样：服务端不跑 initSchema ⇒ 这张表的 DDL 也是单一来源，路由加载时按需建。
 */
export const PAGE_COMMAND_RUN_DDL = `CREATE TABLE IF NOT EXISTS browser_command_run (
  id            TEXT PRIMARY KEY,
  command_id    TEXT NOT NULL,
  command_name  TEXT,                                    -- 快照：指令被改名/删除后审计仍可读
  command_kind  TEXT NOT NULL DEFAULT 'script',
  user_id       TEXT,
  tab_id        TEXT,
  url           TEXT,
  host          TEXT,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  duration_ms   INTEGER,
  status        TEXT NOT NULL,                           -- 'ok' | 'error' | 'aborted'
  result_digest TEXT,                                    -- 结果摘要（长度+短哈希），**不是**结果本身
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_command_run_cmd ON browser_command_run(command_id, started_at);`;

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
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 模型
CREATE TABLE IF NOT EXISTS model (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  alias TEXT,
  type TEXT NOT NULL DEFAULT 'llm',
  context_window INTEGER DEFAULT 1048576,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  capabilities_json TEXT,
  pricing_json TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
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
  space_id TEXT,
  mcp_servers_json TEXT,
  skill_ids_json TEXT,
  system_prompt TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  permission_mode TEXT NOT NULL DEFAULT 'readonly',
  task_plan_json TEXT,
  -- 会话来源标记（2026-10-16）：NULL = 普通会话；'browser-page' = 浏览器页面对话。
  -- 取值白名单与规范化见 db/conversation-source.ts（别处不要写字面量）
  source TEXT,
  source_meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversation(updated_at DESC);
-- idx_conversation_space 引用 conversation.space_id，旧库无此列；
-- 该索引已移至 initSchema 迁移块之后创建（ALTER TABLE conversation ADD COLUMN space_id 之后）。

-- 空间（文件夹）
CREATE TABLE IF NOT EXISTS space (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dir_path TEXT,
  description TEXT,
  task_type TEXT,
  task_config_json TEXT,
  parent_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_space_updated ON space(sort_order ASC, updated_at DESC);

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
  parent_tool_call_id TEXT,
  sub_agent_id TEXT,
  sub_agent_name TEXT,
  sub_agent_depth INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_conv ON message(conversation_id, created_at);
-- idx_message_parent_tc 引用 message.parent_tool_call_id，旧库无此列；
-- 该索引已移至 initSchema 迁移块之后创建（ALTER TABLE message ADD COLUMN parent_tool_call_id 之后）。
-- ★ tool_call 表已删除（P4，2026-10-04）：建表后全仓库零写入零读取（死表）；
--   工具调用审计实际由 message.tool_calls_json + path_access_audit + file_change 承载。
--   老库里的遗留表不迁移不清理（无引用，无害）。

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
  max_tokens INTEGER NOT NULL DEFAULT 65536,
  top_p REAL NOT NULL DEFAULT 1.0,
  frequency_penalty REAL NOT NULL DEFAULT 0,
  presence_penalty REAL NOT NULL DEFAULT 0,
  platform_id TEXT,
  model_id TEXT,
  workflow_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  inputs_schema_json TEXT,
  config_json TEXT,
  parent_agent_id TEXT,
  -- 智能体分类：main=主智能体（可在会话中直接选中）/ sub=子智能体（仅供其他智能体通过 sub_agent_ids 引用委派）
  agent_kind TEXT NOT NULL DEFAULT 'main',
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
  files_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Skill 蒸馏草稿（2026-10-15，对标 WorkMateAI 融合方案 P0-1）
-- 三屏工作台的蒸馏任务从内存改落库，刷新/换设备不丢；
-- overview_json = 两段式生成的「技能概览」中间态（可编辑），result_md = 提炼出的 SKILL.md 全文。
CREATE TABLE IF NOT EXISTS skill_draft (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'overview',
  source_conv_id TEXT,
  source_msg_ids_json TEXT,
  overview_json TEXT,
  result_md TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skill_draft_user ON skill_draft(user_id, updated_at DESC);

-- ★ model_call 表已删除（P4，2026-10-04）：建表后全仓库零写入零读取（死表）；
--   模型调用记录实际以 message 表 + llm-logs 只读路由（联表查询）为准。
--   老库里的遗留表不迁移不清理（无引用，无害）。

-- 自定义工具
CREATE TABLE IF NOT EXISTS custom_tool (
  id TEXT PRIMARY KEY,
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
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'local',
  remote_source_id TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 远程商城源
CREATE TABLE IF NOT EXISTS remote_marketplace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  auth_config_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- 远程市场缓存
CREATE TABLE IF NOT EXISTS marketplace_cache (
  id TEXT PRIMARY KEY,
  remote_id TEXT NOT NULL REFERENCES remote_marketplace(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  UNIQUE(remote_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_cache_remote ON marketplace_cache(remote_id, item_type);

-- 会话文件（分类管理：上传/中间产物/交付物）
CREATE TABLE IF NOT EXISTS conversation_file (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  space_id TEXT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'intermediate',
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'agent',
  message_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_file_conv ON conversation_file(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_file_cat ON conversation_file(conversation_id, category);

-- 知识库（本地模式 / guest 不登录也可用）
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_doc (
  id TEXT PRIMARY KEY,
  base_id TEXT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
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
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_doc_base ON knowledge_doc(base_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_base ON knowledge_chunk(base_id, doc_id);

-- 对话定时任务
CREATE TABLE IF NOT EXISTS scheduled_task (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT,
  cron_expr TEXT,
  interval_minutes INTEGER,
  conversation_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_enabled ON scheduled_task(enabled, next_run_at);

-- 定时任务分组
CREATE TABLE IF NOT EXISTS scheduled_task_group (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_group_order ON scheduled_task_group(sort_order);

-- 插件
CREATE TABLE IF NOT EXISTS plugin (
  id          TEXT PRIMARY KEY,
  manifest    TEXT NOT NULL,
  state       TEXT NOT NULL,
  config      TEXT,
  version     TEXT NOT NULL,
  source      TEXT NOT NULL,
  error       TEXT,
  installed_at INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 插件私有存储
CREATE TABLE IF NOT EXISTS plugin_storage (
  plugin_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT,
  PRIMARY KEY (plugin_id, key),
  FOREIGN KEY (plugin_id) REFERENCES plugin(id) ON DELETE CASCADE
);

-- 店铺运营业务表（2026-10-22 重构方案 §3.2 · 真源在 SQLite，连接登记仍在 plugin_storage）
-- 商品：shop_id 对应 connections.id；无货源商品 supply_mode='dropship'，stock 恒 0 不参与口径
CREATE TABLE IF NOT EXISTS shop_product (
  id             TEXT PRIMARY KEY,
  shop_id        TEXT NOT NULL,
  sku            TEXT NOT NULL,
  title          TEXT NOT NULL,
  image_url      TEXT,
  category       TEXT,
  supply_mode    TEXT NOT NULL DEFAULT 'stocked',
  source_ref     TEXT,
  cost_cents     INTEGER NOT NULL DEFAULT 0,
  price_cents    INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'CNY',
  stock          INTEGER NOT NULL DEFAULT 0,
  safety_stock   INTEGER NOT NULL DEFAULT 0,
  listing_status TEXT NOT NULL DEFAULT 'draft',
  attrs_json     TEXT DEFAULT '{}',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE(shop_id, sku)
);

-- 订单：status 流转 pending|paid|sourcing|shipped|completed|refunded；items_json 存 [{sku,title,qty,priceCents}]
CREATE TABLE IF NOT EXISTS shop_order (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL,
  order_no     TEXT NOT NULL,
  buyer        TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'CNY',
  status       TEXT NOT NULL DEFAULT 'pending',
  items_json   TEXT NOT NULL DEFAULT '[]',
  address_json TEXT DEFAULT '{}',
  attrs_json   TEXT DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER,
  UNIQUE(shop_id, order_no)
);

-- 发货单：carrier 对应 SHOP_PLATFORMS 的物流平台 id；订单/发货不允许删除，只允许状态流转
CREATE TABLE IF NOT EXISTS shop_shipment (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL,
  order_id     TEXT NOT NULL,
  carrier      TEXT,
  tracking_no  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  shipped_at   INTEGER,
  delivered_at INTEGER,
  note         TEXT,
  created_at   INTEGER NOT NULL
);

-- 库存流水：kind=in|out|adjust|reserve；actor=human|ai；防超卖靠事务内 UPDATE ... WHERE stock >= ?
CREATE TABLE IF NOT EXISTS shop_stock_move (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  before_qty  INTEGER NOT NULL,
  after_qty   INTEGER NOT NULL,
  reason      TEXT,
  actor       TEXT NOT NULL DEFAULT 'human',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_product_shop ON shop_product(shop_id, listing_status);
CREATE INDEX IF NOT EXISTS idx_shop_order_shop   ON shop_order(shop_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_ship_shop    ON shop_shipment(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_stock_shop   ON shop_stock_move(shop_id, product_id, created_at);

-- 无货源采购单（2026-10-22）：出单后去 1688 采购、供应商直发；付款一律人工
CREATE TABLE IF NOT EXISTS shop_purchase (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL,
  order_id         TEXT NOT NULL,
  product_id       TEXT,
  sku              TEXT NOT NULL,
  offer_ref        TEXT NOT NULL,
  qty              INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents  INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'planned', -- planned|ordered|paid|received|cancelled
  note             TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_purchase_shop ON shop_purchase(shop_id, status, created_at);

-- 浏览器「页面指令」（2026-10-16 · 页面内对话与页面指令方案 §5 的 P1）
-- 一条指令 = 站点匹配 + 一段"任务描述"（kind='task'，走页面内对话通道执行）。
-- kind='script'（页面脚本）留到 P2：脚本在页面主世界跑、可读 cookie/带凭据 fetch，
-- 默认权限口径（每次确认 / 白名单 / 审计）待拍板，字段先占位不启用。
${PAGE_COMMAND_DDL}
${PAGE_COMMAND_RUN_DDL}
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
  for (const table of ['platform', 'model']) {
    try {
      await execFn(`ALTER TABLE ${table} ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0;`);
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
    { name: 'max_tokens',     def: 'INTEGER NOT NULL DEFAULT 65536' },
    { name: 'top_p',          def: 'REAL NOT NULL DEFAULT 1.0' },
    { name: 'frequency_penalty', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'presence_penalty',  def: 'REAL NOT NULL DEFAULT 0' },
  ];
  for (const col of agentCols) {
    try { await execFn(`ALTER TABLE agent ADD COLUMN ${col.name} ${col.def};`); } catch { /* 列已存在 */ }
  }
  // 迁移：message.system_prompt_snapshot
  try { await execFn(`ALTER TABLE message ADD COLUMN system_prompt_snapshot TEXT;`); } catch { /* 列已存在 */ }
  // ★ 2026-10-12 P2：提示词快照去重用的**内容寻址** blob 表（落库/回填见 server 的
  //   services/context-snapshot.ts；表结构与 server db.ts 的同名迁移保持一致）。
  try {
    await execFn(`CREATE TABLE IF NOT EXISTS snapshot_blob (
      hash TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
    );`);
  } catch { /* 已存在 */ }
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
  // 迁移：skill 表新增商城相关字段
  for (const col of ['remote_source_id', 'is_public']) {
    try { await execFn(`ALTER TABLE skill ADD COLUMN ${col} TEXT;`); } catch { /* 列已存在 */ }
  }
  // 迁移：skill 子目录文件（2026-10-06，files_json = [{path, content}]）
  try { await execFn(`ALTER TABLE skill ADD COLUMN files_json TEXT;`); } catch { /* 列已存在 */ }
  try { await execFn(`ALTER TABLE skill ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;`); } catch {
    try { await execFn(`ALTER TABLE skill ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;`); } catch { /* 已存在 */ }
  }
  // 迁移：agent 表新增商城相关字段
  for (const col of ['source', 'remote_source_id', 'is_public']) {
    const def = col === 'is_public' ? 'INTEGER NOT NULL DEFAULT 0' : 'TEXT';
    try { await execFn(`ALTER TABLE agent ADD COLUMN ${col} ${def};`); } catch { /* 列已存在 */ }
  }
  // 迁移：agent 表新增 Harness 模式 + 挂载字段
  try { await execFn(`ALTER TABLE agent ADD COLUMN type TEXT NOT NULL DEFAULT 'harness';`); } catch { /* 列已存在 */ }
  for (const col of ['builtin_tool_ids', 'custom_tool_ids', 'mcp_tool_mounts', 'skill_ids', 'sub_agent_ids']) {
    try { await execFn(`ALTER TABLE agent ADD COLUMN ${col} TEXT;`); } catch { /* 列已存在 */ }
  }
  // 迁移：agent 表新增 is_builtin 列（内置智能体标记，E4）
  try { await execFn(`ALTER TABLE agent ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0;`); } catch { /* 列已存在 */ }
  // 迁移：agent 表新增 ontology_ids 列（本体挂载，数据查询智能体取数范围约束）
  try { await execFn(`ALTER TABLE agent ADD COLUMN ontology_ids TEXT DEFAULT '[]';`); } catch { /* 列已存在 */ }
  // 迁移：agent 表新增 knowledge_base_ids 列（知识库挂载，知识库检索范围约束）
  try { await execFn(`ALTER TABLE agent ADD COLUMN knowledge_base_ids TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：agent 表新增 category 列（智能体自定义分类标签）
  try { await execFn(`ALTER TABLE agent ADD COLUMN category TEXT DEFAULT '';`); } catch { /* 列已存在 */ }
  // 迁移：custom_tool / agent 新增 installs 计数列（商城安装计数）
  for (const t of ['custom_tool', 'agent']) {
    try { await execFn(`ALTER TABLE ${t} ADD COLUMN installs INTEGER NOT NULL DEFAULT 0;`); } catch { /* 列已存在 */ }
  }
  // 迁移：conversation 新增 space_id 列（空间/文件夹功能）
  try { await execFn(`ALTER TABLE conversation ADD COLUMN space_id TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：conversation 新增 agent_id 列（会话记住绑定的智能体，旧库可能缺失）
  try { await execFn(`ALTER TABLE conversation ADD COLUMN agent_id TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：conversation 新增 permission_mode 列（会话级工具权限：readonly/default/full）
  // ★ 默认 readonly（2026-09-27 用户拍板：默认全放行太危险；此迁移仅对新库生效）
  try { await execFn(`ALTER TABLE conversation ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'readonly';`); } catch { /* 列已存在 */ }
  // 迁移：conversation 新增 task_plan_json 列（task_plan/task_step 的落盘，刷新/换设备后计划卡片可恢复）
  try { await execFn(`ALTER TABLE conversation ADD COLUMN task_plan_json TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：conversation 新增 task_type 列（2026-10-14「父任务」层：多任务目录里每条任务各选一条子线，
  //   任务级优先于目录级 space.task_type；NULL = 跟随目录）
  try { await execFn(`ALTER TABLE conversation ADD COLUMN task_type TEXT;`); } catch { /* 列已存在 */ }
  // ── 会话生命周期三列（2026-10-16「归档 + 回收站」）──────────────────────────
  // ★ 一律用 **nullable 时间戳**而不是 0/1 布尔：既表达"是否处于该状态"又携带"何时进入"，
  //   列表排序/展示不需要第二个字段（与 WorkBuddy sessions 表的 deleted_at 同范式）。
  //   NULL = 不在该状态；非 NULL = 处于该状态，值是进入时的毫秒时间戳。
  for (const col of ['archived_at', 'deleted_at', 'last_activity_at']) {
    try { await execFn(`ALTER TABLE conversation ADD COLUMN ${col} INTEGER;`); } catch { /* 列已存在 */ }
  }
  // last_activity_at 独立于 updated_at：自动归档（7/14/30 天不活跃）的判据必须是它，
  // 因为将来若有人给 PATCH 补刷 updated_at，用 updated_at 会让"改个名也算活跃"、计时被静默重置。
  try { await execFn(`UPDATE conversation SET last_activity_at = COALESCE(last_activity_at, updated_at) WHERE last_activity_at IS NULL;`); } catch { /* 旧库无列时跳过 */ }
  // 列表默认只看未归档+未删除的会话 ⇒ 这两列会出现在每条列表 SQL 里，建索引避免全表扫
  try { await execFn(`CREATE INDEX IF NOT EXISTS idx_conversation_lifecycle ON conversation(deleted_at, archived_at);`); } catch { /* 索引已存在 */ }
  // 迁移：conversation 新增来源标记两列（2026-10-16 浏览器页面对话落库可查）。
  //   source = NULL 普通会话 / 'browser-page' 页面对话；白名单与规范化见 db/conversation-source.ts。
  //   ★ 必须是**可空**列：存量会话一律 NULL，不需要回填（NULL 就是"普通会话"这个默认语义）。
  try { await execFn(`ALTER TABLE conversation ADD COLUMN source TEXT;`); } catch { /* 列已存在 */ }
  try { await execFn(`ALTER TABLE conversation ADD COLUMN source_meta_json TEXT;`); } catch { /* 列已存在 */ }
  // 来源过滤是列表查询的条件之一（历史弹窗按 source 拉），建索引避免全表扫。
  // ★★★ 这里**不能**照抄服务端的 `(user_id, source)`：**core 的 conversation 表没有 user_id 列**
  //   （用户归属只存在于服务端库）。照抄的后果是 CREATE INDEX 直接失败 —— 而且被下面的
  //   catch 吞成"索引已存在"，静默无索引（本测试就是这么发现的：断言里找不到这个索引）。
  try { await execFn(`CREATE INDEX IF NOT EXISTS idx_conversation_source ON conversation(source);`); } catch { /* 索引已存在 */ }
  // 迁移：space 新增 task_type / task_config_json 列（「目录即任务」：目录绑定任务类型 + 类型覆盖配置）
  try { await execFn(`ALTER TABLE space ADD COLUMN task_type TEXT;`); } catch { /* 列已存在 */ }
  try { await execFn(`ALTER TABLE space ADD COLUMN task_config_json TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：space 新增 parent_id 列（2026-10-17「父任务目录」：子目录=子空间，挂在父任务目录下）。
  //   NULL = 顶层空间；服务端 sync-subdirs 负责把磁盘子文件夹收编成子空间。
  try { await execFn(`ALTER TABLE space ADD COLUMN parent_id TEXT;`); } catch { /* 列已存在 */ }
  // 迁移完成后创建引用 space_id 的索引（旧库迁移场景：旧 conversation 表无 space_id 列）
  try { await execFn(`CREATE INDEX IF NOT EXISTS idx_conversation_space ON conversation(space_id);`); } catch { /* 索引已存在 */ }
  // 迁移：message 表新增子智能体关联字段（子智能体中间过程持久化）
  for (const col of [
    { name: 'parent_tool_call_id', def: 'TEXT' },
    { name: 'sub_agent_id',        def: 'TEXT' },
    { name: 'sub_agent_name',      def: 'TEXT' },
    { name: 'sub_agent_depth',     def: 'INTEGER' },
  ]) {
    try { await execFn(`ALTER TABLE message ADD COLUMN ${col.name} ${col.def};`); } catch { /* 列已存在 */ }
  }
  try { await execFn(`CREATE INDEX IF NOT EXISTS idx_message_parent_tc ON message(parent_tool_call_id);`); } catch { /* 索引已存在 */ }
  // 迁移：message 归属用户（server 侧 INSERT / 按用户删除均带此列，旧库缺列会报 no such column: user_id）
  try { await execFn(`ALTER TABLE message ADD COLUMN user_id TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：scheduled_task 新增 group_id 列（定时任务分组）
  try { await execFn(`ALTER TABLE scheduled_task ADD COLUMN group_id TEXT;`); } catch { /* 列已存在 */ }
  // 迁移：新调度模型 schedule_json / expire_at
  try { await execFn(`ALTER TABLE scheduled_task ADD COLUMN schedule_json TEXT;`); } catch { /* 列已存在 */ }
  try { await execFn(`ALTER TABLE scheduled_task ADD COLUMN expire_at INTEGER;`); } catch { /* 列已存在 */ }
}

/** 内置 skill 种子数据（三端共用，桌面端/移动端本地 sqlite 与服务端均会 upsert） */
export const BUILTIN_SKILLS_SEED = [
  {
    id: 'skill_web_task_automation',
    name: '网站自动化任务',
    description: '用 pageAgent 驱动浏览器完成登录、签到、领积分、填表单、搜索、翻页、提交、制作内容等网站自动化任务，支持用已存密码自动登录，可配合定时任务每日执行。',
    source: 'builtin',
    triggers: ['每日签到', '自动登录', '领取积分', '制作视频', '填写表单', '网站自动化'],
    category: '自动化',
    author: 'yan-zhi',
    bodyMd: `# 网站自动化任务

用内置 pageAgent 驱动真实浏览器完成网站操作任务。配合「浏览器记住密码」可自动登录已保存凭证的站点；配合「定时任务」可每日自动执行。

## 流程
1. 确认目标站点密码已在「浏览器 → 密码管理」保存
2. 委派 pageAgent：
   - browser_login_saved { host } 自动登录
   - browser_get_page_info 了解页面
   - browser_fill_form / browser_click / browser_search / browser_submit_form 执行操作
   - browser_next_page 翻页
   - browser_get_visible_text 获取结果
3. 周期任务：创建 scheduled_task（cron + prompt + 绑定默认助理）

## 示例
- 每日签到：browser_login_saved → 找签到按钮 → browser_click → 确认积分
- 制作视频：browser_login_saved → 进创作页 → browser_fill_form 填文案 → 生成 → 等待完成

详见 .claude/skills/web-task-automation/SKILL.md`,
  },
  {
    id: 'skill_jimeng_daily_checkin',
    name: '即梦每日签到',
    description: '每天自动登录即梦（Dreamina，字节跳动 AI 创作平台）并签到领取灵感值/积分。即梦用抖音扫码登录，首次需手动扫码，之后配合定时任务每日自动签到。',
    source: 'builtin',
    triggers: ['即梦签到', '即梦每天签到', '即梦领积分', '即梦灵感值', 'Dreamina签到', '每日签到'],
    category: '自动化',
    author: 'yan-zhi',
    bodyMd: `# 即梦每日签到领灵感值

自动登录即梦（Dreamina，jimeng.jianying.com）完成每日签到，领取灵感值/积分。配合定时任务可每日自动执行。

## ⚠️ 重要约束
- 目标站固定 https://jimeng.jianying.com/，禁止访问 dreamina.ai 等国际版。
- 登录只走扫码（ask_user 提示用户扫码），禁止代填手机号/验证码。
- 登录态由 persist:browser-view partition 持久化，首次扫码后复用。

## 登录说明
即梦用抖音扫码/手机号验证码登录（非账密表单）。pageAgent 通过 ask_user 弹窗让用户在浏览器面板扫码，登录后 cookie 保留可复用。优先扫码，不要代填验证码。

## 流程
1. browser_navigate { url: "https://jimeng.jianying.com/" }
2. browser_get_page_info → 检查登录状态（有头像=已登录，有登录按钮=未登录）
3. 若未登录：ask_user { question: "请在浏览器面板中扫码登录即梦，登录完成后点击确认" } → 用户扫码+确认 → browser_get_page_info 确认已登录
4. browser_get_page_info → 找"签到/打卡/领灵感"按钮
5. browser_click { selector: "签到按钮" }
6. browser_get_visible_text → 确认"签到成功/获得 X 灵感值"（若"今日已签到"则正常结束）
7. 周期任务：scheduled_task cron "0 9 * * *" + prompt "登录即梦签到领灵感值"

详见 .claude/skills/jimeng-daily-checkin/SKILL.md`,
  },
  {
    id: 'skill_pptx_creation',
    name: 'PPT 制作',
    description: '创建、编辑、解析 PowerPoint 演示文稿（.pptx）。通过 python-pptx 生成专业幻灯片，支持自定义布局、图表、图片、表格、演讲者备注。',
    source: 'builtin',
    triggers: ['做PPT', '制作幻灯片', '生成演示文稿', '解析PPT', 'PPT制作', 'presentation'],
    category: '文档处理',
    author: 'yan-zhi',
    bodyMd: `# PPT 制作与编辑\n\n用 python-pptx 创建、编辑、解析 PowerPoint 演示文稿，通过 shell 执行 Python 脚本生成 .pptx。\n\n## 依赖\n\`\`\`bash\npip install python-pptx Pillow\n\`\`\`\n\n## 流程\n1. 理解需求：主题、页数、每页内容、风格\n2. 编写 python-pptx 脚本（标题页 + 内容页 + 图表/图片）\n3. shell 执行脚本生成 .pptx\n4. 回报文件路径\n\n## 设计要点\n- 配色与主题相关，深色背景配浅色文字\n- 每页有视觉元素（图片/图表/色块），避免纯文字\n- 标题 36-44pt，正文 14-16pt\n- 坐标用 Inches()，颜色用 RGBColor(r,g,b)\n\n详见 .claude/skills/pptx-creation/SKILL.md`,
  },
  {
    id: 'skill_docx_processing',
    name: 'Word 文档处理',
    description: '创建、编辑、解析 Word 文档（.docx）。通过 python-docx 生成带格式文档，支持标题、目录、表格、图片、页眉页脚、样式。',
    source: 'builtin',
    triggers: ['写Word文档', '生成报告', '制作合同', '编辑docx', '提取Word内容', 'Word文档'],
    category: '文档处理',
    author: 'yan-zhi',
    bodyMd: `# Word 文档处理\n\n用 python-docx 创建、编辑、解析 Word 文档，通过 shell 执行 Python 脚本生成 .docx。\n\n## 依赖\n\`\`\`bash\npip install python-docx\n\`\`\`\n\n## 流程\n1. 理解需求：文档类型（报告/合同/信函）、结构、内容\n2. 编写 python-docx 脚本（标题 + 段落 + 表格 + 图片）\n3. shell 执行生成 .docx\n4. 回报文件路径\n\n\n## 要点\n- 不要用 \\n 换行，用多个 add_paragraph\n- 表格用 style='Table Grid' 才有边框\n- 图片需指定 width\n\n详见 .claude/skills/docx-processing/SKILL.md`,
  },
  {
    id: 'skill_xlsx_data_processing',
    name: 'Excel/数据处理',
    description: '处理 Excel/CSV 电子表格数据。通过 pandas + openpyxl 读写数据、计算公式、格式化、图表，支持数据清洗、聚合、透视、多表合并。',
    source: 'builtin',
    triggers: ['处理Excel', '分析表格数据', '清洗数据', '生成报表', '合并CSV', '数据处理'],
    category: '文档处理',
    author: 'yan-zhi',
    bodyMd: `# Excel/数据处理\n\n用 pandas + openpyxl 处理 Excel/CSV 数据，通过 shell 执行 Python 脚本。\n\n## 依赖\n\`\`\`bash\npip install pandas openpyxl xlsxwriter\n\`\`\`\n\n## 流程\n1. 读取数据（read_excel/read_csv）\n2. 数据清洗（去重/填充空值/类型转换）\n3. 聚合分析（groupby/pivot_table/筛选/排序）\n4. 写入输出（to_excel + openpyxl 格式化）\n5. 回报行数列数 + 输出路径\n\n## 要点\n- CSV 中文用 encoding="utf-8-sig"\n- 公式以 = 开头写入单元格\n\n详见 .claude/skills/xlsx-data-processing/SKILL.md`,
  },
  {
    id: 'skill_pdf_processing',
    name: 'PDF 处理',
    description: '处理 PDF 文件：提取文本表格、合并/拆分、旋转/水印、创建新 PDF、OCR 扫描件、加密解密。通过 pypdf + pdfplumber + reportlab 处理。',
    source: 'builtin',
    triggers: ['提取PDF', '合并PDF', '拆分PDF', 'PDF加水印', 'PDF处理', '创建PDF'],
    category: '文档处理',
    author: 'yan-zhi',
    bodyMd: `# PDF 处理\n\n用 pypdf + pdfplumber + reportlab 处理 PDF，通过 shell 执行 Python 脚本。\n\n## 依赖\n\`\`\`bash\npip install pypdf pdfplumber reportlab\n# OCR 可选：pip install pytesseract pdf2image\n\`\`\`\n\n## 能力\n- 提取文本/表格：pdfplumber\n- 合并/拆分/旋转/水印/加密：pypdf\n- 创建新 PDF：reportlab\n- OCR 扫描件：pytesseract（需 tesseract + chi_sim）\n\n详见 .claude/skills/pdf-processing/SKILL.md`,
  },
  {
    id: 'skill_code_security_audit',
    name: '代码安全审计',
    description: '代码安全审计与漏洞扫描。检查 SQL 注入、XSS、硬编码密钥、路径遍历、命令注入、不安全反序列化等常见漏洞，支持多语言，结合 semgrep/bandit 工具扫描 + 人工审查清单。',
    source: 'builtin',
    triggers: ['安全审计', '漏洞扫描', '代码安全检查', '安全审查', '代码安全'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# 代码安全审计\n\n对代码进行安全审计，检查 OWASP Top 10 常见漏洞。结合静态分析工具 + 人工审查清单。\n\n## 工具\n- semgrep（多语言通用）：semgrep --config auto ./src\n- bandit（Python）：bandit -r ./src\n- eslint-plugin-security（JS/TS）\n- 依赖审计：npm audit / pip-audit\n\n## 检查清单\n1. SQL 注入（参数化查询？）\n2. XSS（innerHTML 转义？）\n3. 硬编码密钥（环境变量？）\n4. 路径遍历（路径校验？）\n5. 命令注入（shell=True？）\n6. 不安全反序列化（pickle/eval？）\n7. 认证授权（接口鉴权？）\n8. 传输安全（HTTPS？）\n\n## 输出\n按严重/高危/中危/低危分类，每项给修复建议和代码示例。\n\n详见 .claude/skills/code-security-audit/SKILL.md`,
  },
  {
    id: 'skill_codegeex_chatglm',
    name: '对接清华开源大模型',
    description: '对接清华开源大模型（CodeGeeX 代码生成 / ChatGLM 对话 / 智谱 GLM 系列）。指导在平台管理中添加智谱 AI 的 OpenAI 兼容 API，配置模型并测试连通性。',
    source: 'builtin',
    triggers: ['配置CodeGeeX', '接入ChatGLM', '用智谱API', '切换GLM模型', '清华大模型', '智谱AI'],
    category: '平台配置',
    author: 'yan-zhi',
    bodyMd: `# 对接清华开源大模型\n\n指导在言智平台配置清华开源大模型（CodeGeeX / ChatGLM / 智谱 GLM 系列），通过 OpenAI 兼容 API 接入。\n\n## 流程\n1. 获取 API Key：https://open.bigmodel.cn/ 注册创建\n2. 平台管理添加：\n   - 名称：智谱 AI\n   - 协议：openai\n   - API 地址：https://open.bigmodel.cn/api/paas/v4/\n   - API Key：用户密钥\n3. 配置模型：glm-4-plus / glm-4-air / glm-4-flash(免费) / codegeex-4(代码) / glm-4v(视觉)\n4. 测试连通性\n\n## CodeGeeX 用途\n代码补全/生成/翻译/注释/Bug修复，编程场景优先选 codegeex-4\n\n## 自建部署\nvLLM 部署 GLM-4-9B，暴露 OpenAI 兼容接口，API 地址填 http://<IP>:8000/v1/\n\n详见 .claude/skills/codegeex-chatglm/SKILL.md`,
  },
  {
    id: 'skill_openbiomed',
    name: 'OpenBioMed 生物医药 AI',
    description: '对接清华 AIR（智能产业研究院）OpenBioMed 生物医药 AI 开源工具链。覆盖药物发现、分子生成、蛋白质结构预测、医学影像分析、生物信息学等场景。',
    source: 'builtin',
    triggers: ['药物发现', '分子生成', '蛋白质结构预测', '医学影像分析', 'OpenBioMed', '生物信息学'],
    category: '科研',
    author: 'yan-zhi',
    bodyMd: `# OpenBioMed 生物医药 AI\n\n对接清华 AIR 主导的 OpenBioMed 开源生物医药 AI 工具链。\n\n## 能力\n- 药物发现：靶点识别、虚拟筛选、活性预测\n- 分子生成：按属性约束生成新分子（SMILES）\n- 蛋白质分析：结构预测、功能注释、对接\n- 医学影像：CT/MRI/病理 AI 辅助\n- 生物信息学：序列分析、基因表达\n\n## 依赖\n\`\`\`bash\npip install torch rdkit-pypi biopython numpy scipy pandas\n# OpenMAIC 工具链从清华 AIR 获取\n\`\`\`\n\n## 注意\n- 结果仅供参考，不能替代专业医学判断\n- 患者数据需脱敏，遵守隐私法规\n- 部分模型需 GPU\n\n详见 .claude/skills/openbiomed-skills/SKILL.md`,
  },
  {
    id: 'skill_openmaic_education',
    name: 'OpenMAIC 教育 AI',
    description: '对接清华 AIR（智能产业研究院）OpenMAIC 教育 AI 开源平台。覆盖智能出题、学情分析、个性化学习路径、自动批改、教学辅助等场景。',
    source: 'builtin',
    triggers: ['智能出题', '学情分析', '个性化学习', '自动批改', 'OpenMAIC', '教育AI'],
    category: '科研',
    author: 'yan-zhi',
    bodyMd: `# OpenMAIC 教育 AI\n\n对接清华 AIR 主导的 OpenMAIC 开源教育 AI 平台。\n\n## 能力\n- 智能出题：按知识点/难度/题型自动生成带解析的题目\n- 学情分析：分析答题数据，诊断知识薄弱点\n- 个性化学习：基于学情生成学习路径和推荐\n- 自动批改：客观题判分 + 主观题 AI 评分\n- 教学辅助：教案生成、知识点讲解\n\n## 依赖\n\`\`\`bash\npip install torch transformers\n# OpenMAIC 平台从清华 AIR 获取\n\`\`\`\n\n## 注意\n- AI 出题需教师审核\n- 主观题评分仅供参考\n- 学生数据需脱敏存储\n\n详见 .claude/skills/openmaic-education/SKILL.md`,
  },
  {
    id: 'skill_code_review',
    name: '代码审查',
    description: '代码审查（Code Review）。基于最佳实践检查代码质量、可读性、性能、错误处理、命名、重复、安全，按严重度分级输出报告，支持多语言。',
    source: 'builtin',
    triggers: ['代码审查', 'review代码', '代码走查', '审查代码', '代码review'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# 代码审查\n\n对代码系统化审查，按严重度分级输出问题与改进建议。\n\n## 检查清单\n1. 正确性（边界/异步/错误吞掉/资源释放）\n2. 可读性（命名/长函数/深嵌套）\n3. 重复与抽象\n4. 性能（循环IO/低效查找）\n5. 错误处理\n6. 安全（简要，深挖见 code-security-audit）\n7. 测试覆盖\n\n## 工具\n- eslint/ruff/golangci-lint 静态扫描\n- 圈复杂度：cr\n\n## 输出\n按 阻塞/重要/建议/表扬 分类，每项给位置+修复+代码示例。\n\n详见 .claude/skills/code-review/SKILL.md`,
  },
  {
    id: 'skill_code_refactor',
    name: '代码重构',
    description: '代码重构。识别代码坏味道（长函数/重复/深嵌套/魔法数/大类/霰弹手术），给出重构手法与重构后代码，保证行为不变。',
    source: 'builtin',
    triggers: ['重构代码', '代码重构', '消除重复', '降低复杂度', '重构一下'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# 代码重构\n\n不改行为前提下改善结构，识别坏味道并选重构手法。\n\n## 坏味道→手法\n- 长函数→提取函数\n- 深嵌套→提前返回（Guard Clauses）\n- 重复→提取公共函数/超类\n- 魔法数→命名常量\n- 大类（God Object）→拆分职责\n- switch/类型码→多态\n- 依恋情结→移动函数到数据所在类\n\n## 原则\n- 行为不变（每步跑测试）\n- 小步前进\n- 重构与加功能分开\n- 先有测试兜底再重构\n\n详见 .claude/skills/code-refactor/SKILL.md`,
  },
  {
    id: 'skill_code_explain',
    name: '代码解读',
    description: '代码解读。用通俗语言解释代码逻辑、调用关系、设计模式，可画调用链/时序图，帮助快速理解陌生代码库。',
    source: 'builtin',
    triggers: ['解释代码', '代码解读', '读懂代码', '梳理逻辑', '这个函数干嘛的'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# 代码解读\n\n帮助理解陌生代码，分层解释职责与逻辑，可配 mermaid 画调用链/时序。\n\n## 流程\n1. 定位代码\n2. 通读 + 依赖 + 调用方\n3. 先整体后细节（先做什么再怎么做）\n4. 关系梳理（调用方/被调用/数据流）\n5. 可视化（mermaid graph/sequence）\n6. 一句话总结核心职责\n\n## 建心智模型\n找入口→看目录分层→走一个典型用例→理核心数据模型\n\n详见 .claude/skills/code-explain/SKILL.md`,
  },
  {
    id: 'skill_unit_test_gen',
    name: '单元测试生成',
    description: '单元测试生成。为函数/类/模块生成单测，支持 pytest/jest/vitest/go test/JUnit，覆盖正常/边界/异常，遵循 AAA 结构。',
    source: 'builtin',
    triggers: ['写单测', '生成测试', '补测试用例', '加单元测试', '单元测试'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# 单元测试生成\n\n为已有代码生成单测，覆盖正常/边界/异常，AAA 结构。\n\n## 框架\n- Python: pytest\n- JS/TS: jest / vitest\n- Go: go test\n- Java: JUnit\n\n## 用例\n正常路径 + 边界值（空/0/负/越界）+ 异常分支\n\n## 要点\n- 隔离依赖（mock/stub 外部）\n- 单一断言、命名达意\n- 不测私有实现，通过公开接口测行为\n- 生成后跑一遍修失败\n- 覆盖率：pytest --cov / vitest --coverage\n\n详见 .claude/skills/unit-test-gen/SKILL.md`,
  },
  {
    id: 'skill_git_workflow',
    name: 'Git 工作流',
    description: 'Git 工作流助手。覆盖分支管理、合并冲突解决、commit 规范、PR 创建、cherry-pick、rebase、回滚，含命令速查与常见报错处理。',
    source: 'builtin',
    triggers: ['解决冲突', '合并分支', '规范commit', '发PR', 'cherry-pick', 'rebase', 'git工作流'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# Git 工作流\n\n分支/合并/冲突/commit/PR/cherry-pick/rebase/回滚。\n\n## 常用\n- 冲突：编辑文件删标记 → git add → commit（放弃 git merge --abort）\n- commit 规范：feat/fix/docs/refactor/perf/test/chore(scope): subject\n- rebase：个人分支可 rebase，公共分支用 revert 不改历史\n- PR：gh pr create --title --body --base\n- 回滚：未提交 checkout/reset；已提交 revert（安全）\n\n## 原则\n- commit 写"为什么"\n- 危险操作（force push/reset --hard）前备份\n\n详见 .claude/skills/git-workflow/SKILL.md`,
  },
  {
    id: 'skill_api_design',
    name: 'API 设计',
    description: 'API 设计。覆盖 RESTful/GraphQL 设计规范、URL/方法/状态码/命名、OpenAPI 文档生成、接口 Mock，输出可对接的接口契约。',
    source: 'builtin',
    triggers: ['设计API', '定义接口', 'RESTful规范', 'OpenAPI文档', 'Mock接口', 'API设计'],
    category: '代码工程',
    author: 'yan-zhi',
    bodyMd: `# API 设计\n\n设计规范可对接的接口契约。\n\n## RESTful\n- URL 名词复数、嵌套表从属、版本前缀（/v1/）\n- 方法语义：GET 查/POST 增/PUT 替/PATCH 改/DELETE 删\n- 状态码：200/201/204/400/401/403/404/409/422/429/500\n- 统一响应体 + 错误体（code/message/details）\n- 时间用 ISO 8601，id 用带前缀字符串\n\n## 工具\n- OpenAPI 文档：redocly\n- Mock：prism mock openapi.yaml\n\n详见 .claude/skills/api-design/SKILL.md`,
  },
  {
    id: 'skill_frontend_page_build',
    name: '前端页面开发',
    description: '前端页面开发。用 Vue3/React/原生 HTML+CSS+JS 生成响应式、组件化页面，含脚手架、路由、状态管理，支持 Element Plus/Ant Design/Tailwind。',
    source: 'builtin',
    triggers: ['做个页面', '写前端页面', '搭页面', '生成Vue页面', '生成React页面', '前端页面'],
    category: '前端',
    author: 'yan-zhi',
    bodyMd: `# 前端页面开发\n\n生成可运行的前端页面，Vue3/React/原生三栈。\n\n## 流程\n1. 选技术栈与 UI 框架（Element Plus/Ant Design/Tailwind）\n2. 定页面类型（表单/列表/详情/仪表盘/落地页）\n3. 生成组件 + 路由 + 状态\n4. 响应式 + 主题\n\n## 套路\n表单页/列表页/详情页/仪表盘各有模板；组件化、移动优先、数据获取处理 loading/错误态\n\n详见 .claude/skills/frontend-page-build/SKILL.md`,
  },
  {
    id: 'skill_css_styling',
    name: 'CSS/Tailwind 样式',
    description: 'CSS/Tailwind 样式。覆盖 Flex/Grid 布局、动画、主题、响应式，含 Tailwind 类速查与暗色主题适配。',
    source: 'builtin',
    triggers: ['写样式', '调布局', '做响应式', '加动画', '暗色主题', 'Tailwind'],
    category: '前端',
    author: 'yan-zhi',
    bodyMd: `# CSS/Tailwind 样式\n\n布局/动画/主题/响应式。\n\n## 布局\n- Flex 一维、Grid 二维\n- 居中：display:grid; place-items:center\n\n## 响应式\n移动优先 + 媒体查询（sm640/md768/lg1024/xl1280）\n\n## 暗色\nCSS 变量 + prefers-color-scheme + .dark 类切换\n\n## Tailwind 速查\nflex items-center / grid grid-cols-3 gap-4 / dark:bg-gray-900 / line-clamp-2\n\n## 要点\n动画用 transform/opacity（GPU）；对比度 ≥ 4.5:1\n\n详见 .claude/skills/css-styling/SKILL.md`,
  },
  {
    id: 'skill_frontend_performance',
    name: '前端性能优化',
    description: '前端性能优化。覆盖打包体积、懒加载、渲染性能、Web Vitals（LCP/CLS/INP），用 Lighthouse 跑分并给优化建议。',
    source: 'builtin',
    triggers: ['优化性能', '页面太慢', '首屏优化', '打包体积', 'WebVitals', '前端性能'],
    category: '前端',
    author: 'yan-zhi',
    bodyMd: `# 前端性能优化\n\n测量→定位→优化→复测。\n\n## 指标\nLCP<2.5s / CLS<0.1 / INP<200ms / FCP<1.8s\n\n## 手法\n- 减体积：按需引入、代码分割、gzip/brotli、树摇、大依赖替换（moment→dayjs）\n- 首屏：路由懒加载、preload、SSR/SSG、CDN\n- 渲染：虚拟列表、防抖节流、memo、transform 动画\n- 网络：合并请求、HTTP/2、stale-while-revalidate\n\n## 工具\nlighthouse / vite-bundle-visualizer / web-vitals\n\n详见 .claude/skills/frontend-performance/SKILL.md`,
  },
  {
    id: 'skill_form_interaction',
    name: '表单与交互',
    description: '表单与交互。覆盖表单校验、弹窗/抽屉、拖拽、虚拟列表、动画交互，含 Element Plus/Ant Design 模式。',
    source: 'builtin',
    triggers: ['写表单', '加校验', '做个弹窗', '拖拽', '虚拟列表', '动画交互', '表单交互'],
    category: '前端',
    author: 'yan-zhi',
    bodyMd: `# 表单与交互\n\n表单校验/弹窗/拖拽/虚拟列表/动画交互。\n\n## 校验\n- Element Plus el-form rules / Ant Design Form rules\n- 自定义校验器（validator）\n- 提交前 validate()，异步校验防抖\n\n## 交互\n- 弹窗：ElMessageBox.confirm / Modal.confirm（await 后再执行）\n- 拖拽：vue-draggable / @dnd-kit（dragover.prevent）\n- 虚拟列表：vue-virtual-scroller / react-window\n- 动画：transition / framer-motion（transform/opacity）\n\n详见 .claude/skills/form-interaction/SKILL.md`,
  },
  {
    id: 'skill_markdown_doc',
    name: 'Markdown 文档写作',
    description: 'Markdown 文档写作。生成结构化文档，支持 mermaid 流程图/时序图/类图、表格、代码块、目录，适合 README/API 文档/技术方案/博客。',
    source: 'builtin',
    triggers: ['写文档', '写README', '写API文档', '写技术方案', '写博客', 'Markdown文档'],
    category: '文档处理',
    author: 'yan-zhi',
    bodyMd: `# Markdown 文档写作\n\n生成结构化可渲染文档。\n\n## 类型\nREADME / API 文档 / 技术方案 / 变更记录 / 博客\n\n## 元素\n- mermaid 流程/时序/类图\n- 表格、代码块（带语言）、目录、折叠 details、提示框 [!NOTE]、徽章\n\n## 要点\n- 一级标题只用一次\n- README 首屏讲清"是什么/怎么装"\n- API 文档每接口给请求/响应示例\n\n详见 .claude/skills/markdown-doc/SKILL.md`,
  },
  {
    id: 'skill_email_compose',
    name: '邮件撰写',
    description: '邮件撰写。生成商务邮件、通知、邀请、回复、催办、致歉，支持多语气（正式/委婉/直接）与中英文，含主题行与署名。',
    source: 'builtin',
    triggers: ['写邮件', '回邮件', '写通知', '写邀请函', '商务邮件', '催办邮件'],
    category: '办公',
    author: 'yan-zhi',
    bodyMd: `# 邮件撰写\n\n通知/邀请/回复/催办/致歉，多语气多语言。\n\n## 结构\n主题行 + 称呼 + 正文 + 行动号召 + 署名\n\n## 语气\n正式（对外/上级）/ 委婉（请求催办）/ 直接（内部/紧急）\n\n## 要点\n- 主题具体，加【类型】前缀\n- 一邮一旨，行动号召明确（做什么+何时）\n- 时间写绝对日期，附件正文提及\n\n详见 .claude/skills/email-compose/SKILL.md`,
  },
  {
    id: 'skill_meeting_notes',
    name: '会议纪要',
    description: '会议纪要。从录音转写/聊天记录/零散文字整理成结构化纪要，提取议题、决议、待办（负责人+截止时间）、遗留问题。',
    source: 'builtin',
    triggers: ['整理会议纪要', '总结会议', '录音整理纪要', '提取待办', '会议纪要'],
    category: '办公',
    author: 'yan-zhi',
    bodyMd: `# 会议纪要\n\n从转写/记录整理成结构化纪要。\n\n## 结构\n议题与讨论 / 决议 / 待办（负责人+截止时间）/ 遗留问题\n\n## 待办要点\n- 动宾短语、具体人名、绝对日期\n- 缺则标"待定"提醒补全\n\n## 录音\nwhisper 转写后再整理\n\n## 要点\n客观记录、会后 24h 发出、敏感信息脱敏\n\n详见 .claude/skills/meeting-notes/SKILL.md`,
  },
  {
    id: 'skill_image_processing',
    name: '图片处理',
    description: '图片处理。用 Pillow 批量压缩、格式转换、加水印、裁剪、拼接、调尺寸、调色，通过 shell 执行 Python 脚本。',
    source: 'builtin',
    triggers: ['压缩图片', '批量转格式', '加水印', '裁剪拼接', '调尺寸', '图片处理'],
    category: '办公',
    author: 'yan-zhi',
    bodyMd: `# 图片处理\n\nPillow 批量处理图片。\n\n## 能力\n压缩/转格式/加水印/裁剪/拼接/调尺寸/调色\n\n## 要点\n- PNG→JPEG 先 convert('RGB') 去透明通道\n- 压缩 quality=80~90，WebP 优先（更小+透明）\n- 水印中文用系统中文字体（msyh.ttc）\n- 保留原图，输出到新目录避免覆盖\n\n详见 .claude/skills/image-processing/SKILL.md`,
  },
  {
    id: 'skill_file_convert',
    name: '文件格式转换',
    description: '文件格式转换。文档/图片/音视频格式互转，pandoc（文档）+ ffmpeg（音视频）+ Pillow（图片）。',
    source: 'builtin',
    triggers: ['转格式', 'Markdown转Word', 'PDF转Word', '视频转MP4', '音频转MP3', 'HEIC转JPG', '文件转换'],
    category: '办公',
    author: 'yan-zhi',
    bodyMd: `# 文件格式转换\n\n文档/图片/音视频互转。\n\n## 工具\n- 文档：pandoc（MD↔Word/HTML/PDF，中文 PDF 需 xelatex+CJK 字体）\n- PDF→Word：pdf2docx\n- 音视频：ffmpeg（libx264 + aac + faststart，-crf 23 默认/28 高压缩）\n- 图片：Pillow / pillow-heif（HEIC）\n\n## 要点\n批量先建输出目录；转换后检查能否正常打开\n\n详见 .claude/skills/file-convert/SKILL.md`,
  },
  {
    id: 'skill_data_visualization',
    name: '数据可视化',
    description: '数据可视化。用 matplotlib/plotly/echarts 生成柱状/折线/饼/散点/热力/组合图，可存图片或交互 HTML。',
    source: 'builtin',
    triggers: ['画图', '生成图表', '可视化数据', '柱状图', '折线图', '饼图', '热力图'],
    category: '办公',
    author: 'yan-zhi',
    bodyMd: `# 数据可视化\n\nmatplotlib/plotly/echarts 三选一。\n\n## 选型\n- 比较→柱状 / 趋势→折线 / 占比→饼 / 相关→散点 / 分布→箱线 / 密度→热力\n- 静态报告→matplotlib / 交互→plotly(write_html) / 网页→echarts\n\n## 要点\n- 中文设 SimHei，axes.unicode_minus=False\n- 保存 dpi=150 + bbox_inches=tight\n- 轴标签/标题/图例齐全\n\n详见 .claude/skills/data-visualization/SKILL.md`,
  },
  {
    id: 'skill_shopping_compare',
    name: '多平台购物对比',
    description: '多平台购物对比。用 pageAgent 去淘宝/京东/拼多多搜索同一关键词，抓取价格/销量/评分/评论/优惠/物流/店铺，汇总对比表与购买建议。',
    source: 'builtin',
    triggers: ['帮我比价', '对比淘宝京东拼多多', '跨平台比价', '手机比价', '零食比价', '哪个平台便宜'],
    category: '购物',
    author: 'yan-zhi',
    bodyMd: `# 多平台购物对比\n\n用 pageAgent 去淘宝/京东/拼多多搜索同一关键词，跨平台对比。\n\n## 维度\n价格/划线价/到手价、销量/月销、评分+评论摘要、优惠/券/满减/百亿补贴、物流/发货地、店铺信息\n\n## 工具\n- 联网检索统一委派 pageAgent（真实浏览器搜索引擎）；browser_new_tab/switch_tab/close_tab/get_tabs 多标签并行打开各平台搜索页\n- browser_extract_list 批量提取商品列表（title/price/link/sales/rating/shop）；browser_wait_for_request 确认异步加载\n- browser_visual_locate+image_analyze 识别弹窗；browser_scroll_into_view/is_visible 处理懒加载\n- compare_products 汇总：同款匹配+到手价归一化+可信度评分+评论情感分析 → Markdown 对比报告\n\n## 流程（推荐）\n1. 确认关键词与筛选（官方/旗舰/规格）\n2. 委派 pageAgent 用真实浏览器搜候选平台与价格区间\n3. browser_new_tab 并行打开淘宝/京东/拼多多搜索页\n4. browser_wait_for_request 等列表异步加载完成\n5. browser_extract_list 提取各平台前 N 商品；提取不到用 scroll_into_view 触发懒加载或 get_page_info+get_visible_text 兜底\n6. 按需 browser_click 进详情补评分/评论/优惠/物流\n7. compare_products 汇总比价 → 对比表+排序+评论摘要+推荐\n8. 给建议（价格/可信度/物流/售后综合）\n\n## 注意\n- 登录由 pageAgent 自处理（C3）：未登录时 pageAgent 自己 ask_user 扫码，父智能体不处理登录、不代填账号密码；cookie 持久化复用\n- 不写死选择器，每步 get_page_info 动态识别\n- 价格以详情页为准；结果仅供参考，下单以实时价为准\n- 控制节奏防反爬，遇验证码 ask_user\n\n详见 .claude/skills/multi-platform-shopping-compare/SKILL.md`,
  },
  {
    id: 'skill_openspec_propose',
    name: 'OpenSpec 提案',
    description: 'OpenSpec 提案。一步创建变更并生成全部产物（proposal/design/specs/tasks），用于快速描述要构建什么并产出完整提案。',
    source: 'builtin',
    triggers: ['openspec提案', '新建变更提案', 'propose change', 'openspec propose'],
    category: '工程规范',
    author: 'openspec',
    bodyMd: `# OpenSpec 提案（propose）\n\n一步创建变更并生成全部产物：proposal.md（what & why）/ design.md / specs / tasks。\n\n## 何时用\n想快速描述要构建什么，拿到完整提案进入实施。\n\n## 前置\n需 openspec CLI。\n\n详见 .claude/skills/openspec-propose/SKILL.md`,
  },
  {
    id: 'skill_openspec_explore',
    name: 'OpenSpec 探索',
    description: 'OpenSpec 探索模式。作为思考伙伴探索想法、调研问题、澄清需求，只思考不实现，可创建 OpenSpec 产物捕捉思考。',
    source: 'builtin',
    triggers: ['openspec探索', '探索模式', 'explore ideas', 'openspec explore'],
    category: '工程规范',
    author: 'openspec',
    bodyMd: `# OpenSpec 探索（explore）\n\n思考伙伴模式：探索想法、调研问题、澄清需求。\n\n## 约束\n- 只思考不实现（可读文件/搜索，不写代码）\n- 可创建 OpenSpec 产物（proposal/design/spec）捕捉思考\n\n详见 .claude/skills/openspec-explore/SKILL.md`,
  },
  {
    id: 'skill_openspec_archive',
    name: 'OpenSpec 归档变更',
    description: 'OpenSpec 归档变更。实现完成后定稿并归档变更，把已完成的变更从活跃区移入归档。',
    source: 'builtin',
    triggers: ['openspec归档', '归档变更', 'archive change', 'openspec archive'],
    category: '工程规范',
    author: 'openspec',
    bodyMd: `# OpenSpec 归档变更（archive）\n\n实现完成后定稿并归档变更。\n\n## 流程\n确认实现完成 → 归档（可选指定变更名，缺省从上下文推断，模糊则提示选择）\n\n详见 .claude/skills/openspec-archive-change/SKILL.md`,
  },
  {
    id: 'skill_openspec_apply',
    name: 'OpenSpec 实施变更',
    description: 'OpenSpec 实施变更。按变更的 tasks 开始或继续实施，逐项完成实现任务。',
    source: 'builtin',
    triggers: ['openspec实施', '实施变更', 'apply change', 'openspec apply', '继续实施'],
    category: '工程规范',
    author: 'openspec',
    bodyMd: `# OpenSpec 实施变更（apply）\n\n按变更的 tasks 开始/继续实施。\n\n## 流程\n读取变更 tasks → 逐项实现 → 标记完成\n\n详见 .claude/skills/openspec-apply-change/SKILL.md`,
  },
  {
    id: 'skill_novel_tuiwen',
    name: '小说推文视频',
    description: '有声小说推文视频生成：小说章节文本 → 自动改编口播脚本 → Edge-TTS 配音 → 与背景视频（风景/海洋/动物世界/延时自然等舒缓素材）合成 4:3 成片（顶部标题+逐句字幕）。用 novel_tuiwen 工具一键出片，可配合定时任务每日产片。',
    source: 'builtin',
    triggers: ['小说推文', '有声小说', '推文视频', '小说视频', '小说成片', '推文出片'],
    category: '自动化',
    author: 'yan-zhi',
    bodyMd: `\n# 小说推文视频（全自动产线）\n\n## When to use\n\n- 要做小说推文视频：选书 → 出片 → 发布 → 评论 → 回填\n- 要操作番茄达人中心（选书 / 取正文 / 别名 / **回填发文**）\n- 要发布到抖音或快手，或发引导评论、建合集\n- 要排查上述页面的操作失败（点不到、填不进、卡加载）\n\n## 文档结构\n\n| 层级 | 路径 | 职责 |\n|------|------|------|\n| L0 | \`references/README.md\` | 索引 + 加载顺序 |\n| L1 | \`references/pipeline.md\` | 出片产线：\`novel_tuiwen\` 参数、标题条/字幕、ffmpeg 坑、TTS、依赖 |\n| L1 | \`references/platform-specs.md\` | 各平台画幅与 \`aspect\` 取值 |\n| L1 | \`references/common/arco-dom.md\` | arco 站点通用表单规矩（受控输入 / 日期选择器 / 抽屉） |\n| L1 | \`references/pages/<平台>/<页>/index.md\` | 何时用、展示、公共说明、操作文件表 |\n| L1 | \`references/pages/<平台>/<页>/<操作>.md\` | 具体操作：步骤 + **实抓锚点** + Browser 配方 |\n\n## 加载口诀\n\n\`\`\`text\n办业务：定环节 → 定页面 → index.md → {操作}.md →（arco 站点才加）common/arco-dom.md\n出片：  pipeline.md（参数与坑）\n排版：  platform-specs.md\n\`\`\`\n\n- 页面文档里的选择器**都会漂** → 落操作前**先实抓复核一次**，优先「文本 + placeholder + \`[class*=前缀]\`」。\n- 没验证过的入口**不要编造**：搜不到就截图如实报告（合集、置顶都踩过这个坑）。\n\n## 授权平台（多渠道，按序尝试，单家卡住换下一家）\n\n1. **番茄达人中心**（字节官方）https://kol.fanqieopen.com — **首选**，书/正文/别名/回填全 Web 端闭环（2026-10 实测走通）\n2. 七猫 https://zuozhe.qimao.com — 偏情感/家庭/年代文，竞争小\n3. 书旗小说（阿里）https://www.shuqi.com\n4. 纵横小说 https://www.zongheng.com — 男频/玄幻向\n5. 巨日禄 https://www.jurilu.com — 2026-10 实测不可达，跳过，仅作候选\n\n聚合渠道（右豹/小果繁星/即客/U客直谈）只有微信小程序，浏览器工具进不去。\n番茄官网 fanqienovel.com 正文有字体混淆，**正文一律从达人中心书详情拿**。\n\n## 平台现状（2026-10 实测）\n\n- **番茄达人中心**：全链路 Web 端闭环 ✅（书/正文/别名/回填）\n- **快手** \`cp.kuaishou.com\`：发布 + 作品管理 Web 端走通 ✅（2026-10-15 实测发布 3 集）\n- **抖音** \`creator.douyin.com\`：Web 上传可达 ✅，登录态需用户在浏览器面板登录一次\n- 七猫/书旗/纵横：无 Web 推广门户（推广子域不可达，授权在小程序/聚合渠道）→ 仅作书源参考，产线以番茄为主\n\n## 场景 → 页面与操作\n\n| 环节 | 页面 index | 操作 |\n|------|------------|------|\n| 选书 | \`pages/fanqie/content/index.md\` | \`pages/fanqie/content/browse.md\` |\n| 取正文 | \`pages/fanqie/book-detail/index.md\` | \`pages/fanqie/book-detail/fetch-text.md\` |\n| 建别名 | \`pages/fanqie/alias-manage/index.md\` | \`pages/fanqie/alias-manage/create-alias.md\` |\n| **回填发文（结算前提）** | \`pages/fanqie/alias-manage/index.md\` | \`pages/fanqie/alias-manage/backfill.md\` ★ 快手走这条 |\n| 批量回填（仅抖音） | 同上 | \`pages/fanqie/alias-manage/backfill-batch.md\` |\n| 发布到快手 | \`pages/kuaishou/publish/index.md\` | \`pages/kuaishou/publish/publish-video.md\` |\n| 快手作品核验 | \`pages/kuaishou/works/index.md\` | \`pages/kuaishou/works/list-works.md\` |\n| 发布到抖音 | \`pages/douyin/publish/index.md\` | \`pages/douyin/publish/publish-video.md\` |\n| 抖音合集 | 同上 | \`pages/douyin/publish/collection.md\` |\n| 发引导评论 | \`pages/douyin/comment/index.md\` | \`pages/douyin/comment/post-comment.md\` |\n\n## 全流程（聊天内一句话触发）\n\n1. **选书**：授权平台按序尝试，浏览器工具抓书目 → \`pages/fanqie/content/browse.md\`；抓不到就换下一家，不死磕\n2. **过滤**：题材热度 / 开头钩子 / 竞争度打分，取 Top1-3\n3. **正文**：达人中心书详情逐章抓全文 → \`file_write\` 到 \`<工作目录>/novel/<书名>/chNN.txt\`（其他平台不给全文时 \`ask_user\`）\n4. **背景**：优先本地素材；题材与选法见 \`pipeline.md\`「背景素材选取」\n5. **出片**：\`novel_tuiwen { chapter, title, alias, chapter, bg_video, ambience, sfx }\` → \`pipeline.md\`\n   ★ 声音层：\`ambience\` 默认 \`auto\` 按剧情自动选（雨→rain / 荒野夜→wind / 悬疑→hum / 默认 pad_soft），音量 0.12 且被旁白**侧链闪避**，不盖配音；\`sfx\` 默认 \`auto\`，只在开头与高能句点缀（≤5 个、间隔≥6s），不做全程铺满。用户要「安静/不要音效」才传 \`sfx:"none"\` / \`ambience:"none"\`。\n6. **发布**（用户下发发布即授权，不再二次确认）：抖音 / 快手各见其 \`publish-video.md\`。\n   ★ 工具列表里有 \`browser_run_recipe\` 时**必须先用配方**，不要手工逐页点\n   （2026-10-23 复盘：手工发一集实测「上传 15 分 / 封面 7.5 分 / 评论 14 分」）：\n   - \`douyin-publish-video { videoPath, title, description, collectionName?, submit }\` —— 上传 + 填表 + 选合集；\n   - \`douyin-set-cover { coverPath }\` —— **在同一个已上传页面**设封面（发布配方 submit:false 之后调用，失败就放弃封面直接发布）；\n   - \`douyin-post-comment { videoTitle, comment }\` —— 发布后发引导评论，一次调用完成「选作品→键入→发送→回读」。\n   \`submit\` 只在用户明确要求发布时传 true；不需要自定义封面的单集可以一步传 submit:true。\n   ★ 被验证码/滑块拦住（\`blockedByVerification\`）→ 先 \`ask_user\` 请用户在浏览器面板完成验证，\n   再带返回的 \`resumeStep\` 续跑；**不要重跑全流程**（会重新上传/重置表单）。\n   ★★ **系列任务（≥2 集 / 用户说"系列、连着、合集"）：第一集发布前就要把合集建好并勾选** ——\n   发布页「添加到合集」→ 首次弹「创建新合集」（名称=**别名**，≤20 字；有 1:1 封面就一起传 1080×1080 ≤5MB）→\n   选中后发第一集。**禁止先发完再回头补归集**：第 1 集不在合集里，主页「第N集」从开头就断，后续要逐条补；\n   合集创建要审核 1–3 小时，提前建好后续集直接勾选。**只有单集一次性任务才可不建**。\n   ⚠️ 配方传了 \`collectionName\` 却没选中合集时会**停在发布前** —— 按回执在页面上手动建/选合集后直接点「发布」，\n   **不要重跑配方**（会重新上传并重置表单）。\n7. **引导评论**：抖音发布后发引导评论 → 优先 \`browser_run_recipe douyin-post-comment { videoTitle, comment }\`；\n   手工兜底步骤见 \`pages/douyin/comment/post-comment.md\`（锚点以 2026-10-15 实抓为准）。\n8. **回填发文**：番茄达人中心别名管理 → \`backfill.md\` —— **不回填不结算**\n9. **回报**：选书理由 + 成片路径 + 发布/回填状态\n\n## Browser automation 规矩\n\n1. **首次打开页面**：一次到位（\`browser_navigate\` 后再操作），**别先开一个空 tab 再导航**\n2. **同一页续操作**：复用同一个 \`tabId\`，不要重复 navigate 同一 URL\n   —— ⚠️ 回填抽屉**不存草稿**，重新 navigate = 已填内容全清空\n3. ⚠️ **需要 multi-tab 时给读取类工具传 \`tabId\`**（\`browser_get_page_content\` / \`browser_get_page_info\` 等），\n   别靠"切来切去"改变当前页 —— 面板上"你看到的页"和工具"实际操作的页"不一定同一个\n4. ⚠️ **预览面板收起（hidden）时微前端懒加载被节流** → 页面像假死。\n   操作评测/抖音这类站点前，**先让用户把面板展开**\n5. ⚠️ **收尾前主动收拾页面**：\`browser_get_tabs\` 看有哪些页（\`agentOpened: true\` 的才是你开的）→\n   \`browser_close_tab({ tabIds: [...] })\` **一次关掉中间页**（搜索结果页、登录页、中转页），\n   只保留该给用户看的成果页。**只能关自己开的**，用户手开的关不掉也别反复试\n6. 新建/切换标签页：\`browser_new_tab\` / \`browser_switch_tab\` ——\n   **要让用户看到某个页，就用 \`browser_switch_tab\` 显式切过去**，别指望它自己跟着走\n7. ⚠️ **填表单一律用 \`browser_fill_form\`（或 \`browser_type\`），禁止用 \`browser_run_script\` 做\n   selectAll → delete → insertText 的"清空重填"**：\n   - 富文本（Draft.js/ProseMirror/Slate）反复清空会让内部 model 与 DOM 不同步，产出重复前缀\n     （实测「拜师那天拜师那天，师父递给我…」），越填越乱，最终表单看着填好却一直不提交；\n   - 填完以工具返回的 \`state\` / \`applied\` 为准，**包含目标文本即视为成功**，不要再读一遍再填；\n   - 返回 \`forceStop:true\`（同字段连续 2 次未生效）→ **立即停止重填**，回读一次现场并向用户\n     报告"字段无法写入"，由用户决定手填或换方案。绝不允许换个选择器/换段脚本继续试。\n\n## 书名红线\n\n出片 \`title\` 传**别名**（书名会烧进标题条）、ending 传「搜索别名XX看后续」、发布文案**禁书名** —— 别名才白挂。\n不传 alias/chapter 会告警（标题条只剩书名 = 违反红线）。\n\n### 引导要点（转化位，别漏）\n\n必须点名「**番茄小说**」App —— 别名是番茄**站内**搜索词，观众在抖音/快手**搜不到**：\n**banner、ending、评论区三处都要写**「打开番茄小说搜「别名」」。\n番茄无网页版可跳；0 粉走引导搜索，≥500 粉可开锚点挂链接。\n\n## 赛道规则（巨日禄工具宝箱）\n\n- **4:3 画面**；别关联中视频；**别发小红书**（封号）；日更 + 持续回传\n- 只发布**已授权**书目，未授权搬运侵权\n- **风控**：新号人工养 1-2 周；单号单浏览器指纹；**日发 ≤3 条/号**；拟人化（随机延时、真人轨迹）\n\n## 结算规则（2026-10 核实，钱相关，务必向用户讲清）\n\n- **怎么算**：官方结算**按「拉新量」** —— 用你分享的**别名**在【番茄小说 App】里**搜出本书 →\n  下载/注册/充值**的用户才算。同名下的充值再给分成。\n  - 拉新/拉活：约 **3–9 元/人**（常见 7–10，大促可到 15；以任务详情页单价为准）\n  - 充值分成：约 **15%–70%**（按活动/书目）\n  - 提现门槛：**满 100 元**可提现\n- **回填是结算前提**：发布后必须在「申词记录 → 别名 → 回填发文」填**短视频作品链接**（不是小说链接）\n  - **1 条链接即生效**，同一本书发多平台 / 多集**不必每条都回填**（详见 \`pages/fanqie/alias-manage/backfill.md\`）\n  - 但**支持多次回填**：每次把结算截止推到「**最新发文日期 + 28 天**」→ 想"续命"就定期回填新视频\n  - **新别名 7 天内不回填会失效**（2026-10-09 官方页面原文；过期别名不再计拉新。此前误记 14 天已更正）\n  - **回填链接必须与「发文类型」匹配**，否则影响收益结算（官方页面原文警示）\n- **结算周期（读法）**：订单 **T+2 出单** → **T+4 结算到账**（≈ 拉新后第 6 天到账）。当月收益一般次月固定日结算\n- **别名有效期 6 个月**（比回填窗口长，回填窗口由"最新发文 + 28 天"约束）\n- **红线（踩了直接不给钱/封号）**：禁机刷/任务量/放单平台做单；禁涉黄涉政擦边；禁版权侵权；\n  别让用户"完成任务"式操作（系统要判真实用户）\n- 数据查看：达人中心「我的收益」页；订单/结算明细按别名归集\n\n## 工作方式与纪律\n\n- ⚡ **自动化模式**：**开局一次 \`ask_user\` 问完全部决策项**（选书倾向 / 文案风格 / 发布节奏 / 画幅 / 章数 / 素材），\n  用户说"你决定"即按默认执行；**中途一律不问**（书名用别名、标题描述话题自己写、弹窗自行处置）；\n  **发布不二次确认**（用户下发发布指令即为授权），但任务未要求发布时**不得自作主张发**。\n- 🚫 **工具使用纪律**：**优先用已有工具，不自造绕过** ——\n  上传只用 \`browser_upload\`（禁自建本地 HTTP 服务 / \`fetch file://\` 写 \`input.value\`，浏览器安全模型下必失败）；\n  工具报"不可用"就**停下如实报告**，不要发明替代通道。\n- 🔓 **权限**：本智能体默认「完全权限 all」+ 路径守卫关闭，文件 / 命令 / 装依赖不弹授权窗（用户要求不询问）；\n  危险命令护栏仍拦（递归删除 / 格式化 / 强推等硬红线）。\n- 🔁 **批量**：多章逐章出片；\`scheduled_task\`（cron 每日）+ 登录态 → 每天自动出 N 条。\n- 🖼️ **封面两段式**（2026-10-12）：生图模型画中文字必糊 → \`api_image_generate\` 只出**无字底图**（负向词必写），\n  文字用 ffmpeg \`drawtext\` 烧（**只烧别名**）。规格与完整命令见 \`references/cover-recipes.md\`。\n\n## Related\n\n- 出片参数与坑 → \`references/pipeline.md\`\n- 画幅规格 → \`references/platform-specs.md\`\n- 页面实抓锚点 → \`references/pages/\`\n`,
    files: [{"path":"references/README.md","content":"# references\n\n| 路径 | 说明 |\n|------|------|\n| [platform-specs.md](./platform-specs.md) | 各平台画幅规范与 `aspect` 取值 |\n| [pipeline.md](./pipeline.md) | 出片产线：`novel_tuiwen` 参数、标题条/字幕、ffmpeg 坑、TTS、依赖 |\n| [common/arco-dom.md](./common/arco-dom.md) | arco-design 站点通用表单规矩（受控输入、日期选择器、抽屉/弹窗、get_dom 复核） |\n| [pages/fanqie/](./pages/fanqie/) | 番茄达人中心：[总览+全站骨架](./pages/fanqie/index.md) / 内容库 / 书详情 / 别名管理（含回填） |\n| [pages/kuaishou/](./pages/kuaishou/) | 快手创作者平台：发布作品 / 作品管理 |\n| [pages/douyin/](./pages/douyin/) | 抖音创作者平台：发布页·合集 / 引导评论 |\n\n## 结构约定\n\n```\npages/<平台>/<页>/index.md         何时用 / 展示 / 公共说明 / 操作文件表\npages/<平台>/<页>/<操作>.md        输入 / 步骤 / 页面锚点 / 输出 / Browser 操作\n```\n\n加载顺序：SKILL 场景表 →（平台）→ `index.md` → `{操作}.md` →（需要时）`common/arco-dom.md`。\n\n⚠️ 页面文档里的选择器**都会漂**（arco CSS Modules / 抖音 React hash）。\n统一口径：优先「**文本 + placeholder + `[class*=前缀]`**」，**不写死 hash**；\n落操作前先 `browser_get_dom` / `browser_get_page_content` 实抓复核一次。\n"},{"path":"references/common/arco-dom.md","content":"# arco-design 表单通用规矩（番茄达人中心等 arco 站点共用）\n\n> 适用：`kol.fanqieopen.com`（番茄达人中心）等 arco-design 站点。\n> ⚠️ **类名带 hash 后缀会漂**（`form-CC3r5p`、`base-info-IVRg8K`）→\n> 匹配策略统一：**稳定类名前缀（`[class*=xxx]`）+ 文本 + 结构**，**不写死 hash**。\n\n## 控件定位\n\n- 输入框一律 `input.arco-input`；多行是 `textarea.arco-textarea`。\n- **受控组件**：直接设 `value` 不生效，必须\n  **原生 value setter + `dispatchEvent(new Event('input',{bubbles:true}))`**；\n  回车提交用 `keydown` Enter（keyCode 13）。\n- 按钮定位：`button.arco-btn`，**靠按钮内文本**（「确定」「提交」「批量创建别名」…），\n  **别靠\"第几个按钮\"**。\n- 表单项容器：`div.arco-form-item`（label 在 `.arco-form-item-label`）→\n  **「按 label 文本找它右边/下边的输入框」是最稳的定位法**。\n- 下拉（arco-select）：选项**挂到 body** 的 `div.arco-trigger-popup > .arco-select-dropdown`，\n  选项是 `li.arco-select-option`（文本匹配），**不在表单容器内** —— get_dom 搜不到就往 body 尾部找。\n- 开关/勾选：`button.arco-switch`（`aria-checked`）/ `label.arco-checkbox > input.arco-checkbox-target`。\n- 错误提示：`.arco-form-item-message`（必填没填、提交时出现）→ 可作「哪项没填对」的判据。\n\n## 日期选择器（arco DatePicker）—— 高频坑\n\n**只往输入框里 route 文本不会提交到表单状态**，提交时校验会把日期重置为空并报「必填」。\n正确做法：**点开面板 → 点具体日格**（让面板回填值），或键入后 **按 Enter** 提交。\n\n## 抽屉 / 弹窗\n\n- 抽屉 `div.arco-drawer`（遮罩 `.arco-drawer-mask`）；弹窗 `div.arco-modal`（遮罩 `.arco-mask`）。\n- ⚠️ **合成事件对 mask / Esc 无效** → 关抽屉要点它自己的**「取消」/「取消提交」按钮**。\n- ⚠️ **抽屉不存草稿**：刷新 = 已填内容全清空。中断接手时**先只读**看现状，**绝不刷新**。\n\n## get_dom 复核手法\n\n```\nbrowser_get_dom { maxNodes:2500, depth:20, selector:'arco-drawer' }   ← 回填抽屉\nbrowser_get_dom { maxNodes:2500, depth:20, selector:'arco-modal' }   ← 别名创建弹窗\n```\n\n- 抓到后**先比对类名前缀是否漂移**，再按页面文档的骨架定位。\n- 点不动 / 找不到时：**优先换「文本匹配」**，其次 x/y 坐标点击兜底。\n- 左栏目录很长的页（书详情 60+ 章）整页 get_dom 会被目录吃掉节点配额（800 不够）→\n  **用 selector 定位容器**或 maxNodes≥2500。\n"},{"path":"references/cover-recipes.md","content":"# 封面制作配方（合集封面 + 每集视频封面，2026-10-12 补）\n\n> 核心结论：**生图模型画中文字必糊**（伪字/缺笔画/乱码）→ 两段式：api_image_generate 出无字底图 → ffmpeg drawtext 烧字。\n> 复用成片管线（compose_video.py）同款约束：本机 ffmpeg 是 2019 老版，中文字体必须 fontfile='C\\:/Windows/Fonts/msyh.ttc'，中文书名号用『』。\n\n## 一、规格（平台硬性要求）\n| 封面 | 尺寸 | 格式/大小 | 上传入口 |\n|---|---|---|---|\n| 合集封面 | 1:1 1080×1080 | JPG ≤5MB（5242880 字节；PNG 禁传） | 合集管理「自定义创建合集」；发布页「添加到合集→创建新合集」 |\n| 每集视频封面 | 9:16 1080×1920（4:3 成片则 1080×1440） | JPG/PNG 均可 | 发布页「选封面/编辑封面」本地上传 |\n\n## 二、出图 prompt 模板（只出无字底图）\n变量：{题材氛围} {核心意象} {色调} {别名}\n\n合集封面底图（一本书一张，系列总封面）：\n「{题材}风格小说合集封面背景，{核心意象，如：夜色中的古井与一只旧怀表}，电影感构图，画面中下部大面积留白，暗调低饱和，{墨蓝+暖金}，细腻光影，高品质，无文字、无字母、无水印、无边框、无签名」\nsize 传 1024x1024。\n\n每集封面底图（一集一张，意象从本集钩子/scene 提炼一个具体物）：\n「{题材}风格竖构图小说封面背景，{本集核心意象}，主体占画面上 2/3，下 1/3 干净留白，电影感光线，{色调}，高品质，无文字、无字母、无水印、无边框、无签名」\nsize 传 1024x1536。\n\n要点：\n- 负向词（无文字/字母/水印/签名）必须写——不写模型默认自己加英文水印；\n- 系列各集用同一母版 prompt（只换意象）→ 进合集才有系列感；\n- 返回是临时直链：拿到 url 立刻 api_media_fetch { url, kind: image, category: source } 落盘再烧字，链接过期补不回；\n- 生图工具报错（上游 key 不可用等）→ 直接走第五节兜底，禁止反复重试。\n\n## 三、烧字命令（老版 ffmpeg 实测口径）\n底图落盘后（00-source/cover_bg.png）：\n\n合集封面（1080×1080，JPG ≤5MB）：\nffmpeg -y -i 00-source/cover_bg.png -vf \"scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{合集名≤20字，优先别名}':fontsize=92:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-50,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=38:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=(h-text_h)/2+60\" -frames:v 1 -q:v 3 output/cover_合集.jpg\n\n每集封面（9:16 1080×1920，三行）：\nffmpeg -y -i 00-source/ep_bg.png -vf \"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='第{N}集':fontsize=110:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.58,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{钩子短句≤12字}':fontsize=60:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.68,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=34:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.78\" -frames:v 1 -q:v 3 output/cover_第{N}集.jpg\n\n老版 ffmpeg 转义铁律（与 compose_video.py 的 esc_drawtext 同款）：\n- 文本里出现 \\ : ' % , [ ] 必须转义成 \\\\ \\: \\' \\% \\, \\[ \\]；\n- 中文书名号用『』——「」在老版 drawtext 里渲染成窄引号；\n- 不要 text_align / line_spacing（2019 版报 Option not found）；多行=多个 drawtext 各自算 y；\n- 冒号/逗号在 filter 串里是分隔符，text 内的都要转义；单引号包字体路径别漏。\n\n## 四、大小与画质核验（传前必做）\n- ls -l output/cover_*.jpg 看字节数 ≤5242880；超了把 -q:v 提到 5-8，仍超就确认 scale 到 1080 宽重出；\n- Read 打开成品图核验：文字无乱码、无超框、底图无英文水印残留、无原书名。\n\n## 五、兜底（生图不可用/超时 → 直接走，别干等）\n- 每集封面（抽帧，第 2 秒正好「第N集」大字）：\nffmpeg -ss 2 -i output/<别名>_第N集.mp4 -frames:v 1 -vf scale=1080:1920 -q:v 3 output/cover_第N集.jpg\n- 合集封面（深色底 + 烧字）：\nffmpeg -f lavfi -i color=c=0x101828:s=1080x1080 -vf \"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{合集名}':fontsize=92:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-50,drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='搜『{别名}』看全文｜番茄小说':fontsize=38:fontcolor=white:borderw=2:bordercolor=black@0.85:x=(w-text_w)/2:y=(h-text_h)/2+60\" -frames:v 1 -q:v 3 output/cover_合集.jpg\n\n## 六、书名红线\n封面文字（合集名/引导语/钩子句）禁原书名，只烧别名；底图 prompt 的负向词已兜底「无文字」，若底图仍带字样，换 prompt 重出或换兜底方案。"},{"path":"references/pages/douyin/comment/index.md","content":"# 抖音 · 引导评论（创作者后台互动评论）\n\n> 入口：`https://creator.douyin.com/creator-micro/interactive/comment`\n> 实抓更正：2026-10-15\n\n## 何时用\n\n发布后到作品评论区发**引导评论**（「打开番茄小说搜「别名」，本书全文免费看后续 👉」）——\n这是拉新的主要转化位。\n\n## 公共说明\n\n- ⚠️ **`/creator-micro/data/comment` 会跳关注页，是坑** —— 用 `interactive/comment`。\n- ⚠️ 页面同样受「面板收起 → 微前端懒加载被节流」影响，先让用户展开面板。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| post-comment.md | 选中作品 → 键入 → 发送 → 接口核验 |\n"},{"path":"references/pages/douyin/comment/post-comment.md","content":"# post-comment — 发一条引导评论\n\n## 首选：一行配方（2026-10-23 起）\n\n```text\nbrowser_run_recipe {\n  recipe: 'douyin-post-comment',\n  params: { videoTitle: '<作品标题片段>', comment: '打开番茄小说搜「别名」可直达本书 👉' }\n}\n```\n\n一次调用完成：打开互动评论页 → 选中作品 → 真实键盘键入 → 点发送 → 回读评论文案。\n**不要自己找输入框**：此前手工操作实测一条评论 14 分钟，原因是提示词里的旧锚点已失效，\n模型先在旧选择器上撞墙再重试。配方失败会返回卡在哪一步，按提示处理或如实报告，**不要换脚本反复重填**。\n\n## 页面锚点（**2026-10-15 实抓更正**）\n\n真实 DOM **与旧配方不符**，以本表为准：\n\n| 元素 | ✅ 实抓（正确） | ❌ 旧配方（已失效） |\n|------|----------------|---------------------|\n| 输入框 | `div.input-d24X73`（contenteditable，placeholder「有爱评论，说点好听的~」） | `.comment-input-inner-container` / `div.public-DraftEditor-content` |\n| 发送按钮 | 可见文本「**发送**」 | `#comment-input-container span.wchsYBpK`（**未找到**） |\n\n## 步骤\n\n1. 打开 `https://creator.douyin.com/creator-micro/interactive/comment`\n2. 选中目标作品\n3. 在输入框**真实键盘键入**评论文案（Draft.js contenteditable —— **JS 设 innerText 不生效**）\n4. 点「发送」\n5. 核验：页内 fetch `comment/list` 接口，`total ≥ 1`\n\n## ⚠️ 评论置顶 Web 端做不到（2026-10-14 穷尽验证，别再找）\n\n2026-10-14 穷尽验证：后台评论管理只有「回复/删除/举报」，**全页无「置顶」字符串**；\n公开视频页评论「…」菜单也无置顶项；接口 `is_pinned` 恒 0。\n\n→ **要置顶只能手机 App 手动**；做完如实说明，不要再花步数找入口。\n\n## 旁证\n\n`www.douyin.com/video/<id>` 公开页显示「暂无评论」与接口 0 条吻合 → 可作**旁证**，不可作发送入口。\n"},{"path":"references/pages/douyin/publish/collection.md","content":"# collection — 抖音合集\n\n## ★ 首集前必做（系列任务，2026-10-23 定稿）\n\n**第一次发布就要建合集并勾选第一集，不是发完再补。**\n\n1. 发布页「添加到合集」→ 首次点会弹「创建新合集」→ 名称用**别名**（≤20 字）+ 简介 +\n   1:1 封面 1080×1080 JPG ≤5MB → 创建（审核 1–3 小时，期间不影响视频发布）\n2. 选中新合集 → 发布第一集 → 主页显示「第1集」；之后同系列直接勾选同一合集，按发布时间自动累加集数\n3. **为什么不能先发再补**：第 1 集不在合集里 → 「第N集」从开头就断；\n   补归集要走「合集管理 → 添加作品」逐条勾选，且合集创建要审核，期间新集挂不进去\n4. 配方（`browser_run_recipe`）传了 `collectionName` 却没选中合集时会**停在发布前**：\n   在页面上手动建/选合集后直接点「发布」，**不要重跑配方**（会重新上传并重置表单）\n\n> 单集一次性任务可不建；只要计划做 ≥2 集，首集就必须建。\n\n## ★ 先排查：为什么「合集操作实现不了」\n\n> **实名 ≠ 全部条件**。合集开通需同时满足：\n> **实名认证 + 绑定中国大陆手机号 + 账号状态正常（无违规）**。（2026-10-11 联网核实）\n\n1. **是否「二级实名」**：只绑身份证但未完成**人脸核验**视为未认证。\n   （App：设置→账号与安全→实名认证，确认状态为\"已认证\"且含人脸核验）\n2. **手机号**：必须绑**中国大陆运营商**号且可收短信（虚拟号/境外号/停机都过不了校验）\n3. **合集权限是单独开关，可能需主动申请**：creator.douyin.com → 内容管理 → **合集管理**\n   - 有「自定义创建合集」按钮 = 权限已开通，直接建\n     （名称 **≤20 字** + 简介 + 1:1 封面 1080×1080 ≤5MB，勾选公开作品，≥3 个为佳）\n     → 保存并创建 → 审核 1–3 小时生效\n   - 显示「暂未开通合集权限」→ 点右侧「**立即申请**」\n     （填账号类型 个人/机构、主营内容方向 12 品类**单选、不可选\"其他\"**、近 7 日发布主题关键词）→ 人工审核\n   - 页面空白/无入口 → 账号权限或灰度未放开\n4. **反向激活路径（两条）**：\n   - 单条视频播放量 **≥10 万** → 其详情页会动态出现合集关联入口，可绕过常规权限判断\n   - App 端粉丝 **≥1 万** → 创作者服务中心「合集管理」直接建\n   - 另：网页端**成功创建一次合集后**，后续管理权限自动解锁\n\n→ 排查顺序：合集管理页看有没有「自定义创建合集」→ 没有就「立即申请」→ 申请也不给就走\n   高播放量反向激活或 App 万粉 → 都不行**如实报告**。\n\n## 发布页「添加到合集」（有权限时）\n\n首次点弹「创建新合集」（名称 ≤20 字，建议用别名/书名主题，别叫「我的作品集」）；\n之后同系列直接勾选 → 主页显示「第N集」，同合集视频**按发布时间自动累加集数**。\n\n## 兜底路径（发布页无入口 / 想回溯归集）\n\n```\ncreator.douyin.com → 内容管理 → 合集管理\n├─「自定义创建合集」：名称(≤20字) + 简介 + 1:1 封面 1080×1080\n└─ 进合集 →「添加作品」→ 勾选历史视频（单次 ≤50）→ 加入合集\n   （可把已发布的第 1 章、第 2 章一起归入）\n```\n\n这是**无门槛/低门槛**的回溯路径 —— 发布页入口消失时一律走这里。\n\n## 复核手法\n\n```\nbrowser_get_dom { maxNodes:3000, depth:25 }              ← 发布页整页（搜「合集」文本）\nbrowser_get_dom { maxNodes:1500, depth:15, selector:'[contenteditable]' }\n```\n\n- 「合集」字样整页搜不到 + 实名已做 → **截图报告用户，别编造入口位置**。\n"},{"path":"references/pages/douyin/publish/index.md","content":"# 抖音创作者平台 · 发布页 / 合集\n\n> 站点：`creator.douyin.com`\n> 入口：`https://creator.douyin.com/creator-micro/content/upload`\n> 整理：2026-10（操作路径 + 定位策略）\n\n## 何时用\n\n发布小说推文成片到抖音；或回溯把历史作品归入合集。\n\n## 公共说明\n\n- 发布页是 **React 私有组件**：类名无语义（`css-xxxx` hash）且**改版频繁**。\n  → 定位以「**文本 + placeholder + aria/语义属性**」为主，类名只做兜底。\n- ⚠️ **每次发布前先 get_dom 实抓复核**；不要用记忆里的选择器硬点。\n- ⚠️ **微前端懒加载**：预览面板收起时页面可能永远停在「加载中，请稍候...」，\n  正文只有几十字符（实拍：58 字符）。**用户展开面板后立刻正常** ——\n  这是「页面假死」的头号根因，别误判成站点故障。\n- 🚫 标题文案：带别名关键词 + 话题（如 `#狐王痴狂 #番茄小说`），**禁书名**。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| publish-video.md | 上传 → 标题/文案 → 发布设置 → 发布 |\n| collection.md | 合集：四层排查 + 兜底归集路径 |\n"},{"path":"references/pages/douyin/publish/publish-video.md","content":"# publish-video — 抖音发布一条作品\n\n> 站点：`creator.douyin.com` ｜ 上传页：`/creator-micro/content/upload`\n> 依据：2026-10-14 ~ 10-19 多集实战（含 10-19 描述框反复清空事故）\n\n## 首选：一行配方（2026-10-19 起）\n\n工具列表里有 `browser_run_recipe` 时，**优先用它**，不要自己逐页操作：\n\n```text\nbrowser_run_recipe {\n  recipe: 'douyin-publish-video',\n  params: {\n    videoPath: '<成片绝对路径>',\n    title: '<标题>',\n    description: '<描述正文>',\n    collectionName: '<合集名，可选>',\n    submit: true   // 只有用户明确要求发布时才传；默认 false 只上传+填表\n  }\n}\n```\n\n- 配方内部完成：导航 → filechooser 上传 → 等转码 → 一次填表（幂等）→ 可选选合集 → 可选点发布 → 验证成功。\n- 返回 `readyToSubmit:true`（submit=false 跑完）时：用户确认后**直接 `browser_click` 页面上的「发布」**；\n  **不要重新运行配方** —— 会重新上传视频并重置表单。\n- 返回 `blockedByVerification:true`（滑块/验证码）时，按**验证交接**处理：\n  1. 立即 `ask_user`：「请在浏览器面板完成滑块/验证码，完成后回复继续」；\n  2. 用户确认后，再次调用 `browser_run_recipe`，**params 保持不变**，并加上返回的 `resumeStep`；\n  3. 续跑只执行验证之后的步骤（发布已点过就只等结果），**不会重新上传/填表/重复点发布**；\n  4. 若续跑仍返回 `blockedByVerification`，说明验证还没完成，再次请用户处理，不要换脚本硬试。\n- 返回失败步骤与页面现场时：**不要重复运行同一配方**。先按失败原因处理（补登录 / 等上传完成 / 换参数），仍不行就向用户报告。\n- 配方不可用或站点改版时，才走下面的手动步骤。\n\n## 封面 + 发布：三步调用（2026-10-23 起）\n\n手工逐页点实测「上传 15 分 / 封面 7.5 分」，现在固定为三次调用，不要自己找封面弹窗：\n\n```text\n① browser_run_recipe { recipe:'douyin-publish-video', params:{ videoPath, title, description, collectionName?, submit:false } }\n② 有封面图时：browser_run_recipe { recipe:'douyin-set-cover', params:{ coverPath } }\n③ browser_click 页面上的「发布」   // 不需要自定义封面时，①直接传 submit:true 一步到底\n```\n\n- `douyin-set-cover` 必须在**同一个已上传页面**调用；失败就放弃封面直接进 ③，\n  **绝不重跑 ①**（会重新上传并重置表单）。\n- 封面图规格：4:3 成片用 1080×1440，9:16 用 1080×1920（见 `references/cover-recipes.md`）。\n- 封面弹窗的锚点尚未逐版实抓（2026-10-23 首版配方），首次使用若卡在「选择封面」入口，\n  按回执提示放弃封面并如实报告，不要换脚本硬试。\n\n## 输入参数\n\n- `videoPath`：本地成片 `.mp4`（`novel_tuiwen` 产物）\n- `title`：作品标题（≤ 30 字，带别名关键词，**禁书名**）\n- `description`：描述正文（≤ 1000 字，带别名关键词 + 引导语，可含 `#话题`）\n- `collectionName`：**系列任务（≥2 集 / 同一本书连发）首集必填** —— 第一集发布时就要创建并选中合集；\n  单集一次性任务才可留空。**不要先发完再补归集**（第 1 集不进合集 → 主页「第N集」从开头就断）\n- `submit`：是否点「发布」；**默认必须经 `confirm_user` 确认**\n\n## 页面锚点（实抓，改版时以 `browser_get_page_content` 复核为准）\n\n```\nhttps://creator.douyin.com/creator-micro/content/upload\n├─ 上传区：文本「点击上传」/「拖拽文件到这里」或 button\n│   → browser_upload（filechooser 模式：clickSelector 点上传按钮投递本地文件）\n├─ 标题：input[placeholder*=\"填写作品标题\"]（上传页仅 1 个 input[type=text]）\n│   计数器「0 / 30」在 editor-kit-root-container 内\n├─ 描述：.zone-container.editor-kit-container\n│   contenteditable=true（Draft.js）｜计数器「N / 1000」在右侧 toolbar\n├─ 上传状态：正文出现「已上传：… 剩余时间：…」→「上传成功 / 重新上传」\n├─ 合集入口：文本「选择合集」/「添加到合集」（有权限才显示）\n└─ 发布按钮：底部 button 文本「发布」（文本可能不唯一，用容器收窄或编号定位）\n```\n\n⚠️ **计数器不可信**：标题/描述计数器会与字段真实值不同步（实测标题 22 字显示 `0/30`）。\n回读一律以 `input.value` / `innerText` 为准，**禁止拿计数器反推内容**。\n\n## 填表协议（P0，2026-10-19 起强制）\n\n1. 只调**一次** `browser_get_page_content` 确认锚点；不要每一步都读全页。\n2. **一次 `browser_fill_form` 同时填标题与描述**：\n\n   ```text\n   fields = [\n     { selector: 'input[placeholder*=\"填写作品标题\"]', value: title },\n     { selector: '.zone-container.editor-kit-container', value: description }\n   ]\n   ```\n\n3. 以返回的 `state` / `applied` 为准：**包含目标文本即视为成功**，不要为了“完全相等”再填一遍。\n4. **禁止**用 `browser_run_script` 做 `selectAll → delete → insertText` 的“清空重填”。\n   富文本反复清空会让 Draft.js 内部 model 与 DOM 不同步，产出重复前缀\n   （实测「拜师那天拜师那天，师父递给我…」），越填越乱。\n5. 若 `applied:false`：只允许换一次选择器重试；仍失败就停止，回读当前值并报告。\n6. 若返回 `forceStop:true`（同字段连续 2 次未生效）：**立即停止重填**，不要换脚本继续试，\n   向用户报告“描述框无法写入”及当前值，由用户决定手填或换方案。\n\n## 步骤（确定性配方）\n\n1. `browser_navigate` 上传页（一次到位，别先开空 tab）\n2. `browser_upload` 投递 `videoPath`：\n   - `clickSelector` 指向上传按钮/拖拽区（优先 selector，别依赖易漂移的 index）\n   - 等待正文出现「上传成功 / 重新上传」，且**没有**「上传中 / 转码」\n3. `browser_fill_form` 填标题 + 描述（见上面的协议）\n4. **合集（系列任务首集必建，不是可选项）**：\n   - 点「选择合集」/「添加到合集」；列表里**已有** `collectionName` → 选中\n   - **没有** → 点「创建新合集」→ 名称填 `collectionName`（=别名，≤20 字；有 1:1 封面就传 1080×1080 ≤5MB）\n     → 创建并选中（合集审核 1–3 小时，不影响本集发布）\n   - 页面确认已显示所选合集名，再进下一步；**没选上合集不得点发布**（单集任务除外）\n   - 入口整页搜不到 → 按 `collection.md` 四层排查（实名 / 手机号 / 权限申请）；仍不行就**截图报告用户**，\n     不要静默跳过合集直接发布\n5. `confirm_user` 确认 → 点底部「发布」\n6. 轮询成功判据（见下）；**严禁再 navigate 回上传页** —— 会重置流程、清空已填内容\n7. 取 `aweme_id` / 作品链接 → 发引导评论（见 `../comment/post-comment.md`）\n\n## 成功判据\n\n1. URL 离开 `/content/post/video`，或页面出现「发布成功 / 已提交 / 等待审核」类文案\n2. 「内容管理」列表出现该作品\n3. 合集已选中时，`/web/api/mix/item/list/` 能查到该 `aweme_id`\n\n> 只读核验优先用页面内 `fetch`（`credentials:'include'`）：`/web/api/mix/list/`、\n> `/web/api/mix/detail/`、`/web/api/mix/item/list/`，比反复读 DOM 稳定。\n\n## 常见坑\n\n- **描述框重复前缀**：见「填表协议」第 4、6 条；出现重复就按失败处理，不要继续清空。\n- **上传中途导航**：上传/转码期间 navigate 或刷新会丢失整个表单，只能重传。\n- **发布按钮被遮挡**：`browser_click` 已做遮挡感知（返回 `occluded:true`）；按 `Esc` 或点关闭层后再点。\n- **微前端假死**：预览面板收起时页面可能停在「加载中，请稍候...」；让用户展开面板后再操作。\n- **「继续编辑/放弃」弹窗**：离开编辑页时出现，选「继续编辑」，否则已填内容全部丢弃。\n- **严禁坐标硬点**：仅当 index/selector 都失效且已确认坐标时兜底，点后必须回读复核。\n"},{"path":"references/pages/fanqie/alias-manage/backfill-batch.md","content":"# backfill-batch — 批量回填发文（xlsx 模板）\n\n> 别名管理页工具条「批量回填发文」→ 弹窗「批量上传发文-番茄小说」\n\n## ★ 先看这条：批量**不适用于快手**\n\n模板列只有 **`别名 / 发文日期 / 发文链接 / 抖音号`** —— **没有平台列**。\n所以：\n\n- **抖音**多别名/多条目 → 走批量（一次上传）\n- **快手**（任何非抖音）→ **走单条抽屉** `backfill.md`\n\n## 步骤\n\n1. 别名管理页 → 点「**批量回填发文**」\n2. 弹窗内先点「**下载批量模版**」（xlsx）\n3. 按模板列填写（别名 / 发文日期 / 发文链接 / 抖音号）\n4. 点或拖拽文件到上传区上传\n5. 点「提交」\n\n## 页面锚点（原文）\n\n```\n弹窗标题：「批量上传发文-番茄小说」\n提示：「请先 下载批量模版 ，填写后上传」\n上传区：「点击或拖拽文件到此处上传」\n约束：「文件不超过2万行，文件格式需要为xlsx」\n按钮：「取消」/「提交」\n```\n\n## 注意\n\n- 需要**下载模板 → 填 xlsx → 上传**三步文件操作（`browser_download` / 本地填表 / `browser_upload`）；\n  单个别名只回 1 条时，**单条抽屉比批量更快**，别为了\"用上批量\"而绕远路。\n- 「1 条链接即生效」的规矩同样适用（见 `backfill.md`）—— 别为了填满表格而逐集生成行。\n"},{"path":"references/pages/fanqie/alias-manage/backfill.md","content":"# backfill — 回填发文（结算前提）\n\n> 别名管理行「查看」→ 抽屉「推广计划」→ 底部「**回填发文**」\n\n## ★★★ 最重要的规矩：**1 条链接即生效，不要每集都提交**\n\n官方口径（2026-10 页面原文核实）：**一个别名回填 1 条作品链接即生效**。\n同一本书发多平台 / 连载多集，**不需要**每条都回填。\n\n| 场景 | 该怎么做 |\n|------|----------|\n| 新别名首次推广 | **回填 1 条**（最早/最主要的那个作品链接）→ 结算窗口即开启 |\n| 想延长结算窗口 | 再挑 1 条**最新**作品回填 → 截止日推到「最新发文日期 + 28 天」 |\n| 每集都有一集视频 | **不必逐集提交** —— 逐条提交只烧步数，不增加收益 |\n\n> ⚠️ 实拍教训（2026-10-16）：子智能体为\"三集各回填一次\"逐条开抽屉、逐条提交，\n> 3 次提交把 token 池打满、任务在最后一步中断。**先问一句\"一条够了吗\"，答案通常是不够才怪。**\n\n**但**：**新别名 7 天内不回填会失效**（过期别名不再计拉新）→ 首次回填要**及时**，别拖。\n\n## 入口路径（原文）\n\n```\n别名管理页 promotion-list?tab_type=2\n → 行内「查看」\n → 抽屉「推广计划」\n → 底部「回填发文」\n → 表单：基础信息 / 温馨提示 / 抖音发文 / 其他平台发文\n```\n\n## 抽屉结构与锚点（2026-10 实抓）\n\n```\ndiv.arco-drawer\n└─ form.arco-form.arco-form-vertical\n   ├─ ① 基础信息   div.base-info-IVRg8K\n   │     行：div.description-item-row-zpCXsM\n   │        label → div.description-item-label-o1mK37(.description-item-label--wide-mPwFSl)\n   │        value → div.description-item-value-YTsHRC\n   │     字段：书名 / 别名 / 任务类型 / 发文类型（均只读带出）\n   ├─ 温馨提示   div.highlight-tip-YL7hSS > div.title-tip-YadPjA\n   │     「新别名7天内不回填会失效，请一定要及时回填提交；」\n   │     「回填链接必须与「发文类型」匹配，否则会影响收益结算。」\n   ├─ ② 抖音发文    label 内含 span.get-dyuid-guide-txt-cXDVTQ「如何获取抖音号?」\n   │     字段：选择发文日期 + 输入抖音发文链接（占位文案含「https://开头」）\n   ├─ ③ 其他平台发文   ← ★ 快手走这里\n   │     字段：选择发文日期 + 输入发文链接\n   │     ⚠️ **不区分平台**：没有下拉 / tab / 单选，页面上全文无「快手」字样\n   │     →「其他平台发文」就是**通用兜底入口**，快手链接直接填\n   └─ 按钮：添加发文 / 删除 / 取消 / 提交\n```\n\n- 定位一律用 **「文本 + `[class*=前缀]`」**；hash 后缀（`base-info-IVRg8K`）会随构建漂。\n- 「发文类型」是**只读展示**（如 `图文` / `解压TTS`），**不是选择项** ——\n  它是书籍自身的类型，回填时只需保证链接与它匹配（图文类别回图文链接）。\n\n## 步骤\n\n1. 打开别名管理页 → 找到目标别名行 → 点「查看」开抽屉\n2. 抽屉底部点「回填发文」进入表单\n3. 按平台选分组：抖音 → ②；**快手 → ③「其他平台发文」**\n4. 点「添加发文」生成一行\n5. 填**发文日期**（⚠️ 见下）与**发文链接**\n6. 点「提交」\n7. 核验：别名列表该行 `发文详情` 的 `已填写（N条）` **+1**\n\n## ⚠️ 两个必踩的坑（2026-10-16 实拍）\n\n1. **日期选择器必须\"真选\"**：arco DatePicker 只 route 文本**不会提交到 React/Vue 表单状态**，\n   点「提交」时校验会把日期重置为空、报「发文日期必填」。\n   → 正确做法：点开面板 → **点具体日格**（或键入后按 Enter）让面板回填值，再提交。\n2. **空行会阻塞整张表单提交**：抽屉里会有一个默认空的「抖音发文」行，\n   它的必填校验一直报错 → 提交永远失败。\n   → 提交前**先把不用的空行「删除」**，只留真正要提交的那一行。\n\n## ⚠️ 抽屉不存草稿\n\n**刷新 / 重新 navigate 同一 URL = 已填内容全部清空**。\n中断后要接手时：**先只读**确认抽屉还开着、已填了什么，再决定\"补交\"还是\"重填\"，**绝不刷新**。\n\n## 作品链接形态（填哪个链接）\n\n| 平台 | 链接形态 |\n|------|----------|\n| 抖音 | `https://www.iesdouyin.com/share/video/<aweme_id>/`（从公开页 `www.douyin.com/video/<id>` 取 id 拼，或作品管理页「分享 → 复制链接」） |\n| 快手 | `https://www.kuaishou.com/short-video/<id>`（作品管理卡片里的作品 id，见 `../../../kuaishou/works/list-works.md`） |\n\n⚠️ 填的是**短视频作品链接**，不是小说链接。\n⚠️ 「发文类型」是只读展示（如 `图文` / `解压TTS`），**回填链接必须与它匹配**，否则影响结算。\n\n## Browser 操作\n\n```text\n1) browser_navigate  url=https://kol.fanqieopen.com/page/promotion-list?tab_type=2\n2) browser_get_page_content → 定位目标别名行的「查看」→ browser_click\n3) browser_click 「回填发文」\n4) browser_click 「添加发文」（其他平台发文分组下）\n5) 日期：点开 picker → 点日格提交值；链接：browser_type 到「输入发文链接」\n6) 删除多余的空行（抖音发文那行）\n7) browser_click 「提交」→ browser_get_page_content 核验 已填写（N条）\n```\n"},{"path":"references/pages/fanqie/alias-manage/create-alias.md","content":"# create-alias — 批量创建别名\n\n> 别名管理页工具条「批量创建别名」\n\n## 步骤\n\n1. 别名管理页 → 点工具条「**批量创建别名**」\n2. 弹窗内书目信息已带出（只读）\n3. 在别名输入区填关键词（**一行一个 / 逗号分隔**；3-5 字，与书题材强相关，如「狐王痴狂」）\n4. 点「确定」\n5. 回列表，**轮询该行状态到「生效中」**才可进下一步（发文必须挂生效中别名）\n\n## 页面锚点\n\n```\ndiv.arco-modal（遮罩 div.arco-mask）\n├─ .arco-modal-header  标题「批量创建别名」\n├─ .arco-modal-body\n│  ├─ 书目信息（已带出，只读展示）\n│  └─ 别名输入区：textarea.arco-textarea 或 input.arco-input\n└─ .arco-modal-footer  button「确定」/「取消」\n```\n\n## 输出\n\n新别名行；判据 `别名状态 = 生效中` 且 `书籍状态 = 可用`。\n"},{"path":"references/pages/fanqie/alias-manage/index.md","content":"# 番茄达人中心 · 别名管理（申词记录）\n\n> 站点：`kol.fanqieopen.com`\n> 入口：`https://kol.fanqieopen.com/page/promotion-list?tab_type=2`\n> 实抓：2026-10-15 / 2026-10-16（账号 `用户388710090`）\n\n## 何时用\n\n- 看某个别名/书籍的授权与状态（发文前提）\n- **回填发文**（结算前提，见 backfill.md）\n- 批量创建别名 / 批量回填发文 / 批量导出\n\n## 展示\n\n表格，列为：\n\n```\n关键词 | 书本信息 | 体裁 | 发文类型 | 别名状态 | 书籍状态 | 发文详情 | 创建时间 | 有效期 | 结算截止日 | 操作\n```\n\n行样例（原文）：\n\n```\n骨债阴阳 【借邪骨，我以鬼仙破阴阳】 id: 7458089212022099006 网文 解压TTS 生效中 可用 已填写（3条） \\\n2026-10-08 10:59:09 2026-10-08 ～ 2027-04-06 2026-11-12 剩余28天  查看 删除\n```\n\n- **发文前提**：`别名状态 = 生效中` 且 `书籍状态 = 可用`。\n- `发文详情` 的 `已填写（N条）` 是**回填是否生效的判据**（N 应随每次成功提交 +1）。\n- `结算截止日` 随最新发文日期滚动（见 backfill.md 的结算窗口）。\n\n## 公共说明\n\n- 技术栈 **arco-design**；类名带 CSS Modules hash。通用表单规矩见 `../../../common/arco-dom.md`。\n- 顶部导航：创作工具 / 主页 / 内容库 / 申词记录（红果短剧 · 番茄小说 · 番茄畅听 · 红果漫剧）/ 批量记录 / 我的收益 / 课程中心。\n- ⚠️ 页面处于 hidden（面板收起）时微前端懒加载被节流 → 表现为假死；操作前先让用户展开面板。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| create-alias.md | 批量创建别名 |\n| backfill.md | **单条回填发文**（快手走这条） |\n| backfill-batch.md | 批量回填发文（xlsx 模板，抖音号专用） |\n"},{"path":"references/pages/fanqie/book-detail/fetch-text.md","content":"# fetch-text — 逐章抓正文\n\n## 配方（一步到位，别自己试选择器）\n\n> 2026-10-08 复盘实测：此前靠 `browser_get_visible_text` 取整页文本再按标题切，\n> 实跑花了 **54 秒、15 次摸索调用**（`browser_run_script` 试选择器 8 次，还试过必然失败的 `:contains(...)`）。\n\n```js\n// ① 点章节（文本定位，比 :contains 稳；合成 click 无效时才改用坐标）\nconst item = [...document.querySelectorAll('.catalogue__item-text-Dcm6hj, [class*=\"catalogue__item-text\"]')]\n  .find((e) => (e.innerText || '').trim().startsWith('第3章'));\nreturn item ? item.getBoundingClientRect() : null;   // 有坐标 → browser_click {x,y}\n```\n\n```js\n// ② 读正文（等 .chapter-content-* 出现后再取；正文逐段在 p 里，无字体混淆）\nconst ps = [...document.querySelectorAll('#content.chapter p')].map((p) => p.innerText);\nconst title = (document.querySelector('[class*=\"chapter-title\"]') || {}).innerText || '';\nreturn JSON.stringify({ title, text: ps.join('\\n') });\n```\n\n★ 兜底：若 `#content.chapter p` 取不到（类名漂移），退回 `[class*=\"chapter-content\"] > div > p`；\n再不行才用 `browser_get_visible_text`（会混入目录/按钮噪音，需自行切边界）。\n\n## 链路\n\n```\n点目录项（文本定位 .catalogue__item-text-*）\n → 等 .chapter-content-* 出现\n → 取 div#content.chapter 的可见文本（一段一个 p）\n → 点「下一章」\n → 循环\n```\n\n## 步骤\n\n1. 用**带全三参数**的 URL 打开书详情（见 index.md）\n2. 点左侧目录第一个目标章节\n3. 读右栏 `.chapter-content-* > div#content.chapter` 正文\n4. 点 `.chapter-btn-group-* > button「下一章」`，重复 3\n5. `file_write` 落盘 `<工作目录>/novel/<书名>/chNN.txt`\n\n## 注意\n\n- 点章节**没反应**时改用 x/y 坐标点击。\n- 正文从「第N章」切到「下一章」即为换章成功；用 `.chapter-title-*` 复核当前章号。\n- 整页 get_dom 会被 60+ 章目录吃掉节点配额 → 用 selector 定位容器或 maxNodes≥2500。\n- 未解锁章（`.catalogue__item--disable-*`）点了没正文，别死磕。\n"},{"path":"references/pages/fanqie/book-detail/index.md","content":"# 番茄达人中心 · 书详情（取授权正文）\n\n> URL：`/page/content/book-detail?tab_type=2&top_tab_genre=-1&book_id=<id>&genre=0`\n> 实抓：2026-10-06（CDP `get_dom`，book_id=7452620888077241368）\n\n## 何时用\n\n- 看书籍信息与目录\n- **逐章取授权正文**（番茄官网 fanqienovel.com 正文有字体混淆，正文一律从这里拿）\n\n## ⚠️ URL 三参数缺一不可\n\n`tab_type` / `top_tab_genre` / `genre` **一个都不能少**。\n缺参数时正文区**永远卡「加载中...」**（4 轮复验实证）→ 补全参数重新导航即恢复。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| fetch-text.md | 逐章抓正文拼接落盘 |\n\n## 页面骨架（实抓）\n\n```\ndiv.kol-page.book-detail-page-uyEg2j.column\n├─ div.arco-page-header.kol-page-header\n│  ├─ .arco-page-header-title > .kol-page-header-title.clickable > span.page-title-*（书名 + 返回箭头）\n│  └─ .arco-page-header-head-extra > button「别名推广」\n└─ div.main-G5W5uE\n   ├─ div.w-card.sider-left-IxzcaP（左栏）\n   │  ├─ .book-info-*：.kol-book-cover / .book-name-* / .book-author-*\n   │  │   / .book-tags-*（已完结·58.4万字·8.2分）/ .book-id-*（\"BookID: <id>\"）\n   │  │   / .book-abstract-*（简介；折叠时点 a.arco-typography-operation-expand「展开」）\n   │  │   / .book-category-list-* > .arco-tag.arco-tag-checked（分类标签）\n   │  └─ .catalogue-whVvAH（目录）\n   │     ├─ p.catalogue__header-title-*「目录」\n   │     └─ .catalogue__list-* > div.catalogue__item-*\n   │        ├─ .catalogue__item-text-*（\"第N章 标题\"）\n   │        ├─ 当前章 .catalogue__item--active-*；未解锁章 .catalogue__item--disable-*（带锁，点了没正文）\n   │        └─ .copy-izbQNP（复制图标，仅 active 项有）\n   └─ div.sider-right-paDsBC（右栏 = 正文阅读区，**点目录章节后加载**）\n      └─ .sider-right-wrap-* > div.w-card.chapter-detail-*\n         ├─ .chapter-title-*（\"第N章 标题\"）\n         ├─ .chapter-content-* > div#content.chapter > p（**一段一个 p，正文全在此，无字体混淆**）\n         └─ .chapter-btn-group-* > button「下一章」        ← 逐章循环的锚点\n```\n"},{"path":"references/pages/fanqie/content/browse.md","content":"# browse — 浏览 / 搜索 / 进书详情\n\n## 步骤\n\n1. 打开 `https://kol.fanqieopen.com/page/content?tab_type=2&top_tab_genre=-1`\n2. 切榜单：点 `.task-menu-second-item`（爆款榜/阅读榜/潜力榜）\n3. 切频段：点 `.arco-radio-group` 内的 男频/女频\n4. 搜书：往 `input.arco-input[placeholder=\"请输入作者名/书名/BookID\"]` 输入（**受控组件**，见 `../../../common/arco-dom.md`）\n5. 点卡片上的「**别名推广**」进书详情\n\n## 输出\n\n候选书目（书名 / 作者 / 题材 / 字数 / 评分 / BookID）→ 交给打分环节取 Top1-3。\n"},{"path":"references/pages/fanqie/content/index.md","content":"# 番茄达人中心 · 内容库（选书）\n\n> 入口：`https://kol.fanqieopen.com/page/content?tab_type=2&top_tab_genre=-1`\n> 实抓：2026-10-06（CDP `get_dom`，非推测）\n\n## 何时用\n\n按榜单挑书：爆款榜 / 阅读榜 / 潜力榜，再做频段筛选（男频/女频）。\n\n## 展示\n\n书目卡片：排名、书名、作者/题材/字数/上架日期/评分，右上角「别名推广」按钮。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| browse.md | 浏览榜单 / 搜书 / 进书详情 |\n\n## 页面骨架（实抓）\n\n```\ndiv#kol-content-box\n└─ div.kol-page.page-*.column\n   ├─ div.header-*（页头：标题「番茄小说」+ 通知轮播 kol-notice-bar-* + 查看任务规则）\n   └─ div.list-*\n      ├─ div.task-menu.menu-*                       ← 榜单切换\n      │  ├─ .task-menu-first > .task-menu-first-item（网文[active] / 漫画 / 有声书 / 漫剧 / 短剧）\n      │  └─ .task-menu-second > .task-menu-second-item（爆款榜[active] / 阅读榜 / 潜力榜 / 全部内容）\n      ├─ div.filter-* > .arco-radio-group（频段：全部/男频/女频，button.arco-btn-text）\n      ├─ .sort-row-* > .arco-tabs（排序 tab）+ 搜索框\n      │    input.arco-input[placeholder=\"请输入作者名/书名/BookID\"]   ← 受控组件\n      └─ 书目卡片：\n         div.book-hQ7GYr\n         ├─ div.book-main-TYd2nR\n         │  ├─ .book-main-thumb-* > .book-main-rank-* > span.book-main-rank-val-*（排名）\n         │  └─ .book-main-cnt-*\n         │     ├─ .book-title-* > div.book-title-txt-*          ← 书名\n         │     └─ .book-category-* > span（作者/题材/字数/上架日期/评分，用 .book-category-item-split-* 分隔）\n         └─ div.book-opt-*\n            ├─ button.arco-btn-secondary（图标按钮）\n            └─ .arco-space.c-promotions > button「别名推广」     ← 点它进书详情/申词\n```\n"},{"path":"references/pages/fanqie/index.md","content":"# 番茄达人中心（kol.fanqieopen.com）\n\n> 平台总览 + **全站共用骨架**（2026-10-06 CDP 实抓）。各页细节见同目录子页面。\n\n## 何时用\n\n选书 / 取正文 / 建别名 / 回填发文 —— 全链路都在这一个站点。\n\n## 页面\n\n| 页面 | 文档 | 说明 |\n|------|------|------|\n| 内容库（选书） | `content/index.md` | 榜单切换 / 搜书 / 进书详情 |\n| 书详情（取正文） | `book-detail/index.md` | 目录 / 正文阅读区 / 逐章抓取 |\n| 别名管理（申词 · 回填） | `alias-manage/index.md` | 批量建别名 / **回填发文** |\n\n## 全站骨架（所有页共用）\n\n```text\nbody\n└─ div.root\n   └─ div.kol-container-yd1s0v.with-sidebar.has-header\n      ├─ div.container-header-WvBsp_.kol-container-header-*     ← 顶栏（创作工具/小程序/帮助中心/在线客服/账号）\n      └─ div.kol-main-xYpEa5\n         ├─ div.container-sidebar-yT3wLf.kol-main-sidebar-*     ← 左侧菜单\n         │  └─ div.arco-menu.arco-menu-light.arco-menu-vertical.kol-menu-*\n         │     └─ div.arco-menu-inner\n         │        ├─ div.arco-menu-inline > div.arco-menu-inline-header（分组头：内容库 / 申词记录）\n         │        │  └─ div.arco-menu-inline-content > div.arco-menu-item.arco-menu-item-indented\n         │        │     └─ a.menu-item-gZYTSO[href=/page/content?tab_type=2&top_tab_genre=-1]（番茄小说）\n         │        └─ div.arco-menu-item > a.menu-item-gZYTSO（主页 / 批量记录 / 我的收益 / 课程中心）\n         └─ div#kol-content-box.kol-main-content-*              ← 页面主体挂载点\n```\n\n- **菜单结构对照**：内容库（红果短剧 `tab_type=6` / 番茄小说 `tab_type=2` / 红果漫剧 `tab_type=16`）、\n  **申词记录**（同样按 `tab_type` 分）、批量记录 `/page/batch-history`、我的收益 `/page/income`。\n- `div#kol-content-box` 是**每个页面主体的挂载点** —— 定位不到元素时，先确认页面主体挂在哪。\n- 定位一律「文本 + `[class*=前缀]`」；类名带 hash 后缀会漂（见 `../../common/arco-dom.md`）。\n"},{"path":"references/pages/kuaishou/publish/index.md","content":"# 快手 · 发布作品\n\n> 站点：**`cp.kuaishou.com`**（快手创作者服务平台）\n> 入口：`https://cp.kuaishou.com/article/publish/video`\n> 实抓：2026-10-15 / 2026-10-16，账号昵称 `yqdbgz`\n> ⚠️ 旧文档写的 `creator.kuaishou.com` 是**错的** —— 真实域名是 `cp.kuaishou.com`。\n\n## 何时用\n\n把小说推文成片发布到快手（与抖音并列的发布目标）。\n\n## 展示\n\n单页工作台。左侧固定导航三件套：**发布作品 / 作品管理 / 合集管理**。\n发布页从左到右：上传区（视频/图文/全景视频三个 tab）→ 作品描述富文本 → 底部「发布」。\n\n## 公共说明（踩过的坑）\n\n- **技术栈 = Element UI + CSS Modules 混用**（`el-dialog__wrapper`、`_description_17g9x_24`）。\n  CSS Modules 后缀（`17g9x_24`）会随构建漂 → **一律用「文本 + placeholder + `[class*=前缀]`」定位**，别写死完整类名。\n- ⚠️ **页面处于 hidden（预览面板收起）时，微前端懒加载被节流** → 页面可见正文只剩「请开启浏览器的 JavaScript 功能」，\n  看起来像空壳/假死。**发布前先让用户把预览面板展开**，否则会反复误判成\"站点挂了\"。\n- 发布是**不可逆**动作：**必须 `confirm_user` 确认后才点「发布」**。\n- **系列任务（≥2 集）先建合集**：左侧导航有「合集管理」，**第一集发布前**先去那里建好合集，\n  再回发布页挂入；发布页的合集入口**尚未实抓**，找不到就走「合集管理」，\n  仍找不到就如实报告用户，**不要跳过合集直接发第一集**。\n- 成功后页面会跳 `…/article/manage/video?status=2&from=publish` —— 以此 + 作品管理列表新出现该作品作为成功判据。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| publish-video.md | 上传 → 填描述 → 发布 → 核验 |\n| ../works/index.md | 发布后到作品管理核验（`../works/list-works.md`） |\n"},{"path":"references/pages/kuaishou/publish/publish-video.md","content":"# publish-video — 发布一条作品\n\n> 能力与坑见 index.md\n\n## 输入\n\n- 本地成片路径（`novel_tuiwen` 产物 `别名_第N章.mp4`）\n- 作品描述文案（**带别名关键词，禁书名** —— 书名红线见 SKILL）\n- 是否确认发布（`confirm_user`）\n\n## 步骤\n\n1. 打开 `https://cp.kuaishou.com/article/publish/video`（关掉旧 tab，别复用）\n2. 在「上传视频」tab 下点上传区（或拖拽区）→ `browser_upload` 投递本地文件\n3. 等转码：轮询页面出现时长/进度、上传区不再是「拖拽视频到此或点击上传」\n4. 填**作品描述**（见下方锚点）\n5. `confirm_user` 确认 → 点「发布」\n6. 轮询成功判据（见下），**严禁再 navigate 回上传页**（会清空已填内容）\n\n## 页面锚点（2026-10 实抓）\n\n```\nhttps://cp.kuaishou.com/article/publish/video   title=「快手创作者服务平台」\n├─ 左侧导航：发布作品 / 作品管理 / 合集管理\n├─ 发布入口按钮：button.publish-button   文本「发布作品」\n├─ 上传区：文本「上传视频」「上传图文」「上传全景视频」「拖拽视频到此或点击上传」\n│           另有「视频大小…」限制说明\n│   → browser_upload（filechooser 模式：clickSelector 点上传按钮投递本地文件）\n├─ 作品描述（富文本）：[contenteditable=true][class*=_description_]\n│   placeholder：「作品描述不会写？试试智能文案」；相邻有「智能话题」「好友」「活动推荐」\n│   ⚠️ 受控富文本：JS 设 innerText 不生效，走 execCommand('insertText') 或真键盘键入\n├─ 弹层：div.el-dialog__wrapper（如「近7天的下载记录」）\n└─ 「发布」按钮：底部主提交\n    ⚠️ 文本「发布」在页面里**不唯一**（实抓 matched=2）→ 别只按文本点，\n       先 get_page_info 拿编号再点，或用容器结构收窄\n```\n\n## 成功判据\n\n1. URL 变为 `article/manage/video?status=2&from=publish`\n2. 作品管理列表出现该作品（`div.video-item.video-item--published`，见 `../works/list-works.md`）\n3. 页面出现「发布成功 / 审核中」类文案（**文案集合待补全**：实抓只确认了跳转+列表两条）\n\n> ⚠️ `?status=` 语义：`2` = 已发布，`1` = 疑似审核中（**推断**，未逐字核实；核验时按原文读，别只认数字）。\n\n## Browser 操作\n\n```text\n1) 打开并上传（一次到位，别先 open 再传）\n   browser_navigate  url=https://cp.kuaishou.com/article/publish/video\n   browser_upload    clickSelector=[上传按钮/拖拽区]  file=<本地 mp4>\n2) 轮询转码：browser_get_page_content（调小 maxTextLength）\n3) 填描述：对 [contenteditable=true][class*=_description_] 走 execCommand insertText\n4) confirm_user 确认 → browser_click 点「发布」（先编号定位）\n5) 轮询 URL 跳转 + 作品管理列表核验\n```\n\n## 风控\n\n新号先人工养 1-2 周；单号单浏览器指纹；**日发 ≤3 条**；拟人化（随机延时、真人轨迹）。见 SKILL「赛道规则」。\n"},{"path":"references/pages/kuaishou/works/index.md","content":"# 快手 · 作品管理\n\n> 站点：`cp.kuaishou.com`　入口：`https://cp.kuaishou.com/article/manage/video`\n> 实抓：2026-10-15 / 2026-10-16（账号 `yqdbgz`）\n\n## 何时用\n\n- 发布后**核验**作品是否上架（发布时间 / 时长 / 状态）\n- 取已发布作品的**公开视频链接**（回填番茄用）—— 列表里的作品 id 拼 `https://www.kuaishou.com/short-video/<id>`\n\n## 展示\n\n无限滚动卡片列表，页头有「共 N 个作品」。卡片 = 封面 + 时长 + 发布时间 + 状态 + 描述首句。\n\n## 公共说明\n\n- URL 的 `?status=` 是筛选：**`2` = 已发布**（发布成功后会带 `&from=publish` 跳到这里），**`1` = 疑似审核中**（推断）。\n- 列表数据挂在 Vue 实例上，**接口读取比刮 DOM 稳**（见 list-works.md）。\n- 页面同样受\"面板收起 → 微前端不渲染\"影响。\n\n## 操作文件\n\n| 操作 | 说明 |\n|------|------|\n| list-works.md | 列出作品并取公开链接 |\n"},{"path":"references/pages/kuaishou/works/list-works.md","content":"# list-works — 列作品 / 取公开链接\n\n## 步骤\n\n1. 打开 `https://cp.kuaishou.com/article/manage/video?status=2`（已发布）\n2. 读页头「共 N 个作品」与卡片列表\n3. 需要链接时，用卡片上的作品 id 拼 `https://www.kuaishou.com/short-video/<id>`\n\n## 页面锚点（2026-10 实抓）\n\n```\nhttps://cp.kuaishou.com/article/manage/video?status=2\n├─ 页头：文本「共 N 个作品」\n├─ 卡片：div.video-item.video-item--published        ← 已发布态\n├─ 列表容器：.main-container-infinite-list\n├─ 顶部按钮：button.publish-button 「发布作品」\n└─ 隐藏弹层：div.el-dialog__wrapper（如「近7天的下载记录」）\n```\n\n**两条读取路径（推荐第二条）**\n\n| 方式 | 做法 | 说明 |\n|------|------|------|\n| A. 刮 DOM | `browser_run_script` 取 `[class*=\"video-item\"]` 的文本 | 脆弱，卡片改版即挂 |\n| B. 读 Vue 实例（推荐） | 卡片元素 `el.__vue__.$props.videoInfo` | 实抓可用：含作品 id、时长（`progress`）、发布时间等结构化字段 |\n\n**页面自身接口**（比刮 DOM 更稳，`fetch` 页内调用）\n\n```\nGET https://cp.kuaishou.com/rest/v2/creator/pc/autho...（作品列表）\n返回 fetchListRest.nextCursor → 翻页游标（无限滚动即靠它）\n```\n> 实抓时该接口曾返回 `{\"result\":500002,...}`，即**未登录/被风控**时的响应 —— 遇到它先确认登录态，别重试。\n\n## 输出\n\n作品清单：集数 / 时长 / 发布时间 / 状态 / 公开链接（`short-video/<id>`）。\n"},{"path":"references/pipeline.md","content":"# 出片产线（novel_tuiwen）\n\n## 应用内调用\n\n```\nnovel_tuiwen { chapter: \"novel/书名/ch03.txt\", title: \"书名\", alias: \"狐王痴狂\",\n               chapter: \"3\", bg_video: \"bg1.mp4,bg2.mp4\" }\n```\n\n产物：**4:3 (1080x1440) mp4**，deliverable，落 `<工作目录>/output/`，文件名 `别名_第N章.mp4`。\n\n## 标题条三要素（2026-10-11 必带）\n\n**别名 + 番茄小说 + 第几章**，自动拼成「搜「别名」看全文｜番茄小说 第N章」——\n传 `alias` + `chapter` 即可，不用手拼 banner；`--banner` 仍可显式覆盖。\n⚠️ **不传 alias/chapter 会告警**（标题条只剩书名 = 违反书名红线）。\n标题条自动 ≤2 行（自然分隔符优先断行）+ 半透明黑底条，超宽自动缩字号。\n\n## 口播结构\n\n钩子（正文第一句）+ 正文段（第二句起）+ 结尾引导。\n\n## 字幕（2026-10-11 重做，SRT 改 ASS 直出）\n\n- **无底框**（黑底 box 太丑已撤）—— 白字加粗 + 黑描边(3px) + 轻投影\n- 字号随画幅 `H*4.2%`（ASS `PlayRes` = 真实分辨率，FontSize 即像素，4:3≈60px / 9:16≈80px）\n- **长句单行快切 + 每条 140ms 淡入淡出** = 字幕逐句推进的滚动观感，不再两行长块换行\n- `MarginV = H*5%`；老版 ffmpeg(4.2) 兼容\n\n## 顶部引导语（2026-10-11 实装）\n\n自动 ≤2 行：长句在自然分隔处（`｜ | ， , 、 空格`）断成两行居中，每行带半透明黑底 box。\n想让分行更刻意，可在 `banner` 里显式写 `\\n` 或真实换行。\n⚠️ 项目自带 ffmpeg 是 **2019 版**，**不支持 `drawtext` 的 `text_align` / `line_spacing`** →\n多行是靠「**按行链式 drawtext**」实现；改这块别用这两个选项，会报 `Option not found`。\n\n## ⚠️⚠️ 背景合成循环失效（2026-10-09 修复，最重要）\n\n项目自带 ffmpeg 是 **2019 版**（`git-2019-10-22`），**不支持「多输入 `-stream_loop -1` + concat 滤镜」**——\n此写法下 `-stream_loop` 对多输入**静默失效**，输出被**最短的那条输入轨**截断。\n\n- **症状**：成片时长 = 前 1~2 段背景时长之和（如 29.4+78.7=108.1s），而口播有 400+s\n  → 视频早早黑屏结束、台词只念了 1/4。**不报错**，极易误判成\"配音没生成\"。\n- **现修法**（`compose_video.py` `bg_clips` 分支已重写）：\n  1. 每段背景**先归一化**（scale/crop/fps/setsar + `-an`）成 `bgclip_XX.mp4`\n  2. `probe_duration` + `-count_frames` 探测**实际可解码时长**，**坏素材/截断文件会被跳过并告警**\n  3. 按顺序**循环重复片段列表**拼到累计 ≥ total\n  4. `concat` demuxer（`-c copy`，cwd=tmp + 纯文件名）生成 `bg_full.mp4`\n  5. 主命令改为**单输入** `bg_full.mp4` + `trim=total`\n  实测：3 段拼 4 轮 = 216.24s（精确）。\n- ⚠️ **素材完整性必查**：`bg-ocean-evening.webm` 曾是**坏素材**（元数据报 14.585s/30fps，\n  实际只解出 **47 帧 = 1.6s**，报 `File ended prematurely`）→ 混进列表会把背景拼短。\n  脚本现在会自动检出并跳过；但下载新素材后仍建议 `ffprobe -count_frames` 验一遍真实帧数。\n\n## TTS 朗读规范化\n\n时间 →「X点X分秒」；进度 a/b（含 `1\\|4` 转义）→ 中文分数；HP/MP/buff/BOSS 等术语 → 中文；\n①②③ →「第一，」；3-5 →「3到5」；`→` / `&` / `≥` → 读法；装饰符号删除。\n**只改送 TTS 文本，字幕显示原文**。术语表在 `tts_gen.py` 的 `GAME_TERMS`。\n2026-10-07 修复「第一段重复」（旧版 hook 复用 `segs[0][:40]` 且 `segments[0]` 原样保留 → 开头 40 字念两遍；旧产物有此问题属预期，重跑即愈）。\n\n## 系列化建议（2026-10-07）\n\n同一本书多章出片时，让相邻章节的成片「接得上」：\n\n1. 钩子/封面都挂**同一别名**（观众搜同一词）\n2. 标题统一前缀「搜「别名」看全文｜第N章 <章名>」（账号主页一眼看成一串）\n3. **第一次发布就把合集建好并勾选第一集**（抖音见 `pages/douyin/publish/collection.md`）——\n   不要先发完再补归集：第 1 集不在合集，「第N集」从开头就断；合集创建要审核 1–3h，\n   首集在发布页创建后，后续集直接勾选 → 观众能在合集里连着刷下一章\n\n多章可 `scheduled_task` 逐日自动出片。\n\n## 依赖\n\n- **ffmpeg 兜底（2026-10-09 更正）**：本机实际在 `C:\\Program Files\\EVCapture\\ffmpeg.exe`\n  （**不是** `C:\\APP\\EVCapture\\` —— 那个路径不存在，旧写法害脚本一度找不到）。\n  `find_ffmpeg` 已改为**多候选**：`$FFMPEG` → `C:\\Program Files\\EVCapture\\ffmpeg.exe`\n  → `C:\\APP\\EVCapture\\ffmpeg.exe` → PATH。ffprobe 与 ffmpeg 同目录。\n- **edge-tts**（缺失时 `pip install edge-tts -i https://mirrors.aliyun.com/pypi/simple/`）\n  ⚠️ **Tuna 镜像没有 edge-tts**（`No matching distribution found`），要用**阿里镜像**才装得上。\n- 内置 Python venv：`C:\\Users\\yhfys\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe`\n\n## CLI 直跑（开发）\n\n```bash\n# ★ 管线唯一源码 = packages/core/src/tool/builtin/python-scripts/novel_tuiwen/\n#   运行时副本 <工作目录>/.yan-zhi/tools/novel_tuiwen/ 由工具按内容哈希自动同步 —— 别去手改副本，\n#   也不要再在别处维护第二份源码（仓库里曾有一份 novel-tuiwen/pipeline/，已删除）。\nPY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe\nPIPE=packages/core/src/tool/builtin/python-scripts/novel_tuiwen\n\"$PY\" \"$PIPE/run_pipeline.py\" --input novel-tuiwen/sample/chapter01.txt \\\n    --outdir novel-tuiwen/output --title 废井怀表 \\\n    --alias 狐王痴狂 --chapter 1 --bg-video \"bg.mp4\"\n```\n\n## 背景素材选取\n\n**优先本地已有素材**（如 `00-source/` 下文件直接传 `bg_video`）。\n题材首选「风景 / 海洋 / 动物世界 / 延时自然」等舒缓、无人声、可循环的素材 ——\n与口播不抢注意力、符合平台调性；按氛围挑（悬疑/末日 → 夜景/暗调/荒野，治愈/日常 → 明亮自然/海洋/萌宠）。\n外链实测（2026-10-06）：mixkit 资产直链服务端必 403（签名 URL，换 UA/Referer/代理都没用，**别再试**）；\npixabay 页面链接 404（需真实文件直链且易过期）；pexels 可下但慢（超时自动转代理）。\n链接走 `api_media_fetch`（yt-dlp 缺失先 `media_install_ytdlp`）；没有素材就占位画面。\n"},{"path":"references/platform-specs.md","content":"# 发布平台画幅规范（2026-10-07）\n\n> novel_tuiwen 用 `aspect` 参数选画幅：`4:3`（默认 1080x1440）/ `9:16`（1080x1920）/ `16:9`（1920x1080）。\n> 背景素材分辨率**越高越好**（≥1080P，能拿 4K 最佳）：合成时按目标画幅 cover 裁切，4K 源裁竖屏不糊。\n> 下载侧不限制分辨率：直链拿到的就是原文件；yt-dlp 平台默认选最优格式（含 4K）。\n\n| 平台 | 推荐画幅 | 分辨率 | aspect 取值 | 备注 |\n|---|---|---|---|---|\n| 抖音（竖屏推文）| 9:16 | 1080x1920 | `9:16` | **主战场**；当前默认 4:3 不是竖屏，发抖音竖屏必须显式传 9:16 |\n| 抖音中视频 | 16:9 | 1920x1080 | `16:9` | ⚠️ 中视频计划另有规则，skill 已注明「别关联中视频」 |\n| 快手 | 9:16 | 1080x1920 | `9:16` | 与抖音同规格 |\n| 视频号 | 6:7 或 9:16 | 1080x1260 / 1080x1920 | `9:16`（暂无 6:7 档） | 9:16 可直接发 |\n| 小红书 | 3:4 / 9:16 | 1080x1440 / 1080x1920 | `4:3`（即 3:4 比例）或 `9:16` | ⚠️ skill 要点：别发小红书（封号风险），仅列规格备查 |\n| B站 | 16:9 | 1920x1080 | `16:9` | 横屏 |\n\n注意：\n- 档位与平台规范以平台后台实时提示为准（平台会调整）。\n- 4:3 = 1080x1440 恰好也是 3:4 竖比例，当时选它是字幕/标题阅读友好；发抖音竖屏请传 `aspect: '9:16'`。\n"},{"path":"references/platforms.md","content":"# 授权平台明细\n\n> 按序尝试，单家卡住换下一家。2026-10-05/06 实测。\n\n1. **番茄达人中心**（字节官方，一级授权）https://kol.fanqieopen.com — **首选**，书/正文/别名/回填全在 Web 端闭环（2026-10 实测走通）。\n2. **七猫** https://zuozhe.qimao.com — 偏情感/家庭/年代文，竞争小。\n3. **书旗小说**（阿里）https://www.shuqi.com\n4. **纵横小说** https://www.zongheng.com — 男频/玄幻向。\n5. **巨日禄** https://www.jurilu.com — 2026-10 实测站点不可达，跳过，仅作候选。\n- 聚合渠道（右豹/小果繁星/即客/U客直谈）只有微信小程序，浏览器工具进不去。\n"}],
  },
  {
    id: 'skill_desktop_app_automation',
    name: '桌面应用自动化',
    description: '用 computer-use 插件操作本机桌面应用（微信/QQ/邮件/文件管理等任意有窗口的软件）与系统管理（安装/卸载应用、强制删除残留、注册表清理）：通用 SOP = 找窗口→激活→核对操作对象→截图定位→按钮优先提交→截图核验；含各应用发送快捷键差异（微信 Ctrl+Enter/发送按钮，Enter 需开启回车发送）、纠错时效（微信 2 分钟撤回）与资金操作红线（红包/转账只提醒不代操作）。',
    source: 'builtin',
    triggers: ['桌面自动化', '操作电脑', '操作应用', '帮我操作软件', '发微信', '微信发消息', '自动发微信', '发QQ消息', '卸载应用', '安装应用', '强制删除文件', '清理注册表残留'],
    category: '自动化',
    author: 'yan-zhi',
    bodyMd: `# 桌面应用自动化\n\n用「电脑使用」(computer-use) 插件操作本机桌面应用（微信/QQ/钉钉/邮件客户端/文件管理器等任意有窗口的软件），并可做系统级维护（安装/卸载应用、强制删除残留、注册表清理）。**不写死任何路径/版本**：应用在哪、叫什么，一律先用工具扫出来。\n\n## 通用 SOP（每步截图核验，禁止盲点盲按）\n0. 前提：插件管理页已启用「电脑使用」；目标应用已登录（登录/扫码/验证码一律请用户自己完成，禁止代操作）；锁屏先唤醒解锁。\n1. 找应用：不确定名称/路径时先 computer_list_installed_apps { nameFilter }（已装应用+安装目录+exe 路径）、computer_list_processes（正在运行的）或 computer_list_windows { processName }（有窗口的），不要猜路径。\n   微信 4.x 注意：exe 是 Weixin.exe（进程名 Weixin/WeChatAppEx，安装目录常为 ...\\Tencent\\Weixin），注册表显示名是「微信」——list_installed_apps 的 nameFilter 用「微信」或「Weixin」，只搜 WeChat 会搜不到；同名多条时选 exeExists=true 的（false 是卸载残留，如指向已不存在的 WeChat.exe）。\n2. 激活：computer_activate_window { pid }。\n3. 核对操作对象（必做，防误操作）：computer_screenshot + image_analyze 确认当前窗口/会话/文档与用户目标一致（聊天应用=防发错群，文件操作=防删错目录）；有歧义 ask_user。\n4. 定位与操作：元素位置以截图识别为准，禁止盲猜坐标；同一元素连续失败 2 次即停下说明。\n5. 提交/发送：优先点界面按钮（「发送」「提交」「保存」），快捷键作备选——语义因应用和用户设置而异（见速查表）。\n6. 结果核验（必做）：再截图确认生效（消息气泡出现/状态变化/对话框关闭）；失败重试一次，仍失败换方式或如实报告。\n7. 回报：做了什么 + 结果证据 + 异常。\n\n## 提交快捷键速查（因应用而异，勿混用）\n- 微信：绿色「发送(S)」按钮 或 Ctrl+Enter（默认不开「回车键发送」，单独 Enter 无效；Shift+Enter 是换行）\n- QQ：Ctrl+Enter 或「发送」按钮\n- 通用表单/对话框：Enter 可能是提交也可能只是切焦点，先截图识别\n- 拿不准时先点按钮；按钮灰的再用快捷键，然后截图核验\n\n## 系统管理操作（高危，必须先确认）\n- 卸载应用 computer_uninstall_app / 安装应用 computer_install_app / 强制删除残留 computer_force_delete / 注册表清理 computer_registry_delete：先 computer_list_installed_apps 查清单 → confirm_user 逐项列出将做什么 → 用户同意后才传 confirm: true 执行。\n- 注册表删除会自动导出 .reg 备份；强制删除不进回收站不可恢复；安装 .exe 必须用确认过的静默参数，不确定就改用 winget 或让用户手动装。\n\n## 纠错时效\n不可逆操作第一时间处理与报告：微信消息 2 分钟内可右键「撤回」；文件删除进回收站可还原（computer_force_delete 除外——不可恢复）。超时无法撤销→如实告知，不谎报。\n\n## 安全红线\n- 资金操作（红包/转账/支付/收款确认）一律只提醒用户，禁止代操作\n- 密码/验证码/证件号等敏感信息不写入要发送的内容\n- 用户已明确指定的操作直接执行；未指定内容的发送/删除/支付/群发等先确认\n- 应用 UI 随版本变化，一切以截图+image_analyze 识别为准\n\n详见 .claude/skills/desktop-app-automation/SKILL.md`,
  },
];

/**
 * 将内置 skill 种子写入本地 sqlite（upsert）。
 * 适用于桌面端/移动端本地 better-sqlite3（skill 表结构：body_md + frontmatter_json）。
 * 服务端 db.ts 有独立 seed（用 triggers_json + body 结构），不调用此函数。
 */
export async function seedBuiltinSkills(
  execFn: (sql: string, params?: unknown[]) => Promise<void>,
): Promise<void> {
  for (const s of BUILTIN_SKILLS_SEED) {
    const frontmatter = JSON.stringify({
      name: s.name,
      description: s.description,
      triggers: s.triggers,
      category: s.category,
      author: s.author,
    });
      const files = (s as { files?: Array<{ path: string; content: string }> }).files;
      const filesJson = files && files.length ? JSON.stringify(files) : null;
    try {
      await execFn(
        `INSERT INTO skill (id, name, description, source, frontmatter_json, body_md, files_json, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           source = excluded.source,
           frontmatter_json = excluded.frontmatter_json,
           body_md = excluded.body_md,
           files_json = excluded.files_json`,
        [s.id, s.name, s.description, s.source, frontmatter, s.bodyMd, filesJson, Date.now()],
      );
    } catch (e) {
      console.warn(`[seed] 内置 skill ${s.id} 写入失败:`, e);
    }
  }
}

/**
 * 内置「页面指令」种子（2026-10-16 · 页面内对话与页面指令方案 §5，P1）。
 *
 * 全部 kind='task'（自然语言任务描述），零脚本风险 —— 脚本型（kind='script'）在 P2，
 * 需先定默认权限口径（默认每次确认 / 导入来源强制确认 / 审计留痕）。
 * ${...} 是**指令模板占位符**（运行时由 UI 插值），不是 TS 模板串 —— 所以正文一律单引号字符串。
 */
export const BUILTIN_PAGE_COMMANDS_SEED: Array<{
  id: string; name: string; description: string; body: string; matchHost: string; matchUrl: string | null;
  /** 'task'（默认，自然语言任务描述）| 'script'（页面脚本；P2 起可用，默认每次执行都要确认） */
  kind?: 'task' | 'script';
}> = [
  {
    id: 'pc_summarize',
    name: '总结本页要点',
    description: '读完当前页可见正文，输出不超过 5 条要点',
    body: '读完这一页的可见正文，用不超过 5 条要点总结它讲了什么（中文，每条一行；不要复述导航栏/页脚这类模板内容）。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_extract_table',
    name: '提取本页表格',
    description: '把当前页主表格结构化成 markdown 表格',
    body: '把这一页的主表格结构化成 markdown 表格输出（保留表头；数据超过 30 行时只输出前 30 行并注明已截断）。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_extract_links',
    name: '列出本页所有链接',
    description: '去重列出当前页可点击链接',
    body: '列出这一页所有可点击的链接：每行一条「显示文本 — URL」，去掉重复项与空锚点（# 开头）。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_translate',
    name: '翻译本页',
    description: '把当前页正文译成中文（原文中文则译英文）',
    body: '把这一页正文翻译成中文；原文是中文则译成英文。保留数字、链接与专有名词原样。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_fill_form',
    name: '填这个表单（不提交）',
    description: '按我提供的信息填表，填完等我确认',
    body: '用我接下来提供的信息填写当前页的表单。**不要提交**；填完后逐个字段告诉我填了什么，等我确认再动提交。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_find_errors',
    name: '找报错信息',
    description: '找当前页的报错/警告并解释',
    body: '在这一页里找出报错、异常、警告的文本：逐条列出原文，并给出可能原因与下一步建议；确实没有就明确回答"没有找到报错"。',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_fanqie_chapters',
    name: '整理本页章节列表',
    description: '站点示例指令：番茄作家后台的章节/作品清单',
    body: '整理这一页的章节或作品列表：逐行输出「名称 — 字数 — 状态」，最后给一行合计。',
    matchHost: '*.fanqieopen.com', matchUrl: null,
  },
  // ── P2：只读脚本样例（内置脚本**永远需要确认**，不允许被标"信任"）──
  {
    id: 'pc_script_links_json',
    name: '导出本页链接（JSON）',
    description: '脚本型（只读）：把本页所有链接去重后按 JSON 返回，便于复制/入库',
    kind: 'script',
    body: 'const list = Array.from(document.querySelectorAll("a[href]"))\n'
      + '  .map(function (a) { return { text: (a.innerText || "").trim().slice(0, 80), href: a.href }; })\n'
      + '  .filter(function (l) { return /^https?:/i.test(l.href); });\n'
      + 'const seen = new Set(); const uniq = [];\n'
      + 'for (const l of list) { if (!seen.has(l.href)) { seen.add(l.href); uniq.push(l); } }\n'
      + 'return { url: location.href, title: document.title, count: uniq.length, links: uniq.slice(0, 200) };',
    matchHost: '*', matchUrl: null,
  },
  {
    id: 'pc_script_page_stats',
    name: '统计本页元素',
    description: '脚本型（只读）：返回字数、链接/图片/表单数量与标题结构',
    kind: 'script',
    body: 'return {\n'
      + '  url: location.href,\n'
      + '  title: document.title,\n'
      + '  chars: ((document.body && document.body.innerText) || "").length,\n'
      + '  links: document.querySelectorAll("a[href]").length,\n'
      + '  images: document.images.length,\n'
      + '  forms: document.forms.length,\n'
      + '  headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 20).map(function (h) { return (h.innerText || "").trim(); }),\n'
      + '};',
    matchHost: '*', matchUrl: null,
  },
];

/** 把内置页面指令 upsert 进库（幂等；沿用 skill 种子的 ON CONFLICT 口径） */
export async function seedBuiltinPageCommands(
  execFn: (sql: string, params?: any[]) => Promise<void>,
): Promise<void> {
  const now = Date.now();
  for (const c of BUILTIN_PAGE_COMMANDS_SEED) {
    try {
      await execFn(
        `INSERT INTO browser_page_command
           (id, user_id, name, description, kind, body, match_host, match_url, source,
            enabled, need_confirm, run_count, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'builtin', 1, 1, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           kind = excluded.kind,
           body = excluded.body,
           match_host = excluded.match_host,
           match_url = excluded.match_url,
           updated_at = excluded.updated_at`,
        // ★ 不覆盖 enabled / run_count / last_used_at：用户在界面上停用过的内置指令，
        //   不能因为一次升级种子又被打开（那是"用户改了配置又被打回去"的经典投诉）。
        // ★ need_confirm 恒为 1：内置指令（含脚本样例）**永远需要确认** —— 内容随版本更新，
        //   用户"信任"的是当时那段脚本，升级换了内容就不能再免确认。
        [c.id, c.name, c.description, c.kind || 'task', c.body, c.matchHost, c.matchUrl, now, now],
      );
    } catch (e) {
      console.warn(`[seed] 内置页面指令 ${c.id} 写入失败:`, e);
    }
  }
}
