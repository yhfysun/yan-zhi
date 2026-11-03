#!/usr/bin/env python3
"""生成弹幕游戏·赤壁的程序化美术素材。

方案约定（docs/弹幕游戏方案-2026-10-30.md）：走「地面背景 1 张 + 船/兵序列帧图集」，不上 Tiled。
产物（2x，与 chibi.ts 的 isoP 逻辑坐标 360x640 对齐）：
  packages/ui/src/assets/danmaku/ground.png  720x1280  天空 + 远山 + 等距地块 + 长江
  packages/ui/src/assets/danmaku/ships.png   1024x128 船序列帧（曹军 4 帧 + 联军 4 帧，每帧 128）
  packages/ui/src/assets/danmaku/squads.png  512x96   小队序列帧（曹军 2 帧 + 联军 2 帧，每帧 128x96）

用法：python scripts/gen-danmaku-art.py
依赖：Pillow、numpy（本机已有）。改完脚本重跑即可，产物随代码提交。
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "ui", "src", "assets", "danmaku")

# 逻辑画布 360x640，素材 2x
W2, H2 = 720, 1280


def iso_p(gx: float, gy: float) -> tuple[float, float]:
    """与 chibi.ts 的 isoP 一致（逻辑坐标），返回 2x 坐标。"""
    return (180 + (gx - gy) * 31) * 2, (56 + (gx + gy) * 31) * 2


def hex_rgba(h: str, a: int = 255) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a


def ridge_points(y_base: float, h: float, seed: float, width: int, scale: float) -> list[tuple[float, float]]:
    """远山折线：与 chibi.ts 的 ridge() 同构（sin 峰序列）。width=逻辑画布宽，scale=逻辑→物理放大倍数。"""
    pts = [(-12.0 * scale, (y_base + 40.0) * scale)]
    x = -12.0
    i = 0
    while x < width + 12:
        step = 24 + (i % 3) * 9
        peak = y_base - h * (0.5 + 0.5 * abs(math.sin(i * 1.7 + seed)))
        pts.append(((x + step * 0.5) * scale, peak * scale))
        pts.append(((x + step) * scale, y_base * scale))
        x += step
        i += 1
    pts.append(((width + 12.0) * scale, (y_base + 40.0) * scale))
    return pts


def gen_ground() -> Image.Image:
    """等距战场底图。SS 倍超采样后 LANCZOS 缩到 2x，得到抗锯齿边缘。"""
    SS = 2
    w, h = W2 * SS, H2 * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(img, "RGBA")

    # ── 天空渐变：与组件版配色一致 ──
    sky = [(0.0, "#0b1220"), (0.4, "#141d2d"), (0.7, "#1c2333"), (1.0, "#07090f")]
    for y in range(h):
        t = y / h
        for i in range(len(sky) - 1):
            t0, c0 = sky[i]
            t1, c1 = sky[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                r0, g0, b0, _ = hex_rgba(c0)
                r1, g1, b1, _ = hex_rgba(c1)
                d.line([(0, y), (w, y)], fill=(round(r0 + (r1 - r0) * k), round(g0 + (g1 - g0) * k), round(b0 + (b1 - b0) * k), 255))
                break

    # ── 远山三层（逻辑坐标 + 统一放大倍数） ──
    scale_total = 2 * SS  # 逻辑 → 画布（2x 素材再 SS 超采样）
    for y_base, hh, color, seed in [
        (150, 86, "#0d1420", 1.1),
        (164, 66, "#131c2b", 2.3),
        (176, 48, "#1a2434", 0.6),
    ]:
        pts = ridge_points(y_base, hh, seed, 360, scale_total)
        d.polygon(pts, fill=hex_rgba(color))

    # ── 等距地块（规则对齐 chibi.ts：gy 3/4 是长江，gy/gx=8 是边缘） ──
    cells = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cells, "RGBA")
    LAND_RAW = ["#2b3526", "#303c2a", "#273120", "#35422e"]
    WATER_RAW = ["#17445f", "#123a56"]
    EDGE = "#151b14"

    def blend(h: str, target: tuple[int, int, int], k: float) -> str:
        r, g, b, _ = hex_rgba(h)
        return "#%02x%02x%02x" % (
            round(r + (target[0] - r) * k),
            round(g + (target[1] - g) * k),
            round(b + (target[2] - b) * k),
        )

    LAND = [blend(c, (47, 58, 40), 0.55) for c in LAND_RAW]
    WATER = [blend(c, (21, 63, 90), 0.55) for c in WATER_RAW]
    rng = random.Random(20261030)

    def cell_pts(gx: float, gy: float):
        a = iso_p(gx, gy)
        b = iso_p(gx + 1, gy)
        c = iso_p(gx + 1, gy + 1)
        e = iso_p(gx, gy + 1)
        return [(a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS), (c[0] * SS, c[1] * SS), (e[0] * SS, e[1] * SS)]

    for gy in range(9):
        for gx in range(9):
            n = (gx * 3 + gy * 5) % 4
            if gy == 8 or gx == 8:
                col = EDGE
            elif gy == 3:
                col = WATER[n % 2]
            elif gy == 4:
                col = WATER[(n + 1) % 2]
            else:
                col = LAND[n]
            dc.polygon(cell_pts(gx, gy), fill=hex_rgba(col))

    # 草地纹理：每块陆地格撒几簇草 + 偶发石块
    for gy in range(8):
        for gx in range(8):
            if gy in (3, 4) or gx == 8:
                continue
            for _ in range(rng.randint(4, 7)):
                cxp, cyp = iso_p(gx + rng.uniform(0.15, 0.85), gy + rng.uniform(0.15, 0.85))
                cxp *= SS
                cyp *= SS
                for k in range(rng.randint(2, 3)):
                    ox = rng.uniform(-8, 8) * SS
                    oy = rng.uniform(-6, 4) * SS
                    ln = rng.uniform(3, 6) * SS
                    dc.line([(cxp + ox, cyp + oy), (cxp + ox + 1.5 * SS, cyp + oy - ln)],
                            fill=(118, 148, 96, rng.randint(45, 80)), width=max(1, SS))
            if rng.random() < 0.06:
                sx, sy = iso_p(gx + rng.uniform(0.3, 0.7), gy + rng.uniform(0.3, 0.7))
                rr = rng.uniform(2.5, 4.5) * SS
                dc.ellipse([sx * SS - rr, sy * SS - rr * 0.7, sx * SS + rr, sy * SS + rr * 0.7],
                           fill=(122, 130, 118, 90))

    # 噪点：只扰动地块层（天空保持干净）
    arr = np.asarray(cells).astype(np.int16)
    mask = arr[:, :, 3] > 0
    noise = np.random.default_rng(42).normal(0, 9, arr.shape[:2])
    for ch in range(3):
        arr[:, :, ch] = np.where(mask, np.clip(arr[:, :, ch] + noise, 0, 255), arr[:, :, ch])
    cells = Image.fromarray(arr.astype(np.uint8), "RGBA")
    img = Image.alpha_composite(img, cells)

    # ── 江面波纹：沿长江带的短亮线（运行时高光在此之上移动） ──
    wl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dw = ImageDraw.Draw(wl, "RGBA")
    for _ in range(46):
        gx0 = random.uniform(0.3, 6.8)
        gy0 = random.uniform(3.15, 4.85)
        a = iso_p(gx0, gy0)
        b = iso_p(gx0 + random.uniform(0.4, 1.1), gy0)
        dw.line([(a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS)],
                fill=(150, 205, 240, random.randint(18, 40)), width=SS)
    img = Image.alpha_composite(img, wl)

    # ── 岸线泡沫：江面上下两条边（gy=3 上沿 / gy=5 上沿） ──
    fm = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    df = ImageDraw.Draw(fm, "RGBA")
    for gx in range(8):
        for edge_gy in (3, 5):
            a = iso_p(gx, edge_gy)
            b = iso_p(gx + 1, edge_gy)
            df.line([(a[0] * SS, a[1] * SS), (b[0] * SS, b[1] * SS)], fill=(168, 214, 240, 60), width=SS)
            for _ in range(7):
                t = random.random()
                x = (a[0] + (b[0] - a[0]) * t) * SS
                y = (a[1] + (b[1] - a[1]) * t) * SS
                rr = random.uniform(1.2, 3.2) * SS
                df.ellipse([x - rr, y - rr * 0.6, x + rr, y + rr * 0.6],
                           fill=(210, 236, 252, random.randint(40, 90)))
    img = Image.alpha_composite(img, fm)

    # ── 底部收边：地块下缘溶进舞台底色（运行时不再画这段） ──
    img = img.convert("RGBA")
    fade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dfd = ImageDraw.Draw(fade, "RGBA")
    y0 = 500 * 2 * SS
    for y in range(y0, h):
        t = (y - y0) / max(1, h - y0)
        dfd.line([(0, y), (w, y)], fill=(6, 9, 7, round(170 * (t ** 1.6))))
    img = Image.alpha_composite(img, fade)

    img = img.resize((W2, H2), Image.LANCZOS)
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    return img.convert("RGB")




def gen_ship_frame(hull: str, sail: str, phase: float) -> Image.Image:
    """单帧帆船：track 128x128（2x）；锚点约定 = 帧内 (64, 100) 为船底中线。"""
    SS = 4
    n = 128
    img = Image.new("RGBA", (n * SS, n * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    K = SS
    cx = n * SS / 2
    bob = math.sin(phase * 2 * math.pi) * 2 * K
    y = 100 * K + bob
    w = 42 * K       # 半宽（2x 下船宽 84）
    h = 26 * K       # 船身厚
    hull_rgba = hex_rgba(hull)
    dark = tuple(round(c * 0.55) for c in hull_rgba[:3])

    # 水面投影
    d.ellipse([cx - w * 1.02, y + h * 0.5, cx + w * 1.02, y + h * 1.55],
              fill=(0, 0, 0, 68))

    # 船底（暗）：底部收窄、两端上翘
    d.polygon([(cx - w - 4 * K, y - 3 * K), (cx - w * 0.72, y + h * 0.92),
               (cx + w * 0.72, y + h * 0.92), (cx + w + 4 * K, y - 3 * K)],
              fill=dark + (255,))
    # 甲板
    d.polygon([(cx - w, y), (cx - w * 0.55, y - h),
               (cx + w * 0.55, y - h), (cx + w, y)], fill=hull_rgba)
    d.line([(cx - w, y), (cx - w * 0.55, y - h), (cx + w * 0.55, y - h), (cx + w, y), (cx - w, y)],
           fill=(255, 255, 255, 46), width=1 * K)

    # 木纹
    for i in (-1, 0, 1):
        d.line([(cx + i * w * 0.42, y - h * 0.88), (cx + i * w * 0.5, y - h * 0.08)],
               fill=(0, 0, 0, 51), width=max(1, K))

    # 三根桨（帧间随船身微摆）
    sway = math.sin(phase * 2 * math.pi + 0.4) * 2 * K
    for i in (-1, 0, 1):
        d.line([(cx + i * w * 0.5, y - h * 0.05),
                (cx + i * w * 0.62 + sway, y + h * 0.9)],
               fill=(226, 232, 240, 120), width=2 * K)

    # 帆贴甲板挂起：帆底接近甲板，桅杆穿过帆面（先帆后杆，杆始终可见）
    top = y - h * 1.5
    sail_swing = math.sin(phase * 2 * math.pi + 0.8) * 5 * K
    yard_y = top - 44 * K
    d.polygon([
        (cx - 9 * K, yard_y),
        (cx + 15 * K, yard_y),
        (cx + 13 * K + sail_swing, yard_y + 40 * K),
        (cx - 7 * K + sail_swing * 0.4, yard_y + 40 * K),
    ], fill=hex_rgba(sail))
    d.line([(cx - 9 * K, yard_y), (cx + 15 * K, yard_y),
            (cx + 13 * K + sail_swing, yard_y + 40 * K), (cx - 7 * K + sail_swing * 0.4, yard_y + 40 * K),
            (cx - 9 * K, yard_y)],
           fill=(0, 0, 0, 82), width=max(1, K))
    # 帆面竖缝
    d.line([(cx + 3 * K, yard_y + 3 * K), (cx + 3 * K + sail_swing * 0.7, yard_y + 37 * K)],
           fill=(0, 0, 0, 40), width=max(1, K))
    # 桅杆与横桁（在帆前）
    d.line([(cx, y - h * 0.9), (cx, top - 52 * K)], fill=(96, 78, 60, 235), width=max(1, 2 * K))
    d.line([(cx - 11 * K, yard_y), (cx + 17 * K, yard_y)], fill=(150, 128, 100, 200), width=max(1, 2 * K))

    # 桅顶小旗
    flag_swing = math.sin(phase * 2 * math.pi) * 4 * K
    d.polygon([(cx, top - 54 * K), (cx + 9 * K + flag_swing, top - 50 * K), (cx, top - 45 * K)],
              fill=hex_rgba(sail))
    # 船首尾上挑的护栏线
    d.line([(cx - w - 4 * K, y - 3 * K), (cx + w + 4 * K, y - 3 * K)], fill=hull_rgba, width=max(1, 2 * K))

    return img.resize((n, n), Image.LANCZOS)


def gen_squad_frame(color: str, flag: str, phase: float) -> Image.Image:
    """单帧小队（3 名士兵 + 军旗）：track 128x96（2x）；锚点 = 帧内 (64, 80) 为脚下。"""
    SS = 4
    nw, nh = 128, 96
    img = Image.new("RGBA", (nw * SS, nh * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    K = SS
    cx = 64 * K
    gy = 80 * K
    body = hex_rgba(color)

    # 地面投影
    d.ellipse([cx - 20 * K, gy - 2 * K, cx + 34 * K, gy + 5 * K], fill=(0, 0, 0, 55))

    # 军旗（帧间飘动）
    swing = math.sin(phase * 2 * math.pi) * 4 * K
    px = cx + 22 * K
    d.line([(px, gy + 2 * K), (px, gy - 40 * K)], fill=(228, 232, 238, 150), width=2 * K)
    d.polygon([(px, gy - 38 * K), (px + 22 * K + swing, gy - 32 * K), (px, gy - 19 * K)],
              fill=hex_rgba(flag, 170))
    d.line([(px, gy - 38 * K), (px + 22 * K + swing, gy - 32 * K), (px, gy - 19 * K), (px, gy - 38 * K)],
           fill=(0, 0, 0, 77), width=max(1, K))

    # 三名士兵：长矛 + 竖椭圆身 + 头 + 盾
    for i in range(3):
        sx = cx - 18 * K + i * 18 * K
        d.line([(sx + 3 * K, gy - 3 * K), (sx + 9 * K, gy - 24 * K)],
               fill=(226, 232, 240, 140), width=max(1, K))
        d.ellipse([sx - 5 * K, gy - 16 * K, sx + 5 * K, gy - 1 * K], fill=body)
        hr = 3.2 * K
        d.ellipse([sx - hr, gy - 20 * K - hr, sx + hr, gy - 20 * K + hr], fill=(242, 246, 252, 235))
        sr = 2.6 * K
        d.ellipse([sx - 4.5 * K - sr, gy - 8 * K - sr, sx - 4.5 * K + sr, gy - 8 * K + sr],
                  fill=(255, 255, 255, 80))
    return img.resize((nw, nh), Image.LANCZOS)


def gen_ships() -> Image.Image:
    """横排 8 帧：曹军 4 帧 + 联军 4 帧。"""
    frames = []
    for i in range(4):
        frames.append(gen_ship_frame("#7a3a32", "#e06a5f", i / 4))
    for i in range(4):
        frames.append(gen_ship_frame("#2b5a74", "#5aa8e0", i / 4))
    sheet = Image.new("RGBA", (128 * 8, 128), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (128 * i, 0))
    return sheet


def gen_squads() -> Image.Image:
    """横排 4 帧：曹军 2 帧 + 联军 2 帧。"""
    frames = []
    for i in range(2):
        frames.append(gen_squad_frame("#ff7a72", "#ff6e6e", i / 2))
    for i in range(2):
        frames.append(gen_squad_frame("#6db6ff", "#6ebeff", i / 2))
    sheet = Image.new("RGBA", (128 * 4, 96), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (128 * i, 0))
    return sheet


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    g = gen_ground()
    g.save(os.path.join(OUT, "ground.png"))
    print("ground.png", g.size)
    ships = gen_ships()
    ships.save(os.path.join(OUT, "ships.png"))
    print("ships.png", ships.size)
    squads = gen_squads()
    squads.save(os.path.join(OUT, "squads.png"))
    print("squads.png", squads.size)


# ─────────────────────────────────────────────────────────────
# 船与小队序列帧（每帧先 4x 超采样再缩到 2x，边缘抗锯齿）
# ─────────────────────────────────────────────────────────────
