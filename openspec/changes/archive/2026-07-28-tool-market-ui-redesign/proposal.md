## Why

当前工具管理页面（`ToolMarket.vue`）使用 4 个 Tab（MCP 服务/内置工具/自定义工具/同源商城）组织内容，结构割裂、层级混乱——内置工具和自定义工具本应属于同一"本地工具集"却被拆成两个 Tab，"同源商城"概念与整个应用的 Skill 商城/智能体商城命名不统一。且已有独立的 MCP 管理页面（`Mcp.vue`），ToolMarket 中又冗余了一份 MCP 服务列表。整体缺乏清晰的 IA（信息架构），视觉效果单调。

## What Changes

- **重构页面结构**：从 4 个 Tab 简化为两个清晰的并列区块——"MCP 服务"和"商城"
- **MCP 服务区**：精简版卡片列表，点击可跳转到 `/mcp` 进行完整管理（复用已有的 Mcp.vue）
- **商城区改为卡片式布局**：每个商城是一个独立卡片（本地商城 + N 个远程商城），一目了然
- **本地商城（默认内置）**：集成所有内置工具 + 自定义工具，在此才能新增自定义工具
- **远程商城卡片**：可新增远程商城源，每个远程源作为一个卡片展示，点击进入可浏览/安装远程工具
- **统一命名**：将"同源商城"概念统一为"工具商城"，与 Skill 商城、智能体商城保持命名一致
- **整体 UI 优化**：使用玻璃态卡片 + 圆角标签 + 更好的间距和层次，匹配现有设计系统

## Capabilities

### New Capabilities
- `tool-market-ia-restructure`: 重构工具管理页面信息架构，从多 Tab 切换改为按功能分区的一体化布局

### Modified Capabilities
<!-- No existing spec-level behavior is being changed -->

## Impact

- **修改文件**：
  - `packages/ui/src/views/ToolMarket.vue` — 核心重构，页面结构、模板、样式全部改写
  - `packages/ui/src/router/index.ts` — 移除重复的 `/tools` 路由定义
- **不变文件**：
  - `packages/ui/src/stores/tools.ts` — Store 逻辑保持不变
  - `packages/ui/src/views/Mcp.vue` — 独立页面保持不变，ToolMarket 中的 MCP 区只做轻量展示+跳转
  - `packages/shared/src/types/marketplace.ts` — 类型定义不变
- **最低风险**：纯 UI 重构，不涉及后端 API、数据库 Schema、业务逻辑变更
