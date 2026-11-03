#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""office_docs.py —— 办公三件套的生成与解析（2026-11-02，P2）

用法：
  python office_docs.py create --kind doc|sheet|slides --path <输出文件> --title <标题>
  python office_docs.py read   --path <文件>

输出：一行 JSON（UTF-8，ensure_ascii=False）。
依赖：python-docx / openpyxl / python-pptx（已预烤进随包 python 的 site-packages）。

★ 只做「生成空文档」和「读取为结构化 JSON」两件事：
  编辑仍由前端/Office 软件完成；这里保证 AI 与人工操作共用同一套磁盘格式。
"""
import argparse
import json
import os
import sys


def _fail(msg: str) -> None:
    print(json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False))
    sys.exit(1)


def create_doc(path: str, title: str) -> None:
    from docx import Document

    doc = Document()
    doc.add_heading(title, level=0)
    doc.add_paragraph("在右侧 AI 助手输入指令，或直接用本机 Office 软件编辑本文件。")
    doc.save(path)


def create_sheet(path: str, title: str) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws["A1"] = title
    ws.column_dimensions["A"].width = 28
    wb.save(path)


def create_slides(path: str, title: str) -> None:
    from pptx import Presentation

    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = title
    # 副标题占位符在默认版式里是第 2 个 placeholder
    try:
        slide.placeholders[1].text = "言智 · 办公演示"
    except Exception:
        pass
    prs.save(path)


def read_doc(path: str) -> dict:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(path)
    blocks = []
    body = doc.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = (p.text or "").strip()
            if not text:
                continue
            style = ""
            try:
                style = p.style.name or ""
            except Exception:
                style = ""
            if style.lower().startswith("heading") or style.lower().startswith("title"):
                level = 1
                digits = "".join(ch for ch in style if ch.isdigit())
                if digits:
                    level = max(1, min(6, int(digits)))
                blocks.append({"type": "heading", "level": level, "text": text})
            else:
                blocks.append({"type": "paragraph", "text": text})
        elif tag == "tbl":
            t = Table(child, doc)
            rows = []
            for row in t.rows:
                rows.append([(cell.text or "").strip() for cell in row.cells])
            blocks.append({"type": "table", "rows": rows})
    return {"kind": "doc", "blocks": blocks}


def read_sheet(path: str) -> dict:
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True, read_only=True)
    sheets = []
    max_rows, max_cols = 400, 40
    for ws in wb.worksheets:
        rows = []
        truncated = False
        for r, row in enumerate(ws.iter_rows(values_only=True)):
            if r >= max_rows:
                truncated = True
                break
            cells = list(row[:max_cols])
            if len(row) > max_cols:
                truncated = True
            # 去掉整行空值（尾部空单元格也去掉，减少载荷）
            while cells and (cells[-1] is None or str(cells[-1]) == ""):
                cells.pop()
            rows.append([_cell_text(v) for v in cells])
        while rows and not any(c != "" for c in rows[-1]):
            rows.pop()
        sheets.append({"name": ws.title, "rows": rows, "truncated": truncated})
    wb.close()
    return {"kind": "sheet", "sheets": sheets}


def save_slides(path: str, payload: dict) -> None:
    """按「幻灯片序号 + 形状序号」回写文字，保持版式/图片不动。"""
    from pptx import Presentation

    prs = Presentation(path)
    for s in payload.get("slides") or []:
        try:
            idx = int(s.get("index")) - 1
        except Exception:
            continue
        if idx < 0 or idx >= len(prs.slides):
            continue
        slide = prs.slides[idx]
        shapes = list(slide.shapes)
        for item in s.get("shapes") or []:
            try:
                si = int(item.get("shape"))
            except Exception:
                continue
            if si < 0 or si >= len(shapes):
                continue
            shape = shapes[si]
            try:
                if not shape.has_text_frame:
                    continue
            except Exception:
                continue
            shape.text_frame.text = str(item.get("text") or "")
    prs.save(path)


def _set_paragraph_text(paragraph, text: str) -> None:
    """改写段落文字，保留第一个 run 的字符格式（字体/字号/颜色），其余 run 清空。

    直接 `paragraph.text = ...` 会丢掉所有 run 级格式；按 run 回写能把「样式不丢」兑现。
    """
    runs = list(paragraph.runs)
    if not runs:
        paragraph.add_run(text)
        return
    runs[0].text = text
    for r in runs[1:]:
        r.text = ""


def _set_cell_text(cell, text: str) -> None:
    paragraphs = list(cell.paragraphs)
    if not paragraphs:
        cell.text = text
        return
    _set_paragraph_text(paragraphs[0], text)
    for p in paragraphs[1:]:
        _set_paragraph_text(p, "")


def save_doc(path: str, payload: dict) -> None:
    """按「块序号」回写 docx 文字（标题/段落/表格单元格），保留段落样式与版式。

    块序号与 read_doc 的产出顺序一致：body 里**非空段落**与**表格**依次编号。
    结构在读取与保存之间被外部改动时，按序号尽力对齐（不新增/删除块）。
    """
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(path)
    wanted = payload.get("blocks") or []
    idx = 0
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            if not (p.text or "").strip():
                continue
            block = wanted[idx] if idx < len(wanted) else None
            if block and block.get("type") in ("heading", "paragraph"):
                _set_paragraph_text(p, str(block.get("text") or ""))
            idx += 1
        elif tag == "tbl":
            block = wanted[idx] if idx < len(wanted) else None
            if block and block.get("type") == "table":
                t = Table(child, doc)
                rows = block.get("rows") or []
                for r, row in enumerate(t.rows):
                    if r >= len(rows):
                        break
                    cells = rows[r] or []
                    for c, cell in enumerate(row.cells):
                        if c >= len(cells):
                            break
                        _set_cell_text(cell, str(cells[c] if cells[c] is not None else ""))
            idx += 1
    doc.save(path)


def write_doc(path: str, payload: dict, mode: str) -> None:
    """向已有 docx 追加内容（mode=append）或按块序号替换文字（mode=replace）。"""
    from docx import Document

    if mode == "replace":
        save_doc(path, payload)
        return

    doc = Document(path)
    for block in payload.get("blocks") or []:
        t = block.get("type")
        if t == "heading":
            try:
                level = max(1, min(9, int(block.get("level") or 1)))
            except Exception:
                level = 1
            doc.add_heading(str(block.get("text") or ""), level=level)
        elif t == "paragraph":
            doc.add_paragraph(str(block.get("text") or ""))
        elif t == "table":
            rows = block.get("rows") or []
            if not rows:
                continue
            cols = max(len(r) for r in rows)
            table = doc.add_table(rows=len(rows), cols=cols)
            try:
                table.style = "Table Grid"
            except Exception:
                pass
            for r, row in enumerate(rows):
                for c in range(cols):
                    val = row[c] if c < len(row) else ""
                    table.cell(r, c).text = "" if val is None else str(val)
    doc.save(path)


def _last_nonempty_row(ws) -> int:
    for r in range(ws.max_row, 0, -1):
        if any(ws.cell(row=r, column=c).value not in (None, "") for c in range(1, ws.max_column + 1)):
            return r
    return 0


def write_sheet(path: str, payload: dict, mode: str) -> None:
    """向已有 xlsx 追加行（mode=append）或清空后重写（mode=replace）。"""
    from openpyxl import load_workbook

    wb = load_workbook(path)
    name = payload.get("sheet")
    ws = wb[name] if (isinstance(name, str) and name in wb.sheetnames) else wb.active
    rows = payload.get("rows") or []
    if mode == "replace":
        for row in ws.iter_rows():
            for cell in row:
                cell.value = None
        start = 1
    else:
        start = _last_nonempty_row(ws) + 1
    for i, row in enumerate(rows):
        if not isinstance(row, (list, tuple)):
            continue
        for j, val in enumerate(row):
            ws.cell(row=start + i, column=j + 1, value=val)
    wb.save(path)


def write_slides(path: str, payload: dict, mode: str) -> None:
    """向已有 pptx 追加页（mode=append）或按序号替换页内文字（mode=replace）。

    append: slides=[{title, texts:[...]}] → 用「标题+内容」版式新增页
    replace: slides=[{index, title?, texts:[...]}] → 覆盖该页标题与非标题文本形状
    """
    from pptx import Presentation

    prs = Presentation(path)
    items = payload.get("slides") or []

    def text_shapes_except_title(slide):
        try:
            title = slide.shapes.title
        except Exception:
            title = None
        title_id = getattr(title, "shape_id", None)
        out = []
        for sh in slide.shapes:
            if title_id is not None and getattr(sh, "shape_id", None) == title_id:
                continue
            try:
                if sh.has_text_frame:
                    out.append(sh)
            except Exception:
                continue
        return out

    if mode == "replace":
        for s in items:
            try:
                idx = int(s.get("index")) - 1
            except Exception:
                continue
            if idx < 0 or idx >= len(prs.slides):
                continue
            slide = prs.slides[idx]
            title = s.get("title")
            if title is not None:
                try:
                    if slide.shapes.title is not None:
                        slide.shapes.title.text = str(title)
                except Exception:
                    pass
            texts = s.get("texts") or []
            for k, sh in enumerate(text_shapes_except_title(slide)):
                try:
                    sh.text_frame.text = str(texts[k]) if k < len(texts) else ""
                except Exception:
                    pass
    else:
        for s in items:
            layout = prs.slide_layouts[1] if len(prs.slide_layouts) > 1 else prs.slide_layouts[0]
            slide = prs.slides.add_slide(layout)
            try:
                if slide.shapes.title is not None:
                    slide.shapes.title.text = str(s.get("title") or "")
            except Exception:
                pass
            body = s.get("texts") or s.get("bullets") or []
            if isinstance(body, str):
                body = [body]
            for sh in text_shapes_except_title(slide):
                try:
                    sh.text_frame.text = "\n".join(str(x) for x in body)
                except Exception:
                    pass
                break
    prs.save(path)


def write_any(path: str, payload: dict, mode: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".docx":
        write_doc(path, payload, mode)
    elif ext in (".xlsx", ".xlsm"):
        write_sheet(path, payload, mode)
    elif ext == ".pptx":
        write_slides(path, payload, mode)
    else:
        raise ValueError(f"不支持的格式: {ext}")


def _cell_text(v) -> object:
    if v is None:
        return ""
    if isinstance(v, (int, float, bool)):
        return v
    return str(v)


def read_slides(path: str) -> dict:
    from pptx import Presentation

    prs = Presentation(path)
    slides = []
    for i, slide in enumerate(prs.slides, start=1):
        title = ""
        try:
            if slide.shapes.title is not None:
                title = (slide.shapes.title.text or "").strip()
        except Exception:
            title = ""
        texts = []
        shape_texts = []
        for idx, shape in enumerate(slide.shapes):
            try:
                if not shape.has_text_frame:
                    continue
            except Exception:
                continue
            raw = shape.text_frame.text or ""
            text = raw.strip()
            if text:
                shape_texts.append({"shape": idx, "text": raw})
            if not text or text == title:
                continue
            texts.append(text)
        notes = ""
        try:
            if slide.has_notes_slide:
                notes = (slide.notes_slide.notes_text_frame.text or "").strip()
        except Exception:
            notes = ""
        slides.append({"index": i, "title": title, "texts": texts, "shapeTexts": shape_texts, "notes": notes})
    return {"kind": "slides", "slides": slides, "width": prs.slide_width, "height": prs.slide_height}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("create")
    pc.add_argument("--kind", required=True, choices=["doc", "sheet", "slides"])
    pc.add_argument("--path", required=True)
    pc.add_argument("--title", default="")

    pr = sub.add_parser("read")
    pr.add_argument("--path", required=True)

    ps = sub.add_parser("save")
    ps.add_argument("--path", required=True)
    ps.add_argument("--json-file", required=True)

    pw = sub.add_parser("write")
    pw.add_argument("--path", required=True)
    pw.add_argument("--json-file", required=True)
    pw.add_argument("--mode", choices=["append", "replace"], default="append")

    args = ap.parse_args()
    try:
        if args.cmd == "create":
            path = os.path.abspath(args.path)
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            title = args.title or os.path.splitext(os.path.basename(path))[0]
            if args.kind == "doc":
                create_doc(path, title)
            elif args.kind == "sheet":
                create_sheet(path, title)
            else:
                create_slides(path, title)
            print(json.dumps({"ok": True, "path": path}, ensure_ascii=False))
            return

        if args.cmd == "save":
            path = os.path.abspath(args.path)
            ext = os.path.splitext(path)[1].lower()
            with open(args.json_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if ext == ".pptx":
                save_slides(path, payload)
            elif ext == ".docx":
                save_doc(path, payload)
            else:
                _fail("自动保存目前支持 .docx / .pptx")
            print(json.dumps({"ok": True, "path": path}, ensure_ascii=False))
            return

        if args.cmd == "write":
            path = os.path.abspath(args.path)
            if not os.path.isfile(path):
                _fail(f"文件不存在: {path}")
                return
            with open(args.json_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            write_any(path, payload, args.mode)
            print(json.dumps({"ok": True, "path": path}, ensure_ascii=False))
            return

        path = os.path.abspath(args.path)
        ext = os.path.splitext(path)[1].lower()
        if ext == ".docx":
            data = read_doc(path)
        elif ext in (".xlsx", ".xlsm"):
            data = read_sheet(path)
        elif ext == ".pptx":
            data = read_slides(path)
        else:
            _fail(f"不支持的格式: {ext}")
            return
        print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 —— 统一回报给前端展示
        _fail(e)


if __name__ == "__main__":
    main()
