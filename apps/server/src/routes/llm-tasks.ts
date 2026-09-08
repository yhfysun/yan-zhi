// LLM 任务 SSE 路由 —— 前端通过此路由创建任务、订阅事件流、终止任务
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createTask, subscribe, abortTask, getActiveTasks, getTask, getTaskRow, resolveToolResult,
} from '../llm-task-manager.js';

const router = Router();
router.use(authMiddleware);

// POST /api/llm/tasks  创建任务
router.post('/tasks', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { conversationId, platformId, modelId, userContent, agentId, appGuide, systemPrompt, tools, options, modeFlags, maxSteps, memoryExtractPlatformId, memoryExtractModelId, ontologyIds } = req.body || {};
  if (!conversationId || !platformId || !modelId) {
    res.status(400).json({ error: '缺少 conversationId/platformId/modelId' });
    return;
  }
  // systemPrompt/tools 为历史兼容字段；新前端只传 agentId/appGuide，由后端统一构建（含会话级挂载）
  // modeFlags：输入框「+」菜单模式开关（深度思考/计划/仅回答），后端统一追加指令与裁剪工具
  // memoryExtractPlatformId/ModelId：前端设置页下发的记忆抽取模型（任务完成后抽取/压缩前抢救用）
  // includeUiTools: true —— 此路由只服务前端在线的交互式任务，UI 工具（ask_user 等）纳入工具列表并委托前端执行
  // ontologyIds：前端随任务下发的智能体本体挂载（智能体编辑存本地库，server 库不持有，须显式传递）
  const taskId = createTask({ conversationId, userId, platformId, modelId, userContent, agentId: agentId ?? null, appGuide, systemPrompt, tools, options, modeFlags, maxSteps, memoryExtractPlatformId, memoryExtractModelId, ontologyIds: Array.isArray(ontologyIds) ? ontologyIds.map(String) : undefined, includeUiTools: true });
  res.json({ data: { taskId } });
});

// GET /api/llm/tasks/:id/stream  订阅 SSE 事件流
router.get('/tasks/:id/stream', (req: Request, res: Response) => {
  const taskId = req.params.id;
  const since = parseInt(req.query.since as string) || 0;
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 先发送连接成功事件（seq = 当前游标，前端以此初始化 since），再重放 seq > since 的事件 + 订阅后续事件。
  // 注意：connected 不进 task.events 数组，前端也不要为它累加游标，否则会漏事件。
  res.write(`data: ${JSON.stringify({ type: 'connected', seq: task.seq, eventCount: task.events.length })}\n\n`);

  const unsubscribe = subscribe(taskId, since, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // 客户端断开时取消订阅
  req.on('close', () => {
    unsubscribe();
  });
});

// POST /api/llm/tasks/:id/abort  终止任务
router.post('/tasks/:id/abort', (req: Request, res: Response) => {
  const taskId = req.params.id;
  abortTask(taskId);
  res.json({ ok: true });
});

// POST /api/llm/tasks/:id/tool-result  前端提交工具执行结果
router.post('/tasks/:id/tool-result', (req: Request, res: Response) => {
  const taskId = req.params.id;
  const { callId, result } = req.body || {};
  if (!callId) {
    res.status(400).json({ error: '缺少 callId' });
    return;
  }
  resolveToolResult(taskId, callId, result || '');
  res.json({ ok: true });
});

// GET /api/llm/tasks/active  获取活动任务
router.get('/tasks/active', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const conversationId = req.query.conversationId as string | undefined;
  const active = getActiveTasks(userId, conversationId);
  res.json({ data: active });
});

// GET /api/llm/tasks/:id  获取任务状态
// 内存中已清理的任务回落到 llm_task 表（server 重启后前端仍能查到"已中断"而不是 404）
router.get('/tasks/:id', (req: Request, res: Response) => {
  const taskId = req.params.id;
  const task = getTask(taskId);
  if (task) {
    res.json({
      data: {
        id: task.id,
        conversationId: task.conversationId,
        status: task.status,
        step: task.step,
        seq: task.seq,
        eventCount: task.events.length,
        pendingTools: [...task.pendingToolCalls.values()].map((p) => p.toolName),
        createdAt: task.createdAt,
        error: task.error,
      },
    });
    return;
  }
  const row = getTaskRow(taskId);
  if (!row) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json({
    data: {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      step: row.step,
      seq: null,
      eventCount: 0,
      pendingTools: (() => { try { return (JSON.parse(row.pending_tool_json || '[]') as any[]).map((p: any) => p.toolName); } catch { return []; } })(),
      createdAt: row.created_at,
      error: row.error,
      restored: true,
    },
  });
});

export default router;