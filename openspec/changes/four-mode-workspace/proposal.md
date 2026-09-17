# 为什么

用户提出一次整体布局调整（2026-09-16），三条明确诉求：

1. **办公模式**：欢迎区的三张场景卡（`日常办公 / 代码开发 / 设计创意`）内容要换 —— **去掉「代码开发」**，换成更多办公室岗位模板（文员、会计、运营……），卡片数量可以增加，并且要用**可手动拖动的 3D 循环旋转效果**（明确要求「不是自动的」）。
2. **开发模式**：布局要变，**去掉「退出开发模式」按钮**；模式切换统一收进一个下拉按钮（办公 / 开发），并**新增「运维模式」「安全模式」**两项，点击切到对应页面；**这个按钮的位置需要专门设计**。
3. **运维模式 / 安全模式**：布局要好好设计，**尽量和办公、开发模式接近**，并且**都要有任务对话功能**。
4. **运维模式（追加，2026-09-16 二次提出）**：任务要能**建立目录、绑定本地目录和对应的服务器信息**，好让智能体自己**打包上传更新应用**，并能**固化一套 CI/CD 流程完成配置**。

经代码审查确认现状：

| 模式 | 路由 | 现状 | 是否有任务对话 |
|---|---|---|---|
| 办公 | `/chat` | `Chat.vue` = 会话列表 + 对话列 + 右侧预览/上下文；欢迎区 `ChatWelcome.vue` 渲染 `SCENES` 三卡 | 是（中栏） |
| 开发 | `/code` | `CodeWorkbench.vue` = 左项目树 + 中编辑器 + 右对话；顶栏右侧有「退出开发模式」按钮（`CodeWorkbench.vue:111-115`） | 是（右栏） |
| 运维 | `/ops` | `views/plugin/OpsConsole.vue`（ops-shell 插件贡献，`desktopOnly`）= 左资源树 + 右终端/SFTP/DB 工作区 | **否** |
| 安全 | `/sec` | `views/plugin/SecConsole.vue`（sec-lab 插件贡献，`desktopOnly`）= brand bar + 合规 ribbon + 左授权/右工作区两栏 | **否** |

核心矛盾：**四种模式目前是四套各自为政的布局**，且只有办公/开发有对话能力；模式之间没有统一的切换入口（办公→开发靠 `ChatTopbar` 的圆形「代码模式」按钮，开发→办公靠「退出开发模式」按钮，运维/安全只能从「更多」菜单深处进）。

### 追加诉求的现状核查（第 4 条）

好消息：**底层能力已存在，缺的是「绑定入口」和「收口」**。

| 已有能力 | 位置 | 缺口 |
|---|---|---|
| CI/CD 流水线引擎（打包→备份→上传→重启），支持 maven-jar / war / 散包 / gradle / npm-build / docker-image / custom 七种构建，9 种步骤类型 | `apps/server/src/plugins/cicd-pipeline.ts`（1198 行）+ `packages/shared/src/types/cicd.ts` | **manifest 里没有 `sidebar` 声明** → 虽然已「默认启用」，UI 上**根本没有入口**，用户只能靠对话让发布助手代劳 |
| 流水线已有 `projectDir`（本地目录）+ `DeployTarget.connectionId`（服务器 SSH 连接）+ `remotePath` + `restartScript` | `cicd.ts:152-164`（`CicdPipeline` / `DeployTarget`） | **两者是流水线级字段，会话/任务上没有** → 无法「在某个任务里绑定」，每次都要重新交代 |
| CI/CD 智能体 `a_builtin_cicd_agent`（发布助手），挂 `cicd_*` 9 个工具 + `conn_*` 管理工具 + `ssh_exec/upload` | `db.ts:1009-1031`（工具集）、`db.ts:1525-1533`（定义） | 它是**代码编写助手的 sub 子智能体**，只能被委派，**不在会话的智能体选择器里**（`agent_kind: 'sub'`） |
| 运维连接管理：`conn_list / conn_create / conn_update / conn_delete / conn_move` + `group_create/rename/delete` | `ops-shell.ts:896+` | 连接是**全局资源**，没有「项目/任务与连接的绑定」概念 |
| 项目检测 `detectProject(projectDir)` → 识别 maven / gradle / npm / docker / Spring Boot | `cicd-pipeline.ts:289` | 需要本地目录已有内容才能检测，**「新建目录」这一步不存在** |
| 会话表已有 `space_id`、`system_prompt`、`builtin_tool_ids_json`，`space` 表有 `dir_path` | `db.ts` conversation / space 建表 | 无项目画像字段（技术栈 / 构建命令 / 部署目标） |
| `asc` 增量迁移惯例：`try { db.exec('ALTER TABLE conversation ADD COLUMN ...') } catch {}` | `db.ts:403,410,122` | 新增列照此办理，**禁止改 CREATE TABLE 了事**（旧库无增量会 500） |

# 改什么

## 1. 统一「模式」为一等概念：四模式 + 顶栏模式下拉

新增模式概念（取代现有的 `isCodeModeActive` 单点标记）：

| key | 名称 | 路由 | 左栏 | 中栏（主工作区） | 右栏「任务」 |
|---|---|---|---|---|---|
| `office` | 办公模式 | `/chat` | 会话列表 | 对话（欢迎区为 3D 场景轮播） | 预览 / 上下文 |
| `dev` | 开发模式 | `/code` | 项目文件树 | 代码编辑器 | **任务对话** |
| `ops` | 运维模式 | `/ops` | 资源树 + 发布项目 | 终端 · SFTP · DB · 发布 | **任务对话（新增）** |
| `sec` | 安全模式 | `/sec` | 资产与授权范围 | 侦察 · 扫描 · 审计工作区 | **任务对话（新增）** |

- **模式下拉 = 改造现有「任务」导航项**（用户拍板「不用新加，改下就好」，零新增控件，详见 design.md 决策 1）：`WebTopBar.vue:131-136` 的 `navMenus` 第 2 项原地升级为 `◧ 当前模式名 ▾`，**四项导航一个不动、顶栏不加宽**。
- **删除 `CodeWorkbench.vue:111-115` 的「退出开发模式」按钮**；`ChatTopbar.vue:21-25` 的「代码模式」圆形按钮一并收编进下拉（不再单独存在）。
- **模式内不再放切换控件**，各模式顶栏最左端只留只读模式徽标。
- 模式记忆：`yz:code:active` 泛化为 `yz:mode`（`office|dev|ops|sec`），路由守卫随之泛化（旧标记自动迁移为 `dev`）。

## 1b. 模式内切换：**对话与项目共享**（用户追加）

模式是**同一份工作上下文的四个视图**，不是四份独立上下文。用户原话「只要模式内切换，对话应该还是共享的，项目应该也是共享的，不用重复写，这样更省地方」。

| 共享对象 | 语义 | 实现 |
|---|---|---|
| 对话 | 切模式后仍是**同一个会话**，历史消息连续 | 复用 `chatStore.currentConvId`，切换**不新建会话、不清消息** |
| 项目 | 四模式指向**同一个工作目录** | 复用全局 `settings.workspaceDir`（`code.ts:86-94` 已双向同步） |
| 任务面板 | 各模式右栏是同一份会话消息 | 四模式共用 `ChatMessageList` + `useChat` |

**共享的是上下文，不是界面状态** —— 开发模式的编辑器标签、运维模式的资源窗口标签各自记忆，切回来仍在（`code.ts` 的 `openFiles` 与 `OpsConsole` 的 `windows` 已各自持久化）。场景提示词按模式追加到后续消息（复用 `useChat.ts:1670-1673` 机制），历史消息不动，因此同一会话内可自然形成「办公提需求 → 开发改代码 → 运维发布」的连续链路。

## 2. 办公模式：场景卡换成办公室岗位模板 + 3D 循环轮播

`config/scenes.ts` 的 `SCENES` 由 3 项扩到 **10 项**，去掉 `code`：

`日常办公`（通用文员）· `设计创意` · `行政文员` · `财务会计` · `运营推广` · `人力资源` · `销售商务` · `法务合同` · `数据分析` · `客服售后`

每项带 `agentId` / 场景提示词 / Skill 关键词 / 示例引导语。新增岗位统一挂 `a_default_assistant` + 岗位提示词（**不新增 10 个内置智能体**，避免智能体列表膨胀）；`code` 场景定义保留给开发模式自动切换用，只是不再出现在欢迎卡里。

**3D 循环轮播**（新组件 `components/chat/SceneCarousel.vue`）：
- N 张卡沿 Y 轴均分圆环（`rotateY(i·θ) translateZ(R)`，θ = 360/N），容器 `perspective`；整体 `rotateY(angle)` 随之旋转。
- **手动拖动**：Pointer Events 统一鼠标 / 触摸，横向位移映射为角度；松手后带惯性衰减并**吸附到最近卡位**；支持 ←/→ 键翻一档。
- **循环**：角度累加不取模，可无限正反向旋转。
- **不自动播放**（用户明确要求），`prefers-reduced-motion` 与移动端（<768px）降级为横向 swipe 列表。

## 3. ★ 每个模式两种形态：「AI 主导 / 人工主导」（用户第二轮追加）

用户诉求不是「加个右栏」，而是**由「谁主导」决定对话放哪**：

> 原话：运维「对话在最右边？能不能**融到命令行里面**，两个模式一个**命令模式**一个 **ai 模式**」；安全「也是这样」；办公/开发「要能切换，一个 **ai 主导模式**（聊天在中间），一个**人工为主 ai 辅助**（聊天在右边，中间是编辑器）」。

抽象为两个正交维度，四模式共用语义：**主导方**（`ai` / `human`）× **对话位置**（`center` / `right` / `inline`）。

| 模式 | AI 主导 | 人工主导 | 复用情况 |
|---|---|---|---|
| 办公 | —（单一形态，不提供切换） | — | 零结构改动 |
| 开发 | 对话居中 + 编辑器可开合 | 编辑器居中 + 右栏对话（**现状即此**） | AI 主导为新增，人工主导零改动 |
| 运维 | 对话居中 + 终端可开合（**已有 `chat` 视图**） | 终端居中 + 底部**对话折叠条**（**已有 `term` 视图**） | **已有视图体系，只改入口显隐 + 加融合条** |
| 安全 | 对话居中 + 扫描输出可开合（新增） | 扫描控制台居中 + 底部对话折叠条（新增） | 控制台零改动，新增 chat 视图 |

- 切换控件 = **右下角悬浮胶囊**（`LeadToggle.vue`，不占布局行；开发 `[AI 模式 | 编辑模式]`、运维/安全 `[AI 模式 | 命令模式]`）；**办公模式不提供形态切换、不显示胶囊**。
- 持久化 `yz:mode:lead`（**按模式分别记忆**）；默认 `{ dev:'human', ops:'human', sec:'human' }`（开发默认编辑器居中 = 现状，运维/安全默认命令模式；办公无 lead）。
- **切形态不换会话、不重开文件、不重连终端** —— 只改排布（`v-show` 保活，见 design.md 决策 3.7）。
- 抽取 `components/workbench/WorkbenchShell.vue`，`chatPlacement` 参数化（`center`/`right`/`inline`），四模式共用 `ChatMessageList` + `ChatInputArea` + `useChat`。

### 3b. 运维 / 安全：对话**融进命令行**（inline）

**关键发现（省大量重复建设）**：运维模式**已经**实现了「命令模式 / 对话模式」切换 ——
`opsSession.ts:37` 有 `ViewKey = 'term' | 'container' | 'db' | 'chat'`，`:49-51` 的 `VIEW_LABEL` 里 **`term` 的标签就叫「命令模式」**、`chat` 叫「对话模式」，`TYPE_VIEWS` 为每种连接配了 `+ chat`；每个窗口（`OpsWin`）持有独立 `conversationId` / `chatMessages`，`sendWinChat` / 流式渲染都已就绪。
**但切换入口是右下角浮动小图标（`ops-view-fab` + `cycleWinView`）—— 太隐蔽，用户没发现。**

→ 改造：把浮动按钮升级为模式顶栏**显式的 `[命令模式 | AI 模式]`** 切换，并支持「同屏融合」：
- **命令模式**：终端占满 + 底部**可折叠对话条**（最新 1 条 AI 结论 + 展开），就地问 AI 不跳页
- **AI 模式**：对话占满 + 终端收成下游可展开区（AI 执行命令时实时显示输出）
- 两者共用同一窗口的 `conversationId`，切换不丢消息、不重连 SSH

安全模式（`SecConsole.vue` 1501 行，**当前零对话能力**）新增同构 `chat` 视图：命令模式 = 现有八 tab 扫描控制台原样不动；AI 模式 = 对话居中（挂已有的 `a_builtin_sec_agent`）。**合规红线（授权范围 / 黑名单 / HUMAN_ONLY / 全量审计 / AI 不自主触发 `attack_sim`）原样保留，AI 模式只是发起入口，不放宽权限、不新增绕过路径。**

新增 `ops` / `sec` 两个场景定义（提示词 + Skill 关键词），让对话在对应模式下带上领域人格与工具偏好。

## 4. 不做什么（本批范围外）

- 不重写 `OpsConsole` / `SecConsole` 的**业务功能**（SSH 终端、SFTP、扫描工具链等全部保持原样），只做**外壳迁移 + 补对话栏**。
- 不动 `ops-shell` / `sec-lab` 的后端插件逻辑与合规红线（扫描授权、危险动作黑名单、审计全保留）。
- 不新增办公岗位对应的内置智能体（复用 `a_default_assistant`）。
- 不改移动端四模式的可用性策略（`/ops` `/sec` 仍为 `desktopOnly`，移动端下拉项置灰）。
- 不改工作流引擎的 loop 节点能力（只清理 `diag_min_loop` 这条诊断数据）。

## 5. 运维模式：任务绑定「本地目录 + 服务器」，CI/CD 流程固化（追加）

### 5.1 概念：**发布项目（Release Project）**——把「本地目录 + 服务器 + 流水线」绑成一个可复用对象

新增一等概念「发布项目」，它是运维模式左栏与任务可绑定的主体：

```
发布项目（ReleaseProject）
├── 基本信息：name / description / 技术栈（detectProject 结果）
├── 本地目录：localDir（新建或选取），构建命令、产物 glob
├── 部署目标 DeployTarget[]  ← 复用现有类型
│     ├── name（如「生产 web-01」）
│     ├── connectionId  →  运维 SSH 连接（已有，含 host/port/user/密钥）
│     ├── remotePath（发布目录）
│     ├── restartScript（启动/重启脚本）
│     └── env（环境变量）
└── 流水线 CicdPipeline[]  ← 复用现有类型
      └── projectDir = 本项目 localDir，targets = 本项目部署目标
```

**「新建目录」**：在运维模式左栏可一键新建发布项目，行为是 —— 选一个父目录 + 项目名 → 在本地建目录骨架（可选脚手架：`npm init` / `mvn archetype` / 空目录 + 占位 README）→ 立即调 `detectProject()` 识别技术栈 → 生成默认流水线模板。

### 5.2 任务（会话）绑定发布项目

会话上新增绑定，让智能体不必每次重新交代：

- 新增列（**走增量迁移**）：`conversation.release_project_id TEXT`
- 运维模式任务对话与「任务」页都可绑定/解绑发布项目；绑定后：
  - 对话上下文自动注入项目画像（本地目录绝对路径、技术栈、构建命令、部署目标清单、最近一次发布结果）
  - 自动挂载 `a_builtin_cicd_agent` 的工具集到当前会话（通过现有 `builtin_tool_ids_json` 机制，**不新建智能体**）
  - 用 `space_id` 复用现有空间隔离，不引入第二套归属概念

### 5.3 「固化 CI/CD 流程」的落地路径

用户说「让智能体自己打包上传更新应用，还能让他固化一套 cicd 的流程完成配置」，对应三步：

1. **首次配置（对话驱动）**：在绑定项目的运维任务里说「把这个项目发布到生产」
   → 发布助手 `detect_project` → `cicd_list_templates` 选模板 → `conn_list` 找 SSH 连接 → `cicd_create_pipeline` 落库
   → 用户只需确认（生产连接写操作已有二次确认闸门）
2. **固化**：流水线以 `projectDir = 本项目 localDir` + `targets = 本项目部署目标` 落库到 `ReleaseProject`，此后是**可复用资产**，不依赖模型重新推理
3. **日常发布**：一键 `cicd_run_pipeline`（SSE 进度）或直接说「发一版」，全程走已有引擎

### 5.4 补上 CICD 的 UI 入口（当前缺失）

`cicd-pipeline.ts` 的 manifest **没有 `sidebar` 声明**，导致插件默认启用但 UI 无入口。本批补：

- `contributes.sidebar` 加一项，`moreGroup: 'ops'`（归入现有运维分组）
- 新增 `/cicd` 路由（`views/plugin/CicdConsole.vue` 已在 `routes` 中声明，仅缺 sidebar 入口与页面接入）
- 在运维模式的统一工作台里，把「发布」作为一个中栏工作区标签接入（与终端 / SFTP / DB 并列），使「打包上传更新应用」在模式内闭环

### 5.5 章节范围边界

- **不改** `cicd-pipeline.ts` 的流水线执行引擎、步骤实现、SSE 进度、运行记录（1198 行保持原样）
- **不改** `ops-shell.ts` 的连接模型与加密（`secretEnc` AES-256-GCM 机器绑定主密钥）、危险命令黑名单、生产连接二次确认
- **不新建智能体**：发布助手 `a_builtin_cicd_agent` 继续作为能力提供方，本批只补「可被运维任务的会话直接挂载工具」
- **不引入云端 CI**：仍是「本地构建 → SSH/SFTP 上传 → 远程重启」的本地一键发布模型

# 影响

**新增**
- `packages/ui/src/components/workbench/WorkbenchShell.vue` — 四模式共用外壳，`chatPlacement: 'center'|'right'|'inline'` 参数化对话位置
- `packages/ui/src/components/workbench/LeadToggle.vue` — 主导方切换悬浮胶囊（右下角，不占布局行；办公不渲染）
- `packages/ui/src/components/chat/SceneCarousel.vue` — 3D 循环轮播
- `packages/ui/src/components/chat/AgentPicker.vue` — 智能体下拉（分组 + 搜索 + 折叠），从 `ChatInputArea.vue:11-45` 抽出
- `packages/ui/src/stores/mode.ts` — 模式 + 主导方状态与持久化（取代 `stores/code.ts` 的 `isCodeModeActive`）
- 安全模式 `chat` 视图（`SecConsole` 目前零对话能力）
- `packages/ui/src/components/ops/ReleaseProjectPanel.vue` — 运维左栏「发布项目」列表与新建/绑定
- 发布项目后端路由（ops-shell 插件域内）：CRUD + 绑定会话 + 触发流水线
- `openspec/changes/four-mode-workspace/mockup-four-mode.html` — 可交互原型

**修改**
- `packages/ui/src/config/scenes.ts` — 场景扩到 12 项（10 个办公岗 + `ops` + `sec`，`code` 保留给开发模式）
- `packages/ui/src/components/chat/ChatWelcome.vue` — 三卡网格 → `SceneCarousel`
- `packages/ui/src/components/WebTopBar.vue` — **`navMenus` 第 2 项「任务」原地改为模式下拉**（不新增控件）
- `packages/ui/src/views/CodeWorkbench.vue` — 删「退出开发模式」按钮（`:111-115`）；新增 AI 主导形态
- `packages/ui/src/components/chat/ChatTopbar.vue` — 删「代码模式」圆形按钮（`:21-25`），改用 `AgentPicker`
- `packages/ui/src/components/chat/ChatInputArea.vue` — 智能体下拉抽为 `AgentPicker`
- `packages/ui/src/stores/agent.ts` — 新增 `groupedChatAgents`（按模式分组），`chatAgents` 保持兼容；内置智能体在 `config_json` 写 `mode` 字段
- `packages/ui/src/views/plugin/opsSession.ts` — **复用现有 `ViewKey`/`VIEW_LABEL`/`TYPE_VIEWS`**，无需新增视图类型
- `packages/ui/src/views/plugin/OpsConsole.vue` — 右下角隐蔽的 `ops-view-fab` 升级为模式顶栏显式切换 + 融合折叠条；左栏加发布项目
- `packages/ui/src/views/plugin/SecConsole.vue` — 新增 `chat` 视图（控制台八 tab 原样保留）
- `packages/ui/src/views/plugin/CicdConsole.vue` — 接入运维模式「发布」工作区
- `packages/ui/src/stores/code.ts` / `composables/chat/useChat.ts` / `router/index.ts` — 模式标记泛化与路由守卫
- `packages/ui/src/components/SideNav.vue` — 移动端 TabBar 同步（桌面侧栏已退役，以顶栏为准）
- `apps/server/src/db.ts` — 增量迁移 `conversation.release_project_id`；内置智能体 seed 补 `config_json.mode`
- `apps/server/src/plugins/ops-shell.ts` — 发布项目 CRUD（复用 `PluginStorage`），不改连接模型与护栏
- `apps/server/src/plugins/cicd-pipeline.ts` — **补 `contributes.sidebar`**（当前缺失导致插件默认启用却无 UI 入口）
- `apps/server/src/index.ts` — 注册新路由；确认 cicd 插件种子

**数据清理（一次性，非代码）**
- 删除 `diag_min_loop` 智能体：`apps/server/data.db`（agent 1 行 + workflow_run 9 条）、`AppData/Roaming/yan-zhi/yan-zhi.db`（agent 1 行）
- **不动** `a_wf_smoke_all_nodes` / `a_wf_smoke_editor`（工作流节点全覆盖的回归验证载体）

# 与旧变更的关系

- **`redesign-chat-and-nav`**：保留其「导航上移顶栏」结论，本变更在其顶栏结构上把「任务」项升级为模式下拉，不回退、不加宽。
- **`sec-lab-workbench`**（安全工作台形态）：保留其视觉风格与合规约束，本变更只给它套统一外壳 + 补对话栏。
- **`decompose-chat-view`**：直接复用 `components/chat/*` 与 `useChat` 作为四模式任务对话栏的底座，不重复实现。
- **`ui-consolidation`**：其三端响应式形态继续作为渲染机制，四模式外壳需同时满足 Electron / Web / Capacitor 三端。

# 所需 Skill 标注

- **`openspec`**（必需）：本提案 / 设计 / 规格 / 任务清单与结构校验。
- **`yan-zhi-code-ui-verify`**（必需，落地后）：四模式布局与 3D 轮播的实际渲染核验（改动集中在 `packages/ui`）。
- **`agent-browser`**（可选，落地后）：拖拽轮播与模式下拉交互的截图核验。
