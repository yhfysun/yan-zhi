// click 遮挡感知 + 自动关闭遮挡层 单元测试（2026-10-12）
// 直接从 main.cjs 抽取 ===OCCLUSION-START/END=== 哨兵之间的真实代码，在最小 fake DOM 下执行，
// 不依赖 jsdom / electron，验证「发布按钮被悬浮层遮挡」时 click 的行为契约。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===OCCLUSION-START===');
const end = mainCjs.indexOf('// ===OCCLUSION-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 OCCLUSION 哨兵块');
const block = mainCjs.slice(start, end);

function loadBlock() {
  // 把真实代码包进 factory，注入 fake 全局（window/document/MouseEvent/KeyboardEvent/setTimeout/A）
  const factory = new Function(
    'window', 'document', 'MouseEvent', 'KeyboardEvent', 'setTimeout', 'A',
    block + '\nreturn { detectOcclusion, tryDismiss, clickEl };'
  );
  return factory;
}

function makeEl(opts) {
  const events = [];
  const el = {
    tagName: (opts.tag || 'BUTTON').toUpperCase(),
    className: opts.className || '',
    attrs: opts.attrs || {},
    _text: opts.text || '',
    children: opts.children || [],
    clicked: 0,
    events,
    get textContent() { return this._text; },
    getAttribute(k) { return this.attrs[k]; },
    contains() { return false; },
    getBoundingClientRect() { return opts.rect; },
    scrollIntoView() {},
    dispatchEvent(ev) { events.push(ev); return true; },
    click() { this.clicked++; },
    querySelectorAll() { return this.children; },
    isConnected: true,
  };
  return el;
}

function makeEnv() {
  let topAt = null; // elementFromPoint 的返回值（由测试设置）
  const docEvents = [];
  const window = { innerWidth: 1000, innerHeight: 800 };
  const document = {
    elementFromPoint() { return topAt; },
    dispatchEvent(ev) { docEvents.push(ev); return true; },
  };
  function MouseEvent(type, opts) { this.type = type; this.opts = opts || {}; }
  function KeyboardEvent(type, opts) { this.type = type; this.opts = opts || {}; }
  const A = {
    genSel: (el) => (el && el.tagName ? el.tagName.toLowerCase() : 'x'),
    clickAt: () => 'stub',
  };
  const factory = loadBlock();
  const api = factory(window, document, MouseEvent, KeyboardEvent, setTimeout, A);
  return { api, setTop: (el) => { topAt = el; }, docEvents };
}

test('未遮挡：直接 DOM 点击目标，不触发任何 dismiss', async () => {
  const env = makeEnv();
  const target = makeEl({ tag: 'button', rect: { x: 100, y: 100, width: 80, height: 40 }, text: '发布' });
  env.setTop(target); // elementFromPoint 命中目标本身 → 未遮挡
  const res = await env.api.clickEl(target);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.via, 'dom-click');
  assert.strictEqual(res.occluded, undefined, '未遮挡不应带 occluded 字段');
  assert.strictEqual(target.clicked, 1, '目标应被 DOM 点击一次');
  assert.strictEqual(env.docEvents.length, 0, '不应派发任何关闭事件');
});

test('被遮挡 + 有关闭按钮：自动点关闭控件后再点真实目标', async () => {
  const env = makeEnv();
  const target = makeEl({ tag: 'button', rect: { x: 100, y: 100, width: 80, height: 40 }, text: '发布' });
  const closeBtn = makeEl({ tag: 'button', text: '×' }); // 关闭控件（×）
  const overlay = makeEl({ tag: 'div', text: '提示', children: [closeBtn] });
  env.setTop(overlay); // 目标中心被 overlay 盖住
  const res = await env.api.clickEl(target);
  assert.strictEqual(res.occluded, true, '应回报 occluded:true');
  assert.strictEqual(res.autoDismissed, true, '应尝试自动关闭遮挡层');
  assert.ok(res.covering && res.covering.tag === 'div', 'covering 应含遮挡层信息');
  assert.strictEqual(closeBtn.clicked, 1, '应点中关闭控件');
  assert.strictEqual(target.clicked, 1, '关闭遮挡层后仍应对真实目标派发 DOM 点击');
  assert.match(res.note, /已尝试自动关闭遮挡层/, 'note 应说明已尝试关闭');
});

test('被遮挡 + 无显式关闭控件：退 Esc 关闭，再点真实目标', async () => {
  const env = makeEnv();
  const target = makeEl({ tag: 'button', rect: { x: 100, y: 100, width: 80, height: 40 }, text: '发布' });
  const overlay = makeEl({ tag: 'div', text: '上传中…', children: [] }); // 无关闭控件
  env.setTop(overlay);
  const res = await env.api.clickEl(target);
  assert.strictEqual(res.occluded, true);
  assert.strictEqual(res.autoDismissed, true, '无关闭控件也应经 Esc 尝试关闭');
  const esc = env.docEvents.find((e) => e.type === 'keydown' && e.opts && e.opts.key === 'Escape');
  assert.ok(esc, '应派发 Escape keydown');
  assert.strictEqual(target.clicked, 1, '仍应对真实目标派发 DOM 点击');
});

test('被遮挡 + 关闭控件靠 aria-label 识别：不误点"确定"等肯定动作', async () => {
  const env = makeEnv();
  const target = makeEl({ tag: 'button', rect: { x: 100, y: 100, width: 80, height: 40 }, text: '发布' });
  const okBtn = makeEl({ tag: 'button', text: '确定' }); // 肯定动作，绝不该被点
  const closeBtn = makeEl({ tag: 'button', attrs: { 'aria-label': '关闭' }, text: 'x' });
  const overlay = makeEl({ tag: 'div', text: '确认发布？', children: [okBtn, closeBtn] });
  env.setTop(overlay);
  const res = await env.api.clickEl(target);
  assert.strictEqual(res.occluded, true);
  assert.strictEqual(closeBtn.clicked, 1, '应点中 aria-label=关闭 的控件');
  assert.strictEqual(okBtn.clicked, 0, '绝不应点中"确定"等肯定动作');
  assert.strictEqual(target.clicked, 1);
});
