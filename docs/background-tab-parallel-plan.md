# 后台标签页并行方案（让第二个浏览器流不占可见面板）

> 2026-10-15 ｜ 分支 `dev0.1-mobile` ｜ **只出方案，不动代码**
> 起因：用户提问「如果真有两个 pageAgent 要一起跑，能不能一个只走后端模式？有些任务不需要前端展示也能完成」。
> 前置事实全部来自本仓库代码与当日实测（下称"实据"），不含推测。

---

## 0. 一句话

把 2026-10-15 落地的「**同任务内浏览器执行流互斥**」升级为「**每标签页互斥**」：允许 `call_agent` 为子智能体申请**自己的后台标签页**，两个 pageAgent 各占一页并行跑；**不申请就维持今天的串行排队**（默认行为逐字不变）。

---

## 0.5 P0 实验（2026-10-15 实测）—— 一条确定结论 + 一条**没测出来**的结论

**实验**：`apps/desktop/experiments/bg-tab-visibility`（Electron 44.7.2，独立 userData）。
7 种挂载形态各起一个 `<webview>`，量 `document.visibilityState`、rAF 帧数、`setTimeout(300ms)` 的实际延迟；
同一批元素连跑三轮（窗口正常 / 最小化 / 恢复），共 5 次运行。

### 一、确定的：`visibilityState` 不能用来判断"这个页在不在渲染"

七种形态**每一次运行都报同一个值** —— 窗口正常时全 `visible`，窗口最小化时全 `hidden`；
`display:none` / 0×0 / 移出视口 / 被盖住，**没有任何一种**与对照组不同。
⇒ 它只跟随**窗口级**状态，跟元素怎么挂载无关。

- §4.4 原本的 P0 问题「移出视口后是否仍为 visible」答案是"是"，但这个"是"**不携带任何信息**（恒为"是"）。
- 连带：`main.cjs:3687-3706` 那条以 `visibilityState === 'hidden'` 为判据的隐藏态提示，
  只可能由**窗口级**事件（最小化 / 被别的窗口遮挡）触发，**不会**由"面板收起"或"某个 tab 不激活"触发。
  它当初实测到 `hidden` 时的真实条件需要复核（见 §9）。
- **结论**：§4.4 的降级判据**不能**用 `visibilityState`。

### 二、没测出来的：后台挂载形态到底还渲不渲染（**不要据此下结论**）

判据本该是 rAF 活性 / 定时器节流，但本脚手架**测不稳**：
同一形态在不同轮次分别拿到 92 帧、0 帧、90 帧、1 帧；`display:none` 时而 0 帧、
时而又拿到完全正常水平的定时器延迟（304ms）。根因是**窗口是否真的进入前台合成，我控制不了** ——
从后台 shell 启动的 Electron 窗口常常压根不合成（实测 `isFocused=false`、`paintedTicks=-1`），
此时所有 guest 一起掉帧，量到的是"环境还没热"而不是"形态差异"。
（中途有一轮据此误判"移出视口会停摆"，复跑即被推翻 —— 这类结论不能靠这个脚手架下。）

- **唯一稳定重现的一条**：`display:none` 在所有轮次都是 0 帧，与产品 CSS 注释
  （`BrowserPanel.vue:2910`："不用 `display:none` —— 那会让 guest 停止合成"）一致。
- **挂载形态的取舍留给 §5 的真跑**（真实 app + 真实前台窗口）：那才是有效条件。
  在那之前本方案**不预设**"哪种挂载更优"，默认沿用产品现有形态。

**⇒ §4.4 修订**：后台标签页**默认沿用产品现有的非激活 tab 形态**（铺满视口 + `opacity:0` + 置于激活页之下，
= `BrowserPanel.vue:2910`），**禁用 `display:none` / `visibility:hidden`**；
"移出视口"因本实验未能定论，**不采用**。降级分支保留但收窄（见 §4.4）。

---

## 1. 现状（已核实）

| 事项 | 实据 |
|---|---|
| 执行面无按任务/按智能体的参数 | 只有全局档位 `YZ_BROWSER_BRIDGE`（on/off/shadow/strict）+ 可用性判定；任务创建时下发 `browserExecution: 'bridge' \| 'frontend'`（`llm-task-manager.ts:1103`）——**没有** per-task / per-agent / per-tool 的执行面选择 |
| 今天已落的三层防线 | `6895068` 同批浏览器型 call_agent 串行化 ／ `4b4d427` 任务级浏览器流锁（后台 async、PlanRunner 并行项、主循环并发）／ `cdd80a4` 跨会话归属闸门 ／ `2e5b667` 显式 tabId 真正送达 |
| 因此当前语义 | **同一任务内两个浏览器流必然串行**：同步委派排队等待（上限 5 分钟），后台 `async` 直接拒绝 |
| 服务端后端浏览器 | `apps/server/src/routes/browser.ts` 是一套**完整的 Playwright 实现**（launch 模式**强制 headless**，另有 CDP 接管模式），但被刻意限定在"桌面离线/无桥"时才用 |

---

## 2. 目标 / 非目标

**目标**：让**本可并行**的浏览器子任务真并行，且**不打断用户正在看的页面**。

**非目标（本轮不做）**
- 不把服务端 Playwright 提升为常规执行面（理由见 §6）；
- 不做跨会话并行（两个会话共用一个面板是另一个话题，归属闸门只解决"不抢页"）；
- 不为后台流放开跨会话 tabId（越权闸门维持）。

---

## 3. 三条候选路径

| 路径 | 登录态 | 风控 | 用户观感 | 工作量 |
|---|---|---|---|---|
| **A. 同会话后台标签页**（推荐） | 天然共享（同一 `persist:browser-view` 分区） | **无变化**（同一个浏览器、非 headless） | 用户那一页不被动 | 中（可复用今日基建） |
| B. 服务端 Playwright headless | ❌ 需**二次登录**：独立 profile，且 Chromium profile 目录**独占锁** ⇒ 无法与可见面板共用登录；Windows 下复制 profile 受 DPAPI 加密约束 | ⚠️ headless 被风控弹验证码有历史实据（代码注释） | 完全不可见 | 中（基建已有，但要补齐登录态） |
| C. 维持现状串行 | — | — | — | 0 |

**结论：选 A**。它不引入第二个浏览器、不碰登录态与风控面，且今天的锁/锚/归属三件套几乎是照着它长的。

---

## 4. 方案 A 详设

### 4.1 接口（opt-in，默认不变）

- `call_agent { agentId, input, browserTarget?: "shared" | "background" }`，缺省 `shared` = 今天的串行语义；
- 可选：子智能体配置项 `browser_target`（默认继承，未配置即 `shared`）；
- **工具描述必须写明边界**：`background` 只适合**取数/接口型**子任务；UI 型（点弹窗、点保存）用 `shared`。

### 4.2 锁粒度：每任务一把 → **每标签页一把**

`services/browser-flow-lock.ts` 已是 FIFO + 有界 + 幂等释放，改造面很小：

- `task.browserFlow: BrowserFlowLock` → `task.browserFlows: Map<tabKey, BrowserFlowLock>`；
- `tabKey = 'shared'`：**今天的语义原样保留**（互斥 + 排队）；后台流**不碰** `shared` 键；
- `tabKey = 'bg:<flowId>'`：后台流各自独占；
- **后台流拿到 tab 后把锁键改写为 `tab-N`**（`bg:<flowId>` → `tab-N`）：这样"两个流落到同一个 tab"仍然互斥（防未来的意外收敛）。

### 4.3 锚定与归属（复用今日基建，两处收紧）

- **每流各自锚**：`convAnchors` 现按 `convId` 存 → 改为按 `flowKey = convId + '::' + flowId` 存（主面板流用 `convId + '::main'`）；后台流有自己的一份锚，不需要抢主面板的"当前操作页"。
- **归属**：`agentTouchedTabs`（tab → convId）扩为 tab → **flowKey**；今天的 `isOwnedByOther` 直接复用，口径由"会话"收紧为"流"。
- **后台流的动作必须带显式 tabId**：服务器在流绑定 tab 后自动注入（今日 `2e5b667` 已修好送达链路 —— 这是本方案能成立的前提）。

### 4.4 后台页的挂载形态与降级（**P0 已实测，见 §0.5**）

~~已知实据：非激活页可能 `visibilityState=hidden` → 微前端不挂载（10-15 creator-micro 实测）。~~
**实测更正**：`visibilityState` 只跟随**窗口级**状态（窗口正常时七种形态全报 `visible`，含 `display:none` / 0×0），
**不能**当"这页在不在渲染"的判据。据此：

- **后台 tab 默认沿用产品现有的非激活 tab 形态**：铺满视口、留在视觉层、`opacity:0`、置于激活页之下
  （`BrowserPanel.vue:2910`）。理由：该形态已在产品里承担"非激活 tab 仍可被截图 / 注入 JS"，
  且不需要新机制。
- **禁用 `display:none` / `visibility:hidden`**：本实验每一种条件下 `display:none` 都是 0 帧，
  与产品 CSS 注释（"那会让 guest 停止合成"）一致。
- **"移出视口"（`left:-10000px` / `setBounds({x:-10000})`）本实验未能定论**（脚手架测不稳，见 §0.5 第二节）
  ⇒ **不采用**；若 §5 真跑证明它与"铺满+透明"等价，再作为备选。
- **降级路径**（仅在真跑确认后台页不可用时才走）：
  ① 纯取数类动作仍可用（`browser_run_script` 页内 fetch / 读类工具）；
  ② UI 类动作（click/type/fill_form）**自动降级**为"排队等主面板流"（即今日语义）并写进回执；
  ③ 短暂激活该 tab 执行后切回用户页，作为**可选**路径（代价：用户看到页面跳一下）。
- **任何情况下不得报"失败"**：拿不到可渲染页 ≠ 任务失败 —— 降级 + 说明原因（否则模型会换招重试，这正是历史上"白烧步数"的来源）。
- **判据落地**：若要在代码里判断"后台页是否真在渲染"，用 **rAF 活性**，**不要用 `visibilityState`**。

### 4.5 资源与收尾

- `MAX_TABS` + LRU 逐出已存在，但**逐出逻辑目前不看"该 tab 是否正被某个流持有"** —— 必须补：正在被持有（含后台流）的 tab 不可逐出，否则会退化成今天修掉的"跑到一半页被抽走"。
- 收尾：后台 tab 照旧进 `agentTouchedTabs` 记账；任务结束时提示「保留 N 个后台页」，并给 `browser_close_tab` 可抄调用（今日已做）。

### 4.6 观测（"谁在哪个 tab 上"必须一眼可查）

- 日志新增字段：`[browser-flow] conv=<id> flow=<flowId> target=shared|background tab=<tabId> owner=<holder>`；
- 既有动作日志（`[browser-action]`、`锚定决策:`）已够定位 tab，补 flow/target 两字段即闭环；
- 前端：BrowserPanel 的标签列表给后台页打标（"后台任务"），避免用户以为是自己开的页。

---

## 5. 测试与验收口径

**单测**
- 锁粒度：同 tab 互斥 / 不同 tab 并行 / FIFO / 有界超时 / 幂等释放；
- 锚按 `flowKey` 隔离；`isOwnedByOther` 由会话收紧为流；后台流 tabId 注入。

**真跑**（`browser-bridge-e2e.test.ts` 同风格 + 桌面端桥桩）
- 两个 `call_agent` 并发 → 断言两者拿到**不同 tabId**、各自读页结果**互不串**、后台流**不激活**用户页。
- **并记录后台页的 rAF 活性**（1.5s 窗口内的帧数 + 定时器延迟）：这是 §0.5 定下的判据，
  也是"后台页到底还跑不跑"这个问题的**唯一有效测法**（`visibilityState` 不携带信息）。
  同一次真跑顺便把 §0.5 第二节那笔未决账结掉。

**端到端冒烟（真实 app）**
- 场景 1：一前台取数 + 一后台取数 → 日志里两条流各占各 tab、无乒乓；
- 场景 2：后台流被迫做 UI 动作 → 观察降级行为（②排队）是否符合预期、回执是否可读。

**验收（三条硬口径）**
1. **默认逐字不变**：不传 `browserTarget` 时，行为与今天完全一致；
2. **不抢焦点**：`background` 流的导航/读页不改变用户正在看的页；
3. **不失败**：任何不可渲染场景都有降级路径 + 可读原因。

---

## 6. 若确实要"纯后端模式"（路径 B 的代价，先写清再决定）

1. **登录态**：后端浏览器是独立 profile，且 **Chromium profile 目录独占锁** ⇒ 无法与可见面板共用同一份；Windows 下 cookie 受 DPAPI 绑定，**复制 profile 也解不开**。⇒ 用户必须在那里**单独登录一次**；扫码类站点（如即梦）基本不可行，密码类可借 `/login-saved`。
2. **风控**：headless 访问抖音这类站点被弹验证码**有历史实据**（`routes/browser.ts` 自身注释写明）。`BROWSER_HEADLESS` 虽为开关，但 launch 模式被**强制 headless**（避免弹第二个可见浏览器窗口）。
3. **CDP 接管**（已有实现）：可复用某个"用户自己起的、带调试端口的已登录 Chromium"，绕开登录问题，但要求用户额外维护一个浏览器。
4. **反例说明**：Electron 自带 CDP 实现不全（`Target.createTarget: Not supported` 是既有实测结论），所以"直接接管桌面 app 自己的浏览器"这条路走不通。

⇒ **结论**：路径 B 只在「公开站点 / 无登录取数 / 不需 UI」场景有价值，与当前主力任务（抖音创作者中心、番茄 KOL —— 都要登录且要 UI）**基本不匹配**。若将来要支持"帮用户并行抓一批公开资料"，再单独立项。

---

## 7. 工作量与建议顺序

| # | 事项 | 估计 | 说明 |
|---|---|---|---|
| 1 | ~~**P0 实验**：后台 tab 移出视口是否保持 `visible`~~ **已完成，见 §0.5** | ~~0.5 天~~ | 确定了一条：**`visibilityState` 不可当判据**；挂载形态的取舍**本实验未能定论**，顺延到第 5 项真跑 |
| 2 | ~~锁粒度 + 锚/归属按 `flowKey`（含单测）~~ **已完成，见 §10** | ~~1 天~~ | 机制已就位且默认逐字不变；**没有任何调用点传 `flow`**，后台并行尚未真正开启 |
| 3 | ~~`browserTarget` 接口 + 工具描述/提示词~~ **已完成，见 §10** | ~~0.5 天~~ | opt-in，默认不变；**功能已可真正并行** |
| 4 | 降级路径 + LRU 持有保护 + 观测字段 | 1 天 | 风险最高的一段 |
| 5 | 真跑 + 冒烟 + 调优 | 0.5 天 | 验收口径见 §5 |

**回退**：全链路 opt-in —— 出问题把 `browserTarget` 默认值钉回 `shared`（或直接停用该参数）即回到今天的行为，无需回滚代码。

---

## 8. 明确不做

- 不改 `YZ_BROWSER_BRIDGE` 的档位语义（全局执行面选择是另一层）；
- 不做跨会话并行（两个会话共享一个可见面板）；
- 不为后台流放开跨会话 tabId（越权闸门保持）；
- 不引入第二个浏览器进程（那等于路径 B 的代价）。

---

## 9. 待办（P0 之后的）

- **复核 `visibilityState` 判据**（`main.cjs:3687-3706`）：实测它只跟随**窗口级**状态
  （窗口正常时七种挂载形态全报 `visible`，最小化时全报 `hidden`）⇒ 它抓得到"窗口被最小化/遮挡"，
  **抓不到**"面板收起 / 某个 tab 不激活"。需要用真实场景确认当初实测到 `hidden` 时到底是哪个条件；
  否则这是一条"写了但很少会响"的提示。在此之前，代码里判断"后台页在不在渲染"**一律用 rAF 活性**。
- **挂载形态的真跑定论**：本脚手架的 rAF 观测不稳（窗口能否进入前台合成不可控 ——
  实测同一形态跨轮次拿到 92/0/90/1 帧），该问题**必须在真实 app + 真实前台窗口下**测（§5 真跑）。
  测法：两个 `call_agent` 并发各占一 tab，断言拿到不同 tabId、读页结果互不串、后台流不激活用户页，
  并记录后台页的 rAF 活性。
- 本实验脚手架保留在 `apps/desktop/experiments/bg-tab-visibility`（不参与 `node --test`，可重跑复现：
  `apps/desktop/node_modules/.bin/electron apps/desktop/experiments/bg-tab-visibility`）。

---

## 10. 实施记录

### 2026-10-15：第 2 项（锁粒度 + flowKey）已落地

**做了什么** —— 默认行为**逐字不变**（没有任何调用点传新参数）。

| 层 | 改动 |
|---|---|
| 锁 | `services/browser-flow-lock.ts`：单锁 → `Map<tabKey, 锁>`。新增 `SHARED_FLOW='shared'`／`createFlowLocks`／`flowLockFor`／`peekFlowLock`／`flowOwnerAt`；原有单锁四原语（`createFlowLock`/`tryAcquireFlow`/`acquireFlow`/`releaseFlow`）及其 FIFO／有界／幂等释放语义**原样保留** |
| 任务字段 | `LlmTask.browserFlow` → `browserFlows: Map<tabKey, 锁>`；三个调用点（后台 async 先占位／`runSubAgent` 运行期持锁／主循环显式拒绝）全部改走 `flowLockFor(task.browserFlows, SHARED_FLOW)` |
| 流键 | `browser-target.cjs` 新增纯函数 `flowKeyOf(convId, flow)` → `${convId}::${flow}`，缺省流 `shared`。它同时导出 `SHARED_FLOW`，并有守门测试比对"它与后端锁的缺省键是同一个字面量"（防两处漂移） |
| 协议 | 桥 body 新增顶层 `flow`：`browser-bridge.ts`（服务端）发 → `browser-bridge.cjs`（桌面端）读 → `runAction(convId, tabId, action, args, flow)` |
| 锚／归属 | `main.cjs`：`convAnchors` 与 `agentTouchedTabs` 的维度由 convId 改为 **flowKey**；`setConvAnchor`/`markConvTabTouched`/`resolveTabIdForConv`/`clearConvAnchorsForTab` → `setFlowAnchor`/`markFlowTabTouched`/`resolveTabIdForFlow`/`clearFlowAnchorsForTab`；`isMine`／`isOwnedByOther`／navigate 自建复用一律比 `flowKey`；`closeConvTabs` 改按 `convId::` 前缀清（收尾仍以会话为单位） |
| 观测 | `[browser-action]` 与 `锚定决策:` 两条日志带 `flow`（缺省打 `shared`）；桥日志也带 |

**这一步没有做的事**（留给第 3 项）：没有任何调用点传 `flow` —— 服务端一律传 `SHARED_FLOW`，
所以"两个流各占一页"**还不会发生**。`browserTarget` 参数与它的 opt-in 语义、
以及"后台流拿到 tab 后把锁键改写为 `tab-N`"均未实现。

**单测**（新增／更新）
- `browser-flow-lock.test.ts` 新增 ③ 组：缺省键 = `SHARED_FLOW`、**不同 tabKey 互不阻塞**（粒度升级要换来的东西）、
  同 tabKey 仍互斥 + 排队、后台流不碰共享键、`peekFlowLock` 不建锁且对 `undefined` 安全；接线守卫改钉分表写法。
- `browser-bridge-direct.test.ts` 新增 ⑭ 组：`flowKeyOf` **真跑**（缺省／显式／跨会话不撞键／convId 空 → null），
  外加"桌面端缺省流键字面量必须与后端锁一致"。
- `browser-bridge-e2e.test.ts` 新增"流键必须真的送达执行面"（真跑桥，断言 `runAction` 第 5 参收到／缺省为 `null`）。
- `navigate-reuse-tab.test.cjs`（桌面）：注入变量改 `flowKey`，新增"同会话**另一条流**的页也不复用"。

**验证**：`apps/server` vitest 全量 **2579 passed**（1 个 hook 超时是并行下的既有 flake —— 单独跑 9/9 通过）；
`apps/desktop` `npm test` **196 passed**；`npx tsc --noEmit` 干净。

### 2026-10-15：第 3 项（`browserTarget` 接口）已落地 —— **功能已可真正并行**

**接口**：`call_agent` 新增可选 `browserTarget: "shared" | "background"`（缺省 `shared`）。
工具描述里写明了边界：`background` 只适合**取数/接口型**子任务；要点弹窗、点保存、上传这类**要看界面**的
操作（抖音创作者中心、番茄等登录站点）用 `shared`。

**流键的唯一取值口径**：`browserFlowKeyOf(args, toolCallId)`（`llm-task-manager.ts`，已导出供真跑测试）——
`shared` 或 `bg:sub:<toolCallId>`。**服务端锁的 tabKey 与桌面端锚的 flow 键同源同值**，一路
`ownership.browserFlowKey` → `executeTool` → 桥 body 的 `flow`。

**顺带修掉的四个"不抢用户视野"缺口**（这一个功能逼出来的，都是真缺口）：

| # | 缺口 | 修法 |
|---|---|---|
| 1 | 渲染层 `onTabCreated` **无条件** `activeTabId.value = tid` —— 任何新建页都把用户视图切过去 | 主进程广播带 `background` 标记（preload 转发第 4 参），渲染层改为「非后台 **或** 面板还没有活动页」才切 |
| 2 | `case 'new_tab'` 里 **无条件** `activeTabId = tabId` | 后台流不顶替（前台流保持原语义：开新页即切过去） |
| 3 | 后台流首次 `navigate` 会**回落**用户当前页（把用户那页导航走） | 后台流传 `activeTabId: null` ⇒ 不回落，必走自建分支 |
| 4 | `case 'switch_tab'` 会把用户正在看的页切走 | 后台流**明确拒绝**（按 §4.4 口径给替代做法，不报"失败"） |

**顺带修掉一个相邻的真 bug**（不在本方案的步骤里，但会让"后台页清不掉"）：agent 自己 `navigate`
触发的自建/复用的页**漏标 `agentOpened`** ⇒ 它在 `browser_get_tabs` 里被显示成 `[用户页·勿关]`
（模型因此不去关它），且 `browser_close_tab` 的权限闸门会拒掉 agent 自己的页。`main.cjs` 自己的契约
（1836 行附近）本就写着"agent 工具链建的页 → `agentOpened: true`"，只是这条分支漏标。
这是**收窄**而非放宽：只影响 agent 自己建出来的页，用户手开的页仍永不可被 agent 关（守门测试同时钉住闸门不得松动）。

**并行面**：同批 `call_agent` 的串行化判据从「同批浏览器型 ≥2」**收紧为「同一个标签页已被占」**
（`tabKeyTaken`）——不收紧的话 `background` 会被这一层无差别串行掉、方案收益归零。

**前端**：标签栏给后台页打「后台」徽标（§4.6），标签页仍然照常挂载并运行（只是不占视野）。

**单测**（新增）
- `browser-flow-lock.test.ts` ④：`browserFlowKeyOf` **真跑** —— 缺省/非法值/大小写回落共享流、
  `background` → `bg:sub:<tc>` 且**不同委派互不相同**、必须带 `bg:` 前缀（桌面端据此识别后台流）。
- `browser-bridge-direct.test.ts` ⑭：`isBackgroundFlow` **真跑**（空串不得误判）；
  main.cjs 三处保护缺一不可的守门断言；广播带标记 + preload 必须转发。
- `browserPanelPageAgentFix.test.ts` ④（UI）：`onTabCreated` 不得无条件激活、后台页仍须进 `tabs`、徽标与样式必须在。

**验证**：`apps/server` **2599 passed / 165 files**；`apps/desktop` **196 passed**；
`packages/ui` **875 passed**（`--no-file-parallelism`，避开既有计时 flake）+ `vue-tsc` 干净；`tsc --noEmit` 干净。

**仍未做（诚实清单）**
- §4.4 的**降级路径**（面板被收起时后台流改用页内 fetch / 排队）：后台页在面板收起时确实会掉帧（P0 实测），
  但"什么时候需要降级"还没有判据落地 —— 现状是不降级、由 §0.5 的 rAF 判据将来补；
- §4.1 提到的**子智能体配置项** `browser_target`（默认继承）：只实现了 `call_agent` 入参，未做 agent 配置兜底；
- §4.5 的 **LRU 持有保护**：后台流的页在**首次锚定之后**由既有 `convAnchors` 钉住（不会被逐出/空闲回收），
  首次锚定之前的窗口未额外保护（窗口很短：第一条 navigate 就锚上了）；
- §5 的**真跑**（两个 `call_agent` 并发各占一页）尚未做 —— 这是接下来最该做的一步。
