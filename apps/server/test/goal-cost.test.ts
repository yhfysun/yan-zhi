import { describe, expect, it } from 'vitest';
import { isGoalCostLimitExceeded } from '../src/services/goal-cost.js';

describe('goal cost hard stop', () => {
  it('stops at the configured goal cost limit', () => {
    expect(isGoalCostLimitExceeded(1.01, 1)).toBe(true);
    expect(isGoalCostLimitExceeded(1, 1)).toBe(true);
    expect(isGoalCostLimitExceeded(0.99, 1)).toBe(false);
  });

  it('treats zero as unlimited', () => {
    expect(isGoalCostLimitExceeded(999, 0)).toBe(false);
    expect(isGoalCostLimitExceeded(999, null)).toBe(false);
  });
});
