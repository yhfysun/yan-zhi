# 皮肤系统评审 + 配色契约 v2

> 评审对象：`docs/skin-and-ops-plugin-plan.md`（皮肤部分已落地）+ 现存实现
> **状态：P0-1 ~ P0-4、P1、P2 均已实施并验证通过**（2026-09-13）。

## 实施结果

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0-1 | 皮肤配色生效 | ✅ `settings.ts` update/applyPalette |
| P0-2 | 派生函数 `deriveSkinTokens()` + CSS 变量下发 | ✅ `settings.ts`、`core/plugin/types.ts` |
| P0-3 | `skin.css` 消费分级 token | ✅ 向后兼容 `var(--skin-x, 原值)` |
| P0-4 | 纱罩改主色系 + 壁纸默认值下调 | ✅ 纱罩 0.7→0.35，blur 12→5，mask ×0.8 |
| P1-1 | 部位 `fit` 字段 | ✅ 机制已落地（4 套源图偏小的样例皮肤已启用 repeat） |
| P1-2 | WCAG 对比度校验 | ✅ 并入 `scripts/verify-skin-series.mts`，32 套 × 明暗全通过 |
| P1-3a | 深色壁纸变体 | ✅ 全 27 包派生 `wallpaper-dark.webp`（`scripts/build-skin-dark-variants.mjs`），`skins.ts` wallpaper.dark 已指向，校验清单已纳入 |
| P1-3b | 压缩过度壁纸重出（ink-mono 52KB / mountain-dawn 67KB / aurora 81KB） | ✅ 2026-09-13 ImageGen 重出（源图 `dev/skin_regenerated/<skinId>.source.png`），连同 grand-line / ninja-village 共 5 套换新图 |
| P1-3c | 壁纸水印清理 | ✅ 全 27 包目检：仅 skin-sample-* 四包带入「AI生成」水印（源图右下角），`build-skin-samples.mjs` 增加裁底 10% 步骤后重建，复检无水印 |
| P2 | 计划文档状态与过时规格订正 | ✅ 状态已标注；图片规格（2560×1600/≤800KB → 实际 1600×1067 + 深色变体）、mask 类型、去水印注意事项已订正 |

### IP 风险（2026-09-13 已解决）

- ~~`skin-grand-line`（路飞/草帽海贼团）、`skin-ninja-village`（鸣人/木叶村）为明显动漫 IP 形象~~
  已用 ImageGen 重出**原创**题材替换：伟大航路 → 原创帆船航海落日，忍道 → 原创忍者村落暮色，
  均无任何既有作品角色/标志元素，源图存 `dev/skin_regenerated/`。

验证：`vue-tsc --noEmit` 零错误；`apps/web vite build` 通过；
`verify-skin-series.mts` 输出「32 套 × 明暗两模式，阈值 正文≥4.5 / 次级≥3 + ALL SVG OK / ASSETS OK」。

---

> 结论：计划**的主体已实施完毕**（皮肤插件 27 套、内置系列 5 套、ops-shell 插件、更多菜单均在源码中），
> 但计划本身**缺了两块最关键的约定**：「皮肤配色契约」和「图片资源规格」。
> 这两块的缺失，正是「选了图片皮肤、暗色系、灰蒙蒙」的直接原因。

---

## 一、计划文档本身的缺口

| # | 缺口 | 现状 | 建议 |
|---|---|---|---|
| 1 | 文档状态未更新 | 头部仍写「待确认」，但皮肤/运维均已落地 | 拆成「皮肤（已落地）」+「运维（已落地）」+「待办」三段，标注实现位置 |
| 2 | **完全没有「配色契约」** | §3.1 数据模型只字未提皮肤如何控制输入框/字体/弹窗/列表/下拉的配色 | 见 §二，这是本次要补的核心 |
| 3 | **没有「图片资源规格」** | 无尺寸/fit/压缩约定 → 320×72 的图被 `cover` 拉到 820px 宽 | 见 §三 |
| 4 | 深浅色对称未兑现 | 文档写「按深浅色各一张 wallpaper」，实际 `WALLPAPER` 常量 light/dark 同一个值，部件图也只有一份 | 要么补图，要么在文档里改为「单图 + 暗色派生」并说明 |
| 5 | 皮肤切换的 palette 联动未定义 | 导致皮肤自带配色失效（见 §四-1） | 文档明确「选皮肤即切 palette，主题色可覆盖」 |
| 6 | §3.4 图片规格与实际不符 | 写「≤800KB / 2560×1600」，实际 1536×1024 / 52~411KB | 更新为真实规格 + 下限 |
| 7 | 无可读性自动校验 | `scripts/verify-skin-series.mts` 只查 SVG 结构 + 文件齐全 | 加 WCAG 对比度校验（text-on-surface / text-on-input / text-on-list） |
| 8 | 无性能章节 | 27 套 × 5 图常驻包体；`backdrop-filter` 十余处 + 壁纸 14px 模糊 | 加低端设备降级策略（关 backdrop-filter、降 blur） |
| 9 | 用户自制皮肤的字段兜底 | `applySurface` 里大量 `?? 中性灰`，第三方皮肤少填字段就变灰 | 兜底改为**从 primary 派生**，见 §二 |

---

## 二、配色契约 v2：每套皮肤自带「配色兜底」

**设计原则：图片是锦上添花，配色才是骨架。任何一张图加载失败 / 被压暗 / 未配置，UI 都必须保留该皮肤的色相与可读性。**

### 2.1 三层兜底链

```
皮肤显式值  →  由 primary 自动派生  →  主题基线（light / dark）
tokens.dark.inputBg      derive(primary)        #0E0F12
```

关键是**第二层**：现在所有兜底都是硬编码中性灰，改成从 `primary` 派生后，
27 套皮肤即使一个字段都不填，暗色下也各有各的色相，不再千篇一律的灰。

### 2.2 Token 表

分 `light` / `dark` 两套，每套可选填；未填走派生。

**A. 主色层（字段已存在，但当前不生效，见 §四-1）**
`primary` · `primaryHover` · `primaryActive` · `onPrimary`（主色上的文字）· `accent` · `gradient` · `orb1-3`

**B. 文本层（新增）**

| token | 派生规则（dark） | 派生规则（light） |
|---|---|---|
| `text` | `mix(#FFF, primary, 8%)` | `mix(#000, primary, 8%)` |
| `textSecondary` | `mix(text, #000, 28%)` | `mix(text, #FFF, 32%)` |
| `textTertiary` | `mix(text, #000, 45%)` | `mix(text, #FFF, 50%)` |
| `textDisabled` | `mix(text, #000, 60%)` | `mix(text, #FFF, 62%)` |

> 现在硬编码的 `#F2F0EA / #B8B8B0 / #8E8E86` 全部替换成这三个变量。

**C. 容器层（新增，取代单一的 `glass`）**

| token | 用途 | 派生（dark） |
|---|---|---|
| `surface` | 侧栏 / 顶栏 / 面板 | `mix(baseBg, primary, 6%)` |
| `surfaceRaised` | 卡片 / 弹窗 / 下拉 / 菜单 | `mix(baseBg, primary, 11%)` |
| `surfaceSunken` | 输入框 / 代码区 / 内凹容器 | `mix(baseBg, #000, 25%)` |
| `surfaceHover` | 列表项 / 菜单项 hover | `mix(surfaceRaised, primary, 8%)` |
| `surfaceActive` | 选中项 | `mix(primary, surfaceRaised, 70%)` |
| `overlay` | 弹窗遮罩 | `rgba(mix(baseBg, primary, 10%), 0.55)` |

> **关键**：现在「所有面共用一个 `glassAlpha`」是灰的根源。
> 拆成三级后，`surfaceSunken`（输入框）给 0.88 保可读，`surface`（大面板）给 0.55 让壁纸透出来，
> 层次和通透感同时到手。

**D. 控件层（用户点名的几处，全部新增）**

```
input:      bg · border · text · placeholder · focusRing
list:       bg · itemHover · itemActive · itemText · divider
dropdown:   bg · itemHover · itemActive · border · text
dialog:     bg · border · titleBg · titleText · text
button:     bg · bgHover · text            (text 已有 buttonText)
```

每个 token 都可以只给一个色，其余按下列规则派生：

```
input.bg       ← surfaceSunken          input.border    ← mix(primary, bg, 55%)
input.text     ← text                   input.placeholder ← textTertiary
list.bg        ← surface                list.itemHover  ← surfaceHover
list.itemText  ← text                   list.divider    ← mix(primary, bg, 22%)
dropdown.bg    ← surfaceRaised          dropdown.itemActive ← surfaceActive
dialog.bg      ← surfaceRaised          dialog.titleBg  ← mix(primary, surfaceRaised, 18%)
button.bg      ← surfaceRaised          button.text     ← onPrimary
```

**E. 落地点（已完成）**

- `packages/core/src/plugin/types.ts` → `ThemePalette.surface` 增加上述字段 ✅
- `packages/ui/src/stores/settings.ts` → 新增 `deriveSkinTokens(primary, dark)`，
  把结果写成 `--skin-input-bg` / `--skin-list-hover` / `--skin-dropdown-bg` / … 一组 CSS 变量 ✅
- `packages/ui/src/styles/skin.css` → 硬编码色换成 `var(--skin-xxx, 原值)` ✅

---

## 三、图片显示：为什么糊 / 为什么看不见

### 3.1 实测资源尺寸 vs 实际容器

| 部位 | 现有图 | 实际容器 | 结论 |
|---|---|---|---|
| `input-bg` | 320×72（sample 系）/ 900×140 | 聊天输入框 ≈820×120 | 2.5× 拉伸 → 糊 |
| `task-list-bg` | 420×300 / 480×900 | 会话列表 ≈280×800 | 竖长条上 cover → 严重裁切+放大 |
| `button-bg` | 180×44 / 240×96 | 每个按钮各一份 | 每个按钮都重绘一张拉伸图，脏 |
| `dialog-bg` | 760×520 / 900×680 | 大弹窗 1200×800+ | 勉强 |
| `wallpaper` | 1536×1024，52~411KB | 全屏 | 分辨率够，但被 blur+mask 毁掉 |

### 3.2 三条硬伤

**① `background-size: cover` 一刀切**
小图（按钮/输入框/列表）应该平铺成纹理，不是拉伸铺满。
→ 每个部位加 `fit` 字段：`cover | contain | repeat | repeat-x`，**默认值改为按部位区分**：
按钮/输入框 = `repeat`，列表/弹窗 = `cover`。

**② 暗色黑纱罩压 70%**
`settings.ts:569`：`scrim = linear-gradient(rgba(10,10,12,0.7), rgba(10,10,12,0.7))`
纯黑 + 0.7 不透明 → 部件图在暗色下只剩 30% 可见度，且色相被拉向中性灰。
→ 改为**用皮肤自己的深色压**，强度降到 0.30~0.40：
```ts
const scrim = dark
  ? `linear-gradient(${tintAlpha(glassTint, sf.patternScrim ?? 0.35)}, ${tintAlpha(glassTint, sf.patternScrim ?? 0.35)})`
  : '';
```

**③ 壁纸遮罩 + 模糊过重**
`wallpaper.mask` 普遍 0.40~0.50、`blur` 默认 12~14px。
→ 默认降到 `mask 0.26 / blur 5`；可读性改由 **surfaceSunken / surfaceRaised 的不透明度**保证，
而不是靠把壁纸糊掉。这样壁纸细节能看见，文字区照样清晰。

### 3.3 资源规格（补进计划 §3.4）

| 部位 | 建议尺寸 | 建议 fit | 体积下限 |
|---|---|---|---|
| wallpaper | 2560×1600 | cover | ≥180KB |
| dialog-bg | 1600×1000 | cover | ≥120KB |
| task-list-bg | 720×1200 | cover（纵向平铺亦可） | ≥80KB |
| input-bg | 1600×160 | repeat-x | ≥40KB |
| button-bg | 240×96 | repeat | ≥20KB |

现有 `ink-mono`(52KB) / `mountain-dawn`(67KB) / `aurora`(81KB) 明显压过头，建议重出。

---

## 四、两个必须先修的确定性缺陷

### 4.1 皮肤自带配色完全不生效（P0）

- `settings.ts:427`：`applyPalette` 只找 `t.kind !== 'skin'` 的主题
- `settings.ts:404`：只有 `isBuiltinSkinId(skin)` 才同步 `palette`
- 结果：27 套插件皮肤的 `primary / accent / gradient / orb1-3` 全是死数据

**修法**（最小改动，对齐内置系列行为）：
```ts
// update()：所有皮肤都同步 palette
if (patch.skin !== undefined) {
  const pal = isBuiltinSkinId(patch.skin)
    ? builtinSeriesPalette(patch.skin)
    : (patch.skin || undefined);
  if (pal) patch = { ...patch, palette: pal };
}
// applyPalette：放宽 kind 过滤，允许皮肤主题作为 palette
const found = usePluginStore().themes.find((t) => t.id === palette);
```
用户在「主题色」里手动另选时仍可覆盖（后写生效）。

### 4.2 暗色兜底全是中性灰（P0）

- `settings.ts:543`：`glassDark ?? '#1d1d1c'`
- `settings.ts:544`：`glassAlphaDark ?? 0.78`
- 27 套里只有 4 套（樱夜 / 赛博宵 / 秦时明月 / 极光雪原）配了 `glassDark`

**修法**：改用 §二 的派生函数，从皮肤 `primary` 生成 `glassDark`。
一次改完，27 套全都有自己的暗色底色，零手改。

---

## 五、实施步骤（建议顺序）

| 阶段 | 内容 | 涉及文件 |
|---|---|---|
| **P0-1** | 皮肤配色生效（§4.1） | `settings.ts` |
| **P0-2** | 派生函数 `deriveTokens()` + 新增 CSS 变量下发 | `settings.ts`、`core/plugin/types.ts` |
| **P0-3** | `skin.css` 硬编码色换 `var(--skin-*, 原值)`，新增输入/列表/下拉/弹窗分级 token | `styles/skin.css` |
| **P0-4** | 纱罩改主色系 + 降到 0.35；壁纸 mask/blur 默认值下调 | `settings.ts` |
| **P1-1** | 部位 `fit` 字段 + CSS 应用（按钮/输入框 repeat，列表/弹窗 cover） | `types.ts`、`settings.ts`、`skin.css` |
| **P1-2** | `verify-skin-series.mts` 加 WCAG 对比度校验（≥4.5:1 正文 / ≥3:1 次级） | `scripts/` |
| **P1-3** | 资源重出（低于下限的几套）+ 规格写进计划文档 | `assets/plugin-assets/` |
| **P2** | 更新 `docs/skin-and-ops-plugin-plan.md` 状态与缺口章节 | `docs/` |

每步收口：`vue-tsc --noEmit`（packages/ui）+ `vite build`（apps/web）+ 皮肤校验脚本。

---

## 六、一句话总结

> 现在的皮肤系统 **只做了「贴图」，没做「配色」**。
> 贴图在暗色下被遮罩/纱罩/不透明玻璃三层压成灰，配色又因为 palette 不联动而完全没生效——
> 于是 27 套皮肤在暗色下长得几乎一样，都是灰的。
> 补上「配色契约 + 派生兜底」之后，**图片只负责锦上添花，配色负责撑住整个皮肤的身份**。
