## Why

当前项目 AI 助手平台存在两个核心问题：1) 接口工具全部塞入提示词，随 API 模块增多会膨胀失控；2) 智能体只有 DAG 工作流一种模式，必须连线设计——但大部分场景只需要给智能体挂载工具/Skill/子智能体，让它自主决策即可（类似 Claude Code 的 harness 模式）。

## What Changes

### 1. 渐进式接口工具（按模块暴露）
- 新增内置工具 `get_api_tools`，接收模块名称枚举参数，返回该模块下所有接口的 name/description/inputSchema
- 按业务模块组织接口定义，LLM 按需查询，实现渐进式发现

### 2. 智能体双模式
- **Harness 模式**（默认）：标准智能体，挂载工具（内置/自定义/MCP）、Skill、子智能体即可使用。大模型在 ReAct 循环中自主推理、调用工具、决策下一步动作，无需连线设计
- **Workflow 模式**（高级）：DAG 画布连线编排，需要精确控制流程时使用。节点包括 LLM/工具/代码/条件/循环/子智能体/记忆/输入/输出

### 3. Harness 智能体挂载体系
- **五大挂载维度**：内置工具、自定义工具、MCP 工具、Skill、子智能体
- **挂载粒度**：MCP 工具支持 server 级全选或 tool 级细选；内置/自定义工具按 tool 级；Skill 按单个；子智能体按单个
- **会话合并**：智能体挂载作为基线，会话层面可临时追加，生效时取并集
- **System Prompt 构造**：根据挂载内容生成"可用工具 / 可用 Skills / 可调用子智能体"描述段
- 全挂则三段都有；只挂工具则只有工具段；只挂子智能体则只有子智能体段

### 4. Workflow 模式（保持现有，扩展工具来源）
- DAG 画布连线不变
- 工具节点支持内置/自定义工具（不仅是 MCP）

## Capabilities

### New Capabilities
- `api-tools-by-module`: 按模块渐进式暴露接口工具，通过 `get_api_tools` 内置工具实现
- `agent-dual-mode`: 智能体双模式——Harness（默认，挂载即用）+ Workflow（DAG 连线编排）

### Modified Capabilities
<!-- None -->

## Impact

- **packages/core/src/tool/builtin/**: 新增 `get_api_tools` + `api-tools/` 模块目录
- **packages/shared/src/types/index.ts**: Agent 增加 `type` 字段（`"harness"` | `"workflow"`）+ 挂载字段
- **packages/ui/src/components/AgentEditDialog.vue**: 模式选择 + Harness 挂载配置区
- **packages/ui/src/stores/agent.ts**: 智能体 store 支持模式和新字段
- **packages/ui/src/stores/chat.ts**: `buildSystemPrompt()` 合并挂载
- **packages/ui/src/views/AgentCanvas.vue**: Harness 显示挂载面板，Workflow 显示 DAG 画布
- **packages/core/src/workflow/nodes.ts**: ToolNodeHandler 扩展内置/自定义工具
- **数据库 migration**: agent 表增加 `type` 和挂载字段
