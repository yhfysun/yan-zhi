// LLM 任务 SSE 路由 —— 前端通过此路由创建任务、订阅事件流、终止任务
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { sseStream } from '../services/sse.js';
import {
  createTask, subscribe, subscribeConversation, abortTask, pauseTask, resumeTask, getActiveTasks, getTask, getTaskRow, getLatestTaskRowForConversation, resolveToolResult, injectUserMessage, findRunningTaskId, validateTaskModel,
} from '../llm-task-manager.js';
import type { OpsContextInput } from '../ops-context.js';
import {
  approveGoal,
  cancelGoal,
  createAndStartGoal,
  pauseGoal,
  resolveGoalOperationAndResume,
  resumeGoal,
} from '../services/goal-runner.js';
import { listGoalOperations } from '../services/goal-operation.js';
import {
  createGoalTemplate,
  deleteGoalTemplate,
  getGoalTemplate,
  listGoalTemplates,
} from '../services/goal-template.js';
import {
  findGoalTrigger,
  listGoalTriggers,
  saveGoalTrigger,
} from '../services/goal-trigger.js';
import {
  getActiveGoalForConversation,
  getGoal,
  getLatestGoalForConversation,
  listGoalBatches,
  listGoalEvents,
} from '../services/goal-store.js';

const router = Router();
router.use(authMiddleware);

/**
 * 运维现场入参白名单化（2026-10-21）。
 *
 * 这个字段的内容最终会进入**系统提示词**，所以不能原样透传：
 * 只取约定字段，字符串长度封顶。前端只该传 id + 终端尾部文本，
 * 连接名/主机等详情由服务端按 id 回查（防伪造、防改名后残留旧值）。
 */
function normalizeOpsContext(raw: unknown): OpsContextInput | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined;
  const out: OpsContextInput = {};
  if (typeof o.connectionId === 'string' || o.connectionId === null) {
    out.connectionId = o.connectionId === null ? null : String(o.connectionId).slice(0, 128);
  }
  if (Array.isArray(o.recentCommands)) {
    out.recentCommands = o.recentCommands
      .filter((c): c is string => typeof c === 'string')
      .slice(-6)
      .map((c) => c.slice(0, 2000));
  }
  const tail = str(o.terminalTail, 8000);
  if (tail) out.terminalTail = tail;
  const rp = str(o.releaseProjectId, 128);
  if (rp) out.releaseProjectId = rp;
  return Object.keys(out).length ? out : undefined;
}

// POST /api/llm/tasks  创建任务
router.post('/tasks', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { conversationId, platformId, modelId, userContent, agentId, appGuide, systemPrompt, tools, options, modeFlags, maxSteps, memoryExtractPlatformId, memoryExtractModelId, ontologyIds, workspaceDir, pathGuard, toolEnv: toolEnvRaw, opsContext, modeSwitch } = req.body || {};
  if (!conversationId || !platformId || !modelId) {
    res.status(400).json({ error: '缺少 conversationId/platformId/modelId' });
    return;
  }
  // systemPrompt/tools 为历史兼容字段；新前端只传 agentId/appGuide，由后端统一构建（含会话级挂载）
  // modeFlags：输入框「+」菜单模式开关（深度思考/计划/仅回答），后端统一追加指令与裁剪工具
  // memoryExtractPlatformId/ModelId：前端设置页下发的记忆抽取模型（任务完成后抽取/压缩前抢救用）
  // includeUiTools: true —— 此路由只服务前端在线的交互式任务，UI 工具（ask_user 等）纳入工具列表并委托前端执行
  // ontologyIds：前端随任务下发的智能体本体挂载（智能体编辑存本地库，server 库不持有，须显式传递）
  const activeGoal = getActiveGoalForConversation(String(conversationId));
  if (activeGoal) {
    res.status(409).json({
      error: '该会话有活动目标，请先完成、暂停或结束目标',
      code: 'GOAL_ACTIVE',
      data: activeGoal,
    });
    return;
  }
    // ★ 复用保护（2026-10-07）：同会话已有运行中任务时，新消息走「注入」而不是静默吞掉——
  // 追问/换要求立即落库并推送 message:added（前端可见），任务在下一轮 LLM 调用时读到（pendingInjects）。
  // 此前行为：createTask 幂等返回旧 taskId，前端重新订阅旧流 → 用户新要求人间蒸发，看起来像「不回」。
  const runningId = findRunningTaskId(conversationId, userId);
  if (runningId) {
    const inj = userContent ? injectUserMessage(conversationId, String(userContent), userId) : { status: 'no-task' as const };
    res.json({ data: { taskId: runningId, reused: true, injected: inj.status === 'injected', injectedMsgId: inj.msgId } });
    return;
  }
  // 会话内切模型（运维台 P0）：先校验组合再建任务。非法值不静默回落 ——
  // 否则用户会以为切成功了，实际跑的是另一个模型。注入到运行中任务的路径不校验：
  // 那条路径根本不使用 modelId，模型中途被删不该连带挡住追加消息。
  const modelInvalid = validateTaskModel(userId, String(platformId), String(modelId));
  if (modelInvalid) {
    res.status(400).json({ error: modelInvalid });
    return;
  }
  let taskId: string;
  // 任务级工具环境变量（2026-10-23）：页面设置（如小说推文 TTS 并发）随任务下发。
  // ★ 白名单化：只收 YZ_* 且值为 0–64 的整数，防止调用方往子进程 env 里塞任意东西。
  const toolEnv: Record<string, string> = {};
  if (toolEnvRaw && typeof toolEnvRaw === 'object') {
    for (const [k, v] of Object.entries(toolEnvRaw as Record<string, unknown>)) {
      if (!/^YZ_[A-Z0-9_]{1,40}$/.test(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 64) toolEnv[k] = String(Math.round(n));
    }
  }
  try {
    taskId = createTask({ conversationId, userId, platformId, modelId, userContent, agentId: agentId ?? null, appGuide, systemPrompt, tools, options, modeFlags, maxSteps, memoryExtractPlatformId, memoryExtractModelId, ontologyIds: Array.isArray(ontologyIds) ? ontologyIds.map(String) : undefined, includeUiTools: true, workspaceDir: typeof workspaceDir === 'string' ? workspaceDir : undefined,
      // 越界守卫档位（2026-10-01）：与 workspaceDir 同一条下发通道（同一份设置来源）
      pathGuard: (pathGuard === 'strict' || pathGuard === 'off' || pathGuard === 'ask') ? pathGuard : undefined,
      toolEnv: Object.keys(toolEnv).length ? toolEnv : undefined,
      // 运维现场（2026-10-21）：薄描述，服务端回查详情后注入系统提示词。
      // ★ 白名单化 —— 只接受约定字段，防止调用方往系统提示词里塞任意内容。
      opsContext: normalizeOpsContext(opsContext),
      // 模式切换（four-mode 2b.5）：白名单化，只接受 from/to 与可选标签
      modeSwitch: modeSwitch && typeof modeSwitch === 'object'
        && typeof modeSwitch.from === 'string' && typeof modeSwitch.to === 'string'
        ? {
            from: modeSwitch.from.slice(0, 32),
            to: modeSwitch.to.slice(0, 32),
            fromLabel: typeof modeSwitch.fromLabel === 'string' ? modeSwitch.fromLabel : undefined,
            toLabel: typeof modeSwitch.toLabel === 'string' ? modeSwitch.toLabel : undefined,
          }
        : undefined,
    });
  } catch (e: any) {
    // 会话被归档/删除/不存在时不给 500：前端要靠这个状态码给出「去恢复」的入口
    // （报 500 的话前端只会显示"网络错误"，用户完全不知道去哪找回会话）。
    const msg = String(e?.message || '');
    if (msg.startsWith('CONVERSATION_TRASHED')) { res.status(409).json({ error: '会话已在回收站，请先从回收站恢复', code: 'CONVERSATION_TRASHED' }); return; }
    if (msg.startsWith('CONVERSATION_ARCHIVED')) { res.status(409).json({ error: '会话已归档，请先恢复归档会话', code: 'CONVERSATION_ARCHIVED' }); return; }
    if (msg.startsWith('CONVERSATION_NOT_FOUND')) { res.status(404).json({ error: '会话不存在', code: 'CONVERSATION_NOT_FOUND' }); return; }
    if (msg.includes('额度')) { res.status(402).json({ error: msg, code: 'QUOTA_EXCEEDED' }); return; }
    throw e;
  }
  res.json({ data: { taskId } });
});

// ===== 目标模式 =====
// 目标跨批次、跨重启持续运行；llm_task 只承载其中一批执行。
router.post('/goals', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const {
    conversationId, agentId, platformId, modelId, objective, criteria,
    constraints, approvalRequired, maxBatches, maxStallBatches,
  } = req.body || {};
  if (!conversationId || !String(objective || '').trim() || !platformId || !modelId) {
    res.status(400).json({ error: '缺少 conversationId / objective / platformId / modelId' });
    return;
  }
  const conv = db.prepare(
    'SELECT id FROM conversation WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
  ).get(conversationId, userId) as { id?: string } | undefined;
  if (!conv) {
    res.status(404).json({ error: '会话不存在、已归档或不属于当前用户' });
    return;
  }
  const existing = getActiveGoalForConversation(String(conversationId));
  if (existing) {
    res.status(409).json({ error: '该会话已有活动目标', data: existing });
    return;
  }
  const runningTask = findRunningTaskId(String(conversationId), userId);
  if (runningTask) {
    res.status(409).json({ error: '该会话已有任务在运行，请等待结束或先停止', data: { taskId: runningTask } });
    return;
  }
  const invalid = validateTaskModel(userId, String(platformId), String(modelId));
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  try {
    const goal = createAndStartGoal({
      userId,
      conversationId: String(conversationId),
      agentId: agentId ? String(agentId) : null,
      platformId: platformId ? String(platformId) : null,
      modelId: modelId ? String(modelId) : null,
      objective: String(objective),
      criteria: Array.isArray(criteria) ? criteria : [],
      constraints: Array.isArray(constraints) ? constraints.map(String) : [],
      approvalRequired: Array.isArray(approvalRequired) ? approvalRequired.map(String) : [],
      maxBatches,
      maxStallBatches,
    });
    res.json({ data: goal });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.get('/goals', (req: Request, res: Response) => {
  const conversationId = String(req.query.conversationId || '');
  if (!conversationId) {
    res.status(400).json({ error: '缺少 conversationId' });
    return;
  }
  const goal = getLatestGoalForConversation(conversationId);
  res.json({ data: goal });
});

router.get('/goals/:id', (req: Request, res: Response) => {
  const goal = getGoal(req.params.id);
  if (!goal || goal.userId !== req.user!.userId) {
    res.status(404).json({ error: '目标不存在' });
    return;
  }
  res.json({
    data: {
      ...goal,
      batches: listGoalBatches(goal.id),
      events: listGoalEvents(goal.id),
      operations: listGoalOperations(goal.id),
    },
  });
});

router.post('/goals/:id/operations/:key/resolve', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    const outcome = req.body?.outcome === 'not_done' ? 'not_done' : req.body?.outcome === 'done' ? 'done' : null;
    if (!outcome) {
      res.status(400).json({ error: 'outcome 必须是 done 或 not_done' });
      return;
    }
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 2_000) : '';
    const externalRef = typeof req.body?.externalRef === 'string' ? req.body.externalRef.slice(0, 1_000) : null;
    res.json({
      data: resolveGoalOperationAndResume(
        req.params.id,
        req.params.key,
        outcome,
        note,
        req.user!.userId,
        externalRef,
      ),
    });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
});

router.post('/goals/:id/pause', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    res.json({ data: pauseGoal(req.params.id) });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
});

router.post('/goals/:id/resume', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    res.json({ data: resumeGoal(req.params.id) });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
});

router.post('/goals/:id/cancel', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    res.json({ data: cancelGoal(req.params.id, typeof req.body?.reason === 'string' ? req.body.reason : undefined) });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
});

router.post('/goals/:id/template', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name
      : goal.objective.slice(0, 40);
    res.json({ data: createGoalTemplate(goal.id, req.user!.userId, name) });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
});

router.get('/goal-templates', (req: Request, res: Response) => {
  res.json({ data: listGoalTemplates(req.user!.userId) });
});

router.delete('/goal-templates/:id', (req: Request, res: Response) => {
  const removed = deleteGoalTemplate(req.params.id, req.user!.userId);
  res.status(removed ? 200 : 404).json(removed ? { ok: true } : { error: '模板不存在' });
});

router.post('/goal-templates/:id/start', (req: Request, res: Response) => {
  const template = getGoalTemplate(req.params.id);
  if (!template || template.userId !== req.user!.userId) {
    res.status(404).json({ error: '模板不存在' });
    return;
  }
  const { conversationId, platformId, modelId, agentId } = req.body || {};
  if (!conversationId || !platformId || !modelId) {
    res.status(400).json({ error: '缺少 conversationId / platformId / modelId' });
    return;
  }
  const conv = db.prepare(
    'SELECT id FROM conversation WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
  ).get(String(conversationId), req.user!.userId) as { id?: string } | undefined;
  if (!conv) {
    res.status(404).json({ error: '会话不存在、已归档或不属于当前用户' });
    return;
  }
  const active = getActiveGoalForConversation(String(conversationId));
  if (active) {
    res.status(409).json({ error: '该会话已有活动目标', data: active });
    return;
  }
  const invalid = validateTaskModel(req.user!.userId, String(platformId), String(modelId));
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  try {
    const goal = createAndStartGoal({
      userId: req.user!.userId,
      conversationId: String(conversationId),
      agentId: agentId ? String(agentId) : null,
      platformId: String(platformId),
      modelId: String(modelId),
      objective: template.objective,
      criteria: template.criteria,
      constraints: template.constraints,
      approvalRequired: template.approvalRequired,
      maxBatches: template.maxBatches,
      maxStallBatches: template.maxStallBatches,
    });
    res.json({ data: { goal, templateId: template.id } });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.post('/goals/events', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const {
    source, eventId, conversationId, objective, platformId, modelId, agentId,
    criteria, constraints, approvalRequired, maxBatches, maxStallBatches, payload,
  } = req.body || {};
  const cleanSource = String(source || '').trim().slice(0, 120);
  const cleanEventId = String(eventId || '').trim().slice(0, 300);
  if (!cleanSource || !cleanEventId || !conversationId || !String(objective || '').trim() || !platformId || !modelId) {
    res.status(400).json({ error: '缺少 source / eventId / conversationId / objective / platformId / modelId' });
    return;
  }
  const duplicate = findGoalTrigger(userId, cleanSource, cleanEventId);
  if (duplicate) {
    res.json({ data: { goal: getGoal(duplicate.goalId), trigger: duplicate, duplicate: true } });
    return;
  }
  const conv = db.prepare(
    'SELECT id FROM conversation WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
  ).get(String(conversationId), userId) as { id?: string } | undefined;
  if (!conv) {
    res.status(404).json({ error: '会话不存在、已归档或不属于当前用户' });
    return;
  }
  const active = getActiveGoalForConversation(String(conversationId));
  if (active) {
    res.status(409).json({ error: '该会话已有活动目标', data: active });
    return;
  }
  const invalid = validateTaskModel(userId, String(platformId), String(modelId));
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }
  let goal: ReturnType<typeof createAndStartGoal> | null = null;
  try {
    goal = createAndStartGoal({
      userId,
      conversationId: String(conversationId),
      agentId: agentId ? String(agentId) : null,
      platformId: String(platformId),
      modelId: String(modelId),
      objective: String(objective),
      criteria: Array.isArray(criteria) ? criteria : [],
      constraints: Array.isArray(constraints) ? constraints.map(String) : [],
      approvalRequired: Array.isArray(approvalRequired) ? approvalRequired.map(String) : [],
      maxBatches,
      maxStallBatches,
    });
    const trigger = saveGoalTrigger({
      userId,
      source: cleanSource,
      eventId: cleanEventId,
      goalId: goal.id,
      payload,
    });
    res.json({ data: { goal, trigger, duplicate: false } });
  } catch (e: any) {
    if (goal && String(e?.message || '').includes('已处理过')) {
      cancelGoal(goal.id, '重复事件触发，已取消重复目标');
      const existing = findGoalTrigger(userId, cleanSource, cleanEventId);
      res.json({ data: { goal: existing ? getGoal(existing.goalId) : null, trigger: existing, duplicate: true } });
      return;
    }
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.get('/goal-trigger-events', (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  res.json({ data: listGoalTriggers(req.user!.userId, limit) });
});

router.post('/goals/:id/approve', (req: Request, res: Response) => {
  try {
    const goal = getGoal(req.params.id);
    if (!goal || goal.userId !== req.user!.userId) {
      res.status(404).json({ error: '目标不存在' });
      return;
    }
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 2_000) : '';
    res.json({ data: approveGoal(req.params.id, note) });
  } catch (e: any) {
    res.status(409).json({ error: String(e?.message || e) });
  }
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

  // 先发送连接成功事件（seq = 当前游标，前端以此初始化 since），再重放 seq > since 的事件 + 订阅后续事件。
  // 注意：connected 不进 task.events 数组，前端也不要为它累加游标，否则会漏事件。
  // header/connected/订阅/退订收口在 services/sse.ts（P5）
  sseStream(req, res, {
    connected: { seq: task.seq, eventCount: task.events.length },
    subscribe: (onEvent) => subscribe(taskId, since, onEvent),
  });
});

// GET /api/llm/conversations/:id/stream  订阅「会话级」事件流（与任务无关）
//
// ★★★ 为什么必须补这条（2026-10-08）：会话级通知总线（subscribeConversation /
//   emitConversation）在 2026-09-17 就建好了，注释写明"作为后续通知类能力的公共底座"，
//   但**全仓库只有定义、零调用** —— 没有路由出口，前端无从订阅。后果：
//     · 长任务（后台子智能体 pageAgent / 工作流）跑完的反写事件**推不出去**；
//     · 用户必须**手动刷新**才能在对话里看到结果（正是"异步没弄好"的观感来源）。
//   与任务级 SSE 的关系：任务在跑 → 事件走任务流（前端已订阅）；任务收尾后 → 走本流。
//   两者共用 services/sse.ts 的统一出口（心跳/退订/帧格式同源，改协议不会漂）。
//
// ★ 注册顺序：必须在 `/tasks/:id/stream` 之外单独一条路径，不能挂成 `/tasks/:id/...`
//   的子路径 —— 会话 id 与任务 id 是两种 id，混在一起会让 404 语义变模糊。
router.get('/conversations/:id/stream', (req: Request, res: Response) => {
  const conversationId = req.params.id;
  sseStream(req, res, {
    connected: { conversationId },
    subscribe: (onEvent) => subscribeConversation(conversationId, onEvent),
  });
});

// POST /api/llm/tasks/:id/abort  终止任务
router.post('/tasks/:id/abort', (req: Request, res: Response) => {
  const taskId = req.params.id;
  abortTask(taskId);
  res.json({ ok: true });
});

// POST /api/llm/tasks/:id/pause  暂停任务（工具边界暂停：当前动作跑完即挂起）
router.post('/tasks/:id/pause', (req: Request, res: Response) => {
  const taskId = req.params.id;
  const ok = pauseTask(taskId);
  if (!ok) {
    const task = getTask(taskId);
    res.status(task ? 409 : 404).json({ error: task ? '任务不在 running 状态，无法暂停' : '任务不存在' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/llm/tasks/:id/resume  恢复暂停中的任务
router.post('/tasks/:id/resume', (req: Request, res: Response) => {
  const taskId = req.params.id;
  const ok = resumeTask(taskId);
  if (!ok) {
    const task = getTask(taskId);
    res.status(task ? 409 : 404).json({ error: task ? '任务未处于暂停态' : '任务不存在' });
    return;
  }
  res.json({ ok: true });
});

// POST /api/llm/tasks/inject  运行中追加用户消息（输入框「立即发送」）
// 语义：消息立即落库并推送可见，模型在下一轮 LLM 调用时带上（不等整个任务结束）。
// 无运行中任务时返回 no-task，前端应退回普通发送（起新任务）。
// 注意：必须注册在 /tasks/:id 之前，否则会被 :id 通配吃掉。
router.post('/tasks/inject', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { conversationId, content, clientMsgId } = req.body || {};
  if (!conversationId || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: '缺少 conversationId/content' });
    return;
  }
  // clientMsgId：前端队列条目 id，幂等键（2026-10-09）。同一 id 重复 POST（连点 / 网络重试）
  // 只落一条消息，第二次回 duplicate=true + 同一 msgId。
  const result = injectUserMessage(String(conversationId), content, userId, typeof clientMsgId === 'string' ? clientMsgId : undefined);
  res.json({ data: { status: result.status, msgId: result.msgId, duplicate: !!result.duplicate } });
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

router.get('/conversations/:id/task-status', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const live = getActiveTasks(userId, req.params.id)[0];
  if (live) {
    res.json({ data: live });
    return;
  }
  const row = getLatestTaskRowForConversation(req.params.id, userId);
  res.json({ data: row || null });
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
