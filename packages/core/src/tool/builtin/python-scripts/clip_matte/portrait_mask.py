#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""portrait_mask.py —— 智能抠像（P2-1）的「人像蒙版生成」一步（运行时骨架）。

用法：
  python portrait_mask.py --input <视频> --out <mask.mp4> --model <模型.onnx>
                          (--preset <id> | --config <sidecar.json>)
                          [--ss 秒] [--duration 秒] [--fps 10]

输出：stdout **最后一行** JSON（UTF-8，ensure_ascii=False）
  成功：{"ok": true, "frames": N, "width": W, "height": H, "fps": 实际输出帧率, "model": "<id>"}
  失败：{"ok": false, "error": "..."}（同时以非 0 退出码结束）

★ 本脚本**只产出单通道蒙版视频**（灰=前景概率，0~255 连续值），不做阈值化、不做羽化、
  不合成透明视频 —— 阈值/羽化/合成留给下游渲染接（P2-1 的"接入渲染"尚未做）。
★ 模型必须由调用方显式给出（--model），本脚本**不自动下载**。preset/config 只决定预处理：
  inputSize / mean / std / channelOrder。
★ 依赖按需检测：opencv-python（抽帧/写视频）+ onnxruntime（推理）。缺什么如实报错并给安装指引。
★ 输出容器用 OpenCV 的 mp4v（MPEG-4 Part 2，yuv420p 4:2:0）；三通道写入时 R=G=B，
  解码后 Y 通道即前景概率，色度恒定中性。
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# 预设（与 TypeScript 侧 MATTE_MODELS 同值；改一处必须同步另一处）
PRESETS = {
    "rmbg14": {"inputSize": 1024, "mean": [0.5, 0.5, 0.5], "std": [0.5, 0.5, 0.5], "channelOrder": "RGB"},
    "u2net": {"inputSize": 320, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225], "channelOrder": "RGB"},
    "u2netp": {"inputSize": 320, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225], "channelOrder": "RGB"},
    "modnet": {"inputSize": 256, "mean": [0.5, 0.5, 0.5], "std": [0.5, 0.5, 0.5], "channelOrder": "RGB"},
}

MIN_INPUT_SIZE = 64
MAX_INPUT_SIZE = 4096
MIN_STD = 1e-6


def _fail(msg: str, code: int = 1):
    """错误只走 stdout 最后一行 JSON（调用方统一解析），同时非 0 退出。"""
    print(json.dumps({"ok": False, "error": str(msg)}, ensure_ascii=False))
    sys.exit(code)


def _import_cv2():
    try:
        import cv2  # noqa: PLC0415
    except Exception as e:  # ImportError / DLL 加载失败都归为「cv2 不可用」
        _fail(
            "缺少 OpenCV（cv2）：%s。请安装：pip install --upgrade opencv-python" % e
        )
    return cv2


def _import_ort():
    try:
        import onnxruntime as ort  # noqa: PLC0415
    except Exception as e:
        _fail(
            "缺少 onnxruntime：%s。请安装：pip install --upgrade onnxruntime" % e
        )
    return ort


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _norm3(value, name: str):
    """mean/std 接受单数字或长度 3 数组；非法时报可读错误。"""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = [value, value, value]
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        _fail("%s 必须是数字或长度为 3 的数组" % name, 2)
    out = []
    for v in value:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            _fail("%s 含非数字项：%r" % (name, v), 2)
        out.append(float(v))
    return out


def _spec_from_config(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as e:
        _fail("读取侧车 JSON 失败（%s）：%s" % (path, e), 2)
    if not isinstance(raw, dict):
        _fail("侧车 JSON 必须是对象：%s" % path, 2)
    size = raw.get("inputSize")
    if isinstance(size, (list, tuple)):
        if len(size) != 2 or size[0] != size[1]:
            _fail("inputSize 数组必须是 [N, N]（宽高相同）", 2)
        size = size[0]
    if isinstance(size, bool) or not isinstance(size, (int, float)):
        _fail("侧车 JSON 缺少或非法 inputSize", 2)
    size = int(_clamp(round(float(size)), MIN_INPUT_SIZE, MAX_INPUT_SIZE))
    mean = _norm3(raw.get("mean"), "mean") if "mean" in raw else None
    std = _norm3(raw.get("std"), "std") if "std" in raw else None
    if mean is None or std is None:
        _fail("侧车 JSON 缺少 mean 或 std", 2)
    order = str(raw.get("channelOrder") or "RGB").strip().upper()
    if order not in ("RGB", "BGR"):
        _fail("channelOrder 只能是 RGB 或 BGR", 2)
    return {
        "inputSize": size,
        "mean": mean,
        "std": [_clamp(s, MIN_STD, 10.0) for s in std],
        "channelOrder": order,
        "id": str(raw.get("id") or os.path.splitext(os.path.basename(path))[0]),
    }


def _resolve_spec(args):
    if args.config:
        spec = _spec_from_config(args.config)
    else:
        base = PRESETS.get(args.preset)
        if not base:
            _fail(
                "未知 preset：%s（可选 %s）" % (args.preset, " / ".join(PRESETS)), 2
            )
        spec = dict(base)
        spec["id"] = args.preset
    return spec


def _run(args):
    if not args.input:
        _fail("--input 必填（源视频路径）", 2)
    if not args.out:
        _fail("--out 必填（蒙版视频输出路径）", 2)
    if bool(args.preset) == bool(args.config):
        _fail("--preset 与 --config 必须且只能提供一个", 2)
    if not args.model:
        _fail("--model 必填（需自行放置 ONNX 分割模型，本脚本不自动下载）", 2)

    # 先校验参数/预设（纯 CPU，不加载模型），再碰文件与重型依赖
    spec = _resolve_spec(args)
    size = int(spec["inputSize"])
    mean = spec["mean"]
    std = [max(MIN_STD, float(s)) for s in spec["std"]]
    order = spec["channelOrder"]

    if not os.path.isfile(args.input):
        _fail("输入视频不存在：%s" % args.input)
    if not os.path.isfile(args.model):
        _fail("ONNX 模型文件不存在：%s" % args.model)

    ss = max(0.0, float(args.ss or 0))
    duration = max(0.0, float(args.duration or 0))
    want_fps = _clamp(float(args.fps or 10), 1.0, 60.0)

    cv2 = _import_cv2()
    try:
        import numpy as np  # noqa: PLC0415  （cv2 自带 numpy）
    except Exception as e:
        _fail("缺少 numpy：%s。请重装 opencv-python" % e)

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        _fail("无法打开视频：%s" % args.input)
    native_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    if not (native_fps > 0) or native_fps > 240:
        native_fps = 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if width <= 0 or height <= 0:
        cap.release()
        _fail("无法读取视频分辨率（可能不是视频文件）")

    every = max(1, int(round(native_fps / want_fps)))
    out_fps = native_fps / every

    if ss > 0:
        cap.set(cv2.CAP_PROP_POS_MSEC, ss * 1000.0)
    end_ms = (ss + duration) * 1000.0 if duration > 0 else None

    # 先确认输出目录存在（调用方一般已建好；这里兜底）
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir and not os.path.isdir(out_dir):
        try:
            os.makedirs(out_dir, exist_ok=True)
        except Exception as e:
            cap.release()
            _fail("创建输出目录失败：%s" % e)

    writer = cv2.VideoWriter(
        args.out, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (width, height), True
    )
    if not writer.isOpened():
        cap.release()
        _fail("无法创建蒙版视频（OpenCV 缺少 mp4v 编码器？）：%s" % args.out)

    ort = _import_ort()
    try:
        session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
        inp = session.get_inputs()[0]
        output_names = [o.name for o in session.get_outputs()]
    except Exception as e:
        cap.release()
        writer.release()
        _fail("加载 ONNX 模型失败（%s）：%s" % (args.model, e))

    idx = 0
    kept = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            pos_ms = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0)
            if end_ms is not None and pos_ms > end_ms:
                break
            if idx % every != 0:
                idx += 1
                continue

            img = cv2.resize(frame, (size, size), interpolation=cv2.INTER_LINEAR)
            if order == "BGR":
                img = img[:, :, ::-1]  # cv2 读入是 BGR；模型要 BGR 时保持原序
            rgb = img.astype(np.float32) / 255.0
            rgb = (rgb - np.asarray(mean, dtype=np.float32)) / np.asarray(std, dtype=np.float32)
            tensor = np.transpose(rgb, (2, 0, 1))[None, :, :, :]

            try:
                outs = session.run(output_names, {inp.name: tensor})
            except Exception as e:
                raise RuntimeError("推理失败：%s" % e)
            arr = np.asarray(outs[0], dtype=np.float32)
            arr = np.squeeze(arr)
            while arr.ndim > 2:
                arr = arr[0]
            # 通用后处理：logits → sigmoid；已是概率则保持
            lo = float(arr.min()) if arr.size else 0.0
            hi = float(arr.max()) if arr.size else 0.0
            if lo < 0.0 or hi > 1.0:
                arr = 1.0 / (1.0 + np.exp(-np.clip(arr, -60.0, 60.0)))
            mask = cv2.resize(arr, (width, height), interpolation=cv2.INTER_LINEAR)
            mask_u8 = np.clip(mask * 255.0, 0, 255).astype(np.uint8)
            writer.write(cv2.cvtColor(mask_u8, cv2.COLOR_GRAY2BGR))
            kept += 1
            idx += 1
    except Exception as e:
        cap.release()
        writer.release()
        _fail("蒙版生成失败：%s" % e)

    cap.release()
    writer.release()
    if kept <= 0:
        _fail("没有读到任何视频帧（检查 --ss/--duration 是否超出视频时长）")

    print(json.dumps({
        "ok": True, "frames": kept, "width": width, "height": height,
        "fps": round(out_fps, 3), "model": spec.get("id") or os.path.splitext(os.path.basename(args.model))[0],
    }, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(
        description="人像分割 → 单通道蒙版视频（P2-1 骨架；阈值/羽化/合成留给下游）"
    )
    ap.add_argument("--input", help="源视频路径")
    ap.add_argument("--out", help="蒙版视频输出路径（建议 .mp4）")
    ap.add_argument("--model", help="ONNX 分割模型路径（需自行放置）")
    ap.add_argument("--preset", help="预处理预设：%s" % " / ".join(PRESETS))
    ap.add_argument("--config", help="侧车 JSON（{id?, inputSize, mean, std, channelOrder?}）")
    ap.add_argument("--ss", type=float, default=0.0, help="从第几秒开始（默认 0）")
    ap.add_argument("--duration", type=float, default=0.0, help="处理时长（秒；0=到片尾）")
    ap.add_argument("--fps", type=float, default=10.0, help="蒙版输出帧率（默认 10，按源帧率降采样）")
    args = ap.parse_args()
    _run(args)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # 兜底：任何未预期异常也必须以 JSON 告知
        _fail("%s: %s" % (type(exc).__name__, exc))
