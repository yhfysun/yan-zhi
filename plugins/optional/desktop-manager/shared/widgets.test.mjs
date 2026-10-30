// 悬浮组件校验器单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWidget, validateWidgets, widgetCatalog, CONTRACTS, dedupeWidgets } from './widgets.js';

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

test('天气 / 待办组件：必须声明契约，配置有默认值', () => {
  const noSrc = validateWidget({ id: 'w-weather', type: 'weather', pos: { x: 10, y: 10, w: 300, h: 220 } }, B);
  assert.equal(noSrc.ok, false, 'weather 必须带 source.contract');
  assert.match(String(noSrc.error), /source\.contract/);

  const w = validateWidget({
    id: 'w-weather', type: 'weather', layer: 'desktop',
    pos: { x: 10, y: 10, w: 300, h: 220 },
    source: { contract: 'weather.current' },
    config: { city: '成都' },
  }, B);
  assert.equal(w.ok, true);
  assert.equal(w.widget.config.city, '成都');
  assert.equal(w.widget.config.title, '天气', '未填标题用默认');
  assert.equal(w.widget.config.days, 2);

  const t = validateWidget({
    id: 'w-todos', type: 'todos', pos: { x: 10, y: 10, w: 300, h: 240 },
    source: { contract: 'todos.list' }, config: {},
  }, B);
  assert.equal(t.ok, true);
  assert.equal(t.widget.config.max, 6);

  const unknownCity = validateWidget({
    id: 'w-weather2', type: 'weather', pos: { x: 0, y: 0, w: 300, h: 200 },
    source: { contract: 'nope.contract' }, config: {},
  }, B);
  assert.equal(unknownCity.ok, false);
});

test('唯一性：时钟/待办/同城天气全局只能一个，备忘录与文件夹不设限', () => {
  const mk = (id, type, config = {}, contract) => ({
    id, type, pos: { x: 0, y: 0, w: 300, h: 200 },
    source: contract ? { contract } : null, config,
  });
  const two = validateWidgets([
    mk('clock-a', 'clock'),
    mk('clock-b', 'clock'),
  ], B);
  assert.equal(two.ok, false);
  assert.match(two.error, /时钟/);

  const twoTodos = validateWidgets([
    mk('todos-a', 'todos', { max: 6 }, 'todos.list'),
    mk('todos-b', 'todos', { max: 6 }, 'todos.list'),
  ], B);
  assert.equal(twoTodos.ok, false);

  // 不同城市可以并存，同城不行
  const cities = validateWidgets([
    mk('wx-bj', 'weather', { city: '北京' }, 'weather.current'),
    mk('wx-sh', 'weather', { city: '上海' }, 'weather.current'),
  ], B);
  assert.equal(cities.ok, true);
  const sameCity = validateWidgets([
    mk('wx-1', 'weather', { city: '北京' }, 'weather.current'),
    mk('wx-2', 'weather', { city: '北京' }, 'weather.current'),
  ], B);
  assert.equal(sameCity.ok, false);

  // 备忘录按 id、文件夹按路径，本来就允许并存
  const memos = validateWidgets([
    mk('memo-a', 'memo', {}, 'memo.text'),
    mk('memo-b', 'memo', {}, 'memo.text'),
  ], B);
  assert.equal(memos.ok, true);

  // 老数据去重：保留先出现的
  const deduped = dedupeWidgets([mk('c1', 'clock'), mk('c2', 'clock'), mk('t1', 'todos', {}, 'todos.list')]);
  assert.deepEqual(deduped.map((w) => w.id), ['c1', 't1']);
});
