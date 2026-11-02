// 智能剪口播（P2-5）：按 ASR 时间戳删静音/语气词，生成保留区间并切段。
//
// ★ 为什么是"删静音"而不是"按文本重排"：删除是**可逆、可解释**的（保留区间 + 删除原因），
//   用户能看懂为什么少了这几秒；重排（改语序）既没有可靠算法，也会毁掉画面与口型的对应。
//
// ★ 粒度诚实边界：whisper 给的是**句级** cue（没有逐字时间戳），所以：
//   · 静音：可以精确到 cue 之间的空隙（本文件的核心能力）；
//   · 语气词：只能整条剔除"纯语气词"cue（"嗯。""啊"）；
//     句首/句尾夹带的语气词无法单独切掉（需要逐字时间戳），保留不动。
//
// ★ 时间口径：本文件内所有区间默认是**源文件时间**；只有 ripple 相关函数处理成片时间。
//   混用是本项目最容易错位的地方 —— 函数名与字段注释里都写明。
import type { ClipProject, ClipSegment } from './clip-project.js';

export interface AsrCue {
  text: string;
  start: number;
  end: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export type CutReason = 'lead' | 'tail' | 'gap' | 'filler';

export interface CutDetail extends TimeRange {
  reason: CutReason;
  /** 被整条删掉的语气词文本（reason=filler 时有） */
  text?: string;
}

export interface TalkingCutOptions {
  /** 静音阈值（秒）：停顿短于它就不切（正常换气），默认 0.6 */
  minSilence?: number;
  /** 语音两侧各保留多少（秒），默认 0.12 —— 一点不留会把字头/字尾咬掉 */
  padding?: number;
  /** 是否剔除"纯语气词"cue，默认 true */
  removeFillers?: boolean;
  /** 最多切多少处（默认 200）；超过就拒绝而不是把时间轴炸成筛子 */
  maxCuts?: number;
}

export interface TalkingCutPlan {
  ok: boolean;
  error?: string;
  /** 保留区间（源文件时间，升序、互不重叠） */
  keeps: TimeRange[];
  /** 删除区间（源文件时间，带原因） */
  cuts: CutDetail[];
  /** 说话总时长（不含 padding） */
  speechSec: number;
  /** 将删除的总时长 */
  removedSec: number;
}

export const TALKING_CUT_DEFAULTS = {
  minSilence: 0.6,
  padding: 0.12,
  removeFillers: true,
  maxCuts: 200,
} as const;

// 纯语气词判定：去掉空白/标点后只剩这些字 → 视为可整条删除的语气词。
// ★ 故意不收「哈」：笑声常是有意义的反应；宁可漏删，不要误删。
const FILLER_CHARS = /[嗯啊哦噢呃额唔唉诶哎呀嘛]/g;
const PUNCT_CHARS = /[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]…—\-~～]/g;

/** 这条 cue 是否只是语气词/标点（整条可删）。 */
export function isFillerCue(text: string): boolean {
  const t = String(text || '').replace(PUNCT_CHARS, '');
  if (!t) return true;   // 纯标点也当无信息
  return t.replace(FILLER_CHARS, '').length === 0;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 规划保留/删除区间。
 * @param cues ASR 结果（**源文件时间**；调用方负责按片段截取后补上起点偏移）
 * @param range 片段在源文件里的范围 [trimStart, trimEnd]
 */
export function planTalkingCut(
  cues: AsrCue[],
  range: TimeRange,
  opts: TalkingCutOptions = {},
): TalkingCutPlan {
  const minSilence = clamp(Number(opts.minSilence ?? TALKING_CUT_DEFAULTS.minSilence), 0.15, 5);
  const padding = clamp(Number(opts.padding ?? TALKING_CUT_DEFAULTS.padding), 0, 0.5);
  const removeFillers = opts.removeFillers !== false;
  const maxCuts = Math.max(1, Math.round(Number(opts.maxCuts ?? TALKING_CUT_DEFAULTS.maxCuts)));
  const empty: TalkingCutPlan = { ok: false, keeps: [], cuts: [], speechSec: 0, removedSec: 0 };

  const rs = Number(range?.start);
  const re = Number(range?.end);
  if (!(Number.isFinite(rs) && Number.isFinite(re)) || re - rs < 0.2) {
    return { ...empty, error: '片段范围非法（trimEnd 必须大于 trimStart）', keeps: [{ start: rs, end: re }] };
  }

  // 夹到片段范围内；起止必须还有长度
  const clamped = (Array.isArray(cues) ? cues : [])
    .filter((c) => c && Number.isFinite(Number(c.start)) && Number.isFinite(Number(c.end)))
    .map((c) => ({
      text: String(c.text || '').trim(),
      start: clamp(Number(c.start), rs, re),
      end: clamp(Number(c.end), rs, re),
    }))
    .filter((c) => c.end - c.start > 0.01);
  if (!clamped.length) {
    return { ...empty, error: '该片段时间范围内没有识别到语音（可换 medium 模型或确认原声未关闭）' };
  }

  const fillers = removeFillers ? clamped.filter((c) => isFillerCue(c.text)) : [];
  const speech = removeFillers ? clamped.filter((c) => !isFillerCue(c.text)) : clamped;
  if (!speech.length) {
    return { ...empty, error: '识别到的全是语气词，没有可保留的句子（可关闭「删语气词」重试）' };
  }

  // 1) 语音块：相邻间隔 < minSilence 视为同一块（正常换气不切）
  //    ★ 用 1e-6 容差：0.6s 的停顿在浮点里可能是 0.59999999，否则"刚好等于阈值"会被误判成可切
  const blocks: Array<{ start: number; end: number }> = [];
  for (const c of speech.sort((a, b) => a.start - b.start)) {
    const last = blocks[blocks.length - 1];
    if (last && c.start - last.end < minSilence - 1e-6) last.end = Math.max(last.end, c.end);
    else blocks.push({ start: c.start, end: c.end });
  }
  const speechSec = r3(blocks.reduce((a, b) => a + (b.end - b.start), 0));

  // 2) 保留区间 = 语音块两侧各留 padding；padding 造成重叠就合并
  const keeps: TimeRange[] = [];
  for (const b of blocks) {
    const s = clamp(b.start - padding, rs, re);
    const e = clamp(b.end + padding, rs, re);
    const last = keeps[keeps.length - 1];
    if (last && s <= last.end + 1e-6) last.end = Math.max(last.end, e);
    else keeps.push({ start: r3(s), end: r3(e) });
  }

  // 3) 删除区间 = 保留区间的补集（首/尾静音也算）
  const cuts: CutDetail[] = [];
  let cursor = rs;
  for (const k of keeps) {
    if (k.start - cursor > 0.01) cuts.push(makeCut(cursor, k.start, rs, re, fillers));
    cursor = Math.max(cursor, k.end);
  }
  if (re - cursor > 0.01) cuts.push(makeCut(cursor, re, rs, re, fillers));

  if (cuts.length > maxCuts) {
    return {
      ...empty, keeps,
      error: `需要切 ${cuts.length} 处，超过上限 ${maxCuts} 处：请把静音阈值调大（当前 ${minSilence}s）后重试`,
    };
  }
  const removedSec = r3(cuts.reduce((a, c) => a + (c.end - c.start), 0));
  return { ok: true, keeps, cuts, speechSec, removedSec };
}

/** 给补集区间定原因：含被删语气词中点 → filler；首/尾 → lead/tail；其余 gap。 */
function makeCut(
  start: number,
  end: number,
  rangeStart: number,
  rangeEnd: number,
  fillers: Array<{ text: string; start: number; end: number }>,
): CutDetail {
  const inside = fillers.filter((f) => {
    const mid = (f.start + f.end) / 2;
    return mid >= start && mid <= end;
  });
  if (inside.length) {
    return { start: r3(start), end: r3(end), reason: 'filler', text: inside.map((f) => f.text).filter(Boolean).join(' ') };
  }
  if (start <= rangeStart + 1e-6) return { start: r3(start), end: r3(end), reason: 'lead' };
  if (end >= rangeEnd - 1e-6) return { start: r3(start), end: r3(end), reason: 'tail' };
  return { start: r3(start), end: r3(end), reason: 'gap' };
}

/** 源文件时间 → 成片时间（仅恒定倍速；曲线变速由调用方拒绝）。 */
export function sourceToFilm(
  sourceSec: number,
  o: { trimStart: number; speed?: number; clipStartFilm: number },
): number {
  const speed = Number(o.speed ?? 1) || 1;
  return o.clipStartFilm + (sourceSec - o.trimStart) / speed;
}

/**
 * 删除区间（源文件时间）→ 成片时间。
 * ★ 必须换算：ripple 作用在字幕/画中画等**成片时间**字段上。
 */
export function sourceCutsToFilm(
  cuts: TimeRange[],
  o: { trimStart: number; speed?: number; clipStartFilm: number },
): TimeRange[] {
  return cuts
    .map((c) => ({
      start: sourceToFilm(c.start, o),
      end: sourceToFilm(c.end, o),
    }))
    .filter((c) => c.end - c.start > 0.001)
    .sort((a, b) => a.start - b.start);
}

/**
 * 按保留区间把一段切开。
 * ★ 会丢掉后面的片段才有的字段语义（转场/淡入淡出是"进入/离开"事件），只保留在首/尾片；
 *   段级关键帧与曲线变速在切分后必然重复/错位，直接拒绝（诚实报错而不是默默画错）。
 */
export function splitSegmentByKeeps(
  seg: ClipSegment,
  keeps: TimeRange[],
  makeId: (i: number) => string,
): { ok: true; segments: ClipSegment[] } | { ok: false; error: string } {
  if (!seg) return { ok: false, error: '片段不存在' };
  if (seg.speedCurve?.length) {
    return { ok: false, error: '该片段用了曲线变速：时间映射非线性，切开后音画会错位。请先改成恒定速度' };
  }
  if (seg.kenburns || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(seg.file)) {
    return { ok: false, error: '图片/定格片段没有口播音频，无法智能剪口播' };
  }
  if (seg.keyframes?.length || seg.mask?.keyframes?.length) {
    return { ok: false, error: '该片段带段级/蒙版关键帧：切开后动画会在每段重复。请先清除关键帧再剪' };
  }
  const valid = (Array.isArray(keeps) ? keeps : [])
    .filter((k) => Number.isFinite(k.start) && Number.isFinite(k.end) && k.end - k.start > 0.05)
    .sort((a, b) => a.start - b.start);
  if (!valid.length) return { ok: false, error: '没有可保留的区间' };

  const segments: ClipSegment[] = valid.map((k, i) => {
    const piece: ClipSegment = {
      ...seg,
      id: makeId(i),
      trimStart: r3(k.start),
      trimEnd: r3(k.end),
    };
    // 转场/淡入是"进入"事件，只属于第一片；淡出只属于最后一片
    if (i > 0) {
      delete piece.transition;
      delete piece.fadeIn;
    }
    if (i < valid.length - 1) delete piece.fadeOut;
    return piece;
  });
  return { ok: true, segments };
}

/** 在 t 之前一共被删掉了多少秒（removals 需升序且互不重叠）。 */
export function removedBefore(removals: TimeRange[], t: number): number {
  let removed = 0;
  for (const r of removals) {
    if (t <= r.start) break;
    removed += Math.min(t, r.end) - r.start;
  }
  return Math.max(0, removed);
}

export interface RippleResult {
  /** 被平移/缩短的图层数量 */
  shifted: number;
  /** 完全落在删除区间里、随之移除的图层数量（时间没了，内容留着只会变成孤块） */
  dropped: number;
}

/**
 * 删除区间之后，把成片时间轴上的图层整体"前移"。
 *
 * ★ 为什么必须做：工程里字幕/画中画/贴纸/定时音频/特效层都是**绝对成片时间**。
 *   剪掉一段口播只缩短了 clips，不搬图层的话，后面所有内容都会比画面晚（最长会整段错位）。
 * ★ 跨删除区间的图层：start/end 各按"该时刻之前删掉多少"前移 → 时长自然缩短。
 * ★ 完全落在删除区间里的图层（例如给"嗯"配的字幕）直接移除 —— 那段时间已经不存在了，
 *   硬保留会被压到切点变成孤块。返回 dropped 供调用方如实汇报。
 * ★ 原地修改（与工程里其他编辑操作一致），调用方负责落盘。
 */
export function rippleTimelineLayers(project: ClipProject, removals: TimeRange[]): RippleResult {
  const sorted = (Array.isArray(removals) ? removals : [])
    .filter((r) => r.end - r.start > 0.001)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return { shifted: 0, dropped: 0 };
  let shifted = 0;
  let dropped = 0;

  const fullyInside = (s: number, e: number) =>
    sorted.some((r) => s >= r.start - 1e-3 && e <= r.end + 1e-3);

  /** 过滤掉落在删除区间里的图层并平移剩下的；返回新数组。 */
  const rippleList = <T extends { start: number; end: number }>(list: T[] | undefined): T[] | undefined => {
    if (!Array.isArray(list)) return list;
    const kept: T[] = [];
    for (const layer of list) {
      const s = Number(layer.start) || 0;
      const e = Number(layer.end) || 0;
      if (fullyInside(s, e)) { dropped++; continue; }
      if (e <= sorted[0].start) { kept.push(layer); continue; }   // 删除点之前：完全不动
      const ns = r3(Math.max(0, s - removedBefore(sorted, s)));
      const ne = r3(Math.max(ns + 0.05, e - removedBefore(sorted, e)));
      if (Math.abs(ns - s) > 1e-4 || Math.abs(ne - e) > 1e-4) {
        layer.start = ns;
        layer.end = ne;
        shifted++;
      }
      kept.push(layer);
    }
    return kept;
  };

  project.texts = rippleList(project.texts) || [];
  if (project.overlays) project.overlays = rippleList(project.overlays);
  if (project.stickers) project.stickers = rippleList(project.stickers);
  if (project.audios) project.audios = rippleList(project.audios);
  if (project.effects) project.effects = rippleList(project.effects);
  return { shifted, dropped };
}
