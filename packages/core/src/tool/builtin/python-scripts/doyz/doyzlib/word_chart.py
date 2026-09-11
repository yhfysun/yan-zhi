"""Word 原生图表注入器。

python-docx 没有创建图表的 API（只能读），所以原生图表走「后处理」路线：
先用 python-docx 在目标位置埋一个标记 run，保存后再做 zip 手术——
借 python-pptx 的 ChartXmlWriter 生成 chartSpace XML、chart_data.xlsx_blob
生成内嵌数据工作簿，然后把 chart part / embedded xlsx / rels / content-types
全部注入 .docx 包，并把标记 run 替换成 w:drawing 内联图形。

效果与 Word 里手工插入的图表一致：双击可改数据，右键可换图表类型。
"""

from __future__ import annotations

import io
import shutil
import zipfile

from lxml import etree

from . import model

MARKER = "@@DOYZCHART:"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

CHART_CT = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"
XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CHART_REL = R_NS + "/chart"
PKG_REL = R_NS + "/package"

EMU_PER_CM = 360000


def _chart_data(chart: dict):
    from pptx.chart.data import CategoryChartData, XyChartData

    if chart.get("type") == "scatter":
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


def _chart_xml(chart: dict) -> bytes:
    from pptx.chart.xmlwriter import ChartXmlWriter
    from pptx.enum.chart import XL_CHART_TYPE

    enum_name = model.CHART_TYPES[chart["type"]][1]
    cd = _chart_data(chart)
    xml = ChartXmlWriter(getattr(XL_CHART_TYPE, enum_name), cd).xml
    root = etree.fromstring(xml.encode("utf-8"))

    # externalData -> 内嵌工作簿（Word「编辑数据」的入口），schema 上是最后一个子元素
    ed = etree.SubElement(root, "{%s}externalData" % C_NS)
    ed.set("{%s}id" % R_NS, "rId1")
    etree.SubElement(ed, "{%s}autoUpdate" % C_NS).set("val", "0")

    # 图表标题
    if chart.get("title"):
        cs = root.find("{%s}chart" % C_NS)
        if cs is not None:
            title = etree.Element("{%s}title" % C_NS)
            tx = etree.SubElement(title, "{%s}tx" % C_NS)
            rich = etree.SubElement(tx, "{%s}rich" % A_NS)
            etree.SubElement(rich, "{%s}bodyPr" % A_NS)
            etree.SubElement(rich, "{%s}lstStyle" % A_NS)
            p = etree.SubElement(rich, "{%s}p" % A_NS)
            ppr = etree.SubElement(p, "{%s}pPr" % A_NS)
            defrpr = etree.SubElement(ppr, "{%s}defRPr" % A_NS)
            etree.SubElement(defrpr, "{%s}b" % A_NS).set("val", "1")
            sz = etree.SubElement(defrpr, "{%s}sz" % A_NS)
            sz.set("val", "1200")
            r = etree.SubElement(p, "{%s}r" % A_NS)
            rpr = etree.SubElement(r, "{%s}rPr" % A_NS)
            rpr.set("lang", "zh-CN")
            etree.SubElement(rpr, "{%s}b" % A_NS).set("val", "1")
            sz2 = etree.SubElement(rpr, "{%s}sz" % A_NS)
            sz2.set("val", "1200")
            t = etree.SubElement(r, "{%s}t" % A_NS)
            t.text = str(chart["title"])
            overlay = etree.SubElement(title, "{%s}overlay" % C_NS)
            overlay.set("val", "0")
            cs.insert(0, title)

    # 图例
    opt = chart.get("options") or {}
    cs = root.find("{%s}chart" % C_NS)
    if cs is not None:
        legend = cs.find("{%s}legend" % C_NS)
        if not opt.get("legend") or len(chart.get("series") or []) <= 1:
            if legend is not None:
                cs.remove(legend)
        elif legend is None and len(chart.get("series") or []) > 1:
            legend = etree.Element("{%s}legend" % C_NS)
            pos = etree.SubElement(legend, "{%s}legendPos" % C_NS)
            pos.set("val", "b")
            ov = etree.SubElement(legend, "{%s}overlay" % C_NS)
            ov.set("val", "0")
            cs.append(legend)

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def _drawing_run(rid: str, doc_pr_id: int, name: str, w_cm: float, h_cm: float):
    xml = (
        '<w:r xmlns:w="%s" xmlns:wp="%s" xmlns:a="%s" xmlns:c="%s" xmlns:r="%s">'
        '<w:drawing>'
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="%d" cy="%d"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:docPr id="%d" name="%s"/>'
        '<wp:cNvGraphicFramePr/>'
        '<a:graphic>'
        '<a:graphicData uri="%s">'
        '<c:chart r:id="%s"/>'
        '</a:graphicData>'
        '</a:graphic>'
        '</wp:inline>'
        '</w:drawing>'
        '</w:r>'
    ) % (W_NS, WP_NS, A_NS, C_NS, R_NS,
         int(float(w_cm) * EMU_PER_CM), int(float(h_cm) * EMU_PER_CM),
         doc_pr_id, name.replace("&", "&amp;").replace('"', "&quot;"),
         C_NS, rid)
    return etree.fromstring(xml.encode("utf-8"))


def inject(docx_path: str, doc_data: dict, style: dict) -> str:
    with zipfile.ZipFile(docx_path, "r") as z:
        entries = {n: z.read(n) for n in z.namelist()}

    doc_xml = etree.fromstring(entries["word/document.xml"])

    # 1. 找到全部图表标记 run，按文档顺序编号
    markers = []  # (run_element, chart_id)
    for t in doc_xml.iter("{%s}t" % W_NS):
        if t.text and t.text.startswith(MARKER):
            cid = t.text[len(MARKER):].rstrip("@")
            markers.append((t.getparent(), cid))

    if not markers:
        return docx_path  # 没有原生图表，无需处理

    # 2. 分配关系 id
    rels = etree.fromstring(entries["word/_rels/document.xml.rels"])
    used = 0
    for rel in rels:
        try:
            used = max(used, int(rel.get("Id")[3:]))
        except (ValueError, TypeError, AttributeError):
            pass

    ct_xml = etree.fromstring(entries["[Content_Types].xml"])
    has_xlsx_default = any(
        d.get("Extension") == "xlsx" for d in ct_xml.findall("{%s}Default" % CT_NS))
    if not has_xlsx_default:
        d = etree.SubElement(ct_xml, "{%s}Default" % CT_NS)
        d.set("Extension", "xlsx")
        d.set("ContentType", XLSX_CT)

    doc_pr_id = 1000
    for n, (run_el, cid) in enumerate(markers, start=1):
        chart = model.get_chart(doc_data, cid)
        opt = chart.get("options") or {}

        rid = "rId%d" % (used + n)
        part_chart = "word/charts/chart%d.xml" % n
        part_xlsx = "word/embeddings/doyz_chart%d.xlsx" % n

        # document rels
        rel = etree.SubElement(rels, "{%s}Relationship" % REL_NS)
        rel.set("Id", rid)
        rel.set("Type", CHART_REL)
        rel.set("Target", "charts/chart%d.xml" % n)

        # content type override
        ov = etree.SubElement(ct_xml, "{%s}Override" % CT_NS)
        ov.set("PartName", "/" + part_chart)
        ov.set("ContentType", CHART_CT)

        # chart part
        entries[part_chart] = _chart_xml(chart)
        entries[part_xlsx] = _chart_data(chart).xlsx_blob

        # chart part rels -> embedded xlsx
        chart_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="%s">'
            '<Relationship Id="rId1" Type="%s" Target="../embeddings/doyz_chart%d.xlsx"/>'
            '</Relationships>'
        ) % (REL_NS, PKG_REL, n)
        entries["word/_rels/charts/chart%d.xml.rels" % n] = chart_rels.encode("utf-8")

        # 用 drawing run 替换标记 run
        drawing = _drawing_run(rid, doc_pr_id, "DOYZ 图表 %s" % cid,
                               float(opt.get("widthCm") or 15),
                               float(opt.get("heightCm") or 8))
        run_el.getparent().replace(run_el, drawing)
        doc_pr_id += 1

    entries["word/document.xml"] = etree.tostring(
        doc_xml, xml_declaration=True, encoding="UTF-8", standalone=True)
    entries["word/_rels/document.xml.rels"] = etree.tostring(
        rels, xml_declaration=True, encoding="UTF-8", standalone=True)
    entries["[Content_Types].xml"] = etree.tostring(
        ct_xml, xml_declaration=True, encoding="UTF-8", standalone=True)

    # 3. 原地重写 zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    tmp = docx_path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(buf.getvalue())
    shutil.move(tmp, docx_path)
    return docx_path
