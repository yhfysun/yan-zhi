import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  buildGoalAudit,
  renderGoalAuditMarkdown,
} from '../src/services/goal-audit.js';
import {
  appendGoalEvent,
  createGoal,
  transitionGoal,
} from '../src/services/goal-store.js';
import { saveGoalTrigger } from '../src/services/goal-trigger.js';

const USER = 'u_goal_audit';
const OTHER_USER = 'u_goal_audit_other';
const CONV = 'conv_goal_audit';

beforeAll(() => {
  for (const [id, username] of [[USER, 'goal_audit'], [OTHER_USER, 'goal_audit_other']]) {
    db.prepare(
      'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, username, '!test-no-login', 0);
  }
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '目标审计', 'default', 0, 0);
});

describe('goal audit export', () => {
  it('bundles goal state, events, triggers and renders readable markdown', () => {
    const goal = createGoal({
      userId: USER,
      conversationId: CONV,
      platformId: 'platform_audit',
      modelId: 'model_audit',
      objective: '生成月度审计报告',
      criteria: [{ id: 'report', title: '审计报告存在', kind: 'file_exists', path: 'audit.md' }],
      constraints: ['只读'],
      approvalRequired: ['对外发送'],
    });
    appendGoalEvent(goal.id, 'audit.custom', { note: 'manual checkpoint' });
    saveGoalTrigger({
      userId: USER,
      source: 'im:feishu',
      eventId: 'event_audit_1',
      goalId: goal.id,
      payload: { messageId: 'om_1' },
    });
    transitionGoal(goal.id, 'failed', {
      lastError: '模拟失败',
      result: { summary: '无法完成' },
    });

    const audit = buildGoalAudit(goal.id, USER)!;
    expect(audit.version).toBe(1);
    expect(audit.goal?.id).toBe(goal.id);
    expect(audit.events.some((event) => event.type === 'audit.custom')).toBe(true);
    expect(audit.triggers[0].source).toBe('im:feishu');
    expect(audit.batches).toEqual([]);

    const markdown = renderGoalAuditMarkdown(audit);
    expect(markdown).toContain('# 目标审计报告');
    expect(markdown).toContain('生成月度审计报告');
    expect(markdown).toContain('im:feishu');
    expect(markdown).toContain('模拟失败');
  });

  it('does not expose another user goal', () => {
    const goal = createGoal({
      userId: USER,
      conversationId: CONV,
      objective: '私有目标',
      criteria: [],
    });
    expect(buildGoalAudit(goal.id, OTHER_USER)).toBeNull();
  });
});
