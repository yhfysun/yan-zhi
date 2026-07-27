## ADDED Requirements

### Requirement: CSS variable system
项目 SHALL 定义完整的三层 CSS 变量体系：基色（--blue-500 等）、语义色（--color-primary、--color-success、--color-warning、--color-danger）、组件 token（--shadow-sm/md/lg、--radius-sm/md/lg/xl），并在全局 `:root` 中声明。

#### Scenario: Consistent color usage
- **WHEN** 任意组件需要使用主题色
- **THEN** 使用 `var(--color-primary)` 而非硬编码 `#3B82F6`

### Requirement: Page transition animation
路由页面切换 SHALL 包含微位移效果。进入页面从下方 4px 淡入，离开页面向下方 4px 淡出，持续时间 0.2s。

#### Scenario: Navigate between pages
- **WHEN** 用户从聊天页切换到模型平台页
- **THEN** 旧页面 fade-out + 向下 4px，新页面 fade-in + 从下方 4px 归位
- **AND** 动画持续时间不超过 0.2s

### Requirement: Skeleton loading for list pages
模型平台、MCP 服务、Skill 商店、智能体页面 SHALL 在数据加载期间显示骨架屏（el-skeleton），而非空白区域。

#### Scenario: Page loading state
- **WHEN** 用户首次打开模型平台页面且数据尚未返回
- **THEN** 页面显示骨架卡片（3-4 个占位矩形）
- **AND** 数据加载完成后骨架屏消失

### Requirement: Toast notification position
所有 ElMessage 通知 SHALL 显示在页面右上角（top: 60px 以下），不遮挡 topbar 导航区。

#### Scenario: Show success message
- **WHEN** 操作成功触发 ElMessage.success()
- **THEN** 通知出现在右上角而非默认顶部居中

### Requirement: Welcome card quick actions
聊天页欢迎卡片 SHALL 展示 3-4 个示例问题按钮，点击后自动填入输入框。示例问题包括："帮我写一段 Python 代码"、"解释什么是机器学习"、"帮我分析这个项目的结构"。

#### Scenario: Click example question
- **WHEN** 用户点击欢迎卡片中的示例问题按钮
- **THEN** 问题文本填入输入框，光标聚焦
