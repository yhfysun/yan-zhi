// 工作流后端执行器 —— WorkflowEngine 在 server 侧注册全套节点 handler。
// 前端只提交工作流定义（agent + 子智能体 bundle）与输入，DAG 在后端跑完再回传结果。
// 动机与 LLM 任务后端化一致：前端关掉不影响执行，MCP 连接复用后端 client-manager。
// 运行状态全量落库 workflow_run（与 llm_task 同思路）：节点级 SSE 事件带单调 seq，
// 断线用 since=seq 续传；server 重启后遗留 running 由 markOrphanWorkflowRunsInterrupted() 回收。
import { randomUUID } from 'node:crypto';
import { WorkflowEngine, LlmClient, runInSandbox, getToolRegistry } from '@yan-zhi/core';
import type { NodeHandler, RunContext, NodeResult } from '@yan-zhi/core';
import type { Workflow, Platform, Model } from '@yan-zhi/shared';
import { db } from './db.js';
import { callMcpTool, loadServer, getToolsFromDb, mcpShortIdOf } from './mcp/client-manager.js';

export interface WorkflowAgentDef {
  id: string;
  name?: string;
  workflow: Workflow;
}

export interface WorkflowRunBundle {
  agent: WorkflowAgentDef;
  /** sub_agent 节点引用的子智能体定义（前端本地库解析后随请求带上） */
  subAgents?: Record<string, WorkflowAgentDef>;
}

export interface WorkflowRunLog {
  nodeId: string;
  status: 'start' | 'ok' | 'error';
  msg?: string;
  time: number;
}

// ============================================================
// 运行状态管理（内存 + workflow_run 落库 + SSE）
// ============================================================

export interface WorkflowRunEvent {
  type: 'run:started' | 'node:start' | 'node:ok' | 'node:error' | 'run:completed' | 'run:failed';
  seq?: number;
  nodeId?: string;
  nodeType?: string;
  msg?: string;
  result?: Record<string, unknown>;
}

interface WorkflowRunState {
  id: string;
  userId: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  seq: number;
  events: WorkflowRunEvent[];
  subscribers: Set<(e: WorkflowRunEvent) => void>;
  logs: WorkflowRunLog[];
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: number;
}

const runs = new Map<string, WorkflowRunState>();
const MAX_EVENTS = 500;

function emitRunEvent(run: WorkflowRunState, event: WorkflowRunEvent): void {
  event.seq = ++run.seq;
  run.events.push(event);
  if (run.events.length > MAX_EVENTS) {
    run.events.splice(0, run.events.length - MAX_EVENTS);
  }
  for (const sub of run.subscribers) {
    try { sub(event); } catch {}
  }
}

function persistRun(run: WorkflowRunState): void {
  try {
    db.prepare(
      'UPDATE workflow_run SET status = ?, result_json = ?, logs_json = ?, error = ?, updated_at = ? WHERE id = ?',
    ).run(run.status, run.result ? JSON.stringify(run.result) : null, JSON.stringify(run.logs), run.error, Date.now(), run.id);
  } catch {}
}

/** 订阅运行事件。since 语义 = 前端已收到的最后一条事件 seq（与 llm 任务一致）。 */
export function subscribeWorkflowRun(runId: string, since: number, onEvent: (e: WorkflowRunEvent) => void): () => void {
  const run = runs.get(runId);
  if (!run) return () => {};
  for (const ev of run.events) {
    if ((ev.seq ?? 0) <= since) continue;
    try { onEvent(ev); } catch {}
  }
  run.subscribers.add(onEvent);
  return () => { run.subscribers.delete(onEvent); };
}

export function getWorkflowRun(runId: string): WorkflowRunState | null {
  return runs.get(runId) || null;
}

/** server 启动时回收：上次进程遗留的 running 一律标记 failed（与 markOrphanTasksInterrupted 同语义）。 */
export function markOrphanWorkflowRunsInterrupted(): number {
  try {
    const r = db.prepare("UPDATE workflow_run SET status = 'failed', error = '服务重启导致运行中断', updated_at = ? WHERE status = 'running'").run(Date.now());
    return r.changes;
  } catch {
    return 0;
  }
}

/** 启动时清理 30 天前的历史运行记录（避免 workflow_run 无限增长） */
export function cleanupOldWorkflowRuns(): number {
  try {
    const r = db.prepare('DELETE FROM workflow_run WHERE created_at < ?').run(Date.now() - 30 * 24 * 3600 * 1000);
    return r.changes;
  } catch {
    return 0;
  }
}

// ============================================================
// 节点级事件注入：给 bundle 内每个节点 config 打上 __nodeId，包装 handler 发事件
// ============================================================

const NODE_ID_KEY = '__nodeId';

function annotateBundle(bundle: WorkflowRunBundle): WorkflowRunBundle {
  const annotateWorkflow = (wf: Workflow): Workflow => ({
    ...wf,
    nodes: (wf.nodes || []).map((n) => ({ ...n, config: { ...(n.config || {}), [NODE_ID_KEY]: n.id } })),
  });
  return {
    agent: { ...bundle.agent, workflow: annotateWorkflow(bundle.agent.workflow) },
    subAgents: Object.fromEntries(
      Object.entries(bundle.subAgents || {}).map(([k, v]) => [k, { ...v, workflow: annotateWorkflow(v.workflow) }]),
    ),
  };
}

function wrapHandler(h: NodeHandler, run: WorkflowRunState): NodeHandler {
  return {
    type: h.type,
    async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
      const nodeId = (config[NODE_ID_KEY] as string) || h.type;
      emitRunEvent(run, { type: 'node:start', nodeId, nodeType: h.type });
      try {
        const r = await h.execute(config, ctx);
        emitRunEvent(run, { type: 'node:ok', nodeId, nodeType: h.type });
        return r;
      } catch (e: any) {
        emitRunEvent(run, { type: 'node:error', nodeId, nodeType: h.type, msg: e?.message });
        throw e;
      }
    },
  };
}

// ============================================================
// 数据访问
// ============================================================

function loadPlatformRow(platformId: string, userId: string): Platform | null {
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

function loadModelRow(modelId: string, userId: string): Model | null {
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

function upstreamValue(ctx: RunContext): unknown {
  return ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs;
}

// ── 基础节点（input/output/code/condition/loop）：纯逻辑，与前端原实现语义一致 ──

class InputNodeHandler implements NodeHandler {
  type = 'input';
  async execute(_config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    return { output: ctx.inputs };
  }
}

class OutputNodeHandler implements NodeHandler {
  type = 'output';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const key = (config.key as string) || 'result';
    return { output: ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs[key] };
  }
}

class CodeNodeHandler implements NodeHandler {
  type = 'code';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const expr = (config.expression as string) || 'return null;';
    try {
      const sandboxed = `"use strict"; const window=void 0,document=void 0,fetch=void 0,XMLHttpRequest=void 0,eval=void 0,Function=void 0,setTimeout=void 0,setInterval=void 0; return (function(ctx){ ${expr} })(ctx);`;
      const fn = new Function('ctx', sandboxed);
      const out = await Promise.race([
        Promise.resolve(fn(ctx)),
        new Promise<null>((_, rej) => setTimeout(() => rej(new Error('代码节点超时（3s）')), 3000)),
      ]);
      return { output: out };
    } catch {
      return { output: null };
    }
  }
}

class ConditionNodeHandler implements NodeHandler {
  type = 'condition';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const expr = (config.expression as string) || 'return true;';
    try {
      const fn = new Function('ctx', expr);
      const result = fn(ctx);
      return { output: { matched: !!result, value: result } };
    } catch {
      return { output: { matched: false, value: false } };
    }
  }
}

class LoopNodeHandler implements NodeHandler {
  type = 'loop';
  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    // 引擎层已处理子图循环，这里做单机回退逻辑
    const maxIter = Number(config.maxIterations) || 5;
    const key = (config.iterateKey as string) || 'item';
    const bodyExpr = (config.bodyExpr as string) || '';
    const source = upstreamValue(ctx);
    const arr: unknown[] = Array.isArray(source) ? source : (source ? [source] : []);
    const results: unknown[] = [];
    if (bodyExpr) {
      try {
        const fn = new Function('ctx', `"use strict"; const window=void 0,document=void 0,fetch=void 0; return (function(ctx){ ${bodyExpr} })(ctx);`);
        const limit = Math.min(arr.length, maxIter);
        for (let i = 0; i < limit; i++) {
          results.push(fn({ ...ctx, [key]: arr[i], index: i }));
        }
      } catch {}
    }
    return { output: results.length > 0 ? results : source };
  }
}

// ── LLM 节点：server db 直查平台/模型 + LlmClient（服务端直连上游）。
//    支持 config.mcpTools: [{ serverId, toolName }] —— 有工具时走 ReAct 循环，
//    模型发起 tool_calls 就用后端 callMcpTool 执行并回填，直到给出最终文本。

const LLM_TOOL_ROUNDS = Number(process.env.WORKFLOW_LLM_TOOL_ROUNDS || 8);

interface WorkflowMcpToolRef {
  serverId: string;
  toolName: string;
}

/** 把节点配置的 MCP 工具引用解析成 OpenAI function schema + 执行信息（带用户归属校验） */
function buildWorkflowToolDefs(mcpTools: WorkflowMcpToolRef[], userId: string): {
  schemas: any[];
  toolMap: Map<string, { serverId: string; toolName: string }>;
} {
  const schemas: any[] = [];
  const toolMap = new Map<string, { serverId: string; toolName: string }>();
  for (const ref of mcpTools) {
    if (!ref.serverId || !ref.toolName) continue;
    // 归属校验：server 不属于该用户则跳过
    if (!loadServer(ref.serverId, userId)) continue;
    const shortId = mcpShortIdOf(ref.serverId);
    if (!shortId) continue;
    const exposed = `mcp_${shortId}__${ref.toolName}`;
    const def = getToolsFromDb(ref.serverId).find((t) => t.name === ref.toolName);
    schemas.push({
      type: 'function',
      function: {
        name: exposed,
        description: def?.description || `MCP 工具 ${ref.toolName}`,
        parameters: (() => { try { return def?.inputSchema || { type: 'object' }; } catch { return { type: 'object' }; } })(),
      },
    });
    toolMap.set(exposed, { serverId: ref.serverId, toolName: ref.toolName });
  }
  return { schemas, toolMap };
}

function parseToolCallArgs(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return (raw as Record<string, unknown>) || {};
}

class ServerLlmNodeHandler implements NodeHandler {
  type = 'llm';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const platformId = config.platformId as string;
    const modelId = config.modelId as string;
    const userId = (ctx.inputs?.__userId as string) || 'guest';
    if (!platformId || !modelId) throw new Error('LLM 节点缺少 platformId/modelId');

    const platform = loadPlatformRow(platformId, userId);
    const model = loadModelRow(modelId, userId);
    if (!platform) throw new Error(`平台不存在: ${platformId}`);
    if (!model) throw new Error(`模型不存在: ${modelId}`);

    const systemPrompt = (config.systemPrompt as string) || '';
    const inputVal = upstreamValue(ctx);
    const messages: any[] = [
      ...(systemPrompt ? [{ id: 'sys', conversationId: '', role: 'system' as const, content: systemPrompt, createdAt: 0 }] : []),
      { id: 'user', conversationId: '', role: 'user' as const, content: typeof inputVal === 'string' ? inputVal : JSON.stringify(inputVal), createdAt: 0 },
    ];

    const client = new LlmClient(platform, model);
    const chatOpts = { temperature: config.temperature as number, maxTokens: config.maxTokens as number };

    // 无工具配置：保持原单轮行为
    const mcpTools = Array.isArray(config.mcpTools) ? (config.mcpTools as WorkflowMcpToolRef[]) : [];
    if (mcpTools.length === 0) {
      const result = await client.chat(messages as any, chatOpts);
      return { output: result.delta?.content || '' };
    }

    // 有工具：ReAct 循环 —— 模型发起 tool_calls 就用后端 callMcpTool 执行并回填
    const { schemas, toolMap } = buildWorkflowToolDefs(mcpTools, userId);
    if (schemas.length === 0) {
      const result = await client.chat(messages as any, chatOpts);
      return { output: result.delta?.content || '' };
    }
    for (let round = 0; round < LLM_TOOL_ROUNDS; round++) {
      const result = await client.chat(messages as any, { ...chatOpts, tools: schemas });
      const toolCalls = (result.delta?.toolCalls || []) as any[];
      if (toolCalls.length === 0) {
        return { output: result.delta?.content || '' };
      }
      messages.push({
        id: `a_${round}`, conversationId: '', role: 'assistant' as const,
        content: result.delta?.content || '', toolCalls, createdAt: 0,
      });
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const name = tc.toolName || tc.function?.name || '';
        const target = toolMap.get(name);
        let toolOutput: string;
        if (!target) {
          toolOutput = `[错误] 工具 ${name} 不可用`;
        } else {
          try {
            const out = await callMcpTool(target.serverId, target.toolName, parseToolCallArgs(tc.arguments ?? tc.function?.arguments));
            toolOutput = typeof out === 'string' ? out : JSON.stringify(out);
          } catch (e: any) {
            toolOutput = `[错误] ${e?.message || e}`;
          }
        }
        messages.push({
          id: `t_${round}_${i}`, conversationId: '', role: 'tool' as const,
          content: toolOutput, toolCallId: tc.id, createdAt: 0,
        });
      }
    }
    // 达到轮次上限：把当前上下文再压给模型要一次最终答复
    const final = await client.chat(messages as any, chatOpts);
    return { output: final.delta?.content || '' };
  }
}

// ── 工具节点：MCP 走后端 client-manager（stdio/sse/http 全支持、连接复用） ──

class ServerToolNodeHandler implements NodeHandler {
  type = 'tool';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const toolSource = (config.toolSource as string) || 'mcp';
    const toolName = config.toolName as string;
    const userId = (ctx.inputs?.__userId as string) || 'guest';
    if (!toolName) throw new Error('工具节点缺少 toolName');

    let args = config.arguments;
    if (!args || (typeof args === 'object' && Object.keys(args as object).length === 0)) {
      args = upstreamValue(ctx);
    }

    if (toolSource === 'builtin') {
      const registry = getToolRegistry();
      if (!registry.has(toolName)) throw new Error(`内置工具不存在: ${toolName}`);
      const result = await registry.execute(toolName, (args as Record<string, unknown>) || {});
      return { output: result };
    }

    if (toolSource === 'custom') {
      const row = db
        .prepare('SELECT * FROM custom_tool WHERE name = ? AND enabled = 1 AND (user_id = ? OR is_public = 1)')
        .get(toolName, userId) as any;
      if (!row) throw new Error(`自定义工具不存在或已禁用: ${toolName}`);
      const result = await runInSandbox(row.code, row.entry, (args as Record<string, unknown>) || {}, { timeout: row.timeout || 30000 });
      return { output: result };
    }

    // MCP（默认）：先做归属校验（防止跨用户调用他人 server）
    const mcpServerId = config.mcpServerId as string;
    if (!mcpServerId) throw new Error('MCP 工具节点缺少 mcpServerId');
    if (!loadServer(mcpServerId, userId)) throw new Error(`MCP 服务器不存在或无权访问: ${mcpServerId}`);
    const output = await callMcpTool(mcpServerId, toolName, (args as Record<string, unknown>) || {});
    return { output };
  }
}

// ── SubAgent 节点：优先用 bundle 内定义（前端本地库解析），回退 server db agent 表 ──

class ServerSubAgentNodeHandler implements NodeHandler {
  type = 'sub_agent';

  constructor(
    private bundle: WorkflowRunBundle,
    private userId: string,
    private logs: WorkflowRunLog[],
  ) {}

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const subAgentId = config.subAgentId as string;
    if (!subAgentId) throw new Error('子智能体节点缺少 subAgentId');
    const mapping = (config.inputsMapping as Record<string, unknown>) || {};
    const subInputs: Record<string, unknown> = { __userId: this.userId };
    for (const [k, v] of Object.entries(mapping)) {
      if (typeof v === 'string' && v.startsWith('${') && v.endsWith('}')) {
        const path = v.slice(2, -1).split('.').slice(1);
        let cur: any = ctx;
        for (const p of path) cur = cur?.[p];
        subInputs[k] = cur;
      } else {
        subInputs[k] = v;
      }
    }

    let def: WorkflowAgentDef | null = this.bundle.subAgents?.[subAgentId] || null;
    if (!def) {
      const row = db.prepare('SELECT id, name, workflow_json FROM agent WHERE id = ?').get(subAgentId) as any;
      if (row) {
        def = { id: row.id, name: row.name, workflow: row.workflow_json ? JSON.parse(row.workflow_json) : { nodes: [], edges: [] } };
      }
    }
    if (!def) throw new Error(`子智能体不存在: ${subAgentId}`);

    const eng = createServerEngine(
      { agent: def, subAgents: this.bundle.subAgents },
      this.userId,
      this.logs,
      null,
    );
    const nextStack = ctx.callStack ? [...ctx.callStack, subAgentId] : [subAgentId];
    const result = await eng.run(def as any, subInputs, { callStack: nextStack });
    return { output: result };
  }
}

// ── 记忆节点：server db 直写（按 user_id 隔离，多用户不串库） ──

class ServerMemoryReadNodeHandler implements NodeHandler {
  type = 'memory_read';

  constructor(private userId: string) {}

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const agentId = (config.agentId as string) || '';
    const query = (config.query as string) || '';
    const topK = Number(config.topK) || 3;
    let rows: any[] = [];
    if (agentId) {
      rows = db.prepare('SELECT * FROM memory WHERE agent_id = ? AND (user_id = ? OR user_id IS NULL) ORDER BY last_used_at DESC LIMIT ?')
        .all(agentId, this.userId, topK) as any[];
    } else {
      rows = db.prepare('SELECT * FROM memory WHERE (user_id = ? OR user_id IS NULL) ORDER BY last_used_at DESC LIMIT ?')
        .all(this.userId, topK) as any[];
    }
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => (r.content || '').toLowerCase().includes(q));
    }
    return { output: rows.map((r) => ({ id: r.id, content: r.content, tags: r.tags_json ? JSON.parse(r.tags_json) : [] })) };
  }
}

class ServerMemoryWriteNodeHandler implements NodeHandler {
  type = 'memory_write';

  constructor(private userId: string) {}

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const agentId = (config.agentId as string) || '';
    const contentKey = (config.contentKey as string) || 'content';
    const tags = (config.tags as string[]) || [];
    const upstream = upstreamValue(ctx);
    let content = '';
    if (typeof upstream === 'string') content = upstream;
    else if (upstream && typeof upstream === 'object' && contentKey in (upstream as any)) {
      content = String((upstream as any)[contentKey]);
    } else {
      content = JSON.stringify(upstream);
    }
    const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ts = Date.now();
    db.prepare('INSERT INTO memory (id, user_id, agent_id, content, tags_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, this.userId, agentId, content, JSON.stringify(tags), ts, ts);
    return { output: { id, content, tags } };
  }
}

function createServerEngine(
  bundle: WorkflowRunBundle,
  userId: string,
  logs: WorkflowRunLog[],
  run: WorkflowRunState | null,
): WorkflowEngine {
  const wrap = (h: NodeHandler): NodeHandler => (run ? wrapHandler(h, run) : h);
  const eng = new WorkflowEngine();
  eng.register(wrap(new InputNodeHandler()));
  eng.register(wrap(new OutputNodeHandler()));
  eng.register(wrap(new CodeNodeHandler()));
  eng.register(wrap(new ConditionNodeHandler()));
  eng.register(wrap(new LoopNodeHandler()));
  eng.register(wrap(new ServerLlmNodeHandler()));
  eng.register(wrap(new ServerToolNodeHandler()));
  eng.register(wrap(new ServerSubAgentNodeHandler(bundle, userId, logs)));
  eng.register(wrap(new ServerMemoryReadNodeHandler(userId)));
  eng.register(wrap(new ServerMemoryWriteNodeHandler(userId)));
  return eng;
}

/**
 * 执行一次工作流（核心 DAG 循环，由 startWorkflowRun 调度）。
 * agent 定义由前端随请求带上（智能体定义存前端本地库）；sub_agent 节点优先解析 bundle，
 * 找不到再回退 server db。执行过程中前端断开也不影响（状态在 run + DB）。
 */
async function executeBundle(
  bundle: WorkflowRunBundle,
  inputs: Record<string, unknown>,
  userId: string,
  run: WorkflowRunState | null,
): Promise<Record<string, unknown>> {
  const logs = run ? run.logs : [];
  const annotated = run ? annotateBundle(bundle) : bundle;
  const eng = createServerEngine(annotated, userId, logs, run);
  if (run) emitRunEvent(run, { type: 'run:started', msg: bundle.agent.name || bundle.agent.id });
  logs.push({ nodeId: '__start__', status: 'ok', msg: bundle.agent.name || bundle.agent.id, time: Date.now() });
  try {
    const result = await eng.run(annotated.agent as any, { ...inputs, __userId: userId }, { callStack: [bundle.agent.id] });
    logs.push({ nodeId: '__end__', status: 'ok', time: Date.now() });
    return result;
  } catch (e: any) {
    logs.push({ nodeId: '__end__', status: 'error', msg: e?.message, time: Date.now() });
    throw e;
  }
}

// ============================================================
// 对外入口：创建运行（异步执行 + 落库 + SSE）
// ============================================================

export function startWorkflowRun(
  bundle: WorkflowRunBundle,
  inputs: Record<string, unknown>,
  userId: string,
): string {
  const runId = 'wfr_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const now = Date.now();
  const run: WorkflowRunState = {
    id: runId,
    userId,
    agentId: bundle.agent.id,
    status: 'running',
    seq: 0,
    events: [],
    subscribers: new Set(),
    logs: [],
    result: null,
    error: null,
    createdAt: now,
  };
  runs.set(runId, run);
  try {
    db.prepare(
      'INSERT INTO workflow_run (id, user_id, agent_id, agent_name, bundle_json, inputs_json, status, logs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(runId, userId, bundle.agent.id, bundle.agent.name || null, JSON.stringify(bundle), JSON.stringify(inputs || {}), 'running', '[]', now, now);
  } catch {}

  void (async () => {
    try {
      const result = await executeBundle(bundle, inputs, userId, run);
      run.result = result;
      run.status = 'completed';
      emitRunEvent(run, { type: 'run:completed', result });
    } catch (e: any) {
      run.error = e?.message || '工作流执行失败';
      run.status = 'failed';
      emitRunEvent(run, { type: 'run:failed', msg: run.error || undefined });
    } finally {
      persistRun(run);
      // 已结束的运行保留一段时间供前端回查（由 cleanupOldWorkflowRuns 兜底清理）
      setTimeout(() => runs.delete(runId), 30 * 60 * 1000).unref?.();
    }
  })();

  return runId;
}
