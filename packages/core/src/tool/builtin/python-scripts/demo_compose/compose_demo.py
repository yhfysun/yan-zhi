# -*- coding: utf-8 -*-
"""compose_demo.py — 言智演示视频后期合成（screen_record 原始录像 → 可发布成片）

输入：screen_record 录的原始窗口录像 + 演示脚本 JSON（标题/步骤字幕/片尾语）
输出：顶部标题条 + 底部步骤字幕 + 片尾卡 的成片 mp4

脚本 JSON 结构：
{
  "title": "言智演示：一键出片",          // 必填，顶部标题条 + 默认文件名
  "banner": "言智 · 智能体平台",          // 可选，覆盖标题条文案
  "steps": [{"t": 0.0, "text": "打开言智，选择「言智代言官」"}, ...],  // 字幕时间点（秒）
  "outro": "由言智 App 自动录制"          // 可选，片尾 3 秒语
}

老版 ffmpeg 兼容（与 novel_tuiwen/compose_video.py 同源踩坑结论）：
  - drawtext 无 line_spacing/text_align → 标题条链式多行、字幕 ASS 单行快切
  - box 与 alpha 表达式叠加会出彩条伪影 → 片尾用纯大字+描边投影（无 box）
  - drawtext 的 % 在 alpha 表达式里必须双转义；中文书名号用『』
  - 中文字体必须显式 fontfile=msyh.ttc（本机无 fontconfig）
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
FONTS_DIR = "C:/Windows/Fonts"


def run_quiet(cmd, **kw):
    """subprocess.run 的静默封装（Windows 下不闪黑框）。"""
    if os.name == "nt":
        kw.setdefault("creationflags", CREATE_NO_WINDOW)
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def find_ffmpeg():
    cands = [os.environ.get("FFMPEG"), "C:\\APP\\EVCapture\\ffmpeg.exe"]
    cands.append(shutil.which("ffmpeg"))
    for p in cands:
        if p and os.path.exists(p):
            return p
    raise SystemExit("ffmpeg not found (set FFMPEG env)")


def find_ffprobe(ffmpeg):
    fp = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
    if not os.path.exists(fp):
        fp = shutil.which("ffprobe") or fp
    return fp


def probe_video(ffprobe, path):
    """返回 (W, H, duration)；探测失败回落 1280x720 / 30s。"""
    w, h, dur = 1280, 720, 30.0
    try:
        r = run_quiet([ffprobe, "-v", "error", "-select_streams", "v:0",
                       "-show_entries", "stream=width,height", "-show_entries",
                       "format=duration", "-of", "json", path])
        data = json.loads(r.stdout or "{}")
        st = (data.get("streams") or [{}])[0]
        w = int(st.get("width") or w)
        h = int(st.get("height") or h)
        dur = float(data.get("format", {}).get("duration") or dur)
    except Exception:
        pass
    return w, h, dur


# ===== 文本工具（与 novel_tuiwen/compose_video.py 同源，纯函数可测） =====

def disp_w(ch: str) -> float:
    """显示宽度：CJK/全角/通用标点(U+2000~206F)=1，半角=0.55。"""
    o = ord(ch)
    if o >= 0x2E80 or 0x2000 <= o <= 0x206F:
        return 1.0
    return 0.55


def chunk_single_line(text: str, max_chars: int):
    """按显示宽度把一条 cue 切成单行小块（演示字幕单行快切）。"""
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


def ass_clean(s: str) -> str:
    return re.sub(r"[{}\\]", "", s or "")


def fmt_ass_ts(sec: float) -> str:
    cs = int(round(sec * 100))
    cs = max(0, min(cs, 100 * 3600 * 24 - 1))
    h, rem = divmod(cs, 100 * 3600)
    m, rem = divmod(rem, 100 * 60)
    s, cs2 = divmod(rem, 100)
    if cs2 == 100:
        cs2 = 99
    return f"{h:01d}:{m:02d}:{s:02d}.{cs2:02d}"


def esc_drawtext(s: str) -> str:
    for ch in ("\\", ":", "'", "%", ",", "[", "]"):
        s = s.replace(ch, {"\\": "\\\\", ":": "\\:", "'": "\\'",
                           "%": "\\%", ",": "\\,", "[": "\\[", "]": "\\]"}[ch])
    return s


def esc_drawtext_pct(s: str) -> str:
    return esc_drawtext(s).replace("%", "\\%")


def build_ass_cues(steps, total: float, tail: float = 1.0):
    """steps[{t,text}] → [(start,end,text)]；每条持续到下一步（最后一条到片尾前）。"""
    cues = []
    pts = sorted([(float(s.get("t") or 0), str(s.get("text") or "")) for s in steps or []],
                 key=lambda x: x[0])
    for i, (t, text) in enumerate(pts):
        if not text.strip():
            continue
        end = pts[i + 1][0] if i + 1 < len(pts) else max(total - tail, t + 1.0)
        if end <= t:
            continue
        cues.append((t, end, text))
    return cues


def build_ass(W, H, cues, out_path, fade_ms: int = 140):
    font_px = max(20, int(H * 0.045))
    margin_v = max(24, int(H * 0.055))
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


def build_title_lines(top_text: str, W: int, title_size: int):
    """顶部标题条：链式 drawtext 多行（≤2 行自动断行），半透明黑底 + 0.6s 淡入。"""
    max_chars = max(6, int(W * 0.90 / title_size))
    s = (top_text or "").strip()
    # 与 novel_tuiwen 同规则：显式换行 > 自然分隔处断行 > 硬切
    explicit = [seg.strip() for seg in s.split("\n") if seg.strip()]
    if len(explicit) > 1:
        title_lines = explicit[:2]
    elif len(s) <= max_chars:
        title_lines = [s] if s else []
    else:
        mid = len(s) // 2
        best = -1
        for m in re.finditer(r"[｜|，,、\s]", s):
            if m.start() <= max_chars and (best < 0 or abs(m.start() - mid) < abs(best - mid)):
                best = m.start()
        cut = best if best > 0 else max_chars
        title_lines = [s[:cut].strip(), s[cut:].strip().lstrip("｜|，,、 ")]
    line_step = title_size + 12
    parts = []
    for i, ln in enumerate([l for l in title_lines if l][:2]):
        t = esc_drawtext_pct(ln)
        parts.append(
            f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
            f"fontcolor=white:fontsize={title_size}:x=(w-text_w)/2:y={60 + i * line_step}:"
            f"box=1:boxcolor=black@0.55:boxborderw=14:"
            f"borderw=3:bordercolor=black@0.7:"
            f"alpha='if(lt(t,0.6),t/0.6,1)'"
        )
    return parts


def build_outro_filter(text: str, W: int, H: int, duration: float, show: float = 3.0):
    """片尾语：最后 show 秒画面中央纯大字淡入（★ 无 box —— box+alpha 老版 ffmpeg 出彩条伪影）。"""
    start = max(duration - show, 0.0)
    fade = min(0.6, show / 2)
    font_px = max(24, int(H * 0.055))
    a = (
        f"if(lt(t,{start:.2f}),0,"
        f"if(lt(t,{start + fade:.2f}),(t-{start:.2f})/{fade:.2f},1))"
    )
    t = esc_drawtext_pct(text)
    return (
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{t}':"
        f"fontcolor=white:fontsize={font_px}:x=(w-text_w)/2:y=h*0.5:"
        f"borderw=3:bordercolor=black@0.8:shadowx=2:shadowy=2:shadowcolor=black@0.6:"
        f"alpha='{a}':enable='gte(t,{start:.2f})'"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="演示脚本 JSON")
    ap.add_argument("--raw", required=True, help="screen_record 原始录像 mp4")
    ap.add_argument("--out", default="", help="成片路径（缺省与 raw 同目录 demo_<名>.mp4）")
    ap.add_argument("--bgm", default="", help="可选背景音乐（音量 0.12 混入）")
    args = ap.parse_args()

    with open(args.input, "r", encoding="utf-8-sig") as f:  # utf-8-sig：容忍 BOM（手工编辑的脚本常带）
        script = json.load(f)
    title = str(script.get("title") or "言智演示").strip() or "言智演示"
    banner = str(script.get("banner") or "").strip() or title
    outro = str(script.get("outro") or "").strip()
    steps = script.get("steps") or []

    if not os.path.exists(args.raw):
        raise SystemExit(f"raw video not found: {args.raw}")

    ffmpeg = find_ffmpeg()
    ffprobe = find_ffprobe(ffmpeg)
    W, H, total = probe_video(ffprobe, args.raw)

    out = args.out or os.path.join(
        os.path.dirname(os.path.abspath(args.raw)),
        "demo_" + re.sub(r'[\\/:*?"<>|]', "_", title) + ".mp4")

    # 字幕 ASS（放临时文件，与成片同目录 .work/）
    work = os.path.join(os.path.dirname(os.path.abspath(out)), ".work")
    os.makedirs(work, exist_ok=True)
    ass = os.path.join(work, "demo_captions.ass")
    cues = build_ass_cues(steps, total)
    build_ass(W, H, cues, ass)

    # 滤镜链：标题条 → 字幕 → 片尾
    title_size = max(18, int(H * 0.045))
    vf_parts = build_title_lines(banner, W, title_size)
    srt_abs = os.path.abspath(ass).replace("\\", "/").replace(":", "\\:")
    vf_parts.append(f"subtitles='{srt_abs}':fontsdir='{FONTS_DIR.replace(chr(92), '/').replace(':', chr(92) + ':')}'")
    if outro:
        vf_parts.append(build_outro_filter(outro, W, H, total))
    vf = ",".join(vf_parts)

    cmd = [ffmpeg, "-y", "-v", "error", "-i", args.raw]
    if args.bgm and os.path.exists(args.bgm):
        cmd += ["-stream_loop", "-1", "-i", args.bgm]
        cmd += ["-filter_complex",
                f"[0:a]anull[nar];[1:a]volume=0.12[bg];[nar][bg]amix=inputs=2:duration=first[a]",
                "-map", "0:v", "-map", "[a]"]
    cmd += ["-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out]
    r = run_quiet(cmd)
    if r.returncode != 0:
        print(r.stderr[-3000:], file=sys.stderr)
        sys.exit(r.returncode)
    print(f"[demo] {out} ({total:.1f}s, {len(cues)} cues)")


if __name__ == "__main__":
    main()
