---
name: docx-processing
description: 创建、编辑、解析 Word 文档（.docx/.dotx）。当用户要求"写 Word 文档""生成报告""制作合同""编辑 .docx""提取 Word 内容"时触发。通过 python-docx 生成带格式文档，支持标题、目录、表格、图片、页眉页脚、样式。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# Word 文档处理（docx-processing）

用 **python-docx**（Python）创建、编辑、解析 Word 文档。通过 shell 执行脚本生成 .docx 文件。

## 何时触发

- 用户说"写 Word 文档""生成报告""制作合同""写备忘录"等
- 用户要求解析/提取现有 .docx 文件内容
- 用户要求编辑现有 Word 文档

## 依赖安装

```bash
pip install python-docx
```

## 标准流程

### 创建新文档

1. **理解需求**：明确文档类型（报告/合同/信函）、结构、内容
2. **编写脚本**：用 python-docx 生成 .docx
3. **执行**：通过 shell 运行脚本
4. **回报**：文件路径

### 示例脚本（python-docx）

```python
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE

doc = Document()

# 标题
heading = doc.add_heading('项目报告', level=0)
heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

# 段落
p = doc.add_paragraph('这是报告正文内容。')
p.style = doc.styles['Normal']
p.paragraph_format.space_after = Pt(12)

# 多级标题 + 内容
doc.add_heading('一、背景介绍', level=1)
doc.add_paragraph('项目背景说明...')

doc.add_heading('二、详细分析', level=1)
doc.add_heading('2.1 数据概览', level=2)
doc.add_paragraph('数据分析内容...')

# 表格
table = doc.add_table(rows=3, cols=3, style='Table Grid')
table.cell(0, 0).text = '项目'
table.cell(0, 1).text = '进度'
table.cell(0, 2).text = '负责人'
table.cell(1, 0).text = '模块 A'
table.cell(1, 1).text = '80%'
table.cell(1, 2).text = '张三'

# 图片
doc.add_picture('chart.png', width=Inches(5))
doc.add_paragraph('图 1：数据图表').alignment = WD_ALIGN_PARAGRAPH.CENTER

# 页眉页脚
section = doc.sections[0]
header = section.header
header.paragraphs[0].text = '公司名称 — 机密'
footer = section.footer
footer.paragraphs[0].text = '第 '

doc.save('report.docx')
```

### 解析现有文档

```python
from docx import Document
doc = Document("input.docx")
for para in doc.paragraphs:
    print(f"[{para.style.name}] {para.text}")
for table in doc.tables:
    for row in table.rows:
        print([cell.text for cell in row.cells])
```

### 编辑现有文档

```python
from docx import Document
doc = Document("input.docx")
# 修改第一段
doc.paragraphs[0].text = "修改后的标题"
# 末尾添加内容
doc.add_paragraph("新增段落")
doc.save("output.docx")
```

## 常用操作

| 操作 | 方法 |
|------|------|
| 标题 | `doc.add_heading('标题', level=1)` |
| 段落 | `doc.add_paragraph('文本')` |
| 表格 | `doc.add_table(rows, cols, style='Table Grid')` |
| 图片 | `doc.add_picture(path, width=Inches(5))` |
| 分页 | `doc.add_page_break()` |
| 页眉 | `doc.sections[0].header.paragraphs[0].text` |
| 样式 | `p.style = doc.styles['Heading 1']` |
| 字体 | `run.font.size = Pt(12); run.font.bold = True` |

## 注意事项

- 不要用 `\n` 换行，用多个 `add_paragraph`
- 表格用 `style='Table Grid'` 才有边框
- 图片需指定 width 或 height，否则原始尺寸可能过大
- 保存路径用绝对路径
- 生成后回报文件路径