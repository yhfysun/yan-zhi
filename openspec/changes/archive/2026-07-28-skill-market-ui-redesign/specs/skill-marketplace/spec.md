## MODIFIED Requirements

### Requirement: 本地 Skill 商城
系统 SHALL 提供本地 Skill 商城，统一管理内置 Skill 和用户自建 Skill。本地商城 SHALL 从商城首页点击进入，不再通过 Tab 切换访问。

#### Scenario: 浏览本地 Skill
- **WHEN** 用户从商城首页点击"本地商城"卡片
- **THEN** 系统导航到 `/skills/local`，以卡片网格展示所有内置 Skill 和自定义 Skill，区分"系统内置"和"自定义"标签

#### Scenario: 查看 Skill 详情
- **WHEN** 用户点击某个 Skill 卡片
- **THEN** 系统展示 Skill 的 frontmatter 元数据和 body 内容（Markdown 渲染）

#### Scenario: 启用/禁用 Skill
- **WHEN** 用户切换 Skill 的启用开关
- **THEN** 系统更新该 Skill 在会话中的可用状态

#### Scenario: 返回商城首页
- **WHEN** 用户在本地商城页面点击"返回"按钮
- **THEN** 系统导航回 `/skills` 卡片网格首页

### Requirement: 远程 Skill 商城
系统 SHALL 支持添加远程 Skill 商城源，每个远程源以独立卡片展示在商城首页，点击卡片进入该源的 Skill 浏览页面。

#### Scenario: 添加远程 Skill 商城
- **WHEN** 用户在商城首页点击"添加远程商城"卡片并填写 URL、认证类型和凭证后保存
- **THEN** 系统验证端点可用性后保存远程源配置，首页卡片网格自动刷新

#### Scenario: 远程商城卡片展示
- **WHEN** 用户访问商城首页
- **THEN** 每个远程商城源以独立卡片展示（名称、URL、操作按钮），排列在本地商城卡片之后

#### Scenario: 浏览远程商城 Skill 列表
- **WHEN** 用户点击远程商城卡片
- **THEN** 系统导航到 `/skills/remote-{sourceId}`，调用远程获取接口展示 Skill 列表

#### Scenario: 搜索远程 Skill
- **WHEN** 用户在远程商城页面的搜索框中输入关键词
- **THEN** 系统调用搜索接口并展示过滤后的 Skill 列表

#### Scenario: 获取远程 Skill 分类
- **WHEN** 远程商城页面加载
- **THEN** 系统获取该源支持的 Skill 分类列表用于筛选

### Requirement: 远程 Skill 下载到本地
系统 SHALL 支持将远程商城中的 Skill 复制到本地商城。

#### Scenario: 下载远程 Skill
- **WHEN** 用户在远程商城页面点击 Skill 的"安装到本地"按钮
- **THEN** 系统从远程获取 Skill 完整数据（frontmatter + body），写入本地数据库并标记 source 为 "remote"

#### Scenario: 已安装检测
- **WHEN** 用户尝试安装已存在于本地的 Skill
- **THEN** 系统提示"已安装"，提供"覆盖更新"选项

## REMOVED Requirements

### Requirement: Tab 切换交互
**Reason**: 使用卡片式商城首页布局替代 Tab 切换，提升 UI 直观性和可扩展性
**Migration**: 用户不再通过 Tab 切换，而是从商城首页点击卡片进入各商城详情。路由 `/skills` 为首页，`/skills/local` 和 `/skills/remote-{id}` 为各商城详情页。
