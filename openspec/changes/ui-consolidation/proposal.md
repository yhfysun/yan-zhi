# 为什么

`optimize-page-layout`、`optimize-mobile-responsiveness`、`fix-layout-regressions` 三个 active 变更围绕“导航去哪”产生了互相冲突的布局方向：一个把桌面左栏改成右上菜单，一个把移动端改成底部 TabBar 和抽屉，另一个再修复前两者造成的回退。三者同时存在导致实际 UI 反复横跳，也破坏 specs 基线对布局行为的锚定。

本变更把三个变更的有效内容合并成一个 coherent 方向，并将稳定后的响应式规则写回 specs。

# 改什么

- 确定三端导航形态：
  - Electron 桌面端：保留可折叠的 220px 带标签左侧栏，不恢复右上角菜单实验。
  - Web 宽屏：保留 52px 图标 dock。
  - 移动端：底部 TabBar，聊天页使用自身 topbar，不重复渲染 App 层 mobile topbar。
- 将 `.main-content` 在 Web 宽屏下的左右留白统一为对称的 52px。
- 把桌面端卡片网格最小列宽统一到 320px 以上，避免卡片过窄。
- 修复桌面端新增按钮退化为无文字圆钮的问题；移动端通过 `.fab-add` 只在 `max-width: 767px` 转成 48px FAB。
- 将移动端全宽弹窗覆盖从全局 `.el-dialog` 收窄到内容型弹窗。

# 影响

- `packages/ui/src/App.vue`：响应式 padding、FAB 样式、选择性全宽弹窗。
- `packages/ui/src/views/Mcp.vue`：新增服务按钮恢复文字。
- `packages/ui/src/views/ToolMarket.vue`：卡片网格列宽恢复。
- 不改动路由、Store、API 与数据流。

# 与旧变更的关系

- `optimize-page-layout` 的“桌面右上角菜单”方向被本方案明确否决。
- `optimize-mobile-responsiveness` 的移动端 TabBar/抽屉方向被保留并精修。
- `fix-layout-regressions` 的按钮文字、弹窗范围、网格列宽、间距对称修复被纳入本方案。
- 本方案归档前，三个旧 active 变更保留为历史记录，不物理删除其有效内容。
