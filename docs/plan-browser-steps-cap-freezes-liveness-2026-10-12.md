# 长任务下「禁用标志 / 接管条 / 虚拟鼠标 / 暂停」集体消失 —— 根因与修复方案

> 2026-10-12 · 状态：**P0+P1 已落地**（根因 CDP 实测实锤；测试 11 项 + 变异 2 处全抓）
> 用户实报：*「还是有点卡，而且 ai 操作浏览器看不到了？模拟鼠标没了？页面禁用标志也没了，AI 接管的也没了？暂停也没了吗？」*

## 0. 一句话结论

`browserSteps` 的 **120 条上限**把 `watch(() => browserSteps.length)` 的触发条件**焊死了**：
到顶后每次 push 都伴随一次 splice，长度**恒等于 120**，watch **永不再触发** ⇒
`lastBrowserToolAt` 冻结 ⇒ **5 分钟硬上限兜底**判定"残留" ⇒
`inputLocked` / `liveControlVisible` / `agentCursorVisible` **三个 computed 同时被否决**
⇒ 禁用标志、接管条、暂停/恢复按钮、虚拟鼠标**一起消失**。

而任务**还在真跑**（实测步骤日志最后一条 12 秒前）。用户看到的"卡 + 功能全没了"是同一个 bug。

## 1. 实测铁证（CDP 直连运行中的安装版渲染进程）

探针读 pinia 实时状态（`tmp/probe-cdp.mjs`，只读）：

```json
{
  "streaming": true,               // 任务在跑
  "browserTaskActive": true,       // 浏览器记账在
  "browserStepsLen": 120,          // ★ 恰好 == BROWSER_STEPS_MAX
  "lastBrowserToolAt": 1791794169615,   // 停在此刻
  "lastStepAgoSec": 12,            // ★ 最后一条步骤才 12 秒前
  "agoSec": 754,                   // ★ 但 lastBrowserToolAt 已 754 秒（12.5 分）没动
  "lockStaleByHardLimit": true,    // ★ 判成"残留"
  "inputLockedShouldBe": false,    // ★ 禁用标志没了
  "liveControlVisibleShouldBe": false,  // ★ 接管条/暂停没了
  "agentCursor": null,             // ★ 虚拟鼠标没了
  "domChecks": { "shield": false, "cursor": false, "takeoverBar": false, "stepPanel": false }
}
```

**矛盾点即根因**：步骤日志 12 秒前还在增长，`lastBrowserToolAt` 却 12.5 分钟没动。
两者本应同源（`lastBrowserToolAt` 就是由步骤日志 watch 推出来的）。

服务端同刻确认任务真在跑：
```
GET /api/llm/tasks/active?conversationId=c11dfe7b-...
{"data":[{"id":"task_mv508qz3fcdfav","status":"running","eventCount":4825,...}]}
```

## 2. 因果链（逐环节，全部有源码锚点）

| # | 环节 | 源码位置 | 事实 |
|---|---|---|---|
| ① | 步骤日志 push + **容量裁剪** | `stores/chat.ts:391,397-401` | `BROWSER_STEPS_MAX = 120`；超限 `splice(0, len-120)` |
| ② | 活性时间戳由 **length watch** 推导 | `stores/chat.ts:435-438` | `watch(() => browserSteps.value.length, ...)` → `lastBrowserToolAt` |
| ③ | 到顶后 length 恒定 | — | 每次 `push` + `splice` = **净长度不变** ⇒ watch **永不触发** |
| ④ | `lastBrowserToolAt` 冻结 | — | 停在数组首次填满那一刻 |
| ⑤ | 5 分钟硬上限兜底 | `BrowserPanel.vue:548-551` | `(nowTick - last) > STALE_LOCK_MS` ⇒ `true` |
| ⑥ | 三 computed 同时被否决 | `BrowserPanel.vue:552-557, 581-584, 602-605` | 都带 `&& !lockStaleByHardLimit.value` / 依赖 `browserLiveFresh` |
| ⑦ | 表现 | 用户截图 | 禁用标志、接管条、暂停、虚拟鼠标 **全部消失** |

### ②③ 的注释与实现自相矛盾（这是 bug 藏身之处）

`stores/chat.ts:429-434` 原文：
> `★ 浏览器工具活性时间戳：browserSteps 最后一条的时间。` …
> `收口：所有 browserSteps.push 都带 time（6+ 处登记点），watch 最后一条即可全覆盖，不必逐点插桩。`

**"watch 最后一条"是对的，但实现是 `watch(length)`** —— 它只在**长度变化**时重新取最后一条。
一旦长度封顶，就再也不取。注释描述的意图（跟随最后一条）与代码（跟随长度）不一致，
且容量上限是**后加的**（2026-10-10 为治"越跑越卡"引入），加时**没有回归校这条依赖**。

## 3. 同类隐患（同一根因的第二处，必须一起修）

| 位置 | 判据 | 后果 |
|---|---|---|
| `useChat.ts:441` | `watch(() => store.browserSteps.length)` + `if (o === 0 && n > 0)` | 到顶后 length 恒 120，**永不触发** ⇒ 后续任务"首个步骤自动开预览面板"兜底失效 |
| `useChat.ts:463` | 同上，`o===0 && n>0` 锁输入 / `n===0 && o>0` 解锁 | 到顶后**永不触发** ⇒ `browserLockInput` 浮标不再跟随（次要，主判据已迁走） |
| `BrowserPanel.vue:583,604` | `browserSteps.length > 0` | 只做 `>0` 判断，到顶恒真 —— **无实质影响**，但语义已失真 |

## 4. 修复方案

### P0（唯一必需改动）—— 活性时间戳改为**显式赋值**，不再从 length 推导

**文件**：`packages/ui/src/stores/chat.ts`

在 `pushBrowserStep` 里**直接写** `lastBrowserToolAt`（push 点即活性点，唯一真相），
删掉 `watch(length)` 那条推导链：

```ts
function pushBrowserStep(action: string, result: unknown) {
  let text = /* …截断逻辑不变… */;
  const now = Date.now();
  browserSteps.value.push({ action, result: text, time: now });
  if (browserSteps.value.length > BROWSER_STEPS_MAX) {
    browserSteps.value.splice(0, browserSteps.value.length - BROWSER_STEPS_MAX);
  }
  // ★★★ 活性时间戳**在此显式登记**（2026-10-12）：绝不能从 `browserSteps.length` 差分推导 ——
  //   容量封顶后 push+splice 净长度不变，length watch 永不再触发 ⇒ 时间戳冻结 ⇒
  //   5min 硬上限误判"残留" ⇒ 禁用标志/接管条/虚拟鼠标/暂停**同时消失**（用户实报）。
  //   push 点就是活性点，这里是唯一真相，且不再依赖数组长度这一可被裁剪破坏的代理信号。
  lastBrowserToolAt.value = now;
}
```

**同步删除** `stores/chat.ts:435-438` 的 `watch(() => browserSteps.value.length, ...)`。

> 说明：`lastBrowserToolAt` 的声明位置需上移到 `pushBrowserStep` 之前（当前在 434 行、
> `pushBrowserStep` 在 397 行 —— 原实现靠 watch 的回调延迟避开了 TDZ，
> 改成显式赋值必须调序）。⚠️ **这是本项目栽过两次的 TDZ 坑**
> （见 `browserPanelNowTickOrder.test.ts` 记录的那次 setup 崩溃），必须按序：
> `lastBrowserToolAt` 声明 → `pushBrowserStep` → 所有调用点。

### P1 —— 两处 `watch(length)` 的语义修正

`useChat.ts:441` / `463` 的判据从"长度 0→N 跳变"改为**显式状态事件**：

- 方案：改用 `watch(() => store.lastBrowserToolAt, ...)` + 内部维护"本任务是否已开过面板"标志；
  或在 store 暴露一个单调递增的 `browserStepSeq`（只增不减，不受裁剪影响），两处 watch 它。

**推荐 `browserStepSeq`**：一个 `ref(0)`，`pushBrowserStep` 里 `++`，语义就是"第几个浏览器步骤"，
天然不受容量裁剪影响，两处 watch 都改成依赖它 —— 与 P0 同一思路（**别用可被裁剪的代理信号**）。

### P2 —— 容量上限本身复核（可选，非必需）

120 条对长任务（本会话已跑 120+ 步）确实会滚动淘汰早期步骤。
但**步骤清单展示**与**活性判定**是两个关注点，P0/P1 修完后即使淘汰也不影响控制信号。
是否提高上限（如 300）或改为按时间保留，属独立议题，**本次不动**。

## 5. 测试方案（正式测试类 + 变异验证，按项目惯例）

### 后端/UI 单测：`packages/ui/src/stores/stale-run-sweep.test.ts` 同族新增

**`pushBrowserStep` 活性登记测试**（抽纯逻辑或行为测试）：
1. ✅ 连续 push 121 次 → `lastBrowserToolAt` **等于最后一次的 time**（修复前会停在第一次填满时）
2. ✅ length 封顶在 120 且不再增长（既有行为不回归）
3. ✅ push 第 1 条 → `lastBrowserToolAt` 被写入（不是 0）

**变异验证（守卫有效性自证）**：
- 把 `lastBrowserToolAt.value = now` 改回"由 length watch 推导" → 测试 1 必须**红**
- 断言方式必须**行为级**（跑 121 次看值），不能只断言源码里有 `lastBrowserToolAt.value =`
  —— 本项目反复栽在"断言存在 ≠ 断言生效"

**判据顺序守门**（TDZ）：
- 断言 `lastBrowserToolAt` 声明行号 < `pushBrowserStep` 定义行号（同 `browserPanelNowTickOrder.test.ts` 手法）

### 契约测试：`apps/server/test/browser-bridge-direct.test.ts` 同族

- ✅ 断言 `browserSteps` 的 watch **不再以 `.length` 为依赖源**（`not.toMatch(/watch\(\(\) =>\s*\w*browserSteps\.value\.length/)`）
- ✅ 断言 `pushBrowserStep` 内**直接**写活性时间戳（调用形式锚点，非注释提及）

## 6. 影响面与风险

| 项 | 评估 |
|---|---|
| 改动文件 | 2 个（`packages/ui/src/stores/chat.ts`、`packages/ui/src/composables/chat/useChat.ts`）+ 2 个测试 |
| 行为变化 | **只修劣化**：到顶前的行为逐字不变（第 1~120 步 length 每跳都触发，与原实现等价）；只补上"第 121 步起"的活性登记 |
| 风险等级 | **low** —— 等价性可证：修复前 `lastBrowserToolAt` 在 length<120 时 == 最后一条 time，修复后恒 == 最后一条 time，**是原语义的超集** |
| TDZ 风险 | **medium**（必须调序，本项目栽过两次）→ 用 §5 的顺序守门测试钉死 |
| 附带修复 | 「首个步骤自动开预览面板」兜底在长任务中恢复生效 |
| 不涉及 | 不做虚拟滚动、不改步骤清单渲染、不改容量上限（避免 scope 蔓延） |

## 7. 与 10-12 既有修复的关系

同一天已在意的三件事里，**"应用变卡"与本次根因同源但不同层**：

| 已修（今日） | 本次 |
|---|---|
| navigate 重试堆积 6 个 tab 壳 → 8 个 guest 进程 → CPU 尖峰（`NAV-REUSE-START` 哨兵块） | 步骤日志封顶 → 活性时间戳冻结 → **控制 UI 全灭** |
| 收尾不自动关页面（用户拍板） | 任务**运行中**控制信号丢失 |

两者都会让用户感觉"更新后变卡/变怪"，但**本次是功能性回归**（运行中看不到 AI 在动、
无法暂停），优先级高于卡顿观感。

## 8. 落地情况（2026-10-12 已实施）

### ✅ 改动清单

| 文件 | 改动 |
|---|---|
| `packages/ui/src/stores/chat.ts` | ① `lastBrowserToolAt` + `browserStepSeq` **上移到 `pushBrowserStep` 之前**（TDZ 硬约束）<br>② `pushBrowserStep` 内**显式**写两个控制信号<br>③ 新增 `resetBrowserStepSeq()`<br>④ **删除** `watch(() => browserSteps.value.length)` 推导链<br>⑤ 导出 `pushBrowserStep` / `browserStepSeq` / `resetBrowserStepSeq` |
| `packages/ui/src/composables/chat/useChat.ts` | ① 两个 `watch(() => store.browserSteps.length)` → `watch(() => store.browserStepSeq)`<br>② 删掉 `n===0` 退出分支（该路径由 `resetTaskScopedState` 显式清理兜住）<br>③ `resetTaskScopedState` 补 `resetBrowserStepSeq()` |
| `packages/ui/src/stores/browser-step-liveness.test.ts` | **新增** 11 项：行为级跑真 store + 源码契约 + TDZ 顺序守门 |
| `apps/server/test/browser-bridge-direct.test.ts` | 契约更新：锚点 `browserSteps.length` → `browserStepSeq` + 反向断言防回归 |
| `packages/ui/src/stores/stale-run-sweep.test.ts` | 修"锚点窗口魔数 2600 被挤出"导致的假失败 → 改用"到下一个顶层函数定义"做边界 |

### ✅ 测试结果

- `browser-step-liveness.test.ts`：**11/11 过**
- ui 全量：**48 文件 / 704 过 / 0 失败**（`--testTimeout=60000`；默认 5s 下 8 项超时假失败，已逐项隔离单跑证实与本次改动无关 —— 全是动态 `import()` 首载 + 机器被 Defender/多应用拖慢）
- server `browser-bridge-direct` + `browser-tab-cleanup-scope`：**112/112 过**
- `vue-tsc --noEmit`：**exit 0**

### ✅ 变异验证（守卫有效性自证）

| 变异 | 结果 |
|---|---|
| ① 删掉 `pushBrowserStep` 内的两行显式赋值 | **6 项红**（3 行为 + 序号 + 调用锚点 + 兜底） |
| ② 改回"只在 length 变化时赋值"的旧语义（`if (len !== lastLen) ...`） | **精确 1 项红**（正是核心回归用例 —— 前 120 条正常、第 121 条起冻结的真实症状） |

> 变异 ② 是关键证据：它证明该测试**只在真正的旧实现上红**，不会误报。
> 也印证了"符号全在、逻辑失效"这类 bug **必须行为级测试才能抓**
> —— 旧实现里 `lastBrowserToolAt.value = ...` 那行确实存在（在 watch 回调里），grep 必然全绿。

### 风险

| 项 | 实测 |
|---|---|
| 行为等价性 | length<120 时新旧逐字等价；修复后是**原语义超集** ✅ |
| TDZ | 已调序 + 守门测试钉死 ✅ |
| 回归 | 全量 704 过、契约 112 过 ✅ |

### 遗留

- 需**重启 dev Electron** 才能吃到 `stores/ui` 改动（前端 Vite 热更新通常够用；
  若面板未恢复先 `curl 1421/3001` 确认前端托管来源，本机实测 3001=404 / 1420=Vite ✅ 正常）
- 步骤日志容量议题另出：`docs/plan-browser-steps-retention-2026-10-12.md`
