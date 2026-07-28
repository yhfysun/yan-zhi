## ADDED Requirements

### Requirement: 本地智能体商城
系统 SHALL 提供本地智能体商城，展示和管理所有本地创建的智能体。

#### Scenario: 浏览本地智能体
- **WHEN** 用户进入智能体商城页面
- **THEN** 系统以卡片列表展示所有本地智能体，显示名称、描述、头像、创建时间

#### Scenario: 创建智能体
- **WHEN** 用户点击"创建智能体"并填写名称、描述、工作流定义
- **THEN** 系统保存智能体到数据库并在本地商城中展示

#### Scenario: 删除本地智能体
- **WHEN** 用户删除某个本地智能体
- **THEN** 系统从数据库移除该智能体及其关联的工作流节点

### Requirement: 远程智能体商城
系统 SHALL 支持添加远程智能体商城源，浏览和搜索远程智能体。

#### Scenario: 添加远程智能体商城
- **WHEN** 用户填写远程商城 URL 和认证信息并保存
- **THEN** 系统验证端点可用性后保存远程源配置

#### Scenario: 分页拉取远程智能体列表
- **WHEN** 用户浏览远程智能体商城
- **THEN** 系统调用 `GET /api/marketplace/agents?page=1&pageSize=20` 获取分页列表

#### Scenario: 搜索远程智能体
- **WHEN** 用户在远程商城中输入搜索关键词
- **THEN** 系统调用 `POST /api/marketplace/agents/search` 并展示搜索结果

### Requirement: 远程智能体复制到本地
系统 SHALL 支持将远程商城中的智能体复制到本地商城。

#### Scenario: 复制远程智能体
- **WHEN** 用户点击远程智能体的"复制到本地"按钮
- **THEN** 系统获取远程智能体完整数据（含 workflow_json），写入本地数据库

#### Scenario: 本地智能体作为商品
- **WHEN** 用户编辑智能体时勾选"发布到商城"
- **THEN** 该智能体可通过本节点的商城 API 被其他节点发现和复制

### Requirement: Agent Marketplace Protocol
系统 SHALL 定义标准化的智能体商城 REST API 协议，支持分页、详情、搜索三个端点。

#### Scenario: 分页列表接口
- **WHEN** 发起 `GET /api/marketplace/agents?page=1&pageSize=20`
- **THEN** 返回 `{ success: true, data: { items: [...], total, page, pageSize } }`，每个 item 包含 id、name、description、avatar

#### Scenario: 详情接口
- **WHEN** 发起 `GET /api/marketplace/agents/:id`
- **THEN** 返回 `{ success: true, data: { id, name, description, avatar, workflow_json, inputs_schema_json, config_json, version, createdAt } }`

#### Scenario: 搜索接口
- **WHEN** 发起 `POST /api/marketplace/agents/search` body `{ query: "客服" }`
- **THEN** 返回匹配的智能体分页列表
