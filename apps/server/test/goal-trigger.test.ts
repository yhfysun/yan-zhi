import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  findGoalTrigger,
  listGoalTriggers,
  saveGoalTrigger,
} from '../src/services/goal-trigger.js';

const USER = 'u_goal_trigger';

beforeAll(() => {
  db.prepare(
    'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(USER, 'u_goal_trigger', '!test-no-login', 0);
});

describe('goal trigger events', () => {
  it('同一来源同一事件编号只允许记录一次', () => {
    const trigger = saveGoalTrigger({
      userId: USER,
      source: 'feishu',
      eventId: 'evt_1',
      goalId: 'goal_trigger_1',
      payload: { message: '处理退款' },
    });
    expect(findGoalTrigger(USER, 'feishu', 'evt_1')?.goalId).toBe('goal_trigger_1');
    expect(trigger.source).toBe('feishu');
    expect(() => saveGoalTrigger({
      userId: USER,
      source: 'feishu',
      eventId: 'evt_1',
      goalId: 'goal_trigger_2',
      payload: {},
    })).toThrow(/已处理/);
  });

  it('不同来源/事件分别记录，列表按时间倒序', () => {
    saveGoalTrigger({
      userId: USER,
      source: 'webhook',
      eventId: 'evt_2',
      goalId: 'goal_trigger_2',
      payload: { a: 1 },
    });
    const list = listGoalTriggers(USER);
    expect(list[0].eventId).toBe('evt_2');
    expect(findGoalTrigger(USER, 'other', 'evt_2')).toBeNull();
  });
});
