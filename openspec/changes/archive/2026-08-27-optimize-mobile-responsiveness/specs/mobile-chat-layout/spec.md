## ADDED Requirements

### Requirement: 聊天侧边栏抽屉化
系统 SHALL 在移动端断点（视口 < 768px）将聊天页 280px 侧边栏改为从左滑入的全屏抽屉。

#### Scenario: 移动端侧边栏默认隐藏
- **WHEN** 视口宽度 < 768px 且未触发侧边栏
- **THEN** 聊天侧边栏不可见，对话内容区域占满屏幕宽度

#### Scenario: 汉堡菜单触发侧边栏
- **WHEN** 用户点击聊天页左上角汉堡菜单图标
- **THEN** 侧边栏以抽屉形式从左侧滑入，覆盖半透明遮罩层

#### Scenario: 遮罩层关闭侧边栏
- **WHEN** 用户点击侧边栏外的遮罩层
- **THEN** 侧边栏自动关闭（滑出）

### Requirement: 文件面板 Sheet 化
系统 SHALL 在移动端断点将右侧文件管理面板改为从底部弹出的 Sheet。

#### Scenario: 移动端文件面板触发
- **WHEN** 用户在小屏上点击"文件管理"按钮
- **THEN** 文件面板从底部滑入，占据 60vh 高度

#### Scenario: Sheet 关闭手势
- **WHEN** 用户在文件面板 Sheet 上向下滑动 50px 以上
- **THEN** Sheet 自动关闭（向下滑出）

#### Scenario: 桌面端文件面板保持不变
- **WHEN** 视口宽度 ≥ 768px
- **THEN** 文件面板仍以右侧边栏形式展示

### Requirement: 消息区域响应式
系统 SHALL 根据视口宽度调整消息区域的布局和间距。

#### Scenario: 移动端消息 padding
- **WHEN** 视口宽度 < 576px
- **THEN** 消息区域 padding 缩小为 `12px 8px`

#### Scenario: 移动端消息气泡占满宽度
- **WHEN** 视口宽度 < 576px
- **THEN** 消息气泡 `max-width` 调整为 `90vw`（用户消息）和 `95vw`（AI 消息）

### Requirement: 输入工具栏响应式
系统 SHALL 在移动端断点将输入工具栏部分按钮收入"更多"折叠菜单。

#### Scenario: 移动端工具栏折叠
- **WHEN** 视口宽度 < 576px
- **THEN** 输入工具栏仅显示：发送按钮 + 模型选择器 + "更多"按钮；文件上传、MCP 工具、Skill、工作目录等按钮收入"更多"弹出菜单

#### Scenario: 桌面端工具栏完整显示
- **WHEN** 视口宽度 ≥ 768px
- **THEN** 所有输入工具栏按钮完整显示

### Requirement: 页面内容区适配底部 TabBar
系统 SHALL 在移动端断点对 `.main-content` 添加底部 margin-left 调整 + 底部 padding 以适配 TabBar。

#### Scenario: 移动端内容区底部留白
- **WHEN** 视口宽度 < 768px
- **THEN** `.main-content` 底部 padding 增加 56px（TabBar 高度）+ safe-area-inset-bottom
