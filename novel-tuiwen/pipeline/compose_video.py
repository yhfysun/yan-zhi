# -*- coding: utf-8 -*-
"""
novel-tuiwen 视频合成器 v3 (ffmpeg, 4:3 1080x1440)
两种画面模式:
  A. 背景视频模式(推荐): --bg-video 修驴蹄/骑单车等解压视频, 循环铺满全片
  B. 分镜图模式(默认兜底): 无图时生成深色文字占位帧, 后续接 ComfyUI
画面结构 v3 (2026-10-12):
  顶部  = 「搜『别名』看全文｜番茄小说」常驻标题条（集数不再常驻，走 --banner 覆盖）
  中部  = 「第N集」大字，仅前3秒淡入淡出（--chapter 传入时）
  底部  = ASS 字幕单行快切（宽度系数 0.80 + 全角标点按全角计宽，防超出屏幕）
用法:
  python compose_video.py --script script.json --outdir output/ \
      --bg-video bg1.mp4,bg2.mp4 [--alias 狐王痴狂 --chapter 1] [--bgm bgm.mp3]
"""
import argparse
import json
import os
import subprocess
import sys

# ★ 子进程静默（2026-10-09）：本文件有 10 处 ffmpeg/ffprobe 调用，是"黑框一直闪"的主要来源。
#   打一次补丁 → 后续所有 subprocess.Popen 自动带 CREATE_NO_WINDOW。
import _winquiet  # noqa: E402
_winquiet.apply_popen_defaults()

# 画幅由 --aspect 决定（2026-10-07）：4:3=1080x1440(默认) / 9:16=1080x1920(抖音竖屏) / 16:9=1920x1080(横屏)
ASPECT_SIZES = {"4:3": (1080, 1440), "9:16": (1080, 1920), "16:9": (1920, 1080)}
W, H = ASPECT_SIZES["4:3"]
FPS = 25
FONTS_DIR = r"C:\Windows\Fonts"


def find_ffmpeg():
    # ★ 2026-10-09：原只找 C:\APP\EVCapture\ffmpeg.exe（本机不存在）→ 补多候选 + PATH 兜底
    cands = [
        os.environ.get("FFMPEG"),
        r"C:\Program Files\EVCapture\ffmpeg.exe",
        r"C:\APP\EVCapture\ffmpeg.exe",
        os.path.join(os.path.dirname(os.environ.get("FFPROBE") or ""), "ffmpeg.exe")
        if os.environ.get("FFPROBE") else None,
    ]
    import shutil
    cands.append(shutil.which("ffmpeg"))
    for p in cands:
        if p and os.path.exists(p):
            return p
    raise SystemExit("ffmpeg not found (set FFMPEG env)")


def probe_duration(ffmpeg, path):
    fp = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
    if not os.path.exists(fp):
        import shutil
        fp = shutil.which("ffprobe") or fp
    out = subprocess.run([fp, "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", path],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 5.0


def disp_w(ch: str) -> float:
    """显示宽度：CJK/全角=1，半角（英文/数字）=0.55。
    ★ 2026-10-12：U+2000~U+206F 通用标点（…… —— ‘’ "" – 等）在雅黑里按全角字形渲染，
      旧版只认 0x2E80 以上 → 这些字符被低估成 0.55，是字幕偶尔超出屏幕的根因。"""
    o = ord(ch)
    if o >= 0x2E80 or 0x2000 <= o <= 0x206F:
        return 1.0
    return 0.55


def wrap_text(s: str, width: int = 20):
    """按**显示宽度**换行（不再按字符个数），英文/数字混排时不会低估行宽导致字幕超出画面。"""
    lines, cur, w = [], "", 0.0
    for ch in s:
        cw = disp_w(ch)
        if w + cw > width and cur:
            lines.append(cur)
            cur, w = "", 0.0
        cur += ch
        w += cw
    if cur:
        lines.append(cur)
    return "\n".join(lines)


def wrap_title(s: str, max_chars: int, max_lines: int = 2):
    """把顶部引导语切成 ≤max_lines 行、每行 ≤max_chars 字（2026-10-07）。

    动机：此前顶部标题是**单行** drawtext，像「搜「狐王痴狂」看全文｜打开番茄小说」这类
    引导语（16+ 字）在 1080 宽画面上会超宽/贴边，观感差且易被裁。
    规则：
      1. 显式换行优先（banner 里写 \\n 或真实换行 → 按行拆）；
      2. 否则若超长，在**自然分隔处**断行（｜ | ， , 、 空格），取最接近中点的那一处；
      3. 找不到分隔符就按 max_chars 硬切；每行再硬截断到 max_chars。
    返回行列表（至少一个元素，可能是空串）。"""
    import re
    s = (s or "").strip().replace("\\n", "\n")
    if not s:
        return [""]
    explicit = [seg.strip() for seg in s.split("\n") if seg.strip()]
    if len(explicit) > 1:
        lines = explicit[:max_lines]
    else:
        line = explicit[0]
        if len(line) <= max_chars:
            lines = [line]
        else:
            mid = len(line) // 2
            best = -1
            for m in re.finditer(r"[｜|，,、\s]", line):
                if m.start() <= max_chars and (best < 0 or abs(m.start() - mid) < abs(best - mid)):
                    best = m.start()
            cut = best if best > 0 else max_chars
            l1 = line[:cut].strip()
            l2 = line[cut:].strip().lstrip("｜|，,、 ")
            lines = [l1, l2]
    lines = [ln[:max_chars] for ln in lines if ln]
    return lines[:max_lines] or [""]


def esc_drawtext(s: str) -> str:
    for ch in ("\\", ":", "'", "%", ",", "[", "]"):
        s = s.replace(ch, {"\\": "\\\\", ":": "\\:", "'": "\\'",
                           "%": "\\%", ",": "\\,", "[": "\\[", "]": "\\]"}[ch])
    return s


def esc_drawtext_pct(s: str) -> str:
    """★ 2026-10-12：alpha='if(lt(t,...)…)' 表达式里的 drawtext 的 % 必须转义为 \\%，
    否则被当 expansion 序列解析（占位符展开失败时 ffmpeg 直接吞字符/截断文本）。
    标题条文本里没有 alpha 表达式，无需双转义；「第N集」大字带 alpha → 必须用这个。"""
    return esc_drawtext(s).replace("%", "\\%")


def fmt_ass_ts(sec: float) -> str:
    """ASS 时间戳 H:MM:SS.cc（厘秒两位，四舍五入进位后钳 99）。"""
    cs = int(round(sec * 100))
    if cs >= 100 * 3600 * 24:  # 防御：超长不崩
        cs = 100 * 3600 * 24 - 1
    h, rem = divmod(cs, 100 * 3600)
    m, rem = divmod(rem, 100 * 60)
    s, cs = divmod(rem, 100)
    if cs == 100:  # round 进位兜底
        cs = 99
    return f"{h:01d}:{m:02d}:{s:02d}.{cs:02d}"


def ass_clean(s: str) -> str:
    """ASS 文本消毒：花括号/反斜杠会让 libass 把用户文本当内联标签吞掉，整组剥离。"""
    import re
    return re.sub(r"[{}\\]", "", s or "")


def chunk_single_line(text: str, max_chars: int):
    """按显示宽度把一条 cue 切成**单行**小块（时间按宽度比例分摊）。
    单行快切 = 字幕逐句推进的"滚动感"，也彻底消灭两行长块。"""
    pieces, cur, w = [], "", 0.0
    for ch in text:
        cw = disp_w(ch)
        if cur and w + cw > max_chars:
            pieces.append(cur)
            cur, w = "", 0.0
        cur += ch
        w += cw
    if cur:
        pieces.append(cur)
    return pieces or [text]


def build_ass(cues, out_path, font_px: int, margin_v: int, fade_ms: int = 140):
    """直接生成 ASS 字幕（替代 SRT，2026-10-11）：
    - PlayRes = 真实分辨率 → FontSize 直接就是像素，不再经过 288 基准换算；
    - 每条 Dialogue 单行 + {\\fad(fade_ms,fade_ms)} 淡入淡出，观感为逐句滚动推进；
    - 无底框（BorderStyle=1）：白字加粗 + 黑描边(3px) + 轻投影(1px)，不再压一块黑底。
    cues: (start, end, text)"""
    max_chars = max(8, int(W * 0.80 / font_px))
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {W}",
        f"PlayResY: {H}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,Microsoft YaHei,{font_px},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,"
        f"1,0,0,0,100,100,0,0,1,3,1,2,60,60,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for start, end, text in cues:
        dur = max(end - start, 0.001)
        pieces = chunk_single_line(ass_clean(text), max_chars)
        weights = [sum(disp_w(c) for c in p) for p in pieces]
        total_w = sum(weights) or 1.0
        t = start
        for p, wgt in zip(pieces, weights):
            d = dur * wgt / total_w
            lines.append(
                f"Dialogue: 0,{fmt_ass_ts(t)},{fmt_ass_ts(t + d)},Default,,0,0,0,,"
                f"{{\\fad({fade_ms},{fade_ms})}}{p}"
            )
            t += d
    with open(out_path, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(lines) + "\n")


def build_title_lines(top_text: str, title_size: int) -> list:
    """标题条 drawtext 滤镜片段（链式多行，兼容老版 ffmpeg）。

    ★ 2026-10-12：书名号改用『』——「」在老版 ffmpeg drawtext 渲染成窄引号；
      底条 box 改 boxcolor=black@0.55 加重一档，压得住亮色背景视频。"""
    max_chars = max(6, int(W * 0.90 / title_size))
    title_lines = wrap_title(top_text, max_chars)
    line_step = title_size + 12
    parts = []
    for i, ln in enumerate(title_lines):
        if not ln:
            continue
        t = esc_drawtext(ln)
        parts.append(
            f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
            f"fontcolor=white:fontsize={title_size}:x=(w-text_w)/2:y={80 + i * line_step}:"
            f"box=1:boxcolor=black@0.55:boxborderw=14:"
            f"borderw=3:bordercolor=black@0.7:"
            f"alpha='if(lt(t,0.6),t/0.6,1)'"
        )
    if not parts:
        t = esc_drawtext(top_text)
        parts.append(
            f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
            f"fontcolor=white:fontsize={title_size}:x=(w-text_w)/2:y=80:"
            f"box=1:boxcolor=black@0.55:boxborderw=14:"
            f"borderw=3:bordercolor=black@0.7"
        )
    return parts


def make_placeholder(scene: str, out_png: str, ffmpeg: str):
    body = esc_drawtext(wrap_text(scene or ""))
    # ★ 2026-10-12：本机 2016 版 ffmpeg（N-80694）两处不兼容——
    #   ① drawbox 不认 t=fill（2018+ 语法）→ t=max 等效填满，老新版本都兼容；
    #   ② drawtext 无 line_spacing 选项 → 去掉（占位帧观感略降，可接受）。
    #   v2 代码能跑是因为此前一直走背景视频模式，占位帧从没被真实执行过。
    body_one = body.replace("\n", " ")  # 无 line_spacing 也不换行渲染，直接压成一行
    vf = (
        f"drawbox=x=80:y=80:w={W-160}:h={H-160}:color=0x16213E@1:t=max,"
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{body_one}':"
        f"fontcolor=0xe0e0e0:fontsize=40:x=(w-text_w)/2:y=h/2-text_h/2"
    )
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "lavfi",
                    "-i", f"color=c=0x1a1a2e:s={W}x{H}:d=1",
                    "-vf", vf, "-frames:v", "1", out_png], check=True)


def concat_audios(ffmpeg, audio_files, out_path):
    """TTS mp3 逐段 -> 单条 aac。"""
    cmd = [ffmpeg, "-y", "-v", "error"]
    for p in audio_files:
        cmd += ["-i", p]
    n = len(audio_files)
    fc = "".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[a]"
    cmd += ["-filter_complex", fc, "-map", "[a]", "-c:a", "aac", "-b:a", "160k", out_path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        sys.exit(r.returncode)


def build_episode_filter(ep_text: str, fps: int, fade_in: float = 0.4, fade_out: float = 0.5,
                         show: float = 3.0) -> str:
    """「第N集」大字：画面中部，0.4s淡入→保持到3s→0.5s淡出，之后完全消失。

    ★ 不加背景框：2026-10-12 实测老版 ffmpeg 的 box 与 alpha 表达式叠加，淡出中段会
    出现蓝/红色竖条状伪影（box 混合态渲染 bug）→ 改纯大字 + 黑描边 + 投影，任何底色都清晰。"""
    font_px = int(H * 0.115)
    y = int(H * 0.44)
    a = (
        f"if(lt(t,{fade_in:.2f}),t/{fade_in:.2f},"
        f"if(lt(t,{show:.2f}),1,"
        f"if(lt(t,{show + fade_out:.2f}),1-(t-{show:.2f})/{fade_out:.2f},0)))"
    )
    t = esc_drawtext_pct(ep_text)
    return (
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
        f"fontcolor=white:fontsize={font_px}:x=(w-text_w)/2:y={y}:"
        f"borderw=4:bordercolor=black@0.85:shadowx=2:shadowy=2:shadowcolor=black@0.5:"
        f"alpha='{a}'"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--bg-video", default="", help="逗号分隔背景视频, 按顺序循环使用")
    ap.add_argument("--title-size", type=int, default=64)
    ap.add_argument("--bgm", default="")
    ap.add_argument("--aspect", default="4:3", choices=list(ASPECT_SIZES.keys()), help="画幅: 4:3(默认) / 9:16(抖音竖屏) / 16:9(横屏)")
    ap.add_argument("--banner", default="", help="顶部常驻引导语（覆盖自动生成的标题条）。书名红线：画面顶部禁原书名")
    ap.add_argument("--alias", default="", help="别名：顶部常驻「搜「别名」看全文｜番茄小说」（集数走 --ep 大字）")
    ap.add_argument("--chapter", default="", help="第几章（如 3）：转成「第N集」大字（前3秒）并决定文件名（第N集）")
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()
    global W, H
    W, H = ASPECT_SIZES.get(a.aspect, ASPECT_SIZES["4:3"])
    ffmpeg = find_ffmpeg()
    os.makedirs(a.outdir, exist_ok=True)
    tmp = os.path.join(a.outdir, "tmp")
    os.makedirs(tmp, exist_ok=True)
    script = json.load(open(a.script, encoding="utf-8"))

    # ---- 1) 时间轴 + 字幕 cues ----
    audio_items = []  # (cue_text, audio_path)
    if script.get("hook_audio"):
        audio_items.append((script.get("hook", ""), script["hook_audio"]))
    for s in script["segments"]:
        if s.get("audio"):
            audio_items.append((s["text"], s["audio"]))
    if script.get("ending_audio"):
        audio_items.append((script.get("ending", ""), script["ending_audio"]))
    if not audio_items:
        raise SystemExit("script.json 中无音频, 先跑 tts_gen.py")

    cues, t = [], 0.0
    for text, p in audio_items:
        d = probe_duration(ffmpeg, p)
        cues.append((t, t + d, text))
        t += d

    # ★ 字幕效果（2026-10-11 重做）：改走 ASS 直接生成——
    #   ① 无底框：白字加粗+黑描边(3px)+轻投影（黑底 box 用户反馈太丑，已撤）；
    #   ② 字号随画幅：PlayRes=真实分辨率，FontSize=H*4.2%（4:3≈60px/9:16≈80px/16:9≈45px）；
    #   ③ 单行快切：长句按显示宽度切成单行小块、时间按宽度分摊，字幕逐句推进（"滚动"观感），
    #      彻底消灭两行长块换行；
    #   ④ 每条 Dialogue 带 \fad(140,140) 淡入淡出，衔接更顺。老版 ffmpeg 的 libass 全兼容。
    sub_font_px = max(40, int(H * 0.042))
    margin_v = max(40, int(H * 0.05))
    ass = os.path.join(tmp, "subs.ass")
    build_ass(cues, ass, sub_font_px, margin_v)

    # ---- 2) 音频拼接 (+可选 BGM) ----
    audio_out = os.path.join(tmp, "narration.m4a")
    if a.bgm and os.path.exists(a.bgm):
        files = [p for _, p in audio_items]
        cmd = [ffmpeg, "-y", "-v", "error"]
        for p in files:
            cmd += ["-i", p]
        cmd += ["-stream_loop", "-1", "-i", a.bgm]
        n = len(files)
        fc = ("".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[nar];"
              f"[{n}:a]volume=0.12[bg];[nar][bg]amix=inputs=2:duration=first[a]")
        cmd += ["-filter_complex", fc, "-map", "[a]", "-c:a", "aac", "-b:a", "160k", audio_out]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr[-2000:], file=sys.stderr); sys.exit(r.returncode)
    else:
        concat_audios(ffmpeg, [p for _, p in audio_items], audio_out)
    total = max(t, probe_duration(ffmpeg, audio_out))

    # ---- 3) 视频轨 + 字幕 + 标题 ----
    # ★ 顶部引导语支持多行 + 淡入（2026-10-07）：
    #   单行 drawtext 遇到长引导语（如「搜「别名」看全文｜打开番茄小说」）在 1080 宽画面上会超宽/贴边。
    #   改为**按行链式 drawtext**（每行一个 filter，各自 y 下移）——不用 `text_align`，
    #   因为项目自带的 ffmpeg 是 2019 版（实测 `text_align` 报 Option not found；`line_spacing`/`alpha` 均支持）。
    #   链式多行在任意 ffmpeg 版本都稳，故不依赖 text_align。
    #   alpha 表达式做 0.6s 淡入。
    # ★ 画面结构 v3（2026-10-12）：上「别名+番茄小说」常驻 / 中「第N集」大字只显示前3秒 /
    #   下字幕。「第N章」不再进标题条（此前常驻全片，占用画面且与集数信息重复）。
    #   ★ 老版 ffmpeg 实测：drawtext 文本里同时写 % 与 \: 会被解析失败**整段丢弃**，
    #     且中文书名号「」在 drawtext 中渲染成窄引号 → 用『』替代。
    if a.banner:
        top_text = a.banner
    elif a.alias:
        top_text = f"搜『{a.alias}』看全文｜番茄小说"
    elif script.get("banner"):
        top_text = script["banner"]
    else:
        top_text = script.get("title", "小说推文")
        print("[compose] ⚠️ 未传 --banner/--alias，标题条缺「别名+番茄小说」"
              "（书名红线要求烧别名而非书名）", file=sys.stderr)
    title_vf = ",".join(build_title_lines(top_text, a.title_size))
    srt_abs = os.path.abspath(ass).replace("\\", "/").replace(":", "\\:")
    fontsdir_esc = FONTS_DIR.replace("\\", "/").replace(":", "\\:")
    # ASS 自带完整样式（PlayRes=真实像素），无需 force_style；fontsdir 供 libass 找雅黑
    sub_vf = f"subtitles='{srt_abs}':fontsdir='{fontsdir_esc}'"
    # 「第N集」大字（前3秒）：仅传了章节号时叠加；放在字幕之后 → 大字压在字幕上方
    final_vf = sub_vf
    if a.chapter:
        ep_text = f"第{a.chapter}集"
        final_vf += "," + build_episode_filter(ep_text, FPS)

    # 文件名：传了别名/章节时用「别名_第N集.mp4」，否则回落旧命名
    if a.alias or a.chapter:
        out_name = f"{a.alias or script.get('title', 'novel')}" + (f"_第{a.chapter}集" if a.chapter else "") + ".mp4"
    else:
        out_name = f"{script.get('title', 'novel')}_{os.path.splitext(os.path.basename(a.script))[0]}.mp4"
    final = os.path.join(a.outdir, out_name)

    bg_clips = [p.strip() for p in a.bg_video.split(",") if p.strip()] if a.bg_video else []
    if bg_clips:
        # ★ 2026-10-09 重写：原「多输入 -stream_loop -1 + concat 滤镜」在项目自带 2019 版 ffmpeg 上
        #   实测失效——输出被最短的一条输入轨截断（第1/2章成片都只有 108.2s，而口播 448s）。
        #   新方案：① 每段背景先归一化（scale/crop/fps/setsar + 去音轨）成 clip_i.mp4；
        #          ② 探测每段「实际可解码时长」（防元数据虚高、文件截断的坏素材）；
        #          ③ 按顺序循环重复片段，拼到累计 ≥ total；
        #          ④ concat demuxer（-c copy）生成 bg_full.mp4；
        #          ⑤ 主命令改为**单输入 bg_full**，trim 到 total。
        #   实测：3 段背景拼 4 轮 = 216.24s（精确）；单输入 -stream_loop/trim 均正常生效。
        #   注：远端 origin 有同款修复但缺「坏素材检出」→ 本版为超集，保留检出 + 跳过 + 全坏报错。
        clip_files, clip_durs = [], []
        for i, p in enumerate(bg_clips):
            if not os.path.exists(p):
                print(f"[compose] 警告：背景 {p} 不存在，跳过", file=sys.stderr)
                continue
            clip = os.path.join(tmp, f"bgclip_{i:02d}.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-v", "error", "-i", p,
                 "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,"
                        f"crop={W}:{H},fps={FPS},setsar=1",
                 "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                 "-pix_fmt", "yuv420p", clip],
                check=True,
            )
            dur = probe_duration(ffmpeg, clip)
            # ★ 有效时长校验：坏素材（webm 截断）元数据报 14.6s 但实际只有 1.6s
            fprobe = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
            try:
                r = subprocess.run([fprobe, "-v", "error", "-count_frames",
                                    "-select_streams", "v:0",
                                    "-show_entries", "stream=nb_read_frames",
                                    "-of", "csv=p=0", clip],
                                   capture_output=True, text=True)
                n = int((r.stdout or "").strip().split(",")[0] or 0)
                real = n / float(FPS)
                if n > 0 and real < dur - 1.0:
                    print(f"[compose] 警告：背景 {os.path.basename(p)} 只解出 {real:.1f}s"
                          f"（元数据 {dur:.1f}s），疑似素材损坏/截断", file=sys.stderr)
                    dur = real
            except Exception:
                pass
            if dur < 1.0:
                print(f"[compose] 警告：背景 {os.path.basename(p)} 有效时长 {dur:.1f}s 过短，跳过",
                      file=sys.stderr)
                continue
            clip_files.append((os.path.basename(clip), dur))
            clip_durs.append(dur)

        if not clip_files:
            raise SystemExit("所有背景素材均不可用（缺失或损坏），请检查 --bg-video")

        # 循环重复片段，拼到累计 >= total（多留 1s 余量）
        want = total + 1.0
        seq, acc = [], 0.0
        while acc < want:
            for name, d in clip_files:
                seq.append(name)
                acc += d
                if acc >= want:
                    break
        lst = os.path.join(tmp, "bglist.txt")
        with open(lst, "w", encoding="utf-8") as f:
            for name in seq:
                f.write(f"file '{name}'\n")
        bg_full = os.path.join(tmp, "bg_full.mp4")
        # ★ concat demuxer（老版 ffmpeg）相对路径解析到**进程 cwd** → cwd=tmp + 纯文件名
        subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0",
                        "-i", "bglist.txt", "-c", "copy", os.path.abspath(bg_full)],
                       check=True, cwd=tmp)

        fc = (f"[0:v]trim=duration={total:.2f},setpts=PTS-STARTPTS[vv];"
              f"[vv]{title_vf},{final_vf}[vout]")
        cmd = [ffmpeg, "-y", "-v", "error", "-i", bg_full, "-i", audio_out,
               "-filter_complex", fc, "-map", "[vout]", "-map", "1:a",
               "-t", f"{total:.2f}",
               "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "160k", "-shortest", final]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr[-2000:], file=sys.stderr); sys.exit(r.returncode)
    else:
        # 分镜图模式(兜底): 每段一个占位帧 + zoompan
        seg_files = []
        for n, (start, end, text) in enumerate(cues):
            scene = script["segments"][n]["scene"] if n < len(script["segments"]) else text
            img = os.path.join(tmp, f"img_{n:03d}.png")
            make_placeholder(scene, img, ffmpeg)
            d = max(end - start, 1.0)
            vid = os.path.join(tmp, f"clip_{n:03d}.mp4")
            vf = (f"scale={W*2}:{H*2},zoompan=z='min(zoom+0.0008,1.15)':"
                  f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(d*FPS)}:s={W}x{H}:fps={FPS}")
            subprocess.run([ffmpeg, "-y", "-v", "error", "-loop", "1", "-i", img,
                            "-t", f"{d:.2f}", "-vf", vf,
                            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", vid],
                           check=True)
            seg_files.append(vid)
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w", encoding="utf-8") as f:
            for v in seg_files:
                # ★ concat demuxer（老版 ffmpeg）把列表内路径拼在 list.txt 所在目录之后，
                #   Windows 盘符绝对路径会坏（tmp/...C:\...）→ 片段与列表同目录，写纯文件名最稳
                f.write(f"file '{os.path.basename(v)}'\n")
        silent = os.path.join(tmp, "video_only.mp4")
        # ★ cwd=tmp + 列表内纯文件名：老版 ffmpeg 的 concat 把相对路径解析到**进程 cwd**
        subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0",
                        "-i", "list.txt", "-c", "copy", os.path.abspath(silent)],
                       check=True, cwd=tmp)
        subprocess.run([ffmpeg, "-y", "-v", "error", "-i", silent, "-i", audio_out,
                        "-vf", f"{title_vf},{final_vf}", "-t", f"{total:.2f}",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", final],
                       check=True)

    if not a.keep_temp:
        try:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass  # 清理失败不导致整体失败
    print(f"[compose] {final}  ({probe_duration(ffmpeg, final):.1f}s)")


if __name__ == "__main__":
    main()
