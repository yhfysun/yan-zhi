# 为什么

用户反馈「功能太多了、页面看起来比较凌乱」。经代码审查确认：桌面端主导航是 **13 个扁平无层级项**（`/home /chat /peers /connections /knowledge /browser /models /tools /skills /distill /agents /mcp /settings`），多个入口功能重叠（如 `/tools` 与 `/mcp` 都管 MCP），且「对话」与「聊天」概念混淆（当前 `/chat` 标签写「聊天」、tabLabel 写「对话」）。此前 `decompose-chat-view` / `merge-tools-mcp` / `ui-consolidation` 已做了结构拆分与布局固化，但都未触及**信息架构（IA）简化**——这正是「乱」的根因。

参考 Codex / Cherry Studio / WorkBuddy 等现代 AI 客户端的共识：**左侧只留核心用户功能，所有平台 / MCP / 工具 / Skill / 智能体配置收进设置**。

> 本变更（第一批）只做「导航收敛 + 对话页皮肤 + 设置抽屉骨架 + 主题默认暗色」。**IM 消息中枢与微信/飞书 OAuth 授权抽为独立变更 `im-hub-and-oauth`（第二批）**——因为现有后端 `im.ts` 仅有 connectors CRUD / 单发消息 / inbound webhook，无 OAuth 发起/回调/code 换 token/凭证持久化；服务层只有飞书/企业微信的 `tenant_access_token`（应用级，非用户 OAuth）；`BrowserPanel` 仅导航无回调拦截。这些能力需作为第二批独立建设，不能在本批以「不新增后端」为前提强塞。

# 改什么（第一批范围）

1. **主导航极简化**：从 13 项降到 5 项 —— `对话 / 聊天 / 知识库 / 浏览器 / 设置`。原 `/models /tools /skills /distill /agents /mcp /peers /connections` 全部收进「设置」抽屉的左侧子导航。**`/home` 处置（决策 3）**：`/home` 路由与 `Home.vue` 保留为门户口令（首启/未登录兜底），从主导航移除、**不再作为默认落地页**；根路由 `/` 重定向改到 `/chat`（`router/index.ts:5`），`Home.vue` 的入口卡片收敛对齐新 IA（`Home.vue:134-145` 现含 10 张卡，其中 7 张指向要收进设置的页面，需精简为 5 项 + 2 张设置分隔卡）。
2. **对话页重皮肤**（LLM 对话，复用 `decompose-chat-view` 组件）：顶栏 model 药丸（带在线点）+ 知识/技能/工具挂载入口；右侧可折叠「上下文栏」；`[tool_call]` 内联芯片；流式打字指示器。顶栏**不含**微信/飞书切换。
3. **聊天入口（第一批占位）**：主导航保留「聊天」项，但第一批仅渲染占位面板（提示「IM 中枢即将上线，先去 设置 → IM 连接 绑定账号」），**不构建 IM 会话 UI**。完整 IM 中枢（内置/微信/飞书）在 `im-hub-and-oauth` 实现。
4. **设置抽屉骨架（决策 4）**：左侧子导航 `模型平台 / 聊天 / MCP 服务 / 工具管理 / Skill 商店 / Skill 蒸馏 / 智能体 / 客户端节点 / IM 连接`；面板复用现有视图组件。**关键改造**：① 与现有 `Settings.vue`（`el-tabs` 形式，`Settings.vue:4`）**并存决策**——新抽屉作为主导航「设置」入口的宿主，原 `Settings.vue` tabs（主题色/数据/商城）降级为抽屉内「通用/数据」面板或废弃，本批先以抽屉容纳既有配置免回归；② 现有 `Models.vue / Mcp.vue / ToolMarket.vue / SkillDistill.vue / Agents.vue` 都自带 `page-header`/`page-title`（`grep` 确认），塞进抽屉会产生双重标题，需在抽屉内隐藏各视图自身顶栏并将主操作上移到抽屉标题栏。
5. **主题默认暗色 + 切换（修正方向 + 桌面宿主，决策 5）**：现有系统是 `:root` 亮色 + `[data-theme="dark"]` 覆盖（`App.vue:177,235`）、`darkMode` 默认 `false`（`settings.ts:20`）、持久化走 `adapter.keyring`（**非** localStorage，`settings.ts:100,113`）。**本批只把 `DEFAULT_SETTINGS.darkMode` 改为 `true`，保留 `[data-theme="dark"]` 语义，不引入反向变量方案**。**桌面端宿主**：主题切换按钮落在 `apps/desktop/src/components/TitleBar.vue`（桌面真实壳顶栏，`TitleBar.vue:18` 右侧 window-controls 后可加按钮），非共享 `packages/ui/src/App.vue`（该文件仅移动端有 `mobile-topbar` 且非桌面顶栏宿主，`App.vue:19`）；移动端在 `mobile-topbar-actions` 亦放置。

# 影响

- `packages/ui/src/components/SideNav.vue`：导航项降到 5 项；「设置」改为打开抽屉而非路由跳转；移除 `/home` 项。
- `packages/ui/src/router/index.ts`：根 `/` 重定向改到 `/chat`；`/home` 路由保留为门户口令，非默认落地页。
- `packages/ui/src/views/Home.vue`：入口卡片由 10 项收敛为与 5 项导航 + 2 设置分组一致的视图（去掉指向已收进设置页面的 7 项入口卡，`Home.vue:134-145`），其「设置」卡改为打开抽屉。
- `packages/ui/src/App.vue`：设置抽屉挂载点；对话页 model 药丸挂载点沿用现有 `ChatTopbar`；Web/移动端主题切换按钮（移动端 `mobile-topbar-actions`）；桌面主题按钮宿主实际在 `apps/desktop/src/components/TitleBar.vue`（见下）。
- `packages/ui/src/views/Chat.vue` + `components/chat/*`：重皮肤对话页（model 药丸、右侧上下文栏、`[tool_call]` 芯片、打字指示器）。
- `packages/ui/src/components/SettingsDrawer.vue`（新建）+ 面板容器：复用 `Models.vue / Mcp.vue / ToolMarket.vue / skill-market/* / SkillDistill.vue / Agents.vue`，并处理双重标题（隐藏视图自身 `page-header`，主操作上移抽屉标题栏）；容纳/替代现有 `Settings.vue`（`el-tabs`）既有配置。
- `packages/ui/src/views/ChatHub.vue`（新建，占位）：IM 中枢占位面板，仅提示去设置绑定。
- `packages/ui/src/stores/settings.ts`：仅把 `DEFAULT_SETTINGS.darkMode` 改为 `true`（持久化仍走 keyring，不改）。
- `apps/desktop/src/components/TitleBar.vue`：**桌面主题切换按钮的宿主**（桌面真实壳顶栏，在 `window-controls` 左侧加按钮，`TitleBar.vue:18`）。
- 本批**不新增任何后端接口、不新增 IM/OAuth 相关 store 字段**（这些在 `im-hub-and-oauth`）。

# 与旧变更的关系

- **`ui-consolidation`**：保留其三端响应式形态（Electron 可折叠左栏 / Web 52px dock / 移动端 TabBar）作为*渲染机制*；本变更将*导航项集合*从 13 收敛为 5 + 设置子导航。互补不冲突。
- **`decompose-chat-view`**：直接复用其 `components/chat/*` 与 `useChat`，在其上加重皮肤，不重复拆分。
- **`merge-tools-mcp`**：设置「MCP 服务」面板复用其 `Mcp.vue`。
- **`im-hub-and-oauth`**（第二批，新建）：承接本批抽出的 IM 中枢 UI + 微信/飞书 OAuth 授权（含后端 OAuth 接口、IM 会话数据模型、BrowserPanel 回调拦截）。
- **`web-platform-stubs` / `improve-agent-tool-system` / `shared-marketplace`**：不在范围。

# 所需 Skill 标注

- **`openspec`**（必需）：全部 proposal/design/tasks/spec 编写与 `openspec validate` 校验。
- **`agent-browser`**（必需，落地后）：对「新导航 / 对话页 / 聊天占位 / 设置抽屉（去双重标题）/ 主题切换」截图核验（本批不含 IM 授权流）。
- **`skill-creator`**（可选，落地后）：把「IA 极简化（核心功能留导航、配置收设置）」沉淀为可复用 Skill。
- ❌ **Makers 系列不适用**：yan-zhi 是 Electron + Capacitor 本地应用，不部署到 EdgeOne Makers。
