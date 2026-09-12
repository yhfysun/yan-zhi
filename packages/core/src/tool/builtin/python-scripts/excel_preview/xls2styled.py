# -*- coding: utf-8 -*-
"""旧版 .xls 带样式预览：用 xlrd(formatting_info=True) 读取字体/颜色/填充/对齐/合并/列宽。

输出 JSON（stdout 最后一行）形状与前端 ExcelStyledBook 完全一致：
{"sheets": [{"name", "cells": [["", {"bold": true, ...}]], "merges", "colWidths", "truncated"}]}

依赖 xlrd>=2.0（仅支持 .xls；打包期预烤进 site-packages，运行期不 pip）。
缺依赖时 stderr 打印 "Error: 缺少 xlrd ..."，调用方（服务端路由）返回 501，前端降级为无样式文本预览。
"""
import argparse
import json
import sys

MAX_ROWS = 500
MAX_COLS = 64


def colour_to_hex(idx, cmap):
    """xlrd 颜色索引 → '#rrggbb'；系统色（0x40+）或未知返回 None"""
    if idx is None or idx >= 0x40:
        return None
    try:
        rgb = cmap.get(idx)
    except Exception:
        return None
    if not rgb:
        return None
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


def cell_value_to_str(cell, wb_datemode: int) -> str:
    """xlrd cell → 显示字符串（ctype: 0 empty/1 text/2 number/3 date/4 bool/5 error/6 blank）"""
    t, v = cell.ctype, cell.value
    if t in (0, 6) or v is None:
        return ""
    if t == 1:
        return str(v)
    if t == 2:
        f = float(v)
        return str(int(f)) if f.is_integer() else str(f)
    if t == 3:
        try:
            import xlrd
            dt = xlrd.xldate.xldate_as_datetime(v, wb_datemode)
            return dt.strftime("%Y-%m-%d %H:%M") if (dt.hour or dt.minute) else dt.strftime("%Y-%m-%d")
        except Exception:
            return str(v)
    if t == 4:
        return "TRUE" if v else "FALSE"
    if t == 5:
        return "#ERROR"
    return str(v)


def style_of(xf, fonts, cmap) -> dict:
    """XF 记录 → CellStyle（与前端 excel-styled.ts 的 CellStyle 对齐）"""
    s: dict = {}
    font = fonts[xf.font_index]
    if font.bold or font.weight >= 700:
        s["bold"] = True
    if font.italic:
        s["italic"] = True
    if getattr(font, "underline_type", 0):
        s["underline"] = True
    if font.struck_out:
        s["strike"] = True
    if font.height:
        pt = font.height / 20.0
        if abs(pt - 11.0) > 0.3:  # 默认 11pt 不冗余输出
            s["fontSize"] = round(pt, 1)
    col = colour_to_hex(font.colour_index, cmap)
    if col and col != "#000000":
        s["color"] = col

    al = xf.alignment
    if al.hor_align == 1:
        s["align"] = "left"
    elif al.hor_align == 2:
        s["align"] = "center"
    elif al.hor_align == 3:
        s["align"] = "right"
    if al.vert_align == 0:
        s["valign"] = "top"
    elif al.vert_align == 1:
        s["valign"] = "middle"
    elif al.vert_align == 2:
        s["valign"] = "bottom"
    if al.text_wrapped:
        s["wrap"] = True

    bg = xf.background
    # solid 填充（pattern=1）的可见色在 xlrd 中的索引位置存在歧义（pattern 或 background），
    # 依次尝试两个索引，取第一个有效调色板色
    if bg.fill_pattern:
        for idx in (bg.pattern_colour_index, bg.background_colour_index):
            c = colour_to_hex(idx, cmap)
            if c:
                s["bg"] = c
                break
    return s


def main() -> int:
    p = argparse.ArgumentParser(prog="xls2styled", description="xlrd 读取 .xls 带样式结构")
    p.add_argument("--xls", required=True, help="输入 .xls 路径")
    a = p.parse_args()

    try:
        import xlrd
    except ImportError:
        print("Error: 缺少 xlrd 依赖（打包环境应预烤）", file=sys.stderr)
        return 2

    wb = xlrd.open_workbook(a.xls, formatting_info=True)
    fonts = wb.font_list
    cmap = wb.colour_map or {}
    out_sheets = []
    for sh in wb.sheets():
        max_row = min(sh.nrows, MAX_ROWS)
        max_col = min(sh.ncols, MAX_COLS)
        cells = []
        for r in range(max_row):
            row = []
            for c in range(max_col):
                try:
                    xf = wb.xf_list[sh.cell_xf_index(r, c)]
                    s = style_of(xf, fonts, cmap)
                except Exception:
                    s = {}
                row.append({"v": cell_value_to_str(sh.cell(r, c), wb.datemode), "s": s})
            cells.append(row)

        merges = []
        for (rlo, rhi, clo, chi) in sh.merged_cells:
            if rlo < MAX_ROWS and clo < MAX_COLS:
                merges.append({
                    "r": rlo, "c": clo,
                    "rs": min(rhi, MAX_ROWS) - rlo,
                    "cs": min(chi, MAX_COLS) - clo,
                })

        col_widths = []
        for c in range(max_col):
            ci = sh.colinfo_map.get(c)
            # xlrd width 单位 1/256 字符；约 1 字符 ≈ 7px，保底 40
            w = round(ci.width / 256.0 * 7) if ci and ci.width else 64
            col_widths.append(max(w, 40))

        out_sheets.append({
            "name": sh.name,
            "cells": cells,
            "merges": merges,
            "colWidths": col_widths,
            "truncated": sh.nrows > MAX_ROWS or sh.ncols > MAX_COLS,
        })

    print(json.dumps({"sheets": out_sheets}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
