# -*- coding: utf-8 -*-
"""
novel-tuiwen TTS 配音生成器 (Edge-TTS, 免费)
用法: python tts_gen.py --script script.json --outdir audio/ [--voice zh-CN-YunxiNeural]
逐段合成 mp3, 并用 ffprobe 读取真实时长写回 script.json 的 segments[].duration (秒)。
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys

DEFAULT_VOICE = "zh-CN-YunxiNeural"  # 年轻男声, 推文常用; 备选 zh-CN-XiaoyiNeural


def find_ffprobe():
    for p in (os.environ.get("FFPROBE"), r"C:\APP\EVCapture\ffprobe.exe"):
        if p and os.path.exists(p):
            return p
    # 与 ffmpeg 同目录
    ff = os.environ.get("FFMPEG")
    if ff:
        cand = os.path.join(os.path.dirname(ff), "ffprobe.exe")
        if os.path.exists(cand):
            return cand
    return None


def audio_duration(path: str) -> float:
    fp = find_ffprobe()
    if not fp:
        return 0.0
    out = subprocess.run([fp, "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", path],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


async def synth(text: str, out_path: str, voice: str):
    import edge_tts
    tts = edge_tts.Communicate(text, voice)
    await tts.save(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    script = json.load(open(a.script, encoding="utf-8"))

    lines = [script.get("hook", "")] + [s["text"] for s in script["segments"]] + [script.get("ending", "")]
    paths = []
    for i, text in enumerate(lines):
        if not text.strip():
            continue
        p = os.path.join(a.outdir, f"seg_{i:03d}.mp3")
        asyncio.run(synth(text, p, a.voice))
        d = audio_duration(p)
        print(f"[tts] seg_{i:03d} {d:.2f}s  {text[:18]}...")
        paths.append((i, p, d))

    # 写回时长: hook=segments[-1].hook前, 逐段对应
    idx = 0
    order = ["hook"] + [None] * len(script["segments"]) + ["ending"]
    seg_iter = iter(script["segments"])
    for i, p, d in paths:
        pos = order[i]
        if pos == "hook":
            script["hook_audio"] = p
        elif pos == "ending":
            script["ending_audio"] = p
        else:
            seg = next(seg_iter)
            seg["audio"] = p
            seg["duration"] = round(d, 2)

    with open(a.script, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)
    total = sum(d for _, _, d in paths)
    print(f"[tts] total {total:.1f}s, files in {a.outdir}", file=sys.stderr)


if __name__ == "__main__":
    main()
