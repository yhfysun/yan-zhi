// 计划时间 chip 状态与本地时间输入转换（docs/笔记功能方案-2026-11-14.md §5）。
// 纯函数独立成文件：Notes.vue 与 Notes.mount.test.ts 共用 —— chip 状态色是「逾期红/今日橙/未来灰」，
// 源码锚点钉不住判定逻辑，必须真跑。
export type PlanChipState = 'overdue' | 'today' | 'future';

/** 逾期红 / 今日橙 / 未来灰；非时间戳返回 null（不渲染 chip）。
 *  语义贴「时间类计划到点提醒」：计划时刻已过（含今天早些时候）= 逾期红；
 *  今天内尚未到 = 今日橙；明天起 = 未来灰。 */
export function planChipState(planAt: number | null | undefined, now = Date.now()): PlanChipState | null {
  if (!planAt || !Number.isFinite(planAt)) return null;
  if (planAt < now) return 'overdue';
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayEnd = startOfDay.getTime() + 24 * 3600_000;
  if (planAt < dayEnd) return 'today';
  return 'future';
}

export function planChipLabel(planAt: number | null | undefined): string {
  if (!planAt || !Number.isFinite(planAt)) return '';
  const d = new Date(planAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** epoch ms → <input type="datetime-local"> 值（本地时区）；空返回 '' */
export function toLocalInputValue(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> 值 → epoch ms（本地时区）；空/非法返回 null */
export function fromLocalInputValue(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 列表行时间摘要：MM-DD HH:mm */
export function noteTimeLabel(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return planChipLabel(ms);
}
