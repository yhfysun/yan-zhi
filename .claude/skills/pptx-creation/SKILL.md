---
name: pptx-creation
description: 创建、编辑、解析 PowerPoint 演示文稿（.pptx/.potx）。当用户要求"做 PPT""制作幻灯片""生成演示文稿""解析 PPT 内容"时触发。通过 python-pptx 或 pptxgenjs 生成专业幻灯片，支持自定义布局、图表、图片、表格、演讲者备注。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# PPT 制作与编辑（pptx-creation）

用 **python-pptx**（Python）或 **pptxgenjs**（Node.js）创建、编辑、解析 PowerPoint 演示文稿。通过 shell 执行脚本生成 .pptx 文件。

## 何时触发

- 用户说"做 PPT""制作幻灯片""生成演示文稿""做个汇报 PPT"等
- 用户要求解析/提取现有 .pptx 文件内容
- 用户要求编辑现有 PPT（修改文字、增删幻灯片）

## 依赖安装

首次使用时通过 shell 安装依赖：
```bash
pip install python-pptx Pillow
# 或 Node.js 方案
npm install pptxgenjs
```

## 标准流程

### 创建新 PPT

1. **理解需求**：明确主题、页数、每页内容、风格偏好
2. **编写脚本**：用 python-pptx 生成 .pptx
3. **执行**：通过 shell 运行脚本
4. **验证**：检查文件生成成功，回报路径

### 示例脚本（python-pptx）

```python
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# 标题页
slide = prs.slides.add_slide(prs.slide_layouts[6])
txBox = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(11), Inches(2))
tf = txBox.text_frame
p = tf.paragraphs[0]
p.text = "演示文稿标题"
p.font.size = Pt(44)
p.font.bold = True
p.font.color.rgb = RGBColor(0x1E, 0x27, 0x61)
p.alignment = PP_ALIGN.CENTER

# 内容页（标题 + 要点）
slide2 = prs.slides.add_slide(prs.slide_layouts[6])
title_box = slide2.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(12), Inches(1))
title_box.text_frame.text = "第一页标题"
title_box.text_frame.paragraphs[0].font.size = Pt(36)

body_box = slide2.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(12), Inches(5))
tf = body_box.text_frame
for i, point in enumerate(["要点一", "要点二", "要点三"]):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = f"• {point}"
    p.font.size = Pt(18)
    p.space_after = Pt(12)

prs.save("output.pptx")
```

### 解析现有 PPT

```python
from pptx import Presentation
prs = Presentation("input.pptx")
for i, slide in enumerate(prs.slides):
    print(f"=== 幻灯片 {i+1} ===")
    for shape in slide.shapes:
        if shape.has_text_frame:
            print(shape.text_frame.text)
```

## 设计要点

- **配色**：选与主题相关的配色，不要默认蓝色。深色背景配浅色文字
- **每页有视觉元素**：图片/图表/图标/色块，避免纯文字页
- **字号对比**：标题 36-44pt，正文 14-16pt
- **间距**：0.5 英寸边距，内容块间 0.3-0.5 英寸
- **避免**：标题下划线、装饰色条、所有页面相同布局

## 常用操作

| 操作 | 方法 |
|------|------|
| 添加文字框 | `slide.shapes.add_textbox(left, top, width, height)` |
| 添加图片 | `slide.shapes.add_picture(path, left, top, width, height)` |
| 添加表格 | `slide.shapes.add_table(rows, cols, left, top, width, height)` |
| 添加图表 | `slide.shapes.add_chart(chart_type, data, left, top, width, height)` |
| 演讲者备注 | `slide.notes_slide.notes_text_frame.text = "备注内容"` |
| 设置背景 | `slide.background.fill.solid()` + `.fore_color.rgb` |

## 注意事项

- 坐标单位用 `Inches()` 或 `Cm()`，不要裸数字
- 颜色用 `RGBColor(r, g, b)`，不要 hex 字符串
- 表格单元格：`table.cell(row, col).text = "值"`
- 保存路径用绝对路径，便于用户找到文件
- 生成后回报文件路径和页数