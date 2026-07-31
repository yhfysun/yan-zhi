## 1. 桌面端按钮文字恢复

- [ ] 1.1 `Models.vue`: 去掉 `circle` 属性，添加"新增平台"文字，保留 `fab-add` class
- [ ] 1.2 `Agents.vue`: 去掉 `circle` 属性，添加"新建智能体"文字，保留 `fab-add` class
- [ ] 1.3 `ToolMarket.vue`: 三个按钮（新增 MCP 服务、新增远程商城、新增工具）去掉 `circle`，恢复文字标签，保留 `fab-add` class

## 2. Chat 页面布局修复

- [ ] 2.1 `App.vue`: Chat 路由时隐藏 `mobile-topbar`（`v-if="isMobile && route.name !== 'chat'"`）
- [ ] 2.2 `Chat.vue`: 用户消息和智能体消息 max-width 统一为 90% 验证（已完成）
- [ ] 2.3 `Chat.vue`: 移动端确保 hamburger 按钮在 topbar 左侧可见

## 3. 卡片网格列宽回调

- [ ] 3.1 `Models.vue`: `.platform-grid` minmax 从 280px 恢复到 320px
- [ ] 3.2 `Agents.vue`: `.marketplace-grid` 和 `.agent-grid` minmax 恢复到 320px

## 4. Dialog 精准覆盖

- [ ] 4.1 `App.vue`: 移除全局 `.el-dialog { width: 92vw !important }` 覆盖
- [ ] 4.2 `App.vue`: 将 dialog 全宽样式限定为 `.mount-dialog .el-dialog` / `.skill-mount-dialog .el-dialog` / `.snapshot-dialog .el-dialog` / `.agent-edit-dialog .el-dialog`（在 575px 断点下）
- [ ] 4.3 `App.vue`: 小屏 `el-form-item` 垂直布局保持不变（确认工作正常）

## 5. 桌面端间距对称

- [ ] 5.1 `App.vue`: `.page` 流体 padding 修正，桌面端确保左右对称（使用固定 px 值而非 clamp）
- [ ] 5.2 `App.vue`: 桌面端 `.main-content` 增加右侧对称 margin 或使用居中方案

## 6. AgentEditDialog 代码格式化

- [ ] 6.1 `AgentEditDialog.vue`: 恢复模板中合理的多行格式（编辑区 section 换行），不影响功能
- [ ] 6.2 `AgentEditDialog.vue`: script setup 部分恢复合理的换行，不压缩为单行

## 7. 验证

- [ ] 7.1 Chrome DevTools 桌面端（1920px / 1440px / 1024px）走查所有页面按钮和布局
- [ ] 7.2 Chrome DevTools 移动端（iPhone SE / iPhone 12 / Pixel 7）走查所有页面
- [ ] 7.3 确认桌面端没有任何视觉回退——按钮有文字、卡片宽度合理、间距对称
- [ ] 7.4 确认移动端 TabBar 不遮挡内容、TopBar 在 Chat 页不重复、FAB 位置合理
