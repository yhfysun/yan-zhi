// 布局引擎单测（node --test）
// 纯函数：不碰文件系统，输入分组数组，输出新的 rect 映射。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL_W,
  CELL_H,
  CELL_GAP,
  BOX_PAD_X,
  BOX_PAD_TOP,
  BOX_PAD_BOTTOM,
  cellCols,
  heightFor,
  snapWidth,
  layoutPlan,
} from './layout.js';

const fence = (id, x, y, w, h, extra) => ({ id, label: id, x, y, w, h, items: [], ...(extra || {}) });
const many = (n) => Array.from({ length: n }, (_, i) => ({ name: 'f' + i }));

/* ---------------- 基础几何 ---------------- */

test('cellCols：按卡片宽度算能放几列图标', () => {
  // (404 - 24 + 2) / 86 = 4.44 → 4
  assert.equal(cellCols(404), 4);
  assert.equal(cellCols(366), 4);
  assert.equal(cellCols(240), 2);   // (240 - 24 + 2) / 86 = 2.53 → 2
  assert.equal(cellCols(120), 1);
});

test('heightFor：高度 = 表头 + N 行图标 + 内边距', () => {
  const h2 = heightFor(8, 404);
  assert.equal(h2, 34 + BOX_PAD_TOP + 2 * CELL_H + 1 * CELL_GAP + BOX_PAD_BOTTOM);
  const h1 = heightFor(4, 404);
  assert.equal(h1, 34 + BOX_PAD_TOP + 1 * CELL_H + BOX_PAD_BOTTOM);
  // 空卡片至少一行，便于点击和拖入
  assert.equal(heightFor(0, 404), h1);
});

test('snapWidth：宽度收成整数个图标列（只会变窄，不会变宽）', () => {
  const w = snapWidth(404);
  assert.ok(w <= 404);
  assert.equal(w, 2 * BOX_PAD_X + cellCols(w) * CELL_W + (cellCols(w) - 1) * CELL_GAP);
  // 收窄后仍是同样的列数
  assert.equal(cellCols(w), cellCols(404));
});

/* ---------------- 布局计划 ---------------- */

const sample = () => [
  fence('apps', 40, 76, 404, 300, { items: many(8) }),
  fence('docs', 40, 392, 404, 262, { items: many(5) }),
  fence('pics', 468, 76, 360, 420, { items: many(6) }),
  fence('todos', 852, 76, 300, 208, { view: 'todos', items: many(4) }),
  fence('shots', 852, 308, 300, 300, { items: many(4) }),
];

test('板正模式：所有卡片等宽，且宽度是整数个图标列', () => {
  const plan = layoutPlan(sample(), { width: 1440, height: 900, neat: true });
  const widths = new Set([...plan.values()].map((p) => p.w));
  assert.equal(widths.size, 1, '所有列应等宽');
  for (const w of widths) {
    assert.equal(w, 2 * BOX_PAD_X + cellCols(w) * CELL_W + (cellCols(w) - 1) * CELL_GAP);
  }
});

test('板正模式：高度取整到整行图标', () => {
  const plan = layoutPlan(sample(), { width: 1440, height: 900, neat: true });
  const base = 34 + BOX_PAD_TOP + BOX_PAD_BOTTOM;
  for (const p of plan.values()) {
    const rows = (p.h - base + CELL_GAP) / (CELL_H + CELL_GAP);
    assert.ok(Number.isInteger(Math.round(rows)), '高度应落在整行上');
    assert.ok(Math.abs(rows - Math.round(rows)) < 1e-9);
  }
});

test('紧凑模式：保留各自宽度，只收高度', () => {
  const fs = sample();
  const plan = layoutPlan(fs, { width: 1440, height: 900, neat: false });
  for (const f of fs) assert.equal(plan.get(f.id).w, f.w);
});

test('列内保持用户原来的上下顺序', () => {
  const plan = layoutPlan(sample(), { width: 1440, height: 900 });
  // apps 原来在 docs 上面，排完仍应在上
  assert.ok(plan.get('apps').y < plan.get('docs').y);
  assert.ok(plan.get('todos').y < plan.get('shots').y);
});

test('不重叠、不出界、列距与行距都不小于 gap', () => {
  const opts = { width: 1440, height: 900, gap: 12, margin: 40 };
  const plan = layoutPlan(sample(), opts);
  const rects = [...plan.entries()].map(([id, p]) => ({ id, ...p }));

  for (const r of rects) {
    assert.ok(r.x >= opts.margin - 0.5, `${r.id} 左越界`);
    assert.ok(r.x + r.w <= opts.width - opts.margin + 0.5, `${r.id} 右越界`);
    assert.ok(r.y >= 0 && r.y + r.h <= opts.height, `${r.id} 纵向越界`);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${a.id} 与 ${b.id} 重叠`);
    }
  }
});

test('列左缘对齐：同一列里的卡片 x 相同', () => {
  const plan = layoutPlan(sample(), { width: 1440, height: 900 });
  assert.equal(plan.get('apps').x, plan.get('docs').x);
  assert.equal(plan.get('todos').x, plan.get('shots').x);
});

test('放不下时折到下一行带，不横向溢出', () => {
  const wide = [];
  for (let i = 0; i < 8; i += 1) wide.push(fence('f' + i, 40 + i * 420, 76, 404, 300, { items: many(8) }));
  const opts = { width: 1440, height: 2000, margin: 40, gap: 12, neat: true };
  const plan = layoutPlan(wide, opts);
  for (const [id, p] of plan) {
    assert.ok(p.x + p.w <= opts.width - opts.margin + 0.5, id + ' 横向溢出');
  }
  // 至少有两行带（y 出现两档以上）
  const ys = new Set([...plan.values()].map((p) => p.y));
  assert.ok(ys.size >= 2, '应折行');
});

test('空分组按一行高度保留，不会被压成 0', () => {
  const plan = layoutPlan([fence('empty', 40, 76, 404, 300)], { width: 1440, height: 900 });
  assert.ok(plan.get('empty').h >= 34 + BOX_PAD_TOP + CELL_H + BOX_PAD_BOTTOM - 0.5);
});

test('落库数据不合法时用兜底值，不抛异常', () => {
  const weird = [
    { id: 'a', x: 'x', y: null, w: 0, h: 0, items: [] },
    { id: 'b', items: null },
  ];
  const plan = layoutPlan(weird, { width: 1440, height: 900 });
  for (const p of plan.values()) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.w >= 240 && p.h >= 120);
  }
});

test('内容超高时匀到最矮的列，绝不允许重叠或超出屏幕', () => {
  // 复现真实桌面：一大卡（20 项）+ 若干空卡 + 一张中卡，3 列装不下
  const tall = [
    fence('a', 40, 40, 400, 320, { items: many(20) }),
    fence('b', 456, 40, 400, 320, { items: many(0) }),
    fence('c', 872, 40, 400, 320, { items: many(0) }),
    fence('d', 40, 376, 400, 320, { items: many(0) }),
    fence('e', 456, 376, 400, 320, { items: many(0) }),
    fence('g', 872, 376, 400, 320, { items: many(0) }),
    fence('h', 40, 712, 400, 320, { items: many(9) }),
  ];
  const plan = layoutPlan(tall, { width: 1920, height: 1032, neat: true });
  const rects = [...plan.entries()].map(([id, p]) => ({ id, ...p }));

  for (const r of rects) assert.ok(r.y + r.h <= 1032, r.id + ' 超出屏幕底部');
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const A = rects[i];
      const B = rects[j];
      const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
      assert.equal(overlap, false, A.id + ' 与 ' + B.id + ' 重叠');
    }
  }
  // 匀过之后不应有「同一列两张卡 y 相同」
  const keys = new Set(rects.map((r) => r.x + ':' + r.y));
  assert.equal(keys.size, rects.length, '同一位置出现了两张卡');
});
