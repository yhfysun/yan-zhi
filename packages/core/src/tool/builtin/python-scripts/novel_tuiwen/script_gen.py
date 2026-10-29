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


# ── 长句补逗号（2026-10-28）──────────────────────────────────────────────
# 动因：AI 写的长定语从句常常一整句没有任何标点，导致
#   ① 字幕只能整块折行 + 缩字号（用户实报「断句不能按宽度来」）；
#   ② TTS 一口气念完，没有换气位置，听感生硬。
# 在**自然位置补逗号**，字幕与配音同时受益。只在明显过长、且该从句还没有标点时动手。
CONJ_WORDS = ("但是", "可是", "不过", "所以", "因为", "如果", "其实", "然后", "而且", "只是",
              "于是", "结果", "这时候", "突然", "本来", "当时", "后来", "最后", "其中",
              "另外", "比如", "也就是", "换句话说", "不然", "反而", "竟然", "居然", "终于")
PARTICLES = "了着过"
# 断在**这些短语之后**最自然：「他推开门的时候，」「他发现，」
SOFT_TAIL = ("的时候", "之后", "之前", "以后", "以前", "的话", "发现", "觉得", "知道",
             "看到", "听到", "想到", "明白", "意识到", "感觉", "记得", "以为")
_SENT_END = "。！？!?…"
_CLAUSE_PUNC = "，,；;：:、"


def _char_len(s: str) -> float:
    """朗读长度近似：汉字 1，英文/数字/符号 0.5。"""
    return sum(0.5 if ord(c) < 128 else 1.0 for c in s)


def _split_clauses(s: str):
    out, cur = [], ""
    for ch in s:
        cur += ch
        if ch in _CLAUSE_PUNC or ch in _SENT_END:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


def _pick_cut(body: str, min_clause: float, max_clause: float) -> int:
    """在 [min_clause, max_clause] 窗口内找**明确的**自然断点；找不到返回 0（宁可不补）。

    ★ 不做「按位置兜底切」：那会切出「空，无一人」「大白，话」这种断词，
      比不补逗号更糟。只在认识的语言边界上动手：
        ① 连词前（但是/所以/如果/其实…）
        ② 短语后（的时候/之后/发现/觉得/知道/看到…）
    """
    best = 0
    for i in range(1, len(body)):
        w = _char_len(body[:i])
        if w < min_clause:
            continue
        if w > max_clause:
            break
        if any(body.startswith(c, i) for c in CONJ_WORDS):
            best = i          # 取窗口内最靠后的连词
    if best:
        return best

    for i in range(1, len(body)):
        w = _char_len(body[:i + 1])
        if w < min_clause:
            continue
        if w > max_clause:
            break
        if any(body[:i + 1].endswith(c) for c in SOFT_TAIL):
            best = i + 1
    return best


def punctuate_long(text: str, max_clause: float = 15.0, min_clause: float = 6.0) -> str:
    """给过长的从句补逗号；已有标点的部分原样保留。"""
    if not text:
        return text
    out = []
    for clause in _split_clauses(text):
        body = clause.rstrip(_CLAUSE_PUNC + _SENT_END)
        tail = clause[len(body):]
        while _char_len(body) > max_clause:
            cut = _pick_cut(body, min_clause, max_clause)
            if cut <= 0:
                break
            out.append(body[:cut] + "，")
            body = body[cut:]
        out.append(body + tail)
    return "".join(out)


def normalize_pauses(script: dict) -> dict:
    """对脚本里所有要念/要显示的长句补逗号（hook / segments / ending）。"""
    fixed = 0
    for key in ("hook", "ending"):
        src = script.get(key) or ""
        dst = punctuate_long(src)
        if dst != src:
            script[key] = dst
            fixed += 1
    for seg in script.get("segments") or []:
        src = seg.get("text") or ""
        dst = punctuate_long(src)
        if dst != src:
            seg["text"] = dst
            fixed += 1
    return script, fixed


def rule_based_script(text: str, title: str = "小说推文", ending: str = "") -> dict:
    sents = split_sentences(text)
    # ★ 钩子取正文第一句，正文从第二句起切段（2026-10-07 修复：此前 hook=segs[0][:40]
    #   与 segments[0] 同源，tts_gen 把 hook+segments 拼起来配音 → 开头 40 字念两遍）
    hook = sents[0] if sents else HOOK_TEMPLATES[0]
    if len(hook) > 40:
        hook = hook[:40]
    segs = merge_to_segments(sents[1:])
    ending = ending or "欲知后事如何，点击链接接着看。"
    segments = []
    for i, s in enumerate(segs):
        scene = SCENE_TEMPLATES[i % len(SCENE_TEMPLATES)].format(subject="主角")
        segments.append({"text": s, "scene": scene, "duration": None})
    return {"title": title, "hook": hook, "segments": segments, "ending": ending}


def verbatim_script(text: str, title: str = "口播视频", ending: str = "") -> dict:
    """通用口播模式（2026-10-24）：原稿逐段成片，不改写、不重复钩子、不加小说默认结尾。

    段落划分：空行优先；整篇没有空行时按句子合并到 MAX_SEG_CHARS。
    hook 恒为空 —— tts_gen 会把 hook 和 segments 一起念，留空才不会首段念两遍。"""
    raw = text.replace("\r\n", "\n").split("\n")
    paras, buf = [], ""
    for ln in raw:
        ln = ln.strip()
        if not ln:
            if buf:
                paras.append(buf)
                buf = ""
            continue
        buf += ln
    if buf:
        paras.append(buf)
    if len(paras) <= 1:
        paras = merge_to_segments(split_sentences(text))
    segments = [{"text": p, "scene": "", "duration": None} for p in paras if p.strip()]
    return {"title": title, "hook": "", "segments": segments, "ending": ending}


def llm_script(text: str, endpoint: str, api_key: str, model: str) -> dict:
    """OpenAI 兼容端点做钩子化改编(可选)。"""
    import urllib.request
    prompt = (
        "你是小说推文编导。把下面的小说片段改编成口播脚本,输出严格 JSON:\n"
        '{"title":"短标题","hook":"前3秒钩子(15字内,必须是独立创作的新文案,禁止与任何 segment 文本重复)",'
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
    ap.add_argument("--ending", default="", help="结尾引导文案（发抖音传：搜索别名XX看后续）")
    ap.add_argument("--verbatim", action="store_true",
                    help="通用口播模式：按原稿逐段成片（不改写/不加钩子/不加默认结尾）")
    a = ap.parse_args()
    text = open(a.input, encoding="utf-8").read()
    if a.verbatim:
        script = verbatim_script(text, a.title, a.ending)
        print("[script_gen] verbatim mode（原稿逐段）", file=sys.stderr)
    elif a.use_llm and a.endpoint and a.api_key:
        script = llm_script(text, a.endpoint, a.api_key, a.model)
    else:
        script = rule_based_script(text, a.title, a.ending)
        print("[script_gen] rule-based mode (未配置 LLM)", file=sys.stderr)
    script, fixed = normalize_pauses(script)
    if fixed:
        print(f"[script_gen] 长句补逗号：{fixed} 处（字幕断句 + TTS 换气同步受益）",
              file=sys.stderr)
    with open(a.output, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)
    print(f"[script_gen] {len(script['segments'])} segments -> {a.output}")


if __name__ == "__main__":
    main()
