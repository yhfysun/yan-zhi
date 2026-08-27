# Context

三页均使用 `card-grid` / `marketplace-grid` 与各自实现的搜索、Tab、空态。`ToolMarket` 和 `Agents` 还有“本地/远程商城”子视图；`Skills` 分为本地 Skill 与远程 Skill 市场。业务差异保留，视觉壳可以共享。

# Goals / Non-Goals

**Goals:**

- 共享市场壳，不把业务 action 塞进壳。
- 空态、加载、错误、卡片视觉一致。
- 组件 props 对三页都足够表达，不需要大量条件分支。

**Non-Goals:**

- 不合并 Skill / Tool / Agent 的 Store。
- 不改远程源协议。
- 不把 Agent 的 workflow 编辑逻辑抽象进市场壳。

# Decisions

## 1. 插槽优先

`MarketplaceShell` 暴露 `search`、`tabs`、`source-switch` 与 `content` 插槽；页面控制状态，壳只负责布局和统一视觉。

## 2. 卡片只做展示

`MarketplaceCard` 不执行业务动作，通过默认插槽承载页面提供的操作按钮。

## 3. 空态组件

壳内统一 `MarketplaceEmpty` 状态，不另写三个 `el-empty` 文案与样式。

# Risks / Trade-offs

- 过早抽象可能导致 props 过度设计。先用 `Skills` / `ToolMarket` 两个页面验证，再接入 `Agents`。
- 市场卡片高度与三页现有局部样式有差异，需要回归截图。
