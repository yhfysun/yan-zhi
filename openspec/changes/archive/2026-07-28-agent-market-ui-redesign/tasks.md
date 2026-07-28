## 1. 页面架构重构

- [x] 1.1 移除 `el-tabs` 和 `tab` 响应式变量，新增 `currentView` 状态（`'marketplace' | 'local-agents' | 'remote-agents'`）
- [x] 1.2 新增当前远程源状态变量 `selectedRemoteSource` 替换旧的 `currentAgentSourceId`
- [x] 1.3 实现视图切换函数 `goToMarketplace()`、`goToLocalAgents()`、`goToRemoteAgents(source)`
- [x] 1.4 确保 `/agents` 路由首次加载时 `currentView` 默认为 `'marketplace'`

## 2. 商城卡片入口页（marketplace 视图）

- [x] 2.1 创建本地商城卡片（头像/图标 + 标题"本地智能体" + 描述 + 统计标签 + "进入管理"按钮）
- [x] 2.2 远程商城卡片列表渲染（每个远程源一张卡片，显示名称/URL/状态标签 + 浏览/测试/删除操作）
- [x] 2.3 新增"添加远程商城"入口卡片（虚线边框 + `+` 图标），点击弹出远程源配置弹窗
- [x] 2.4 商城卡片网格布局 + 玻璃态样式（`var(--glass-bg)`、`var(--glass-filter)`、hover 上移效果）

## 3. 本地智能体列表页（local-agents 视图）

- [x] 3.1 添加顶部导航栏：返回按钮 + 标题"本地智能体" + "新建智能体"按钮
- [x] 3.2 复用现有智能体卡片网格（`agent-card` + `agent-avatar` + `agent-info` + `agent-meta` + `agent-actions`）
- [x] 3.3 保持空状态提示：无智能体时显示 `el-empty` + "立即创建"按钮

## 4. 远程智能体列表页（remote-agents 视图）

- [x] 4.1 添加顶部导航栏：返回按钮 + 标题（远程源名称） + 远程源 URL 副标题
- [x] 4.2 复用现有远程智能体卡片列表 + "复制到本地"按钮
- [x] 4.3 保持空状态提示：无远程智能体时显示提示文本

## 5. 样式统一

- [x] 5.1 所有卡片统一使用 `var(--glass-bg)` 背景 + `var(--glass-filter)` 毛玻璃滤镜
- [x] 5.2 商城卡片和智能体卡片 hover 时 `translateY(-2px)` + `box-shadow` 增强
- [x] 5.3 添加远程商城卡片使用 `.marketplace-add-card` 样式（虚线边框 `2px dashed` + 半透明）
- [x] 5.4 页面间距与 `ToolMarket.vue`、`Skills.vue` 保持一致（`padding: 24px`、grid gap `16px`）

## 6. 验证测试

- [x] 6.1 手动验证：进入 `/agents` 默认展示商城卡片页
- [x] 6.2 手动验证：点击本地商城 → 进入智能体列表 → 可新建智能体 → 返回
- [x] 6.3 手动验证：添加远程商城 → 卡片出现 → 点击浏览远程智能体 → 安装到本地
- [x] 6.4 手动验证：远程商城卡片的测试/删除功能正常
- [x] 6.5 手动验证：视觉样式与 ToolMarket/Skills 页一致
