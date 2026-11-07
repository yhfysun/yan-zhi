import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  createImGoalFromMessage,
  parseImGoalCommand,
} from '../src/services/im-goal.js';
import { getGoal } from '../src/services/goal-store.js';
import { findGoalTrigger } from '../src/services/goal-trigger.js';

const USER = 'u_im_goal';
const CONNECTOR = 'imc_im_goal';
const TEMPLATE = 'goaltpl_im_goal';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'im_goal', '!test-no-login', 0);
  db.prepare(`
    INSERT OR IGNORE INTO im_connector (
      id, user_id, provider, name, config_json, enabled, created_at, updated_at
    ) VALUES (?, ?, 'feishu', ?, ?, 1, ?, ?)
  `).run(CONNECTOR, USER, '飞书目标测试', '{}', 0, 0);
  db.prepare(`
    INSERT OR IGNORE INTO goal_template (
      id, user_id, name, objective, criteria_json, constraints_json,
      approval_policy_json, max_batches, max_stall_batches, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    TEMPLATE,
    USER,
    'IM 目标模板',
    '模板目标',
    JSON.stringify([{ id: 'report', title: '报告存在', kind: 'file_exists', path: 'report.md' }]),
    JSON.stringify(['只读']),
    JSON.stringify(['对外发送']),
    12,
    4,
    0,
    0,
  );
});

describe('IM goal commands', () => {
  it('recognizes explicit goal commands only', () => {
    expect(parseImGoalCommand('/goal 生成周报并核对数据')).toBe('生成周报并核对数据');
    expect(parseImGoalCommand('目标：完成季度复盘')).toBe('完成季度复盘');
    expect(parseImGoalCommand('目标: 修复发布失败')).toBe('修复发布失败');
    expect(parseImGoalCommand('普通聊天消息')).toBeNull();
    expect(parseImGoalCommand('/goal   ')).toBeNull();
  });

  it('creates one idempotent goal with the connector template policy', () => {
    const input = {
      userId: USER,
      connectorId: CONNECTOR,
      provider: 'feishu',
      externalId: 'om_im_goal_1',
      fromUser: 'ou_im_goal',
      objective: '生成周报并核对数据',
      platformId: 'platform_im_goal',
      modelId: 'model_im_goal',
      goalTemplateId: TEMPLATE,
    };
    const first = createImGoalFromMessage(input, { wake: false });
    const second = createImGoalFromMessage(input, { wake: false });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.goalId).toBe(second.goalId);
    expect(first.conversationId).toBe(second.conversationId);

    const goal = getGoal(first.goalId!)!;
    expect(goal.objective).toBe('生成周报并核对数据');
    expect(goal.criteria[0].path).toBe('report.md');
    expect(goal.constraints).toEqual(['只读']);
    expect(goal.approvalRequired).toEqual(['对外发送']);
    expect(findGoalTrigger(USER, 'im:feishu', `${CONNECTOR}:om_im_goal_1`)?.goalId).toBe(goal.id);
  });
});
