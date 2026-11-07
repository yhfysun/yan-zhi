import { describe, expect, it } from 'vitest';
import {
  buildGoalScheduleExpression,
  describeGoalSchedule,
  parseGoalScheduleExpression,
} from './goal-schedule-form';

describe('goal schedule form', () => {
  it('builds daily and weekly cron expressions', () => {
    expect(buildGoalScheduleExpression({
      mode: 'daily',
      time: '09:30',
    })).toEqual({ cronExpr: '30 9 * * *', intervalMinutes: null });

    expect(buildGoalScheduleExpression({
      mode: 'weekly',
      time: '18:05',
      weekday: 1,
    })).toEqual({ cronExpr: '5 18 * * 1', intervalMinutes: null });
  });

  it('builds interval schedules and parses them back', () => {
    expect(buildGoalScheduleExpression({
      mode: 'interval',
      intervalMinutes: 45,
    })).toEqual({ cronExpr: null, intervalMinutes: 45 });

    expect(parseGoalScheduleExpression({ intervalMinutes: 45, cronExpr: null })).toEqual({
      mode: 'interval',
      time: '09:00',
      weekday: 1,
      intervalMinutes: 45,
    });
  });

  it('describes the schedule without exposing raw cron when avoidable', () => {
    expect(describeGoalSchedule({ cronExpr: '30 9 * * *', intervalMinutes: null })).toBe('每天 09:30');
    expect(describeGoalSchedule({ cronExpr: '5 18 * * 1', intervalMinutes: null })).toBe('每周一 18:05');
    expect(describeGoalSchedule({ cronExpr: null, intervalMinutes: 45 })).toBe('每隔 45 分钟');
  });
});
