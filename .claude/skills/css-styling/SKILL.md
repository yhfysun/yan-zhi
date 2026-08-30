---
name: css-styling
description: CSS/Tailwind 样式助手。当用户要求"写样式""调布局""做响应式""加动画""暗色主题""Tailwind 类怎么写"时触发。覆盖 Flex/Grid 布局、动画、主题、响应式，含 Tailwind 类速查与暗色适配。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# CSS/Tailwind 样式（css-styling）

布局、动画、主题、响应式样式编写。Flex/Grid 布局速查、Tailwind 类速查、暗色主题适配、常见动画。

## 何时触发

- 用户说"写样式""调布局""做响应式""加动画""暗色主题""Tailwind 怎么写"等
- 用户要美化页面、对齐、适配移动端
- 用户要实现某个视觉效果（卡片/导航/弹层/骨架屏）

## 布局

### Flex（一维）
```css
.container { display: flex; gap: 12px; }
.row { flex-direction: row; align-items: center; justify-content: space-between; }
.col { flex-direction: column; }
.grow { flex: 1; }            /* 占满剩余 */
.fixed { flex: 0 0 200px; }   /* 固定宽 */
.center { display: flex; align-items: center; justify-content: center; }
```

### Grid（二维）
```css
.grid { display: grid; gap: 12px; }
.cols-3 { grid-template-columns: repeat(3, 1fr); }
.auto { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.holy-grail {
  display: grid;
  grid-template-areas: "header header" "side main" "footer footer";
  grid-template-rows: auto 1fr auto; grid-template-columns: 200px 1fr;
}
```

### 居中速查
```css
/* 绝对居中 */
.center { position: absolute; inset: 0; margin: auto; width: fit-content; }
/* 或 */
.center { display: grid; place-items: center; }
```

## 响应式（移动优先）
```css
.card { padding: 12px; }
@media (min-width: 768px) { .card { padding: 24px; } }
@media (min-width: 1200px) { .card { padding: 32px; } }
```
断点约定：sm 640 / md 768 / lg 1024 / xl 1280

## 暗色主题
```css
:root {
  --bg: #fff; --fg: #1f2937; --border: #e5e7eb;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #111827; --fg: #e5e7eb; --border: #374151; }
}
/* 或手动切换 */
.dark { --bg: #111827; --fg: #e5e7eb; }
body { background: var(--bg); color: var(--fg); }
```
切换：`document.documentElement.classList.toggle('dark')`

## 动画
```css
.fade { transition: opacity .2s; }
.fade:hover { opacity: .8; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* 进场 */
@keyframes enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.enter { animation: enter .2s ease-out; }
```

## Tailwind 速查

| 需求 | 类 |
|------|----|
| 居中 | `flex items-center justify-center` |
| 间距 | `gap-4`（16px）/ `space-y-2` |
| 网格 | `grid grid-cols-3 gap-4` |
| 响应式 | `md:grid-cols-3`（≥768px 三列） |
| 暗色 | `dark:bg-gray-900 dark:text-gray-100` |
| 圆角阴影 | `rounded-lg shadow-md` |
| 截断 | `truncate`（单行）/ `line-clamp-2`（多行） |
| 过渡 | `transition hover:opacity-80` |

```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 dark:bg-gray-900">
  <div class="rounded-lg shadow p-4 bg-white dark:bg-gray-800">卡片</div>
</div>
```

## 常见组件样式

- **卡片**：`rounded-lg shadow p-4 bg-white`
- **骨架屏**：`animate-pulse bg-gray-200 rounded`
- **粘性头部**：`sticky top-0 z-10`
- **遮罩**：`fixed inset-0 bg-black/50`

## 注意事项

- 优先 Flex/Grid，少用 float/position 撑布局
- 用 CSS 变量管主题色，便于暗色与换肤
- 移动优先：默认样式给小屏，媒体查询往大屏加
- 动画优先 `transform`/`opacity`（GPU 友好），别动画 width/top
- Tailwind 避免层层嵌套自定义类，复杂样式抽成 `@apply` 或组件
- 暗色用 `prefers-color-scheme` 自动跟随系统，再提供手动切换
- 颜色对比度满足 WCAG AA（正文对比度 ≥ 4.5:1）