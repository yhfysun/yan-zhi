# -*- coding: utf-8 -*-
"""anim_compose.py — 科普动画画面层 v2（模板化场景动画 + TTS 旁白 → mp4）

v2 重写（2026-10-17，用户实看 v1 反馈：无声/文字重叠/出界/背景死板）：
  1. 配音：每场景 edge-tts 旁白（场景时长自动适配语音长度），失败降级静音不炸管线；
  2. 文字：全部按 font.getlength 像素测量换行，动态行高，杜绝重叠/出界；
  3. 画面：垂直渐变底 + 低对比装饰色块（每场景预渲染静态层，逐帧只画动态元素）；
  4. 渐显：RGBA 图层真透明度合成（v1 的"颜色向底色插值"观感灰蒙蒙）；
  5. 布局：全部相对单位，9:16 / 16:9 各自调优。

脚本 JSON 结构：
{
  "title": "什么是大模型幻觉",
  "aspect": "16:9" | "9:16",
  "theme": "dark" | "light",
  "fps": 10,
  "voice": "zh-CN-YunxiNeural",       // 旁白音色；"off" 关闭配音
  "scenes": [
    {"type": "concept",  "heading": "什么是幻觉？", "items": ["要点一", "要点二"], "duration": 6},
    {"type": "process",  "heading": "RAG 三步走",   "items": ["检索", "增强", "生成"]},
    {"type": "compare",  "heading": "有无 RAG",     "left": ["编造事实"], "right": ["有据可查"]}
  ],
  "outro": "关注我，每天一个 AI 知识点"
}
"""
import argparse
import asyncio
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import wave

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

ASPECTS = {"16:9": (1920, 1080), "9:16": (1080, 1920)}
THEMES = {
    "dark":  {"bg_top": (24, 28, 44), "bg_bot": (14, 16, 26), "fg": (238, 241, 248),
              "muted": (168, 176, 194), "accent": (64, 196, 255), "accent2": (120, 140, 255),
              "panel": (36, 41, 62), "line": (74, 82, 106)},
    "light": {"bg_top": (250, 251, 253), "bg_bot": (232, 236, 243), "fg": (26, 30, 42),
              "muted": (108, 116, 134), "accent": (18, 132, 220), "accent2": (108, 92, 231),
              "panel": (255, 255, 255), "line": (218, 223, 232)},
}
ITEMS_MAX = 5          # 场景条目上限（模型提示词也约束，这里兜底）
SCENE_TAIL = 0.6       # 场景尾部留白（秒）


def run_quiet(cmd, **kw):
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


def probe_duration(ffprobe, path):
    try:
        r = run_quiet([ffprobe, "-v", "error", "-show_entries", "format=duration",
                       "-of", "default=noprint_wrappers=1:nokey=1", path])
        return float(r.stdout.strip())
    except Exception:
        return 0.0


# ===== 纯函数（可测，无 PIL 依赖） =====

def ease_out(p: float) -> float:
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def ease_out_back(p: float, overshoot: float = 1.70158) -> float:
    """回弹缓动（元素 pop-in 的"过冲再回位"观感）。"""
    p = max(0.0, min(1.0, p))
    c3 = overshoot + 1
    return 1 + c3 * (p - 1) ** 3 + overshoot * (p - 1) ** 2


# ===== 内置图标库（彩色 emoji，Segoe UI Emoji COLR 渲染；关键词自动匹配） =====
ICON_KEYWORDS = [
    # AI / 技术
    ("🧠", ["大脑", "模型", "神经网络", "llm", "大模型", "智能", "ai", "深度学习"]),
    ("🤖", ["机器人", "智能体", "agent", "助手", "自动化", "bot"]),
    ("💻", ["代码", "编程", "开发", "软件", "程序", "bug", "调试", "技术"]),
    ("🔒", ["安全", "加密", "隐私", "权限", "锁", "防护"]),
    ("⚙️", ["流程", "步骤", "原理", "机制", "工作", "系统", "设置", "配置"]),
    ("🐛", ["缺陷", "漏洞", "问题排查", "debug"]),
    ("📊", ["数据", "对比", "统计", "差异", "区别", "报表", "分析"]),
    ("📈", ["提升", "增长", "优化", "效果", "改进", "趋势", "上涨"]),
    ("📉", ["下降", "流失", "衰减", "下滑"]),
    # 概念 / 表达
    ("💡", ["概念", "想法", "思路", "什么是", "为什么", "定义", "灵感"]),
    ("⚠️", ["风险", "幻觉", "错误", "问题", "陷阱", "注意", "警告"]),
    ("❓", ["疑问", "提问", "问答", "如何", "怎么", "多少"]),
    ("✨", ["生成", "创作", "产出", "输出", "魔法", "亮点"]),
    ("💬", ["对话", "聊天", "沟通", "观点", "评价", "讨论"]),
    ("🎯", ["目标", "精准", "定位", "命中", "重点"]),
    ("🔍", ["检索", "搜索", "查找", "查询", "rag", "发现"]),
    ("📝", ["文章", "写作", "笔记", "记录", "清单", "文档"]),
    ("📚", ["知识", "学习", "训练", "语料", "文档", "教育", "课程"]),
    ("💡", ["提示", "tip"]),
    # 情绪 / 状态
    ("✅", ["完成", "成功", "正确", "通过", "优点", "优势"]),
    ("❌", ["失败", "错误", "禁止", "缺点", "劣势", "拒绝"]),
    ("❤️", ["喜欢", "热爱", "健康", "情感", "点赞"]),
    ("⭐", ["重要", "推荐", "精华", "亮点", "星级"]),
    ("🔥", ["热门", "流行", "火爆", "趋势", "风口"]),
    ("🚀", ["启动", "上线", "发布", "加速", "飞跃", "未来"]),
    ("🏆", ["第一", "冠军", "获奖", "最佳", "领先"]),
    ("🔑", ["关键", "核心", "秘诀", "要点", "答案"]),
    ("💎", ["价值", "珍贵", "精华", "高质量"]),
    ("👑", ["王者", "顶级", "最强", "排行"]),
    # 生活 / 领域
    ("💰", ["金钱", "收入", "成本", "价格", "变现", "赚钱", "预算"]),
    ("⏰", ["时间", "效率", "速度", " deadline ", "期限", "历史"]),
    ("🌐", ["互联网", "网络", "全球", "网站", "在线"]),
    ("📱", ["手机", "移动", "app", "应用"]),
    ("📧", ["邮件", "消息", "通知", "联系"]),
    ("🎬", ["视频", "影视", "动画", "剪辑", "演示"]),
    ("🎵", ["音乐", "音频", "配音", "声音", "音效"]),
    ("📷", ["图片", "照片", "拍摄", "截图"]),
    ("🎨", ["设计", "配色", "风格", "创意", "美化"]),
    ("🌱", ["成长", "入门", "新手", "起步", "环保"]),
    ("🏠", ["家庭", "家居", "生活", "本地"]),
    ("🚗", ["汽车", "出行", "交通", "驾驶"]),
    ("✈️", ["旅行", "航空", "出国", "远程"]),
    ("⚕️", ["医疗", "健康", "疾病", "治疗"]),
    ("⚖️", ["法律", "合规", "规则", "对比", "权衡"]),
    ("🍳", ["美食", "烹饪", "做饭", "餐饮"]),
    ("⚽", ["运动", "体育", "比赛", "健身"]),
    ("☀️", ["天气", "阳光", "白天", "环境"]),
    ("🌱", ["植物", "绿色"]),
]
DEFAULT_ICONS = {"concept": "💡", "process": "⚙️", "compare": "📊", "timeline": "📅", "stat": "📈", "quote": "💬", "qa": "❓"}


def parse_stat(item: str):
    """stat 条目解析 "数值|标签" → (数值, 标签)；无 | 时整串为数值。"""
    s = str(item)
    if "|" in s:
        v, l = s.split("|", 1)
        return v.strip(), l.strip()
    return s.strip(), ""


def pick_icon(scene: dict) -> str:
    """按场景文本关键词选图标（先命中共先得；无命中按类型取默认）。"""
    text = (str(scene.get("heading") or "") + " " +
            " ".join(str(x) for x in (scene.get("items") or []) + (scene.get("left") or []) + (scene.get("right") or []))).lower()
    for icon, kws in ICON_KEYWORDS:
        for kw in kws:
            kw = kw.strip()
            if kw and kw in text:
                return icon
    return DEFAULT_ICONS.get(str(scene.get("type") or "concept"), "💡")


def mix(c1, c2, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def wrap_by_width(text: str, max_w: float, measure) -> list:
    """按测量函数（字符→宽度）贪心换行。measure 可注入以便无字体测试。"""
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        if cur and measure(cur + ch) > max_w:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines or [""]


def truncate_lines(lines: list, max_lines: int) -> list:
    """超行数硬截断，末行加省略号。"""
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    kept[-1] = kept[-1][:-1] + "…"
    return kept


def scene_base_duration(scene: dict) -> float:
    """无旁白时的场景时长：显式 duration 优先；否则按条目数估算。"""
    try:
        d = float(scene.get("duration") or 0)
        if d >= 1.5:
            return d
    except (TypeError, ValueError):
        pass
    n = max(len(scene.get("items") or []), len(scene.get("left") or []), 1)
    return round(2.0 + 1.1 * n, 2)


def item_appear_t(i: int, count: int, dur: float, lead: float = 0.5) -> float:
    """第 i 个条目出现时刻（归一化进度），钳在 [0, dur*0.95]。"""
    if count <= 1:
        return min(lead * 0.5, dur / 2)
    span = max(dur - lead - 0.8, 0.5)
    t = lead * 0.5 + span * i / max(count - 1, 1)
    return max(0.0, min(t, dur * 0.95))


def process_boxes(n: int, W: int, H: int, y: int, box_w: int, box_h: int):
    """n 个流程框水平布局：[(x, y, w, h)]，均分居中，不出画面。"""
    if n <= 0:
        return []
    gap = max(40, (W - 160 - n * box_w) // max(n - 1, 1)) if n > 1 else 0
    total = n * box_w + (n - 1) * gap
    x0 = (W - total) // 2
    return [(x0 + i * (box_w + gap), y, box_w, box_h) for i in range(n)]


def compare_columns(W: int, H: int, y: int, h: int):
    gap = int(W * 0.05)
    col_w = (W - gap * 3) // 2
    return [(gap, y, col_w, h), (gap * 2 + col_w, y, col_w, h)]


def narration_text(scene: dict) -> str:
    """场景旁白文本：小标题 + 条目（自然口播断句）。"""
    parts = [str(scene.get("heading") or "").strip()]
    if scene.get("type") == "compare":
        for label, key in (("左边", "left"), ("右边", "right")):
            its = [str(x) for x in (scene.get(key) or [])]
            if its:
                parts.append(f"{label}{'，'.join(its)}")
    else:
        for x in (scene.get("items") or []):
            s = str(x).strip()
            if s:
                parts.append(s)
    return "。".join([p for p in parts if p]) + "。"


# ===== TTS（edge-tts；失败降级 None，不炸管线） =====

def tts_scene_audio(text: str, out_path: str, voice: str) -> float:
    """生成单场景旁白 mp3，返回时长；失败返回 0.0。"""
    try:
        import edge_tts

        async def _run():
            com = edge_tts.Communicate(text, voice)
            await com.save(out_path)

        asyncio.run(_run())
        ffprobe = find_ffprobe(find_ffmpeg())
        d = probe_duration(ffprobe, out_path)
        return d if d > 0.2 else 0.0
    except Exception as e:
        print(f"[anim] TTS 降级为静音（{e}）", file=sys.stderr)
        return 0.0


def write_chime_wav(path: str, rate: int = 24000) -> str:
    """结尾标志音效：上行双音（880 → 1318.5Hz）指数衰减，清脆"叮-叮✨"。零依赖纯合成。"""
    total = int(0.8 * rate)
    buf = [0.0] * total
    for tone, start, dur in ((880.0, 0.0, 0.30), (1318.5, 0.16, 0.55)):
        n_start = int(start * rate)
        n = int(dur * rate)
        for k in range(n):
            idx = n_start + k
            if idx >= total:
                break
            t = k / rate
            env = math.exp(-4.0 * t)
            buf[idx] += 0.50 * env * math.sin(2 * math.pi * tone * t)
    w = wave.open(path, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767)))) for v in buf))
    w.close()
    return path


# ===== 绘制辅助 =====

def draw_multiline(d, x: int, y: int, lines: list, font, fill, line_h: int, anchor="la"):
    for i, ln in enumerate(lines):
        d.text((x, y + i * line_h), ln, font=font, fill=fill, anchor=anchor)


def fit_text_block(text, font, max_w: float, max_lines: int, measure) -> list:
    return truncate_lines(wrap_by_width(text, max_w, measure), max_lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", default="")
    ap.add_argument("--bgm", default="", help="可选背景音乐（音量 0.10，与旁白混音）")
    args = ap.parse_args()

    with open(args.input, "r", encoding="utf-8-sig") as f:
        script = json.load(f)
    title = str(script.get("title") or "科普动画").strip() or "科普动画"
    W, H = ASPECTS.get(str(script.get("aspect") or "16:9"), ASPECTS["16:9"])
    theme = THEMES.get(str(script.get("theme") or "dark"), THEMES["dark"])
    fps = min(max(int(script.get("fps") or 10), 5), 30)
    voice = str(script.get("voice") or "zh-CN-YunxiNeural").strip()
    scenes_in = script.get("scenes") or []
    if not scenes_in:
        raise SystemExit("script.scenes 为空：至少一个场景")
    scenes = scenes_in[:8]
    outro = str(script.get("outro") or "").strip()

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise SystemExit(
            "缺少 Pillow 依赖（动画渲染必需）。请执行：\n"
            "  python -m pip install pillow\n"
            "（若 pip 被系统代理打挂：先设 NO_PROXY=* 再装）装好后重试 anim_compose。"
        )

    def font(px, bold=False):
        name = "msyhbd.ttc" if bold else "msyh.ttc"
        p = os.path.join("C:/Windows/Fonts", name)
        if not os.path.exists(p):
            p = os.path.join("C:/Windows/Fonts", "msyh.ttc")
        return ImageFont.truetype(p, px)

    # 字号（相对画幅；9:16 竖屏略收）
    f_head = font(int(H * 0.048), bold=True)
    f_item = font(int(H * 0.034))
    f_small = font(int(H * 0.024))
    f_outro = font(int(H * 0.045), bold=True)
    measure = lambda s: f_item.getlength(s)   # noqa: E731
    # 彩色 emoji 图标（Segoe UI Emoji COLR 字体；加载失败则跳过图标层）
    try:
        f_emoji = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", int(H * 0.050))
    except Exception:
        f_emoji = None

    tmp = os.path.join(os.path.dirname(os.path.abspath(args.out or ".")), ".anim-work")
    os.makedirs(tmp, exist_ok=True)

    # ---- 1) 旁白 TTS（逐场景）→ 场景时长 = max(估算, 语音+1.0s) ----
    audio_files, durs, a_durs = [], [], []
    use_tts = voice.lower() != "off"
    for si, sc in enumerate(scenes):
        ap_path = os.path.join(tmp, f"narr_{si}.mp3")
        a_dur = tts_scene_audio(narration_text(sc), ap_path, voice) if use_tts else 0.0
        if a_dur <= 0 and os.path.exists(ap_path):
            os.remove(ap_path)
        base = scene_base_duration(sc)
        dur = round(max(base, a_dur + 1.2), 2) if a_dur > 0 else base
        audio_files.append(ap_path if a_dur > 0 else None)
        a_durs.append(a_dur)
        durs.append(dur)
    outro_dur = 2.6 if outro else 0.0
    total = round(sum(durs) + outro_dur, 2)

    # ---- 2) 静态背景层（每场景一次）：渐变 + 装饰色块 ----
    def build_bg(si: int):
        img = Image.new("RGB", (W, H))
        px = img.load()
        for y in range(H):
            t = y / max(H - 1, 1)
            c = mix(theme["bg_top"], theme["bg_bot"], t)
            for x in range(W):
                px[x, y] = c
        d = ImageDraw.Draw(img, "RGBA")
        # 低对比装饰圆（各场景位置略移，观感不重样）
        offs = si * 0.13
        d.ellipse([int(-W * 0.18), int(H * (0.05 + offs)), int(W * 0.28), int(H * (0.45 + offs))],
                  fill=theme["accent"] + (14,))
        d.ellipse([int(W * 0.72), int(H * (0.55 - offs)), int(W * 1.18), int(H * (0.95 - offs))],
                  fill=theme["accent2"] + (12,))
        # 细点阵纹理（低调，给纯色底加质感）
        dot_c = (255, 255, 255, 9) if theme is THEMES["dark"] else (0, 0, 0, 14)
        step = int(W * 0.055)
        for gx in range(int(W * 0.06), W - int(W * 0.06), step):
            for gy in range(int(H * 0.11), int(H * 0.94), step):
                d.ellipse([gx, gy, gx + 3, gy + 3], fill=dot_c)
        # 大圆环描边（几何趣味，位置随场景轮换）
        d.ellipse([int(W * 0.60), int(H * (0.06 + offs * 0.4)), int(W * 0.94), int(H * (0.26 + offs * 0.4))],
                  outline=theme["accent"] + (26,), width=3)
        # 角落光斑（同心圆模拟径向光）
        gx, gy = int(W * 0.90), int(H * 0.09)
        for rr, aa in ((int(W * 0.09), 8), (int(W * 0.055), 12), (int(W * 0.028), 18)):
            d.ellipse([gx - rr, gy - rr, gx + rr, gy + rr], fill=theme["accent"] + (aa,))
        # 顶部标题带
        d.rectangle([0, 0, W, int(H * 0.075)], fill=(0, 0, 0, 110))
        d.rectangle([0, int(H * 0.075) - 3, W, int(H * 0.075)], fill=theme["accent"] + (200,))
        return img

    backgrounds = [build_bg(si) for si in range(len(scenes))]

    # ---- 3) 音轨拼接（老版 ffmpeg 安全口径：分段 wav + concat 滤镜，不用 adelay/normalize）----
    ffmpeg = find_ffmpeg()
    ffprobe = find_ffprobe(ffmpeg)
    starts = []
    t0 = 0.0
    for d in durs:
        starts.append(t0)
        t0 += d
    RATE = 24000

    def silence_seg(seconds: float) -> str:
        p = os.path.join(tmp, f"sil_{len(seg_files)}.wav")
        w = wave.open(p, "wb")
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"\x00\x00" * int(RATE * max(seconds, 0)))
        w.close()
        return p

    seg_files = []          # 顺序音频段（wav 24k mono），总长 = total
    for si in range(len(scenes)):
        af, a = audio_files[si], a_durs[si]
        if af and os.path.exists(af) and a > 0:
            # 场景 mp3 → 统一 24k mono wav（concat 滤镜要求同格式）
            wp = os.path.join(tmp, f"seg_{si}.wav")
            run_quiet([ffmpeg, "-y", "-v", "error", "-i", af, "-ar", str(RATE), "-ac", "1", wp])
            if os.path.exists(wp):
                seg_files.append(silence_seg(0.5))          # 场景头余量：旁白在场景起点后 0.5s 开口
                seg_files.append(wp)
                gap = durs[si] - 0.5 - a
                seg_files.append(silence_seg(gap if gap > 0.05 else 0.05))
            else:
                seg_files.append(silence_seg(durs[si]))
        else:
            seg_files.append(silence_seg(durs[si]))
    if outro_dur > 0:
        # 结尾标志音效：上行双音"叮-叮✨"（0.3s 静音后插入，占 outro 前 1.1s）
        chime = os.path.join(tmp, "chime.wav")
        write_chime_wav(chime, RATE)
        seg_files.append(silence_seg(0.3))
        seg_files.append(chime)
        rest = outro_dur - 0.3 - 0.8
        if rest > 0.05:
            seg_files.append(silence_seg(rest))
    has_narration = any(audio_files)

    cmd = [ffmpeg, "-y", "-v", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-"]
    has_audio = False
    if has_narration:
        for f in seg_files:
            cmd += ["-i", f]
        concat_in = "".join(f"[{i + 1}:a]" for i in range(len(seg_files)))
        if args.bgm and os.path.exists(args.bgm):
            cmd += ["-stream_loop", "-1", "-i", args.bgm]
            bg_idx = len(seg_files) + 1
            cmd += ["-filter_complex",
                    f"{concat_in}concat=n={len(seg_files)}:v=0:a=1[nar];[nar][{bg_idx}:a]amix=inputs=2:duration=first[a]",
                    "-map", "0:v", "-map", "[a]"]
        else:
            cmd += ["-filter_complex",
                    f"{concat_in}concat=n={len(seg_files)}:v=0:a=1[nar]",
                    "-map", "0:v", "-map", "[nar]"]
        has_audio = True
    elif args.bgm and os.path.exists(args.bgm):
        cmd += ["-stream_loop", "-1", "-i", args.bgm,
                "-filter_complex", "[1:a]volume=0.10[a]", "-map", "0:v", "-map", "[a]"]
        has_audio = True
    cmd += ["-t", str(total), "-c:v", "libx264", "-preset", "fast", "-crf", "21",
            "-pix_fmt", "yuv420p", "-shortest"]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "128k"]
    cmd += [args.out or os.path.join(os.path.dirname(os.path.abspath(args.input)),
                                     "anim_" + title.replace("/", "_") + ".mp4")]
    out = cmd[-1]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=CREATE_NO_WINDOW)

    def emit(img):
        proc.stdin.write(img.tobytes())

    try:
        # 场景帧
        for si, sc in enumerate(scenes):
            dur = durs[si]
            nframes = max(int(dur * fps), 2)
            bg = backgrounds[si]
            scene_icon = pick_icon(sc)
            stype = sc.get("type") or "concept"
            heading = str(sc.get("heading") or "").strip()
            # 横屏 = PPT 讲稿式布局（更大留白、内容区更宽）；竖屏 = 手机沉浸式
            is_portrait = H > W
            body_top = int(H * (0.20 if is_portrait else 0.27))
            body_bot = int(H * (0.92 if is_portrait else 0.90))
            margin_x = int(W * (0.09 if is_portrait else 0.13))
            max_w = W - margin_x * 2

            if stype == "concept":
                items = [str(x) for x in (sc.get("items") or [])][:ITEMS_MAX]
                n = max(len(items), 1)
                line_h = int(H * 0.038)
                row_gap = int(H * 0.028)
                # 预排版：每条目的换行行数决定行高，保证不重叠
                blocks = []
                ycur = body_top + int(H * 0.10)
                avail = body_bot - ycur
                row_h_est = int((avail - row_gap * max(n - 1, 0)) / max(n, 1))
                for i, it in enumerate(items):
                    lines = fit_text_block(it, f_item, max_w - int(H * 0.075), 3, measure)
                    bh = len(lines) * line_h
                    blocks.append((it, lines, bh))
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    # 标题
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 场景图标（关键词自动匹配，回弹 pop-in）
                    if f_emoji is not None:
                        iph = max(0.0, ease_out_back(min(p / 0.30, 1.0)))
                        ic_r = int(H * 0.045)
                        icx, icy = W - margin_x - ic_r, int(body_top * 0.72)
                        d.ellipse([icx - ic_r, icy - ic_r, icx + ic_r, icy + ic_r],
                                  fill=theme["accent"] + (40,))
                        d.text((icx, icy), scene_icon, font=f_emoji,
                               fill=theme["fg"] + (int(255 * iph),), anchor="mm", embedded_color=True)
                    # 漂浮光点（缓慢游动，给画面加"活"感）
                    tg = starts[si] + p * dur
                    for pi in range(3):
                        pxx = int(W * (0.18 + 0.30 * abs(math.sin(tg * 0.45 + pi * 2.1))))
                        pyy = int(H * (0.30 + 0.22 * abs(math.cos(tg * 0.35 + pi * 1.7))))
                        pr = max(3, int(H * 0.004))
                        d.ellipse([pxx - pr, pyy - pr, pxx + pr, pyy + pr], fill=theme["accent"] + (30,))
                    # 转场扫光（场景开头一道快速扫过的亮线）
                    if p < 0.10:
                        sxp = int(W * (p / 0.10))
                        d.rectangle([max(0, sxp - 5), 0, min(W, sxp + 5), H], fill=theme["accent"] + (70,))
                    ycur = body_top + int(H * 0.10)
                    for i, (it, lines, bh) in enumerate(blocks):
                        ap = item_appear_t(i, n, 1.0, lead=0.45)
                        ip = ease_out((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * ip)
                        r = int(line_h * 0.42 * max(ease_out_back(ip), 0.0))
                        cy = ycur + bh // 2
                        d.ellipse([margin_x, cy - r, margin_x + 2 * r, cy + r],
                                  fill=theme["accent"] + (alpha,))
                        d.text((margin_x + r, cy), str(i + 1), font=f_small,
                               fill=theme["bg_top"] + (alpha,), anchor="lm")
                        for li, ln in enumerate(lines):
                            d.text((margin_x + 2 * r + int(W * 0.03),
                                   ycur + li * line_h - int(line_h * 0.15)),
                                   ln, font=f_item, fill=theme["fg"] + (alpha,))
                        ycur += bh + row_gap
                    # 场景进度
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    # 场景转场：整体从背景淡入（fade-through-background）
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "timeline":
                # 时间线：水平轴线 + 节点 pop + 节点标题（"标题|描述"可选描述）
                items = [str(x) for x in (sc.get("items") or [])][:5]
                n = max(len(items), 1)
                axis_y = body_top + int(H * 0.24)
                f_node = font(int(H * 0.028))
                node_w = (W - margin_x * 2) / n
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 轴线随进度延伸
                    d.line([margin_x, axis_y, margin_x + int((W - margin_x * 2) * ease_out(p / 0.5)), axis_y],
                           fill=theme["line"] + (255,), width=4)
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + node_w * (i + 0.5))
                        r = int(H * 0.018 * max(ip, 0.0))
                        d.ellipse([cx - r, axis_y - r, cx + r, axis_y + r],
                                  fill=theme["accent"] + (alpha,), outline=theme["bg_top"] + (alpha,), width=3)
                        parts = it.split("|", 1)
                        lbl_lines = fit_text_block(parts[0], f_node, node_w - 24, 2, lambda s: f_node.getlength(s))
                        for li, ln in enumerate(lbl_lines):
                            d.text((cx, axis_y + int(H * 0.035) + li * int(H * 0.032)), ln,
                                   font=f_node, fill=theme["fg"] + (alpha,), anchor="ma")
                        if len(parts) > 1 and parts[1].strip():
                            dsc = fit_text_block(parts[1], f_small, node_w - 24, 3, lambda s: f_small.getlength(s))
                            dy0 = axis_y + int(H * 0.035) + len(lbl_lines) * int(H * 0.032) + 6
                            for li, ln in enumerate(dsc):
                                d.text((cx, dy0 + li * int(H * 0.026)), ln,
                                       font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "quote":
                # 金句卡：大字引言居中 + 署名，节奏调剂
                f_quote = font(int(H * 0.052), bold=True)
                q_lines = fit_text_block(heading or "“”", f_quote, max_w, 4, lambda s: f_quote.getlength(s))
                author = str(sc.get("note") or sc.get("items") and (sc.get("items") or [""])[0] or "")
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    ip = ease_out(p / 0.35)
                    alpha = int(255 * ip)
                    d.text((margin_x, int(body_top * 0.9)), "“", font=f_outro,
                           fill=theme["accent"] + (int(150 * ip),))
                    th = len(q_lines) * int(H * 0.075)
                    for li, ln in enumerate(q_lines):
                        d.text((W / 2, H / 2 - th / 2 + li * int(H * 0.075)), ln,
                               font=f_quote, fill=theme["fg"] + (alpha,), anchor="mm")
                    if author.strip():
                        d.text((W / 2, H / 2 + th / 2 + int(H * 0.06)), f"—— {author.strip()}",
                               font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "stat":
                # 数据强调：最多 3 个大数字并排（"90%|用户…"），数值回弹 pop
                items = [str(x) for x in (sc.get("items") or [])][:3]
                n = max(len(items), 1)
                f_big = font(int(H * (0.085 if is_portrait else 0.095)), bold=True)
                col_w = (W - margin_x * 2) / n
                val_y = body_top + int(H * 0.20)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + col_w * (i + 0.5))
                        val, lbl = parse_stat(it)
                        d.text((cx, val_y + int(H * 0.10)), val, font=f_big,
                               fill=theme["accent"] + (alpha,), anchor="mm")
                        if lbl:
                            for li, ln in enumerate(fit_text_block(lbl, f_item, col_w - 30, 2, measure)):
                                d.text((cx, val_y + int(H * 0.17) + li * int(H * 0.038)), ln,
                                       font=f_item, fill=theme["fg"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "qa":
                # 问答揭示：问题大字 → 答案卡片 0.45 后揭示（悬念节奏）
                answer_items = [str(x) for x in (sc.get("items") or [])][:3]
                f_ans = font(int(H * 0.032))
                card_y, card_h = body_top + int(H * 0.24), int(H * 0.38)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    rp = ease_out((p - 0.45) / 0.2) if p > 0.45 else 0.0
                    if rp > 0:
                        alpha = int(255 * rp)
                        oy = int((1 - rp) * 40)
                        d.rounded_rectangle([margin_x, card_y + oy, W - margin_x, card_y + card_h + oy],
                                            radius=20, fill=theme["panel"] + (alpha,),
                                            outline=theme["accent"] + (alpha,), width=3)
                        ycur = card_y + oy + int(card_h * 0.10)
                        for i, it in enumerate(answer_items):
                            lines = fit_text_block(("• " if len(answer_items) > 1 else "") + it,
                                                   f_ans, W - margin_x * 2 - int(W * 0.08), 2, measure)
                            for li, ln in enumerate(lines):
                                d.text((margin_x + int(W * 0.04), ycur + li * int(H * 0.034)),
                                       ln, font=f_ans, fill=theme["fg"] + (alpha,))
                            ycur += len(lines) * int(H * 0.034) + int(H * 0.018)
                    else:
                        d.text((W / 2, card_y + card_h / 2), "……", font=f_outro,
                               fill=theme["muted"] + (int(255 * hp),), anchor="mm")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "process":
                items = [str(x) for x in (sc.get("items") or [])][:5]
                n = max(len(items), 1)
                box_w = min(int((W - margin_x * 2 - (n - 1) * int(W * 0.04)) / n), int(W * 0.30))
                box_h = int(H * 0.16)
                by = body_top + int(H * 0.16)
                boxes = process_boxes(n, W, H, by, box_w, box_h)
                f_box = font(max(16, int(box_w / max(4, max(len(x) for x in items or ["1"])) * 1.6)))
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 场景图标（关键词自动匹配，回弹 pop-in）
                    if f_emoji is not None:
                        iph = max(0.0, ease_out_back(min(p / 0.30, 1.0)))
                        ic_r = int(H * 0.045)
                        icx, icy = W - margin_x - ic_r, int(body_top * 0.72)
                        d.ellipse([icx - ic_r, icy - ic_r, icx + ic_r, icy + ic_r],
                                  fill=theme["accent"] + (40,))
                        d.text((icx, icy), scene_icon, font=f_emoji,
                               fill=theme["fg"] + (int(255 * iph),), anchor="mm", embedded_color=True)
                    # 漂浮光点（缓慢游动，给画面加"活"感）
                    tg = starts[si] + p * dur
                    for pi in range(3):
                        pxx = int(W * (0.18 + 0.30 * abs(math.sin(tg * 0.45 + pi * 2.1))))
                        pyy = int(H * (0.30 + 0.22 * abs(math.cos(tg * 0.35 + pi * 1.7))))
                        pr = max(3, int(H * 0.004))
                        d.ellipse([pxx - pr, pyy - pr, pxx + pr, pyy + pr], fill=theme["accent"] + (30,))
                    # 转场扫光（场景开头一道快速扫过的亮线）
                    if p < 0.10:
                        sxp = int(W * (p / 0.10))
                        d.rectangle([max(0, sxp - 5), 0, min(W, sxp + 5), H], fill=theme["accent"] + (70,))
                    for i, (bx, byy, bw, bh) in enumerate(boxes):
                        ap = item_appear_t(i, n, 1.0, lead=0.45)
                        ip = ease_out((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * ip)
                        oy = int((1 - ip) * 30)
                        d.rounded_rectangle([bx, byy + oy, bx + bw, byy + bh + oy], radius=16,
                                            fill=theme["panel"] + (alpha,), outline=theme["accent"] + (alpha,), width=3)
                        lines = fit_text_block(items[i], f_box, bw - 24, 2, lambda s: f_box.getlength(s))
                        th = len(lines) * int(H * 0.03)
                        for li, ln in enumerate(lines):
                            d.text((bx + bw / 2, byy + oy + bh / 2 - th / 2 + li * int(H * 0.03)),
                                   ln, font=f_box, fill=theme["fg"] + (alpha,), anchor="ma")
                        if i < n - 1 and p > item_appear_t(i + 1, n, 1.0, lead=0.45):
                            ax0, ax1 = bx + bw + 6, boxes[i + 1][0] - 6
                            ay = byy + bh // 2
                            d.line([ax0, ay, ax1 - 10, ay], fill=theme["accent"] + (220,), width=4)
                            d.polygon([(ax1, ay), (ax1 - 13, ay - 8), (ax1 - 13, ay + 8)], fill=theme["accent"] + (220,))
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    # 场景转场：整体从背景淡入（fade-through-background）
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "timeline":
                # 时间线：水平轴线 + 节点 pop + 节点标题（"标题|描述"可选描述）
                items = [str(x) for x in (sc.get("items") or [])][:5]
                n = max(len(items), 1)
                axis_y = body_top + int(H * 0.24)
                f_node = font(int(H * 0.028))
                node_w = (W - margin_x * 2) / n
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 轴线随进度延伸
                    d.line([margin_x, axis_y, margin_x + int((W - margin_x * 2) * ease_out(p / 0.5)), axis_y],
                           fill=theme["line"] + (255,), width=4)
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + node_w * (i + 0.5))
                        r = int(H * 0.018 * max(ip, 0.0))
                        d.ellipse([cx - r, axis_y - r, cx + r, axis_y + r],
                                  fill=theme["accent"] + (alpha,), outline=theme["bg_top"] + (alpha,), width=3)
                        parts = it.split("|", 1)
                        lbl_lines = fit_text_block(parts[0], f_node, node_w - 24, 2, lambda s: f_node.getlength(s))
                        for li, ln in enumerate(lbl_lines):
                            d.text((cx, axis_y + int(H * 0.035) + li * int(H * 0.032)), ln,
                                   font=f_node, fill=theme["fg"] + (alpha,), anchor="ma")
                        if len(parts) > 1 and parts[1].strip():
                            dsc = fit_text_block(parts[1], f_small, node_w - 24, 3, lambda s: f_small.getlength(s))
                            dy0 = axis_y + int(H * 0.035) + len(lbl_lines) * int(H * 0.032) + 6
                            for li, ln in enumerate(dsc):
                                d.text((cx, dy0 + li * int(H * 0.026)), ln,
                                       font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "quote":
                # 金句卡：大字引言居中 + 署名，节奏调剂
                f_quote = font(int(H * 0.052), bold=True)
                q_lines = fit_text_block(heading or "“”", f_quote, max_w, 4, lambda s: f_quote.getlength(s))
                author = str(sc.get("note") or sc.get("items") and (sc.get("items") or [""])[0] or "")
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    ip = ease_out(p / 0.35)
                    alpha = int(255 * ip)
                    d.text((margin_x, int(body_top * 0.9)), "“", font=f_outro,
                           fill=theme["accent"] + (int(150 * ip),))
                    th = len(q_lines) * int(H * 0.075)
                    for li, ln in enumerate(q_lines):
                        d.text((W / 2, H / 2 - th / 2 + li * int(H * 0.075)), ln,
                               font=f_quote, fill=theme["fg"] + (alpha,), anchor="mm")
                    if author.strip():
                        d.text((W / 2, H / 2 + th / 2 + int(H * 0.06)), f"—— {author.strip()}",
                               font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "stat":
                # 数据强调：最多 3 个大数字并排（"90%|用户…"），数值回弹 pop
                items = [str(x) for x in (sc.get("items") or [])][:3]
                n = max(len(items), 1)
                f_big = font(int(H * (0.085 if is_portrait else 0.095)), bold=True)
                col_w = (W - margin_x * 2) / n
                val_y = body_top + int(H * 0.20)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + col_w * (i + 0.5))
                        val, lbl = parse_stat(it)
                        d.text((cx, val_y + int(H * 0.10)), val, font=f_big,
                               fill=theme["accent"] + (alpha,), anchor="mm")
                        if lbl:
                            for li, ln in enumerate(fit_text_block(lbl, f_item, col_w - 30, 2, measure)):
                                d.text((cx, val_y + int(H * 0.17) + li * int(H * 0.038)), ln,
                                       font=f_item, fill=theme["fg"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "qa":
                # 问答揭示：问题大字 → 答案卡片 0.45 后揭示（悬念节奏）
                answer_items = [str(x) for x in (sc.get("items") or [])][:3]
                f_ans = font(int(H * 0.032))
                card_y, card_h = body_top + int(H * 0.24), int(H * 0.38)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    rp = ease_out((p - 0.45) / 0.2) if p > 0.45 else 0.0
                    if rp > 0:
                        alpha = int(255 * rp)
                        oy = int((1 - rp) * 40)
                        d.rounded_rectangle([margin_x, card_y + oy, W - margin_x, card_y + card_h + oy],
                                            radius=20, fill=theme["panel"] + (alpha,),
                                            outline=theme["accent"] + (alpha,), width=3)
                        ycur = card_y + oy + int(card_h * 0.10)
                        for i, it in enumerate(answer_items):
                            lines = fit_text_block(("• " if len(answer_items) > 1 else "") + it,
                                                   f_ans, W - margin_x * 2 - int(W * 0.08), 2, measure)
                            for li, ln in enumerate(lines):
                                d.text((margin_x + int(W * 0.04), ycur + li * int(H * 0.034)),
                                       ln, font=f_ans, fill=theme["fg"] + (alpha,))
                            ycur += len(lines) * int(H * 0.034) + int(H * 0.018)
                    else:
                        d.text((W / 2, card_y + card_h / 2), "……", font=f_outro,
                               fill=theme["muted"] + (int(255 * hp),), anchor="mm")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "compare":
                left = [str(x) for x in (sc.get("left") or [])][:ITEMS_MAX]
                right = [str(x) for x in (sc.get("right") or [])][:ITEMS_MAX]
                col_y = body_top + int(H * 0.12)
                col_h = int(H * 0.46)
                cols = compare_columns(W, H, col_y, col_h)
                col_line_h = int(H * 0.034)
                col_font = font(int(H * 0.030))
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 场景图标（关键词自动匹配，回弹 pop-in）
                    if f_emoji is not None:
                        iph = max(0.0, ease_out_back(min(p / 0.30, 1.0)))
                        ic_r = int(H * 0.045)
                        icx, icy = W - margin_x - ic_r, int(body_top * 0.72)
                        d.ellipse([icx - ic_r, icy - ic_r, icx + ic_r, icy + ic_r],
                                  fill=theme["accent"] + (40,))
                        d.text((icx, icy), scene_icon, font=f_emoji,
                               fill=theme["fg"] + (int(255 * iph),), anchor="mm", embedded_color=True)
                    # 漂浮光点（缓慢游动，给画面加"活"感）
                    tg = starts[si] + p * dur
                    for pi in range(3):
                        pxx = int(W * (0.18 + 0.30 * abs(math.sin(tg * 0.45 + pi * 2.1))))
                        pyy = int(H * (0.30 + 0.22 * abs(math.cos(tg * 0.35 + pi * 1.7))))
                        pr = max(3, int(H * 0.004))
                        d.ellipse([pxx - pr, pyy - pr, pxx + pr, pyy + pr], fill=theme["accent"] + (30,))
                    # 转场扫光（场景开头一道快速扫过的亮线）
                    if p < 0.10:
                        sxp = int(W * (p / 0.10))
                        d.rectangle([max(0, sxp - 5), 0, min(W, sxp + 5), H], fill=theme["accent"] + (70,))
                    for ci, (direction, its, mark, mk_color) in enumerate(
                            [(-1, left, "✗", theme["muted"]), (1, right, "✓", theme["accent"])]):
                        cx, cy, cw, ch = cols[ci]
                        ip = ease_out(p / 0.28) if p < 0.28 else 1.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * ip)
                        ox = int(direction * (1 - ip) * W * 0.22)
                        d.rounded_rectangle([cx + ox, cy, cx + cw + ox, cy + ch], radius=20,
                                            fill=theme["panel"] + (alpha,), outline=theme["line"] + (alpha,), width=2)
                        d.text((cx + ox + int(cw * 0.08), cy + int(ch * 0.07)), mark,
                               font=f_head, fill=mk_color + (alpha,))
                        for i, it in enumerate(its):
                            ap = 0.28 + 0.13 * i
                            ip2 = ease_out((p - ap) / 0.15) if p > ap else 0.0
                            if ip2 <= 0:
                                continue
                            lines = fit_text_block(it, col_font, cw - int(cw * 0.16), 2, lambda s: col_font.getlength(s))
                            for li, ln in enumerate(lines):
                                d.text((cx + ox + int(cw * 0.09),
                                        cy + int(ch * 0.26) + i * col_line_h * 2 + li * col_line_h),
                                       ln, font=col_font, fill=theme["fg"] + (int(255 * ip2),))
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    # 场景转场：整体从背景淡入（fade-through-background）
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "timeline":
                # 时间线：水平轴线 + 节点 pop + 节点标题（"标题|描述"可选描述）
                items = [str(x) for x in (sc.get("items") or [])][:5]
                n = max(len(items), 1)
                axis_y = body_top + int(H * 0.24)
                f_node = font(int(H * 0.028))
                node_w = (W - margin_x * 2) / n
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    # 轴线随进度延伸
                    d.line([margin_x, axis_y, margin_x + int((W - margin_x * 2) * ease_out(p / 0.5)), axis_y],
                           fill=theme["line"] + (255,), width=4)
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + node_w * (i + 0.5))
                        r = int(H * 0.018 * max(ip, 0.0))
                        d.ellipse([cx - r, axis_y - r, cx + r, axis_y + r],
                                  fill=theme["accent"] + (alpha,), outline=theme["bg_top"] + (alpha,), width=3)
                        parts = it.split("|", 1)
                        lbl_lines = fit_text_block(parts[0], f_node, node_w - 24, 2, lambda s: f_node.getlength(s))
                        for li, ln in enumerate(lbl_lines):
                            d.text((cx, axis_y + int(H * 0.035) + li * int(H * 0.032)), ln,
                                   font=f_node, fill=theme["fg"] + (alpha,), anchor="ma")
                        if len(parts) > 1 and parts[1].strip():
                            dsc = fit_text_block(parts[1], f_small, node_w - 24, 3, lambda s: f_small.getlength(s))
                            dy0 = axis_y + int(H * 0.035) + len(lbl_lines) * int(H * 0.032) + 6
                            for li, ln in enumerate(dsc):
                                d.text((cx, dy0 + li * int(H * 0.026)), ln,
                                       font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "quote":
                # 金句卡：大字引言居中 + 署名，节奏调剂
                f_quote = font(int(H * 0.052), bold=True)
                q_lines = fit_text_block(heading or "“”", f_quote, max_w, 4, lambda s: f_quote.getlength(s))
                author = str(sc.get("note") or sc.get("items") and (sc.get("items") or [""])[0] or "")
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    ip = ease_out(p / 0.35)
                    alpha = int(255 * ip)
                    d.text((margin_x, int(body_top * 0.9)), "“", font=f_outro,
                           fill=theme["accent"] + (int(150 * ip),))
                    th = len(q_lines) * int(H * 0.075)
                    for li, ln in enumerate(q_lines):
                        d.text((W / 2, H / 2 - th / 2 + li * int(H * 0.075)), ln,
                               font=f_quote, fill=theme["fg"] + (alpha,), anchor="mm")
                    if author.strip():
                        d.text((W / 2, H / 2 + th / 2 + int(H * 0.06)), f"—— {author.strip()}",
                               font=f_small, fill=theme["muted"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "stat":
                # 数据强调：最多 3 个大数字并排（"90%|用户…"），数值回弹 pop
                items = [str(x) for x in (sc.get("items") or [])][:3]
                n = max(len(items), 1)
                f_big = font(int(H * (0.085 if is_portrait else 0.095)), bold=True)
                col_w = (W - margin_x * 2) / n
                val_y = body_top + int(H * 0.20)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    for i, it in enumerate(items):
                        ap = item_appear_t(i, n, 1.0, lead=0.4)
                        ip = ease_out_back((p - ap) / 0.15) if p > ap else 0.0
                        if ip <= 0:
                            continue
                        alpha = int(255 * min(ip, 1.0))
                        cx = int(margin_x + col_w * (i + 0.5))
                        val, lbl = parse_stat(it)
                        d.text((cx, val_y + int(H * 0.10)), val, font=f_big,
                               fill=theme["accent"] + (alpha,), anchor="mm")
                        if lbl:
                            for li, ln in enumerate(fit_text_block(lbl, f_item, col_w - 30, 2, measure)):
                                d.text((cx, val_y + int(H * 0.17) + li * int(H * 0.038)), ln,
                                       font=f_item, fill=theme["fg"] + (alpha,), anchor="ma")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
            elif stype == "qa":
                # 问答揭示：问题大字 → 答案卡片 0.45 后揭示（悬念节奏）
                answer_items = [str(x) for x in (sc.get("items") or [])][:3]
                f_ans = font(int(H * 0.032))
                card_y, card_h = body_top + int(H * 0.24), int(H * 0.38)
                for fi in range(nframes):
                    p = fi / max(nframes - 1, 1)
                    img = bg.copy().convert("RGBA")
                    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    d = ImageDraw.Draw(ov)
                    hp = ease_out(p / 0.22)
                    d.text((margin_x, int(body_top * (0.55 + 0.45 * hp))), heading,
                           font=f_head, fill=theme["fg"] + (int(255 * hp),))
                    rp = ease_out((p - 0.45) / 0.2) if p > 0.45 else 0.0
                    if rp > 0:
                        alpha = int(255 * rp)
                        oy = int((1 - rp) * 40)
                        d.rounded_rectangle([margin_x, card_y + oy, W - margin_x, card_y + card_h + oy],
                                            radius=20, fill=theme["panel"] + (alpha,),
                                            outline=theme["accent"] + (alpha,), width=3)
                        ycur = card_y + oy + int(card_h * 0.10)
                        for i, it in enumerate(answer_items):
                            lines = fit_text_block(("• " if len(answer_items) > 1 else "") + it,
                                                   f_ans, W - margin_x * 2 - int(W * 0.08), 2, measure)
                            for li, ln in enumerate(lines):
                                d.text((margin_x + int(W * 0.04), ycur + li * int(H * 0.034)),
                                       ln, font=f_ans, fill=theme["fg"] + (alpha,))
                            ycur += len(lines) * int(H * 0.034) + int(H * 0.018)
                    else:
                        d.text((W / 2, card_y + card_h / 2), "……", font=f_outro,
                               fill=theme["muted"] + (int(255 * hp),), anchor="mm")
                    d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                    img = Image.alpha_composite(img, ov).convert("RGB")
                    fe = ease_out(min(p / 0.32, 1.0))
                    if fe < 1.0:
                        img = Image.blend(bg, img, fe)
                    emit(img)
        # 片尾
        if outro_dur:
            nframes = max(int(outro_dur * fps), 2)
            for fi in range(nframes):
                p = fi / max(nframes - 1, 1)
                img = backgrounds[-1].copy().convert("RGBA")
                ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                d = ImageDraw.Draw(ov)
                op = ease_out(p / 0.35) if p < 0.35 else 1.0
                lines = fit_text_block(outro, f_outro, W - margin_x * 2, 2, lambda s: f_outro.getlength(s))
                for li, ln in enumerate(lines):
                    d.text((W / 2, H / 2 - len(lines) * int(H * 0.03) + li * int(H * 0.06)), ln,
                           font=f_outro, fill=theme["fg"] + (int(255 * op),), anchor="mm")
                d.rectangle([0, H - 5, int(W * p), H], fill=theme["accent"] + (160,))
                img = Image.alpha_composite(img, ov).convert("RGB")
                emit(img)
    finally:
        try:
            proc.stdin.close()
        except Exception:
            pass
    _, stderr = proc.communicate(timeout=600)
    if proc.returncode != 0:
        print((stderr or b"").decode("utf-8", "ignore")[-3000:], file=sys.stderr)
        sys.exit(proc.returncode or 1)
    print(f"[anim] {out} ({total:.1f}s, {len(scenes)} scenes, fps={fps}, {'TTS' if has_narration else 'silent'})")


if __name__ == "__main__":
    main()
