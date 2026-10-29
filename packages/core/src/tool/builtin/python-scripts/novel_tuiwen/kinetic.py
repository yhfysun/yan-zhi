# -*- coding: utf-8 -*-
"""动态排版画面引擎（kinetic）—— compose_video.py 的可选画面轨。

为什么要它：旧画面是「整张图 -loop 1 编码」→ 一张张硬切、没有运动；而图文卡片里
已经写了口播原文，再叠一条同句字幕 = 同一句话看两遍。本引擎逐帧绘制，把画面变成
有节奏的运动：

  · 元素按旁白节奏入场（标题上滑、要点逐条左滑、卡片弹入、代码块淡入）
  · 场景之间 0.3s 交叉淡化（fade through background）
  · 底部字幕逐字打出（打字机），卡片只放关键词，不与字幕重复
  · 素材底图层：本地图片/Ken Burns 推拉 + 暗色蒙版（`bg_images`）
  · 转场：fade / push / wipe / zoom（场景字段 transition）
  · 底部进度条 + 顶部常驻条（别名/期数）+ 右上角集数角标
  · 逐帧 rawvideo 直接喂 ffmpeg：不落中间图片、不做 concat

storyboard 结构（见 normalize_storyboard）：
  {"theme": "dark",
   "scenes": [
     {"type": "hook", "seg": 0, "w": 1,
      "kicker": "AI 干活 · 第03期",
      "title": "明天开会\nPPT 一页没做",
      "highlight": "PPT 一页没做",
      "sub": "领导说：就十分钟，简单讲讲"},
     {"type": "points", "seg": 2, "title": "...", "points": ["① ...", "② ..."]},
     {"type": "code",   "seg": 5, "title": "...", "code": "=SUMIFS(...)", "note": "..."},
     {"type": "table",  "seg": 4, "title": "...", "columns": [...], "rows": [[...]]},
     {"type": "warning","seg": 6, "title": "...", "points": [...]},
     {"type": "cta",    "seg": 7, "title": "...", "button": "..."}
   ]}
  seg = 对应第几段旁白（0 起）。一段旁白可拆成多个场景，时长按 w 比例分。
  全部场景都不写 seg 时，scenes 数量须与旁白段数一致，按顺序 1:1。

场景类型：hook / statement / points / code / table / warning / cta
"""
import bisect
import json
import os
import subprocess
import sys

# 子进程静默（与 compose_video 同一套补丁；单独跑本文件时也不会弹黑框）
try:
    import _winquiet  # noqa: E402
    _winquiet.apply_popen_defaults()
except Exception:
    pass

FPS_DEFAULT = 25
XFADE = 0.30           # 场景交叉淡化时长（秒）
REVEAL_SPAN = 0.45     # 单个元素入场时长（秒）

THEME = {
    "bg_top": (20, 25, 34),
    "bg_bot": (8, 10, 14),
    "grid": (27, 33, 42),
    "fg": (241, 244, 248),
    "grey": (146, 156, 168),
    "dim": (108, 118, 132),
    "accent": (255, 110, 55),
    "accent_d": (196, 74, 34),
    "card": (24, 30, 40),
    "card_border": (44, 54, 68),
    "card_warm": (30, 24, 22),
    "card_warm_border": (88, 56, 40),
    "code_fg": (255, 186, 120),
    "code_bg": (38, 27, 20),
    "code_border": (120, 72, 40),
}

SCENE_TYPES = ("hook", "statement", "points", "code", "table", "warning", "cta",
               "stat", "quote", "compare", "steps")

# 主题：深色（默认，偏资讯/知识）/ 浅色（偏生活方式、情感）
THEMES = {
    "dark": dict(THEME),
    "light": {
        "bg_top": (243, 245, 248),
        "bg_bot": (222, 227, 234),
        "grid": (206, 213, 222),
        "fg": (24, 30, 40),
        "grey": (92, 102, 116),
        "dim": (140, 148, 160),
        "accent": (222, 74, 34),
        "accent_d": (170, 52, 24),
        "card": (255, 255, 255),
        "card_border": (214, 220, 228),
        "card_warm": (255, 246, 242),
        "card_warm_border": (232, 198, 184),
        "code_fg": (150, 72, 20),
        "code_bg": (252, 243, 236),
        "code_border": (226, 196, 176),
    },
}


def apply_theme(name: str) -> dict:
    """切换全局配色（渲染器单进程单实例，直接换模块级 THEME）。"""
    global THEME
    THEME = dict(THEMES.get(name or "dark", THEMES["dark"]))
    return THEME

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"


# ── 字体 ──────────────────────────────────────────────────────────────
_font_cache = {}


def font(size: int, bold: bool = False, mono: bool = False):
    key = (int(size), bool(bold), bool(mono))
    if key in _font_cache:
        return _font_cache[key]
    from PIL import ImageFont
    if mono:
        path = FONT_MONO if os.path.exists(FONT_MONO) else FONT_REG
    else:
        path = FONT_BOLD if bold else FONT_REG
        if not os.path.exists(path):
            path = FONT_REG
    f = ImageFont.truetype(path, max(8, int(size)))
    _font_cache[key] = f
    return f


# ── 文本度量与换行 ────────────────────────────────────────────────────
def wrap_to(text: str, f, max_w: float) -> list:
    """按像素宽度换行；保留显式换行符（\\n 或真实换行）。"""
    out = []
    for para in str(text or "").replace("\\n", "\n").split("\n"):
        cur = ""
        for ch in para:
            if cur and f.getlength(cur + ch) > max_w:
                out.append(cur)
                cur = ch
            else:
                cur += ch
        out.append(cur)
    return out or [""]


def fit_block(text, size, max_w, max_lines, bold=True, min_scale=0.60, mono=False):
    """字号自适应：在 max_lines 行内放下 text。返回 (font, size, lines)。"""
    s = int(size)
    floor = max(12, int(size * min_scale))
    while s > floor:
        f = font(s, bold, mono)
        lines = wrap_to(text, f, max_w)
        if len(lines) <= max_lines:
            return f, s, lines
        s = int(s * 0.94)
    f = font(s, bold, mono)
    return f, s, wrap_to(text, f, max_w)[:max_lines]


_STRONG_PUNC = "。！？!?…"
_WEAK_PUNC = "，,；;：:、"
# 极短语（「好。」「对，」）单独成块会一闪而过，并到上一块
_MIN_CHUNK_CHARS = 6


def split_subtitle(text: str) -> list:
    """按**标点/语气**切字幕块（2026-10-28 二次修正）。

    原则：**切块只看标点，绝不看显示宽度**。宽度只决定这块要折几行、字号缩多少。
    旧版按像素宽度合并/拆分，会把「其实不是排版」从中间切开，用户实报「不该断的时候断」。

    规则：
      ① 在 。！？!?… ，,；;：:、 处断开（标点跟在前一块尾部）；
      ② 过短的块（<6 字）并进上一块，避免「好。」单独闪一下；
      ③ 绝不按宽度再拆——放不下由渲染端折行 + 缩字号解决。
    """
    s = (text or "").strip()
    if not s:
        return []
    phrases, cur = [], ""
    for ch in s:
        cur += ch
        if ch in _STRONG_PUNC or ch in _WEAK_PUNC:
            phrases.append(cur)
            cur = ""
    if cur.strip():
        phrases.append(cur)

    out = []
    for ph in phrases:
        if out and len(out[-1].rstrip("，,；;：:、 ")) < _MIN_CHUNK_CHARS:
            out[-1] += ph
        else:
            out.append(ph)
    return out or [s]


def speech_weight(text: str) -> float:
    """块的「朗读时长权重」≈ 音节数：汉字 1、英文按字母数折半、数字按位数折 0.6。

    时间轴按这个比例分，而不是按像素宽度——两边英文长度不同时，
    按宽度分会让英文块占过多时间，听起来和画面脱节。
    """
    import re as _re
    w = 0.0
    for run in _re.findall(r"[A-Za-z]+|\d+|[^A-Za-z\d]", text or ""):
        if run.isalpha():
            w += max(1.0, len(run) * 0.5)
        elif run.isdigit():
            w += max(1.0, len(run) * 0.6)
        elif run.strip():
            w += 1.0
    return max(1.0, w)


def parse_runs(text: str) -> list:
    """把 '这是[重点]内容' 拆成 [(片段, 是否强调)] —— 方括号内用强调色渲染。

    卡片关键词里标一小段强调色，是「精致感」最便宜的一招；
    解析失败（不配对）时整段按普通文本处理，不报错。
    """
    s = str(text or "")
    runs, buf, hot, depth = [], "", False, 0
    for ch in s:
        if ch == "[":
            if buf:
                runs.append((buf, hot))
                buf = ""
            depth += 1
            hot = True
        elif ch == "]" and depth > 0:
            if buf:
                runs.append((buf, hot))
                buf = ""
            depth -= 1
            hot = depth > 0
        else:
            buf += ch
    if buf:
        runs.append((buf, hot))
    return runs or [(s, False)]


def strip_marks(text: str) -> str:
    return "".join(t for t, _ in parse_runs(text))


# ── 缓动 ──────────────────────────────────────────────────────────────
def ease_out(p: float) -> float:
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def ease_out_back(p: float, overshoot: float = 1.70158) -> float:
    p = max(0.0, min(1.0, p))
    c = overshoot + 1
    return 1 + c * (p - 1) ** 3 + overshoot * (p - 1) ** 2


def ease_in_out(p: float) -> float:
    p = max(0.0, min(1.0, p))
    return p * p * (3 - 2 * p)


def _rise(p: float):
    """元素入场的位移与透明度（回弹缓动），卡片与卡片内文字必须同源，否则会「字先到、框后到」。"""
    e = ease_out_back(p)
    return int((1 - e) * 46), int(255 * min(1.0, p * 1.35))


def reveal(tl: float, at: float, span: float = REVEAL_SPAN) -> float:
    if tl <= at:
        return 0.0
    return ease_out((tl - at) / max(0.01, span))


# ── 背景 ──────────────────────────────────────────────────────────────
def _gradient(W: int, H: int, top, bottom):
    from PIL import Image
    mask = Image.linear_gradient("L").resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), bottom),
                           Image.new("RGB", (W, H), top), mask)


def _glow(img, cx, cy, r, color, alpha=40):
    from PIL import Image, ImageDraw, ImageFilter
    W, H = img.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(color) + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(max(12, r // 2)))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def _grid(img, step: int, color, alpha=150):
    from PIL import Image, ImageDraw
    W, H = img.size
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = tuple(color) + (alpha,)
    for x in range(0, W, step):
        d.line([(x, 0), (x, H)], fill=c, width=1)
    for y in range(0, H, step):
        d.line([(0, y), (W, y)], fill=c, width=1)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


# ── 时间轴 ────────────────────────────────────────────────────────────
def auto_scene(text: str, index: int = 0) -> dict:
    """没有分镜时，从旁白文本兜底生成一条场景（比纯占位帧好看得多）。

    ★ 只取头两个短句当关键词，**不把整段旁白塞进 note**——否则卡片上出现的
      就是字幕原文，又回到「同一句话看两遍」的老问题。
    """
    s = (text or "").strip()
    if not s:
        return {"type": "statement", "title": "…"}
    parts = []
    cur = ""
    for ch in s:
        cur += ch
        if ch in "，。！？；：,.!?;:":
            parts.append(cur.strip("，。！？；：,.!?;: "))
            cur = ""
            if len(parts) >= 2:
                break
    if cur.strip() and len(parts) < 2:
        parts.append(cur.strip())
    head = (parts[0] if parts else s)[:14]
    second = (parts[1] if len(parts) > 1 else "")[:12]
    sc = {"type": "hook" if index == 0 else "statement", "title": head}
    if second and second != head:
        sc["highlight"] = second
    return sc


def normalize_storyboard(raw, cue_count: int) -> list:
    """校验并规整 storyboard：返回 scenes 列表（至少 1 条）。"""
    if isinstance(raw, str):
        raw = json.loads(raw) if raw.strip() else {}
    raw = raw or {}
    scenes = raw.get("scenes") or []
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("storyboard.scenes 为空：至少一条场景")
    out = []
    for i, sc in enumerate(scenes):
        if not isinstance(sc, dict):
            raise ValueError(f"storyboard.scenes[{i}] 不是对象")
        t = str(sc.get("type") or "").strip()
        if t not in SCENE_TYPES:
            raise ValueError(
                f"storyboard.scenes[{i}].type='{t}' 不支持；可用：{'/'.join(SCENE_TYPES)}")
        sc = dict(sc)
        sc["type"] = t
        out.append(sc)
    has_seg = any("seg" in s for s in out)
    if has_seg:
        for i, s in enumerate(out):
            if "seg" not in s:
                raise ValueError(f"storyboard.scenes[{i}] 缺 seg：要么都写 seg，要么都不写")
            seg = s["seg"]
            if not isinstance(seg, int) or seg < 0:
                raise ValueError(f"storyboard.scenes[{i}].seg 必须是 ≥0 的整数")
            if cue_count and seg >= cue_count:
                raise ValueError(
                    f"storyboard.scenes[{i}].seg={seg} 超出旁白段数（共 {cue_count} 段，"
                    f"合法范围 0~{cue_count - 1}）")
    elif cue_count and len(out) != cue_count:
        # 数量对不上时补齐/截断，但明确告警（不静默）
        print(f"[kinetic] 提示：scenes {len(out)} 条 / 旁白 {cue_count} 段，"
              f"按顺序对齐，多余的旁白用自动场景兜底", file=sys.stderr)
    return out


def build_timeline(scenes, cues, total: float):
    """→ [(scene, t0, t1, subtitle_text), ...]

    规则：
      · 写了 seg：同一段旁白的多个场景按 w 比例分该段时长，字幕只认场景自带 sub
        （一段拆多镜时，不能再把整段旁白当每镜的字幕，否则又变成重复）；
      · 没写 seg：scenes 与 cues 按顺序 1:1，字幕用该段旁白全文。
    """
    out = []
    has_seg = any("seg" in s for s in scenes)
    if has_seg:
        groups = {}
        for s in scenes:
            groups.setdefault(int(s["seg"]), []).append(s)
        for i, (st, en, txt) in enumerate(cues):
            group = groups.get(i)
            if not group:
                group = [auto_scene(txt, i)]
            ws = [max(0.01, float(s.get("w") or 1.0)) for s in group]
            tot = sum(ws)
            t = st
            for k, (sc, w) in enumerate(zip(group, ws)):
                d = (en - st) * w / tot
                sub = sc.get("sub")
                if sub is None and len(group) == 1:
                    sub = txt
                if sub is False:
                    sub = ""
                out.append((sc, t, t + d, sub or ""))
                t += d
    else:
        for i, (st, en, txt) in enumerate(cues):
            sc = scenes[i] if i < len(scenes) else auto_scene(txt, i)
            out.append((sc, st, en, txt))
    # 尾量（环境音/音效可能比口播长）：拉长最后一镜到 total
    if out and total > out[-1][2] + 0.05:
        sc, t0, _t1, sub = out[-1]
        out[-1] = (sc, t0, total, sub)
    return out


# ── 渲染器 ────────────────────────────────────────────────────────────
class KineticRenderer:
    def __init__(self, W, H, timeline, top_text="", badge_text="", fps=FPS_DEFAULT,
                 bg_images=None, theme="dark", subtitle_style="typewriter"):
        self.W, self.H = W, H
        apply_theme(theme)
        self.subtitle_style = subtitle_style if subtitle_style in ("typewriter", "ticker") \
            else "typewriter"
        self.fps = fps
        self.tl = timeline
        self.starts = [x[1] for x in timeline]
        self.top_text = top_text or ""
        self.badge_text = badge_text or ""
        self.mx = int(W * 0.075)
        self.ctop = int(H * 0.165)
        self.cbot = int(H * 0.735)
        self.sub_top = int(H * 0.780)
        self.bg_images = [p for p in (bg_images or []) if p and os.path.exists(p)]
        self._bg_cache = {}
        self._src_cache = {}
        self._scrim = None
        self._chrome = None

    # -- 实拍/生成素材底图（Ken Burns：慢推 + 平移）--
    def _load_bg(self, path: str):
        if path in self._src_cache:
            return self._src_cache[path]
        from PIL import Image
        W, H = self.W, self.H
        # 预留 10% 的余量给推拉/平移，避免边缘露底
        tw, th = int(W * 1.10), int(H * 1.10)
        img = Image.open(path).convert("RGB")
        sw, sh = img.size
        k = max(tw / sw, th / sh)
        img = img.resize((max(tw, int(sw * k)), max(th, int(sh * k))), Image.LANCZOS)
        # 居中裁到刚好 tw×th
        x0 = max(0, (img.size[0] - tw) // 2)
        y0 = max(0, (img.size[1] - th) // 2)
        img = img.crop((x0, y0, x0 + tw, y0 + th))
        self._src_cache[path] = img
        return img

    def _scrim_layer(self):
        """素材底图上压一层自上而下的暗色蒙版：保证标题/字幕在任何画面上都读得清。"""
        if self._scrim is not None:
            return self._scrim
        from PIL import Image, ImageDraw
        W, H = self.W, self.H
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for y in range(H):
            t = y / max(1, H - 1)
            # 素材底图明暗不可控（亮天空/雪地）：蒙版必须压得住白字，宁深勿浅
            a = int(255 * (0.42 + 0.24 * t))
            d.line([(0, y), (W, y)], fill=(6, 8, 12, min(215, a)))
        d.rectangle([0, 0, W, int(H * 0.135)], fill=(6, 8, 12, 105))
        self._scrim = layer
        return layer

    def _bg_image_frame(self, idx: int, p: float):
        from PIL import Image
        W, H = self.W, self.H
        src = self._load_bg(self.bg_images[idx % len(self.bg_images)])
        sw, sh = src.size
        e = ease_in_out(p)
        z = 1.0 + 0.075 * e                      # 缓慢推近
        cw, ch = int(W * z), int(H * z)
        mx, my = max(0, sw - cw), max(0, sh - ch)
        d = idx % 4
        fx, fy = (e, 0.5) if d == 0 else (1 - e, 0.5) if d == 1 else \
                 (0.5, e) if d == 2 else (0.5, 1 - e)
        x = int(mx * fx)
        y = int(my * fy)
        frame = src.crop((x, y, x + cw, y + ch)).resize((W, H), Image.BILINEAR)
        out = _alpha_composite(frame.convert("RGBA"), self._scrim_layer())
        chrome = self._chrome_layer()
        if chrome:
            out = _alpha_composite(out, chrome)
        return out

    # -- 背景（无素材时：渐变 + 网格 + 光斑，按场景缓存）--
    def _bg(self, idx: int, p: float = 0.0):
        if self.bg_images:
            return self._bg_image_frame(idx, p)
        if idx in self._bg_cache:
            return self._bg_cache[idx]
        W, H = self.W, self.H
        img = _gradient(W, H, THEME["bg_top"], THEME["bg_bot"])
        img = _grid(img, max(40, int(W * 0.055)), THEME["grid"], 150)
        off = (idx % 5) * 0.11
        img = _glow(img, int(W * (0.84 - 0.10 * off)), int(H * (0.16 + off)),
                    int(W * 0.30), THEME["accent"], 34)
        rgba = img.convert("RGBA")
        chrome = self._chrome_layer()
        if chrome:
            rgba = _alpha_composite(rgba, chrome)
        self._bg_cache[idx] = rgba
        return rgba

    def _chrome_layer(self):
        if self._chrome is not None:
            return self._chrome
        from PIL import Image, ImageDraw
        W, H = self.W, self.H
        if not self.top_text and not self.badge_text:
            self._chrome = False
            return False
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        y = int(H * 0.042)
        badge_w = 0
        if self.badge_text:
            badge_w = font(int(H * 0.021), True).getlength(self.badge_text) + int(H * 0.030)
        if self.top_text:
            # 顶部条与右侧角标不能撞：先按可用宽度收字号
            avail = W - 2 * self.mx - badge_w - int(W * 0.02)
            size = int(H * 0.020)
            f = font(size, True)
            while size > int(H * 0.013) and f.getlength(self.top_text) > avail:
                size -= 1
                f = font(size, True)
            tw = min(f.getlength(self.top_text), avail)
            pad = int(H * 0.010)
            d.rounded_rectangle([self.mx - pad, y - pad, self.mx + tw + pad, y + f.size + pad],
                                radius=int(H * 0.008), fill=(0, 0, 0, 120))
            d.text((self.mx, y), self.top_text, font=f, fill=THEME["fg"] + (255,))
        if self.badge_text:
            f = font(int(H * 0.021), True)
            bw = f.getlength(self.badge_text)
            pad = int(H * 0.010)
            x1 = W - self.mx
            d.rounded_rectangle([x1 - bw - pad, y - pad, x1 + pad, y + f.size + pad],
                                radius=int(H * 0.008), fill=(0, 0, 0, 130))
            d.text((x1 - bw, y), self.badge_text, font=f, fill=THEME["fg"] + (255,))
        self._chrome = layer
        return layer

    # -- 单帧 --
    def locate(self, t: float):
        i = bisect.bisect_right(self.starts, t) - 1
        i = max(0, min(i, len(self.tl) - 1))
        sc, t0, t1, sub = self.tl[i]
        return i, sc, max(0.0, t - t0), max(0.05, t1 - t0), sub

    def frame(self, t: float):
        i, sc, tl, dur, sub = self.locate(t)
        img = self.render(i, sc, tl, dur, sub)
        # 转场：本镜最后 XFADE 秒 → 下一镜的入场态
        if i + 1 < len(self.tl) and dur > XFADE * 2 and tl > dur - XFADE:
            p = ease_in_out((tl - (dur - XFADE)) / XFADE)
            nsc, _n0, n1, nsub = self.tl[i + 1]
            nxt = self.render(i + 1, nsc, 0.0, max(0.05, n1 - _n0), nsub)
            img = self._transition(img, nxt, p, str(sc.get("transition") or "fade"))
        return img

    def _transition(self, cur, nxt, p, kind: str):
        from PIL import Image
        W, H = self.W, self.H
        if kind == "push":
            dx = int(W * p)
            out = Image.new("RGB", (W, H))
            out.paste(cur, (-dx, 0))
            out.paste(nxt, (W - dx, 0))
            return out
        if kind == "wipe":
            out = cur.copy()
            w = int(W * p)
            if w > 0:
                out.paste(nxt.crop((0, 0, w, H)), (0, 0))
            return out
        if kind == "zoom":
            s = 1.0 + 0.10 * (1 - p)
            nw, nh = max(W, int(W * s)), max(H, int(H * s))
            big = nxt.resize((nw, nh), Image.BILINEAR)
            l, t = (nw - W) // 2, (nh - H) // 2
            return Image.blend(cur, big.crop((l, t, l + W, t + H)), p)
        return Image.blend(cur, nxt, p)

    def render(self, idx: int, sc: dict, tl: float, dur: float, sub: str):
        from PIL import Image, ImageDraw
        base = self._bg(idx, min(1.0, tl / max(0.05, dur)))
        ov = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        kind = sc.get("type") or "statement"
        drawer = getattr(self, f"_draw_{kind}", self._draw_statement)
        drawer(d, sc, tl, dur)
        if sub:
            self._draw_subtitle(d, sub, tl, dur)
        return Image.alpha_composite(base, ov).convert("RGB")

    # -- 基础绘制 --
    def _text(self, d, text, f, x, y, fill, alpha, line_h=None, center_w=None, stroke=0,
              stroke_fill=(0, 0, 0, 255)):
        if alpha <= 0:
            return y
        lh = line_h or int(f.size * 1.42)
        for ln in text.split("\n"):
            dx = x
            if center_w is not None:
                dx = x + (center_w - f.getlength(ln)) / 2
            if stroke:
                d.text((dx, y), ln, font=f, fill=tuple(fill) + (alpha,),
                       stroke_width=stroke, stroke_fill=stroke_fill)
            else:
                d.text((dx, y), ln, font=f, fill=tuple(fill) + (alpha,))
            y += lh
        return y

    def _big(self, d, x, y, ln, f, alpha):
        """大标题：素材底图上加投影；[方括号] 内的字用强调色。"""
        if alpha <= 0:
            return x
        for seg, hot in parse_runs(ln):
            if not seg:
                continue
            if self.bg_images:
                d.text((x + 2, y + 3), seg, font=f, fill=(0, 0, 0, int(alpha * 0.55)))
            d.text((x, y), seg, font=f,
                   fill=(THEME["accent"] if hot else THEME["fg"]) + (int(alpha),))
            x += f.getlength(seg)
        return x

    def _card(self, d, box, p, radius=None, fill=None, border=None, bar=None):
        """卡片按入场进度弹入（回弹缓动）+ 淡入。"""
        if p <= 0:
            return
        e = ease_out_back(p)
        dy = int((1 - e) * 46)
        a = int(235 * min(1.0, p * 1.3))
        x0, y0, x1, y1 = box
        y0 += dy
        y1 += dy
        r = radius if radius is not None else int(self.H * 0.014)
        d.rounded_rectangle([x0, y0, x1, y1], radius=r,
                            fill=tuple(fill or THEME["card"]) + (a,),
                            outline=tuple(border or THEME["card_border"]) + (a,), width=2)
        if bar:
            d.rounded_rectangle([x0, y0, x0 + int(self.W * 0.009), y1], radius=6,
                                fill=tuple(bar) + (a,))
        return dy

    def _title(self, d, sc, tl, y, size, start=0.05):
        f, s, lines = fit_block(sc.get("title") or "", size,
                                self.W - 2 * self.mx, 2, bold=True)
        for i, ln in enumerate(lines):
            p = reveal(tl, start + i * 0.09)
            if p <= 0:
                continue
            a = int(255 * p)
            dy = int((1 - p) * 40)
            d.text((self.mx, y + dy), ln, font=f, fill=THEME["fg"] + (a,))
            y += int(s * 1.34)
        return y

    def _kicker(self, d, text, tl, y, at=0.0, color=None):
        # 与顶部常驻条相同的文案不再重复画一次（同一条信息一屏出现两遍=噪音）
        if not text or text.strip() == self.top_text.strip():
            return y
        p = reveal(tl, at)
        if p <= 0:
            return y
        f = font(int(self.H * 0.019), True)
        a = int(255 * p)
        dy = int((1 - p) * 20)
        d.rounded_rectangle([self.mx, y + dy + int(self.H * 0.006),
                             self.mx + int(self.W * 0.010), y + dy + int(self.H * 0.030)],
                            radius=4, fill=tuple(color or THEME["accent"]) + (a,))
        d.text((self.mx + int(self.W * 0.024), y + dy), text, font=f,
               fill=tuple(color or THEME["accent"]) + (a,))
        return y + int(self.H * 0.040)

    def _underline(self, d, y, width_ratio=0.14, p=1.0):
        if p <= 0:
            return
        w = int(self.W * width_ratio * p)
        d.rounded_rectangle([self.mx, y, self.mx + max(6, w), y + int(self.H * 0.006)],
                            radius=5, fill=THEME["accent"] + (240,))

    # -- 场景类型 --
    def _place(self, total_h: int, bias: float = 0.42) -> int:
        """把内容块垂直放进 [ctop, sub_top) 区间；bias=0 贴顶、0.5 居中。"""
        avail = (self.sub_top - int(self.H * 0.03)) - self.ctop
        slack = max(0, avail - total_h)
        return self.ctop + int(slack * bias)

    def _draw_hook(self, d, sc, tl, dur):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        title = (sc.get("title") or "").strip()
        hl = (sc.get("highlight") or "").strip()
        sub = (sc.get("sub") or "").strip()

        ft, st, tlines = fit_block(title, int(H * 0.058), W - 2 * self.mx, 2, bold=True)
        fh_, sh, hlines = (fit_block(hl, int(H * 0.049), W - 2 * self.mx, 2, bold=True)
                           if hl else (None, 0, []))
        fs_, ss, slines = (fit_block(sub, int(H * 0.026), W - 2 * self.mx, 3, bold=False)
                           if sub else (None, 0, []))

        gap1 = int(H * 0.012)
        underline_h = int(H * 0.006) + int(H * 0.023)
        total = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) \
            + gap1 + underline_h
        if hlines:
            total += int(sh * 1.32) * len(hlines) + int(H * 0.016)
        if slines:
            total += int(ss * 1.5) * len(slines)
        y = self._place(total, 0.50)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += gap1
        self._underline(d, y, 0.16, ease_out(reveal(tl, 0.34, 0.5)))
        y += underline_h
        if hlines:
            ph = reveal(tl, 0.42, 0.5)
            for ln in hlines:
                if ph > 0:
                    d.text((self.mx, y + int((1 - ph) * 26)), ln, font=fh_,
                           fill=THEME["accent"] + (int(255 * ph),))
                y += int(sh * 1.32)
            y += int(H * 0.016)
        if slines:
            ps = reveal(tl, 0.62, 0.6)
            self._text(d, "\n".join(slines), fs_, self.mx, y + int((1 - ps) * 24),
                       THEME["grey"], int(255 * ps), int(ss * 1.5))

    def _draw_statement(self, d, sc, tl, dur):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        title = (sc.get("title") or "").strip()
        hl = (sc.get("highlight") or "").strip()
        note = (sc.get("note") or "").strip()

        ft, st, tlines = fit_block(title, int(H * 0.047), W - 2 * self.mx, 2, bold=True)
        fh_, sh, hlines = (fit_block(hl, int(H * 0.043), W - 2 * self.mx, 3, bold=True)
                           if hl else (None, 0, []))
        fn_, sn, nlines = (fit_block(note, int(H * 0.024), W - 2 * self.mx, 5, bold=False)
                           if note else (None, 0, []))

        underline_h = int(H * 0.006) + int(H * 0.028)
        total = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + underline_h
        if hlines:
            total += int(sh * 1.40) * len(hlines) + int(H * 0.010)
        if nlines:
            total += int(sn * 1.55) * len(nlines)
        y = self._place(total, 0.40)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        self._underline(d, y + int(H * 0.006), 0.12, ease_out(reveal(tl, 0.30, 0.5)))
        y += underline_h
        if hlines:
            ph = reveal(tl, 0.36, 0.5)
            for ln in hlines:
                if ph > 0:
                    d.text((self.mx, y + int((1 - ph) * 24)), ln, font=fh_,
                           fill=THEME["accent"] + (int(255 * ph),))
                y += int(sh * 1.40)
            y += int(H * 0.010)
        if nlines:
            pn = reveal(tl, 0.52, 0.6)
            self._text(d, "\n".join(nlines), fn_, self.mx, y + int((1 - pn) * 24),
                       THEME["grey"], int(255 * pn), int(sn * 1.55))

    def _draw_points(self, d, sc, tl, dur, warm=False):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.043),
                                   W - 2 * self.mx, 2, bold=True)
        items = [str(x) for x in (sc.get("points") or []) if str(x).strip()][:4]
        if not items:
            return
        gap = int(H * 0.016)
        n = len(items)
        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.030)
        avail = (self.sub_top - int(H * 0.03)) - self.ctop
        ch = int((avail - head_h - gap * max(0, n - 1)) / max(1, n))
        ch = max(int(H * 0.085), min(ch, int(H * 0.125)))
        y = self._place(head_h + ch * n + gap * max(0, n - 1), 0.30)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += int(H * 0.030)

        # 逐条入场：全部条目在开头 2 秒内出齐，后面留给阅读
        first = 0.35
        last = min(first + 0.55 * (n - 1), max(first + 0.30, dur * 0.45))
        step = 0 if n == 1 else (last - first) / (n - 1)
        for i, it in enumerate(items):
            p = reveal(tl, first + step * i, 0.4)
            if p <= 0:
                y += ch + gap
                continue
            self._card(d, [self.mx, y, W - self.mx, y + ch], p,
                       fill=THEME["card_warm"] if warm else THEME["card"],
                       border=THEME["card_warm_border"] if warm else THEME["card_border"],
                       bar=THEME["accent"])
            f, s, lines = fit_block(strip_marks(it), int(H * 0.027),
                                    W - 2 * self.mx - int(W * 0.055), 2, bold=True)
            a = int(255 * p)
            dy, _ = _rise(p)
            ty = y + dy + max(0, (ch - int(s * 1.40) * len(lines)) // 2)
            if len(lines) == 1:
                self._big(d, self.mx + int(W * 0.035), ty, it, f, a)
            else:
                for ln in lines:
                    self._big(d, self.mx + int(W * 0.035), ty, ln, f, a)
                    ty += int(s * 1.40)
            y += ch + gap

    def _draw_warning(self, d, sc, tl, dur):
        self._draw_points(d, sc, tl, dur, warm=True)

    def _draw_code(self, d, sc, tl, dur):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.043),
                                   W - 2 * self.mx, 2, bold=True)
        code = (sc.get("code") or "").strip()
        note = (sc.get("note") or "").strip()
        fc_ = sc_ = None
        clines = []
        if code:
            fc_, sc_, clines = fit_block(code, int(H * 0.022),
                                         W - 2 * self.mx - int(W * 0.05), 8,
                                         bold=False, mono=True)
        fn_ = sn_ = None
        nlines = []
        if note:
            fn_, sn_, nlines = fit_block(note, int(H * 0.024), W - 2 * self.mx, 3, bold=False)

        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.026)
        code_h = (int(sc_ * 1.62) * len(clines) + int(H * 0.036)) if clines else 0
        note_h = (int(sn_ * 1.55) * len(nlines) + int(H * 0.020)) if nlines else 0
        y = self._place(head_h + code_h + note_h, 0.30)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += int(H * 0.026)
        if clines:
            p = reveal(tl, 0.36, 0.5)
            if p > 0:
                self._card(d, [self.mx, y, W - self.mx, y + code_h], p,
                           fill=THEME["code_bg"], border=THEME["code_border"])
                self._text(d, "\n".join(clines), fc_, self.mx + int(W * 0.025),
                           y + int((1 - p) * 34) + int(H * 0.018),
                           THEME["code_fg"], int(255 * p), int(sc_ * 1.62))
            y += code_h
        if nlines:
            pn = reveal(tl, 0.6, 0.6)
            self._text(d, "\n".join(nlines), fn_, self.mx, y + int(H * 0.020) + int((1 - pn) * 24),
                       THEME["grey"], int(255 * pn), int(sn_ * 1.55))

    def _draw_table(self, d, sc, tl, dur):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.040),
                                   W - 2 * self.mx, 2, bold=True)
        cols = [str(c) for c in (sc.get("columns") or [])]
        rows = [[str(c) for c in r] for r in (sc.get("rows") or [])]
        if not cols or not rows:
            return
        bullets = [str(x) for x in (sc.get("points") or [])][:3]
        rh = int(H * 0.046)
        tw = W - 2 * self.mx
        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.024)
        table_h = rh * (len(rows) + 1)
        bullet_h = int(H * 0.038) * len(bullets)
        y = self._place(head_h + table_h + bullet_h, 0.22)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += int(H * 0.024)

        ncol = len(cols)
        cw = tw / ncol
        p = reveal(tl, 0.34, 0.5)
        dy = int((1 - p) * 34)
        a = int(240 * p)
        if p > 0:
            d.rounded_rectangle([self.mx, y + dy, self.mx + tw, y + dy + table_h],
                                radius=int(H * 0.012),
                                fill=THEME["card"] + (a,),
                                outline=THEME["card_border"] + (a,), width=2)
            fh = font(int(H * 0.021), True)
            for i, c in enumerate(cols):
                w = fh.getlength(c)
                d.text((self.mx + cw * i + (cw - w) / 2, y + dy + int(rh * 0.22)), c,
                       font=fh, fill=THEME["accent"] + (a,))
            fb = font(int(H * 0.021), False)
            for ri, row in enumerate(rows):
                ry = y + dy + rh * (ri + 1)
                d.line([(self.mx, ry), (self.mx + tw, ry)],
                       fill=THEME["card_border"] + (a,), width=1)
                for ci in range(min(ncol, len(row))):
                    w = fb.getlength(row[ci])
                    d.text((self.mx + cw * ci + (cw - w) / 2, ry + int(rh * 0.22)), row[ci],
                           font=fb, fill=THEME["fg"] + (a,))
        y += table_h + int(H * 0.014)
        for i, b in enumerate(bullets):
            pb = reveal(tl, 0.62 + i * 0.12, 0.4)
            f, s, lines = fit_block(b, int(H * 0.022), W - 2 * self.mx, 1, bold=False)
            if pb > 0:
                d.text((self.mx, y + int((1 - pb) * 20)), lines[0], font=f,
                       fill=THEME["grey"] + (int(255 * pb),))
            y += int(H * 0.038)

    def _center(self, d, text, f, y, fill, alpha):
        w = f.getlength(text)
        d.text(((self.W - w) / 2, y), text, font=f, fill=tuple(fill) + (int(alpha),))
        return w

    def _draw_stat(self, d, sc, tl, dur):
        """大数字强调：数字 0→目标滚动，标签在下。用于「37 行」「9 单」「80 分」这类。"""
        import re
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        raw = str(sc.get("value") or "").strip()
        label = (sc.get("label") or "").strip()
        sub = (sc.get("sub") or "").strip()
        num_part = re.sub(r"[^0-9.]", "", raw)
        suffix = re.sub(r"[0-9.,\s]", "", raw)
        try:
            target = float(num_part) if num_part else 0.0
        except ValueError:
            target = 0.0
        p = ease_out(reveal(tl, 0.10, 0.85))
        shown = target * p
        num = f"{int(round(shown)):,}" if target >= 1000 else f"{int(round(shown))}"
        fnum, snum, _ = fit_block(num + suffix, int(H * 0.150), W - 2 * self.mx, 1, bold=True)
        fl, sl, llines = fit_block(label, int(H * 0.036), W - 2 * self.mx, 2, bold=True)
        fs_, ss, slines = fit_block(sub, int(H * 0.023), W - 2 * self.mx, 3, bold=False)

        total = (int(H * 0.040) if kicker else 0) + int(snum * 1.10) + int(H * 0.018) \
            + int(sl * 1.34) * len(llines) + (int(H * 0.030) + int(ss * 1.5) * len(slines)
                                              if slines else 0)
        y = self._place(total, 0.44)
        if kicker:
            y = self._kicker(d, kicker, tl, y)
        d.text(((W - fnum.getlength(num + suffix)) / 2, y), num + suffix, font=fnum,
               fill=THEME["accent"] + (int(255 * p),))
        y += int(snum * 1.10) + int(H * 0.018)
        pl = reveal(tl, 0.35, 0.5)
        for ln in llines:
            self._center(d, ln, fl, y, THEME["fg"], int(255 * pl))
            y += int(sl * 1.34)
        if slines:
            y += int(H * 0.030)
            ps = reveal(tl, 0.55, 0.55)
            for ln in slines:
                self._center(d, ln, fs_, y, THEME["grey"], int(255 * ps))
                y += int(ss * 1.5)

    def _draw_quote(self, d, sc, tl, dur):
        """金句：左侧强调竖条 + 居中大字，逐行浮出。"""
        H, W = self.H, self.W
        text = (sc.get("text") or sc.get("title") or "").strip()
        by = (sc.get("by") or "").strip()
        f, s, lines = fit_block(text, int(H * 0.050), W - 2 * self.mx - int(W * 0.05),
                                4, bold=True)
        lh = int(s * 1.46)
        total = lh * len(lines) + (int(H * 0.055) if by else 0)
        y = self._place(total, 0.46)
        p = reveal(tl, 0.08, 0.55)
        x = self.mx + int(W * 0.038)
        d.rounded_rectangle([self.mx, y + int(H * 0.006), self.mx + int(W * 0.009),
                             y + lh * len(lines) - int(H * 0.006)], radius=5,
                            fill=THEME["accent"] + (int(225 * p),))
        for i, ln in enumerate(lines):
            pi = reveal(tl, 0.10 + i * 0.10, 0.5)
            self._big(d, x, y + int((1 - pi) * 18), ln, f, int(255 * pi))
            y += lh
        if by:
            pb = reveal(tl, 0.55, 0.5)
            fb = font(int(H * 0.024), False)
            d.text((x, y + int(H * 0.028)), by, font=fb, fill=THEME["grey"] + (int(255 * pb),))

    def _draw_compare(self, d, sc, tl, dur):
        """左右对比：两栏分别从两侧滑入。left/right = {"head": "...", "items": [...]}。"""
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.042),
                                   W - 2 * self.mx, 2, bold=True)
        left = sc.get("left") or {}
        right = sc.get("right") or {}
        li = [strip_marks(str(x)) for x in (left.get("items") or [])][:3]
        ri = [strip_marks(str(x)) for x in (right.get("items") or [])][:3]
        if not li and not ri:
            return
        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.032)
        row_h = int(H * 0.070)
        n = max(len(li), len(ri)) or 1
        col_h = int(H * 0.058) + row_h * n + int(H * 0.030)
        y0 = self._place(head_h + col_h, 0.26)

        if kicker:
            y0 = self._kicker(d, kicker, tl, y0)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            self._big(d, self.mx, y0 + int((1 - p) * 40), ln, ft, int(255 * p))
            y0 += int(st * 1.34)
        y0 += int(H * 0.032)

        gap = int(W * 0.035)
        cw = (W - 2 * self.mx - gap) // 2
        for side, head, items, dx0 in ((0, left.get("head") or "", li, -70),
                                       (1, right.get("head") or "", ri, 70)):
            p = reveal(tl, 0.30 + side * 0.10, 0.55)
            if p <= 0:
                continue
            x = self.mx + side * (cw + gap) + int((1 - p) * dx0)
            a = int(235 * min(1.0, p * 1.3))
            box = [x, y0, x + cw, y0 + col_h]
            d.rounded_rectangle(box, radius=int(H * 0.014),
                                fill=THEME["card"] + (a,),
                                outline=THEME["card_border"] + (a,), width=2)
            accent = THEME["accent"] if side == 1 else THEME["dim"]
            d.rounded_rectangle([x, y0, x + cw, y0 + int(H * 0.006)], radius=4,
                                fill=accent + (int(220 * p),))
            fh = font(int(H * 0.024), True)
            d.text((x + int(W * 0.022), y0 + int(H * 0.018)), str(head), font=fh,
                   fill=accent + (int(255 * p),))
            yy = y0 + int(H * 0.058)
            for k, it in enumerate(items):
                pi = reveal(tl, 0.42 + side * 0.10 + k * 0.12, 0.45)
                f, s, lns = fit_block(it, int(H * 0.023), cw - int(W * 0.045), 2, bold=False)
                for ln in lns:
                    if pi > 0:
                        d.text((x + int(W * 0.022), yy), ln, font=f,
                               fill=THEME["fg"] + (int(255 * pi),))
                    yy += int(s * 1.35)
                yy += int(H * 0.010)

    def _draw_steps(self, d, sc, tl, dur):
        """编号步骤：圆形序号 + 竖向连接线，逐条点亮。"""
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.042),
                                   W - 2 * self.mx, 2, bold=True)
        items = [strip_marks(str(x)) for x in (sc.get("items") or []) if str(x).strip()][:4]
        if not items:
            return
        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.040)
        row_h = int(H * 0.105)
        y = self._place(head_h + row_h * len(items), 0.24)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += int(H * 0.040)

        cx = self.mx + int(H * 0.028)
        r = int(H * 0.028)
        first = 0.35
        last = min(first + 0.55 * (len(items) - 1), max(first + 0.3, dur * 0.5))
        step = 0 if len(items) == 1 else (last - first) / (len(items) - 1)
        for i, it in enumerate(items):
            p = reveal(tl, first + step * i, 0.45)
            cy = y + row_h * i + r
            if i < len(items) - 1 and p > 0:
                d.rounded_rectangle([cx - 1, cy + r, cx + 1, cy + row_h], radius=2,
                                    fill=THEME["card_border"] + (int(200 * p),))
            a = int(255 * p)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=THEME["accent"] + (a,))
            fn = font(int(H * 0.026), True)
            num = str(i + 1)
            d.text((cx - fn.getlength(num) / 2, cy - int(H * 0.014)), num, font=fn,
                   fill=THEME["fg"] + (a,))
            f, s, lns = fit_block(it, int(H * 0.028), W - 2 * self.mx - r * 3, 2, bold=True)
            ty = cy - int(s * 1.35) * len(lns) / 2
            for ln in lns:
                self._big(d, cx + r + int(W * 0.028), ty, ln, f, a)
                ty += int(s * 1.35)

    def _draw_cta(self, d, sc, tl, dur):
        H, W = self.H, self.W
        kicker = (sc.get("kicker") or "").strip()
        ft, st, tlines = fit_block(sc.get("title") or "", int(H * 0.050),
                                   W - 2 * self.mx, 2, bold=True)
        btn = (sc.get("button") or "").strip()
        note = (sc.get("note") or "").strip()
        fb_ = sb_ = None
        blines = []
        if btn:
            fb_, sb_, blines = fit_block(btn, int(H * 0.028),
                                         W - 2 * self.mx - int(W * 0.06), 2, bold=True)
        fn_ = sn_ = None
        nlines = []
        if note:
            fn_, sn_, nlines = fit_block(note, int(H * 0.022), W - 2 * self.mx, 2, bold=False)

        head_h = (int(H * 0.040) if kicker else 0) + int(st * 1.34) * len(tlines) + int(H * 0.045)
        btn_h = (int(sb_ * 1.44) * len(blines) + int(H * 0.040)) if blines else 0
        note_h = (int(sn_ * 1.5) * len(nlines) + int(H * 0.026)) if nlines else 0
        y = self._place(head_h + btn_h + note_h, 0.38)

        if kicker:
            y = self._kicker(d, kicker, tl, y)
        for i, ln in enumerate(tlines):
            p = reveal(tl, 0.05 + i * 0.09)
            if p > 0:
                self._big(d, self.mx, y + int((1 - p) * 40), ln, ft, int(255 * p))
            y += int(st * 1.34)
        y += int(H * 0.045)
        if blines:
            p = reveal(tl, 0.45, 0.55)
            if p > 0:
                dy = int((1 - p) * 34)
                a = int(255 * p)
                d.rounded_rectangle([self.mx, y + dy, W - self.mx, y + btn_h + dy],
                                    radius=int(H * 0.016), fill=THEME["accent"] + (a,))
                ty = y + dy + int(H * 0.020)
                for ln in blines:
                    w = fb_.getlength(ln)
                    d.text(((W - w) / 2, ty), ln, font=fb_, fill=(18, 12, 8, a))
                    ty += int(sb_ * 1.44)
            y += btn_h
        if nlines:
            pn = reveal(tl, 0.75, 0.5)
            yy = y + int(H * 0.026) + int((1 - pn) * 20)
            for ln in nlines:
                w = fn_.getlength(ln)
                d.text(((W - w) / 2, yy), ln, font=fn_,
                       fill=THEME["grey"] + (int(255 * pn),))
                yy += int(sn_ * 1.5)

    # -- 字幕（打字机）--
    def _draw_subtitle(self, d, text, tl, dur):
        if self.subtitle_style == "ticker":
            self._draw_ticker(d, text, tl, dur)
            return
        size = int(self.H * 0.034)
        max_w = self.W * 0.86
        pieces = split_subtitle(text)
        if not pieces:
            return
        # 时间按**音节权重**分（说话长度），不按像素宽度
        weights = [speech_weight(p) for p in pieces]
        tot = sum(weights)
        # 定位当前块
        acc, idx, local, cur_span = 0.0, len(pieces) - 1, dur, dur * weights[-1] / tot
        for i, w in enumerate(weights):
            span = dur * w / tot
            if tl < acc + span:
                idx, local, cur_span = i, tl - acc, span
                break
            acc += span
        piece = pieces[idx]
        type_dur = max(0.12, cur_span * 0.7)
        n = min(len(piece), max(1, int(len(piece) * min(1.0, local / type_dur))))

        # 用**整块**定字号与折行，打字过程中行距/换行不跳
        f, s, full_lines = fit_block(piece, size, max_w, 2, bold=True)
        lh = int(s * 1.38)
        lines, remain = [], n
        for ln in full_lines:
            if remain <= 0:
                break
            lines.append(ln[:remain])
            remain -= len(ln)
        y = self.sub_top
        for ln in lines:
            w = f.getlength(ln)
            d.text(((self.W - w) / 2, y), ln, font=f, fill=THEME["fg"] + (255,),
                   stroke_width=max(3, int(s * 0.075)), stroke_fill=(0, 0, 0, 230))
            y += lh

    def _draw_ticker(self, d, text, tl, dur):
        """整句单行从右往左平移（跑马灯）。

        为什么它天然跟语速：平移总量 = 屏宽 + 文本宽，而旁白时长≈文本长度×语速，
        所以两者的比值近似恒定 —— 长句自动滚得快、短句自动滚得慢。
        好处是**永远不需要断句**；代价是要跟着字移动视线，回读不如定点字幕方便。
        """
        s = (text or "").strip()
        if not s:
            return
        f = font(int(self.H * 0.034), True)
        w = f.getlength(s)
        stroke = max(3, int(self.H * 0.0026))
        margin = self.mx
        # 整句放得下 → 居中静态：没有入场延迟，第一句就能读
        if w <= self.W - 2 * margin:
            d.text(((self.W - w) / 2, self.sub_top), s, font=f,
                   fill=THEME["fg"] + (255,), stroke_width=stroke,
                   stroke_fill=(0, 0, 0, 230))
            return
        # 放不下 → 左对齐起步，随语速左移，读完刚好贴右边界。
        # 这样**开头立刻能读**（比从屏外飘进来好），且移动量 = 溢出宽度，
        # 越接近放得下就移动得越少，不会出现「字飞过去」的观感。
        p = max(0.0, min(1.0, tl / max(0.05, dur)))
        x0 = margin
        x1 = self.W - margin - w
        x = x0 + (x1 - x0) * p
        d.text((x, self.sub_top), s, font=f, fill=THEME["fg"] + (255,),
               stroke_width=stroke, stroke_fill=(0, 0, 0, 230))

    # -- 进度条 --
    def draw_progress(self, img, progress):
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        h = max(2, int(self.H * 0.0025))
        d.rectangle([0, self.H - h, int(self.W * max(0.0, min(1.0, progress))), self.H],
                    fill=THEME["accent"])


def _alpha_composite(a, b):
    from PIL import Image
    return Image.alpha_composite(a, b)


# ── 出片 ──────────────────────────────────────────────────────────────
def render_video(ffmpeg: str, out_path: str, timeline, total: float, W: int, H: int,
                 top_text: str = "", badge_text: str = "", fps: int = FPS_DEFAULT,
                 bg_images=None, theme: str = "dark", subtitle_style: str = "typewriter"):
    """逐帧绘制并管道编码成无声 mp4。返回落盘路径。"""
    r = KineticRenderer(W, H, timeline, top_text=top_text, badge_text=badge_text, fps=fps,
                        bg_images=bg_images, theme=theme, subtitle_style=subtitle_style)
    n_frames = max(1, int(round(total * fps)))
    cmd = [ffmpeg, "-y", "-v", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps),
           "-i", "-",
           "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
           out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    step = max(1, n_frames // 20)
    try:
        for i in range(n_frames):
            t = i / float(fps)
            img = r.frame(t)
            r.draw_progress(img, (t / total) if total > 0 else 1.0)
            proc.stdin.write(img.tobytes())
            if i % step == 0:
                print(f"[kinetic] {i}/{n_frames} 帧（{t:.1f}/{total:.1f}s）", file=sys.stderr)
        proc.stdin.close()
        stderr = proc.stderr.read()
        if proc.wait() != 0:
            raise RuntimeError(f"kinetic 编码失败：\n{(stderr or b'').decode('utf-8', 'ignore')[-1500:]}")
    finally:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass
    return out_path


def load_storyboard(path_or_obj):
    if isinstance(path_or_obj, dict):
        return path_or_obj
    with open(path_or_obj, "r", encoding="utf-8-sig") as f:
        return json.load(f)


# ── 独立调试入口 ──────────────────────────────────────────────────────
def _cli():
    import argparse
    ap = argparse.ArgumentParser(description="kinetic 画面引擎独立调试")
    ap.add_argument("--script", required=True, help="script.json（含 hook/segments/ending 与音频时长）")
    ap.add_argument("--storyboard", default="", help="storyboard.json（省略则按旁白自动生成）")
    ap.add_argument("--out", required=True)
    ap.add_argument("--aspect", default="9:16", choices=["4:3", "9:16", "16:9"])
    ap.add_argument("--top", default="", help="顶部常驻条文案")
    ap.add_argument("--badge", default="", help="右上角角标（如 第3集）")
    ap.add_argument("--bg-images", default="", help="素材底图，逗号分隔（按顺序轮转，Ken Burns 推拉）")
    ap.add_argument("--theme", default="dark", choices=["dark", "light"], help="配色主题")
    ap.add_argument("--subtitle-style", default="typewriter", choices=["typewriter", "ticker"],
                    help="字幕样式：typewriter=逐句打字机（默认）/ ticker=整句从右往左平移")
    a = ap.parse_args()
    sizes = {"4:3": (1080, 1440), "9:16": (1080, 1920), "16:9": (1920, 1080)}
    W, H = sizes[a.aspect]
    ff = os.environ.get("FFMPEG") or r"C:\Program Files\EVCapture\ffmpeg.exe"

    def probe(p):
        fp = os.path.join(os.path.dirname(ff), "ffprobe.exe")
        r = subprocess.run([fp, "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=noprint_wrappers=1:nokey=1", p],
                           capture_output=True, text=True)
        try:
            return float(r.stdout.strip())
        except ValueError:
            return 3.0

    script = json.load(open(a.script, encoding="utf-8-sig"))
    items = []
    if script.get("hook_audio"):
        items.append((script.get("hook", ""), script["hook_audio"]))
    for s in script.get("segments", []):
        if s.get("audio"):
            items.append((s.get("text", ""), s["audio"]))
    if script.get("ending_audio"):
        items.append((script.get("ending", ""), script["ending_audio"]))
    cues, t = [], 0.0
    for txt, p in items:
        d = probe(p)
        cues.append((t, t + d, txt))
        t += d
    scenes = []
    if a.storyboard:
        scenes = normalize_storyboard(load_storyboard(a.storyboard), len(cues))
    if not scenes:
        scenes = [auto_scene(c[2], i) for i, c in enumerate(cues)]
    timeline = build_timeline(scenes, cues, t)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    render_video(ff, a.out, timeline, t, W, H, a.top, a.badge,
                 bg_images=[p.strip() for p in a.bg_images.split(",") if p.strip()],
                 theme=a.theme, subtitle_style=a.subtitle_style)
    print(f"[kinetic] {a.out}  {t:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    _cli()
