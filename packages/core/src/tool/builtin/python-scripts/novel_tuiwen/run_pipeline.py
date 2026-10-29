# -*- coding: utf-8 -*-
"""
小说推文 一键出片管线: 改编 -> TTS -> 合成
用法: python run_pipeline.py --input sample/chapter.txt [--use-llm] [--bgm bgm.mp3]
环境要求: python(venv含edge-tts) + ffmpeg(EVCapture自带, 可用 FFMPEG/FFPROBE 环境变量覆盖)
"""
import argparse
import os
import subprocess
import sys

# ★ 子进程静默（2026-10-09）：ffmpeg/ffprobe/python 子进程在"无控制台的父进程"下会弹黑框。
#   本模块给 subprocess.Popen 打默认 CREATE_NO_WINDOW 补丁 → 本文件后续所有子进程自动静默。
import _winquiet  # noqa: E402
_winquiet.apply_popen_defaults()

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

# 默认 ffmpeg 位置(可被环境变量覆盖)；★ 2026-10-09 补多候选：原只写 C:\APP\EVCapture（本机不存在）
def _first_existing(*cands):
    import shutil
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None

_FF_CANDS = [r"C:\Program Files\EVCapture\ffmpeg.exe", r"C:\APP\EVCapture\ffmpeg.exe"]
_FP_CANDS = [r"C:\Program Files\EVCapture\ffprobe.exe", r"C:\APP\EVCapture\ffprobe.exe"]
if not os.environ.get("FFMPEG"):
    _ff = _first_existing(*_FF_CANDS) or (__import__("shutil").which("ffmpeg"))
    if _ff:
        os.environ["FFMPEG"] = _ff
if not os.environ.get("FFPROBE"):
    _fp = _first_existing(*_FP_CANDS) or (__import__("shutil").which("ffprobe"))
    if _fp:
        os.environ["FFPROBE"] = _fp


def run(cmd):
    print("+", " ".join(cmd), file=sys.stderr)
    # ★ 2026-10-09：子进程输出必须**显式透传**并能被上层采集。
    #   pythonw / 无控制台父进程下 sys.stdout 可能为 None，此时传 None 会抛错 → 用条件透传。
    #   用户侧曾出现"pipeline.log 为空"，排障时被误判成"卡住不动"——日志拿不到是排障力的损失。
    kw = {}
    if sys.stdout is not None:
        kw['stdout'] = sys.stdout
    if sys.stderr is not None:
        kw['stderr'] = sys.stderr
    r = subprocess.run(cmd, **kw)
    if r.returncode != 0:
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="小说章节 txt")
    ap.add_argument("--workdir", default=None, help="中间产物目录, 默认 <outdir>/<章节名>_work")
    ap.add_argument("--outdir", default=os.path.join(HERE, "..", "output"), help="成片输出目录")
    ap.add_argument("--title", default="小说推文")
    ap.add_argument("--voice", default="zh-CN-YunjianNeural",
                    help="配音音色（默认云健；备选 zh-CN-YunxiNeural / zh-CN-YunxiaNeural / zh-CN-XiaoyiNeural）")
    ap.add_argument("--bgm", default="auto", help="背景音乐：auto（素材优先+自动合成兜底）/ none / 音频文件")
    ap.add_argument("--ambience", default="auto", help="环境音: auto/none/pad_soft/room/wind/rain/hum/space/fire")
    ap.add_argument("--ambience-level", type=float, default=0.12, help="环境音音量（旁白会把它闪避压下去）")
    ap.add_argument("--sfx", default="auto", help="高能点缀音效: auto / none")
    ap.add_argument("--sfx-level", type=float, default=0.5, help="点缀音效音量")
    ap.add_argument("--bg-video", default="", help="背景视频(修驴蹄/骑单车等), 逗号分隔多段")
    ap.add_argument("--images", default="", help="视觉素材图片, 逗号分隔(按顺序), 图片轮播: 每张覆盖若干句，边界来自真实配音时长")
    ap.add_argument("--storyboard", default="",
                    help="分镜 JSON 路径：走动态排版引擎（元素入场 + 转场 + 打字机字幕），"
                         "画面不再是一张张硬切")
    ap.add_argument("--visual", default="auto", choices=["auto", "kinetic", "images", "bg_video"],
                    help="画面模式：auto（有分镜/无素材→kinetic）/ kinetic / images / bg_video")
    ap.add_argument("--bgm-level", type=float, default=0.20, help="背景音乐音量（0~1，默认 0.20）")
    ap.add_argument("--bg-images", default="",
                    help="动态排版的素材底图：逗号分隔图片路径，或 auto（扫描 00-source/images 等）")
    ap.add_argument("--subtitle-style", default="typewriter", choices=["typewriter", "ticker"],
                    help="字幕样式：typewriter=逐句打字机（默认）/ ticker=整句从右往左平移")
    ap.add_argument("--rate", default=os.environ.get("YZ_TTS_RATE", "+15%"),
                    help="配音语速: +15%%(默认) / 0 / 1.15 / 15 均可；YZ_TTS_RATE 可覆盖默认")
    ap.add_argument("--aspect", default="4:3", help="画幅: 4:3(默认) / 9:16(抖音竖屏) / 16:9(横屏)")
    ap.add_argument("--ending", default="", help="结尾引导文案（发抖音传：搜索别名XX看后续）")
    ap.add_argument("--banner", default="", help="顶部常驻引导语（覆盖自动生成的标题条）")
    ap.add_argument("--alias", default="", help="别名（顶部常驻「搜『别名』看全文｜番茄小说」+ 发布文案标题）")
    ap.add_argument("--chapter", default="", help="第几集（如 3；首帧大字+全程角标 + 文件名第N集 + 发布文案 + 封面图）")
    ap.add_argument("--tags", default="", help="发布内容自定义话题标签，缺省 '#小说 #推文 <别名>'")
    ap.add_argument("--no-publish-copy", action="store_true", help="跳过生成 publish.txt 发布文案")
    ap.add_argument("--use-llm", action="store_true")
    ap.add_argument("--verbatim", action="store_true",
                    help="通用口播模式：原稿逐段成片（不改写/不加钩子/不加默认结尾）")
    ap.add_argument("--out-name", default="", help="成片文件名（不含路径）")
    a = ap.parse_args()

    # 章节号：显式传 > 从文件名推断（ch03/chapter03/03.txt -> 3）
    chapter = a.chapter
    if not chapter:
        import re as _re
        m = _re.search(r"(?:ch|chapter)?0*(\d+)", os.path.basename(a.input), _re.IGNORECASE)
        if m:
            chapter = m.group(1)
    base = os.path.splitext(os.path.basename(a.input))[0]
    workdir = a.workdir or os.path.join(a.outdir, f"{base}_work")
    os.makedirs(workdir, exist_ok=True)
    script_json = os.path.join(workdir, "script.json")
    audio_dir = os.path.join(workdir, "audio")
    out_dir = a.outdir
    os.makedirs(out_dir, exist_ok=True)

    # 1) 改编
    run([PY, os.path.join(HERE, "script_gen.py"),
         "--input", a.input, "--output", script_json, "--title", a.title]
        + (["--ending", a.ending] if a.ending else [])
        + (["--verbatim"] if a.verbatim else [])
        + (["--use-llm"] if a.use_llm else []))
    # 2) TTS
    run([PY, os.path.join(HERE, "tts_gen.py"),
         "--script", script_json, "--outdir", audio_dir, "--voice", a.voice]
        + (["--rate", a.rate] if a.rate else []))
    # 3) 合成
    run([PY, os.path.join(HERE, "compose_video.py"),
         "--script", script_json, "--outdir", out_dir]
        + (["--bg-video", a.bg_video] if a.bg_video else [])
        + (["--images", a.images] if a.images else [])
        + (["--storyboard", a.storyboard] if a.storyboard else [])
        + ["--visual", a.visual, "--bgm-level", str(a.bgm_level),
           "--subtitle-style", a.subtitle_style]
        + (["--bg-images", a.bg_images] if a.bg_images else [])
        + (["--bgm", a.bgm] if a.bgm else [])
        + ["--ambience", a.ambience, "--ambience-level", str(a.ambience_level)]
        + ["--sfx", a.sfx, "--sfx-level", str(a.sfx_level)]
        + ["--aspect", a.aspect] + (["--banner", a.banner] if a.banner else [])
        + (["--alias", a.alias] if a.alias else [])
        + (["--out-name", a.out_name] if a.out_name else [])
        + (["--chapter", chapter] if chapter else []))
    # 4) 发布文案（表单标题+内容模板）→ <workdir>/publish.txt
    #    ★ verbatim 通用口播不生成：该模板是小说推文专用（搜别名看全文），套到口播上只会产出「第集」这类空壳。
    if not a.no_publish_copy and not a.verbatim:
        run([PY, os.path.join(HERE, "publish_copy.py"),
             "--script", script_json, "--outdir", workdir, "--stdout"]
            + (["--alias", a.alias] if a.alias else [])
            + (["--chapter", chapter] if chapter else [])
            + (["--tags", a.tags] if a.tags else []))


if __name__ == "__main__":
    main()
