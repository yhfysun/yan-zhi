// 工作流后端执行器 —— WorkflowEngine 在 server 侧注册全套节点 handler。
// 前端只提交工作流定义（agent + 子智能体 bundle）与输入，DAG 在后端跑完再回传结果。
// 动机与 LLM 任务后端化一致：前端关掉不影响执行，MCP 连接复用后端 client-manager。
// 运行状态全量落库 workflow_run（与 llm_task 同思路）：节点级 SSE 事件带单调 seq，
// 断线用 since=seq 续传；server 重启后遗留 running 由 markOrphanWorkflowRunsInterrupted() 回收。
import { randomUUID } from 'node:crypto';
import { writeFileSync, statSync } from 'node:fs';
import { WorkflowEngine, LlmClient, runUserCode, getToolRegistry, createRunContext, buildSubgraphPlan } from '@yan-zhi/core';
import type { NodeHandler, RunContext, NodeResult } from '@yan-zhi/core';
import type { Workflow, Platform, Model } from '@yan-zhi/shared';
import { db } from './db.js';
import { ensureArtifactDirFor } from './services/artifact-dir.js';
import { overridableFieldsOf } from './services/workflow-delegate.js';
import { findModelRow, rowToModel } from './services/model-resolve.js';
import { DEFAULT_CONTEXT_WINDOW } from './constants.js';
import { callMcpTool, loadServer, getToolsFromDb, mcpShortIdOf } from './mcp/client-manager.js';
import { executeApiTool } from './mcp/api-tool-executor.js';

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

/** 反写投递上下文：工作流跑完后往哪个会话、以哪个子智能体身份写回。
 *  定义在本文件（而非 llm-task-manager）：startWorkflowRun 要把它落库，
 *  且 workflow-runner 不能反向依赖 llm-task-manager（会成环）。 */
export interface WorkflowDeliveryCtx {
  conversationId: string;
  userId: string;
  taskId: string;
  agentId: string;
  agentName: string;
  parentToolCallId: string;
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
  type: 'run:started' | 'node:start' | 'node:ok' | 'node:error' | 'run:completed' | 'run:failed' | 'run:aborted' | 'run:paused';
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
  /** aborted = 用户主动取消；paused = 单节点调试停在断点（均可继续/重跑） */
  status: 'running' | 'completed' | 'failed' | 'aborted' | 'paused';
  seq: number;
  events: WorkflowRunEvent[];
  subscribers: Set<(e: WorkflowRunEvent) => void>;
  logs: WorkflowRunLog[];
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: number;
  /** 取消控制器：signal 一路传到引擎，节点之间检查 */
  abort: AbortController;
  /** 节点输出快照（单节点调试：改变量后从某节点继续，不重跑上游） */
  snapshots: Map<string, unknown>;
  /** 本次运行的输入（调试续跑时用来复原 ctx） */
  inputs: Record<string, unknown>;
  /** 工作流定义（调试续跑要用，避免重新查库） */
  bundle: WorkflowRunBundle;
  /** 结束信号：调试接口需要 await 跑完再返回快照 */
  finished: Promise<void>;
  settle: () => void;
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
    // running（正常执行中）与 paused（调试断点）都要回收：
    // 两者的续跑都依赖内存里的 snapshots / abort，进程重启后这些全没了，
    // 继续挂着会让 UI 上出现「永远停在断点、点了继续却报运行不存在」的幽灵记录。
    const r = db.prepare("UPDATE workflow_run SET status = 'failed', error = '服务重启导致运行中断', updated_at = ? WHERE status IN ('running', 'paused')").run(Date.now());
    return r.changes;
  } catch {
    return 0;
  }
}

/** 反写成功后清除待投递标记；写回失败则保留，重启后由 resumeWorkflowDeliveries 重试。 */
export function markWorkflowDelivered(runId: string): void {
  try {
    db.prepare('UPDATE workflow_run SET delivery_json = NULL, updated_at = ? WHERE id = ?').run(Date.now(), runId);
  } catch { /* 标记失败只影响重试语义，不抛 */ }
}

/** 待补投的运行（delivery_json 非空）：含「跑完未反写」与「跑挂未通知」两类。 */
export function loadPendingWorkflowDeliveries(): Array<{ id: string; status: string; result_json: string | null; error: string | null; delivery_json: string }> {
  try {
    return db.prepare('SELECT id, status, result_json, error, delivery_json FROM workflow_run WHERE delivery_json IS NOT NULL ORDER BY created_at ASC').all() as any;
  } catch {
    return [];
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

/**
 * 按节点允许覆盖的字段白名单筛出覆盖值（声明优先、默认表兜底）。
 * 白名单外的键一律丢弃 —— 避免「改一个模型参数把提示词一起冲掉」这类无声的配置漂移。
 */
function pickNodeOverrides(node: { id: string; type?: string; config?: Record<string, unknown> | null }, incoming: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!incoming) return {};
  const allow = overridableFieldsOf(node);
  if (allow.length === 0) return {};
  const out: Record<string, unknown> = {};
  for (const k of allow) {
    if (Object.prototype.hasOwnProperty.call(incoming, k)) out[k] = incoming[k];
  }
  return out;
}

function annotateBundle(
  bundle: WorkflowRunBundle,
  overrides?: Record<string, Record<string, unknown>>,
): WorkflowRunBundle {
  const annotateWorkflow = (wf: Workflow): Workflow => ({
    ...wf,
    nodes: (wf.nodes || []).map((n) => ({
      ...n,
      config: {
        ...(n.config || {}),
        ...pickNodeOverrides(n, overrides?.[n.id]),
        [NODE_ID_KEY]: n.id,
      },
    })),
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
        // 节点输出快照：单节点调试「改变量后从此节点继续」要用，避免重跑上游（省 LLM 调用）
        run.snapshots.set(nodeId, r.output);
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

/**
 * 按标识取一行模型。
 *
 * 解析规则集中在 `services/model-resolve.ts`（先主键、再兼容 API 名，不做模糊匹配），
 * 与预检集合、seed 回填共用同一口径 —— 三处任何一处单独改都会让
 * 「预检放行 → 运行时报模型不存在」这种最难受的故障重现。
 */
function loadModelRow(modelId: string, userId: string, platformId?: string): Model | null {
  const row = findModelRow(db, modelId, userId, platformId);
  if (!row) return null;
  return rowToModel(row, DEFAULT_CONTEXT_WINDOW);
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
    const nodeId = (config[NODE_ID_KEY] as string) || '';
    try {
      // 注意：严格模式下不能 const eval/arguments（SyntaxError），只屏蔽 window/document 等浏览器全局
      const sandboxed = `"use strict"; const window=void 0,document=void 0,fetch=void 0,XMLHttpRequest=void 0,setTimeout=void 0,setInterval=void 0; return (function(ctx){ ${expr} })(ctx);`;
      const fn = new Function('ctx', sandboxed);
      const out = await Promise.race([
        Promise.resolve(fn(ctx)),
        new Promise<null>((_, rej) => setTimeout(() => rej(new Error('代码节点超时（3s）')), 3000)),
      ]);
      return { output: out };
    } catch (e: any) {
      // 不再静默吞错：至少落到 server 日志，便于排查「代码节点输出 null」类问题
      console.error(`[wf-code] 节点 ${nodeId} 执行失败: ${e?.message || e}`);
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
    // 节点自带 platformId/modelId 优先；留空时回退到调用方透传的 __platformId/__modelId
    // （harness 通过 call_agent 委派工作流时，父任务把自己的平台/模型带进来，
    //  避免用户自建工作流的 llm 节点因未配置模型而直接抛错中断）
    const platformId = (config.platformId as string) || (ctx.inputs?.__platformId as string) || '';
    const modelId = (config.modelId as string) || (ctx.inputs?.__modelId as string) || '';
    const userId = (ctx.inputs?.__userId as string) || 'guest';
    if (!platformId || !modelId) throw new Error('LLM 节点缺少 platformId/modelId');

    const platform = loadPlatformRow(platformId, userId);
    const model = loadModelRow(modelId, userId, platformId);
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
      const result = await runUserCode(row.code, row.entry, (args as Record<string, unknown>) || {}, { timeout: row.timeout || 30000, runtime: row.runtime || 'node' });
      return { output: result };
    }

    // api_* 工具（媒体生成/合成/取数等）：走 server 的 executeApiTool。
    // 注意：这些工具不在 core 的 getToolRegistry() 里，所以 toolSource:'builtin' 分支找不到它们——
    // 想让工作流用 api_* 必须显式写 toolSource:'api'。会话 ID 从 inputs 透传（媒体落盘按会话分目录）。
    if (toolSource === 'api') {
      const conversationId = (ctx.inputs?.__conversationId as string) || undefined;
      const r = await executeApiTool(toolName, (args as Record<string, unknown>) || {}, userId, undefined, undefined, conversationId);
      const text = r.content.map((c) => c.text || '').join('');
      // 工具失败要以异常抛出，让引擎把节点标红并停止下游 —— 静默把错误串当产出会污染整条 DAG
      if (r.isError) throw new Error(text || `api 工具执行失败: ${toolName}`);
      return { output: text };
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
    // 透传模型回退上下文：子工作流的 llm 节点同样可能未配置模型
    if (ctx.inputs?.__platformId) subInputs.__platformId = ctx.inputs.__platformId;
    if (ctx.inputs?.__modelId) subInputs.__modelId = ctx.inputs.__modelId;
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
 * 前端直接跑与 call_agent 委派共用这一个入口，不另设同步分支。
 * agent 定义由前端随请求带上（智能体定义存前端本地库）；sub_agent 节点优先解析 bundle，
 * 找不到再回退 server db。执行过程中前端断开也不影响（状态在 run + DB）。
 * run 传 null 时降级为「纯执行」：不落 run 表、不发 SSE、不做事件包装。
 */
export async function executeBundle(
  bundle: WorkflowRunBundle,
  inputs: Record<string, unknown>,
  userId: string,
  run: WorkflowRunState | null,
  /** 节点参数覆盖（运行台）：{ [nodeId]: { key: value } }，只生效于白名单内的字段 */
  overrides?: Record<string, Record<string, unknown>>,
  /** 取消信号：引擎在每个节点之间检查 */
  signal?: AbortSignal,
  /** 单节点调试：执行完这个节点后暂停 */
  stopAtNodeId?: string,
): Promise<Record<string, unknown>> {
  const logs = run ? run.logs : [];
  const annotated = run ? annotateBundle(bundle, overrides) : bundle;
  const eng = createServerEngine(annotated, userId, logs, run);
  if (run) emitRunEvent(run, { type: 'run:started', msg: bundle.agent.name || bundle.agent.id });
  logs.push({ nodeId: '__start__', status: 'ok', msg: bundle.agent.name || bundle.agent.id, time: Date.now() });
  try {
    const result = await eng.run(annotated.agent as any, { ...inputs, __userId: userId }, {
      callStack: [bundle.agent.id],
      onNodeEvent: run ? (e) => emitRunEvent(run, e) : undefined,
      signal,
      stopAtNodeId,
    });
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

// ============================================================
// 取消运行
// ============================================================

/**
 * 取消一次运行。
 *
 * 只置状态 + 发信号，不强行 kill：引擎在**节点之间**检查 signal 后自行退出，
 * 所以正在跑的 LLM 请求会跑完当前这一跳才停（这是刻意的 —— 中断到一半的
 * LLM 响应没法产出可用结果，还不如让它落地，代价只是多等几秒）。
 * 已完成的节点产物保留在 snapshots 里，方便「从失败节点继续」。
 */
export function cancelWorkflowRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || (run.status !== 'running' && run.status !== 'paused')) return false;
  run.abort.abort();
  run.status = 'aborted';
  run.error = '已取消';
  emitRunEvent(run, { type: 'run:aborted', msg: '已取消' });
  persistRun(run);
  run.settle();
  return true;
}

// ============================================================
// 单节点调试（抄 Dify 的 step-run：跑到指定节点 / 单跑一个节点 / 改变量后继续）
// ============================================================

export interface DebugSnapshot {
  nodeId: string;
  output: unknown;
}

function snapshotList(run: WorkflowRunState): DebugSnapshot[] {
  return Array.from(run.snapshots.entries()).map(([nodeId, output]) => ({ nodeId, output }));
}

/** 复原调试上下文：inputs + 已执行节点输出快照（可覆盖） */
function restoreCtx(run: WorkflowRunState, variableOverrides?: Record<string, unknown>): RunContext {
  const ctx = createRunContext({ ...(run.inputs || {}), __userId: run.userId }, [run.agentId], run.abort.signal);
  for (const [nodeId, output] of run.snapshots) ctx.set(nodeId, output);
  for (const [nodeId, output] of Object.entries(variableOverrides || {})) ctx.set(nodeId, output);
  return ctx;
}

/**
 * 跑到指定节点后暂停（step-run）。返回到断点为止的所有节点输出快照。
 * 同步等待：因为调用方要立刻拿到快照渲染变量检查器。
 */
export async function debugRunTo(
  bundle: WorkflowRunBundle,
  inputs: Record<string, unknown>,
  userId: string,
  stopAtNodeId: string,
  overrides?: Record<string, Record<string, unknown>>,
): Promise<{ runId: string; snapshots: DebugSnapshot[]; status: string }> {
  const runId = startWorkflowRun(bundle, inputs, userId, undefined, overrides, stopAtNodeId);
  const run = runs.get(runId);
  if (run) await run.finished;
  const after = runs.get(runId);
  return {
    runId,
    snapshots: after ? snapshotList(after) : [],
    status: after?.status || 'unknown',
  };
}

/** 单跑一个节点（用已有快照 + 覆盖值作为上下文，不重跑上游） */
export async function debugRunNode(
  runId: string,
  nodeId: string,
  variableOverrides?: Record<string, unknown>,
): Promise<{ output: unknown; snapshots: DebugSnapshot[] }> {
  const run = runs.get(runId);
  if (!run) throw new Error('运行不存在或已结束（调试快照只在内存保留 30 分钟）');
  const node = (run.bundle?.agent?.workflow?.nodes || []).find((n: any) => n.id === nodeId);
  if (!node) throw new Error(`节点不存在: ${nodeId}`);
  const annotated = annotateBundle(run.bundle);
  const eng = createServerEngine(annotated, run.userId, run.logs, run);
  const ctx = restoreCtx(run, variableOverrides);
  // stopAtNodeId = 本节点 → plan 里只有它一个，跑完即停
  await eng.runPlan({ pending: [nodeId] } as any, annotated.agent as any, ctx, {
    callStack: [run.agentId],
    onNodeEvent: (e) => emitRunEvent(run, e as any),
    signal: run.abort.signal,
    stopAtNodeId: nodeId,
  });
  const output = ctx.get(nodeId);
  run.snapshots.set(nodeId, output);
  return { output, snapshots: snapshotList(run) };
}

/** 从某个节点继续跑（改完变量后推进下游，不重跑上游） */
export async function debugRunFrom(
  runId: string,
  fromNodeId: string,
  variableOverrides?: Record<string, unknown>,
): Promise<{ snapshots: DebugSnapshot[]; status: string }> {
  const run = runs.get(runId);
  if (!run) throw new Error('运行不存在或已结束（调试快照只在内存保留 30 分钟）');
  const nodes = run.bundle?.agent?.workflow?.nodes || [];
  const edges = run.bundle?.agent?.workflow?.edges || [];
  if (!nodes.some((n: any) => n.id === fromNodeId)) throw new Error(`节点不存在: ${fromNodeId}`);
  // 断点/取消过的运行要能接着跑：清掉终止态与已 abort 的信号
  if (run.status !== 'running') {
    run.status = 'running';
    run.error = null;
    if (run.abort.signal.aborted) run.abort = new AbortController();
  }
  const annotated = annotateBundle(run.bundle);
  const eng = createServerEngine(annotated, run.userId, run.logs, run);
  const ctx = restoreCtx(run, variableOverrides);
  const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));
  const plan = buildSubgraphPlan(nodeMap as any, fromNodeId, edges as any);
  try {
    await eng.runPlan(plan, annotated.agent as any, ctx, {
      callStack: [run.agentId],
      onNodeEvent: (e) => emitRunEvent(run, e as any),
      signal: run.abort.signal,
    });
    for (const [k, v] of ctx.outputs) run.snapshots.set(k, v);
    run.status = 'paused'; // 继续跑完仍停在调试态，可再选节点继续
    emitRunEvent(run, { type: 'run:paused', msg: `已从 ${fromNodeId} 继续`, result: run.result ?? undefined });
  } catch (e: any) {
    if (e?.name !== 'WorkflowAbortError') {
      run.status = 'failed';
      run.error = e?.message || '继续运行失败';
      emitRunEvent(run, { type: 'run:failed', msg: run.error || undefined });
    }
    throw e;
  } finally {
    persistRun(run);
  }
  return { snapshots: snapshotList(run), status: run.status };
}

// ============================================================
// 手动运行的产物落盘
// ============================================================

/**
 * 手动运行（运行台触发）成功后的产物落盘。
 *
 * 为什么必须有：`deliverWorkflowFile` 依赖 `WorkflowDeliveryCtx.conversationId`，
 * 而运行台是**没有会话**的 —— 之前的实现里这类运行的产物只躺在 `workflow_run.result_json`，
 * 用户跑完短剧流水线却拿不到图片/音频文件，会以为没执行。
 *
 * 归属策略：借用一个「虚拟会话 id」= 运行本身（`wfr_xxx`），产物落到
 * `.yan-zhi/tasks/<runId>/deliverable/`，会话归属写 runId —— 这样运行历史里能回查、
 * 又不会串进任何真实会话的文件列表。
 *
 * 注意：这里**不 import llm-task-manager**（会与它的反向依赖成环）。落盘所需的
 * `ensureArtifactDirFor` 与本模块已有依赖同源，直接做文件写入 + conversation_file 登记。
 */
function isDeliverableOutput(output: unknown): output is Record<string, unknown> {
  return !!output && typeof output === 'object' && !Array.isArray(output);
}

/**
 * 从运行结果里提取「文件型产物」并落盘。
 *
 * 识别口径与 classifyWorkflowOutput 保持一致（那边在 llm-task-manager 里，不能反向 import）：
 *   - 显式文件项：{ name, path? , content? , encoding? }
 *   - 显式文件数组：files / artifacts / deliverables
 * 找不到就当纯文本运行，不落盘（不猜）。
 */
export function extractFileArtifacts(output: unknown): Array<{ name: string; path?: string; content?: string; encoding?: 'utf8' | 'base64' }> {
  if (!isDeliverableOutput(output)) return [];
  const out: Array<{ name: string; path?: string; content?: string; encoding?: 'utf8' | 'base64' }> = [];
  const push = (v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const o = v as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    const p = typeof o.path === 'string' ? o.path : '';
    if (!name && !p) return;
    out.push({
      name: name || p.split(/[/\\]/).pop() || 'artifact',
      path: p || undefined,
      content: typeof o.content === 'string' ? o.content : undefined,
      encoding: o.encoding === 'base64' ? 'base64' : 'utf8',
    });
  };
  for (const key of ['files', 'artifacts', 'deliverables']) {
    const arr = (output as Record<string, unknown>)[key];
    if (Array.isArray(arr)) arr.forEach(push);
  }
  return out;
}

/**
 * 运行成功后的落盘（供路由在 run:completed 时调用）。
 * 落盘失败只记日志、不影响运行状态 —— 运行本身是成功的。
 */
export function persistRunArtifacts(
  runId: string,
  output: Record<string, unknown> | null,
  userId: string,
  agentName: string,
): number {
  const items = extractFileArtifacts(output);
  if (!items.length) return 0;
  let saved = 0;
  try {
    const { dir } = ensureArtifactDirFor({ conversationId: runId, category: 'deliverable' });
    for (const item of items) {
      let filePath = item.path || '';
      if (!filePath && item.content) {
        filePath = `${dir}/${item.name}`;
        writeFileSync(filePath, item.content, item.encoding === 'base64' ? 'base64' : 'utf8');
      }
      if (!filePath) continue;
      let size = 0;
      try { size = statSync(filePath).size; } catch { /* 取不到留 0 */ }
      const fileId = 'wfart_' + randomUUID().replace(/-/g, '').slice(0, 16);
      // 会话归属写 runId：既不串进真实会话的文件列表，运行历史又能按它回查
      try {
        db.prepare(
          'INSERT OR IGNORE INTO conversation_file (id, conversation_id, user_id, name, path, size, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(fileId, runId, userId, item.name, filePath, size, 'deliverable', 'workflow', Date.now());
      } catch (e: any) {
        console.warn(`[workflow] 产物登记失败 ${item.name}:`, e?.message || e);
      }
      saved++;
    }
    if (saved) console.log(`[workflow] 运行 ${runId}（${agentName}）已落盘 ${saved} 个产物到 ${dir}`);
  } catch (e: any) {
    console.warn(`[workflow] 运行产物落盘失败 ${runId}:`, e?.message || e);
  }
  return saved;
}

/**
 * 从后端 db（data.db）按 agentId 解析工作流 bundle（主 agent + 递归收集 sub_agent 节点引用的子智能体）。
 * 单库收敛后，智能体定义统一存 server db；sub_agent 节点执行时 ServerSubAgentNodeHandler 也会回退 db 动态读取，
 * 但此处仍预收集入 bundle 以兼容「运行时按 bundle 优先」的解析顺序。
 */
export function resolveBundleFromDb(agentId: string): WorkflowRunBundle | null {
  const row = db.prepare('SELECT id, name, workflow_json FROM agent WHERE id = ?').get(agentId) as any;
  if (!row) return null;
  const workflow: Workflow = (() => { try { return JSON.parse(row.workflow_json || '{"nodes":[],"edges":[]}'); } catch { return { nodes: [], edges: [] }; } })();
  const subAgents: Record<string, WorkflowAgentDef> = {};
  const seen = new Set<string>([agentId]);
  const collect = (wf: Workflow) => {
    for (const n of wf.nodes || []) {
      if (n.type !== 'sub_agent') continue;
      const sid = (n.config as any)?.subAgentId as string | undefined;
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      const sr = db.prepare('SELECT id, name, workflow_json FROM agent WHERE id = ?').get(sid) as any;
      if (!sr) continue;
      const swf: Workflow = (() => { try { return JSON.parse(sr.workflow_json || '{"nodes":[],"edges":[]}'); } catch { return { nodes: [], edges: [] }; } })();
      subAgents[sid] = { id: sr.id, name: sr.name, workflow: swf };
      collect(swf);
    }
  };
  collect(workflow);
  return { agent: { id: row.id, name: row.name, workflow }, subAgents };
}

export function startWorkflowRun(
  bundle: WorkflowRunBundle,
  inputs: Record<string, unknown>,
  userId: string,
  /** call_agent 委派时传入：记录反写目标，跑完/中断后据此补投。前端直接跑不传。 */
  delivery?: WorkflowDeliveryCtx,
  /** 节点参数覆盖（运行台手动运行时传入） */
  overrides?: Record<string, Record<string, unknown>>,
  /** 单节点调试：执行完这个节点后暂停 */
  stopAtNodeId?: string,
): string {
  const runId = 'wfr_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const now = Date.now();
  let settle = () => {};
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
    abort: new AbortController(),
    snapshots: new Map(),
    inputs,
    bundle,
    finished: new Promise<void>((r) => { settle = r; }),
    settle: () => settle(),
  };
  runs.set(runId, run);
  try {
    db.prepare(
      'INSERT INTO workflow_run (id, user_id, agent_id, agent_name, bundle_json, inputs_json, status, logs_json, delivery_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(runId, userId, bundle.agent.id, bundle.agent.name || null, JSON.stringify(bundle), JSON.stringify(inputs || {}), 'running', '[]', delivery ? JSON.stringify(delivery) : null, now, now);
  } catch {}

  void (async () => {
    try {
      const result = await executeBundle(bundle, inputs, userId, run, overrides, run.abort.signal, stopAtNodeId);
      run.result = result;
      if (run.status === 'running') {
        if (stopAtNodeId) {
          // 断点暂停：不是失败也不是完成，UI 上要能「从此节点继续」
          run.status = 'paused';
          emitRunEvent(run, { type: 'run:paused', msg: `已停在节点 ${stopAtNodeId}`, result });
        } else {
          run.status = 'completed';
          emitRunEvent(run, { type: 'run:completed', result });
          // 无 delivery（手动运行台触发）→ 产物自己落盘，否则用户拿不到文件
          if (!delivery) {
            try {
              persistRunArtifacts(runId, result, userId, bundle.agent.name || bundle.agent.id);
            } catch (e: any) {
              console.warn('[workflow] 产物落盘异常:', e?.message || e);
            }
          }
        }
      }
    } catch (e: any) {
      // 取消是用户主动行为：状态与文案在 cancelWorkflowRun 里已经落好，这里不再覆盖成 failed
      if (e?.name === 'WorkflowAbortError') {
        if (run.status === 'running') {
          run.status = 'aborted';
          run.error = e?.message || '运行已取消';
          emitRunEvent(run, { type: 'run:aborted', msg: run.error || undefined });
        }
      } else if (run.status === 'running') {
        run.error = e?.message || '工作流执行失败';
        run.status = 'failed';
        emitRunEvent(run, { type: 'run:failed', msg: run.error || undefined });
      }
    } finally {
      persistRun(run);
      run.settle();
      // 已结束的运行保留一段时间供前端回查（由 cleanupOldWorkflowRuns 兜底清理）
      setTimeout(() => runs.delete(runId), 30 * 60 * 1000).unref?.();
    }
  })();

  return runId;
}
