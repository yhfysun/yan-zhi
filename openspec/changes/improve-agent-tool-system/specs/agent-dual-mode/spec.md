## ADDED Requirements

### Requirement: 智能体双模式类型
`Agent` 类型 SHALL 包含 `type` 字段，取值为 `"harness"` 或 `"workflow"`。默认值为 `"harness"`。

#### Scenario: 新建智能体默认为 Harness
- **WHEN** 用户新建智能体
- **THEN** `agent.type` 默认为 `"harness"`，编辑表单显示挂载配置区

#### Scenario: 旧智能体向后兼容
- **WHEN** 旧版本智能体 `type` 为 NULL
- **THEN** 系统视为 `"harness"`，挂载为空则行为与现在一致

#### Scenario: Workflow 智能体保持现有行为
- **WHEN** 智能体 `type` 为 `"workflow"`
- **THEN** 进入 AgentCanvas 显示 DAG 画布，可使用节点连线编排

### Requirement: Harness 智能体挂载数据字段
agent 表 SHALL 支持 `builtin_tool_ids`、`custom_tool_ids`、`mcp_tool_mounts`、`skill_ids`、`sub_agent_ids` 五个挂载字段（TEXT/JSON，默认 NULL）。

#### Scenario: Harness 配置挂载
- **WHEN** 用户给 Harness 智能体挂载 `file_read` 和 `get_api_tools`，子智能体"翻译助手"
- **THEN** `builtin_tool_ids` = `["file_read", "get_api_tools"]`，`sub_agent_ids` = `["a_translator"]`

#### Scenario: Workflow 智能体忽略挂载
- **WHEN** Workflow 智能体的挂载字段有值
- **THEN** system prompt 构建时忽略，工具来自画布节点

### Requirement: Harness 挂载配置 UI
AgentEditDialog SHALL 为 Harness 模式显示挂载配置 section。

#### Scenario: 模式切换显隐
- **WHEN** 用户切换类型为 Harness
- **THEN** 显示挂载配置 section；切到 Workflow 时隐藏

#### Scenario: 工具挂载
- **WHEN** 用户在挂载配置中选择"工具"tab
- **THEN** 显示内置工具 + 自定义工具 + MCP 工具（支持 server 全选或 tool 细选）

#### Scenario: 子智能体和 Skill 挂载
- **WHEN** 用户选择"子智能体"或"Skill"tab
- **THEN** 显示除自身外的智能体列表或已启用 Skill 列表，支持多选

### Requirement: Harness Canvas 挂载面板
Harness 智能体的 AgentCanvas 页面 SHALL 显示挂载配置面板而非 DAG 画布。

#### Scenario: 打开 Harness 智能体
- **WHEN** 用户进入 Harness 智能体的画布
- **THEN** 显示挂载配置面板，不显示流程图

### Requirement: 挂载合并取并集
Chat 中使用 Harness 智能体时，SHALL 将智能体挂载与会话临时挂载合并取并集。

#### Scenario: 智能体基线 + 会话追加
- **WHEN** Harness 智能体挂了 `file_read`，会话追加 `web_search`
- **THEN** LLM 获得两个工具

#### Scenario: MCP server 全选覆盖
- **WHEN** 智能体挂了 MCP server A 全部（`"*"`），会话选了 tool_x
- **THEN** 获得 server A 全部

#### Scenario: Workflow 忽略挂载
- **WHEN** Workflow 智能体
- **THEN** 只用会话级临时挂载

### Requirement: Harness System Prompt 构建
`buildSystemPrompt()` SHALL 按"可用工具 / 可用 Skills / 可调用子智能体"分节注入合并挂载。

#### Scenario: 全挂载
- **WHEN** 合并后有 3 工具、2 Skill、1 子智能体
- **THEN** 三段描述都在 system prompt 中

#### Scenario: 仅挂子智能体
- **WHEN** 合并后仅子智能体
- **THEN** 只有子智能体描述段

#### Scenario: 仅挂工具
- **WHEN** 合并后仅工具
- **THEN** 只有工具描述段

### Requirement: Workflow 工具节点扩展
Workflow 工具节点 SHALL 支持内置和自定义工具。

#### Scenario: 工具来源选择
- **WHEN** 画布加工具节点
- **THEN** 可选手动来源（MCP / 内置 / 自定义）

#### Scenario: 执行内置工具
- **WHEN** `config.toolSource: "builtin"`, `config.toolName: "file_read"`
- **THEN** 通过 `ToolRegistry.execute` 执行
