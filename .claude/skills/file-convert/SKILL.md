---
name: file-convert
description: 文件格式转换。当用户要求"转格式""Markdown 转 Word""PDF 转 Word""视频转 MP4""音频转 MP3""HEIC 转 JPG"时触发。文档/图片/音视频格式互转，用 pandoc（文档）+ ffmpeg（音视频）+ Pillow（图片）。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 文件格式转换（file-convert）

文档/图片/音视频格式互转。pandoc 处理文档，ffmpeg 处理音视频，Pillow 处理图片。

## 何时触发

- 用户说"转格式""Markdown 转 Word""PDF 转 Word""视频转 MP4""音频转 MP3""HEIC 转 JPG"等
- 用户要把文件从一种格式转成另一种

## 依赖

```bash
# 文档
pip install pandoc     # 或官网安装 pandoc
# PDF 转 Word
pip install pdf2docx
# 音视频
# 安装 ffmpeg（官网或 brew/scoop）
# 图片
pip install Pillow
# HEIC
pip install pillow-heif
```

## 标准流程

1. **确认源格式与目标格式**
2. **选工具**：文档→pandoc / 音视频→ffmpeg / 图片→Pillow
3. **执行转换**
4. **回报**：输出路径 + 注意事项

## 文档转换（pandoc）

```bash
# Markdown -> Word
pandoc input.md -o output.docx
# Markdown -> PDF（需 LaTeX）
pandoc input.md -o output.pdf --pdf-engine=xelatex -V CJKmainfont="SimSun"
# Markdown -> HTML
pandoc input.md -o output.html --standalone --toc
# Word -> Markdown
pandoc input.docx -o output.md
# HTML -> Markdown
pandoc input.html -o output.md
# 带模板的 Word
pandoc input.md -o output.docx --reference-doc=template.docx
```

## PDF 转 Word

```python
from pdf2docx import Converter
cv = Converter('input.pdf')
cv.convert('output.docx')
cv.close()
```

## 音视频转换（ffmpeg）

```bash
# 视频转 MP4
ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4
# 任意视频转 H.264 MP4（兼容性最好）
ffmpeg -i input.mkv -c:v libx264 -crf 23 -c:a aac -movflags +faststart output.mp4
# 提取音频
ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 output.mp3
# 音频转 MP3
ffmpeg -i input.wav -c:a libmp3lame -q:a 2 output.mp3
# 调分辨率
ffmpeg -i input.mp4 -vf scale=1280:-2 output.mp4
# 压缩视频
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -c:a aac output.mp4
# 截取片段（10s-20s）
ffmpeg -i input.mp4 -ss 10 -to 20 -c copy output.mp4
# GIF 转视频
ffmpeg -i input.gif -movflags +faststart output.mp4
# 视频转 GIF
ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" output.gif
```

## 图片转换（Pillow）

```python
from PIL import Image
img = Image.open('input.png')
img.save('output.jpg', quality=90)
img.save('output.webp', quality=90)
```

### HEIC 转 JPG（iPhone 照片）
```python
from pillow_heif import register_heif_opener
register_heif_opener()
img = Image.open('input.heic')
img.convert('RGB').save('output.jpg', quality=90)
```

## 批量转换

```bash
# 批量 PNG 转 JPG
for %f in (*.png) do magick "%f" "%~nf.jpg"
# 批量 mkv 转 mp4
for %f in (*.mkv) do ffmpeg -i "%f" -c:v libx264 -c:a aac "%~nf.mp4"
```

```python
# Python 批量
from pathlib import Path
from PIL import Image
for p in Path('.').glob('*.png'):
    Image.open(p).convert('RGB').save(f'{p.stem}.jpg', quality=90)
```

## 速查

| 源 → 目标 | 工具 |
|-----------|------|
| MD ↔ Word/HTML/PDF | pandoc |
| PDF → Word | pdf2docx |
| 视频 → MP4 | ffmpeg + libx264 |
| 视频 → 音频 | ffmpeg -vn |
| 音频 → MP3 | ffmpeg + libmp3lame |
| 图片互转 | Pillow |
| HEIC → JPG | pillow-heif |

## 注意事项

- pandoc 转 PDF 需 LaTeX（中文用 xelatex + CJK 字体）
- ffmpeg 转 MP4 用 `libx264 + aac + faststart` 兼容性最好
- `-crf` 越大越压缩（18 高质量，28 高压缩，23 默认）
- 视频转 GIF 文件很大，限制 fps 和尺寸
- HEIC 需 `pillow-heif` 注册后 Pillow 才能打开
- 批量转换先建输出目录，避免覆盖源文件
- 大视频转换耗时，可加 `-threads` 或用硬件加速（`-c:v h264_nvenc`）
- 转换后检查输出能否正常打开，尤其 PDF/视频