// 显式移交的守门测试：登记后两条路（显式 tabId / 走锚）都能落到游戏页，
// 别的流仍被拒，收回后立刻恢复拒绝 —— 这是「看的那页 = 操作的那页」的底线。
const test = require('node:test');
const assert = require('node:assert');
const { createHandoffRegistry, resolveTarget } = require('../browser-target.cjs');

const FLOW = 'conv1::shared';

function reg(alive = true) {
  return createHandoffRegistry({ isAlive: () => alive });
}

test('registry: register / ownerOf / release / releaseForFlow', () => {
  const r = reg();
  r.register('tab-9', FLOW);
  assert.equal(r.ownerOf('tab-9'), FLOW);
  assert.equal(r.isHandoffTab('tab-9'), true);
  assert.equal(r.isHandoffTab('tab-8'), false);
  r.release('tab-9');
  assert.equal(r.ownerOf('tab-9'), null);
  r.register('tab-1', FLOW);
  r.register('tab-2', 'other::shared');
  assert.deepEqual(r.releaseForFlow(FLOW), ['tab-1']);
  assert.equal(r.size(), 1);
});

test('dead tab is not treated as a live handoff (no ghost tabId)', () => {
  const r = reg(false);
  r.register('tab-9', FLOW);
  assert.equal(r.ownerOf('tab-9'), null);
  assert.equal(r.size(), 0);
});

test('handoff makes explicit tabId pass the isMine gate', () => {
  const r = reg();
  r.register('tab-9', FLOW);
  const isMine = (t) => r.ownerOf(t) === FLOW;
  const out = resolveTarget('conv1', 'tab-9', 'get_page_content', { isMine });
  assert.deepEqual(out, { ok: true, tabId: 'tab-9' });
});

test('another conversation still cannot touch the handed-off tab', () => {
  const r = reg();
  r.register('tab-9', FLOW);
  const out = resolveTarget('conv2', 'tab-9', 'screenshot', {
    isMine: (t) => r.ownerOf(t) === 'conv2::shared',
  });
  assert.equal(out.ok, false);
});

test('after release, explicit tabId is rejected again', () => {
  const r = reg();
  r.register('tab-9', FLOW);
  r.release('tab-9');
  const out = resolveTarget('conv1', 'tab-9', 'get_page_content', {
    isMine: (t) => r.ownerOf(t) === FLOW,
  });
  assert.equal(out.ok, false);
});

test('without explicit tabId the anchor/pin resolves to the game tab', () => {
  const noAnchor = resolveTarget('conv1', null, 'get_page_content', {
    anchored: 'tab-9', isMine: () => true,
  });
  assert.deepEqual(noAnchor, { ok: true, tabId: 'tab-9' });
  const pinned = resolveTarget('conv1', null, 'click', {
    anchored: 'tab-1', pinned: 'tab-9', isMine: () => true,
  });
  assert.deepEqual(pinned, { ok: true, tabId: 'tab-9' });
});

test('pin forbids new_tab / switch_tab during handoff', () => {
  const a = resolveTarget('conv1', null, 'new_tab', { pinned: 'tab-9', isMine: () => true });
  assert.equal(a.ok, false);
  const b = resolveTarget('conv1', 'tab-9', 'switch_tab', { pinned: 'tab-9', isMine: () => true });
  assert.equal(b.ok, false);
});
