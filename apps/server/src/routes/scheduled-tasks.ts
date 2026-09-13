import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../auth.js';
import { db } from '../db.js';
import { computeNextRun, nextCronTime, runScheduledTask, refreshScheduledTaskScheduler, parseSchedule } from '../services/scheduled-tasks.js';

const router = Router();
router.use(authMiddleware);

function rowToTask(r: any) {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    cronExpr: r.cron_expr,
    intervalMinutes: r.interval_minutes,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    platformId: r.platform_id,
    modelId: r.model_id,
    spaceId: r.space_id,
    groupId: r.group_id,
    schedule: parseSchedule(r.schedule_json),
    expireAt: r.expire_at ?? null,
    enabled: !!r.enabled,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 校验调度配置：interval 优先，其次 cron（5 字段分钟粒度）；返回错误信息或 null */
function validateSchedule(intervalMinutes?: number | null, cronExpr?: string | null, schedule?: unknown): string | null {
  if (schedule) return null;
  if (intervalMinutes && intervalMinutes > 0) return null;
  if (cronExpr && cronExpr.trim()) {
    return nextCronTime(cronExpr, Date.now()) === null ? 'cron 表达式无效（应为 5 字段分钟粒度，如 "30 9 * * *"）' : null;
  }
  return '请设置定时方式';
}

/** 校验会话归属（不属于当前用户时返回 null） */
function ownConversationId(userId: string, conversationId?: string | null): string | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(conversationId, userId);
  return conv ? conversationId : null;
}

// GET /api/scheduled-tasks —— 任务列表
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare('SELECT * FROM scheduled_task WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json({ data: rows.map(rowToTask) });
});

// POST /api/scheduled-tasks —— 创建任务
router.post('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, prompt, cronExpr, intervalMinutes, conversationId, agentId, platformId, modelId, spaceId, groupId, schedule, expireAt, enabled } = req.body || {};
  if (!name || !String(name).trim()) { res.status(400).json({ error: '任务名称为必填项' }); return; }
  const scheduleError = validateSchedule(intervalMinutes, cronExpr, schedule);
  if (scheduleError) { res.status(400).json({ error: scheduleError }); return; }

  const id = uuid();
  const now = Date.now();
  const isEnabled = enabled === undefined ? true : !!enabled;
  const scheduleJson = schedule ? JSON.stringify(schedule) : null;
  db.prepare(
    'INSERT INTO scheduled_task (id, user_id, name, prompt, cron_expr, interval_minutes, conversation_id, agent_id, platform_id, model_id, space_id, group_id, schedule_json, expire_at, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
  ).run(
    id, userId, String(name).trim(), prompt || null, cronExpr || null, intervalMinutes || null,
    ownConversationId(userId, conversationId), agentId || null, platformId || null, modelId || null, spaceId || null, groupId || null,
    scheduleJson, expireAt || null,
    isEnabled ? 1 : 0,
    isEnabled ? computeNextRun({ interval_minutes: intervalMinutes, cron_expr: cronExpr, schedule_json: scheduleJson, expire_at: expireAt || null }, now) : null,
    now, now,
  );
  const row = db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id);
  refreshScheduledTaskScheduler();
  res.json({ data: rowToTask(row) });
});

// PATCH /api/scheduled-tasks/:id —— 更新任务（含启用/停用）
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(id, userId) as any;
  if (!existing) { res.status(404).json({ error: '任务不存在' }); return; }

  const body = req.body || {};
  const intervalMinutes = body.intervalMinutes !== undefined ? body.intervalMinutes : existing.interval_minutes;
  const cronExpr = body.cronExpr !== undefined ? body.cronExpr : existing.cron_expr;
  const scheduleBody = body.schedule !== undefined ? body.schedule : parseSchedule(existing.schedule_json);
  const scheduleError = validateSchedule(intervalMinutes, cronExpr, scheduleBody);
  if (scheduleError) { res.status(400).json({ error: scheduleError }); return; }

  const sets: string[] = [];
  const vals: any[] = [];
  if (body.name !== undefined) {
    if (!String(body.name).trim()) { res.status(400).json({ error: '任务名称不能为空' }); return; }
    sets.push('name = ?'); vals.push(String(body.name).trim());
  }
  if (body.prompt !== undefined) { sets.push('prompt = ?'); vals.push(body.prompt || null); }
  if (body.cronExpr !== undefined) { sets.push('cron_expr = ?'); vals.push(body.cronExpr || null); }
  if (body.intervalMinutes !== undefined) { sets.push('interval_minutes = ?'); vals.push(body.intervalMinutes || null); }
  if (body.conversationId !== undefined) {
    sets.push('conversation_id = ?'); vals.push(ownConversationId(userId, body.conversationId));
  }
  if (body.agentId !== undefined) { sets.push('agent_id = ?'); vals.push(body.agentId || null); }
  if (body.platformId !== undefined) { sets.push('platform_id = ?'); vals.push(body.platformId || null); }
  if (body.modelId !== undefined) { sets.push('model_id = ?'); vals.push(body.modelId || null); }
  if (body.spaceId !== undefined) { sets.push('space_id = ?'); vals.push(body.spaceId || null); }
  if (body.groupId !== undefined) { sets.push('group_id = ?'); vals.push(body.groupId || null); }
  if (body.schedule !== undefined) { sets.push('schedule_json = ?'); vals.push(body.schedule ? JSON.stringify(body.schedule) : null); }
  if (body.expireAt !== undefined) { sets.push('expire_at = ?'); vals.push(body.expireAt || null); }
  if (body.enabled !== undefined) { sets.push('enabled = ?'); vals.push(body.enabled ? 1 : 0); }
  if (sets.length === 0) { res.json({ data: rowToTask(existing) }); return; }

  // 停用清空 next_run_at；调度配置变化或重新启用时从现在起重算
  const willEnable = body.enabled !== undefined ? !!body.enabled : !!existing.enabled;
  const newScheduleJson = body.schedule !== undefined ? (body.schedule ? JSON.stringify(body.schedule) : null) : existing.schedule_json;
  const newExpireAt = body.expireAt !== undefined ? (body.expireAt || null) : existing.expire_at;
  const scheduleChanged =
    (body.cronExpr !== undefined && body.cronExpr !== existing.cron_expr) ||
    (body.intervalMinutes !== undefined && body.intervalMinutes !== existing.interval_minutes) ||
    (body.schedule !== undefined && newScheduleJson !== (existing.schedule_json || null)) ||
    (body.expireAt !== undefined && newExpireAt !== (existing.expire_at || null));
  if (!willEnable) {
    sets.push('next_run_at = NULL');
  } else if (scheduleChanged || (body.enabled !== undefined && willEnable && !existing.enabled)) {
    sets.push('next_run_at = ?'); vals.push(computeNextRun({ interval_minutes: intervalMinutes, cron_expr: cronExpr, schedule_json: newScheduleJson, expire_at: newExpireAt }, Date.now()));
  }
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE scheduled_task SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id);
  refreshScheduledTaskScheduler();
  res.json({ data: rowToTask(row) });
});

// DELETE /api/scheduled-tasks/:id —— 删除任务（不影响已产生的会话）
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) { res.status(404).json({ error: '任务不存在' }); return; }
  db.prepare('DELETE FROM scheduled_task WHERE id = ?').run(id);
  refreshScheduledTaskScheduler();
  res.json({ ok: true });
});

// POST /api/scheduled-tasks/:id/run —— 立即运行一次
router.post('/:id/run', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const task = db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!task) { res.status(404).json({ error: '任务不存在' }); return; }
  try {
    const result = await runScheduledTask(task);
    if (!result.ok) {
      res.status(500).json({ error: result.error || '任务执行失败', conversationId: result.conversationId });
      return;
    }
    const row = db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(task.id);
    res.json({ data: { ...rowToTask(row), conversationId: result.conversationId } });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : '任务执行失败' });
  }
});

// ===== 定时任务分组 =====
// GET /api/scheduled-tasks/groups —— 分组列表
router.get('/groups', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const rows = db.prepare('SELECT * FROM scheduled_task_group WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC').all(userId);
  res.json({ data: rows });
});

// POST /api/scheduled-tasks/groups —— 创建分组
router.post('/groups', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name } = req.body || {};
  if (!name || !String(name).trim()) { res.status(400).json({ error: '分组名称为必填项' }); return; }
  const id = uuid();
  const now = Date.now();
  const maxOrder = (db.prepare('SELECT MAX(sort_order) AS m FROM scheduled_task_group WHERE user_id = ?').get(userId) as any)?.m ?? 0;
  db.prepare('INSERT INTO scheduled_task_group (id, user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, String(name).trim(), maxOrder + 1, now, now);
  const row = db.prepare('SELECT * FROM scheduled_task_group WHERE id = ?').get(id);
  res.json({ data: row });
});

// PATCH /api/scheduled-tasks/groups/:id —— 重命名分组
router.patch('/groups/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM scheduled_task_group WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) { res.status(404).json({ error: '分组不存在' }); return; }
  const { name } = req.body || {};
  if (!name || !String(name).trim()) { res.status(400).json({ error: '分组名称不能为空' }); return; }
  db.prepare('UPDATE scheduled_task_group SET name = ?, updated_at = ? WHERE id = ?').run(String(name).trim(), Date.now(), id);
  const row = db.prepare('SELECT * FROM scheduled_task_group WHERE id = ?').get(id);
  res.json({ data: row });
});

// DELETE /api/scheduled-tasks/groups/:id —— 删除分组（组内任务移至未分组）
router.delete('/groups/:id', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM scheduled_task_group WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) { res.status(404).json({ error: '分组不存在' }); return; }
  db.prepare('UPDATE scheduled_task SET group_id = NULL WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_task_group WHERE id = ?').run(id);
  refreshScheduledTaskScheduler();
  res.json({ ok: true });
});

export default router;
