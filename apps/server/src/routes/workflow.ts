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
} from '../workflow-runner.js';
import type { WorkflowRunBundle } from '../workflow-runner.js';

const router = Router();
router.use(authMiddleware);

router.post('/run', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body || {};
  const inputs = (body.inputs as Record<string, unknown>) || {};

  // 单库收敛：agentId 模式——后端按 id 从 data.db 读 agent 定义 + 递归收集 sub_agent，前端只传 id+inputs。
  // 仍兼容旧「前端带完整 bundle」模式（agentId 缺失时）。
  if (body.agentId && !body.agent) {
    const bundle = resolveBundleFromDb(String(body.agentId));
    if (!bundle) { res.status(404).json({ error: '智能体不存在' }); return; }
    const runId = startWorkflowRun(bundle, inputs, userId);
    res.json({ data: { runId } });
    return;
  }

  const bundle = body.agent as WorkflowRunBundle['agent'] | undefined;
  if (!bundle || !bundle.id || !bundle.workflow || !Array.isArray(bundle.workflow.nodes)) {
    res.status(400).json({ error: '缺少工作流定义（agentId 或 agent.workflow）' });
    return;
  }
  const fullBundle: WorkflowRunBundle = { agent: bundle, subAgents: body.subAgents || {} };
  const runId = startWorkflowRun(fullBundle, inputs, userId);
  res.json({ data: { runId } });
});

router.get('/runs', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare(
    'SELECT id, agent_id, agent_name, status, error, created_at, updated_at FROM workflow_run WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(userId, limit) as any[];
  res.json({ data: rows.map((r) => ({
    id: r.id, agentId: r.agent_id, agentName: r.agent_name,
    status: r.status, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at,
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
