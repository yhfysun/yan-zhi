// 工作流执行路由 —— 异步运行 + 落库 + SSE 进度流
// POST /run                 创建运行（返回 runId，DAG 在 server 异步跑）
// GET  /runs                当前用户的历史运行列表
// GET  /runs/:id            运行状态/结果/日志（内存 miss 回落 DB，重启后仍可查）
// GET  /runs/:id/stream     SSE 订阅节点级事件（since=最后收到的 seq，断线续传）
// 说明：智能体定义存前端本地库（Dexie/桌面 IPC sqlite），由前端解析 sub_agent 引用后随请求带上；
//       后端只负责执行（LLM/MCP/子智能体递归全部在 server 侧完成）。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import {
  startWorkflowRun,
  getWorkflowRun,
  subscribeWorkflowRun,
  resolveBundleFromDb,
  cancelWorkflowRun,
  debugRunTo,
  debugRunNode,
  debugRunFrom,
} from '../workflow-runner.js';
import type { WorkflowRunBundle } from '../workflow-runner.js';
import { buildWorkflowInputFieldDefs, collectOverridableNodes } from '../services/workflow-delegate.js';
import { preflightWorkflow, canStart } from '../services/workflow-preflight.js';
import type { PreflightContext, PreflightIssue } from '../services/workflow-preflight.js';
import { syncWorkflowTools } from '../services/workflow-tool-registry.js';
import { getToolRegistry } from '@yan-zhi/core';
import { SUPPORTED_API_TOOLS } from '../mcp/api-tool-executor.js';
import { checkWorkflowPermission, normalizePermissionMode, type PermissionMode } from '../tool-permission.js';

const router = Router();
router.use(authMiddleware);

// GET /agents —— 可运行工作流清单（运行台左栏）
// 字段定义一律走 buildWorkflowInputFieldDefs：内置工作流的 inputs_schema_json 恒为 NULL，
// 真实 schema 在 workflow_json 的 input 节点 config.schema，用 parseInputsSchema 会取到空。
router.get('/agents', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  let rows: any[] = [];
  try {
    rows = db.prepare(
      "SELECT id, name, description, inputs_schema_json, workflow_json FROM agent WHERE type = 'workflow' AND (user_id = ? OR is_public = 1 OR is_builtin = 1) ORDER BY name",
    ).all(userId) as any[];
  } catch {
    rows = db.prepare("SELECT id, name, description, inputs_schema_json, workflow_json FROM agent WHERE type = 'workflow' ORDER BY name").all() as any[];
  }
  const data = rows.map((r) => {
    let wf: any = {};
    try { wf = JSON.parse(r.workflow_json || '{}'); } catch { wf = {}; }
    const wfNodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
    let nodeCount = wfNodes.length;
    // 调试要选「运行到哪个节点」，所以把轻量节点清单带上（只要 id/type/标题）
    const nodes = wfNodes.map((n: any) => ({
      id: String(n?.id || ''),
      type: String(n?.type || ''),
      label: String(n?.config?.label || n?.config?.title || n?.id || ''),
    })).filter((n: { id: string }) => !!n.id);
    let lastRun: { id: string; status: string; createdAt: number } | null = null;
    try {
      const lr = db.prepare(
        'SELECT id, status, created_at FROM workflow_run WHERE agent_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      ).get(r.id, userId) as any;
      if (lr) lastRun = { id: lr.id, status: lr.status, createdAt: lr.created_at };
    } catch { /* 历史查询失败不影响列表 */ }
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      nodeCount,
      nodes,
      fields: buildWorkflowInputFieldDefs(r),
      // 运行台「覆盖节点配置」折叠区的数据源（默认白名单 + 节点显式声明）
      overrides: collectOverridableNodes(r.workflow_json),
      lastRun,
    };
  });
  res.json({ data });
});

/**
 * 运行前预检的可用资源快照：可用模型 + 已注册工具。
 * 只在「要预检」时才查（dryRun 或正式运行），避免每次列表都扫表。
 */
function preflightResources(userId: string): PreflightContext {
  // **两个口径都要收**：模型有主键 id（agens-guest-agnes-3.0-flash）与 API 名 model_id
  // （agnes-3.0-flash）两个标识，节点历史上两种都存过。运行时的 loadModelRow 也会先按
  // 主键、失败再按 model_id 回退，所以预检必须与它同口径收两个集合 ——
  // 只收 model_id 会导致「画布选的是主键」的工作流被误判拦截（比不预检更糟）。
  const availableModelIds = new Set<string>();
  try {
    for (const m of db.prepare('SELECT id, model_id FROM model WHERE user_id = ?').all(userId) as any[]) {
      if (m?.id) availableModelIds.add(String(m.id));
      if (m?.model_id) availableModelIds.add(String(m.model_id));
    }
  } catch { /* 模型表异常时退化为空集合：预检会报 MODEL_NOT_FOUND，比不报更安全 */ }
  const registeredTools = new Set<string>(getToolRegistry().names());
  // API 工具不走 ToolRegistry（在 executeApiTool 里按名字分发），必须显式并入，
  // 否则 workflow 里合法的 api_image_generate 之类会被预检误判成「工具未注册」而拦死。
  try {
    for (const n of SUPPORTED_API_TOOLS) registeredTools.add(n);
  } catch { /* 导入失败时退化为仅内置工具集 */ }
  return { availableModelIds, registeredTools };
}

/** 组装预检入参：agentId → bundle + 字段定义 */
function preflightFor(agentId: string, userId: string, inputs: Record<string, unknown>): PreflightIssue[] {
  const row = db
    .prepare("SELECT id, name, type, inputs_schema_json, workflow_json FROM agent WHERE id = ?")
    .get(agentId) as any;
  if (!row) return [{ blocking: true, code: 'NO_NODES', msg: `智能体不存在或已被删除: ${agentId}` }];
  if (row.type !== 'workflow') {
    return [{ blocking: true, code: 'NO_NODES', msg: `该智能体不是工作流型（type=${row.type}），无法按工作流运行` }];
  }
  const workflow = (() => { try { return JSON.parse(row.workflow_json || '{}'); } catch { return null; } })();
  const fields = buildWorkflowInputFieldDefs(row);
  return preflightWorkflow(workflow, inputs, fields, preflightResources(userId));
}

/**
 * 会话权限门禁（正式运行 + 调试运行共用）。
 *
 * 为什么手动运行台也要查：工作流模式的会话可以在「只读」权限下运行，
 * 而运行台是**绕过会话主体直接起 DAG** 的 —— 不在这里拦的话，只读会话的用户
 * 点一下就能跑一条写文件的流水线，权限形同虚设。
 * @returns 拒绝原因；通过则 null
 */
function workflowPermissionReason(conversationId: string | undefined, workflowJson: string | null, toolName: string): string | null {
  if (!conversationId) return null; // 无会话归属（纯 API 调用）：不在会话权限语义内
  let mode: PermissionMode = 'default';
  try {
    const conv = db.prepare('SELECT permission_mode FROM conversation WHERE id = ?').get(conversationId) as any;
    if (conv?.permission_mode) mode = normalizePermissionMode(conv.permission_mode);
  } catch { /* 取不到就按 default（放行），与既有会话行为一致 */ }
  if (mode !== 'readonly') return null;
  const wf = (() => { try { return JSON.parse(workflowJson || '{}'); } catch { return null; } })();
  const verdict = checkWorkflowPermission(mode, wf, toolName);
  return verdict.allowed ? null : (verdict.reason || null);
}

// POST /preflight —— 运行前预检（dryRun）：把确定性错误提前列出来，不启动运行
// 设计意图：工作流最容易的失败是「跑到第 N 个节点才报模型不存在」，用户等了半天。
// 这个接口让 UI 在点运行前就能提示，或让用户先看一下将要发生什么。
router.post('/preflight', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body || {};
  const inputs = (body.inputs as Record<string, unknown>) || {};
  if (!body.agentId) { res.status(400).json({ error: '缺少 agentId' }); return; }
  try {
    const issues = preflightFor(String(body.agentId), userId, inputs);
    res.json({ data: { issues, canStart: canStart(issues) } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '预检失败' });
  }
});

router.post('/run', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body || {};
  const inputs = (body.inputs as Record<string, unknown>) || {};
  // 节点参数覆盖：只生效于节点 config.runtimeOverridable 白名单内的键（引擎侧二次过滤）
  const nodeOverrides = (body.nodeOverrides as Record<string, Record<string, unknown>>) || undefined;
  const conversationId = body.conversationId ? String(body.conversationId) : undefined;

  // 会话只读权限门禁：运行台绕过会话主体直接起 DAG，必须在这里拦
  if (body.agentId && !body.agent) {
    const row = db
      .prepare('SELECT workflow_json FROM agent WHERE id = ?')
      .get(String(body.agentId)) as any;
    const deny = workflowPermissionReason(conversationId, row?.workflow_json ?? null, `wf_${body.agentId}`);
    if (deny) { res.status(403).json({ error: deny }); return; }
  }

  // 预检闸门：blocking 项直接拒绝启动，并把问题列全（一次说完，不要挤牙膏）。
  // 强制覆盖（force=true）留给「我知道有问题但要试」的场景，例如模型刚配好还没刷新。
  if (body.agentId && !body.agent && body.force !== true) {
    const issues = preflightFor(String(body.agentId), userId, inputs);
    if (!canStart(issues)) {
      res.status(400).json({
        error: '运行前检查未通过',
        data: { issues, canStart: false },
      });
      return;
    }
    const warnings = issues.filter((i) => !i.blocking);
    // 非阻断项作为提示回传，前端可展示但不拦
    if (warnings.length) res.locals.preflightWarnings = warnings;
  }

  // 单库收敛：agentId 模式——后端按 id 从 data.db 读 agent 定义 + 递归收集 sub_agent，前端只传 id+inputs。
  // 仍兼容旧「前端带完整 bundle」模式（agentId 缺失时）。
  if (body.agentId && !body.agent) {
    const bundle = resolveBundleFromDb(String(body.agentId));
    if (!bundle) { res.status(404).json({ error: '智能体不存在' }); return; }
    const runId = startWorkflowRun(bundle, inputs, userId, undefined, nodeOverrides);
    res.json({ data: { runId, warnings: res.locals.preflightWarnings || [] } });
    return;
  }

  const bundle = body.agent as WorkflowRunBundle['agent'] | undefined;
  if (!bundle || !bundle.id || !bundle.workflow || !Array.isArray(bundle.workflow.nodes)) {
    res.status(400).json({ error: '缺少工作流定义（agentId 或 agent.workflow）' });
    return;
  }
  const fullBundle: WorkflowRunBundle = { agent: bundle, subAgents: body.subAgents || {} };
  const runId = startWorkflowRun(fullBundle, inputs, userId, undefined, nodeOverrides);
  res.json({ data: { runId, warnings: res.locals.preflightWarnings || [] } });
});

router.get('/runs', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(
    'SELECT id, agent_id, agent_name, status, error, inputs_json, created_at, updated_at FROM workflow_run WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(userId, limit) as any[];
  res.json({ data: rows.map((r) => ({
    id: r.id, agentId: r.agent_id, agentName: r.agent_name,
    status: r.status, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at,
    // 重跑要用：把上次入参原样带回表单
    inputs: (() => { try { return r.inputs_json ? JSON.parse(r.inputs_json) : null; } catch { return null; } })(),
  })) });
});

router.get('/runs/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const runId = req.params.id;
  const run = getWorkflowRun(runId);
  if (run) {
    if (run.userId !== userId) { res.status(404).json({ error: '运行不存在' }); return; }
    res.json({
      data: {
        id: run.id, agentId: run.agentId, status: run.status,
        result: run.result, logs: run.logs, seq: run.seq, error: run.error, createdAt: run.createdAt,
      },
    });
    return;
  }
  // 内存 miss（重启/超时清理）→ 回落 DB
  const row = db.prepare('SELECT * FROM workflow_run WHERE id = ? AND user_id = ?').get(runId, userId) as any;
  if (!row) { res.status(404).json({ error: '运行不存在' }); return; }
  res.json({
    data: {
      id: row.id, agentId: row.agent_id, status: row.status,
      result: (() => { try { return row.result_json ? JSON.parse(row.result_json) : null; } catch { return null; } })(),
      logs: (() => { try { return JSON.parse(row.logs_json || '[]'); } catch { return []; } })(),
      seq: null, error: row.error, createdAt: row.created_at, restored: true,
    },
  });
});

// POST /runs/:id/cancel —— 取消运行（状态置 aborted，不强行 kill 当前这一跳）
router.post('/runs/:id/cancel', (req: Request, res: Response) => {
  const runId = req.params.id;
  const run = getWorkflowRun(runId);
  if (run && run.userId !== (req.user!.userId)) { res.status(404).json({ error: '运行不存在' }); return; }
  const ok = cancelWorkflowRun(runId);
  if (!ok) { res.status(409).json({ error: '运行已结束或不存在（只有进行中/断点暂停的才能取消）' }); return; }
  res.json({ data: { runId, status: 'aborted' } });
});

// ============================================================
// 单节点调试：跑到指定节点 / 单跑一个节点 / 改变量后从某节点继续
// 说明：快照只存内存（随运行 30 分钟生命周期），不落库 —— 调试是临时行为
// ============================================================

// POST /debug/run-to —— 从入口跑到 stopAtNodeId 后暂停，返回各节点输出快照
router.post('/debug/run-to', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body || {};
  const stopAtNodeId = String(body.stopAtNodeId || '');
  if (!stopAtNodeId) { res.status(400).json({ error: '缺少 stopAtNodeId' }); return; }
  const inputs = (body.inputs as Record<string, unknown>) || {};
  const nodeOverrides = (body.nodeOverrides as Record<string, Record<string, unknown>>) || undefined;

  // 调试同样执行真实节点（可能写文件），只读会话一律拒绝
  if (body.agentId) {
    const row = db.prepare('SELECT workflow_json FROM agent WHERE id = ?').get(String(body.agentId)) as any;
    const deny = workflowPermissionReason(body.conversationId ? String(body.conversationId) : undefined, row?.workflow_json ?? null, `wf_${body.agentId}`);
    if (deny) { res.status(403).json({ error: deny }); return; }
  }

  let bundle = body.agent as WorkflowRunBundle['agent'] | undefined;
  if (!bundle && body.agentId) {
    const resolved = resolveBundleFromDb(String(body.agentId));
    if (!resolved) { res.status(404).json({ error: '智能体不存在' }); return; }
    bundle = resolved.agent;
    const subAgents = body.subAgents || resolved.subAgents;
    const full: WorkflowRunBundle = { agent: bundle, subAgents };
    try {
      const out = await debugRunTo(full, inputs, userId, stopAtNodeId, nodeOverrides);
      res.json({ data: out });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || '调试运行失败' });
    }
    return;
  }
  if (!bundle || !bundle.workflow) { res.status(400).json({ error: '缺少工作流定义（agentId 或 agent）' }); return; }
  try {
    const out = await debugRunTo({ agent: bundle, subAgents: body.subAgents || {} }, inputs, userId, stopAtNodeId, nodeOverrides);
    res.json({ data: out });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '调试运行失败' });
  }
});

// POST /debug/node —— 只跑一个节点（用现有快照 + 覆盖值，不重跑上游）
router.post('/debug/node', async (req: Request, res: Response) => {
  const body = req.body || {};
  const runId = String(body.runId || '');
  const nodeId = String(body.nodeId || '');
  if (!runId || !nodeId) { res.status(400).json({ error: '缺少 runId 或 nodeId' }); return; }
  const run = getWorkflowRun(runId);
  if (run && run.userId !== (req.user!.userId)) { res.status(404).json({ error: '运行不存在' }); return; }
  try {
    const out = await debugRunNode(runId, nodeId, body.variableOverrides as Record<string, unknown> | undefined);
    res.json({ data: out });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '单节点运行失败' });
  }
});

// POST /debug/continue —— 改完变量后从某节点继续跑下游
router.post('/debug/continue', async (req: Request, res: Response) => {
  const body = req.body || {};
  const runId = String(body.runId || '');
  const fromNodeId = String(body.fromNodeId || '');
  if (!runId || !fromNodeId) { res.status(400).json({ error: '缺少 runId 或 fromNodeId' }); return; }
  const run = getWorkflowRun(runId);
  if (run && run.userId !== (req.user!.userId)) { res.status(404).json({ error: '运行不存在' }); return; }
  try {
    const out = await debugRunFrom(runId, fromNodeId, body.variableOverrides as Record<string, unknown> | undefined);
    res.json({ data: out });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || '继续运行失败' });
  }
});

router.get('/runs/:id/stream', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const runId = req.params.id;
  const since = parseInt(req.query.since as string) || 0;
  const run = getWorkflowRun(runId);
  if (!run) {
    res.status(404).json({ error: '运行不存在（可能已结束并被清理，请用 GET /runs/:id 回查）' });
    return;
  }
  if (run.userId !== userId) { res.status(404).json({ error: '运行不存在' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 与 llm 任务一致：connected 不进 events 数组、不推进前端游标
  res.write(`data: ${JSON.stringify({ type: 'connected', seq: run.seq, status: run.status })}\n\n`);

  const unsubscribe = subscribeWorkflowRun(runId, since, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => { unsubscribe(); });
});

export default router;
