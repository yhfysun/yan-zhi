# 并发 / pageAgent / 截图分析 / 上下文管理 —— 四项差距与修复方案

> 2026-10-09 · 基于**源码逐处核查**（非文档转述）。所有结论带 `文件:行号`。
> 核实口径：**"方案里写了" ≠ "代码里有"** —— 已有方案文档中"已规划未落地"的项，本文一律回源码复核后标注。

## 一、总览

| 块 | 一句话结论 | 最痛的缺陷 | 优先级 |
|---|---|---|---|
| **A 并发** | 串行化**只覆盖了"同会话 + 写操作"**一条路径；跨会话与"写/读边界"裸奔 | 两处串行化**维度不一致**（前端按 convId / 服务端按全局写白名单），且白名单漏写路由 | P0 |
| **B pageAgent** | 生命周期/元素降级已扎实；缺的是**连接层"活着"的语义**与**模型侧指令对齐** | `recoverSession()` 定义了**零调用**；提示词推荐了**未挂载**的工具 | P0 |
| **C 截图分析** | **协议齐、集成缺一半、服务端全缺** → 当前"截图分析"是**假的** | `Message.content` 只能是 `string`，模型**从未真正收到过图像** | P0 |
| **D 上下文** | 分层/压缩/模板都已达标；差的是**成本杠杆**与**可观测口径** | system prompt 尾部拼 `new Date()` → **前缀缓存跨任务 100% 失效** | P0（成本） |

### 优先级矩阵（按 用户感知 × 成本 × 风险）

```
低成本高收益（立刻做）          高成本高收益（分步做）
├ D1 提示词缓存稳定性 ★★★      ├ A2 文件级 RMW 串行 🟠
├ D2 前端 token 口径 ★★         ├ C1 多模态接通（改共享类型）🔴
├ B2 提示词/清单对齐 ★★         └ A4 读路由隔离（需定调）
├ A1 补写路由进锁 ★★
├ C6 归档正则 ★
└ B1 CDP 保活接线 ★★
```

---

## 二、块 A：并发

### A0 核心诊断：**串行化的维度不一致**（这是"两个 pageAgent 只有一个在动"仍复现的根因）

| 位置 | 维度 | 覆盖范围 |
|---|---|---|
| 前端 `packages/ui/src/stores/browser-op-queue.ts:26-37` | **按 convId 分桶** | 所有 `browser_*`（含只读），**同会话内**串行 |
| 服务端 `apps/server/src/routes/browser.ts:33-38` | **全局单队列**（无 convId） | 仅 7 条写路径白名单 |

★ 后果：**同会话双保险（冗余）；跨会话前端队列完全无效**，服务端又漏了写路由 → 跨会话仍错乱。
★ 底层 `pageInstance` / `activeTabId` / `tabs`（`browser.ts:63/72/74`）是**进程级单例、无 convId 维度**。

### A1 写路由白名单漏 3 个（P0，改动最小、收益最直接）

- `apps/server/src/routes/browser.ts:36-38` 白名单仅 `/navigate /action /back /forward /refresh /close /focus`。
- **漏掉的写操作**：
  - `browser.ts:1726 router.get('/render')` → `:1742 page.goto()` ← **导航是写**，且被 `BrowserPanel.vue:1203` 高频调用
  - `browser.ts:2394 router.post('/login-saved')` → `:2407 goto()` + `:2425 click()`
  - `browser.ts:2372 router.post('/passwords/:id/fill')` → `:2384 fill()`
- **修法**：白名单补 `'/render'`；`login-saved` / `passwords/:id/fill` 用 `withBrowserLock` 包一层。
- **验收**：三个端点并发调用时，第二个必须等第一个完成（可加测试直接断言队列行为）。

### A2 文件级「读-改-写」非原子（P0，静默丢更新）

| 位置 | 序列 | 后果 |
|---|---|---|
| `services/space-memory.ts:150-167 appendLineWithHeader` | readFile → 拼接 → writeFile 整文件 | 两会话同时收尾 → **后写覆盖先写 → 静默丢一条任务进展**（跨会话接力的"做到哪"丢失） |
| `services/space-memory.ts:125-138 pruneEntriesByMark` | 整文件过滤重写 | 同上 |
| `services/task-plan-file.ts:205-223 backendTaskStep` | `loadPlanJson` → 改 status → `savePlanJson`（`:160-167` 无版本/CAS） | 与前端 800ms 防抖 PATCH 并发 → **计划进度回退**（模型看到旧状态重复干活） |
| `services/memory-service.ts:596-612`（压缩前抢救） | 同上 RMW | 与自动接力批次并发 → 丢步骤 |

- ★ 关键判据：better-sqlite3 同步**只保证单条 SQL 原子**，不保证多语句序列。
- **修法（推荐）**：抽一个共享的 **`keyed-serial-queue`**（按 key 串行 async 任务，前端 `browser-op-queue` 是同款思路）
  → 文件写按**绝对路径** keyed、计划写按 **conversationId** keyed。一处实现，两处复用，避免再造第三份队列。
  **不要**只加 `try/catch` 或改 `appendFile`（后者解决不了"读-改-写整体"的竞争）。
- **验收**：并发 20 次 append 后，MEMORY.md 条目数 == 20（0 丢失）。

### A3 同会话"唯一 running"判定非原子（P1）

- `llm-task-manager.ts:748-752 createTask` 扫描同 convId running → `:820 tasks.set`，**扫描与写入之间有 await（DB 读）**。
- 后果：多窗口同时发送 → 同会话两个 running task → 双循环并发写 message 表；`injectUserMessage`（`:865-868`）只取第一个 → 注入行为随机。
- **修法**：加 `runningByConv: Map<convId, taskId>` 索引，在**同步段**内做原子占位（先占位再 await）。

### A4 读路由隔离（P1，需定调）

- `browser.ts:41` 读操作直通；但 `GET /screenshot`(`:1694`) / `GET /state`(`:1616`) 直接读全局 `pageInstance`
  → A 会话导航中、B 会话截图 → **B 拿到 A 的页面**，静默错乱。
- ★ 为什么当初不加锁：这些路由**常被 UI 轮询**，排队会让轮询卡在长操作后面 → UI 假死。
- **两个方向（需用户拍板）**：
  - 方案 ①（低成本）：读前**校验页归属**（比对 target 的 convId），不匹配则明确报错而非静默返回错页；
  - 方案 ②（根治）：活动页从单值改为 **per-convId 隔离**（`Map<convId, {page, activeTabId}>`，成本高、改动面大）。
- 建议先做 ①（止血 + 可观测），②列入后续架构项。

### A5 其余（P2）

- `llm-task-manager.ts:3064 autoDiagnoseLastAt` / `:3079 verifyStateByTask` 两个 Map **永不清理**（资源泄漏）→ 任务终态一并 delete。
- `llm-task-manager.ts:1610-1625 cleanupTasks` 2h 看门狗**在循环仍 await 时删除 task** → 加 `reclaimed` 标记让循环边界自检退出。
- `services/memory-dreaming.ts:44-52` / `services/scheduled-tasks.ts:385-392` 的 RMW 与无条件 UPDATE（单进程安全，多实例风险）。

---

## 三、块 B：pageAgent

### B1 CDP 连接**没有"活着"的语义**（P0）

- `browser.ts:107-168` 只在**下一次操作前**被动 `version()` 探活；**无** `browserInstance.on('disconnected')` 监听。
- ★★ `browser.ts:358 recoverSession()` **定义了、零调用**（`grep` 实证）→ "browser 还在、page 丢了"这条恢复路径**实际不存在**。
- 数据佐证：dev 库 `connectOverCDP` 失败 **166 次** —— 相当一部分是"连接断了但系统不知道"，必须等下一次调用才重建。
- **修法**：① 挂 `disconnected` 监听 → 置空单例并标脏；② 把 `recoverSession()` 接进 `getPage()` 的假死分支（`:327-345`），替代现有"close + createTabPage"裸重建。
- **验收**：手动 kill CDP 连接后，下一次工具调用能自愈（不报 502）。

### B2 提示词与挂载清单**三处漂移**（P0，纯文本对齐、零风险）

| 位置 | 问题 |
|---|---|
| `db.ts:1020-1037 PAGE_AGENT_BUILTIN_TOOLS` | **不含** `browser_get_page_info` / `browser_get_dom` / `browser_get_visible_text` |
| `db.ts:1134-1139`「读页工具分工」 | **主动推荐**上面这三个**未挂载**的工具 |
| `db.ts:1082` 工具声明 | 说"仅以下九个"，但实际还挂了 `browser_upload`(`:1028`)、`file_write`(`:1031`)，未声明 |

- ★ 后果：模型在长任务里**反复调不存在的工具** → 白跑一轮 + 用户看到"卡住"。
- **修法**：三处对齐（要么补挂载、要么删推荐段）。

### B3 `browser_upload` 节点失效无容错 + 双链路语义漂移（P1）

- 桌面 CDP 路径 `apps/desktop/main.cjs:2430-2526`：`2432 dbg.attach('1.3')` **未包 try/catch**；
  `pickVisibleInput`（`:2437-2450`）在全部候选 `DOM.resolveNode` 失败时**兜底返回 `nodeIds[0]`**（盲投）→
  若 nodeId 在 `getDocument` 与 `setFileInputFiles` 之间失效 → CDP 报 "Either nodeId, backendNodeId or objectId must be specified"
  ← **正是实测的报错**（在百度自建最简 `<input type=file>` 上同样复现，证明与站点无关）。
- 服务端 Playwright 路径 `browser.ts:1385-1437` 走 `filechooser`（语义完全不同）。
- **修法**：① `dbg.attach` 包 try/catch 返回可区分错误码；② `setFileInputFiles` 前用 `DOM.describeNode` 复验 nodeId，失效则重取；③ 兜底不再盲投而是明确报 `no_visible_input`；④ 两执行器统一错误码枚举。

### B4 原生 `alert/confirm` 弹窗无处理（P1）

- 桌面端全文件**无** `wc.on('dialog')`（`grep` 确认）；服务端 Playwright 未注册 handler 时**自动 dismiss**。
- 后果：**同一工具、同一页面 —— 桌面卡死（弹窗同步阻塞 renderer，后续 `executeJavaScript` 全挂到 18s 总闸）、Web 端正常**。
- **修法**：桌面为每个 guest 挂 `dialog` 事件；服务端注册 `page.on('dialog')`，两链路统一行为。

### B5 前端 actionMap 漏映射已实现工具（P1）

- `chat.ts:1577-1607 actionMap` 仅 26 项；**主进程已实现**但未映射：
  `browser_new_tab / switch_tab / close_tab / get_tabs / download / drag / scroll_into_view / is_visible / wait_for_request / get_network_log / visual_locate`
  （`main.cjs:3050-3250` 有对应 case）。
- 后果：命中 `chat.ts:1675` 兜底「桌面端暂不支持」→ **工具明明实现了却报不支持**。
- **修法**：补齐 actionMap（含返回文本格式化），或加"未映射但主进程支持"的透传兜底。

### B6 双链路语义漂移（P2，最难查的一类）

- `browser_get_dom`：桌面只回"节点数"（`chat.ts:1636`）vs 服务端回完整 DOM 树（`browser.ts:796-838`）。
- `browser_get_page_content`：桌面返回的 interactive 元素**不含 `selector`**（`main.cjs:2858`）vs 服务端含（`browser.ts:1192`）——
  而工具描述与提示词都承诺"元素含 selector"。
- **修法**：桌面侧补齐 `selector: genSel(el)`（与 `:2791 get_page_info` 对齐）；确有裁剪的，在工具描述里**显式声明差异**。

### B7 模块级全局单值跨会话污染（P2）

- `main.cjs:2249 noChangeStreak` / `:118 activeTabId`；服务端 `browser.ts:561 noChangeStreak` / `:74 activeTabId`。
- **修法**：`noChangeStreak` 按 tabId/convId 建 Map；服务端 `activeTabId` 按会话键索引。

### B8 CDP 端点只在启动解析一次（P2）

- `main.cjs:4447-4464 resolveCdpEndpoint` 缓存；Electron 重启端口重分配而 server 未重启 → 连旧端口 ECONNREFUSED（166 次的一部分）。
- **修法**：`connectCdpWithRetry` 失败时重读 `DevToolsActivePort` 再试。

---

## 四、块 C：截图分析

### C0 核心诊断：**协议齐、集成缺一半、服务端全缺** → 当前是**假的**

**事实链（全部源码实证）**：
1. `packages/shared/src/types/index.ts:153` —— `Message.content?: string;` **只能是字符串**
2. `packages/core/src/llm/client.ts:157` —— `if (m.content !== undefined) out.content = m.content;` **从不组装 image_url**
3. 图片入上下文**只有路径字符串**：`useChat.ts:2542`（上传）、`browser/index.ts:402` + `llm-task-manager.ts:3748`（截图）：
   `note: '...你本身看不到画面，需要...请继续调用 image_analyze 工具分析这张图'`
4. `anthropic.ts:36-61 toAnthropicBlocks()` **具备**把数组 content 转 image block 的能力，但 `content` 恒为字符串 → **该分支永不触发**
5. **唯一真的多模态请求**是 `LlmClient.visionAnalyze()`（`client.ts:891-939`，一次性、非流式），
   调用方只有一个：前端 `chat.ts:1834`。**`apps/server/src` 全仓无 vision 调用**（grep 实证）。

★ 结论：所谓"截图分析"= 截图落盘 + 提示模型 + **模型自觉**再发一次 `image_analyze`（仅前端可执行）。
模型不发 → 分析根本不发生，模型只能猜。

### C1 **多模态接通**（P0，块 C 的命门）

**架构选择（关键决策）**：
- ❌ 不要把 `Message.content` 改成 `ContentBlock[]` 并落库 —— 会牵动 db（TEXT 列）、压缩、前端渲染，风险大。
- ✅ **注入期展开**：持久化仍存**路径**（content 保持 string），在发送前组装（`toApiMessage` / `toAnthropicMessages`）
  按需把「图片路径标记」替换为 image block。**改动只在发送层**，历史/落库/前端全部不动。

**落地步骤**：
1. 在 `Message` 上加**可选**的多模态附件字段（如 `attachments?: {path, mime}[]`），不破坏既有 string 契约；
2. `toApiMessage`（OpenAI）支持把 attachments 转 `image_url: {url: data:...}`；
   `toAnthropicMessages` 复用**已存在**的 `toAnthropicBlocks` 逻辑；
3. 截图工具与上传链路写入 attachments（不再只写路径文本）；
4. 非视觉模型 → **自动降级**为现在的"路径 + 提示调 image_analyze"（保底不变）。

- **验收**：给一个视觉模型发一张含文字的截图，模型能**直接读出图中文字**（无需调 image_analyze）。

### C2 图片压缩（P0，与 C1 同批）

- 现状：`chat.ts:1814-1819` 直接 `readFileBase64` 原图，**无 resize / quality / 上限**（全仓无 sharp/jimp）。
- 风险：`capturePage()` 整页长图常数 MB → OpenAI/Anthropic 单图上限（约 5MB）**直接 400** 或瞬间吃 token。
- ★ 注意 `MAX_TOOL_RESULT_CHARS=48000`（`llm-task-manager.ts:530`）**只压缩文本**，对 base64 **完全不生效**。
- **修法**：统一 `resize`（长边 ≤1536）+ JPEG `quality≈80`；给 vision 请求单独字节预算（≤1.5MB）与超限降级提示。

### C3 视觉模型路由（P1）

- `chat.ts:1844-1869`：显式指定时拒绝未标 vision 的模型（保守，OK）；
  **未指定时"当前会话模型优先，失败换下一个"** → 会把图发给纯文本模型，靠 `client.ts:778-779` 正则猜拒答（**换措辞即漏判**）。
- ★ `services/model-caps.ts:1-27` 明确 capabilities 是"**测出来才勾的累加集合**"，**不能把"未标 vision"当"不支持"** —— 这正是路由靠试错的原因。
- **修法**：capabilities 升级为**三态**（支持/不支持/未知）；对"未知"做一次真实探测并**缓存结论**，不再每轮试错。

### C4 历史图片降级（P1，防 token 炸弹）

- 现状：历史里只有路径（暂不爆），但**无任何"只保留最近 N 张"机制**；一旦 C1 上线，历史图块会被全量回放。
- **修法**：与 C1 同批 —— 入上下文前把历史图片降级为「已分析的文字描述 + 路径占位」，只保留最近 1~2 张原图。

### C5 computer-use 截图缺多模态通道（P2）

- `plugins/computer-use.ts:512-648` 只回文本 JSON、**无 `_meta`** → 走通用钩子（`artifact-hooks.ts:60`）时**登记不进 `conversation_file`**。
- **修法**：与 C1 统一 —— 补 `_meta`，落盘后产出可被多模态注入的引用。

### C6 归档正则贪婪吞全角括号（P2）★ **本次核实的重要发现**

- `llm-task-manager.ts:3738` 仍是 `result.match(/已存档: (.+)/)?.[1]?.trim()` —— **贪婪，无 `[^）]` 限定**。
- 前端回传的是 `截图已捕获（已存档: <path>）`，结尾是**全角** `）` → 被吞进路径 → `fsp.stat` 失败 → **静默 catch**（`:3749-3751`）
  → 截图能存临时区但**登记不进 `conversation_file`**（文件管理里看不到）。
- ★★ **我的记忆声称"复用 SCREENSHOT_NAME_RE 修过"，但源码里没修** —— `SCREENSHOT_NAME_RE` 只存在于 `computer-use.ts:159`，
  **没有**被 `archiveDelegatedScreenshot` 使用。**记忆有误，已在记忆文件中纠正**。
- **修法**：改 `/已存档: ([^）\n]+)/` + 加守门测试（用含全角括号的输入断言路径）。

---

## 五、块 D：上下文管理

### D0 结论：分层/压缩/模板**已达标**，差的是**成本杠杆**与**可观测口径**

### D1 **提示词缓存稳定性**（P0，成本数量级杠杆）

- ✅ 已实现 Anthropic `cache_control` 断点：`client.ts:120-124`（system ≥4096 字符包成 `[{type:'text', cache_control}]`）、
  `:127-130`（最后一个 tool 上再打断点）、`:518-522` / `:609-613`（两条主链路都调用）。
- ❌ **致命**：`llm-task-manager.ts:5717` 固定拼 `parts.push('---\n当前时间：' + new Date().toLocaleString('zh-CN'))`
  → 任务内 system prompt 构建一次并复用（`:1822-1832` 构建 / `:2042` 复用），但**每个新任务都重建** →
  **时间戳必变 → 跨任务前缀缓存 100% 失效**。
- ❌ 更甚：system 尾部还拼了**按 userContent 检索的记忆**（`:1837-1844`）、计划（`:5648`）、模式指令（`:1898`）——
  **全是变动内容却放在稳定段的尾部**，与成熟产品"稳定前缀放头、变动尾部放尾"**正好相反**。
- ❌ `usage` 只读 `promptTokens/completionTokens`（`:2146`），**从不读 `cached_tokens`** → 无法量化命中率。
- **修法（改动面小、杠杆最大）**：
  1. `当前时间` 从 system prompt **移出**（移到首条 user 消息，或直接去掉 —— 模型不需要每轮知道精确时刻）；
  2. system 按「稳定 → 变动」重排：`基础提示词 + 工具清单 + 工作目录 + 项目规则`（稳定）在前，`记忆 + 计划 + 模式指令`（变动）后置；
  3. 读 `usage.cached_tokens` / `cache_read_input_tokens` 落日志，**先能看见再谈优化**。
- **验收**：同会话连续两轮，第二轮日志里 `cached_tokens > 0`。

### D2 前端 token 口径与后端不一致（P0，一行改动）

- 前端 `useChat.ts:1382-1383` 只算 `content + reasoningContent`，**不含 `toolCalls`**；
  后端 `window.ts:290-299` **明确计入**（注释说 toolCalls 常占最长部分）。
- 后果：前端显示用量**系统性偏低** → 用户更晚看到"快满了"，且与后端压缩行为**不一致**。
- **修法**：前端补上 toolCalls 的 `estimateTokens`。

### D3 压缩触发无余量 + 无手动压缩（P1）

- `context-view.ts:202-207`：`tokenCount > trigger` 才压，而 `trigger` = 有效窗口**原值**（`window.ts:270-274` 不再乘 0.5）→ **"压满才压"**。
- 成熟产品：`threshold = window − 摘要预留 − buffer`，社区建议提前到 70%。
- 全仓**无手动 `/compact`**（grep 无服务端命令入口）。
- **修法**：引入 `COMPRESS_ADVANCE_RATIO`（0.7）+ 加手动压缩入口。

### D4 工具结果无"常态化淘汰"（P1）

- 已有两级，但**都只在"超预算/压缩"时触发**：
  ① 压缩时把老 tool 输出按 8KB `capLongText` 裁（`window.ts:353-363`）；
  ② `enforceBudget` 把最长 tool 输出换占位符（`window.ts:162-188`），且**按长度排序、非按语义重要性**。
- 缺 mature 产品的 **microcompact**（每轮持续裁窗口外的老工具结果）。
- **修法**：把"保留窗口之外的 tool 消息一律 cap 到 8KB"提升为**每步常态**（成本极低、结构不破）。

### D5 `progress.md` 不注入导致"模型不知道进度"（P1）

- `space-memory.ts:406-424`：progress.md **不注入**（按需读）。设计初衷是防爆窗，合理；
  但**只有模型主动调 `api_space_memory_read` 才看得到**，而项目自己的文档就承认"长任务跑偏时模型根本不会去调"。
- **修法**：把 progress.md 的**最后 1 条**（最新收尾）**无条件注入** system prompt —— 保"接力链"不断，代价极小。

### D6 记忆分层的两个缺口（P2）

- `space-memory.ts:531-532`：会话**未挂空间** → `appendTaskProgress` 直接 `ok:false` → **裸会话跨会话完全断链**。
  → 修法：未挂空间时至少写进会话自身 `task_plan_json`。
- 记忆注入预算 1200 token（`memory-service.ts:89`）偏小 → 工程记忆易超限。

### D7 窗口声明误判 + 无动态能力表（P2）

- `constants.ts:43-48`：`n === DEFAULT_CONTEXT_WINDOW(1M) → 退 32K`。**真 1M 模型、用户手填整数 1048576** 会被判"没填"→ 整个会话按 32K 估。
- 全模型统一 `EFFECTIVE_CONTEXT_RATIO=0.25`，不区分厂商退化曲线。
- **修法**：判据从"等于默认值"改为"等于默认值 **且** 该平台是中等网关/未知端点"；或给用户"我确认这是 1M"的显式开关。

### D8 压缩历史不可回溯（P2）

- `db.ts:81-86 getLatestMessageSummary` 只取最新 1 条；无 list API。
- ★ `db.ts:120-130 deleteMessageSummariesAfter` **定义了但生产零调用**（仅测试 mock）→ "非破坏性回滚"（方案已写）**未落地**。
- **修法**：加 list 接口 + 前端"查看压缩历史/回退到压缩点"。

---

## 六、分批执行计划（建议波次）

### 波次 1 —— 止血与低成本高收益（建议先做）
| # | 项 | 块 | 风险 | 验证 |
|---|---|---|---|---|
| 1 | D1 提示词缓存稳定性（时间戳移出 + 段序重排 + 读 cached_tokens） | D | 低 | 两轮日志 cached_tokens>0 |
| 2 | B2 pageAgent 提示词/清单三处对齐 | B | 极低（纯文本） | 挂载清单 == 提示词推荐 |
| 3 | A1 补 `/render` 等写路由进锁 | A | 低 | 并发调用排队断言 |
| 4 | D2 前端 token 口径补 toolCalls | D | 极低 | 前后端口径一致 |
| 5 | C6 归档正则 + 守门测试 | C | 极低 | 含全角括号输入断言 |
| 6 | B1 CDP 保活 + `recoverSession` 接线 | B | 中 | kill 连接后自愈 |

### 波次 2 —— 修静默丢数据与"假能力"
| # | 项 | 块 | 风险 |
|---|---|---|---|
| 7 | A2 抽 `keyed-serial-queue` + 文件/计划 RMW 串行 | A | 中 |
| 8 | C1 多模态接通（注入期展开）+ C2 图片压缩 + C4 历史降级 | C | **高**（改共享类型，需分步） |
| 9 | B3 upload 容错 + 统一错误码 | B | 中 |
| 10 | B5 actionMap 补齐 | B | 低 |

### 波次 3 —— 健壮性与可观测
| # | 项 | 块 |
|---|---|---|
| 11 | B4 原生弹窗处理（两链路统一） | B |
| 12 | A3 `runningByConv` 原子占位 | A |
| 13 | D3 压缩提前 + 手动 `/compact` | D |
| 14 | D4 工具结果常态化裁剪 | D |
| 15 | D5 progress 最后一条无条件注入 | D |
| 16 | A4 读路由隔离（方案① 校验页归属） | A |
| 17 | C3 视觉能力三态 + 探测缓存 | C |
| 18 | B6/B7/B8 双链路语义收敛 / 全局单值分桶 / CDP 端点重解析 | B |

### 波次 4 —— 架构项（另行立项）
- A4 方案②（活动页 per-convId 隔离）、D7 动态能力表、D6 裸会话跨会话链路、C5 computer-use 多模态、D8 压缩历史回退。

---

## 七、验收标准（总）

- **A**：并发 20 次记忆写入 0 丢失；`/render` 并发有序；无跨会话错页静默返回。
- **B**：kill CDP 后自愈；pageAgent 不再调不存在的工具；桌面/服务端同一工具行为一致（upload / 弹窗 / selector）。
- **C**：视觉模型**直接读出截图文字**（不调 image_analyze）；大截图像素/字节在预算内；历史图不爆 token。
- **D**：`cached_tokens > 0`；前后端 token 口径一致；压缩可手动触发且历史可回溯。

---

## 八、元发现（本次核实的"记忆 vs 代码"冲突）

| 记忆声称 | 源码实际 | 处置 |
|---|---|---|
| 「截图归档正则复用 `SCREENSHOT_NAME_RE` 修过」 | `llm-task-manager.ts:3738` **仍是贪婪正则**；`SCREENSHOT_NAME_RE` 只在 `computer-use.ts` | **记忆有误，已纠正**；修复列入波次 1 #5 |
| 「`CONTEXT-NOTES.md` 上下文专题笔记存在」 | 该文件**不存在**（MEMORY.md:3 的指针指向空） | 需补一份专题笔记，或修正指针 |
| 「上下文压缩覆盖范围已统一」 | 大部分已落地；但 `deleteMessageSummariesAfter`（回滚）**零调用** | 已标注"方案已写、代码未做" |

★ 通用判据：**记忆是线索不是结论**。凡涉及"某缺陷是否已修"，一律回源码核验（本次因此抓出 3 处不符）。