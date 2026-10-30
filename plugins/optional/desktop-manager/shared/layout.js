// 布局引擎（纯函数，无 IO）
//
// 「一键整理」的布局部分：决定每张卡片摆在哪、多大。
// 两条目标同时成立：
//   1) 保住用户的空间记忆 —— 按当前 x 聚成列，列内保持原来的上下顺序
//   2) 让整张桌面像一张网格 —— 板正模式下所有列等宽、高度取整到图标行
//
// ★ 与「锁定位置」无关：锁定只阻止用户手动拖动，整理是显式动作，照样重排。
import { HEADER } from './fences.js';

/** 图标单元格与卡片内边距（与 fence.html 的网格保持一致） */
export const CELL_W = 84;
export const CELL_H = 104;
export const CELL_GAP = 2;
export const BOX_PAD_X = 12;
export const BOX_PAD_TOP = 10;
export const BOX_PAD_BOTTOM = 12;

/** 列表视图（待办/备忘）每行约 30px，折算成图标行高 */
const LIST_ROW_H = 30;

const COL_PITCH = CELL_W + CELL_GAP;

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** 卡片宽度能放下几列图标 */
export function cellCols(width) {
  const inner = num(width, 0) - 2 * BOX_PAD_X + CELL_GAP;
  return Math.max(1, Math.floor(inner / COL_PITCH));
}

function heightOfRows(rows) {
  const r = Math.max(1, rows);
  return HEADER + BOX_PAD_TOP + r * CELL_H + (r - 1) * CELL_GAP + BOX_PAD_BOTTOM;
}

/** 条目数 → 需要几行图标 */
function rowsOf(f, width) {
  const items = Array.isArray(f.items) ? f.items : [];
  if (f.view === 'todos' || f.view === 'list') {
    return Math.max(1, Math.ceil((items.length * LIST_ROW_H) / COL_PITCH + 0.0001));
  }
  return Math.max(1, Math.ceil(items.length / cellCols(width)));
}

/** 卡片高度：内容需要几行就几行（最少一行，便于拖入） */
export function heightFor(count, width) {
  const cols = cellCols(width);
  const rows = Math.max(1, Math.ceil(num(count, 0) / cols));
  return heightOfRows(rows);
}

/** 宽度收成「整数个图标列」：只会变窄，列数不变 */
export function snapWidth(width) {
  const cols = cellCols(width);
  return 2 * BOX_PAD_X + cols * CELL_W + (cols - 1) * CELL_GAP;
}

/** 按当前 x 聚成列，列内按 y 从上到下 */
function detectColumns(list) {
  const sorted = [...list].sort((a, b) => a.x - b.x);
  const cols = [];
  for (const f of sorted) {
    let c = cols.find((k) => Math.abs(k.x - f.x) < 120);
    if (!c) { c = { x: f.x, fs: [] }; cols.push(c); }
    c.fs.push(f);
  }
  for (const c of cols) {
    c.x = Math.min(...c.fs.map((f) => f.x));
    c.w = Math.max(...c.fs.map((f) => f.w));
    c.fs.sort((a, b) => a.y - b.y);
  }
  return cols;
}

/**
 * @param {Array} fences [{ id, x, y, w, h, view?, items? }]
 * @param {object} opts { width, height, margin=40, top=76, gap=12, neat=true }
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function layoutPlan(fences, opts = {}) {
  const stageW = num(opts.width, 1440);
  const stageH = num(opts.height, 900);
  const margin = num(opts.margin, 40);
  const top = num(opts.top, 76);
  const gap = num(opts.gap, 12);
  const neat = opts.neat !== false;
  const MIN_W = 240;
  const MIN_H = 120;

  const list = (fences || [])
    .filter((f) => f && f.id != null)
    .map((f) => ({
      id: String(f.id),
      x: num(f.x, margin),
      y: num(f.y, top),
      w: Math.max(MIN_W, num(f.w, 360)),
      h: Math.max(MIN_H, num(f.h, 240)),
      view: f.view,
      items: Array.isArray(f.items) ? f.items : [],
    }));
  if (!list.length) return new Map();

  const cols = detectColumns(list);
  const uniformW = neat ? snapWidth(Math.max(MIN_W, ...list.map((f) => f.w))) : 0;
  const availH = Math.max(MIN_H, stageH - margin - top);
  const heightOf = (f, colW) => Math.max(MIN_H, heightOfRows(rowsOf(f, colW)));

  let buckets = cols.map((c) => {
    const w = neat ? uniformW : c.w;
    return { w, items: c.fs.map((f) => ({ f, h: heightOf(f, w) })) };
  });
  const sumH = (b) => b.items.reduce((n, it) => n + it.h, 0) + Math.max(0, b.items.length - 1) * gap;

  // 放不下时把卡片匀到最矮的列 —— 绝不能靠「把 y 钳到顶部」来收，那会把同一列的两张卡压到一起
  if (buckets.some((b) => sumH(b) > availH)) {
    const used = buckets.map(() => 0);
    const placed = buckets.map(() => []);
    const ordered = buckets
      .flatMap((b, idx) => b.items.map((it) => ({ it, home: idx })))
      .sort((a, b) => b.it.h - a.it.h);
    for (const { it, home } of ordered) {
      const needIn = (i) => used[i] + it.h + (placed[i].length ? gap : 0);
      let target = -1;
      if (needIn(home) <= availH) target = home;
      else {
        let best = -1;
        for (let i = 0; i < buckets.length; i += 1) {
          if (i === home) continue;
          if (needIn(i) <= availH && (best < 0 || used[i] < used[best])) best = i;
        }
        target = best >= 0 ? best : used.indexOf(Math.min(...used));
      }
      placed[target].push(it);
      used[target] += it.h + (placed[target].length > 1 ? gap : 0);
    }
    buckets = buckets.map((b, i) => ({ ...b, items: placed[i].sort((a, b2) => a.f.y - b2.f.y) }));
  }

  const plan = new Map();
  let x = margin;
  let bandY = top;
  let bandH = 0;

  for (const b of buckets) {
    const colW = b.w;
    if (x > margin && x + colW > stageW - margin) {
      x = margin;
      bandY += bandH + gap;
      bandH = 0;
    }
    let y = bandY;
    for (const it of b.items) {
      plan.set(it.f.id, { x, y, w: colW, h: it.h });
      y += it.h + gap;
    }
    bandH = Math.max(bandH, b.items.length ? y - bandY - gap : 0);
    x += colW + gap;
  }

  return plan;
}
