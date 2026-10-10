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
    r = subprocess.run(cmd)
    if r.returncode != 0:
        sys.exit(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="小说章节 txt")
    ap.add_argument("--workdir", default=None, help="中间产物目录, 默认 <outdir>/<章节名>_work")
    ap.add_argument("--outdir", default=os.path.join(HERE, "..", "output"), help="成片输出目录")
    ap.add_argument("--title", default="小说推文")
    ap.add_argument("--voice", default="zh-CN-YunxiNeural")
    ap.add_argument("--bgm", default="")
    ap.add_argument("--bg-video", default="", help="背景视频(修驴蹄/骑单车等), 逗号分隔多段")
    ap.add_argument("--aspect", default="4:3", help="画幅: 4:3(默认) / 9:16(抖音竖屏) / 16:9(横屏)")
    ap.add_argument("--ending", default="", help="结尾引导文案（发抖音传：搜索别名XX看后续）")
    ap.add_argument("--banner", default="", help="顶部常驻引导语（发抖音传：搜「别名」看全文）")
    ap.add_argument("--use-llm", action="store_true")
    a = ap.parse_args()

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
        + (["--use-llm"] if a.use_llm else []))
    # 2) TTS
    run([PY, os.path.join(HERE, "tts_gen.py"),
         "--script", script_json, "--outdir", audio_dir, "--voice", a.voice])
    # 3) 合成
    run([PY, os.path.join(HERE, "compose_video.py"),
         "--script", script_json, "--outdir", out_dir]
        + (["--bg-video", a.bg_video] if a.bg_video else [])
        + (["--bgm", a.bgm] if a.bgm else [])
        + ["--aspect", a.aspect] + (["--banner", a.banner] if a.banner else []))


if __name__ == "__main__":
    main()
