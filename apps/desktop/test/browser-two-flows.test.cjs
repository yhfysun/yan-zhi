// 后台标签页并行：**双流锚/归属隔离**的行为测试（2026-10-15，方案 §4.3）
//
// 为什么要有这一份：方案要成立，靠的是"两条流各自一份锚、各自一份归属"——
// 判错了的表现是"后台流把用户正在看的页导航走"或"两条流读到对方的页"，
// 且**全程不报错**（本项目反复栽过的最难查的一类）。
//
// 本测试用**真的** browser-target.cjs（判定本体，纯函数）驱动一个复刻 main.cjs 会话记账层的
// 小世界，逐步走完"后台流建页 → 各自锚定 → 互相看不见"的全过程。
// ★ 判据必须与 main.cjs 的 runBrowserAction 逐字同形（同文件末尾有静态断言钉住这一点）。
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const bt = require(path.join(__dirname, '..', 'browser-target.cjs'));

/** 复刻 main.cjs 的记账层（convAnchors / agentTouchedTabs / activeTabId + 三个判据） */
function makeWorld() {
  const convAnchors = new Map();       // flowKey → tabId
  const agentTouchedTabs = new Map();  // tabId → flowKey
  const tabs = new Set(['tab-user']);  // 用户自己开的、正在看的那一页
  let seq = 10;

  const w = {
    convAnchors, agentTouchedTabs,
    activeTabId: 'tab-user',
    /** 与 main.cjs 形同的"锚是否存活"收口 */
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
    /** 主进程建页（后台流不顶替用户视图 ⇒ 不动 activeTabId） */
    createTab() { const id = 'tab-' + (++seq); tabs.add(id); return id; },
    /** ★ 与 main.cjs runBrowserAction 的 opts 逐字同形（含 bgFlow 不回落这一条） */
    opts(flowKey, isBg) {
      return {
        anchored: w.anchorOf(flowKey),
        activeTabId: isBg ? null : w.activeTabId,
        isMine: (t) => agentTouchedTabs.get(t) === flowKey,
        isCurrentView: (t) => t === w.activeTabId,
        isOwnedByOther: (t) => {
          const owner = agentTouchedTabs.get(String(t));
          return !!owner && owner !== flowKey;
        },
      };
    },
    /** 走一遍"解析目标" */
    resolve(flowKey, isBg, rawTab, action) {
      return bt.resolveTarget('conv-A', rawTab, action, w.opts(flowKey, isBg));
    },
  };
  return w;
}

const SHARED = bt.flowKeyOf('conv-A', 'shared');            // conv-A::shared
const BG = bt.flowKeyOf('conv-A', 'bg:sub:tc-1');           // conv-A::bg:sub:tc-1

test('★★★ 后台流的首次 navigate **不**回落用户当前页（必须自建，否则把用户那页导航走）', () => {
  const w = makeWorld();
  const r = w.resolve(BG, true, null, 'navigate');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tabId, null, '★ 后台流拿到了用户当前页 → 它的首次导航会把用户正在看的页面导航走');
});

test('★★★ 反过来：前台（共享）流的首次 navigate **仍然**回落当前页（今天的语义不能变）', () => {
  const w = makeWorld();
  const r = w.resolve(SHARED, false, null, 'navigate');
  assert.strictEqual(r.tabId, 'tab-user', '★ 前台流的"首次导航从当前页出发"被后台流的改动带塌了');
});

test('★★★ 两条流各自锚定后：无 tabId 的读各自落在**自己的**页上，互不串', () => {
  const w = makeWorld();
  w.createTab();                       // tab-11：后台流自建
  w.setAnchor(BG, 'tab-11');
  w.setAnchor(SHARED, 'tab-user');     // 前台流复用用户当前页

  const bgRead = w.resolve(BG, true, null, 'get_page_content');
  const fgRead = w.resolve(SHARED, false, null, 'get_page_content');
  assert.strictEqual(bgRead.tabId, 'tab-11', '★ 后台流读到了别人的页（或没锚上）');
  assert.strictEqual(fgRead.tabId, 'tab-user', '★ 前台流被后台流带偏');
  assert.notStrictEqual(bgRead.tabId, fgRead.tabId, '★ 两条流落在同一页 → 又变回互相覆盖');
});

test('★★ 后台流的导航只改自己的锚，**不动**用户当前页', () => {
  const w = makeWorld();
  w.createTab();                       // tab-11：后台流自己的页（必须真的存在，否则锚会被判为幽灵）
  w.setAnchor(BG, 'tab-11');
  w.activeTabId = 'tab-user';
  const r = w.resolve(BG, true, null, 'navigate');
  assert.strictEqual(r.tabId, 'tab-11');
  assert.strictEqual(w.activeTabId, 'tab-user', '★ 后台流把用户视图切走了');
});

test('★ 后台流的锚页已消失（被逐出/关闭）→ 回到"自建"而不是回落到用户页', () => {
  const w = makeWorld();
  w.createTab();
  w.setAnchor(BG, 'tab-11');
  w.convAnchors.delete(BG);            // 模拟幽灵锚
  const r = w.resolve(BG, true, null, 'navigate');
  assert.strictEqual(r.tabId, null, '★ 锚没了却回落用户页 → 又把用户正在看的页面导航走');
});

test('★★ 后台流**显式要**用户那一页 → 拒绝（不能靠传 tabId 绕开）', () => {
  const w = makeWorld();
  w.setAnchor(BG, 'tab-11');
  const r = w.resolve(BG, true, 'tab-user', 'get_page_content');
  assert.strictEqual(r.ok, false, '★ 后台流能显式抓用户页 → 后台任务会把用户的页读走/改掉');
});

test('★★ 前台流**显式要**后台流的页 → 拒绝（归属按流，不按会话）', () => {
  const w = makeWorld();
  w.setAnchor(BG, 'tab-11');
  w.setAnchor(SHARED, 'tab-user');
  const r = w.resolve(SHARED, false, 'tab-11', 'get_page_content');
  assert.strictEqual(r.ok, false, '★ 归属仍按会话比 → 两条流互相抓对方的页（正是本方案要消灭的）');
  assert.match(String(r.error), /不属于本会话/);
});

test('★★★ 后台流的存在**不影响**前台流的"回落当前页"闸门（各判各的归属）', () => {
  const w = makeWorld();
  w.setAnchor(BG, 'tab-11');           // 后台流占了 tab-11
  // 前台流尚未锚定：当前活动页是用户自己的页（没被任何流登记过）⇒ 应当回落成功
  const r = w.resolve(SHARED, false, null, 'navigate');
  assert.strictEqual(r.tabId, 'tab-user', '★ 后台流让前台流回落活动页失效（两条流互相污染）');
});

test('判据必须与 main.cjs 逐字同形（防止本测试自己漂成"另一个实现"）', () => {
  const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  // ① 后台流不回落
  assert.match(MAIN, /activeTabId:\s*bgFlow\s*\?\s*null\s*:\s*activeTabId/,
    '★ main.cjs 未按后台流屏蔽回落 —— 本测试的 opts() 已不是同形');
  // ② 归属口径 = flowKey
  assert.match(MAIN, /isMine:\s*\(t\)\s*=>\s*agentTouchedTabs\.get\(t\)\s*===\s*flowKey/);
  assert.match(MAIN, /!!owner\s*&&\s*owner\s*!==\s*flowKey/);
  // ③ 锚按 flowKey 存
  assert.match(MAIN, /anchored:\s*resolveTabIdForFlow\(flowKey\)/);
  // ④ "是不是后台流"的判据只有一处（browser-target.cjs）
  assert.match(MAIN, /isBackgroundFlow\(flow\)/);
});
