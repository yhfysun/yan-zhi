import { db } from '../db.js';
import { getGoal, listGoalBatches, listGoalEvents, type GoalRun } from './goal-store.js';
import { listGoalOperations, type GoalOperation } from './goal-operation.js';
import { getGoalCostState, type GoalCostState } from './goal-cost.js';

export interface GoalAuditBundle {
  version: 1;
  exportedAt: number;
  goal: GoalRun | null;
  cost: GoalCostState | null;
  batches: ReturnType<typeof listGoalBatches>;
  events: ReturnType<typeof listGoalEvents>;
  operations: GoalOperation[];
  approvals: Array<{
    id: string;
    kind: string;
    title: string;
    detail: unknown;
    status: string;
    answer: unknown;
    requestedAt: number;
    answeredAt: number | null;
  }>;
  triggers: Array<{
    id: string;
    source: string;
    eventId: string;
    payload: unknown;
    createdAt: number;
  }>;
  scheduleRuns: Array<{
    id: string;
    scheduleId: string;
    scheduledFor: number;
    eventId: string;
    status: string;
    error: string | null;
    createdAt: number;
  }>;
  tasks: Array<{
    id: string;
    batchId: string | null;
    status: string;
    step: number;
    error: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function listApprovals(goalId: string): GoalAuditBundle['approvals'] {
  return (db.prepare(`
    SELECT * FROM goal_approval
    WHERE goal_id = ?
    ORDER BY requested_at ASC
  `).all(goalId) as any[]).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    detail: parseJson(row.detail_json, {}),
    status: String(row.status),
    answer: parseJson(row.answer_json, null),
    requestedAt: Number(row.requested_at) || 0,
    answeredAt: row.answered_at == null ? null : Number(row.answered_at),
  }));
}

function listTriggers(goalId: string): GoalAuditBundle['triggers'] {
  return (db.prepare(`
    SELECT * FROM goal_trigger_event
    WHERE goal_id = ?
    ORDER BY created_at ASC
  `).all(goalId) as any[]).map((row) => ({
    id: String(row.id),
    source: String(row.source),
    eventId: String(row.event_id),
    payload: parseJson(row.payload_json, {}),
    createdAt: Number(row.created_at) || 0,
  }));
}

function listScheduleRuns(goalId: string): GoalAuditBundle['scheduleRuns'] {
  return (db.prepare(`
    SELECT * FROM goal_schedule_run
    WHERE goal_id = ?
    ORDER BY scheduled_for ASC
  `).all(goalId) as any[]).map((row) => ({
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    scheduledFor: Number(row.scheduled_for) || 0,
    eventId: String(row.event_id),
    status: String(row.status),
    error: row.error || null,
    createdAt: Number(row.created_at) || 0,
  }));
}

function listTasks(goalId: string): GoalAuditBundle['tasks'] {
  return (db.prepare(`
    SELECT id, goal_batch_id, status, step, error, created_at, updated_at
    FROM llm_task
    WHERE goal_id = ?
    ORDER BY created_at ASC
  `).all(goalId) as any[]).map((row) => ({
    id: String(row.id),
    batchId: row.goal_batch_id || null,
    status: String(row.status),
    step: Number(row.step) || 0,
    error: row.error || null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }));
}

export function buildGoalAudit(goalId: string, userId: string): GoalAuditBundle | null {
  const goal = getGoal(goalId);
  if (!goal || goal.userId !== userId) return null;
  return {
    version: 1,
    exportedAt: Date.now(),
    goal,
    cost: goal ? getGoalCostState(goal) : null,
    batches: listGoalBatches(goalId),
    events: listGoalEvents(goalId),
    operations: listGoalOperations(goalId),
    approvals: listApprovals(goalId),
    triggers: listTriggers(goalId),
    scheduleRuns: listScheduleRuns(goalId),
    tasks: listTasks(goalId),
  };
}

function time(value: number | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toISOString();
}

function code(value: unknown, limit = 1_000): string {
  const raw = JSON.stringify(value ?? null);
  return `\`${raw.length > limit ? `${raw.slice(0, limit)}...` : raw}\``;
}

function cell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function renderGoalAuditMarkdown(audit: GoalAuditBundle): string {
  const goal = audit.goal;
  const lines: string[] = [
    '# 目标审计报告',
    '',
    `- 导出时间：${time(audit.exportedAt)}`,
  ];
  if (!goal) return [...lines, '', '目标不存在。'].join('\n');

  lines.push(
    `- 目标 ID：${goal.id}`,
    `- 会话 ID：${goal.conversationId}`,
    `- 状态：${goal.status}`,
    `- 创建时间：${time(goal.createdAt)}`,
    `- 更新时间：${time(goal.updatedAt)}`,
    `- 完成时间：${time(goal.completedAt)}`,
    `- 目标费用：约 ¥${(audit.cost?.usedCny || 0).toFixed(4)} / ${audit.cost?.limitCny ? `上限 ¥${audit.cost.limitCny.toFixed(4)}` : '不限额'}`,
    '',
    '## 目标',
    '',
    goal.objective,
    '',
    '## 验收标准',
    '',
    ...(goal.criteria.length
      ? goal.criteria.map((item, index) => `${index + 1}. [${item.kind || 'text'}] ${item.title} ${code(item, 500)}`)
      : ['- 无自动验收标准，需人工验收']),
    '',
    '## 约束与审批',
    '',
    ...(goal.constraints.length ? goal.constraints.map((item) => `- 约束：${item}`) : ['- 约束：无']),
    ...(goal.approvalRequired.length ? goal.approvalRequired.map((item) => `- 需审批：${item}`) : ['- 需审批：无']),
    '',
    '## 执行批次',
    '',
    '| 序号 | 状态 | LLM 任务 | 开始 | 结束 |',
    '|---:|---|---|---|---|',
    ...audit.batches.map((batch) => (
      `| ${batch.seq} | ${cell(batch.status)} | ${cell(batch.llmTaskId || '-')} | ${time(batch.startedAt)} | ${time(batch.finishedAt)} |`
    )),
    '',
    '## 审批记录',
    '',
    ...(audit.approvals.length
      ? audit.approvals.map((approval) => (
          `- ${time(approval.requestedAt)} ${approval.kind} / ${approval.status}：${approval.title} ${code(approval.answer, 500)}`
        ))
      : ['- 无']),
    '',
    '## 操作账本',
    '',
    ...(audit.operations.length
      ? audit.operations.map((operation) => (
          `- ${operation.status} / ${operation.toolName} / ${operation.argsHash.slice(0, 16)} ${code(operation.args, 500)}`
        ))
      : ['- 无']),
    '',
    '## 事件来源',
    '',
    ...(audit.triggers.length
      ? audit.triggers.map((trigger) => (
          `- ${time(trigger.createdAt)} ${trigger.source} / ${trigger.eventId} ${code(trigger.payload, 500)}`
        ))
      : ['- 手动创建']),
    '',
    '## 定时计划运行',
    '',
    ...(audit.scheduleRuns.length
      ? audit.scheduleRuns.map((run) => (
          `- ${time(run.scheduledFor)} ${run.scheduleId} / ${run.status}${run.error ? `：${run.error}` : ''}`
        ))
      : ['- 无']),
    '',
    '## LLM 任务',
    '',
    ...(audit.tasks.length
      ? audit.tasks.map((task) => (
          `- ${time(task.createdAt)} ${task.id} / ${task.status} / step ${task.step}${task.error ? `：${task.error}` : ''}`
        ))
      : ['- 无']),
    '',
    '## 事件流水',
    '',
    ...audit.events.map((event) => (
      `${event.seq}. ${time(event.createdAt)} \`${event.type}\` ${code(event.payload, 1_000)}`
    )),
    '',
    '## 最后错误',
    '',
    goal.lastError || '无',
    '',
    '## 结果',
    '',
    code(goal.result, 4_000),
    '',
  );
  return lines.join('\n');
}
