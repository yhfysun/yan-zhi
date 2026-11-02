#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""face_center.py —— 智能竖屏重构的「人脸抽样」一步（2026-11-02，P2-4 MVP）。

用法：
  python face_center.py --video <视频> [--samples 12] [--interval 秒]
                        [--start 秒] [--duration 秒]

输出：一行 JSON（UTF-8，ensure_ascii=False）
  成功：{"ok": true, "width": W, "height": H,
         "faces": [{"t": 秒, "x": px, "y": px, "w": px, "h": px}, ...]}
  失败：{"ok": false, "error": "..."}   （同时 exit 1）

★ 只做「抽帧 + Haar 正脸检测」，不做跟踪、不做运镜：
  · 均匀抽帧（默认 12 帧，最多 24 帧），每帧只取**面积最大**的一张脸；
  · 先把帧缩到最长边 ≤640 再检测（Haar 在 1080p 上慢且收益低）；
  · 坐标按缩放比例还原成**源视频像素坐标**，由服务端换算成 0~1 相对裁切窗口。
★ 检测不到人脸不是错误：faces 返回空数组，由服务端回退画面中心裁切并给 warning。
★ 依赖 OpenCV（opencv-python）。随包 Python 的 cv2 若是精简版（不含 objdetect /
  CascadeClassifier）会如实报错并提示安装，绝不假装成功。
"""
from __future__ import annotations

import argparse
import json
import os
import sys

MAX_FRAMES = 24          # 耗时护栏：再多抽帧对「静态居中」几乎没有增益
DEFAULT_SAMPLES = 12
MAX_DETECT_EDGE = 640    # 检测前把帧缩到最长边 ≤ 640
MIN_FACE_SIZE = 24       # Haar 最小窗口（缩放后画面）
SCALE_FACTOR = 1.1
MIN_NEIGHBORS = 5


def _fail(msg: str) -> None:
    print(json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False))
    sys.exit(1)


def _load_cascade():
    try:
        import cv2  # noqa: PLC0415
    except Exception as e:  # ImportError / DLL 加载失败都归为「cv2 不可用」
        _fail(
            "缺少 OpenCV（cv2）：%s。请安装 opencv-python：pip install opencv-python "
            "（若使用随包 Python，需要带 objdetect 的完整版）" % e
        )
    cascade_cls = getattr(cv2, "CascadeClassifier", None)
    if cascade_cls is None:
        _fail(
            "当前 cv2 不含人脸检测能力（缺少 objdetect / CascadeClassifier）。"
            "请安装完整版 opencv-python：pip install --upgrade opencv-python"
        )
    data_dir = getattr(getattr(cv2, "data", None), "haarcascades", "") or ""
    xml = os.path.join(data_dir, "haarcascade_frontalface_default.xml")
    if not os.path.isfile(xml):
        _fail(
            "缺少 Haar 正脸模型 haarcascade_frontalface_default.xml（cv2.data.haarcascades 下找不到）。"
            "请重装完整版 opencv-python"
        )
    cascade = cascade_cls(xml)
    if cascade.empty():
        _fail("Haar 正脸模型加载失败（文件损坏或不兼容）")
    return cv2, cascade


def _even_times(start: float, duration: float, samples: int, interval: float | None):
    """在 [start, start+duration] 内均匀取 n 个时刻（含两端留白，避开首尾黑帧）。"""
    if interval and interval > 0 and duration > 0:
        n = int(duration / float(interval)) + 1
    else:
        n = int(samples)
    n = max(1, min(MAX_FRAMES, n))
    if duration <= 0:
        return None, n
    return [start + duration * (i + 0.5) / n for i in range(n)], n


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="face_center", description="抽帧 + Haar 正脸检测（竖屏裁切用）")
    p.add_argument("--video", required=True, help="视频文件路径")
    p.add_argument("--samples", type=int, default=DEFAULT_SAMPLES, help="抽样帧数（默认 12，最多 24）")
    p.add_argument("--interval", type=float, default=0, help="抽样间隔秒（>0 时按间隔均分，覆盖 --samples）")
    p.add_argument("--start", type=float, default=0, help="只分析从该秒开始的区间（片段 trimStart）")
    p.add_argument("--duration", type=float, default=0, help="分析区间时长（秒，0=到片尾）")
    a = p.parse_args(argv)

    video = a.video
    if not video or not os.path.isfile(video):
        _fail("视频文件不存在：%s" % video)

    cv2, cascade = _load_cascade()

    cap = cv2.VideoCapture(video)
    if not cap or not cap.isOpened():
        _fail("无法打开视频（编码不支持或文件损坏）：%s" % video)

    try:
        width = int(round(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0))
        height = int(round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        frames = float(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if width <= 0 or height <= 0:
            _fail("无法读取视频分辨率（可能是纯音频/损坏文件）：%s" % video)
        total = frames / fps if fps > 0 and frames > 0 else 0

        start = max(0.0, float(a.start or 0))
        if total > 0:
            start = min(start, max(0.0, total - 0.05))
        dur = float(a.duration or 0)
        if dur <= 0 and total > 0:
            dur = max(0.0, total - start)
        elif dur > 0 and total > 0:
            dur = min(dur, max(0.0, total - start))

        times, n = _even_times(start, dur, a.samples, a.interval)
        faces_out = []

        if times is None:
            # 取不到时长（罕见编码）：按帧号均匀采样
            if frames > 0:
                for i in range(n):
                    cap.set(cv2.CAP_PROP_POS_FRAMES, int(frames * (i + 0.5) / n))
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        continue
                    t = (i + 0.5) * (frames / n) / fps if fps > 0 else 0.0
                    hit = _detect_one(cv2, cascade, frame, width, height)
                    if hit:
                        fx, fy, fw, fh = hit
                        faces_out.append({"t": round(t, 3), "x": fx, "y": fy, "w": fw, "h": fh})
        else:
            for t in times:
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
                ok, frame = cap.read()
                if not ok or frame is None:
                    continue
                hit = _detect_one(cv2, cascade, frame, width, height)
                if hit:
                    fx, fy, fw, fh = hit
                    faces_out.append({"t": round(t, 3), "x": fx, "y": fy, "w": fw, "h": fh})
    finally:
        cap.release()

    print(json.dumps({
        "ok": True,
        "width": width,
        "height": height,
        "faces": faces_out,
    }, ensure_ascii=False))
    return 0


def _detect_one(cv2, cascade, frame, width: int, height: int):
    """返回帧内**面积最大**人脸的原图像素框 (x, y, w, h)；没有则 None。"""
    scale = min(1.0, float(MAX_DETECT_EDGE) / float(max(width, height)))
    if scale < 1.0:
        small = cv2.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))))
    else:
        small = frame
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    found = cascade.detectMultiScale(
        gray,
        scaleFactor=SCALE_FACTOR,
        minNeighbors=MIN_NEIGHBORS,
        minSize=(MIN_FACE_SIZE, MIN_FACE_SIZE),
    )
    if found is None or len(found) == 0:
        return None
    x, y, w, h = max(found, key=lambda r: int(r[2]) * int(r[3]))
    inv = 1.0 / scale if scale > 0 else 1.0
    return (
        int(round(float(x) * inv)),
        int(round(float(y) * inv)),
        int(round(float(w) * inv)),
        int(round(float(h) * inv)),
    )


if __name__ == "__main__":
    raise SystemExit(main())
