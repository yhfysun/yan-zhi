---
name: pdf-processing
description: 处理 PDF 文件：读取/提取文本表格、合并/拆分、旋转/水印、创建新 PDF、OCR 扫描件、表单填写、加密解密。当用户提到 .pdf 文件或要求"提取 PDF 内容""合并 PDF""拆分 PDF""给 PDF 加水印"时触发。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# PDF 处理（pdf-processing）

用 **pypdf** + **pdfplumber** + **reportlab** 处理 PDF 文件。通过 shell 执行 Python 脚本。

## 何时触发

- 用户要求提取/读取 PDF 内容
- 用户要求合并/拆分/旋转 PDF
- 用户要求创建新 PDF
- 用户要求给 PDF 加水印/加密
- 用户要求 OCR 扫描件 PDF

## 依赖安装

```bash
pip install pypdf pdfplumber reportlab
# OCR（可选）
pip install pytesseract pdf2image
```

## 标准流程

1. **理解需求**：明确输入 PDF、目标操作、输出
2. **编写脚本**：用对应库处理
3. **执行**：通过 shell 运行
4. **回报**：结果 + 输出路径

## 常用操作

### 提取文本

```python
import pdfplumber
with pdfplumber.open("input.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

### 提取表格

```python
import pdfplumber
with pdfplumber.open("input.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                print(row)
```

### 合并 PDF

```python
from pypdf import PdfWriter, PdfReader
writer = PdfWriter()
for f in ["doc1.pdf", "doc2.pdf"]:
    reader = PdfReader(f)
    for page in reader.pages:
        writer.add_page(page)
with open("merged.pdf", "wb") as out:
    writer.write(out)
```

### 拆分 PDF

```python
from pypdf import PdfReader, PdfWriter
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as out:
        writer.write(out)
```

### 添加水印

```python
from pypdf import PdfReader, PdfWriter
watermark = PdfReader("watermark.pdf").pages[0]
reader = PdfReader("document.pdf")
writer = PdfWriter()
for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)
with open("watermarked.pdf", "wb") as out:
    writer.write(out)
```

### 创建新 PDF

```python
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=A4)
styles = getSampleStyleSheet()
story = []
story.append(Paragraph("报告标题", styles['Title']))
story.append(Spacer(1, 20))
story.append(Paragraph("正文内容", styles['Normal']))
doc.build(story)
```

### 加密 PDF

```python
from pypdf import PdfReader, PdfWriter
reader = PdfReader("input.pdf")
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt("user_password")
with open("encrypted.pdf", "wb") as out:
    writer.write(out)
```

### OCR 扫描件

```python
import pytesseract
from pdf2image import convert_from_path
images = convert_from_path("scanned.pdf")
for i, img in enumerate(images):
    text = pytesseract.image_to_string(img, lang="chi_sim")
    print(f"=== 第 {i+1} 页 ===\n{text}")
```

## 速查表

| 操作 | 库 | 方法 |
|------|-----|------|
| 提取文本 | pdfplumber | `page.extract_text()` |
| 提取表格 | pdfplumber | `page.extract_tables()` |
| 合并 | pypdf | `writer.add_page(page)` |
| 拆分 | pypdf | 逐页写入新文件 |
| 水印 | pypdf | `page.merge_page(watermark)` |
| 创建 | reportlab | `SimpleDocTemplate` |
| 加密 | pypdf | `writer.encrypt(pwd)` |
| 旋转 | pypdf | `page.rotate(90)` |
| OCR | pytesseract | `image_to_string(img, lang="chi_sim")` |

## 注意事项

- 提取文本可能不完整（取决于 PDF 结构），用 `pdfplumber` 比 `pypdf` 效果更好
- OCR 需安装 tesseract（`lang="chi_sim"` 中文识别）
- 合并时注意页面方向和大小一致性
- reportlab 不要用 Unicode 上下标字符，用 `<sub>`/`<super>` 标签
- 生成后回报页数、输出路径