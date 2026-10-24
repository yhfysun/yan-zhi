// run_script 熔断计数（2026-10-24，P2）
// 从 main.cjs 抽出真的 scriptGateCheck 函数，用假 wc 真跑。
//
// 为什么值得真跑：它决定"什么时候拒绝脚本"。判定写错有两个方向的代价 ——
// 阈值永远不会触发（等于没做熔断），或换页不重置（正常任务被误杀）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const m = mainCjs.match(/async function scriptGateCheck\(wc\) \{[\s\S]*?\n\}/);
assert.ok(m, 'main.cjs 中未找到 scriptGateCheck');
const scriptGateCheck = new Function(`return (${m[0]});`)();

/** 假 wc：把注入的表达式放到带 window/location 的沙箱里求值 */
function makeWc(state) {
  return {
    async executeJavaScript(src) {
      const fn = new Function('window', 'location', `return ${String(src).trim()}`);
      return fn(state.window, { href: state.url });
    },
  };
}

test('同页连续调用按 1,2,3… 递增', async () => {
  const state = { window: {}, url: 'https://a.example/form' };
  const wc = makeWc(state);
  const seq = [];
  for (let i = 0; i < 5; i++) seq.push(await scriptGateCheck(wc));
  assert.deepStrictEqual(seq, [1, 2, 3, 4, 5]);
});

test('换页后计数清零（正常任务不会被上一页的次数误杀）', async () => {
  const state = { window: {}, url: 'https://a.example/form' };
  const wc = makeWc(state);
  for (let i = 0; i < 9; i++) await scriptGateCheck(wc);
  assert.strictEqual(await scriptGateCheck(wc), 10, '同页第 10 次');

  state.url = 'https://a.example/step2';
  assert.strictEqual(await scriptGateCheck(wc), 1, '★ 换页必须从 1 重新计数');
});

test('注入失败时返回 0（不误触发熔断）', async () => {
  const wc = { async executeJavaScript() { throw new Error('webview 未就绪'); } };
  assert.strictEqual(await scriptGateCheck(wc), 0);
});
