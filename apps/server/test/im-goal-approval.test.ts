import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  handleImGoalApprovalCommand,
  parseImGoalApprovalCommand,
  renderImGoalApprovalCard,
} from '../src/services/im-goal-approval.js';
import { createGoal, getGoal, transitionGoal } from '../src/services/goal-store.js';
import { saveGoalTrigger } from '../src/services/goal-trigger.js';

const USER = 'u_im_goal_approval';
const CONNECTOR = 'imc_im_goal_approval';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'im_goal_approval', '!test-no-login', 0);
  db.prepare(`
    INSERT OR IGNORE INTO im_connector
      (id, user_id, provider, name, config_json, enabled, created_at, updated_at)
    VALUES (?, ?, 'feishu', ?, '{}', 1, 0, 0)
  `).run(CONNECTOR, USER, 'IM审批');
});

function pendingGoal(suffix: string) {
  const convId = `conv_im_goal_approval_${suffix}`;
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(convId, USER, `审批目标 ${suffix}`, 'default', 0, 0);
  const goal = createGoal({
    userId: USER,
    conversationId: convId,
    objective: `等待审批的目标 ${suffix}`,
    criteria: [{ id: 'manual', title: '人工验收', kind: 'human' }],
  });
  transitionGoal(goal.id, 'needing_approval', {
    result: { summary: '请确认交付物' },
  });
  db.prepare(`
    INSERT INTO goal_approval
      (id, goal_id, kind, title, detail_json, status, requested_at)
    VALUES (?, ?, 'manual_acceptance', ?, ?, 'open', ?)
  `).run(
    `approval_${suffix}`,
    goal.id,
    '目标完成待确认',
    JSON.stringify({ summary: '请确认交付物' }),
    Date.now(),
  );
  saveGoalTrigger({
    userId: USER,
    source: 'im:feishu',
    eventId: `${CONNECTOR}:event_${suffix}`,
    goalId: goal.id,
    payload: {
      connectorId: CONNECTOR,
      fromUser: 'ou_owner',
      replyTo: 'ou_owner',
      receiveIdType: 'open_id',
    },
  });
  return goal;
}

describe('IM goal approvals', () => {
  it('parses approve and reject commands with bounded goal ids', () => {
    expect(parseImGoalApprovalCommand('/goal approve goal_123')).toEqual({
      action: 'approve',
      goalId: 'goal_123',
    });
    expect(parseImGoalApprovalCommand('目标：拒绝 goal_456')).toEqual({
      action: 'reject',
      goalId: 'goal_456',
    });
    expect(parseImGoalApprovalCommand('/goal approve')).toBeNull();
    expect(handleImGoalApprovalCommand({
      userId: USER,
      connectorId: CONNECTOR,
      provider: 'feishu',
      fromUser: 'ou_owner',
      text: '/goal approve',
    })).toMatchObject({ handled: true, ok: false });
  });

  it('renders a text approval card with explicit commands', () => {
    const goal = pendingGoal('render');
    const text = renderImGoalApprovalCard(goal, '目标完成待确认', { summary: '请确认交付物' });
    expect(text).toContain(goal.id);
    expect(text).toContain(`/goal approve ${goal.id}`);
    expect(text).toContain(`/goal reject ${goal.id}`);
  });

  it('only lets the originating IM user approve the linked goal', () => {
    const goal = pendingGoal('approve');
    const denied = handleImGoalApprovalCommand({
      userId: USER,
      connectorId: CONNECTOR,
      provider: 'feishu',
      fromUser: 'ou_other',
      text: `/goal approve ${goal.id}`,
    });
    expect(denied.handled).toBe(true);
    expect(denied.ok).toBe(false);
    expect(getGoal(goal.id)?.status).toBe('needing_approval');

    const approved = handleImGoalApprovalCommand({
      userId: USER,
      connectorId: CONNECTOR,
      provider: 'feishu',
      fromUser: 'ou_owner',
      text: `/goal approve ${goal.id}`,
    });
    expect(approved.ok).toBe(true);
    expect(getGoal(goal.id)?.status).toBe('completed');
  });

  it('rejects a linked goal through the same signed IM identity', () => {
    const goal = pendingGoal('reject');
    const rejected = handleImGoalApprovalCommand({
      userId: USER,
      connectorId: CONNECTOR,
      provider: 'feishu',
      fromUser: 'ou_owner',
      text: `/goal reject ${goal.id}`,
    });
    expect(rejected.ok).toBe(true);
    expect(getGoal(goal.id)?.status).toBe('cancelled');
  });
});
