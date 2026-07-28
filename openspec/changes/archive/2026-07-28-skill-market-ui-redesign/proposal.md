## Why

当前 Skill 商店 UI 使用 Tab 切换（商店/远程商城/已安装/自建），页面臃肿、层级混乱，用户需在多个 Tab 间来回切换。需要重新设计为卡片式商城布局——以"商城卡片"为入口，本地商城为默认卡片，点击进入查看内置和自定义 Skill，远程商城以独立卡片呈现，整体体验更简洁直观。

## What Changes

- **移除 Tab 切换**：不再使用 el-tabs 切换"商店/远程商城/已安装/自建"，改用商城卡片网格布局
- **本地商城卡片（默认）**：首页展示"本地商城"卡片，点击进入查看所有内置 Skill 和已安装的自定义 Skill
- **仅本地商城可新增自定义 Skill**：新建按钮只在本地商城内部页面显示
- **远程商城卡片**：每个远程商城源以独立卡片形式展示，可新增远程商城卡片
- **商城首页**：卡片网格布局，展示本地商城卡片 + 全部远程商城卡片，一目了然
- **整体 UI 优化**：简化页面结构，提升视觉层次，减少不必要的嵌套

## Capabilities

### New Capabilities

- `skill-marketplace-cards`: Skill 商城首页用卡片网格替代 Tab 切换，每张卡片代表一个商城（本地/远程），点击进入查看该商城的 Skill 列表
- `local-skill-management`: 本地商城内部页面 — 展示内置 Skill + 自定义 Skill，支持新增/编辑/删除自定义 Skill（仅限本地商城）
- `remote-marketplace-cards`: 远程商城以独立卡片展示在首页，支持新增/删除远程商城源

### Modified Capabilities

- `skill-marketplace`: 移除了 Tab 切换交互模式，改用商城卡片入口 + 子页面模式；自建 Skill 管理入口从 Tab 合并到本地商城内部

## Impact

- `packages/ui/src/views/Skills.vue` — 主要改造文件，重构整个页面布局和交互
- `packages/ui/src/stores/skill.ts` — 可能需要小调整（数据模型基本复用）
- 可能需要新增子路由或子组件（如 `SkillMarketDetail.vue`）
