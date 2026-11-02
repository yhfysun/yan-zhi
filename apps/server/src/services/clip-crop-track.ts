// 动态人脸跟随裁切的**纯函数层**（2026-11-02，P2-4 增强）。
//
// ★ 为什么单独成文件而不是塞进 clip-reframe.ts：
//   clip-reframe 依赖 clip-render（复用 probeArgs/parseProbeJson），而 clip-render 又要用
//   这里的 trackToCropExpr —— 放进 clip-reframe 会形成 ESM 循环依赖。本文件不 import 任何
//   业务模块（只有类型），两边都可以安全引用；clip-reframe 再把它 re-export，对外仍是
//   「clip-reframe 里的纯函数」。
//
// ★ 定位（诚实）：
//   **非 AI 的人脸跟随**。输入是 Haar 正脸抽样点（每帧至多一张），输出是分段线性的
//   裁切窗口中心轨迹，交给 ffmpeg `crop` 的 x/y 表达式逐帧求值。侧脸/遮挡/快速移动
//   会漏检；漏检段按最近的检出位置保持，不做任何"预测/跟踪模型"。
//
// ★ 坐标语义：
//   · 输入人脸框是**源视频像素坐标**，输出 track 的 x/y 是窗口**中心**在画面内的
//     0~1 比例（不是左上角）；
//   · t 是**段内归一化位置 0~1**（相对片段实际使用的源区间）。
//     这样它天然不受恒定变速影响（渲染层用 `t/段长` 归一化后与它对齐）。

export interface FaceBoxLike {
  /** 该帧在源视频中的时间（秒，源文件绝对时间） */
  t?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceTrackPoint {
  /** 段内归一化位置 0~1 */
  t: number;
  /** 窗口中心 x（0~1） */
  x: number;
  /** 窗口中心 y（0~1） */
  y: number;
}

/** zoom 下限：再小窗口会碎到没有构图意义（0.6 = 比最大窗口放大 1.67 倍） */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1;
/** 与 clip-project.normalizeCrop 的最小窗口一致（w/h ≥ 0.1），避免落盘后被放大漂移 */
export const MIN_CROP_REL = 0.1;
/** 人脸框超过画面这个比例 = 误检（近景大脸也不会占满 90%） */
export const MAX_FACE_FRAME_RATIO = 0.9;
/** 小于画面 0.5% 的框当噪点 */
export const MIN_FACE_FRAME_RATIO = 0.005;
/** 轨迹点数上限（与 clip-project.normalizeCropTrack 一致；crop 表达式长度的折中） */
export const MAX_TRACK_POINTS = 24;

export const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 裁切窗口尺寸（像素）：保持目标宽高比的最大内接矩形 × zoom。 */
export function computeTrackWindow(
  frameW: number,
  frameH: number,
  targetAspectRaw: number,
  zoomRaw?: number,
): { winW: number; winH: number; warnings: string[] } {
  if (!Number.isFinite(frameW) || !Number.isFinite(frameH) || frameW <= 0 || frameH <= 0) {
    throw new Error('computeTrackWindow: frameW/frameH 必须是正数（请先探测视频分辨率）');
  }
  const warnings: string[] = [];
  const aspect = Number.isFinite(targetAspectRaw) && targetAspectRaw > 0 ? targetAspectRaw : 9 / 16;
  if (!(Number.isFinite(targetAspectRaw) && targetAspectRaw > 0)) warnings.push('目标画幅无效，已按 9:16 计算');

  const zoomIn = Number(zoomRaw ?? 1);
  const zoom = Number.isFinite(zoomIn) ? clampNum(zoomIn, MIN_ZOOM, MAX_ZOOM) : 1;
  if (Number.isFinite(zoomIn) && (zoomIn < MIN_ZOOM || zoomIn > MAX_ZOOM)) {
    warnings.push(`zoom 超出 ${MIN_ZOOM}~${MAX_ZOOM}，已夹取`);
  }

  const frameAspect = frameW / frameH;
  let winW = frameW;
  let winH = frameH;
  if (frameAspect > aspect) winW = frameH * aspect;
  else winH = frameW / aspect;
  winW *= zoom;
  winH *= zoom;

  // 兜底：比例极端时窗口可能小于持久化下限（0.1），按最小窗口整体放大
  const minW = frameW * MIN_CROP_REL;
  const minH = frameH * MIN_CROP_REL;
  if (winW < minW || winH < minH) {
    const k = Math.max(minW / winW, minH / winH);
    winW *= k;
    winH *= k;
    warnings.push('目标画幅与素材比例差异过大，已按最小可裁窗口处理');
  }
  return { winW, winH, warnings };
}

/** 过滤越界/尺寸异常/非数值的人脸框，返回中心（像素）。误检比没有更糟：会把构图拽偏。 */
export function filterFaceCenters(
  faces: readonly FaceBoxLike[],
  frameW: number,
  frameH: number,
): Array<{ cx: number; cy: number; t?: number }> {
  const out: Array<{ cx: number; cy: number; t?: number }> = [];
  for (const f of faces) {
    if (!f || typeof f !== 'object') continue;
    const x = Number(f.x);
    const y = Number(f.y);
    const w = Number(f.w);
    const h = Number(f.h);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    if (w <= 0 || h <= 0) continue;
    if (w > frameW * MAX_FACE_FRAME_RATIO || h > frameH * MAX_FACE_FRAME_RATIO) continue;
    if (w < frameW * MIN_FACE_FRAME_RATIO || h < frameH * MIN_FACE_FRAME_RATIO) continue;
    if (x + w <= 0 || y + h <= 0 || x >= frameW || y >= frameH) continue;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (cx < 0 || cx > frameW || cy < 0 || cy > frameH) continue;
    const tRaw = Number(f.t);
    out.push({ cx, cy, ...(Number.isFinite(tRaw) ? { t: tRaw } : {}) });
  }
  return out;
}

export interface BuildFaceTrackOptions {
  /** 目标宽高比 = 宽/高（如 9/16） */
  targetAspect: number;
  /** 1=最宽松；0.6=更贴近主体（夹到 0.6~1） */
  zoom?: number;
  /** 源区间起点（秒）：face.t 是源文件绝对时间，减掉它才是段内时间 */
  windowStartSec?: number;
  /** 实际采样帧数（算 confidence / 漏检提示用；缺省按 6 帧估算） */
  sampleCount?: number;
  /** 轨迹点数上限（默认 24，夹到 2~24） */
  maxPoints?: number;
  /** 平滑窗口（奇数，默认 3；逐轴取中值，抗单帧误检） */
  smoothWindow?: number;
  /** 单步最大位移（占画面宽/高的比例，默认 0.08；防止误检把窗口甩出去） */
  maxStep?: number;
}

export interface BuildFaceTrackResult {
  /** 有效轨迹（可能为空 = 无法跟踪，调用方回退静态裁切） */
  track: FaceTrackPoint[];
  /** 0~1：区间内检出人脸的采样帧占比 */
  confidence: number;
  warnings: string[];
}

/**
 * 纯函数：抽样人脸 → 平滑的裁切窗口中心轨迹（0~1 归一化）。
 *
 * 步骤：
 *   ① 过滤非法框 → 换算到段内归一化时间（落在区间外的点丢弃）；
 *   ② 每帧算窗口左上角（与静态裁切同一套窗口尺寸/夹取逻辑）→ 换算成窗口中心比例；
 *   ③ 窗口 3 的逐轴中值平滑（对单帧误检鲁棒，比均值更不容易被拽偏）；
 *   ④ 单步位移限幅（|Δ| ≤ maxStep，占画面比例）—— 避免表情/误检造成抽搐；
 *   ⑤ 首尾外推：第一个有效点之前保持其值，最后一个之后保持其值（即"无人脸段用最近
 *      有效点外推"）；并显式补 t=0 / t=1 两个端点；
 *   ⑥ 点数超过 maxPoints 时等距抽稀（保留首尾）。
 *
 * ★ 有效点少于 2 个时返回空轨迹：只有一个采样点无法判断"移动"，交给静态裁切更稳。
 */
export function buildFaceTrack(
  faces: readonly FaceBoxLike[],
  frameW: number,
  frameH: number,
  groupDurationSec: number,
  opts: BuildFaceTrackOptions,
): BuildFaceTrackResult {
  const warnings: string[] = [];
  const dur = Number(groupDurationSec);
  if (!Number.isFinite(dur) || dur <= 0) {
    return { track: [], confidence: 0, warnings: ['片段区间时长无效，无法生成跟随轨迹'] };
  }
  const { winW, winH, warnings: winWarn } = computeTrackWindow(frameW, frameH, Number(opts.targetAspect), opts.zoom);
  warnings.push(...winWarn);

  const start = Number(opts.windowStartSec ?? 0);
  const startSec = Number.isFinite(start) ? Math.max(0, start) : 0;
  const sampleCount = Number(opts.sampleCount ?? 0);
  const all = filterFaceCenters(Array.isArray(faces) ? faces : [], frameW, frameH);

  // 只在片段实际使用的区间内取点；区间外的检出（理论上不会出现）丢弃
  const timed = all
    .filter((f) => f.t != null)
    .map((f) => ({ ...f, tn: (Number(f.t) - startSec) / dur }))
    .filter((f) => f.tn >= -0.001 && f.tn <= 1.001);
  const confidence = timed.length
    ? round4(clampNum(timed.length / (sampleCount > 0 ? sampleCount : 6), 0, 1))
    : 0;

  if (!timed.length) {
    warnings.push('未检测到人脸，动态跟随后退为静态中心裁切');
    return { track: [], confidence: 0, warnings };
  }
  if (timed.length < 2) {
    warnings.push('只检出 1 帧人脸，无法判断移动方向，已回退为静态中心裁切');
    return { track: [], confidence, warnings };
  }

  // ① 每帧的窗口位置（左上角夹到画面内）→ 窗口中心比例
  const maxLeft = Math.max(0, frameW - winW);
  const maxTop = Math.max(0, frameH - winH);
  let pts: FaceTrackPoint[] = timed
    .map((f) => ({
      t: clampNum(f.tn, 0, 1),
      x: (clampNum(f.cx - winW / 2, 0, maxLeft) + winW / 2) / frameW,
      y: (clampNum(f.cy - winH / 2, 0, maxTop) + winH / 2) / frameH,
    }))
    .sort((a, b) => a.t - b.t);

  // 同 t 去重（保留后者）
  pts = pts.filter((p, i) => i === 0 || Math.abs(p.t - pts[i - 1].t) > 1e-6);
  if (pts.length < 2) {
    warnings.push('采样点过于集中，已回退为静态中心裁切');
    return { track: [], confidence, warnings };
  }

  // ② 平滑（窗口奇数，逐轴中值）：端点用可用邻居，不引入不存在的点
  const winRaw = Math.round(Number(opts.smoothWindow ?? 3));
  const sw = Number.isFinite(winRaw) ? Math.max(1, Math.min(9, winRaw | 1)) : 3;
  if (sw > 1) {
    const half = Math.floor(sw / 2);
    pts = pts.map((p, i) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let j = Math.max(0, i - half); j <= Math.min(pts.length - 1, i + half); j++) {
        xs.push(pts[j].x);
        ys.push(pts[j].y);
      }
      return { t: p.t, x: median(xs), y: median(ys) };
    });
  }

  // ③ 单步位移限幅（正向扫描；轨道本身是逐点插值，限幅让大跳变成几段小移动）
  const stepRaw = Number(opts.maxStep ?? 0.08);
  const maxStep = Number.isFinite(stepRaw) ? clampNum(stepRaw, 0.001, 0.5) : 0.08;
  const limited: FaceTrackPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) { limited.push(p); continue; }
    const prev = limited[i - 1];
    limited.push({
      t: p.t,
      x: clampNum(p.x, prev.x - maxStep, prev.x + maxStep),
      y: clampNum(p.y, prev.y - maxStep, prev.y + maxStep),
    });
  }
  pts = limited;

  // ④ 首尾外推 + 显式端点
  const first = pts[0];
  const last = pts[pts.length - 1];
  const withEnds: FaceTrackPoint[] = [];
  if (first.t > 1e-6) withEnds.push({ t: 0, x: first.x, y: first.y });
  withEnds.push(...pts);
  if (last.t < 1 - 1e-6) withEnds.push({ t: 1, x: last.x, y: last.y });

  // ⑤ 点数上限：等距抽稀并保留首尾
  const maxRaw = Math.round(Number(opts.maxPoints ?? MAX_TRACK_POINTS));
  const maxPoints = Number.isFinite(maxRaw) ? clampNum(maxRaw, 2, MAX_TRACK_POINTS) : MAX_TRACK_POINTS;
  let out = withEnds;
  if (out.length > maxPoints) {
    const picked: FaceTrackPoint[] = [];
    for (let i = 0; i < maxPoints; i++) {
      picked.push(out[Math.round((i * (out.length - 1)) / (maxPoints - 1))]);
    }
    out = picked;
  }

  const track = out.map((p) => ({ t: round4(p.t), x: round4(p.x), y: round4(p.y) }));
  if (confidence > 0 && confidence < 0.5) {
    warnings.push(`检脸帧占比 ${Math.round(confidence * 100)}%，漏检区间按最近有效位置保持，画面可能偏离主体`);
  }
  return { track, confidence, warnings };
}

/** 数字 → ffmpeg 表达式字面量（最多 6 位小数，避免科学计数法）。 */
function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(r) ? String(r) : String(r).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * 分段线性表达式：点列必须 t 严格递增、首 t=0、尾 t=1（buildFaceTrack 已保证；
 * 这里也会补端点）。T 是归一化段内位置 `t/段长`。
 */
function piecewiseExpr(points: Array<{ t: number; v: number }>, T: string): string {
  let expr = fmt(points[points.length - 1].v);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    const dt = b.t - a.t;
    if (!(dt > 0)) continue; // 已去重；防御性跳过
    expr = `if(lt(${T},${fmt(b.t)}),lerp(${fmt(a.v)},${fmt(b.v)},(${T}-${fmt(a.t)})/${fmt(dt)}),${expr})`;
  }
  return expr;
}

export interface TrackCropExprOptions {
  /** 裁切宽（0~1，相对 crop 输入画面） */
  w: number;
  /** 裁切高（0~1） */
  h: number;
  /** 段内**输出**时长（秒，crop 滤镜所在链路上的 segDur） */
  dur: number;
}

/**
 * 纯函数：轨迹 → ffmpeg crop 的 x/y 表达式。
 *
 * ★ 时间基准（这是本功能最容易错的地方，结论写死在这里）：
 *   clip-render 的滤镜顺序是 `[scale/fps] → setpts=PTS/speed → [crop]`，
 *   且 trim 用输入侧 `-ss/-t`（源时间戳已重基到 0）。所以 **crop 表达式里的 `t` 是
 *   变速后的段内时间（0~segDur）**。我们不在秒上直接比对，而是用 `t/dur` 归一化，
 *   与 track 的 0~1 定义域对齐 —— 恒定变速、以及曲线变速的 stage-1（speed=1）都成立。
 *   曲线变速的 stage-2 只对成片切片做 setpts，不重跑 crop，因此无需另行换算。
 *
 * ★ 像素换算用 iw/ih/ow/oh（crop 求值时的输入/输出尺寸），而不是写死源分辨率：
 *   预览与导出可能在不同尺寸的链路上跑，写死像素会错位。
 *
 * ★ 表达式的逗号必须靠外层的 `x='...'` 单引号保护（调用方负责），否则 filtergraph
 *   会把逗号当成分隔符。
 */
export function trackToCropExpr(
  track: readonly FaceTrackPoint[] | null | undefined,
  opts: TrackCropExprOptions,
): { x: string; y: string } | null {
  const w = Number(opts?.w);
  const h = Number(opts?.h);
  const dur = Number(opts?.dur);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dur)) return null;
  if (w <= 0 || w > 1 || h <= 0 || h > 1 || dur <= 0) return null;
  if (!Array.isArray(track)) return null;

  // 与 clip-project.normalizeCropTrack 同口径：过滤非法点、夹取、排序、去重
  const pts: FaceTrackPoint[] = [];
  for (const raw of track) {
    if (!raw || typeof raw !== 'object') continue;
    const t = Number(raw.t);
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (![t, x, y].every(Number.isFinite)) continue;
    pts.push({ t: clampNum(t, 0, 1), x: clampNum(x, 0, 1), y: clampNum(y, 0, 1) });
  }
  if (!pts.length) return null;
  pts.sort((a, b) => a.t - b.t);
  const dedup = pts.filter((p, i) => i === 0 || Math.abs(p.t - pts[i - 1].t) > 1e-6);
  if (dedup.length < 2) return null;
  const capped = dedup.length > MAX_TRACK_POINTS
    ? Array.from({ length: MAX_TRACK_POINTS }, (_, i) => dedup[Math.round((i * (dedup.length - 1)) / (MAX_TRACK_POINTS - 1))])
    : dedup;
  const first = capped[0];
  const last = capped[capped.length - 1];
  const full: FaceTrackPoint[] = [
    ...(first.t > 1e-6 ? [{ t: 0, x: first.x, y: first.y }] : []),
    ...capped,
    ...(last.t < 1 - 1e-6 ? [{ t: 1, x: last.x, y: last.y }] : []),
  ];

  const T = `(t/${fmt(dur)})`;
  const xv = piecewiseExpr(full.map((p) => ({ t: p.t, v: p.x })), T);
  const yv = piecewiseExpr(full.map((p) => ({ t: p.t, v: p.y })), T);
  // 中心 → 左上角，并夹到 [0, 画面-裁切尺寸]：表达式层自己保证不出界
  const x = `min(max(iw*(${xv})-ow/2,0),iw-ow)`;
  const y = `min(max(ih*(${yv})-oh/2,0),ih-oh)`;
  return { x, y };
}
