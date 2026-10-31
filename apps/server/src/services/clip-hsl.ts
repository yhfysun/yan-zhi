// HSL 分色调色（P1-6）—— 生成 3D LUT（.cube）。
//
// ★ 为什么不是直接滤镜：本机 ffmpeg **没有 HSL 分色滤镜**（只有全局 hue / CMYK 的
//   selectivecolor / colorcorrect）。逐色相调 H/S/L 的最稳做法是把它表达成一张 3D LUT：
//   网格点逐色转换 RGB→HSL → 按色带加权调整 → 转回 RGB，再交给 P1-5 已接好的 lut3d。
//   这样预览与导出共用同一条链，HSL 与用户自带的 .cube 也能叠加。
//
// ★ 色带权重：到色相中心的角距离线性衰减（±45°），相邻色带重叠、无硬边；
//   多个色带同时命中时，色相偏移相加、饱和度按倍率相乘、明度偏移相加。

import { HSL_BANDS } from '@yan-zhi/shared';

export interface HslBand {
  color: string;
  hue?: number;        // -180~180（度）
  saturation?: number; // -100~100（百分比，-100=完全去色）
  lightness?: number;  // -100~100（百分比）
}

/** RGB(0~1) → HSL（h 0~360，s/l 0~1）。 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** HSL(0~360, 0~1, 0~1) → RGB(0~1)。 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [hue2rgb(hh + 1 / 3), hue2rgb(hh), hue2rgb(hh - 1 / 3)];
}

/** 角距离 0~180。 */
function hueDist(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** 某个色相被哪些色带影响（线性权重，±45° 内）。 */
function bandWeight(hueDeg: number, bandHue: number): number {
  const d = hueDist(hueDeg, bandHue);
  return d >= 45 ? 0 : 1 - d / 45;
}

/**
 * 按像素 HSL 应用分色调整（纯函数，单测直接调）。
 * bands 为空 → 原样返回（调用方应据此跳过 LUT）。
 */
export function applyHslBands(r: number, g: number, b: number, bands: HslBand[]): [number, number, number] {
  if (!bands.length) return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  let hueShift = 0;
  let satMul = 1;
  let lightAdd = 0;
  let touched = false;
  for (const band of bands) {
    const def = HSL_BANDS.find((x) => x.id === band.color);
    if (!def) continue;
    const w = bandWeight(h, def.hueDeg);
    if (w <= 0) continue;
    touched = true;
    if (band.hue) hueShift += band.hue * w;
    if (band.saturation) satMul *= Math.max(0, 1 + (band.saturation / 100) * w);
    if (band.lightness) lightAdd += (band.lightness / 100) * w;
  }
  if (!touched) return [r, g, b];
  const sat = Math.max(0, Math.min(1, s * satMul));
  const lit = Math.max(0, Math.min(1, l + lightAdd));
  return hslToRgb(h + hueShift, sat, lit);
}

/**
 * 生成 .cube 文本。
 * ★ 顺序必须是 B 最慢、R 最快（3D LUT 规范），写反了颜色会整体错位且不报错。
 */
export function hslCube(bands: HslBand[], size = 17): string {
  const n = Math.max(2, Math.min(33, Math.round(size)));
  const lines: string[] = [`LUT_3D_SIZE ${n}`];
  const step = 1 / (n - 1);
  const fmt = (v: number) => Math.max(0, Math.min(1, v)).toFixed(5);
  for (let bi = 0; bi < n; bi++) {
    for (let gi = 0; gi < n; gi++) {
      for (let ri = 0; ri < n; ri++) {
        const [r, g, b] = applyHslBands(ri * step, gi * step, bi * step, bands);
        lines.push(`${fmt(r)} ${fmt(g)} ${fmt(b)}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

/** 参数指纹（相同参数只生成一次；也给测试与缓存键用）。 */
export function hslFingerprint(bands: HslBand[]): string {
  return JSON.stringify(bands.map((b) => [b.color, b.hue ?? 0, b.saturation ?? 0, b.lightness ?? 0]));
}
