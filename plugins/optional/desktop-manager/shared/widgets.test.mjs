// 悬浮组件校验器单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidget, validateWidgets, widgetCatalog, CONTRACTS } from './widgets.js';

const B = { w: 1280, h: 800 };

test('时钟组件：可不带 source，位置钳制在屏幕内', () => {
  const r = validateWidget({ id: 'w-clock', type: 'clock', pos: { x: 5000, y: -20, w: 9999, h: 40 } }, B);
  assert.equal(r.ok, true);
  assert.equal(r.widget.pos.x, 1280 - r.widget.pos.w);
  assert.equal(r.widget.pos.y, 0);
  assert.ok(r.widget.pos.w <= 1200);
  assert.ok(r.widget.pos.h >= 60);
  assert.equal(r.widget.layer, 'desktop');
});

test('未知类型 / 非法 id / 非法 layer 被拒', () => {
  assert.equal(validateWidget({ id: 'w', type: 'iframe' }, B).ok, false);
  assert.equal(validateWidget({ id: 'Bad Id', type: 'clock' }, B).ok, false);
  assert.equal(validateWidget({ id: 'w', type: 'clock', layer: 'top' }, B).ok, false);
});

test('list/metric/status 必须给合法契约', () => {
  assert.equal(validateWidget({ id: 'w', type: 'list' }, B).ok, false);
  assert.equal(validateWidget({ id: 'w', type: 'list', source: { contract: 'nope' } }, B).ok, false);
  const ok = validateWidget({ id: 'w', type: 'list', source: { contract: 'desktop.recent' } }, B);
  assert.equal(ok.ok, true);
  assert.equal(ok.widget.source.contract, 'desktop.recent');
});

test('配置按 schema 校验与填默认', () => {
  const list = validateWidget({ id: 'w', type: 'list', source: { contract: 'desktop.recent' } }, B);
  assert.equal(list.widget.config.max, 6);

  const text = validateWidget({ id: 'w', type: 'text' }, B);
  assert.equal(text.ok, false); // text 必填

  const link = validateWidget({ id: 'w', type: 'link', config: { label: '打开' } }, B);
  assert.equal(link.ok, false); // path 必填

  const badSize = validateWidget({ id: 'w', type: 'text', config: { text: 'hi', size: 'xl' } }, B);
  assert.equal(badSize.ok, false);

  const tooLong = validateWidget({ id: 'w', type: 'text', config: { text: 'x'.repeat(201) } }, B);
  assert.equal(tooLong.ok, false);
});

test('整组：id 重复 / 超量 / 非数组被拒', () => {
  assert.equal(validateWidgets('nope', B).ok, false);
  assert.equal(validateWidgets([
    { id: 'same', type: 'clock' },
    { id: 'same', type: 'clock' },
  ], B).ok, false);
  assert.equal(validateWidgets(new Array(13).fill(0).map((_, i) => ({ id: 'w' + i, type: 'clock' })), B).ok, false);
  assert.equal(validateWidgets([{ id: 'w', type: 'clock' }], B).ok, true);
});

test('目录：类型/层级/契约清单齐备', () => {
  const c = widgetCatalog();
  assert.ok(c.types.includes('clock'));
  assert.ok(c.layers.includes('overlay'));
  assert.deepEqual(c.contracts, CONTRACTS);
  assert.ok(c.configSchema.clock);
});
