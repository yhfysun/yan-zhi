// 提交后页面判定（2026-10-24，P2-1 观察内联）
// 从 main.cjs 的 ===SUBMIT-VERDICT-START/END=== 哨兵之间抽出真实代码，在假页面世界里**真跑**。
//
// 为什么值得真跑：这段判定决定模型"提交成功没有" —— 判错会让它要么谎报成功、
// 要么对着已经成功的页面反复提交。它跑在每一次提交之后，成本极低但不能出错。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===SUBMIT-VERDICT-START===');
const end = mainCjs.indexOf('// ===SUBMIT-VERDICT-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 SUBMIT-VERDICT 哨兵块');

const block = mainCjs.slice(start, end) + '\nreturn yzSubmitVerdict;';

/** 假页面世界：body.innerText + form 列表 + 控件数量 */
function run({ text = '', forms = [], inputs = 0, href = 'https://example.com/form' } = {}) {
  const doc = {
    body: { innerText: text },
    querySelectorAll(sel) {
      if (sel === 'form') return forms;
      if (sel.indexOf('input:not') === 0) return new Array(inputs).fill({});
      return [];
    },
  };
  const loc = { href };
  const factory = new Function('document', 'location', block);
  return factory(doc, loc)();
}

test('页面出现「保存成功」→ 判为成功提示', () => {
  const v = run({ text: '恭喜，保存成功', inputs: 0 });
  assert.strictEqual(v.successText, '保存成功');
  assert.strictEqual(v.validText, '');
});

test('页面出现「请填写姓名」→ 判为校验提示（提交未通过）', () => {
  const v = run({ text: '请填写姓名后重试', inputs: 3 });
  assert.strictEqual(v.validText, '请填写');
  assert.strictEqual(v.successText, '');
});

test('中性页面：无提示、仍有可见表单 → 两者皆空且表单数 > 0', () => {
  const v = run({ text: '新建用户', inputs: 2, forms: [{ offsetParent: {} }] });
  assert.strictEqual(v.successText, '');
  assert.strictEqual(v.validText, '');
  assert.strictEqual(v.forms, 1);
  assert.strictEqual(v.inputs, 2);
});

test('折叠/隐藏的表单不计入 forms（避免误判"还停在表单上"）', () => {
  const v = run({ text: '', forms: [{ offsetParent: null }, { offsetParent: null }] });
  assert.strictEqual(v.forms, 0);
});

test('页面结构异常（取 innerText 抛错）→ 返回 null，不把提交判成失败', () => {
  const doc = {
    get body() { throw new Error('boom'); },
    querySelectorAll() { return []; },
  };
  const factory = new Function('document', 'location', block);
  const v = factory(doc, { href: 'https://example.com/x' })();
  assert.strictEqual(v, null);
});
