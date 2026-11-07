import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { createGoal, transitionGoal } from '../src/services/goal-store.js';
import {
  createGoalTemplate,
  deleteGoalTemplate,
  getGoalTemplate,
  listGoalTemplates,
} from '../src/services/goal-template.js';

const USER = 'u_goal_template';
const CONV = 'conv_goal_template';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_template', '!test-no-login', 0);
  db.prepare(
    'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(CONV, USER, '模板测试', 'default', 0, 0);
});

function sourceGoal() {
  const goal = createGoal({
    userId: USER,
    conversationId: CONV,
    objective: '生成周报并核对数据',
    criteria: [
      { id: 'file', title: '周报文件存在', kind: 'file_exists', path: 'weekly.md' },
      { id: 'manual', title: '人工确认', kind: 'human' },
    ],
    constraints: ['只读源数据'],
    approvalRequired: ['对外发送'],
    maxBatches: 12,
    maxStallBatches: 4,
  });
  transitionGoal(goal.id, 'completed', { result: { passed: true } });
  return goal;
}

describe('goal templates', () => {
  it('从目标保存模板时保留验收标准、约束与批次策略', () => {
    const goal = sourceGoal();
    const template = createGoalTemplate(goal.id, USER, '周报模板');
    expect(template.id).toMatch(/^goaltpl_/);
    expect(template.name).toBe('周报模板');
    expect(template.objective).toBe(goal.objective);
    expect(template.criteria).toEqual(goal.criteria);
    expect(template.constraints).toEqual(['只读源数据']);
    expect(template.approvalRequired).toEqual(['对外发送']);
    expect(template.maxBatches).toBe(12);
    expect(getGoalTemplate(template.id)?.id).toBe(template.id);
  });

  it('同一用户的模板名唯一，列表按更新时间倒序', () => {
    const goal = sourceGoal();
    createGoalTemplate(goal.id, USER, '列表模板 A');
    const b = createGoalTemplate(goal.id, USER, '列表模板 B');
    expect(() => createGoalTemplate(goal.id, USER, '列表模板 A')).toThrow(/已存在/);
    expect(listGoalTemplates(USER)[0].id).toBe(b.id);
  });

  it('删除模板后不可再读取', () => {
    const goal = sourceGoal();
    const template = createGoalTemplate(goal.id, USER, '待删除模板');
    expect(deleteGoalTemplate(template.id, USER)).toBe(true);
    expect(getGoalTemplate(template.id)).toBeNull();
    expect(deleteGoalTemplate(template.id, USER)).toBe(false);
  });
});
