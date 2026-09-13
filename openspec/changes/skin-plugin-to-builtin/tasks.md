# 任务清单（方案 B：插件皮肤直接扩展）

> 对齐 proposal / design / spec。保留 `skins.ts` 声明式 + 真图资源，补齐缺失部位与下拉白字 bug。
> 实施顺序对应 design.md §9：脚本派生 → 校验增强 → 声明补字段 → 前端下发 → skin.css 挂点 → validate + 截图核验。

## 1. 扩展 build-skin-samples.mjs 派生 6 类真图
- [ ] 在 `scripts/build-skin-samples.mjs` 现有 sharp 流水线基础上，新增从每套 `assets/plugin-assets/<id>/wallpaper.webp` 派生以下区域图：
  - `card-bg.webp`：中心 crop → 360×240，轻微提亮
  - `banner.webp`：顶部 crop → 1600×200
  - `task-card-1/2/3.webp`：三张变体 crop（左/中/右或不同缩放）→ 320×200，供新建任务三卡错落
  - `dropdown-bg.webp`：柔化 crop → 320×240，低对比（避免压字）
  - `browser-bg.webp`：底部 strip crop → 920×80，接 `.browser-tabbar/.browser-toolbar`
- [ ] 注意 sharp 坑：`.clone()` 不继承排队操作，须先 `.png().toBuffer()` 物化再重建实例。
- [ ] 对全部 27 套（24 基础 + 4 样例，含无独立源图套）以各自 `wallpaper.webp` 为源批量生成，保证与现有 4 类部件同源、视觉一致。
- [ ] 跑全量生成；确认每套目录落盘 6 个新图（壁纸 + 原 4 类保留兼容，合计 ≥ 11 图）。

## 2. verify-skin-series.mts 增强部位数校验
- [ ] 在 `scripts/verify-skin-series.mts` 增加：遍历 `apps/server/assets/plugin-assets/<id>/`，每套资源数 ≥ 11（壁纸 + 原 4 类 + 新 6 类），缺则 `exit 1`（CI 可接）。
- [ ] 对 27 套全量跑一次，确认无 false negative。

## 3. skins.ts autoPatterns 补 6 字段
- [ ] 改 `apps/server/src/plugins/skins.ts` 的 `autoPatterns`（`skins.ts:28-37`）为：
  ```ts
  const autoPatterns = {
    taskListPattern: 'task-list-bg.webp',
    inputPattern: 'input-bg.webp',
    buttonPattern: 'button-bg.webp',
    dialogPattern: 'dialog-bg.webp',
    menuPattern: 'dialog-bg.webp',        // 复用（不新增）
    codePattern: 'dialog-bg.webp',        // 复用
    browserPattern: 'browser-bg.webp',    // 改专属（原复用 task-list-bg）
    cardPattern: 'card-bg.webp',          // 新增
    bannerPattern: 'banner.webp',         // 新增
    taskCardPattern: 'task-card-1.webp',  // 新增（三卡可后续用 2/3）
    dropdownPattern: 'dropdown-bg.webp',  // 新增
  };
  ```
- [ ] `surface` 类型显式承载这些 pattern 字段（原 `ThemePalette['surface']` 已可；前端 `SkinSurface` 同步在步骤 4）。
- [ ] 不删任何现有字段；`kind:'skin'`、注册、`registerBuiltinSkins` 不变。

## 4. settings.ts SkinSurface + SKIN_CSS_VARS + applySurface 下发
- [ ] `packages/ui/src/stores/settings.ts` 的 `SkinSurface`（`settings.ts:13`）增 `cardPattern / bannerPattern / taskCardPattern / dropdownPattern`（browserPattern 已存在）。
- [ ] `SKIN_CSS_VARS`（`settings.ts:516`）增 `--skin-card-pattern / --skin-banner-pattern / --skin-task-card-pattern / --skin-dropdown-pattern`。
- [ ] `applySurface(sf, pluginId)`（`settings.ts:534`）已对 `sf.*Pattern` 调 `asset()`；新增 4 个 `if (sf.cardPattern) ...` 下发分支（与现有 dialog/taskList 等写法一致）。`pluginId` 非空自动拼 `pluginAssetUrl` → 真实 webp，无需改 `asset()`。
- [ ] **不**改为 `skinArt` 程序化（保留真图，符合用户偏好）；`skinSeries.ts` 内置系列保持不动。

## 5. skin.css 补卡片/横幅/三卡/下拉挂点 + EP 文本 token 修复（核心修白字）
- [ ] 在 `[data-skin="on"]` 段新增（统一 `!important` 压 scoped 顺序）：
  ```css
  [data-skin="on"] .el-card,
  [data-skin="on"] .glass-card,
  [data-skin="on"] .ov-card,
  [data-skin="on"] .task-create-card { background-image: var(--skin-card-pattern) !important; background-size: cover !important; background-position: center !important; }
  [data-skin="on"] .skin-banner { background-image: var(--skin-banner-pattern) !important; background-size: cover !important; background-position: center !important; }
  [data-skin="on"] .task-create-card { background-image: var(--skin-task-card-pattern) !important; background-size: cover !important; background-position: center !important; }
  [data-skin="on"] .el-popper.is-light { background-image: var(--skin-dropdown-pattern, none); background-size: cover; background-position: center; }
  ```
- [ ] 下拉框白字修复（核心）：`[data-skin="on"]` 与 `[data-theme="dark"][data-skin="on"]` 块补 `--el-text-color-primary/-regular/-secondary/-placeholder` 取自 `--color-text*`。
  ```css
  [data-skin="on"] {
    --el-text-color-primary: var(--color-text);
    --el-text-color-regular: var(--color-text);
    --el-text-color-secondary: var(--color-text-secondary);
    --el-text-color-placeholder: var(--color-text-tertiary);
  }
  [data-skin="on"] .el-select-dropdown__item,
  [data-skin="on"] .el-cascader-node,
  [data-skin="on"] .el-dropdown-menu__item { color: var(--color-text) !important; }
  [data-skin="on"] .el-select-dropdown__item.selected { color: var(--color-primary) !important; }
  ```
- [ ] 卡片/横幅/三卡底图之上压薄玻璃（参考 `.conv-list` 的 `color-mix(... 22%, transparent)` 手法），保证文字可读。
- [ ] 实现时确认「新建任务三个卡片」所在组件并加 `.task-create-card` 类名（当前为占位命名，确认点：新建任务向导组件，可能位于 `ScheduledTaskDialog.vue` 之外的专用向导）。

## 6. 校验与核验
- [ ] `openspec validate skin-plugin-to-builtin --json` 通过。
- [ ] `vue-tsc --noEmit`（packages/ui）无新增类型错误。
- [ ] `agent-browser` 逐一切换插件皮肤截图核验：壁纸/弹窗/列表/按钮/输入框/卡片/横幅/新建任务三卡/下拉框/浏览器 图片到位、下拉框文字可读、无白屏/白字。
- [ ] 内置系列皮肤回归：5 系列外观不变（本变更未改 `skinSeries.ts`，应无回归）。

## 备注
- 方案 A（整体转内置程序化）不在本变更，见 design.md §8，后续可选收口。
- 打包版需 `pnpm build:desktop` 重出包才更新新增 webp 资源（沿用既有 extraResources 机制）。
