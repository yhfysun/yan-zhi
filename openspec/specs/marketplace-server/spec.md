# Marketplace Server Specification

## Purpose

定义言智作为商城服务端暴露标准化 Marketplace API、控制内容可见性与访问权限，以及连接其他言智节点的能力。

## Requirements

### Requirement: 商城 API 暴露
系统 SHALL 作为商城服务端，暴露标准化 Marketplace API 供其他言智节点连接。

#### Scenario: 注册为服务端
- **WHEN** 用户在设置中开启“作为商城服务端”
- **THEN** 系统启动 `/api/marketplace/*` 路由

#### Scenario: 本地内容对外暴露
- **WHEN** 外部节点请求对应的 tools、skills 或 agents 列表接口
- **THEN** 系统返回本节点已标记为公开的内容

### Requirement: 内容可见性控制
系统 SHALL 支持控制哪些本地内容对外部商城请求可见。

#### Scenario: 默认私有
- **WHEN** 用户创建新的工具、Skill 或智能体
- **THEN** 该内容默认为私有，不在商城 API 中暴露

### Requirement: 访问权限控制
系统 SHALL 支持无认证、Bearer Token 和 API Key 三种商城访问方式。

#### Scenario: Bearer Token 认证
- **WHEN** 商城设置为 bearer 且配置了 token
- **THEN** 外部请求需携带正确的 Authorization 头，否则返回 401

### Requirement: 跨节点连接
系统 SHALL 支持将其他言智节点添加为远程商城源，连接后自动拉取其公开内容。

#### Scenario: 节点间协议握手
- **WHEN** 系统连接远程言智节点
- **THEN** 系统发送 `GET /api/marketplace` 并验证返回的名称与版本
