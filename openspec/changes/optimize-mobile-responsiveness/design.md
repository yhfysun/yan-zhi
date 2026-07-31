## Context

当前 `packages/ui` 是一个纯桌面优先设计的 Vue 3 + Element Plus 应用，所有布局使用固定 `px` 值，零 `@media` 查询。`apps/web` 和 `apps/mobile`（Capacitor）都引用同一个 `@yan-zhi/ui` 包。移动端改造需要在尽可能不改动业务逻辑的前提下，通过 CSS 媒体查询 + 少量 JS 条件渲染实现。

**关键约束**：
- 必须向后兼容：桌面端行为完全不变
- 不能引入新的 UI 框架，保持 Element Plus 技术栈
- 改动集中在 `<style>` 和模板中少量 `v-if` / `v-show` 判断
- 性能：额外 JS 开销应极小（不引入 ResizeObserver 轮询，优先用 CSS media query）

## Goals / Non-Goals

**Goals:**
- 建立 5 级响应式断点（xs/sm/md/lg/xl）并全局可用
- 侧边导航在小屏上自动切换为底部 TabBar
- 聊天页侧边栏 + 文件面板菜单式/Sheet 式展示
- 所有页面卡片/表格/表单在小屏上可用且美观
- 触控优化（最小触控区、手势、长按菜单）
- Element Plus 全局弹窗/表单在小屏上的优雅降级

**Non-Goals:**
- 不引入 Tailwind CSS 或其他第三方 CSS 框架
- 不改造 `apps/mobile` Capacitor 层（仅确保 UI 层适配后 mobile 自然受益）
- 不改动业务逻辑、Store、API 层
- 不做 React Native / Flutter 等独立移动端重写

## Decisions

### Decision 1: CSS 变量 + 媒体查询 vs. JS 断点检测

**选择**: CSS 变量 + 媒体查询 为主，JS 检测为辅

**理由**: CSS-only 方案零运行时开销，浏览器原生 `matchMedia` 性能最优。仅在需要改变 DOM 结构时（如导航栏从侧边变为底部）使用 JS 辅助判断。

**替代方案**: 使用 `vueuse` 的 `useMediaQuery` 统一 JS 检测——增加依赖且对大部分纯样式调整不必要。

### Decision 2: 底部导航栏实现方式

**选择**: 在 `SideNav.vue` 中添加 CSS `display: none/flex` 切换 + `v-if` 控制两种渲染模式

**理由**: 侧边栏和底部栏内容完全同构（相同菜单项），在同一个组件内管理避免状态同步问题。CSS 切换开销最小。

### Decision 3: 聊天侧边栏抽屉方案

**选择**: 使用 Element Plus 的 `el-drawer` 组件，小屏时从左侧滑入

**理由**: 利用现有 UI 库组件，自带遮罩层、关闭手势、动画。不需要自定义 overlay + transition。

### Decision 4: 文件面板 Sheet 方案

**选择**: 自定义底部 Sheet 组件（CSS transform + transition），而非引入第三方库

**理由**: 需求简单（从底部滑入的 60vh 面板），200 行以内 CSS + 简单 v-if 即可实现，不需要额外依赖。

### Decision 5: 触控最小区域

**选择**: 全局 CSS 覆盖：`min-height: 44px; min-width: 44px` 在移动端断点上对所有交互元素生效

**理由**: WCAG 2.2 Level AA 标准，纯 CSS 实现。

### Decision 6: 长按 vs. hover 操作菜单

**选择**: 在小屏断点上，使用 `@touchstart` / `@touchend` 事件 + 计时器实现长按检测，弹出上下文菜单

**理由**: 移动端无 hover 概念，必须用触控事件。引入额外手势库过重，约 30 行 JS 即可实现。

## Risks / Trade-offs

- **[风险] 媒体查询断点可能与某些设备不匹配** → 使用业界标准断点（Bootstrap 5），覆盖主流设备
- **[风险] 底部导航栏 + Safe Area 在 iOS 上的冲突** → 使用 `env(safe-area-inset-bottom)` 预留安全区
- **[风险] el-drawer 在小屏嵌套可能导致交互混乱** → 限制同一时间只有一个 drawer 打开
- **[权衡] CSS 变量断点 vs. JS 检测的双重维护** → 断点值统一在 `App.vue` 的 `--bp-*` 变量中定义，JS 侧引用同一组常量
- **[权衡] 长按检测的 500ms 延迟 vs. 原生体验** → 500ms 是标准长按时长，后续可优化为 300ms + 视觉反馈

## Open Questions

1. 底部 TabBar 是否需要在 Capacitor 原生层面配合隐藏系统导航栏？留待 mobile app 测试阶段确认
2. 小屏上的 Skills 子页面（MarketplaceCards/LocalSkillMarket/RemoteSkillMarket）是否需要独立的移动端布局策略？当前方案让每个子 View 自己适应
