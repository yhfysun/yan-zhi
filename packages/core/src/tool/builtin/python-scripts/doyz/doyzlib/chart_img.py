"""把 doyz 图表渲染成 PNG（用于「图片模式」导出 Word / PPT）。"""

from __future__ import annotations

import os

FONT_MAP = {
    "微软雅黑": "Microsoft YaHei",
    "黑体": "SimHei",
    "宋体": "SimSun",
    "楷体": "KaiTi",
    "仿宋": "FangSong",
    "等线": "DengXian",
}

BG = "FFFFFF"


def _norm_color(c, default="C2410C"):
    if not c:
        return "#" + default
    c = str(c).lstrip("#")
    return "#" + c


def _font(name):
    return FONT_MAP.get(name, name or "Microsoft YaHei")


def render(chart: dict, out_path: str, style: dict) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager

    font = _font((style or {}).get("font"))
    plt.rcParams["font.sans-serif"] = [font, "Microsoft YaHei", "SimHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["figure.facecolor"] = "#" + BG
    plt.rcParams["axes.facecolor"] = "#" + BG

    # 让 matplotlib 能直接吃系统中文字体文件（避免字体名解析失败）
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            try:
                font_manager.fontManager.addfont(p)
            except Exception:
                pass

    opt = chart.get("options") or {}
    w_cm = float(opt.get("widthCm") or 15)
    h_cm = float(opt.get("heightCm") or 8)
    palette = [_norm_color(c) for c in
               (style or {}).get("palette") or ["C2410C", "1E6FD9", "0F766E"]]

    fig, ax = plt.subplots(figsize=(max(w_cm, 6) / 2.54, max(h_cm, 4) / 2.54), dpi=200)
    ctype = chart.get("type", "column")
    cats = [str(c) for c in (chart.get("categories") or [])]
    series = chart.get("series") or []
    stacked = bool(opt.get("stacked")) or ctype.endswith("_stacked")
    base = ctype.replace("_stacked", "").replace("_markers", "")

    if base == "pie" or ctype == "doughnut":
        s = series[0]
        vals = [float(v or 0) for v in s.get("values") or []]
        colors = palette[: len(vals)] or palette
        wedges, texts, autotexts = ax.pie(
            vals, labels=cats, autopct=("%.1f%%" if opt.get("dataLabels") else None),
            colors=colors, startangle=90,
            wedgeprops=dict(width=0.45) if ctype == "doughnut" else dict(),
            textprops={"fontsize": 9},
        )
        for t in autotexts:
            t.set_color("#FFFFFF")
            t.set_fontsize(8)
        ax.axis("equal")
    elif base == "scatter":
        for idx, s in enumerate(series):
            ys = [float(v or 0) for v in s.get("values") or []]
            xs = list(range(1, len(ys) + 1))
            ax.scatter(xs, ys, label=s.get("name"), color=palette[idx % len(palette)], s=42)
        if cats:
            ax.set_xticks(range(1, len(cats) + 1))
            ax.set_xticklabels(cats)
    elif base == "radar":
        import math
        labels = cats or [str(i + 1) for i in range(len(series[0].get("values") or []))]
        n = len(labels)
        ang = [i * 2 * math.pi / n for i in range(n)] + [0]
        for idx, s in enumerate(series):
            vals = [float(v or 0) for v in s.get("values") or []] + \
                   [float((s.get("values") or [0])[0] or 0)]
            ax.plot(ang, vals, label=s.get("name"), color=palette[idx % len(palette)])
            ax.fill(ang, vals, color=palette[idx % len(palette)], alpha=0.15)
        ax.set_xticks(ang[:-1])
        ax.set_xticklabels(labels)
    else:
        x = range(len(cats))
        bottoms = [0.0] * len(cats)
        for idx, s in enumerate(series):
            vals = [float(v or 0) for v in s.get("values") or []]
            vals += [0.0] * (len(cats) - len(vals))
            color = _norm_color(s.get("color"), palette[idx % len(palette)].lstrip("#"))
            if base == "column":
                ax.bar(x, vals, bottom=bottoms if stacked else None,
                       label=s.get("name"), color=color, width=0.6)
            elif base == "bar":
                ax.barh(list(x), vals, left=bottoms if stacked else None,
                        label=s.get("name"), color=color, height=0.6)
            elif base == "line":
                marker = "o" if ctype == "line_markers" or len(series) <= 2 else None
                ax.plot(list(x), vals, label=s.get("name"), color=color,
                        marker=marker, linewidth=2,
                        linestyle="-" if not opt.get("smooth") else "-")
            elif base == "area":
                ax.fill_between(list(x), bottoms if stacked else 0,
                                [bottoms[i] + vals[i] for i in range(len(vals))],
                                label=s.get("name"), color=color, alpha=0.55)
                ax.plot(list(x), [bottoms[i] + vals[i] for i in range(len(vals))],
                        color=color, linewidth=1.5)
            if stacked:
                bottoms = [bottoms[i] + vals[i] for i in range(len(cats))]
        if base in ("column", "line", "area"):
            ax.set_xticks(list(x))
            ax.set_xticklabels(cats)
            ax.set_xlim(-0.6, max(len(cats) - 0.4, 0.6))
        elif base == "bar":
            ax.set_yticks(list(x))
            ax.set_yticklabels(cats)
        ax.grid(axis="y", linestyle="--", alpha=0.3)
        ax.set_axisbelow(True)

    if opt.get("xTitle"):
        ax.set_xlabel(opt["xTitle"])
    if opt.get("yTitle"):
        ax.set_ylabel(opt["yTitle"])
    title = chart.get("title")
    if title:
        ax.set_title(title, fontsize=12, fontweight="bold", pad=12)
    if opt.get("legend") and base not in ("pie",) and ctype != "doughnut":
        ax.legend(fontsize=8, frameon=False)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)

    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    fig.savefig(out_path, dpi=200, facecolor="#" + BG)
    plt.close(fig)
    return out_path
