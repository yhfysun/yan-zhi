import { describe, expect, it } from 'vitest';
import { goalNotificationTransition } from './pet';

describe('goal notification transitions', () => {
  it('notifies only when a goal enters a new actionable terminal state', () => {
    expect(goalNotificationTransition('running', 'completed')).toBe('ready');
    expect(goalNotificationTransition('running', 'failed')).toBe('error');
    expect(goalNotificationTransition('verifying', 'blocked')).toBe('error');
    expect(goalNotificationTransition('running', 'needing_approval')).toBe('input');
  });

  it('does not repeat unchanged or user-cancelled states', () => {
    expect(goalNotificationTransition('completed', 'completed')).toBeNull();
    expect(goalNotificationTransition('running', 'cancelled')).toBeNull();
    expect(goalNotificationTransition(undefined, 'completed')).toBeNull();
  });
});
