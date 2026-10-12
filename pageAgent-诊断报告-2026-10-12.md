# 言智（yan-zhi）pageAgent 执行诊断报告

> 分析时间：2026-10-12 ｜ 分支 `dev0.1-mobile` ｜ HEAD `b41f0ce`
> 数据来源：**运行中的 dev 实例**（实时日志 + 数据库），非静态推断
> 覆盖用户实报三症状：**① pageAgent 一跑整个应用就卡 · ② 填表单反复填写 · ③ 上传重试多**

---

## 0. 结论速览（TL;DR）

| # | 症状 | 一句话根因 |
|---|---|---|
| ① | pageAgent 一跑应用就卡 | 每个浏览器动作都有 **18s 硬超时**，且超时提示语写着"**请稍后重试**" → 重页面（抖音创作者中心）上每一步都吃满 18s，模型不停重试，主循环被占满 → SSE 会话流断连重连 → 整个应用看起来卡死 |
| ② | 填表单反复填写 | 输入后的**回读核验用严格相等** `got === expected`，页面只要对文本做了格式化/截断就打回 `applied:false`，模型以为"没填上"→ 重填；叠加 **index 编号每次读页都变**，旧编号失效又重填一轮 |
| ③ | 上传重试多 | filechooser 模式**死等固定 10s**、靠 `clickIndex` 点"上传"按钮（编号会漂移），且成功回执**只报"已上传"、不核验页面是否真出现文件** → 模型不确定就再传一遍 |

一句话总纲：**这三件事是同一个设计缺陷的三种表现——"动作没有稳定的成功判据，失败反馈又不精确，于是模型一律靠重试解决"。**代码里散落大量"已根治"注释，但今天的实时日志证明这些根因仍在。

---

## 1. 实时数据（本次运行实测，非推测）

### 1.1 主进程日志 `%APPDATA%\yan-zhi\logs\main-2026-10-12.log`（538 KB，18:05 仍在写）

| 信号 | 次数 | 说明 |
|---|---|---|
| `浏览器操作 … 超时（18s）` | **168** | 几乎每个读/执行类动作都吃满 18s |
| 其中 `run_script` 调用 | 约 1280 提及 | 模型疯狂重试 run_script |
| `navigate` 单次耗时 | **14474ms** | 稳定复现（12s loadURL 竞速 + 注入） |
| `MaxListenersExceededWarning: 11 did-stop-loading listeners` | **7** | guest 监听器泄漏 |
| `onWebviewReady tabId=tab-1 wcId=3`（同一 tab） | **4ms 内连发 7 次** | `<webview>` 重挂风暴 |
| `会话级流断连，第 N 次重连` | **16** | SSE 前端流反复断连 |
| `发送失败: TypeError: network error` | 2 | 前端与后端流通道失联 |
| `screenshot → THREW: Current display surface not available for capture` | 9 | 页面不可见时截图直接抛错 |

同一会话（`c11dfe7b-13a0-4554-b64f-54a5096a1fe4`）现场片段：

```
18:02:41 navigate …/content/manage            → ok 848ms
18:02:43 run_script return 'ping'             → 18s 超时
18:03:05 run_script … (再试)                  → 18s 超时
18:03:07 navigate(openInNewTab) → new_tab tab-2
18:03:30 onWebviewReady tab-1 wcId=3   ← 同一 tab 连发 7 次
18:04:26 会话级流断连，第 1 次重连
18:05:56 会话级流断连，第 12 次重连  ← 持续 90 秒以上
```

### 1.2 服务端日志 `%APPDATA%\yan-zhi\server-data\logs\server-2026-10-12.log`

| 信号 | 次数 |
|---|---|
| `循环拦截: tool=browser_*`（同一会话） | **50** |
| 其中 `browser_get_page_content` | 最多（约 14 次） |
| `browser_run_script` / `browser_type` / `browser_navigate` / `browser_get_tabs` / `browser_get_page_info` / `browser_screenshot` / `browser_get_visible_text` | 各 1–7 次 |
| `动作执行失败（非桥故障，不降级）: browser_run_script … err=fetch failed` | 多次 |
| `回执与组头不相邻 … gap=32/8/1` | 若干（主循环推进点问题） |

被拦的工具清单本身就说明：**模型在"读页 → 判定没生效 → 换招重试"的环里空转**，循环闸门反复把它拦下来。

### 1.3 数据库 `%APPDATA%\yan-zhi\server-data\data.db`

| 指标 | 值 |
|---|---|
| 文件大小 | **247 MB**（`page_count` 63346 × 4096B） |
| `message` 表合计 | **158 MB** |
| └ `system_prompt_snapshot` | **149.82 MB** |
| └ `content` | 3.31 MB |
| └ `reasoning_content` | 2.61 MB |
| 消息行数 | 7576 |

**数据库 97% 的体积来自 `message.system_prompt_snapshot`**——每条消息都完整存了一份约 20KB 的系统提示词快照（7576 × ≈20KB ≈ 150MB）。同一会话内这条快照几乎不变，属于纯冗余。

---

## 2. 问题一：pageAgent 执行时"整个应用都卡"

### R1 🔴 单次动作 18s 硬超时 + 超时措辞诱导重试 —— **卡顿的机械主因**

**证据**：`apps/desktop/main.cjs:4214-4218`

```js
const SLOW_ACTIONS = new Set(['upload', 'screenshot']);
const actionTimeout = SLOW_ACTIONS.has(action) ? 60000 : 18000;
const result = await Promise.race([
  doAction(),
  new Promise((r) => setTimeout(() => r({ error:
    `浏览器操作 ${action} 超时（${actionTimeout / 1000}s）：页面可能仍在加载或无响应，请稍后用 browser_get_page_content 重试` }), actionTimeout)),
]);
```

- 抖音创作者中心的 `run_script`（脚本里常自带 6–9s 的 `await sleep`）+ 页面自身负载，**经常 >18s** → 每次都判超时。
- 返回文案结尾是"**请稍后重试**"——等于给模型下"重试"指令。于是模型立刻再发一次，又是一轮 18s。
- 只有 `upload/screenshot` 放宽到 60s，**偏偏最常调用的 `get_page_content` / `run_script` 是最紧的 18s**。
- 后果：单个会话里 N 次工具调用 = N × 18s 的纯等待，主循环被填满 → 见 R4（流断连）。

**严重度**：🔴 高。这是"卡"最直接、最可量化的一环。

### R2 🟠 导航 12s 超时后仍引导轮询，形成"超时—重试"闭环

**证据**：`main.cjs:3266-3290`。`navigate` 用 12s 竞速 `loadURL`，超时返回 `loading:true` + note"不要换 URL 重试，请用 browser_wait_for / get_page_content 轮询"。但紧接着 `get_page_content` 又撞上 R1 的 18s 超时 → 页面没读完 → 模型继续试 → 循环。日志里 `navigate 14474ms` 稳定复现正是这一段。

**严重度**：🟠 中高。修 R1 可大幅缓解；根治需让"页面加载中"成为一个可等待的显式状态。

### R3 🟠 `<webview>` 重挂导致 guest 监听器泄漏（MaxListenersExceeded 仍在）

**证据**：渲染层模板 `packages/ui/src/components/BrowserPanel.vue:244-259`

```html
<webview v-for="t in tabs" :key="t.id"
  @dom-ready="onWebviewReady(t.id)"
  @did-navigate="onWebviewNavigated(t.id, $event)"
  @did-start-loading="onWebviewLoading(t.id, true)"
  @did-stop-loading="onWebviewLoading(t.id, false)" />
```

- `onWebviewReady`（`BrowserPanel.vue:1748-1766`）把 guest 注册给主进程；日志显示**同一 tab 在 4ms 内被注册 7 次**，即 `<webview>` 元素被反复重建/重新绑定。
- 在 Electron 里，`<webview>` 的每个 `did-stop-loading` 等事件绑定都会在**主进程侧给该 guest WebContents 加一个 EventEmitter 监听器**；元素重挂不清理 → 累积到 11 个 → `MaxListenersExceededWarning`（今天 7 次）。
- 这既解释了监听器泄漏，也说明**渲染层存在重挂风暴**（Vue key 未变却重建、或父级状态抖动），而重挂风暴本身就是 CPU 消耗。

**严重度**：🟠 中高。是"卡"的次要但持续的贡献者。

### R4 🔴 SSE 会话流反复断连（16 次）—— 用户看到的"卡死"

**证据**：`main-2026-10-12.log` 18:04:26 起 `会话级流断连，第 1…16 次重连` + `发送失败: TypeError: network error`（源码：`packages/ui/src/stores/chat.ts:2811` 的会话级流退避重连；日志里的 `chat.ts:2106` 是 vite 构建产物行号）。

- 流断连的直接诱因是后端主循环被 R1 的 18s×N 占满，SSE 心跳/数据帧迟到，前端判定断连 → 重连退避（1s/2s/4s/5s…）→ 重连本身又产生请求，进一步挤压。
- 表现就是用户说的"整个应用都卡"：消息列表不动、输入无响应、预览面板不更新。

**严重度**：🔴 高（这是"卡"的**用户可见终点**，但**病因在 R1**）。

### R5 🟡 数据库 247MB（其中 150MB 冗余），拖慢启动与后台任务

**证据**：见 1.3。`system_prompt_snapshot` 每条消息存一份 ≈20KB 快照。
- 服务端启动做 `db-integrity_check`、每 5 分钟 `memory-dreaming` 轮询、`artifact` 扫描、`ontology` 预热都要扫库；库越大越慢（日志里 `memory-dreaming` 频繁"有任务运行中，本轮整理跳过"，说明后台任务本就吃不饱）。
- 不是"操作时卡"的直接原因，但属于**持续性的性能负担**，且极易修。

**严重度**：🟡 中。

### R6 🟡 每个动作的前后状态快照 + 长脚本注入放大单步开销

**证据**：`main.cjs:4202-4234`（`CHANGE_ACTIONS` 前后各跑一次 `STATE_SNAPSHOT_JS` + 固定 `500ms` 等待）、`main.cjs:2487` 附近（in-page 助手注入为数千字符字符串，每次导航跨进程 `executeJavaScript` 注入）。这些是"每次操作都发生"的固定成本，叠加 R1 会更明显。

**严重度**：🟡 中低。

### 已确认"确实落地"的既有修复（避免重复劳动）

- ✅ webview tab 上限 + LRU 逐出：`main.cjs:1220-1244`、`createBrowserTab` 收口 `main.cjs:1717-1745`（今天 `LRU 逐出` 计数为 0 → **tab 堆积当前不是主因**）。
- ✅ 锚定四次根因修复：`apps/desktop/browser-target.cjs:102-119`。
- ✅ `renderMarkdown` LRU 缓存：`packages/ui/src/composables/chat/useChat.ts:980-991`。
- ✅ `browserSteps` 120 条上限 + 截断：`packages/ui/src/stores/chat.ts:445-453`。
- ✅ 循环闸门硬停：`apps/server/src/services/tool-loop-guard.ts:35-37, 79-98`。

> 即：**10-10 那轮修的是"tab 堆积 + Markdown 重渲"**，那两块确实好了；但今天的卡顿换成了**"18s 超时 + 监听器泄漏 + 流断连"**这一组新根因。

---

## 3. 问题二：填表单反复填写

### F1 🔴 回读核验用"严格相等"，把"填好了但被页面规整过"误判为失败

**证据**：`main.cjs:2803-2839`（`cdpTypeText`）

```js
let got = String(verify ?? '');
const expected = String(text || '');
let applied = got === expected;      // ← 严格相等
...
...(applied ? {} : { hint: '输入未生效（页面可能做了格式化/受控组件重置/输入被拦截）…建议用 browser_get_page_content 核验输入框当前值。' }),
```

- 页面常见的"规整"：`trim`、去换行、字数上限截断、中文标点转换、`maxlength`。只要 `got !== expected`，就报 `applied:false`，并明确让模型"**用 get_page_content 核验**"→ 模型核验后仍认为没填好 → **再填一遍**。
- 这正是"反复填写"最隐蔽的成因：**值其实进去了**，但判据说"没进去"。

**严重度**：🔴 高（直接对应症状）。

### F2 🟠 index 编号每次读页都变 → 旧编号失效 → 重读→重填

**证据**：`main.cjs:2726-2732 / 3444-3451 / 2729-2731`。元素编号来自 `window.__yzElements` / `__yzSelMap`，随页面重渲染刷新；模型上一轮拿到的 index 下一轮常失效：

```
error:'index '+a.index+' 已失效（页面已变化）。请重新调用 browser_get_page_info 获取最新编号列表。'
```

模型于是"重读页面 → 拿到新编号 → 再填"，表现为反复填写。`browser_type` 也因此在服务端被 `循环拦截`（日志 17:10 两次）。

**严重度**：🟠 中高。

### F3 🟠 受控/富文本组件异步重置，填了又被清空

**证据**：`main.cjs:2754-2788`（contenteditable 走 `execCommand('insertText')`，普通框走 guest 内 `typeIn`，失败再 CDP 兜底），代码注释本身承认"React 会重置、回读为空、字数计数不涨"。若首填触发的不是完整事件链，页面稍后自行清空 → 模型读到空 → 重填。

**严重度**：🟠 中高。

### F4 🟡 没有"字段级已完成"去重，整表反复重填

`browser_fill_form`（`main.cjs:3706-3780`）本身已做到逐字段回报 `failed`（这是对的），但模型常改用**单字段 `browser_type` 逐个填**，而框架没有跨调用记录"该字段上一轮已填成功"→ 每轮都从头填。配合 F1/F2，就是"填了又填"。

**严重度**：🟡 中。

---

## 4. 问题三：上传重试多

### U1 🔴 filechooser 模式死等固定 10s，且依赖会漂移的 `clickIndex`

**证据**：`main.cjs:3158-3162`

```js
// 等 fileChooserOpened（最多 10s）…
const t0 = Date.now();
while (!chooserBackendId && !chooserErr && Date.now() - t0 < 10000) await wait(150);
```

实时日志对上了：

```
10:00:31 upload filePath=…_第1章.mp4 clickIndex=16 → 11116ms OK   ← 约 11s（=10s 等待 + 开销）
13:13:04 upload filePath=…_第2章.mp4 clickIndex=15 → 11041ms OK   ← 约 11s
14:14:02 upload clickSelector="div:contains(\"点击上传\")" … → 1383ms OK  ← 1.4s（选择器模式很快）
```

- 用 **`clickIndex`** 时：抖音"上传"按钮的编号会随页面漂移（16 → 15），点不到就 `chooserErr`，再走 DOM 回落，常也找不到 → 报错 → 重试。
- 即便成功，**每次都固定吃满约 11s**；叠加 R1 的 18s 总闸，上传期间其他动作全排队。
- 对比：`clickSelector="div:contains(\"点击上传\")"` 只需 **1.4s**——说明**选择器模式的稳健性远高于 index 模式**，但模型默认爱用 index。

**严重度**：🔴 高。

### U2 🟠 成功回执不核验"页面上是否真出现了文件"

**证据**：`main.cjs:3169-3172` 成功后 `result = { uploaded: true, via: 'filechooser', filePath: fp }`；工具层（`packages/core/src/tool/builtin/browser/index.ts:979-993`）直接回报"已上传文件"。
- **全链路没有任何"回读页面上是否出现文件名/进度条/缩略图"的确认**。模型拿不到"确实上传了"的证据，于是**再传一遍**（日志里同一文件被多次 upload）。
- 这是"重试多"的另一半原因：不是失败才重试，而是**成功了也不敢信**。

**严重度**：🟠 中高。

### U3 🟡 拦截与输入都抢同一个 CDP debugger

`main.cjs:3138`（`Page.setInterceptFileChooserDialog`）、`cdpTypeText`（`main.cjs:2714-2719` 的 `dbg.attach/detach`）都依赖 `wc.debugger`。同一 guest 上 type 与 upload 相邻执行时，attach/detach 竞争可能互相打断。串行锁只到**会话级**（`packages/ui/src/stores/browser-op-queue.ts`），跨动作的 debugger 占用没有专门保护。

**严重度**：🟡 中低。

---

## 5. 根因优先级与修复建议（按 ROI 排序）

> 本节只给方案，**不含任何代码改动**（本次交付为诊断报告）。

### P0 · 立竿见影，改动小

1. **把"超时"从"失败"里拆出来**（治 R1/R4）
   - 18s 超时的返回**不要**再说"请稍后重试"；改为明确的**进行中语义**（如 `stillLoading:true` + "页面仍在处理，无需重试，用 browser_wait_for 等待"），并把读类动作（`get_page_content` / `get_page_info` / `get_dom`）**移入慢档或按页面 `isLoading()` 动态放宽**。
   - 思路同 10-10 给 `navigate` 做的"loading 语义"修复，只是这次要覆盖**读/执行类**动作。

2. **回读核验从"严格相等"改为"宽松等价"**（治 F1）
   - 判据改为 `normalize(got) === normalize(expected)`（去首尾空白/规范化换行）或"包含关系"，并对"页面规整过"给中性回执（`applied:true, normalized:true`），**不要**再引导模型"重填"。

3. **上传成功后补一次回读核验**（治 U2）
   - 上传完扫描页面上是否出现文件名/进度/缩略图，把"已核验"写进回执；核验失败才提示重试。这样模型"成功了也敢信"，重试立刻下降。

### P1 · 中等改动

4. **上传优先选择器、弱化 index**（治 U1）
   - 工具描述里把 `clickSelector` 标为**默认首选**、`clickIndex` 降级；或实现"多路定位兜底"：`clickSelector` 失败自动试 index、再试坐标，一次调用内闭环。
   - filechooser 等待改为**事件驱动 + 早退**（拿到 `fileChooserOpened` 立即返回），而不是固定死等 10s。

5. **消除 `<webview>` 重挂**（治 R3）
   - 排查 `BrowserPanel` 中导致 `<webview>` 反复重建的响应式依赖（`v-for` 的 key、父级 `v-if` 抖动、scope store 切换），确保元素**挂一次不再重建**；顺带在注册处做"同 tab 重复注册幂等短路"。

### P2 · 结构性

6. **`system_prompt_snapshot` 停止逐消息落库**（治 R5）
   - 改为按会话存一份（或建 `conversation.system_prompt_snapshot` 一列），消息行只留 hash 引用；存量库 `VACUUM` 后预估可从 247MB 降到 ~100MB 以内。
   - 顺带核对 `journal_mode` 与 `wal_autocheckpoint`，避免大库下的写放大。

7. **给页面状态一个"稳定指纹"**（治 F2/F3）
   - 元素编号不稳是"反复填写"的结构性来源。可考虑：填入前用**语义指纹**（`name`+`placeholder`+`aria-label`+`label 文本`）定位并**缓存"字段已填"**，而不是每轮依赖易漂移的 index。

---

## 6. 一句话回给你

你感觉到的"三个毛病"，本质是**一套"没有稳定成功判据 + 失败反馈不精确"的机制**在三种场景下的放大：动作超时了说"请重试"、填进去了说"没生效"、上传成功了不说"已核验"。**先把这三处判据改"准"，再谈性能优化**——卡顿会随之大幅缓解，因为现在的卡，很大一部分就是"模型被误导后不停重试"烧出来的。

---

## 附录 · 关键证据索引

| 主题 | 位置 |
|---|---|
| 18s 动作总闸 + 重试措辞 | `apps/desktop/main.cjs:4214-4218` |
| navigate 12s 竞速 + loading 语义 | `apps/desktop/main.cjs:3266-3290` |
| 动作前后状态快照 + 500ms 等待 | `apps/desktop/main.cjs:4202-4234` |
| webview tab 上限 + LRU 逐出 | `apps/desktop/main.cjs:1220-1244, 1717-1745` |
| `<webview>` 模板（事件绑定） | `packages/ui/src/components/BrowserPanel.vue:244-259` |
| `onWebviewReady` 注册 | `packages/ui/src/components/BrowserPanel.vue:1748-1766` |
| 锚定判定（纯函数） | `apps/desktop/browser-target.cjs:69-155` |
| 输入回读核验（严格相等） | `apps/desktop/main.cjs:2803-2839` |
| fill_form 逐字段回报 | `apps/desktop/main.cjs:3706-3780` |
| 上传 filechooser 等待 10s | `apps/desktop/main.cjs:3127-3209` |
| 上传工具契约 | `packages/core/src/tool/builtin/browser/index.ts:963-994` |
| 循环闸门 | `apps/server/src/services/tool-loop-guard.ts` |
| Markdown LRU 缓存 | `packages/ui/src/composables/chat/useChat.ts:980-991` |
| browserSteps 上限 | `packages/ui/src/stores/chat.ts:445-453` |
| 会话流断连重连 | `packages/ui/src/stores/chat.ts:2811` |
| 回执与组头不相邻（主循环） | `apps/server/src/llm-task-manager.ts:705` |
| DB：`system_prompt_snapshot` 149.8MB | `%APPDATA%\yan-zhi\server-data\data.db` · `message` 表 |
