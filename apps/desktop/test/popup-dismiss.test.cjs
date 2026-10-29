// 弹窗关闭键识别脚本的守门测试。
// 动态行为已在真实布局上验过（大浮层 + 无文字角落 × → via=corner；「关闭」→ via=label；
// 「立即前往 / 领取」→ null）。这里钉住两件最容易回归的事：
//   ① 角落判定必须传 DOMRect（`overlayRect.r`），传包装对象会让 corner 永远 false；
//   ② 危险文案必须在排除名单里（误点=花钱/改变游戏状态）。
const test = require('node:test');
const assert = require('node:assert');
const { SCAN_JS } = require('../popup-dismiss.cjs');

test('SCAN_JS 是一段可注入的自执行脚本', () => {
  assert.equal(typeof SCAN_JS, 'string');
  assert.ok(SCAN_JS.length > 1000, '脚本太短，可能被截断');
  assert.match(SCAN_JS, /^\(function\(\)\{/);
  assert.match(SCAN_JS, /\}\)\(\)$/);
});

test('角落判定传的是 DOMRect（overlayRect.r），不是包装对象', () => {
  assert.match(SCAN_JS, /cornerDist\(r,\s*overlayRect\.r\)/);
  assert.doesNotMatch(SCAN_JS, /cornerDist\(r,\s*overlayRect\)/);
});

test('危险文案在排除名单里（不点领取/购买/充值/去看看/开始游戏）', () => {
  for (const w of ['领取', '购买', '充值', '去看看', '开始游戏']) {
    assert.ok(SCAN_JS.includes(w), `排除名单缺少「${w}」`);
  }
});

test('关闭类文案与角落兜底两种判据都在', () => {
  for (const w of ['关闭', '知道了', '跳过', '取消', 'close']) {
    assert.ok(SCAN_JS.includes(w), `关闭文案缺少「${w}」`);
  }
  assert.match(SCAN_JS, /cursor===?'pointer'/);
  assert.match(SCAN_JS, /via:\s*hit\s*\?\s*'label'\s*:\s*'corner'/);
});
