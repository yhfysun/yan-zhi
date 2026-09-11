"""doyz -> PowerPoint (.pptx)。

图表两种模式：
  native（默认）：PPT 原生图表，右键「编辑数据」可改，可在 PPT 里换类型
  image        ：图表渲染为静态图片
"""

from __future__ import annotations

import base64
import os
import tempfile

from pptx import Presentation
from pptx.chart.data import CategoryChartData, XyChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Cm, Pt, Inches

from . import chart_img, model

MARGIN_CM = 1.6
TOP_CM = 3.0
SLIDE_CM = {"16:9": (33.867, 19.05), "4:3": (25.4, 19.05), "A4": (25.4, 19.05)}


def _rgb(hex_str, default="000000"):
    if not hex_str:
        return RGBColor.from_string(default)
    try:
        return RGBColor.from_string(str(hex_str).lstrip("#"))
    except Exception:
        return RGBColor.from_string(default)


def _set_font(run, name, size=None, bold=None, color=None, italic=None):
    run.font.name = name
    try:
        rPr = run.font._rPr
        ea = rPr.find(qn("a:ea"))
        if ea is None:
            from pptx.oxml import parse_xml
            from pptx.oxml.ns import nsdecls
            ea = parse_xml('<a:ea %s typeface="%s"/>' % (nsdecls("a"), name))
            rPr.append(ea)
        ea.set("typeface", name)
    except Exception:
        pass
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if color:
        run.font.color.rgb = _rgb(color)


def _textbox(slide, x, y, w, h):
    tb = slide.shapes.add_textbox(Cm(x), Cm(y), Cm(w), Cm(h))
    tf = tb.text_frame
    tf.word_wrap = True
    return tb, tf


def _resolve_image(src: str, base_dir: str) -> str:
    if os.path.exists(src):
        return src
    p = os.path.join(base_dir, src)
    if os.path.exists(p):
        return p
    if src.startswith("data:"):
        head, b64 = src.split(",", 1)
        ext = ".png"
        fd, path = tempfile.mkstemp(suffix=ext)
        with os.fdopen(fd, "wb") as f:
            f.write(base64.b64decode(b64))
        return path
    raise model.DoyzError("图片资源找不到: %s" % src)


def _chart_data(chart: dict):
    ctype = chart.get("type", "column")
    if ctype == "scatter":
        cd = XyChartData()
        cats = chart.get("categories") or []
        for s in chart.get("series") or []:
            srs = cd.add_series(s.get("name") or "系列")
            for i, v in enumerate(s.get("values") or []):
                x = cats[i] if i < len(cats) else i + 1
                try:
                    srs.add_data_point(float(x), float(v or 0))
                except (TypeError, ValueError):
                    srs.add_data_point(i + 1, float(v or 0))
        return cd
    cd = CategoryChartData()
    cd.categories = [str(c) for c in (chart.get("categories") or [])]
    for s in chart.get("series") or []:
        cd.add_series(s.get("name") or "系列",
                      tuple(float(v or 0) for v in (s.get("values") or [])))
    return cd


def _estimate_height(block, doc_data) -> float:
    bt = block.get("type")
    if bt == "heading":
        return 1.6
    if bt == "paragraph":
        return max(0.9, (len(str(block.get("text", ""))) / 38.0) * 0.75)
    if bt == "bullets":
        return 0.75 * len(block.get("items") or []) + 0.3
    if bt == "table":
        return 0.72 * (len(block.get("rows") or []) + 1)
    if bt == "chart":
        ch = model.get_chart(doc_data, block.get("ref") or block.get("chart"))
        return float((ch.get("options") or {}).get("heightCm") or 8) + 0.9
    if bt == "image":
        return float(block.get("heightCm") or 7) + 0.6
    if bt == "quote":
        return max(0.9, (len(str(block.get("text", ""))) / 34.0) * 0.8)
    if bt == "code":
        return 0.45 * (str(block.get("text", "")).count("\n") + 1) + 0.4
    return 1.0


def _render_block(slide, block, ctx, x, y, w):
    style, font, accent = ctx["style"], ctx["font"], ctx["accent"]
    doc_data = ctx["doc"]
    bt = block.get("type")

    if bt == "heading":
        lvl = int(block.get("level") or 1)
        size = max(14, 24 - lvl * 3)
        tb, tf = _textbox(slide, x, y, w, 1.5)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = str(block.get("text", ""))
        _set_font(run, style.get("headingFont") or font, size, True, accent if lvl <= 2 else "1F2937")
        return

    if bt == "paragraph":
        tb, tf = _textbox(slide, x, y, w, 1.0)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = str(block.get("text", ""))
        _set_font(run, font, int(block.get("sizePt") or 14))
        return

    if bt == "bullets":
        tb, tf = _textbox(slide, x, y, w, 1.0)
        for i, it in enumerate(block.get("items") or []):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = ("%d. " % (i + 1)) if block.get("ordered") else "• "
            run = p.add_run()
            run.text = str(it)
            _set_font(run, font, 14)
            p.space_after = Pt(6)
        return

    if bt == "quote":
        tb, tf = _textbox(slide, x, y, w, 1.0)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = str(block.get("text", ""))
        _set_font(run, font, 13, None, "6B7280", italic=True)
        return

    if bt == "code":
        tb, tf = _textbox(slide, x, y, w, 1.0)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = str(block.get("text", ""))
        _set_font(run, "Consolas", 11)
        return

    if bt == "table":
        header = block.get("header") or []
        rows = block.get("rows") or []
        cols = max([len(header)] + [len(r) for r in rows])
        nrows = len(rows) + (1 if header else 0)
        shape = slide.shapes.add_table(nrows, cols, Cm(x), Cm(y), Cm(w), Cm(0.8 * nrows))
        tbl = shape.table
        r0 = 0
        if header:
            for i, h in enumerate(header):
                cell = tbl.cell(0, i)
                cell.text = str(h)
                for p in cell.text_frame.paragraphs:
                    for run in p.runs:
                        _set_font(run, font, 11, True, "FFFFFF")
                cell.fill.solid()
                cell.fill.fore_color.rgb = _rgb(accent)
            r0 = 1
        for ri, r in enumerate(rows):
            for ci in range(cols):
                cell = tbl.cell(r0 + ri, ci)
                cell.text = str(r[ci] if ci < len(r) else "")
                for p in cell.text_frame.paragraphs:
                    for run in p.runs:
                        _set_font(run, font, 11)
        return

    if bt == "image":
        src = _resolve_image(block.get("src", ""), ctx["base_dir"])
        wcm = float(block.get("widthCm") or min(w, 20))
        slide.shapes.add_picture(src, Cm(x), Cm(y), width=Cm(wcm))
        return

    if bt == "chart":
        chart = model.get_chart(doc_data, block.get("ref") or block.get("chart"))
        opt = chart.get("options") or {}
        ch_w = float(opt.get("widthCm") or min(w, 22))
        ch_h = float(opt.get("heightCm") or 8)
        if ctx["chart_mode"] == "image":
            png = os.path.join(ctx["tmpdir"], "ppt_%s.png" % chart.get("id", "c"))
            chart_img.render(chart, png, style)
            slide.shapes.add_picture(png, Cm(x), Cm(y), width=Cm(ch_w))
        else:
            enum_name = model.CHART_TYPES[chart["type"]][1]
            gframe = slide.shapes.add_chart(
                getattr(XL_CHART_TYPE, enum_name), Cm(x), Cm(y), Cm(ch_w), Cm(ch_h),
                _chart_data(chart))
            ch = gframe.chart
            try:
                ch.font.size = Pt(10)
                ch.has_title = bool(chart.get("title"))
                if ch.has_title:
                    ch.chart_title.text_frame.text = str(chart.get("title"))
                    for p in ch.chart_title.text_frame.paragraphs:
                        for run in p.runs:
                            _set_font(run, font, 12, True)
                ch.has_legend = bool(opt.get("legend")) and len(chart.get("series") or []) > 1
                if ch.has_legend:
                    ch.legend.position = XL_LEGEND_POSITION.BOTTOM
                    ch.legend.include_in_layout = False
            except Exception:
                pass
        return

    raise model.DoyzError("未知的块类型: %s" % bt)


def _render_slide(prs, slide_def, ctx, first: bool):
    W, H = ctx["slide_w"], ctx["slide_h"]
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    accent, font, style = ctx["accent"], ctx["font"], ctx["style"]

    # 背景
    if slide_def.get("bg"):
        from pptx.enum.shapes import MSO_SHAPE
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Cm(0), Cm(0), Cm(W), Cm(H))
        bg.fill.solid()
        bg.fill.fore_color.rgb = _rgb(slide_def["bg"])
        bg.line.fill.background()
        bg.shadow.inherit = False

    y = MARGIN_CM
    title = slide_def.get("title")
    layout = slide_def.get("layout", "title_content")
    if title:
        if layout == "title":
            tb, tf = _textbox(slide, MARGIN_CM, H * 0.32, W - 2 * MARGIN_CM, 3)
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            run = tf.paragraphs[0].add_run()
            run.text = str(title)
            _set_font(run, style.get("headingFont") or font, 36, True, accent)
            if slide_def.get("subtitle"):
                p = tf.add_paragraph()
                p.alignment = PP_ALIGN.CENTER
                r2 = p.add_run()
                r2.text = str(slide_def["subtitle"])
                _set_font(r2, font, 16, None, "6B7280")
        else:
            tb, tf = _textbox(slide, MARGIN_CM, 1.0, W - 2 * MARGIN_CM, 1.7)
            run = tf.paragraphs[0].add_run()
            run.text = str(title)
            _set_font(run, style.get("headingFont") or font, 26, True, accent)
            y = TOP_CM
            if not slide_def.get("blocks"):
                y = H * 0.35

    blocks = slide_def.get("blocks") or []
    for idx, block in enumerate(blocks):
        h = _estimate_height(block, ctx["doc"])
        if y + h > H - MARGIN_CM and y > TOP_CM and idx > 0:
            # 当前页放不下：续到新页（标题沿用）
            return _render_slide(prs, {
                "layout": "title_content",
                "title": (str(title) + "（续）") if title else "",
                "blocks": blocks[idx:],
            }, ctx, False)
        _render_block(slide, block, ctx, MARGIN_CM, y, W - 2 * MARGIN_CM)
        y += h + 0.35

    if slide_def.get("notes"):
        slide.notes_slide.notes_text_frame.text = str(slide_def["notes"])
    return slide


def export(doc_data: dict, out_path: str, chart_mode: str = "native") -> str:
    if doc_data.get("kind") != "presentation":
        raise model.DoyzError("PPT 导出要求 kind=presentation，当前为 %s" % doc_data.get("kind"))

    style = dict(model.DEFAULT_STYLE)
    style.update(doc_data.get("styles") or {})
    page = dict(model.DEFAULT_PAGE)
    page.update(doc_data.get("page") or {})
    W, H = SLIDE_CM.get(page.get("size", "16:9"), (33.867, 19.05))

    prs = Presentation()
    prs.slide_width = Cm(W)
    prs.slide_height = Cm(H)

    ctx = {
        "doc": doc_data, "style": style, "font": style.get("font", "微软雅黑"),
        "accent": style.get("accent", "C2410C"), "slide_w": W, "slide_h": H,
        "chart_mode": chart_mode,
        "base_dir": doc_data.get("_base_dir") or os.path.dirname(os.path.abspath(out_path)),
        "tmpdir": doc_data.get("_tmpdir") or tempfile.gettempdir(),
    }
    for s in doc_data.get("slides") or []:
        _render_slide(prs, s, ctx, True)

    prs.core_properties.title = str((doc_data.get("meta") or {}).get("title") or "")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    prs.save(out_path)
    return out_path
