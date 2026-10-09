# -*- coding: utf-8 -*-
"""
novel-tuiwen 视频合成器 v2 (ffmpeg, 4:3 1080x1440)
两种画面模式:
  A. 背景视频模式(推荐): --bg-video 修驴蹄/骑单车等解压视频, 循环铺满全片
  B. 分镜图模式(默认兜底): 无图时生成深色文字占位帧, 后续接 ComfyUI
统一: 小说标题(顶部) + 逐段字幕(libass烧录) + TTS配音拼接
用法:
  python compose_video.py --script script.json --outdir output/ \
      --bg-video bg1.mp4,bg2.mp4 [--title-size 64] [--bgm bgm.mp3]
"""
import argparse
import json
import os
import subprocess
import sys

# 画幅由 --aspect 决定（2026-10-07）：4:3=1080x1440(默认) / 9:16=1080x1920(抖音竖屏) / 16:9=1920x1080(横屏)
ASPECT_SIZES = {"4:3": (1080, 1440), "9:16": (1080, 1920), "16:9": (1920, 1080)}
W, H = ASPECT_SIZES["4:3"]
FPS = 25
FONTS_DIR = r"C:\Windows\Fonts"


def find_ffmpeg():
    for p in (os.environ.get("FFMPEG"), r"C:\APP\EVCapture\ffmpeg.exe"):
        if p and os.path.exists(p):
            return p
    raise SystemExit("ffmpeg not found (set FFMPEG env)")


def probe_duration(ffmpeg, path):
    fp = os.path.join(os.path.dirname(ffmpeg), "ffprobe.exe")
    out = subprocess.run([fp, "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", path],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 5.0


def disp_w(ch: str) -> float:
    """显示宽度：CJK/全角=1，半角（英文/数字/标点）=0.55。"""
    return 1.0 if ord(ch) > 0x2E80 else 0.55


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


def fmt_srt_ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(cues, out_path, wrap_chars=20):
    """长句按 ≤2 行 x wrap_chars 显示宽度切块, 时间按显示宽度比例分摊。
    wrap_chars 由画幅+字幕字号动态算出（见 main），防止字幕行超出画面宽度。"""
    idx = 0
    with open(out_path, "w", encoding="utf-8-sig") as f:
        for start, end, text in cues:
            chunks = wrap_text(text, wrap_chars * 2).split("\n") or [text]
            dur = end - start
            weights = [sum(disp_w(c) for c in ch) for ch in chunks]
            total_w = sum(weights) or 1.0
            t = start
            for c, n in zip(chunks, weights):
                d = dur * n / total_w
                idx += 1
                f.write(f"{idx}\n{fmt_srt_ts(t)} --> {fmt_srt_ts(t + d)}\n{wrap_text(c, wrap_chars)}\n\n")
                t += d


def make_placeholder(scene: str, out_png: str, ffmpeg: str):
    body = esc_drawtext(wrap_text(scene or ""))
    vf = (
        f"drawbox=x=80:y=80:w={W-160}:h={H-160}:color=0x16213e:t=fill,"
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{body}':"
        f"fontcolor=0xe0e0e0:fontsize=40:x=(w-text_w)/2:y=h/2-text_h/2:line_spacing=24"
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--bg-video", default="", help="逗号分隔背景视频, 按顺序循环使用")
    ap.add_argument("--title-size", type=int, default=64)
    ap.add_argument("--bgm", default="")
    ap.add_argument("--aspect", default="4:3", choices=list(ASPECT_SIZES.keys()), help="画幅: 4:3(默认) / 9:16(抖音竖屏) / 16:9(横屏)")
    ap.add_argument("--banner", default="", help="顶部常驻引导语（发抖音传：搜「别名」看全文）。优先于 script.banner 与 script.title；书名红线：画面顶部禁原书名")
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

    # ★ 字幕换行宽度动态算（2026-10-09 修"字幕超出画面"）：libass 对 SRT 默认 PlayResY=288，
    #   FontSize=14 渲染像素 ≈ 14 * H/288（4:3≈70px/字、9:16≈93px/字、16:9≈52px/字），
    #   原来写死 20 字/行在 4:3/9:16 下必然超宽。每行字数 = 画面宽度*0.90 / 单字像素。
    _font_px = 14.0 * H / 288.0
    wrap_chars = max(8, int(W * 0.90 / _font_px))
    srt = os.path.join(tmp, "subs.srt")
    build_srt(cues, srt, wrap_chars)

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
    top_text = a.banner or script.get("banner") or script.get("title", "小说推文")
    max_chars = max(6, int(W * 0.90 / a.title_size))
    title_lines = wrap_title(top_text, max_chars)
    _line_step = a.title_size + 12
    _parts = []
    for _i, _ln in enumerate(title_lines):
        if not _ln:
            continue
        _t = esc_drawtext(_ln)
        _parts.append(
            f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{_t}':"
            f"fontcolor=white:fontsize={a.title_size}:x=(w-text_w)/2:y={80 + _i * _line_step}:"
            f"borderw=3:bordercolor=black@0.7:"
            f"alpha='if(lt(t,0.6),t/0.6,1)'"
        )
    title_vf = ",".join(_parts) if _parts else (
        f"drawtext=fontfile='C\\:/Windows/Fonts/msyh.ttc':text='{esc_drawtext(top_text)}':"
        f"fontcolor=white:fontsize={a.title_size}:x=(w-text_w)/2:y=80:"
        f"borderw=3:bordercolor=black@0.7"
    )
    srt_abs = os.path.abspath(srt).replace("\\", "/").replace(":", "\\:")
    fontsdir_esc = FONTS_DIR.replace("\\", "/").replace(":", "\\:")
    sub_vf = (f"subtitles='{srt_abs}':fontsdir='{fontsdir_esc}':"
              f"force_style='FontName=Microsoft YaHei,FontSize=14,Outline=2,MarginV=60,Alignment=2'")
    final_vf = f"{sub_vf},{title_vf}"

    out_name = f"{script.get('title', 'novel')}_{os.path.splitext(os.path.basename(a.script))[0]}.mp4"
    final = os.path.join(a.outdir, out_name)

    bg_clips = [p.strip() for p in a.bg_video.split(",") if p.strip()] if a.bg_video else []
    if bg_clips:
        # ★★★ 背景循环修复（2026-10-09）：老版 ffmpeg（EVCapture 2016 构建）上 -stream_loop -1 + concat
        #   滤镜组合失效——每段只播一次、不循环，输出被截断（成片 108s vs 旁白 448s）。
        #   改为三步，全部只用本脚本已验证可用的老版能力：
        #   1) 每段背景单独归一化（cover 裁剪 + fps，有限时长，各自编码一次，内存安全）；
        #   2) concat demuxer 列表按段序循环重复到 ≥ total+1s，-c copy 拼成单文件
        #      （归一化后各段编码参数一致，copy 拼接安全；纯文件名 + cwd=tmp，同下方占位图分支写法）；
        #   3) 单输入 + 字幕/标题 + 旁白一次合成，-t total 精确收口。
        norm_files = []
        for i, p in enumerate(bg_clips):
            out = os.path.join(tmp, f"bg_{i:02d}.mp4")
            subprocess.run([ffmpeg, "-y", "-v", "error", "-i", p,
                            "-vf", (f"scale={W}:{H}:force_original_aspect_ratio=increase,"
                                    f"crop={W}:{H},fps={FPS},setsar=1"),
                            "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                            "-pix_fmt", "yuv420p", out], check=True)
            norm_files.append(out)
        durs = [max(probe_duration(ffmpeg, p), 0.1) for p in norm_files]
        lst = os.path.join(tmp, "bglist.txt")
        with open(lst, "w", encoding="utf-8") as f:
            i, acc = 0, 0.0
            while acc < total + 1.0:
                f.write(f"file '{os.path.basename(norm_files[i % len(norm_files)])}'\n")
                acc += durs[i % len(norm_files)]
                i += 1
        bg_loop = os.path.join(tmp, "bg_loop.mp4")
        subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "concat", "-safe", "0",
                        "-i", "bglist.txt", "-c", "copy", os.path.abspath(bg_loop)],
                       check=True, cwd=tmp)
        subprocess.run([ffmpeg, "-y", "-v", "error", "-i", bg_loop, "-i", audio_out,
                        "-vf", final_vf, "-map", "0:v", "-map", "1:a",
                        "-t", f"{total:.2f}",
                        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", final],
                       check=True)
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
                        "-vf", final_vf, "-t", f"{total:.2f}",
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
