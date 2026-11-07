import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import {
  admitGoalExecution,
  getGoalGovernance,
  setUserGoalConcurrencyLimit,
} from '../src/services/goal-governance.js';
import { createGoal, getGoal, listGoalEvents, transitionGoal } from '../src/services/goal-store.js';

const USER = 'u_goal_governance';
const OTHER_USER = 'u_goal_governance_other';

beforeAll(() => {
  for (const [id, username] of [[USER, 'goal_governance'], [OTHER_USER, 'goal_governance_other']]) {
    db.prepare(
      'INSERT OR IGNORE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, username, '!test-no-login', 0);
    for (const suffix of ['a', 'b', 'c', 'd']) {
      db.prepare(
        'INSERT OR IGNORE INTO conversation (id, user_id, title, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(`conv_${id}_${suffix}`, id, `goal governance ${suffix}`, 'default', 0, 0);
    }
  }
});

function createTestGoal(userId: string, suffix: string) {
  return createGoal({
    userId,
    conversationId: `conv_${userId}_${suffix}`,
    objective: `并发目标 ${suffix}`,
    criteria: [],
  });
}

describe('goal execution governance', () => {
  it('admits goals up to the per-user limit and defers the next goal without losing it', () => {
    setUserGoalConcurrencyLimit(USER, 2);
    const first = createTestGoal(USER, 'a');
    const second = createTestGoal(USER, 'b');
    const third = createTestGoal(USER, 'c');

    expect(admitGoalExecution(first.id).admitted).toBe(true);
    expect(getGoal(first.id)?.status).toBe('planning');
    expect(admitGoalExecution(second.id).admitted).toBe(true);
    expect(getGoal(second.id)?.status).toBe('planning');

    const deferred = admitGoalExecution(third.id);
    expect(deferred.admitted).toBe(false);
    expect(deferred.reason).toBe('user_limit');
    expect(getGoal(third.id)?.status).toBe('retry_wait');
    expect(getGoal(third.id)?.nextRunAt).toBeGreaterThan(Date.now());
    expect(listGoalEvents(third.id).some((event) => event.type === 'goal.deferred')).toBe(true);
  });

  it('allows another user to run while the first user is at their limit', () => {
    const existing = createTestGoal(USER, 'd');
    transitionGoal(existing.id, 'planning');
    const other = createTestGoal(OTHER_USER, 'a');

    expect(admitGoalExecution(other.id).admitted).toBe(true);
    expect(getGoal(other.id)?.status).toBe('planning');
  });

  it('reports current usage and the effective global/user limits', () => {
    const governance = getGoalGovernance(USER);
    expect(governance.maxRunningPerUser).toBe(2);
    expect(governance.maxRunningGlobal).toBeGreaterThanOrEqual(2);
    expect(governance.runningGlobal).toBeGreaterThanOrEqual(1);
    expect(governance.runningForUser).toBeGreaterThanOrEqual(1);
  });
});
