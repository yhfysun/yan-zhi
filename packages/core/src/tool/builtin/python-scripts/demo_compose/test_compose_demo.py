# -*- coding: utf-8 -*-
"""compose_demo.py 纯函数守卫测试（无需 ffmpeg）——与 novel_tuiwen/test_screen_structure.py 同取向。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from compose_demo import (  # noqa: E402
    ass_clean, build_ass_cues, build_outro_filter, build_title_lines, chunk_single_line,
    disp_w, esc_drawtext, esc_drawtext_pct, fmt_ass_ts,
)


def test_disp_width_full_vs_half():
    assert disp_w("中") == 1.0
    assert disp_w("…") == 1.0        # U+2026 通用标点按全角计（老坑）
    assert disp_w("a") == 0.55
    assert disp_w("1") == 0.55


def test_chunk_single_line_never_exceeds():
    pieces = chunk_single_line("打开言智应用选择智能体页面", 8)
    for p in pieces:
        assert sum(disp_w(c) for c in p) <= 8 + 0.01
    assert "".join(pieces) == "打开言智应用选择智能体页面"


def test_esc_drawtext_specials():
    assert esc_drawtext("a:b'c%d") == "a\\:b\\'c\\%d"
    # 与 novel-tuiwen 生产实现一致：esc 已把 % 变 \%，pct 版再补一层 → \\%
    # （ffmpeg filter 参数解析吃掉一层反斜杠后，drawtext 实际渲染 50%）
    assert esc_drawtext_pct("50%") == "50\\\\%"


def test_fmt_ass_ts():
    assert fmt_ass_ts(0) == "0:00:00.00"
    assert fmt_ass_ts(61.256) == "0:01:01.26"
    assert fmt_ass_ts(-1) == "0:00:00.00"


def test_ass_clean_strips_inline_tags():
    # 消毒只剥括号/反斜杠，不解析 ASS 标签语义：{\fad(1,1)} → fad(1,1)
    assert ass_clean("{\\fad(1,1)}abc{error}") == "fad(1,1)abcerror"


def test_build_ass_cues_timing():
    steps = [{"t": 0, "text": "第一步"}, {"t": 5, "text": "第二步"}, {"t": 9, "text": ""}]
    cues = build_ass_cues(steps, total=12.0)
    # 空文本被剔除，但它的时间点仍是上一条 cue 的终点（"从此处不再显示字幕"语义）
    assert [c[2] for c in cues] == ["第一步", "第二步"]
    assert cues[0][0] == 0.0 and cues[0][1] == 5.0
    assert cues[1][1] == 9.0


def test_title_lines_wrap_two_lines():
    # 超长标题在分隔符处断成 ≤2 行
    parts = build_title_lines("言智演示｜一键出片流程实录演示视频标题", 1080, 48)
    assert 1 <= len(parts) <= 2
    for p in parts:
        assert "drawtext=" in p and "msyh.ttc" in p


def test_outro_filter_no_box_and_enabled():
    f = build_outro_filter("由言智自动录制", 1080, 720, 30.0)
    # 老版 ffmpeg 兼容红线：片尾不能用 box（box+alpha 出彩条伪影）
    assert "box=" not in f
    assert "enable=" in f and "gte(t," in f


if __name__ == "__main__":
    # 直跑兜底（环境无 pytest 时）：python test_compose_demo.py
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
