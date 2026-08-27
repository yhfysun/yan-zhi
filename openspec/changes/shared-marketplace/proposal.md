# 为什么

`Skills.vue`、`ToolMarket.vue`、`Agents.vue` 分别重复实现了“搜索栏 + 分类 Tab + 本地/远程/商城切换 + 卡片网格 + 空态/加载态/错误态”。三套脚手架约 3 倍重复，视觉和交互容易漂移。

# 改什么

- 新建 `MarketplaceShell.vue`：统一页面壳，包含搜索、分类、来源切换、内容插槽和空态。
- 新建 `MarketplaceCard.vue`：统一卡片展示，支持图标、标题、描述、标签、统计、操作区。
- 让 `Skills.vue`、`ToolMarket.vue`、`Agents.vue` 组合复用通用壳，只传各自数据源与渲染配置。
- 统一空态、加载态、错误态和间距变量。

# 影响

- `packages/ui/src/components/marketplace/MarketplaceShell.vue`（新建）
- `packages/ui/src/components/marketplace/MarketplaceCard.vue`（新建）
- `packages/ui/src/views/Skills.vue`
- `packages/ui/src/views/ToolMarket.vue`
- `packages/ui/src/views/Agents.vue`

# 验收目标

- 三个市场页面视觉、交互一致。
- 重复脚手架代码显著下降。
- 各页数据源、业务动作仍保持独立。
- `npx openspec validate --all` 通过。
