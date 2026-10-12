# -*- coding: utf-8 -*-
"""
novel-tuiwen 发布文案生成器（表单模板 · 2026-10-12）
生成抖音/番茄等平台发布表单所需的「标题」与「内容」，落盘 <workdir>/publish.txt。

## 表单模板（单一真相源，改这里就行）

【标题】≤30 字，一行：
    {别名} 第{N}集 | {钩子摘要}

    - 钩子摘要 = script.json 的 hook 截前 18 字（标题总长自动钳到 30 字内，
      平台超限会被静默截断，不如自己截得体面）
    - 不带书名（书名红线：画面与文案均禁原书名，只推别名）

【内容】按固定五段结构，占位符全部由管线数据填充：
    {别名} 第{N}集 {标签}
    {hook}
    {正文预告：正文第一段截 60 字}…
    后续更精彩，点击左下角继续看👉
    #小说 #推文 {别名}

用法:
  python publish_copy.py --script script.json [--alias 狐王痴狂] [--chapter 1]
      [--outdir .]            # publish.txt 落盘目录
      [--stdout]              # 同时打印到终端
"""
import argparse
import json
import os
import re
import sys

TITLE_MAX = 30          # 抖音标题硬上限 55，留余量钳 30（@提及/话题不计入也占视觉位）
HOOK_IN_TITLE = 18      # 标题里钩子摘要的最大字数
TEASER_CHARS = 60       # 内容里正文预告的截断长度
DEFAULT_TAGS = "#小说 #推文"


def _clip(s: str, n: int) -> str:
    """按字符截断（中文场景字符≈字），去首尾空白。"""
    s = re.sub(r"\s+", " ", (s or "").strip())
    return s[:n] if len(s) > n else s


def build_title(script: dict, alias: str, chapter: str) -> str:
    """标题模板：{别名} 第{N}集 | {钩子摘要}"""
    alias = (alias or script.get("alias") or "").strip()
    hook = _clip(script.get("hook", ""), HOOK_IN_TITLE)
    left = f"{alias} 第{chapter}集".strip()
    if not left:
        left = _clip(script.get("title", "小说推文"), 10)
    title = f"{left}｜{hook}" if hook else left
    return _clip(title, TITLE_MAX)


def build_body(script: dict, alias: str, chapter: str, tags: str = "") -> str:
    """内容模板（五段固定结构）。"""
    alias = (alias or script.get("alias") or "").strip()
    hook = (script.get("hook", "") or "").strip()
    seg0 = (script.get("segments") or [{}])[0].get("text", "") if script.get("segments") else ""
    teaser = _clip(seg0, TEASER_CHARS)
    tagline = (tags or f"{DEFAULT_TAGS} {alias}").strip()
    ep = f" {alias} 第{chapter}集".strip()
    lines = [
        ep,
        hook,
        (teaser + "…") if teaser else "",
        "后续更精彩，点击左下角继续看👉",
        tagline,
    ]
    return "\n".join([ln for ln in lines if ln])


def build(script: dict, alias: str, chapter: str, tags: str = "") -> dict:
    return {
        "title": build_title(script, alias, chapter),
        "body": build_body(script, alias, chapter, tags),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True, help="分镜脚本 script.json")
    ap.add_argument("--alias", default="", help="别名（缺省回落 script.alias / script.title）")
    ap.add_argument("--chapter", default="", help="第几集（如 3）")
    ap.add_argument("--tags", default="", help="自定义话题标签，缺省 '#小说 #推文 <别名>'")
    ap.add_argument("--outdir", default=".", help="publish.txt 落盘目录")
    ap.add_argument("--stdout", action="store_true", help="同时打印到终端")
    a = ap.parse_args()
    script = json.load(open(a.script, encoding="utf-8"))
    if not a.chapter:
        import re as _re
        m = _re.search(r"(?:ch|chapter)?0*(\d+)", os.path.basename(a.script), _re.IGNORECASE)
        if m:
            a.chapter = m.group(1)
    copy = build(script, a.alias, a.chapter, a.tags)
    os.makedirs(a.outdir, exist_ok=True)
    out = os.path.join(a.outdir, "publish.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write("【标题】\n" + copy["title"] + "\n\n【内容】\n" + copy["body"] + "\n")
    if a.stdout:
        print("【标题】\n" + copy["title"] + "\n\n【内容】\n" + copy["body"], file=sys.stderr)
    print(f"[publish_copy] {out}")


if __name__ == "__main__":
    main()
