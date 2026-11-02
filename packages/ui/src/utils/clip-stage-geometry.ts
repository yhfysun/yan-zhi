// 监视器「矢量图层实时合成」（P1-10 / C-1）的坐标与样式换算。
//
// ★★★ 为什么单独一个纯函数模块（而不是写在 ClipWorkbench.vue 里）：
//   这里是**预览与导出的一致性契约** —— 同一图层在实时预览与成片里的位置/尺寸
//   必须在 ±2px（1080p 画幅）内。口径散落在模板里就没法测；本文件每条都有单测。
//
// 坐标语义（与 apps/server/src/services/clip-render.ts 逐条对齐）：
//   · 图层 x/y 是**相对画面宽高的中心偏移**（-0.5~0.5，0=居中），不是像素；
//   · 贴纸/画中画宽度 = 画面宽 × scale（scale 是比例）；
//   · 画中画关键帧里的 scale 对静态 scale 是**乘数**（渲染口径），
//     文字关键帧的 scale 则**替代**静态值（ASS \fscx 语义）——两者刻意不同，别统一；
//   · 字号/描边/字距/行距均以 **1920 高**为基准（渲染侧 × resY/1920）。
import { fontAssNameOf, sampleLayerKfs, type LayerKfPoint } from '@yan-zhi/shared';

export interface LayerTf {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}

export interface LayerKf extends LayerTf {
  t: number;
  /** 与 LayerKfPoint 的 ease 一致（字符串直传共享采样器） */
  ease?: string;
  bezier?: [number, number, number, number];
}

/** 画幅（显示尺寸，px）。宁可叫 box 而不是 stage：stage 会带黑边，几何只认**画面**。 */
export interface StageBox {
  width: number;
  height: number;
}

export interface SampledTf {
  /** 关键帧采样值（未与静态值合并；scale 的语义见文件头） */
  kf: LayerTf;
  /** 实际生效值：逐属性「关键帧优先，静态兜底」 */
  eff: LayerTf;
}

const TF_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

/** 层内时间 t：0=层起点，1=层终点（与渲染的 kfT 表达式一致）。 */
export function localLayerT(playhead: number, start: number, end: number): number {
  const dur = end - start;
  if (!(dur > 1e-6)) return 0;
  const t = (playhead - start) / dur;
  return Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
}

/** 图层在成片时间 playhead 是否可见（与渲染的 enable='between(t,st,et)' 同口径）。 */
export function layerVisibleAt(playhead: number, start: number, end: number): boolean {
  return end > start && playhead >= start && playhead < end;
}

/**
 * 采样图层变换。
 * ★ 逐属性合并（与 sampleLayerKfs 的逐属性插值配套）：只给 scale 打点的图层，
 *   x/y 仍取静态值 —— 否则稀疏打点会互相拉扯。
 */
export function sampleLayerTf(tf: LayerTf | undefined, kfs: LayerKf[] | undefined, t: number): SampledTf {
  const kf = sampleLayerKfs(kfs as LayerKfPoint[] | undefined, t) as LayerTf;
  const eff: LayerTf = {};
  for (const key of TF_KEYS) {
    const v = kf[key] ?? tf?.[key];
    if (v != null && Number.isFinite(Number(v))) eff[key] = Number(v);
  }
  return { kf, eff };
}

/**
 * 是否处于「中心偏移」定位模式。
 * ★ 渲染侧：只要出现任一绝对位置（静态 x/y 或 x/y 关键帧），两轴都改用中心偏移，
 *   缺失的一轴按 0（居中）——不是回落到九宫格锚点。这里必须同口径，否则动画层会平移。
 */
export function hasOffsetMode(tf: LayerTf | undefined, kfs: LayerKf[] | undefined): boolean {
  if (tf?.x != null || tf?.y != null) return true;
  return !!kfs?.some((k) => k.x != null || k.y != null);
}

/** 静态宽度比例 × 关键帧倍数 → 画面内像素宽度（贴纸/画中画）。 */
export function layerWidthPx(canvasW: number, staticScale: number, kfScale: number | undefined): number {
  const w = canvasW * staticScale * (kfScale ?? 1);
  return Math.max(2, Number.isFinite(w) ? w : 2);
}

export type AnchorCol = 'left' | 'center' | 'right';
export type AnchorRow = 'top' | 'center' | 'bottom';

const ANCHOR_SPLIT: Record<string, [AnchorCol, AnchorRow]> = {
  topleft: ['left', 'top'],
  top: ['center', 'top'],
  topright: ['right', 'top'],
  left: ['left', 'center'],
  center: ['center', 'center'],
  right: ['right', 'center'],
  bottomleft: ['left', 'bottom'],
  bottom: ['center', 'bottom'],
  bottomright: ['right', 'bottom'],
};

/** 九宫格锚点 → 行列；未知回落右下（与 overlayAnchorOf 的缺省一致）。 */
export function anchorCell(id: string | undefined): [AnchorCol, AnchorRow] {
  return ANCHOR_SPLIT[String(id || '').toLowerCase()] || ANCHOR_SPLIT.bottomright;
}

/** 画中画/贴纸锚点内缩比例（渲染侧 main_w*0.04 / main_h*0.04）。 */
export const ANCHOR_INSET = 0.04;

/**
 * 画中画/贴纸的**视觉中心**（画面像素坐标）。
 *
 * ★ 逐行对齐 overlayLayerChain：旋转时 ffmpeg 把画布按 1.5 倍**对称**外扩，
 *   非居中锚点还会再补 -overlay_w/6 —— 预览不复刻这两步，旋过的画中画会整体偏移。
 * ★ 中心偏移模式（xFrac/yFrac）下渲染不做外扩补偿：visual center = 画幅中心 + w*x。
 */
export function layerCenterPx(o: {
  box: StageBox;
  width: number;
  /** 未知（图片/视频元数据还没到）时传 0；只有上下锚点会用到它 */
  height: number;
  anchor: string;
  rotation?: number | null;
  /** 是否走中心偏移模式（见 hasOffsetMode） */
  hasOffset: boolean;
  offsetX?: number;
  offsetY?: number;
}): { cx: number; cy: number } {
  const W = o.box.width;
  const H = o.box.height;
  if (o.hasOffset) {
    const x = Number(o.offsetX ?? 0) || 0;
    const y = Number(o.offsetY ?? 0) || 0;
    return { cx: W / 2 + W * x, cy: H / 2 + H * y };
  }
  const [col, row] = anchorCell(o.anchor);
  const rot = Number(o.rotation ?? 0) || 0;
  const hasRot = Math.abs(rot) > 0.001;
  const ow = hasRot ? o.width * 1.5 : o.width;
  const oh = hasRot ? o.height * 1.5 : o.height;
  let left = col === 'left' ? W * ANCHOR_INSET : col === 'right' ? W - ow - W * ANCHOR_INSET : (W - ow) / 2;
  let top = row === 'top' ? H * ANCHOR_INSET : row === 'bottom' ? H - oh - H * ANCHOR_INSET : (H - oh) / 2;
  if (hasRot && col !== 'center') left -= ow / 6;
  if (hasRot && row !== 'center') top -= oh / 6;
  return { cx: left + ow / 2, cy: top + oh / 2 };
}

// ===== 1920 高基准的像素换算 =====
/** 渲染侧的字幕像素基准高度。 */
export const TEXT_BASE_HEIGHT = 1920;
/** 默认底边距 / 竖屏安全区（字幕，1920 基准；与 clip-render 的 200 / 420 同源）。 */
export const TEXT_MARGIN_BASE = 200;
export const TEXT_SAFE_BASE = 420;

/** 1920 基准像素 → 显示像素。 */
export function scale1920(px: number, displayH: number): number {
  return (Number(px) || 0) * displayH / TEXT_BASE_HEIGHT;
}

/** 字幕底/顶边距（显示像素）。 */
export function textMarginPx(displayH: number, safeArea: boolean): number {
  return scale1920(safeArea ? TEXT_SAFE_BASE : TEXT_MARGIN_BASE, displayH);
}

/** #RRGGBB / #RRGGBBAA → CSS 颜色；非法返回 null（不猜颜色）。 */
export function normalizeCssColor(v: string | undefined): string | null {
  const s = String(v || '').trim();
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(s);
  return m ? `#${m[1]}${m[2] ?? ''}` : null;
}

/** 描边 → 8 向 text-shadow（HTML 没有 ASS 的 Outline，只能用这一层近似）。 */
export function outlineShadow(outlinePx: number, color: string): string {
  const w = Math.max(0, outlinePx);
  if (!(w > 0)) return 'none';
  const d = w;
  const parts: string[] = [];
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    parts.push(`${(dx * d).toFixed(2)}px ${(dy * d).toFixed(2)}px 0 ${color}`);
  }
  return parts.join(', ');
}

/**
 * 图层混合模式 → CSS mix-blend-mode。
 * ★ id 与 ffmpeg 的 all_mode 不同名（add→addition），CSS 又是第三套名字（plus-lighter）——
 *   三份映射只在这一处，别在模板里就地写。
 */
export function cssBlendMode(id: string | undefined): string {
  switch (String(id || '').toLowerCase()) {
    case 'screen': return 'screen';
    case 'multiply': return 'multiply';
    case 'overlay': return 'overlay';
    case 'softlight': return 'soft-light';
    case 'add': return 'plus-lighter';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    default: return 'normal';
  }
}

// ===== 文字图层的 CSS =====

export interface TextStyleInput {
  fontSizePx?: number;
  color?: string;
  outlineColor?: string;
  outlinePx?: number;
  backColor?: string;
  plateColor?: string;
  platePaddingPx?: number;
  letterSpacingPx?: number;
  lineSpacingPx?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  position?: string;
  safeArea?: boolean;
  transform?: LayerTf;
  keyframes?: LayerKf[];
}

export interface TextCssResult {
  style: Record<string, string | number>;
  /** 是否走变换（= 渲染侧 textHasTransform：有静态变换或有任意关键帧） */
  usesTransform: boolean;
  /** 变换中心相对偏移（仅 usesTransform 有意义） */
  offsetX: number;
  offsetY: number;
}

/**
 * 文字图层 → CSS。
 * ★ 已知近似（UI 上必须标注"与成片可能有细微差异"）：
 *   - 描边用 text-shadow 近似 ASS Outline，斜角略细；
 *   - 花字底板用圆角背景块近似 BorderStyle=3，边距随字号而非字形的外轮廓；
 *   - 字幕入场动画（打字机/滑动）不预演，直接显示终态。
 */
export function buildTextCss(t: TextStyleInput, box: StageBox, sampled: SampledTf): TextCssResult {
  const kf = sampled.kf;
  const eff = sampled.eff;
  const usesTransform = !!t.transform || !!t.keyframes?.length;
  const fontSizePx = Math.max(4, scale1920(t.fontSizePx ?? 88, box.height));
  const outlinePx = Math.max(0, scale1920(t.outlinePx ?? 12, box.height));
  const padBase = Math.max(0, scale1920(t.platePaddingPx ?? 18, box.height));
  // ASS 的 MarginV 量到**文字行**边缘；CSS 的 box 还多出 line-height 的半行距。
  // 不补偿的话 1920 高画幅下底边字幕会比成片高约 9px（超出 ±2px 口径）。
  const lineHeightFactor = 1.2 + (Number(t.lineSpacingPx ?? 0) || 0) / (Number(t.fontSizePx ?? 88) || 88);
  const halfLeading = Math.max(0, (lineHeightFactor - 1) * fontSizePx / 2);

  const style: Record<string, string | number> = {
    position: 'absolute',
    fontSize: `${round2(fontSizePx)}px`,
    fontFamily: `"${fontAssNameOf(t.fontFamily)}", "Microsoft YaHei", "PingFang SC", sans-serif`,
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    color: normalizeCssColor(t.color) || '#FFFFFF',
    letterSpacing: `${round2(scale1920(t.letterSpacingPx ?? 0, box.height))}px`,
    // ASS 默认行高约 1.2 倍；lineSpacingPx 是**额外**行间隙
    lineHeight: String(round3(lineHeightFactor)),
    whiteSpace: 'pre-wrap',
    textAlign: 'center',
    maxWidth: '100%',
    transformOrigin: 'center center',
    pointerEvents: 'auto',
  };
  if (outlinePx > 0) {
    style.textShadow = outlineShadow(outlinePx, normalizeCssColor(t.outlineColor) || '#000000');
  }
  const plate = normalizeCssColor(t.plateColor);
  const back = normalizeCssColor(t.backColor);
  if (plate) {
    // 花字/气泡底板：大描边撑出的圆角块
    style.background = plate;
    style.padding = `${round2(padBase * 0.45)}px ${round2(padBase)}px`;
    style.borderRadius = `${round2(padBase)}px`;
  } else if (back) {
    // 背景底板：ASS BorderStyle=3（描边宽度即边的厚度）
    style.background = back;
    style.padding = `${round2(outlinePx)}px ${round2(outlinePx * 1.6)}px`;
    style.borderRadius = '3px';
  }

  if (usesTransform) {
    const x = Number(eff.x ?? 0) || 0;
    const y = Number(eff.y ?? 0) || 0;
    const scaleV = Number(eff.scale ?? 1) || 1;
    const rot = Number(eff.rotation ?? 0) || 0;
    style.left = `${round2((0.5 + x) * box.width)}px`;
    style.top = `${round2((0.5 + y) * box.height)}px`;
    style.transform = `translate(-50%, -50%) rotate(${round2(rot)}deg) scale(${round3(scaleV)})`;
    style.opacity = String(round3(Math.max(0, Math.min(1, Number(eff.opacity ?? 1)))));
    return { style, usesTransform: true, offsetX: x, offsetY: y };
  }

  // 无变换：与 SRT 路径同口径 —— 按 position 贴边，底/顶距 200（安全区 420）
  const margin = textMarginPx(box.height, !!t.safeArea);
  style.left = '50%';
  if (t.position === 'top') {
    style.top = `${round2(Math.max(0, margin - halfLeading))}px`;
    style.transform = 'translateX(-50%)';
  } else if (t.position === 'center') {
    style.top = '50%';
    style.transform = 'translate(-50%, -50%)';
  } else {
    style.bottom = `${round2(margin + halfLeading)}px`;
    style.transform = 'translateX(-50%)';
  }
  // 关键帧里的 opacity/rotation 在无静态变换时渲染走的是 ASS 路径（textHasTransform 为真），
  // 本分支只在完全没有 transform/keyframes 时到达，因此不需要透明度。
  void kf;
  return { style, usesTransform: false, offsetX: 0, offsetY: 0 };
}

// ===== 贴纸 / 画中画的 CSS =====

export function buildLayerBoxCss(o: {
  box: StageBox;
  centerX: number;
  centerY: number;
  width: number;
  /** 未知时省略（贴纸/居中锚点不需要） */
  height?: number;
  rotation?: number | null;
  opacity?: number | null;
  blend?: string;
}): Record<string, string | number> {
  const style: Record<string, string | number> = {
    position: 'absolute',
    left: `${round2(o.centerX)}px`,
    top: `${round2(o.centerY)}px`,
    width: `${round2(o.width)}px`,
    transform: `translate(-50%, -50%) rotate(${round2(Number(o.rotation ?? 0) || 0)}deg)`,
    transformOrigin: 'center center',
    opacity: String(round3(Math.max(0, Math.min(1, Number(o.opacity ?? 1))))),
    pointerEvents: 'auto',
  };
  if (o.height != null && o.height > 0) style.height = `${round2(o.height)}px`;
  const blend = cssBlendMode(o.blend);
  if (blend !== 'normal') style.mixBlendMode = blend;
  return style;
}

// ===== 拖动落点 =====

export const OFFSET_LIMIT = 0.5;

export function clampOffset(v: number, limit = OFFSET_LIMIT): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-limit, Math.min(limit, n));
}

export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 拖动位移落到图层：静态 x/y 平移 delta，**同时平移所有 x/y 关键帧**。
 * ★ 为什么也要平移关键帧：渲染侧关键帧优先于静态值 —— 只改静态 x/y 时，
 *   拖完松手画面会跳回关键帧的位置（用户视角是"拖了不生效"）。
 *   整体平移保留动画形状，落点又精确等于拖动位置。
 * ★ 返回新对象（不原地改工程），由调用方决定何时写回。
 */
export function shiftLayerPosition(
  tf: LayerTf | undefined,
  kfs: LayerKf[] | undefined,
  dx: number,
  dy: number,
): { tf: LayerTf; kfs: LayerKf[] | undefined } {
  const nextTf: LayerTf = { ...(tf || {}) };
  const nx = clampOffset((Number(tf?.x ?? 0) || 0) + dx);
  const ny = clampOffset((Number(tf?.y ?? 0) || 0) + dy);
  nextTf.x = round4(nx);
  nextTf.y = round4(ny);
  const nextKfs = kfs?.map((k) => {
    const out: LayerKf = { ...k };
    if (typeof k.x === 'number' && Number.isFinite(k.x)) out.x = round4(clampOffset(k.x + dx));
    if (typeof k.y === 'number' && Number.isFinite(k.y)) out.y = round4(clampOffset(k.y + dy));
    return out;
  });
  return { tf: nextTf, kfs: nextKfs };
}
