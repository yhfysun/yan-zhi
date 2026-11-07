import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { validateTaskModel } from '../llm-task-manager.js';
import { getGoal, type GoalCriterion } from '../services/goal-store.js';
import { getGoalTemplate } from '../services/goal-template.js';
import {
  createGoalSchedule,
  deleteGoalSchedule,
  getGoalSchedule,
  listGoalScheduleRuns,
  listGoalSchedules,
  materializeGoalSchedule,
  refreshGoalScheduleScheduler,
  updateGoalSchedule,
} from '../services/goal-schedule.js';

const router = Router();
router.use(authMiddleware);

function ownedConversation(userId: string, conversationId: string): any | null {
  return db.prepare(`
    SELECT id, title, agent_id, platform_id, model_id, space_id
    FROM conversation
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL
  `).get(conversationId, userId) || null;
}

router.get('/', (req: Request, res: Response) => {
  res.json({ data: listGoalSchedules(req.user!.userId) });
});

router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const body = req.body || {};
  const conversationId = String(body.conversationId || '').trim();
  if (!conversationId) {
    res.status(400).json({ error: '缺少 conversationId' });
    return;
  }
  const conversation = ownedConversation(userId, conversationId);
  if (!conversation) {
    res.status(404).json({ error: '会话不存在、已归档或不属于当前用户' });
    return;
  }

  const template = body.templateId ? getGoalTemplate(String(body.templateId)) : null;
  if (body.templateId && (!template || template.userId !== userId)) {
    res.status(404).json({ error: '目标模板不存在' });
    return;
  }
  const sourceGoal = body.goalId ? getGoal(String(body.goalId)) : null;
  if (body.goalId && (!sourceGoal || sourceGoal.userId !== userId)) {
    res.status(404).json({ error: '目标不存在' });
    return;
  }

  const objective = template?.objective
    || sourceGoal?.objective
    || String(body.objective || '').trim();
  if (!objective) {
    res.status(400).json({ error: '缺少目标或 templateId / goalId' });
    return;
  }
  const criteria = (template?.criteria
    || sourceGoal?.criteria
    || (Array.isArray(body.criteria) ? body.criteria : [])) as GoalCriterion[];
  const constraints = template?.constraints
    || sourceGoal?.constraints
    || (Array.isArray(body.constraints) ? body.constraints.map(String) : []);
  const approvalRequired = template?.approvalRequired
    || sourceGoal?.approvalRequired
    || (Array.isArray(body.approvalRequired) ? body.approvalRequired.map(String) : []);
  const agentId = body.agentId !== undefined ? body.agentId : conversation.agent_id;
  const platformId = String(body.platformId ?? conversation.platform_id ?? '');
  const modelId = String(body.modelId ?? conversation.model_id ?? '');
  if (!platformId || !modelId) {
    res.status(400).json({ error: '目标计划需要绑定平台和模型' });
    return;
  }
  const invalidModel = validateTaskModel(userId, platformId, modelId);
  if (invalidModel) {
    res.status(400).json({ error: invalidModel });
    return;
  }

  try {
    const schedule = createGoalSchedule({
      userId,
      name: String(body.name || template?.name || objective.slice(0, 40)),
      sourceConversationId: conversationId,
      templateId: template?.id || null,
      agentId: agentId ? String(agentId) : null,
      platformId,
      modelId,
      spaceId: body.spaceId !== undefined ? body.spaceId : conversation.space_id,
      objective,
      criteria,
      constraints,
      approvalRequired,
      maxBatches: template?.maxBatches ?? sourceGoal?.maxBatches ?? body.maxBatches,
      maxStallBatches: template?.maxStallBatches ?? sourceGoal?.maxStallBatches ?? body.maxStallBatches,
      intervalMinutes: body.intervalMinutes,
      cronExpr: body.cronExpr,
      enabled: body.enabled,
    });
    refreshGoalScheduleScheduler();
    res.json({ data: schedule });
  } catch (error: any) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const existing = getGoalSchedule(req.params.id);
  if (!existing || existing.userId !== userId) {
    res.status(404).json({ error: '目标计划不存在' });
    return;
  }
  const body = req.body || {};
  const platformId = String(body.platformId ?? existing.platformId);
  const modelId = String(body.modelId ?? existing.modelId);
  const invalidModel = validateTaskModel(userId, platformId, modelId);
  if (invalidModel) {
    res.status(400).json({ error: invalidModel });
    return;
  }
  try {
    const updated = updateGoalSchedule(req.params.id, userId, {
      name: body.name,
      agentId: body.agentId,
      platformId,
      modelId,
      intervalMinutes: body.intervalMinutes,
      cronExpr: body.cronExpr,
      enabled: body.enabled,
    });
    refreshGoalScheduleScheduler();
    res.json({ data: updated });
  } catch (error: any) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  const removed = deleteGoalSchedule(req.params.id, req.user!.userId);
  refreshGoalScheduleScheduler();
  res.status(removed ? 200 : 404).json(removed ? { ok: true } : { error: '目标计划不存在' });
});

router.post('/:id/run', (req: Request, res: Response) => {
  const schedule = getGoalSchedule(req.params.id);
  if (!schedule || schedule.userId !== req.user!.userId) {
    res.status(404).json({ error: '目标计划不存在' });
    return;
  }
  try {
    const result = materializeGoalSchedule(schedule.id, Date.now(), {
      manual: true,
      wake: true,
    });
    if (result.run.status === 'failed') {
      res.status(500).json({ error: result.run.error || '目标创建失败', data: result.run });
      return;
    }
    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get('/:id/runs', (req: Request, res: Response) => {
  const schedule = getGoalSchedule(req.params.id);
  if (!schedule || schedule.userId !== req.user!.userId) {
    res.status(404).json({ error: '目标计划不存在' });
    return;
  }
  res.json({ data: listGoalScheduleRuns(schedule.id, req.user!.userId, Number(req.query.limit) || 100) });
});

export default router;
