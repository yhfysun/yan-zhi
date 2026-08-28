# 1. 信息架构与导航（含 /home 处置）

- [x] 1.1 读 `SideNav.vue` 三态实现，将导航源从 13 项改为 5 项（对话/聊天/知识库/浏览器/设置），移除 `/home` 项
- [x] 1.2 **移除 Web 宽屏 dock 的 `/browser`、`/mcp` 过滤**（`SideNav.vue:58-60`），确保 Web 桌面端也精确显示 5 项（含浏览器）
- [x] 1.3 统一 `/chat` 标签为「对话」（当前 `SideNav.vue:159` 标签写「聊天」、tabLabel 写「对话」，消除混淆）
- [x] 1.4 `router/index.ts` 根 `/` 重定向由 `/home` 改为 `/chat`；`/home` 路由保留为门户口令（非默认落地页）
- [x] 1.5 **新增 `/chat-hub` 路由并挂载 `ChatHub.vue`**（当前无此路由定义，`grep ChatHub` 无命中；否则「聊天」项 `.3 指向会悬空）
- [x] 1.6 `Home.vue` 入口卡片由 10 项收敛为 5 项导航 + 2 设置分组一致（去掉指向 `/models /tools /skills /distill /agents /mcp` 的设置内页卡片，`Home.vue:134-145`），其「设置」卡改为打开抽屉
- [x] 1.7 移动端 TabBar 同步收敛为 5 项（复用现有 mobileMore 抽屉机制）
- [x] 1.8 「设置」项改为打开 `SettingsDrawer` 而非路由跳转

# 2. 对话页重皮肤（复用 decompose-chat-view 组件）

- [x] 2.1 `ChatTopbar` 加 model 药丸（在线点 + 推理增强下拉），移除任何 IM 模式切换
- [x] 2.2 新增 `ChatContextSidebar`（可折叠）：展示已挂载知识/技能/工具
- [x] 2.3 `[tool_call]` 渲染为内联旋转芯片，不在正文堆叠
- [x] 2.4 composer 玻璃态 + 知识/技能/工具快捷挂载 chip
- [x] 2.5 流式打字指示器样式

# 3. 聊天入口占位（第一批）

- [x] 3.1 新建 `ChatHub.vue` 占位面板：「IM 中枢即将上线」+「去 设置 → IM 连接 绑定账号」引导，**不渲染 IM 会话 UI、不调 AI**
- [x] 3.2 导航「聊天」项指向 `/chat-hub`（占位），完整中枢留待 `im-hub-and-oauth`

# 4. 设置抽屉骨架（解决双重标题）

- [x] 4.1 新建 `SettingsDrawer.vue`：左侧子导航 + 右侧面板 + 抽屉统一标题栏（面板名 + 主操作位）
- [x] 4.2 面板复用：`Models / Mcp / ToolMarket / skill-market / SkillDistill / Agents / 节点 / Connections`
- [x] 4.3 抽屉容器对面板内 `.page-header` 隐藏（`display:none`），主操作上移到抽屉标题栏
- [x] 4.4 各面板 `.page` 滚动区改为 `height:100%` 独立滚动，避免双重顶栏/整页滚动
- [x] 4.5 逐视图处理路由参数、列表高度、组件生命周期（Models/Mcp/ToolMarket/SkillDistill/Agents 至少 5 个）
- [x] 4.6 处理与现有 `Settings.vue`（`el-tabs`，`Settings.vue:4`）的关系：抽屉内设「通用/数据」分栏容纳其既有配置，避免功能回归；原 `/settings` 路由保留为抽屉深链或收敛
- [x] 4.7 设置子导航「聊天」面板：第一批仅显示「IM 中枢即将上线」提示（OAuth 授权按钮留待 `im-hub-and-oauth`）

# 5. 主题（沿用现有语义，仅翻转默认）

- [x] 5.1 `settings.ts` 的 `DEFAULT_SETTINGS.darkMode` 由 `false` 改为 `true`（保留 `applyDarkMode` / keyring 持久化，不改 localStorage 口径）
- [x] 5.2 桌面主题按钮宿主落 `apps/desktop/src/components/TitleBar.vue`（`window-controls` 左侧，`TitleBar.vue:18`）；共享壳 `packages/ui/src/App.vue` 不加桌面顶栏
- [x] 5.3 按钮调用 `applyDarkMode()` + `update({ darkMode })`，持久化走 keyring
- [x] 5.4 在现有 `[data-theme="dark"]` 块内补 Element Plus `--el-*` 覆盖变量，保证暗色弹窗一致
- [x] 5.5 Web 宽屏主题按钮宿主**定死**：放 Web dock 底部（`SideNav` Web dock 底部加按钮）——因为共享 `App.vue` 宽屏无 topbar（`App.vue:21` 仅 `isMobile`）；移动端放 `mobile-topbar-actions`

# 6. 验证

- [x] 6.1 `npx openspec validate --all`
- [ ] 6.2 `pnpm --filter @yan-zhi/ui typecheck`
- [ ] 6.3 `agent-browser` 截图核验：导航(5 项无 /home)/对话页/聊天占位/设置抽屉(9 面板无双重标题)/主题切换(默认暗)
- [ ] 6.4 三端（Electron/Web/移动）手动走查无重叠、无双重顶栏、无无文字按钮
