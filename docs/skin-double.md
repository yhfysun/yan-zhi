# 皮肤插件图片规范（skin-double）

> 本文档面向**自行设计皮肤插件**的开发者。所有数字、规则都来自 2026-09-13 的灰蒙蒙终修与 cover→tile 切换——把这一轮的踩坑沉淀成对外的硬约束。

## 1. 概述

每套皮肤插件必须提供 **7 张必备图**（外加若干可选），它们分两类：

| 类型 | 贴合方式 | CSS 关键字 | 例子 |
|------|----------|-----------|------|
| **壁纸（cover）** | 拉伸铺满容器，超出裁掉 | `background-size: cover` | `wallpaper.webp` / `wallpaper-dark.webp` |
| **部件图（rect tile）** | 按自然尺寸矩形平铺 | `background-size: auto; background-repeat: repeat` | `task-list-bg.webp` / `input-bg.webp` / `button-bg.webp` / `dialog-bg.webp` / `cat-tag-bg.webp` / `titlebar-bg.webp` |

> **rect tile 即 `repeat`**——CSS 里 `background-repeat: repeat` 沿水平和垂直两个方向矩形网格平铺图样（默认行为）。所以"rect tile 不就完了吗"= 直接 `repeat`，不要绕路。

## 2. 必备文件清单

放在插件 `assets/` 目录顶层，文件名固定（前端按文件名取值，**不要改名**）。

### 2.1 壁纸类（cover 拉伸）

| 文件名 | 用途 | 推荐尺寸 | 备注 |
|--------|------|---------|------|
| `wallpaper.webp` | 浅色主题整屏背景 | **1920×1080** 或 2560×1440（16:9） | 整张大图，**可以**有具体人物/场景/构图 |
| `wallpaper-dark.webp` | 深色主题整屏背景 | 同上 | 通常由浅色派生（见 §7.2） |

### 2.2 部件图（rect tile 平铺）

| 文件名 | 用途 | 推荐自然尺寸 | 拼贴规则 |
|--------|------|------------|---------|
| `task-list-bg.webp` | 侧栏列表 / 任务列表 / 文件面板底图 | **480×270** | 必须可水平+垂直无缝拼接 |
| `input-bg.webp` | 输入框底图 | 480×270 | 同上 |
| `button-bg.webp` | 按钮底图 | 480×270 | 同上 |
| `dialog-bg.webp` | 弹窗 / 右键菜单 / 代码模式 / 浏览器外壳 / 通用大面板 | 480×270 | 同上 |
| `cat-tag-bg.webp` *(可选)* | 分类小标签 | 240×120 | 同上 |
| `titlebar-bg.webp` *(可选)* | 顶栏背景 | 480×120（细长） | 同上 |

> **所有部件图必须设计为可无缝平铺的"纹理"**——不要塞具体的图标、文字、人物到中央。纹理要均匀，主体分布要稀疏到反复拼接时不突兀。

### 2.3 不再使用的旧命名（迁移说明）

旧版本还用过的命名已废弃，新皮肤**不要**用：

- ~~`card-bg.webp`~~ → 统一用 `dialog-bg.webp`
- ~~`sidebar-bg.webp`~~ → 统一用 `task-list-bg.webp`
- ~~`bg.webp`~~ → 不接受任何"通用背景"命名

## 3. 核心规则：cover vs rect tile

### 3.1 为什么不能用 cover 拉伸小图？

| 操作 | 480×270 部件图 → 1000×600 容器 | 结果 |
|------|--------------------------------|------|
| `cover` 拉伸 | 横向放大 2.08× / 纵向放大 2.22× | **糊化**、边缘锯齿、像素感明显 |
| `rect tile` 平铺 | 480×270 原图按 2×3 网格重复 6 次 | **清晰**、原图细节保留 |

cover 是**破坏性放大**——浏览器内核用的是 nearest/bilinear 缩放，纹理细节会永久丢失，无法复原。

### 3.2 为什么不能用 cover 后 transform 调？

- `transform: scale(...)` 只是调整最终显示尺寸，**不能修复已糊化的纹理**
- 用 transform 调整 + cover 拉伸 = 双重退化（先糊化再缩放）
- 想让部件图"匹配容器尺寸"= 把部件图本身就设计成那个尺寸的**可平铺**纹理

### 3.3 决策树

```
这张图是用来铺满整屏的吗？
├─ 是 → wallpaper.webp / wallpaper-dark.webp → cover 拉伸
└─ 否（装饰纹理 / 部件底图）
   └─ → 部件图 → rect tile (repeat) 平铺
```

## 4. rect tile 的硬约束

### 4.1 必须可无缝平铺（seamless tile）

- 左右边缘像素必须能衔接（拼一道竖线看不出缝）
- 上下边缘同理
- 验证方法：把图缩到 50% 大小看四周是否有拼接缝
- 推荐做法：内容居中 + 边缘用纯色或低密度装饰

### 4.2 推荐自然尺寸

| 用途 | 自然尺寸 | 理由 |
|------|---------|------|
| 通用部件图 | **480×270** | 16:9 与多数容器比例接近；放大 1.5× 内不糊；体积适中 |
| 小标签 | 240×120 | 标签小，纹理细节不需太多 |
| 顶栏 | 480×120 | 细长横向条带 |

### 4.3 不允许的尺寸

- **小于 200×200**——细节丢失，平铺时全是马赛克
- **大于 800×800**——文件过大，加载慢；且大图平铺时单 tile 过大显得稀疏

### 4.4 单文件大小

- 优化后 **≤ 50 KB**
- WebP 有损 q=80 通常足够（皮肤纹理不像照片那么吃质量）
- 如果实在压不下去，先缩尺寸再压质量

## 5. 配色与对比度

### 5.1 暗色主题适配

皮肤包里的部件图通常按**浅色主题**生成。暗色主题下，前端会自动叠一层暗色 scrim：

```css
linear-gradient(rgba(16, 31, 40, 0.78), rgba(16, 31, 40, 0.78)) /* 深色 78% 不透明 */
+ url('task-list-bg.webp')  /* 原部件图 */
```

**这意味着**：
- 浅色图在暗色下会被压成深色（亮度 240 → 约 56）
- 图的**亮度**会被压低，但**色相**保留
- 推荐：用中性灰（不饱和度 > 50%）做部件图，避免高饱和大色块（压暗后会变成深灰块）

### 5.2 文字叠加约束

部件图上常常叠文字（按钮文字、列表项文字）：

- 避免高对比图案（纯黑线条 + 纯白背景）——叠加文字后会糊
- 玻璃态皮肤会再叠 `--glass-bg`（半透明暗色）——图案会自动变淡
- 文字推荐 16:1 以上对比度（实际打 9:1 即可）

## 6. 资源命名与目录结构

### 6.1 推荐结构

```
my-skin-plugin/
├── manifest.json
├── assets/
│   ├── wallpaper.webp
│   ├── wallpaper-dark.webp
│   ├── task-list-bg.webp
│   ├── input-bg.webp
│   ├── button-bg.webp
│   └── dialog-bg.webp
├── preview.webp      # 皮肤市场缩略图（市场展示用，与壁纸无关）
└── README.md
```

### 6.2 文件名强制规则

- 全部小写 + 连字符 `-`（不要 `_` 不要驼峰）
- 不要带版本号/日期（`task-list-bg-v2.webp` ✗）
- 不要带主题前缀（`dark-task-list-bg.webp` ✗——用文件名 `wallpaper-dark.webp` 已表达暗色）

## 7. 资源构建与去水印

### 7.1 AI 生图去水印

多数 AI 生图模型会在右下角加"AI生成"角标：

- `scripts/build-skin-samples.mjs` **自动裁底 10%** 去除
- 入包前**必须目检**每一张
- 不传 `footnote` 大多数模型不会加，但仍偶尔会带（5 张里 4 张带）——靠裁兜底

### 7.2 深色壁纸派生

浅色 `wallpaper.webp` → 派生 `wallpaper-dark.webp`：

- 脚本：`scripts/build-skin-dark-variants.mjs`
- 默认参数：`brightness 0.58, saturation 0.72`
- 不需要手画深色壁纸

### 7.3 源图存档

原始生成的高清 PNG 存到：

```
dev/skin_regenerated/<skinId>.source.png
```

- 重建 / 二次微调时按 `.source.png` 后缀 key 优先匹配
- 不参与运行时打包

## 8. manifest 配置示例

```json
{
  "id": "my-skin",
  "name": "我的皮肤",
  "version": "1.0.0",
  "category": "皮肤",
  "permissions": [],
  "contributes": {
    "themes": [
      {
        "id": "my-skin",
        "name": "我的皮肤",
        "kind": "skin",
        "category": "动漫",
        "preview": "preview.webp",
        "wallpaper": {
          "light": "wallpaper.webp",
          "dark": "wallpaper-dark.webp",
          "mask": 0.3
        },
        "primary": "#38BDF8",
        "primaryLight": "#DBF0FD",
        "primaryDark": "#0C6E9E",
        "accent": "#A78BFA",
        "gradient": "linear-gradient(135deg, #38BDF8, #A78BFA)",
        "orb1": "#38BDF8",
        "orb2": "#A78BFA",
        "orb3": "#0EA5E9",
        "surface": {
          "taskListPattern": "task-list-bg.webp",
          "inputPattern": "input-bg.webp",
          "buttonPattern": "button-bg.webp",
          "dialogPattern": "dialog-bg.webp",
          "menuPattern": "dialog-bg.webp",
          "codePattern": "dialog-bg.webp",
          "browserPattern": "task-list-bg.webp",
          "catTagPattern": "...",
          "titlebarPattern": "...",
          "borderPattern": "...",
          "glass": "#FFF5F7",
          "glassDark": "#241B20",
          "glassAlpha": 0.78,
          "glassAlphaDark": 0.55,
          "glassBlur": 8,
          "border": "rgba(56,189,248,0.35)",
          "borderDark": "rgba(56,189,248,0.30)",
          "radius": 12,
          "buttonRadius": 6,
          "text": "#141414",
          "textSecondary": "#4A4A45",
          "textTertiary": "#71706A"
        }
      }
    ]
  }
}
```

### 8.1 surface 字段说明

| 字段 | 类型 | 用途 |
|------|------|------|
| `taskListPattern` | 文件名 / CSS 值 | 侧栏列表底图 |
| `inputPattern` | 文件名 / CSS 值 | 输入框底图 |
| `buttonPattern` | 文件名 / CSS 值 | 按钮底图 |
| `dialogPattern` | 文件名 / CSS 值 | 弹窗底图 |
| `menuPattern` | 文件名 / CSS 值 | 菜单底图（可与 dialog 共用） |
| `codePattern` | 文件名 / CSS 值 | 代码编辑器底图（可与 dialog 共用） |
| `browserPattern` | 文件名 / CSS 值 | 浏览器外壳底图（可与 task-list 共用） |
| `catTagPattern` | 文件名 / CSS 值 / `repeating-linear-gradient(...)` | 分类标签底图 |
| `titlebarPattern` | CSS 值 | 顶栏底图（推荐 `linear-gradient`，不要图片） |
| `borderPattern` | CSS 值 | 装饰边框底图（推荐 `repeating-linear-gradient`） |
| `glass` / `glassDark` | 颜色 | 玻璃基色 |
| `glassAlpha` / `glassAlphaDark` | 0~1 | 玻璃透明度（暗色推荐 0.55） |
| `glassBlur` | 像素 | 玻璃模糊半径（推荐 8） |
| `radius` / `buttonRadius` | 像素 | 圆角 |
| `text` / `textSecondary` / `textTertiary` | 颜色 | 文字三档（暗色下分别对应浅色文字三档） |

### 8.2 值约定

- **文件名** → 前端自动包装为 URL（`/api/plugin-assets/<id>/<filename>`）
- **完整 CSS 值**（`data:...`、`linear-gradient(...)`、`url(...)`、含空白的复合值）→ **原样透传**，不二次包装
- 前端判断逻辑：`!startsWith('data:|http:|url(')` 且无括号且无空白 → 视为文件名包装

## 9. patternFit 选项

`surface.patternFit` 可选，控制所有部件图的贴合方式：

| 取值 | 行为 | 适用 |
|------|------|------|
| `cover` | 拉伸铺满 | **不推荐**用于部件图（糊化） |
| `contain` | 完整显示，可能留白 | 极少用 |
| `repeat` *(默认)* | 自然尺寸矩形平铺 | **所有部件图** |
| `repeat-x` | 仅水平平铺 | 横向条带（如顶栏） |

> **改动历史**：2026-09-13 默认从 `cover` 改为 `repeat`——之前默认让部件图拉伸糊化，是用户最强烈反馈的"皮肤图片不清晰"的根因。

## 10. 自检清单（出包前逐项勾）

### 10.1 文件齐备
- [ ] `wallpaper.webp`（浅色壁纸）
- [ ] `wallpaper-dark.webp`（深色壁纸）
- [ ] `task-list-bg.webp`（侧栏底图）
- [ ] `input-bg.webp`（输入框底图）
- [ ] `button-bg.webp`（按钮底图）
- [ ] `dialog-bg.webp`（通用大面板底图）
- [ ] 可选：`cat-tag-bg.webp` / `titlebar-bg.webp`（若打算自定义）

### 10.2 部件图质量
- [ ] 自然尺寸 480×270（±100 误差可接受）
- [ ] 左右边缘像素可无缝拼接
- [ ] 上下边缘像素可无缝拼接
- [ ] 单文件 ≤ 50 KB
- [ ] 无"AI生成"角标（build-skin-samples.mjs 已自动裁底 10%，但要目检）

### 10.3 视觉验证（在应用里实际切换）
- [ ] 浅色主题：壁纸铺满，部件图纹理清晰可辨
- [ ] 深色主题：壁纸铺满，部件图深色后仍能看出纹理
- [ ] 侧栏列表项（`.conv-item`）能看到 `task-list-bg` 纹理
- [ ] 输入框聚焦时边框清晰（皮肤主色描边）
- [ ] 按钮 hover 态主色光晕可见
- [ ] 弹窗 / 菜单 / 代码 / 浏览器外壳纹理一致
- [ ] 文字对比度 ≥ 4.5:1（WCAG AA）

### 10.4 manifest 字段
- [ ] `wallpaper.light` / `wallpaper.dark` 指向正确文件
- [ ] `surface.taskListPattern` / `inputPattern` / `buttonPattern` / `dialogPattern` 正确
- [ ] `glassAlpha` / `glassAlphaDark` 已配（暗色推荐 0.55）
- [ ] `glassBlur` 已配（推荐 8）
- [ ] `patternFit` 不写（默认 `repeat` 已正确）

### 10.5 自动化验证
- [ ] `scripts/verify-skin-series.mts` 通过
- [ ] `scripts/build-skin-samples.mjs` 跑过一次（已生成深色壁纸、已去水印）
- [ ] `dev/skin_regenerated/<skinId>.source.png` 源图已存档

## 11. 常见踩坑

| 坑 | 后果 | 解法 |
|----|------|------|
| 部件图塞具体人物/图标到中央 | 平铺后到处都是重复的图案 | 改成均匀纹理 + 边缘纯色 |
| 部件图分辨率过大（>1000px） | 平铺时单 tile 占满容器，像素感强 | 缩到 480×270 |
| 用 cover 拉伸小图做底图 | 文字看不清、糊化 | 改成 rect tile (repeat) 平铺 |
| 图边缘有突变颜色 | 平铺时出现明显接缝 | 边缘统一用纯色或低密度装饰 |
| 忘记提供深色壁纸 | 暗色主题下壁纸还是浅色 | `scripts/build-skin-dark-variants.mjs` 派生 |
| AI 生图未去水印 | 右下角"AI生成"角标 | `scripts/build-skin-samples.mjs` 自动裁；目检 |
| surface 字段名错（用 task-list-bg 不是 taskListPattern） | 部件图加载不出来 | 字段名是**驼峰**，与 CSS 变量 `--skin-task-list-pattern` 对应 |
| glassAlphaDark 配太高（>0.8） | 壁纸看不见，全是黑 | 暗色推荐 0.55，浅色 0.78 |
| 壁纸用 cover 但图分辨率小 | 壁纸糊化 | 壁纸必须 ≥ 1920×1080（4K 推荐 2560×1440） |
| 把 `data:image/...` 直接写到 manifest | 文件名分支走错，被二次 url() 包装 | 完整 CSS 值原样透传，分支已正确 |

## 12. 与 design 系统的对应

皮肤系统色板最终落到 3 套 CSS 变量（`packages/ui/src/styles/skin.css` 第 143、193、766 行附近）：

```
--glass-bg = color-mix(--skin-glass-tint, --skin-glass-alpha)
--glass-filter = blur(--skin-glass-blur) saturate(1.08)
--skin-overlay-tint = mix(--skin-surface, black, 0.25)   /* 暗色 */
                  = mix(--skin-surface, white, 0.55)   /* 浅色 */
```

理解这三个变量就能预测皮肤模式下所有面板的实际外观——壁纸透出度、玻璃厚度、文字色相都从这里派生。