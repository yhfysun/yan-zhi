"""RapidOCR（PP-OCRv4 mobile，ONNX Runtime）本地文字识别。

调用：python ocr_rapid.py <图片路径>
输出：stdout 最后一行是 JSON（服务端只解析最后一行，前面 rapidocr 自身的日志不影响）。
  成功 {"ok":true,"provider":"rapidocr","text":"...","avg_score":0.98,"lines":[{"text":..,"score":..}]}
  失败 {"ok":false,"error":"..."}（进程退出码非 0 时同样解析 stdout，便于回显原因）

★ 为什么不用 PaddlePaddle：只装 onnxruntime + 16MB 模型即可离线跑中文，安装包小一个数量级。
★ 兼容两代包名：打包固定在 rapidocr-onnxruntime 1.4.x（v1 API），若将来升到 2.x（统一包
  rapidocr）也不会挂 —— 见 load_engine/normalize。
"""

import json
import os
import sys

# 送进检测模型的**长边上限**（像素）。相机原图原始尺寸直接喂会慢到不可用，详见 load_bounded_image。
OCR_MAX_EDGE = 2560


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR  # v1.x（当前打包版本）

        return RapidOCR(), "rapidocr_onnxruntime"
    except ImportError as v1_err:
        try:
            from rapidocr import RapidOCR  # v2.x 统一包

            return RapidOCR(), "rapidocr"
        except ImportError as v2_err:
            # 两个都失败时把**真实原因**都带上：只报 v2 的 "No module named rapidocr"
            # 会掩盖 v1 包已安装但内部依赖坏了的情况（实测踩过）。
            raise ImportError("rapidocr-onnxruntime: %s / rapidocr: %s" % (v1_err, v2_err))


def normalize(result):
    """把两代返回结构统一成 [(text, score, x0, y0, x1, y1), ...]。

    v1：engine(path) -> ([[box, text, score], ...], elapse)
    v2：engine(path) -> 对象，带 .txts / .scores / .boxes
    坐标只用于把文字行聚成「视觉行」（见 group_rows），不做版面重建。
    """
    if result is None:
        return []
    if hasattr(result, "txts"):  # v2
        texts = list(getattr(result, "txts", None) or [])
        scores = list(getattr(result, "scores", None) or [])
        boxes = list(getattr(result, "boxes", None) or [])
        items = []
        for i, t in enumerate(texts):
            x0 = y0 = 0.0
            x1 = y1 = 0.0
            if i < len(boxes) and len(boxes[i]) >= 4:
                pts = [(float(p[0]), float(p[1])) for p in boxes[i][:4]]
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            items.append((t, float(scores[i]) if i < len(scores) else 1.0, x0, y0, x1, y1))
        return items
    if isinstance(result, tuple):  # v1（result, elapse）
        result = result[0]
    items = []
    for item in result or []:
        try:
            box, text, score = item[0], item[1], float(item[2])
            xs = [float(p[0]) for p in box]
            ys = [float(p[1]) for p in box]
            items.append((text, score, min(xs), min(ys), max(xs), max(ys)))
        except (IndexError, TypeError, ValueError):
            continue
    return items


def group_rows(items):
    """按纵坐标把文字行聚成**视觉行**，行内按横坐标排序 → 单元格序列。

    ★ 为什么需要（2026-10-27 用户实测）：PP-OCR 只给行级文字，表格会被读成一串顺序
      文字（「项目 / 结果」上下两行，列关系丢失）。带上行/列位置后，上层就能据此还原
      「项目 | 结果」。纯文字截图每行只有一格，输出与原来一致。
    """
    if not items:
        return []
    heights = sorted(max(1.0, i[5] - i[3]) for i in items)
    median_h = heights[len(heights) // 2]
    tol = max(6.0, median_h * 0.6)
    grouped = []
    for it in sorted(items, key=lambda i: ((i[3] + i[5]) / 2.0, i[2])):
        yc = (it[3] + it[5]) / 2.0
        if grouped and abs(yc - grouped[-1]["yc"]) <= tol:
            grouped[-1]["cells"].append(it)
        else:
            grouped.append({"yc": yc, "cells": [it]})
    return [
        [{"text": c[0], "score": round(c[1], 4)} for c in sorted(g["cells"], key=lambda i: i[2])]
        for g in grouped
    ]


def load_bounded_image(path):
    """读图并把长边限制在 OCR_MAX_EDGE 以内，返回 (BGR ndarray, 缩放说明或 None)。

    ★ 为什么必须限边（2026-10-27 实测）：4000x3000 的原图（14MB）直接喂进去，
      检测头会把整图切成海量候选框，**跑 5 分钟不返回**。限到 2560 长边后降到数秒，
      而相机/文档场景的正文在这种尺度下仍足够识别。
    ★ 用 cv2 读（BGR）而不是 PIL+ndarray：rapidocr 的 ndarray 入口按 BGR 处理，
      传 RGB 会让彩色文字（红章、蓝字）通道错位。
    """
    import cv2

    img = cv2.imread(path)
    if img is None:
        raise ValueError("图片无法解码（格式不支持或文件损坏）: " + os.path.basename(path))
    h, w = img.shape[:2]
    long_edge = max(h, w)
    if long_edge <= OCR_MAX_EDGE:
        return img, None
    scale = OCR_MAX_EDGE / float(long_edge)
    resized = cv2.resize(img, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)
    return resized, "%dx%d -> %dx%d" % (w, h, resized.shape[1], resized.shape[0])


def main():
    if len(sys.argv) < 2:
        emit({"ok": False, "error": "用法: ocr_rapid.py <图片路径>"})
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        emit({"ok": False, "error": "图片不存在: " + path})
        return 2

    try:
        engine, flavor = load_engine()
    except Exception as e:  # noqa: BLE001 —— 缺包/缺模型都要能回显给服务端
        emit({"ok": False, "error": "rapidocr 不可用: %s" % e})
        return 3

    try:
        img, resized_note = load_bounded_image(path)
        out = engine(img)
    except Exception as e:  # noqa: BLE001 —— 解码失败/坏图同理
        emit({"ok": False, "error": "识别失败: %s" % e})
        return 4

    items = [i for i in normalize(out) if i[0] and i[0].strip()]
    emit(
        {
            "ok": True,
            "provider": "rapidocr",
            "flavor": flavor,
            "text": "\n".join(i[0] for i in items),
            "avg_score": round(sum(i[1] for i in items) / len(items), 4) if items else 0.0,
            "lines": [
                {"text": i[0], "score": round(i[1], 4), "x": round(i[2], 1), "y": round(i[3], 1)}
                for i in items
            ],
            "rows": group_rows(items),
            "resized": resized_note,
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
