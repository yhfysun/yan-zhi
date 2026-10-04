# -*- coding: utf-8 -*-
"""
novel-tuiwen 分镜脚本生成器
用法:
  python script_gen.py --input chapter.txt --output script.json [--use-llm]
不开启 --use-llm 时走规则切分(零成本可离线); 开启后走 OpenAI 兼容端点做钩子化改编。
输出 JSON 结构:
{
  "title": str,
  "hook": str,
  "segments": [{"text": str, "scene": str, "duration": float}],
  "ending": str
}
"""
import argparse
import json
import os
import re
import sys

MAX_SEG_CHARS = 120      # 每个分镜口播文案上限
MIN_SEG_CHARS = 20

HOOK_TEMPLATES = [
    "他怎么也没想到，这一步会彻底改变他的命运。",
    "如果时间能倒流，他一定不会打开那扇门。",
    "所有人都以为事情结束了，直到那个电话响起。",
]

SCENE_TEMPLATES = [
    "昏暗的房间里，{subject}独自站立，窗外下着雨，冷色调，电影感构图",
    "深夜的街道，{subject}快步走过路灯下，霓虹倒影，悬疑氛围",
    "{subject}的特写，眼神复杂，逆光剪影，高对比度",
    "老式书桌前的日记本摊开，{subject}的手缓缓合上它，暖黄灯光",
]


def split_sentences(text: str):
    text = re.sub(r"\s+", "", text)
    parts = re.split(r"(?<=[。！？!?…])", text)
    return [p for p in parts if p]


def merge_to_segments(sents, max_chars=MAX_SEG_CHARS):
    segs, buf = [], ""
    for s in sents:
        if buf and len(buf) + len(s) > max_chars:
            segs.append(buf)
            buf = s
        else:
            buf += s
    if buf:
        segs.append(buf)
    return [s for s in segs if len(s) >= MIN_SEG_CHARS] or segs


def rule_based_script(text: str, title: str = "小说推文") -> dict:
    sents = split_sentences(text)
    segs = merge_to_segments(sents)
    hook = segs[0][:40] if segs else HOOK_TEMPLATES[0]
    ending = "欲知后事如何，点击链接接着看。"
    segments = []
    for i, s in enumerate(segs):
        scene = SCENE_TEMPLATES[i % len(SCENE_TEMPLATES)].format(subject="主角")
        segments.append({"text": s, "scene": scene, "duration": None})
    return {"title": title, "hook": hook, "segments": segments, "ending": ending}


def llm_script(text: str, endpoint: str, api_key: str, model: str) -> dict:
    """OpenAI 兼容端点做钩子化改编(可选)。"""
    import urllib.request
    prompt = (
        "你是小说推文编导。把下面的小说片段改编成口播脚本,输出严格 JSON:\n"
        '{"title":"短标题","hook":"前3秒钩子(15字内)",'
        '"segments":[{"text":"口播文案(<=120字)","scene":"AI绘图画面描述(中文,含氛围/色调/构图)"}],'
        '"ending":"悬念结尾引导点击"}\n'
        "总时长控制在60-180秒,每15-20秒一个悬念点。\n\n小说片段:\n" + text[:3000]
    )
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        endpoint.rstrip("/") + "/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return json.loads(data["choices"][0]["message"]["content"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--title", default="小说推文")
    ap.add_argument("--use-llm", action="store_true")
    ap.add_argument("--endpoint", default=os.environ.get("OPENAI_BASE_URL", ""))
    ap.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY", ""))
    ap.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
    a = ap.parse_args()
    text = open(a.input, encoding="utf-8").read()
    if a.use_llm and a.endpoint and a.api_key:
        script = llm_script(text, a.endpoint, a.api_key, a.model)
    else:
        script = rule_based_script(text, a.title)
        print("[script_gen] rule-based mode (未配置 LLM)", file=sys.stderr)
    with open(a.output, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)
    print(f"[script_gen] {len(script['segments'])} segments -> {a.output}")


if __name__ == "__main__":
    main()
