## 1. 子组件拆分

- [x] 1.1 创建 `packages/ui/src/views/skill-market/` 目录结构
- [x] 1.2 创建 `MarketplaceCards.vue` — 商城首页卡片网格组件（本地商城卡片 + 远程商城卡片 + 添加按钮卡片）
- [x] 1.3 创建 `LocalSkillMarket.vue` — 本地商城子页面（内置 Skill + 自定义 Skill 列表，新建/编辑/删除/导入/导出）
- [x] 1.4 创建 `RemoteSkillMarket.vue` — 远程商城子页面（远程 Skill 列表浏览 + 安装到本地）

## 2. Skills.vue 容器重构

- [x] 2.1 重构 `Skills.vue` — 移除 Tab 切换，改为根据路由参数 `route.params.id` 决定渲染首页或子页面
- [x] 2.2 无 `:id` 参数时渲染 `<MarketplaceCards />`
- [x] 2.3 `:id` 为 `"local"` 时渲染 `<LocalSkillMarket />`
- [x] 2.4 `:id` 以 `"remote-"` 开头时渲染 `<RemoteSkillMarket />`
- [x] 2.5 无效 `:id` 时重定向到 `/skills`

## 3. 商城首页 — MarketplaceCards

- [x] 3.1 本地商城卡片：置顶、强调色边框、展示 Skill 数量、点击进入 `/skills/local`
- [x] 3.2 远程商城卡片列表：从 API 获取远程源，每个源渲染为独立卡片
- [x] 3.3 "添加远程商城"卡片：虚线边框 + 图标，点击弹出添加表单弹窗
- [x] 3.4 远程商城卡片操作：测试连接按钮、删除按钮（带确认）
- [x] 3.5 加载远程源列表和 Skill 数量统计

## 4. 本地商城 — LocalSkillMarket

- [x] 4.1 顶部工具栏：返回按钮、搜索框、"新建 Skill"按钮、"从 Markdown 导入"按钮
- [x] 4.2 Skill 卡片网格：展示所有已安装 Skill，区分内置/自定义标签
- [x] 4.3 自定义 Skill 卡片操作：编辑、导出、删除
- [x] 4.4 内置 Skill 卡片操作：启用/禁用开关、预览、卸载
- [x] 4.5 复用现有编辑器弹窗（新建/编辑 Skill）
- [x] 4.6 复用现有导入弹窗（从 Markdown 导入）
- [x] 4.7 复用现有预览弹窗

## 5. 远程商城 — RemoteSkillMarket

- [x] 5.1 顶部工具栏：返回按钮、搜索框、分类筛选
- [x] 5.2 远程 Skill 列表：卡片网格展示远程 Skill
- [x] 5.3 "安装到本地"按钮：下载远程 Skill 到本地数据库
- [x] 5.4 已安装检测：已安装的 Skill 显示"已安装"状态

## 6. 验证与收尾

- [x] 6.1 验证所有功能正常工作（安装/卸载/启用/禁用/新建/编辑/删除/导入/导出）
- [x] 6.2 验证路由导航正确（首页 ↔ 本地商城 ↔ 远程商城）
- [x] 6.3 验证远程商城源的增删改查
- [x] 6.4 确保构建通过 (`npm run build`)
