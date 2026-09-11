#!/usr/bin/env python3
"""PDF 高保真预览：用 PyMuPDF 把每页栅格化为 PNG。

    作为「升级通道」接入预览管线：相比纯 JS（unpdf 仅提取文本）能获得
    与原始排版一致的可视化页面图像。依赖 PyMuPDF（fitz），打包期预烤，
    离线可用。

    用法：pdf2img.py --pdf <输入.pdf> --out-dir <输出目录> --dpi <110> --max-pages <30>
    输出：stdout 打印 JSON {"count": N, "pages": ["绝对路径", ...]}，失败打印到 stderr 并 exit 1。
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main(argv=None):
    p = argparse.ArgumentParser(prog="pdf2img", description="PyMuPDF 把 PDF 每页渲染为 PNG")
    p.add_argument("--pdf", required=True, help="输入 PDF 路径")
    p.add_argument("--out-dir", required=True, help="PNG 输出目录（自动创建）")
    p.add_argument("--dpi", type=int, default=110, help="渲染 DPI（默认 110，清晰度与体积权衡）")
    p.add_argument("--max-pages", type=int, default=30, help="最多渲染页数（默认 30，防超大文件）")
    a = p.parse_args(argv)

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("Error: 缺少 PyMuPDF（fitz）依赖（打包环境应预烤）", file=sys.stderr)
        return 1

    if not os.path.isfile(a.pdf):
        print("Error: PDF 不存在: %s" % a.pdf, file=sys.stderr)
        return 1

    os.makedirs(a.out_dir, exist_ok=True)
    try:
        doc = fitz.open(a.pdf)
    except Exception as e:
        print("Error: 打开 PDF 失败: %s" % e, file=sys.stderr)
        return 1

    pages = []
    n = min(len(doc), a.max_pages)
    try:
        for i in range(n):
            page = doc.load_page(i)
            pix = page.get_pixmap(dpi=a.dpi)
            out = os.path.join(a.out_dir, "page-%04d.png" % (i + 1))
            pix.save(out)
            pages.append(os.path.abspath(out))
        doc.close()
    except Exception as e:
        print("Error: 渲染失败: %s" % e, file=sys.stderr)
        return 1

    print(json.dumps({"count": len(pages), "pages": pages}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
