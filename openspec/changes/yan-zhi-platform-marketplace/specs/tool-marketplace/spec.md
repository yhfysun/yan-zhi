## ADDED Requirements

### Requirement: 本地工具商城
系统 SHALL 提供本地工具商城，包含内置工具和自定义工具两类。

#### Scenario: 查看内置工具列表
- **WHEN** 用户进入工具商城页面
- **THEN** 系统展示所有内置工具的卡片列表，包含工具名称、描述、输入参数 Schema

#### Scenario: 查看自定义工具列表
- **WHEN** 用户切换到"自定义工具"标签页
- **THEN** 系统展示用户创建的所有自定义工具，包含启用/禁用状态

#### Scenario: 启用/禁用工具
- **WHEN** 用户点击某个工具的启用/禁用开关
- **THEN** 系统的 ToolRegistry 即时同步该工具的状态，禁用时 LLM 不可调用

### Requirement: 自定义工具管理
系统 SHALL 支持用户创建、编辑、删除自定义工具。

#### Scenario: 创建 JS 自定义工具
- **WHEN** 用户填写工具名称、描述、入参 Schema、JS 代码并保存
- **THEN** 系统验证代码语法正确后存储到数据库，并注册到 ToolRegistry

#### Scenario: 编辑自定义工具
- **WHEN** 用户修改已有自定义工具的代码或配置并保存
- **THEN** 系统更新数据库并重新注册到 ToolRegistry

#### Scenario: 删除自定义工具
- **WHEN** 用户删除某个自定义工具
- **THEN** 系统从数据库和 ToolRegistry 中移除该工具

#### Scenario: 工具代码语法错误
- **WHEN** 用户保存包含语法错误的 JS 代码
- **THEN** 系统返回错误信息并拒绝保存

### Requirement: 远程工具商城
系统 SHALL 支持添加远程工具商城源，自动拉取远程工具列表。

#### Scenario: 添加远程工具源
- **WHEN** 用户填写远程商城 URL、认证信息并保存
- **THEN** 系统发起 GET 请求验证端点可用性，成功后保存配置

#### Scenario: 浏览远程工具列表
- **WHEN** 用户选择某个远程工具源
- **THEN** 系统调用远程 `/api/marketplace/tools` 接口，分页展示远程工具

#### Scenario: 远程源连接失败
- **WHEN** 远程商城不可达或认证失败
- **THEN** 系统在 UI 中标记该源为不可用状态，并显示最后成功同步时间
