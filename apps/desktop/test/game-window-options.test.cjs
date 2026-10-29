// 独立游戏窗参数归一（P2，2026-10-29）
//
// 钉住三件事：
//   ① alwaysOnTop 必须**显式 opt-in** —— 默认 false，否则差异/会话/远控子窗口会一起被置顶；
//   ② 尺寸钳位（防止渲染层传 0 / 负数 / 荒唐值把窗口搞没）；
//   ③ 游戏窗默认路由就是 /browser，key 固定（重复点击复用同一个窗口）。
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainSrc.indexOf('// ===GAMEWIN-START===');
const end = mainSrc.indexOf('// ===GAMEWIN-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 GAMEWIN 哨兵块');
const block = mainSrc.slice(start, end);
const normalize = new Function(block + '\nreturn normalizeGameWindowOptions;')();

describe('normalizeGameWindowOptions（独立游戏窗）', () => {
  test('游戏窗参数：默认 /browser + 固定 key + 可缩放', () => {
    const g = normalize({ alwaysOnTop: true });
    assert.strictEqual(g.key, 'browser-game');
    assert.strictEqual(g.route, '/browser');
    assert.strictEqual(g.alwaysOnTop, true);
    assert.strictEqual(g.resizable, true);
    assert.strictEqual(g.skipTaskbar, false);
  });

  test('★ alwaysOnTop 默认 false（防止所有子窗口被置顶）', () => {
    assert.strictEqual(normalize({}).alwaysOnTop, false);
    assert.strictEqual(normalize({ route: '/diff-window' }).alwaysOnTop, false);
  });

  test('尺寸钳位：0 / 负数 / 荒唐值都被夹到合理区间', () => {
    assert.strictEqual(normalize({ width: 0 }).width, 480);
    assert.strictEqual(normalize({ width: -100 }).width, 480);
    assert.strictEqual(normalize({ width: 99999 }).width, 4096);
    assert.strictEqual(normalize({ height: 10 }).height, 360);
    assert.strictEqual(normalize({ height: 99999 }).height, 4096);
  });

  test('非法尺寸回落默认值（NaN / 字符串）', () => {
    assert.strictEqual(normalize({ width: 'abc' }).width, 1024);
    assert.strictEqual(normalize({ height: undefined }).height, 720);
  });

  test('resizable / skipTaskbar 可显式关闭', () => {
    const g = normalize({ resizable: false, skipTaskbar: true });
    assert.strictEqual(g.resizable, false);
    assert.strictEqual(g.skipTaskbar, true);
  });
});
