# -*- coding: utf-8 -*-
"""anim_compose.py v2 纯函数守卫测试（无 PIL/ffmpeg 依赖）。直跑：python test_anim_compose.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from anim_compose import (  # noqa: E402
    compare_columns, ease_out, item_appear_t, mix, narration_text, parse_stat,
    process_boxes, scene_base_duration, truncate_lines, wrap_by_width,
)


def test_parse_stat():
    assert parse_stat("90%|用户会遇到") == ("90%", "用户会遇到")
    assert parse_stat("3倍") == ("3倍", "")
    assert parse_stat(" 10.4 | Pillow 版本 ") == ("10.4", "Pillow 版本")


def measure_half(s: str) -> float:
    """测试用测量函数：半角 0.55 / 全角 1.0。"""
    return sum(1.0 if ord(c) >= 0x2E80 or 0x2000 <= ord(c) <= 0x206F else 0.55 for c in s)


def test_ease_out_bounds_and_monotonic():
    assert ease_out(-1) == 0.0 and ease_out(0) == 0.0
    assert ease_out(1) == 1.0 and ease_out(2) == 1.0
    seq = [ease_out(i / 10) for i in range(11)]
    assert seq == sorted(seq)
    assert seq[5] > 0.5


def test_mix_clamps():
    assert mix((10, 20, 30), (200, 100, 50), 2.0) == (200, 100, 50)
    assert mix((10, 20, 30), (200, 100, 50), -1) == (10, 20, 30)


def test_wrap_never_exceeds_width():
    text = "指AI生成看似合理但错误的内容，本质是概率预测而非事实检索"
    for max_w in (5, 8, 12.5):
        for ln in wrap_by_width(text, max_w, measure_half):
            assert measure_half(ln) <= max_w + 0.01
    assert "".join(wrap_by_width(text, 12.5, measure_half)).replace("\n", "") == text


def test_wrap_respects_explicit_newline():
    lines = wrap_by_width("abc\ndef", 20, measure_half)
    assert lines == ["abc", "def"]


def test_truncate_lines_adds_ellipsis():
    out = truncate_lines(["一", "二", "三", "四"], 3)
    assert len(out) == 3 and out[-1].endswith("…")
    assert truncate_lines(["一", "二"], 3) == ["一", "二"]


def test_scene_duration():
    assert scene_base_duration({"duration": 8}) == 8.0
    d3 = scene_base_duration({"items": ["a", "b", "c"]})
    d5 = scene_base_duration({"items": ["a", "b", "c", "d", "e"]})
    assert d3 == round(2.0 + 1.1 * 3, 2)
    assert d5 > d3


def test_item_appear_spread_and_clamped():
    ts = [item_appear_t(i, 5, 1.0, lead=0.45) for i in range(5)]
    assert ts == sorted(ts)
    assert all(0 <= t <= 0.95 for t in ts)
    assert item_appear_t(0, 1, 1.0, lead=0.45) == 0.225


def test_process_boxes_fit_and_order():
    boxes = process_boxes(4, 1080, 1920, y=500, box_w=220, box_h=140)
    assert len(boxes) == 4
    for a, b in zip(boxes, boxes[1:]):
        assert a[0] + a[2] < b[0]
    assert boxes[0][0] >= 0 and boxes[-1][0] + boxes[-1][2] <= 1080


def test_compare_columns_symmetric():
    (lx, ly, lw, lh), (rx, ry, rw, rh) = compare_columns(1080, 1920, y=400, h=500)
    assert ly == ry and lw == rw and rx > lx + lw
    assert abs((lx + rx + rw) / 2 - 1080 / 2) < 2


def test_narration_text_composition():
    s = {"heading": "什么是幻觉", "items": ["编造事实", "概率预测"]}
    assert narration_text(s) == "什么是幻觉。编造事实。概率预测。"
    c = {"type": "compare", "heading": "对比", "left": ["编造"], "right": ["有据"]}
    assert "左边编造" in narration_text(c) and "右边有据" in narration_text(c)


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for n, f in fns:
        try:
            f()
            print(f"  PASS {n}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {n}: {e}")
    print(f"{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
