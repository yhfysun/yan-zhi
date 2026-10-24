// 原生 checkbox 点击护栏（2026-10-24）
// 从 main.cjs 的 ===CHECKBOX-GUARD-START/END=== 哨兵之间抽出真实代码，在假页面世界里**真跑**。
//
// 为什么需要它：模型习惯用一个 click 勾一个原生 checkbox，每勾一个多一轮推理，还会漏勾。
// 护栏把这条慢路径挡掉并把整页 checkbox 候选回传，逼它改用一次 fill_form 勾齐。
// 但硬拒绝必须配逃生口 —— 模型若固执重试同一 index，无限拒绝会把任务烧到步数上限，
// 而这个 checkbox 本来点一下就成，所以同一目标拒满 2 次后放行。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===CHECKBOX-GUARD-START===');
const end = mainCjs.indexOf('// ===CHECKBOX-GUARD-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 CHECKBOX-GUARD 哨兵块');

const block = mainCjs.slice(start, end) + '\nreturn nativeCheckboxGuard;';

/** 最小页面世界：window.__yzElements 是编号注册表，document/location 用假实现 */
function runBlock(elements, href = 'https://example.com/form') {
  const win = { __yzElements: elements };
  const doc = { querySelector: () => null };
  const loc = { href };
  const factory = new Function('window', 'document', 'location', block);
  const guard = factory(win, doc, loc);
  return { guard, win, loc };
}

function cb(i, opts = {}) {
  return {
    tagName: 'INPUT',
    type: 'checkbox',
    isConnected: true,
    checked: Boolean(opts.checked),
    id: '',
    className: opts.cls || '',
    getAttribute(name) {
      if (name === 'role') return opts.role || null;
      if (name === 'aria-label') return opts.label || null;
      if (name === 'name') return opts.name || null;
      return null;
    },
    closest() { return null; },
  };
}

const button = {
  tagName: 'BUTTON', type: '', isConnected: true, checked: false, id: '', className: '',
  getAttribute() { return null; }, closest() { return null; },
};

test('原生 checkbox → 拒绝点击，并附整页 checkbox 候选（编号/标签/勾选态）', () => {
  const list = [button, cb(1, { label: '同意协议' })];
  const { guard } = runBlock(list);

  const r = guard(list[1], 'index 1');

  assert.ok(r, '★ 原生 checkbox 必须被拦下，否则模型继续逐个点');
  assert.strictEqual(r.status, 'rejected');
  assert.strictEqual(r.reason, 'native_checkbox');
  assert.strictEqual(r.candidates.length, 1, '候选清单让被拒的这一轮不白花');
  assert.deepStrictEqual(
    { index: r.candidates[0].index, label: r.candidates[0].label, checked: r.candidates[0].checked },
    { index: 1, label: '同意协议', checked: false },
  );
  assert.match(r.hint, /browser_fill_form/, '提示必须指向批量填表工具');
});

test('自定义控件（role=checkbox / 组件库 class）不拦 —— 它们本来就只能点', () => {
  const roleEl = cb(0, { role: 'checkbox', label: '假控件' });
  const classEl = cb(1, { cls: 'el-checkbox__original' });
  const list = [roleEl, classEl];
  const { guard } = runBlock(list);

  assert.strictEqual(guard(roleEl, 'index 0'), null);
  assert.strictEqual(guard(classEl, 'index 1'), null);
});

test('逃生口：同一目标拒满 2 次后放行（避免固执重试烧到步数上限）', () => {
  const list = [cb(0, { label: '甲' })];
  const { guard } = runBlock(list);

  assert.ok(guard(list[0], 'index 0'), '第 1 次拒绝');
  assert.ok(guard(list[0], 'index 0'), '第 2 次拒绝');
  assert.strictEqual(guard(list[0], 'index 0'), null, '第 3 次必须放行');
});

test('换页后拒绝计数清零（不同页面的同号元素互不影响）', () => {
  const list = [cb(0, { label: '甲' })];
  const { guard, loc } = runBlock(list);

  assert.ok(guard(list[0], 'index 0'));
  assert.ok(guard(list[0], 'index 0'));
  assert.strictEqual(guard(list[0], 'index 0'), null, '同页第 3 次放行');

  loc.href = 'https://example.com/step2';
  assert.ok(guard(list[0], 'index 0'), '★ 换页后必须重新开始拒绝（否则新页面上直接放行）');
});

test('非 checkbox 元素直接放行（护栏不能影响普通点击）', () => {
  const list = [button, cb(1, { label: '乙' })];
  const { guard } = runBlock(list);

  assert.strictEqual(guard(list[0], 'index 0'), null);
});
