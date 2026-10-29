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
 * 缺省流键：同一会话内的**共享主面板流** —— 锚与归属的缺省维度。
 * ★ 取值必须与后端流锁的缺省 tabKey **逐字一致**
 *   （`apps/server/src/services/browser-flow-lock.ts` 的 `SHARED_FLOW`）：
 *   锁在一把键上、锚在另一把键上是最难查的一类漂移。
 */
const SHARED_FLOW = 'shared';

/**
 * 流键 = `${convId}::${flow}` —— **锚与归属的唯一维度**（2026-10-15，后台标签页方案 §4.3）。
 *
 * ★ 为什么要从"会话"收紧为"流"（而不是继续只用 convId 一个维度）：
 *   同一会话内将会有**多条执行流**（主面板流 + 各自申请的后台标签页流）。只按 convId 归一维度时，
 *   后台流的锚会覆盖主面板的"当前操作页"——正是"两个流抢同一个锚"那类互踩（且不报错）。
 *   ⇒ 每流各自一份锚、各自一份归属：后台流不需要抢主面板的页。
 *
 * ★ 缺省 `flow` → 共享主面板流 ⇒ **今天的语义逐字不变**（现有调用点都没传 flow）。
 *   `flow` 由后端经桥的 body 顶层传入（见 browser-bridge.cjs / browser-bridge.ts）。
 *
 * @param convId 会话标识（空 → 返回 null：非会话路径本就不该用流键）
 * @param flow   流标识（空 → 共享主面板流）
 * @returns {string|null} flowKey
 */
function flowKeyOf(convId, flow) {
  if (!convId) return null;
  const f = flow == null || flow === '' ? SHARED_FLOW : String(flow);
  return String(convId) + '::' + f;
}

/**
 * 这个流是不是**后台流**（`bg:` 前缀）—— 与 flowKey 同一处取值，供"要不要抢用户视野"的分岔用。
 *
 * ★ 为什么后台流要单独识别：它的页是**给 agent 自己用的**，不该改变用户正在看的页 ——
 *   ① 它自建的页**不激活**（渲染层不切过去，见 main.cjs 广播的 background 标记）；
 *   ② 它**不回落** activeTabId（否则会导航走用户当前那页）。这两条都在 main.cjs 消费本判据。
 */
function isBackgroundFlow(flow) {
  return String(flow == null ? '' : flow).startsWith('bg:');
}

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
 * 「目标页锁定」期间**禁止**的动作（P3-6，2026-10-16）。
 *
 * ★ 为什么需要锁定（用户诉求「页面对话跑着跑着答的是别的页」）：
 *   页面内对话的承诺是"**在这一页上**问答 / 点击 / 填写"。可它的执行面是共用的：
 *   模型只要调 `browser_new_tab`（或让编排层把 `navigate(openInNewTab)` 改写成 new_tab）
 *   就会另开一页作答、锚也跟着走，用户看到的是"看起来正常、答的却是别的页"的结果。
 *   面板此前只能**事后提示**（P0.1 漂移检测："结果可能来自新页面"），治不了根。
 *   ⇒ 任务开始时把该流**钉在开始那一页**上，换页类动作直接拒绝（错误信息里给出口）。
 *
 * ★ 为什么只禁这两个：
 *   · `new_tab` —— 另开一页作答，正是漂移的成因；
 *   · `switch_tab` —— 切走之后所有"无 tabId"的动作都会落到别页。
 *   而 `navigate`（页内换地址）**必须放行**：点链接 → 翻页 → 读结果，本身就是这类任务的一部分。
 */
const PIN_TARGET_FORBIDDEN_ACTIONS = new Set(['new_tab', 'switch_tab']);

/** 锁定期间的拒绝话术（含出口：跨页任务该走「移交给主智能体」） */
const PIN_TARGET_REFUSAL =
  '当前「页面对话」任务已锁定在开始那一个标签页：不能新开标签页、也不能切换到其它页。'
  + '需要跨页操作时，请让用户在浏览器工具栏点「页面移交给主智能体」。';

/**
 * 流 → 锁定页 的登记表（P3-6）。与 `convAnchors`（锚）是**两件事**：
 *   · 锚 = "最近一次操作目标"，随动作漂移；
 *   · 锁定 = "本次任务开始时用户指的那一页"，任务期间**不可改**。
 * 由浏览器面板在页面对话任务开始 / 结束时经 IPC 设置、清除（`browserView:pinTarget`）。
 *
 * ★ 为什么做成工厂而不是又一个模块级 Map（写进 main.cjs 就没法真跑验证了）：
 *   本文件存在的理由就是"判定必须能被 vitest 真跑"（见文件头注释）。
 *   `isAlive` 由调用方注入（main.cjs 传"tab 还在不在"），保持本模块不依赖 electron。
 */
function createFlowPinRegistry(opts) {
  const isAlive = (opts && opts.isAlive) || (() => true);
  const pins = new Map();     // flowKey → tabId
  const MAX_PINS = 200;
  return {
    set(flowKey, tabId) {
      if (!flowKey || !tabId) return;
      pins.set(String(flowKey), String(tabId));
      // 上限兜底：与 convAnchors / agentTouchedTabs 同手法（Map 插入序淘汰最老）
      while (pins.size > MAX_PINS) {
        const oldest = pins.keys().next().value;
        if (oldest === undefined) break;
        pins.delete(oldest);
      }
    },
    clear(flowKey) { if (flowKey) pins.delete(String(flowKey)); },
    /** 取锁定页；tab 已不存在 → 清掉并返回 null（**绝不返回幽灵 tabId**） */
    resolve(flowKey) {
      if (!flowKey) return null;
      const key = String(flowKey);
      const t = pins.get(key);
      if (!t) return null;
      if (!isAlive(t)) { pins.delete(key); return null; }
      return t;
    },
    /** tab 关闭时的收口（唯一入口，避免某条关闭路径漏清） */
    clearForTab(tabId) {
      if (!tabId) return;
      const tid = String(tabId);
      for (const [k, t] of pins) if (t === tid) pins.delete(k);
    },
    size: () => pins.size,
  };
}

/**
 * 解析本次动作该作用在哪个 tab（**唯一判定**）。
 *
 * @param convId  会话标识（null = 非会话场景/渲染层路径 ⇒ 不动本逻辑）
 * @param rawTab  工具入参里的显式 tabId（可为 string/number/null）
 * @param action  桥 action 名（如 'get_page_content'）
 * @param opts    { anchored: string|null, pinned?: string|null, isMine: (tabId: string) => boolean }
 * @returns { ok: true, tabId: string|null } | { ok: false, error: string }
 *
 * ★ 优先级（顺序即语义，不可调换）：
 *   ⓪ 锁定期间遇到换页类动作（new_tab / switch_tab）→ **拒绝**；
 *   ① 显式 tabId 且属于本会话 → 用它（**不是**被锚覆盖）；
 *   ② 显式 tabId 但不属于本会话 → 拒绝（跨会话越权）；
 *   ②' 锁定期间且无显式 tabId → **锁定页**（不走锚、更不回落活动页）；
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
  // ★★★ ⓪（P3-6，2026-10-16）：目标页锁定期间的换页类动作先拦。
  //   必须在 ①② 之前判 `switch_tab` —— 它本身带 tabId，会被"显式 tabId 优先"直接放行。
  //   `new_tab` 不带 tabId，本可放到下面判，但两条放一起才看得出"这是同一件事：换页"。
  if (o.pinned && PIN_TARGET_FORBIDDEN_ACTIONS.has(action)) {
    return { ok: false, error: PIN_TARGET_REFUSAL };
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
    // ★ 显式 tabId 仍按 ①② 放行（工具契约允许定向读别的页），且它**不改本流的操作目标** ——
    //   锁定约束的是"无显式 tabId 的动作落在哪"与"能不能换页"，不禁止定向读。
    return { ok: true, tabId: mine };
  }
  // ★★ ②' 锁定期间：无显式 tabId 的动作**一律落在锁定页**。
  //   这一步同时挡掉了"回落 activeTabId"那条路 —— 用户任务中途自己切了标签页时，
  //   回落会让 agent 的动作落到用户刚点开的那一页上（同一类漂移的另一种触发方式）。
  if (o.pinned) return { ok: true, tabId: String(o.pinned) };
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
    // ★★★ 2026-10-15（「导航跑偏」第三层，**跨会话**）：归属**别的会话**的页不回落。
    //
    //   现象（用户实报「上两个并发任务把预览面板搞乱了（有标签页卡在 kol.fanqieopen.com
    //   一直 loading）」）：两个会话同时跑浏览器任务时，后启动的那个还没有锚 →
    //   回落 `activeTabId` 恰好是**前一个会话正在使用的页** → 它把别人的页导航走了，
    //   前一会话的下一次读取读到的是后者的页面 —— 且**全程不报错**（最难查的一类）。
    //   `isCurrentView` 单独放行是安全的（本面板可见页，用户肉眼可见），但"可见页属于
    //   **别的会话**"不在其列：那是别人的执行现场。
    //   ⇒ 归属别人的页 → 不回落（tabId=null 交下游自建新页，各会话各有各的页）。
    if (fb && o.isOwnedByOther && o.isOwnedByOther(fb)) return { ok: true, tabId: null };
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
 * @param resultTabId    返回体里的新 tab id（`new_tab` 委派链）
 * @param opts           { orchestratedNewTab?: boolean }
 *   ★ `orchestratedNewTab`（2026-10-15 修复「导航跑偏」P0-②）：本次 `new_tab` 是编排层把
 *     `navigate(openInNewTab:true)` 委派过来的（**不是模型显式调 browser_new_tab**）。
 *     模型的心智模型是「我导航到了 X」——它并不知道也没要求开新页；若沿用 touch（不抢锚），
 *     模型后续所有无 tabId 动作仍落在旧锚页 → 读到旧页内容 → 判定"导航没生效" → 再导航 →
 *     又被编排层转成又一个新 tab（孤儿页雪崩，实测 10-14 晚 tab-2~tab-6 五个孤儿、
 *     453 次动作 0 次显式使用 tabId）。⇒ 编排层替模型做的导航决定，锚必须跟着走；
 *     模型**显式**调用 `browser_new_tab`（想"开着备用"）仍维持 touch 不变。
 * @returns { mode: 'anchor'|'touch'|'none', tabId?: string }
 *   · 'anchor' —— **改**"当前操作页"（写/交互/无 tabId 的 navigate）
 *   · 'touch'  —— **只登记**"本会话用过"（定向读 / new_tab 开的页）
 *   · 'none'   —— 不动
 *
 * ★ 为什么必须区分：一个动作可能"用了某个页"但"不改操作目标"。
 *   糅在一起时只能二选一 ⇒ 要么漏登记（定向读被拒 / 收尾不关），要么被迫改锚（打到错页）。
 */
function decideAnchorUpdate(action, hadExplicitTab, resolvedTabId, resultTabId, opts) {
  if (action === 'new_tab') {
    const t = resultTabId != null && resultTabId !== '' ? String(resultTabId) : null;
    // ★ 编排层委派（navigate+openInNewTab 改写而来）→ 锚跟随新页（见 opts 注释）
    if (opts && opts.orchestratedNewTab && t) return { mode: 'anchor', tabId: t };
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

/**
 * 「显式移交」（2026-10-29）：用户把游戏窗里的一页交给智能体代玩。
 *
 * ★ 为什么需要单独一张表：游戏窗（独立 BrowserWindow）的 tab 属于 scope='game'，
 *   不在 agent 的 preview 执行面里。`agentTouchedTabs` 是「动作执行成功后才登记」的记账，
 *   而移交必须**先在动作之前**把这一页标记为「本流可以操作」，否则第一次动作就会被
 *   越权闸门拒绝（或退化成另开 preview 页 —— 看的那页 ≠ 操作的那页）。
 *
 * ★ 与 flowPins 的分工：flowPins 管「这期间别换页」，本表管「这一页是本流自己的」。
 *   两表都登记后：显式 tabId 走 isMine 放行；无 tabId 走锁定页/锚；new_tab 被锁拒绝。
 *
 * 与 createFlowPinRegistry 同形态（工厂 + 注入 isAlive），便于 vitest 真跑。
 */
function createHandoffRegistry(opts) {
  const isAlive = (opts && opts.isAlive) || (() => true);
  const owners = new Map(); // tabId → flowKey
  const MAX_HANDOFFS = 50;
  function register(tabId, flowKey) {
    if (!tabId || !flowKey) return;
    owners.set(String(tabId), String(flowKey));
    while (owners.size > MAX_HANDOFFS) {
      const oldest = owners.keys().next().value;
      if (oldest === undefined) break;
      owners.delete(oldest);
    }
  }
  function release(tabId) {
    if (tabId) owners.delete(String(tabId));
  }
  /** 释放某条流登记的全部移交页，返回被释放的 tabId 列表 */
  function releaseForFlow(flowKey) {
    const k = String(flowKey == null ? '' : flowKey);
    if (!k) return [];
    const out = [];
    for (const [tab, owner] of owners) if (owner === k) { owners.delete(tab); out.push(tab); }
    return out;
  }
  function ownerOf(tabId) {
    if (!tabId) return null;
    const tid = String(tabId);
    const owner = owners.get(tid);
    if (!owner) return null;
    if (!isAlive(tid)) { owners.delete(tid); return null; }
    return owner;
  }
  /** 不做存活检查的原始归属（tab 刚被删时广播路径要用，见 broadcastTabClosed） */
  function ownerRaw(tabId) {
    return tabId ? (owners.get(String(tabId)) || null) : null;
  }
  function isHandoffTab(tabId) { return !!ownerOf(tabId); }
  function entries() { return [...owners.entries()]; }
  return { register, release, releaseForFlow, ownerOf, ownerRaw, isHandoffTab, entries, size: () => owners.size };
}

module.exports = {
  SHARED_FLOW,
  ANCHOR_ESTABLISHING_ACTIONS,
  NO_ANCHOR_REWRITE_ACTIONS,
  PIN_TARGET_FORBIDDEN_ACTIONS,
  tabIdCandidates,
  flowKeyOf,
  isBackgroundFlow,
  createFlowPinRegistry,
  createHandoffRegistry,
  resolveTarget,
  decideAnchorUpdate,
};