// 实时/游戏模式·坐标点击快速通道（P0 2026-10-29）
//
// 从 main.cjs 抽取 ===FASTCLICK-START/END=== 之间的真实代码执行，钉住三件事：
//   ① fast + 坐标 → 走 sendInputEvent（真实输入事件，canvas 游戏才认），不注入 JS；
//   ② 快速通道不触发 executeJavaScript（无 DOM 往返、无 250ms 稳定等待）；
//   ③ 非 fast / 缺坐标 → 必须原样落回常规 click 路径（不拦、不改变老行为）。
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainSrc.indexOf('// ===FASTCLICK-START===');
const end = mainSrc.indexOf('// ===FASTCLICK-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 FASTCLICK 哨兵块');
const block = mainSrc.slice(start, end);

const runBlock = new Function('args', 'wc', block);

function makeWc() {
  const sent = [];
  return {
    sent,
    executeJavaScript: () => {
      throw new Error('快速通道不应调用 executeJavaScript（应走真实输入事件）');
    },
    sendInputEvent: (e) => sent.push(e),
  };
}

describe('fast 坐标点击', () => {
  test('fast + x/y → 派发真实 mouseDown/mouseUp 并立即返回', () => {
    const wc = makeWc();
    const res = runBlock({ fast: true, x: 320, y: 240 }, wc);
    assert.deepStrictEqual(res, { success: true, via: 'real-mouse', fast: true, x: 320, y: 240 });
    assert.strictEqual(wc.sent.length, 2);
    assert.strictEqual(wc.sent[0].type, 'mouseDown');
    assert.strictEqual(wc.sent[0].x, 320);
    assert.strictEqual(wc.sent[0].y, 240);
    assert.strictEqual(wc.sent[0].button, 'left');
    assert.strictEqual(wc.sent[1].type, 'mouseUp');
  });

  test('数字字符串坐标也接受（模型常把坐标写成字符串）', () => {
    const wc = makeWc();
    const res = runBlock({ fast: true, x: '88', y: '99' }, wc);
    assert.strictEqual(res.x, 88);
    assert.strictEqual(res.y, 99);
  });

  test('非 fast 时不拦截（落回常规 click 路径）', () => {
    const wc = makeWc();
    assert.strictEqual(runBlock({ x: 1, y: 2 }, wc), undefined);
    assert.strictEqual(wc.sent.length, 0);
  });

  test('fast 但缺坐标时不拦截（按 index/selector 的点击仍走常规路径）', () => {
    const wc = makeWc();
    assert.strictEqual(runBlock({ fast: true, index: 3 }, wc), undefined);
    assert.strictEqual(wc.sent.length, 0);
  });
});
