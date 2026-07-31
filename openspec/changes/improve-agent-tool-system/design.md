## Context

当前系统只有一种智能体模式——DAG 工作流，用户必须在画布上连线编排节点。但大多数场景下用户只想给智能体配一组工具和子智能体，让它自己决定怎么干（跟 Claude Code 的 harness 一样）。

本次设计引入**双模式**：`harness`（默认，挂载即用）+ `workflow`（DAG 连线编排，高级场景）。

## Goals / Non-Goals

**Goals:**
1. 智能体分两种类型：`harness`（默认）和 `workflow`
2. Harness 智能体支持挂载：内置工具、自定义工具、MCP 工具、Skill、子智能体
3. 挂载与 Chat 会话中的临时追加取并集
4. `buildSystemPrompt()` 根据合并挂载生成描述段
5. 实现 `get_api_tools` 渐进式接口工具
6. Workflow 的工具节点扩展支持内置/自定义工具

**Non-Goals:**
- 不改变 MCP 协议和 LLM 调用核心流程
- Workflow 不做挂载概念（工具来自画布节点）
- 不做远程智能体的挂载同步

## Decisions

### 1. 智能体双模式

**决定**：`Agent.type = "harness" | "workflow"`，默认为 `"harness"`。

| 模式 | 编排方式 | 配置入口 | 工具来源 |
|------|----------|----------|----------|
| Harness（默认） | 自由挂载，大模型自主决策 | 编辑表单 / Canvas 挂载面板 | 挂载配置 |
| Workflow | DAG 画布连线 | AgentCanvas 画布 | 画布节点选择 |

新建智能体默认就是 Harness 模式——填名字、描述、系统提示词、选模型、挂载工具/Skill/子智能体，保存即用。

### 2. Harness 执行流程

```
用户消息 → buildSystemPrompt() → 合并智能体挂载 + 会话挂载 →
构造 prompt + tools → LLM ReAct 循环（think → tool_call → result → ...）→ 回复
```

### 3. Harness 挂载数据模型

agent 表新增字段（TEXT/JSON，默认 NULL）：

| 字段 | 含义 | 示例 |
|------|------|------|
| `type` | 智能体类型 | `"harness"`（默认）或 `"workflow"` |
| `builtin_tool_ids` | 内置工具名列表 | `["file_read", "get_api_tools"]` |
| `custom_tool_ids` | 自定义工具 ID 列表 | `["ct_abc"]` |
| `mcp_tool_mounts` | MCP 工具挂载 | `[{"serverId":"x","toolName":"*"}]`（`*`=全选） |
| `skill_ids` | Skill ID 列表 | `["sk_001"]` |
| `sub_agent_ids` | 子智能体 ID 列表 | `["a_xyz"]` |

Workflow 智能体不需要这些字段，工具来自画布节点。

### 4. 挂载合并策略

Harness 智能体挂载为基线，会话可临时追加，取并集：

```
- harness 模式 → 智能体挂载 ∪ 会话临时挂载
- workflow 模式 → 忽略挂载字段，仅用会话临时挂载
- MCP server "*" 全选覆盖细粒度
```

### 5. System Prompt 构建（Harness）

```
[智能体 systemPrompt]

## 可用工具
- `file_read`: 读取文件内容
- `get_api_tools`: 查询指定模块下的 API 接口列表
...

## 可用 Skills（激活方式：说出 skill 名称即可获取完整能力）
- **代码审查**: 对项目代码进行质量审查
...

## 可调用子智能体
- **翻译助手**: 多语言翻译
```

无工具 → 不输出工具段；无子智能体 → 不输出子智能体段。

### 6. `get_api_tools` 模块化 API 工具

```
packages/core/src/tool/builtin/api-tools/
├── index.ts          # createApiToolRegistry() → Map<moduleName, ToolDef[]>
├── agent.ts
├── conversation.ts
├── platform.ts
├── mcp.ts
├── skill.ts
├── marketplace.ts
├── workspace.ts
└── memory.ts
```

`get_api_tools({ module: "agent" })` → 返回 agent 模块接口工具定义。`module: "list"` → 返回所有模块名。

### 7. UI

**AgentEditDialog**：
- "智能体类型"切换：Harness（默认）/ Workflow
- Harness → 显示挂载配置 section（工具/Skill/子智能体 tab）
- Workflow → 隐藏挂载区，提示进入画布编辑

**AgentCanvas**：
- Harness → 挂载配置面板（不显示 DAG 画布）
- Workflow → 现有 DAG 画布

### 8. Workflow 工具节点扩展

`ToolNodeHandler` 增加 `config.toolSource`：`"mcp"`（默认）| `"builtin"` | `"custom"`。

## Risks / Trade-offs

- 两套 prompt 构建逻辑，但共享底层 `callLlm`
- JSON 字段无索引，但智能体量级有限
- API 工具需同步维护，建议 CI 检查
- MCP `*` 全选意味着新工具自动获得，是特性也是风险

## Migration Plan

1. agent 表加 `type`（默认 `"harness"`）+ 5 个挂载列，默认 NULL
2. 现有智能体 type=NULL → `"harness"`，挂载为空等同于现在行为
3. 用户编辑时可见挂载配置区
4. 无需回滚

## Open Questions
