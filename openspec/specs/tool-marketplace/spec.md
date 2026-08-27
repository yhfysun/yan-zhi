# Tool Marketplace Specification

## Purpose

定义本地工具商城的浏览与管理、自定义工具的创建编辑删除，以及远程工具商城的连接和浏览行为。

## Requirements

### Requirement: 本地工具商城
系统 SHALL 提供本地工具商城，包含内置工具和自定义工具。

#### Scenario: 查看内置工具列表
- **WHEN** 用户进入工具商城页面
- **THEN** 系统展示内置工具的名称、描述和输入参数 Schema

#### Scenario: 启用/禁用工具
- **WHEN** 用户切换工具启用开关
- **THEN** ToolRegistry 即时同步状态，禁用时 LLM 不可调用

### Requirement: 自定义工具管理
系统 SHALL 支持用户创建、编辑和删除自定义工具。

#### Scenario: 创建 JS 自定义工具
- **WHEN** 用户填写名称、描述、入参 Schema 和 JS 代码并保存
- **THEN** 系统验证语法后存储并注册到 ToolRegistry

#### Scenario: 删除自定义工具
- **WHEN** 用户删除自定义工具
- **THEN** 系统从数据库和 ToolRegistry 移除该工具

### Requirement: 远程工具商城
系统 SHALL 支持添加远程工具商城源，并浏览远程工具列表。

#### Scenario: 添加远程工具源
- **WHEN** 用户填写远程商城 URL 和认证信息
- **THEN** 系统验证端点可用性后保存配置

#### Scenario: 远程源连接失败
- **WHEN** 远程商城不可达或认证失败
- **THEN** 系统在 UI 中将该源标记为不可用并显示最后成功同步时间
