// 宠物代玩避让的定位计算：右下角 / 多屏负坐标 / 底部留白 / 区域过小。
const test = require('node:test');
const assert = require('node:assert');
const { dockRect, scaledSize } = require('../pet-dock.cjs');

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };

test('docks to bottom-right with margin and bottom avoid', () => {
  const r = dockRect(AREA, { w: 100, h: 120 }, { margin: 12, avoidBottom: 44 });
  assert.equal(r.width, 100);
  assert.equal(r.height, 120);
  assert.equal(r.x, 1920 - 100 - 12);
  assert.equal(r.y, 1040 - 120 - 12 - 44);
});

test('handles second display with negative origin', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 };
  const r = dockRect(area, { w: 80, h: 90 }, { margin: 10 });
  assert.equal(r.x, -80 - 10);
  assert.equal(r.y, -200 + 1080 - 90 - 10);
});

test('clamps when the work area is smaller than the pet window', () => {
  const r = dockRect({ x: 0, y: 0, width: 60, height: 50 }, { w: 100, h: 120 }, { margin: 12 });
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
  assert.equal(r.width, 100);
  assert.equal(r.height, 120);
});

test('scaledSize keeps ratio and clamps scale range', () => {
  assert.deepEqual(scaledSize({ w: 100, h: 200 }, 0.7), { w: 70, h: 140 });
  assert.deepEqual(scaledSize({ w: 100, h: 200 }, 9), { w: 200, h: 400 });
  assert.deepEqual(scaledSize({ w: 100, h: 200 }, 0.1), { w: 50, h: 100 });
});
