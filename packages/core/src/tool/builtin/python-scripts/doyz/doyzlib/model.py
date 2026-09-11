"""doyz 文档模型：加载、校验、保存、Markdown 导入。

doyz 是本项目专用的中间文档格式（JSON 文本，扩展名 .doyz），
一份 doyz 文档可以交付成 Word / PPT / Excel 三种形态，
图表在 Word / PPT 中可导出为「原生可编辑图表」或「静态图片」。
"""

from __future__ import annotations

import copy
import json
import os
import re
import uuid
from datetime import date

FORMAT_NAME = "doyz"
FORMAT_VERSION = 1

KINDS = ("document", "presentation", "spreadsheet")

# 统一图表类型 -> (docx 枚举名, pptx 枚举名, openpyxl 工厂名)
CHART_TYPES = {
    "column": ("COLUMN_CLUSTERED", "COLUMN_CLUSTERED", "bar_col"),
    "column_stacked": ("COLUMN_STACKED", "COLUMN_STACKED", "bar_col"),
    "bar": ("BAR_CLUSTERED", "BAR_CLUSTERED", "bar_row"),
    "bar_stacked": ("BAR_STACKED", "BAR_STACKED", "bar_row"),
    "line": ("LINE", "LINE", "line"),
    "line_markers": ("LINE_MARKERS", "LINE_MARKERS", "line"),
    "area": ("AREA", "AREA", "area"),
    "area_stacked": ("AREA_STACKED", "AREA_STACKED", "area"),
    "pie": ("PIE", "PIE", "pie"),
    "doughnut": ("DOUGHNUT", "DOUGHNUT", "doughnut"),
    "scatter": ("XY_SCATTER", "XY_SCATTER", "scatter"),
    "radar": ("RADAR", "RADAR", "radar"),
}

DEFAULT_STYLE = {
    "font": "微软雅黑",
    "headingFont": "微软雅黑",
    "fontSizePt": 11,
    "lineSpacing": 1.5,
    "accent": "C2410C",
    "palette": ["C2410C", "1E6FD9", "0F766E", "B45309", "7C3AED", "BE123C",
                "0369A1", "4D7C0F", "9333EA", "0891B2"],
}

DEFAULT_PAGE = {
    "size": "A4",
    "orientation": "portrait",
    "marginCm": [2.54, 2.54, 2.54, 2.54],  # 上 右 下 左
}

PAGE_SIZES_CM = {
    "A4": (21.0, 29.7),
    "A3": (29.7, 42.0),
    "Letter": (21.59, 27.94),
    "16:9": (33.867, 19.05),
    "4:3": (25.4, 19.05),
}


class DoyzError(Exception):
    pass


# --------------------------------------------------------------------------
# 加载 / 保存
# --------------------------------------------------------------------------

def load(path: str) -> dict:
    if not os.path.exists(path):
        raise DoyzError("文件不存在: %s" % path)
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    data = json.loads(raw)
    validate(data)
    return data


def save(data: dict, path: str) -> str:
    validate(data)
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def validate(data: dict) -> None:
    if not isinstance(data, dict):
        raise DoyzError("doyz 文档必须是 JSON 对象")
    if data.get("format") != FORMAT_NAME:
        raise DoyzError("不是 doyz 文档（缺少 \"format\": \"doyz\"）")
    kind = data.get("kind")
    if kind not in KINDS:
        raise DoyzError("kind 必须是 %s 之一，当前为 %r" % (KINDS, kind))
    for cid, ch in (data.get("charts") or {}).items():
        if ch.get("type") not in CHART_TYPES:
            raise DoyzError("图表 %s 的类型 %r 不受支持，可选: %s"
                            % (cid, ch.get("type"), ", ".join(CHART_TYPES)))
        if not ch.get("series"):
            raise DoyzError("图表 %s 缺少 series" % cid)
    if kind == "document" and not data.get("blocks"):
        raise DoyzError("document 类型必须包含 blocks")
    if kind == "presentation" and not data.get("slides"):
        raise DoyzError("presentation 类型必须包含 slides")
    if kind == "spreadsheet" and not data.get("sheets"):
        raise DoyzError("spreadsheet 类型必须包含 sheets")


# --------------------------------------------------------------------------
# 构造
# --------------------------------------------------------------------------

def new_document(title: str = "未命名文档", kind: str = "document") -> dict:
    doc = {
        "format": FORMAT_NAME,
        "version": FORMAT_VERSION,
        "kind": kind,
        "meta": {"title": title, "author": "", "created": date.today().isoformat()},
        "styles": copy.deepcopy(DEFAULT_STYLE),
        "page": copy.deepcopy(DEFAULT_PAGE),
        "charts": {},
    }
    if kind == "document":
        doc["blocks"] = [{"type": "heading", "level": 1, "text": title}]
    elif kind == "presentation":
        doc["page"]["size"] = "16:9"
        doc["slides"] = [{"layout": "title", "title": title, "subtitle": "", "blocks": []}]
    else:
        doc["sheets"] = [{"name": "Sheet1", "columns": [], "rows": [], "charts": []}]
    return doc


def add_chart(doc: dict, chart_type: str, categories, series, title: str = "",
              **options) -> str:
    """向文档追加一个图表定义，返回图表 id。"""
    if chart_type not in CHART_TYPES:
        raise DoyzError("不支持的图表类型: %s" % chart_type)
    cid = options.pop("id", None) or ("chart_%s" % uuid.uuid4().hex[:6])
    chart = {
        "id": cid,
        "type": chart_type,
        "title": title,
        "categories": list(categories),
        "series": [s if isinstance(s, dict) else {"name": "系列", "values": list(s)}
                   for s in series],
        "options": {
            "legend": True,
            "dataLabels": False,
            "stacked": chart_type.endswith("_stacked"),
            "widthCm": 15,
            "heightCm": 8,
            "xTitle": "",
            "yTitle": "",
        },
    }
    chart["options"].update(options)
    doc.setdefault("charts", {})[cid] = chart
    return cid


def get_chart(doc: dict, ref: str) -> dict:
    try:
        return doc["charts"][ref]
    except KeyError:
        raise DoyzError("找不到图表定义: %s" % ref)


# --------------------------------------------------------------------------
# Markdown 轻量导入
# --------------------------------------------------------------------------

def from_markdown(md: str, title: str = "未命名文档", kind: str = "document") -> dict:
    """把 Markdown 转成 doyz document。支持 # 标题 / 段落 / 列表 / 表格 / 代码块。"""
    doc = new_document(title, "document")
    blocks = doc["blocks"] = []
    lines = md.splitlines()
    i = 0
    para_buf = []

    def flush_para():
        if para_buf:
            text = " ".join(para_buf).strip()
            if text:
                blocks.append({"type": "paragraph", "text": text})
            para_buf.clear()

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            flush_para()
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            flush_para()
            blocks.append({"type": "heading", "level": len(m.group(1)),
                           "text": m.group(2).strip()})
            i += 1
            continue

        if stripped.startswith("```"):
            flush_para()
            lang = stripped[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "lang": lang, "text": "\n".join(buf)})
            continue

        if re.match(r"^[-*+]\s+", stripped) or re.match(r"^\d+[.)]\s+", stripped):
            flush_para()
            ordered = bool(re.match(r"^\d+[.)]\s+", stripped))
            items = []
            while i < len(lines):
                s = lines[i].strip()
                ok = re.match(r"^\d+[.)]\s+", s) if ordered else re.match(r"^[-*+]\s+", s)
                if not ok:
                    break
                items.append(re.sub(r"^([-*+]|\d+[.)])\s+", "", s))
                i += 1
            blocks.append({"type": "bullets", "ordered": ordered, "items": items})
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(
                r"^\|?[\s:\-|]+\|[\s:\-|]*$", lines[i + 1].strip()):
            flush_para()
            header = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            blocks.append({"type": "table", "header": header, "rows": rows})
            continue

        if stripped.startswith(">"):
            flush_para()
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            blocks.append({"type": "quote", "text": " ".join(buf)})
            continue

        para_buf.append(stripped)
        i += 1

    flush_para()
    return doc
