## ADDED Requirements

### Requirement: Dialog 全屏/Sheet 模式
系统 SHALL 在移动端断点将 Element Plus 的 `el-dialog` 覆盖为全屏或底部 Sheet 模式。

#### Scenario: 移动端 Dialog 全屏
- **WHEN** 视口宽度 < 576px 且 Dialog 宽度设定 ≤ 640px
- **THEN** Dialog 占满全屏，无圆角，关闭按钮移至左上角

#### Scenario: 移动端大型 Dialog 底部 Sheet
- **WHEN** 视口宽度 < 576px 且 Dialog 高度 > 60vh（如 MCP 工具挂载弹窗）
- **THEN** Dialog 表现为底部 Sheet，从底部滑入，占 85vh

#### Scenario: 桌面端 Dialog 保持原样
- **WHEN** 视口宽度 ≥ 768px
- **THEN** Dialog 行为与当前完全一致

### Requirement: Form 标签响应式布局
系统 SHALL 在移动端断点将 Element Plus 的 `el-form-item` 标签从水平布局切换为垂直布局。

#### Scenario: 移动端表单标签在上
- **WHEN** 视口宽度 < 576px
- **THEN** `.el-form-item` 的 label 显示在 input 上方（占满宽度），而非左侧

#### Scenario: 移动端表单 label 宽度自适应
- **WHEN** 视口宽度 < 576px
- **THEN** 全局覆盖 `.el-form-item__label` 的 `width` 为 `100%`

### Requirement: 卡片网格流体布局
系统 SHALL 将固定的卡片网格列数改为 CSS Grid `auto-fit minmax()` 流体布局。

#### Scenario: 小屏卡片全宽
- **WHEN** 视口宽度 < 576px
- **THEN** 卡片网格为单列（`grid-template-columns: 1fr`）

#### Scenario: 中屏两列
- **WHEN** 600px ≤ 视口宽度 < 992px
- **THEN** 卡片网格为两列（`repeat(auto-fill, minmax(280px, 1fr))`）

#### Scenario: 大屏多列
- **WHEN** 视口宽度 ≥ 992px
- **THEN** 卡片网格保持当前固定列数布局

### Requirement: Select 弹出层小屏适配
系统 SHALL 在移动端断点调整 Element Plus Select/Picker 弹出层的最大高度。

#### Scenario: 小屏 Select 弹出层高度限制
- **WHEN** 视口宽度 < 576px 且 Select 下拉选项 > 6 项
- **THEN** 弹出层最大高度为 50vh，内容可滚动

### Requirement: 页面卡片/内容区域通用响应式
系统 SHALL 对所有页面提供通用的响应式间距/对齐样式。

#### Scenario: 页面标题区域响应式
- **WHEN** 视口宽度 < 576px
- **THEN** `.page-header`/`.page-top` 从水平布局切换为垂直布局（标题在上，操作按钮在下），间距缩小

#### Scenario: 托盘区域（消息通知）位置调整
- **WHEN** 视口宽度 < 576px
- **THEN** Element Plus 的 `ElMessage`（toast 通知）从顶部居中显示，避免遮挡输入区域
