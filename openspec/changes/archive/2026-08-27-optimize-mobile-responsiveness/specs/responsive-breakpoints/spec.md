## ADDED Requirements

### Requirement: 响应式断点系统
系统 SHALL 提供 5 级响应式断点并通过 CSS 自定义属性全局可用。

断点定义：
- `xs`: 最大宽度 575px
- `sm`: 576px - 767px
- `md`: 768px - 991px
- `lg`: 992px - 1199px
- `xl`: 1200px 及以上

系统 SHALL 在 `App.vue` 的 `:root` 上暴露以下 CSS 变量：
- `--bp-xs`, `--bp-sm`, `--bp-md`, `--bp-lg`, `--bp-xl`：各断点最小值（数值，无单位）
- `--is-mobile`：在 xs/sm 断点为 `1`，否则为 `0`（用于 CSS calc 条件）

#### Scenario: xs 断点匹配
- **WHEN** 视口宽度 ≤ 575px
- **THEN** `--is-mobile` CSS 变量值为 `1`

#### Scenario: md 及以上断点
- **WHEN** 视口宽度 ≥ 768px
- **THEN** `--is-mobile` CSS 变量值为 `0`

### Requirement: 流体尺寸系统
系统 SHALL 使用 CSS `clamp()` 函数实现关键尺寸的流体缩放，避免断点间的硬切换。

- 根字体大小：`clamp(14px, 1vw + 8px, 16px)`
- 页面内边距：`clamp(12px, 4vw, 32px)`
- 卡片间距：`clamp(8px, 2vw, 16px)`

#### Scenario: 视口缩放时根字体平滑变化
- **WHEN** 视口宽度在 576px 到 1200px 之间变化
- **THEN** 根字体大小在 14px 到 16px 之间平滑过渡

### Requirement: 移动端断点判断工具函数
系统 SHALL 提供 `useIsMobile()` composable 函数，基于 `window.matchMedia('(max-width: 767px)')` 返回响应式 ref。

#### Scenario: 视口小于 768px 时返回 true
- **WHEN** 视口宽度为 600px
- **THEN** `useIsMobile().value` 为 `true`

#### Scenario: 视口大于等于 768px 时返回 false
- **WHEN** 视口宽度为 1024px
- **THEN** `useIsMobile().value` 为 `false`
