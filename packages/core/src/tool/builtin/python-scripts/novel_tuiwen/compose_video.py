# -*- coding: utf-8 -*-
"""
novel-tuiwen 视频合成器 v3 (ffmpeg, 4:3 1080x1440)
两种画面模式:
  A. 背景视频模式(推荐): --bg-video 修驴蹄/骑单车等解压视频, 循环铺满全片
  B. 分镜图模式(默认兜底): 无图时生成深色文字占位帧, 后续接 ComfyUI
画面结构 v4 (2026-10-18):
  顶部  = 「搜『别名』看全文｜番茄小说」常驻标题条（第0帧即全显，无淡入）
  角标  = 「第N集」右上角常驻小角标（全程可见，任何一帧当封面都带集数）
  中部  = 「第N集」大字，第0帧即全显，前3秒后淡出（--chapter 传入时）
  底部  = ASS 字幕单行快切（宽度系数 0.80 + 全角标点按全角计宽，防超出屏幕）
  ★ 封面：合成完自动抽第0帧落盘 <成片名>_封面.png → 发布时直接当首页图片
    （2026-10-18 用户反馈：v3 标题条/大字带淡入，首帧字几乎全透明，
     平台封面取首帧 ⇒ 用户刷到看不到别名/平台/集数任何信息）
用法:
  python compose_video.py --script script.json --outdir output/ \
      --bg-video bg1.mp4,bg2.mp4 [--alias 狐王痴狂 --chapter 1] [--bgm bgm.mp3]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

# ★ 子进程静默（2026-10-09）：本文件有 10 处 ffmpeg/ffprobe 调用，是"黑框一直闪"的主要来源。
#   打一次补丁 → 后续所有 subprocess.Popen 自动带 CREATE_NO_WINDOW。
import _winquiet  # noqa: E402
_winquiet.apply_popen_defaults()

# 画幅由 --aspect 决定（2026-10-07）：4:3=1080x1440(默认) / 9:16=1080x1920(抖音竖屏) / 16:9=1920x1080(横屏)
ASPECT_SIZES = {"4:3": (1080, 1440), "9:16": (1080, 1920), "16:9": (1920, 1080)}
W, H = ASPECT_SIZES["4:3"]
FPS = 25
FONTS_DIR = r"C:\Windows\Fonts"

# ── 段间停顿（2026-10-27，用户实报「断句有问题、听着生硬」）──────────────────
# 根因：TTS 是**逐段独立合成**再用 concat 硬拼，段与段之间原本 0ms —— 上一句尾音和
# 下一句首字顶在一起，每段又各自重新起调，听起来像一句话被切成几块。
# 这里按上一段末尾标点补静音（句号/问号长、逗号短），并让字幕/画面时间轴同步往后挪，
# 三轨仍然同源（cues 用同一份 pause），不会产生新的口型/字幕错位。
PAUSE_MS = {
    "。": 260, "！": 340, "!": 340, "？": 360, "?": 360, "…": 420,
    "，": 130, ",": 130, "；": 200, ";": 200, "：": 180, ":": 180, "、": 90,
}
DEFAULT_PAUSE_MS = 260
MAX_PAUSE_MS = 500
_TRAILING_QUOTES = "\"'」』”’)）】》"


def pause_after_sec(text: str) -> float:
    """上一段末尾该补多少静音（秒）。无标点按句末处理；引号收尾时看引号内最后一个标点。"""
    s = (text or "").rstrip()
    while s and s[-1] in _TRAILING_QUOTES:
        s = s[:-1].rstrip()
    if not s:
        return 0.0
    return min(PAUSE_MS.get(s[-1], DEFAULT_PAUSE_MS), MAX_PAUSE_MS) / 1000.0


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


def probe_packets_duration(ffmpeg, path, fps=FPS):
    """用 -count_packets 估算可解码时长（读包，不逐帧解码）。

    ★ 2026-10-24：原 -count_frames 会把整段背景全解码一遍，259s 1080p 素材要十几分钟，
      用户被迫改脚本跳过校验。count_packets 是秒级，仍能识别「元数据虚高/文件截断」。
      返回 0 表示探测失败。"""
    fp = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
    if not os.path.exists(fp):
        import shutil
        fp = shutil.which("ffprobe") or fp
    try:
        r = subprocess.run([fp, "-v", "error", "-count_packets",
                            "-select_streams", "v:0",
                            "-show_entries", "stream=nb_read_packets",
                            "-of", "csv=p=0", path],
                           capture_output=True, text=True)
        n = int((r.stdout or "").strip().split(",")[0] or 0)
        return n / float(fps) if n > 0 else 0.0
    except Exception:
        return 0.0


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
      底条 box 改 boxcolor=black@0.55 加重一档，压得住亮色背景视频。
    ★ v4 (2026-10-18)：去掉 0.6s 淡入——平台封面取 t=0 首帧，淡入导致首帧标题
      几乎全透明，用户刷到看不到别名/平台（改第0帧即全显，常驻本来就有）。"""
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
            f"borderw=3:bordercolor=black@0.7"
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
    #   ① drawbox 不认 t=fill（2018+ 语法）→ 用大数值厚度等效填满（9999 > 任意画幅半边，
    #      2026-10-18 实测本机 EVCapture ffmpeg 连 t=max 也不认 → 纯数字最稳）；
    #   ② drawtext 无 line_spacing 选项 → 去掉（占位帧观感略降，可接受）。
    #   v2 代码能跑是因为此前一直走背景视频模式，占位帧从没被真实执行过。
    body_one = body.replace("\n", " ")  # 无 line_spacing 也不换行渲染，直接压成一行
    vf = (
        f"drawbox=x=80:y=80:w={W-160}:h={H-160}:color=0x16213E@1:t=9999,"
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


# ── 环境音 / 高能音效（与 sfx-library.ts 同一套 ffmpeg 配方，完全免版权） ──
# Python 侧只内嵌必需项：氛围垫 + 几个点缀，避免反向依赖 Node。
AMBIENCE = {
    'pad_soft': ('anoisesrc=d=8:c=brown:a=0.35', 'lowpass=f=400,volume=0.5'),
    'room': ('anoisesrc=d=8:c=pink:a=0.12', 'lowpass=f=2200,highpass=f=80,volume=0.35'),
    'wind': ('anoisesrc=d=8:c=brown:a=0.5', 'lowpass=f=1200,highpass=f=120,volume=0.45'),
    'rain': ('anoisesrc=d=8:c=pink:a=0.4', 'highpass=f=400,lowpass=f=8000,volume=0.35'),
    'hum': ('sine=frequency=50:duration=8', 'lowpass=f=200,volume=0.22'),
    'space': ('sine=frequency=45:duration=8', 'vibrato=f=0.5:d=0.8,lowpass=f=180,volume=0.3'),
    'fire': ('anoisesrc=d=8:c=brown:a=0.5', 'lowpass=f=900,tremolo=f=6:d=0.7,volume=0.3'),
}

ACCENTS = {
    'riser': ('anoisesrc=d=1.2:c=pink:a=0.5', 'highpass=f=200,lowpass=f=8000,volume=0.8'),
    'impact': ('sine=frequency=70:duration=0.6', 'afade=t=out:st=0.05:d=0.5,volume=0.9'),
    'whoosh': ('anoisesrc=d=0.45:c=pink:a=0.5', 'highpass=f=300,lowpass=f=6000,afade=t=in:st=0:d=0.15,afade=t=out:st=0.3:d=0.15,volume=0.7'),
    'heartbeat': ('sine=frequency=55:duration=0.9', 'tremolo=f=2.2:d=0.9,lowpass=f=120,volume=0.8'),
}

# 高能关键词：命中才点缀，不做全程铺满
SPIKE_WORDS = ('突然', '竟然', '没想到', '居然', '猛地', '轰', '炸', '血', '死', '尸体',
               '惊', '尖叫', '喊', '哭', '撞', '枪', '刀', '门被', '错了', '反转')

AMBIENCE_BY_MOOD = (
    (('雨', '潮湿', '淋'), 'rain'),
    (('夜', '风', '山', '荒', '野'), 'wind'),
    (('死', '尸', '血', '悬', '怕', '恐怖'), 'hum'),
    (('宇宙', '未来', '星'), 'space'),
    (('火', '烤', '篝'), 'fire'),
)


def render_sfx(ffmpeg, spec, out_wav):
    """把 lavfi 配方渲染成 wav（8s 氛围垫 / 1s 左右点缀）。"""
    source, af = spec
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", source,
                    "-af", af, "-ar", "44100", "-ac", "1", out_wav], check=True)
    return out_wav


def pick_ambience(script_text, explicit):
    if explicit and explicit != 'auto':
        return None if explicit == 'none' else explicit
    for words, amb in AMBIENCE_BY_MOOD:
        if any(w in script_text for w in words):
            return amb
    return 'pad_soft'


# ── BGM（2026-10-24）：素材优先，缺失时本地合成 4 和弦循环垫 ──
# 动机：此前只有 ambience（风声/雨声）没有音乐，成片很枯燥；而 run_pipeline 的 --bgm
# 一直存在却没被工具面暴露。现在 auto = 先找 <工作目录>/00-source/bgm/ 下的音频，
# 找不到就本地合成一段免版权器乐（完全离线，不依赖外部音乐模型）。
BGM_EXTS = ('.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg')
IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
BGM_CHORDS = {
    'warm': [('C4', 'E4', 'G4'), ('G3', 'B3', 'D4'), ('A3', 'C4', 'E4'), ('F3', 'A3', 'C4')],
    'suspense': [('A3', 'C4', 'E4'), ('F3', 'A3', 'C4'), ('C4', 'E4', 'G4'), ('G3', 'B3', 'D4')],
    'epic': [('D3', 'F3', 'A3'), ('Bb2', 'D3', 'F3'), ('F3', 'A3', 'C4'), ('C3', 'E3', 'G3')],
}
NOTE_SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def _note_freq(note):
    """'A3' / 'F#4' / 'Bb2' → 频率（Hz）。"""
    letter = note[0].upper()
    i = 1
    semi = NOTE_SEMITONE[letter]
    if i < len(note) and note[i] in '#b':
        semi += 1 if note[i] == '#' else -1
        i += 1
    midi = 12 * (int(note[i:]) + 1) + semi
    return 440.0 * (2 ** ((midi - 69) / 12.0))


def pick_bgm_mood(script_text):
    text = script_text or ''
    if any(w in text for w in ('战', '杀', '血', '死', '怒', '轰', '炸', '末日', '逃亡')):
        return 'epic'
    if any(w in text for w in ('悬', '怕', '恐怖', '尸', '阴', '诡', '夜')):
        return 'suspense'
    return 'warm'


def extract_bg_frames(ffmpeg, bg_clips, tmp, w, h, max_frames=16):
    """从背景视频里抽静帧当动态排版的底图（本地素材库通常是视频，不是图片）。

    每段视频按其时长均匀抽 2~3 帧，总量不超过 max_frames；抽出来的帧交给 kinetic
    做 Ken Burns 推拉。这样「有素材视频但没素材图」也能出有真实画面的片子。
    """
    out_dir = os.path.join(tmp, "bgframes")
    os.makedirs(out_dir, exist_ok=True)
    frames, idx = [], 0
    for p in bg_clips:
        if not os.path.exists(p):
            continue
        dur = probe_duration(ffmpeg, p)
        if dur < 1.0:
            continue
        n = 3 if dur >= 12 else 2 if dur >= 5 else 1
        for k in range(n):
            if len(frames) >= max_frames:
                break
            at = dur * (k + 1) / (n + 1)
            out = os.path.join(out_dir, f"bgf_{idx:02d}.jpg")
            r = subprocess.run(
                [ffmpeg, "-y", "-v", "error", "-ss", f"{at:.2f}", "-i", p,
                 "-frames:v", "1", "-vf",
                 f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                 "-q:v", "2", out], capture_output=True)
            if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
                frames.append(out)
                idx += 1
    print(f"[visual] 从背景视频抽了 {len(frames)} 帧做底图", file=sys.stderr)
    return frames


def resolve_bg_images(arg, outdir):
    """动态排版的素材底图：显式列表，或 auto 自动扫描工作目录的图片库。

    扫描顺序 = 本地库存优先（00-source/images > 02-work/images > 00-source 根目录），
    这样「自己找素材」第一步先吃已有素材，不重复抓取/生成。
    """
    if not arg or arg == 'none':
        return []
    if arg != 'auto':
        found = [p.strip() for p in arg.split(',') if p.strip()]
        missing = [p for p in found if not os.path.exists(p)]
        if missing:
            print(f"[visual] 警告：素材底图不存在，已跳过：{missing[:3]}", file=sys.stderr)
        return [p for p in found if os.path.exists(p)]
    roots = []
    for r in (os.getcwd(), os.path.dirname(os.path.abspath(outdir))):
        if r and r not in roots:
            roots.append(r)
    for root in roots:
        # ★ 只扫**图片库目录**，不扫 00-source 根目录：那里混着背景视频/封面/杂物，
        #   盲扫等于「随便挑个素材挂上」，就是用户实报的「背景视频瞎用」。
        for sub in ('00-source/images', '00-source/图片', '02-work/images', '02-work/图片'):
            d = os.path.join(root, sub)
            if not os.path.isdir(d):
                continue
            cands = sorted(f for f in os.listdir(d) if f.lower().endswith(IMAGE_EXTS))
            if cands:
                print(f"[visual] 素材底图 {len(cands)} 张 ← {d}", file=sys.stderr)
                return [os.path.join(d, f) for f in cands]
    print("[visual] 未找到素材底图，使用纯色渐变背景", file=sys.stderr)
    return []


def render_bgm(ffmpeg, tmp, mood, out_path):
    """本地合成 8s 器乐循环（免版权）。失败抛异常，由调用方回落环境音。

    ★ 2026-10-28 重写：旧版是 4 个正弦三和弦叠加 + 低通，音色极薄，0.12 音量下
      在旁白里基本听不见（用户实报「没有背景音乐」）。新版按情绪编曲——
      四拍底鼓 + 贝斯根音 + 8 分琶音 + 铺底 pad，峰值归一化后直接进混音。
      epic / suspense / warm 三套节奏型与配器密度不同。
    """
    import math
    import random
    import struct
    import wave

    RATE = 44100
    seg = 2.0                      # 每个和弦 2s（120BPM 的 4 拍）
    n = int(RATE * seg)
    chords = BGM_CHORDS.get(mood, BGM_CHORDS['warm'])
    total = n * len(chords)
    buf = [0.0] * total

    def add(idx, v):
        if 0 <= idx < total:
            buf[idx] += v

    def env_ad(t, atk, dec):
        if t < 0 or t > atk + dec:
            return 0.0
        return (t / atk) if t < atk else (1.0 - (t - atk) / dec) ** 1.8

    rnd = random.Random(20261028)
    # 节奏型：底鼓落点 / 琶音密度
    if mood == 'epic':
        kicks, bass_at, arp_step, pad_amp = [0.0, 0.5, 1.0, 1.5], [0.0, 1.0], 0.25, 0.075
    elif mood == 'suspense':
        kicks, bass_at, arp_step, pad_amp = [0.0, 1.5], [0.0], 0.5, 0.085
    else:
        kicks, bass_at, arp_step, pad_amp = [0.0, 1.0], [0.0], 0.25, 0.070

    for ci, chord in enumerate(chords):
        base = ci * n
        freqs = [_note_freq(x) for x in chord]
        root = freqs[0] / 2.0

        # 铺底 pad：三个和弦音 + 轻微失谐，慢起慢收
        for f in freqs:
            for det in (1.0, 1.0035):
                w = 2 * math.pi * f * det
                for i in range(n):
                    t = i / RATE
                    e = min(1.0, t / 0.35) * min(1.0, (seg - t) / 0.5)
                    add(base + i, pad_amp * e * math.sin(w * t) / len(freqs))

        # 贝斯：根音下行八度，指数衰减
        for at in bass_at:
            s = base + int(at * RATE)
            dur = min(0.9, seg - at)
            for i in range(int(dur * RATE)):
                t = i / RATE
                add(s + i, 0.17 * math.exp(-2.4 * t) * math.sin(2 * math.pi * root * t))

        # 底鼓：130→45Hz 扫频 + 快速衰减
        for at in kicks:
            s = base + int(at * RATE)
            for i in range(int(0.16 * RATE)):
                t = i / RATE
                f = 45 + 85 * math.exp(-32 * t)
                add(s + i, 0.30 * math.exp(-22 * t) * math.sin(2 * math.pi * f * t))

        # 琶音：和弦音上行 8 分音符，短促
        step_i = 0
        t0 = 0.0
        while t0 < seg - 0.02:
            f = freqs[step_i % len(freqs)] * 2
            s = base + int(t0 * RATE)
            for i in range(int(0.20 * RATE)):
                t = i / RATE
                add(s + i, 0.055 * math.exp(-11 * t) * math.sin(2 * math.pi * f * t))
            step_i += 1
            t0 += arp_step

        # 踩镲：反拍白噪，极轻
        if mood != 'suspense':
            for at in [x + arp_step for x in kicks]:
                s = base + int(at * RATE)
                for i in range(int(0.035 * RATE)):
                    add(s + i, 0.020 * math.exp(-60 * (i / RATE)) * (rnd.random() * 2 - 1))

    peak = max(1e-6, max(abs(v) for v in buf))
    k = 0.55 / peak
    wav_path = os.path.join(tmp, f"bgm_{mood}.wav")
    w = wave.open(wav_path, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(
        struct.pack("<h", max(-32768, min(32767, int(v * k * 32767)))) for v in buf))
    w.close()
    subprocess.run([ffmpeg, "-y", "-v", "error", "-i", wav_path,
                    "-c:a", "aac", "-b:a", "128k", out_path], check=True)
    return out_path


def resolve_bgm(ffmpeg, bgm, outdir, tmp, script_text):
    """bgm 取值：''/'none' → 不加；'auto' → 素材优先、缺失则合成；其它 → 音频文件路径。"""
    if not bgm or bgm == 'none':
        return ''
    if bgm != 'auto':
        return bgm if os.path.exists(bgm) else ''
    roots = []
    for r in (os.getcwd(), os.path.dirname(os.path.abspath(outdir))):
        if r and r not in roots:
            roots.append(r)
    for root in roots:
        d = os.path.join(root, '00-source', 'bgm')
        if not os.path.isdir(d):
            continue
        cands = sorted(f for f in os.listdir(d) if f.lower().endswith(BGM_EXTS))
        if cands:
            picked = os.path.join(d, cands[0])
            print(f"[audio] bgm=素材 {picked}", file=sys.stderr)
            return picked
    mood = pick_bgm_mood(script_text)
    cache_dir = os.path.join(outdir, '.bgm')
    os.makedirs(cache_dir, exist_ok=True)
    out = os.path.join(cache_dir, f"auto_{mood}.m4a")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print(f"[audio] bgm=缓存 {out}", file=sys.stderr)
        return out
    try:
        render_bgm(ffmpeg, tmp, mood, out)
        print(f"[audio] bgm=合成 {mood} → {out}", file=sys.stderr)
        return out
    except Exception as e:
        print(f"[audio] bgm 合成失败，回落环境音：{e}", file=sys.stderr)
        return ''


def plan_accents(cues, enabled, level):
    """只在高能句点缀，最多 4 个，间隔 ≥6s。返回 [(t, id, gain)]。

    ★ 2026-10-28 去掉「开头必放 riser」：riser 是 1.2s 粉噪扫频，紧贴第一句人声
      出现，听感就是「开头一串沙沙的杂音」（用户实报）。点缀只在剧情高能处出现，
      片头保持干净。
    """
    if not enabled:
        return []
    plan = []
    last = 0.0
    for start, _end, text in cues:
        if len(plan) >= 4:
            break
        if start - last < 6.0 or start < 2.0:   # 前 2 秒不铺音效，避免糊住开场
            continue
        if any(w in (text or '') for w in SPIKE_WORDS):
            plan.append((max(0.0, start - 0.05),
                         'impact' if len(plan) % 2 == 0 else 'heartbeat', level))
            last = start
    return plan


def build_audio_bed(ffmpeg, tmp, audio_items, bgm, ambience, amb_level, accents, total_hint,
                    bgm_level=0.12):
    """旁白 + BGM/环境垫（侧链闪避）+ 点缀音效，输出单条 aac。

    ★ 人声永远主轨：BGM 与环境垫都走 sidechaincompress 被旁白压下去；
      有 BGM 时环境垫降到 0.05，避免两层氛围互相糊住。
    """
    files = [p for _, p in audio_items]
    n = len(files)
    cmd = [ffmpeg, "-y", "-v", "error"]
    for p in files:
        cmd += ["-i", p]

    # 音床层：BGM（音乐）与环境垫（氛围）可以同时存在
    beds = []  # [(input_index, level)]
    next_idx = n
    if bgm and os.path.exists(bgm):
        cmd += ["-stream_loop", "-1", "-i", bgm]
        beds.append((next_idx, bgm_level))
        next_idx += 1
    if ambience and ambience in AMBIENCE:
        render_sfx(ffmpeg, AMBIENCE[ambience], os.path.join(tmp, f"amb_{ambience}.wav"))
        cmd += ["-stream_loop", "-1", "-i", os.path.join(tmp, f"amb_{ambience}.wav")]
        beds.append((next_idx, min(amb_level, 0.05) if beds else amb_level))
        next_idx += 1

    acc_entries = []
    for i, (at, sid, gain) in enumerate(accents):
        if sid not in ACCENTS:
            continue
        f = render_sfx(ffmpeg, ACCENTS[sid], os.path.join(tmp, f"sfx_{i}_{sid}.wav"))
        cmd += ["-i", f]
        acc_entries.append((next_idx + len(acc_entries), at, gain))

    # 段间静音（2026-10-27）：每段尾部 apad 一段与标点匹配的静音（最后一段不补），
    # 与 cues 里的 pause_after_sec 同源 —— 断句自然，字幕/画面时间轴自动对齐。
    pad_parts = []
    for i, (txt, _p) in enumerate(audio_items):
        pad = pause_after_sec(txt) if i < n - 1 else 0.0
        pad_parts.append(
            f"[{i}:a]apad=pad_dur={pad:.3f}[p{i}]" if pad > 0.01 else f"[{i}:a]anull[p{i}]"
        )
    fc = ";".join(pad_parts) + ";" + "".join(f"[p{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[nar]"
    # ★ 老版 ffmpeg(2019, EVCapture 自带) 没有 amix 的 normalize 选项，
    #   默认会按输入路数衰减。这里先给每路乘 N，再 amix，等价于 normalize=0。
    n_mix = 1 + len(beds) + len(acc_entries)
    if beds:
        # 老版 ffmpeg 的标签只能被消费一次：旁白 asplit 成 1+N 路（混音 + 每层音床一个侧链键）
        labels = ["[narA]"] + [f"[narK{i}]" for i in range(len(beds))]
        fc += f";[nar]asplit={len(labels)}" + "".join(labels)
        fc += f";[narA]volume={n_mix}[narx]"
    else:
        fc += f";[nar]volume={n_mix}[narx]"
    mix_ins = ["[narx]"]
    for bi, (idx, lvl) in enumerate(beds):
        fc += (f";[{idx}:a]atrim=0:{max(1.0, total_hint):.2f}[bed{bi}t]"
               f";[bed{bi}t][narK{bi}]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=420[bed{bi}d]"
               f";[bed{bi}d]volume={lvl * n_mix:.4f}[bed{bi}x]")
        mix_ins.append(f"[bed{bi}x]")
    for (idx, at, gain) in acc_entries:
        fc += f";[{idx}:a]adelay={int(at * 1000)}|{int(at * 1000)},volume={gain * n_mix:.4f}[acc{idx}]"
        mix_ins.append(f"[acc{idx}]")
    # ★ 2026-10-21：混音后加 alimiter —— amix 按路数放大再衰减，瞬态（点缀音效 + 旁白峰值）
    #   叠加会越过 0dBFS（实测 +4.5~+7.4dB），AAC 编码即硬削波 → 统一过限幅器（-1dBFS）。
    # ★ 片头 60ms 淡入：杀掉首样本突变/编码器起点的「咔」声
    FADE_IN = ",afade=t=in:st=0:d=0.06"
    if len(mix_ins) == 1:
        fc += ";[narx]alimiter=limit=0.89:level=0" + FADE_IN + "[a]"
    else:
        fc += (f";{''.join(mix_ins)}amix=inputs={len(mix_ins)}:duration=first,"
               "alimiter=limit=0.89:level=0" + FADE_IN + "[a]")
    out = os.path.join(tmp, "narration.m4a")
    cmd += ["-filter_complex", fc, "-map", "[a]", "-c:a", "aac", "-b:a", "160k", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        sys.exit(r.returncode)
    return out


def build_episode_filter(ep_text: str, fps: int, fade_in: float = 0.0, fade_out: float = 0.5,
                         show: float = 3.0) -> str:
    """「第N集」大字：画面中部，第0帧即全显（v4）→ 保持到3s → 0.5s淡出。

    ★ v4 (2026-10-18)：取消 0.4s 淡入——平台封面取 t=0 首帧，淡入导致首帧
    集数几乎全透明，用户刷到不知道是第几集 → 首帧即全显。
    ★ 不加背景框：2026-10-12 实测老版 ffmpeg 的 box 与 alpha 表达式叠加，淡出中段会
    出现蓝/红色竖条状伪影（box 混合态渲染 bug）→ 改纯大字 + 黑描边 + 投影，任何底色都清晰。"""
    font_px = int(H * 0.115)
    y = int(H * 0.44)
    if fade_in > 0:
        a = (
            f"if(lt(t,{fade_in:.2f}),t/{fade_in:.2f},"
            f"if(lt(t,{show:.2f}),1,"
            f"if(lt(t,{show + fade_out:.2f}),1-(t-{show:.2f})/{fade_out:.2f},0)))"
        )
    else:
        a = (
            f"if(lt(t,{show:.2f}),1,"
            f"if(lt(t,{show + fade_out:.2f}),1-(t-{show:.2f})/{fade_out:.2f},0))"
        )
    t = esc_drawtext_pct(ep_text)
    return (
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
        f"fontcolor=white:fontsize={font_px}:x=(w-text_w)/2:y={y}:"
        f"borderw=4:bordercolor=black@0.85:shadowx=2:shadowy=2:shadowcolor=black@0.5:"
        f"alpha='{a}'"
    )


def build_episode_badge(ep_text: str, y: int | None = None) -> str:
    """「第N集」右上角常驻小角标（v4, 2026-10-18）：全程可见、无 alpha 表达式。

    动机：中部大字只在前3秒 → 中后段任意帧都不带集数，而平台可能自动选任意帧当封面。
    常驻角标保证**任何一帧**都含集数信息。注意：本滤镜无 alpha 表达式，
    所以 box=1 安全（box 彩色伪影只在 box+alpha 叠加时出现）。
    y 缺省贴顶（pad）——但顶部标题条居中、长标题几乎占满行宽，会与角标重叠
    （2026-10-18 冒烟实测盖住「番茄小说」）→ main() 应传入标题条 2 行最大高度
    之下方的 y，任何标题行数都不会重叠。"""
    font_px = max(36, int(H * 0.042))
    pad = int(H * 0.03)
    y = pad if y is None else y
    t = esc_drawtext(ep_text)
    return (
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
        f"fontcolor=white:fontsize={font_px}:x=w-text_w-{pad}:y={y}:"
        f"box=1:boxcolor=black@0.45:boxborderw=12:"
        f"borderw=2:bordercolor=black@0.6"
    )


def extract_cover(ffmpeg: str, final_mp4: str) -> str:
    """抽成片第0帧落盘封面图（v4, 2026-10-18）：<成片名>_封面.png。

    发布平台可手动上传封面：首帧已含 别名+平台（顶部标题条）+ 第N集（角标+大字），
    用户刷到首页缩略图即知全部基本信息。"""
    cover = os.path.splitext(final_mp4)[0] + "_封面.png"
    subprocess.run([ffmpeg, "-y", "-v", "error", "-i", final_mp4,
                    "-frames:v", "1", cover], check=True)
    return cover


def _compose_concurrency() -> int:
    """分段编码并发路数。
    ★ libx264 单实例就能吃满多核，并发路数取**物理核的一半且不超过 4**（再多只是互相抢核、
      还推高内存）；YZ_COMPOSE_CONCURRENCY 可覆盖，1 = 关闭分段（退回单次整片编码）。"""
    env = os.environ.get("YZ_COMPOSE_CONCURRENCY")
    if env:
        try:
            return max(1, min(int(env), 8))
        except ValueError:
            pass
    n = os.cpu_count() or 2
    return max(1, min(4, n // 2))


def _plan_chunks(cues, target_sec: float, workers: int):
    """按**字幕句边界**把时间轴切块（切在句首，字幕永远不会跨块被截断）。

    返回 [(start, end, cues_in_chunk), ...]；块数 ≈ 时长/target_sec，尾部过短的块并进上一块，
    再用两两合并把块数压到 ≈ workers*2 以内（块太碎只会增加编码器启动开销）。
    """
    if not cues:
        return []
    target = max(3.0, min(120.0, target_sec))
    chunks, cur, cur_start = [], [], None
    for s, e, text in cues:
        if cur_start is None:
            cur_start = s
        cur.append((s, e, text))
        if e - cur_start >= target:
            chunks.append((cur_start, e, cur))
            cur, cur_start = [], None
    if cur:
        if chunks and (cur[-1][1] - cur_start) < target * 0.4:
            s0, _e0, c0 = chunks[-1]
            chunks[-1] = (s0, cur[-1][1], c0 + cur)
        else:
            chunks.append((cur_start, cur[-1][1], cur))
    max_chunks = max(1, workers * 2)
    while len(chunks) > max_chunks:
        merged = []
        i = 0
        while i < len(chunks):
            if i + 1 < len(chunks):
                a, b = chunks[i], chunks[i + 1]
                merged.append((a[0], b[1], a[2] + b[2]))
                i += 2
            else:
                merged.append(chunks[i])
                i += 1
        chunks = merged
    return chunks


def _compose_chunks(ffmpeg: str, tmp: str, bg_full: str, chunks, title_vf: str,
                    badge_vf: str, ep_vf: str, font_px: int, margin_v: int,
                    workers: int) -> str:
    """并行编码各分段（纯视频，不含音轨）→ concat demuxer -c copy 拼成整条视频轨。

    ★ 为什么分段不带音频：每段各编一次 AAC，接缝会累积编码器 priming/padding，长片能听出
      顿挫；音频由调用方在最后一步用**整条**混音一次 mux 进去，接缝天然无缝。
    ★ 参数必须与整片模式完全一致（libx264 / preset fast / crf 23 / yuv420p），
      concat -c copy 才能直接拼。
    """
    fontsdir_esc = FONTS_DIR.replace("\\", "/").replace(":", "\\:")

    def run_one(k: int, start: float, end: float, chunk_cues) -> str:
        dur = max(0.1, end - start)
        ass_k = os.path.join(tmp, f"subs_{k:02d}.ass")
        # 字幕时间轴按块内偏移重写（cue 边界切块 → 不会截断某句）
        build_ass([(s - start, e - start, text) for s, e, text in chunk_cues], ass_k, font_px, margin_v)
        srt = os.path.abspath(ass_k).replace("\\", "/").replace(":", "\\:")
        vf = f"{title_vf},{badge_vf}" if badge_vf else title_vf
        # 「第N集」大字是 t<3s 的 alpha 表达式 → 每块 PTS 都从 0 起，只有第 0 块能带
        if ep_vf and k == 0:
            vf += f",{ep_vf}"
        vf += f",subtitles='{srt}':fontsdir='{fontsdir_esc}'"
        out = os.path.join(tmp, f"part_{k:02d}.mp4")
        fc = f"[0:v]setpts=PTS-STARTPTS[v0];[v0]{vf}[vout]"
        r = subprocess.run(
            [ffmpeg, "-y", "-v", "error", "-ss", f"{start:.3f}", "-i", bg_full,
             "-t", f"{dur:.3f}", "-filter_complex", fc, "-map", "[vout]", "-an",
             "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", out],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            raise RuntimeError(f"分段 {k} 编码失败：\n{r.stderr[-1200:]}")
        print(f"[compose] part_{k:02d} {dur:.1f}s（{start:.1f}→{end:.1f}）")
        return out

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(run_one, k, s, e, c) for k, (s, e, c) in enumerate(chunks)]
        parts = [f.result() for f in futs]  # 按序取，保持时间轴顺序

    lst = os.path.join(tmp, "parts.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for p in parts:
            f.write(f"file '{os.path.basename(p)}'\n")
    video_full = os.path.join(tmp, "video_full.mp4")
    # ★ cwd=tmp + 列表内纯文件名：老版 ffmpeg 的 concat 把相对路径解析到进程 cwd
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0",
                    "-i", "parts.txt", "-c", "copy", os.path.abspath(video_full)],
                   check=True, cwd=tmp)
    return video_full


def plan_image_slots(cues, n_images):
    """把时间轴按 cue 边界切成 n_images 段 → [(start, end), ...]（2026-10-24）。

    切分点**只落在 cue 边界上**：一张图的显示区间恰好覆盖整数个句子，
    于是换图、换字幕、换配音共用同一组时间点（用户实报的「不同步」就是三条轴各算各的）。
    图比句多时按一句一图处理，多余张数由调用方告警忽略。
    """
    m = len(cues)
    if m == 0 or n_images <= 0:
        return []
    if n_images >= m:
        return [(cues[i][0], cues[i][1]) for i in range(m)]
    slots = []
    for i in range(n_images):
        a = (i * m) // n_images
        b = ((i + 1) * m) // n_images - 1
        if b < a:
            b = a
        if b >= m:
            b = m - 1
        slots.append((cues[a][0], cues[b][1]))
    return slots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--bg-video", default="", help="逗号分隔背景视频, 按顺序循环使用")
    ap.add_argument("--images", default="",
                    help="逗号分隔图片（按顺序）：图片轮播模式，每张覆盖若干整句，切图边界=字幕/配音边界")
    ap.add_argument("--title-size", type=int, default=64)
    ap.add_argument("--bgm", default="", help="背景音乐：auto（默认素材优先+自动合成兜底）/ none / 音频文件")
    ap.add_argument("--bgm-level", type=float, default=0.20,
                    help="BGM 音量（0~1，默认 0.20；旧值 0.12 在旁白下几乎听不见）")
    ap.add_argument("--storyboard", default="",
                    help="分镜 JSON（文件路径或 JSON 字符串）：走**动态排版引擎**——元素随旁白节奏入场、"
                         "场景交叉淡化、底部打字机字幕。省略则按旁白自动生成分镜")
    ap.add_argument("--visual", default="auto", choices=["auto", "kinetic", "images", "bg_video"],
                    help="画面模式：auto（有 storyboard 或无背景素材→kinetic）/ kinetic / images / bg_video")
    ap.add_argument("--bg-images", default="",
                    help="动态排版的素材底图：逗号分隔图片路径，或 auto（自动扫描 00-source/images、"
                         "02-work/images、00-source；按顺序轮转做 Ken Burns 推拉）")
    ap.add_argument("--subtitle-style", default="typewriter", choices=["typewriter", "ticker"],
                    help="字幕样式：typewriter=逐句打字机（默认，平台主流）/ ticker=整句从右往左平移")
    ap.add_argument("--out-name", default="", help="成片文件名（不含路径；缺省按别名+集数或标题命名）")
    ap.add_argument("--ambience", default="auto",
                    help="环境音：auto（按文案情绪选）/ none / pad_soft / room / wind / rain / hum / space / fire")
    ap.add_argument("--ambience-level", type=float, default=0.12, help="环境音音量（0~1，默认 0.12，会被旁白闪避压下去）")
    ap.add_argument("--sfx", default="auto", help="高能点缀音效：auto（开头+高能句）/ none（关闭）")
    ap.add_argument("--sfx-level", type=float, default=0.35, help="点缀音效音量（0~1，默认 0.35）")
    ap.add_argument("--aspect", default="4:3", choices=list(ASPECT_SIZES.keys()), help="画幅: 4:3(默认) / 9:16(抖音竖屏) / 16:9(横屏)")
    ap.add_argument("--banner", default="", help="顶部常驻引导语（覆盖自动生成的标题条）。书名红线：画面顶部禁原书名")
    ap.add_argument("--alias", default="", help="别名：顶部常驻「搜「别名」看全文｜番茄小说」（集数走 --ep 大字）")
    ap.add_argument("--chapter", default="", help="第几集（如 3）：「第N集」首帧大字+全程角标，并决定文件名（第N集）与封面图")
    ap.add_argument("--chunk-concurrency", type=int, default=0,
                    help="分段并行编码路数（0=自动按核数，1=关闭分段退回整片单次编码）")
    ap.add_argument("--chunk-seconds", type=float, default=0,
                    help="分块目标时长（秒）：0=按并发自动（时长/并发×2）")
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()
    if a.chunk_concurrency and a.chunk_concurrency > 0:
        os.environ["YZ_COMPOSE_CONCURRENCY"] = str(a.chunk_concurrency)
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
    for i, (text, p) in enumerate(audio_items):
        d = probe_duration(ffmpeg, p)
        cues.append((t, t + d, text))
        t += d
        if i < len(audio_items) - 1:
            t += pause_after_sec(text)   # 段间停顿与 build_audio_bed 的 apad 同源

    # ★ 字幕效果（2026-10-11 重做）：改走 ASS 直接生成——
    #   ① 无底框：白字加粗+黑描边(3px)+轻投影（黑底 box 用户反馈太丑，已撤）；
    #   ② 字号随画幅：PlayRes=真实分辨率，FontSize=H*4.2%（4:3≈60px/9:16≈80px/16:9≈45px）；
    #   ③ 单行快切：长句按显示宽度切成单行小块、时间按宽度分摊，字幕逐句推进（"滚动"观感），
    #      彻底消灭两行长块换行；
    #   ④ 每条 Dialogue 带 \fad(140,140) 淡入淡出，衔接更顺。老版 ffmpeg 的 libass 全兼容。
    # ★ 字幕安全区（2026-10-24）：9:16 成片在抖音播放时底部有账号名/进度条/文案遮罩，
    #   原 H*5%（约 96px）字幕正好被盖住，用户实际观感是「没有字幕」→ 上移到 14%。
    if a.aspect == '9:16':
        sub_font_px = max(40, int(H * 0.046))
        margin_v = max(40, int(H * 0.14))
    elif a.aspect == '4:3':
        sub_font_px = max(40, int(H * 0.042))
        margin_v = max(40, int(H * 0.07))
    else:
        sub_font_px = max(40, int(H * 0.042))
        margin_v = max(40, int(H * 0.05))
    ass = os.path.join(tmp, "subs.ass")

    # ---- 2) 音频：旁白 + 环境音（被旁白侧链闪避）+ 高能点缀音效 ----
    #   ★ 人声永远主轨：环境垫走 sidechaincompress 被旁白压下去，点缀音效只在高能句句首。
    script_text = " ".join(
        [script.get("hook", "")]
        + [s.get("text", "") for s in script.get("segments", [])]
        + [script.get("ending", "")]
    )
    ambience = pick_ambience(script_text, a.ambience)
    accents = plan_accents(cues, a.sfx != 'none', a.sfx_level)
    bgm_path = resolve_bgm(ffmpeg, a.bgm, a.outdir, tmp, script_text)
    audio_out = build_audio_bed(
        ffmpeg, tmp, audio_items, bgm_path, ambience,
        max(0.0, min(1.0, a.ambience_level)), accents, t,
        bgm_level=max(0.0, min(1.0, a.bgm_level)),
    )
    print(f"[audio] bgm={os.path.basename(bgm_path) if bgm_path else 'none'} "
          f"ambience={ambience} level={a.ambience_level} accents={[x[1] for x in accents]}")

    # ★ 时间轴校正（2026-10-24 用户：「画面，字幕，配音不同步」）：
    #   逐段 probe 出来的时长之和 ≠ 实际拼接后的音频长度（mp3 解码边界/采样取整，
    #   每段差几十毫秒，几十段就累成秒级漂移）→ 字幕越往后越对不上配音。
    #   以**真实旁白长度**为准，按比例把 cue 边界缩放回去；画面分段也用同一张 cue 表，
    #   于是「画面 / 字幕 / 配音」三条时间轴天然同源。
    real_audio = probe_duration(ffmpeg, audio_out)
    if real_audio > 0 and t > 0 and abs(real_audio - t) > 0.15:
        k = real_audio / t
        cues = [(s * k, e * k, txt) for (s, e, txt) in cues]
        print(f"[compose] 时间轴校正 ×{k:.4f}（逐段累计 {t:.2f}s → 实际旁白 {real_audio:.2f}s）")
        t = real_audio
    build_ass(cues, ass, sub_font_px, margin_v)
    total = max(t, real_audio)

    # ---- 3) 视频轨 + 字幕 + 标题 ----
    # ★ 顶部引导语支持多行 + 淡入（2026-10-07）：
    #   单行 drawtext 遇到长引导语（如「搜「别名」看全文｜打开番茄小说」）在 1080 宽画面上会超宽/贴边。
    #   改为**按行链式 drawtext**（每行一个 filter，各自 y 下移）——不用 `text_align`，
    #   因为项目自带的 ffmpeg 是 2019 版（实测 `text_align` 报 Option not found；`line_spacing`/`alpha` 均支持）。
    #   链式多行在任意 ffmpeg 版本都稳，故不依赖 text_align。
    #   ★ v4 (2026-10-18)：0.6s 淡入已取消——平台封面取 t=0 首帧，淡入致首帧无字。
    # ★ 画面结构 v4（2026-10-18）：上「别名+番茄小说」常驻首帧全显 /
    #   右上角「第N集」常驻角标 / 中「第N集」大字首帧全显、前3秒后淡出 / 下字幕。
    #   「第N章」不再进标题条（此前常驻全片，占用画面且与集数信息重复）。
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
    # 「第N集」：右上角常驻角标（任何一帧都带集数）+ 中部大字（首帧全显，前3秒）
    # 角标 y 必须在标题条 2 行最大高度之下（标题居中且长标题几乎占满行宽，贴顶会重叠）
    badge_vf = ""
    ep_vf = ""
    if a.chapter:
        ep_text = f"第{a.chapter}集"
        badge_y = 80 + 2 * (a.title_size + 12) + 24
        badge_vf = build_episode_badge(ep_text, badge_y)
        ep_vf = build_episode_filter(ep_text, FPS)
    # 整片模式直接把角标/大字串在字幕后面；分段模式交给 _compose_chunks 按块拼
    final_vf = sub_vf + (f",{badge_vf},{ep_vf}" if a.chapter else "")

    # 文件名：传了别名/章节时用「别名_第N集.mp4」，否则回落旧命名
    # 文件名：显式 out-name > 别名+集数 > 标题（通用口播模式不再拼成「标题_script.mp4」）
    if a.out_name:
        safe_name = os.path.basename(a.out_name.strip())
        out_name = safe_name if safe_name.lower().endswith('.mp4') else safe_name + '.mp4'
    elif a.alias or a.chapter:
        out_name = f"{a.alias or script.get('title', 'novel')}" + (f"_第{a.chapter}集" if a.chapter else "") + ".mp4"
    else:
        out_name = f"{script.get('title', 'novel')}.mp4"
    final = os.path.join(a.outdir, out_name)

    bg_clips = [p.strip() for p in a.bg_video.split(",") if p.strip()] if a.bg_video else []
    images = [p.strip() for p in a.images.split(",") if p.strip()] if a.images else []

    # ---- 3b) 动态排版画面轨（kinetic）----
    # 动因（2026-10-28 用户：「图片一张张切换、字幕和图里的字重复、没有音乐特效」）：
    #   整图轮播的天花板就是硬切——图是死的，怎么调参都动不起来。kinetic 逐帧绘制，
    #   元素按旁白节奏入场、场景交叉淡化、字幕逐字打出，且卡片只放关键词不与字幕重复。
    # auto 策略：给了 storyboard 就用；没背景素材也没图片时也用它（比深色占位帧好看得多）。
    use_kinetic = (a.visual == "kinetic") or (
        a.visual == "auto" and (bool(a.storyboard) or (not bg_clips and not images)))
    if use_kinetic:
        try:
            import kinetic as kinetic_mod
        except Exception as e:
            raise SystemExit(f"动态排版引擎不可用（缺 Pillow？pip install pillow）：{e}")
        raw_sb = None
        if a.storyboard:
            if os.path.exists(a.storyboard):
                raw_sb = kinetic_mod.load_storyboard(a.storyboard)
            else:
                try:
                    raw_sb = json.loads(a.storyboard)
                except Exception:
                    raise SystemExit("--storyboard 既不是存在的文件，也不是合法 JSON")
        if raw_sb:
            scenes = kinetic_mod.normalize_storyboard(raw_sb, len(cues))
        else:
            print("[compose] 未传 --storyboard，按旁白自动生成分镜", file=sys.stderr)
            scenes = [kinetic_mod.auto_scene(txt, i) for i, (_s, _e, txt) in enumerate(cues)]
        timeline = kinetic_mod.build_timeline(scenes, cues, total)
        video_only = os.path.join(tmp, "kinetic.mp4")
        badge = f"第{a.chapter}集" if a.chapter else ""
        bg_imgs = resolve_bg_images(a.bg_images, a.outdir)
        if not bg_imgs and bg_clips:
            # 只给了背景视频：抽帧做底图（视频本身不进 kinetic 轨，避免与文字抢注意力）
            bg_imgs = extract_bg_frames(ffmpeg, bg_clips, tmp, W, H)
        # ★ 首帧契约（v4，冻结）：kinetic 分支同样要「右上角角标 + 中部第N集大字 + 第一镜内容首帧全显」。
        #   2026-10-28 kinetic 变成默认画面引擎时漏了中部大字与首帧静态 → 抖音成片开头没有集数/主要内容。
        #   大字与角标同源（都来自 --chapter），两条渲染路径的首帧信息必须一致。
        kinetic_mod.render_video(ffmpeg, video_only, timeline, total, W, H,
                                 top_text=top_text, badge_text=badge, fps=FPS,
                                 episode_text=badge,
                                 bg_images=bg_imgs,
                                 theme=str((raw_sb or {}).get("theme") or "dark"),
                                 subtitle_style=a.subtitle_style)
        # 视频轨不再叠 drawtext/ASS：顶部条、角标、字幕全部由渲染器画进帧里
        subprocess.run([ffmpeg, "-y", "-v", "error", "-i", video_only, "-i", audio_out,
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                        "-t", f"{total:.2f}", "-shortest", final], check=True)
    elif bg_clips:
        # ★ 2026-10-09 重写：原「多输入 -stream_loop -1 + concat 滤镜」在项目自带 2019 版 ffmpeg 上
        #   实测失效——输出被最短的一条输入轨截断（第1/2章成片都只有 108.2s，而口播 448s）。
        #   新方案：① 每段背景先归一化（scale/crop/fps/setsar + 去音轨）成 clip_i.mp4；
        #          ② 探测每段「实际可解码时长」（防元数据虚高、文件截断的坏素材）；
        #          ③ 按顺序循环重复片段，拼到累计 ≥ total；
        #          ④ concat demuxer（-c copy）生成 bg_full.mp4；
        #          ⑤ 主命令改为**单输入 bg_full**，trim 到 total。
        #   实测：3 段背景拼 4 轮 = 216.24s（精确）；单输入 -stream_loop/trim 均正常生效。
        #   注：远端 origin 有同款修复但缺「坏素材检出」→ 本版为超集，保留检出 + 跳过 + 全坏报错。
        # ★ 2026-10-24 性能：背景归一化结果按「源路径+大小+mtime+目标规格」缓存复用。
        #   此前每集都重新转码，且用 -count_frames 全解码校验（259s 片段要十几分钟），
        #   用户被迫手改脚本跳过。现在默认复用（REUSE_BGCLIP=0 可关），校验改读包（count_packets）。
        reuse = os.environ.get("REUSE_BGCLIP", "1") != "0"
        skip_framecheck = os.environ.get("SKIP_FRAMECHECK") == "1"
        clip_files, clip_durs = [], []
        for i, p in enumerate(bg_clips):
            if not os.path.exists(p):
                print(f"[compose] 警告：背景 {p} 不存在，跳过", file=sys.stderr)
                continue
            clip = os.path.join(tmp, f"bgclip_{i:02d}.mp4")
            try:
                st = os.stat(p)
                key = {"src": os.path.abspath(p), "size": st.st_size, "mtime": int(st.st_mtime),
                       "w": W, "h": H, "fps": FPS, "v": 2}
                ck = hashlib.sha1(json.dumps(key, sort_keys=True).encode()).hexdigest()[:12]
            except OSError:
                key, ck = None, None
            # ★ 缓存必须放在 tmp 之外：tmp 每次跑完会被清掉，放里面等于没缓存。
            cache_dir = os.path.join(a.outdir, ".bgcache")
            cache_clip = os.path.join(cache_dir, f"bgclip_{ck}.mp4") if ck else ""
            meta_path = cache_clip + ".meta.json"

            dur = 0.0
            cached = False
            if reuse and ck and os.path.exists(cache_clip) and os.path.getsize(cache_clip) > 0 \
                    and os.path.exists(meta_path):
                try:
                    if json.load(open(meta_path, encoding="utf-8")) == key:
                        shutil.copyfile(cache_clip, clip)
                        dur = probe_duration(ffmpeg, clip)
                        cached = dur >= 1.0
                except Exception:
                    cached = False
            if cached:
                print(f"[compose] 复用已转码片段 {os.path.basename(cache_clip)}", file=sys.stderr)
            else:
                copied = False
                # 源规格已匹配（h264/yuv420p + 分辨率/帧率/SAR/无旋转）→ 直接 stream copy
                try:
                    spec = subprocess.run(
                        [_ffprobe_path(ffmpeg), "-v", "error", "-select_streams", "v:0",
                         "-show_entries",
                         "stream=codec_name,width,height,r_frame_rate,sample_aspect_ratio,pix_fmt:stream_tags=rotate",
                         "-of", "json", p], capture_output=True, text=True)
                    s0 = (json.loads(spec.stdout or "{}").get("streams") or [{}])[0]
                    num, _, den = (s0.get("r_frame_rate") or "0/1").partition("/")
                    src_fps = (float(num) / float(den)) if float(den or 0) else 0.0
                    rotate = (s0.get("tags") or {}).get("rotate") or "0"
                    if (s0.get("codec_name") == "h264" and s0.get("pix_fmt") == "yuv420p"
                            and int(s0.get("width") or 0) == W and int(s0.get("height") or 0) == H
                            and abs(src_fps - FPS) < 0.01
                            and (s0.get("sample_aspect_ratio") or "1:1") in ("1:1", "0:1", "N/A")
                            and rotate in ("0", "")):
                        subprocess.run([ffmpeg, "-y", "-v", "error", "-i", p,
                                        "-an", "-c:v", "copy", clip], check=True)
                        copied = True
                        print(f"[compose] 规格已匹配，直接复用源视频 {os.path.basename(p)}",
                              file=sys.stderr)
                except Exception:
                    copied = False
                if not copied:
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
                if not skip_framecheck:
                    real = probe_packets_duration(ffmpeg, clip, FPS)
                    if real > 0 and real < dur - 1.0:
                        print(f"[compose] 警告：背景 {os.path.basename(p)} 只解出 {real:.1f}s"
                              f"（元数据 {dur:.1f}s），疑似素材损坏/截断", file=sys.stderr)
                        dur = real
                if dur >= 1.0 and ck:
                    try:
                        os.makedirs(cache_dir, exist_ok=True)
                        shutil.copyfile(clip, cache_clip)
                        with open(meta_path, "w", encoding="utf-8") as mf:
                            json.dump(key, mf)
                    except Exception as e:
                        print(f"[compose] 背景缓存写入失败（不影响出片）：{e}", file=sys.stderr)
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

        # ---- 分段并行编码（2026-10-23）：长章节整片单次编码只能吃满一个核 ----
        workers = _compose_concurrency()
        target_sec = a.chunk_seconds if a.chunk_seconds and a.chunk_seconds > 0 else total / max(1, workers * 2)
        chunks = _plan_chunks(cues, target_sec, workers) if workers > 1 else []
        # 环境音/音效尾巴可能比口播长（total = max(口播, 混音)）：把尾块补到 total，
        # 否则成片会在口播结束处提前收尾（与整片模式的 -t total 语义对齐）
        if chunks and total > chunks[-1][1] + 0.05:
            s0, _e0, c0 = chunks[-1]
            chunks[-1] = (s0, total, c0)
        if len(chunks) > 1:
            print(f"[compose] 分段编码：{len(chunks)} 段，并发 {workers}")
            video_full = _compose_chunks(ffmpeg, tmp, bg_full, chunks, title_vf,
                                         badge_vf, ep_vf, sub_font_px, margin_v, workers)
            # ★ 音轨整条一次 mux：视频 -c copy 不重编码（分段接缝天然无缝）
            subprocess.run([ffmpeg, "-y", "-v", "error", "-i", video_full, "-i", audio_out,
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", final],
                           check=True)
        else:
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
        # 画面轨：图片轮播（图文成品）优先，其次才是分镜占位帧兜底。
        seg_files = []
        if images:
            # ---- 图片轮播（2026-10-24）----
            # 图片区间由 **cue 边界**切出（cue 来自真实配音时长），所以「换图 / 换字幕 /
            # 换句配音」共用同一组时间点；最后一张图多铺 1s 再被 -t total 裁掉，
            # 保证画面严格覆盖音频（此前手写脚本正是这里短了 5.6s）。
            usable = [p for p in images if os.path.exists(p)]
            for p in images:
                if not os.path.exists(p):
                    print(f"[compose] 警告：图片 {p} 不存在，跳过", file=sys.stderr)
            if not usable:
                raise SystemExit("--images 里的图片都不存在，请检查路径")
            slots = plan_image_slots(cues, len(usable))
            if len(usable) > len(slots):
                print(f"[compose] 提示：{len(usable) - len(slots)} 张图没有对应句子，已忽略"
                      f"（{len(slots)} 句 / {len(usable)} 图）", file=sys.stderr)
            used = usable[:len(slots)]
            print(f"[compose] 图片轮播：{len(used)} 张覆盖 {len(cues)} 句、{total:.2f}s")
            for i, img in enumerate(used):
                start, end = slots[i]
                if i == len(used) - 1:
                    end = total + 1.0  # 尾量：覆盖逐帧取整，最终由 -t total 裁齐
                d = max(0.5, end - start)
                vid = os.path.join(tmp, f"imgclip_{i:02d}.mp4")
                # 图文素材自带文字：用「等比缩小 + 居中补底」而非裁剪，绝不切掉图内文字。
                vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                      f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x101010,setsar=1")
                subprocess.run([ffmpeg, "-y", "-v", "error", "-loop", "1",
                                "-framerate", str(FPS), "-i", img, "-t", f"{d:.2f}",
                                "-vf", vf, "-c:v", "libx264", "-preset", "fast",
                                "-pix_fmt", "yuv420p", vid], check=True)
                seg_files.append(vid)
        else:
            # 分镜图模式(兜底): 每段一个占位帧 + zoompan
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
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass  # 清理失败不导致整体失败
    # ---- 4) 封面图（v4, 2026-10-18）：抽成片第0帧 → 发布时直接当首页图片上传 ----
    cover = extract_cover(ffmpeg, final)
    print(f"[compose] {final}  ({probe_duration(ffmpeg, final):.1f}s)")
    print(f"[compose] 封面图（首帧含 别名+平台+集数）: {cover}")


if __name__ == "__main__":
    main()
