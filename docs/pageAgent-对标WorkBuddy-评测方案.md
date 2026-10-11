# pageAgent 对标 WorkBuddy 评测方案（先出方案，未动代码）

> 日期：2026-10-11
> 方法：源码实地核查（结论带 `文件:行号`），逐处复核"方案写了" vs "代码里真有"。
> 范围：**只出方案**。下一轮按本方案"开干"。
> 目标：把 yan-zhi 的 pageAgent（浏览器自动化子智能体）逐项对标 WorkBuddy 的浏览器/电脑使用能力，量化现有功能、不足、改造方向。

## ★ 零、2026-10-11 复核修正（回源码逐项核实，本节优先于正文）

初稿沿用了 2026-10-09 差距文档的结论，**回源码复核后发现 4 处已过时、2 处数字错误**，已修正：

| 初稿断言 | 复核结果 | 证据 |
|---|---|---|
| P0-1「截图多模态是假的」 | ❌ **已落地**：`attachImagesToMessages`（`llm-task-manager.ts:990`，发送前把 `已存档: <path>` 展开为图片块，C4 简化版只注入最近 N 条）+ `client.ts:187-200` 组装 `image_url` + C5 共享提取函数。**残余：C2 图片压缩仍缺**（`readFileBase64` 原图直发，全仓无 sharp/resize） | `llm-task-manager.ts:2540-2543` |
| P0-4「时间戳使缓存 100% 失效」 | ❌ 时间戳**已移除**（`llm-task-manager.ts:6378` 只剩注释）。**残余：`cached_tokens`/`cache_read_input` 全仓仍不读**（grep 零命中）→ 缓存命中率不可观测 | `llm-task-manager.ts:6378` |
| C6 归档正则贪婪 | ❌ **已修**（`llm-task-manager.ts:4331-4332` 注释明确 2026-10-09 修） | 同左 |
| A4「隔离完全裸奔」 | ⚠️ **部分落地**：服务端已有 conv-scoped 绑定（`browser.ts:1829` `picked.reason === 'bound'` + `x-yz-conversation-id` 透传）。残余：全部读路由的归属保护覆盖面待核 | `browser.ts:95-107, 1829` |
| 「43 个 browser_* class」 | 数字错，实际 **38 个** | `grep -c "class Browser"` |
| 「挂载 16 个工具」 | 数字错，实际 **14 个**（db.ts:1100-1127 逐项清点） | 同左 |

**修正后的 P0 清单收敛为 2 项**：① **弹窗处理（B4）**——桌面与服务端**均无** `dialog` handler（两处 grep 零命中，仍复现"桌面卡死 18s"）；② **CDP 保活接线（B1）**——`recoverSession()` 仍是死代码（`browser.ts:494` 注释自证"从未被接线调用"）。

---

## 〇、评测框架（对标维度）

以 WorkBuddy 的"浏览器自动化 + 电脑使用"成熟能力为基准，从 6 个维度打分：

| 维度 | 含义 | 本基准 |
|---|---|---|
| D1 执行链路 | 操作是否作用在"用户看到的那个页面"、是否真跑 | 真实浏览器、所见即所操作 |
| D2 元素定位 | 定位稳不稳、会不会静默失效 | index/坐标/选择器三选一 + 视觉兜底 |
| D3 视觉理解 | 模型能否"看见"页面 | 截图即多模态入上下文，模型直接读图 |
| D4 并发与隔离 | 多会话/多任务会不会互相污染 | 会话级隔离，无静默错页 |
| D5 长任务健壮性 | 连接断了/弹窗/卡死能否自愈 | 连接保活自愈、弹窗处理、自动接力 |
| D6 成本与可观测 | token 成本、缓存命中、日志 | 前缀缓存有效、全链路日志 |

评分：🟢 已达标 / 🟡 部分达标 / 🔴 差距明显（对标 WorkBuddy 缺）。

---

## 一、现有功能盘点（yan-zhi pageAgent 已落地）

### 1.1 架构：双链路 + 在线委托

- **桌面端在线**：所有 `browser_*` 工具经 `executeToolViaFrontend` → SSE → 前端 `BrowserView` IPC（`packages/core/src/tool/builtin/browser/index.ts:48-56` 已把 `/navigate`、`/action` 转发 IPC；`llm-task-manager.ts:870-893` 在线全量委托前端）。用户实时看到虚拟鼠标移动/输入（`injectYzAssistant`，`main.cjs:956`）。
- **Web 端 / 离线（无人值守）**：回落服务端 Playwright headless（`browser.ts:54` `chromium.launch({headless:true})`），无人值守能力保留。
- **子智能体天然覆盖**：`call_agent` 委派 pageAgent 复用 `task.subscribers`，工具经 `tool:execute` → 前端 IPC。

### 1.2 工具面（实际挂载 16 个，PAGE_AGENT_BUILTIN_TOOLS）

`apps/server/src/db.ts:1100-1127` 实际挂载：

```
browser_navigate / browser_type / browser_click / browser_get_page_content   ← 四件套
browser_get_page_info / browser_get_dom / browser_get_visible_text            ← 读页三件套（2026-10-09 补挂载，B2 修复）
browser_scroll / browser_run_script / browser_upload                          ← 滚动/代码模式/上传
file_write / browser_screenshot / image_analyze / ask_user                    ← 落盘/截图视觉闭环/人工干预
```

完整 `browser_*` 工具共 **38 个 class**（`grep -c "class Browser"` 实测），桌面端 action 能力清单 **40 个**（`DESKTOP_BROWSER_ACTIONS`，`main.cjs:2800-2808`，单一真相源，防 actionMap 漂移）。

### 1.3 核心能力（对标里有优势的点）

- ✅ **真实键盘/鼠标**：`browser_type` 走 `Input.insertText`，对 React/Vue 受控组件、富文本、中文输入法有效（`index.ts:254-259`）。
- ✅ **index 定位**：元素编号清单（`get_page_content/get_page_info`）对动态 hash class、iframe 最稳；空参自动回退"给编号清单"引导重试（`emptyTargetHint`，`index.ts:147-162`）。
- ✅ **页面状态签名（PageState）**：`computePageStateSignature`（`index.ts:596-601`）把"页面变没变"硬编码进回执，不靠提示词软约束（P1-6）。
- ✅ **多标签页**：`new_tab/switch_tab/close_tab/get_tabs`，收尾主动关中间页（`BrowserCloseTabTool` 描述）。
- ✅ **视觉定位闭环**：`browser_visual_locate` 截图 → `image_analyze` 识别弹窗/portal 结构（`index.ts:930-953`）。
- ✅ **代码模式**：`browser_run_script` 把多步固定流程收敛为一段页面脚本一次执行，省步数 token（P1-5）。
- ✅ **结构化提取 / 网络监听 / 拖拽 / 上传下载 / 滚动到元素 / 可见性**：`extract_list / wait_for_request / get_network_log / drag / upload / download / scroll_into_view / is_visible` 均已实现。
- ✅ **子智能体委派 + 主循环自动接力**：`call_agent` 委派 + `autoContinueMaxRounds`。

**结论**：pageAgent 的"操作面"已经相当完整，工具数量甚至多于多数同类产品。对标 WorkBuddy 的主要差距**不在"能不能操作"，而在"操作是否真生效、模型是否真看见、并发是否真隔离、断连是否真自愈"**——即 D3/D4/D5/D6。

---

## 二、对标 WorkBuddy 能力矩阵（逐项）

| # | 能力 | WorkBuddy 基准 | yan-zhi pageAgent 现状 | 评分 |
|---|---|---|---|---|
| 1 | 真实浏览器可见操作 | 实时可见、虚拟光标 | ✅ 桌面 BrowserView + 虚拟鼠标已落地 | 🟢 |
| 2 | 元素定位（index/坐标/selector） | 多策略 | ✅ index + selector + :contains + 坐标 + 空参引导 | 🟢 |
| 3 | **截图即视觉理解** | 模型直接读图（多模态入上下文） | 🟢 **已落地**（`attachImagesToMessages` + `image_url` 组装）；残余 C2 图片压缩缺（原图直发 5MB+ 可能 400） | 🟢 |
| 4 | **原生弹窗处理** | 弹窗自动接管 | 🔴 桌面端无 `dialog` 监听 → 弹窗同步阻塞 renderer 卡死；Web 端正常（B4） | 🔴 |
| 5 | 连接保活 / 自愈 | 断连自愈 | 🟡 `recoverSession()` 定义零调用；无 `disconnected` 监听；166 次 CDP 失败（B1） | 🟡 |
| 6 | **多会话隔离** | 会话级隔离 | 🟡 conv-scoped 绑定已部分落地（`browser.ts:1829`）；全部读路由归属保护覆盖面待核 | 🟡 |
| 7 | 工具清单一致性 | 提示词=工具面 | 🟡 已补挂载但仍靠守门测试防漂移（B2） | 🟡 |
| 8 | 长任务自动续跑 | 子智能体也接力 | 🟡 主循环有接力，子智能体不接力（开发模式长任务文档） | 🟡 |
| 9 | 上下文/成本杠杆 | 前缀缓存命中 | 🟡 时间戳已移出（缓存不再必失效）；残余：`cached_tokens` 不读、变动段仍在 system 尾部 | 🟡 |
| 10 | 双链路语义一致 | 单一执行面 | 🟡 桌面/服务端同工具行为偶发漂移（upload/selector/弹窗）（B3/B6） | 🟡 |
| 11 | 全链路日志 | 可观测 | 🟢 2026-10-10 已加 `[browser-action]` 日志（`main.cjs:2837`） | 🟢 |

**一句话对标结论**：pageAgent 在"操作广度 + 真实输入 + 虚拟光标 + 多模态视觉"上已追平 WorkBuddy；**2026-10-11 复核后剩余的 🔴 硬伤收敛为 2 个**：弹窗自愈（B4）、CDP 保活接线（B1），外加 3 个 🟡 残余（隔离覆盖面、缓存可观测、C2 图片压缩）。

---

## 三、不足之处（分级 + 源码证据）

### 🔴 P0 — 复核后仍成立的硬伤（仅 2 项）

**P0-1 原生 `alert/confirm` 弹窗无处理（对标 D5）**
- 桌面端全文件无 `wc.on('dialog')`、服务端无 `page.on('dialog')`（2026-10-11 两处 grep 均**零命中**）。
- 后果：**同一工具同一页面 —— 桌面卡死（弹窗同步阻塞 renderer，后续 `executeJavaScript` 全挂到 18s 总闸），Web 端正常**。

**P0-2 CDP 保活 / 自愈接线缺失（对标 D5）**
- `recoverSession()` 仍是死代码：`browser.ts:494` 注释自证"早已实现了导航回去的逻辑 —— 但从未被接线调用"；无 `disconnected` 监听。
- 后果：连接断了系统不知道，必须等下一次调用才重建（166 次 CDP 失败的一部分）。

**P0 残余（🟡，随波次顺带）**
- 隔离覆盖面：conv-scoped 绑定已落地，但全部读路由（`/state` `/screenshot` 等）的归属保护是否全覆盖待逐路由核查。
- 缓存可观测：`cached_tokens` / `cache_read_input_tokens` 全仓不读 → 无法量化命中率。
- C2 图片压缩：`attachImagesToMessages` 走 `readFileBase64` 原图直发，无 resize/quality/字节预算。

### 🟡 P1 — 健壮性/一致性（对标 D5/D2/D1）

- **B1 CDP 保活**：无 `disconnected` 监听，`recoverSession()` 零调用（`browser.ts:358`）；166 次连接失败部分源于"断了不知道"。
- **B3 upload 双链路语义漂移 + 节点失效**：桌面 `dbg.attach` 未 try/catch（`main.cjs:2432`），`pickVisibleInput` 兜底盲投 `nodeIds[0]`（`main.cjs:2437-2450`）→ CDP "Either nodeId… must be specified"；服务端走 `filechooser` 语义不同。
- **B5 actionMap 漏映射**（已用 `DESKTOP_BROWSER_ACTIONS` 单一真相源缓解，但渲染层仍依赖查询）：能力在、入口断的历史已收敛。
- **B6 双链路语义漂移**：`browser_get_dom` 桌面只回节点数 vs 服务端回完整树；`browser_get_page_content` 桌面 interactive 不含 `selector` vs 服务端含。
- **子智能体不自动接力**：`runSubAgent` 达 `maxSteps` 只总结返回（`llm-task-manager.ts:2937-2952`），开发模式重活断在子智能体。
- ~~D2 前端 token 口径~~ **已修**（`useChat.ts:1540` 已计入 toolCalls），移出待办。

### 🟢 P2 — 低成本收口

- **A1 写路由白名单漏 `/render`/`login-saved`/`passwords/:id/fill`**（`browser.ts:36-38`）—— 并发导航仍错乱。
- **A2 文件级 RMW 非原子**（空间记忆/计划文件 `space-memory.ts:150-167` `task-plan-file.ts:205-223`）—— 并发静默丢更新。
- **C2 图片压缩缺失**：截图原图无 resize/quality 上限（`chat.ts:1814`），整页长图常 5MB+ 直接 400。
- ~~C6 归档正则~~ **已修**（`llm-task-manager.ts:4331`，2026-10-09），移出待办。

---

## 四、改造方向（分阶段路线图）

> 原则（项目一贯判据）：① **断言存在 ≠ 断言生效**，每改一项必须真跑验证；② 同一语义只留一处实现；③ 不整文件提交、不裸 `rm`；④ 改 server/core 必须真编译再打包。

### 波次 1 —— 止血：让 pageAgent"断不了、卡不死、看得见成本"（复核后仅 2+3 项）

| # | 项 | 改造 | 验收 | 风险 |
|---|---|---|---|---|
| 1 | **P0-1 弹窗处理** | 桌面每个 guest 挂 `wc.on('dialog', ...)` 统一 accept/dismiss；服务端 `page.on('dialog')` 注册 handler，两链路行为对齐 | 桌面端遇 alert，后续操作不再 18s 卡死 | 中 |
| 2 | **P0-2 CDP 保活** | 挂 `disconnected` 监听置脏单例；把 `recoverSession()` 接进 `getPage()` 假死分支（替代"close + createTabPage"裸重建） | 手动 kill CDP 后下一次工具调用自愈（不报 502） | 中 |
| 3 | 隔离覆盖面核查 | 逐路由核查读路由归属保护；漏的补 `x-yz-conversation-id` 校验（不匹配显式报错） | 跨会话截图不串页 | 低 |
| 4 | 缓存可观测 | 读 `usage.cached_tokens` / `cache_read_input_tokens` 落日志 | 同会话第二轮日志可见命中数 | 极低 |
| 5 | C2 图片压缩 | `attachImagesToMessages` 注入前 resize（长边 ≤1536）+ JPEG q80 + 单请求字节预算 | 大截图不再 400，token 在预算内 | 中 |

> ~~原波次 1 的"多模态接通 / 时间戳移出 / 归档正则"~~ 复核后确认**已落地**（见 §零），移出待办。

### 波次 1.5 —— 表单填写与文件提交强化（2026-10-11 用户点名，**根因已查明**）

**核心发现：能力早就写好了，但 pageAgent 没挂载。**
`browser_fill_form` 实现完整（`packages/core/src/tool/builtin/browser/index.ts:450-486`：`fields` 数组**一次填多个字段**，支持 text/select/checkbox/radio，select 支持 label 或 value，失败字段逐条上报含原因）；桌面端 `fill_form` 也已按服务端语义对齐（`main.cjs:3491-3556`，radio 走 click、label 选法、native setter 触发 React）。**但 `PAGE_AGENT_BUILTIN_TOOLS`（`db.ts:1100-1127`）14 项里没有它，提示词也只推荐 `browser_type`** → pageAgent 只能一次 `browser_type` 填一个框，这就是"表单填写效率低"的根因（本项目最典型的"能力在、入口断"）。

| # | 项 | 改造 | 验收 | 风险 |
|---|---|---|---|---|
| F1 | **挂载 fill_form / submit_form** | `PAGE_AGENT_BUILTIN_TOOLS`（`db.ts:1100`）追加 `browser_fill_form`、`browser_submit_form`；同步前端 `agent.ts` 同名清单；守门测试 `page-agent-tool-mount-consistency.test.ts` 自动覆盖三处一致性 | pageAgent 遇多字段表单时调用 fill_form 且一次填完 | 极低（挂载即用，实现已就绪） |
| F2 | **提示词加表单指引** | `PAGE_AGENT_SYSTEM_PROMPT`（`db.ts:1170+`）加一段：多字段表单**一律用 `browser_fill_form` 一次填完**（fields 数组，select 用 label，radio/checkbox 用 true/false），禁止逐个 `browser_type`；填完用 `browser_submit_form` 或点击提交按钮；部分失败时按返回的 failed 列表换 selector 重试 | 实测多字段页面一次调用完成全部填写 | 极低 |
| F3 | **修 main.cjs 重复 push bug** | `main.cjs:3518-3519` `failed.push({selector:sel,reason:'元素未找到'})` **连续写了两遍** → 每个未找到字段被报两次（计数翻倍） | 删一行；fill_form 单测断言 failed.length==1 | 极低 |
| F4 | **B3 upload 加固（文件提交）** | 桌面 CDP 路径（`main.cjs:2430-2526`）：① `dbg.attach('1.3')` 包 try/catch 返回可区分错误码；② `pickVisibleInput` 兜底不再盲投 `nodeIds[0]`，改报 `no_visible_input`；③ `setFileInputFiles` 前用 `DOM.describeNode` 复验 nodeId，失效重取；④ 与服务端 filechooser 路径统一错误码枚举 | 在裸 input 页与 filechooser 站点（抖音创作者类）各传一次成功；找不到 input 时报明确错误而非 CDP 乱码 | 中 |
| F5 | （可选，需拍板）fill_form 扩展 file 字段 | fields 支持 `{type:'file', filePath}`，一次调用完成"填字段+挂文件"。**默认不做**（upload 已挂载且语义清晰，避免一次改动面过大） | — | — |

- ★ 硬性约束（沿用）：挂载写类工具 `fill_form`/`submit_form`/`upload` 需核对 `WRITE_TOOLS` 登记（此前 `browser_upload`/`file_write` 已处理，新挂两个补齐 + 只读会话拒绝测试）。
- ★ 验收真跑：造一个含 5 个文本框 + 1 下拉 + 1 radio 的本地测试页，pageAgent 应**一次 fill_form 调用**填完全部并提交；再跑一次带文件上传的提交。

### 波次 2 —— 修静默失效（P1）

| # | 项 | 改造 | 风险 |
|---|---|---|---|
| 5 | B1 CDP 保活 | 挂 `disconnected` 监听置脏；`recoverSession()` 接进 `getPage()` 假死分支 | 中 |
| 6 | B3 upload 容错 | `dbg.attach` try/catch；`setFileInputFiles` 前 `describeNode` 复验；失败报 `no_visible_input` 不盲投；两链路统一错误码 | 中 |
| 7 | 子智能体接力 | `runSubAgent` 外层加 `batch` 接力（复用 `decideAutoContinue` 判据，默认 1~2 轮） | 中 |
| 8 | ~~D2 前端 token 口径~~ | 已修（`useChat.ts:1540` 已计入 toolCalls，2026-10-09），移出待办 | 极低 |
| 9 | B6 桌面 selector 补齐 + 声明差异 | 桌面 interactive 补 `selector: genSel(el)`；确有裁剪在工具描述显式声明 | 低 |

### 波次 3 —— 并发与成本（P2，含已部分落地的收口）

| # | 项 | 改造 |
|---|---|---|
| 10 | A1 写路由补锁 | 白名单补 `/render`；`login-saved`/`passwords/:id/fill` 包 `withBrowserLock` |
| 11 | A2 `keyed-serial-queue` | 按路径/会话 keyed 串行文件 RMW，一处实现两处复用 |
| 12 | C2 图片压缩 | 长边 ≤1536 + JPEG q80，vision 请求 ≤1.5MB 超限降级 |
| 13 | ~~C6 归档正则~~ | 已修（见 §零），移出待办 |
| 14 | D3/D4 压缩提前 + 常态化裁剪 | `COMPRESS_ADVANCE_RATIO=0.7` + 窗口外 tool 结果常态 cap 8KB + 手动 `/compact` |

### 波次 4 —— 架构项（另行立项）

- A4 方案②：活动页 `Map<convId,{page,activeTabId}>` 彻底隔离。
- D7 动态能力表、D6 裸会话跨会话链路、C5 computer-use 多模态、D8 压缩历史回退。

---

## 五、验收标准（总）

- **对标 D3**：视觉模型直接读出截图文字（不调 `image_analyze`）；大截图像素/字节在预算内。
- **对标 D5**：桌面弹窗后不卡死、CDP kill 后自愈；子智能体长任务不断。
- **对标 D4**：跨会话截图不串页（显式报错或 per-convId 隔离）。
- **对标 D6**：`cached_tokens>0`、前后端 token 口径一致。
- **对标 D1/D2**：`/render` 并发有序、0 静默丢更新、双链路同工具行为一致。

---

## 六、与既有方案的关系

| 既有文档 | 本次处置 |
|---|---|
| `并发-pageAgent-截图-上下文-四项差距与修复方案-20261009.md` | 块 A/B/C/D 的**源码实证**全部继承；本方案把它收敛为"对标 WorkBuddy 的 6 维评分 + 4 个 P0 假能力"视角，并明确"下一轮开干"的波次排序 |
| `pageagent-browserview-unify-plan.md` | 双链路统一（方案 A）已落地，本方案不再重复，只保留其"双链路语义漂移"为 P1（B6） |
| `开发模式长任务与上下文-对齐CodeBuddy差距与优化方案.md` | 子智能体不接力（P1 项 7）复用其 P1-1 |

★ 本方案**不新增架构分歧**：波次 1 的多模态改动只在发送层（`toApiMessage`/`toAnthropicMessages`），与"不改落库/前端"原则一致。
