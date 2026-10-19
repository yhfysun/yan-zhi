# Electron 1.3GB 构成拆解与治理方案

日期：2026-10-13 ｜ 口径：任务管理器"Electron (11) = 1,305.7 MB"（任务运行中实测）

---

## 一、1.3GB 是怎么构成的（逐项拆解，可核查）

### 1.1 为什么是 11 个进程（结构性，与用量无关）

Electron 是多进程架构，**进程数 ≠ 泄漏**。这 11 个进程的账本：

| # | 进程 | 数量 | 典型单进程 | 说明 |
|---|---|---|---|---|
| 1 | 主进程（main） | 1 | ~150–250MB | 跑着 Node 服务端逻辑、全部 webContents 的管理端、日志、bridge |
| 2 | GPU 进程 | 1 | ~80–150MB | 所有窗口/页面的合成与光栅化，**backgroundThrottling 全局关闭时更重** |
| 3 | 网络服务进程 | 1 | ~50–100MB | 所有 session 共用的网络栈 + DNS + socket 缓冲 |
| 4 | 应用界面渲染进程（UI 本体） | 1 | ~300–500MB | Vue 应用 + 聊天消息 DOM + 所有面板。**大头之一，见 1.3** |
| 5 | `<webview>` guest 渲染进程 | 每 tab 1 个 | 400–700MB/重页面 | **最大变量**。当天 tab-1（抖音创作者中心）+ tab-2（同站幽灵） |
| 6 | 工具进程（audio/utility 等） | 若干 | ~30–80MB | Chromium 自带 |

→ **11 进程是"1 主 + 1 GPU + 1 网络 + 1 UI + 2 guest + 若干 utility"的自然结果**，不是异常。

### 1.2 guest 进程为什么每个几百 MB（当天实测 tab 构成）

| tab | 页面 | 使用情况 | 内存贡献 | 问题 |
|---|---|---|---|---|
| tab-1 | creator.douyin.com 作品管理/编辑页 | agent 全天 193 次锚定操作 | ~500–700MB | 正常工作负载，但抖音 SPA 本身重（React + 长列表 + 视频封面位图） |
| tab-2 | creator.douyin.com（弹窗转出） | **全天 0 次使用，白挂 8 小时** | ~400–500MB | **纯浪费**。已修：同站复用 + 空闲回收 |

每个 guest 的内存构成：V8 堆（JS 对象）+ **Blink DOM/布局树** + **光栅化位图**（合成层，抖音这种无限滚动列表会持有很多层）+ 解码后的**图片缓存**（视频封面）。"页面看着简单"不等于内存小——位图和缓存不显示在任务管理器进程名的直觉里。

### 1.3 应用 UI 渲染进程为什么也大（~300–500MB 量级）

| 项 | 实测/代码依据 | 内存影响 |
|---|---|---|
| 聊天消息全量 DOM | 会话 253bd3f4 当天 **1024 条消息**（含工具回执），无窗口化渲染，全部进 DOM | 每条消息带工具组/折叠态/markdown 渲染，估算 50–150k DOM 节点 ⇒ 数百 MB 量级。**403 条时已实测把渲染主线程压到 IPC 迟到 34.3s** |
| Pinia 全量会话列表 + 消息文本 | 全部会话消息驻留 JS 内存（1.1MB 原始文本 ×渲染后对象开销 ≈ ×20） | ~100MB 级 |
| 截图 base64 流转 | image_analyze：截图→base64→压缩→再 base64，全部在 UI 进程内存过一遍 | 峰值每次 5–15MB，GC 后释放但制造碎片 |
| 皮肤/玻璃态效果 | backdrop-filter + 大底图（skin 系列） | 合成层常驻 50–100MB |

### 1.4 主进程与服务端（~150–250MB）

Node 服务端（Express + sqlite + LLM 任务管理）全部跑在 Electron 主进程里。快照 blob、任务状态机、SSE 连接池都在这。这部分有界（快照已迁移瘦身，data.db 45MB），不是问题源。

### 1.5 汇总公式

```
1.3GB ≈ 主进程 0.2 + GPU 0.1 + 网络 0.1 + UI进程 0.4 + tab-1 0.4 + tab-2 0.15(空闲降帧后)
        └─ 结构性 ~0.4GB ─┘└────── 治理空间 ~0.9GB ──────┘
```

**结论：结构性底盘约 0.4GB（Electron 固有），可治理空间约 0.9GB。** 1.3GB 本身不是泄漏（无一处无界增长证据：监听器有界 11、快照已瘦、DB 已 VACUUM），是"多进程底盘 × 重页面 × 全量 DOM"的乘积。

---

## 二、治理方案（按收益排序，含已落地项）

### 已落地（本日，重启生效）

| 项 | 机制 | 预期 |
|---|---|---|
| A1 空闲 tab 回收 | 非激活+未锚定 10 分钟 → 挂起 guest 释放渲染进程，**tab 壳与 url 保留**，切回或 agent 动作时自动重载。**修复了巡检从未在 webview 引擎启动的缺陷**。★ 2026-10-19 修正：此前实现广播 tabClosed 会让渲染层直接删掉 tab（与「壳保留」不符），现改为独立 `tabSuspended` 事件 + `suspended` 标记，LRU 逐出同理 | 每个忘关 tab −0.4~0.5GB |
| A2 同站 tab 复用 | 弹窗 URL 与既有 tab 同 host+path → 原地导航不新建进程 | tab-2 类永不复现 |
| A3 后台降帧 | 非激活 guest 1fps（激活/锚定 60fps），补偿全局关闭的 backgroundThrottling | 后台合成 CPU −90%，卡顿传导链第一环拆除 |
| A4 填表单/动作效率 | 前置等待闸 + fill_form 富文本 + 终态回执（见另一报告） | 动作次数下降 = 页面重载次数下降 = 位图缓存重建次数下降 |

### 已落地（本日第二轮：B1/B2/B3）

| # | 方案 | 实现要点 | 预期收益 |
|---|---|---|---|
| B1 | **消息列表窗口化渲染** | 以**轮次**开窗（不用像素虚拟滚动——轮次高度差太大，估高占位必跳）。`visibleRounds` 只渲染窗口内轮次，模板改用 `(全量下标, round)` 对，所有 `ri` 语义（`data-round`/折叠 key/`isLastRoundStreaming`）不变。窗口用**轮次身份锚**（user 消息 id）而非下标 —— 历史 prepend 后下标整体位移，记 id 才跟着内容走。跟随末尾 30 轮起步；用户上滚则钉住起点向前扩（新消息只增不卸）；`scrollToRound` 跳转前 `ensureRoundVisible` 把目标纳入窗口（否则 DOM 不存在跳不到）；滚到顶翻页时把窗口撑到最早（否则 DOM 不变高→哨兵常驻→连环翻页） | UI 进程 −200~300MB；长会话打开不再全量渲染（403 条→IPC 34s 的教训） |
| B2 | **消息驻留上限** | 切会话时对**非当前会话**的消息数组裁到尾部 200 条（`pruneMessageResidency`），并置该会话 `hasMore=true`（向前翻页可补回）。当前会话不裁（视图正渲染）。 | 多会话并发时驻留内存不再线性膨胀（实测 5 会话 4000+ 条对象常驻） |
| B3 | **空闲 guest 清缓存** | 空闲巡检顺带对"非激活且未锚定、空闲超 10 分钟"的 guest 做 `session.clearCache()`（5 分钟节流）。cookie/localStorage/登录态不动。 | 每 tab −50~150MB 图片缓存 |
| B5 | **低内存模式开关** | 设置「通用」页新增开关（`liteMode`）→ 文档根 `data-lite="on"` → **一条**全局 CSS 规则压制全站 `backdrop-filter`（散落在 skin.css/chat.css 与 33 个组件 scoped 样式里共 100+ 处，逐个改必漏）。只关模糊，颜色/透明度/边框/阴影一律不动，观感"面板变实"而非换主题；关掉开关零残留。 | −50~100MB 合成层 |

### 仍待拍板

| # | 方案 | 收益 | 风险 | 建议 |
|---|---|---|---|---|
| B4 | 截图直传替代 base64 落盘再读：image_analyze 收 stream/句柄传引用 | 峰值碎片减少 | 中：要动压缩链路 | 观察，暂缓 |
| B6 | 每 guest 独立 partition 按站点隔离？**否决**——登录态共享靠同一 partition，隔离会掉登录 | — | — | 不做 |

### 治理后的预期

```
当前 1.3GB → 单 tab 工作负载约 0.7~0.8GB（UI 减重 + 幽灵不再产生 + 后台降帧）
            → 多 tab 场景每 tab 增量 0.3~0.5GB，10 分钟不用自动退场
            → 长会话不再随消息条数线性膨胀（B1/B2 后持平）
```

### 验收口径（重启后测）

1. 任务跑 30 分钟后任务管理器看 Electron 总内存：目标 ≤900MB（单 tab）。
2. 关掉所有浏览器 tab 静置 12 分钟：目标回落到 ~500MB（纯底盘）。
3. 912 条消息的会话打开滚动：不出现输入/按钮卡顿；滚到顶翻页正常（不连环翻、不跳位）。
4. 窗口化行为自检：打开长会话看到的是**末尾约 30 轮**；向上滚会逐段长出更早的轮次；
   滚回底部继续跟随最新输出；切换会话后窗口回到末尾。

---

## 四、验证记录（沙箱垫片法，2026-10-13）

本轮改动涉及文件：`main.cjs`、`browser.ts`（服务端链路）、`useChat.ts`、`stores/chat.ts`、
`ChatMessageList.vue`、`BrowserPanel.vue`、`ChatSidebar.vue`、`TaskListSection.vue`、
`model-pool.ts`、`vision-capability.ts`、`settings.ts`、`Settings.vue`、`App.vue`、
`styles/skin.css`、`core/.../browser/index.ts`、`db.ts`（提示词）。
新增守门测试 `apps/server/test/form-state-contract.test.ts`（16 项）。
守门测试 **273 项全过**：

| 测试 | 通过 |
|---|---|
| browser-bridge-direct | 85/85 |
| browser-human-like-input | 29/29 |
| browser-tab-cleanup-scope | 27/27 |
| form-state-contract（新增） | 16/16 |
| chat-sse-reconnect-and-browser-form | 16/16 |
| chatRenderPerf | 15/15 |
| vision-capability | 15/15 |
| fill-form-contract | 13/13 |
| message-rounds | 13/13 |
| browser-upload-filechooser | 12/12 |
| browserPanelPageAgentFix | 10/10 |
| browser-desktop-action-parity | 8/8 |
| browser-navigate-idempotent | 7/7 |
| multi-chain-consistency | 7/7 |

另做：窗口化逻辑纯复刻推演（初始 30 轮 / 上滚扩窗 / prepend 后锚点跟随内容 / 锚点丢失回退末尾）
四项符合设计；两链路表单字段口径同构自检 8/8。

★ 新增守门测试**当场抓出一个真缺陷**：桌面端表单快照 Map 缺上限兜底（只有服务端那版有）
—— 已补。这类"两条链路只有一条做全"的漂移正是本测试要防的。

**沙箱跑不了真 vitest**（pnpm 符号链接断裂），以上为 tsc 编译 + vitest 最小垫片执行；
用户本机仍需补跑 `pnpm -r typecheck` 与完整单测。

---

## 三、一句话回答"怎么会用到 1.3G"

**0.4GB 是 Electron 多进程的固定底盘（11 进程 = 1主+1GPU+1网+1UI+2页面+工具），0.9GB 是"一个 600MB 的抖音重页面 + 一个忘了关的同站幽灵页 + 一个装着 1024 条消息全量 DOM 的界面进程"的乘积**——三者今天都各有实修：幽灵页从此不产生（同站复用+空闲回收）、页面在后台不再全速合成（降帧）、界面减重方案已列（窗口化渲染待你拍板排期）。
