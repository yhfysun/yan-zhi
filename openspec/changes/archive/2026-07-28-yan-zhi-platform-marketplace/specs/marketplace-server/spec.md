## ADDED Requirements

### Requirement: 商城 API 暴露
系统 SHALL 作为商城服务端，暴露标准化的 Marketplace API 供其他言智节点连接。

#### Scenario: 注册为服务端
- **WHEN** 用户在设置中开启"作为商城服务端"
- **THEN** 系统启动 `/api/marketplace/*` 路由，外部节点可通过该 URL 访问本节点的工具/Skill/智能体

#### Scenario: 本地工具对外暴露
- **WHEN** 外部节点请求 `GET /api/marketplace/tools`
- **THEN** 系统返回本节点已标记为"公开"的工具列表

#### Scenario: 本地 Skill 对外暴露
- **WHEN** 外部节点请求 `GET /api/marketplace/skills`
- **THEN** 系统返回本节点已标记为"公开"的 Skill 列表

#### Scenario: 本地智能体对外暴露
- **WHEN** 外部节点请求 `GET /api/marketplace/agents`
- **THEN** 系统返回本节点已标记为"公开"的智能体列表

### Requirement: 内容可见性控制
系统 SHALL 支持控制哪些本地内容对外部商城请求可见。

#### Scenario: 标记公开内容
- **WHEN** 用户编辑某个工具/Skill/智能体时勾选"公开"
- **THEN** 该内容在商城 API 中对其他节点可见

#### Scenario: 默认私有
- **WHEN** 用户创建新的工具/Skill/智能体时
- **THEN** 该内容默认为"私有"，不在商城 API 中暴露

### Requirement: 访问权限控制
系统 SHALL 支持配置商城服务端的访问权限。

#### Scenario: 无需认证访问
- **WHEN** 商城设置为 authType= 'none'
- **THEN** 外部节点可直接访问商城 API 无需凭证

#### Scenario: Bearer Token 认证
- **WHEN** 商城设置为 authType= 'bearer' 并配置 token
- **THEN** 外部节点需在请求头携带 `Authorization: Bearer <token>`，否则返回 401

#### Scenario: API Key 认证
- **WHEN** 商城设置为 authType= 'api-key' 并配置 apiKey
- **THEN** 外部节点需在请求头携带 `X-API-Key: <key>`，否则返回 401

### Requirement: 跨节点连接
系统 SHALL 支持将其他言智节点添加为远程商城源，连接后自动拉取其公开内容。

#### Scenario: 连接另一言智节点
- **WHEN** 用户添加远程商城源，URL 指向另一言智节点的 `/api/marketplace` 基础路径
- **THEN** 系统验证连接后自动拉取该节点的公开工具/Skill/智能体列表

#### Scenario: 节点间协议握手
- **WHEN** 系统连接远程言智节点
- **THEN** 系统发送 `GET /api/marketplace` 验证对方返回 `{ name: "言智", version: "0.1.0" }` 完成握手
