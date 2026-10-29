'use strict';
// 插件窗口快捷键 · 清单规范化（apps/desktop/plugin-hotkeys.cjs）
// 纯逻辑，不碰 Electron：注册本身在 main.cjs 的 setGlobalHotkey 里。
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePluginHotkeys, sanitizeAccelerator } = require('../plugin-hotkeys.cjs');

const valid = {
  pluginId: 'desktop-manager',
  windowId: 'fence',
  entry: 'frontend/fence.html',
  placement: 'desktop',
  accelerator: 'Control+Alt+D',
  title: '桌面管理 · 围栏',
};

test('合法条目原样保留，并给出稳定的 key', () => {
  const m = normalizePluginHotkeys([valid]);
  assert.equal(m.size, 1);
  const spec = m.get('desktop-manager/fence');
  assert.equal(spec.entry, 'frontend/fence.html');
  assert.equal(spec.placement, 'desktop');
  assert.equal(spec.accelerator, 'Control+Alt+D');
});

test('非法插件/窗口 id 直接丢弃（不让越界 id 混进 IPC 面）', () => {
  const m = normalizePluginHotkeys([
    { ...valid, pluginId: 'Bad Id' },
    { ...valid, windowId: '../evil' },
    { ...valid, windowId: 'Fence' },
  ]);
  assert.equal(m.size, 0);
});

test('entry 必须是插件包内相对 html（挡绝对路径 / 越界 / 非页面）', () => {
  for (const entry of ['/abs/fence.html', '../../fence.html', 'frontend/fence.mjs', '']) {
    const m = normalizePluginHotkeys([{ ...valid, entry }]);
    assert.equal(m.size, 0, `应丢弃 ${entry}`);
  }
});

test('没有组合的条目不入表（用户禁用 = 不占坑）', () => {
  assert.equal(normalizePluginHotkeys([{ ...valid, accelerator: '' }]).size, 0);
  assert.equal(normalizePluginHotkeys([{ ...valid, accelerator: '   ' }]).size, 0);
});

test('单字母/无修饰键的组合一律拒绝，功能键放行', () => {
  assert.equal(sanitizeAccelerator('D'), '');
  assert.equal(sanitizeAccelerator('F5'), 'F5');
  assert.equal(sanitizeAccelerator('Control+Alt+D'), 'Control+Alt+D');
  assert.equal(sanitizeAccelerator('Control+Alt+'), '');
  assert.equal(sanitizeAccelerator('Control+Alt+Delete; rm'), '');
});

test('未知 placement 落回 normal，rect 只留数字分量', () => {
  const m = normalizePluginHotkeys([
    { ...valid, placement: 'floating', rect: { x: '10', y: 20, w: 300, h: 200, width: 999 } },
  ]);
  const spec = m.get('desktop-manager/fence');
  assert.equal(spec.placement, 'normal');
  assert.deepEqual(spec.rect, { x: 10, y: 20, w: 300, h: 200 });
});

test('同一窗口重复出现只认第一条', () => {
  const m = normalizePluginHotkeys([
    valid,
    { ...valid, accelerator: 'Control+Alt+F' },
  ]);
  assert.equal(m.get('desktop-manager/fence').accelerator, 'Control+Alt+D');
});

test('非数组输入不抛异常，返回空表', () => {
  assert.equal(normalizePluginHotkeys(undefined).size, 0);
  assert.equal(normalizePluginHotkeys(null).size, 0);
  assert.equal(normalizePluginHotkeys('oops').size, 0);
});
