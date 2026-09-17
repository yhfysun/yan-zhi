# 1. 模式基础设施（stores / 路由 / 定义）

- [x] 1.1 新建 `packages/ui/src/stores/mode.ts`：`AppMode = 'office'|'dev'|'ops'|'sec'`，`MODE_DEFS`（key/名称/图标/描述/路由/可用性判定），`activeMode` ref、`setMode()`、`modeRoute()`
- [x] 1.2 持久化 key `yz:mode`（localStorage）；启动时迁移旧 `yz:code:active === '1'` → `dev` 并删除旧键
- [x] 1.3 `stores/code.ts` 的 `isCodeModeActive()` / `setCodeModeActive()` 改为 `activeMode === 'dev'` 的薄封装，保持现有 4 处调用方（`useChat.ts:1670,1791,1896`、`router/index.ts:210`）不改行为
- [x] 1.4 `router/index.ts` 守卫泛化：命中 `/chat` 且 `activeMode !== 'office'` → 重定向到该模式路由
- [ ] 1.5 运维 / 安全可用性判定：`pluginStore` 是否启用 ops-shell / sec-lab + 是否 `desktopOnly` 平台（已在 ModeSwitcher.vue 实现，待运行核验）
- [x] 1.6 **契约固化**：`mode.ts` 顶部注释写明「模式是同一份工作上下文的四个视图，不持有会话/目录」，防止后续实现误加 per-mode 会话池

# 2. 模式下拉（改造现有「任务」导航项，零新增控件）

- [x] 2.1 `WebTopBar.vue` 的 `navMenus` 第 2 项「任务」**原地改造**为模式下拉（不新增项、不加宽）
- [x] 2.2 新增 `components/workbench/ModeSwitcher.vue`：复用 `.title-nav-item` 样式，内容换成 `◧ 当前模式名 `
- [x] 2.3 **用 `el-popover` 而非 `el-dropdown`**（`WebTopBar.vue:32-33` 有 dropdown 被 el-scrollbar 裁剪的踩坑记录）
- [x] 2.4 下拉四项：图标 + 名称 + 一句描述 + 当前项打勾
- [x] 2.5 不可用项置灰 + 提示 + 「去插件管理」跳 `/plugins`，不触发导航
- [x] 2.6 复用 `titleBarOverlayOpen`（`WebTopBar.vue:245`）做 BrowserView 避让
- [x] 2.7 切换后 `router.push(modeRoute(m))`

# 2b. 模式内共享对话与项目（关键语义）

- [ ] 2b.1 `setMode()` **只做**「记模式 + 跳路由 + 换布局」；**禁止**调用 `startNewChat()`、禁止清 `messages`、禁止换 `spaceId`
- [ ] 2b.2 确认四模式右栏/中栏都读同一个 `chatStore.currentConvId`，切换模式后历史消息连续可见
- [ ] 2b.3 工作目录单一真源：各模式统一读 `settings.workspaceDir`；`codeStore.projectDir` 继续与之双向同步（`code.ts:86-94`）
- [ ] 2b.4 场景提示词按模式追加到后续消息（复用 `useChat.ts:1670-1673`），历史消息不动
- [ ] 2b.5 模式切换时插入轻量「模式切换分隔提示」（仅 UI 提示 + system prompt 追加，**不伪造用户消息**）
- [ ] 2b.6 界面状态各自保留：`code.ts` 的 `openFiles`、`OpsConsole` 的 `windows` 切模式后不丢
- [ ] 2b.7 回归验证：办公提问 → 切开发看历史 → 切运维发布，全程同一会话

# 3. 删除模式内退出控件，改为只读徽标

- [x] 3.1 删除 `CodeWorkbench.vue:111-115`「退出开发模式」按钮及其 `backToChat` 调用
- [x] 3.2 删除 `ChatTopbar.vue:21-25`「代码模式」圆形按钮与 `goCodeMode()`
- [x] 3.3 开发模式顶栏最左端加只读模式徽标（图标 + 「开发模式」，不可点）
- [x] 3.4 检查 `backToChat` / `setCodeModeActive(false)` 是否还有其他调用方，无则清理（仅 CodeWorkbench 一处，已删）

# 4. 办公模式：场景目录扩展（去 code，加 8 个岗位）

- [x] 4.1 `config/scenes.ts`：`SceneKey` 扩展为 `office|code|design|admin|finance|operation|hr|sales|legal|data|service|ops|sec`
- [x] 4.2 新增 8 个办公岗位场景定义（名称 / 图标 / 配色 / desc / 3 条示例 / 岗位提示词 / Skill 关键词），统一 `agentId: 'a_default_assistant'`
- [x] 4.3 新增 `ops` / `sec` 场景定义（运维：只读优先 + 危险命令先确认 + 给回滚方案；安全：授权范围内 + 不越界 + 全量留痕）
- [x] 4.4 导出 `WELCOME_SCENES`（渲染用子集，排除 `code`）与 `SCENES`（全量）
- [x] 4.5 确认法务场景提示词带免责声明措辞

# 5. 办公模式：3D 循环轮播

- [x] 5.1 新建 `components/chat/SceneCarousel.vue`：`perspective` + `preserve-3d`，卡片 `rotateY(i·θ) translateZ(R)`，`θ = 360/N`
- [x] 5.2 角度累加不取模（`--angle`），实现无限正反向循环；索引 `k = ((round(angle/θ) % N) + N) % N`
- [x] 5.3 Pointer Events 拖动（`setPointerCapture`），鼠标 + 触摸统一；阻尼系数 0.22
- [x] 5.4 惯性衰减（摩擦 0.94）+ 吸附到最近卡位（260ms cubic-bezier）
- [x] 5.5 层级/透明度由法线与视线夹角推导；背向卡 `pointer-events:none`
- [x] 5.6 明确不自动播放：无定时器、无 idle 自转
- [x] 5.7 键盘：容器 `tabindex=0`，←/→ 转一档，Enter/空格 选中
- [x] 5.8 拖动 > 6px 视为拖拽不触发点击；正面卡点击 = 选中场景
- [x] 5.9 降级（用户追加「卡片宽度不够就变轮播图或者按钮」）：**容器** < 640px 或 `prefers-reduced-motion` → 横向 swipe 列表（scroll-snap）；< 400px → 图标+名称按钮行（ResizeObserver 判容器而非视口）
- [x] 5.10 `ChatWelcome.vue`：三卡网格替换为 `SceneCarousel`，保留选中高亮 + 示例引导语浮出 + 输入框聚焦 + 再次点击取消
- [ ] 5.11 按 `yan-zhi-code-ui-verify` 在运行中的应用里核验实际渲染（不改仅本地预览）

# 5a. 办公 / 开发模式的双形态

- [ ] 5a.1 开发模式 **AI 主导**（新增）：对话居中占主视觉，编辑器降为可开合区（点文件时自动展开）
- [ ] 5a.2 开发模式 **人工主导**（= 现状 `CodeWorkbench` 左树/中编辑器/右对话，**零结构改动**）
- [ ] 5a.3 开发模式两形态共享 `codeStore` 的 `openFiles` / `activePath`，切换不重开文件
- [ ] 5a.4 **办公模式不提供双形态**（单一形态，不显示主导方胶囊）—— 左任务列表 │ 中对话（场景轮播 + 输入）
- [ ] 5a.5 开发模式主导方切换走右下角悬浮胶囊 `LeadToggle.vue`，**顶栏不放切换控件**
- [ ] 5a.6 核验：切形态后对话历史连续、终端/编辑器状态保留

# 5e. 主导方切换控件：悬浮胶囊（不占布局行）

- [ ] 5e.1 新建 `components/workbench/LeadToggle.vue`：`position:absolute; right:16px; bottom:16px`，毛玻璃胶囊
- [ ] 5e.2 外层容器加 `position:relative` 作定位基准；浮层 wrapper `pointer-events:none`，仅胶囊本身可点（不挡内容）
- [ ] 5e.3 措辞：开发 `[✨ AI 模式 | ⌨ 编辑模式]`；运维/安全 `[✨ AI 模式 | 命令模式]`（**废弃「AI 主导」「智能体/手动」旧字样**）；**办公模式不渲染胶囊**
- [ ] 5e.4 **从各模式顶栏移除主导方分段控件**（原设计占一行，与模式下拉打架）
- [ ] 5e.5 窄宽时只留图标（`.lead-text` 隐藏），`title` 给全名与说明
- [ ] 5e.6 各模式主导方状态取值统一为 `'ai' | 'human'`（全文档一致，不引入 `'agent'` 拼写）

# 5i. 代码模式任务模板卡片（对话区）

- [ ] 5i.1 定义  数据：建立项目 / 需求开发 / Bug 修复 / 架构设计 / 读懂项目 / 补单元测试 / 接口开发 / 页面开发 / Java 专项 / 打包发布
- [ ] 5i.2 每项标注承接的**已有**智能体（代码编写 / 代码探索 / 高级程序 / 前端 / Java 开发 / 发布助手），**不新建智能体**
- [ ] 5i.3 卡片形态（ 网格）：AI 模式中间空间充足，显示图标 + 名称 + 描述 + 承接智能体
- [ ] 5i.4 按钮形态（ 横排）：编辑模式右栏空间小，**卡片退化为图标+名称按钮**（用户明确「卡片变成按钮（空间小）」）
- [ ] 5i.5 点击模板 → 填入输入框 / 发起对应任务（对齐现有场景卡交互）

# 5m. 模式形态矩阵（7 种形态）

- [ ] 5m.1 **办公：只有一种形态**（不提供主导方切换）—— 左任务列表 │ 中对话（场景轮播 + 输入）
- [ ] 5m.2 **代码 AI 模式**：左任务+项目树 │ 中任务聊天（含模板卡片）│ 右编辑器 —— **与办公同构，只是右边多编辑器**
- [ ] 5m.3 **代码编辑模式**：左任务+项目树 │ 中编辑器 │ 右任务（**卡片退化为按钮**）—— **现状即此，零结构改动**
- [ ] 5m.4 **运维命令模式**：左资源列表（+底部实时面板）│ 中黑窗口终端 │ 右文件管理
- [ ] 5m.5 **运维 AI 模式**：左资源+发布项目 │ 中对话（**可绑定本地目录**，步骤卡在对话流）│ 右文件管理（**与命令模式一致**）
- [ ] 5m.6 **安全命令模式**：左授权资产 │ 中扫描控制台 │ 右发现与输出（**复刻运维三屏**）
- [ ] 5m.7 **安全 AI 模式**：左授权资产 │ 中对话 │ 右扫描输出
- [ ] 5m.8 主导方胶囊：办公**不显示**；代码 `[AI 模式 | 编辑模式]`；运维/安全 `[AI 模式 | 命令模式]`
- [ ] 5m.9 默认值：`{ dev:'human', ops:'human', sec:'human' }`（开发默认编辑器居中 = 现状；运维/安全默认命令模式）

# 5f. 任务列表四模式同构（用户指出「不是有任务列表吗」）

- [ ] 5f.1 新建 `components/workbench/TaskListSection.vue`：读 `chatStore.conversations`（按 `spaceId` 过滤），四模式共用
- [ ] 5f.2 左栏改「任务段 + 资源段」双段：任务段在上，用分隔线与资源段区隔
- [ ] 5f.3 开发模式左栏（`CodeSidebar` 之上）加任务段；右栏 `cp-task-trigger` 下拉**保留**（就地切换）
- [x] 5f.4 运维模式左栏加任务段（资源树之下保留）
- [x] 5f.5 安全模式左栏加任务段（授权/资产之下保留）
- [ ] 5f.6 两段各自可折叠；任务段默认限高 ~40%，超出滚动
- [ ] 5f.7 窄宽降级时**任务段优先保留**，资源段先隐藏

# 5c. 窄宽降级：变纯图标按钮，不压成卡片

- [ ] 5c.1 原则固化：**减内容（隐藏文字）而非缩尺寸**；禁止用 `transform: scale()` 降级
- [ ] 5c.2 顶栏模式下拉：窄宽只留 `图标 + 箭头`，`title` 兜底全名
- [ ] 5c.3 顶栏导航项：窄宽纯图标 + `el-tooltip`；文字包进 `.nav-text` 供隐藏
- [ ] 5c.4 模式左栏：树行/任务行窄宽只留图标，`title` 给全名；`row-label` / `conv-mini-label` 参与隐藏
- [ ] 5c.5 右栏对话：窄宽折叠为竖条，点击开浮层（非隐藏功能）
- [ ] 5c.6 分档实现：1200 / 1100 / 1000 / 900（沿用项目 `@media (max-width: 767px)` 惯例的扩展）
- [ ] 5c.7 在 1280 / 1100 / 900 / 768 四个宽度逐一核验，避免档位互相干扰

# 5b. 按模式补齐智能体与 Skill

- [ ] 5h.1 **运维 6 条 skill**（category 运维）：`skill_ops_health_check` / `skill_ops_log_analysis` / `skill_ops_docker_ops` / `skill_ops_db_maintain`（只读）/ `skill_ops_deploy_release` / `skill_ops_incident_response`
- [ ] 5h.2 **安全 6 条 skill**（category 安全）：`skill_sec_recon` / `skill_sec_web_probe` / `skill_sec_report` / `skill_sec_audit_review` / `skill_sec_hardening` / `skill_sec_blue_team`
- [ ] 5h.3 **办公 6 条 skill**（category 办公）：`skill_office_finance` / `skill_office_hr` / `skill_office_operation` / `skill_office_legal`（附免责声明）/ `skill_office_data_report` / `skill_office_service`
- [ ] 5h.4 全部加进 `db.ts` 的 `builtinSkillDefaults` 数组（结构 `{id, name, category, description, triggers, body}`）
- [ ] 5h.5 `a_builtin_ops_agent` 的 `skill_ids` 补 6 条运维 skill（现为 0）
- [ ] 5h.6 `a_builtin_sec_agent` 的 `skill_ids` 补 6 条安全 skill（现为 0）
- [ ] 5h.7 `a_default_assistant` 按需补办公岗位 skill（避免一次挂太多，控制 5~6 条）
- [ ] 5h.8 **不新建智能体**；智能体侧用 `force_sync: true` 让挂载以代码为准下发
- [ ] 5h.9 **改内置 skill body 必须加进 `SKILL_BODY_REFRESH_IDS` 白名单**（`db.ts:2336`），否则线上不生效（upsert 刻意不覆盖已有 body）
- [ ] 5h.10 安全类 skill 的 body 必须写明「授权范围内 + 危险动作需确认」；法务/财务类附「仅供参考」声明
- [ ] 5h.11 重启 server 核验：库中 skill 数与 body 与代码定义一致

# 6. 统一工作台外壳（对话位置参数化）

- [ ] 6.1 新建 `components/workbench/WorkbenchShell.vue`：props `{ mode, lead, chatPlacement: 'center'|'right'|'inline' }`；`topbar` / `aside` / `main` / `task` / `status` 五个 slot
- [ ] 6.2 `chatPlacement` 三种排布：`center` 对话占 main、工作区降为可开合区；`right` 对话占 task（原设计）；`inline` 对话与主工作区在同一 slot 内上下分区
- [ ] 6.3 右栏/中栏对话统一内置 `ChatMessageList` + `ChatInputArea` + `useChat`
- [ ] 6.4 **保活硬约束**：终端、编辑器、对话切换形态时用 `v-show` 不用 `v-if`（`OpsConsole` 已是 v-show 范例，终端靠 `attachTerm`/`detachTerm` 保住 SSH 会话）
- [ ] 6.5 可开合区默认折叠 + 限高 ≤45% + 拖拽调高；对话区设最小高度
- [ ] 6.6 splitter 宽度按 `(mode, lead)` 分别持久化，避免来回切宽度错乱
- [ ] 6.7 各模式顶栏最左端统一只读模式徽标；主导方切换走**右下角悬浮胶囊**（`LeadToggle.vue`，见 5e），**顶栏不放切换控件**

# 6b. 主导方（lead）状态

- [ ] 6b.1 `stores/mode.ts` 新增 `LeadMode = 'ai'|'human'`，持久化 `yz:mode:lead`（`Record<AppMode, LeadMode>`）
- [ ] 6b.2 默认值 `{ dev:'human', ops:'human', sec:'human' }`（办公无 lead；开发默认编辑器居中 = 现状；运维/安全默认命令模式）
- [ ] 6b.3 导出 `leadOf()` / `setLead()` / `activeLead` / `chatPlacementOf(mode, lead)`
- [ ] 6b.4 切换主导方**不做任何重载**：只改 `chatPlacement` 重新排布，终端/编辑器/会话全部保活

# 7. 运维模式：HexHub 式工作台 + AI 嵌在命令行（用户指定参考）

- [x] 7.1 **一个终端 = 一个任务**：复用现有 `OpsWin` 模型（每窗口独立 `conversationId`/`chatMessages`），**不改造数据模型**
- [x] 7.2 **多窗口标签栏**（对齐 HexHub 多标签）：命令模式与 AI 模式**都要保留**，标签带连接类型圆点 + 任务名
- [x] 7.3 **命令模式 = 三屏协同**：终端占主视觉 + 右侧「实时面板（CPU/内存/磁盘/进程 TOP4）」+「SFTP（远程目录与本地目录并排，拖拽上传下载）」
- [x] 7.4 **实时面板**：复用 ops-shell 已有远程执行能力采集指标，不新增后端（新增只读 `GET /plugin/ops-shell/metrics` 端点 + `OpsMetricsPanel.vue`，10s 轮询，不入审计）
- [x] 7.5 **SFTP 双栏**：`SftpPanel.vue` 改为「远程 │ 本地」双栏（宽容器左右并排，紧凑模式上下堆叠），本地栏用 Electron `fs:listDetailed`
- [x] 7.6 **AI 模式 = 对话即执行界面**：每一步渲染成**可展开步骤卡**（工具名 + 状态 + 耗时 + 真实输出），危险步骤标「需确认」（新建 `OpsStepCards.vue`，数据由消息 `tool_calls_json` + role=tool 结果推导，后端零改动）
- [x] 7.7 **底部命令行**：AI 模式底部 `› 正在执行第 N 步 · <工具> ▌` / 需确认提示，点击聚焦输入框追加自然语言指令
- [x] 7.8 **命令模式底部折叠条**：展开是**真对话**（消息 + 快捷指令 chip + 输入框），与 AI 模式共用同一份窗口会话（`w.cmdChatOpen` 保活）
- [x] 7.9 右下角主导方悬浮胶囊 `[AI 模式 | 命令模式]`，替代隐蔽的 `ops-view-fab`（LeadToggle 已接入；`ops-view-fab` 按 design 3.7 保留为视图快捷循环，右移 60px 避让胶囊）
- [x] 7.10 默认 `LEAD.ops = 'human'`（**命令模式**，用户已指定）
- [x] 7.11 保留 `term/container/db` 作为命令模式下的窗口视图（docker→容器、database→数据查询）
- [x] 7.12 只做外壳与视图入口改造，**不改业务逻辑**：SSH 会话、SFTP、DB 只读查询、目录分组、右键菜单、审计日志保持原行为
- [ ] 7.13 核对 `desktopOnly` 与插件未启用时的路由兜底
- [ ] 7.14 可选（HexHub 有、我们暂缺）：命令广播（多机同时执行）—— 若做，需先确认护栏
- [x] 7.15 **资源树嵌套 + 拖拽**：目录支持子目录（`OpsGroup.parentId`，后端 `PUT /groups/:id/parent` 带防环校验）；资源可拖进目录、目录可拖进目录；拖到列表根部 = 移出到顶层/未分组；删除目录时子目录上提一层
- [x] 7.16 「资源」行右侧新增 `＋` 按钮（与任务段「新建任务」同规格），目录右键新增「在此目录下新建子目录」

# 7b. 运维模式：发布项目（本地目录 + 服务器绑定）

- [ ] 7b.1 定义 `ReleaseProject` 类型（`localDir` + `techStack` + `buildHint` + `targets: DeployTarget[]` + `pipelineIds` + `spaceId`），落 `packages/shared/src/types/cicd.ts`
- [ ] 7b.2 后端 CRUD：ops-shell 插件域内用 `PluginStorage` 存 `release-projects`（与 pipelines/runs 同思路）
- [ ] 7b.3 新建目录三种模式：选取已有目录 / 新建空目录 / 脚手架初始化（脚手架需二次确认）
- [ ] 7b.4 创建后自动跑 `detectProject()`（`cicd-pipeline.ts:289`）识别技术栈并推荐模板
- [ ] 7b.5 部署目标绑定：选现有 ops-shell 连接 + 填 `remotePath` / `restartScript` / `env`（**复用 `DeployTarget`，不建第二套服务器模型**）
- [ ] 7b.6 新增 `components/ops/ReleaseProjectPanel.vue` 挂到运维左栏
- [ ] 7b.7 增量迁移 `ALTER TABLE conversation ADD COLUMN release_project_id TEXT`（照 `db.ts:403,410` 惯例，try/catch）
- [ ] 7b.8 会话绑定/解绑 UI + 绑定后上下文注入（本地目录、技术栈、构建命令、部署目标、最近发布结果）
- [ ] 7b.9 绑定后把 `plugin_cicd-pipeline__*` + `plugin_ops-shell__conn_list` 追加到会话 `builtin_tool_ids_json`（**不新建智能体**）
- [ ] 7b.10 首次配置闭环：`detect_project` → `cicd_list_templates` → `conn_list` → `cicd_create_pipeline`（`projectDir = localDir`）
- [ ] 7b.11 日常发布闭环：`cicd_run_pipeline` 直跑已有流水线（SSE 进度），验证「流程已固化」不用重新推理
- [ ] 7b.12 安全闸门：生产连接（tag 含生产/prod）写操作仍需 `confirmed: true`；发布前展示「目标 + 目录 + 重启脚本」确认框
- [ ] 7b.13 密钥红线：连接 `secretEnc` **永不进对话上下文**，只传连接名与 host（沿用 `conn_list` 约定）
- [ ] 7b.14 补 `cicd-pipeline.ts` 的 `contributes.sidebar`（当前缺失 → 插件默认启用却无 UI 入口），`moreGroup: 'ops'`
- [ ] 7b.15 运维模式中栏加「发布」工作区标签，接入 `CicdConsole.vue`（与终端 / SFTP / DB 并列）
- [ ] 7b.16 `ReleaseProject.localDir` 与全局 `workspaceDir` 冲突处理：绑定时**显式询问**是否同步为当前工作目录

# 8. 安全模式接入外壳 + 对话融进控制台

- [x] 8.1 新增 `chat` 视图（`SecConsole.vue` 原**零对话能力**），与运维同构（右栏 v-show 双容器：命令模式控制台 / AI 模式对话，保活不卸载）
- [x] 8.2 **命令模式** = 现有扫描控制台（brand bar / 合规 ribbon / 左授权审计 / 右八个 tab）**原样不动**
- [x] 8.3 **AI 模式** = 对话居中，挂 `a_builtin_sec_agent`（安全助手，已存在）；对话自动携带当前授权范围提示（只传目标值，不传凭据）
- [x] 8.4 模式切换走**右下角主导方悬浮胶囊** `[命令模式 | AI 模式]`（按 5e.4 决策：顶栏不放切换控件，替代原计划的顶栏切换）
- [x] 8.5 `onMounted` 里 `setScene('sec')`
- [x] 8.6 **合规红线原样保留**：授权范围校验、危险动作黑名单、HUMAN_ONLY 闸门、全量审计、AI 不自主触发 `attack_sim` —— AI 模式只是「人通过对话发起扫描」的入口，**不放宽任何执行权限、不新增绕过路径**（本次只加对话 UI，sec-lab 执行链路零改动）
- [ ] 8.7 核验两栏 grid（`.sec-grid`）在双形态下的响应式表现

# 8b. 智能体按模式分类 + 下拉分组搜索折叠

- [ ] 8b.1 内置智能体在 seed 的 `config_json` 写 `mode` 字段（**不新增数据库列**，避免迁移面）
- [ ] 8b.2 模式归属：办公=`a_default_assistant`/`design_agent`/`storyboard_agent`/`data_agent`；开发=`code_agent`/`page_agent`；运维=`ops_agent`/`cicd_agent`；安全=`sec_agent`；工作流=`a_wf_*`
- [ ] 8b.3 `stores/agent.ts` 新增 `groupedChatAgents`（按模式分组），`chatAgents` 扁平数组保持兼容
- [ ] 8b.4 新建 `components/chat/AgentPicker.vue`：从 `ChatInputArea.vue:11-45` 抽出智能体下拉
- [ ] 8b.5 **`el-dropdown` 改 `el-popover`**（dropdown-menu 被 el-scrollbar 包裹会裁剪限高滚动）
- [ ] 8b.6 搜索框：匹配 name + description，命中项自动展开所在分组，无命中显示空态
- [ ] 8b.7 分组折叠：标题带数量徽标，当前模式分组默认展开、其余折叠，折叠态持久化 `yz:agentGroups:collapsed`
- [ ] 8b.8 过滤子智能体：沿用 `agent_kind === 'sub'`（排除 code_explorer / backend_dev / ui_designer / frontend_dev / java_agent / cicd_agent）
- [ ] 8b.9 `popover-class` 样式落全局 `chat.css`，**新 class 先 grep 避免与既有同名冲突**（有 `.agent-edit-btn` 被误伤的教训）
- [ ] 8b.10 各模式 `setScene` 时同步切换 `agentStore.selectedId` 到该模式默认智能体

# 8c. 清理 diag_min_loop 诊断智能体

> 实现方式（2026-09-17 拍板）：**不走一次性脚本，改为「启动时自动删除」** —— 开发库是 WAL 且被
> 运行中的应用占用，外部脚本改 `.db` 会被 WAL 覆盖；由持有者自己在启动阶段删最稳。
> `yan-zhi.db` 是 Electron 主进程独占库，后端进程碰不到 → 两侧各清一次（均幂等，无标记位）。

- [x] 8c.1 **先备份库文件**：`apps/server/data.db`、`yan-zhi.db`、`server-data/data.db`
      （`sqlite3.backup()` 一致性备份 → `.bak-20260917-212245`，共 3 份，保留未删）
- [x] 8c.2 只读先列出待删目标：dev 库 agent 1 行 + `workflow_run` 9 条；旧库 agent 1 行；生产库无
- [x] 8c.3 删除 `apps/server/data.db`：agent 1 行 + `workflow_run` 9 条
      （由 `index.ts` 启动调 `cleanupLegacyDiagAgents()`；`tsx watch` 已实测执行）
- [x] 8c.4 删除 `yan-zhi.db`：agent 1 行（`main.cjs` 新增 `cleanupLegacyDiagAgent()`，在 `getDb()` 后调用）
- [x] 8c.5 `server-data/data.db`（生产库）**无此记录，不动**（仅备份）
- [x] 8c.6 `tmp/*.mjs` 冒烟脚本不重建该 id（已 grep 确认零命中）
- [x] 8c.7 **不动** `a_wf_smoke_all_nodes` / `a_wf_smoke_editor`；**不动**工作流引擎的 loop 节点能力

### 补充发现（design.md 决策 8 当时漏查）

- [x] 8c.8 **会话重绑（关键）**：dev 库有 1 条 `conversation.agent_id='diag_min_loop'`
      （真实用户对话「生成一张图片来看看」，2026-09-15，6 条消息，含一张已生成图片）。
      直接删 agent 会留悬空 id → 会话仍可读、提示词也因 `conversation.system_prompt` 快照不丢，
      但 **agent 级工具挂载 / 子智能体 / MCP 挂载会全线静默失效**
      （`buildSystemPromptForBackend` / `buildToolsForBackend` 都靠该 id 查 agent 行）。
      → 先重绑再删，已重绑至 `a_builtin_design_agent`（工具 14 个 + 技能 5 个复原），6 条消息未动。
- [x] 8c.9 **重绑不能用精确匹配**：`conversation.system_prompt` = agent 提示词 **+ 场景后缀**
      （前端 `scenes.ts` 选场景时拼接）→ 必须 `startsWith` 前缀匹配 + 取最长命中，否则会退化成默认助手
      （首版用 `===` 命中失败，已修正并复验）。

# 10. 代码模式布局修正（第五轮）

- [ ] 10.1 **卡片完全复用办公卡片**：删掉自造的 `.tpl` / `.tpl-grid` 系列，改用 `ChatWelcome.vue` 的 `.cw-cards` + `.cw-card`
- [ ] 10.2 交互也一致：点击选中 → `.is-active` 高亮 → 展开引导区 → 再次点击取消
- [ ] 10.3 **只换数据源**：办公读 `SCENES`、代码读 `DEV_TPLS`；落地时优先抽通用 `SceneCardGrid.vue` 共用（可选），否则必须共用同一套 CSS 类名
- [ ] 10.4 状态分离：办公用 `sceneMode`、代码用独立字段（如 `devTemplateKey`），共组件不共状态
- [ ] 10.5 **活动条仅在编辑模式保留**：`CodeSidebar.vue` 的 `.csb-bar`（资源管理器/搜索/源代码管理/运行调试/控制台/插件/开发环境）在 AI 模式下 `v-show` 隐藏
- [ ] 10.6 AI 模式左栏只剩任务列表（活动条与其面板不显示）；中栏任务聊天、右栏编辑器
- [ ] 10.7 编辑模式保持现状：活动条 + 任务列表 + 文件树 │ 中编辑器 │ 右任务（模板退化为按钮）
- [ ] 10.8 AI 模式下 Git/插件入口的兜底：顶栏保留 `.cp-git` 区（分支/提交/同步），必要时给「切到编辑模式」的醒目入口

# 11. 默认配色重做 + 内置轻量皮肤（第五轮）

- [ ] 11.1 **改 `packages/ui/src/styles/tokens.css` 默认配色**：`--color-primary` 由 `#C2410C`（朱砂橙红）改为 `#4F46E5`（蓝）
- [ ] 11.2 中性骨架去黄转冷：`--color-bg` `#F7F5F0`→`#F7F8FA`；`--color-border` `#E7E4DC`→`#E7EAF0`；`--color-text-secondary` `#6B6B66`→`#5A6272`（详见 design 决策 14.2 全表）
- [ ] 11.3 `--gradient-primary` 由「橙红→琥珀」改为同族「`#4F46E5`→`#7C5CFC`」；`--color-accent` 与 `--color-warning` **解耦**（原来同色）
- [ ] 11.4 暗色主题同步（`[data-theme="dark"]`）：`--color-bg` `#141414`→`#101216`、`--color-primary` `#D97757`→`#818CF8`（详见 design 14.2）
- [ ] 11.5 逐项核验对比度 ≥ 4.5:1（文字/边框/按钮 hover/禁用态），在浅色与暗色两种主题下都测
- [ ] 11.6 **内置轻量皮肤**：新增 `kind:'palette'`（无 `wallpaper`）的皮肤，命名「云白」/`skin-cloud-white`，放 `apps/server/src/plugins/skins.ts`
- [ ] 11.7 素材**只要 4 张小图**：`task-list-bg.webp` / `input-bg.webp` / `button-bg.webp` / `dialog-bg.webp`（480×270，可无缝平铺，亮度差 ≤3%，单文件 ≤20KB），**不要壁纸**
- [ ] 11.8 **落地前先核实** `applySurface` 对「无 `wallpaper`」的处理：确认 `--app-wallpaper` 为空时不会导致背景透明
- [ ] 11.9 默认皮肤策略二选一（**待用户拍板**）：方案 A = 默认不启用皮肤、纯用新 tokens 配色（推荐，少一层下发）；方案 B = 出厂默认设 `skin-cloud-white`
- [ ] 11.10 字体（可选）：`--font-display` 宋体改为默认可选项，文化类皮肤自带字体
- [ ] 11.11 按 `yan-zhi-skin-fixer` skill 的验证清单核验：`vue-tsc` + `vite build` + 应用内实际切换浅/暗主题

# 12. 办公模式入口保留 + 运维 SFTP 互拖（第五轮）

- [ ] 12.1 **办公顶栏两入口必须保留**：`ChatTopbar.vue` 的 `<ChatFilePanel />`（第 19 行，文件管理）与「右侧栏视图」下拉（第 26-47 行，含浏览器预览 / Git 文件 / 控制台 / 收起展开）
- [ ] 12.2 布局重构后这两处仍在模式顶栏右侧、可点可用；窄宽降级为纯图标但**功能不消失**
- [x] 12.3 **运维 SFTP 双栏互拖**：本地→远程 = 上传（`sftpFastPut`）、远程→本地 = 下载（`fastGet`）；**同栏拖动不响应**
- [x] 12.4 拖动视觉：源条目 `opacity .4` + 目标栏主色描边/浅底 + 顶部方向提示（「松开上传到 /app/...」/「松开下载到 ~/...」）
- [x] 12.5 悬停到子目录行则传进该目录，否则传到栏当前目录
- [x] 12.6 **文件夹递归**：上传走后端 `collectLocalFiles`；下载目录由前端递归 `sftp/list` + `fs.mkdir` 逐文件下载（限深 6 层 / 200 文件）；进度「下载 x（n/N）」
- [x] 12.7 **同名冲突必须确认**（覆盖 / 自动改名 -1），不静默覆盖；生产连接上传走既有二次确认
- [x] 12.8 多选（Ctrl/Shift）批量拖 + 整栏全选拖（拖拽时按当前选中集合整体传输）
- [x] 12.9 **路径穿越防护**：下载目标必须落在本地栏当前目录内（`dest === base || dest.startsWith(base + '/')`），否则拒绝
- [ ] 12.10 移动端降级为「选中 → 点目标栏『传到这里』按钮」（无拖拽手势）—— 网页端本地栏不可用，行内「下载/上传」按钮已覆盖
- [x] 12.11 后端**无需新增**：复用 `ops-shell.ts` 的 `sftpFastPut` / `ensureRemoteDir` / `collectLocalFiles`

# 13. 验证与收尾

- [ ] 13.1 `vue-tsc` 类型校验（仓库根跑，见项目 MEMORY 的正确姿势）：`node node_modules/.pnpm/vue-tsc@2.2.12_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js -p packages/ui/tsconfig.json --noEmit`
- [ ] 13.2 四模式逐个在运行中的应用里核验布局（桌面端 1420 端口）
- [ ] 13.3 核验 3D 轮播：拖动、惯性、吸附、循环、不自动播放、键盘、移动端降级
- [ ] 13.4 核验模式下拉：四项可切、不可用项置灰提示、刷新后模式记忆、旧 `yz:code:active` 迁移、顶栏未加宽
- [ ] 13.5 核验运维/安全对话栏真能收发消息（场景提示词已按模式注入）
- [ ] 13.6 补正式测试类（非临时脚本）：`mode.ts` 迁移逻辑、`scenes.ts` 目录完整性、`ReleaseProject` 绑定
- [ ] 13.7 `apps/web` 与 `apps/desktop` 各构建一次，确认无破坏（web 端模式下拉与 `desktopOnly` 处理）
- [ ] 13.8 移动端（Capacitor）核验：运维/安全置灰、轮播降级为 swipe
- [ ] 13.9 核验发布闭环：绑定项目 → 首次配置出流水线 → 二次发布直跑（含生产连接确认闸门）
- [ ] 13.10 核验智能体下拉：分组、搜索、折叠记忆、子智能体不出现
- [ ] 13.11 按用户偏好：改动限定路径提交，`git commit -F <msg文件> -- <paths>`，**不 push**
- [ ] 13.12 更新 `openspec/changes/four-mode-workspace/` 状态并做结构自检（本机无 openspec CLI）