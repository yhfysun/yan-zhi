// 组件工具测试（desktop_widget_set / desktop_widget_list）
import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopManagerModule, aiCacheKey } from './index.js';

function setup() {
  const store = new Map();
  const tools = new Map();
  const ctx = {
    storage: {
      get: async (k) => store.get(k),
      set: async (k, v) => { store.set(k, v); },
      delete: async (k) => { store.delete(k); },
    },
    registerTool: (t) => { tools.set(t.name, t); },
    registerBackendRoute: () => {},
    log: () => {},
  };
  desktopManagerModule.activate(ctx);
  const run = async (name, args) => {
    const r = await tools.get(name).execute(args || {}, {});
    return JSON.parse(r.content[0].text);
  };
  return {
    run,
    store,
    cleanup: () => { try { desktopManagerModule.deactivate(); } catch { /* ignore */ } },
  };
}

test('desktop_widget_list：空桌面返回空列表 + 类型目录', async () => {
  const { run, cleanup } = setup();
  try {
    const r = await run('desktop_widget_list');
    assert.deepEqual(r.widgets, []);
    assert.ok(r.catalog.types.includes('clock'));
    assert.ok(r.catalog.types.includes('weather'));
    assert.ok(r.catalog.contracts.includes('desktop.recent'));
    assert.equal(r.catalog.limits.maxWidgets, 12);
  } finally {
    cleanup();
  }
});

test('desktop_widget_set：缺 id 自动生成，组件落盘并 bump rev', async () => {
  const { run, store, cleanup } = setup();
  try {
    const r = await run('desktop_widget_set', {
      widgets: [
        { type: 'clock', config: { showSeconds: true } },
        { type: 'text', config: { text: '专注' } },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.widgets.length, 2);
    for (const w of r.widgets) assert.match(w.id, /^w-[a-z]+-[0-9a-f]{8}$/);
    assert.deepEqual(await store.get('widgets'), r.widgets);
    assert.equal(await store.get('rev'), 1);
  } finally {
    cleanup();
  }
});

test('desktop_widget_set：非法类型整组拒绝，已有组件不被覆盖', async () => {
  const { run, store, cleanup } = setup();
  try {
    await store.set('widgets', [{ id: 'keep', type: 'clock', layer: 'desktop', pos: { x: 0, y: 0, w: 200, h: 100 }, source: null, config: { showSeconds: false } }]);
    const r = await run('desktop_widget_set', { widgets: [{ type: 'nope' }] });
    assert.equal(r.ok, false);
    assert.match(r.error, /未知组件类型/);
    assert.deepEqual(await store.get('widgets'), [{ id: 'keep', type: 'clock', layer: 'desktop', pos: { x: 0, y: 0, w: 200, h: 100 }, source: null, config: { showSeconds: false } }]);
  } finally {
    cleanup();
  }
});

test('desktop_widget_set：唯一性冲突与越界坐标钳制', async () => {
  const { run, cleanup } = setup();
  try {
    const dup = await run('desktop_widget_set', {
      widgets: [
        { id: 'c1', type: 'clock', config: {} },
        { id: 'c2', type: 'clock', config: {} },
      ],
    });
    assert.equal(dup.ok, false);
    assert.match(dup.error, /只能有一个/);

    const clamped = await run('desktop_widget_set', {
      bounds: { w: 800, h: 600 },
      widgets: [{ id: 'note', type: 'text', pos: { x: 9999, y: 9999, w: 5000, h: 5000 }, config: { text: 'x' } }],
    });
    assert.equal(clamped.ok, true);
    const w = clamped.widgets[0];
    assert.ok(w.pos.x + w.pos.w <= 800);
    assert.ok(w.pos.y + w.pos.h <= 600);
    assert.ok(w.pos.w <= 800);
    assert.ok(w.pos.h <= 600);
  } finally {
    cleanup();
  }
});

test('aiCacheKey：排序后哈希（顺序无关），内容不同则不同', () => {
  const a = aiCacheKey(['b.txt', 'a.txt'], ['合同', '财务']);
  const b = aiCacheKey(['a.txt', 'b.txt'], ['财务', '合同']);
  assert.equal(a, b);
  assert.notEqual(a, aiCacheKey(['a.txt'], ['合同', '财务']));
  assert.notEqual(a, aiCacheKey(['a.txt', 'b.txt'], ['合同']));
  assert.match(a, /^[0-9a-f]{40}$/);
});
