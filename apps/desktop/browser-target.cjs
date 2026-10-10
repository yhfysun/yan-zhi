// 浏览器「执行目标解析」与「锚定更新判定」—— 纯函数模块（「执行面直连化」，2026-10-10）
//
// ★★★ 为什么抽成独立模块（而不是写在 main.cjs 里）：
//   这两段判定是**多页语义的核心**，错了的表现是"动作打到错的页上"且**不报错**（最难查的一类）。
//   而 main.cjs 依赖 electron、无法在 vitest 里加载 ⇒ 判定只能靠"静态断言源码"验证，
//   而静态断言抓不住"分支顺序反了""条件被短路"这类**行为**缺陷（本项目反复栽过：
//   "断言存在 ≠ 断言生效"）。
//   ⇒ 抽成纯函数模块：main.cjs require 它（唯一实现），测试也 require 它（**真跑**行为）。
//     与 `browser-bridge.cjs` 同一模式。
//
// ★ 安全边界（跨会话）在这里的落点：`isMine` 由调用方注入（认"本会话操作过"），
//   未登记的 tab 一律拒绝 ⇒ A 会话拿不到 B 会话的页。

/**
 * 需建立/切换页面（写）的 action —— 未锚定时**允许**回落活动页
 * （首次 navigate 要能自发建 tab；否则 agent 第一步就走不动）。
 * 其余（读/交互）在"带 convId 但未锚定"时必须**明确报错**，
 * 绝不静默打到全局活动页（与 A4 的 `resolveReadPage` 语义同源）。
 */
const ANCHOR_ESTABLISHING_ACTIONS = new Set(['navigate', 'new_tab', 'switch_tab']);

/**
 * 不把"当前操作页"改写到**显式指定 tabId** 的动作。
 *
 * ★ 依据（`packages/core/src/tool/builtin/browser/index.ts` 工具契约）：
 *   读类工具（get_page_content / get_page_info / get_dom / get_text / get_visible_text /
 *   screenshot）与 navigate **都接受显式 `tabId`**，描述逐字写着
 *   「**可传 tabId 读取指定标签页，不必先切换标签页**」。
 *   若用"会话锚"覆盖显式 tabId ⇒ 多页流程（new_tab 开 B，再 get_page_content(tabId=B)）
 *   会被带偏回锚定的 A —— **契约被悄悄破坏且不报错**。
 */
const NO_ANCHOR_REWRITE_ACTIONS = new Set([
  // 读类：显式 tabId 是读取目标，不改"当前操作页"
  'get_page_content', 'get_page_info', 'get_dom', 'get_text', 'get_visible_text',
  'screenshot', 'get_url', 'is_visible', 'scroll_into_view', 'extract_list',
  // navigate：可带显式 tabId 在**别的** tab 上导航，同样不该改"当前操作页"
  'navigate',
  // new_tab：开新页 ≠ 切换操作目标（描述逐字："拿到 tabId 后可用读取类工具的 tabId 参数
  //   直接读取该页，**无需切换标签页**"）
  'new_tab',
]);

/** 把显式 tabId 归一成候选集合：兼容 `tab-N` 字符串与纯数字（工具 schema 写的是 number）。 */
function tabIdCandidates(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  const out = [s];
  // 纯数字 n → 同时试 `tab-n`（否则模型按 schema 传数字会被**误拒**，报"不属于本会话"）
  if (/^\d+$/.test(s)) out.push('tab-' + s);
  return out;
}

/**
 * 解析本次动作该作用在哪个 tab（**唯一判定**）。
 *
 * @param convId  会话标识（null = 非会话场景/渲染层路径 ⇒ 不动本逻辑）
 * @param rawTab  工具入参里的显式 tabId（可为 string/number/null）
 * @param action  桥 action 名（如 'get_page_content'）
 * @param opts    { anchored: string|null, isMine: (tabId: string) => boolean }
 * @returns { ok: true, tabId: string|null } | { ok: false, error: string }
 *
 * ★ 优先级（顺序即语义，不可调换）：
 *   ① 显式 tabId 且属于本会话 → 用它（**不是**被锚覆盖）；
 *   ② 显式 tabId 但不属于本会话 → 拒绝（跨会话越权）；
 *   ③ 无显式 tabId + 已锚定 → 用锚；
 *   ④ 无显式 tabId + 未锚定 + 建页类 action → 放行（tabId 保持 null，由下游落到活动页/自建）；
 *   ⑤ 无显式 tabId + 未锚定 + 其它 → 明确报错。
 */
function resolveTarget(convId, rawTab, action, opts) {
  const o = opts || {};
  if (!convId) {
    // 渲染层路径（IPC）：渲染层自己维护锚与 tabId ⇒ 原样透传，行为逐字不变
    return { ok: true, tabId: rawTab != null && rawTab !== '' ? String(rawTab) : null };
  }
  const cands = tabIdCandidates(rawTab);
  if (cands.length) {
    const mine = cands.find((t) => o.isMine && o.isMine(t));
    if (!mine) {
      return {
        ok: false,
        error: `标签页 ${cands[0]} 不属于本会话（不能读取/操作其它会话的页面）。请先调用 browser_new_tab 或 browser_navigate 打开页面后再操作。`,
      };
    }
    return { ok: true, tabId: mine };
  }
  if (o.anchored) return { ok: true, tabId: String(o.anchored) };
  // ★★★ 2026-10-10 三次根因修复：建页类动作未锚定时**回落 `activeTabId`（若属于本会话）**。
  //
  //   现场（日志实证）：navigate 首次自建 tab-1 并广播建壳 → 但**锚没建立** →
  //   第二次 navigate 时 `resolveTarget` 返回 `tabId: null` → 下游 `waitForGuest(null || activeTabId)`
  //   用 `activeTabId` 兜底拿到了 guest ⇒ navigate **看起来成功**，但主进程**不知道这次操作的是哪个 tab**
  //   ⇒ `decideAnchorUpdate(action, false, null, null)` 返回 **'none'** ⇒ **锚永不建立**
  //   ⇒ 后续所有读类动作（get_page_content / screenshot / get_dom）一律报"该会话尚未绑定浏览器页面"
  //   ⇒ 模型以为导航没生效 → 疯狂换 URL 重试（实测 3 分钟 36 次 navigate）
  //   ⇒ 每次重试因未锚定又走"自建新 tab" → **tab 无限堆积，每个 tab 一个 Chromium 渲染进程**
  //   ⇒ 最终 `MaxListenersExceededWarning` + **整个应用卡死**（用户实报"pageAgent 一跑应用就卡住"）
  //
  //   ★ 为什么回落是安全的：`activeTabId` 是"用户当前在看哪个"（UI 语义），而建页类动作
  //     （navigate/new_tab/switch_tab）本身就是要**改变/建立**操作目标 —— 首次 navigate 必须能
  //     从"当前活动页"出发，否则 agent 第一步就走不动（本模块顶部注释已声明该语义）。
  //   ★ 仍必须过 `isMine` 闸门：未登记的 activeTabId（别的会话的页）绝不回落，防跨会话越权。
  if (ANCHOR_ESTABLISHING_ACTIONS.has(action)) {
    const fb = o.activeTabId != null && o.activeTabId !== '' ? String(o.activeTabId) : null;
    // ★★★ 2026-10-10 四次根因修复：闸门从「仅 isMine」放宽为「isMine **或** 就是当前活动页」。
    //
    //   ★ 为什么必须放宽（**这是前三次修复都没真正生效的原因**）：
    //     `isMine(t)` 的实现是 `agentTouchedTabs.get(t) === convId`，而 `agentTouchedTabs`
    //     **只在动作成功执行后**才登记 ⇒ **首次** navigate 时没有任何 tab 被登记过
    //     ⇒ `isMine(activeTabId)` 恒为 **false** ⇒ 回落**仍然不生效** ⇒ `tabId` 还是 null
    //     ⇒ 锚还是建不起来（前三次修复等于白改）。
    //
    //   ★ 为什么"当前活动页"是安全的：`activeTabId` 是**本面板**当前正在显示的页（UI 语义，
    //     用户肉眼可见的那个 tab），它不可能是"别的会话的页" —— 用户能看到的页就是本会话可见的页。
    //     跨会话越权的真实威胁是"未登记的 tabId 被显式传入"（那条由上方 ① ② 分支拦住，未动）。
    //     这里只是允许"从当前可见页出发"，与模块顶部声明一致："首次 navigate 必须能自发建 tab"。
    const mineByRegistry = !!(o.isMine && o.isMine(fb));
    const isCurrentView = !!(fb && o.isCurrentView && o.isCurrentView(fb));
    if (fb && (mineByRegistry || isCurrentView)) return { ok: true, tabId: fb };
    return { ok: true, tabId: null };
  }
  return {
    ok: false,
    error: '该会话尚未绑定浏览器页面（不能对全局活动页操作，避免误操作其它会话的页面）。请先调用 browser_navigate 打开目标页面。',
  };
}

/**
 * 动作成功后决定如何更新会话记账（**唯一判定**）。
 *
 * @param action         桥 action 名
 * @param hadExplicitTab 入参是否带显式 tabId
 * @param resolvedTabId  解析后的实际作用 tab（resolveTarget 的结果）
 * @param resultTabId    返回体里的新 tab id（`new_tab` 用）
 * @returns { mode: 'anchor'|'touch'|'none', tabId?: string }
 *   · 'anchor' —— **改**"当前操作页"（写/交互/无 tabId 的 navigate）
 *   · 'touch'  —— **只登记**"本会话用过"（定向读 / new_tab 开的页）
 *   · 'none'   —— 不动
 *
 * ★ 为什么必须区分：一个动作可能"用了某个页"但"不改操作目标"。
 *   糅在一起时只能二选一 ⇒ 要么漏登记（定向读被拒 / 收尾不关），要么被迫改锚（打到错页）。
 */
function decideAnchorUpdate(action, hadExplicitTab, resolvedTabId, resultTabId) {
  if (action === 'new_tab') {
    const t = resultTabId != null && resultTabId !== '' ? String(resultTabId) : null;
    return t ? { mode: 'touch', tabId: t } : { mode: 'none' };
  }
  if (action === 'switch_tab') {
    const t = resolvedTabId != null && resolvedTabId !== '' ? String(resolvedTabId) : null;
    return t ? { mode: 'anchor', tabId: t } : { mode: 'none' };
  }
  const t = resolvedTabId != null && resolvedTabId !== '' ? String(resolvedTabId) : null;
  if (!t) return { mode: 'none' };
  if (hadExplicitTab && NO_ANCHOR_REWRITE_ACTIONS.has(action)) return { mode: 'touch', tabId: t };
  return { mode: 'anchor', tabId: t };
}

module.exports = {
  ANCHOR_ESTABLISHING_ACTIONS,
  NO_ANCHOR_REWRITE_ACTIONS,
  tabIdCandidates,
  resolveTarget,
  decideAnchorUpdate,
};