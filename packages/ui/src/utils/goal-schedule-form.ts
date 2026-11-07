export type GoalScheduleMode = 'daily' | 'weekly' | 'interval';

export interface GoalScheduleFormValue {
  mode: GoalScheduleMode;
  time: string;
  weekday: number;
  intervalMinutes: number;
}

export interface GoalScheduleExpression {
  cronExpr: string | null;
  intervalMinutes: number | null;
}

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function parseClock(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(time || ''));
  const hour = match ? Number(match[1]) : 9;
  const minute = match ? Number(match[2]) : 0;
  return {
    hour: hour >= 0 && hour <= 23 ? hour : 9,
    minute: minute >= 0 && minute <= 59 ? minute : 0,
  };
}

export function buildGoalScheduleExpression(input: {
  mode: GoalScheduleMode;
  time?: string;
  weekday?: number;
  intervalMinutes?: number;
}): GoalScheduleExpression {
  if (input.mode === 'interval') {
    return {
      cronExpr: null,
      intervalMinutes: Math.max(1, Math.round(Number(input.intervalMinutes) || 30)),
    };
  }
  const { hour, minute } = parseClock(input.time || '09:00');
  if (input.mode === 'weekly') {
    const weekday = ((Math.round(Number(input.weekday) || 0) % 7) + 7) % 7;
    return {
      cronExpr: `${minute} ${hour} * * ${weekday}`,
      intervalMinutes: null,
    };
  }
  return {
    cronExpr: `${minute} ${hour} * * *`,
    intervalMinutes: null,
  };
}

export function parseGoalScheduleExpression(input: {
  cronExpr?: string | null;
  intervalMinutes?: number | null;
}): GoalScheduleFormValue {
  const fallback: GoalScheduleFormValue = {
    mode: 'daily',
    time: '09:00',
    weekday: 1,
    intervalMinutes: 30,
  };
  if (input.intervalMinutes && input.intervalMinutes > 0) {
    return { ...fallback, mode: 'interval', intervalMinutes: Math.round(input.intervalMinutes) };
  }
  const parts = String(input.cronExpr || '').trim().split(/\s+/);
  if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*') return fallback;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return fallback;
  }
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (parts[4] === '*') return { ...fallback, time };
  const weekday = Number(parts[4]);
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
    return { ...fallback, mode: 'weekly', time, weekday };
  }
  return fallback;
}

export function describeGoalSchedule(input: {
  cronExpr?: string | null;
  intervalMinutes?: number | null;
}): string {
  if (input.intervalMinutes && input.intervalMinutes > 0) {
    return `每隔 ${input.intervalMinutes} 分钟`;
  }
  const parsed = parseGoalScheduleExpression(input);
  if (parsed.mode === 'weekly') return `每${WEEK_LABELS[parsed.weekday]} ${parsed.time}`;
  if (parsed.mode === 'daily') return `每天 ${parsed.time}`;
  return input.cronExpr ? `Cron ${input.cronExpr}` : '未设置';
}
