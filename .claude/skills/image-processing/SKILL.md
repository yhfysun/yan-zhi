---
name: image-processing
description: 图片处理。当用户要求"压缩图片""批量转格式""加水印""裁剪拼接""调尺寸"时触发。用 Pillow/sharp 批量压缩、格式转换、加水印、裁剪、拼接、调尺寸，通过 shell 执行 Python 脚本。
license: Apache-2.0
metadata:
  author: yan-zhi
  version: "1.0"
---

# 图片处理（image-processing）

批量图片处理：压缩、格式转换、加水印、裁剪、拼接、调尺寸、调色。用 Pillow（Python）通过 shell 执行。

## 何时触发

- 用户说"压缩图片""批量转格式""加水印""裁剪拼接""调尺寸""缩略图"等
- 用户要处理一批图片

## 依赖

```bash
pip install Pillow
```

## 标准流程

1. **明确操作**：压缩/转格式/水印/裁剪/拼接/调尺寸
2. **写脚本**：用 Pillow 处理
3. **执行**：shell 运行
4. **回报**：处理数量 + 输出路径 + 前后体积对比

## 常用操作

### 批量压缩
```python
from PIL import Image
from pathlib import Path

for p in Path('input').glob('*.png'):
    img = Image.open(p)
    img = img.convert('RGB')  # 去透明通道便于 JPEG
    img.save(f'output/{p.stem}.jpg', quality=85, optimize=True)
```

### 格式转换
```python
img = Image.open('in.png')
img.save('out.webp', quality=90)   # PNG -> WebP
img.save('out.jpg', quality=90)    # PNG -> JPEG
```

### 调尺寸 / 缩略图
```python
img = Image.open('in.jpg')
# 等比缩放到最大宽 800
img.thumbnail((800, 800))
img.save('out.jpg', quality=90)

# 强制尺寸
img.resize((400, 300)).save('out.jpg')
```

### 裁剪
```python
img = Image.open('in.jpg')
# (左, 上, 右, 下)
img.crop((100, 100, 500, 400)).save('out.jpg')
```

### 加水印
```python
from PIL import ImageDraw, ImageFont

img = Image.open('in.jpg').convert('RGBA')
layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)
font = ImageFont.truetype('arial.ttf', 36)
draw.text((20, 20), '© 我的水印', fill=(255, 255, 255, 128), font=font)
Image.alpha_composite(img, layer).convert('RGB').save('out.jpg', quality=90)
```

### 拼接（横向/纵向）
```python
imgs = [Image.open(f) for f in files]
w = sum(i.width for i in imgs)
h = max(i.height for i in imgs)
canvas = Image.new('RGB', (w, h))
x = 0
for i in imgs:
    canvas.paste(i, (x, 0)); x += i.width
canvas.save('merged.jpg', quality=90)
```

### 批量重命名 / 调色
```python
# 批量重命名
for i, p in enumerate(Path('input').glob('*')):
    Image.open(p).save(f'output/img_{i:03d}.png')

# 亮度/对比度
from PIL import ImageEnhance
img = ImageEnhance.Brightness(img).enhance(1.2)
img = ImageEnhance.Contrast(img).enhance(1.1)
```

## 速查表

| 操作 | 方法 |
|------|------|
| 打开 | `Image.open(path)` |
| 缩略 | `img.thumbnail((w, h))` |
| 裁剪 | `img.crop((l, t, r, b))` |
| 旋转 | `img.rotate(90)` |
| 翻转 | `img.transpose(Image.FLIP_LEFT_RIGHT)` |
| 转 RGB | `img.convert('RGB')` |
| 加文字 | `ImageDraw.Draw(img).text(...)` |
| 保存 | `img.save(path, quality=90)` |

## 注意事项

- PNG 转 JPEG 先 `convert('RGB')` 去掉透明通道，否则报错
- 压缩用 `quality=80~90`，肉眼无差且体积大幅下降
- WebP 同质量下比 JPEG 小 25%~35%，支持透明，优先推荐
- 批量处理用 `Path.glob`，注意输出目录先建
- 大图处理注意内存，可用 `Image.draft` 先缩小再加载
- 水印文字需指定字体路径，中文用系统中文字体（如 `C:/Windows/Fonts/msyh.ttc`）
- 保留原图，处理结果输出到新目录，避免覆盖