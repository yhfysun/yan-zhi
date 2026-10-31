// 一键卡点：把音乐节拍点变成时间轴上的切点（纯计算，可单测）。
//
// ★ 为什么放在 services 而不是 applyClipOp：切点位置依赖**各段真实时长**
//   （成片时间轴 → 段内 → 素材时间），而 applyClipOp 是纯结构变换、拿不到磁盘探测结果。
//   所以这一层接收 durations，算完直接给出新的 clips 数组。
//
// ★ 为什么跳过曲线变速段：曲线是"整段源时间上的倍速函数"，从中间切开后每片都会
//   重新从自己的 0% 开始跑曲线 —— 观感与预期不符。与其做半吊子，不如如实跳过并报数。
//
// ★ 关键帧要**重映射**而不是丢弃：关键帧的 t 是段内输出时间比例，切开后每片各占原段的
//   一段比例。丢掉等于静默删用户的工作；直接等比缩放又会在切点处值不连续（画面跳一下）。

import { speedCurveOutToSrc } from '@yan-zhi/shared';
import { segmentDuration, trimmedSourceLength } from './clip-render.js';
import type { ClipProject, ClipSegment } from './clip-project.js';

export interface BeatCutOptions {
  /** 成片时间轴上的节拍点（秒） */
  beatTimes: number[];
  /** 每 N 个拍切一次（1 = 每拍切；2 = 隔一拍切）。默认 1 */
  everyNth?: number;
  /** 切点处给后一段加转场（不给 = 硬切） */
  transition?: { type: string; duration?: number };
  /** 太短的片不切（秒），默认 0.4 —— 0.2 秒的碎片没法看也没法调 */
  minPieceSec?: number;
}

export interface BeatCutResult {
  clips: ClipSegment[];
  /** 实际切了几刀（= 新增的段数） */
  cuts: number;
  /** 被跳过的段数（曲线变速） */
  skipped: number;
  /** 落在段边界太近而放弃的拍点数 */
  dropped: number;
  note: string;
}

type Kf = NonNullable<ClipSegment['keyframes']>[number];

/** 线性插值取原关键帧曲线在 frac 处的值（每个属性各自插值；没给该属性的点不参与）。 */
function kfValueAt(kf: Kf[], key: 'scale' | 'offsetX' | 'offsetY' | 'opacity', frac: number): number | undefined {
  const pts = kf.filter((p) => p[key] != null).sort((a, b) => a.t - b.t);
  if (!pts.length) return undefined;
  if (frac <= pts[0].t) return pts[0][key];
  const last = pts[pts.length - 1];
  if (frac >= last.t) return last[key];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (frac <= b.t) {
      const span = b.t - a.t;
      const va = a[key]!, vb = b[key]!;
      return span <= 1e-9 ? vb : va + (vb - va) * ((frac - a.t) / span);
    }
  }
  return last[key];
}

/**
 * 把关键帧裁到 [f0,f1] 区间并重映射到 0~1。
 * 两端各插一个锚点，保证切点处取值与原曲线一致（不会跳帧）。
 */
export function sliceKeyframes(kf: Kf[] | undefined, f0: number, f1: number): Kf[] | undefined {
  if (!kf?.length) return undefined;
  const span = f1 - f0;
  if (!(span > 1e-6)) return undefined;
  const keys = ['scale', 'offsetX', 'offsetY', 'opacity'] as const;
  const pick = (frac: number): Partial<Kf> => {
    const o: Partial<Kf> = {};
    for (const k of keys) {
      const v = kfValueAt(kf, k, frac);
      if (v != null) (o as Record<string, unknown>)[k] = Number(v.toFixed(4));
    }
    return o;
  };
  const inside = kf.filter((p) => p.t > f0 + 1e-6 && p.t < f1 - 1e-6);
  const out: Kf[] = [
    { ...pick(f0), t: 0 },
    ...inside.map((p) => ({ ...p, t: Number(((p.t - f0) / span).toFixed(4)) })),
    { ...pick(f1), t: 1 },
  ];
  return out;
}

/**
 * 计算卡点后的 clips。
 * @param durations 每段真实时长（键为 clip.id 或 file，与其它模块同口径）
 */
export function planBeatCut(
  project: ClipProject,
  durations: Record<string, number>,
  opts: BeatCutOptions,
): BeatCutResult {
  const minPiece = Math.max(0.1, opts.minPieceSec ?? 0.4);
  const nth = Math.max(1, Math.round(opts.everyNth ?? 1));
  // 每 N 拍取一个（保留第 0 拍）
  const picked = opts.beatTimes.filter((_, i) => i % nth === 0);

  // 现有 id 的最大序号：新段接着往后排，避免撞号
  let idNum = 0;
  for (const c of project.clips) {
    const m = String(c.id).match(/^c(\d+)$/);
    if (m) idNum = Math.max(idNum, Number(m[1]));
  }
  const nextId = () => `c${++idNum}`;

  const out: ClipSegment[] = [];
  let cuts = 0;
  let skipped = 0;
  let dropped = 0;
  let cursor = 0;

  for (const seg of project.clips) {
    const raw = durations[seg.id] ?? durations[seg.file] ?? 0;
    const dur = segmentDuration(seg, raw);
    const start = cursor;
    cursor += dur;

    // 曲线变速段整段透传（见文件头注释）
    if (seg.speedCurve?.length) {
      skipped++;
      out.push(seg);
      continue;
    }
    if (!(dur > minPiece * 2)) {
      dropped += picked.filter((t) => t > start && t < start + dur).length;
      out.push(seg);
      continue;
    }

    // 落在本段内、且离两端都留够 minPiece 的拍点
    const inSeg = picked.filter((t) => t > start + minPiece && t < start + dur - minPiece);
    if (!inSeg.length) {
      out.push(seg);
      continue;
    }
    dropped += picked.filter((t) => t >= start && t <= start + dur && !inSeg.includes(t)).length;

    const srcLen = trimmedSourceLength(seg, raw);
    const tsAbs = seg.trimStart ?? 0;
    const speed = seg.speed && seg.speed > 0 ? seg.speed : 1;
    // 成片时间 → 素材时间（恒定倍速是线性的）
    const srcCuts = inSeg.map((t) => tsAbs + (t - start) * speed).sort((a, b) => a - b);
    const bounds = [tsAbs, ...srcCuts, tsAbs + srcLen];

    for (let k = 0; k < bounds.length - 1; k++) {
      const f0 = srcLen > 0 ? (bounds[k] - tsAbs) / srcLen : 0;
      const f1 = srcLen > 0 ? (bounds[k + 1] - tsAbs) / srcLen : 1;
      const piece: ClipSegment = {
        ...seg,
        id: nextId(),
        trimStart: Number(bounds[k].toFixed(3)),
        trimEnd: Number(bounds[k + 1].toFixed(3)),
      };
      // 关键帧按比例裁切重映射（否则切开后各片都会从头跑一遍动画）
      const kf = sliceKeyframes(seg.keyframes, f0, f1);
      if (kf) piece.keyframes = kf; else delete piece.keyframes;
      // 原转场只属于第一片（它是"从上一段进来"的方式）
      if (k > 0) {
        if (opts.transition) piece.transition = { type: opts.transition.type, ...(opts.transition.duration != null ? { duration: opts.transition.duration } : {}) };
        else delete piece.transition;
      }
      out.push(piece);
      if (k > 0) cuts++;
    }
  }

  const skippedNote = skipped ? `，跳过 ${skipped} 段曲线变速` : '';
  return {
    clips: out,
    cuts,
    skipped,
    dropped,
    note: `已在 ${cuts} 个拍点切开${opts.transition ? `（转场 ${opts.transition.type}）` : '（硬切）'}${skippedNote}`,
  };
}
