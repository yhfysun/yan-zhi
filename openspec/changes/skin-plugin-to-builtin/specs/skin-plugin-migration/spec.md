# skin-plugin-migration Specification

## Purpose

该能力在保留插件皮肤形态（`apps/server/src/plugins/skins.ts` 声明式 + `apps/server/assets/plugin-assets/<id>/` 真图资源 + 皮肤库入口）的前提下，补齐用户枚举的部位图片皮肤覆盖——卡片、滚动图(横幅)、新建任务三个卡片、下拉框、浏览器外壳专属图——并修复皮肤模式下下拉框白底白字。插件皮肤仍以 `kind:'skin'` 注册、可在皮肤库切换与下载二改，资源经既有 `GET /api/plugin-assets/:pluginId/*` 下发，不新增后端接口。内置系列（`skinSeries.ts`）保持程序化、并行不改动。

## ADDED Requirements

### Requirement: Plugin skins gain card, banner, new-task-card, dropdown and browser images

For every plugin skin (27 manifests in `skins.ts`), the asset folder `apps/server/assets/plugin-assets/<id>/` SHALL contain derived real-image parts `card-bg.webp`, `banner.webp`, `task-card-1.webp`, `task-card-2.webp`, `task-card-3.webp`, `dropdown-bg.webp`, and a dedicated `browser-bg.webp` (replacing the previous list-image reuse). The `surface` schema SHALL carry `cardPattern`, `bannerPattern`, `taskCardPattern`, `dropdownPattern`, `browserPattern` fields, and `skin.css` SHALL paint the corresponding surfaces with them.

#### Scenario: Each skin has the full image set

- **WHEN** `scripts/verify-skin-series.mts` checks `apps/server/assets/plugin-assets/<id>/` for every skin
- **THEN** each folder contains wallpaper + the original 4 parts + the 6 new parts (≥ 11 images), or the verification exits non-zero

#### Scenario: New surfaces show skin images

- **WHEN** a plugin skin is active
- **THEN** cards (`.el-card/.glass-card/.ov-card`), the banner region (`.skin-banner`), the new-task three cards (`.task-create-card`), the dropdown popper, and the browser shell (`.browser-tabbar/.browser-toolbar`) render the skin's generated images (dropdown additionally gets correct text contrast)

### Requirement: Derived part-images keep visual coherence with existing parts

The new part-images SHALL be derived from each skin's existing `wallpaper.webp` (the same source as the current 4 parts), so the new surfaces stay visually consistent with dialog/list/input/button within a skin.

#### Scenario: Coherent series

- **WHEN** a reviewer compares a skin's `card-bg.webp` / `banner.webp` against its `dialog-bg.webp`
- **THEN** they share the same wallpaper motif/color family (no disjoint artwork)

### Requirement: Dropdown text contrast fixed under skin mode

Under `[data-skin="on"]` the system SHALL export Element Plus text tokens (`--el-text-color-primary/-regular/-secondary/-placeholder`) from `--color-text` / `--color-text-secondary` / `--color-text-tertiary`, and SHALL force dropdown item text to `var(--color-text)` so selected/hover/placeholder text is always readable on the near-white glass background. No dropdown SHALL show white text on white background in light-themed skins.

#### Scenario: Dropdown readable on light glass

- **WHEN** a light-themed skin is active and the user opens any `el-select` / `el-dropdown` / `el-cascader` / `el-date-picker` popper
- **THEN** the popper background is the skin glass and all item/placeholder/selected text is dark (high contrast), with NO white-on-white text

### Requirement: Browser shell gets a dedicated image

The browser shell (`.browser-tabbar`, `.browser-toolbar`) SHALL receive a dedicated `browser-bg.webp` via `--skin-browser-pattern` (not the reused list image), keeping the web content area as the native BrowserView layer.

#### Scenario: Browser shell shows dedicated skin

- **WHEN** a skin is active and the built-in browser panel is open
- **THEN** the tab bar and toolbar show the skin's dedicated browser image while the page content remains the native render

## NON-SCOPE (explicit)

- Converting plugin skins into the programmatic builtin series (`skinSeries.ts`) — tracked as a later optional consolidation (方案 A), NOT implemented here.
- Adding backend endpoints or changing `registerBuiltinSkins` registration semantics.
- Modifying the builtin `skinSeries.ts` 5 series.
