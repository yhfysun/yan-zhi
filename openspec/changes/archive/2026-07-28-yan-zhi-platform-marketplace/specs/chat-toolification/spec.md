## ADDED Requirements

### Requirement: 管理操作为 LLM 工具
系统 SHALL 将所有管理操作（模型配置、工具管理、Skill 管理、智能体管理）注册为 LLM 可调用的内置工具函数。

#### Scenario: 通过聊天配置模型平台
- **WHEN** 用户输入"帮我添加一个 OpenAI 平台，URL 是 https://api.openai.com/v1"
- **THEN** LLM 调用 `add_platform` 工具，传入参数 { name: "OpenAI", apiUrl: "https://api.openai.com/v1" }，系统完成配置并回复结果

#### Scenario: 通过聊天启用工具
- **WHEN** 用户输入"把 web_search 工具关掉"
- **THEN** LLM 调用 `disable_tool` 工具，传入参数 { name: "web_search" }，系统禁用该工具

#### Scenario: 通过聊天安装 Skill
- **WHEN** 用户输入"从远程商城安装那个 Excel 分析的 Skill"
- **THEN** LLM 先调用 `search_marketplace({ type: "skill", query: "Excel" })` 找到目标，再调用 `install_skill({ remoteId: "xxx" })` 完成安装

#### Scenario: 通过聊天创建智能体
- **WHEN** 用户输入"创建一个客服智能体，用 GPT-4o 模型"
- **THEN** LLM 调用 `create_agent({ name: "客服智能体", modelId: "gpt-4o" })`，系统创建并返回结果

### Requirement: 管理工具函数注册
系统 SHALL 在应用启动时自动注册所有管理工具函数到 ToolRegistry。

#### Scenario: 管理工具列表在聊天中可见
- **WHEN** 用户打开聊天页面的工具面板
- **THEN** 工具列表中包含所有管理类工具（list_platforms、add_platform 等），与 file_read、web_search 同列

### Requirement: 管理工具的权限控制
系统 SHALL 对管理类工具函数进行权限校验，防止未授权操作。

#### Scenario: 已登录用户执行管理工具
- **WHEN** 已认证用户通过聊天触发管理工具
- **THEN** 系统正常执行操作

#### Scenario: 未登录用户执行管理工具
- **WHEN** 未认证用户通过聊天触发管理工具
- **THEN** 系统返回权限错误，不执行操作
