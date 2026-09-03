// LLM 任务管理器 —— 后端独立运行 ReAct 循环，前端通过 SSE 订阅。
// 前端构建完整系统提示词 + 工具 schema 发给后端，后端负责 LLM 编排 + 工具执行。
// 内置工具（file/cmd/web_search/browser 等）后端直接执行，刷新不中断。
// UI 交互工具（ask_user/confirm_user 等）和 MCP/自定义工具委托前端，刷新时暂停等待重连。
import type { Platform, Model, Message, DeltaToolCall } from '@yan-zhi/shared';
import { LlmClient, getToolRegistry, getApiToolRegistry, ContextWindow } from '@yan-zhi/core';
import { db } from './db.js';
import { ensureToolsInitialized } from './mcp/index.js';
import { getSearchBackend } from './mcp/search-backend.js';
import { executeApiTool } from './mcp/api-tool-executor.js';
import { embedText } from './services/ollama-embed.js';
import { serverState } from './state.js';

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
  } as any;
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

function updateMessageContent(msgId: string, content: string, reasoning?: string, toolCalls?: any[]) {
  db.prepare(
    'UPDATE message SET content = ?, reasoning_content = ?, tool_calls_json = ? WHERE id = ?',
  ).run(content, reasoning || null, toolCalls ? JSON.stringify(toolCalls) : null, msgId);
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
}): string {
  // 幂等保护：同 conversationId 已有 running 任务则复用（避免重连重试创建多任务）
  for (const [id, existing] of tasks) {
    if (existing.conversationId === params.conversationId && existing.status === 'running') {
      return id;
    }
  }

  const taskId = 'task_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
}) {
  const { conversationId: convId, userId, options } = params;
  const maxSteps = params.maxSteps || 100;

  try {
    const platform = loadPlatform(params.platformId, userId);
    const model = loadModel(params.modelId, userId);
    if (!platform || !model) {
      emit(task, { type: 'task:error', error: '平台或模型不存在' });
      task.status = 'failed';
      return;
    }

    // 添加用户消息
    if (params.userContent !== undefined) {
      const msgId = insertMessage(convId, userId, 'user', params.userContent);
      emit(task, { type: 'message:added', message: { id: msgId, role: 'user', content: params.userContent } });
    }

    const client = new LlmClient(platform, model);
    ensureToolsInitialized();
    const registry = getToolRegistry(getSearchBackend());
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
    let systemPromptBuilt = params.systemPrompt !== undefined
      ? params.systemPrompt
      : buildSystemPromptForBackend(params.agentId ?? null, userId, params.appGuide);
    if (modePrompt.length) {
      systemPromptBuilt += '\n\n## 模式指令（用户在输入框开启，优先级高于默认行为）\n' + modePrompt.join('\n');
    }
    let toolsBuilt = params.tools !== undefined
      ? params.tools
      : buildToolsForBackend(params.agentId ?? null, userId);
    if (modeFlags.answerOnly) toolsBuilt = [];
    const tools = supportsTools ? toolsBuilt : [];

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
      // 上下文窗口压缩：长对话截断避免超 context window
      const ctxWindow = new ContextWindow(model.contextWindow || 8000, 6);
      if (ctxWindow.needsCompression(messagesToSend)) {
        messagesToSend = await ctxWindow.compress(messagesToSend);
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
        tools: (params.tools || []).map((t: any) => ({ name: t.function.name, description: t.function.description })),
        messages: llmMessages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' && m.content.length > 500 ? m.content.slice(0, 497) + '...' : m.content || '',
          toolCalls: m.toolCalls?.length || 0,
        })),
      }, null, 2);

      // 添加助手占位消息
      const assistantMsgId = insertMessage(convId, userId, 'assistant', '', { systemPromptSnapshot: snap });
      emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '', systemPromptSnapshot: snap } });

      // 流式请求
      let fullContent = '';
      let fullReasoning = '';
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
          fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0;
          for await (const chunk of client.chatStream(llmMessages, {
            temperature: options?.temperature, maxTokens: options?.maxTokens,
            signal: task.abortController.signal,
          })) {
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
          const { toolCalls: parsed, cleanedContent } = parseTextModeToolCalls(source);
          if (hasToolInContent) fullContent = cleanedContent;
          else fullReasoning = cleanedContent;
          if (hasEmptyArgs && parsed.length > 0) toolCallAcc.length = 0;
          for (const tc of parsed) {
            toolCallAcc.push({ id: tc.id, function: { name: tc.name, arguments: tc.arguments } } as DeltaToolCall);
          }
          if (toolCallAcc.length > 0) {
            emit(task, { type: 'tool_call', toolCalls: [...toolCallAcc] });
          }
        }
      }

      // 更新助手消息
      updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined);
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

      // 执行工具调用
      for (const tc of toolCallAcc) {
        const toolName = tc.function?.name || (tc as any).toolName || '';
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
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

        // 添加工具结果消息
        const toolMsgId = insertMessage(convId, userId, 'tool', result, { toolCallId: tc.id });
        emit(task, { type: 'message:added', message: { id: toolMsgId, role: 'tool', content: result, toolCallId: tc.id } });
      }

      // 继续下一轮 ReAct
    }

    // 循环结束（达到最大步数）—— 插入提示消息
    const tipId = insertMessage(convId, userId, 'assistant', `已达到最大循环数（${maxSteps}），请检查任务是否需要拆分或调高工具配置。`);
    emit(task, { type: 'message:added', message: { id: tipId, role: 'assistant', content: `已达到最大循环数（${maxSteps}），请检查任务是否需要拆分或调高工具配置。` } });
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
 *  - 内置工具（file/cmd/web_search/browser 等）→ 后端直接执行，刷新不中断
 *  - 未知工具 → 委托前端兜底 */
async function executeTool(
  task: LlmTask,
  registry: ReturnType<typeof getToolRegistry>,
  toolName: string,
  args: any,
  toolCallId: string,
  uiTools: Set<string>,
  depth: number = 0,
): Promise<string> {
  const isUiTool = uiTools.has(toolName);
  const isMcp = toolName.startsWith('mcp_');
  const isCustom = toolName.startsWith('custom_');
  const isApi = toolName.startsWith('api_');

  // 参数归一化兜底：模型文本模式工具调用常把 url 放到 target/address/link 等字段，补齐避免误报缺参
  args = normalizeToolArgs(toolName, args);

  // MCP 工具 → 委托前端（MCP 连接在前端）
  if (isUiTool || isMcp) {
    return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
  }

  // API 工具（api_memory_search/api_kb_search 等）→ 后端直接执行
  if (isApi) {
    try {
      const result = await executeApiTool(toolName, args, task.userId);
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
      const sub = db.prepare('SELECT name, description FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(id, task.userId) as any;
      if (!sub) { lines.push(`- id: \`${id}\`（该子智能体已被删除）`); continue; }
      lines.push(`- **${sub.name}** (id: \`${id}\`): ${sub.description || ''}`);
    }
    return lines.join('\n');
  }

  // 自定义工具 → 后端直接执行（node:vm 沙箱，避免后端→前端→后端绕圈）
  if (isCustom) {
    const m = toolName.match(/^custom_([a-zA-Z0-9]{1,8})_(.+)$/);
    if (m) {
      const idTag = m[1];
      const tName = m[2];
      const rows = db.prepare('SELECT id, name, code, entry, timeout, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(task.userId) as any[];
      const tool = rows.find((r: any) => (r.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) === idTag && r.name === tName);
      if (tool) {
        try {
          const { runInSandbox } = await import('@yan-zhi/core');
          const result = await runInSandbox(tool.code, tool.entry, args, { timeout: tool.timeout || 30000 });
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (e: any) {
          return `工具执行失败: ${e?.message || e}`;
        }
      }
    }
    return `自定义工具不存在或未启用: ${toolName}`;
  }

  // 浏览器工具 → 在线（有 SSE 订阅者）委托前端 BrowserView 桥接，离线后端 Playwright
  const isBrowser = toolName === 'browser_navigate' || toolName === 'browser_open_external';
  if (isBrowser && task.subscribers.size > 0) {
    return executeToolViaFrontend(task, toolName, args, toolCallId, depth);
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
    const r = await registry.execute(toolName, args);
    return typeof r === 'string' ? r : (r.content?.map((c: any) => c.text || '').join('') || JSON.stringify(r));
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
  args: { agentId?: string; input?: string },
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

  // 解析平台/模型：子智能体配置优先，否则继承父任务
  const platformId = agent.platform_id || task.platformId;
  const modelId = agent.model_id || task.modelId;
  const platform = loadPlatform(platformId, task.userId);
  const model = loadModel(modelId, task.userId);
  if (!platform || !model) return '子智能体未配置平台/模型，无法执行';

  // 构建子智能体工具列表
  const registry = getToolRegistry(getSearchBackend());
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

  const subAgentName = agent.name || resolvedId;
  const client = new LlmClient(platform, model);
  const maxSteps = Math.max(agent.config_json ? (JSON.parse(agent.config_json).maxReActSteps || 100) : 100, 100);
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

      // 快照
      const snap = JSON.stringify({
        step, subAgent: { id: resolvedId, name: subAgentName, depth: depth + 1 },
        timestamp: new Date().toISOString(),
        model: { id: model.modelId || model.id, alias: model.alias },
        platform: { id: platform.id, name: platform.name },
        systemPrompt,
        tools: subTools.map((t: any) => ({ name: t.function.name, description: t.function.description })),
      }, null, 2);

      // 助手占位消息
      const assistantMsgId = insertMessage(task.conversationId, task.userId, 'assistant', '', {
        systemPromptSnapshot: snap, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
      });
      emit(task, { type: 'message:added', message: { id: assistantMsgId, role: 'assistant', content: '', systemPromptSnapshot: snap, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });

      // 流式请求
      let fullContent = '';
      let fullReasoning = '';
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
          fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0;
          for await (const chunk of client.chatStream(llmMessages, {
            temperature: agent.temperature, maxTokens: agent.max_tokens,
            signal: task.abortController.signal,
          })) {
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

      // 更新助手消息
      updateMessageContent(assistantMsgId, fullContent, fullReasoning, toolCallAcc.length > 0 ? toolCallAcc as any : undefined);
      emit(task, { type: 'message:updated', messageId: assistantMsgId, content: fullContent, reasoning: fullReasoning, toolCalls: toolCallAcc.length > 0 ? toolCallAcc : undefined });

      // 无工具调用 → 子智能体完成
      if (toolCallAcc.length === 0) {
        emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
        return fullContent || '(无输出)';
      }

      // 执行工具调用
      for (const tc of toolCallAcc) {
        const toolName = tc.function?.name || (tc as any).toolName || '';
        let toolArgs: any = {};
        try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        emit(task, { type: 'tool:start', toolName, args, subAgentId: resolvedId });

        let result: string;
        try {
          result = await executeTool(task, registry, toolName, toolArgs, tc.id || '', uiTools, depth + 1);
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          result = `工具执行失败: ${e?.message || e}`;
        }
        emit(task, { type: 'tool:result', toolName, result, subAgentId: resolvedId });

        const toolMsgId = insertMessage(task.conversationId, task.userId, 'tool', result, {
          toolCallId: tc.id, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1,
        });
        emit(task, { type: 'message:added', message: { id: toolMsgId, role: 'tool', content: result, toolCallId: tc.id, parentToolCallId, subAgentId: resolvedId, subAgentName, subAgentDepth: depth + 1 } });
      }
    }

    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    return `子智能体已达到最大循环数（${maxSteps}）`;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    emit(task, { type: 'sub_agent:end', agentId: resolvedId, agentName: subAgentName, parentToolCallId });
    return `子智能体执行失败: ${e?.message || e}`;
  }
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

    const platform = loadPlatform(task.platformId, task.userId);
    const model = loadModel(task.modelId, task.userId);
    if (!platform || !model) return;

    const client = new LlmClient(platform, model);
    const resp = await client.chat([
      { id: 'sys', conversationId: '', role: 'system', content: '你是记忆抽取助手。从对话中抽取「值得长期记住的用户信息」，输出 JSON 数组，每项形如 {"type":"agent|session|daily","content":"一句话事实"}。agent=稳定的用户偏好/背景；daily=当天的重要事件/进展；session=本会话的上下文结论。只输出 JSON，不要解释。若没有值得记的返回 []。', createdAt: 0 },
      { id: 'usr', conversationId: '', role: 'user', content: transcript, createdAt: 0 },
    ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } });

    const text = resp.delta?.content || '';
    let items: any[] = [];
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
    } catch {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) { try { items = JSON.parse(m[0]); } catch {} }
    }

    const ts = Date.now();
    const date = new Date().toISOString().slice(0, 10);
    for (const item of items) {
      if (!item.content || typeof item.content !== 'string') continue;
      const type = item.type === 'daily' ? 'daily' : item.type === 'session' ? 'session' : 'agent';
      const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const emb = await embedText(item.content).catch(() => null);
      const embBytes = emb ? Buffer.from(new Float32Array(emb).buffer) : null;

      if (type === 'daily') {
        // upsert：找当天已存在的 daily 记忆
        const existing = db.prepare(
          `SELECT * FROM memory WHERE user_id = ? AND type = 'daily' AND metadata_json LIKE ? ORDER BY last_used_at DESC LIMIT 1`,
        ).all(task.userId, `%"date":"${date}"%`)[0] as any;
        if (existing) {
          const merged = existing.content.endsWith('\n') ? existing.content + item.content : existing.content + '\n' + item.content;
          const mergedEmb = await embedText(merged).catch(() => null);
          const mergedEmbBytes = mergedEmb ? Buffer.from(new Float32Array(mergedEmb).buffer) : null;
          db.prepare('UPDATE memory SET content = ?, embedding = ?, last_used_at = ? WHERE id = ?').run(merged, mergedEmbBytes, ts, existing.id);
          continue;
        }
      }

      db.prepare(
        `INSERT INTO memory (id, user_id, content, tags_json, metadata_json, embedding, created_at, last_used_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, task.userId, item.content, '[]', JSON.stringify(type === 'daily' ? { date } : { conversationId: task.conversationId }), embBytes, ts, ts, type);
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

/** 从 DB 加载 agent 配置，构建系统提示词（不含前端依赖项） */
export function buildSystemPromptForBackend(agentId: string | null, userId: string, appGuide?: string): string {
  const parts: string[] = [];

  // 应用指引（用户在前端配置的全局上下文/行为约束）
  if (appGuide && appGuide.trim()) {
    parts.push('---\n## 应用指引\n' + appGuide.trim());
  }

  // agent 系统提示词
  if (agentId) {
    const agent = db.prepare('SELECT system_prompt, type, builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    if (agent?.system_prompt) {
      parts.push(agent.system_prompt);
    }

    // 工具描述
    const toolIds: string[] = agent?.builtin_tool_ids ? JSON.parse(agent.builtin_tool_ids) : [];
    const registry = getToolRegistry(getSearchBackend());
    const toolLines: string[] = [];
    for (const name of toolIds) {
      if (UI_TOOL_NAMES.has(name)) continue;
      const tool = registry.get(name);
      if (!tool) continue;
      const props = (tool.inputSchema as any)?.properties || {};
      const req: string[] = (tool.inputSchema as any)?.required || [];
      const params = Object.entries(props).map(([k, v]: [string, any]) =>
        `    - ${k}${req.includes(k) ? '（必填）' : ''}: ${v.description || v.type || ''}`
      ).join('\n');
      toolLines.push(`- \`${name}\`: ${tool.description}\n  参数：\n${params}`);
    }
    if (toolLines.length > 0) {
      parts.push('---\n## 可用工具\n' + toolLines.join('\n'));
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

    // Skills 描述 + 流程指引
    const skillIds: string[] = agent?.skill_ids ? JSON.parse(agent.skill_ids) : [];
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
    const isHarness = !agent?.type || agent.type === 'harness';
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
  }

  // 工作目录
  if (serverState.workspaceDir && serverState.workspaceDir.trim()) {
    parts.push(`---\n## 工作目录\n当前工作目录：${serverState.workspaceDir}`);
  }

  // 当前时间
  parts.push(`---\n当前时间：${new Date().toLocaleString('zh-CN')}`);

  return parts.join('\n\n');
}

/** 从 DB 加载 agent 工具挂载，构建工具 schema（排除 UI 工具和 MCP/自定义工具） */
export function buildToolsForBackend(agentId: string | null, userId: string): any[] {
  ensureToolsInitialized();
  const registry = getToolRegistry(getSearchBackend());
  const tools: any[] = [];
  const seen = new Set<string>();

  // agent 内置工具
  if (agentId) {
    const agent = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as any;
    const toolIds: string[] = agent?.builtin_tool_ids ? JSON.parse(agent.builtin_tool_ids) : [];
    for (const name of toolIds) {
      if (UI_TOOL_NAMES.has(name)) continue;
      if (!registry.has(name)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const def = registry.get(name)!;
      tools.push({
        type: 'function',
        function: { name, description: def.description, parameters: def.inputSchema },
      });
    }
  }

  // 无 agent 时暴露所有非 UI 内置工具
  if (tools.length === 0 && !agentId) {
    for (const name of registry.names()) {
      if (UI_TOOL_NAMES.has(name)) continue;
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

  // API 工具（记忆/知识库，后端直接执行）
  const apiRegistry = getApiToolRegistry();
  for (const tName of ['api_memory_search', 'api_kb_search', 'api_kb_list']) {
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

  // 自定义工具（后端沙箱直接执行）
  const customTools = db.prepare('SELECT id, name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId) as any[];
  for (const ct of customTools) {
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

  // call_agent + list_sub_agents（后端直接执行）
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
