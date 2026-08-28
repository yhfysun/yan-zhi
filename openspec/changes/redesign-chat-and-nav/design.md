# Context

yan-zhi 的 `packages/ui` 已具备：
- `SideNav.vue` 三态导航（Electron 左栏 / Web dock / 移动 TabBar），但项是扁平 13 个，且含 `/home`（`SideNav.vue:158`）。
- `decompose-chat-view` 已将 `Chat.vue`（原 3695 行）拆为 `components/chat/*` + `composables/chat/useChat.ts`，逻辑已迁移、可重皮肤。
- `merge-tools-mcp` 已将 MCP 管理合并进 `Mcp.vue`，`ToolMarket.vue` 只读引用 `McpServerPicker`。
- 现有 IM 相关路由 `/peers`（节点间轮询发消息，无应用自有会话列表，`Peers.vue:174`）、`/connections`（连接器配置 + 一次性发消息，`Connections.vue:5`）——**均不是完整 IM 中枢**，故聊天页完整能力放第二批 `im-hub-and-oauth`。
- 主题系统现状（**与初版设计相反，必须沿用**）：`App.vue` 的 `:root` 是亮色变量，`[data-theme="dark"]` 才覆盖为暗色（`App.vue:177,235`）；`settings.ts` 的 `darkMode` 默认 `false`，`applyDarkMode(false)` 把 `data-theme` 设为 `light`（`settings.ts:20,136`）；持久化走 `adapter.keyring`（**非** localStorage，`settings.ts:100,113`）。
- 桌面端 `App.vue` 只有移动端 `mobile-topbar`，主内容区**没有全局 actions 位**（`App.vue:21`）；桌面真实壳是 `apps/desktop/src/App.vue`，其顶栏是 `apps/desktop/src/components/TitleBar.vue`（`TitleBar.vue:18` window-controls）。故桌面主题按钮宿主在 desktop TitleBar，非共享壳。
- 现有 `Settings.vue` 是 `el-tabs` 形式设置页（`Settings.vue:4`），本批需定其与新抽屉的关系。
- `Home.vue` 保留 10 项入口卡片（`Home.vue:134-145`），其中 7 项指向要收进设置的页面。

「乱」的根因不是功能多，而是 13 项扁平无层级 + 对话/聊天概念混淆 + 重叠入口。本变更（第一批）只改**组织与皮肤**，不改底层数据流/Store/API/后端。

> 参考视觉稿：`mockup-nav-chat.html`（同目录，可交互 HTML）——含 5 项导航壳、对话页重皮肤、聊天页内置/微信/飞书三模式、设置抽屉 9 面板、亮暗主题切换。视觉稿的「聊天三模式 / IM 授权流」属第二批范围，本批仅对齐其导航壳、对话皮肤、设置骨架、主题观感。

# Goals / Non-Goals

**Goals:**

- 主导航收敛为 5 项，原 8 类配置入口收进设置抽屉子导航；`/home` 移除、根重定向到 `/chat`。
- 对话页（LLM）重皮肤：model 药丸 + 上下文栏 + 工具调用芯片 + 打字指示器。
- 聊天入口在主导航保留，但第一批仅占位（提示去设置绑定），不构建 IM 会话 UI。
- 设置抽屉骨架：复用现有视图为面板，且**解决双重标题**问题。
- 主题默认暗色 + 可切换（沿用现有 `[data-theme="dark"]` 语义，仅翻转默认）。

**Non-Goals（本批）:**

- 不重写 `useChat` 业务逻辑（仅加展示层）。
- **不新增任何后端接口**（IM 收发与 OAuth 依赖第二批 `im-hub-and-oauth` 建设）。
- 不构建 IM 会话列表 / 微信飞书 OAuth 授权流 / BrowserPanel 回调拦截（均属第二批）。
- 不改动各整页视图的业务逻辑，只改变其「从主导航暴露」为「在设置抽屉内呈现」并处理标题/滚动。

# Decisions

## 1. 信息架构：5 项导航 + 设置子导航（移除 /home）

采纳「核心功能留导航、配置收设置」。主导航 5 项：`对话 / 聊天 / 知识库 / 浏览器 / 设置`。「设置」点击打开抽屉（非路由）。抽屉内左侧子导航 9 项对应原 8 类配置 + 聊天面板。

`/home` 处置：**从主导航移除**，`router/index.ts` 根 `/` 重定向由 `/home` 改为 `/chat`（对话）；`Home.vue` 文件暂保留（去导航+改重定向后不再作为落地页，后续可删，本批不动其实现）。

## 2. 对话页（LLM）皮肤

顶栏只放 model 药丸（在线点 + 推理增强下拉），**不放**微信/飞书切换。右侧可折叠上下文栏展示已挂载知识/技能/工具。`[tool_call]` 以旋转态内联芯片呈现，不堆正文。底部 composer 玻璃态 + 知识/技能/工具快捷挂载 chip。复用 `components/chat/*` 与 `useChat`，仅加展示层。

## 3. 聊天入口（第一批占位）

主导航保留「聊天」项，第一批新建 `ChatHub.vue` 仅作**占位面板**：展示「IM 中枢即将上线」+「去 设置 → IM 连接 绑定账号」引导，**不渲染任何 IM 会话 UI、不调用 AI**。完整内置/微信/飞书三模式 IM 中枢在 `im-hub-and-oauth` 实现（届时需新增 IM 会话数据模型与 API，`/peers`/`/connections` 不足承载）。

## 4. 设置抽屉（解决双重标题 + 与现有 Settings 并存）

`SettingsDrawer.vue` = 左侧子导航 + 右侧面板 + **抽屉统一标题栏**（显示当前面板名 + 该面板主操作位）。面板复用现有视图：

**与现有 `Settings.vue`（`el-tabs`）的关系（本批决策）**：现有 `Settings.vue` 承载主题色/数据/商城等配置（`Settings.vue:4`），不可直接废弃。本批以 `SettingsDrawer` 作为主导航「设置」入口宿主，抽屉内设「通用/数据」分栏容纳原 `Settings.vue` 既有配置项（或将其降级为抽屉内一个面板），避免功能回归；原 `/settings` 路由保留或收敛为抽屉的深层链接。

**双重标题处理**：现有 Models/Mcp/ToolMarket/SkillDistill/Agents 均自带 `page-header`/`page-title`（`grep` 确认），抽屉容器对其 `.page-header` 设 `display:none`，并将各视图主操作上移到抽屉标题栏；面板自身 `.page` 滚动区改 `height:100%` 独立滚动。此改造为真实工作量，在 tasks 逐视图列出路由参数/列表高度/生命周期。

## 5. 主题（沿用现有语义，仅翻转默认 + 桌面 TitleBar 宿主）

**保留 `App.vue` 现有 `:root`(亮) + `[data-theme="dark"]`(暗) 变量体系，不引入反向 `:root`(暗)+`[data-theme="light"]` 方案**（初版设计的反向方案与现状相反、会触发全量迁移，已否决）。本批只做两件事：
- 将 `settings.ts` 的 `DEFAULT_SETTINGS.darkMode` 由 `false` 改为 `true`（默认暗色）。
- **主题切换按钮宿主**：桌面端落在 `apps/desktop/src/components/TitleBar.vue`（桌面真实壳顶栏，`TitleBar.vue:18` window-controls 左侧加按钮）——**不是**共享 `packages/ui/src/App.vue`（其仅移动端有 `mobile-topbar`，非桌面顶栏宿主）；**Web 宽屏**放 Web dock 底部（`SideNav` Web dock 底部加按钮，因共享 `App.vue` 宽屏无 topbar，`App.vue:21` 仅 `isMobile`）；**移动端**放 `mobile-topbar-actions`。点击调用现有 `applyDarkMode()` 并 `update({ darkMode })`，持久化走 `adapter.keyring`（**不改 localStorage 口径**）。
- 暗色下 Element Plus 弹窗一致性：在现有 `[data-theme="dark"]` 块内补 `--el-*` 覆盖变量（如 `--el-bg-color` / `--el-fill-color`），不新建 `theme.css`。

## 6. /home 保留为门户口令 + 根重定向

`/home` 路由与 `Home.vue` **保留**（作为首启/未登录兜底门户），但**从主导航移除、不作为默认落地页**：根 `/` 重定向到 `/chat`（对话）。`Home.vue` 的 10 项入口卡收敛为与 5 项导航 + 2 设置分组一致（去掉 `models/tools/skills/distill/agents/mcp` 等 6 项指向设置内页的卡，`Home.vue:134-145`），其「设置」卡改为打开抽屉。

# Risks / Trade-offs

- **路由语义变更**：`/chat` 当前标签写「聊天」、tabLabel 写「对话」（`SideNav.vue:159`）——本批把其标签统一为「对话」，消除混淆；旧 `/home` 深链失效（可接受，非对外 URL）。
- **设置面板双重标题/滚动**：各整页视图自带 `page-header`（`grep` 确认 Models/Mcp/ToolMarket/SkillDistill/Agents 均有），塞抽屉必双重标题，按 Decision 4 处理，工作量需在 tasks 逐视图列出。
- **桌面端无全局顶栏**：主题按钮需新增桌面 action 位（Decision 5），若不想动 Electron 标题栏，可在 `app-body` 顶部加一条细 global bar 承载主题/用户菜单。
- **三端一致性**：移动端 TabBar 从 13 项重排为 5 项；「聊天」占位页在窄屏正常呈现。
- **视觉稿超出本批范围**：稿中「聊天三模式 / IM 授权流」属第二批，本批不实现，避免范围蔓延。

# 验证（仅方案阶段不执行，落地后执行）

- `npx openspec validate --all`
- `pnpm --filter @yan-zhi/ui typecheck`
- `agent-browser` 截图核验：新导航（5 项、无 /home）、对话页、聊天占位页、设置抽屉（9 面板、无双重标题）、主题切换（默认暗）、三端（Electron/Web/移动）无重叠/无双重顶栏/无无文字按钮。
