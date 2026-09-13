# 技术方案（方案 B：插件皮肤直接扩展）

## 1. 现状数据流（代码级，已核实）

```
选择皮肤 (settings.skin)
   └─ applySkin(skin)  [packages/ui/src/stores/settings.ts:460]
        ├─ builtin:<id>  → builtinSeriesFor() 取 BUILTIN_SKIN_SERIES 的 data URI → applySurface(sf, null)
        └─ 其它          → pluginStore.themes.find(kind==='skin') → pluginId
                          → pluginAssetUrl(pluginId, file) 拼 /api/plugin-assets/<id>/<file>
                          → applySurface(sf, pluginId)        // asset() 把文件名包成 url("...")
```

- 资源服务：`apps/server/src/routes/plugins.ts:221` `GET /api/plugin-assets/:pluginId/*`，`BUILTIN_ASSETS_DIR = apps/server/assets/plugin-assets`；`apps/server/src/index.ts:122` 挂载。
- `assets/plugin-assets/<id>/` 现状：每套含 `wallpaper.webp`（真图壁纸）+ `dialog-bg / task-list-bg / input-bg / button-bg`（4 类部件真图）。**27 套齐备**（24 基础 + 4 样例）。
- `autoPatterns`（`skins.ts:28-37`）只声明这 4 类文件名，菜单/代码/浏览器复用 `dialog-bg`/`task-list-bg`。

## 2. 目标：补齐 6 类真图部位（与现有 4 类同源）

| 用户枚举部位 | 新增文件 | surface 字段 | CSS 变量 | 消费挂点（skin.css 新增/改） |
|---|---|---|---|---|
| 卡片 | `card-bg.webp` | `cardPattern` | `--skin-card-pattern` | `.el-card / .glass-card / .ov-card` + 新建任务三卡 |
| 滚动图/横幅 | `banner.webp` | `bannerPattern` | `--skin-banner-pattern` | `.skin-banner`（首页 `.app-intro`、各页 hero） |
| 新建任务三卡 | `task-card-1/2/3.webp` | `taskCardPattern` | `--skin-task-card-pattern` | `.task-create-card`（实现时确认新建任务向导组件并加此类名；三卡可选用 1/2/3 或统一图） |
| 下拉框 | `dropdown-bg.webp` | `dropdownPattern` | `--skin-dropdown-pattern` | `.el-popper.is-light`（可选底图，主修复为文本对比） |
| 浏览器 | `browser-bg.webp`（替代复用） | `browserPattern` | `--skin-browser-pattern` | `.browser-tabbar / .browser-toolbar`（原复用 task-list-bg，改专属图） |
| 弹窗/列表/按钮/输入框/菜单/代码 | 已有 | 已有 | 已有 | 已有（不动） |

> 合计每套皮肤由 5 图（含壁纸）→ **11 图**（含壁纸 + 6 类部件 + 原 4 类保留兼容）。

## 3. 派生脚本（真实图像，保留"带图片"质感）

扩展 `scripts/build-skin-samples.mjs`（已有 sharp 流水线，坑：`.clone()` 不继承排队操作，须先 `.png().toBuffer()` 物化再重建实例）：

- 输入：每套 `assets/plugin-assets/<id>/wallpaper.webp`（真图源）。
- 派生（裁切/缩放/主色微调，保持与现有 4 类同源）：
  - `card-bg.webp`：中心 crop → 360×240，轻微提亮。
  - `banner.webp`：顶部 crop → 1600×200（横幅母题区）。
  - `task-card-1/2/3.webp`：三张变体 crop（左/中/右 或 不同缩放），320×200，供新建任务三卡错落使用。
  - `dropdown-bg.webp`：柔化 crop → 320×240，低对比（避免压字）。
  - `browser-bg.webp`：底部 strip crop → 920×80，接 `.browser-tabbar/.browser-toolbar` 现尺寸。
- 对**无独立源图**的 23 套基础皮肤：仍以各自 `wallpaper.webp` 为源（与其现有 4 类部件同源），保证视觉一致；4 套样例皮肤同理。
- `scripts/verify-skin-series.mts` 增强：每套资源数 ≥ 11（壁纸 + 原 4 + 新 6），缺则 exit 1（CI 可接）。

## 4. skins.ts 声明改造

`autoPatterns`（`skins.ts:28-37`）改为：

```ts
const autoPatterns = {
  taskListPattern: 'task-list-bg.webp',
  inputPattern: 'input-bg.webp',
  buttonPattern: 'button-bg.webp',
  dialogPattern: 'dialog-bg.webp',
  menuPattern: 'dialog-bg.webp',        // 复用（同包，不新增）
  codePattern: 'dialog-bg.webp',        // 复用
  browserPattern: 'browser-bg.webp',    // 改专属（原复用 task-list-bg）
  cardPattern: 'card-bg.webp',          // 新增
  bannerPattern: 'banner.webp',         // 新增
  taskCardPattern: 'task-card-1.webp',  // 新增（三卡可后续用 2/3）
  dropdownPattern: 'dropdown-bg.webp', // 新增
};
```

- `surface` 类型（`@yan-zhi/core` `ThemePalette['surface']` + 前端 `SkinSurface`）显式承载这些 pattern（原已可，前端补 `cardPattern/bannerPattern/taskCardPattern/dropdownPattern`）。
- 不删任何现有字段；`kind:'skin'`、注册、`registerBuiltinSkins` 不变。

## 5. settings.ts applySurface 收口

- `SkinSurface`（`settings.ts:13`）增 `cardPattern / bannerPattern / taskCardPattern / dropdownPattern`（browserPattern 已存在）。
- `SKIN_CSS_VARS`（`settings.ts:516`）增 `--skin-card-pattern / --skin-banner-pattern / --skin-task-card-pattern / --skin-dropdown-pattern`。
- `applySurface(sf, pluginId)`（`settings.ts:534`）已对 `sf.*Pattern` 调 `asset()`；新增 4 个 `if (sf.cardPattern) ...` 下发分支（与现有 dialog/taskList 等写法一致）。`pluginId` 非空 → 自动拼 `pluginAssetUrl` → 真实 webp，无需改 `asset()`。
- **不**改为 `skinArt` 程序化（保留真图，符合用户偏好）；`skinSeries.ts` 内置系列保持程序化不动。

## 6. skin.css 挂点 + 下拉对比修复

新增/修改（在 `[data-skin="on"]` 段，统一 `!important` 压 scoped 顺序）：

```css
/* 卡片 */
[data-skin="on"] .el-card,
[data-skin="on"] .glass-card,
[data-skin="on"] .ov-card,
[data-skin="on"] .task-create-card {
  background-image: var(--skin-card-pattern) !important;
  background-size: cover !important; background-position: center !important;
}
/* 横幅/滚动图 */
[data-skin="on"] .skin-banner { background-image: var(--skin-banner-pattern) !important; background-size: cover !important; background-position: center !important; }
/* 新建任务三卡 */
[data-skin="on"] .task-create-card { background-image: var(--skin-task-card-pattern) !important; background-size: cover !important; background-position: center !important; }
/* 下拉框底图（可选） */
[data-skin="on"] .el-popper.is-light { background-image: var(--skin-dropdown-pattern, none); background-size: cover; background-position: center; }

/* ===== 下拉框白底白字修复（核心）===== */
[data-skin="on"] {
  --el-text-color-primary: var(--color-text);
  --el-text-color-regular: var(--color-text);
  --el-text-color-secondary: var(--color-text-secondary);
  --el-text-color-placeholder: var(--color-text-tertiary);
}
[data-theme="dark"][data-skin="on"] {
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

- `--color-text`（浅 `#141414` / 深 `#F2F0EA`）已由 skin.css 正确设置，回灌后下拉文本必为深/浅对比字，消除白字。
- 卡片/横幅/三卡：底图之上压薄玻璃（参考现有 `.conv-list` 的 `color-mix(... 22%, transparent)` 手法），保证文字可读。

## 7. 风险与回滚

- **风险 low**：仅新增资源文件与 pattern 字段；现有 4 类部位行为不变；不改 `skinSeries.ts`/后端接口。
- **风险 low**：脚本批量派生，失败单套不影响其余；`verify-skin-series.mts` 兜底。
- **回滚**：移除新增 6 文件名引用 + 删除新增 webp 即可回到「仅 4 类部位」旧态。
- **验证**：`openspec validate`；`vue-tsc --noEmit`（packages/ui）无新增错误；`agent-browser` 逐皮肤截图确认 11 图到位、下拉可读、无白字。

## 8. 方案 A 备注（后续可选，不在本变更）

若后续要彻底"转内置"：把 27 manifest 的 palette/motif 抽到 `skinSeries.ts` 生成程序化 data URI（参考现有 5 系列），删除 `skins.ts` 与 `assets/plugin-assets`，`applySkin` 内置分支已能直接消费。代价是丢失真图质感与插件二改能力——故本变更不做。

## 9. 实施顺序（tasks.md 对应）

1. 扩展 `build-skin-samples.mjs` 派生 6 类图；跑全 27 套。
2. `verify-skin-series.mts` 增强部位数校验。
3. `skins.ts` `autoPatterns` 补 6 字段。
4. `settings.ts` `SkinSurface` + `SKIN_CSS_VARS` + `applySurface` 下发。
5. `skin.css` 补卡片/横幅/三卡/下拉挂点 + EP 文本 token 修复。
6. `validate` + 浏览器截图核验。
