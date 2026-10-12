// navigate 自建分支"同 URL 复用"单元测试（2026-10-12）
// 直接从 main.cjs 抽取 ===NAV-REUSE-START/END=== 哨兵之间的真实代码，
// 在注入的假状态（agentTouchedTabs / webviewTabs / broadcastTabUrl / createBrowserTab）下执行，
// 验证：连败重试不再每次都新建 tab 壳（2026-10-12 14:35~14:40 tab-1~tab-6 连号堆积的防回归）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===NAV-REUSE-START===');
const end = mainCjs.indexOf('// ===NAV-REUSE-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 NAV-REUSE 哨兵块');

function runBlock(state) {
  // 把真实代码包进 factory，注入假状态；block 内引用的自由变量全部由参数提供
  const factory = new Function(
    'state', 'agentTouchedTabs', 'webviewTabs', 'broadcastTabUrl', 'createBrowserTab', 'markConvTabTouched', 'convId', 'tabId', 'cleanUrl', 'wantScope',
    mainCjs.slice(start, end) + '\nreturn { tabId, created: state.created, reused: state.reused };'
  );
  state.created = []; state.reused = null;
  const createBrowserTab = (scope) => { const id = 'tab-' + (++state.seq); state.created.push(id); return id; };
  return factory(
    state, state.agentTouchedTabs, state.webviewTabs, state.broadcastTabUrl,
    createBrowserTab, state.markConvTabTouched || (() => {}),
    state.convId, state.tabId ?? null, state.cleanUrl, state.wantScope || 'preview',
  );
}

function mkState(over = {}) {
  return Object.assign({
    seq: 0,
    agentTouchedTabs: new Map(),
    webviewTabs: new Map(),
    broadcastTabUrl: new Map(),
    markConvTabTouched: () => {},
    convId: 'conv-A',
    tabId: null,
    cleanUrl: 'https://example.com',
  }, over);
}

test('首次 navigate：无同 URL tab → 新建并返回新 tabId', () => {
  const st = mkState();
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '应新建 1 个 tab');
  assert.strictEqual(r.tabId, r.created[0]);
});

test('连败重试：本会话已有同 URL 存活 tab → 复用，不再新建（核心防回归）', () => {
  const st = mkState();
  // 模拟第一次自建成功登记
  st.agentTouchedTabs.set('tab-1', 'conv-A');
  st.webviewTabs.set('tab-1', { scope: 'preview', wcId: 7 });
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 0, '不得新建 tab（2026-10-12 tab-1~tab-6 堆积根因）');
  assert.strictEqual(r.tabId, 'tab-1', '必须复用已有 tab');
});

test('URL 归一化：协议尾斜杠大小写差异视为同 URL', () => {
  const st = mkState({ cleanUrl: 'https://EXAMPLE.com/' });
  st.agentTouchedTabs.set('tab-1', 'conv-A');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-1', 'http://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 0);
  assert.strictEqual(r.tabId, 'tab-1');
});

test('别人的页不复用：同 URL 但属于其他会话 → 新建', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-9', 'conv-B');
  st.webviewTabs.set('tab-9', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-9', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '绝不复用其他会话的 tab');
});

test('URL 不同不复用：本会话 tab 在别的页 → 新建', () => {
  const st = mkState({ cleanUrl: 'https://creator.douyin.com/creator-micro/content/upload' });
  st.agentTouchedTabs.set('tab-1', 'conv-A');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1);
});

test('已死 tab 不复用：webviewTabs 里已无该条目 → 新建', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-1', 'conv-A');           // 记账还在
  st.webviewTabs.delete('tab-1');                        // 但 tab 已被逐出/关闭
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '死亡 tab 不得复用');
});

test('tabClosed 后 URL 记账已清 → 不复用（陈旧防误判）', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-1', 'conv-A');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  // broadcastTabUrl 无该条目（broadcastTabClosed 已 delete）
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1);
});

test('变异验证：把复用条件恒假化 → 测试必须红（守卫有效性自证）', () => {
  // 抽出的代码里把 `owner !== String(convId)` 改成恒 true（永不 continue）→ 等于"别人的页也复用"
  const mutated = mainCjs.slice(start, end).replace('owner !== String(convId)', 'false');
  const st = mkState();
  st.agentTouchedTabs.set('tab-9', 'conv-B');
  st.webviewTabs.set('tab-9', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-9', 'https://example.com');
  const factory = new Function(
    'state', 'agentTouchedTabs', 'webviewTabs', 'broadcastTabUrl', 'createBrowserTab', 'markConvTabTouched', 'convId', 'tabId', 'cleanUrl', 'wantScope',
    mutated + '\nreturn { tabId, created: state.created };'
  );
  st.created = [];
  const createBrowserTab = (scope) => { const id = 'tab-' + (++st.seq); st.created.push(id); return id; };
  const r = factory(st, st.agentTouchedTabs, st.webviewTabs, st.broadcastTabUrl, createBrowserTab, st.markConvTabTouched, st.convId, st.tabId, st.cleanUrl, 'preview');
  assert.strictEqual(r.created.length, 0, '变异后应错误地复用别人的 tab（证明测试有杀伤力）');
  assert.strictEqual(r.tabId, 'tab-9');
});
