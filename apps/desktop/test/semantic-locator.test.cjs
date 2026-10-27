// 语义 locator 单测（2026-10-27）
//
// 直接从 main.cjs 抽取 ===FUZZY-START=== 到 ===SEMANTIC-LOCATOR-END=== 之间的真实代码，
// 在最小 fake DOM 下执行 —— 与 fuzzy-selector.test.cjs 同一套路（哨兵切片 + 真跑）。
// 目的：证明「文本 / role / label / near / 意图权重 / 歧义候选 / 可见性 / 嵌套去重」的语义，
// 而不是只断言源码里有某个字符串。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===FUZZY-START===');
const end = mainCjs.indexOf('// ===SEMANTIC-LOCATOR-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 FUZZY/SEMANTIC 哨兵块');
// 源码这段位于模板字符串内：`\\s` 运行时才是 `\s`，抽取后要同样反转义
const runtimeBlock = mainCjs.slice(start, end).replace(/\\\\/g, '\\');

function load(document, opts = {}) {
  let nextIndex = 0;
  const register = (el) => (el.__idx != null ? el.__idx : (el.__idx = nextIndex++));
  const genSel = (el) => (el.tag ? el.tag + (el.id ? '#' + el.id : '') : '*');
  const yzNormText = (s) => String(s == null ? '' : s)
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const factory = new Function(
    'document', 'register', 'genSel', 'yzNormText',
    runtimeBlock + '\nreturn { yzResolveSemantic, semAccName, semRole, semLabelText, semNear, semScore, yzSemanticCandidates };',
  );
  return factory(document, opts.register || register, opts.genSel || genSel, yzNormText);
}

// ---------- fake DOM ----------
function makeEl(o = {}) {
  const el = {
    tag: String(o.tag || 'div').toLowerCase(),
    text: o.text || '',
    id: o.id || '',
    type: o.type || '',
    value: o.value || '',
    checked: !!o.checked,
    disabled: !!o.disabled,
    isContentEditable: !!o.contentEditable,
    offsetParent: o.visible === false ? null : {},
    attrs: o.attrs || {},
    parentElement: null,
    previousElementSibling: null,
    _labelParent: o.labelParent || null,
    get tagName() { return this.tag.toUpperCase(); },
    get textContent() { return this.text; },
    get innerText() { return this.text; },
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : null; },
    hasAttribute(k) { return this.attrs[k] != null; },
    getBoundingClientRect() { return o.visible === false ? { width: 0, height: 0 } : { width: 80, height: 24 }; },
    closest(sel) { return sel === 'label' ? this._labelParent : null; },
    contains(other) {
      let cur = other;
      while (cur) { if (cur === this) return true; cur = cur.parentElement; }
      return false;
    },
  };
  if (o.parent) { el.parentElement = o.parent; }
  return el;
}

/** parent 里塞 children，并维护 previousElementSibling */
function nest(parent, children) {
  children.forEach((c, i) => {
    c.parentElement = parent;
    c.previousElementSibling = i > 0 ? children[i - 1] : null;
  });
  return parent;
}

function makeDoc(interactive, o = {}) {
  return {
    labels: o.labels || {},
    labelFor: o.labelFor || {},
    querySelector(sel) {
      const m = /^label\[for="([^"]+)"\]$/.exec(sel);
      if (m) return this.labelFor[m[1]] || null;
      return null;
    },
    getElementById(id) { return this.labels[id] || null; },
    querySelectorAll(sel) {
      if (sel === 'body *') return o.all || interactive;
      return interactive; // 交互池选择器：测试里由用例自行组织
    },
  };
}

// ---------- 用例 ----------

test('accessible name：aria-label 优先于 placeholder 与文本', () => {
  const el = makeEl({ tag: 'button', text: '按钮文字', attrs: { 'aria-label': '关闭弹窗' } });
  const { semAccName } = load(makeDoc([el]));
  assert.strictEqual(semAccName(el), '关闭弹窗');
});

test('accessible name：label[for] 与就近 label', () => {
  const input = makeEl({ tag: 'input', id: 'title', text: '' });
  const label = makeEl({ tag: 'label', text: '作品标题' });
  const doc = makeDoc([input], { labelFor: { title: label } });
  const { semAccName } = load(doc);
  assert.strictEqual(semAccName(input), '作品标题');

  const input2 = makeEl({ tag: 'input', text: '', labelParent: makeEl({ tag: 'label', text: '简介' }) });
  const { semAccName: acc2 } = load(makeDoc([input2]));
  assert.strictEqual(acc2(input2), '简介');
});

test('role：显式 role 与隐式 role 推断', () => {
  const { semRole } = load(makeDoc([]));
  assert.strictEqual(semRole(makeEl({ tag: 'span', attrs: { role: 'menuitem' } })), 'menuitem');
  assert.strictEqual(semRole(makeEl({ tag: 'button' })), 'button');
  assert.strictEqual(semRole(makeEl({ tag: 'a', attrs: { href: '/x' } })), 'link');
  assert.strictEqual(semRole(makeEl({ tag: 'input', type: 'checkbox' })), 'checkbox');
  assert.strictEqual(semRole(makeEl({ tag: 'input', type: 'text' })), 'textbox');
  assert.strictEqual(semRole(makeEl({ tag: 'textarea' })), 'textbox');
});

test('role 过滤：同名文本按 role 只挑匹配项', () => {
  const btn = makeEl({ tag: 'button', text: '设置' });
  const item = makeEl({ tag: 'span', text: '设置', attrs: { role: 'menuitem' } });
  const { yzResolveSemantic } = load(makeDoc([btn, item]));
  const r = yzResolveSemantic({ text: '设置', role: 'menuitem' }, 'click');
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.el, item);
});

test('exact：完全相等才算命中；默认允许包含', () => {
  const el = makeEl({ tag: 'button', text: '立即发布视频' });
  const { yzResolveSemantic } = load(makeDoc([el]));
  assert.strictEqual(yzResolveSemantic({ text: '发布', exact: true }, 'click').status, 'not_found');
  assert.strictEqual(yzResolveSemantic({ text: '发布视频' }, 'click').status, 'ok');
  assert.strictEqual(yzResolveSemantic({ text: '立即发布视频', exact: true }, 'click').status, 'ok');
});

test('near：同名按钮靠邻近文字消歧；不命中则不参与', () => {
  const card = makeEl({ tag: 'div', text: '作品合集 请选择' });
  const collectEl = makeEl({ tag: 'button', text: '选择' });
  nest(card, [collectEl]);
  const coverBtn = makeEl({ tag: 'button', text: '选择' });
  const { yzResolveSemantic } = load(makeDoc([collectEl, coverBtn]));
  const r = yzResolveSemantic({ text: '选择', near: '合集' }, 'click');
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.el, collectEl);
});

test('意图权重：多个同文本候选时，意图匹配者排第一（点击优先 button）', () => {
  const btn = makeEl({ tag: 'button', text: '发布' });
  const div = makeEl({ tag: 'div', text: '发布', attrs: { onclick: 'x()' } });
  const { yzResolveSemantic } = load(makeDoc([div, btn]));
  const r = yzResolveSemantic({ text: '发布' }, 'click');
  // 命中多个 → 按约定返回候选（不自动点）；但 button 必须排在普通 div 前面
  assert.strictEqual(r.status, 'ambiguous');
  assert.strictEqual(r.candidates[0].tag, 'button', '意图权重未生效：普通 div 排在了 button 前面');

  const input = makeEl({ tag: 'input', type: 'text', text: '', attrs: { placeholder: '标题' } });
  const label = makeEl({ tag: 'span', text: '标题' });
  const { yzResolveSemantic: resolve2 } = load(makeDoc([label, input]));
  const t = resolve2({ label: '标题' }, 'type');
  assert.strictEqual(t.status, 'ok');
  assert.strictEqual(t.el, input);
});

test('不可见元素一律排除', () => {
  const hidden = makeEl({ tag: 'button', text: '发布', visible: false });
  const { yzResolveSemantic } = load(makeDoc([hidden]));
  assert.strictEqual(yzResolveSemantic({ text: '发布' }, 'click').status, 'not_found');
});

test('嵌套去重：button 与其内部 span 同名只算一个候选', () => {
  const span = makeEl({ tag: 'span', text: '发布' });
  const btn = makeEl({ tag: 'button', text: '发布' });
  nest(btn, [span]);
  const { yzResolveSemantic } = load(makeDoc([btn, span]));
  const r = yzResolveSemantic({ text: '发布' }, 'click');
  assert.strictEqual(r.status, 'ok', '同名嵌套被算成两个候选 → 假歧义');
  assert.strictEqual(r.el, btn);
});

test('歧义：两个同分候选时返回候选列表（含 index/selector）且不执行', () => {
  const a = makeEl({ tag: 'button', text: '选择' });
  const b = makeEl({ tag: 'button', text: '选择' });
  const { yzResolveSemantic } = load(makeDoc([a, b]));
  const r = yzResolveSemantic({ text: '选择' }, 'click');
  assert.strictEqual(r.status, 'ambiguous');
  assert.strictEqual(r.candidates.length, 2);
  for (const c of r.candidates) {
    assert.ok(typeof c.index === 'number');
    assert.ok(typeof c.selector === 'string' && c.selector.length > 0);
    assert.strictEqual(c.tag, 'button');
    assert.strictEqual(c.role, 'button');
  }
});

test('只有 exact/near 而没有 text/role/label 时不命中（交给上层判 invalid）', () => {
  const el = makeEl({ tag: 'button', text: '发布' });
  const { yzResolveSemantic } = load(makeDoc([el]));
  assert.strictEqual(yzResolveSemantic({ exact: true }, 'click').status, 'not_found');
});

// ---------- 接线守卫（只保证「每个动作真的接了语义分支」，行为由上面的真跑用例保证） ----------
test('接线：所有支持 target 的动作都调用了 resolveSemantic', () => {
  const intents = ['click', 'type', 'hover', 'scroll', 'select', 'check'];
  for (const intent of intents) {
    assert.ok(
      mainCjs.includes(`resolveSemantic(a.target,'${intent}')`) || mainCjs.includes(`resolveSemantic(a.target, '${intent}')`),
      `动作 ${intent} 没有接语义定位分支`,
    );
  }
});

test('去重：容器祖先（文本更长、分数更低）不混进候选清单', () => {
  const card = makeEl({ tag: 'div', text: '作品合集 选择', attrs: { onclick: 'x()' } });
  const btn = makeEl({ tag: 'button', text: '选择' });
  nest(card, [btn]);
  const { yzResolveSemantic } = load(makeDoc([card, btn]));
  const r = yzResolveSemantic({ text: '选择' }, 'click');
  assert.strictEqual(r.status, 'ok', '容器祖先被当成第二个候选 → 假歧义');
  assert.strictEqual(r.el, btn);
});
