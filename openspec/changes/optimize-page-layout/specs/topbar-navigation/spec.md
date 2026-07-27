## ADDED Requirements

### Requirement: Topbar navigation menu
系统 SHALL 在页面右上角显示一个圆形图标按钮，点击后展示下拉菜单，包含与原左侧导航栏一致的菜单项（聊天、模型平台、MCP 服务、Skill 商店、智能体、设置）。当前激活的路由对应的菜单项 SHALL 高亮显示。

#### Scenario: Click menu icon to open dropdown
- **WHEN** 用户点击右上角菜单圆形图标
- **THEN** 系统显示下拉菜单面板，包含 6 个菜单项
- **AND** 当前路由对应的菜单项高亮显示

#### Scenario: Navigate via menu item
- **WHEN** 用户点击下拉菜单中的任一菜单项
- **THEN** 系统导航到对应路由
- **AND** 下拉面板关闭

#### Scenario: Menu visible on all non-login pages
- **WHEN** 用户在登录页以外的任何页面
- **THEN** 右上角菜单图标可见且可交互

### Requirement: User avatar in topbar
系统 SHALL 在右上角（菜单图标右侧）显示一个圆形用户头像按钮。未登录时显示默认头像图标；已登录时显示用户名首字。点击后弹出下拉，未登录时显示"登录"选项，已登录时显示用户名和"退出登录"选项。

#### Scenario: Click avatar when logged out
- **WHEN** 用户未登录且点击右上角头像圆钮
- **THEN** 系统显示下拉，包含"登录"选项
- **AND** 点击"登录"跳转到 /login 页面

#### Scenario: Click avatar when logged in
- **WHEN** 用户已登录且点击右上角头像圆钮
- **THEN** 系统显示下拉，包含用户名信息和"退出登录"选项
- **AND** 点击"退出登录"执行登出操作

### Requirement: Topbar visual style
Topbar SHALL 具备半透明毛玻璃效果（backdrop-filter: blur），与项目现有的 glass 设计语言一致。两个圆形按钮 SHALL 使用 36px 直径，间距 8px，位于页面右上角距边缘 16px 处。

#### Scenario: Topbar appearance
- **WHEN** 页面渲染完成
- **THEN** 右上角显示两个 36px 圆形按钮（菜单 + 头像）
- **AND** 按钮具有毛玻璃半透明背景和圆角边框
