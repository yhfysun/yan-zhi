# -*- coding: utf-8 -*-
"""动态排版引擎（kinetic）守门测试。

覆盖：
  1. split_subtitle：按标点切块、不丢字、每块在显示宽度内
  2. wrap_to / fit_block：显式换行保留、超宽自动折行、行数不超
  3. normalize_storyboard：类型校验、seg 越界/缺失报错（错误信息要能指路）
  4. build_timeline：1:1 对齐、seg 分组按 w 分时长、总时长不丢、尾量拉长
  5. auto_scene：**不把整段旁白塞进 note**（否则卡片与字幕重复）
  6. reveal / ease_out：单调、有界
"""
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kinetic  # noqa: E402

HAS_FONT = os.path.exists(kinetic.FONT_REG)


# ---------- 1) 字幕切块 ----------

def test_split_subtitle_keeps_all_chars():
    text = "做 PPT 最耗时的，其实不是排版，是不知道第一页该写什么。"
    pieces = kinetic.split_subtitle(text)
    assert "".join(pieces).replace(" ", "") == text.replace(" ", "")


def test_split_subtitle_only_breaks_at_punctuation():
    """切块只看标点，绝不看宽度：没有标点的长句整块返回，由渲染端折行。"""
    text = "这是一句非常非常长而且中间完全没有标点符号的口播文案用来验证不会按宽度切开"
    assert kinetic.split_subtitle(text) == [text]


def test_split_subtitle_never_breaks_inside_a_clause():
    """用户实报的丑：『最耗时的，其 / 实不是排版』——不能切在词中间。"""
    pieces = kinetic.split_subtitle("做 PPT 最耗时的，其实不是排版，是不知道第一页该写什么。")
    assert "其实不是排版，" in pieces
    for p in pieces[:-1]:
        assert p.rstrip()[-1] in "。！？!?…，,；;：:、", p


def test_split_subtitle_merges_tiny_fragments():
    # 「好。」这类极短块会一闪而过，并进下一句
    assert kinetic.split_subtitle("好。然后他说了一句很长的话。") == ["好。然后他说了一句很长的话。"]


def test_split_subtitle_keeps_latin_and_numbers_intact():
    text = "它给你 SUMIFS 公式，下次数据 2026 变了也自己更新。"
    pieces = kinetic.split_subtitle(text)
    assert "".join(pieces).replace(" ", "") == text.replace(" ", "")
    assert any("SUMIFS" in p for p in pieces)
    assert any("2026" in p for p in pieces)


def test_speech_weight_counts_by_syllable_not_pixels():
    # 10 个汉字 ≈ 10 个音节；「SUMIFS」6 个字母只算 3 —— 按宽度会高估英文
    assert kinetic.speech_weight("今天天气真的很好啊") == pytest.approx(9.0)
    assert kinetic.speech_weight("SUMIFS") == pytest.approx(3.0)
    assert kinetic.speech_weight("2026") == pytest.approx(2.4)


# ---------- 2) 换行与自适应字号 ----------

@pytest.mark.skipif(not HAS_FONT, reason="缺少微软雅黑字体")
def test_wrap_to_keeps_explicit_newline():
    f = kinetic.font(40, True)
    lines = kinetic.wrap_to("第一行\n第二行", f, 10000)
    assert lines == ["第一行", "第二行"]


@pytest.mark.skipif(not HAS_FONT, reason="缺少微软雅黑字体")
def test_fit_block_never_exceeds_width_or_lines():
    f, size, lines = kinetic.fit_block("明天开会，PPT 一页没做", 100, 500, 2)
    assert len(lines) <= 2
    for ln in lines:
        assert f.getlength(ln) <= 500 + 2


# ---------- 3) storyboard 校验 ----------

def test_normalize_rejects_unknown_type():
    with pytest.raises(ValueError) as ei:
        kinetic.normalize_storyboard({"scenes": [{"type": "foo"}]}, 3)
    assert "foo" in str(ei.value)
    assert "hook" in str(ei.value)  # 错误信息要列出可用类型


def test_normalize_rejects_mixed_seg():
    with pytest.raises(ValueError):
        kinetic.normalize_storyboard(
            {"scenes": [{"type": "hook", "seg": 0}, {"type": "statement"}]}, 2)


def test_normalize_rejects_seg_out_of_range():
    with pytest.raises(ValueError) as ei:
        kinetic.normalize_storyboard({"scenes": [{"type": "hook", "seg": 5}]}, 3)
    assert "超出旁白段数" in str(ei.value)


def test_normalize_accepts_valid():
    scenes = kinetic.normalize_storyboard(
        {"scenes": [{"type": "hook", "seg": 0}, {"type": "cta", "seg": 1}]}, 2)
    assert [s["type"] for s in scenes] == ["hook", "cta"]


# ---------- 4) 时间轴 ----------

def test_build_timeline_one_to_one():
    cues = [(0.0, 5.0, "甲。"), (5.0, 12.0, "乙。")]
    scenes = [{"type": "hook"}, {"type": "statement"}]
    tl = kinetic.build_timeline(scenes, cues, 12.0)
    assert len(tl) == 2
    assert tl[0][1:] == (0.0, 5.0, "甲。")
    assert tl[1][1:] == (5.0, 12.0, "乙。")


def test_build_timeline_splits_duration_by_weight():
    cues = [(10.0, 20.0, "甲乙丙。")]
    scenes = [{"type": "statement", "seg": 0, "w": 3},
              {"type": "statement", "seg": 0, "w": 1}]
    tl = kinetic.build_timeline(scenes, cues, 20.0)
    assert len(tl) == 2
    assert abs((tl[0][2] - tl[0][1]) - 7.5) < 1e-6
    assert abs((tl[1][2] - tl[1][1]) - 2.5) < 1e-6
    # 一段拆多镜时不能把整段旁白当每一镜的字幕（否则又重复）
    assert tl[0][3] == "" and tl[1][3] == ""


def test_build_timeline_extends_last_to_total():
    cues = [(0.0, 4.0, "甲。")]
    tl = kinetic.build_timeline([{"type": "hook"}], cues, 7.0)
    assert tl[-1][2] == 7.0


def test_build_timeline_fills_missing_seg_with_auto():
    cues = [(0.0, 3.0, "有。"), (3.0, 6.0, "没有场景的一句。")]
    tl = kinetic.build_timeline([{"type": "hook", "seg": 0}], cues, 6.0)
    assert len(tl) == 2
    assert tl[1][0]["type"] in kinetic.SCENE_TYPES


# ---------- 5) 自动分镜不能复制旁白 ----------

def test_auto_scene_does_not_copy_narration():
    text = "做 PPT 最耗时的，其实不是排版，是不知道第一页该写什么。"
    sc = kinetic.auto_scene(text, 1)
    assert "note" not in sc
    assert len(sc["title"]) <= 14
    assert sc.get("highlight", "") != sc["title"]


def test_auto_scene_first_is_hook():
    assert kinetic.auto_scene("明天开会，PPT 一页没做。", 0)["type"] == "hook"
    assert kinetic.auto_scene("明天开会，PPT 一页没做。", 1)["type"] == "statement"


# ---------- 6) 缓动 ----------

def test_reveal_bounds_and_monotonic():
    assert kinetic.reveal(0.0, 0.5) == 0.0
    assert kinetic.reveal(10.0, 0.5) == pytest.approx(1.0)
    vals = [kinetic.reveal(0.5 + i * 0.05, 0.5) for i in range(12)]
    assert all(a <= b + 1e-9 for a, b in zip(vals, vals[1:]))
