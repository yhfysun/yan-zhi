#!/usr/bin/env python3
"""doyz 命令行工具：内部文档格式 <-> Word / PPT / Excel。

    doyz init      --kind document --title "报告"  -o 报告.doyz
    doyz from-md   --md 草稿.md -o 报告.doyz
    doyz validate  报告.doyz
    doyz preview   报告.doyz --serve            # 浏览器里改图表数据/类型
    doyz export    报告.doyz --to docx --chart native
    doyz export    报告.doyz --to docx --chart image
    doyz export    报告.doyz --to pptx --chart native
    doyz export    报告.doyz --to xlsx
    doyz xlsx      --csv 数据.csv --chart column -o 数据.xlsx
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from doyzlib import docx_out, html_out, model, pptx_out, xlsx_out  # noqa: E402

IMG_NOTE = {"native": "原生图表（可在 Office 里改数据/换类型）",
            "image": "图片图表（静态，兼容优先）"}


def _load(path: str) -> dict:
    data = model.load(path)
    data["_base_dir"] = os.path.dirname(os.path.abspath(path))
    data["_tmpdir"] = tempfile.mkdtemp(prefix="doyz_")
    return data


def _default_out(src: str, ext: str, chart_mode: str = None) -> str:
    base = os.path.splitext(src)[0]
    suffix = "" if (chart_mode in (None, "native")) else "-图片图表"
    return "%s%s.%s" % (base, suffix, ext)


# ------------------------------------------------------------------ 子命令

def cmd_init(a):
    doc = model.new_document(a.title, a.kind)
    if a.chart_type:
        cid = model.add_chart(doc, a.chart_type, a.categories or ["类别1", "类别2"],
                              [{"name": "系列1", "values": [1, 2]}], title="示例图表")
        if doc["kind"] == "document":
            doc["blocks"].append({"type": "chart", "ref": cid})
        elif doc["kind"] == "presentation":
            doc["slides"][0]["blocks"].append({"type": "chart", "ref": cid})
        else:
            doc["sheets"][0]["charts"].append({"ref": cid, "anchor": "H2"})
    out = a.out or ("%s.doyz" % (a.title or "document"))
    model.save(doc, out)
    print("已创建 %s (kind=%s)" % (out, a.kind))


def cmd_from_md(a):
    with open(a.md, "r", encoding="utf-8") as f:
        md = f.read()
    doc = model.from_markdown(md, a.title or os.path.splitext(os.path.basename(a.md))[0])
    out = a.out or (os.path.splitext(a.md)[0] + ".doyz")
    model.save(doc, out)
    print("已转换 %s -> %s（%d 个块）" % (a.md, out, len(doc["blocks"])))


def cmd_validate(a):
    doc = model.load(a.file)
    n_charts = len(doc.get("charts") or {})
    print("OK  kind=%s  图表=%d" % (doc["kind"], n_charts))
    for cid, ch in (doc.get("charts") or {}).items():
        print("   - %-10s %-16s 系列x%d 类别x%d" % (
            cid, ch["type"], len(ch.get("series") or []), len(ch.get("categories") or [])))


def cmd_preview(a):
    doc = _load(a.file)
    if a.serve:
        html_out.serve(doc, os.path.abspath(a.file), port=a.port, open_browser=not a.no_browser)
        return
    out = a.out or (os.path.splitext(a.file)[0] + ".html")
    html_out.render(doc, out, serve=False)
    print("已生成预览 %s" % out)
    if not a.no_browser:
        import webbrowser
        webbrowser.open("file:///" + os.path.abspath(out).replace("\\", "/"))


def cmd_export(a):
    doc = _load(a.file)
    out = a.out or _default_out(a.file, a.to, a.chart)
    mod = {"docx": docx_out, "pptx": pptx_out, "xlsx": xlsx_out}[a.to]
    if a.to == "xlsx" and doc["kind"] != "spreadsheet":
        print("提示：源文档 kind=%s，Excel 导出将抽取其中的表格与图表" % doc["kind"])
    mod.export(doc, out, a.chart)
    print("已导出 %s  [%s]" % (out, IMG_NOTE.get(a.chart, "")))


def cmd_xlsx(a):
    style = {"accent": a.accent} if a.accent else None
    out = a.out or (os.path.splitext(a.csv or a.json)[0] + ".xlsx")
    if a.csv:
        xlsx_out.from_csv(a.csv, out, chart_type=a.chart_type, title=a.title, style=style)
    else:
        with open(a.json, "r", encoding="utf-8") as f:
            data = json.load(f)
        sheets = data if isinstance(data, list) else data.get("sheets")
        doc = model.new_document(a.title or "数据", "spreadsheet")
        doc["sheets"] = sheets
        if style:
            doc["styles"].update(style)
        xlsx_out.export(doc, out)
    print("已生成 %s" % out)


def cmd_add_chart(a):
    doc = model.load(a.file)
    categories = [c.strip() for c in a.categories.split(",") if c.strip()]
    series = []
    for spec in a.values:
        name, _, vals = spec.partition("=")
        series.append({
            "name": name.strip(),
            "values": [float(v) if v.strip() else 0 for v in vals.split(",")],
        })
    cid = model.add_chart(doc, a.chart_type, categories, series, title=a.title)
    if doc["kind"] == "document":
        doc["blocks"].append({"type": "chart", "ref": cid})
    elif doc["kind"] == "presentation":
        target = doc["slides"][a.slide]
        target.setdefault("blocks", []).append({"type": "chart", "ref": cid})
    else:
        doc["sheets"][0].setdefault("charts", []).append({"ref": cid, "anchor": a.anchor})
    model.save(doc, a.file)
    print("已向 %s 添加图表 %s (%s)" % (a.file, cid, a.chart_type))


# ------------------------------------------------------------------ 入口

def main(argv=None):
    p = argparse.ArgumentParser(prog="doyz", description="doyz 文档工具")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init", help="新建 doyz 文档")
    s.add_argument("--kind", default="document", choices=list(model.KINDS))
    s.add_argument("--title", default="未命名文档")
    s.add_argument("-o", "--out")
    s.add_argument("--chart-type", choices=list(model.CHART_TYPES))
    s.add_argument("--categories")
    s.set_defaults(func=cmd_init)

    s = sub.add_parser("from-md", help="Markdown 转 doyz")
    s.add_argument("--md", required=True)
    s.add_argument("--title")
    s.add_argument("-o", "--out")
    s.set_defaults(func=cmd_from_md)

    s = sub.add_parser("validate", help="校验 doyz")
    s.add_argument("file")
    s.set_defaults(func=cmd_validate)

    s = sub.add_parser("preview", help="生成 HTML 预览 / 启动编辑器")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--serve", action="store_true", help="启动本地服务，支持导出与保存")
    s.add_argument("--port", type=int, default=8777)
    s.add_argument("--no-browser", action="store_true")
    s.set_defaults(func=cmd_preview)

    s = sub.add_parser("export", help="导出 Word / PPT / Excel")
    s.add_argument("file")
    s.add_argument("--to", required=True, choices=["docx", "pptx", "xlsx"])
    s.add_argument("--chart", default="native", choices=["native", "image"])
    s.add_argument("-o", "--out")
    s.set_defaults(func=cmd_export)

    s = sub.add_parser("xlsx", help="从 CSV/JSON 直接生成 Excel")
    s.add_argument("--csv")
    s.add_argument("--json")
    s.add_argument("--chart-type", choices=list(model.CHART_TYPES))
    s.add_argument("--title")
    s.add_argument("--accent")
    s.add_argument("-o", "--out")
    s.set_defaults(func=cmd_xlsx)

    s = sub.add_parser("add-chart", help="向已有 doyz 追加图表")
    s.add_argument("file")
    s.add_argument("--chart-type", required=True, choices=list(model.CHART_TYPES))
    s.add_argument("--categories", required=True, help="逗号分隔，如 Q1,Q2,Q3,Q4")
    s.add_argument("--values", nargs="+", required=True, help="如 营收=120,150,180,210")
    s.add_argument("--title", default="")
    s.add_argument("--slide", type=int, default=0)
    s.add_argument("--anchor", default="H2")
    s.set_defaults(func=cmd_add_chart)

    a = p.parse_args(argv)
    try:
        a.func(a)
    except model.DoyzError as e:
        print("错误: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
