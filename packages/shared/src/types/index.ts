// 核心类型定义（对应数据库实体）
export * from './marketplace.js';

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
  pricing?: { input?: number; output?: number }; // 每千 token 价格（元）
  lastChatTestAt?: number;
  lastChatTestOk?: boolean;
}

/** 会话 */
export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  platformId?: string;
  modelId?: string;
  mcpServerIds: string[];
  _mcpDisabledTools?: Record<string, string[]>;
  _mcpToolAliases?: Record<string, Record<string, string>>;
  skillIds: string[];
  systemPrompt?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
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
  workflow: Workflow;
  inputsSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
  parentAgentId?: string;
  allowSubAgent: boolean;
  isDefault: boolean;
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
