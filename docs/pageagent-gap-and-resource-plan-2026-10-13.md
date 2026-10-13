# pageAgent 体验差距分析与资源优化方案

日期：2026-10-13 ｜ 依据：会话 253bd3f4 全天 180 次 run_script / 9 次 type 的逐条实测序列 + 代码走读

---

## 一、pageAgent 与 Claude（computer use）的差距：填表单为什么"总是不顺、反复填"

### 1.1 实测证据（今天 11:42–12:06 改第1集标题/描述那一轮）

| 现象 | 实测数据 |
|---|---|
| 全天 `browser_fill_form` 调用 | **0 次**（工具已挂载、提示词已写"多字段表单必须用它"，模型从不走） |
| 手写 `browser_run_script` 补刀 | 全天 **180 次**，占全部工具调用的 42% |
| `browser_type` 9 次里同一段文字反复试 | 第2集标题填了 2 次、描述填了 2 次；第1集"XXTESTXX 测试前缀"残留到收尾都没清 |
| 找"编辑作品"按钮 | 连续 5 个 run_script 变体（filter span → 按坐标 → dropdown 类名 → hash class 失败再换），同一目标烧 30 秒级×5 |
| CSS 哈希类名定位 | `list-scroll-N8BqC1`、`edit-dropdown-NLYWwd` 直接写进脚本，重渲染后 throw（"Script failed to execute"×3） |

### 1.2 根因：不是"没修复"，是**四个结构性差距**

**差距①：读页给的是"清单"，不是 Claude 式的"结构化状态"。**
`browser_get_page_content` 返回的是可交互元素平铺列表（index+selector+text）。Claude 的做法是每步拿到一份**带语义的页面状态**（表单有哪些字段、各自当前值、哪个必填、提交按钮在哪）。模型拿到清单后只能自己拼"我要找标题框"，于是出现 5 连 run_script 穷举——每一步都是"读清单→猜→写脚本→错→再猜"。

**差距②：写操作后没有"机器可判的差异回执"，模型只能靠再读一轮验证。**
`browser_type` 返回 `applied:true/false`（10-12 已修宽松回读），但这只覆盖"值进没进输入框"。**没有回答"表单整体当前是什么状态"**（标题改了没有、描述框还剩什么、哪些字段还是旧值）。Claude 每次动作后能直接对比前后差异；pageAgent 只能再调一次 get_page_content 或手写脚本回读——这正是"反复填"的机制：填了→不确定→再读→读到截断/乱序的文本→以为没填上→再填。

**差距③：fill_form 对现代表单（contenteditable 富文本）无能力，模型只能绕行。**
抖音编辑页的作品描述是 Slate 富文本（`div[contenteditable=true]`），fill_form 的文本分支走 `typeIn`（清空→nativeSetter→回读），对 contenteditable **无效**（nativeSetter 只作用于 input/textarea 的 value 属性）。提示词说"多字段表单必须用 fill_form"，模型试了没用的路（或预判没用）就退回手写 run_script——**工具面的真实能力与提示词的承诺脱节**，这是"照提示词走会撞墙"的又一例（与 2026-10-09 B2 事故同型）。

**差距④：run_script 的描述把模型"教坏"了。**
run_script 描述强调"固定重复流程写成一段脚本一次执行，**大幅省步数**"。模型把"省步数"泛化成了"一切 DOM 查找都写脚本"——找按钮写脚本、填表单写脚本、验证写脚本。脚本不受元素编号/自动重定位/noChangeStreak 这些**防护体系**管束，是防护的真空地带：hash class 一崩就 throw、抛错信息只有一句"Check the renderer console"（模型看不到 console），于是再换一个脚本变体重试。

### 1.3 修法（按性价比排序，全部已落地）

| # | 修法 | 动哪里 | 状态 |
|---|---|---|---|
| ① | **fill_form 支持 contenteditable**：文本分支先探测 `isContentEditable`，富文本走"focus→selectAll→insertText（CDP 真实键入）→回读 innerText"路径，与 browser_type 的富文本能力对齐 | main.cjs `case 'fill_form'` | ✅ |
| ② | **fill_form 返回"表单终态"**：每次填写后回读所有目标字段的当前值，返回 `state:[{selector,value}]`——模型一次拿到"哪个改了、哪个没改" | main.cjs 同处 | ✅ |
| ③ | **get_page_content 输出表单语义段 + 变化差异**（本轮补齐）：【表单状态】字段名/类型/必填/当前值/长度上限；【自上次读取的变化】字段级 diff。**两条执行链同口径**（桌面 main.cjs + 服务端 browser.ts） | main.cjs / browser.ts / core 工具层 / db.ts 提示词 | ✅ |
| ④ | **run_script 描述纠偏 + 富文本指引**：明确"查找/点击/填表请用专用工具（有防护），脚本只用于批量提取/循环"；明确 contenteditable 用 browser_type | packages/core 工具描述 + pageAgent 提示词 | ✅ |
| ⑤ | **run_script 报错带出可自纠指引**：hash class 失效 → 提示"用 get_page_content 重新定位"，而不是让模型瞎换选择器 | main.cjs run_script hint | ✅ |

### 1.3.1 ③ 的关键设计（为什么不是"再加一个字段"就完事）

- **变化差异必须在主进程/服务端算**（注入脚本算不了）：需要**跨次调用**的快照，脚本每次执行都是全新上下文。
- **快照绑定 URL**：跨页导航后不与上一页比较 —— 否则整页字段都算"变了"，噪声淹没信号。
- **只报"上次见过且值变了"的字段**：新出现的字段（懒加载/SPA 重渲染）不算变化，否则每读一次刷一堆假差异。
- **"无变化"要给出行动指引**：直接写"若上一步刚做过填写/点击，说明它没生效 —— 换定位方式，不要重复同一动作"。这一句是打断"反复填"循环的关键（模型看到"无变化"最自然的反应就是再试一次）。
- **快照有界**：Map 上限 200 + tab 生命周期（关闭/LRU 逐出/空闲回收）显式清理。
- **守门测试**：`apps/server/test/form-state-contract.test.ts`（16 项）钉住上述全部语义 + 两链路口径 + 模板串反引号安全。该测试当场抓出一个真缺陷（桌面端快照 Map 缺上限兜底）并已修。

### 1.4 与 Claude 的其他差距（不在本次改动内，记录备查）

- **无跨步骤的"页面快照缓存"**：Claude 每步有明确的"最新观察"，pageAgent 的观察是即时返回不复用，重复读页 65 次（get_page_content）里约 1/3 是重读同一状态。
- **无 undo/原子性**：Claude 的 diff/edit 有失败不落盘保证；表单填写中途页面刷新（navigate 幂等已修）仍会全丢。
- **视觉路线成本高**：image_analyze 单次 10-45s（现在有 45s 限时），Claude 的视觉是模型原生多模态一步完成。中期方向：让主对话模型直接看截图（vision 池已接通），砍掉"截图→file→压缩→另发一次请求"的链路。

---

## 二、内存与卡顿：现状 → 影响 → 资源复用方案

### 2.1 现状（实测）

| 项 | 数据 | 说明 |
|---|---|---|
| Electron 总内存 | **1.3GB / 11 进程** | 任务管理器实测（任务运行中） |
| 单 tab 成本 | 400–700MB | webview 引擎每 tab 一个完整 Chromium 渲染进程，抖音创作者中心这种重 SPA 占上限 |
| 幽灵 tab | tab-2 全天 0 次使用 | 10:52 页面弹窗被"弹窗转应用内 tab"机制开出，agent 只锚 tab-1（193:0），白挂 8 小时 |
| 空闲卸载 | **webview 引擎没有** | `scheduleTabIdleCheck` 只遍历 browserViews（旧引擎）；TAB_IDLE_UNLOAD_MS=10min 的机制对现役引擎失效 |
| 背景节流 | 全局关闭 | `backgroundThrottling:false` ×3 处（防最小化导航卡死），代价是后台 tab 的定时器/合成不暂停 |
| 消息 DOM | 无虚拟滚动 | 912 条消息全量进 DOM（ HISTORY_PAGE_SIZE=50 只管首拉分页，翻页继续累加） |
| 监听误报 | 已消（setMaxListeners 30） | 昨天今天都是恰好 11，Electron webview 内部有界开销，非泄漏 |

### 2.2 影响

- **内存压力**：1.3GB 常驻 + 每开一个新 tab 再涨 0.5GB 上下；16GB 机器上多开应用即触顶（你今天 99% 后杀进程的根因之一）。
- **卡顿传导链**：重页面（多定时器+未节流）→ 渲染主线程饱和 → SSE/IPC 延迟到 30s+（10-11 实测 34.3s）→ pageAgent waitForGuest 超时 → 重试 → 更多动作排队 → 更卡。**卡顿不只是"内存大"，是"不节流的重页面 + 主线程被消息 DOM 渲染占住"的复合结果。**
- **幽灵 tab 复利**：每个忘关的 tab 都是一个不节流的重页面，同时贡献内存与卡顿。

### 2.3 资源复用与治理方案（按收益/风险排序）

| # | 方案 | 现状→目标 | 预期收益 | 风险 |
|---|---|---|---|---|
| A | **webview 引擎补空闲卸载**（对齐 BrowserView 版）：非激活且 10 分钟未用的 tab，经 IPC 让渲染层销毁 `<webview>`（壳保留、url 保留，切回重载），agent 锚定 tab 豁免 | 无 → 10min 自动回收 | 幽灵 tab 类问题根治；常驻内存 −0.4~0.7GB/个 | 低：切回重载丢页面运行态（表单），与 BrowserView 挂起行为一致，可接受 |
| B | **弹窗转 tab 改为"复用优先"**：broadcastOpenTab 前查同 host+同 path 的既有 tab，命中就 navigate 过去并激活，不新建 | 永远新建 → 同站复用 | tab-2 这类"同站第二进程"直接消失 | 低：`forceNew:true` 保留强制新开出口 |
| C | **后台 tab 局部节流**：给非激活 `<webview>` 的 guest 设 `setFrameRate(1)`（或 webContents.setBackgroundThrottling），激活恢复 60 | 全速 → 1fps 后台 | 后台 tab CPU 合成开销 −90%+；卡顿传导链第一环拆除 | 低：注意 agent 锚定 tab 豁免（动作前强制激活帧率） |
| D | **消息列表窗口化渲染**：DOM 只保留视口 ±N 条（滚动锚定已有时机），或最低成本版——非相邻轮次的工具组默认折叠（已有 collapsedToolGroups）+ 超过 K 轮后早期轮次只保留 user/final 两个节点 | 912 条全量 → 视口窗口 ~40 条 | 长会话渲染卡顿大头消除；内存 −100~300MB | 中：滚动锚定与"向上翻页"交互要细做，建议单独一期 |
| E | **截图/临时文件定期清**：screenshots/ 已 4.6MB/56 张（小头，但无限增长） | 手动 → 收尾自动清 7 天前 | 小 | 极低 |
| F | **接入 Windows 内存回收**：主进程 `process.getProcessMemoryInfo` 观测 + 任务收尾时对非激活 guest `session.clearCache()`（保留登录态 cookie） | 无 → 收尾清缓存 | 每任务 −50~150MB | 低：cache 清了重下，cookie/localStorage 不动 |

**本次先落地 A+B（纯主进程/渲染层小改动、收益最大）；C 一行级改动顺手带上；D 建议单独立项（交互风险最高）；E/F 低优先。**

### 2.4 与"任务卡顿"的既有修复合并后的完整链路

```
任务启动 → (已修)前置等待闸: loading 页不硬执行 → 动作 30s→秒级
        → (已修)image_analyze 候选池+45s限时+空响应负缓存 → 不再单候选拖 120s
        → (本次A)后台 tab 1fps 节流 → 主线程不再被重页面拖住
        → (本次B)同站 tab 复用 → 不再每弹窗一个新 Chromium
        → (本次A)10min 空闲回收 → 忘关的 tab 自动退场
        → (遗留)消息 DOM 窗口化 → 长会话渲染卡顿（建议下一期）
```

---

## 三、本次已落地 vs 待办

**已落地**：
1. main.cjs：fill_form 支持 contenteditable 富文本 + 返回表单终态 state 数组
2. main.cjs：run_script 报错带可自纠指引（hash class 失效 → 重新读页定位）
3. core browser/index.ts + pageAgent 提示词：fill_form 补富文本语义；run_script 描述纠偏（"查找点击用专用工具，脚本只做批量/循环"）+ 富文本用 browser_type 指引
4. **读页表单语义段 + 变化差异**（③，本轮补齐）：桌面 main.cjs 与服务端 browser.ts **同口径**采集 `formFields`（字段名/类型/必填/当前值/长度上限）并计算 `formChanges`（值级 diff，URL 绑定、只报旧字段变化、有界）；工具层渲染成【表单状态】+【自上次读取的变化】两段给模型；pageAgent 提示词同步。守门测试 `form-state-contract.test.ts`（16 项）
5. main.cjs：webview 空闲卸载巡检（10min，锚定/激活豁免）
6. main.cjs：broadcastOpenTab 同站复用（forceNew 保留）
7. main.cjs：非激活 guest 降帧（锚定/激活豁免）

**待办（需单独立项/你拍板）**：
- 主对话模型直看截图替代 image_analyze 独立链路（依赖 vision 池稳定后评估）
- 截图直传（B4，暂缓：要动压缩链路，收益仅在峰值碎片）
