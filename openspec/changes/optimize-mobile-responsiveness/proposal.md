## Why

当前 UI 包 (`packages/ui`) 完全没有移动端适配——所有布局使用固定的 px 值，无任何 `@media` 查询、无响应式断点、无触控优化。侧边导航栏（52px）+ 聊天侧边栏（280px）双层结构在小屏幕上会挤占全部内容空间。目前 `apps/mobile` 虽然通过 Capacitor 打包为原生应用，但复用的是同一套 UI 包，移动端体验与桌面端完全一致（即：在小屏幕上严重变形和不可用）。现在是做移动端适配的关键时机——已经有 mobile app 产物，只需要优化 UI 层即可让所有端受益。

## What Changes

### 响应式布局系统
- 建立 4 级断点体系：`xs (<576)`, `sm (576-768)`, `md (768-992)`, `lg (992-1200)`, `xl (>1200)`
- 在 `App.vue` 根节点添加 CSS 自定义属性驱动的响应式断点变量
- 全局滚动条/字体大小/间距使用 `clamp()` 实现流体缩放

### 侧边导航栏移动端适配
- `SideNav.vue`：小屏（<768px）自动切换为底部 TabBar 导航（类似移动端常见底部导航栏）
- 大屏保持现有左侧 icon 导航栏样式不变
- 底部导航栏支持滑动切换、凸起中心按钮

### 聊天页面移动端重构
- 侧边栏（280px）：小屏变为全屏遮罩层（抽屉式），通过左上角汉堡菜单触发
- 消息区域 padding 响应式缩小，消息气泡在小屏上占满宽度
- 输入工具栏：小屏时部分按钮收入"更多"菜单，模型/智能体选择器缩小
- 文件面板：小屏变为底部 Sheet 弹出层代替右侧面板
- 对话折叠按钮始终可见但小屏位置调整

### 各页面响应式优化
- **Models.vue**：grid 布局从固定列数改为 `auto-fit minmax()`，卡片在小屏上全宽
- **Mcp.vue**：同 Models，card-grid 适配小屏
- **Agents.vue**：商城卡片导航在小屏上纵向排列
- **Settings.vue**：form 标签宽度 + 布局响应式调整
- **Login.vue**：登录卡片在小屏上去掉固定宽度，填满屏幕
- **ToolMarket.vue**：搜索栏 + 卡片列表响应式
- **Skills.vue**：子页面卡片布局流体适配
- **AgentCanvas.vue**：Canvas 画布在小屏上简化

### 触控 & 手势优化
- 所有可点击元素最小触控区域 44×44px（WCAG 标准）
- 添加 swipe 手势关闭侧边栏/Sheet
- 长按消息弹出操作菜单（替代 hover 显示操作按钮）
- pull-to-refresh 支持（下拉刷新会话列表）

### Element Plus 全局覆盖
- 全局覆盖 `.el-dialog` 在小屏上为全屏/底部 Sheet 模式
- `.el-form-item` 标签在小屏上换行显示（label 在上，input 在下）
- `.el-table` 在小屏上切换为卡片列表模式
- Select/Picker 弹出层适配小屏高度

## Capabilities

### New Capabilities
- `responsive-breakpoints`: 响应式断点系统和 CSS 变量体系，定义 xs/sm/md/lg/xl 五级断点及对应的媒体查询 mixins
- `mobile-navigation`: 移动端底部 TabBar 导航组件，替代侧边栏在小屏上的展示
- `mobile-chat-layout`: 聊天页移动端布局——抽屉式侧边栏、底部 Sheet 文件面板、响应式消息区域
- `touch-gestures`: 触控手势支持——swipe 关闭、长按菜单、触控最小区域保障、pull-to-refresh
- `responsive-components`: 通用组件的响应式行为——dialog 全屏、form 标签换行、table 转卡片

### Modified Capabilities
- (无现有 spec 级别的需求变更——本次改动为 UI 层面的增强，不影响已有的 `topbar-navigation`、`file-panel` 等 spec 行为)

## Impact

- `packages/ui/src/App.vue` — 添加响应式断点 CSS 变量、全局移动端覆盖样式
- `packages/ui/src/components/SideNav.vue` — 新增底部 TabBar 模式，使用 v-model/media query 切换
- `packages/ui/src/views/Chat.vue` — 侧边栏抽屉化、文件面板 Sheet 化、消息/输入区响应式
- `packages/ui/src/views/Models.vue` — grid 流体布局
- `packages/ui/src/views/Mcp.vue` — grid 流体布局
- `packages/ui/src/views/Agents.vue` — 商城卡片响应式、本地智能体列表适配
- `packages/ui/src/views/Settings.vue` — form 布局响应式
- `packages/ui/src/views/Login.vue` — 登录卡片全屏化
- `packages/ui/src/views/ToolMarket.vue` — 搜索/卡片响应式
- `packages/ui/src/views/AgentCanvas.vue` — Canvas 小屏简化
- `packages/ui/src/views/skill-market/*.vue` — 技能商城子页面响应式
- `apps/mobile` — 可能需启用原生安全区域、状态栏适配
- 所有现有功能逻辑不变；路由结构不变；Store 不变；API 不变
