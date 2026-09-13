// LLM 任务管理器 —— 后端独立运行 ReAct 循环，前端通过 SSE 订阅。
// 前端构建完整系统提示词 + 工具 schema 发给后端，后端负责 LLM 编排 + 工具执行。
// 内置工具（file/cmd/browser 等）后端直接执行，刷新不中断。
// UI 交互工具（ask_user/confirm_user 等）和 MCP/自定义工具委托前端，刷新时暂停等待重连。
// 注：web_search 已移除，联网查询统一委派 pageAgent（真实浏览器搜索引擎）。
import type { Platform, Model, Message, DeltaToolCall } from '@yan-zhi/shared';
import { LlmClient, getToolRegistry, getApiToolRegistry, ContextWindow } from '@yan-zhi/core';
import { db } from './db.js';
import { normalizePermissionMode, checkToolPermission, filterToolsByPermission, permissionModePrompt, type PermissionMode } from './tool-permission.js';
import { ensureToolsInitialized } from './mcp/index.js';
import { executeApiTool } from './mcp/api-tool-executor.js';
import { getToolsFromDb, mcpShortIdOf, resolveMcpToolName, callMcpTool } from './mcp/client-manager.js';
import {
  retrieveRelevantMemories, formatMemoryContext, bumpMemoryUsage,
  writeMemoryItems, flushMemoriesBeforeCompression, parseExtractedItems, type MemoryWriteItem,
} from './services/memory-service.js';
import { loadSpaceMemoryForConversation, formatSpaceMemoryContext } from './services/space-memory.js';
import { serverState } from './state.js';
import { promises as fsp } from 'node:fs';

export type TaskStatus = 'running' | 'completed' | 'failed' | 'aborted';

export interface SSEEvent {
  type: string;
  [key: string]: any;
}

interface PendingToolCall {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  toolName?: string;
  callId?: string;
  requestedAt?: number;
  timer?: ReturnType<typeof setTimeout>;
}

interface LlmTask {
  id: string;
  conversationId: string;
  userId: string;
  status: TaskStatus;
  platformId: string;
  modelId: string;
  events: SSEEvent[];
  subscribers: Set<(event: SSEEvent) => void>;
  abortController: AbortController;
  createdAt: number;
  error?: string;
  pendingToolCalls: Map<string, PendingToolCall>;
  seq: number;
  step: number;
  origin?: string;
  offlinePolicy?: string;
  agentId?: string | null;
  includeUiTools?: boolean;
  /** 会话级 MCP 挂载的 serverId 集合（无人值守时后端直连 MCP 兜底用） */
  mountedMcpServerIds?: string[];
  /** 记忆抽取/抢救用模型（前端设置页下发；空则回退任务自身的平台/模型） */
  memoryExtractPlatformId?: string;
  memoryExtractModelId?: string;
  /** 智能体挂载的本体 id 集合（前端随任务下发；空/未设置 = 取数不限本体范围） */
  ontologyIds?: string[];
  /** 会话级工具权限：readonly=只读（写类工具构建期裁剪+运行时拦截）/ default=正常 / full=全部放行 */
  permissionMode?: 'readonly' | 'default' | 'full';
}

const tasks = new Map<string, LlmTask>();
const MAX_EVENTS = 10000; // SSE 事件缓冲上限，防止长任务内存泄漏
let playwrightAvailable: boolean | null = null; // Playwright 可用性缓存（null=未检测）

function emit(task: LlmTask, event: SSEEvent) {
  task.seq++;
  event.seq = task.seq;
  task.events.push(event);
  // 超出上限时丢弃最旧的事件（重连重放只保留最近 MAX_EVENTS 条）
  if (task.events.length > MAX_EVENTS) {
    task.events.splice(0, task.events.length - MAX_EVENTS);
  }
  for (const sub of task.subscribers) {
    try { sub(event); } catch {}
  }
}

function rowToMsg(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content || '',
    toolCalls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : undefined,
    toolCallId: row.tool_call_id || undefined,
    reasoningContent: row.reasoning_content || undefined,
    parentToolCallId: row.parent_tool_call_id || undefined,
    subAgentId: row.sub_agent_id || undefined,
    subAgentName: row.sub_agent_name || undefined,
    subAgentDepth: row.sub_agent_depth ?? undefined,
    createdAt: row.created_at,
  } as any;
}

function loadPlatform(platformId: string, userId: string): Platform | null {
  const row = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').get(platformId, userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol || 'openai',
    apiUrl: row.api_url || '',
    headers: (() => { try { return JSON.parse(row.headers_json || '{}'); } catch { return {}; } })(),
  } as any;
}

function loadModel(modelId: string, userId: string): Model | null {
  const row = db.prepare('SELECT * FROM model WHERE id = ? AND user_id = ?').get(modelId, userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    platformId: row.platform_id,
    modelId: row.model_id,
    alias: row.alias,
    type: row.type || 'llm',
    contextWindow: row.context_window || 8000,
    capabilities: (() => { try { return JSON.parse(row.capabilities_json || '[]'); } catch { return []; } })(),
    description: row.description ?? undefined,
  } as any;
}

/** list_models 工具执行：列出当前用户所有已启用模型（可按 platformId/type/capability 过滤），
 *  返回语义化文本，供 LLM 选型（图片/视频/视觉/推理等任务指定模型）。 */
function listAvailableModels(userId: string, args: Record<string, unknown>): string {
  const platformId = args.platformId as string | undefined;
  const typeFilter = args.type as string | undefined;
  const capFilter = args.capability as string | undefined;

  // 查平台（含过滤）
  let platformRows: any[];
  if (platformId) {
    platformRows = db.prepare('SELECT * FROM platform WHERE id = ? AND user_id = ?').all(platformId, userId) as any[];
  } else {
    platformRows = db.prepare('SELECT * FROM platform WHERE user_id = ?').all(userId) as any[];
  }
  if (platformRows.length === 0) return platformId ? `平台不存在或无权限: ${platformId}` : '当前用户未配置任何模型平台';

  const lines: string[] = [];
  let total = 0;
  for (const p of platformRows) {
    const models = db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ? AND enabled = 1').all(p.id, userId) as any[];
    let matched: any[] = models;
    if (typeFilter) matched = matched.filter((m: any) => (m.type || 'llm') === typeFilter);
    if (capFilter) {
      matched = matched.filter((m: any) => {
        try { return (JSON.parse(m.capabilities_json || '[]')).includes(capFilter); } catch { return false; }
      });
    }
    if (matched.length === 0) continue;

    lines.push(`**平台 ${p.name}** (id: \`${p.id}\`, protocol: ${p.protocol || 'openai'})`);
    for (const m of matched) {
      total++;
      const caps = (() => { try { return JSON.parse(m.capabilities_json || '[]'); } catch { return []; } })();
      const type = m.type || 'llm';
      const alias = m.alias || m.model_id;
      const desc = m.description ? ` | 描述: ${m.description}` : '';
      const capStr = caps.length ? ` | 能力: ${caps.join(',')}` : '';
      lines.push(`  - ${alias} (model: \`${m.model_id}\`, id: \`${m.id}\`) [type=${type}${capStr}]${desc}`);
    }
  }

  if (total === 0) {
    const hint = typeFilter || capFilter ? `（过滤条件 type=${typeFilter || '-'} capability=${capFilter || '-'} 下无匹配）` : '';
    return `未找到可用模型${hint}。可用 list_models（不带过滤）查看全部模型。`;
  }
  lines.unshift(`共 ${total} 个可用模型：`);
  return lines.join('\n');
}

function loadMessages(convId: string): Message[] {
  const rows = db.prepare('SELECT * FROM message WHERE conversation_id = ? ORDER BY created_at ASC').all(convId) as any[];
  return rows.map(rowToMsg);
}

/** 加载子智能体消息：按 parent_tool_call_id 过滤，只取该子智能体自己的消息 */
function loadSubAgentMessages(convId: string, parentToolCallId: string): Message[] {
  const rows = db.prepare('SELECT * FROM message WHERE conversation_id = ? AND parent_tool_call_id = ? ORDER BY created_at ASC').all(convId, parentToolCallId) as any[];
  return rows.map(rowToMsg);
}

// 工具结果单条上限：极端结果（如整页 DOM/网络日志几十上百 KB）入库和进入下轮上下文前先压缩，
// 保留头尾（头部通常是关键摘要，尾部常有分页/汇总信息），中段丢弃并在原位标注。
const MAX_TOOL_RESULT_CHARS = 48000;
function capToolResult(result: string): string {
  if (!result || result.length <= MAX_TOOL_RESULT_CHARS) return result;
  const head = 40000, tail = 6000;
  return result.slice(0, head)
    + `\n\n...[工具结果过长已压缩：原文 ${result.length} 字符，保留头 ${head} / 尾 ${tail}，中段省略]...\n`
    + result.slice(-tail);
}

function insertMessage(convId: string, userId: string, role: string, content: string, extra?: any): string {
  const id = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ts = Date.now();
  db.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id, convId, userId, role, content || null,
    extra?.toolCalls ? JSON.stringify(extra.toolCalls) : null,
    extra?.toolCallId || null,
    extra?.reasoningContent || null,
    extra?.systemPromptSnapshot || null,
    extra?.tokens || 0,
    extra?.parentToolCallId || null,
    extra?.subAgentId || null,
    extra?.subAgentName || null,
    extra?.subAgentDepth ?? null,
    ts,
  );
  return id;
}

function updateMessageContent(msgId: string, content: string, reasoning?: string, toolCalls?: any[], tokens?: number) {
  db.prepare(
    'UPDATE message SET content = ?, reasoning_content = ?, tool_calls_json = ?, tokens = COALESCE(?, tokens) WHERE id = ?',
  ).run(content, reasoning || null, toolCalls ? JSON.stringify(toolCalls) : null, tokens ?? null, msgId);
}

/** 创建任务并启动 ReAct 循环 */
export function createTask(params: {
  conversationId: string;
  userId: string;
  platformId: string;
  modelId: string;
  userContent?: string;
  agentId?: string | null;
  appGuide?: string;
  systemPrompt?: string;
  tools?: any[];
  options?: { temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string };
  modeFlags?: { thinking?: boolean; plan?: boolean; answerOnly?: boolean };
  maxSteps?: number;
  origin?: string;
  offlinePolicy?: string;
  /** 交互式任务（前端在线，走 SSE）：UI 工具（ask_user 等）纳入工具列表，无人值守任务排除 */
  includeUiTools?: boolean;
  memoryExtractPlatformId?: string;
  memoryExtractModelId?: string;
  ontologyIds?: string[];
  /** 前端显式下发的工作目录：优先于全局 serverState.workspaceDir 注入 system prompt */
  workspaceDir?: string;
}): string {
  // 幂等保护：同 conversationId 已有 running 任务则复用（避免重连重试创建多任务）
  for (const [id, existing] of tasks) {
    if (existing.conversationId === params.conversationId && existing.status === 'running') {
      return id;
    }
  }

  const taskId = 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // 会话级权限模式：以 conversation 表持久化值为准（前端下拉选择后随会话保存）
  let permissionMode: PermissionMode = 'default';
  try {
    const row = db.prepare('SELECT permission_mode FROM conversation WHERE id = ?').get(params.conversationId) as any;
    permissionMode = normalizePermissionMode(row?.permission_mode);
  } catch { /* 列未迁移等异常时按默认模式放行 */ }
  const task: LlmTask = {
    id: taskId,
    conversationId: params.conversationId,
    userId: params.userId,
    status: 'running',
    platformId: params.platformId,
    modelId: params.modelId,
    events: [],
    subscribers: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
    pendingToolCalls: new Map(),
    seq: 0,
    step: 0,
    origin: params.origin || 'chat',
    offlinePolicy: params.offlinePolicy,
    agentId: params.agentId ?? null,
    includeUiTools: !!params.includeUiTools,
    memoryExtractPlatformId: params.memoryExtractPlatformId || undefined,
    memoryExtractModelId: params.memoryExtractModelId || undefined,
    ontologyIds: params.ontologyIds,
    permissionMode,
  };
  tasks.set(taskId, task);
  emit(task, { type: 'task:created', taskId, conversationId: params.conversationId });
  void runReActLoop(task, params);
  return taskId;
}

/** 订阅任务事件（从 since 索引开始重放 + 后续实时事件） */
export function subscribe(taskId: string, since: number, onEvent: (event: SSEEvent) => void): () => void {
  const task = tasks.get(taskId);
  if (!task) return () => {};
  for (let i = since; i < task.events.length; i++) {
    try { onEvent(task.events[i]); } catch {}
  }
  task.subscribers.add(onEvent);
  // 前端重连：清除所有 pendingToolCalls 的断连宽限期 timer，工具调用继续等待前端结果
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.timer) { clearTimeout(pending.timer); pending.timer = undefined; }
  }
  return () => {
    task.subscribers.delete(onEvent);
    // 最后一个订阅者断开：给 pendingToolCalls 设 15 秒宽限期，超时则 reject（避免等 2 分钟）
    if (task.subscribers.size === 0 && task.status === 'running') {
      for (const [id, pending] of task.pendingToolCalls) {
        if (pending.timer) continue; // 已有 timer 不重复设
        pending.timer = setTimeout(() => {
          const p = task.pendingToolCalls.get(id);
          if (p) {
            task.pendingToolCalls.delete(id);
            p.reject(new Error(`前端断连，工具 ${p.toolName || id} 未在 15 秒内重连`));
          }
        }, 15000);
      }
    }
  };
}

/** 终止任务 */
export function abortTask(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  task.abortController.abort();
  task.status = 'aborted';
  for (const [, pending] of task.pendingToolCalls) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(new DOMException('Aborted', 'AbortError'));
  }
  task.pendingToolCalls.clear();
}

function unattendedToolResult(toolName: string): string {
  return `[无人值守] 工具 ${toolName} 需要前端交互（用户输入/确认/浏览器界面），但当前没有任何前端在线，无法执行。`
    + `请基于已有信息自行决策并继续完成任务；如果确实必须用户参与，请在最终回复中明确说明需要用户补充什么。`;
}

/**
 * 从工具调用参数中健壮地提取 URL —— 模型常把 URL 放在非 url 字段（target/address/link/href/page 等），
 * 或直接把 arguments 写成 JSON 字符串。只认 args.url 会导致「缺少 url 参数」误报。
 * 与前端 stores/chat.ts extractUrlFromArgs 保持一致，迁移后端时遗漏，现补齐。
 */
function extractUrlFromArgs(args: unknown): string {
  if (typeof args === 'string') return args.trim();
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>;
    for (const k of ['url', 'target', 'address', 'link', 'href', 'page', 'site', 'to', 'uri', 'location', 'query', 'q']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const strVals = Object.values(o).filter((v) => typeof v === 'string' && (v as string).trim());
    if (strVals.length === 1) return String(strVals[0]).trim();
  }
  return '';
}

/**
 * 容错解析 [TOOL_CALL] 内的 JSON —— 小模型常输出格式错误的 JSON（如 [" 替代 ,"、单引号替代双引号），
 * 严格 JSON.parse 会失败导致工具不执行。此函数尝试多种修复策略，最后用正则提取 name/arguments 兜底。
 */
function parseLenientToolCall(jsonStr: string): { name: string; arguments: any } | null {
  // 策略1：直接解析
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  // 策略2：修复常见 JSON 格式错误
  try {
    const fixed = jsonStr
      .replace(/"\s*\[\s*"/g, '","')   // [" → ,"（模型混淆 [ 和 ,）
      .replace(/'\s*:\s*'/g, '":"')    // 单引号键值 → 双引号
      .replace(/'\s*:\s*"/g, '":"')    // ': → ":
      .replace(/"\s*:\s*'/g, '":"')    // :' → :"
      .replace(/,\s*}/g, '}');          // 尾逗号
    const parsed = JSON.parse(fixed);
    if (parsed.name) return { name: parsed.name, arguments: parsed.arguments || {} };
  } catch {}
  // 策略3：正则提取 name 和 arguments 兜底
  const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/i);
  const argsMatch = jsonStr.match(/"arguments"\s*:\s*(\{[\s\S]*?\})/i);
  if (nameMatch) {
    let args: any = {};
    if (argsMatch) {
      try { args = JSON.parse(argsMatch[1]); } catch {
        try { args = JSON.parse(argsMatch[1].replace(/'\s*:\s*'/g, '":"').replace(/'\s*:/g, '":').replace(/:\s*'/g, ':"')); } catch {}
      }
    }
    return { name: nameMatch[1], arguments: args };
  }
  return null;
}

/** 从 content 中解析所有 [TOOL_CALL] 块和 <function=xxx> XML 块（大小写不敏感），返回工具调用数组 + 清理后的 content */
function parseTextModeToolCalls(fullContent: string): { toolCalls: { id: string; name: string; arguments: string }[]; cleanedContent: string } {
  const toolCalls: { id: string; name: string; arguments: string }[] = [];
  // 大小写不敏感匹配 [TOOL_CALL]...[/TOOL_CALL]，容忍模型输出 [/toOL_CALL] 等变体
  const re = /\[TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[\/TOOL_CALL\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullContent)) !== null) {
    const parsed = parseLenientToolCall(m[1]);
    if (parsed) {
      toolCalls.push({
        id: `text_tc_${Date.now()}_${toolCalls.length}`,
        name: parsed.name,
        arguments: JSON.stringify(parsed.arguments || {}),
      });
    }
  }
  // 兼容 <function=tool_name>{"arguments":...}</function> XML 格式（某些模型用这种格式）
  const xmlRe = /<function\s*=\s*(\w+)\s*>\s*(\{[\s\S]*?\})?\s*<\/function>/gi;
  while ((m = xmlRe.exec(fullContent)) !== null) {
    const toolName = m[1];
    let args: any = {};
    if (m[2]) {
      try { args = JSON.parse(m[2]); } catch { args = parseLenientToolCall(m[2])?.arguments || {}; }
    }
    toolCalls.push({
      id: `text_tc_${Date.now()}_${toolCalls.length}`,
      name: toolName,
      arguments: JSON.stringify(args),
    });
  }
  // 始终清理 [TOOL_CALL] 和 <function=xxx> 标记（含不完整块），避免前端"正在调用工具"chip 永驻
  const cleanedContent = fullContent
    .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
    .replace(/\[TOOL_CALL\][\s\S]*$/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
    .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/gi, '')
    .trim();
  return { toolCalls, cleanedContent };
}

/** 工具参数归一化兜底：模型文本模式工具调用常把必填参数放错字段或漏字段名，按工具语义补齐。 */
function normalizeToolArgs(toolName: string, args: any): any {
  if (!args || typeof args !== 'object') return args;
  const a: Record<string, unknown> = { ...args };
  if (toolName === 'browser_navigate' || toolName === 'browser_open_external') {
    if (!a.url || !(a.url as string).trim()) {
      const u = extractUrlFromArgs(a);
      if (u) a.url = u;
    }
  }
  return a;
}

/**
 * 同批多导航守卫：浏览器是单活动页状态机，同一批工具调用里出现多个 browser_navigate
 * 会互相覆盖，只有最后一个页面留存，中途的读取也只能读到当前页。
 * 处理：只保留第一个在当前页执行，其余标记 openInNewTab —— BrowserNavigateTool 会将其
 * 转为新开标签页（返回 tabId），模型可用读取工具的 tabId 参数分别读取各页内容。
 */
function markDuplicateNavigations(toolCalls: any[]): Set<string> {
  const ids = new Set<string>();
  let seen = 0;
  for (const tc of toolCalls || []) {
    const name = tc?.function?.name || tc?.toolName || '';
    if (name === 'browser_navigate') {
      seen++;
      if (seen > 1 && tc?.id) ids.add(String(tc.id));
    }
  }
  return ids;
}


/** 前端提交工具执行结果 */
export function resolveToolResult(taskId: string, callId: string, result: string) {
  const task = tasks.get(taskId);
  if (!task) return;
  const pending = task.pendingToolCalls.get(callId);
  if (!pending) return;
  task.pendingToolCalls.delete(callId);
  if (pending.timer) clearTimeout(pending.timer);
  pending.resolve(result);
}

/** 获取用户的活动任务 */
export function getActiveTasks(userId: string, conversationId?: string): any[] {
  const result: any[] = [];
  for (const task of tasks.values()) {
    if (task.userId !== userId) continue;
    if (task.status !== 'running') continue;
    if (conversationId && task.conversationId !== conversationId) continue;
    result.push({
      id: task.id,
      conversationId: task.conversationId,
      status: task.status,
      eventCount: task.events.length,
      createdAt: task.createdAt,
    });
  }
  return result;
}

/** 获取任务信息 */
export function getTask(taskId: string): LlmTask | undefined {
  return tasks.get(taskId);
}

/** 清理已完成的任务（定期调用） */
export function cleanupTasks(maxAgeMs: number = 30 * 60 * 1000) {
  const now = Date.now();
  const maxRunMs = 2 * 60 * 60 * 1000; // running 任务最大运行时长 2 小时
  for (const [id, task] of tasks) {
    if (task.status !== 'running' && now - task.createdAt > maxAgeMs) {
      tasks.delete(id);
    }
    // running 任务超 2 小时强制中止并清理（防内存泄漏）
    if (task.status === 'running' && now - task.createdAt > maxRunMs) {
      try { task.abortController.abort(); } catch {}
      task.status = 'failed';
      task.error = '任务运行超时（超过 2 小时）';
      tasks.delete(id);
    }
  }
}

/** 启动时回收上次进程遗留的孤儿任务：DB 里 running/waiting_tool → interrupted。
 *  简化版未做运行时持久化，此处仅清理 DB 残留（若有），并清空内存任务表。 */
export function markOrphanTasksInterrupted(): number {
  let n = 0;
  try {
    const rows = db.prepare("SELECT id, conversation_id FROM llm_task WHERE status IN ('running','waiting_tool')").all() as Array<{ id: string; conversation_id: string }>;
    for (const r of rows) {
      try {
        db.prepare("UPDATE llm_task SET status = 'interrupted', error = '服务重启，任务被中断' WHERE id = ?").run(r.id);
        n++;
      } catch {}
    }
  } catch { /* llm_task 表不存在则跳过 */ }
  // 内存中的任务本次启动不会有孤儿（新进程），清空即可
  return n;
}

/** 从 DB 查 llm_task 行（任务不在内存时，前端仍能查到"已中断"而不是 404） */
export function getTaskRow(taskId: string): any | undefined {
  try {
    return db.prepare('SELECT id, conversation_id, status, step, error, created_at, pending_tool_json FROM llm_task WHERE id = ?').get(taskId) as any | undefined;
  } catch {
    return undefined;
  }
}

// ============================================================
// ReAct 循环（后端独立运行）
// ============================================================
async function runReActLoop(task: LlmTask, params: {
  conversationId: string;
  userId: string;
  platformId: string;
  modelId: string;
  userContent?: string;
  agentId?: string | null;
  appGuide?: string;
  systemPrompt?: string;
  tools?: any[];
  options?: { temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string };
  modeFlags?: { thinking?: boolean; plan?: boolean; answerOnly?: boolean };
  maxSteps?: number;
  includeUiTools?: boolean;
  workspaceDir?: string;
}) {
  const { conversationId: convId, userId, options } = params;
  const maxSteps = params.maxSteps || 100;
  // 当前轮的助手占位消息 id：LLM 调用失败（429/超时/网络错误等）时把错误写进该占位消息落库，
  // 否则刷新后占位消息内容为空，用户看不到"调用失败"的痕迹。
  let activeAssistantMsgId: string | null = null;

  try {
    // 用户消息无条件先落库并推送：消息显示不应依赖平台/模型有效性（平台失效时用户消息也必须可见）
    if (params.userContent !== undefined) {
      const msgId = insertMessage(convId, userId, 'user', params.userContent);
      emit(task, { type: 'message:added', message: { id: msgId, role: 'user', content: params.userContent } });
    }

    const platform = loadPlatform(params.platformId, userId);
    const model = loadModel(params.modelId, userId);
    if (!platform || !model) {
      // 平台/模型失效：错误提示作为 assistant 消息落库+推送（刷新后仍可见），只发 task:error 前端仅 toast、刷新即丢
      const errMsg = `平台或模型不存在或已失效（platformId: ${params.platformId}），请在「设置 → 模型平台」重新选择可用模型后重试。`;
      const aid = insertMessage(convId, userId, 'assistant', errMsg);
      emit(task, { type: 'message:added', message: { id: aid, role: 'assistant', content: errMsg } });
      emit(task, { type: 'task:error', error: '平台或模型不存在' });
      task.status = 'failed';
      return;
    }

    const client = new LlmClient(platform, model);
    ensureToolsInitialized();
    const registry = getToolRegistry();
    const modelCaps = model.capabilities as string[] | undefined;
    const supportsTools = !modelCaps || modelCaps.length === 0 || modelCaps.includes('function_call');

    // 后端统一构建 systemPrompt/tools（单一事实来源）：前端只传 agentId/appGuide。
    // 历史兼容：显式传 systemPrompt/tools 则优先（定时任务等场景）。
    // 模式开关（前端「+」菜单）：无论提示词来自哪条路径，模式指令统一由后端追加、工具统一由后端裁剪。
    const modeFlags = params.modeFlags || {};
    const modePrompt: string[] = [];
    if (modeFlags.thinking) {
      modePrompt.push('- 深度思考模式：回答前先在内部充分推理，从多个角度权衡方案、核对关键假设后，再给出结论；正文保持结构化、重点突出。');
    }
    if (modeFlags.plan) {
      modePrompt.push('- 计划模式：动手执行前先制定完整分步计划。若 task_plan 工具可用，优先用 task_plan/task_step 登记计划与进度；否则以编号列表先给出计划，再按计划逐项执行并在每步完成后简要汇报。');
    }
    if (modeFlags.answerOnly) {
      modePrompt.push('- 仅回答模式：本次任务禁止调用任何工具（包括搜索、文件、代码执行与子智能体），直接依据已有知识与上下文用文字回答；若信息不足，明确说明缺什么，而不是尝试调用工具。');
    }
    // 会话级只读权限：模式指令告知模型按只读方式规划（工具列表已在下方同步裁剪，双保险）
    const permPrompt = permissionModePrompt(task.permissionMode || 'default');
    if (permPrompt) modePrompt.push(permPrompt);
    let systemPromptBuilt = params.systemPrompt !== undefined
      ? params.systemPrompt
      : buildSystemPromptForBackend(params.agentId ?? null, userId, params.appGuide, {
          conversationId: convId,
          includeUiTools: !!params.includeUiTools,
          userContent: params.userContent,
          workspaceDir: params.workspaceDir,
        });
    // 记忆注入：按用户当前输入检索相关记忆（recency×relevancy×type 加权、token 预算内），
    // 拼在 system prompt 尾部。检索失败绝不阻塞任务。
    if (params.userContent) {
      try {
        const mems = await retrieveRelevantMemories(userId, params.agentId ?? null, params.userContent, {
          conversationId: convId,
        });
        if (mems.length) {
          systemPromptBuilt += '\n\n' + formatMemoryContext(mems);
          bumpMemoryUsage(mems.map((m) => m.id));
        }
      } catch { /* 记忆注入失败不影响任务 */ }
    }
    // 空间记忆文件注入：会话归属空间时，读取空间 MEMORY.md（跨会话、所有智能体共享同一份），失败不阻塞
    try {
      const spaceMem = loadSpaceMemoryForConversation(convId);
      if (spaceMem) {
        systemPromptBuilt += '\n\n' + formatSpaceMemoryContext(spaceMem.spaceName, spaceMem.content);
      }
    } catch { /* 空间记忆注入失败不影响任务 */ }
    // 浏览器记忆不做自动注入：按需召回模式，智能体需要时调用 api_browser_memory_read 工具拉取
    if (modePrompt.length) {
      systemPromptBuilt += '\n\n## 模式指令（用户在输入框开启，优先级高于默认行为）\n' + modePrompt.join('\n');
    }
    let toolsBuilt = params.tools !== undefined
      ? params.tools
      : buildToolsForBackend(params.agentId ?? null, userId, {
          conversationId: convId,
          includeUiTools: !!params.includeUiTools,
        });
    if (modeFlags.answerOnly) toolsBuilt = [];
    // 只读权限：构建期就把写类工具从列表里摘掉，模型根本看不到（运行时 executeTool 还有拦截兜底）。
    // 注意：显式传入 params.tools 的场景（定时任务等）同样按会话权限裁剪，权限不因调用来源放松。
    toolsBuilt = filterToolsByPermission(task.permissionMode || 'default', toolsBuilt);
    const tools = supportsTools ? toolsBuilt : [];
    // 记录会话级 MCP 挂载 serverId：无人值守（前端不在线）时后端直连 MCP 兜底
    task.mountedMcpServerIds = getMergedMcpServerIds(params.agentId ?? null, userId, convId);

    // UI 交互工具 —— 必须委托前端执行（需要用户输入/确认）
    // call_agent/list_sub_agents 已改为后端直接执行（后端有会话id，能查 DB）
    const UI_TOOLS = new Set([
      'ask_user', 'confirm_user', 'configure_model_platform', 'task_plan', 'task_step',
      'image_analyze',
    ]);

    for (let step = 0; step < maxSteps; step++) {
      if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      task.step = step;
      emit(task, { type: 'step', step });

      // 加载最新消息
      let messagesToSend = loadMessages(convId);
      messagesToSend = messagesToSend.filter(m => m.content || m.toolCalls || m.role === 'tool' || (m as any).reasoningContent);
      // 上下文窗口压缩：超限时先抢救细节再生成结构化摘要（LLM 摘要而非硬截断）
      const ctxWindow = new ContextWindow(model.contextWindow || 8000, 6);
      ctxWindow.setSummaryModel(platform, model);
      if (ctxWindow.needsCompression(messagesToSend)) {
        let flushedThisRun = false; // 每个任务最多抢救一次
        messagesToSend = await ctxWindow.compress(messagesToSend, {
          beforeCompress: async (toCompress) => {
            if (flushedThisRun) return;
            flushedThisRun = true;
            // 抢救同样优先用「记忆抽取模型」（小模型足够），未配置则回退任务模型
            const memLlm = resolveMemoryExtractLlm(task) || { platform, model };
            await flushMemoriesBeforeCompression(
              { userId, conversationId: convId, agentId: task.agentId ?? null, platform: memLlm.platform, model: memLlm.model },
              toCompress,
            );
          },
        });
      }

      // 使用后端统一构建的系统提示词（或历史兼容的前端传入）
      const systemPrompt = systemPromptBuilt;
      const llmMessages: Message[] = [];
      if (systemPrompt) {
        llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
      }
      llmMessages.push(...messagesToSend.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      })));

      // 文本模式工具调用：模型不支持 function calling 时，在 system prompt 注入 [TOOL_CALL] 格式说明
      const hasToolsToExpose = toolsBuilt.length > 0;
      if (tools.length === 0 && hasToolsToExpose && llmMessages[0]?.role === 'system') {
        const toolList = toolsBuilt.map((t: any) => {
          const props = t.function.parameters?.properties || {};
          const req = t.function.parameters?.required || [];
          const params = Object.entries(props).map(([k, v]: [string, any]) =>
            `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
          ).join('\n');
          return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
        }).join('\n');
        llmMessages[0].content += `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
      }

      // 构建完整提示词快照（供前端"查看提示词"展示）
      const snap = JSON.stringify({
        step,
        timestamp: new Date().toISOString(),
        model: { id: model.modelId || model.id, alias: model.alias, contextWindow: model.contextWindow },
        platform: { id: platform.id, name: platform.name, protocol: platform.protocol },
        parameters: {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          topP: options?.topP,
          reasoningEffort: options?.reasoningEffort,
        },
        systemPrompt: llmMessages[0]?.role === 'system' ? llmMessages[0].content : '',
        tools: toolsBuilt.map((t: any) => ({
          name: t.function?.name || t.name,
          description: t.function?.description || '',
          parameters: t.function?.parameters,
        })),
        // 原模原样：content 保留模型原始输出（含 [TOOL_CALL] 块），toolCalls 原样透传不做重排
        messages: llmMessages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' && m.content.length > 4000 ? m.content.slice(0, 3997) + '...' : m.content || '',
          toolCalls: m.toolCalls,
        })),
      }, null, 2);

      // 添加助手占位消息
      const assistantMsgId = insertMessage(convId, userId, 'assistant', '', { systemPromptSnapshot: snap });
      activeAssistantMsgId = assistantMsgId;
      emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '', systemPromptSnapshot: snap } });

      // 流式请求
      let fullContent = '';
      let fullReasoning = '';
      let usageTokens = 0; // 本轮 LLM 调用 token 用量（provider 返回 usage 时累计，供 LLM 交互日志统计）
      const toolCallAcc: DeltaToolCall[] = [];

      try {
        for await (const chunk of client.chatStream(llmMessages, {
          tools: tools.length > 0 ? tools : undefined,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          topP: options?.topP,
          frequencyPenalty: (options as any)?.frequencyPenalty,
          presencePenalty: (options as any)?.presencePenalty,
          reasoningEffort: options?.reasoningEffort,
          signal: task.abortController.signal,
        })) {
          if (chunk.usage) {
            usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0);
          }
          if (chunk.delta?.content) {
            fullContent += chunk.delta.content;
            emit(task, { type: 'chunk', content: chunk.delta.content });
          }
          if (chunk.delta?.reasoningContent) {
            fullReasoning += chunk.delta.reasoningContent;
            emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent });
          }
          if (chunk.delta?.toolCalls) {
            for (const tc of chunk.delta.toolCalls) {
              let idx = tc.index;
              if (idx === undefined) {
                if (tc.id) {
                  const existById = toolCallAcc.findIndex(x => x.id === tc.id);
                  idx = existById >= 0 ? existById : toolCallAcc.length;
                } else if (tc.function?.name) {
                  idx = toolCallAcc.length;
                } else {
                  idx = toolCallAcc.length > 0 ? toolCallAcc.length - 1 : 0;
                }
              }
              if (!toolCallAcc[idx]) {
                toolCallAcc[idx] = { ...tc };
              } else {
                const prev = toolCallAcc[idx];
                toolCallAcc[idx] = {
                  ...prev, ...tc,
                  function: tc.function
                    ? { ...prev.function, ...tc.function, arguments: (prev.function?.arguments || '') + (tc.function!.arguments || '') }
                    : prev.function,
                };
              }
            }
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        // 重试不带 tools
        if (/does not support tools|not support.*tool/i.test(e?.message || '') && tools.length > 0) {
          // 追加文本模式工具调用格式说明后重试
          const sysMsg = llmMessages[0];
          if (sysMsg?.role === 'system' && !(sysMsg.content || '').includes('[TOOL_CALL]')) {
            const toolList = tools.map((t: any) => {
              const props = t.function.parameters?.properties || {};
              const req = t.function.parameters?.required || [];
              const params = Object.entries(props).map(([k, v]: [string, any]) =>
                `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
              ).join('\n');
              return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
            }).join('\n');
            sysMsg.content = (sysMsg.content || '') + `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
          }
          fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
          for await (const chunk of client.chatStream(llmMessages, {
            temperature: options?.temperature, maxTokens: options?.maxTokens,
            signal: task.abortController.signal,
          })) {
            if (chunk.usage) {
              usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0);
            }
            if (chunk.delta?.content) {
              fullContent += chunk.delta.content;
              emit(task, { type: 'chunk', content: chunk.delta.content });
            }
            if (chunk.delta?.reasoningContent) {
              fullReasoning += chunk.delta.reasoningContent;
              emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent });
            }
          }
        } else {
          throw e;
        }
      }

      // 文本模式工具调用解析：模型输出 [TOOL_CALL]...[/TOOL_CALL] 或 <function=xxx> 时转结构化 toolCalls
      // 某些模型（如 agnes-2.5-flash）会把 [TOOL_CALL] 放在 reasoning_content 中，需同时检查
      // function call 模式可能返回工具名但 arguments 为空，需从 reasoning 中提取完整参数
      const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.every(tc => !tc.function?.arguments || tc.function.arguments === '{}' || tc.function.arguments === '');
      if (toolCallAcc.length === 0 || hasEmptyArgs) {
        const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION');
        const hasToolInReasoning = !hasToolInContent && (fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION'));
        if (hasToolInContent || hasToolInReasoning) {
          const source = hasToolInContent ? fullContent : fullReasoning;
          // 原模原样保留模型原始输出（content/reasoning 不做剥离），仅解析出结构化 toolCalls；
          // 前端展示时再隐藏工具块，模型下一轮也能看到自己上一轮的原始调用文本
          const { toolCalls: parsed } = parseTextModeToolCalls(source);
          if (hasEmptyArgs && parsed.length > 0) toolCallAcc.length = 0;
          for (const tc of parsed) {
            toolCallAcc.push({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } } as DeltaToolCall);
          }
          if (toolCallAcc.length > 0) {
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
          }
        }
      }

      // 更新助手消息（tokens：provider usage 优先，缺失时按内容长度粗估，供 LLM 交互日志统计）
      const estTokens = usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2);
      updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined, estTokens);
      emit(task, { type: 'message:updated', messageId: assistantMsgId, content: fullContent, reasoning: fullReasoning, toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined });

      // 无工具调用 → 完成
      if (toolCallAcc.length === 0) {
        // 空回复兜底：上一轮工具调用后模型返回空内容（常见于工具全失败），补提示避免用户看到空白
        if (!fullContent && !fullReasoning && step > 0) {
          const tip = '（助手未返回有效内容，可能是工具调用失败导致。请重试或换一种问法。）';
          updateMessageContent(assistantMsgId, tip);
          emit(task, { type: 'message:updated', messageId: assistantMsgId, content: tip });
        }
        emit(task, { type: 'task:completed' });
        task.status = 'completed';
        void extractMemoryFromConversation(task);
        return;
      }

      // 执行工具调用（同批多导航：第 2+ 个 browser_navigate 转为新开标签页）
      const newTabNavIds = markDuplicateNavigations(toolCallAcc);
      for (const tc of toolCallAcc) {
        const toolName = tc.function?.name || (tc as any).toolName || '';
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        if (newTabNavIds.has(String(tc.id || ''))) args.openInNewTab = true;
        emit(task, { type: 'tool:start', toolName, args });

        let result: string;
        try {
          result = await executeTool(task, registry, toolName, args, tc.id || '', UI_TOOLS, 0);
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          result = `工具执行失败: ${e?.message || e}`;
        }
        emit(task, { type: 'tool:result', toolName, result });

        // file_write 成功后注册到 conversation_file（分类管理，前端文件面板展示）
        if (toolName === 'file_write' && args.path && !result.startsWith('工具执行失败')) {
          try {
            const filePath = String(args.path);
            const sep = filePath.includes('/') ? '/' : '\\';
            const fileName = filePath.split(sep).pop() || filePath;
            const category = (args.category as string) === 'deliverable' ? 'deliverable' : 'intermediate';
            const cfId = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            db.prepare('INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(cfId, convId, userId, null, fileName, filePath, category, null, 0, 'agent', assistantMsgId, Date.now());
            emit(task, { type: 'file:registered', conversationId: convId });
          } catch {}
        }

        // 添加工具结果消息（入库前压缩，防止单条极端大结果撑爆消息表与下轮上下文）
        const cappedResult = capToolResult(result);
        const toolMsgId = insertMessage(convId, userId, 'tool', cappedResult, { toolCallId: tc.id });
        emit(task, { type: 'message:added', message: { id: toolMsgId, role: 'tool', content: cappedResult, toolCallId: tc.id } });
      }

      // 继续下一轮 ReAct
    }

    // 循环结束（达到最大步数）—— 先请模型基于已执行的上下文做一次无工具总结，
    // 输出进展汇报（已完成/关键结果/未完成原因/后续建议），而不是直接抛生硬的报错文案。
    let tipText = `已达到最大循环数（${maxSteps}），请检查任务是否需要拆分或调高工具配置。`;
    try {
      const hist = loadMessages(convId).filter(m => m.content || m.toolCalls || m.role === 'tool');
      const history: Message[] = hist.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      }));
      const summary = await summarizeOnMaxSteps(client, systemPromptBuilt, history, maxSteps, 'main');
      if (summary) {
        tipText = `${summary}\n\n（注：本次任务已达到最大循环步数（${maxSteps}），以上为阶段总结。如需继续，请拆分任务或调高智能体的最大循环步数配置。）`;
      }
    } catch { /* 总结失败回退固定文案 */ }
    const tipId = insertMessage(convId, userId, 'assistant', tipText);
    emit(task, { type: 'message:added', message: { id: tipId, role: 'assistant', content: tipText } });
    emit(task, { type: 'task:completed' });
    task.status = 'completed';
    void extractMemoryFromConversation(task);
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      task.status = 'aborted';
      emit(task, { type: 'task:aborted' });
    } else {
      task.status = 'failed';
      task.error = e?.message || String(e);
      // 失败留痕：LLM 调用失败（429/401/超时/网络错误等）也要落库——本轮助手占位消息
      // 内容为空时直接把错误写进去，前端实时可见、刷新后也有记录；无占位消息则新增一条。
      const errText = `（调用失败：${task.error}）`;
      try {
        if (activeAssistantMsgId) {
          updateMessageContent(activeAssistantMsgId, errText);
          emit(task, { type: 'message:updated', messageId: activeAssistantMsgId, content: errText });
        } else {
          const failId = insertMessage(convId, userId, 'assistant', errText);
          emit(task, { type: 'message:added', message: { id: failId, role: 'assistant', content: errText } });
        }
      } catch { /* 落库失败不影响错误上报 */ }
      emit(task, { type: 'task:error', error: task.error });
    }
  }
}

/** 工具执行策略：
 *  - UI 交互工具（ask_user 等）→ 委托前端，刷新时暂停等待重连
 *  - MCP 工具（mcp_ 前缀，连接在前端）→ 委托前端
 *  - API 工具（api_ 前缀，操作 DB）→ 后端直接执行 executeApiTool
 *  - call_agent → 后端直接执行子 ReAct 循环
 *  - 自定义工具（custom_ 前缀，服务端沙箱）→ 后端直接执行 runInSandbox
 *  - 内置工具（file/cmd/browser 等）→ 后端直接执行，刷新不中断
 *  - 未知工具 → 委托前端兜底 */
/** 读文件文本用于修改快照；不存在/不可读返回 null（新文件场景），存在但超大返回 undefined（跳过快照防误回退）。 */
const FILE_SNAPSHOT_MAX_BYTES = 1024 * 1024;
async function readFileOrNull(p: string): Promise<string | null | undefined> {
  try {
    const stat = await fsp.stat(p);
    if (!stat.isFile()) return undefined;
    if (stat.size > FILE_SNAPSHOT_MAX_BYTES) return undefined;
    return await fsp.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

async function executeTool(
  task: LlmTask,
  registry: ReturnType<typeof getToolRegistry>,
  toolName: string,
  args: any,
  toolCallId: string,
  uiTools: Set<string>,
  depth: number = 0,
): Promise<string> {
  // 会话级权限拦截（readonly）：写类/不可控工具在此硬拒绝。
  // 放在函数最顶端 —— 被拒时提前 return，file_write/file_edit 的 file_change 快照钩子
  // （registry.execute 前后那段）自然不会执行，不会残留无意义的 pending 记录。
  const perm = checkToolPermission(task.permissionMode || 'default', toolName);
  if (!perm.allowed) {
    console.warn(`[llm-task] 权限拦截: conv=${task.conversationId} mode=${task.permissionMode} tool=${toolName}`);
    return perm.reason || `工具 ${toolName} 已被会话权限拒绝执行`;
  }
  const isUiTool = uiTools.has(toolName);
  const isMcp = toolName.startsWith('mcp_');
  const isCustom = toolName.startsWith('custom_');
  const isApi = toolName.startsWith('api_');

  // 参数归一化兜底：模型文本模式工具调用常把 url 放到 target/address/link 等字段，补齐避免误报缺参
  args = normalizeToolArgs(toolName, args);

  // UI 工具 → 委托前端（需要用户交互）；MCP 工具 → 优先委托前端（连接在前端，所见即所得），
  // 无人值守（定时任务/IM，无 SSE 订阅者）时后端直连 MCP 兜底，避免工具永远拿不到结果
  if (isUiTool || isMcp) {
    if (task.subscribers.size > 0) {
      return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
    }
    if (isMcp) {
      const resolved = resolveMcpToolName(task.mountedMcpServerIds || [], toolName);
      if (resolved) {
        try {
          return await callMcpTool(resolved.serverId, resolved.toolName, args);
        } catch (e: any) {
          return `MCP 工具执行失败: ${e?.message || e}`;
        }
      }
    }
    return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
  }

  // API 工具（api_memory_search/api_kb_search/api_data_* 等）→ 后端直接执行；agentId 用于本体挂载范围过滤
  if (isApi) {
    try {
      const result = await executeApiTool(toolName, args, task.userId, task.agentId ?? undefined, task.ontologyIds, task.conversationId);
      return result.content?.map((c: any) => c.text || '').join('') || JSON.stringify(result);
    } catch (e: any) {
      return `API 工具执行失败: ${e?.message || e}`;
    }
  }

  // call_agent → 后端直接执行子 ReAct 循环（仅主智能体可调用，子智能体深度=1 不可再嵌套）
  if (toolName === 'call_agent') {
    if (depth >= 1) return '子智能体不能再调用子智能体（深度仅允许 1 层）';
    return runSubAgent(task, args, toolCallId, depth, uiTools);
  }

  // list_sub_agents → 后端直接查 DB
  if (toolName === 'list_sub_agents') {
    const conv = db.prepare('SELECT agent_id FROM conversation WHERE id = ?').get(task.conversationId) as any;
    // 会话未绑定智能体时 fallback 到 a_default_assistant，确保始终能列出公开子智能体
    let agentId = conv?.agent_id;
    if (!agentId) {
      const def = db.prepare("SELECT 1 FROM agent WHERE id = 'a_default_assistant' AND (user_id = ? OR is_public = 1)").get(task.userId);
      if (def) agentId = 'a_default_assistant';
    }
    if (!agentId) return '当前会话未绑定智能体，且系统未配置默认智能体';
    const agent = db.prepare('SELECT sub_agent_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, task.userId) as any;
    const subIds: string[] = (() => { try { return JSON.parse(agent?.sub_agent_ids || '[]'); } catch { return []; } })();
    if (subIds.length === 0) return '当前智能体未挂载任何子智能体';
    const lines: string[] = [];
    for (const id of subIds) {
      const sub = db.prepare('SELECT name, description, platform_id, model_id FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(id, task.userId) as any;
      if (!sub) { lines.push(`- id: \`${id}\`（该子智能体已被删除）`); continue; }
      // 附带子智能体当前绑定的模型信息，供 call_agent 决策是否覆盖
      let modelNote = '';
      if (sub.platform_id || sub.model_id) {
        const mp = sub.platform_id ? db.prepare('SELECT name FROM platform WHERE id = ?').get(sub.platform_id) as any : null;
        const mm = sub.model_id ? db.prepare('SELECT alias, model_id, type FROM model WHERE id = ?').get(sub.model_id) as any : null;
        const pn = mp?.name || sub.platform_id;
        const mn = mm ? (mm.alias || mm.model_id) : sub.model_id;
        const mt = mm?.type ? `(${mm.type})` : '';
        modelNote = ` | 模型: ${pn}/${mn}${mt}`;
      }
      lines.push(`- **${sub.name}** (id: \`${id}\`): ${sub.description || ''}${modelNote}`);
    }
    return lines.join('\n');
  }

  // list_models → 后端直接查 DB，返回语义化的可用模型清单（平台 + type + capabilities + description）
  if (toolName === 'list_models') {
    return listAvailableModels(task.userId, args);
  }

  // 自定义工具 → 后端直接执行（node:vm 沙箱，避免后端→前端→后端绕圈）
  if (isCustom) {
    const m = toolName.match(/^custom_([a-zA-Z0-9]{1,8})_(.+)$/);
    if (m) {
      const idTag = m[1];
      const tName = m[2];
      const rows = db.prepare('SELECT id, name, code, entry, timeout, enabled, runtime FROM custom_tool WHERE user_id = ? AND enabled = 1').all(task.userId) as any[];
      const tool = rows.find((r: any) => (r.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) === idTag && r.name === tName);
      if (tool) {
        try {
          const { runUserCode } = await import('@yan-zhi/core');
          const result = await runUserCode(tool.code, tool.entry, args, { timeout: tool.timeout || 30000, runtime: tool.runtime || 'node' });
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (e: any) {
          return `工具执行失败: ${e?.message || e}`;
        }
      }
    }
    return `自定义工具不存在或未启用: ${toolName}`;
  }

  // 浏览器工具 → 在线（有 SSE 订阅者）全量委托前端 BrowserView 桥接（所见即所操作，
  // 预览面板可见虚拟鼠标/输入）。单一执行面：桌面在线时绝不回退服务端 Playwright，
  // 否则操作与预览分裂 + headless 被风控弹验证码。委托失败直接报错让模型重试。
  // 注意：白名单必须是全部 browser_* 前缀。若只放行 browser_navigate，会出现
  // navigate 打预览 BrowserView、click/type 等打服务端 headless Playwright 的双浏览器分裂
  // （Playwright 页面从未被导航 → locator.fill 30s 超时死循环）。
  const isBrowser = toolName.startsWith('browser_');
  if (isBrowser && task.subscribers.size > 0) {
    try {
      return await executeToolViaFrontend(task, toolName, args, toolCallId, depth);
    } catch (e: any) {
      if (e?.name === 'AbortError' || task.abortController.signal.aborted) throw e;
      // 前端委托超时/断连（SSE 瞬断、页面关闭）→ 明确报错，不静默切 Playwright
      return `浏览器工具 ${toolName} 前端暂时不可达（SSE 断连或超时），本次未执行。请稍后重试，或告知用户检查应用窗口是否开启。`;
    }
  }
  // 离线浏览器工具 → 检测 Playwright 可用性
  if (isBrowser) {
    if (playwrightAvailable === null) {
      try { await import('playwright'); playwrightAvailable = true; }
      catch { playwrightAvailable = false; }
    }
    if (!playwrightAvailable) {
      return `浏览器工具不可用：Playwright 未安装。请在 apps/server 执行 pnpm add playwright && npx playwright install chromium`;
    }
  }

  // 内置工具 → 后端直接执行
  if (registry.has(toolName)) {
    // 文件修改快照：file_write / file_edit 落盘前记下原内容，供前端 Diff 对比 / 应用 / 回退。
    // 钩子放在 executeTool 统一出口，主循环与子智能体（call_agent）都覆盖。
    const snapPath = (toolName === 'file_write' || toolName === 'file_edit') ? String(args?.path || '') : '';
    const before = snapPath ? await readFileOrNull(snapPath) : null;
    const r = await registry.execute(toolName, args);
    const text = typeof r === 'string' ? r : (r.content?.map((c: any) => c.text || '').join('') || JSON.stringify(r));
    if (snapPath && before !== undefined && !text.startsWith('Error') && !text.startsWith('工具执行失败')) {
      const after = await readFileOrNull(snapPath);
      if (before !== after) {
        try {
          db.prepare('INSERT INTO file_change (id, user_id, conversation_id, task_id, path, before_content, after_content, tool, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('fc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), task.userId, task.conversationId, task.id, snapPath, before, after, toolName, 'pending', Date.now());
        } catch { /* 快照失败不影响工具结果 */ }
      }
    }
    return text;
  }

  // 未知工具 → 尝试前端兜底
  return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
}

/** 通过 SSE 委托前端执行工具，等待前端 POST 结果回来。
 *  事件有缓冲：前端刷新断开时事件不丢失，重连后重放并执行。 */
function executeToolViaFrontend(task: LlmTask, toolName: string, args: any, toolCallId: string, depth: number = 0): Promise<string> {
  // 无人值守（无前端 SSE 订阅者）：UI/MCP 工具无法委托前端，直接返回提示让模型自行决策
  if (task.subscribers.size === 0) {
    return Promise.resolve(unattendedToolResult(toolName));
  }
  return new Promise<string>((resolve, reject) => {
    const callId = 'tc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const timer = setTimeout(() => {
      const pending = task.pendingToolCalls.get(callId);
      if (pending) {
        task.pendingToolCalls.delete(callId);
        console.warn(`[llm-task] 前端工具执行超时(2min): ${toolName} callId=${callId} conv=${task.conversationId}（前端刷新/断连时常见，任务将以此错误继续）`);
        pending.reject(new Error(`工具 ${toolName} 执行超时`));
      }
    }, 2 * 60 * 1000);
    task.pendingToolCalls.set(callId, { resolve, reject, toolName, callId, requestedAt: Date.now(), timer });
    // 通知前端执行工具
    emit(task, { type: 'tool:execute', callId, toolName, args, toolCallId, depth });
  });
}

/** call_agent 后端执行：查 DB agent 配置，递归跑子 ReAct 循环。
 *  子智能体消息写入同一会话，带 parent_tool_call_id/sub_agent_id 归属字段。 */
async function runSubAgent(
  task: LlmTask,
  args: { agentId?: string; input?: string; platformId?: string; modelId?: string },
  parentToolCallId: string,
  depth: number,
  uiTools: Set<string>,
): Promise<string> {
  const agentId = args.agentId || (args as any).agent_id || (args as any).id;
  const input = args.input || (args as any).sub_task || (args as any).task || (args as any).query;
  if (!agentId) return 'agentId 为必填项。请先调用 list_sub_agents 工具查看可用子智能体及其 ID，然后在 call_agent 的 arguments 中传入 agentId（如 "a_builtin_page_agent"）和 input（任务描述）参数。';
  if (!input) return 'input 为必填项。请在 call_agent 的 arguments 中传入 input 参数（描述要让子智能体执行的任务），例如 {"agentId":"a_builtin_page_agent","input":"打开网站并执行操作"}';
  if (depth >= 1) return '子智能体不能再调用子智能体（深度仅允许 1 层）';

  // 别名兜底
  const SUBAGENT_ALIASES: Record<string, string> = {
    pageAgent: 'a_builtin_page_agent',
    page_agent: 'a_builtin_page_agent',
    pageagent: 'a_builtin_page_agent',
  };
  const resolvedId = SUBAGENT_ALIASES[agentId] || agentId;

  // 查 DB agent 配置
  const agent = db.prepare('SELECT * FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(resolvedId, task.userId) as any;
  if (!agent) return `子智能体不存在: ${agentId}（可调用 list_sub_agents 工具查询可用子智能体及其 ID）`;

  // 解析平台/模型：调用方指定 > 子智能体配置 > 父任务（主智能体当前模型）
  const platformId = args.platformId || (agent.platform_id || task.platformId);
  const modelId = args.modelId || (agent.model_id || task.modelId);
  let platform = loadPlatform(platformId, task.userId);
  let model = loadModel(modelId, task.userId);
  if (!platform && modelId) {
    // 仅指定了 modelId 而未指定 platformId，或 platformId 无效：尝试按 model 反查平台
    const m = db.prepare('SELECT * FROM model WHERE id = ? AND user_id = ?').get(modelId, task.userId) as any;
    if (m) {
      platform = loadPlatform(m.platform_id, task.userId);
      model = loadModel(m.id, task.userId);
    }
  }
  if (!platform || !model) {
    if (args.platformId || args.modelId) {
      return `指定的子智能体模型不可用（platformId=${args.platformId || '-'}, modelId=${args.modelId || '-'}）。请先调用 list_models 工具查询可用平台与模型。`;
    }
    return '子智能体未配置平台/模型，无法执行';
  }

  // 构建子智能体工具列表
  const registry = getToolRegistry();
  const builtinIds: string[] = (() => { try { return JSON.parse(agent.builtin_tool_ids || '[]'); } catch { return []; } })();
  const subTools: any[] = [];
  const seen = new Set<string>();
  for (const name of builtinIds) {
    if (seen.has(name)) continue;
    // 子智能体不能再调用子智能体，排除 call_agent/list_sub_agents
    if (name === 'call_agent' || name === 'list_sub_agents') continue;
    seen.add(name);
    // 内置工具
    if (registry.has(name)) {
      const def = registry.get(name)!;
      subTools.push({ type: 'function', function: { name, description: def.description, parameters: def.inputSchema } });
      continue;
    }
    // API 工具（api_memory_search 等）
    if (name.startsWith('api_')) {
      for (const tools of getApiToolRegistry().values()) {
        const def = tools.find(t => t.name === name);
        if (def) {
          subTools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
          break;
        }
      }
    }
  }

  // 记忆四件套：未挂载专属 api_* 工具链的智能体默认可用。
  // 与 buildToolsForBackend 的「挂载优先」口径一致：挂了专属 api_* 工具（数据查询链）的
  // 只用它挂载的，避免记忆类工具分走去取数链的注意力。
  const hasOwnApiTools = builtinIds.some((n) => n.startsWith('api_'));
  const SUB_ALWAYS_API_TOOLS = hasOwnApiTools
    ? []
    : ['api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete'];
  const apiRegistrySub = getApiToolRegistry();
  for (const tName of SUB_ALWAYS_API_TOOLS) {
    if (seen.has(tName)) continue;
    for (const apiTools of apiRegistrySub.values()) {
      const def = apiTools.find(t => t.name === tName);
      if (def) {
        seen.add(tName);
        subTools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
        break;
      }
    }
  }

  const subAgentName = agent.name || resolvedId;
  const client = new LlmClient(platform, model);
  // 子智能体步数上限：尊重 agent 配置的 maxReActSteps（如 pageAgent 的 50），
  // 未配置时兜底 100。修复：旧写法 Math.max(x, 100) 把任何配置值强制抬到 ≥100，
  // pageAgent 配置 25 步失效，子智能体陷入循环时跑满 100 步，用户只能手动终止。
  const cfgSteps = (() => { try { return agent.config_json ? JSON.parse(agent.config_json).maxReActSteps : undefined; } catch { return undefined; } })();
  const maxSteps = typeof cfgSteps === 'number' && cfgSteps > 0 ? Math.min(Math.floor(cfgSteps), 100) : 100;
  const systemPrompt = agent.system_prompt || '你是一个智能助手。';
  const modelCaps = model.capabilities as string[] | undefined;
  const supportsTools = !modelCaps || modelCaps.length === 0 || modelCaps.includes('function_call');
  const tools = supportsTools ? subTools : [];

  emit(task, { type: 'sub_agent:start', agentId: resolvedId, agentName: subAgentName, parentToolCallId, depth: depth + 1 });

  // 插入子智能体用户消息
  const userMsgId = insertMessage(task.conversationId, task.userId, 'user', input, {
    parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
  });
  emit(task, { type: 'message:added', message: { id: userMsgId, role: 'user', content: input, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // 加载子智能体自己的消息（按 parent_tool_call_id 过滤，避免上下文污染）
      let messagesToSend = loadSubAgentMessages(task.conversationId, parentToolCallId);
      messagesToSend = messagesToSend.filter(m => m.content || m.toolCalls || m.role === 'tool' || (m as any).reasoningContent);
      const ctxWindow = new ContextWindow(model.contextWindow || 8000, 6);
      ctxWindow.setSummaryModel(platform, model);
      if (ctxWindow.needsCompression(messagesToSend)) {
        messagesToSend = await ctxWindow.compress(messagesToSend);
      }

      const llmMessages: Message[] = [];
      llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
      llmMessages.push(...messagesToSend.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      })));

      // 文本模式工具调用
      const hasToolsToExpose = subTools.length > 0;
      if (tools.length === 0 && hasToolsToExpose) {
        const toolList = subTools.map((t: any) => {
          const props = t.function.parameters?.properties || {};
          const req = t.function.parameters?.required || [];
          const params = Object.entries(props).map(([k, v]: [string, any]) =>
            `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
          ).join('\n');
          return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
        }).join('\n');
        llmMessages[0].content += `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
      }

      // 快照（与主智能体格式对齐：包含本轮实际发给大模型的完整消息历史，内容超长截断）
      const snap = JSON.stringify({
        step, subAgent: { id: resolvedId, name: subAgentName, depth: depth + 1 },
        timestamp: new Date().toISOString(),
        model: { id: model.modelId || model.id, alias: model.alias, contextWindow: model.contextWindow },
        platform: { id: platform.id, name: platform.name },
        parameters: {
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
          topP: agent.top_p,
          frequencyPenalty: agent.frequency_penalty,
          presencePenalty: agent.presence_penalty,
        },
        systemPrompt,
        tools: subTools.map((t: any) => ({ name: t.function.name, description: t.function.description })),
        // 原模原样：同主循环快照
        messages: llmMessages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' && m.content.length > 4000 ? m.content.slice(0, 3997) + '...' : m.content || '',
          toolCalls: m.toolCalls,
        })),
      }, null, 2);

      // 助手占位消息
      const assistantMsgId = insertMessage(task.conversationId, task.userId, 'assistant', '', {
        systemPromptSnapshot: snap, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
      });
      emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '', systemPromptSnapshot: snap, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });

      // 流式请求
      let fullContent = '';
      let fullReasoning = '';
      let usageTokens = 0;
      const toolCallAcc: DeltaToolCall[] = [];

      try {
        for await (const chunk of client.chatStream(llmMessages, {
          tools: tools.length > 0 ? tools : undefined,
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
          topP: agent.top_p,
          frequencyPenalty: agent.frequency_penalty,
          presencePenalty: agent.presence_penalty,
          signal: task.abortController.signal,
        })) {
          if (chunk.usage) {
            usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0);
          }
          if (chunk.delta?.content) {
            fullContent += chunk.delta.content;
            emit(task, { type: 'chunk', content: chunk.delta.content, subAgentId: resolvedId });
          }
          if (chunk.delta?.reasoningContent) {
            fullReasoning += chunk.delta.reasoningContent;
            emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent, subAgentId: resolvedId });
          }
          if (chunk.delta?.toolCalls) {
            for (const tc of chunk.delta.toolCalls) {
              let idx = tc.index;
              if (idx === undefined) {
                if (tc.id) {
                  const existById = toolCallAcc.findIndex(x => x.id === tc.id);
                  idx = existById >= 0 ? existById : toolCallAcc.length;
                } else if (tc.function?.name) {
                  idx = toolCallAcc.length;
                } else {
                  idx = toolCallAcc.length > 0 ? toolCallAcc.length - 1 : 0;
                }
              }
              if (!toolCallAcc[idx]) {
                toolCallAcc[idx] = { ...tc };
              } else {
                const prev = toolCallAcc[idx];
                toolCallAcc[idx] = {
                  ...prev, ...tc,
                  function: tc.function
                    ? { ...prev.function, ...tc.function, arguments: (prev.function?.arguments || '') + (tc.function!.arguments || '') }
                    : prev.function,
                };
              }
            }
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc], subAgentId: resolvedId });
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        // 重试不带 tools
        if (/does not support tools|not support.*tool/i.test(e?.message || '') && tools.length > 0) {
          const sysMsg = llmMessages[0];
          if (sysMsg?.role === 'system' && !(sysMsg.content || '').includes('[TOOL_CALL]')) {
            const toolList = tools.map((t: any) => {
              const props = t.function.parameters?.properties || {};
              const req = t.function.parameters?.required || [];
              const params = Object.entries(props).map(([k, v]: [string, any]) =>
                `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
              ).join('\n');
              return `- ${t.function.name}: ${t.function.description || ''}\n  参数：\n${params}`;
            }).join('\n');
            sysMsg.content = (sysMsg.content || '') + `\n\n## 工具调用（文本模式）\n当要调用工具时，在回复中以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数名":"参数值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
          }
          fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0; usageTokens = 0;
          for await (const chunk of client.chatStream(llmMessages, {
            temperature: agent.temperature, maxTokens: agent.max_tokens,
            signal: task.abortController.signal,
          })) {
            if (chunk.usage) { usageTokens = (chunk.usage.promptTokens || 0) + (chunk.usage.completionTokens || 0); }
            if (chunk.delta?.content) { fullContent += chunk.delta.content; emit(task, { type: 'chunk', content: chunk.delta.content, subAgentId: resolvedId }); }
            if (chunk.delta?.reasoningContent) { fullReasoning += chunk.delta.reasoningContent; emit(task, { type: 'chunk', reasoning: chunk.delta.reasoningContent, subAgentId: resolvedId }); }
          }
        } else {
          throw e;
        }
      }

      // 文本模式工具调用解析（同时检查 reasoning_content，某些模型把 [TOOL_CALL] 放在推理中）
      // function call 模式可能返回工具名但 arguments 为空，需从 reasoning 中提取完整参数
      const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.every(tc => !tc.function?.arguments || tc.function.arguments === '{}' || tc.function.arguments === '');
      if (toolCallAcc.length === 0 || hasEmptyArgs) {
        const hasToolInContent = fullContent.toUpperCase().includes('[TOOL_CALL]') || fullContent.toUpperCase().includes('<FUNCTION');
        const hasToolInReasoning = !hasToolInContent && (fullReasoning.toUpperCase().includes('[TOOL_CALL]') || fullReasoning.toUpperCase().includes('<FUNCTION'));
        if (hasToolInContent || hasToolInReasoning) {
          const source = hasToolInContent ? fullContent : fullReasoning;
          const { toolCalls: parsed, cleanedContent } = parseTextModeToolCalls(source);
          if (hasToolInContent) fullContent = cleanedContent;
          else fullReasoning = cleanedContent;
          if (hasEmptyArgs && parsed.length > 0) toolCallAcc.length = 0;
          for (const tc of parsed) {
            toolCallAcc.push({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } } as DeltaToolCall);
          }
          if (toolCallAcc.length > 0) {
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc], subAgentId: resolvedId });
          }
        }
      }

      // 更新助手消息（tokens 同主循环：usage 优先，缺失按内容长度粗估）
      updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined, usageTokens || Math.round((fullContent.length + fullReasoning.length) / 2));
      emit(task, { type: 'message:updated', messageId: assistantMsgId, content: fullContent, reasoning: fullReasoning, toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined });

      // 无工具调用 → 子智能体完成
      if (toolCallAcc.length === 0) {
        emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
        return fullContent || '(无输出)';
      }

      // 执行工具调用（同批多导航：第 2+ 个 browser_navigate 转为新开标签页）
      const newTabNavIds = markDuplicateNavigations(toolCallAcc);
      for (const tc of toolCallAcc) {
        const toolName = tc.function?.name || (tc as any).toolName || '';
        let toolArgs: any = {};
        try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        if (newTabNavIds.has(String(tc.id || ''))) toolArgs.openInNewTab = true;
        emit(task, { type: 'tool:start', toolName, args: toolArgs, subAgentId: resolvedId });

        let result: string;
        try {
          result = await executeTool(task, registry, toolName, toolArgs, tc.id || '', uiTools, depth + 1);
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          result = `工具执行失败: ${e?.message || e}`;
        }
        emit(task, { type: 'tool:result', toolName, result, subAgentId: resolvedId });

        const cappedResult = capToolResult(result);
        const toolMsgId = insertMessage(task.conversationId, task.userId, 'tool', cappedResult, {
          toolCallId: tc.id, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
        });
        emit(task, { type: 'message:added', message: { id: toolMsgId, role: 'tool', content: cappedResult, toolCallId: tc.id, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });
      }
    }

    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    // 达到最大步数：先请模型总结进展再返回给父智能体（父智能体可基于总结决策下一步），
    // 总结失败回退到固定文案。
    let resultText = `子智能体已达到最大循环数（${maxSteps}）`;
    try {
      const hist = loadSubAgentMessages(task.conversationId, parentToolCallId).filter(m => m.content || m.toolCalls || m.role === 'tool');
      const history: Message[] = hist.map(m => ({
        id: m.id, conversationId: '', role: m.role,
        content: m.content, toolCalls: m.toolCalls,
        toolCallId: m.toolCallId, createdAt: m.createdAt,
      }));
      const summary = await summarizeOnMaxSteps(client, systemPrompt, history, maxSteps, 'sub');
      if (summary) {
        resultText = `${summary}\n\n（注：子智能体已达到最大循环步数（${maxSteps}），以上为阶段总结。）`;
      }
    } catch { /* 总结失败回退固定文案 */ }
    return resultText;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    return `子智能体执行失败: ${e?.message || e}`;
  }
}

/** 达到最大循环步数时的兜底总结：不带 tools 追加一轮对话，请模型基于已执行的操作与
 *  结果输出进展总结（已完成 / 关键结果 / 未完成原因 / 后续建议），替代生硬的报错文案。
 *  调用方需自行 catch；本函数内部已兜底，失败时返回 null。 */
async function summarizeOnMaxSteps(
  client: LlmClient,
  systemPrompt: string,
  history: Message[],
  maxSteps: number,
  kind: 'main' | 'sub',
): Promise<string | null> {
  try {
    const llmMessages: Message[] = [];
    if (systemPrompt) {
      llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
    }
    llmMessages.push(...history);
    llmMessages.push({
      id: 'sum', conversationId: '', role: 'user', createdAt: 0,
      content: kind === 'sub'
        ? `你已执行 ${maxSteps} 步，达到本子任务的最大步数限制。这是最后一轮，不能再调用任何工具。请基于以上已执行的操作与获得的结果，输出一段给父智能体的进展总结：1) 已完成的工作；2) 关键结果/数据（附来源 URL 或文件路径）；3) 未完成的部分与原因；4) 建议的后续步骤。直接输出总结正文，不要调用工具，不要输出 JSON。`
        : `你已执行 ${maxSteps} 步，达到本次任务的最大步数限制。这是最后一轮，不能再调用任何工具。请基于以上对话与工具执行结果，向用户输出一份任务进展总结：1) 已完成的工作；2) 关键结果/数据（附来源 URL 或文件路径）；3) 未完成的部分与原因；4) 建议用户如何继续（如拆分任务、调整配置后重试）。直接输出总结正文，不要调用工具。`,
    });
    const resp = await client.chat(llmMessages, { temperature: 0.3, maxTokens: 1024 });
    const text = (resp.delta?.content || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

/** 解析记忆抽取/压缩前抢救用模型：任务携带的「记忆抽取模型」配置（前端设置页下发）优先，
 *  未配置、已失效或误配为非 LLM 模型时回退任务自身的平台/模型。 */
function resolveMemoryExtractLlm(task: LlmTask): { platform: Platform; model: Model } | null {
  if (task.memoryExtractPlatformId && task.memoryExtractModelId) {
    const p = loadPlatform(task.memoryExtractPlatformId, task.userId);
    const m = loadModel(task.memoryExtractModelId, task.userId);
    if (p && m && (m.type || 'llm') === 'llm') return { platform: p, model: m };
  }
  const p = loadPlatform(task.platformId, task.userId);
  const m = loadModel(task.modelId, task.userId);
  return p && m ? { platform: p, model: m } : null;
}

/** 记忆抽取：任务完成后从会话中抽取值得长期记住的信息，写入 memory 表。
 *  非阻塞（void 调用），不影响 task:completed 事件时序。 */
async function extractMemoryFromConversation(task: LlmTask): Promise<void> {
  try {
    const msgs = loadMessages(task.conversationId);
    const recent = msgs.filter(m => m.content || m.toolCalls?.length).slice(-20);
    if (recent.length < 4) return;

    const transcript = recent.map(m => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
      return `【${role}】\n${m.content || (m.toolCalls?.length ? '(调用工具)' : '')}`;
    }).join('\n\n---\n\n');

    const llm = resolveMemoryExtractLlm(task);
    if (!llm) return;

    const client = new LlmClient(llm.platform, llm.model);
    const resp = await client.chat([
      { id: 'sys', conversationId: '', role: 'system', content: '你是记忆抽取助手。从对话中抽取「值得长期记住的用户信息」，输出 JSON 数组，每项形如 {"type":"agent|session|daily","content":"一句话事实"}。agent=稳定的用户偏好/背景；daily=当天的重要事件/进展；session=本会话的上下文结论。若新信息与既有认知矛盾（如用户纠正了之前的偏好），可加 "conflictsWith" 字段说明被推翻的旧结论内容。相对日期（如"昨天"）转为绝对日期。只输出 JSON，不要解释。若没有值得记的返回 []。', createdAt: 0 },
      { id: 'usr', conversationId: '', role: 'user', content: transcript, createdAt: 0 },
    ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } });

    const text = resp.delta?.content || '';
    // 兼容数组 / {items:[...]} / 单对象（部分模型 json_object 模式下返回单个对象而非数组，
    // 此前只认数组导致抽取结果恒为 0 条且无任何日志）
    const items = parseExtractedItems(text);
    if (items.length) {
      console.log(`[memory] 抽取: 模型返回 ${items.length} 条候选`);
    } else if (text.trim()) {
      console.log('[memory] 抽取: 模型输出无法解析为条目, 前120字:', text.slice(0, 120));
    }

    // 统一走 memory-service 写入：语义去重（余弦>0.92 更新原行）、冲突标记（superseded_by）、
    // daily 按天合并、session 带会话 id、agent 记忆带 agent 归属（修复此前全部 agent_id IS NULL 的 bug）
    const writeItems: MemoryWriteItem[] = items
      .filter((x) => x?.content && typeof x.content === 'string')
      .map((x) => ({
        type: x.type === 'daily' ? 'daily' : x.type === 'session' ? 'session' : 'agent',
        content: String(x.content),
        metadata: x.type === 'session' ? { conversationId: task.conversationId } : {},
        conflictsWith: typeof x.conflictsWith === 'string' && x.conflictsWith ? x.conflictsWith : undefined,
      }));
    if (writeItems.length) {
      const r = await writeMemoryItems(task.userId, task.agentId ?? null, writeItems, 'extract');
      console.log(`[memory] 抽取写入: +${r.created} 新增 / ${r.updated} 去重更新 / ${r.merged} 合并 / ${r.superseded} 冲突取代`);
    }
  } catch (e: any) {
    console.error('[memory] 抽取失败:', e?.message || e);
  }
}

// 定期清理已完成任务
setInterval(() => cleanupTasks(), 5 * 60 * 1000);

// ============================================================
// 后端独立构建系统提示词 + 工具 schema（供定时任务等无前端场景使用）
// ============================================================

/** UI 交互工具集合 —— 定时任务等无前端场景下排除 */
const UI_TOOL_NAMES = new Set([
  'ask_user', 'confirm_user', 'configure_model_platform', 'task_plan', 'task_step',
  'image_analyze',
  'browser_navigate', 'browser_open_external',
]);

// ============================================================
// 会话级挂载（conversation 表）—— 与前端 getMergedMounts 的会话来源对齐，
// 保证"前端交互 / 定时任务 / IM"三条入口按同一套规则构建提示词与工具列表。
// ============================================================

interface ConvMounts {
  systemPrompt?: string;
  builtinToolIds: string[];
  skillIds: string[];
  mcpMounts: { serverId: string; toolName: string }[];
}

function loadConversationMounts(conversationId?: string | null): ConvMounts {
  const empty: ConvMounts = { builtinToolIds: [], skillIds: [], mcpMounts: [] };
  if (!conversationId) return empty;
  const conv = db.prepare('SELECT system_prompt, builtin_tool_ids_json, skill_ids_json, mcp_servers_json FROM conversation WHERE id = ?').get(conversationId) as any;
  if (!conv) return empty;
  const builtinToolIds: string[] = (() => { try { return JSON.parse(conv.builtin_tool_ids_json || '[]'); } catch { return []; } })();
  const skillIds: string[] = (() => { try { return JSON.parse(conv.skill_ids_json || '[]'); } catch { return []; } })();
  // mcp_servers_json：string[]（旧格式，全量暴露）或 [{serverId, disabledTools}]（细粒度，与前端 rowToConv 一致）
  const mcpMounts: { serverId: string; toolName: string }[] = [];
  try {
    const parsed = JSON.parse(conv.mcp_servers_json || '[]');
    if (Array.isArray(parsed)) {
      for (const x of parsed) {
        const sid = typeof x === 'string' ? x : (x?.serverId || x?.id || '');
        if (!sid) continue;
        const disabled: string[] = typeof x === 'object' && x ? (x.disabledTools || []) : [];
        for (const t of getToolsFromDb(sid)) {
          if (t.enabled === false || disabled.includes(t.name)) continue;
          mcpMounts.push({ serverId: sid, toolName: t.name });
        }
      }
    }
  } catch { /* 解析失败按无挂载处理 */ }
  return { systemPrompt: conv.system_prompt || undefined, builtinToolIds, skillIds, mcpMounts };
}

/** agent.mcp_tool_mounts ∪ 会话级 MCP 挂载：agent 中 toolName='*' 的 server 覆盖会话级同 server 细粒度挂载（与前端规则一致） */
function mergeMcpMounts(agentMounts: any[], convMounts: { serverId: string; toolName: string }[]): { serverId: string; toolName: string }[] {
  const merged: { serverId: string; toolName: string }[] = [...(agentMounts || [])];
  const starServers = new Set(merged.filter((m: any) => m.toolName === '*').map((m: any) => m.serverId));
  for (const c of convMounts) {
    if (!starServers.has(c.serverId) && !merged.some((m: any) => m.serverId === c.serverId && m.toolName === c.toolName)) {
      merged.push(c);
    }
  }
  return merged;
}

/** 合并后的 MCP serverId 集合（executeTool 无人值守后端直连 MCP 兜底用） */
export function getMergedMcpServerIds(agentId: string | null, userId: string, conversationId?: string | null): string[] {
  let agentMounts: any[] = [];
  if (agentId) {
    const agent = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { agentMounts = JSON.parse(agent?.mcp_tool_mounts || '[]'); } catch { agentMounts = []; }
  }
  const convMounts = loadConversationMounts(conversationId);
  return [...new Set(mergeMcpMounts(agentMounts, convMounts.mcpMounts).map((m) => m.serverId))];
}

/** 从 DB 加载 agent + 会话挂载，构建系统提示词（单一事实来源：前端交互/定时任务/IM 共用同一套规则）。
 *  提示词始终注入「## 可用工具」（带完整入参定义）；原生 function calling 模型同时拿到 tools schema，
 *  文本模式模型由 runReActLoop 追加 [TOOL_CALL] 调用格式说明。 */
export function buildSystemPromptForBackend(agentId: string | null, userId: string, appGuide?: string, opts?: {
  conversationId?: string | null;
  includeUiTools?: boolean;
  userContent?: string;
  workspaceDir?: string;
}): string {
  const parts: string[] = [];
  const convMounts = loadConversationMounts(opts?.conversationId);
  const includeUiTools = !!opts?.includeUiTools;

  // 应用指引（用户在前端配置的全局上下文/行为约束）：无条件注入，保证三条入口行为一致
  if (appGuide && appGuide.trim()) {
    parts.push('---\n## 应用指引\n' + appGuide.trim());
  }

  // 系统提示词：会话级优先，其次 agent 级（与前端 conv.systemPrompt || agent.systemPrompt 一致）
  let basePrompt = '';
  if (agentId) {
    const agent = db.prepare('SELECT system_prompt, type FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    basePrompt = convMounts.systemPrompt || agent?.system_prompt || '';
    const isHarness = !agent?.type || agent.type === 'harness';

    // 工具描述（提示词模式才注入；原生 tools 模型走 schema）
    {
      const registry = getToolRegistry();
      const toolLines: string[] = [];

      // 内置工具：agent ∪ 会话挂载（与 buildToolsForBackend 同一套合并规则）
      let toolIds: string[] = [];
      const agentRow = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
      const agentToolIds: string[] = agentRow?.builtin_tool_ids ? JSON.parse(agentRow.builtin_tool_ids) : [];
      toolIds = [...new Set([...agentToolIds, ...convMounts.builtinToolIds])];
      for (const name of toolIds) {
        if (!includeUiTools && UI_TOOL_NAMES.has(name)) continue;
        const tool = registry.get(name);
        if (!tool) continue;
        toolLines.push(`- \`${name}\`: ${tool.description}${formatSchemaParams(tool.inputSchema)}`);
      }

      // MCP 工具（按 server 分组，暴露名与执行路由一致：mcp_{shortId}__{toolName}）
      const mergedMcp = mergeMcpMounts((() => {
        const row = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
        try { return JSON.parse(row?.mcp_tool_mounts || '[]'); } catch { return []; }
      })(), convMounts.mcpMounts);
      for (const m of mergedMcp) {
        const serverName = (db.prepare('SELECT name FROM mcp_server WHERE id = ?').get(m.serverId) as any)?.name || m.serverId;
        toolLines.push(`### ${serverName}`);
        const tools = m.toolName === '*'
          ? getToolsFromDb(m.serverId).filter((t: any) => t.enabled !== false)
          : getToolsFromDb(m.serverId).filter((t: any) => t.name === m.toolName && t.enabled !== false);
        for (const t of tools) {
          toolLines.push(`- \`mcp_${mcpShortIdOf(m.serverId)}__${t.name}\`: ${t.alias || t.description || t.name}${formatSchemaParams(t.inputSchema)}`);
        }
      }

      // 自定义工具（与 buildToolsForBackend 同一过滤规则）
      toolLines.push(...buildCustomToolDescLines(agentId, userId, includeUiTools));

      const sectionLines = toolLines.filter((l) => l.trim().length > 0);
      if (sectionLines.length > 0) {
        parts.push('---\n## 可用工具\n' + sectionLines.join('\n'));
      }
    }

    // 子智能体描述
    const subAgentIds: string[] = agent?.sub_agent_ids ? JSON.parse(agent.sub_agent_ids) : [];
    if (subAgentIds.length > 0) {
      const subLines: string[] = [];
      for (const sid of subAgentIds) {
        const sub = db.prepare('SELECT name, description FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(sid, userId) as any;
        if (sub) subLines.push(`- **${sub.name}** (id: \`${sid}\`): ${sub.description || ''}`);
      }
      if (subLines.length > 0) parts.push('---\n## 可调用子智能体\n' + subLines.join('\n'));
    }

    // Skills 描述 + 流程指引：agent ∪ 会话挂载
    const agentSkillIds: string[] = agent?.skill_ids ? JSON.parse(agent.skill_ids) : [];
    const skillIds = [...new Set([...agentSkillIds, ...convMounts.skillIds])];
    if (skillIds.length > 0) {
      const skillLines: string[] = [];
      const flowParts: string[] = [];
      for (const skId of skillIds) {
        const sk = db.prepare('SELECT name, description, body, enabled FROM skill WHERE id = ? AND user_id = ?').get(skId, userId) as any;
        if (!sk || !sk.enabled) continue;
        skillLines.push(`- **${sk.name}**: ${sk.description || ''}`);
        const body = (sk.body || '').trim();
        if (body) {
          const truncated = body.length > 2000 ? body.slice(0, 2000) + '\n...(流程过长已截断)' : body;
          flowParts.push(`### Skill 流程指引：${sk.name}\n${truncated}`);
        }
      }
      if (skillLines.length > 0) parts.push('---\n## 可用 Skills\n' + skillLines.join('\n'));
      if (flowParts.length > 0) {
        parts.push('---\n## 当前任务流程指引（按 Skill 流程执行：该 ask_user 时 ask_user，该委派 pageAgent 时委派 pageAgent 并在 input 中传入流程要求）\n' + flowParts.join('\n\n'));
      }
    }

    // 文件产出分类规范
    if (isHarness) {
      parts.push([
        '---',
        '## 文件产出分类规范',
        '你可通过 file_write 工具产出文件，必须用 category 参数正确分类：',
        '- category="deliverable"：最终交付给用户的成果（报告、最终文档、生成的源代码、数据导出、图片成品等用户会直接使用或保存的文件）。',
        '- category="intermediate"：过程性中间产物（调试输出、临时草稿、中间计算结果、将被后续步骤覆盖或删除的临时文件）。',
        '规则：凡是用户最终想要的结果文件，必须显式传 category="deliverable"；只有过程性临时文件才用 intermediate。不要省略 category，也不要把交付物误标为 intermediate。',
      ].join('\n'));
    }
  } else {
    // 无 agent：会话级系统提示词仍然生效
    if (convMounts.systemPrompt) basePrompt = convMounts.systemPrompt;
  }
  if (basePrompt) parts.unshift(basePrompt);

  // 工作目录：优先使用请求显式下发的 workspaceDir，回退到全局 serverState.workspaceDir
  const effectiveWorkspaceDir = (opts?.workspaceDir && opts.workspaceDir.trim()) || serverState.workspaceDir;
  if (effectiveWorkspaceDir && effectiveWorkspaceDir.trim()) {
    parts.push(`---\n## 工作目录\n当前工作目录：${effectiveWorkspaceDir}`);
  }

  // 当前时间
  parts.push(`---\n当前时间：${new Date().toLocaleString('zh-CN')}`);

  return parts.join('\n\n');
}

/** JSON Schema → 参数清单（与前端 formatToolParamsBlock 同一格式） */
function formatSchemaParams(schema: any): string {
  const props = schema?.properties || {};
  const req: string[] = schema?.required || [];
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  const lines = entries.map(([k, v]: [string, any]) =>
    `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v?.description || v?.type || ''}`
  );
  return '\n  参数：\n' + lines.join('\n');
}

/** 自定义工具描述行：agentId 给定时按 agent.custom_tool_ids 过滤（与前端挂载规则一致），否则全量（无人值守兜底） */
function buildCustomToolDescLines(agentId: string | null, userId: string, includeUiTools: boolean): string[] {
  const allowed: string[] | null = (() => {
    if (!agentId) return null;
    const agent = db.prepare('SELECT custom_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { const ids = JSON.parse(agent?.custom_tool_ids || '[]'); return Array.isArray(ids) ? ids : []; } catch { return []; }
  })();
  const rows = db.prepare('SELECT id, name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId) as any[];
  const lines: string[] = [];
  for (const ct of rows) {
    if (allowed && !allowed.includes(ct.id)) continue;
    const exposedName = 'custom_' + (ct.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + ct.name;
    lines.push(`- \`${exposedName}\`: ${ct.description || ct.name}${formatSchemaParams(ct.input_schema_json ? JSON.parse(ct.input_schema_json) : null)}`);
  }
  return lines;
}

/** 从 DB 加载 agent + 会话挂载，构建工具 schema（三条入口共用的单一事实来源，与前端 getMergedMounts 同规则）。
 *  opts.includeUiTools：交互式任务（前端在线）纳入 UI 工具；定时/IM 等无人值守任务排除。 */
export function buildToolsForBackend(agentId: string | null, userId: string, opts?: {
  conversationId?: string | null;
  includeUiTools?: boolean;
}): any[] {
  ensureToolsInitialized();
  const registry = getToolRegistry();
  const tools: any[] = [];
  const seen = new Set<string>();
  const convMounts = loadConversationMounts(opts?.conversationId);
  const includeUiTools = !!opts?.includeUiTools;
  const skipUi = (name: string) => !includeUiTools && UI_TOOL_NAMES.has(name);

  // 1) 内置工具：agent 挂载 ∪ 会话级挂载
  let toolIds: string[] = [];
  if (agentId) {
    const agent = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    toolIds = agent?.builtin_tool_ids ? JSON.parse(agent.builtin_tool_ids) : [];
  }
  toolIds = [...new Set([...toolIds, ...convMounts.builtinToolIds])];
  for (const name of toolIds) {
    if (skipUi(name)) continue;
    if (!registry.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const def = registry.get(name)!;
    tools.push({
      type: 'function',
      function: { name, description: def.description, parameters: def.inputSchema },
    });
  }

  // 无 agent 且无会话挂载时兜底：暴露所有非 UI 内置工具
  if (tools.length === 0 && !agentId && convMounts.builtinToolIds.length === 0) {
    for (const name of registry.names()) {
      if (skipUi(name)) continue;
      if (name.startsWith('plugin_')) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const def = registry.get(name)!;
      tools.push({
        type: 'function',
        function: { name, description: def.description, parameters: def.inputSchema },
      });
    }
  }

  // 2) MCP 工具：agent.mcp_tool_mounts ∪ 会话级挂载（agent '*' 覆盖会话细粒度），暴露名与执行路由一致
  const agentMcpMounts: any[] = (() => {
    if (!agentId) return [];
    const agent = db.prepare('SELECT mcp_tool_mounts FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { return JSON.parse(agent?.mcp_tool_mounts || '[]'); } catch { return []; }
  })();
  const mergedMcp = mergeMcpMounts(agentMcpMounts, convMounts.mcpMounts);
  const toolsByServer = new Map<string, any[]>();
  const toolsOf = (sid: string) => {
    if (!toolsByServer.has(sid)) toolsByServer.set(sid, getToolsFromDb(sid));
    return toolsByServer.get(sid)!;
  };
  for (const m of mergedMcp) {
    const shortId = mcpShortIdOf(m.serverId);
    if (!shortId) continue;
    const serverTools = m.toolName === '*'
      ? toolsOf(m.serverId).filter((t: any) => t.enabled !== false)
      : toolsOf(m.serverId).filter((t: any) => t.name === m.toolName && t.enabled !== false);
    for (const t of serverTools) {
      const exposedName = `mcp_${shortId}__${t.name}`;
      if (seen.has(exposedName)) continue;
      seen.add(exposedName);
      tools.push({
        type: 'function',
        function: {
          name: exposedName,
          description: t.alias || t.description || t.name,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }

  // 3) API 工具（后端直查类：记忆/知识库/数据查询，后端直接执行）
  // 固定暴露记忆四件套 + 知识库两个通用工具；其余 api_*（如 api_data_query）按 agent 挂载 + 会话挂载动态暴露，
  // 保证「挂载即可调用」与「没挂就不占上下文」。
  const apiRegistry = getApiToolRegistry();
  const alwaysApiTools = [
    'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
    'api_kb_search', 'api_kb_list',
  ];
  const mountedApiTools = [...toolIds, ...convMounts.builtinToolIds].filter((n) => n.startsWith('api_'));
  // 已挂载专属 api_* 工具链的（数据查询智能体等）只暴露它挂载的工具：记忆/知识库这类通用工具
  // 对它属于干扰源 —— 实测会先去搜知识库扑空、再乱调子智能体工具，最终编造答案。
  const apiToolNames = mountedApiTools.length ? mountedApiTools : alwaysApiTools;
  for (const tName of apiToolNames) {
    if (seen.has(tName)) continue;
    for (const apiTools of apiRegistry.values()) {
      const def = apiTools.find(t => t.name === tName);
      if (def) {
        seen.add(tName);
        tools.push({ type: 'function', function: { name: def.name, description: def.description, parameters: def.inputSchema } });
        break;
      }
    }
  }

  // 4) 自定义工具（后端沙箱直接执行）：agentId 给定时按 agent.custom_tool_ids 过滤（与前端挂载规则一致）
  const allowedCustom: string[] | null = (() => {
    if (!agentId) return null;
    const agent = db.prepare('SELECT custom_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    try { const ids = JSON.parse(agent?.custom_tool_ids || '[]'); return Array.isArray(ids) ? ids : []; } catch { return []; }
  })();
  const customTools = db.prepare('SELECT id, name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId) as any[];
  for (const ct of customTools) {
    if (allowedCustom && !allowedCustom.includes(ct.id)) continue;
    const exposedName = 'custom_' + (ct.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + ct.name;
    if (seen.has(exposedName)) continue;
    seen.add(exposedName);
    tools.push({
      type: 'function',
      function: {
        name: exposedName,
        description: ct.description || ct.name,
        parameters: ct.input_schema_json ? JSON.parse(ct.input_schema_json) : { type: 'object', properties: {} },
      },
    });
  }

  // 5) call_agent + list_sub_agents（后端直接执行）
  if (!seen.has('call_agent') && registry.has('call_agent')) {
    const def = registry.get('call_agent')!;
    tools.push({ type: 'function', function: { name: 'call_agent', description: def.description, parameters: def.inputSchema } });
  }
  if (!seen.has('list_sub_agents') && registry.has('list_sub_agents')) {
    const def = registry.get('list_sub_agents')!;
    tools.push({ type: 'function', function: { name: 'list_sub_agents', description: def.description, parameters: def.inputSchema } });
  }

  return tools;
}

/** 从 DB 加载 agent 的模型参数 */
export function loadAgentModelParams(agentId: string | null, userId: string): {
  temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string; maxReActSteps?: number;
} {
  if (!agentId) return {};
  const agent = db.prepare('SELECT temperature, max_tokens, top_p, config_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
  if (!agent) return {};
  let config: any = {};
  try { config = JSON.parse(agent.config_json || '{}'); } catch {}
  return {
    temperature: agent.temperature,
    maxTokens: agent.max_tokens,
    topP: agent.top_p,
    reasoningEffort: config?.reasoningEffort,
    maxReActSteps: config?.maxReActSteps || 100,
  };
}
