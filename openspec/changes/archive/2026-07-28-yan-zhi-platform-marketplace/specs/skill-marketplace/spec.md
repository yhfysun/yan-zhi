## ADDED Requirements

### Requirement: 本地 Skill 商城
系统 SHALL 提供本地 Skill 商城，统一管理内置 Skill 和用户自建 Skill。

#### Scenario: 浏览本地 Skill
- **WHEN** 用户进入 Skill 商城页面
- **THEN** 系统以卡片网格展示所有本地 Skill，区分"系统内置"和"自定义"标签

#### Scenario: 查看 Skill 详情
- **WHEN** 用户点击某个 Skill 卡片
- **THEN** 系统展示 Skill 的 frontmatter 元数据和 body 内容（Markdown 渲染）

#### Scenario: 启用/禁用 Skill
- **WHEN** 用户切换 Skill 的启用开关
- **THEN** 系统更新该 Skill 在会话中的可用状态

### Requirement: 远程 Skill 商城
系统 SHALL 支持添加远程 Skill 商城源，自动拉取远程 Skill 列表和详情。

#### Scenario: 添加远程 Skill 商城
- **WHEN** 用户填写远程商城 URL、认证类型和凭证并保存
- **THEN** 系统验证端点可用性后保存远程源配置

#### Scenario: 分页拉取远程 Skill 列表
- **WHEN** 用户浏览远程 Skill 商城
- **THEN** 系统调用 `GET /api/marketplace/skills?page=1&pageSize=20` 获取分页列表

#### Scenario: 搜索远程 Skill
- **WHEN** 用户在远程商城中输入搜索关键词
- **THEN** 系统调用 `POST /api/marketplace/skills/search` 并展示搜索结果

#### Scenario: 获取远程 Skill 分类
- **WHEN** 远程商城加载分类侧栏
- **THEN** 系统调用 `GET /api/marketplace/skills/categories` 获取分类列表

### Requirement: 远程 Skill 下载到本地
系统 SHALL 支持将远程商城中的 Skill 复制到本地商城。

#### Scenario: 下载远程 Skill
- **WHEN** 用户点击远程 Skill 的"安装"按钮
- **THEN** 系统从远程获取 Skill 完整数据（frontmatter + body），写入本地数据库并标记 source 为 "remote"

#### Scenario: 已安装检测
- **WHEN** 用户尝试安装已存在于本地的 Skill
- **THEN** 系统提示"已安装"，提供"覆盖更新"选项

### Requirement: Skill Marketplace Protocol
系统 SHALL 定义标准化的 Skill 商城 REST API 协议，支持分页、详情、搜索、分类四个端点。

#### Scenario: 分页列表接口
- **WHEN** 发起 `GET /api/marketplace/skills?page=1&pageSize=20&category=数据分析`
- **THEN** 返回 `{ success: true, data: { items: [...], total, page, pageSize } }` 格式

#### Scenario: 详情接口
- **WHEN** 发起 `GET /api/marketplace/skills/:id`
- **THEN** 返回 `{ success: true, data: { id, name, description, frontmatter, body, ... } }`

#### Scenario: 搜索接口
- **WHEN** 发起 `POST /api/marketplace/skills/search` body `{ query: "Excel" }`
- **THEN** 返回匹配的 Skill 分页列表

#### Scenario: 分类接口
- **WHEN** 发起 `GET /api/marketplace/skills/categories`
- **THEN** 返回 `{ success: true, data: ["数据分析", "写作", "编程", ...] }`
