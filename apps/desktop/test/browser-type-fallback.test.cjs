// browser_type JS 回退路径 单元测试（2026-10-26）
//
// 复现的实报故障：`browser_click` 报「yzSnap is not defined」。根因是
//   yzSnap / yzFinish 只存在于注入脚本（injectYzAssistant 的 IIFE）闭包里，
//   各 action 的 executeJavaScript 是**另一次**执行，裸调它们必然 ReferenceError。
//   次路径（CDP 输入不可用时的 JS 回退）里同样有裸调用 —— 本测试直接抽取 main.cjs
//   中那段真实脚本、在最小 fake DOM 下执行，证明别名可用且能走完 type → finish。
//
// ★ 为什么不用字符串断言：项目多次被"源码里有这段字符串 = 测试绿"坑过（假绿）。
//   这里真执行：修之前 typeEl 内部抛 ReferenceError → finish 永不调用 → 断言失败。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const OPEN = 'return await wc.executeJavaScript(`var __yzFF=function(el,v){';
const start = mainCjs.indexOf(OPEN);
const end = mainCjs.indexOf('})()`);', start);
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 type 回退脚本（executeJavaScript 模板串）');

/** 抽取真实脚本并把模板插值替换成固定值 */
function extractTypeScript() {
  let raw = mainCjs.slice(start + 'return await wc.executeJavaScript(`'.length, end) + '})()';
  raw = raw.replace('${FIELD_FLASH_BODY}', '');
  // 变量名会随重构变化（args / typeArgs）：按形态替换，而不是写死一个名字
  raw = raw.replace(/\$\{JSON\.stringify\([^)]*\)\}/, JSON.stringify({ index: 1, text: 'hi' }));
  assert.ok(!raw.includes('${'), 'type 脚本里仍有未替换的模板插值');
  return raw;
}

function makeEl() {
  return {
    tagName: 'INPUT',
    isConnected: true,
    value: '',
    scrollIntoView() {},
    getBoundingClientRect() { return { x: 10, y: 20, width: 100, height: 24 }; },
    dispatchEvent() { return true; },
  };
}

function makeHarness(opts = {}) {
  const calls = { snap: 0, finish: [] };
  const snapValue = { url: 'https://example.test/p', t: 'before', n: 7 };
  const A = {
    snap() { calls.snap++; return snapValue; },
    finish(r, b) { calls.finish.push({ r, b }); return Object.assign({ status: 'ok' }, r); },
    typeIn() { return { applied: true, value: 'hi' }; },
    showCursor() {},
    register() { return 1; },
    genSel() { return 'input'; },
    resolveAll() { return []; },
    resolveFuzzy() { return []; },
    fuzzyFind() { return null; },
  };
  const el = makeEl();
  const win = opts.noAssistant
    ? { __yzElements: { 1: el }, __yzSelMap: {}, __yzMeta: {} }
    : { __yzAssistant: A, __yzElements: { 1: el }, __yzSelMap: {}, __yzMeta: {} };
  const doc = { activeElement: el };
  return { A, calls, snapValue, win, doc };
}

function run(raw, env) {
  // 捕获 IIFE 的返回值（not_injected 分支要读）
  const body = raw.replace('(function(){', 'globalThis.__typeRun = (function(){');
  const fn = new Function('window', 'document', 'KeyboardEvent', '__yzFF', body + '\n//# sourceURL=type-fallback');
  fn(env.win, env.doc, function KeyboardEvent() {}, function __yzFF() {});
  return globalThis.__typeRun;
}

test('type 回退路径：裸调 yzSnap/yzFinish 已改为别名，能走完 type → finish', async () => {
  const env = makeHarness();
  run(extractTypeScript(), env);
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(env.calls.snap, 1, 'yzSnap 应立即拿到 A.snap 的快照');
  assert.strictEqual(env.calls.finish.length, 1, '应调用一次 yzFinish（修前会 ReferenceError 导致 0 次）');
  assert.deepStrictEqual(env.calls.finish[0].b, env.snapValue, 'finish 的 before 必须是动作前快照');
  assert.strictEqual(env.calls.finish[0].r.success, true);
  assert.strictEqual(env.calls.finish[0].r.value, 'hi');
});

test('type 回退路径：辅助脚本未注入时返回结构化状态而不是抛错', () => {
  const env = makeHarness({ noAssistant: true });
  const out = run(extractTypeScript(), env);
  assert.ok(out && typeof out === 'object', 'IIFE 应返回结构化对象');
  assert.strictEqual(out.status, 'not_injected');
  assert.ok(String(out.hint || '').length > 0, '应给出可行动的下一步');
  assert.strictEqual(env.calls.finish.length, 0);
});
