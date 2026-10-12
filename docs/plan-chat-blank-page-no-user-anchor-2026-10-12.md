# 任务后期「内容区整页空白」—— 根因与修复方案

> 2026-10-12 · 状态：**P0 已落地**（根因 CDP + 后端接口双重实测；13 项行为测试 + 变异验证全过）
> 用户实报：*「还有这个内容区域不显示了？」*（截图：任务运行中 · 已用时 **26:48**，左侧聊天区空白，右栏预览正常）

---

## 0. 一句话结论

**分页首拉 50 条被「子智能体消息」填满，而 `messageRounds` 的分轮以主链路 `user` 为锚**
⇒ 首页里没有任何主链路消息可锚 ⇒ `currentRound` 恒为 `null` ⇒ **所有消息被 `continue` 丢弃**
⇒ `messageRounds = 0` ⇒ **整个内容区空白**（数据全在，只是渲染不出来）。

与右栏预览无关 —— 右栏用的是主进程独立的 tab 状态，所以它照常显示。

---

## 1. 实测铁证（CDP 直连渲染进程 + 后端接口对照）

### 1.1 渲染层（CDP 读 `ChatMessageList` 组件实例）

```json
{
  "storeCurrentMessages": 353,     // ★ store 里有 353 条
  "roundsLen": 0,                  // ★ 但 messageRounds 算出 0
  "domMessagesChildren": 1,        // ★ .messages 容器只有 1 个子节点
  "domFirstChild": "div.history-sentinel",   // ★ 只有顶部加载哨兵，一条消息都没有
  "histSentinelVisible": true
}
```

**矛盾点即根因**：353 条输入 → 0 个 round。

### 1.2 后端接口按页大小对照（同一会话 `c11dfe7b`）

| `limit` | 返回条数 | role 构成 | 有主链路 user？ | 有主链路 assistant？ |
|---|---|---|---|---|
| **50（= 前端首拉值）** | 50 | `assistant+sub: 25` + `tool+sub: 25` | ❌ **无** | ❌ **无** |
| 100 | 100 | 42+44 sub / 8 tool / 5 assistant / 1 user+sub | ❌ | ✅ idx 13,15,18 |
| 200 | 200 | 86+87 sub / 14 tool / 10 assistant / 3 user+sub | ❌ | ✅ idx 7,73,75 |
| 400 | 400 | 180+177 sub / 21 tool / 16 assistant / 1 user / 5 user+sub | ✅ idx 10 | ✅ |

⇒ **`limit=50` 时最新 50 条 100% 是子智能体消息，主链路消息一条都没有。**

`+sub` 指 `parent_tool_call_id` 非空（子智能体消息）。

---

## 2. 因果链（逐环节，含源码锚点）

| # | 环节 | 源码位置 | 事实 |
|---|---|---|---|
| ① | 前端首拉只取 **50** 条 | `stores/chat.ts:1055` `HISTORY_PAGE_SIZE = 50` | 取的是**最新** 50 条（`ORDER BY DESC LIMIT`） |
| ② | 子智能体消息 **海量** | `call_agent` 执行期 | 一次子智能体调用产生几十~上百条 `assistant+sub` / `tool+sub` |
| ③ | 首页被子消息填满 | §1.2 实测 | 50 条里 0 条主链路消息 |
| ④ | 子消息在分轮里**先被丢弃** | `useChat.ts` messageRounds | `stepByToolCallId.get(parentToolCallId)` 取不到父 step（父在更早的页）→ `continue` |
| ⑤ | 无 `user` ⇒ 无从开轮 | 同上 | `if (msg.role === 'user') { ... currentRound = {...} }` 从未命中 ⇒ `currentRound === null` |
| ⑥ | 主链路消息也**全被丢弃** | 同上 | `else if (msg.role === 'assistant') { if (!currentRound) continue; ... }`<br>`else if (msg.role === 'tool') { if (!currentRound) continue; ... }` |
| ⑦ | 表现 | 用户截图 | `rounds = 0` ⇒ `.messages` 只剩 `history-sentinel` ⇒ **整页空白** |

### 为什么 26:48 才出现

任务**前期**主链路消息稀疏、子智能体消息还没堆积，最新 50 条里有 `user` ⇒ 正常渲染。
任务**后期**子智能体反复调用（`call_agent` 长活），最新 50 条被 `+sub` 填满 ⇒ 触发本 bug。
**这是"任务越跑越久越容易白屏"，不是随机故障。**

### 为什么右栏预览不受影响

右栏 `BrowserPanel` 用的是主进程的 tab 状态（独立于聊天消息流），与 `messageRounds` 无关。

---

## 3. 修复方案

### P0（最小、必做）—— 分轮时**兜底建轮**，不再依赖 `user` 必然存在

**问题本质**：分轮逻辑把"`user` 消息"当成了**开轮的必要条件**，但分页首拉**不保证**页内有 `user`。

**修法**：当遇到 `assistant`/`tool` 而 `currentRound === null` 时，**补一个占位轮**（`user: null`），
后续消息照常填进这一轮，渲染层对 `user: null` 的轮已有兼容（`round.user?.id` 用了可选链，
且 `v-for` 的 key 有 `'r' + ri` 兜底）。

```ts
// messageRounds 内，assistant / tool 分支前补一个"隐式开轮"：
} else if (msg.role === 'assistant') {
  // ★★★ 分页首拉不保证页内有 user（子智能体消息会填满最新 N 条）。
  //   此前无 user 就 continue ⇒ 整页消息全丢 ⇒ 内容区空白（2026-10-12 实锤）。
  //   补一个 user:null 的隐式轮，让"没有轮头的一页"也能渲染。
  if (!currentRound) currentRound = { user: null, steps: [], allToolCalls: [], finalAssistant: null };
  ...
} else if (msg.role === 'tool') {
  if (!currentRound) continue;   // tool 不该开轮（它必属于某个 assistant）
  ...
}
```

**取舍**：
- ✅ 改动最小（约 3 行），风险低
- ✅ 语义正确：分页窗口没有轮头时，**在窗口内渲染窗口内的内容**才是对的
- ⚠️ 渲染层需确认 `round.user === null` 时不留空档（`ChatMessageList.vue:20` 的 `round.user?.id`
  已用可选链；但 `<template>` 内是否无条件渲染用户气泡需核对 → 见 §4 测试项）

### P1 —— 首页"按轮对齐"取数，从根上避开

**思路**：首拉时**向前多取到最近的 `user` 为止**，保证页内至少有一个轮头。

- 实现：首拉先用 `limit=50`，若页内无主链路 `user`，则用 `before` 游标继续向前拉，直到拉到 `user` 或达到硬上限（如 3 页 / 150 条）
- ✅ 从根上消除"页内无轮头"
- ⚠️ 代价：首屏可能多拉 2~3 页（子智能体多的会话），首屏延时增加
- ⚠️ 与"任务一跑就卡死"的优化目标（当初引入分页的动机）需要平衡

**推荐**：**P0 必做，P1 视 P0 上线后的观感决定**。P0 已能彻底消除白屏；
P1 改善的是"首屏只看到子智能体片段、看不到轮头"的观感。

### P2（可选）—— 子智能体消息**默认折叠**

子智能体消息（`+sub`）在 50 条里占 100%，即使渲染出来也是一屏的中间过程。
可考虑在首屏"折叠"或"聚合"子智能体过程（用户可展开）。

- ⚠️ 属产品形态变更，**需用户拍板**，不在本次止血范围
- 也与"内部优化不得新增用户侧提示/按钮"的约定需要一起考虑

---

## 4. 测试方案（正式测试类 + 变异验证）

### 新增 `packages/ui/src/composables/chat/message-rounds-orphan.test.ts`

**行为级**跑 `messageRounds`（或抽出纯函数 `buildMessageRounds(msgs)` 单测）：

| # | 用例 | 断言 |
|---|---|---|
| 1 | ★★★ 一页**全无 user**（全是 assistant+tool） | `rounds.length === 1`（不是 0），且轮内 steps 数正确 |
| 2 | ★★★ 一页**全无 user、且全是子智能体消息**（复刻本次现场：25 assistant+sub + 25 tool+sub） | 不崩、不抛异常；`rounds` 有一个兜底轮（孤儿子消息无父 step → 丢弃，但**不影响主链路渲染**） |
| 3 | 正常页（user 在首位） | 与既有行为逐字一致（防回归） |
| 4 | user 在页中间 | 页首的 assistant 归入兜底轮，user 之后开新轮 |
| 5 | 空页 | `rounds.length === 0`（空态不硬造轮） |

**变异验证**：
- 把 `if (!currentRound) currentRound = {...}` 改回 `if (!currentRound) continue` → **用例 1/2/4 必须红**

**渲染层核对**（`ChatMessageList.vue`）：
- 断言 `round.user` 为 null 时**不渲染用户气泡**（`v-if="round.user"` 存在），
  否则会出现空气泡/空头像

### 契约测试（可选）
- 断言 `HISTORY_PAGE_SIZE` 相关的首拉路径**不得假设页内有 user**

---

## 5. 影响面与风险

| 项 | 评估 |
|---|---|
| 改动 | 1 处（`useChat.ts` messageRounds，~3 行）+ 可能 1 处（`ChatMessageList.vue` 的 `v-if`）+ 测试 |
| 行为变化 | **只修劣化**：页内有 user 时逐字等价（`currentRound` 正常建立，兜底分支不执行） |
| 风险等级 | **low** —— 兜底分支只在"原本会丢全部消息"时生效 |
| 附带收益 | 长任务后期不再白屏；首屏能看到窗口内的主链路消息 |
| 不涉及 | 不改分页大小、不改子智能体聚合形态（P2 另议） |

---

## 6. 与本次其它修复的关系

| 时间 | 问题 | 层次 | 状态 |
|---|---|---|---|
| 17:00 | 禁用标志/接管条/虚拟鼠标/暂停集体消失 | 控制信号（`browserSteps` 容量冻结活性） | ✅ 已修 |
| **本次** | **内容区整页空白** | **渲染分轮（页内无轮头）** | **待确认** |
| 17:10 | 步骤日志保留策略 | 容量参数 | 方案已出，待拍板 |

三者**互相独立**，不是同一根因 —— 但都符合本项目的一条共同教训：
**「代理信号」（长度 / 页内必须有 user 的隐含假设）在边界条件下会静默失效。**

---

## 7. 落地情况（2026-10-12 已实施）

### ✅ 改动清单

| 文件 | 改动 |
|---|---|
| `packages/ui/src/composables/chat/message-rounds.ts` | **新增**：分轮逻辑抽为纯函数 `buildMessageRounds(msgs, isToolError)` + 三个类型定义迁入。**含本次修复**：assistant 分支无轮时兜底建轮（`currentRound = { user: null, ... }`），替代旧 `if (!currentRound) continue` |
| `packages/ui/src/composables/chat/useChat.ts` | 内联实现（7191 字符）替换为 4 行调用；类型 **import + re-export**（文件内部也在用，只 re-export 会 `Cannot find name`） |
| `packages/ui/src/composables/chat/message-rounds.test.ts` | **新增** 13 项（行为级 + 源码契约） |
| `packages/ui/src/composables/chat/send-reentry-lock.test.ts` | 修**两个假失败源**（见下） |

### ★★★ 为什么抽成独立模块

原实现在 `useChat.ts` 里内联，而 `useChat.ts` 顶层依赖 router / pinia / api client —— 测试加载代价大且易耦合。
本 bug 的形态是「整页空白」且**分支全在、逻辑失效**（`if (!currentRound) continue` 那行确实存在），
grep 必然全绿 ⇒ **只能行为级测试**。
⇒ 按 `plan-buckets.ts` / `stale-run-sweep.ts` 同一模式抽出，main 侧 import（唯一实现），测试 import（真跑）。

### ✅ 顺带修掉的两个"假失败源"（`send-reentry-lock.test.ts`）

抽走 `messageRounds` 后源码位移，暴露了该测试**一直存在的脆弱点**（此前偶然为绿）：

1. **CRLF**：`useChat.ts` 行尾是 `\r\n`。`l.replace(/\/\/.*$/, '')` 里 `.` 不匹配 `\r` 且 `$` 无 `m` 标志
   ⇒ **含 `\r` 的行匹配失败、整行不剥** ⇒ 注释里的 "await" 被当真代码 ⇒ 假报"入队块有 await"
2. **块注释** `/** ... */` 跨多行，逐行剥 `//` 处理不了

修法：先 `replace(/\r\n?/g, '\n')` 统一行尾 + 剥块注释。
**变异验证**：在入队块插一个 `await` → 该断言**精确红**（证明修复没削弱杀伤力）。

### ✅ 测试结果

- `message-rounds.test.ts`：**13/13 过**
- ui 全量：**49 文件 / 719 过 / 0 失败**（`--testTimeout=60000`）
- `vue-tsc --noEmit`：**exit 0**
- **变异验证**：把兜底建轮改回 `if (!currentRound) continue` → **5 项红**（含两个核心行为用例 + 源码契约守门）

### 未完成的验证

⚠️ **CDP 端到端实测未做** —— 实施期间用户关闭了应用（52799 端口已拒绝连接）。
启动/重启应用属用户决定，**不代为启动**。逻辑与编译层已全绿；
建议下次应用打开后确认：长任务中 `messageRounds.length > 0`、`.round-group` 有子节点。

### 待确认（未做）

1. P1（首拉按轮对齐）—— 会牺牲一点首屏速度换取"首屏必有轮头"的观感
2. P2（子智能体过程默认折叠）—— 属产品形态变更，需单独拍板

---

## 8. 附：与本次其它修复的关系

| 时间 | 问题 | 层次 | 状态 |
|---|---|---|---|
| 17:00 | 禁用标志/接管条/虚拟鼠标/暂停集体消失 | 控制信号（`browserSteps` 容量冻结活性） | ✅ 已修 |
| 17:14 | 步骤日志保留策略（上限 120 → 20） | 容量参数 | ✅ 已落地（方案 A） |
| **本次** | **内容区整页空白** | **渲染分轮（页内无轮头）** | ✅ P0 已修 |

三者**互相独立**，不是同一根因 —— 但都符合本项目的一条共同教训：

> **「代理信号」（数组长度 / "页内必有 user" 的隐含假设）在边界条件下会静默失效。**
> 判定一个事实，要问「这个信号在什么条件下不再代表它想代表的东西」，
> 而不是「它在常见路径下对不对」。
