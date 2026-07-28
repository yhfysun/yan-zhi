## Context

当前 `Agents.vue` 是智能体管理页面，使用 `el-tabs` 分为"本地"和"远程商城"两个 tab。本地 tab 展示智能体卡片网格，远程 tab 展示远程源列表+远程智能体安装。这种 tab 切换结构将两种不同概念（本地数据 vs 远程获取）混排在一个页面上，信息架构（IA）不够清晰。

`ToolMarket.vue` 和 `Skills.vue` 已完成各自的 `*-ui-redesign` 变更，采用了"商城卡片"驱动的一级入口+二级详情模式，`Agents.vue` 需要跟随此模式，保证三个商城的交互一致。

**约束**：
- `useAgentStore`（`agent.ts`）API 不变，仅消费现有接口
- 远程商城相关逻辑（`loadAgentRemoteSources`、`addAgentSource`、`browseAgentSource`、`installRemoteAgent` 等）从旧版复用
- 不新增后端 API
- 路由 `/agents` 保持不变

## Goals / Non-Goals

**Goals:**
- 移除 `el-tabs` 切换，改为商城卡片入口层 + 智能体列表层两级导航
- 本地商城卡片始终存在，点击进入所有智能体（内置+自定义）
- 仅本地商城视图提供"新建智能体"按钮
- 远程商城卡片可新增/管理，点击进入对应远程智能体浏览页
- 视觉风格与 `ToolMarket.vue`（tool-market-ui-redesign）和 `Skills.vue` 保持统一

**Non-Goals:**
- 不修改 `useAgentStore` 逻辑
- 不新增路由
- 不修改后端
- 不处理智能体画布（AgentCanvas）的 UI

## Decisions

### 1. 两级导航：商城卡片 → 智能体列表

不使用 `el-tabs`，改为页面级 `currentView` 状态变量（`'marketplace' | 'local-agents' | 'remote-agents'`）控制视图切换。

- `marketplace`（默认入口）：展示本地商城 + 远程商城卡片
- `local-agents`：点击本地商城卡片后进入，展示智能体网格
- `remote-agents`：点击某个远程商城卡片后进入，展示该远程源的智能体列表

**理由**：与 `ToolMarket.vue`、`Skills.vue` 重设计后的交互模式保持一致；每个商城是一张独立卡片，一目了然。

### 2. 本地商城卡片设计

卡片内容：
- 图标/头像：紫色渐变圆角方块 + 🏠 emoji
- 标题："本地智能体"
- 描述："管理内置智能体和自定义创建的智能体"
- 统计标签（右下角）：内置 X 个 | 自定义 Y 个
- "进入管理"按钮

点击整张卡片进入 `local-agents` 视图。

### 3. 远程商城卡片设计

每个远程源渲染一张独立卡片：
- 图标：🌐 emoji 或远程源首字
- 标题：远程源名称
- 描述：远程源 URL（等宽字体）
- 状态标签：连通/断开
- 操作按钮：浏览、测试、删除

底部新增"添加远程商城"卡片（虚线边框 + `+` 号），点击弹出远程源配置弹窗。

### 4. 本地智能体视图（local-agents）

复用现有智能体卡片网格布局，添加返回按钮和"新建智能体"入口。

### 5. 远程智能体视图（remote-agents）

展示该远程源下的智能体列表 + 返回按钮 + 安装按钮。复用现有 `browseAgentSource` 和 `installRemoteAgent` 逻辑。

### 6. 添加远程商城弹窗

复用现有 `el-dialog` 表单逻辑，无需改动。

## Risks / Trade-offs

- **状态切换复杂度**：从 Tab 的声明式切换变为手动 `currentView` 状态管理，需要正确重置浏览上下文（如切换远程源时清空 `remoteAgentItems`）
  → **缓解**：在视图切换函数中显式重置相关状态
- **单一文件增长**：所有视图逻辑都在 `Agents.vue` 一个文件中，可能超过 300 行
  → **缓解**：如后续需要可提取子组件，本次变更保持单文件以降低重构风险
