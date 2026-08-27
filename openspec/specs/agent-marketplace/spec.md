# Agent Marketplace Specification

## Purpose

定义本地与远程智能体商城的浏览、创建、复制、搜索及节点间复制协议，作为言智智能体分发的基础能力。

## Requirements

### Requirement: 本地智能体商城
系统 SHALL 提供本地智能体商城，展示和管理所有本地创建的智能体。

#### Scenario: 浏览本地智能体
- **WHEN** 用户进入智能体商城页面
- **THEN** 系统以卡片列表展示名称、描述、头像和创建时间

#### Scenario: 创建本地智能体
- **WHEN** 用户填写名称、描述和工作流定义并保存
- **THEN** 智能体写入数据库并在本地商城展示

### Requirement: 远程智能体商城
系统 SHALL 支持添加远程智能体商城源，并浏览、分页和搜索远程智能体。

#### Scenario: 添加远程商城
- **WHEN** 用户填写远程 URL 和认证信息并保存
- **THEN** 系统验证端点可用性后保存远程源配置

#### Scenario: 搜索远程智能体
- **WHEN** 用户在远程商城中输入关键词
- **THEN** 系统调用搜索接口并展示结果

### Requirement: 远程智能体复制到本地
系统 SHALL 支持将远程智能体复制到本地商城。

#### Scenario: 复制远程智能体
- **WHEN** 用户点击远程智能体的“复制到本地”
- **THEN** 系统获取完整数据并写入本地数据库

### Requirement: Agent Marketplace Protocol
系统 SHALL 定义智能体商城的 REST API，支持分页、详情和搜索三个端点。

#### Scenario: 分页列表接口
- **WHEN** 发起 `GET /api/marketplace/agents?page=1&pageSize=20`
- **THEN** 返回包含 items、total、page 和 pageSize 的成功响应

#### Scenario: 搜索接口
- **WHEN** 发起 `POST /api/marketplace/agents/search`
- **THEN** 返回匹配智能体的分页列表
