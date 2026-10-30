import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAPSED_H,
  TOOLBAR_ENTRY,
  fenceEntry,
  widgetEntry,
  isChildEntry,
  fenceWindowRect,
  widgetWindowRect,
  desiredWindows,
  diffWindows,
} from './desktop-windows.js';

test('入口规则：每个分组/组件各一个窗口，query 不同就是不同窗口', () => {
  assert.equal(fenceEntry('f-doc'), 'frontend/fence.html?fence=f-doc');
  assert.equal(widgetEntry('w1'), 'frontend/widgets.html?id=w1&layer=desktop');
  assert.equal(isChildEntry(fenceEntry('inbox')), true);
  assert.equal(isChildEntry(widgetEntry('w1')), true);
  // 工具条本身、设置页、悬浮层都不属于「子窗口」
  assert.equal(isChildEntry(TOOLBAR_ENTRY), false);
  assert.equal(isChildEntry('frontend/settings.html'), false);
  assert.equal(isChildEntry('frontend/widgets.html?layer=overlay'), false);
});

test('分组窗口尺寸：窗口 = rect；折叠只留标题栏高且不改持久化 rect', () => {
  const fence = { id: 'f-doc', rect: { x: 40, y: 40, w: 400, h: 320 } };
  assert.deepEqual(fenceWindowRect(fence), { x: 40, y: 40, w: 400, h: 320 });
  assert.deepEqual(fenceWindowRect({ ...fence, collapsed: true }), { x: 40, y: 40, w: 400, h: COLLAPSED_H });
  assert.equal(fence.rect.h, 320);
  // 缺 rect 的老数据用默认值，不至于开出一个 0×0 的窗口
  assert.deepEqual(fenceWindowRect({ id: 'x' }), { x: 40, y: 40, w: 400, h: 320 });
});

test('组件窗口尺寸：窗口 = pos', () => {
  assert.deepEqual(widgetWindowRect({ pos: { x: 10, y: 20, w: 280, h: 130 } }), { x: 10, y: 20, w: 280, h: 130 });
});

test('desiredWindows：空分组不开窗，待归类始终开；只取桌面层组件', () => {
  const fences = [
    { id: 'inbox', rect: { x: 40, y: 40, w: 400, h: 320 } },
    { id: 'f-doc', rect: { x: 456, y: 40, w: 400, h: 320 } },
    { id: 'f-empty', rect: { x: 872, y: 40, w: 400, h: 320 } },
    { id: 'f-mine', pinned: true, rect: { x: 1328, y: 40, w: 400, h: 320 } },
  ];
  const items = [{ fenceId: 'f-doc', name: 'a.pdf' }];
  const widgets = [
    { id: 'w1', layer: 'desktop', pos: { x: 10, y: 10, w: 200, h: 100 } },
    { id: 'w2', layer: 'overlay', pos: { x: 0, y: 0, w: 200, h: 100 } },
  ];
  const out = desiredWindows({ fences, items, widgets });
  // 组件排前面（先钉 = 在下面），分组后钉压在上面
  assert.deepEqual(out.map((d) => d.entry), [
    'frontend/widgets.html?id=w1&layer=desktop',
    'frontend/fence.html?fence=inbox',
    'frontend/fence.html?fence=f-doc',
    'frontend/fence.html?fence=f-mine',
  ]);
});

test('diffWindows：缺的开、多的收（只动子窗口）', () => {
  const desired = desiredWindows({
    fences: [{ id: 'inbox', rect: { x: 40, y: 40, w: 400, h: 320 } }],
    items: [],
    widgets: [],
  });
  const open = [
    { entry: 'frontend/fence.html?fence=f-gone', windowId: 'pw-1' },
    { entry: 'frontend/fence.html?fence=inbox', windowId: 'pw-2' },
  ];
  const d = diffWindows(open, desired);
  assert.deepEqual(d.open.map((x) => x.entry), []);
  assert.deepEqual(d.close.map((x) => x.windowId), ['pw-1']);

  const d2 = diffWindows([], desired);
  assert.deepEqual(d2.open.map((x) => x.entry), ['frontend/fence.html?fence=inbox']);
  assert.deepEqual(d2.close, []);
});
