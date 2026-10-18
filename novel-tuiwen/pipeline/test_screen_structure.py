# -*- coding: utf-8 -*-
"""画面结构 v3 + 发布文案模板 守门测试（pytest，无需 ffmpeg）。

覆盖：
  1. disp_w 全角标点计宽（…… —— 等 U+2000~U+206F = 全角）
  2. build_ass：长句切出的单行 Dialogue 在 PlayRes 宽度内不超屏
  3. build_title_lines：标题条文本不含半角书名号渲染坑（「）、含『』、首帧无淡入
  4. build_episode_filter：「第N集」大字首帧全显（无淡入）+ 3 秒收尾 + % 转义
     build_episode_badge：右上角常驻角标（全程可见、无 alpha、box 安全）
  5. publish_copy：标题 ≤30 字、五段内容结构、章节号从文件名推断
"""
import ast
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import compose_video  # noqa: E402
import publish_copy  # noqa: E402


# ---------- 1) disp_w 全角标点 ----------

def test_disp_w_general_punctuation_is_fullwidth():
    # ……(U+2026) ——(U+2014) “”(U+201C/D) ‘’(U+2018/9) –(U+2013) 都按全角
    for ch in ["…", "—", "“", "”", "‘", "’", "–"]:
        assert compose_video.disp_w(ch) == 1.0, ch


def test_disp_w_halfwidth_still_half():
    assert compose_video.disp_w("A") == 0.55
    assert compose_video.disp_w("1") == 0.55
    assert compose_video.disp_w("小") == 1.0
    assert compose_video.disp_w("小") > compose_video.disp_w("a")


# ---------- 2) build_ass 不超屏 ----------

def _dialogue_texts(ass_path):
    out = []
    for ln in open(ass_path, encoding="utf-8-sig"):
        if ln.startswith("Dialogue:"):
            out.append(ln.split(",", 9)[-1].rstrip("\n"))
    return out


def test_ass_single_line_never_exceeds_screen(tmp_path):
    """含省略号/破折号的长句切出的每条 Dialogue 单行宽度 ≤ 0.80*W。"""
    W, H = 1080, 1440
    font_px = max(40, int(H * 0.042))  # 与 main() 同口径
    max_chars = max(8, int(W * 0.80 / font_px))
    text = "他盯着井底那块怀表……指针竟然开始倒转——而井水也在一点点上涨……"
    cue = (0.0, 8.0, text)
    p = tmp_path / "a.ass"
    compose_video.build_ass([cue], str(p), font_px, 72)
    dial = _dialogue_texts(str(p))
    assert dial, "没有生成 Dialogue"
    for d in dial:
        body = d.split("}", 1)[-1]  # 剥掉 {\fad(...)}
        w = sum(compose_video.disp_w(c) for c in body)
        assert w <= max_chars + 1e-6, f"超屏: {body!r} 宽 {w} > {max_chars}"


def test_ass_text_neutralized_braces(tmp_path):
    cue = (0.0, 2.0, "危险{\\an5}标签\\N注入")
    p = tmp_path / "c.ass"
    compose_video.build_ass([cue], str(p), 60, 72)
    dial = _dialogue_texts(str(p))
    assert dial, "没有生成 Dialogue"
    for d in dial:
        body = d.split("}", 1)[-1]
        assert "{" not in body and "\\" not in body, f"标签未剥离: {body!r}"


# ---------- 3) 标题条 ----------

def test_title_bar_uses_corner_brackets_not_shell():
    parts = compose_video.build_title_lines("搜『狐王痴狂』看全文｜番茄小说", 64)
    joined = ",".join(parts)
    assert "「" not in joined, "书名号「在老版 ffmpeg drawtext 渲染成窄引号，必须用『』"
    assert "『狐王痴狂』" in joined


def test_title_bar_escapes_specials():
    parts = compose_video.build_title_lines("搜『A:B%C』看全文", 64)
    joined = ",".join(parts)
    assert "text='搜『A\\:B\\%C』看全文" in joined


def test_title_bar_no_fadein_first_frame_fully_visible():
    """v4 (2026-10-18)：平台封面取 t=0 首帧 → 标题条禁止淡入（首帧必须全显
    别名+平台，用户刷到首页缩略图就能看到基本信息）。"""
    parts = compose_video.build_title_lines("搜『狐王痴狂』看全文｜番茄小说", 64)
    joined = ",".join(parts)
    assert "alpha=" not in joined, "标题条带淡入会导致首帧字几乎全透明（封面无信息）"


# ---------- 4) 第N集大字 + 常驻角标 ----------

def test_episode_filter_alpha_and_escape():
    f = compose_video.build_episode_filter("第12集", 25)
    # v4：无淡入（首帧全显）→ alpha 表达式直接从"保持到3s"开始，3s 处淡出、3.5s 归零
    assert "if(lt(t,3.00),1" in f
    assert "1-(t-3.00)/0.50" in f
    # 文本里的 % 已双转义（带 alpha 的 drawtext 必须 \%）
    assert "第12集" in f


def test_episode_filter_no_fadein():
    """v4：0.4s 淡入导致首帧集数几乎全透明（封面无集数）→ 禁止淡入段。"""
    f = compose_video.build_episode_filter("第12集", 25)
    assert "t/0.40" not in f and "t/0.4)" not in f


def test_episode_filter_pct_escaped():
    f = compose_video.build_episode_filter("第100%集", 25)
    assert "\\%" in f


def test_episode_filter_no_box():
    """box+alpha 在老版 ffmpeg 淡出期出彩色伪影 → 禁止 box。"""
    f = compose_video.build_episode_filter("第1集", 25)
    assert "box=1" not in f


def test_episode_badge_persistent_no_alpha():
    """v4：右上角常驻角标——任何一帧当封面都带集数。
    必须：含集数文本、box 压底（无 alpha 表达式 → box 安全）、定位在右上角。"""
    f = compose_video.build_episode_badge("第7集")
    assert "第7集" in f
    assert "box=1" in f, "常驻角标无 alpha 表达式，box 安全且必须压底保可读"
    assert "alpha=" not in f, "角标禁止 alpha（淡入/淡出都会让部分帧丢集数）"
    assert "x=w-text_w-" in f and "y=" in f, "角标定位右上角"


def test_extract_cover_names_cover_png(monkeypatch):
    """封面图 = 抽成片第0帧，命名 <成片名>_封面.png（发布时直接当首页图片上传）。"""
    calls = {}

    def fake_run(cmd, **kw):
        calls["cmd"] = cmd
        return None

    monkeypatch.setattr(compose_video.subprocess, "run", fake_run)
    mp4 = os.path.join("out", "狐王痴狂_第1集.mp4")
    cover = compose_video.extract_cover("ffmpeg", mp4)
    assert cover == os.path.join("out", "狐王痴狂_第1集_封面.png")
    assert calls["cmd"][-1] == cover
    assert "-frames:v" in calls["cmd"], "必须只抽1帧（第0帧即封面）"


# ---------- 5) publish_copy ----------

SCRIPT = {
    "title": "废井怀表",
    "alias": "狐王痴狂",
    "hook": "他怎么也没想到，这一步会彻底改变他的命运。",
    "segments": [{"text": "深夜的老宅里，他打着手电往井口挪。井绳湿滑，像刚被人握过。"}, {"text": "第二段"}],
    "ending": "欲知后事如何，点击链接接着看。",
}


def test_publish_title_len_and_alias():
    t = publish_copy.build_title(SCRIPT, "狐王痴狂", "1")
    assert t.startswith("狐王痴狂 第1集｜")
    assert len(t) <= publish_copy.TITLE_MAX


def test_publish_title_no_bookname():
    t = publish_copy.build_title(SCRIPT, "狐王痴狂", "1")
    assert "废井怀表" not in t, "书名红线：标题禁原书名"


def test_publish_body_structure():
    b = publish_copy.build_body(SCRIPT, "狐王痴狂", "1")
    lines = b.split("\n")
    assert lines[0] == "狐王痴狂 第1集"          # 别名+集数
    assert lines[1] == SCRIPT["hook"]           # 钩子
    assert lines[2].startswith("深夜的老宅里")    # 正文预告
    assert lines[2].endswith("…")
    assert "点击左下角继续看👉" in lines[3]      # 引导
    assert lines[4].startswith("#小说 #推文")    # 标签
    assert "狐王痴狂" in lines[4]


def test_publish_chapter_from_filename():
    """章节号从 script.json 文件名推断（ch03 -> 3）。"""
    import tempfile
    d = tempfile.mkdtemp()
    sj = os.path.join(d, "ch03_script.json")
    with open(sj, "w", encoding="utf-8") as f:
        json.dump(SCRIPT, f, ensure_ascii=False)
    outdir = os.path.join(d, "out")
    sys.argv = ["publish_copy.py", "--script", sj, "--alias", "狐王痴狂", "--outdir", outdir]
    publish_copy.main()
    txt = open(os.path.join(outdir, "publish.txt"), encoding="utf-8").read()
    assert "第3集" in txt
