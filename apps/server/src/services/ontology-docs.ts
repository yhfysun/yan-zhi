// 内置表业务描述词典（P4.6）：为言智项目库的自动本体补「人话」口径。
// 结构：表名(code) → { name: 中文名, description: 表业务描述, fields: { 列名: 字段描述 } }
// 未命中词典的列回退 COMMON_FIELD_DOCS，再回退「类型描述」。
export interface TableDoc {
  name?: string;
  description?: string;
  fields?: Record<string, string>;
}

/** 通用列描述（所有表共用；表词典可覆盖） */
export const COMMON_FIELD_DOCS: Record<string, string> = {
  id: '主键 ID',
  created_at: '创建时间（毫秒时间戳）',
  updated_at: '最后更新时间（毫秒时间戳）',
  user_id: '所属用户 ID（guest 为本机默认用户）',
  enabled: '是否启用（1=启用 0=停用）',
  sort_order: '排序序号',
  description: '描述说明',
  status: '状态',
};

/** 言智项目库各表的业务词典（key = 表名，即本体 code） */
export const BUILTIN_TABLE_DOCS: Record<string, TableDoc> = {
  agent: {
    name: '智能体',
    description: '智能体定义表：每个智能体的名称、类型（harness 挂载即用 / workflow 编排）、工具与 Skill 挂载、子智能体关系、提示词等配置。',
    fields: {
      name: '智能体名称', type: '类型（harness=挂载即用，workflow=DAG 编排）', is_default: '是否默认助理（1=是）',
      builtin_tool_ids: '挂载的内置工具列表（JSON）', custom_tool_ids: '挂载的自定义工具列表（JSON）',
      mcp_tool_mounts: '挂载的 MCP 工具（JSON）', skill_ids: '挂载的 Skill 列表（JSON）',
      sub_agent_ids: '子智能体列表（JSON）', ontology_ids: '挂载的本体列表（JSON），约束取数范围',
      system_prompt: '系统提示词', is_public: '是否公开到商城（1=公开）', is_builtin: '是否内置智能体（1=内置不可删）',
      version: '定义版本号', parent_agent_id: '父智能体 ID', allow_sub_agent: '是否允许委派子智能体',
    },
  },
  app_config: {
    name: '应用配置',
    description: '应用级键值配置表：运行时的全局设置项。',
    fields: { key: '配置键', value: '配置值' },
  },
  chat_message: {
    name: '聊天消息',
    description: '聊天室消息表：多端实时聊天收发的每一条消息内容与状态。',
    fields: {
      peer_id: '所属聊天会话 ID', sender_id: '发送者标识', content: '消息正文',
      msg_type: '消息类型（text/image/file 等）', read_at: '已读时间（毫秒时间戳）',
    },
  },
  chat_peer: {
    name: '聊天会话',
    description: '聊天对端表：一次双向聊天会话的元信息（参与者、最后一条消息、未读数等）。',
    fields: {
      title: '会话标题', last_message: '最后一条消息摘要', unread_count: '未读消息数',
      last_message_at: '最后消息时间（毫秒时间戳）',
    },
  },
  conversation: {
    name: '对话会话',
    description: 'AI 对话会话表：用户与智能体的每个会话，绑定使用的智能体、平台与模型；消息明细在 message 表。',
    fields: {
      title: '会话标题', agent_id: '绑定的智能体 ID', platform_id: '模型平台 ID', model_id: '模型 ID',
      space_id: '所属空间 ID（空=未归类）', pinned: '是否置顶（1=置顶）',
      mcp_servers_json: '会话级挂载的 MCP server 列表（JSON）', skill_ids_json: '会话级挂载的 Skill（JSON）',
      scheduled_task_id: '来源定时任务 ID（定时任务产生的会话）',
    },
  },
  conversation_file: {
    name: '对话文件',
    description: '对话附件文件表：会话中上传或产出的文件元数据（路径/类别/大小），文件本体在磁盘。',
    fields: {
      conversation_id: '所属会话 ID', name: '文件名', path: '存储路径', category: '文件类别（deliverable=交付物）',
      mime_type: 'MIME 类型', size: '文件大小（字节）', source: '来源（upload=上传，agent=智能体产出）',
      message_id: '关联消息 ID',
    },
  },
  custom_tool: {
    name: '自定义工具',
    description: '用户自定义工具表：JS 沙箱脚本工具（node:vm），含入参 schema 与执行入口函数。',
    fields: {
      name: '工具名（英文标识）', input_schema_json: '入参 JSON Schema', entry: '入口函数名',
      code: '工具脚本源码（JS）', enabled: '是否启用（1=启用）', is_public: '是否公开到商城',
    },
  },
  data_source: {
    name: '数据源',
    description: '外部数据源连接表：MySQL/PostgreSQL/达梦/Oracle/SQLite 等连接信息；type=project 的内置项目库为本应用自身数据库（只读）。',
    fields: {
      name: '数据源名称', type: '类型（mysql/postgres/dm/oracle/sqlite/project）', host: '主机地址', port: '端口',
      database: '库名', service_name: 'Oracle 服务名', file_path: 'SQLite 文件路径', username: '用户名',
      password_enc: '加密存储的密码', readonly: '是否只读（1=只读）', allow_write: '是否允许写操作（1=允许）',
      status: '连接状态（ok=正常）', last_error: '最近一次错误信息', table_count: '已同步的表数量',
      schema_synced_at: '最近结构同步时间（毫秒时间戳）',
    },
  },
  im_connector: {
    name: 'IM 连接器',
    description: '即时通讯接入配置表：钉钉 Stream 等长连接的凭证与启用状态。',
    fields: { type: 'IM 类型（dingtalk 等）', app_key: '应用 AppKey', app_secret: '应用密钥', robot_code: '机器人编码' },
  },
  im_conversation_map: {
    name: 'IM 会话映射',
    description: 'IM 会话与本地对话会话的映射表：一条 IM 消息应路由到哪个本地会话。',
    fields: { im_connector_id: '所属 IM 连接器', conversation_id: '映射的本地会话 ID' },
  },
  im_inbound_event: {
    name: 'IM 入站事件',
    description: 'IM 收件事件表：从钉钉等渠道收到的原始消息事件及处理状态。',
    fields: { connector_id: '所属连接器', payload_json: '事件原始报文（JSON）', processed: '是否已处理（1=已处理）' },
  },
  kb_entity: {
    name: '知识库实体',
    description: '知识库图谱实体表：从文档中抽取的实体（人/物/概念），供多跳检索与图谱查询。',
    fields: { name: '实体名称', type: '实体类型', base_id: '所属知识库 ID', mention_count: '被提及次数' },
  },
  kb_entity_chunk: {
    name: '知识库实体切片',
    description: '实体与文本切片的关联表：一个实体出现在哪些切片中（多跳检索的边）。',
    fields: { entity_id: '实体 ID', chunk_id: '切片 ID' },
  },
  kb_processed_doc: {
    name: '知识库已处理文档',
    description: '知识库文档处理记录：每个文档的解析状态（分块/向量化是否完成）。',
    fields: { doc_id: '文档 ID', base_id: '所属知识库 ID', status: '处理状态' },
  },
  kb_relation: {
    name: '知识库关系',
    description: '知识库图谱关系表：实体之间的关系三元组（主体-谓词-客体）。',
    fields: { subject_id: '主体实体 ID', predicate: '关系谓词', object_id: '客体实体 ID' },
  },
  knowledge_base: {
    name: '知识库',
    description: '知识库主表：每个知识库的名称、描述与向量化配置（嵌入模型、切片参数）。',
    fields: { name: '知识库名称', embedding_model: '向量化使用的嵌入模型' },
  },
  knowledge_chunk: {
    name: '知识库切片',
    description: '知识库文本切片表：文档切分后的每个文本块，向量化后用于相似检索。',
    fields: { base_id: '所属知识库 ID', doc_id: '所属文档 ID', content: '切片正文', chunk_index: '切片序号' },
  },
  knowledge_doc: {
    name: '知识库文档',
    description: '知识库文档表：上传的原始文档（文件名/大小/解析后全文）。',
    fields: { base_id: '所属知识库 ID', title: '文档标题', size: '文件大小（字节）' },
  },
  llm_task: {
    name: 'LLM 任务',
    description: '大模型推理任务表：一次对话/子智能体/定时任务的推理任务状态与元信息。',
    fields: {
      conversation_id: '所属会话 ID', platform_id: '模型平台 ID', model_id: '模型 ID',
      status: '任务状态（running/completed/failed）',
    },
  },
  marketplace_cache: {
    name: '商城缓存',
    description: '智能体商城条目缓存：从远程商城拉取到的可安装智能体快照。',
    fields: { agent_id: '商城智能体 ID', payload_json: '条目快照（JSON）' },
  },
  marketplace_config: {
    name: '商城配置',
    description: '智能体商城发布配置：本地智能体发布到商城时的快照与状态。',
    fields: { agent_id: '本地智能体 ID', payload_json: '发布快照（JSON）' },
  },
  mcp_server: {
    name: 'MCP 服务',
    description: 'MCP (Model Context Protocol) 服务连接表：stdio/http 服务的启动命令或地址与启用状态。',
    fields: { name: '服务名称', command: 'stdio 启动命令', url: 'http 服务地址', enabled: '是否启用' },
  },
  mcp_tool: {
    name: 'MCP 工具',
    description: 'MCP 工具清单表：每个已连接 MCP 服务暴露的工具（名称/描述/入参 schema/启用状态）。',
    fields: { server_id: '所属 MCP 服务 ID', name: '工具名', input_schema_json: '入参 Schema（JSON）', enabled: '是否启用' },
  },
  memory: {
    name: '记忆',
    description: '智能体长期记忆表：会话结束后沉淀的值得记住的事实/偏好，供后续对话检索注入。',
    fields: { content: '记忆内容', tags_json: '标签列表（JSON）', source: '来源（manual=手动，dreaming=自动整理）' },
  },
  memory_dream_log: {
    name: '记忆整理日志',
    description: '记忆整理（Dreaming）调度器的运行日志：每次自动整理记忆的时间与结果。',
    fields: { started_at: '开始时间（毫秒时间戳）', result: '整理结果摘要' },
  },
  message: {
    name: '对话消息',
    description: 'AI 对话消息表：会话中的每条消息（user/assistant/tool 角色），含工具调用快照与子智能体轮次的父子关系。',
    fields: {
      conversation_id: '所属会话 ID', role: '角色（user/assistant/tool）', content: '消息正文',
      tool_call_id: '工具调用 ID', sub_agent_id: '产生该消息的子智能体 ID', sub_agent_depth: '子智能体嵌套深度',
      parent_tool_call_id: '父工具调用 ID（子智能体消息归属）',
    },
  },
  model: {
    name: '模型',
    description: '模型清单表：每个平台下可用的模型（ID/别名/类型/上下文长度）。',
    fields: { platform_id: '所属平台 ID', model_id: '模型 ID', alias: '模型别名', type: '模型类型（chat/embedding 等）' },
  },
  ontology: {
    name: '本体',
    description: '本体（语义层）元数据表：把查询 SQL 包装成有业务语义的对象（维度/度量/过滤器/选择列），供数据智能体取数。',
    fields: {
      code: '本体唯一标识（小写下划线）', datasource_id: '挂载的数据源 ID', source_sql: '物理来源 SQL（输出列带别名）',
      dimensions_json: '维度定义（JSON）', measures_json: '度量定义（JSON）', filters_json: '过滤器定义（JSON）',
      selections_json: '选择列定义（JSON）', policies_json: '行级策略（JSON）',
      status: '状态（draft=草稿对智能体不可见，published=已发布）', builtin: '是否内置自动生成（1=是）',
      version: '发布版本号', group_id: '所属本体包 ID',
    },
  },
  platform: {
    name: '模型平台',
    description: '模型平台连接表：OpenAI 兼容等协议的 API 地址与密钥配置（agnes 为内置云端平台）。',
    fields: { name: '平台名称', protocol: '协议类型', base_url: 'API 地址', api_key: 'API 密钥（加密）' },
  },
  platform_api_key: {
    name: '平台密钥',
    description: '模型平台 API 密钥表：多 Key 轮换池的每一条密钥与失败计数。',
    fields: { platform_id: '所属平台 ID', api_key: 'API 密钥（加密）', fail_count: '连续失败次数' },
  },
  remote_marketplace: {
    name: '远程商城',
    description: '远程商城源配置表：可拉取智能体/Skill 的远端节点地址。',
    fields: { name: '商城名称', url: '商城地址' },
  },
  saved_password: {
    name: '已存密码',
    description: '网站登录凭据保存表：pageAgent 自动登录用的站点账号密码（加密存储），可配合定时任务自动登录。',
    fields: { site: '站点地址', username: '登录用户名', password_enc: '加密存储的密码' },
  },
  scheduled_task: {
    name: '定时任务',
    description: '定时任务表：cron 表达式 + 提示词 + 绑定智能体，到点自动创建会话执行（如每日签到、定时报告）。',
    fields: {
      name: '任务名称', cron: 'cron 表达式', prompt: '执行提示词', agent_id: '绑定的智能体 ID',
      last_run_at: '上次执行时间（毫秒时间戳）', next_run_at: '下次执行时间（毫秒时间戳）',
    },
  },
  skill: {
    name: 'Skill',
    description: 'Skill（技能）表：注入提示词的领域方法论文档，含触发词与正文；source=builtin 为内置技能。',
    fields: {
      name: 'Skill 名称', body: 'Skill 正文（Markdown 方法论）', category: '分类', triggers_json: '触发词列表（JSON）',
      installs: '安装次数',
    },
  },
  space: {
    name: '空间',
    description: '空间表：会话的分组容器（类似文件夹），未归组的会话 space_id 为空。',
    fields: { name: '空间名称', description: '空间描述' },
  },
  user: {
    name: '用户',
    description: '用户账号表：本机默认用户为 guest；开启登录后按用户隔离数据。',
    fields: { username: '用户名', password: '密码（加密）', role: '角色' },
  },
  workflow_run: {
    name: '工作流运行',
    description: '工作流运行记录表：每次 workflow 智能体执行的状态、节点事件与输出结果。',
    fields: { agent_id: '工作流智能体 ID', status: '运行状态（running/completed/failed）', result_json: '输出结果（JSON）', error: '失败原因' },
  },
};
