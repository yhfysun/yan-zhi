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

import re

# ============ 朗读规范化（2026-10-07）============
# Edge-TTS 按字面读符号串会灾难：23：59：57 读成"二三五九五七"式怪音、
# 进度 1|4 只会念"杠"、HP/buff 这类游戏术语直接念字母。字幕显示原文，
# 只在【送 TTS 前】规范化，两边互不干扰。

# 游戏术语 → 中文读法（小写匹配，按词边界替换）
GAME_TERMS = {
    "hp": "生命值",
    "mp": "魔法值",
    "exp": "经验值",
    "lv": "等级",
    "cd": "冷却",
    "buff": "增益状态",
    "debuff": "负面状态",
    "boss": "首领",
    "kpi": "指标",
    "aka": "又被称为",
}

_CN_NUM = "零一二三四五六七八九"


def _cn_num(n: int) -> str:
    """1-99 的口语数字（23 → 二十三）；0 → 零"""
    if n == 0:
        return "零"
    if n < 10:
        return _CN_NUM[n]
    tens, ones = divmod(n, 10)
    out = ("十" if tens == 1 else _CN_NUM[tens] + "十")
    return out + (_CN_NUM[ones] if ones else "")


def _time_to_cn(m: "re.Match") -> str:
    """HH:MM[:SS] → X点X分[X秒]（口语，0 读零）"""
    parts = m.group(0).replace("：", ":").split(":")
    try:
        vals = [int(p) for p in parts]
    except ValueError:
        return m.group(0)
    if len(vals) == 3:
        h, mi, s = vals
        return f"{_cn_num(h)}点{_cn_num(mi)}分{_cn_num(s)}秒"
    if len(vals) == 2:
        h, mi = vals
        return f"{_cn_num(h)}点{_cn_num(mi)}分"
    return m.group(0)


def _frac_to_cn(m: "re.Match") -> str:
    """a/b | a\\b | a｜b（进度型分数，a<=b）→ b分之a；1/4 → 四分之一"""
    a, b = int(m.group(1)), int(m.group(2))
    if 0 < a <= b <= 99:
        return f"{_cn_num(b)}分之{_cn_num(a)}"
    return m.group(0)


def normalize_for_tts(text: str) -> str:
    # 1) 时间（先于分数，避免 23:59 被当分数）
    text = re.sub(r"\d{1,2}[：:]\d{1,2}(?:[：:]\d{1,2})?", _time_to_cn, text)
    # 2) 进度/分数（半角斜杠、反斜杠、全半角竖线；容忍 markdown 转义如 1\|4 的双分隔符）
    text = re.sub(r"(\d{1,3})\s*[\/\\|｜]{1,2}\s*(\d{1,3})", _frac_to_cn, text)
    # 3) 游戏术语（词边界，大小写不敏感）
    for k, v in GAME_TERMS.items():
        text = re.sub(rf"(?<![A-Za-z]){k}(?![A-Za-z])", v, text, flags=re.IGNORECASE)
    return text


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


def synth_with_retry(text: str, out_path: str, voice: str, retries: int = 3):
    """逐段重试：edge-tts 到微软的连接偶发 NoAudioReceived/超时（实测一段成功后
    下一段可能连断数次），整段管线失败重来代价太高（前面 20+ 段全部白合成）。
    单段 3 次重试 + 递增间隔，基本能把抖动吸收掉。"""
    import time as _time
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            asyncio.run(synth(text, out_path, voice))
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                return
            raise RuntimeError("输出文件为空")
        except Exception as e:
            last_err = e
            print(f"[tts] seg 失败(第{attempt}次): {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
            _time.sleep(attempt * 2)
    raise RuntimeError(f"edge-tts 连续 {retries} 次失败: {last_err}")


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
        # 已存在的分段跳过（重跑时不必重新合成，网络抖动恢复后续跑即可）
        if not (os.path.exists(p) and os.path.getsize(p) > 0):
            synth_with_retry(normalize_for_tts(text), p, a.voice)
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
