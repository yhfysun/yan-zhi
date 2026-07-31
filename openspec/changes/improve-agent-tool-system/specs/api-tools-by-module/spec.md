## ADDED Requirements

### Requirement: get_api_tools 内置工具注册
系统 SHALL 注册一个名为 `get_api_tools` 的内置工具，注册到 `ToolRegistry` 中。

#### Scenario: 工具基础注册
- **WHEN** 系统启动并初始化 `ToolRegistry`
- **THEN** `get_api_tools` 工具已注册且 `ToolRegistry.has('get_api_tools')` 返回 true

### Requirement: 按模块查询接口工具
`get_api_tools` 工具 SHALL 接收 `module` 参数（字符串枚举），返回该模块下所有 REST 接口的工具定义数组，每个包含 `name`、`description`、`inputSchema` 字段。

#### Scenario: 查询 agent 模块
- **WHEN** LLM 调用 `get_api_tools({ module: "agent" })`
- **THEN** 返回 agent 模块所有接口的工具定义，包括 `api_agent_create`、`api_agent_update`、`api_agent_delete`、`api_agent_list`、`api_agent_get` 等

#### Scenario: 查询不存在的模块
- **WHEN** LLM 调用 `get_api_tools({ module: "unknown" })`
- **THEN** 返回 `isError: true`，提示模块不存在，列出可用模块名

#### Scenario: 模块名列表
- **WHEN** LLM 调用 `get_api_tools({ module: "list" })` 或不传 module 参数
- **THEN** 返回所有可用模块名称列表

### Requirement: 模块接口工具定义文件组织
每个模块的接口工具定义 SHALL 存放在独立文件中，由 index.ts 汇总注册。

#### Scenario: 新增模块
- **WHEN** 开发者在 `packages/core/src/tool/builtin/api-tools/` 下新增一个模块文件
- **THEN** 只需在 index.ts 中导入并注册，即可通过 `get_api_tools` 查询

### Requirement: 接口工具命名规范
所有通过 `get_api_tools` 暴露的接口工具 SHALL 使用 `api_<module>_<action>` 命名格式。

#### Scenario: 工具命名一致性
- **WHEN** 查询 agent 模块工具
- **THEN** 所有工具名以 `api_agent_` 为前缀
