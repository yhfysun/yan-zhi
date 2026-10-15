// 选择器未命中时的**候选清单**（2026-10-15）
// 从 main.cjs 的 ===NOTFOUND-START/END=== 哨兵之间抽出真实代码，在注入的假页面世界里**真跑**。
//
// 为什么值得真跑：这段逻辑跑在"每一次选择器没匹配到"的路径上（实测当天 34 次），
// 而它的产物直接决定模型下一步怎么走 —— 给出候选 ⇒ 一次往返就能改对；
// 只报"未找到" ⇒ 换文案瞎猜 → 撞循环闸门 → 最后去写 run_script 穷举 DOM（实测那天 189 次）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===NOTFOUND-START===');
const end = mainCjs.indexOf('// ===NOTFOUND-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 NOTFOUND 哨兵块');

/** 最小页面世界：querySelectorAll 返回给定元素；A.register/genSel 用假实现 */
function makeWorld(elements, opts = {}) {
  const doc = {
    querySelectorAll(sel) {
      if (opts.throwOn && opts.throwOn === sel) throw new Error('invalid selector');
      return elements;
    },
  };
  const A = { register: (el) => el.__idx, genSel: (el) => el.__sel || '' };
  return { doc, A };
}

function runBlock(world) {
  const factory = new Function('document', 'A', mainCjs.slice(start, end) + '\nreturn notFound;');
  return factory(world.doc, world.A);
}

const el = (i, tag, text, visible = true) => ({
  __idx: i, tagName: tag.toUpperCase(), textContent: text,
  offsetParent: visible ? {} : null, __sel: 'sel-' + i,
});

test('未命中 → 附上**同一基选择器**下可见元素的编号与文本（模型一次往返就能改对）', () => {
  const notFound = runBlock(makeWorld([el(7, 'button', '  查看  '), el(8, 'button', '删除')]));
  const r = notFound('tr:contains("骨债阴阳") .arco-link:contains("查看")');
  assert.match(r.error, /元素未找到/);
  assert.strictEqual(r.candidates.length, 2, '★ 没给出候选 ⇒ 模型只能继续换选择器猜');
  assert.strictEqual(r.candidates[0].index, 7);
  assert.strictEqual(r.candidates[0].tag, 'button');
  assert.strictEqual(r.candidates[0].text, '查看', '文本应 trim');
  assert.match(r.hint, /index/, '提示必须指向"挑一个 index 重试"');
});

test('候选只收**可见**元素（不可见的不该混进来让模型点空）', () => {
  const notFound = runBlock(makeWorld([el(1, 'button', '隐藏的', false), el(2, 'button', '看得见的')]));
  const r = notFound('button:contains("随便写个文案")');
  assert.strictEqual(r.candidates.length, 1);
  assert.strictEqual(r.candidates[0].index, 2);
});

test('一个可见元素都没有 → 不硬造 candidates，退回原提示（并说清"可能还没渲染出来"）', () => {
  const notFound = runBlock(makeWorld([]));
  const r = notFound('.arco-drawer-footer button:contains("提交")');
  assert.strictEqual(r.candidates, undefined);
  assert.match(r.hint, /index/);
});

test('候选上限 10（防一次回执把整页元素塞回上下文）', () => {
  const many = Array.from({ length: 50 }, (_, i) => el(i, 'li', 'x' + i));
  const notFound = runBlock(makeWorld(many));
  assert.strictEqual(notFound('li:contains("x")').candidates.length, 10);
});

test('基选择器非法（querySelectorAll 抛错）→ 退回通用可选元素集，不把异常抛给调用方', () => {
  // `*:contains("别名管理")` 的基是 `*` —— 故意让它在假世界里抛错
  const notFound = runBlock(makeWorld([el(3, 'a', '链接')], { throwOn: '*' }));
  const r = notFound('*:contains("别名管理")');
  assert.ok(r.candidates, '★ 基选择器非法时直接放弃候选 → 又回到"未找到"死胡同');
  assert.strictEqual(r.candidates[0].index, 3);
});
