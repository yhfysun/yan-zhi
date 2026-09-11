# doyz 文档格式规范

> 这是 doyz-office 内部的中间文档格式。一份 `.doyz` 文件既能渲染成 Word 版式的 HTML 预览，又能导出成 Word / PPT / Excel，并保证图表数据可以在 Office 里继续编辑。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `format` | string | ✔ | 必须为 `"doyz"`，版本常量 |
| `version` | int | ✔ | 当前为 `1` |
| `kind` | string | ✔ | `document` / `presentation` / `spreadsheet` |
| `meta` | object |  | `title` `author` `created`（ISO 日期） |
| `styles` | object |  | 见下文 |
| `page` | object |  | 见下文 |
| `charts` | object |  | `chart_id -> chart`，供 blocks/slides/sheets 引用 |
| `blocks` | array | kind=document | 文档块序列 |
| `slides` | array | kind=presentation | 幻灯片序列 |
| `sheets` | array | kind=spreadsheet | 工作表序列 |

## styles

```jsonc
{
  "font": "微软雅黑",          // 西文与中文回退，PPT/Word 也会写入 eastAsia
  "headingFont": "微软雅黑",
  "fontSizePt": 11,
  "lineSpacing": 1.5,
  "accent": "C2410C",          // 不带 # 的 6 位 hex
  "palette": ["C2410C", "1E6FD9", "0F766E", ...]
}
```

## page

```jsonc
{
  "size": "A4" | "A3" | "Letter" | "16:9" | "4:3",
  "orientation": "portrait" | "landscape",
  "marginCm": [上, 右, 下, 左]
}
```

## charts

每个图表条目：

```jsonc
{
  "id": "chart_revenue",
  "type": "column",                 // 见下方图表类型表
  "title": "各季度营收与利润",
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [
    {"name": "营收", "values": [1820, 2140, 2560, 3010]},
    {"name": "利润", "values": [260, 318, 402, 505]}
  ],
  "options": {
    "legend": true,
    "dataLabels": false,
    "stacked": false,
    "widthCm": 15,
    "heightCm": 8,
    "xTitle": "季度",
    "yTitle": "万元"
  }
}
```

### 支持的图表类型

| `type` | 含义 | Word 原生 | PPT 原生 | Excel 原生 |
| --- | --- | --- | --- | --- |
| `column` | 簇状柱状 | ✔ | ✔ | ✔ |
| `column_stacked` | 堆叠柱状 | ✔ | ✔ | ✔ |
| `bar` | 条形 | ✔ | ✔ | ✔ |
| `bar_stacked` | 堆叠条形 | ✔ | ✔ | ✔ |
| `line` | 折线 | ✔ | ✔ | ✔ |
| `line_markers` | 带标记点折线 | ✔ | ✔ | ✔ |
| `area` | 面积 | ✔ | ✔ | ✔ |
| `area_stacked` | 堆叠面积 | ✔ | ✔ | ✔ |
| `pie` | 饼图 | ✔ | ✔ | ✔ |
| `doughnut` | 环形 | ✔ | ✔ | ✔ |
| `scatter` | 散点 | ✔ | ✔ | ✔ |
| `radar` | 雷达 | ✔ | ✔ | ✔ |

## blocks（document）

按顺序渲染。常见 type：

| type | 关键字段 |
| --- | --- |
| `heading` | `level` 1-6、`text` |
| `paragraph` | `text`，或 `runs: [{t,b,i,c}]` 富文本 |
| `bullets` | `ordered` bool、`items: [string]` |
| `quote` | `text` |
| `code` | `lang`、`text`（原样输出） |
| `pagebreak` | 渲染为虚线分页标记 |
| `table` | `header: [string]`、`rows: [[cell]]`，可选 `caption` |
| `image` | `src`（本地/data URI）、`widthCm`、`caption` |
| `chart` | `ref` 指向 charts[id]，可选 `caption` |
| `caption` | `text`（独立图说） |

## slides（presentation）

```jsonc
{
  "layout": "title" | "title_content" | "section" | "blank",
  "title": "...",
  "subtitle": "...",            // 仅 layout=title 用
  "bg": "F5F1EC",               // 可选底色 hex（不带 #）
  "blocks": [...],              // 同 document 的块，但会在超出页面时自动续页
  "notes": "..."                // 备注页
}
```

## sheets（spreadsheet）

```jsonc
{
  "name": "数据",
  "columns": [
    {"header": "月份", "width": 12, "type": "text|number|percent|currency|date",
     "format": "yyyy-mm"}
  ],
  "rows": [["1月", 520], ...],
  "freeze": "A2",               // 冻结窗格（默认首行冻结）
  "autoFilter": true,
  "charts": [
    {"ref": "chart_id", "anchor": "H2", "sourceRange": "可选,如 A1:D6"}
  ]
}
```

- 若 `ref` 指向的图表没有 `sourceRange`，导出 Excel 时会自动创建一张隐藏工作表 `图数据_<id>` 写入 categories/series，图表引用它；改数据即改图。
- 若指定 `sourceRange`，则把图表重新绑定到当前 sheet 的既有区域，首列作类别。

## 提示

- 颜色用 6 位 hex，不带 `#`。
- 中文字体名写中文即可（"微软雅黑"），导出时会自动映射到 Excel/PowerPoint/Word 的 eastAsia 字体名。
- 段落默认两端对齐，行距取 `styles.lineSpacing`。
- docx 原生图表依赖 python-docx 缺失的写入能力，由 doyz 在保存后做 zip 手术注入：内嵌的 xlsx 工作簿里就是 categories/series，打开 Word 后可直接「编辑数据」。