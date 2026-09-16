# 设计

## 决策 1：模式切换器 = **改造现有「任务」导航项**（用户拍板 2026-09-16）

### 结论：不新增控件，把顶栏现有「任务」项**原地升级**为模式下拉

用户明确「不用新加，改下就好」—— 采用**零新增**方案，顶栏横向占用不变。

```
┌──────────────────────────────────────────────────────────────────────
│ 🅘  首页  [ 办公模式 ▾]  浏览器  消息   更多  ↻         🌓  ─ □ ✕      │
└──────────────────────────────────────────────────────────────────────┘
              ↑ 原「任务」项位置（第 2 位），改为模式下拉
```

- **位置**：`WebTopBar.vue:131-136` 的 `navMenus` 第 2 项（原 `{ path: '/chat', label: '任务', icon: ChatDotRound }`）**原地改造**为模式下拉 —— 不新增项、不挪位、不加宽。
- **形态**：沿用 `.title-nav-item` 既有样式（与 首页/浏览器/消息 完全一致的高度 26px、圆角 7px、hover），只把内容换成 ` 当前模式名 `；激活态直接用 `.title-nav-item.active`（主色浅底 + 主色字）。
- **下拉内容**：四项，每项「图标 + 名称 + 一句描述」，当前项打勾：

```
┌────────────────────────────────┐
│  办公模式            ✓        │  文档 · 表格 · 岗位模板
│ ◧ 开发模式                     │  写代码 · 改 Bug · 读项目
│ ◧ 运维模式                     │  服务器 · Docker · 数据库
│ ◧ 安全模式                     │  侦察 · 扫描 · 审计
└────────────────────────────────┘
```

- **用 `el-popover` 而非 `el-dropdown`**：`WebTopBar.vue:32-33` 有明确踩坑记录 ——「dropdown 会把内容包进 el-scrollbar（overflow 裁剪）」。既有「更多」菜单正是用 popover 解决的，此处**沿用同一处理**；且 `titleBarOverlayOpen`（`WebTopBar.vue:245`）的 BrowserView 避让逻辑可直接复用。
- **不可用态**：运维 / 安全依赖 ops-shell / sec-lab 且 `desktopOnly` → 插件未启用或移动端时置灰，点击提示并给 `/plugins` 跳转。
- **作废原「导航降到 3 项」提议**：任务项本身即模式切换器，四项导航一个不动。

### 模式内不再重复放切换控件

- 删 `CodeWorkbench.vue:111-115`「退出开发模式」按钮
- 删 `ChatTopbar.vue:21-25`「代码模式」圆形按钮
- 各模式自身顶栏最左端只留**只读模式徽标**（图标 + 模式名，不可点），回答「我在哪个模式」；切换一律走顶栏。

---

## 决策 2：3D 循环轮播（`SceneCarousel.vue`）

### 几何

```
容器 perspective: 1200px;  perspective-origin: 50% 42%;
舞台 .sc-stage { transform-style: preserve-3d; transform: rotateY(var(--angle)); }
卡片 .sc-card { position:absolute; transform: rotateY(i·θ) translateZ(R); }
θ = 360 / N                       // N = 卡片数（默认 10）
R = (cardW / 2) / tan(π / N) × 1.35   // 1.35 为视觉留白系数，避免相邻卡贴死
```

- 卡片尺寸：宽 200px、高 132px（桌面）；N=10 → R ≈ 425px。
- 层级：`z-index` 与 `opacity`/`scale` 由「卡片当前法线与视线夹角」推导，正对用户的卡 `scale(1) opacity(1)`，背面卡衰减到 `opacity .35`，背向卡 `pointer-events:none`（不可点）。

### 交互（关键：手动、循环、不自动）

| 行为 | 实现 |
|---|---|
| 拖动旋转 | Pointer Events（`pointerdown/move/up` + `setPointerCapture`），统一鼠标 + 触摸；`angle += dx × 0.22`（阻尼系数，转满一圈约需拖 1600px） |
| 惯性 + 吸附 | `pointerup` 时按最近 30ms 的角速度做 `requestAnimationFrame` 衰减（摩擦 0.94），速度低于阈值后 `snap` 到最近的 `k·θ`，300ms cubic-bezier 过渡 |
| 循环 | `--angle` **累加不取模**（`-∞ ~ +∞`），天然无限正反向旋转；索引 `k = ((round(angle/θ) % N) + N) % N` |
| 不自动播放 | 无定时器、无 idle 自转；仅 `prefers-reduced-motion: reduce` 时关闭过渡动画 |
| 键盘 | 轮播容器 `tabindex=0`，←/→ 转一档，Enter/空格 选中当前正面卡 |
| 点击 | 正面卡点击 = 选中场景（复用现有 `setScene`）；拖动超过 6px 视为拖拽，不触发点击 |
| 降级 | 视口 < 768px 或 `prefers-reduced-motion` → 退化为横向 swipe 卡片列表（`scroll-snap-type: x mandatory`），无 3D |

### 与现有场景选中态的衔接

- 选中卡后：卡面高亮（主色描边 + 打勾），下方浮出该岗位的示例引导语（复用现有 `.cw-example` 交互），并把输入光标聚焦到输入框（沿用 `focusInput()`）。
- 再次点击已选中卡 = 取消场景（沿用现有 `pickScene` 语义）。

---

## 决策 3：★ 核心形态 —— 「AI 主导 / 人工主导」双形态 + 对话与主工作区融合

用户的核心诉求（2026-09-16 第二轮）不是「加个右栏」，而是**每个模式都有两种形态，由「谁主导」决定对话放哪**：

> 原话拆解：
> - 运维：「对话在最右边？能不能**融到命令行里面**啊，两个模式一个**命令模式**一个 **ai 模式**」
> - 安全：「也是这样（**ai 对话嵌到命令行**）」
> - 办公 / 开发：「需要能切换，一个是 **ai 主导模式**，一个是**人工为主、ai 辅助模式**」
>   - ai 主导 → **聊天在中间**
>   - ai 辅助 → **聊天在右边**，中间是编辑器

### 3.1 统一模型

| 模式 | 形态 | 左栏 | 中间 | 右栏 |
|---|---|---|---|---|
| **办公** | **只有一种** | 任务列表 | 对话（场景轮播 + 输入） | — |
| **代码** | **AI 模式** | 任务 + 项目树 | **任务聊天（含模板卡片）** | **编辑器** |
| **代码** | **编辑模式** | 任务 + 项目树 | **编辑器** | **任务（卡片变按钮）** |
| **运维** | **命令模式** | 资源列表（+ 实时面板） | **黑窗口终端** | **文件管理** |
| **运维** | **AI 模式** | 资源 + 发布项目（+ 实时面板） | 对话（**可绑定本地目录**，步骤卡在对话流） | **文件管理**（与命令模式一致） |
| **安全** | **命令模式** | 授权与资产 | 扫描控制台 | 发现与输出 |
| **安全** | **AI 模式** | 授权与资产 | 对话 | 扫描输出 |

共 **7 种形态**（办公 1 + 代码 2 + 运维 2 + 安全 2）。

**关键布局原则**

1. **办公模式只有一种形态**（不提供主导方切换）—— 它本身就是「对话为主」。
2. **代码模式的 AI 模式与办公模式同构**：中间是任务聊天，差别只是右边多一个编辑器。用户原话「代码模式里面的 ai 模式和办公模式布局一样的，ai 就是任务聊天在中间，右边是编辑器」。
3. **代码模式的编辑模式 = 现状**：编辑器居中、任务在右栏；**右栏空间小，模板卡片退化为按钮**（用户原话「卡片变成按钮（空间小）」）。
4. **代码模式的对话区要有模板卡片**：建立项目 / 需求开发 / Bug 修复 / 架构设计等（用户原话「中间的任务区域也能有一些卡片啊，建立项目，需求开发，bug 修复，架构设计这些模板」）。卡片对应已有的代码类智能体能力（代码编写助手 / 代码探索助手 / 高级程序助手 / 前端助手 / Java 开发助手 / 发布助手）。
5. **运维模式 = 三屏**：左资源列表、中黑窗口、右文件管理（用户原话「运维模式就是三屏，左边资源列表，中间黑窗口，右边文件管理」）。
6. **运维 AI 模式也要好好设计**，因为**任务能绑定本地目录**：对话顶部显示「已绑定发布项目」条（本地目录 + 技术栈 + 部署目标），执行步骤卡在对话流内，底部是命令行确认区，右栏仍是文件管理。
7. **安全模式复刻运维模式**（用户原话「安全模式复刻运维模式就好了」）—— 同样三栏：左授权与资产、中扫描控制台/对话、右发现与输出。

### 3.2 代码模式的模板卡片（对话区）

| 模板 | 说明 | 承接的智能体 |
|---|---|---|
| 建立项目 | 按技术栈生成项目骨架与目录结构 | 代码编写助手 |
| 需求开发 | 需求澄清 → 架构设计 → 编码 → 自测 | 代码编写助手 |
| Bug 修复 | 读堆栈 → 定位 → 最小改动 → 回归 | 代码编写助手 |
| 架构设计 | 分层与模块边界、接口契约、数据模型 | 代码编写助手（首席架构师角色） |
| 读懂项目 | 目录结构 / 调用链 / 改动影响面 | 代码探索助手 |
| 补单元测试 | 按现有风格补齐边界与异常用例 | 代码编写助手 |
| 接口开发 | 接口契约 → 实现 → 自测 → 文档 | 高级程序助手 |
| 页面开发 | 按设计规格产出前端页面 | 前端助手 |
| Java 专项 | Maven/Gradle 构建、Spring 分析、调试 | Java 开发助手 |
| 打包发布 | 检测项目 → 生成流水线 → 一键部署 | 发布助手 |

**两种呈现**（同一份数据 `DEV_TPLS`）：
- **卡片**（`.tpl` 网格）：AI 模式下中间空间充足，显示图标 + 名称 + 描述 + 承接智能体，hover 有浮起效果。
- **按钮**（`.tpl-btn` 横排）：编辑模式右栏空间小，退化为「图标 + 名称」的紧凑按钮。

**依据**：代码模式已有一支完整团队（`a_builtin_code_agent` 挂 7 个子智能体：代码探索 / 高级程序 / 设计 / 前端 / Java / 发布 / 浏览器操作），模板卡片就是把「该找哪个智能体干什么」显式化，降低新用户的上手成本。

### 3.3 运维 / 安全：三屏 + AI 嵌在命令行

**参考对象：HexHub**（数据库 / SSH / SFTP / Docker 一体化桌面工具，https://hexhub.cn/）。关键设计：

| HexHub 特性 | 我们的对应 |
|---|---|
| **资产列表**（左栏，目录分组 + 右键新建） | 现有 ops-shell 资源树 + 发布项目 |
| **多标签页**（一个连接一个标签） | **现有 `opsWin` 模型完全吻合** —— 每个 `OpsWin` = (连接, 视图) |
| **三屏协同**（终端 / 远程目录 / 本地目录并排） | 命令模式：左资源 · 中黑窗口 · 右文件管理 |
| **实时面板**（CPU / 内存 / 进程 / 磁盘） | 左栏底部固定面板，两种形态都显示 |
| **对话式执行**（执行过程以对话和操作集回显） | **AI 模式的形态**：对话 + 逐条步骤卡 |

**★ 一个终端 = 一个任务**：与现有 `OpsWin` 各持独立 `conversationId` / `chatMessages` 的模型**天然一致**，**无需改造数据模型** —— 一个连接窗口就是一个任务，左栏任务列表可切换。

**命令模式**（默认）：
```
┌──────────────┬───────────────────────────────┬──────────────────┐
│ 资产与任务     │ [web-01·终端][web-02][＋] 日志 │ 文件管理          │
│  ○ 订单服务发布│  root@web-01:~# df -h /        │ 远程 /app/...     │
│  ○ 月度对账   │  /dev/vda1 40G 35G 3.4G 87% /  │  order-service.jar│
│  发布项目      │  root@web-01:~# systemctl ...  │ 本地 target/      │
│    订单服务   │  ● order-service active        │  order-service.jar│
│  服务器与库    │                                │                  │
│   ● web-01    ├───────────────────────────────┤ 拖拽即可上传/下载  │
│   ● mysql-... │ 实时面板 CPU/内存/磁盘/进程TOP4 │                  │
──────────────┴─────────────────────────────────────────────────┘
```

**AI 模式**（对话即执行界面，任务绑定本地目录）：
```
┌──────────────┬───────────────────────────────┬──────────────────
│ 资产与任务     │ ┌ 已绑定发布项目：订单服务 ────┐ │ 文件管理          │
│  ○ 订单服务发布│ │ ~/work/order-service · maven │ │ （与命令模式一致） │
│  发布项目 ▸    │ │ → 生产 web-01        [换绑]  │ │ 远程 /app/...     │
│  服务器与库    │ └────────────────────────────┘ │  order-service.jar│
│   ● web-01    │  我：帮我打包发布到生产 web-01  │ 本地 target/      │
│               │  AI：目标待确认，将依次执行 6 步 │                  │
│               │  ┌ ① ssh_exec · web-01 · 0.8s │                  │
│               │  │ $ df -h / && systemctl ... ││                  │
│               │  └────────────────────────────┘│                  │
│               │  ┌ ③ cicd_run_pipeline · 46.3s┐│                  │
│               │  ┌ ④ 待确认 · 清理 nginx 日志 ─│                  │
│               │  › 确认执行第 4 步 ▌           ││                  │
├──────────────┴───────────────────────────────┴──────────────────┤
│ 实时面板（左栏底部固定）                                          │
└──────────────────────────────────────────────────────────────────┘
```
- **绑定本地目录**是运维 AI 模式区别于其他模式的核心：绑定后对话自动带上项目画像（本地目录绝对路径、技术栈、构建命令、部署目标），智能体无需每次重新交代。
- **步骤卡**：每步显示步骤号 + 工具名 + 耗时 + 真实输出（黑底终端风格），危险步骤标「需确认」。
- **底部命令行**：`› 确认执行第 4 步 ▌`，支持自然语言追加（「先只做前 3 步」）。

**安全模式复刻运维三屏**：左授权与资产（交战范围 / 资产 / 发现）· 中扫描控制台（AI 模式为对话）· 右发现与输出（AI 模式为扫描输出）。
- **合规红线原样保留**：授权范围校验、危险动作黑名单、HUMAN_ONLY 闸门、全量审计、AI 不自主触发 `attack_sim`。

### 3.6 各模式落地映射

| 模式 | 形态 | 结构改动 |
|---|---|---|
| 办公 | 唯一形态 | 无（现状即此） |
| 代码 | AI 模式 | 新增：中间换为任务聊天 + 模板卡片，编辑器移到右侧可开合 |
| 代码 | 编辑模式 | **零改动**（现状即此），仅右栏任务区加模板按钮 |
| 运维 | 命令模式 | 三屏改造：左资源 · 中黑窗口 · 右文件管理（左栏底部加实时面板） |
| 运维 | AI 模式 | 中栏换为对话；**新增绑定本地目录条**；步骤卡入对话流；右栏文件管理 |
| 安全 | 命令模式 | 复用控制台，补右栏「发现与输出」（三屏化） |
| 安全 | AI 模式 | 新增对话；右栏扫描输出 |

**复用要点**：
- 代码模式编辑模式**零结构改动**，人工主导形态天然就是现状。
- 运维的多窗口模型（ 各持独立会话）**已存在**，一个终端一个任务无需改造数据模型。
- 安全模式的控制台八 tab 原样保留，只做三栏化与补对话。

### 3.7 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| AI 主导形态下编辑器/终端可开合区挤压对话空间 | medium | 可开合区默认折叠、限高（≤45%），拖拽调高；对话区设最小高度 |
| 切形态导致终端重连 / 编辑器重开 | high | **DOM 用 `v-show` 而非 `v-if`** 保活（`OpsConsole` 现已是 `v-show` 范例，终端靠 `attachTerm`/`detachTerm` 保住 SSH 会话）；\`CodeEditorArea\` 同理不得卸载 |
| 运维 `inline` 融合条与现有 `ops-view-fab` 功能重叠 | low | 浮动按钮保留为快捷循环，顶部切换为主入口；两者共用 `switchWinView` |
| 安全模式新增对话触碰合规红线 | high | 对话仅作为「发起入口」，所有执行仍走既有授权范围校验 + 审计；不新增任何绕过路径 |
| 生态差异：开发模式两形态的 `splitter` 宽度要分别记忆 | low | 按 `(mode, lead)` 分别持久化宽度，避免来回切换宽度错乱 |

---

## 决策 4：模式状态与路由

- 新 `stores/mode.ts`：`type AppMode = 'office'|'dev'|'ops'|'sec'`；持久化 key `yz:mode`（localStorage）。
  - 迁移：启动时若 `yz:mode` 不存在而旧 `yz:code:active === '1'`，写入 `dev` 并清除旧键。
  - 导出 `activeMode: Ref<AppMode>`、`setMode(m)`、`modeRoute(m)`、`MODE_DEFS`（图标/名称/描述/路由/可用性）。
- **主导方（决策 3）状态**：
  - `type LeadMode = 'ai' | 'human'`；持久化 key `yz:mode:lead`，值为 `Record<AppMode, LeadMode>`（按模式分别记忆）。
  - 导出 `leadOf(mode)` / `setLead(mode, lead)` / `activeLead: ComputedRef<LeadMode>`。
  - 默认值：`{ office:'ai', dev:'human', ops:'ai', sec:'ai' }`（开发默认编辑器居中即现状）。
  - 导出 `chatPlacementOf(mode, lead)`：`office→'center'`、`dev→(ai?'center':'right')`、`ops/sec→(ai?'center':'inline')`。
- `stores/code.ts` 的 `isCodeModeActive` / `setCodeModeActive` 保留为 `activeMode === 'dev'` 的薄封装，避免一次性改 4 处调用方（`useChat.ts:1670,1791,1896`、`router/index.ts:210`）；后续可废弃。
- 路由守卫泛化：`/chat` 命中且 `activeMode !== 'office'` → 重定向到该模式路由（`/code` `/ops` `/sec`），保留现有「离开模式页再回来应恢复」语义。
- 切换模式时：`setMode(m)` → `router.push(modeRoute(m))` → 目标模式 `onMounted` 里 `setScene(m)`（`office→office`、`dev→code`、`ops→ops`、`sec→sec`）。
- **切换主导方时不做任何重载**：只改 `chatPlacement` → 组件重新排布；终端/编辑器/对话会话**全部保活**（`v-show` 而非 `v-if`，见决策 3.7）。

---

## 决策 5：场景扩展（去 code，加 8 个办公岗位）

`config/scenes.ts` 的 `SceneKey` 由 `'office'|'code'|'design'` 扩为 `'office'|'code'|'design'|'admin'|'finance'|'operation'|'hr'|'sales'|'legal'|'data'|'service'`；`SCENES` 数组里**不含 `code`**（欢迎卡只渲染 `WELCOME_SCENES` 子集，`code` 仅用于开发模式自动切换）。

| key | 名称 | 岗位人格要点 | agentId |
|---|---|---|---|
| `office` | 日常办公 | 通用文员：文档 / 表格 / 纪要 | `a_default_assistant` |
| `design` | 设计创意 | 2~3 方向先选再深化，配色给色值 | `a_builtin_design_agent` |
| `admin` | 行政文员 | 通知 / 公文 / 会议纪要 / 档案 / 差旅 | `a_default_assistant` |
| `finance` | 财务会计 | 报销 / 对账 / 发票 / 报表口径，保留精度 | `a_default_assistant` |
| `operation` | 运营推广 | 文案 / 活动 / 社群 / 数据复盘 | `a_default_assistant` |
| `hr` | 人力资源 | 招聘 JD / 面试提纲 / 入离职 / 制度 | `a_default_assistant` |
| `sales` | 销售商务 | 客户跟进 / 报价 / 合同 / 投标 | `a_default_assistant` |
| `legal` | 法务合同 | 条款审查 / 风险提示 / 模板（**附免责声明**） | `a_default_assistant` |
| `data` | 数据分析 | 指标口径 / 对比 / 结论先行 | `a_default_assistant` |
| `service` | 客服售后 | 话术 / 工单 / 投诉降级 | `a_default_assistant` |
| `ops`（新增） | 运维模式场景 | 只读优先、危险命令先确认、给回滚方案 | `a_default_assistant` |
| `sec`（新增） | 安全模式场景 | 授权范围内、不越界、全量留痕 | `a_default_assistant` |

新增岗位**不新建内置智能体**，一律挂 `a_default_assistant` + 岗位提示词，避免智能体列表膨胀。

---

## 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| `OpsConsole.vue`（1651 行）/ `SecConsole.vue`（1501 行）迁入外壳时样式与状态管理回归 | high | 只做外壳迁移，**不碰内部业务逻辑与状态**；左/中栏整体作为 slot 传入，逐模式单独验证；保留原 `.page` 容器的滚动与 `desktopOnly` 约束 |
| 3D 轮播在 Electron 旧版 Chromium 上的 `preserve-3d` 表现 | medium | 提供 `prefers-reduced-motion` 与特性探测降级为 2D swipe；首版同步限制最小卡片数 ≥ 5 |
| 顶栏新增切换器后横向拥挤（尤其 1280px 以下） | medium | 导航项从 4 项降到 3 项；< 1200px 时切换器仅显示图标 + 箭头（隐藏文字） |
| 运维/安全插件未启用时切换器点击无反应 | low | 置灰 + 提示 + 一键跳 `/plugins`，不让用户困惑 |
| `useChat` 在运维/安全模式下的会话归属（spaceId） | medium | 沿用开发模式的 `projectSpaceId` 逻辑，运维/安全使用当前默认空间，不引入新概念 |

---

## 决策 6：运维模式的「发布项目」——绑定本地目录 + 服务器，固化 CI/CD

### 6.1 数据模型

新增 `ReleaseProject`（后端 `plugin_storage` JSON，与 pipelines/runs 同仓；运维插件域内）：

```ts
export interface ReleaseProject {
  id: string;
  name: string;                 // 「订单服务」
  description?: string;
  localDir: string;             // 本地项目根目录（绝对路径）
  techStack?: ProjectDetectResult;   // detectProject() 结果快照
  buildHint?: { command?: string; artifact?: string };  // 构建命令 + 产物 glob
  targets: DeployTarget[];      // 复用 cicd.ts 的 DeployTarget（connectionId + remotePath + restartScript）
  pipelineIds: string[];        // 关联的 CicdPipeline（复用现有流水线）
  spaceId?: string;             // 归属空间，复用现有隔离
  createdAt: number;
  updatedAt: number;
}
```

**为什么复用 `DeployTarget` 而不是自定义**：`cicd.ts:142-149` 的 `DeployTarget` 已经有 `connectionId`（指向 ops-shell 的 SSH 连接，含 host/port/user/加密密钥）+ `remotePath` + `restartScript` + `env`，正好就是「对应的服务器信息」，无需第二套模型。

### 6.2 会话绑定

```sql
-- 增量迁移（禁止只改 CREATE TABLE，旧库会 500）
ALTER TABLE conversation ADD COLUMN release_project_id TEXT;
```

绑定后的上下文注入（在 `useChat` 组装 system_prompt 时拼接）：
- 本地目录绝对路径 + 技术栈 + 构建命令 + 产物路径
- 部署目标清单（名称 / 服务器 host / 发布目录 / 重启脚本）
- 最近 1 次发布结果（成功/失败 + 当前步骤）

自动挂载工具：把 `plugin_cicd-pipeline__*` 9 个 + `plugin_ops-shell__conn_list` 追加到会话 `builtin_tool_ids_json`（**现有机制，不新建智能体**）。

### 6.3 「新建目录」的三种模式

| 模式 | 行为 |
|---|---|
| 选取已有目录 | 直接选本地目录 → `detectProject()` 识别 → 生成流水线模板 |
| 新建空目录 | 选父目录 + 名称 → `mkdir` → 写入占位 README → 等用户/智能体填内容 |
| 脚手架初始化 | 按技术栈跑脚手架命令（`npm init -y` / `mvn archetype:generate` / `docker init`），**需二次确认** |

### 6.4 闭环链路（用户原话「让智能体自己打包上传更新应用」）

```
运维模式任务（已绑定发布项目）
  └─ 用户：「把这个项目发到生产」
       ↓
  发布助手（工具已挂载，无需委派）
   detect_project → 确认技术栈
   cicd_list_templates → 选模板
   conn_list → 找 SSH 连接（复用 ops-shell 现有连接）
   cicd_create_pipeline → 落库（projectDir=localDir, targets=项目部署目标）  ← 首次固化
       ↓
   cicd_run_pipeline → 打包 → 备份 → 上传(SFTP) → 远程重启   ← 走已有引擎，SSE 进度
       ↓
  下次：「再发一版」→ 直接 cicd_run_pipeline，无需重新推理配置   ← 流程已固化
```

### 6.5 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 生产服务器被误发布 | high | 沿用 ops-shell 既有闸门：`tag` 含「生产/prod」的连接写操作需 `confirmed: true`；发布前展示「目标 + 目录 + 重启脚本」确认框 |
| 构建命令注入 / 任意路径执行 | high | `localDir` 必须落在用户已授权的空间目录内；`exec-local`/`custom` 步骤沿用现有 `runLocal` 超时与输出上限 |
| 密钥泄露给模型 | high | 连接密钥（`secretEnc`）**永不进对话上下文**，只传连接名与 host；沿用 `conn_list` 现有「密钥永不返回」约定 |
| 旧库无 `release_project_id` 列 | medium | 增量迁移 + `try/catch`（照 `db.ts:403,410` 惯例） |
| 发布项目与「空间」概念重叠 | medium | `ReleaseProject.spaceId` 直接复用现有空间，不新建归属体系 |

---

## 决策 7：智能体按模式分类 + 下拉分组搜索折叠

### 7.1 分类：智能体归属到模式

给智能体加 `mode` 归属（**新增字段，不破坏现有智能体**）：

| 模式 | 归属智能体（现有） |
|---|---|
| 办公 | 日常办公助手 `a_default_assistant`（默认）· 设计创意助手 `a_builtin_design_agent` · 动漫脚本分镜助手 `a_builtin_storyboard_agent` · 数据查询分析助手 `a_builtin_data_agent` |
| 开发 | 代码编写助手 `a_builtin_code_agent` · 浏览器操作助手 `a_builtin_page_agent` |
| 运维 | 运维助手 `a_builtin_ops_agent` · 发布助手 `a_builtin_cicd_agent` |
| 安全 | 安全助手 `a_builtin_sec_agent` |
| 工作流 | 调研报告生成助手 `a_wf_smoke_all_nodes` 等 workflow 类型 |

子智能体（`a_builtin_code_explorer` / `backend_dev` / `ui_designer` / `frontend_dev` / `java_agent`）**不进分类下拉**——它们本来就只作为子智能体被委派，不在会话选择器里出现（沿用现有 `agent_kind: 'sub'` 语义）。

**存储方式**：优先用 `config_json` 里加 `mode` 字段（**不新增数据库列**，避免迁移面），内置智能体在 seed 时写入；用户自建智能体默认归到当前模式。

### 7.2 下拉交互：复用模型下拉的成熟形态

`ChatInputArea.vue:443-453` 的模型下拉已有「搜索框 + `pop-model-scroll` + 平台分组可折叠」的完整实现，智能体下拉（`ChatInputArea.vue:12-40`，现为 `el-dropdown`）改造为同构：

```
┌─────────────────────────────────┐
│  搜索智能体                     │  ← el-input，按 name/description 过滤
├─────────────────────────────────┤
│ ▾ 办公模式 (4)                   │  ← 分组标题可点击折叠/展开
│   ◍ 日常办公助手        ✓        │
│   ◍ 设计创意助手                  │
│   ◍ 动漫脚本分镜助手              │
│   ◍ 数据查询分析助手              │
│ ▾ 开发模式 (2)                   │
│ ▸ 运维模式 (2)         [已折叠]   │  ← 收起后只留一行标题
│ ▸ 安全模式 (1)         [已折叠]   │
│ ▸ 工作流 (2)                     │
├─────────────────────────────────┤
│ ＋ 新建智能体                     │
└─────────────────────────────────┘
```

- **搜索**：输入即过滤，命中项自动展开所在分组；无命中显示空态
- **折叠**：分组标题点击切换，**折叠状态持久化**（localStorage `yz:agentGroups:collapsed`）
- **默认展开**：当前模式分组默认展开，其余折叠（减少视觉噪音，符合用户「极简干净」偏好）
- **切换会话时**：`el-dropdown` 改 `el-popover`（dropdown 内容会被 `el-scrollbar` 裁剪，见 `WebTopBar.vue:32-33` 的同类踩坑记录）

### 7.3 实现位置

- `stores/agent.ts`：`chatAgents` computed 改为返回**分组结构**（`{ mode, modeLabel, agents[] }[]`），保留 `chatAgents` 扁平版本兼容既有调用方
- 新增 `components/chat/AgentPicker.vue`：把现有 `ChatInputArea.vue:11-45` 的智能体下拉抽成独立组件（该文件已很大，抽离利于维护）
- 各模式 `setScene` 时自动把 `agentStore.selectedId` 切到该模式的默认智能体（`office→a_default_assistant`、`dev→a_builtin_code_agent`、`ops→a_builtin_ops_agent`、`sec→a_builtin_sec_agent`）—— 与决策 3 的场景切换同步

---

## 决策 8：删除 `diag_min_loop` 智能体（已定位）

### 定位结果（只读查库，未做任何修改）

`diag_min_loop` 是一个**手动创建的 workflow 类型智能体**，不是内置智能体 —— 所以全仓源码检索无命中，只存在于数据里。

| 属性 | 值 |
|---|---|
| id / name | `diag_min_loop` / `diag_min_loop` |
| type | `workflow` |
| is_builtin | **0**（用户手工创建） |
| agent_kind | `main` |
| created_at | 1788573841966 → **2026-09-05** |
| 出现库 | `apps/server/data.db`（开发库）、`AppData/Roaming/yan-zhi/yan-zhi.db`（旧库） |
| **未出现** | `AppData/Roaming/yan-zhi/server-data/data.db`（桌面应用**当前实际使用**的库） |
| 关联运行记录 | `workflow_run` 中 9 条（全部 `completed`），最早 2026-09-05 |

**它是什么**：一个最小 loop 节点诊断载体，5 个节点、4 条连线：

```
input(topic) → code(return ["x1","x2","x3"]) → loop(maxIterations:3, iterateKey:"item")
                ├─ loop_body → code(return "p:" + ctx.inputs.item)
                └─ loop_exit → output(key:"r")
```

**结论**：纯开发期调试遗留数据，无业务价值，可以安全删除。

### 处置方案

| 库 | 动作 | 说明 |
|---|---|---|
| `server-data/data.db`（当前生产库） | **无需处理** | 该库中不存在 `diag_min_loop` |
| `apps/server/data.db`（开发库） | 删除 agent 行 + 关联 `workflow_run` 9 条 | 开发库可重建，删除前建议备份 |
| `yan-zhi.db`（旧库） | 删除 agent 行 | 应用已不读此库，可选 |

### 实现方式（两个层次，都要做）

1. **数据清理脚本**：一次性删除指定库中的 `diag_min_loop`（agent + workflow_run）。**必须只读先列、再确认、再删**，遵循个人的文件安全规范；建议先 `cp` 备份库文件。
2. **防再生**：检查是否有测试脚本/冒烟脚本会创建该 id（`tmp/` 下有多个 `*.mjs` 冒烟脚本）。若有，改为使用临时 id 或在测试库内创建，**不再污染开发库**。

### 注意

- **不要动** `a_wf_smoke_all_nodes` / `a_wf_smoke_editor`：这两个是 `builtin-workflow-agents.ts` 里「10 种节点全覆盖」的回归验证载体（由 `WF_DEF_VERSION` 管理），有实际用途。用户说的「loop 智能体」经确认是 `diag_min_loop`，不含它们。
- `diag_min_loop` 的 `workflow_json` 里 `loop` 是**节点 type**，与「删除 loop 智能体」无关 —— **工作流引擎的 loop 节点能力保持不动**。

---

## 决策 9：智能体下拉分类/搜索/折叠的落地细节（补充决策 7）

### 交互规格（对齐模型下拉的既有实现）

`ChatInputArea.vue:443-470` 的模型下拉已具备完整先例，逐项对齐：

| 能力 | 模型下拉现状 | 智能体下拉改造 |
|---|---|---|
| 搜索框 | `el-input` + `Search` 前缀 + `clearable` | 同构，placeholder「搜索智能体」，匹配 name + description |
| 滚动容器 | `.pop-model-scroll`（限高独立滚动） | 新增 `.agent-picker-scroll`，同样限高 |
| 分组折叠 | 平台分组标题点击折叠，收起只留标题行 | 模式分组同构，标题带数量徽标 |
| 折叠记忆 | — | 新增：localStorage `yz:agentGroups:collapsed`（数组） |
| 选中态 | 打勾 | 保持现有 `agent-opt-check` |

### 分组顺序（按模式，当前模式置顶）

```
[当前模式分组]        ← 默认展开
[其余模式分组]        ← 默认折叠
[工作流]              ← 默认折叠
[＋ 新建智能体]
```

### 关键实现约束

- **`el-dropdown` → `el-popover`**：`el-dropdown-menu` 会被 `el-scrollbar` 包裹，限高滚动 + 折叠会有裁剪问题。项目里已有明确踩坑记录：`WebTopBar.vue:32-33` 注释「dropdown 会把内容包进 el-scrollbar（overflow 裁剪），二级 hover 面板向右飞出会被裁掉并撑出横向滚动条；popover 内容无滚动包裹」。同理适用。
- **`chatAgents` 兼容**：`stores/agent.ts` 的 `chatAgents` 保持返回扁平数组（现有调用方多），新增 `groupedChatAgents` 供新组件用。
- **子智能体不出现**：沿用 `agent_kind === 'sub'` 过滤（`a_builtin_code_explorer` / `backend_dev` / `ui_designer` / `frontend_dev` / `java_agent` / `cicd_agent` 这 6 个都是 sub，不进下拉）。
- **`popover-class` 样式落全局**：参照项目惯例（`shot-menu-popper` 写在 `chat.css`），新 class 前先 grep 避免与既有同名冲突（有教训：`.agent-edit-btn` 曾被全局样式误伤）。

---

## 决策 10：模式内切换时共享对话与项目（跨模式连续性）

用户要求「只要模式内切换，对话应该还是共享的，项目应该也是共享的，不用重复写，这样更省地方」。这条决定了模式的**本质**：模式是**同一份工作上下文的四个视图**，不是四份独立上下文。

### 语义定义

| 共享对象 | 语义 | 实现 |
|---|---|---|
| **对话（会话）** | 切换模式后仍在**同一个会话**里继续对话，历史消息连续 | 复用现有 `chatStore.currentConvId`，切换模式**不新建会话、不清空消息** |
| **项目（工作目录）** | 四个模式指向**同一个工作目录** | 复用现有全局 `settings.workspaceDir`（`code.ts:86-94` 的 `setProjectDir` 已把它同步到全局） |
| **任务（右栏面板）** | 各模式的右栏「任务」是同一个会话的同一份消息列表 | 四模式共用 `ChatMessageList` + `useChat`，天然共享 |

### 具体行为

```
办公模式（/chat，会话 A，工作目录 D）
   │  顶栏模式下拉选「开发模式」
   ▼
开发模式（/code，仍是会话 A，仍是工作目录 D）
   ├─ 右栏任务面板：会话 A 的历史消息完整可见
   ├─ 编辑器：打开工作目录 D 的项目
   └─ 继续输入 → 追加到会话 A
```

- **切换只换视图，不换上下文**：`setMode(m)` 只做「记模式 + 跳路由 + 换布局」，**不调用 `startNewChat()`、不清 `messages`、不换 `spaceId`**。
- **场景提示词按模式追加，但会话不重置**：现有 `setScene()` 只影响后续消息的 system_prompt（`useChat.ts:1670-1673` 的机制），历史消息不动。切到运维模式时追加「运维」场景提示，切回办公时追加「办公」提示 —— **同一会话内可以有多段场景上下文**，这是合理的（用户确实在做跨模式的一件连续的事）。
- **工作目录单一来源**：`settings.workspaceDir` 是唯一真源；`codeStore.projectDir` 与它双向同步（现有机制）。运维模式新引入的「发布项目 `localDir`」在**绑定时**写入 `workspaceDir`（若用户选择了「以该项目为当前工作目录」），避免出现两个目录互相打架。
- **不同模式的工作区状态各自保留**：开发模式打开的编辑器标签、运维模式打开的资源窗口标签，各自记忆（`code.ts` 的 `openFiles`、`OpsConsole` 的 `windows` 已经各自持久化），切换模式后回来仍在。**共享的是上下文，不是界面状态** —— 这一点必须分清，否则切模式会丢编辑器标签。

### 为什么这样设计（对比「每模式独立会话」）

| 维度 | 共享上下文（采用） | 每模式独立会话（否决） |
|---|---|---|
| 用户心智 | 「我在做一件事，换了个界面」 | 「我在四个地方各开了一个任务」 |
| 跨模式任务 | 天然连续（如：办公里提需求 → 开发里改代码 → 运维里发布） | 需要手动复制上下文，智能体看不到前因 |
| 与用户原话的匹配 | ✅「不用重复写，更省地方」 |  每模式要重新交代背景 |
| 与现有实现的距离 | 小（现有 `isCodeModeActive` 语义就是「离开再回来恢复」，本就在共享 store） | 大（要为每模式建会话池） |

### 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 同一会话里混入多模式场景提示词，模型困惑 | medium | 场景提示词写清「当前模式」；切换模式时在消息流插入一条**模式切换分隔提示**（轻量、仅 UI 提示 + system prompt 追加，不伪造用户消息） |
| 运维模式 `ReleaseProject.localDir` 与全局 `workspaceDir` 冲突 | medium | 绑定发布项目时**显式询问**是否同步为当前工作目录；不同步则以 `ReleaseProject.localDir` 为准（发布步骤用项目自身目录） |
| 移动端切模式丢失状态 | low | 移动端 `/ops` `/sec` 本就 `desktopOnly`，只有办公/开发两模式，状态各自持久化即可 |

---

## 决策 11：窄宽降级 —— 侧栏变纯图标按钮，不压成卡片

用户要求：「宽度太窄了就变成按钮不要卡片了，就像 WorkBuddy 一样」。

### 现状问题

顶栏/侧栏在窄宽时只是**整体缩放**，按钮被压成小卡片：文字挤成两行、图标与文字重叠、点击区变形。WorkBuddy 的做法是**到阈值直接切换形态**（文字消失，只剩图标按钮 + tooltip），而不是继续压。

### 方案：侧栏与顶栏的窄宽降级

| 区域 | 宽宽（≥阈值） | 窄宽（<阈值） | 阈值 |
|---|---|---|---|
| 顶栏模式下拉 | `◧ 办公模式 ▾`（图标+文字+箭头） | `◧ ▾`（纯图标+箭头），`title` 给全名 | 1100px |
| 顶栏导航项 | 图标 + 文字 | 纯图标，`el-tooltip` 给文字 | 900px |
| 模式左栏（`.aside`） | 树行显示「图标 + 名称 + 标签」 | 只显示图标，`title` 给全名 | 1200px |
| 模式顶栏操作按钮 | 图标 + 文字 | 纯图标 | 1200px |
| 右栏「AI 辅助」 | 完整消息 + 输入框 | 折叠为右侧竖条（点开浮层） | 1000px |
| 办公场景轮播 | 3D 圆环 | 横向 swipe 列表（已有降级） | 768px |

### 实现要点

- **纯 CSS 媒体查询，不引 JS**：沿用项目现有 `@media (max-width: 767px)` 的响应式惯例（`App.vue:239`、`ChatWelcome.vue:221`），按上表加 900 / 1000 / 1100 / 1200 四档。
- **文字靠 CSS 隐藏，不靠 `v-if`**：`display:none` 掉 `.label` / `.text` 类，避免切换宽度时组件重挂载丢状态（与决策 3.7 的保活原则一致）。
- **必须给 tooltip / title**：纯图标态下用 `el-tooltip` 或原生 `title` 兜底可读性（项目里 `.title-nav-item` 已有 `title` 用法）。
- **禁止用 `transform: scale()` 缩小**：那正是「压成卡片」的成因；改为**减内容**而不是缩尺寸。
- **WorkBuddy 参照点**：其侧栏窄宽时是纯图标 dock（40px 宽、图标居中、hover 出 tooltip），本项目 `SideNav.vue` 的 52px dock 形态（`.side-nav`）其实**已经是**这个模式，可直接复用其样式思路。

### 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 多档媒体查询互相干扰 | low | 每档只改自己负责的类，档位间不重叠；改完在 1280 / 1100 / 900 / 768 四个宽度逐一核验 |
| 纯图标态下用户找不到功能 | medium | 所有纯图标元素必须有 `title` / `el-tooltip`；模式下拉的图标保持品牌辨识度 |
| 右栏折叠为竖条后对话不可用 | medium | 竖条点击展开为浮层（`el-popover` 或抽屉），输入框随之出现；不是「隐藏功能」而是「换形态」 |

---

## 决策 12：按模式补齐智能体与 Skill（缺口比预期大）

用户要求：「每个模式对应的智能体和 skill 也要一并创建」。

### 现状核查（只读查库得到的硬数据）

| 模式 | 专属 Skill 数 | 智能体 | 缺口 |
|---|---|---|---|
| 办公 | 8（email / meeting / xlsx / docx / pptx / pdf / convert / visualization） | 日常办公助手（**42 工具 / 5 skill / 2 子智能体**，最完备） | 岗位场景 8 个新岗**无专属 skill** |
| 开发 | **14**（api_design / arch_design / code_review / code_refactor / unit_test / code_explain / code_security_audit / cross_cutting / git_workflow / openspec×4 …） | 代码编写助手 + **5 个子智能体** | 相对最完整 |
| **运维** | **0** | 运维助手（25 工具，**0 skill**） | **光杆智能体，零专属技能** |
| **安全** | **0**（`code_security_audit` 属代码工程，非安全模式） | 安全助手（12 工具，**0 skill**） | **光杆智能体，零专属技能** |

结论：**办公/开发只需补岗位场景层，运维/安全需要从零建技能体系。**

### 新增 Skill 清单（走 `builtinSkillDefaults` 数组，`db.ts` 内定义）

**运维（新增 6 条，category = 运维）**

| id | 名称 | 覆盖 |
|---|---|---|
| `skill_ops_health_check` | 服务器健康巡检 | CPU/内存/磁盘/负载/服务存活，输出体检报告 |
| `skill_ops_log_analysis` | 日志排查与分析 | nginx/app/systemd 日志定位报错、统计 TOP 错误 |
| `skill_ops_docker_ops` | Docker 容器运维 | 容器/镜像/卷管理、日志、重启、资源占用排查 |
| `skill_ops_db_maintain` | 数据库巡检（只读） | 慢查询、连接数、表空间、索引失效，**只读** |
| `skill_ops_deploy_release` | 发布与回滚 | 配合发布项目：打包→备份→上传→重启→回滚方案 |
| `skill_ops_incident_response` | 故障应急处理 | 现象→定位→止损→根因→复盘的处置流程 |

**安全（新增 6 条，category = 安全）**

| id | 名称 | 覆盖 | 合规约束 |
|---|---|---|---|
| `skill_sec_recon` | 授权范围内的侦察 | 存活探测、端口与服务识别 | 强制校验授权范围 |
| `skill_sec_web_probe` | Web 应用安全检测 | 常见漏洞探测、敏感路径 | 危险动作需确认 |
| `skill_sec_report` | 安全报告撰写 | 发现项分级、复现步骤、修复建议 | 默认脱敏（IP/凭据打码） |
| `skill_sec_audit_review` | 操作审计复核 | 审计日志核对、异常操作识别 | — |
| `skill_sec_hardening` | 主机加固基线 | 系统/中间件安全基线检查与加固建议 | — |
| `skill_sec_blue_team` | 蓝队检测与日志狩猎 | 检测规则、日志狩猎（已有 blueteam 工具链） | — |

**办公岗位（新增 6 条，category = 办公）** —— 对应决策 5 的 8 个新岗位，按复用度选 6 条：

| id | 名称 |
|---|---|
| `skill_office_finance` | 财务对账与报表 |
| `skill_office_hr` | 招聘与人事文书 |
| `skill_office_operation` | 运营活动与复盘 |
| `skill_office_legal` | 合同条款审查（**附免责声明**） |
| `skill_office_data_report` | 数据报表与结论输出 |
| `skill_office_service` | 客服话术与工单处理 |

### 智能体侧改动（**不新增智能体**，只补挂载）

| 智能体 | 现状 | 改动 |
|---|---|---|
| 运维助手 `a_builtin_ops_agent` | 25 工具 / **0 skill** | `skill_ids` 补 6 条运维 skill |
| 安全助手 `a_builtin_sec_agent` | 12 工具 / **0 skill** | `skill_ids` 补 6 条安全 skill |
| 日常办公助手 `a_default_assistant` | 5 skill | 补办公岗位 skill（按需，避免一次挂太多） |

- **不新建智能体**：8 个办公岗位继续挂 `a_default_assistant` + 岗位提示词（沿用决策 5），运维/安全已有专属智能体。
- 用 `force_sync: true` 让工具/skill 挂载以代码为准下发（现有机制，见 `db.ts:1664`）。
- **改内置 skill 内容必须加进 `SKILL_BODY_REFRESH_IDS` 白名单**（`db.ts:2336`）才有线下发 —— 现有 upsert **刻意不覆盖已有 body**，这是项目既有约定，漏了会「改了没生效」。

### 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| skill 挂太多导致模型跑偏 | medium | 每个智能体控制在 5~6 条；skill 是**按需注入**（`triggers` 命中才给），不是全量塞进 prompt |
| 安全类 skill 越过合规红线 | high | 所有安全 skill 的 body 必须写明「授权范围内 + 危险动作需确认」；执行始终由既有工具层闸门兜底，skill 只是方法论，**不放权** |
| 改 skill body 后线上不生效 | medium | 必须加进 `SKILL_BODY_REFRESH_IDS`；改完重启 server 核验库中 body == 代码定义 |
| 法务/财务类 skill 给出专业建议引发合规问题 | medium | body 里明确「仅供参考，不构成法律/审计意见」，重要事项提示咨询持证专业人士 |

---

## 决策 13：任务列表四模式同构（用户指出「不是有任务列表吗」）

### 问题

原型里**只有办公模式左栏有任务/会话列表**，开发、运维、安全的左栏全是「资源树」，没有任务列表。这与决策 10 的「对话共享」语义矛盾 —— 既然四模式共用同一会话，就该**在哪里都能看到并切换任务**。

### 现状（代码层面确认）

| 模式 | 左栏内容 | 任务列表 |
|---|---|---|
| 办公 `Chat.vue` | `ChatSidebar` 会话列表 | ✅ 有 |
| 开发 `CodeWorkbench` | `CodeSidebar` 项目文件树 |  无（靠右栏顶部的任务下拉切换，入口隐蔽） |
| 运维 `OpsConsole` | 资源树 | ❌ 无 |
| 安全 `SecConsole` | 授权/审计 | ❌ 无 |

开发模式的「任务切换」其实藏在右栏 `cp-task-trigger` 下拉里（`CodeWorkbench.vue:130-149`），运维/安全则完全没有。

### 方案：左栏统一为「任务区 + 资源区」双段

```
┌──────────────────┐
│  任务 (4)        │   ← 四模式同构：同一份会话列表
│  ● 新任务   刚刚   │
│  ○ 季度经营分析 昨天│
│  ○ 合同条款审查 周一│
├──────────────────┤   ← 分隔线
│ ▾ 服务器与库 (7)   │   ← 各模式自己的资源区
│  ● web-01  [prod] │
│  ● mysql-order    │
└──────────────────┘
```

- **任务段**：四模式完全相同的组件（`components/workbench/TaskListSection.vue`），数据源是同一个 `chatStore.conversations`（按当前 `spaceId` 过滤）。
- **资源段**：各模式原有内容原样保留（开发=文件树、运维=资源树+发布项目、安全=授权+资产）。
- **开发模式**：右栏 `cp-task-trigger` 下拉**保留**（就近切换仍方便），左栏新增任务段后再无「找不到任务」的问题。
- 两段各自可折叠；窄宽时任务段保留（它比资源树更常用），资源段先隐藏。
- **与决策 12 的关系**：决策 12 补的是「智能体 + skill」，本条补的是「任务入口」，都是「每个模式该有的东西要齐」。

### 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 左栏两段拥挤、资源树可用高度变小 | medium | 两段各自可折叠；任务段默认限高（约 40%），超出滚动 |
| 任务列表与资源树数据源不同步 | low | 任务段只读 `chatStore`，不缓存本地副本 |
| 开发模式两处任务入口（左栏 + 右栏下拉）重复 | low | 保留两处是有意为之：左栏用于「找任务」，右栏用于「就地切」 |

---

## 决策 14：默认配色重做 + 内置「轻量皮肤」（小图，不要大壁纸）

用户诉求（2026-09-16 第五轮）：

> 「目前默认 UI 布局和配色有点 low，这个也许好改下，加个默认皮肤啊搞定小图片，不要大的完整的图片默认配色也改下啊现在的实在难以入目啊」

拆成三件事：
1. **默认配色重做**（现在「难以入目」）
2. **加一套默认皮肤**，但**只用小图（部件纹理），不要大张完整壁纸**
3. 顺带：办公模式的**文件管理与预览按钮要保留**

### 14.1 现状核查

### 默认配色（`packages/ui/src/styles/tokens.css`）

| 变量 | 当前值 | 评价 |
|---|---|---|
| `--color-bg` | `#F7F5F0` | 米白/宣纸色，偏黄 |
| `--color-primary` | **`#C2410C`（朱砂橙红）** | **主犯**：砖红在现代工具里显旧、显土 |
| `--color-primary-light` | `#FBEBDD` | 淡橘 |
| `--color-primary-dark` | `#7C2D12` | 深棕红 |
| `--color-accent` | `#B45309` | 琥珀棕 |
| `--gradient-primary` | `linear-gradient(135deg, #C2410C, #B45309)` | **橙红→琥珀**，两个暖色叠在一起更显旧 |
| `--color-success` | `#2F6B4F` | 墨绿 |
| `--color-danger` | `#B91C1C` | 正红 |

注：这是**主题色，运行时会被 `applyPalette`/`applySkin` 覆盖**，默认值只在未选主题时生效。但它是「第一眼印象」，也就是用户说的「难以入目」。

**问题诊断**：整套是「**中国风朱砂 + 宣纸**」路线（配宋体 display 字体）。作为文化主题挺好，**作为默认值偏重、偏旧**——橙红+琥珀双暖色、米黄底，饱和度与明度都不够干净。

### 内置皮肤（`apps/server/src/plugins/skins.ts`，891 行）

**已有 27 套**，全部是 `kind:'skin'`（**带大壁纸**）：樱夜物语 / 赛博宵 / 云海物语 / 星夜列车 / 学园夕映 / 秦时明月 / 伟大航路 / 忍道 / 猫语午后 / 鹿鸣林深 / 绿屿仙踪 / 竹雨听风 / 星光舞台 / 巨星之夜 / 星夜红毯 / 山川晓色 / 极光之夜 / 流体幻彩 / 墨色浮生 / 黑金墨韵 / 敦煌飞天 / 青绿千里 / 太极玄机…

**缺口**：**没有一套「轻量/极简」皮肤** —— 全是重壁纸风，而用户明确要「**不要大的完整的图片**」。

### 技术可行性（已核实）

`ThemePalette` 类型（`packages/core/src/plugin/types.ts:34`）里：
- **`wallpaper` 本来就是可选的**（`wallpaper?:`）
- **`kind` 已区分** `'palette'`（纯配色方案）与 `'skin'`（带壁纸皮肤）

→ **「只用小图、不要大壁纸」天然可行**：用 `kind:'palette'` 或 `kind:'skin'` 但不提供 `wallpaper`，只配 `surface` 里的部件小图。

### 14.2 默认配色重做方案

**目标**：干净、现代、不抢眼，作为「没有选择时」的舒服底子。

| 变量 | 现值 | **新值** | 理由 |
|---|---|---|---|
| `--color-bg` | `#F7F5F0` | **`#F7F8FA`** | 去掉米黄，转中性冷灰白（无彩色倾向） |
| `--color-surface` | `#FFFFFF` | `#FFFFFF` | 保持 |
| `--color-surface-hover` | `#F1EFE9` | **`#F2F4F7`** | 与 bg 同族 |
| `--color-border` | `#E7E4DC` | **`#E7EAF0`** | 去黄，转冷灰 |
| `--color-border-strong` | `#D8D5CC` | **`#D6DAE3`** | 同上 |
| `--color-text` | `#1A1A1A` | **`#1C2129`** | 纯黑带一点冷调，比死黑柔和 |
| `--color-text-secondary` | `#6B6B66` | **`#5A6272`** | 去黄，转冷灰 |
| `--color-text-tertiary` | `#9C9B94` | **`#8D95A6`** | 同上 |
| **`--color-primary`** | **`#C2410C`** | **`#4F46E5`（靛蓝）** | **核心改动**：中性偏冷的蓝紫，现代工具通用色，浅色底对比度 ≥ 4.5:1 |
| `--color-primary-light` | `#FBEBDD` | **`#EEF0FE`** | 主色 8% 底 |
| `--color-primary-dark` | `#7C2D12` | **`#3730A3`** | 主色加深 |
| `--color-accent` | `#B45309` | **`#7C5CFC`** | 与主色同族、略偏紫，做二强调 |
| `--gradient-primary` | 橙红→琥珀 | **`linear-gradient(135deg, #4F46E5, #7C5CFC)`** | 同族渐变，不再双暖色打架 |
| `--color-success` | `#2F6B4F` | **`#15803D`** | 提亮，更清晰 |
| `--color-warning` | `#B45309` | **`#C2740B`** | 与 accent 解耦（原来两者同色） |
| `--color-danger` | `#B91C1C` | **`#DC2626`** | 提亮一档 |

**暗色主题同步调整**（`[data-theme="dark"]`）：

| 变量 | 现值 | 新值 |
|---|---|---|
| `--color-bg` | `#141414` | **`#101216`**（冷调近黑） |
| `--color-surface` | `#1D1D1C` | **`#171A20`** |
| `--color-surface-hover` | `#262624` | **`#1F232B`** |
| `--color-border` | `#2A2A28` | **`#262B34`** |
| `--color-text` | `#ECEAE4` | **`#E8EAF0`** |
| `--color-primary` | `#D97757` | **`#818CF8`**（暗底用亮一档的靛蓝） |
| `--color-primary-dark` | `#C2410C` | **`#6366F1`** |

**为什么选靛蓝（Indigo #4F46E5）**：
- 现代工具的高频选择（Linear / Vercel / Notion 系都用相近冷色），**不显旧**
- 与中性灰背景天然和谐，不像橙红那样「跳」
- 浅底对比度 5.2:1、暗底（#818CF8 on #101216）8.1:1，均过 WCAG AA
- 与「言智」品牌不冲突（品牌 logo 现在是紫→蓝渐变 `#7c3aed → #2563eb`，**本来就是冷色系**；默认主色改用靛蓝反而**与 logo 一致**，这是当前「橙红 vs 紫蓝 logo 打架」的直接修复）

> **附带发现**：品牌 logo 是紫蓝渐变，而默认主色是朱砂橙红 —— **两者本来就撞色**。改靛蓝后视觉统一。

**字体**：`--font-display` 现在是宋体（`"Songti SC", ..., SimSun`）。宋体做 UI 标题**现代感偏弱**。建议默认标题也用无衬线（`--font-body`），宋体保留为**主题可选项**（文化类皮肤里继续用）。这一条**列为可选项**，等用户定。

### 14.3 内置「轻量皮肤」方案（小图，不要大壁纸）

新增一套 **`kind:'palette'`** 的默认皮肤（或 `kind:'skin'` 但不给 `wallpaper`），命名建议 **「云白」（`skin-cloud-white`）** 或 **「素笺」（`skin-plain`）**。

### 素材清单（**只要 4 张小图，不要壁纸**）

| 文件 | 用途 | 尺寸 | 说明 |
|---|---|---|---|
| `task-list-bg.webp` | 侧栏/任务列表底纹 | 480×270 | 极淡斜纹或点阵，**透明度很低**，肉眼近乎纯色 |
| `input-bg.webp` | 输入框底纹 | 480×270 | 更淡，几乎看不见纹理 |
| `button-bg.webp` | 按钮底纹 | 480×270 | 同上 |
| `dialog-bg.webp` | 弹窗/面板底纹 | 480×270 | 同上 |
| ~~`wallpaper.webp`~~ | **不需要** | — | 用户明确「不要大的完整的图片」 |

**设计原则**（写给做图的人）：
- 纹理必须**极轻**：亮度差 ≤ 3%，避免「花」
- 只做**几何/线条**类纹理（斜纹、细点阵、微格），不做任何具象图
- 必须**可无缝平铺**（遵 `docs/skin-double.md` §4.1）
- 单文件 ≤ 20 KB（比规范里 50 KB 更严，因为极简图压得更狠）
- 深色模式下能看出纹理（遵 §5.1，纹路用中性灰不要高饱和）

### 配色（surface 块）

```jsonc
{
  "id": "skin-cloud-white",
  "name": "云白",
  "kind": "palette",          // ← 关键：不带壁纸
  "category": "简约",
  "preview": "preview.webp",
  "primary": "#4F46E5",
  "primaryLight": "#EEF0FE",
  "primaryDark": "#3730A3",
  "accent": "#7C5CFC",
  "gradient": "linear-gradient(135deg, #4F46E5, #7C5CFC)",
  "surface": {
    "taskListPattern": "task-list-bg.webp",
    "inputPattern": "input-bg.webp",
    "buttonPattern": "button-bg.webp",
    "dialogPattern": "dialog-bg.webp",
    "menuPattern": "dialog-bg.webp",
    "codePattern": "dialog-bg.webp",
    "browserPattern": "task-list-bg.webp",
    "glass": "#FFFFFF",
    "glassDark": "#171A20",
    "glassAlpha": 0.86,
    "glassAlphaDark": 0.78,
    "glassBlur": 8,
    "radius": 12,
    "buttonRadius": 6
    // 不写 wallpaper / patternFit（默认 repeat 已正确）
  }
}
```

**关键差异**：与现有 27 套相比，这套**没有 `wallpaper`** → `applySurface` 下发的 `--app-wallpaper` 为空 → 不铺大图，只靠部件纹理 + 纯净配色。

### 是否设为「默认皮肤」

建议 **是**（作为「未选任何皮肤」时的落点）：
- 用户没选皮肤 → 走默认配色（§14.2 的新靛蓝）+ 可选叠加云白部件纹理
- 用户选了 27 套之一 → 走那套的壁纸皮肤

**但要注意**：默认配色写在 `tokens.css`，皮肤走 `applySkin` 的 CSS 变量下发。两者是**两条路径**。所以「默认皮肤」有两种实现：
- **方案 A（推荐）**：默认**不启用任何皮肤**，纯用 §14.2 的新 tokens.css 配色。用户想要纹理再手动选「云白」。
- **方案 B**：把「云白」设为出厂默认皮肤（`settings.skinId = 'skin-cloud-white'`），首次启动就带纹理。

方案 A 更稳（少一层 CSS 变量下发，冷启动更快、更少坑）；方案 B 更「有设计感」。**留给用户拍板**。

### 14.4 办公模式的文件管理与预览按钮要保留（不能丢）

**这是硬约束**：重新设计四模式布局时，办公模式的这两个入口**必须原样保留**（用户 2026-09-16 明确「记得办公模式的文件管理和预览按钮要保留」）。

现状位置（`packages/ui/src/components/chat/ChatTopbar.vue`）：

| 入口 | 位置 | 现状 |
|---|---|---|
| **文件管理** | 第 19 行 `<ChatFilePanel />` | 独立组件，已存在 |
| **预览 / 右侧栏视图** | 第 26-47 行 `el-dropdown`，触发器是第 27 行那个「右侧栏视图」圆钮（`Operation` 图标） | 下拉含：**浏览器预览**（`supportsBrowser` 时）、**Git 文件**、**控制台**、**展开/收起右侧栏** |

**设计约束**：
- 改造办公模式布局时，`ChatTopbar` 的这两个入口**保持可用**，不得因「对话居中」重构而移除
- 新布局下它们仍在**模式顶栏右侧**（现状位置），随 `v-show` 保活，不因切形态而卸载
- 窄宽降级时退化为**纯图标按钮**（遵决策 11），但**功能不消失**

**同时注意**：代码模式新增「AI 模式」形态时，这两个入口若在代码模式也需要（Git 文件 / 控制台对代码场景同样有用），应保持一致可用性 —— **待确认是否复制到代码模式**。

### 14.5 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 改默认主色影响 27 套皮肤 | low | 皮肤各自带 `primary`，运行时覆盖 tokens 默认值，**互不影响** |
| 靛蓝与某些皮肤撞色 | low | 皮肤只在被选中时生效，默认色不起作用 |
| 新配色破坏既有组件对比度 | medium | 逐项核验：文字/边框/按钮 hover/禁用态对比度 ≥ 4.5:1；改动集中在 tokens.css 的变量，不改组件样式 |
| 「云白」纹理太淡看不见 / 太浓显花 | medium | 亮度差控制在 ≤3%；在应用里实际切换两种主题核验（遵 `docs/skin-double.md` §10.3） |
| `kind:'palette'` 是否真的不铺壁纸 | medium | **落地前先核实 `applySurface` 对无 `wallpaper` 的处理**（若无 `wallpaper` 时 `--app-wallpaper` 是否为空字符串，避免出现「背景透明」） |
| 移除宋体默认字体引发文化类皮肤不协调 | low | 字体改动列为**可选项**，且文化皮肤可在 manifest 里自带字体 |
| 办公顶栏两入口被新布局挤掉 | **high** | 写入 spec 硬约束 + 落地后按 `yan-zhi-code-ui-verify` 逐项核验「文件管理」「预览」两个入口可点、可用 |

---

## 决策已定 / 待定

### 已拍板（用户确认，不再改）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 模式切换器位置 | **改造现有「任务」导航项**，零新增控件、顶栏不加宽 |
| 2 | 模式间关系 | **对话与项目共享**，切模式不新建会话、不清历史 |
| 3 | **双形态** | 每模式有 **AI 主导 / 人工主导**；对话位置 = `center` / `right` / `inline`；运维/安全 **对话融进命令行** |
| 4 | 办公岗位卡片 | 10 张（8 个新岗位 + 日常办公 + 设计创意） |
| 5 | 智能体下拉 | 分模式归类 + 搜索 + 分组可折叠，折叠态持久化 |
| 6 | `diag_min_loop` | 删除（开发库 + 旧库；生产库无此记录） |

### 仍待确认

1. **运维/安全模式插件未启用时**：置灰提示（推荐）vs 自动引导启用。
2. **办公岗位是否要收拢**：现为 10 张，若嫌多可收到 6~8 张（去掉法务/客服等低频岗）。
3. **`diag_min_loop` 的 9 条 `workflow_run` 历史记录**：一并删（推荐，纯诊断数据）vs 只删 agent 行保留运行历史。
4. **主导方默认值**：现定 `{ office:'ai', dev:'human', ops:'ai', sec:'ai' }`（开发默认编辑器居中 = 现状）。若希望运维也默认「命令模式」，把 `ops` 改为 `'human'` 即可。

---

## 原型

`mockup-four-mode.html`（第二版，已按 7 种形态重写）：
- 顶栏模式下拉（在「任务」项原位）四模式可切
- **右下角悬浮胶囊**切换形态：代码 `[AI 模式 | 编辑模式]`、运维/安全 `[AI 模式 | 命令模式]`、办公不显示
- **办公**：左任务列表 │ 中对话（3D 场景轮播可真实拖动 + 输入）
- **代码 AI 模式**：中任务聊天（含 10 张模板卡片）│ 右编辑器
- **代码编辑模式**：中编辑器 │ 右任务（模板退化为按钮）
- **运维命令模式**：左资源列表（+ 底部实时面板）│ 中黑窗口 │ 右文件管理
- **运维 AI 模式**：中对话（顶部绑定发布项目条 + 步骤卡）│ 右文件管理
- **安全**：复刻运维三屏（命令模式 = 扫描控制台 / AI 模式 = 对话）
- 四模式对话共享同一会话；左栏均有任务列表
- 运行时验证 **7/7 形态元素齐全**，零宽字符 0

