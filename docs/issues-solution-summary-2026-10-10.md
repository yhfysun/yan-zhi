# yan-zhi 问题解决方案总汇（2026-10-10）

> 覆盖用户实报：**① 应用/聊天页卡顿**、**② 任务执行不下去**、**③ 追加任务时发送按钮禁用**、**④ 发送按钮启用条件**。
> 每条都给出：症状 → 根因（含实测证据） → 解决方案 → 落地状态。

---

## 一、卡顿（"整个应用卡、聊天记录滚不动"）

### 症状
pageAgent 运行中或长会话里，整个应用卡住、消息列表滚不动。

### 根因（量化铁证）

**R1 · `renderMarkdown` 无缓存** —— **主因**
- 模板里是**方法调用**：`v-html="renderMarkdown(round.user.content)"`（4 处）
- Vue 每次重渲都会重新执行 → 所有历史消息的 Markdown **全部重新解析**
- 流式期间 `chunk` 每 **50ms** flush 一次 → `messageRounds` 重算 → 整棵消息列表重渲
- 实测（某会话 **445 条消息 / 单条最大 15.8KB**）：

| 场景 | 耗时 |
|---|---|
| 无缓存，445 条解析一次 | **41.5 ms** |
| 每秒 20 次 flush | **830 ms CPU/秒**（主线程占满） |
| 加 LRU 缓存后同样 20 次 | **0.7 ms**（↓ 约 1000 倍） |

**R2 · `browserSteps` 无界增长**
- 8 个 push 点、**零上限、零清空**；`result` 直塞工具返回原文
- `browser_get_page_content` 返回**整页结构化文本**，单条可达数十 KB
- pageAgent 跑上百步 → 数组无限膨胀 + 每次 push 触发依赖它的 computed/watch

**R3 · `messageRounds` 全量重算（未根治）**
- `computed`，依赖 `store.currentMessages` → 任何消息变化（含流式 token）都**全量遍历重建**所有 round/step
- 模板三层 `v-for`（round → step → toolCalls）全量重渲
- 消息量 O(N)，每次重算 O(N) → 流式期间累积 O(N²)

### 解决方案
| # | 措施 | 状态 |
|---|---|---|
| 1 | `renderMarkdown` 加 **LRU 缓存**（`mdCache`，上限 300，`useChat.ts`） | ✅ 已落地 `840d2c7` |
| 2 | `browserSteps` 加**容量上限**（120 条）+ 单条**截断**（600 字），8 处 push 统一走 `pushBrowserStep()`（`stores/chat.ts`） | ✅ 已落地 `840d2c7` |
| 3 | `messageRounds` 增量化 / 虚拟滚动 | ⬜ **未做**（见下"待办"） |

> **为什么 R3 先不做**：Markdown 缓存已削掉**主要开销**（830ms→0.7ms）。根治需要虚拟滚动或
> 把"流式中的那一轮"从 `messageRounds` 拆出，属重构级改动、影响面大，建议单独排期。

---

## 二、任务执行不下去

### 症状
任务跑到一半"不动了"，界面显示运行中但没进展；用户等不下去只能停掉。

### 根因（`server.log` + `llm_task` 表实测）

**R4 · 浏览器工具委托超时（"卡"的机械原因）**
- 浏览器工具走 **SSE 委托前端**（`YZ_BROWSER_BRIDGE` 默认 **off**）
- 委托链路：`waitForFrontendSubscriber(15000)` → 失败再等 `8000` → **最坏单次卡 23s**
- 工具超时分档（`resolveFrontendToolTimeout`）：
  - 快档（`get_page_content`/`screenshot`/`run_script`…）= **90s + 60s 排队余量 = 150s**
  - 慢档（`navigate`/`click`/`type`…）= **7min + 60s = 8min**
- 前端卡（见 §一）→ 工具回执超时 → 返回"前端不可达" → 模型**换招重试** → 再卡

**R5 · 循环拦截后不收敛**
- `server.log` 实测（conv `a319d332`）：
  ```
  16:49:02 → 17:06:13  共 6 次「循环拦截」
    browser_get_page_content ×3 / browser_navigate ×2 / browser_run_script ×1
  ```
- `tool-loop-guard` 拦下后返回**指引文本**，但模型若继续换参数试探 → 反复触发
- 结果：任务在"等超时 → 被拦 → 重试"里**空转**

**R6 · 端口冲突崩后端（"服务重启"真凶）** ★ 新发现
- `logs/server-error.log` 实测：
  ```
  Error: listen EADDRINUSE: address already in use 127.0.0.1:3001
  Emitted 'error' event on Server instance → 进程崩溃
  ```
- `app.listen()` **无 error 处理** → Unhandled error 直接崩进程
- 崩了之后：前端 SSE 全断 → 启动时 `reapRunningTasks()` 把 `running` 任务标 `interrupted`
  → 用户看到「⚠️ 任务已中断（服务重启或手动终止）」
- ⚠️ **dev 与安装版改为同端口同库后，这个风险显著升高**（以前端口错开不会撞）
- ⚠️ 更糟：`bin/dev.mjs` 的 `guardProductionPort` 返回值**被忽略** → 明知被占仍继续启动

### 实测数据（`llm_task` 表）
```
completed  39
aborted     6     ← 用户手动停的（任务跑太久没结果）
failed      1
```
`conv=a319d332` 时间线：`16:57:38 → 17:12:54` 跑 **15 分钟**后 **aborted**；
用户重发后 `17:12:42 → 17:13:07` **25 秒完成**、`17:13:39 → 17:13:48` **9 秒完成**。
→ **不是永久卡死，是"单次任务耗时远超预期、用户等不下去"。**

### 解决方案
| # | 措施 | 状态 |
|---|---|---|
| 4 | §一 的卡顿修复 → 前端不再拖累委托，超时大幅减少 | ✅ 已落地 `840d2c7` |
| 5 | `app.listen` 加 **EADDRINUSE 明确报错**（可行动提示 + exit 1），不再 Unhandled 崩溃 | ✅ 本次落地 |
| 6 | `bin/dev.mjs`：`guardProductionPort` 被占时**中止启动**（不再忽略返回值继续跑） | ✅ 本次落地 |
| 7 | `tool-loop-guard` 阈值 / 拦截后强制收口 | ⬜ **未做**（见下"待办"） |
| 8 | `YZ_BROWSER_BRIDGE` 灰度档位（直连主进程，去掉 SSE 依赖） | ⬜ 已有实现但**默认 off** |

> **为什么要动 R7/R8**：R4/R5 是**结构性**问题 —— 只要还走"服务端→SSE→前端"这条链路，
> 前端一卡任务就磨。项目里已有 `browser-bridge` 直连方案（`c385092`），默认 `off` 是灰度高危开关。
> 建议：**观察一段时间后开 `shadow` → `on`**。

---

## 三、追加任务时发送按钮禁用 / 四、按钮启用条件

### 症状
任务运行中想追加消息，发送按钮是禁用状态点不动；用户期望"只有文字+文件都没有时才禁用"。

### 根因
**判据漂移成三套**，互不一致：

| 位置 | 判据 |
|---|---|
| 按钮 `:disabled`（`ChatInputArea.vue`） | `sending \|\| 无内容 \|\| !selectedModelId` |
| `canSubmit`（`ChatInputArea.vue`） | 有内容 && selectedModelId（**不含 sending**） |
| `canSend`（`useChat.ts`） | 有内容 && selectedModelId && **`!isConvStreaming`** |

两个错误：
1. **`sending` 是重入锁，不是"禁止发送"** —— 它在 `send()` 进入时置位、跨"建空间→建会话→落附件"
   多个 await，几百 ms~几秒期间按钮点不动
2. **`canSend` 的 `!isConvStreaming` 与「追加队列」设计直接冲突** ——
   `sendInner` 里本就有 `enqueueMessage` 分支（任务运行中入队），却被判据拦住

### 解决方案
| # | 措施 | 状态 |
|---|---|---|
| 9 | 按钮改 `:disabled="!canSubmit"`（消除第二套判据） | ✅ 已落地 `840d2c7` |
| 10 | `canSubmit` / `canSend` **统一口径** = 「有内容（文字/文件/引用任一）+ 选了模型」 | ✅ 已落地 `840d2c7` |
| 11 | 防重入仍由两道防线保证：`send()` 内 `if (sending.value) return` + 「取走内容即清空 input」 | ✅ 既有 |

---

## 五、已完成改动清单

### commit `840d2c7`（已推送）
`fix(chat): 发送按钮判据统一 + Markdown 渲染缓存 + browserSteps 上限`
- `packages/ui/src/components/chat/ChatInputArea.vue`
- `packages/ui/src/composables/chat/useChat.ts`
- `packages/ui/src/stores/chat.ts`
- 新增 `packages/ui/src/composables/chat/input-send-affordance.test.ts`（7 项）

### commit `16fb14d`（已推送）
`feat(dev): dev 与安装版共用一套库 + 同端口 —— 合并 dev 遗留数据`
- 数据合并 + 口径反转 + `db.ts` 兜底加固（详见 `docs/db-merge-dev-prod.md`）

### 本次新增（未提交）
- `apps/server/src/index.ts`：`app.listen` 的 **EADDRINUSE 处理**
- `bin/dev.mjs`：`guardProductionPort` 返回值强制生效（被占则中止）

---

## 六、待办（需排期，本次未做）

| # | 项 | 风险 | 建议 |
|---|---|---|---|
| A | `messageRounds` 增量化 / 虚拟滚动 | 中 | 长会话（>200 条）仍有重算压力；Markdown 缓存已覆盖主因，可观察后再定 |
| B | `tool-loop-guard` 阈值与"拦后强制收口" | 中 | 当前只拦不罚，模型可能继续试探；可加"同工具被拦 N 次 → 强制结束本批" |
| C | `YZ_BROWSER_BRIDGE` 开 `shadow` 灰度 | **高** | 直连方案能根治 R4；需真机观察鉴权/白名单稳定后再 `on` |
| D | 4 个既有测试失败（`browser-human-like-input`×2、`long-task-*`×2） | 低 | 远端拉下来就红，非本轮引入；需单独排查 |

---

## 七、验证与回滚

### 验证
- 全仓 `pnpm -r typecheck` 全绿（8 包）
- ui 测试 596 passed / 4 failed（4 个为 APK 图标文件缺失，环境前置条件，非代码回归）
- desktop 全部测试 134 项全过
- 库：`integrity_check = ok`、`foreign_key_check = 0`

### 回滚
```bash
# 数据库回滚（合并前快照）
cp "%APPDATA%/yan-zhi/server-data/backups/data.db.20261010-175836.bak" \
   "%APPDATA%/yan-zhi/server-data/data.db"

# 代码回滚
git revert 840d2c7   # 卡顿 + 按钮
git revert 16fb14d   # 库合并
```
