"""doyz -> Excel (.xlsx)，表格数据 + 原生可编辑图表。

也支持从 CSV / JSON 直接生成（见 doyz.py 的 xlsx 子命令）。
"""

from __future__ import annotations

import csv
import json
import os

from openpyxl import Workbook
from openpyxl.chart import (AreaChart, BarChart, DoughnutChart, LineChart,
                            PieChart, RadarChart, ScatterChart, Reference, Series)
from openpyxl.chart.label import DataLabelList
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from . import model

NUM_FORMATS = {
    "number": "#,##0.00",
    "int": "#,##0",
    "percent": "0.0%",
    "currency": "¥#,##0.00",
    "date": "yyyy-mm-dd",
    "text": "@",
}


def _rgb(hex_str, default="C2410C"):
    s = str(hex_str or default).lstrip("#")
    if len(s) != 6:
        s = default
    return s


def _autosize(ws, col_idx, values, min_w=9, max_w=42):
    width = min_w
    for v in values:
        l = 0
        for ch in str(v or ""):
            l += 2 if ord(ch) > 127 else 1
        width = max(width, min(l + 3, max_w))
    ws.column_dimensions[get_column_letter(col_idx)].width = width


def _write_sheet(ws, sheet_def, style):
    accent = _rgb(style.get("accent"))
    font = style.get("font", "微软雅黑")
    columns = sheet_def.get("columns") or []
    rows = sheet_def.get("rows") or []
    header = [c.get("header") if isinstance(c, dict) else c for c in columns] \
        if columns else (sheet_def.get("header") or [])

    thin = Side(style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    r0 = 1
    if header:
        for ci, h in enumerate(header, start=1):
            cell = ws.cell(row=1, column=ci, value=h)
            cell.font = Font(name=font, bold=True, color="FFFFFF", size=10.5)
            cell.fill = PatternFill("solid", fgColor=accent)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border
        ws.row_dimensions[1].height = 22
        r0 = 2

    for ri, row in enumerate(rows, start=r0):
        for ci, val in enumerate(row, start=1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.font = Font(name=font, size=10.5)
            cell.border = border
            coldef = columns[ci - 1] if ci - 1 < len(columns) else None
            if isinstance(coldef, dict):
                t = coldef.get("type")
                if t and t in NUM_FORMATS and isinstance(val, (int, float)):
                    cell.number_format = coldef.get("format") or NUM_FORMATS[t]
                if coldef.get("bold"):
                    cell.font = Font(name=font, size=10.5, bold=True)

    n_cols = max([len(header)] + [len(r) for r in rows]) if (header or rows) else 0
    for ci in range(1, n_cols + 1):
        coldef = columns[ci - 1] if ci - 1 < len(columns) else None
        if isinstance(coldef, dict) and coldef.get("width"):
            ws.column_dimensions[get_column_letter(ci)].width = float(coldef["width"])
        else:
            _autosize(ws, ci, [header[ci - 1] if header and ci - 1 < len(header) else ""] +
                      [r[ci - 1] if ci - 1 < len(r) else "" for r in rows])

    if sheet_def.get("freeze"):
        ws.freeze_panes = sheet_def["freeze"]
    elif header:
        ws.freeze_panes = "A%d" % r0

    if sheet_def.get("autoFilter", True) and header and rows:
        ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(n_cols), r0 + len(rows) - 1)
    return n_cols, r0


def _build_chart(chart: dict, data_ws, anchor: str, style):
    ctype = chart.get("type", "column")
    opt = chart.get("options") or {}
    palette = style.get("palette") or model.DEFAULT_STYLE["palette"]

    if ctype == "doughnut":
        ch = DoughnutChart()
    elif ctype == "pie":
        ch = PieChart()
    elif ctype == "radar":
        ch = RadarChart()
    elif ctype == "scatter":
        ch = ScatterChart()
    elif ctype.startswith("area"):
        ch = AreaChart()
        ch.grouping = "stacked" if opt.get("stacked") else "standard"
    elif ctype.startswith("bar"):
        ch = BarChart()
        ch.type = "bar"
        ch.grouping = "stacked" if opt.get("stacked") else "clustered"
    elif ctype.startswith("line"):
        ch = LineChart()
    else:
        ch = BarChart()
        ch.type = "col"
        ch.grouping = "stacked" if opt.get("stacked") else "clustered"

    ch.title = chart.get("title") or None
    ch.height = float(opt.get("heightCm") or 8)
    ch.width = float(opt.get("widthCm") or 16)
    ch.style = 2
    if opt.get("legend") is not None:
        ch.legend = None if not opt.get("legend") else ch.legend

    n = len(chart.get("series") or [])
    nrows = len(chart.get("categories") or [])
    if ctype in ("pie", "doughnut"):
        data = Reference(data_ws, min_col=2, max_col=2, min_row=1, max_row=nrows)
        cats = Reference(data_ws, min_col=1, min_row=2, max_row=nrows + 1)
        ch.add_data(data, titles_from_data=True)
        ch.set_categories(cats)
        if opt.get("dataLabels"):
            ch.dataLabels = DataLabelList()
            ch.dataLabels.showVal = True
    elif ctype == "scatter":
        for i in range(n):
            xref = Reference(data_ws, min_col=1, min_row=2, max_row=nrows + 1)
            yref = Reference(data_ws, min_col=2 + i, min_row=1, max_row=nrows + 1)
            s = Series(yref, xref, title_from_data=True)
            ch.series.append(s)
    else:
        data = Reference(data_ws, min_col=1, max_col=1 + n, min_row=1, max_row=nrows + 1)
        ch.add_data(data, titles_from_data=True)
        cats = Reference(data_ws, min_col=1, min_row=2, max_row=nrows + 1)
        ch.set_categories(cats)
        if opt.get("dataLabels"):
            ch.dataLabels = DataLabelList()
            ch.dataLabels.showVal = True

    try:
        colors = [_rgb(c) for c in palette]
        for i, s in enumerate(ch.series):
            from openpyxl.chart.marker import DataPoint
            s.graphicalProperties.solidFill = colors[i % len(colors)]
            s.graphicalProperties.line.solidFill = colors[i % len(colors)]
    except Exception:
        pass

    ch.x_axis.title = opt.get("xTitle") or None
    ch.y_axis.title = opt.get("yTitle") or None
    ch.anchor = anchor or "H2"
    return ch


def _chart_data_sheet(wb, chart: dict, style, prefix="图数据"):
    """把图表数据写进一张隐藏工作表，供原生图表引用（改数据即改图）。"""
    ws = wb.create_sheet(title=("%s_%s" % (prefix, chart.get("id", "c")))[:28])
    cats = chart.get("categories") or []
    series = chart.get("series") or []
    ws.cell(row=1, column=1, value=chart.get("categoriesTitle") or "类别")
    for j, s in enumerate(series, start=2):
        ws.cell(row=1, column=j, value=s.get("name") or "系列%d" % (j - 1))
    for i, c in enumerate(cats, start=2):
        ws.cell(row=i, column=1, value=c)
    for j, s in enumerate(series, start=2):
        for i, v in enumerate(s.get("values") or [], start=2):
            ws.cell(row=i, column=j, value=v)
    return ws


def export(doc_data: dict, out_path: str, chart_mode: str = "native") -> str:
    style = dict(model.DEFAULT_STYLE)
    style.update(doc_data.get("styles") or {})

    if doc_data.get("kind") == "spreadsheet":
        sheets = doc_data.get("sheets") or []
    else:
        # document / presentation 也能导 Excel：把表格块与图表抽出来
        sheets = _sheets_from_blocks(doc_data)

    wb = Workbook()
    wb.remove(wb.active)
    chart_sheets = {}

    for si, sd in enumerate(sheets):
        ws = wb.create_sheet(title=str(sd.get("name") or ("Sheet%d" % (si + 1)))[:31])
        _write_sheet(ws, sd, style)
        for cdef in sd.get("charts") or []:
            ref = cdef.get("ref") or cdef.get("chart")
            chart = model.get_chart(doc_data, ref)
            anchor = cdef.get("anchor") or cdef.get("at") or \
                ("%s%d" % (get_column_letter(len(sd.get("header") or
                                                 [c.get("header") if isinstance(c, dict) else c
                                                  for c in (sd.get("columns") or [])]) + 2), 2))
            data_ws = ws
            if cdef.get("sourceRange"):
                from openpyxl.chart import Reference as Ref
                rng = cdef["sourceRange"]
                # sourceRange: "A1:D6" 首列为类别，其余为系列
                data_ws = ws
                ch = _build_chart(chart, ws, anchor, style)
                _rebind_range(ch, ws, rng, chart)
            else:
                key = chart.get("id")
                if key not in chart_sheets:
                    chart_sheets[key] = _chart_data_sheet(wb, chart, style)
                ch = _build_chart(chart, chart_sheets[key], anchor, style)
            ws.add_chart(ch, anchor)

    for key, ws in chart_sheets.items():
        ws.sheet_state = "hidden"

    if not wb.sheetnames:
        wb.create_sheet(title="Sheet1")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    wb.save(out_path)
    return out_path


def _rebind_range(ch, ws, rng, chart):
    """把图表重新绑定到工作表既有区域（首列为类别）。"""
    try:
        from openpyxl.worksheet.cell_range import CellRange
        cr = CellRange(rng)
        n = len(chart.get("series") or [])
        data = Reference(ws, min_col=cr.min_col, max_col=min(cr.max_col, cr.min_col + n),
                         min_row=cr.min_row, max_row=cr.max_row)
        ch.series = []
        ch.add_data(data, titles_from_data=True)
        ch.set_categories(Reference(ws, min_col=cr.min_col, min_row=cr.min_row + 1,
                                    max_row=cr.max_row))
    except Exception:
        pass


def _sheets_from_blocks(doc_data: dict):
    """document/presentation -> 一张汇总表 + 各表格块单独 sheet。"""
    sheets = []
    tables = []

    def collect(blocks):
        for b in blocks or []:
            if b.get("type") == "table":
                tables.append(b)

    collect(doc_data.get("blocks"))
    for s in doc_data.get("slides") or []:
        collect(s.get("blocks"))

    if tables:
        for i, t in enumerate(tables):
            sheets.append({
                "name": str(t.get("sheetName") or ("表%d" % (i + 1)))[:31],
                "header": t.get("header") or [],
                "rows": t.get("rows") or [],
            })
    elif doc_data.get("charts"):
        charts = list(doc_data["charts"].values())
        c = charts[0]
        header = ["类别"] + [s.get("name") for s in c.get("series") or []]
        rows = []
        cats = c.get("categories") or []
        for i, cat in enumerate(cats):
            rows.append([cat] + [(s.get("values") or [None] * len(cats))[i]
                                 for s in c.get("series") or []])
        sheets.append({"name": "图表数据", "header": header, "rows": rows,
                       "charts": [{"ref": c.get("id"), "anchor": "H2"}]})
    else:
        sheets.append({"name": "Sheet1", "header": [], "rows": []})
    return sheets


# ------------------------------------------------------------------ 快捷入口

def from_csv(csv_path: str, out_path: str, chart_type: str = None,
             title: str = None, style: dict = None) -> str:
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        raise model.DoyzError("CSV 为空: %s" % csv_path)
    header, body = rows[0], rows[1:]
    data = model.new_document(title or os.path.basename(csv_path), "spreadsheet")
    data["styles"].update(style or {})
    sheet = {"name": "数据", "header": header, "rows": body}
    if chart_type:
        cid = model.add_chart(
            data, chart_type,
            [r[0] for r in body],
            [{"name": h, "values": [(_num(r[i]) if i < len(r) else 0) for r in body]}
             for i, h in enumerate(header) if i > 0],
            title=title or "数据图表")
        sheet["charts"] = [{"ref": cid, "anchor": "%s%d" % (
            chr(ord("A") + min(len(header) + 1, 25)), 2)}]
    data["sheets"] = [sheet]
    return export(data, out_path)


def _num(v):
    try:
        s = str(v).replace(",", "").replace("%", "").replace("¥", "").strip()
        return float(s) if s else 0
    except ValueError:
        return 0
