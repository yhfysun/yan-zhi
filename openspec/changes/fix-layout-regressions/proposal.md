## Why

上一轮 `optimize-mobile-responsiveness` 提案的改动在落地时引入了多项布局回退：

### Web 端（≥768px）问题

1. **按钮文本丢失** — Models/Agents/ToolMarket 页面的"新增"按钮全部变成了纯圆形图标按钮（`circle` + `fab-add` class），Web 端加号图标孤零零一个圆圈，没有文字说明。`fab-add` 这个 class 本意是在移动端将按钮变为 FAB 浮动圆形按钮，但 `circle` 属性是写死在模板上的，导致桌面端也变成了无文字图标按钮。

2. **首栏间距不一致** — App.vue 中 `.main-content` 的 `margin-left: 52px` 正常给 desktop side-nav 留空，但某些页面自身也有自己的 `padding-left`，叠加后导致内容区左右不对称。

3. **卡片网格过窄** — `.platform-grid` 和 `.marketplace-grid` 的 `minmax` 从 `360px`/`300px` 缩小到 `280px`，大屏上卡片变窄但列数增多，视觉上显得拥挤。

4. **流体 clamp() 在桌面端** — `body { font-size: clamp(14px, 1vw + 8px, 16px) }` 在 1920px 屏幕上 `1vw = 19.2px`，字体锁在 16px 没问题。但 `.page { padding: clamp(12px, 4vw, 32px) clamp(16px, 4vw, 40px) }` 在 1024px 的笔记本上 `4vw = 41px`，padding 锁在 max 值。但 left padding + margin-left(52px) 与 right padding(仅40px) 不对称。

5. **AgentEditDialog 短代码压缩** — 整个文件被极端压缩（多行合并为单行），虽然不影响功能，但降低了可维护性。

### 移动端（<768px）问题

1. **顶部 TopBar + 底部 TabBar 叠加** — TopBar（48px）+ TabBar（56px）占据了 104px 的垂直空间，中间内容区域被严重压缩。

2. **聊天页双 Header** — Chat.vue 有自己的 `.chat-topbar`（含 hamburger + 标题），但 App.vue 的 `.mobile-topbar` 也会显示，造成双倍头部空间浪费。

3. **FAB 按钮可能遮挡内容** — `.fab-add { position: fixed; bottom: 72px; right: 16px; }` 固定在页面上，可能遮挡列表最后一项或表单提交按钮。

4. **`.el-dialog` 全局覆盖过宽** — `@media max-width 767px` 中 `.el-dialog { width: 92vw !important }` 会影响所有 dialog（包括小型确认弹窗）。

5. **页面右下角 FAB 与 TabBar 重影** — FAB `bottom: 72px` 刚好在 TabBar（56px）上方 16px，位置合理但视觉上元素过多。

### 方向

**不直接回退代码**，而是将现有的移动端代码进行**精修打磨**，修复上述问题，让 Web 端恢复正常美观，移动端整洁可用。

## What Changes

### Web 端修复
1. **按钮文字还原** — 所有 `circle` + `fab-add` 按钮改回带文字的标准按钮，`fab-add` class 仅通过 `@media` 在移动端切换为 FAB
2. **content 间距对称** — 桌面端 `.main-content` 使用 `max-width` + `margin: auto` 居中方案，或增加右侧对称间距
3. **卡片列宽回调** — grid `minmax` 恢复到 320-360px，大屏每行 2-3 列
4. **AgentEditDialog 格式化** — 恢复合理代码格式

### 移动端修复
5. **Chat 页隐藏 App-level TopBar** — Chat 页面路由激活时，隐藏 `.mobile-topbar`（Chat 自身 topbar 已有 hamburger + 标题）
6. **Dialog 精准覆盖** — 仅对内容较多的 dialog（.mount-dialog, .skill-mount-dialog, .snapshot-dialog, .agent-edit-dialog）做全宽处理，确认弹窗保持原始宽度
7. **移动端 main-content padding 对称** — 确保左右 padding 一致
8. **TabBar 安全区完善** — 所有页面底部预留 TabBar + safe-area 空间
9. **消息气泡宽度统一** — 用户消息 max-width 从 80% 改为 85%，与智能体消息对齐 ✓（已修复）

## Capabilities

### Modified Capabilities
- `mobile-navigation`: 精修 TopBar/TabBar 显示逻辑
- `mobile-chat-layout`: 修复聊天页移动端双 header 问题
- `responsive-breakpoints`: 调整 CSS 变量和桌面端使用方式
- `responsive-components`: 完善 Dialog/Form/FAB 的响应式行为规则

## Impact

- `packages/ui/src/App.vue` — 修改 FAB 规则、dialog 覆盖范围、mobile padding 逻辑
- `packages/ui/src/views/Chat.vue` — 聊天页隐藏 TopBar、消息宽度统一
- `packages/ui/src/views/Models.vue` — 按钮文字恢复、grid 列宽回调
- `packages/ui/src/views/Agents.vue` — 按钮文字恢复、grid 列宽回调
- `packages/ui/src/views/ToolMarket.vue` — 按钮文字恢复
- `packages/ui/src/components/AgentEditDialog.vue` — 代码格式化
- 所有 Store 逻辑不变；路由不变；API 不变
