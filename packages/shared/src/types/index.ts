// 核心类型定义（对应数据库实体）
export * from './marketplace.js';
export * from './cicd.js';

// ★ 用量明细（三协议归一化后的结构，见 utils/token-usage.ts）。
//   types 直接引 utils 的**具体文件**（不经过 utils/index），避免与 utils 侧的导出形成环。
import type { TokenUsageDetail } from '../utils/token-usage.js';

/**
 * 平台协议类型（2026-10-17 新增 `openai-responses`）。
 *
 * - `openai`：OpenAI **Chat Completions** 格式（`/v1/chat/completions`）—— 绝大多数厂商
 * - `openai-responses`：OpenAI **Responses API** 格式（`/v1/responses`）
 * - `anthropic`：Anthropic **Messages** 格式（`/v1/messages`）
 * - `custom`：历史遗留值，**语义未定义**，运行时一律按 `openai` 处理；UI 不再提供该选项
 */
export type Protocol = 'openai' | 'openai-responses' | 'anthropic' | 'custom';

/** 是否为 Responses API 协议 */
export function isResponsesProtocol(p: unknown): boolean {
  return p === 'openai-responses';
}

/**
 * 协议归一化 —— **唯一实现**（读库 / 读 UI / 读导入 JSON 都走这里）。
 *
 * ★ 为什么要有它：`protocol` 在 DB 里是 TEXT，历史存量里有 `custom`、有空值、
 *   将来还可能从导入的 JSON 里进来拼错的值。若在各处 `if (protocol === 'openai-responses')`
 *   各自兜底，漏一处就是"选了 Responses 却按 Chat Completions 发"（不报错，只是功能不对）。
 */
export function normalizeProtocol(p: unknown): Protocol {
  const v = String(p ?? '').trim();
  if (v === 'openai-responses') return 'openai-responses';
  if (v === 'anthropic') return 'anthropic';
  if (v === 'openai' || v === 'custom' || v === '') return 'openai';
  return 'openai'; // 未知值保守回落：Chat Completions 是兼容性最广的一种
}

/** 模型类型 */
export type ModelType = 'llm' | 'embedding' | 'rerank' | 'image' | 'video' | 'audio' | 'tts';
export const CHAT_MODEL_TYPES: ModelType[] = ['llm', 'chat' as ModelType];

/** 消息角色 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/** MCP 传输协议 */
export type McpTransport = 'stdio' | 'sse' | 'http';

/** 运行平台 */
export type RuntimePlatform = 'desktop' | 'mobile' | 'web';

/** 模型平台 */
export interface Platform {
  id: string;
  name: string;
  protocol: Protocol;
  apiUrl: string;
  apiKeyEnc: string;
  apiKeyDec?: string;
  headers?: Record<string, string>;
  status: 'healthy' | 'down' | 'unknown';
  lastHealthAt?: string;
  /** 平台级「可供大模型调用」总开关：false = 该平台下全部模型对模型下拉与智能体动态选型隐藏 */
  llmEnabled?: boolean;
  /** 是否为内置平台/模型，内置项只读 */
  isBuiltin?: boolean;
  /** 内置厂商目录来源（2026-10-17 方案 §2.3）：非空 = 从目录添加的厂商平台。
   *  ★ 语义分层：这类平台**连接配置只读**（baseUrl/协议来自厂商文档），但模型数据层
   *  （拉模型/改价/可见性）对用户开放 —— 与服务端直写受管的内置平台（ollama-local 等）区分。 */
  presetKey?: string;
  /** 请求停顿时间下限（毫秒），每次请求前随机停顿 [pauseMinMs, pauseMaxMs] 区间，避免短时间请求过多被限流 */
  pauseMinMs?: number;
  /** 请求停顿时间上限（毫秒） */
  pauseMaxMs?: number;
  createdAt: number;
}

/** 平台 API Key（多 Token 池中的一个条目） */
export interface PlatformApiKey {
  id: string;
  platformId: string;
  apiKey: string;
  /** 标签/备注，如「免费Token A」 */
  label?: string;
  /** 累计失败次数（按时间窗口衰减：超过窗口未失败则视为 0） */
  failCount: number;
  lastFailAt?: number;
  enabled: boolean;
  createdAt: number;
}

/** 模型 */
export interface Model {
  id: string;
  platformId: string;
  modelId: string;
  alias?: string;
  type: ModelType;
  /**
   * 上下文窗口（token）。★ D7（2026-10-10）：允许 `null` = **未声明**。
   *
   * ★ 为什么需要"未声明"这个态：后端 `resolveContextWindow` 把"恰好 1M"判为
   *   "用户没填、是我们写进去的默认值"→ 退保守 32K（该判据**有意保留**，见 constants.ts 注释）。
   *   而新增表单以前**预填 1M** ⇒ "没填"与"真 1M"在数据层**同形**
   *   （实测生产库 561 个模型全是 1048576，含确实 1M 的 glm/deepseek 模型）⇒ 全被按 32K 估。
   *   ⇒ 前端改为留空提交 `null`，与"真 1M"可区分。
   */
  contextWindow: number | null;
  enabled: boolean;
  /** 用户自控可见性：false = 该模型不进模型下拉，也不参与智能体动态选型（与远端同步无关） */
  visible?: boolean;
  isDefault: boolean;
  capabilities?: string[]; // function_call / vision / reasoning
  description?: string; // 模型描述（供 list_models 工具与前端展示）
  pricing?: { input?: number; output?: number }; // 每千 token 价格（元）
  lastChatTestAt?: number;
  lastChatTestOk?: boolean;
  /** 是否为内置平台/模型，内置项只读 */
  isBuiltin?: boolean;
}

/** 会话 */
export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  platformId?: string;
  modelId?: string;
  spaceId?: string;
  /**
   * 任务级任务类型（2026-10-14「父任务」层）：空间绑了**父类型**（多任务目录）时，
   * 本条任务选中的子线（如 douyin_traffic / douyin_sell）。
   * 注入优先级：conversation.task_type ?? space.task_type；空 = 跟随目录。
   */
  taskType?: string | null;
  /** 由定时任务发起时记录的任务 ID，用于在会话列表显示定时标记 */
  scheduledTaskId?: string;
  mcpServerIds: string[];
  _mcpDisabledTools?: Record<string, string[]>;
  _mcpToolAliases?: Record<string, Record<string, string>>;
  skillIds: string[];
  builtinToolIds?: string[]; // 会话级内置工具（合并到智能体级）
  /** 会话级自定义工具 id（合并到智能体级）。由 api_conversation_setup 或会话 PATCH 写入 */
  customToolIds?: string[];
  systemPrompt?: string;
  pinned: boolean;
  /** 会话级工具权限：readonly=只读（写类工具被后端拦截）/ default=默认 / full=全部放行 */
  permissionMode?: 'readonly' | 'default' | 'full' | 'all';
  /** 任务计划落盘（task_plan/task_step 写入，刷新/换设备后恢复进度卡片）。null/缺省 = 无计划 */
  taskPlan?: {
    title: string;
    startedAt?: number;
    finishedAt?: number;
    steps: Array<{
      id: string;
      title: string;
      description?: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      note?: string;
      /** 首次进入 running 的毫秒时间戳（服务端唯一的计时写入点） */
      startedAt?: number;
      /** 进入 done / failed 的毫秒时间戳 */
      finishedAt?: number;
      /** 返工时已累计的活跃时长（毫秒） */
      activeMs?: number;
    }>;
  } | null;
  /**
   * 归属模式：会话按模式隔离，列表只显示当前模式的。
   *
   * 创建时由前端写入当前模式，之后**不可变更**（改 mode 会让会话"跳"到
   * 别的模式列表里，归属语义就乱了）。存量会话在迁移时统一归 'office'。
   *
   * ★ 与前端 stores/mode.ts 的 AppMode 联合类型成对维护：2026-10-12 补 clip（既有缺口，
   *   一直靠 chat.ts 的 as cast 兜着）。
   * ★ 2026-10-16 移除 douyin（与 office 同形态的重复模式），新增 shop（店铺运营模式，
   *   插件 shop-ops 贡献独立控制台）。
   */
  mode?: 'office' | 'dev' | 'ops' | 'sec' | 'wf' | 'clip' | 'shop';
  /**
   * 运维会话绑定的服务器连接 id（2026-10-21）。
   *
   * ★ 「会话跟着服务器走」：运维窗口与会话一一对应，但会话侧必须记住是哪台服务器，
   *   否则关掉窗口/切走再点回来就找不回了（用户实报「点击会话应该自动打开上次的服务器」）。
   *   null/缺省 = 老数据或用户当时没选连接。
   */
  opsConnectionId?: string | null;
  /** 绑定的发布项目 id（7b）；null = 未绑定 */
  releaseProjectId?: string | null;
  createdAt: number;
  updatedAt: number;
  /**
   * 归档时间戳（null = 未归档）。
   *
   * 归档 = **移出主列表但保留全部数据**，且会话变为**只读**——可查看/搜索/导出，
   * 不可发新消息（对齐 ChatGPT：归档会话须 Unarchive 才能继续；Anthropic Agent SDK
   * 更严格，archive 后直接拒绝新事件）。要继续就先「恢复」。
   *
   * ★ 用 nullable 时间戳而非布尔：列表排序需要"何时归档"，布尔就得再加一列。
   */
  archivedAt?: number | null;
  /**
   * 软删除时间戳（null = 未删除）。
   *
   * 2026-10-16 之前删除是**硬删**（连消息一起真删、不可恢复）。现在删除先进回收站，
   * 只有回收站里的「永久删除」才真删。
   */
  deletedAt?: number | null;
  /**
   * 最后一次"真实对话活动"的时间戳（有消息产出时才刷新）。
   *
   * ★ 与 updatedAt 分离的必要性：自动归档（N 天不活跃）必须用它。
   * 目前 PATCH 改名/置顶不刷 updatedAt，看起来够用；但只要将来有人在 PATCH 里补刷
   * updatedAt，用它就会变成"改个名也算活跃"，14 天计时被静默重置。
   */
  lastActivityAt?: number | null;
  /**
   * 会话来源标记（2026-10-16）：空 = 普通会话（用户从对话页新建，或存量会话）；
   * `'browser-page'` = 浏览器页面对话（/browser 空间每 tab 一个）。
   *
   * ★ 取值是**白名单**，实现只有一处：`@yan-zhi/core` 的 `db/conversation-source.ts`
   *   （前端建会话的写入口与后端列表过滤都从那里取，别在这里再列一遍字面量）。
   * ★ 不写成 TS 联合类型：多一个来源就要动 shared 这个上下游都依赖的包，
   *   而"加一个来源"本该只改 core 一个文件。
   */
  source?: string | null;
  /** 来源附加信息（页面对话：建这条会话时所在页面的地址 / 站点 / 归属空间） */
  sourceMeta?: { url?: string; host?: string; scope?: string } | null;
}

/** 会话归属的生命周期状态：正常 / 已归档 / 已在回收站 */
export type ConversationLifecycle = 'active' | 'archived' | 'trashed';

/** 空间（文件夹）：组织会话与目录绑定 */
export interface Space {
  id: string;
  name: string;
  /** 绑定的本地目录路径（桌面端可选） */
  dirPath?: string;
  description?: string;
  /** 「目录即任务」：该目录绑定的任务类型 id（general/short_drama/... 见 shared/utils/task-types）。
   *  空/未设置 = 通用（不生成资源目录骨架、不注入 SOP）。 */
  taskType?: string;
  /** 父空间 id（「父任务目录」层级，2026-10-17）：非空 = 本空间是某个父任务目录下的**子目录**。
   *  子空间挂在工作目录的子文件夹上，任务类型只能选父空间类型的子线（如 抖音引流/图文带货）。
   *  NULL = 顶层空间（行为与旧数据完全一致）。 */
  parentId?: string;
  /** 类型在该目录下的覆盖配置（confirmBatchSize 等）。JSON 字符串。 */
  taskConfigJson?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** 文件分类：上传 / 中间产物 / 交付物 */
export type FileCategory = 'upload' | 'intermediate' | 'deliverable';

/** 会话文件（分类管理） */
export interface ConversationFile {
  id: string;
  conversationId: string;
  spaceId?: string;
  name: string;
  path: string;
  category: FileCategory;
  mimeType?: string;
  size: number;
  /** 来源：user（用户上传）/ agent（智能体产出） */
  source: 'user' | 'agent';
  messageId?: string;
  createdAt: number;
}

/** 消息 */
export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  reasoningContent?: string;
  systemPromptSnapshot?: string;
  tokens?: number;
  createdAt: number;
  subAgentId?: string;
  subAgentName?: string;
  parentToolCallId?: string;
  subAgentDepth?: number;
  /** 内嵌于聊天消息里的动态看板（数据浏览）契约；随消息落库（message.data_view_json）并跨端同步 */
  dataView?: InlineDataView;
  /**
   * ★★★ 仅**发送期**存在的图片附件（C1，2026-10-09）——**不落库**。
   *
   * ★ 为什么用"另加字段 + 注入期展开"而不是把 `content` 改成 `ContentBlock[]`：
   *   `content` 被至少三处当**字符串**用（`sanitizeToolMessages` 的
   *   `` `[工具结果] ${m.content}` `` 拼接、`estimateTokens`、前端渲染）——
   *   一旦改成数组，这些地方会**静默产出 "[object Object]"** 或直接抛错，
   *   而要全部改对就牵动 db/压缩/前端（改动面与风险都大得多）。
   *   ⇒ 落库仍是**纯字符串**（图片引用以路径形式留在正文里，人类可读、可审计）；
   *     仅在 `toApiMessage` 组装上游请求体时，把标记展开为 `image_url` 块。
   * ★ 写入者：服务端 `attachImagesToMessages()`（发送前一次性解析标记并读图）。
   *   它**不可序列化**（base64 很大）——任何落库/快照路径必须剔除。
   */
  imageParts?: Array<{ mime: string; base64: string }>;
  /**
   * ★ 已尝试解析的**失败标记**（C1）：标记文本命中了但图读不到（路径失效/已清理）。
   *   记下来是为了"**只尝试一次**" —— 否则每一步都会重试同一批失效路径
   *   （每步都 stat + 失败日志，长任务白跑几百次）。
   */
  imagePartsTried?: boolean;
}

/** 聊天内嵌「数据浏览/动态看板」契约：只声明取数源 + 想要当过滤器的列；取数由面板 /run 参数化完成，不喂 LLM */
export interface InlineDataView {
  title?: string;
  datasourceId?: string;
  table?: string;
  base?: string;
  filterCols?: string[];
  /** 取数通道：缺省按 table/base 走自由 SQL；ontology 按本体字段名取数；file 读数据产物文件 */
  mode?: 'table' | 'base' | 'ontology' | 'file';
  /** mode=ontology 时的本体 code（或 id） */
  ontology?: string;
  /** mode=file 时的数据产物绝对路径（py_save_exec / data_save 落盘的 json） */
  path?: string;
}

/** 看板 widget 的网格位置（12 列；x/y 从 0 起，w 1..12，h 为行数） */
export interface DashboardWidgetPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DashboardWidgetKind = 'chart' | 'table' | 'metric' | 'text' | 'infographic';

/**
 * 看板 widget：只存「取数引用 + 图表定义 + 位置」，不存行数据。
 * spec / metrics 在 shared 里保持宽类型 —— 具体形状由各端渲染层定义（ChartSpec / DocumentMetric）。
 */
export interface DashboardWidget {
  id: string;
  kind: DashboardWidgetKind;
  title?: string;
  contract?: InlineDataView;
  spec?: Record<string, unknown>;
  syntax?: string;
  text?: string;
  metrics?: Array<{ label: string; value: string; hint?: string }>;
  pos: DashboardWidgetPos;
}

export interface Dashboard {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  widgets?: DashboardWidget[];
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  messageId: string;
  mcpServerId?: string;
  toolName: string;
  arguments: unknown;
  result?: unknown;
  durationMs?: number;
}

/** OpenAI 协议流式 delta 中的 tool_calls 片段（与 DB 持久化的 ToolCall 不同） */
export interface DeltaToolCall {
  id?: string;
  index?: number;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

/** MCP 服务 */
export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command?: string; // stdio
  args?: string[]; // stdio
  env?: Record<string, string>; // stdio
  url?: string; // sse/http
  headers?: Record<string, string>; // sse/http
  status: 'connected' | 'disconnected' | 'error';
  lastConnectedAt?: string;
  autoReconnect: boolean;
  reconnectInterval: number;
  autoConnect: boolean;
  /** 绑定的凭证 ID（mcp_credential.id）；连接时自动注入对应鉴权头/环境变量 */
  authCredentialId?: string | null;
}

/** MCP 凭证/令牌保险库条目（列表不含明文 secret） */
export interface McpCredential {
  id: string;
  name: string;
  scheme: 'bearer' | 'raw'; // bearer: Authorization: Bearer <secret>；raw: <key>: <secret>
  target: 'header' | 'env'; // 注入请求头或 stdio 环境变量
  key?: string | null; // raw 模式的头名/环境变量名
  hasSecret: boolean;
  createdAt: number;
}

/** 入站 MCP 访问凭证（对外签发，外部客户端带此连接我们的 MCP 服务）。不回显明文/哈希。 */
export interface McpAccessKey {
  id: string;
  name: string;
  keyPrefix: string; // 明文前缀（如 yzk_a1b2c3...），仅用于列表辨识
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}

/** 签发访问凭证时的一次性返回（含明文 key，仅此一次） */
export interface McpAccessKeyCreated extends McpAccessKey {
  key: string;
}

/** MCP 工具 */
export interface McpTool {
  id: string;
  mcpServerId: string;
  name: string;
  description?: string;
  alias?: string;
  remark?: string;
  enabled?: boolean;
  inputSchema: unknown; // JSON Schema
  /** 输出结构描述（JSON Schema），可选 */
  outputSchema?: unknown;
}

/** 智能体类型 */
export type AgentType = 'harness' | 'workflow';

/** 模型候选池槽位（model-candidate-pools）：llm=对话 / vision=视觉理解 / image=生图 / video=生视频 */
export type ModelPoolSlot = 'llm' | 'vision' | 'image' | 'video';
/** 三层同构池结构：槽位 → 有序 model 主键数组（[0] 首选）；缺失槽位 = 未配置，回退下一层 */
export interface ModelPools {
  llm?: string[];
  vision?: string[];
  image?: string[];
  video?: string[];
}

/**
 * 槽位匹配判据（唯一真相源；server services/model-pools.ts 与前端选择器共用）。
 * 口径：
 *   - llm：type=llm 且不带媒体能力（image/video cap 的模型是生图/生视频专用，见 model-caps.ts）
 *   - vision：type=llm 且带 vision 能力（视觉理解，区别于生图）
 *   - image / video：type 命中或能力命中任一即可
 * type 为空按 llm 处理（存量数据宽容）。
 */
export function matchesModelSlot(
  type: string | null | undefined,
  capabilities: string[] | null | undefined,
  slot: ModelPoolSlot,
): boolean {
  const t = type || 'llm';
  const caps = Array.isArray(capabilities) ? capabilities : [];
  const hasMedia = caps.includes('image') || caps.includes('video');
  switch (slot) {
    case 'llm': return t === 'llm' && !hasMedia;
    case 'vision': return t === 'llm' && caps.includes('vision');
    case 'image': return t === 'image' || caps.includes('image');
    case 'video': return t === 'video' || caps.includes('video');
  }
}

/** MCP 工具挂载项 */
export interface McpToolMount {
  serverId: string;
  toolName: string; // '*' 表示该 server 全部工具
}

/** 智能体 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  platformId?: string;
  modelId?: string;
  /** 模型候选池（智能体层）：未配置的槽位按 平台池 → 全局池 → 自动兜底 回退（services/model-pools.ts） */
  modelPools?: ModelPools;
  /** 智能体类型：harness（默认，挂载即用）| workflow（DAG 连线编排） */
  type?: AgentType;
  /** Harness 挂载：内置工具名列表 */
  builtinToolIds?: string[];
  /** Harness 挂载：自定义工具 ID 列表 */
  customToolIds?: string[];
  /** Harness 挂载：MCP 工具挂载配置 */
  mcpToolMounts?: McpToolMount[];
  /** Harness 挂载：Skill ID 列表 */
  skillIds?: string[];
  /** Harness 挂载：子智能体 ID 列表 */
  subAgentIds?: string[];
  /** Harness 挂载：本体 ID 列表（数据查询类智能体的取数范围；空 = 不限，可见全部已发布本体） */
  ontologyIds?: string[];
  /** Harness 挂载：知识库 ID 列表（知识库检索范围；空/未设置 = 不限，跨全部可见知识库检索；非空 = 仅检索这些库） */
  knowledgeBaseIds?: string[];
  /** 智能体自定义分类标签（自由文本，用于智能体列表分组/筛选；与 agentKind 主从分类相互独立） */
  category?: string;
  workflow: Workflow;
  inputsSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
  parentAgentId?: string;
  allowSubAgent: boolean;
  isDefault: boolean;
  /** 是否为内置智能体（harness 内置，如 pageAgent）。内置智能体不可删除、类型不可改。 */
  isBuiltin?: boolean;
  /** 智能体分类：main=主智能体（可在会话中直接选中）/ sub=子智能体（仅供其他智能体通过 subAgentIds 引用委派，会话中不可选中） */
  agentKind?: 'main' | 'sub';
  /** 是否发布到商城（is_public）。本地表冗余字段，发布时同步 upsert 到服务端 agent 表 */
  isPublic?: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

/** 工作流 */
export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

/** 节点类型 */
export type NodeType =
  | 'llm'
  | 'tool'
  | 'condition'
  | 'loop'
  | 'sub_agent'
  | 'memory_read'
  | 'memory_write'
  | 'human_confirm'
  | 'input'
  | 'output'
  | 'code';

/** 工作流连线 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

/** 智能体节点（DB 持久化形式，独立于 WorkflowNode）
 *  注：当前 workflow_json 已直接存节点+连线，这张表为冗余备份/查询用，可空 */
export interface AgentNode {
  id: string;
  agentId: string;
  type: NodeType;
  configJson: string;
  positionJson: string;
}

/** 记忆 */
export interface Memory {
  id: string;
  agentId: string;
  content: string;
  tags: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastUsedAt: number;
}

/** Skill frontmatter */
export interface SkillFrontmatter {
  name: string;
  description?: string;
  triggers?: string[];
  tools?: string[];
  [key: string]: unknown;
}

/** Skill */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  source: 'local' | 'market';
  path?: string;
  frontmatter: SkillFrontmatter;
  bodyMd: string;
  enabled: boolean;
  createdAt: number;
}

/**
 * 技能概览（2026-10-15，Skill 蒸馏两段式生成流程的中间态）：
 * 勾选消息 → AI 生成概览（人可修正）→ 概览在提炼时做硬约束 → AI 提炼成 SKILL.md。
 * 对标 WorkMateAI 的「技能概览」表单（中文名称/英文标识/说明/前置输入/处理过程/输出内容）。
 */
export interface SkillOverview {
  /** 中文名称，如「停电排查与报障处理」 */
  nameZh: string;
  /** 英文标识 kebab-case，如 power-outage-investigation-and-reporting */
  slug: string;
  /** 一句话说明 */
  description: string;
  /** 前置输入 */
  inputs: string[];
  /** 处理过程概述（编号步骤） */
  steps: string[];
  /** 输出内容 */
  outputs: string[];
  /** 触发词（沿用既有 triggers 概念） */
  triggers: string[];
}

/** 蒸馏草稿状态机：overview（仅概览）→ draft（已提炼 SKILL.md）→ published（已发布为 skill 表） */
export type SkillDraftStatus = 'overview' | 'draft' | 'published';

/** 模型调用日志 */
export interface ModelCall {
  id: string;
  platformId: string;
  modelId: string;
  endpoint: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  createdAt: number;
}

/** 聊天请求参数 */
export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
}

/** 流式聊天分片 */
export interface ChatChunk {
  delta?: {
    content?: string;
    reasoningContent?: string;
    toolCalls?: DeltaToolCall[];
  };
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    /**
     * ★ 缓存命中的 token 数（2026-10-09，D1 可观测）。
     *
     * 为什么需要：Anthropic 用 `cache_read_input_tokens`、OpenAI 用 `prompt_tokens_details.cached_tokens`。
     * 此前只读 prompt/completion → **缓存命中率不可观测**，于是"前缀缓存是否生效"无从判断
     * （而 system prompt 尾部的时间戳恰好会让它 100% 失效，且改前看不出来）。
     * ⇒ 先能看见，再谈优化（本项与"移除 system 尾部时间戳"配对）。
     */
    cachedTokens?: number;
    /**
     * ★ 归一化后的用量明细（2026-10-17）——**计价唯一输入**。
     *
     * 为什么不能只用上面三个字段计费：OpenAI 的 `cachedTokens` 是 `promptTokens` 的**子集**，
     * 而 Anthropic 的 `cache_read` **不在** `input_tokens` 里 —— 两者语义相反。
     * 拿 `promptTokens` 直接乘单价，必错其一（OpenAI 重复计缓存、Anthropic 漏掉缓存）。
     *
     * ★ 旧字段语义**冻结不动**：它们继续喂 `task.totalTokens` 的 token 预算；
     *   本字段只喂成本计算。改旧字段 = 同时动两套口径。
     */
    detail?: TokenUsageDetail;
  };
  /**
   * ★ 流已**正常收尾**的标记（2026-10-09）。
   *
   * 为什么要它：上游/代理常用 TCP FIN 半途关闭 SSE 连接，此时 `reader.read()` 是
   * **正常 resolve `{done:true}` 而不是抛错**（只有 RST/超时才抛）。若只看"流结束"，
   * 半截流会被误判为正常完成 → content 为空、reasoning 只有一半，却 emit task:completed
   * （实测库内 12 条 assistant 记录正是此形状，用户看到的就是"转半天不出话"）。
   *
   * 判据：**见到 `finish_reason`（stop/tool_calls/length…）或 `data: [DONE]` 之一**才算收尾。
   * 二者皆无而流结束 = 被掐断（调用方据此走续写/报错，勿当正常完成）。
   * 该标记会作为最后一个 chunk 吐出（`finishReason` 可能为空，仅此标记为真）。
   */
  terminated?: boolean;
}
