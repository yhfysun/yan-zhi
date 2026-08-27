# Chat Toolification Specification

## Purpose

定义将模型平台、工具、Skill 和智能体管理操作注册为 LLM 工具的能力，使用户可通过自然语言完成管理任务。

## Requirements

### Requirement: 管理操作为 LLM 工具
系统 SHALL 将模型配置、工具管理、Skill 管理和智能体管理操作注册为 LLM 可调用的内置工具函数。

#### Scenario: 通过聊天配置模型平台
- **WHEN** 用户输入“添加一个 OpenAI 平台，URL 是 https://api.openai.com/v1”
- **THEN** LLM 调用 `add_platform` 并返回配置结果

#### Scenario: 通过聊天启用或禁用工具
- **WHEN** 用户输入“把 web_search 工具关掉”
- **THEN** LLM 调用 `disable_tool` 并禁用该工具

### Requirement: 管理工具函数注册
系统 SHALL 在应用启动时自动将管理工具函数注册到 ToolRegistry。

#### Scenario: 管理工具列表可见
- **WHEN** 用户打开聊天页面工具面板
- **THEN** 工具列表包含 list_platforms、add_platform 等管理工具

### Requirement: 管理工具的权限控制
系统 SHALL 对管理类工具函数执行权限校验。

#### Scenario: 未登录用户执行管理工具
- **WHEN** 未认证用户通过聊天触发管理工具
- **THEN** 系统返回权限错误且不执行操作
