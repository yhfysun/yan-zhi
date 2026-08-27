## 1. 响应式断点体系搭建

- [x] 1.1 在 `App.vue` 的 `:root` 中添加 5 级断点 CSS 变量（`--bp-xs` 到 `--bp-xl`、`--is-mobile`）
- [x] 1.2 创建 `packages/ui/src/composables/useIsMobile.ts`，基于 `window.matchMedia('(max-width: 767px)')` 返回响应式 ref
- [x] 1.3 在 `App.vue` 全局样式中添加流体尺寸 clamp()——根字体、页面内边距、卡片间距
- [x] 1.4 在 `App.vue` 全局样式中添加 `@media (max-width: 767px)` 全局覆盖：`.main-content { margin-left: 0; padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)); }`

## 2. 底部 TabBar 导航

- [x] 2.1 在 `SideNav.vue` 中使用 `useIsMobile()` 添加底部 TabBar 渲染分支（v-if）
- [x] 2.2 实现 TabBar 样式：固定底部、56px 高、Safe Area 适配、横向排列的 6 个图标 + 文字标签
- [x] 2.3 TabBar 激活态：主题色高亮 + 顶部 2px 指示线
- [x] 2.4 确保桌面端侧边栏行为完全不变（大屏时 TabBar `display: none`）
- [x] 2.5 在 `App.vue` 添加移动端顶部固定栏（TopBar），包含页面标题和右侧用户头像入口

## 3. 聊天页面移动端布局

- [x] 3.1 在 `Chat.vue` 中使用 `useIsMobile()` 控制侧边栏模式切换
- [x] 3.2 小屏：侧边栏改为 `el-drawer` 从左侧滑入，添加汉堡菜单按钮在 TopBar 左侧
- [x] 3.3 小屏：文件管理面板改为底部 Sheet（transform translateY + backdrop），从底部滑入 60vh
- [x] 3.4 Sheet 面板添加关闭手势：`@touchstart` / `@touchmove` / `@touchend` 检测下滑 50px+
- [x] 3.5 小屏消息区域样式：padding `12px 8px`，消息气泡 max-width `90vw`/`95vw`
- [x] 3.6 小屏输入工具栏折叠：除发送按钮和模型选择器外，其余收入"更多"弹出菜单
- [x] 3.7 折叠按钮添加 `@media (hover: none)` 使其在移动端始终可见

## 4. 各页面响应式优化

- [x] 4.1 `Models.vue`：`.platform-grid` 改为 `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`；小屏单列
- [x] 4.2 `Mcp.vue`：`.card-grid` 同 Models 流体网格；`.page-top` 小屏垂直布局
- [x] 4.3 `Agents.vue`：`.marketplace-grid` 小屏单列纵向排列；`.agent-list` 列表项间距适配
- [x] 4.4 `Settings.vue`：`el-form` label 宽度响应式；tab 标签小屏横向滚动
- [x] 4.5 `Login.vue`：`.auth-card` 小屏去掉固定宽度，`border-radius` 归零，占满全屏高度
- [x] 4.6 `ToolMarket.vue`：`.page-top` + `.section-header` 小屏垂直布局
- [x] 4.7 `AgentCanvas.vue`：Canvas 区域小屏全宽，工具面板收入底部 Sheet
- [x] 4.8 `skill-market/*.vue`：三个子页面卡片布局流体适配
- [x] 5.1 全局 CSS：`@media (max-width: 767px)` 所有交互元素 `min-height: 44px; min-width: 44px`
- [x] 5.2 在 `Chat.vue` 中实现长按检测 composable `useLongPress`：touchstart → 500ms timer → 弹出上下文菜单
- [x] 5.3 长按菜单显示的消息操作：复制、编辑、删除、折叠
- [x] 5.4 侧边抽屉添加左滑关闭手势
- [x] 5.5 会话列表添加 pull-to-refresh：`@touchstart`/`@touchmove`/`@touchend`，下拉 60px+ 触发 `loadConversations()`
- [x] 5.6 桌面端 hover 行为保持不变
- [x] 6.1 在 `App.vue` 全局样式中：`@media (max-width: 575px)` `.el-dialog` 全屏
- [x] 6.2 大型 Dialog（如 MCP 工具挂载弹窗）：小屏底部 Sheet，85vh 高度，顶部圆角
- [x] 6.3 `.el-form-item` 小屏：label `width: 100%`，input 占满宽度
- [x] 6.4 `.el-select-dropdown` 小屏：`max-height: 50vh`
- [x] 6.5 `.el-message`（toast 通知）小屏位置调整为顶部居中

## 5. 触控手势 & 交互优化

- [ ] 5.1 全局 CSS：`@media (max-width: 767px)` 所有交互元素 `min-height: 44px; min-width: 44px`
- [ ] 5.2 在 `Chat.vue` 中实现长按检测 composable `useLongPress`：touchstart → 500ms timer → 弹出上下文菜单
- [ ] 5.3 长按菜单显示的消息操作：复制、编辑、删除、折叠
- [ ] 5.4 侧边抽屉添加左滑关闭手势
- [ ] 5.5 会话列表添加 pull-to-refresh：`@touchstart`/`@touchmove`/`@touchend`，下拉 60px+ 触发 `loadConversations()`
- [ ] 5.6 桌面端 hover 行为保持不变

## 6. Element Plus 全局覆盖

- [ ] 6.1 在 `App.vue` 全局样式中：`@media (max-width: 575px)` `.el-dialog` 全屏（`width: 100vw!important; height: 100vh!important; border-radius: 0; max-height: 100vh`）
- [ ] 6.2 大型 Dialog（如 MCP 工具挂载弹窗）：小屏底部 Sheet，85vh 高度，顶部圆角
- [ ] 6.3 `.el-form-item` 小屏：label `width: 100%`，input 占满宽度
- [ ] 6.4 `.el-select-dropdown` 小屏：`max-height: 50vh`
- [ ] 6.5 `.el-message`（toast 通知）小屏位置调整为 `top: 0; left: 50%; transform: translateX(-50%)`，避免遮挡输入区域

## 7. 验证与测试

- [ ] 7.1 在 Chrome DevTools 中使用各主流设备预设（iPhone SE/12/15、Pixel 7、iPad）走查所有页面 *(需手动验证)*
- [ ] 7.2 验证桌面端（≥1200px 视口）所有页面布局与改动前完全一致 *(需手动验证)*
- [ ] 7.3 在 `apps/mobile` 中执行 `pnpm dev` 并在真机/模拟器上测试 *(需手动验证)*
- [ ] 7.4 验证 iOS Safe Area 在底部 TabBar 和 Sheet 上的表现 *(需手动验证)*
- [ ] 7.5 验证长按菜单在 iOS Safari 和 Android Chrome 上的功能正常 *(需手动验证)*
