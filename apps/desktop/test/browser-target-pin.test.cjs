// 目标页锁定（P3-6，2026-10-16）——「页面对话任务期间不许换标签页」的行为测试。
//
// ★ 为什么必须真跑（这是本仓反复栽的那一类）：判错了的表现是
//   "动作打到别的页上**且不报错**"，用户看到的是一句看起来正常的错答案。
//   纯文本断言（"源码里有 pinned 这个词"）完全证明不了"分支顺序对不对""会不会被前面的分支短路"。
//
// ★ 判据与 main.cjs 的 runBrowserAction 必须同形：本文件用**真的** browser-target.cjs
//   （判定本体）驱动一个复刻 main.cjs 记账层的小世界，与 browser-two-flows.test.cjs 同一手法。
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const bt = require(path.join(__dirname, '..', 'browser-target.cjs'));

const MAIN_SRC = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const PRELOAD_SRC = fs.readFileSync(path.join(__dirname, '..', 'preload.cjs'), 'utf8');

/** 复刻 main.cjs 的记账层（锚 / 归属 / 活动页 / 锁定），判据全部取真模块 */
function makeWorld() {
  const convAnchors = new Map();       // flowKey → tabId
  const agentTouchedTabs = new Map();  // tabId → flowKey
  const tabs = new Set(['tab-user', 'tab-other']);
  let seq = 10;

  const w = {
    convAnchors, agentTouchedTabs,
    activeTabId: 'tab-user',
    pins: bt.createFlowPinRegistry({ isAlive: (t) => tabs.has(t) }),
    tabs,
    anchorOf(flowKey) {
      const tid = convAnchors.get(flowKey);
      if (!tid) return null;
      if (!tabs.has(tid)) { convAnchors.delete(flowKey); return null; }
      return tid;
    },
    touch(flowKey, tabId) { agentTouchedTabs.set(String(tabId), flowKey); },
    setAnchor(flowKey, tabId) {
      const prev = convAnchors.get(flowKey);
      if (prev && prev !== tabId) w.touch(flowKey, prev);
      w.touch(flowKey, tabId);
      convAnchors.set(flowKey, tabId);
    },
    newTab() { const id = 'tab-' + (++seq); tabs.add(id); return id; },
    closeTab(id) { tabs.delete(id); },
    /** ★ 与 main.cjs runBrowserAction 的 opts 逐字同形（含 P3-6 的 pinned） */
    opts(flowKey, isBg) {
      return {
        anchored: w.anchorOf(flowKey),
        pinned: w.pins.resolve(flowKey),
        activeTabId: isBg ? null : w.activeTabId,
        isMine: (t) => agentTouchedTabs.get(t) === flowKey,
        isCurrentView: (t) => t === w.activeTabId,
        isOwnedByOther: (t) => {
          const owner = agentTouchedTabs.get(String(t));
          return !!owner && owner !== flowKey;
        },
      };
    },
    resolve(flowKey, rawTab, action, isBg = false) {
      return bt.resolveTarget('conv-A', rawTab, action, w.opts(flowKey, isBg));
    },
  };
  return w;
}

const FK = 'conv-A::shared';

test('锁定期间：无显式 tabId 的动作**落在锁定页**，而不是锚、更不是"用户当前在看的那一页"', () => {
  const w = makeWorld();
  const pinned = 'tab-user';
  w.pins.set(FK, pinned);
  // 先制造"锚在别处"和"用户在别的页"两种会抢走目标的局面
  w.setAnchor(FK, w.newTab());          // 锚跑到 tab-11
  w.activeTabId = 'tab-other';          // 用户自己点开了另一页

  assert.equal(w.resolve(FK, null, 'get_page_content').tabId, pinned);
  assert.equal(w.resolve(FK, null, 'click').tabId, pinned);
  assert.equal(w.resolve(FK, null, 'navigate').tabId, pinned, '页内导航也应落在锁定页');
});

test('锁定期间：new_tab / switch_tab 一律拒绝（漂移的两条成因）', () => {
  const w = makeWorld();
  w.pins.set(FK, 'tab-user');
  const nt = w.resolve(FK, null, 'new_tab');
  assert.equal(nt.ok, false);
  assert.match(nt.error, /锁定/);
  assert.match(nt.error, /移交给主智能体/, '拒绝话术必须给出口');

  // ★ switch_tab 自带 tabId：若"显式 tabId 优先"排在前面，这条会被**静默放行** ——
  //   所以这里专门用"属于本流的 tabId"来钉住分支顺序。
  const other = w.newTab();
  w.touch(FK, other);
  const st = w.resolve(FK, other, 'switch_tab');
  assert.equal(st.ok, false, '★ switch_tab 被显式 tabId 分支短路放行了（分支顺序错）');
});

test('锁定期间：显式 tabId 的**定向读**仍然放行（工具契约），且不改操作目标', () => {
  const w = makeWorld();
  w.pins.set(FK, 'tab-user');
  const other = w.newTab();
  w.touch(FK, other);
  const r = w.resolve(FK, other, 'get_page_content');
  assert.equal(r.ok, true);
  assert.equal(r.tabId, other, '定向读是工具契约允许的，锁不该把它也拦掉');
  // 目标没被改：下一次无 tabId 的动作仍回锁定页
  assert.equal(w.resolve(FK, null, 'get_text').tabId, 'tab-user');
});

test('锁定**不放松**越权闸门：别的会话的 tab 仍被拒', () => {
  const w = makeWorld();
  w.pins.set(FK, 'tab-user');
  const foreign = w.newTab();
  w.touch('conv-B::shared', foreign);      // 属于别的会话
  const r = w.resolve(FK, foreign, 'get_page_content');
  assert.equal(r.ok, false);
  assert.match(r.error, /不属于本会话/);
});

test('解锁后行为回到原样（锁定必须是可逆的，否则下一次任务被上一页钉死）', () => {
  const w = makeWorld();
  w.pins.set(FK, 'tab-user');
  assert.equal(w.resolve(FK, null, 'get_page_content').tabId, 'tab-user');
  w.pins.clear(FK);
  // 解锁后：无锚 + 非建页类 → 明确报错（与改动前逐字一致）
  assert.equal(w.resolve(FK, null, 'get_page_content').ok, false);
  assert.equal(w.resolve(FK, null, 'new_tab').ok, true);
});

test('锁定页被关掉 → 锁定自动失效（绝不返回幽灵 tabId）', () => {
  const w = makeWorld();
  w.pins.set(FK, 'tab-user');
  w.closeTab('tab-user');
  assert.equal(w.pins.resolve(FK), null);
  assert.equal(w.pins.size(), 0, '失效的锁定要顺手清掉，别留着占位');
  // 失效后不能再"锁着"：此时应回到"无锚 → 报错"，而不是返回一个不存在的 tab
  const r = w.resolve(FK, null, 'get_page_content');
  assert.equal(r.ok, false);
});

test('tab 关闭时按 tab 收口：指向它的锁定全部清掉（唯一入口）', () => {
  const w = makeWorld();
  const t = w.newTab();
  w.pins.set(FK, t);
  w.pins.set('conv-C::shared', t);
  w.pins.set('conv-D::shared', 'tab-user');
  w.pins.clearForTab(t);
  assert.equal(w.pins.resolve(FK), null);
  assert.equal(w.pins.resolve('conv-C::shared'), null);
  assert.equal(w.pins.resolve('conv-D::shared'), 'tab-user', '别的页的锁定不能被误伤');
});

test('★ 没锁定时的行为与改动前逐字一致（pinned 缺省 ⇒ 老路径不动）', () => {
  const w = makeWorld();
  // 无锚 + 建页类 → 可从"当前可见页"回落（2026-10-10 那次修复的语义）
  assert.equal(w.resolve(FK, null, 'navigate').tabId, 'tab-user');
  // 无锚 + 非建页类 → 报错
  assert.equal(w.resolve(FK, null, 'get_page_content').ok, false);
  // 有锚 → 用锚
  const t = w.newTab();
  w.setAnchor(FK, t);
  assert.equal(w.resolve(FK, null, 'get_page_content').tabId, t);
  // 别的会话占着的可见页 → 不回落（★ 必须用一个**没有锚**的流，否则"用锚"会先命中，
  //   测到的是锚那条分支，而不是回落那条 —— 我第一版就写错了这里）
  const foreign = w.newTab();
  w.touch('conv-B::shared', foreign);
  w.activeTabId = foreign;
  assert.equal(w.resolve('conv-E::shared', null, 'navigate').tabId, null);
});

test('★ main.cjs 与 preload 必须真的接上锁定（漏一处 = 面板钉了个寂寞）', () => {
  assert.match(MAIN_SRC, /createFlowPinRegistry/, 'main.cjs 没建锁定表');
  assert.match(MAIN_SRC, /pinned:\s*resolveFlowPinForFlow\(flowKey\)/, '★ resolveTarget 调用没传 pinned');
  assert.match(MAIN_SRC, /ipcMain\.handle\('browserView:pinTarget'/, '缺钉页 IPC');
  assert.match(MAIN_SRC, /ipcMain\.handle\('browserView:unpinTarget'/, '缺解锁 IPC');
  assert.match(MAIN_SRC, /flowPins\.clearForTab\(tid\)/, '★ tab 关闭路径没清锁定（会留幽灵锁定）');
  assert.match(PRELOAD_SRC, /pinTarget:/, 'preload 没暴露 pinTarget');
  assert.match(PRELOAD_SRC, /unpinTarget:/, 'preload 没暴露 unpinTarget');
});
