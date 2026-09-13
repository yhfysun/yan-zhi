# 为什么

经代码审查，当前皮肤系统由**两套并行实现**组成。关键事实先纠偏：**插件皮肤并非损坏**——`apps/server/assets/plugin-assets/<skinId>/` 目录**经核实存在**，由 `GET /api/plugin-assets/:pluginId/*`（`apps/server/src/routes/plugins.ts:221`，`BUILTIN_ASSETS_DIR` 解析到该目录）正常服务；此前 `autoPatterns` 写 `url(/api/...)` 被前端再包一层 `url("...")` 导致整条失效的 bug 已修复（`skins.ts:14-19` 注释为证），插件皮肤能正常出图。

1. **内置系列皮肤（健康）** —— `packages/ui/src/styles/skinSeries.ts`：纯前端、模块加载时一次性用 SVG `data:` URI 程序化生成「同系列整套纹理」，覆盖 11 个部位（壁纸深浅/分类标签/会话列表/输入框/按钮/弹窗/标题栏/菜单/代码/浏览器/滚动条），零外部依赖、离线可用。

2. **插件皮肤（可用但覆盖不全）** —— `apps/server/src/plugins/skins.ts`：27 个声明式 manifest（`kind:'skin'`，`registerBuiltinSkins()` 默认启用），壁纸与部件图为真图 webp，位于 `apps/server/assets/plugin-assets/<id>/`，经 `/api/plugin-assets` 下发。其 `autoPatterns`（`skins.ts:28-37`）只为每套皮肤产出 **4 类真图**（`task-list-bg` / `input-bg` / `button-bg` / `dialog-bg`），菜单/代码/浏览器**复用** `dialog-bg`/`task-list-bg`。**真正短板**：用户要求的 **卡片 / 滚动图(横幅) / 新建任务三个卡片 / 下拉框** 四类部位**完全没有对应皮肤图**，浏览器外壳也仅是列表图复用、非专属图。

3. **下拉框白底白字（独立 bug，皮肤模式通病）** —— 皮肤模式 `[data-skin="on"]` 下，`skin.css` 把每个 `el-popper.is-light`（含 `el-select-dropdown` / `el-cascader` 面板 / `el-dropdown-menu` / `el-date-picker` 面板）背景设为 `--el-bg-color-overlay` = `color-mix(in srgb, var(--skin-glass-tint) 95~97%, transparent)`，**浅色主题皮肤下近乎纯白玻璃（白底）**。但 `skin.css` / `tokens.css` 从未把 `--color-text`（skin 模式已正确设为 `#141414` / `#F2F0EA`）回灌到 Element Plus 文本 token 链（`--el-text-color-regular/-primary/-secondary/-placeholder`）。`tokens.css:154-155` 仅在 `[data-theme="dark"]` 定义 EP 文本色；浅色下选中项/placeholder 文本走 `--el-color-primary`，在浅主色皮肤（如 `skin-star-train` #6D8FE0、`skin-cloud-sea` #0E9BB5、`skin-aurora` #34D399）下对比度极低、白玻璃上近乎不可见 → **白字**。

4. **打包脆弱性（"转内置"的真实动机）** —— 插件皮肤依赖 `apps/server/assets/plugin-assets` + 安装包 extraResources 分发；打包版若不重出包资源不更新（项目记忆 09-13 行58："若用户跑的是打包版而非 dev，新 UI 根本不会生效，需 pnpm build:desktop 重出包"）。内置系列纯前端 data URI 无此问题——这是用户想"插件皮肤转内置皮肤"的合理动机。

# 改什么（两方案，推荐 B）

**方案 A — 整体转内置**：把 27 个插件皮肤并入 `skinSeries.ts` 为程序化内置系列（data URI），删除 `skins.ts` 与 `assets/plugin-assets`。
- 优点：零打包依赖、与内置系列完全统一、离线、彻底消除"转内置"诉求。
- 代价：丢失"真图"质感（变程序化 SVG）；丢失插件可下载 `.yzp` 二改重装能力；皮肤库插件入口形态改变。

**方案 B — 插件皮肤直接扩展（推荐，符合用户"如果通过插件皮肤直接修改就更好了"）**：保留 `skins.ts` 声明式 + 真图资源，补齐缺失部位与 bug。
- 为每套皮肤用脚本从壁纸派生 **card-bg / banner / task-card-1·2·3 / dropdown-bg / browser-bg** 真图（与现有 4 类同源自一张壁纸，视觉一致），落入 `assets/plugin-assets/<id>/`；
- `skins.ts` 的 `surface` 增 `cardPattern / bannerPattern / taskCardPattern / dropdownPattern / browserPattern`（文件名），`autoPatterns` 一并补齐；
- `settings.ts` `applySurface` 已通用处理这些 pattern（`asset()` 包 `pluginAssetUrl`），仅需把新字段并入 `SkinSurface` + `SKIN_CSS_VARS`；
- `skin.css` 补卡片/横幅/新建任务三卡/下拉框底图挂点，并修 EP 文本 token 对比（消白字）；
- 优点：保留真图与插件生态、改动最小、直接满足"带图片的皮肤做系列图片"；
- 代价：仍依赖打包分发（但现有机制已成熟，非新风险）。

> 本变更按 **方案 B** 落地（用户偏好插件直达）；方案 A 作为后续可选收口，不在本变更实现。

# 影响

- `apps/server/assets/plugin-assets/<id>/`（每套皮肤）：新增 6 个派生真图 `card-bg.webp` / `banner.webp` / `task-card-1.webp` / `task-card-2.webp` / `task-card-3.webp` / `dropdown-bg.webp`（浏览器改用专属 `browser-bg.webp` 替代复用）。
- `scripts/build-skin-samples.mjs`：扩展为从每套壁纸派生上述 6 类区域图（裁切/缩放/主色微调），支持 27 套批量生成；`scripts/verify-skin-series.mts` 增加部位数校验（每套 ≥ 11 图）。
- `apps/server/src/plugins/skins.ts`：`skinTheme()` `autoPatterns` 增 6 个文件名；`surface` 类型显式含这些 pattern 字段（原 `ThemePalette['surface']` 已可承载，前端 `SkinSurface` 同步）。
- `packages/ui/src/stores/settings.ts`：`SkinSurface` 增 `cardPattern/bannerPattern/taskCardPattern/dropdownPattern/browserPattern`；`SKIN_CSS_VARS` 增对应 `--skin-*-pattern`（browser 已存在 `--skin-browser-pattern`，仅改源）；`applySurface` 下发新变量（逻辑不变）。
- `packages/ui/src/styles/skin.css`：新增 `.el-card/.glass-card/.ov-card` → `--skin-card-pattern`；`.skin-banner`（首页 `.app-intro`/各页 hero）→ `--skin-banner-pattern`；`.task-create-card` → `--skin-task-card-pattern`；`.el-popper.is-light` 可选 → `--skin-dropdown-pattern`；补 EP 文本 token 回灌与下拉项强制对比。
- `packages/ui/src/styles/skinSeries.ts`：本变更**不改**（内置系列保持程序化，与插件皮肤并行；如需最终统一可走方案 A 后续）。
- 皮肤库 UI（`Settings.vue`/皮肤库面板）：无需改动（`themes` 列表仍按 `kind:'skin'` 呈现）。
- **不新增后端接口**；`registerBuiltinSkins` 注册语义不变。

# 与旧变更的关系

- 延续 09-13 已落地的「内置系列皮肤 + 皮肤消费端补全 + 真图样例皮肤」工作：本变更把当时**未覆盖的卡片/横幅/新建任务三卡/下拉框**四类部位补齐，并修当时遗留的下拉框白字。
- 下拉框对比修复与 `skin.css` `[data-skin="on"]` glass 体系同源，不引入新主题方案。
- `redesign-chat-and-nav`（导航/对话页皮肤）已落地结构不受影响。

# 所需 Skill 标注

- **`openspec`**（必需）：proposal/design/tasks/spec 编写与 `openspec validate` 校验。
- **`agent-browser`**（落地后必需）：逐一切换插件皮肤截图核验 卡片/横幅/新建任务三卡/下拉框/浏览器 图片到位、下拉框文字可读、无白字。
- ❌ 无需后端/Makers 系列。
