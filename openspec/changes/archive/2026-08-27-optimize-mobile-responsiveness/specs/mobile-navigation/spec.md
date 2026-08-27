## ADDED Requirements

### Requirement: 底部 TabBar 导航
系统 SHALL 在移动端断点（xs/sm，视口 < 768px）将侧边导航栏切换为底部 TabBar 导航。

底部 TabBar SHALL：
- 固定在视口底部，高度 56px + `env(safe-area-inset-bottom)`
- 包含与桌面侧边栏一致的 6 个导航项：聊天、模型平台、工具管理、Skill 商店、智能体、设置
- 当前激活的导航项高亮显示（主题色 + 顶部 2px 指示线）
- 每个导航项最小触控区域 44×44px

#### Scenario: 小屏切换到 TabBar
- **WHEN** 视口宽度 < 768px
- **THEN** 左侧纵向导航栏隐藏，底部横向 TabBar 显示

#### Scenario: 大屏显示侧边栏
- **WHEN** 视口宽度 ≥ 768px
- **THEN** 底部 TabBar 隐藏，左侧纵向导航栏显示

#### Scenario: TabBar 路由导航
- **WHEN** 用户点击 TabBar 上的"聊天"图标
- **THEN** 路由导航到 `/chat` 且该图标高亮

### Requirement: 用户入口适配
系统 SHALL 在移动端顶部固定栏中包含用户登录/退出入口。

#### Scenario: 移动端用户入口位置
- **WHEN** 在移动端断点且用户关注用户相关操作
- **THEN** 用户头像/登录入口显示在顶部固定栏右侧，而非底部 TabBar

### Requirement: Safe Area 适配
系统 SHALL 对底部 TabBar 和侧边栏内容区域预留 iOS Safe Area。

#### Scenario: iOS 设备底部 Safe Area
- **WHEN** 设备有底部安全区域（如 iPhone X 及以上）
- **THEN** 底部 TabBar 高度包含 `env(safe-area-inset-bottom)`
