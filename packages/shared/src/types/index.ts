// 核心类型定义（对应数据库实体）
export * from './marketplace.js';
export * from './cicd.js';

/** 平台协议类型 */
export type Protocol = 'openai' | 'anthropic' | 'custom';

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
  /** 是否为内置平台/模型，内置项只读 */
  isBuiltin?: boolean;
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
  contextWindow: number;
  enabled: boolean;
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
  /** 由定时任务发起时记录的任务 ID，用于在会话列表显示定时标记 */
  scheduledTaskId?: string;
  mcpServerIds: string[];
  _mcpDisabledTools?: Record<string, string[]>;
  _mcpToolAliases?: Record<string, Record<string, string>>;
  skillIds: string[];
  builtinToolIds?: string[]; // 会话级内置工具（合并到智能体级）
  systemPrompt?: string;
  pinned: boolean;
  /** 会话级工具权限：readonly=只读（写类工具被后端拦截）/ default=默认 / full=全部放行 */
  permissionMode?: 'readonly' | 'default' | 'full';
  createdAt: number;
  updatedAt: number;
}

/** 空间（文件夹）：组织会话与目录绑定 */
export interface Space {
  id: string;
  name: string;
  /** 绑定的本地目录路径（桌面端可选） */
  dirPath?: string;
  description?: string;
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
  /** 内嵌于聊天消息里的动态看板（数据浏览）契约；非持久化 UI 增强，见 data-query-contract change */
  dataView?: InlineDataView;
}

/** 聊天内嵌「数据浏览/动态看板」契约：只声明取数源 + 想要当过滤器的列；取数由面板 /run 参数化完成，不喂 LLM */
export interface InlineDataView {
  title?: string;
  datasourceId?: string;
  table?: string;
  base?: string;
  filterCols?: string[];
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
  };
}
