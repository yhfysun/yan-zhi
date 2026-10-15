// navigate 自建分支"同 URL 复用"单元测试（2026-10-12；2026-10-15 随 flowKey 维度更新）
// 直接从 main.cjs 抽取 ===NAV-REUSE-START/END=== 哨兵之间的真实代码，
// 在注入的假状态（agentTouchedTabs / webviewTabs / broadcastTabUrl / createBrowserTab）下执行，
// 验证：连败重试不再每次都新建 tab 壳（2026-10-12 14:35~14:40 tab-1~tab-6 连号堆积的防回归）。
//
// ★ 2026-10-15：归属维度由 `convId` 改成 **flowKey**（`${convId}::${flow}`，见 browser-target.cjs 的
//   flowKeyOf）。复用口径随之由"本会话的页"收紧为"**本流**的页"——同一会话里另一条流
//   （如后台标签页流）的页**不复用**（它的 URL 记账属于它自己，复用会把两条流塞进同一个 tab）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===NAV-REUSE-START===');
const end = mainCjs.indexOf('// ===NAV-REUSE-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 NAV-REUSE 哨兵块');

/** 哨兵块里引用的自由变量（改 main.cjs 的写法时必须同步这里） */
const FREE_VARS = ['state', 'agentTouchedTabs', 'webviewTabs', 'broadcastTabUrl', 'createBrowserTab', 'markFlowTabTouched', 'flowKey', 'tabId', 'cleanUrl', 'wantScope'];

function runBlock(state, source) {
  // 把真实代码包进 factory，注入假状态；block 内引用的自由变量全部由参数提供
  const factory = new Function(
    ...FREE_VARS,
    (source || mainCjs.slice(start, end)) + '\nreturn { tabId, created: state.created, reused: state.reused };'
  );
  state.created = []; state.reused = null;
  const createBrowserTab = (scope) => { const id = 'tab-' + (++state.seq); state.created.push(id); return id; };
  return factory(
    state, state.agentTouchedTabs, state.webviewTabs, state.broadcastTabUrl,
    createBrowserTab, state.markFlowTabTouched || (() => {}),
    state.flowKey, state.tabId ?? null, state.cleanUrl, state.wantScope || 'preview',
  );
}

function mkState(over = {}) {
  return Object.assign({
    seq: 0,
    agentTouchedTabs: new Map(),
    webviewTabs: new Map(),
    broadcastTabUrl: new Map(),
    markFlowTabTouched: () => {},
    flowKey: 'conv-A::shared',
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

test('连败重试：本流已有同 URL 存活 tab → 复用，不再新建（核心防回归）', () => {
  const st = mkState();
  // 模拟第一次自建成功登记
  st.agentTouchedTabs.set('tab-1', 'conv-A::shared');
  st.webviewTabs.set('tab-1', { scope: 'preview', wcId: 7 });
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 0, '不得新建 tab（2026-10-12 tab-1~tab-6 堆积根因）');
  assert.strictEqual(r.tabId, 'tab-1', '必须复用已有 tab');
});

test('URL 归一化：协议尾斜杠大小写差异视为同 URL', () => {
  const st = mkState({ cleanUrl: 'https://EXAMPLE.com/' });
  st.agentTouchedTabs.set('tab-1', 'conv-A::shared');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-1', 'http://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 0);
  assert.strictEqual(r.tabId, 'tab-1');
});

test('别人的页不复用：同 URL 但属于其他会话 → 新建', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-9', 'conv-B::shared');
  st.webviewTabs.set('tab-9', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-9', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '绝不复用其他会话的 tab');
});

test('★★ 同一会话里**另一条流**的页也不复用（后台标签页流不该被并进主面板流）', () => {
  const st = mkState();                                    // 本流 = conv-A::shared
  st.agentTouchedTabs.set('tab-9', 'conv-A::bg:sub:tc-1'); // 同会话、但另一条流
  st.webviewTabs.set('tab-9', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-9', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '★ 按 convId 匹配会把两条流并进同一个 tab（后台页被主面板抢走）');
  assert.strictEqual(r.tabId, r.created[0], '本流必须另开自己的页');
});

test('URL 不同不复用：本流 tab 在别的页 → 新建', () => {
  const st = mkState({ cleanUrl: 'https://creator.douyin.com/creator-micro/content/upload' });
  st.agentTouchedTabs.set('tab-1', 'conv-A::shared');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1);
});

test('已死 tab 不复用：webviewTabs 里已无该条目 → 新建', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-1', 'conv-A::shared');      // 记账还在
  st.webviewTabs.delete('tab-1');                          // 但 tab 已被逐出/关闭
  st.broadcastTabUrl.set('tab-1', 'https://example.com');
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1, '死亡 tab 不得复用');
});

test('tabClosed 后 URL 记账已清 → 不复用（陈旧防误判）', () => {
  const st = mkState();
  st.agentTouchedTabs.set('tab-1', 'conv-A::shared');
  st.webviewTabs.set('tab-1', { scope: 'preview' });
  // broadcastTabUrl 无该条目（broadcastTabClosed 已 delete）
  const r = runBlock(st);
  assert.strictEqual(r.created.length, 1);
});

test('变异验证：把复用条件恒假化 → 测试必须红（守卫有效性自证）', () => {
  // 抽出的代码里把 `owner !== flowKey` 改成恒 true（永不 continue）→ 等于"别人的页也复用"
  const mutated = mainCjs.slice(start, end).replace('owner !== flowKey', 'false');
  assert.notStrictEqual(mutated, mainCjs.slice(start, end), '★ 变异锚点失效：哨兵块里已无 `owner !== flowKey`');
  const st = mkState();
  st.agentTouchedTabs.set('tab-9', 'conv-B::shared');
  st.webviewTabs.set('tab-9', { scope: 'preview' });
  st.broadcastTabUrl.set('tab-9', 'https://example.com');
  const r = runBlock(st, mutated);
  assert.strictEqual(r.created.length, 0, '变异后应错误地复用别人的 tab（证明测试有杀伤力）');
  assert.strictEqual(r.tabId, 'tab-9');
});
