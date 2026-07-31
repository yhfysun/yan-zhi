## Context

`optimize-mobile-responsiveness` 的改动引入了 `fab-add` 模式：按钮在移动端通过 CSS `@media` 变为固定定位的 FAB 圆形按钮。问题是按钮的 `circle` 属性被直接写在 HTML 模板上，导致桌面端也失去了文字标签。本次修复的核心原则：**CSS 只在移动端生效，桌面端完全不受影响**。

当前状态：
- 桌面端 side-nav 宽度 52px，左侧有固定导航栏
- 移动端使用 top-bar（48px）+ bottom tab-bar（56px）
- 公共 CSS 在 `App.vue` 的 unscoped `<style>` 中

## Goals / Non-Goals

**Goals:**
- 桌面端按钮恢复文字标签，视觉回归正常
- 移动端保留 FAB 交互（圆形图标按钮），但不丢失功能入口
- Chat 页面移动端不出现双 header
- 小确认弹窗不受 dialog 全宽覆盖影响
- 代码可维护性恢复（AgentEditDialog 格式化）

**Non-Goals:**
- 不重写整个布局系统
- 不新增路由或 store
- 不改变数据流或 API

## Decisions

### 1. 按钮策略：模板中去掉 `circle`，CSS 中通过 `@media` 添加 FAB 样式

**方案 A（采纳）**: 模板中使用标准文字按钮，移动端通过 `@media (max-width: 767px)` 中 `.fab-add` 规则：隐藏文字、固定定位、圆形 48px。

**方案 B（否决）**: 保留模板中的 `circle`，在桌面端 `@media` 中覆盖取消 `circle`，并恢复文字。问题：Element Plus 的 `circle` 是 prop 不是 CSS，媒体查询无法覆盖 JavaScript prop。

```html
<!-- Before -->
<el-button type="primary" :icon="Plus" circle @click="..." class="fab-add"></el-button>

<!-- After -->
<el-button type="primary" :icon="Plus" @click="..." class="fab-add">新增xxx</el-button>
```

桌面端：正常文字按钮。移动端 CSS 通过 `.fab-add` 规则切换为 FAB。

### 2. Chat 页双 Header 去重

Chat.vue 自有 `chat-topbar`（含 hamburger + 会话标题），移动端 App.vue 又渲染 `mobile-topbar`。

**决策**: 在 App.vue 的 `pageTitle` 逻辑中加入 `route.name === 'chat'` 时不显示 mobile-topbar。Chat.vue 的 hamburger 按钮在移动端可见，已提供导航入口。

### 3. Dialog 精准覆盖

当前 `.el-dialog { width: 92vw !important }` 对所有 dialog 生效，连确认弹窗也被拉宽。

**决策**: 改为用特定 class 选择器（`.mount-dialog .el-dialog`, `.skill-mount-dialog .el-dialog`, `.snapshot-dialog .el-dialog`, `.agent-edit-dialog .el-dialog`）精准覆盖大型 dialog，移除通用的 `.el-dialog` 覆盖。

### 4. 卡片列宽

Models/Agents 的 grid `minmax` 从 280px 恢复到 320px（大屏 2-3 列），桌面端卡片更宽更易读。

### 5. AgentEditDialog 代码格式

当前文件被极端压缩（所有逻辑在一行内），不利于后续维护。逐步恢复合理换行，保持功能完全不变。

## Risks / Trade-offs

- [移动端按钮点击区域] — FAB 48px 圆形按钮 touch target 符合 WCAG 标准，但可能误触 → 通过 `z-index: 50` 和 `bottom: 72px` 避开 TabBar
- [Dialog 选择器遗漏] — 如果未来新增 dialog 需要全宽，必须有对应的 class → 在 CSS 注释中标明命名约定
