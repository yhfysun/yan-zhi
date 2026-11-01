// 待办提醒的到点判定（纯函数，不依赖定时器/宿主）
//
// ★ 三条规则，改之前先想清楚为什么：
//   ① 有开始时间的：到点才提醒，**当天只提醒一次**（轮询每分钟跑，不做去重会狂轰）。
//   ② 过期超过 3 小时不补 —— 补一条"你 3 小时前该开会了"只会烦人，不会有帮助。
//   ③ 没排时间的：下班前 90 分钟汇总一次（默认 18:00 下班 → 16:30），同样当天一次。
//   所有"已提醒"标记按天存，跨天自动重新生效。

/** 汇总提醒在 fired 里的键（与待办 id 命名空间隔离） */
export const BATCH_KEY = '__batch__';
const DEFAULT_WORK_END = '18:00';
const BATCH_LEAD_MIN = 90;
const MAX_LATE_MS = 3 * 3600 * 1000;
const DAY_MS = 86400000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 本地日键（YYYY-MM-DD） */
export function dayKey(ms) {
  const d = new Date(Number(ms) || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "18:00" / " 9：30 " → { h, m }；非法 → null（支持全角冒号与空格） */
export function parseHm(s) {
  const m = String(s == null ? '' : s).trim().match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h > 23 || mm > 59) return null;
  return { h, m: mm };
}

/** 下班时间 → 汇总提醒时刻（提前 90 分钟）；非法回落默认 18:00 → 16:30 */
export function batchTimeOf(workEnd) {
  const t = parseHm(workEnd) || parseHm(DEFAULT_WORK_END) || { h: 18, m: 0 };
  let total = t.h * 60 + t.m - BATCH_LEAD_MIN;
  if (total < 0) total += 24 * 60;
  return { h: Math.floor(total / 60), m: total % 60 };
}

/**
 * 算当前该提醒什么。
 * @param {Array} todos [{ id, text, startAt, done }]
 * @param {number} nowMs
 * @param {object} opts { fired?: Record<string,string>, workEnd?: '18:00' }
 * @returns {{ due: Array, fired: Record<string,string> }}
 */
export function computeDue(todos, nowMs, opts = {}) {
  const now = Number(nowMs) || Date.now();
  const today = dayKey(now);
  const fired0 = opts.fired && typeof opts.fired === 'object' ? opts.fired : {};
  const list = (Array.isArray(todos) ? todos : []).filter((t) => t && !t.done);

  // 清理：待办删掉后不留已读标记，否则同 id 复用时会"永远不再提醒"
  const fired = {};
  for (const k of Object.keys(fired0)) {
    if (k === BATCH_KEY) { fired[k] = fired0[k]; continue; }
    if (list.some((t) => String(t.id) === String(k))) fired[k] = fired0[k];
  }

  const due = [];

  // ① 到点提醒
  for (const t of list) {
    const startAt = Number(t.startAt) || 0;
    if (!startAt) continue;
    const late = now - startAt;
    if (late < 0 || late > MAX_LATE_MS) continue;
    if (fired[String(t.id)] === today) continue;
    due.push({ kind: 'start', todo: t });
    fired[String(t.id)] = today;
  }

  // ② 没排时间的：下班前汇总
  const pending = list.filter((t) => !(Number(t.startAt) > 0));
  if (pending.length > 0 && fired[BATCH_KEY] !== today) {
    const bt = batchTimeOf(opts.workEnd);
    const at = new Date(now);
    at.setHours(bt.h, bt.m, 0, 0);
    if (now >= at.getTime()) {
      due.push({ kind: 'batch', todos: pending });
      fired[BATCH_KEY] = today;
    }
  }

  return { due, fired };
}

/** 提醒文案：短、带具体内容（桌面气泡里没地方写长句） */
export function describeDue(due) {
  if (!due) return '';
  if (due.kind === 'start') return `该开始了：${due.todo && due.todo.text ? due.todo.text : ''}`;
  const items = Array.isArray(due.todos) ? due.todos : [];
  const texts = items.map((t) => (t && t.text ? t.text : '')).filter(Boolean).join('、');
  return `还有 ${items.length} 项待办没排时间：${texts}`;
}
