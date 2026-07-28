## Why

当前智能体页面（`Agents.vue`）顶部用 `el-tabs` 切换"本地"和"远程商城"两个视图——本地是智能体网格卡片，远程是扁平列表+远程源管理。这个 Tab 切换把不同类型的内容混在一个页面上，割裂感强。用户期待的是：进来先看到"商城卡片"（本地商城 + 远程商城），点击某个商城卡片后再深入浏览该商城内的智能体。"新建智能体"的入口只在本地商城有意义，不应受 Tab 影响。整体视觉效果偏平，缺少与 ToolMarket/Skills 重新设计相呼应的现代卡片式 IA。

## What Changes

- **移除顶部 Tab**：取消"本地 / 远程商城"的 `el-tabs` 切换，改为统一的商城卡片页
- **新增商城卡片入口层**：首页展示"本地商城"卡片（默认内置）+ N 个远程商城卡片，每个卡片展示商城名称、描述、简要统计
- **本地商城卡片**：点击进入二级视图，展示所有内置智能体 + 自定义智能体，仅此视图提供"新建智能体"按钮
- **远程商城卡片**：每个远程源一张卡片，可新增远程商城源，点击卡片进入浏览/安装远程智能体
- **统一新增远程源入口**：在商城卡片区新增"添加远程商城"入口卡片（虚线/加号样式），点击弹出配置表单
- **UI 一致性**：卡片布局、玻璃态样式、圆角标签与 `ToolMarket.vue`、`Skills.vue` 的重设计保持视觉一致

## Capabilities

### New Capabilities

- `agent-market-ia-restructure`: 重构智能体页面信息架构，从 Tab 切换改为商城卡片驱动的二级导航

### Modified Capabilities

<!-- No existing spec-level behavior is being changed -->

## Impact

- **修改文件**：
  - `packages/ui/src/views/Agents.vue` — 核心重构，页面结构、模板、样式全部改写
- **不变文件**：
  - `packages/ui/src/stores/agent.ts` — Store 逻辑保持不变
  - `packages/ui/src/router/index.ts` — 路由 `/agents` 不变
  - `packages/shared/src/types/` — 类型定义不变
- **最低风险**：纯 UI 重构，不涉及后端 API、数据库 Schema、业务逻辑变更
