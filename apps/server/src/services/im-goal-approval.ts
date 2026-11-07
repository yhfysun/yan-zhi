import { db } from '../db.js';
import { approveGoal, cancelGoal } from './goal-runner.js';
import { getGoal, type GoalRun } from './goal-store.js';

interface ImGoalApprovalCommand {
  action: 'approve' | 'reject';
  goalId: string;
}

interface ImGoalApprovalInput {
  userId: string;
  connectorId?: string | null;
  provider: string;
  fromUser: string;
  text: string;
}

interface ImGoalApprovalResult {
  handled: boolean;
  ok: boolean;
  reply: string;
}

function parseJson(value: unknown): Record<string, any> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function parseImGoalApprovalCommand(text: string): ImGoalApprovalCommand | null {
  const raw = String(text || '').trim();
  const match = /^(?:\/goal|目标[:：])\s*(approve|reject|通过|拒绝)\s+([A-Za-z0-9_-]{1,160})$/i.exec(raw);
  if (!match) return null;
  const actionRaw = match[1].toLowerCase();
  return {
    action: actionRaw === 'approve' || actionRaw === '通过' ? 'approve' : 'reject',
    goalId: match[2],
  };
}

function originatingImPayload(goalId: string, input: ImGoalApprovalInput): Record<string, any> | null {
  const rows = db.prepare(`
    SELECT source, payload_json FROM goal_trigger_event
    WHERE goal_id = ? AND source LIKE 'im:%'
    ORDER BY created_at DESC
  `).all(goalId) as any[];
  for (const row of rows) {
    const payload = parseJson(row.payload_json);
    const source = String(row.source || '');
    const provider = source.slice(3);
    if (provider !== input.provider) continue;
    if (input.connectorId && String(payload.connectorId || '') !== input.connectorId) continue;
    if (String(payload.fromUser || '') !== input.fromUser) continue;
    return payload;
  }
  return null;
}

export function handleImGoalApprovalCommand(input: ImGoalApprovalInput): ImGoalApprovalResult {
  const command = parseImGoalApprovalCommand(input.text);
  if (!command) {
    if (/^(?:\/goal|目标[:：])\s*(?:approve|reject|通过|拒绝)\b/i.test(String(input.text || '').trim())) {
      return { handled: true, ok: false, reply: '审批命令缺少有效的目标 ID' };
    }
    return { handled: false, ok: false, reply: '' };
  }
  const goal = getGoal(command.goalId);
  if (!goal || goal.userId !== input.userId) {
    return { handled: true, ok: false, reply: '目标不存在或无权操作' };
  }
  const origin = originatingImPayload(goal.id, input);
  if (!origin) {
    return { handled: true, ok: false, reply: '当前 IM 身份不是该目标的发起人' };
  }
  if (goal.status !== 'needing_approval') {
    return { handled: true, ok: false, reply: `目标当前状态为 ${goal.status}，无需审批` };
  }
  const result = (goal.result || {}) as Record<string, any>;
  if (String(result.kind || '').startsWith('operation_reconcile')) {
    return { handled: true, ok: false, reply: '该目标需要逐项核实外部操作结果，请回到应用处理' };
  }
  try {
    if (command.action === 'approve') {
      approveGoal(goal.id, '通过 IM 审批');
      return { handled: true, ok: true, reply: `目标已通过验收：${goal.objective.slice(0, 80)}` };
    }
    cancelGoal(goal.id, '通过 IM 拒绝');
    return { handled: true, ok: true, reply: `目标已拒绝并结束：${goal.objective.slice(0, 80)}` };
  } catch (error: any) {
    return { handled: true, ok: false, reply: String(error?.message || error).slice(0, 500) };
  }
}

export function renderImGoalApprovalCard(
  goal: GoalRun,
  title: string,
  detail: unknown,
): string {
  const payload = detail && typeof detail === 'object' ? detail as Record<string, any> : {};
  const summary = String(payload.summary || goal.lastError || '').slice(0, 500);
  const result = (goal.result || {}) as Record<string, any>;
  const requiresReconcile = String(result.kind || '').startsWith('operation_reconcile');
  return [
    `【${title}】`,
    `目标：${goal.objective.slice(0, 200)}`,
    summary,
    requiresReconcile
      ? '该目标需要逐项核实外部操作结果，请回到言智处理。'
      : `通过：/goal approve ${goal.id}`,
    requiresReconcile ? '' : `拒绝：/goal reject ${goal.id}`,
  ].filter(Boolean).join('\n');
}

export async function notifyGoalImApproval(
  goal: GoalRun,
  title: string,
  detail: unknown,
): Promise<void> {
  const rows = db.prepare(`
    SELECT payload_json FROM goal_trigger_event
    WHERE goal_id = ? AND source LIKE 'im:%'
    ORDER BY created_at DESC LIMIT 1
  `).all(goal.id) as any[];
  if (!rows.length) return;
  const payload = parseJson(rows[0].payload_json);
  const connectorId = String(payload.connectorId || '');
  const replyTo = String(payload.replyTo || payload.fromUser || '');
  if (!connectorId || !replyTo) return;
  const { sendImMessage } = await import('./im.js');
  await sendImMessage(goal.userId, connectorId, {
    to: replyTo,
    content: renderImGoalApprovalCard(goal, title, detail),
    receiveIdType: payload.receiveIdType ? String(payload.receiveIdType) : undefined,
  });
}
