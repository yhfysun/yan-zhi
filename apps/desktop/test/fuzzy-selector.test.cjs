// 文本模糊匹配单测（P0，2026-10-19）
// 直接从 main.cjs 抽取 ===FUZZY-START/END=== 哨兵之间的真实代码，在最小 fake DOM 下执行。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===FUZZY-START===');
const end = mainCjs.indexOf('// ===FUZZY-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 FUZZY 哨兵块');
const block = mainCjs.slice(start, end);
// 源码里的这段代码位于模板字符串内，`\\s` 在运行时会被还原为 `\s`；
// 抽取后需要做一次同样的反转义，否则 new Function 会把正则当成字面反斜杠。
const runtimeBlock = block.replace(/\\\\/g, '\\');

function loadBlock(document) {
  const factory = new Function('document', runtimeBlock + '\nreturn { yzTextNorm, yzTextScore, yzFuzzyFind, yzResolveFuzzy };');
  return factory(document);
}

function makeEl(tag, text, ariaLabel = '', visible = true) {
  return {
    tagName: tag.toUpperCase(),
    textContent: text,
    offsetParent: visible ? {} : null,
    getAttribute(name) { return name === 'aria-label' ? ariaLabel : null; },
  };
}

function fakeDoc(elements) {
  return {
    querySelectorAll(selector) {
      return elements.filter((el) => selector === '*' || el.tagName.toLowerCase() === selector.toLowerCase());
    },
  };
}

test('文本相似度：完全相同 / 包含 / 字符重合', () => {
  const { yzTextScore } = loadBlock(fakeDoc([]));
  assert.strictEqual(yzTextScore('发布视频', '发布视频'), 3);
  assert.strictEqual(yzTextScore(' 发布 视频 ', '发布视频'), 3);
  assert.strictEqual(yzTextScore('立即发布视频', '发布视频'), 2);
  assert.strictEqual(yzTextScore('发布视频按钮', '发布视频'), 2);
  assert.strictEqual(yzTextScore('发布视频', '登录账号'), 0);
});

test('fuzzyFind：同标签 + 相似文本可重定位', () => {
  const target = makeEl('button', '发布视频');
  const others = makeEl('button', '取消');
  const doc = fakeDoc([others, target]);
  const { yzFuzzyFind } = loadBlock(doc);
  const found = yzFuzzyFind({ tag: 'button', text: '发布视频（3）', aria: '' });
  assert.strictEqual(found, target);
});

test('fuzzyFind：优先 aria-label，且忽略不可见元素', () => {
  const visible = makeEl('a', '', '立即发布');
  const hidden = makeEl('a', '', '立即发布', false);
  const doc = fakeDoc([hidden, visible]);
  const { yzFuzzyFind } = loadBlock(doc);
  assert.strictEqual(yzFuzzyFind({ tag: 'a', text: '', aria: '发布' }), visible);
});

test('resolveFuzzy：支持 :has-text 与 :contains', () => {
  const login = makeEl('button', '登录 / 注册');
  const cancel = makeEl('button', '取消');
  const doc = fakeDoc([login, cancel]);
  const { yzResolveFuzzy } = loadBlock(doc);
  assert.deepStrictEqual(yzResolveFuzzy('button:has-text("登录")'), [login]);
  assert.deepStrictEqual(yzResolveFuzzy('button:contains("登录")'), [login]);
  assert.deepStrictEqual(yzResolveFuzzy('button:has-text("不存在的文案")'), []);
});

test('resolveFuzzy：没有伪选择器时返回空数组（不做全局猜测）', () => {
  const { yzResolveFuzzy } = loadBlock(fakeDoc([makeEl('button', '登录')]));
  assert.deepStrictEqual(yzResolveFuzzy('#login'), []);
});
