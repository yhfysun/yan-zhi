## ADDED Requirements

### Requirement: 最小触控区域
系统 SHALL 确保所有可交互元素在移动端断点上的最小触控区域为 44×44px。

#### Scenario: 按钮触控区域
- **WHEN** 视口宽度 < 768px
- **THEN** 所有 `.el-button`、`.nav-item`、`.conv-item`、`.agent-item` 等交互元素的 CSS `min-height` 和 `min-width` 均 ≥ 44px

#### Scenario: 图标按钮触控区域
- **WHEN** 图标按钮（如 24px 图标）在移动端断点上
- **THEN** 其实际点击区域通过 padding 扩展到至少 44×44px

### Requirement: 长按消息操作菜单
系统 SHALL 在移动端断点通过长按（≥ 500ms）消息弹出操作菜单，替代桌面端的 hover 显示操作按钮。

#### Scenario: 长按触发操作菜单
- **WHEN** 用户在消息气泡上长按 ≥ 500ms 且未移动手指超过 10px
- **THEN** 弹出上下文菜单显示：复制、编辑、删除、折叠等操作

#### Scenario: 长按取消
- **WHEN** 用户在 500ms 内抬起手指或移动超过 10px
- **THEN** 不弹出上下文菜单

#### Scenario: 桌面端 hover 操作不变
- **WHEN** 视口宽度 ≥ 768px
- **THEN** 消息操作按钮仍通过 hover 显示（保持原有行为）

### Requirement: Swipe 关闭手势
系统 SHALL 支持在移动端通过左滑手势关闭侧边抽屉。

#### Scenario: 左滑关闭抽屉
- **WHEN** 用户在展开的侧边抽屉上向左滑动超过 80px
- **THEN** 抽屉自动关闭

### Requirement: Pull-to-Refresh 会话列表
系统 SHALL 在移动端断点支持下拉刷新会话列表。

#### Scenario: 下拉触发刷新
- **WHEN** 用户在会话列表顶部向下滑动超过 60px
- **THEN** 显示刷新指示器并触发 `store.loadConversations()`

#### Scenario: 不在顶部时下拉不触发
- **WHEN** 会话列表已滚动离开顶部
- **THEN** 下拉行为不触发刷新
