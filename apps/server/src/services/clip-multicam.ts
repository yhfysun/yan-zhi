// 多机位编排 MVP（P2）—— 「先对齐，再拍平成一串普通片段」。
//
// ★ 架构取舍（照方案文档「四十」）：
//   本工程主轨是**顺序 clips 数组**，多机位的最终产物本来就是「多次切换后的普通剪辑」。
//   所以这里**不引入多轨数据模型**，而是：
//     1) 用声音对齐求各机位的时间偏移（复用 clip-audio-sync 的 syncAudioFiles）；
//     2) 按固定间隔在机位间轮换，规划成一段段**成片时间区间**；
//     3) 每段生成一个普通 ClipSegment（带 trimStart/trimEnd）插进主轨。
//   生成后它就是普通时间轴内容，用户可继续手动微调切点。
//
// ★ 对齐规则（与 clip-audio-sync 的符号约定配套）：
//   d_i = syncAudioFiles(机位0, 机位i).offsetSec：
//     · d_i > 0：机位 i **开始录音更早**，多出 d_i 秒头部；
//     · d_i < 0：机位 i **开始录音更晚**，缺少 |d_i| 秒头部。
//   ★ 组 0 点取「最晚开始」的那个机位（min d）：head_i = d_i - min(d)（恒 ≥0）。
//     每个机位各自裁掉这段头部后，组起点看到的是同一时刻的画面。
//   ★ 组时长 = min(usable_i - head_i)；拍平后就是普通时间轴内容，可继续手动微调切点。
//
// ★ 边界：
//   · 少于 2 个机位直接报错（多机位没有意义）；
//   · 素材无音轨 / 时长 <1 秒 / 可用尾部为 0 → 可读中文错误，不静默；
//   · 音频对齐置信度低（confident=false）仍继续，但在 warnings 里逐条列出，让调用方复核。

import { stat } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { parseProbeJson, probeArgs, segmentDuration } from './clip-render.js';
import { syncAudioFiles, type AudioSyncOptions } from './clip-audio-sync.js';
import { analyzeBeats } from './clip-beats.js';
import type { ClipProject, ClipSegment, MulticamGroup } from './clip-project.js';

/** 默认每段切换间隔（秒）。 */
export const MULTICAM_DEFAULT_SWITCH_SEC = 3;
export const MULTICAM_MIN_SWITCH_SEC = 0.5;
export const MULTICAM_MAX_SWITCH_SEC = 30;
/** 组时长下限（秒）：再短连一次切换都放不下，没有意义。 */
const MIN_GROUP_SEC = 0.5;
/** 可用尾部时长下限（秒）：扣掉头部偏移后不足这么多就没有可剪内容。 */
const MIN_AVAILABLE_SEC = 0.1;
/** 跟节拍：切点离组首/组尾至少留这么多秒，避免贴边碎段。 */
export const MULTICAM_BEAT_EDGE_SEC = 0.25;
/** 跟节拍：相邻切点最小间隔（秒），节拍点过密时只保留前者。 */
export const MULTICAM_BEAT_MIN_GAP_SEC = 0.5;
/** 跟节拍：有效切点少于这个数就回退等间隔（至少要有 2 个切点 = 3 段）。 */
export const MULTICAM_BEAT_MIN_CUTS = 2;
/** 单组切点数量上限：再密就几乎每段都贴着最小间隔，没有可剪意义。 */
export const MULTICAM_MAX_BOUNDARIES = 200;

/** 切换方式：MVP 两种都按 order 依次轮换（保留字段是为了后续差异化，不额外引入行为）。 */
export type MulticamSwitchMode = 'every' | 'alternate';

/** 一个机位：文件、相对机位 0 的偏移、可用总时长（秒）。 */
export interface MulticamAngle {
  file: string;
  /** 见文件头符号约定（相对机位 0；机位 0 恒为 0） */
  offsetSec: number;
  /** 该素材的可播放总时长（ffprobe 实测） */
  usableSec: number;
}

/** 一个成片时间区间（一次“切到某机位”）。 */
export interface MulticamCut {
  angleIndex: number;
  /** 该区间的素材文件（由规划层带上，生成片段时直接用） */
  file: string;
  /** 成片时间轴起止（秒，组内相对时间） */
  filmStart: number;
  filmEnd: number;
  /** 该区间对应的素材时间起止（秒，已含头部偏移） */
  srcStart: number;
  srcEnd: number;
}

export interface MulticamPlanInput {
  angles: MulticamAngle[];
  /** 每段切换间隔（秒），默认 3，夹 0.5~30 */
  switchEverySec?: number;
  /** 组时长（秒）；不传 = 各机位可用尾部的最小值；传了夹到可用范围内 */
  durationSec?: number;
  /** every / alternate：MVP 行为一致（按顺序循环） */
  mode?: MulticamSwitchMode;
  /**
   * 跟节拍切点（组内相对时间，秒）：严格递增且 0 < b < 组时长。
   * ★ 不传 / 空数组 = 等间隔模式（行为与历史逐字节一致）；传了则按边界切，槽位数 = 边界数+1。
   */
  slotBoundariesSec?: number[];
}

export type MulticamPlanResult =
  | {
      ok: true;
      cuts: MulticamCut[];
      groupDurationSec: number;
      slotSec: number;
      headSec: number[];
      warnings: string[];
      /** 仅跟节拍模式返回：实际使用的切点边界（等间隔模式不带该字段） */
      slotBoundariesSec?: number[];
    }
  | { ok: false; error: string };

export type SlotBoundariesResult =
  | { ok: true; boundaries: number[] }
  | { ok: false; error: string };

/**
 * 纯函数：校验并规整切点边界。
 *
 * · 空数组 / 缺省 → 无边界（等间隔模式）；
 * · 每个切点必须是有限秒数、严格递增、0 < b < groupDurationSec；
 * · 统一 round3 后再校验，避免“四舍五入后不再递增”的浮点坑。
 */
export function validateSlotBoundaries(v: unknown, groupDurationSec: number): SlotBoundariesResult {
  if (v == null) return { ok: true, boundaries: [] };
  if (!Array.isArray(v)) return { ok: false, error: '切点边界必须是秒数数组' };
  if (!v.length) return { ok: true, boundaries: [] };
  const dur = Number(groupDurationSec);
  if (!(dur > 0)) return { ok: false, error: '组时长无效，无法校验切点边界' };
  const arr = v.map((n) => round3(Number(n)));
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (!Number.isFinite(b)) return { ok: false, error: `第 ${i + 1} 个切点不是有效秒数` };
    if (!(b > 1e-6) || !(b < dur - 1e-6)) {
      return { ok: false, error: `第 ${i + 1} 个切点 ${b}s 越过组范围（应大于 0 且小于组时长 ${round3(dur)}s）` };
    }
    if (i > 0 && !(b > arr[i - 1])) {
      return { ok: false, error: `切点必须严格递增（第 ${i} 个 ${arr[i - 1]}s 不小于第 ${i + 1} 个 ${b}s）` };
    }
  }
  return { ok: true, boundaries: arr };
}

export type NormalizeBoundariesResult =
  | { ok: true; boundaries: number[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * 纯函数：把 UI 拖拽出来的切点规整成可落盘/可重建的边界。
 *
 * · 过滤非有限值；
 * · 夹到 `(EDGE, 组时长-EDGE)`（EDGE=0.25s，避免贴边碎段）；
 * · 排序、去重；
 * · 相邻不足 MIN_GAP（0.5s）时向后**推开到最小间隔**（warnings 说明）；
 * · 推开后仍越界则丢弃；
 * · 最终没有有效切点 / 组时长过短 → ok:false（UI 保持原样并提示）。
 *
 * ★ 与 validateSlotBoundaries 的分工：后者是“已存盘的边界必须合法，非法就报错”；
 *   这里是“用户拖出来的原始值可以脏，规整到合法”，只在交互入口使用。
 */
export function normalizeMulticamBoundaries(raw: number[], groupDurationSec: number): NormalizeBoundariesResult {
  const dur = Number(groupDurationSec);
  if (!Number.isFinite(dur) || !(dur > 2 * MULTICAM_BEAT_EDGE_SEC + 1e-9)) {
    return {
      ok: false,
      error: `组时长过短（${round3(Number.isFinite(dur) ? dur : 0)}s），两侧各需留 ${MULTICAM_BEAT_EDGE_SEC}s，无法拖出切点`,
    };
  }
  const lo = MULTICAM_BEAT_EDGE_SEC;
  const hi = round3(dur - MULTICAM_BEAT_EDGE_SEC);
  const warnings: string[] = [];
  const input = Array.isArray(raw) ? raw : [];
  const finite = input.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (finite.length !== input.length) warnings.push(`已忽略 ${input.length - finite.length} 个非数字切点`);

  const clamped: number[] = [];
  let clampCount = 0;
  for (const n of finite) {
    const b = round3(Math.min(hi, Math.max(lo, n)));
    if (Math.abs(b - n) > 1e-9) clampCount++;
    clamped.push(b);
  }
  if (clampCount) warnings.push(`${clampCount} 个切点超出可切范围（${lo}~${hi}s），已夹到边界`);

  clamped.sort((a, b) => a - b);
  const deduped: number[] = [];
  let dupCount = 0;
  for (const b of clamped) {
    if (deduped.length && Math.abs(b - deduped[deduped.length - 1]) < 1e-9) {
      dupCount++;
      continue;
    }
    deduped.push(b);
  }
  if (dupCount) warnings.push(`已合并 ${dupCount} 个重复切点`);

  const boundaries: number[] = [];
  let pushed = 0;
  let dropped = 0;
  for (const b0 of deduped) {
    let b = b0;
    if (boundaries.length && b - boundaries[boundaries.length - 1] < MULTICAM_BEAT_MIN_GAP_SEC - 1e-9) {
      b = round3(boundaries[boundaries.length - 1] + MULTICAM_BEAT_MIN_GAP_SEC);
      pushed++;
    }
    if (b < lo - 1e-9 || b > hi + 1e-9) {
      dropped++;
      continue;
    }
    if (boundaries.length && b - boundaries[boundaries.length - 1] < MULTICAM_BEAT_MIN_GAP_SEC - 1e-9) {
      dropped++;
      continue;
    }
    boundaries.push(round3(b));
  }
  if (pushed) warnings.push(`${pushed} 个切点与相邻切点过近，已推开到最小间隔 ${MULTICAM_BEAT_MIN_GAP_SEC}s`);
  if (dropped) warnings.push(`${dropped} 个切点推开后越界，已丢弃`);

  if (!boundaries.length) {
    return {
      ok: false,
      error: `没有有效切点（需在 ${lo}~${hi}s 之间，且相邻至少间隔 ${MULTICAM_BEAT_MIN_GAP_SEC}s）`,
    };
  }
  return { ok: true, boundaries, warnings };
}

/** 按边界生成连续区间（edges[0]=0，edges[n]=组时长）。 */
function cutsFromEdges(angles: MulticamAngle[], headSec: number[], edges: number[]): MulticamCut[] {
  const cuts: MulticamCut[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const angleIndex = i % angles.length;
    const filmStart = round3(edges[i]);
    const filmEnd = round3(edges[i + 1]);
    const base = headSec[angleIndex];
    cuts.push({
      angleIndex,
      file: angles[angleIndex].file,
      filmStart,
      filmEnd,
      srcStart: round3(base + filmStart),
      srcEnd: round3(base + filmEnd),
    });
  }
  return cuts;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

/**
 * 纯函数：规划多机位切换。
 *
 * 输出是**连续的成片时间区间**：cuts[0].filmStart=0，后一段的 filmStart = 前一段 filmEnd，
 * 最后一段 filmEnd = 组时长（浮点误差 1e-6 内）。调用方据此生成 ClipSegment。
 *
 * 每个机位的素材起点：`srcStart = head_i + 组内偏移`，其中 `head_i = d_i - min(d)`。
 * （见文件头的对齐规则。）
 */
export function planMulticamCuts(input: MulticamPlanInput): MulticamPlanResult {
  const angles = Array.isArray(input?.angles) ? input.angles : [];
  if (angles.length < 2) return { ok: false, error: '多机位至少需要 2 个机位（files 至少 2 个）' };

  const warnings: string[] = [];
  const headSec: number[] = [];
  let maxGroup = Number.POSITIVE_INFINITY;
  // 组 0 点 = 最晚开始的机位：d_i 越小表示开始越晚（见文件头符号约定）
  const offsets = angles.map((a) => (Number.isFinite(Number(a?.offsetSec)) ? Number(a.offsetSec) : 0));
  const minOffset = Math.min(...offsets);

  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    if (!a || !String(a.file || '').trim()) return { ok: false, error: `机位 ${i + 1} 缺少素材路径` };
    const usable = Number(a.usableSec);
    if (!Number.isFinite(usable) || usable <= 0) {
      return { ok: false, error: `机位 ${i + 1} 的可用时长无效（${a.usableSec}）` };
    }
    // 该机位相对“最晚开始机位”多出的头部：d_i - min(d)，恒 ≥ 0
    const head = round3(offsets[i] - minOffset);
    headSec.push(head);
    const avail = usable - head;
    if (avail < MIN_AVAILABLE_SEC) {
      return {
        ok: false,
        error: `机位 ${i + 1} 扣掉对齐偏移 ${head}s 后没有可用画面（素材 ${usable.toFixed(2)}s）`,
      };
    }
    if (avail < maxGroup) maxGroup = avail;
  }

  const switchEvery = round3(clampNum(
    input.switchEverySec,
    MULTICAM_MIN_SWITCH_SEC,
    MULTICAM_MAX_SWITCH_SEC,
    MULTICAM_DEFAULT_SWITCH_SEC,
  ));

  const explicit = input.durationSec == null ? NaN : Number(input.durationSec);
  if (Number.isFinite(explicit) && explicit > 0 && explicit > maxGroup + 1e-6) {
    warnings.push(`请求组时长 ${round3(explicit)}s 超过可用上限 ${round3(maxGroup)}s，已夹到 ${round3(maxGroup)}s`);
  }
  const groupDuration = round3(
    Number.isFinite(explicit) && explicit > 0
      ? Math.min(explicit, maxGroup)
      : maxGroup,
  );
  if (!(groupDuration >= MIN_GROUP_SEC)) {
    return { ok: false, error: `组时长过短（${groupDuration}s，至少 ${MIN_GROUP_SEC}s）` };
  }

  // 跟节拍模式：切点按边界走（槽位数 = 边界数+1）；无边界时保持历史上的等间隔循环不动。
  const boundariesCheck = validateSlotBoundaries(input.slotBoundariesSec, groupDuration);
  if (!boundariesCheck.ok) return boundariesCheck;
  const boundaries = boundariesCheck.boundaries;
  if (boundaries.length) {
    const cuts = cutsFromEdges(angles, headSec, [0, ...boundaries, groupDuration]);
    return {
      ok: true,
      cuts,
      groupDurationSec: groupDuration,
      slotSec: switchEvery,
      headSec,
      warnings,
      slotBoundariesSec: boundaries,
    };
  }

  const cuts: MulticamCut[] = [];
  let cursor = 0;
  let k = 0;
  // 循环上限兜底：group/switchEvery 最坏 30/0.5=60 段；多留余量防浮点死循环。
  const guard = Math.ceil(groupDuration / MULTICAM_MIN_SWITCH_SEC) + 4;
  while (cursor < groupDuration - 1e-6 && k < guard) {
    const angleIndex = k % angles.length;
    const filmStart = round3(cursor);
    const filmEnd = round3(Math.min(cursor + switchEvery, groupDuration));
    const base = headSec[angleIndex];
    cuts.push({
      angleIndex,
      file: angles[angleIndex].file,
      filmStart,
      filmEnd,
      srcStart: round3(base + filmStart),
      srcEnd: round3(base + filmEnd),
    });
    cursor = filmEnd;
    k++;
  }

  return { ok: true, cuts, groupDurationSec: groupDuration, slotSec: switchEvery, headSec, warnings };
}

// ===== 跟节拍（P2）：第 1 个机位的音频 → 组内切点边界 =====

export interface BeatBoundaryPlan {
  /** 组内相对时间的切点（严格递增，已过滤贴边与过密点） */
  boundaries: number[];
  /** 保留的切点数（= boundaries.length） */
  beatsUsed: number;
  /** 过滤前的拍点数 */
  beatsTotal: number;
}

/**
 * 纯函数：拍点（相对**素材文件**的秒数）→ 组内切点边界。
 *
 * · 机位 1 相对组起点的头部偏移是 headsSec[0] → 组内时间 = beat - headsSec[0]；
 * · 只保留 0.25 < 组内时间 < 组时长-0.25（避免贴边碎段）；
 * · 相邻切点 < 0.5s 只保留前者（防止节拍点过密把时间轴炸成筛子）。
 */
export function beatTimesToBoundaries(
  beats: number[],
  headSec0: number,
  groupDurationSec: number,
): BeatBoundaryPlan {
  const dur = Number(groupDurationSec);
  const head = Number.isFinite(Number(headSec0)) ? Number(headSec0) : 0;
  const list = (Array.isArray(beats) ? beats : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const boundaries: number[] = [];
  if (!(dur > 2 * MULTICAM_BEAT_EDGE_SEC)) return { boundaries, beatsUsed: 0, beatsTotal: list.length };
  const lo = MULTICAM_BEAT_EDGE_SEC;
  const hi = dur - MULTICAM_BEAT_EDGE_SEC;
  for (const t of list) {
    const rel = round3(t - head);
    if (!(rel > lo) || !(rel < hi)) continue;
    if (boundaries.length && rel - boundaries[boundaries.length - 1] < MULTICAM_BEAT_MIN_GAP_SEC - 1e-9) continue;
    boundaries.push(rel);
  }
  return { boundaries, beatsUsed: boundaries.length, beatsTotal: list.length };
}

export type BeatBoundaryResult =
  | { ok: true; boundaries: number[]; bpm: number; warnings: string[] }
  | { ok: false; error: string };

/**
 * IO 层：分析第 1 个机位的音频节拍 → 组内切点边界。
 *
 * ★ 只用机位 1：组以它为对齐基准，头部偏移最小（headsSec[0] 通常为 0），换算最稳。
 * ★ 分析失败 / 有效切点不足 → ok:false（调用方据此**如实回退等间隔**并在 warnings 写明原因）。
 */
export async function computeBeatBoundaries(
  ffmpegBin: string,
  file: string,
  headSec0: number,
  groupDurationSec: number,
): Promise<BeatBoundaryResult> {
  const det = await analyzeBeats(ffmpegBin, file);
  if (!det.ok) return { ok: false, error: `音频节拍分析失败：${det.error || '未知错误'}` };
  const plan = beatTimesToBoundaries(det.beats, headSec0, groupDurationSec);
  if (plan.boundaries.length < MULTICAM_BEAT_MIN_CUTS) {
    return {
      ok: false,
      error: `音频节拍不足（有效切点 ${plan.boundaries.length} 个，至少需要 ${MULTICAM_BEAT_MIN_CUTS} 个；BPM ${det.bpm || '未测出'}）`,
    };
  }
  const warnings: string[] = [];
  if (plan.beatsUsed < plan.beatsTotal) {
    warnings.push(
      `节拍点贴边/过密已过滤：${plan.beatsTotal} 个拍点保留 ${plan.beatsUsed} 个切点（最小间隔 ${MULTICAM_BEAT_MIN_GAP_SEC}s）`,
    );
  }
  return { ok: true, boundaries: plan.boundaries, bpm: det.bpm, warnings };
}

export type MulticamBuildResult =
  | { ok: true; segments: ClipSegment[] }
  | { ok: false; error: string };

/**
 * 纯函数：把规划好的区间生成普通 ClipSegment。
 *
 * · id 由 idFactory 提供；若与工程已有片段撞号，自动追加 -2/-3（不静默覆盖）。
 * · 不生成转场 / 淡入淡出 / 变速 / 关键帧 —— 新片段保持“干净素材”，交给用户在时间轴微调。
 * · 保留默认音频（不写 audioFile / keepOriginalAudio），原声跟随画面。
 * · label 标注机位序号，方便用户在时间轴上认。
 */
export function buildMulticamSegments(
  project: Pick<ClipProject, 'clips'>,
  cuts: MulticamCut[],
  idFactory?: (index: number) => string,
): MulticamBuildResult {
  if (!Array.isArray(cuts) || cuts.length === 0) return { ok: false, error: '多机位规划为空（没有可生成的片段）' };
  const used = new Set((project?.clips || []).map((c) => String(c.id || '')));
  const segments: ClipSegment[] = [];

  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    const file = String(c?.file || '').trim();
    if (!file) return { ok: false, error: `第 ${i + 1} 段缺少素材路径` };
    if (!(c.srcEnd > c.srcStart + 1e-6)) {
      return { ok: false, error: `第 ${i + 1} 段裁剪区间无效：${c.srcStart}s → ${c.srcEnd}s` };
    }
    let base = String(idFactory ? idFactory(i) : `mc${i + 1}`).trim() || `mc${i + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    segments.push({
      id,
      file,
      label: `机位${c.angleIndex + 1}`,
      trimStart: round3(c.srcStart),
      trimEnd: round3(c.srcEnd),
    });
  }
  return { ok: true, segments };
}

export interface MulticamAlignOptions extends AudioSyncOptions {
  /** 不传沿用 planMulticamCuts 的默认（仅用于把告警带回来；这里不规划） */
  switchEverySec?: number;
}

export type MulticamAlignResult =
  | {
      ok: true;
      angles: MulticamAngle[];
      /** 与 angles 同序；机位 0 恒为 0 */
      offsetSec: number[];
      warnings: string[];
    }
  | { ok: false; error: string };

interface ProbedFile {
  ok: boolean;
  durationSec: number;
  hasAudio: boolean;
  error?: string;
}

async function probeFile(ffprobe: string, file: string, label: string): Promise<ProbedFile> {
  try {
    const st = await stat(file);
    if (!st.isFile()) return { ok: false, durationSec: 0, hasAudio: false, error: `${label} 不是文件：${file}` };
  } catch {
    return { ok: false, durationSec: 0, hasAudio: false, error: `${label} 文件不存在：${file}` };
  }
  const r = await runCmd(ffprobe, probeArgs(file), { timeoutMs: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!r.ok) {
    return { ok: false, durationSec: 0, hasAudio: false, error: `${label} 探测失败：${(r.stderr || r.error || '').slice(-200)}` };
  }
  const p = parseProbeJson(String(r.stdout || ''));
  if (!(p.durationSec > 0)) return { ok: false, durationSec: 0, hasAudio: p.hasAudio, error: `${label} 时长未知：${file}` };
  return { ok: true, durationSec: p.durationSec, hasAudio: p.hasAudio };
}

/**
 * IO 层：探测各机位时长，并用声音把 file[1..] 对齐到 file[0]。
 *
 * · 无音轨 / 过短 → 返回可读错误（多机位对齐依赖声音，静默给 0 偏移会生成错位成片）；
 * · confident=false → 继续，但 warnings 里逐条列出（机位号、分数、偏移），让调用方复核。
 *
 * ★ 只做“对齐”，不做规划/生成片段 —— 保持纯函数层可脱机单测。
 */
export async function buildMulticamFromFiles(
  files: string[],
  opts: MulticamAlignOptions = {},
): Promise<MulticamAlignResult> {
  const list = (Array.isArray(files) ? files : []).map((f) => String(f || '').trim()).filter(Boolean);
  if (list.length < 2) return { ok: false, error: '多机位至少需要 2 个机位（files 至少 2 个本机视频路径）' };

  const ff = await resolveFfmpeg();
  if (!ff.ok) return { ok: false, error: ff.error || '本机尚未安装 ffmpeg（多机位对齐需要它）' };

  const warnings: string[] = [];
  const angles: MulticamAngle[] = [];
  const offsetSec: number[] = [];
  const probed: ProbedFile[] = [];

  for (let i = 0; i < list.length; i++) {
    const p = await probeFile(ff.ffprobe, list[i], `机位 ${i + 1}`);
    if (!p.ok) return { ok: false, error: p.error || `机位 ${i + 1} 探测失败` };
    if (!p.hasAudio) {
      return { ok: false, error: `机位 ${i + 1}（${list[i]}）没有音轨，无法用声音对齐。请先补音轨，或改用普通 add_clip 手动对齐` };
    }
    if (p.durationSec < 1) {
      return { ok: false, error: `机位 ${i + 1} 素材过短（${p.durationSec.toFixed(2)} 秒，至少需要 1 秒）` };
    }
    probed.push(p);
  }

  offsetSec.push(0);
  for (let i = 1; i < list.length; i++) {
    const r = await syncAudioFiles(list[0], list[i], {
      ...(opts.maxLagSec != null ? { maxLagSec: opts.maxLagSec } : {}),
      ...(opts.capSec != null ? { capSec: opts.capSec } : {}),
      ...(opts.hopSec != null ? { hopSec: opts.hopSec } : {}),
    });
    if (!r.ok) return { ok: false, error: `机位 ${i + 1} 音频对齐失败：${r.error || '未知错误'}` };
    const off = Number.isFinite(Number(r.offsetSec)) ? Number(r.offsetSec) : 0;
    offsetSec.push(off);
    if (r.confident === false) {
      warnings.push(
        `机位 ${i + 1} 音频对齐置信度低（score=${r.score}，offset=${off}s）：已继续，切换点请人工复核`,
      );
    }
  }

  for (let i = 0; i < list.length; i++) {
    angles.push({ file: list[i], offsetSec: offsetSec[i], usableSec: round3(probed[i].durationSec) });
  }
  return { ok: true, angles, offsetSec, warnings };
}

export interface InsertMulticamOptions {
  /** 插入位置（成片秒）。缺省 / 非有限值 = 追加到末尾。 */
  startSec?: number;
  /** 工程现有各段真实素材时长（键为 clip.id 或 file）；不传则只能追加。 */
  durations?: Record<string, number>;
}

export type InsertMulticamResult =
  | { ok: true; project: ClipProject; insertIndex: number; effectiveStartSec: number; note: string }
  | { ok: false; error: string };

/**
 * 纯函数：把多机位片段插进主轨，保证主轨仍**首尾相接**。
 *
 * 语义：
 *   · start 缺省 → 追加到末尾；
 *   · start 落在某段中间 → 插在**覆盖该时刻的段之后**（新组从下一个段边界开始），后续段顺延；
 *   · start 正好在段边界 → 插在该边界处；
 *   · start 超出总时长 → 夹到末尾。
 * ★ “顺延”不是时间挪动：主轨本来就是顺序数组，插入后后面的片段自然接在新组之后。
 */
export function insertMulticamSegments(
  project: ClipProject,
  segments: ClipSegment[],
  opts: InsertMulticamOptions = {},
): InsertMulticamResult {
  if (!segments.length) return { ok: false, error: '没有可插入的多机位片段' };
  const durations = opts.durations || {};
  const clips = Array.isArray(project?.clips) ? project.clips : [];
  const durOf = (seg: ClipSegment): number => {
    if (seg.kenburns) return Math.max(0, Number(seg.kenburns.duration) || 0);
    const raw = Number(durations[seg.id] ?? durations[seg.file] ?? 0);
    return raw > 0 ? segmentDuration(seg, raw) : 0;
  };

  const requested = opts.startSec == null ? NaN : Number(opts.startSec);
  if (!Number.isFinite(requested)) {
    const index = clips.length;
    return {
      ok: true,
      project: { ...project, clips: [...clips, ...segments], updatedAt: Date.now() },
      insertIndex: index,
      effectiveStartSec: round3(clips.reduce((s, c) => s + durOf(c), 0)),
      note: `已追加到时间轴末尾（第 ${index} 段之后）`,
    };
  }

  let cursor = 0;
  let insertIndex = clips.length;
  let effectiveStart = 0;
  for (let i = 0; i < clips.length; i++) {
    const d = durOf(clips[i]);
    if (!(d > 0)) {
      return { ok: false, error: `无法计算插入位置：时间轴第 ${i + 1} 段时长未知（素材可能被移动），请改为追加到末尾` };
    }
    const next = cursor + d;
    if (requested <= next + 1e-6) {
      insertIndex = i + 1;
      effectiveStart = next;
      break;
    }
    cursor = next;
    effectiveStart = next;
  }
  const clamped = Math.max(0, requested);
  effectiveStart = Math.min(effectiveStart, round3(clips.reduce((s, c) => s + durOf(c), 0)));
  if (requested <= 0) {
    insertIndex = 0;
    effectiveStart = 0;
  }
  const before = clips.slice(0, insertIndex);
  const after = clips.slice(insertIndex);
  return {
    ok: true,
    project: { ...project, clips: [...before, ...segments, ...after], updatedAt: Date.now() },
    insertIndex,
    effectiveStartSec: round3(effectiveStart),
    note:
      Math.abs(clamped - effectiveStart) > 0.01
        ? `请求插在 ${round3(clamped)}s，已落到最近的段边界 ${round3(effectiveStart)}s（第 ${insertIndex} 段之后）`
        : `已插在第 ${insertIndex} 段之后（成片 ${round3(effectiveStart)}s 处）`,
  };
}

// ===== 手动切换（P2）：按槽位点选机位 → 原地重建这一段 =====

/**
 * 组的槽位数：跟节拍组 = 边界数+1；等间隔组 = ceil(组时长 / 每段时长)；最后一段可短于 slotSec。
 */
export function multicamSlotCount(group: Pick<MulticamGroup, 'groupDurationSec' | 'slotSec' | 'slotBoundariesSec'>): number {
  const boundaries = Array.isArray(group?.slotBoundariesSec) ? group.slotBoundariesSec : [];
  if (boundaries.length) return boundaries.length + 1;
  const dur = Number(group?.groupDurationSec);
  const slot = Number(group?.slotSec);
  if (!(dur > 0) || !(slot > 0)) return 0;
  return Math.max(1, Math.ceil(dur / slot - 1e-9));
}

export type MulticamCutsResult =
  | { ok: true; cuts: MulticamCut[]; groupDurationSec: number }
  | { ok: false; error: string };

/**
 * 纯函数：按用户指定的槽位机位重建切点（不碰工程、不碰磁盘）。
 *
 * · slotAngles 长度必须等于 ceil(groupDurationSec / slotSec)，每项 ∈ [0, files.length-1]；
 * · srcStart = headsSec[angle] + 组内偏移（与 planMulticamCuts 同一口径）；
 * · 区间连续、总长恒等于 groupDurationSec（最后一段可用掉不足 slotSec 的尾巴）。
 */
export function rebuildMulticamCuts(group: MulticamGroup, slotAngles: number[]): MulticamCutsResult {
  const files = (Array.isArray(group?.files) ? group.files : [])
    .map((f) => String(f || '').trim())
    .filter(Boolean);
  if (files.length < 2) return { ok: false, error: '多机位组缺少机位文件（至少需要 2 个）' };
  const heads = Array.isArray(group?.headsSec) ? group.headsSec.map((n) => Number(n)) : [];
  if (heads.length < files.length) return { ok: false, error: '多机位组缺少各机位的头部偏移（headsSec 数量不足）' };
  const groupDuration = Number(group.groupDurationSec);
  if (!(groupDuration > 0)) return { ok: false, error: '多机位组时长无效（groupDurationSec 必须大于 0）' };
  const slotSec = Number(group.slotSec);
  if (!(slotSec > 0)) return { ok: false, error: '多机位组每段时长无效（slotSec 必须大于 0）' };

  // 跟节拍组：按组内边界切（槽位数 = 边界数+1）；无边界 = 等间隔（历史行为不变）。
  const boundariesCheck = validateSlotBoundaries(group.slotBoundariesSec, groupDuration);
  if (!boundariesCheck.ok) return boundariesCheck;
  const boundaries = boundariesCheck.boundaries;
  const edges = boundaries.length ? [0, ...boundaries, round3(groupDuration)] : null;
  const expected = multicamSlotCount({ groupDurationSec: groupDuration, slotSec, slotBoundariesSec: boundaries });
  if (!Array.isArray(slotAngles) || slotAngles.length !== expected) {
    const detail = edges
      ? `按 ${boundaries.length} 个节拍切点共 ${expected} 段`
      : `组时长 ${round3(groupDuration)}s / 每段 ${round3(slotSec)}s`;
    return {
      ok: false,
      error: `槽位数量应为 ${expected}（${detail}），实际 ${Array.isArray(slotAngles) ? slotAngles.length : 0}`,
    };
  }

  const cuts: MulticamCut[] = [];
  let cursor = 0;
  for (let i = 0; i < expected; i++) {
    const angle = Number(slotAngles[i]);
    if (!Number.isInteger(angle) || angle < 0 || angle >= files.length) {
      return {
        ok: false,
        error: `第 ${i + 1} 个槽位的机位 ${JSON.stringify(slotAngles[i])} 无效（可选 1~${files.length}）`,
      };
    }
    const filmStart = edges ? round3(edges[i]) : round3(cursor);
    // 等间隔模式：最后一段强制收到组时长（避免 ceil/浮点让末尾短一截或越界）
    const filmEnd = edges
      ? round3(edges[i + 1])
      : i === expected - 1
        ? round3(groupDuration)
        : round3(Math.min(cursor + slotSec, groupDuration));
    if (!(filmEnd > filmStart + 1e-6)) {
      return { ok: false, error: `第 ${i + 1} 段的成片区间无效：${filmStart}s → ${filmEnd}s` };
    }
    const head = heads[angle];
    if (!Number.isFinite(head) || head < 0) return { ok: false, error: `机位 ${angle + 1} 的头部偏移无效` };
    cuts.push({
      angleIndex: angle,
      file: files[angle],
      filmStart,
      filmEnd,
      srcStart: round3(head + filmStart),
      srcEnd: round3(head + filmEnd),
    });
    cursor = filmEnd;
  }
  return { ok: true, cuts, groupDurationSec: round3(groupDuration) };
}

export type MulticamRebuildResult =
  | {
      ok: true;
      project: ClipProject;
      groupId: string;
      segments: number;
      note: string;
    }
  | { ok: false; error: string };

/**
 * 原地重建一个多机位组：只替换组内的连续片段，其他片段与图层完全不动。
 *
 * 前置条件（不满足就报可读错误，不猜）：
 *   · 组存在，且记录了 clipIds；
 *   · 这些片段都还在工程里，且在 clips 中**连续出现**；
 *   · 槽位数与 clipIds 数量一致（同一组时长/每段时长，理应一致）。
 *
 * ★ 片段 id 沿用原 id（buildMulticamSegments 的 idFactory 复用），
 *   这样时间轴选中态/图层引用不会因为一次切换全部失效。
 * ★ 组时长不变 → 主轨总时长与所有字幕/画中画/音频层的时间都无需顺延。
 */
export interface RebuildMulticamGroupOptions {
  /**
   * 与规划出的段一一对应的目标 id；`null` = 该段是新插入的，需要生成新 id。
   * 缺省 = 用组里记录的 clipIds（数量必须与规划段数一致）。
   * ★ 增删切点后段数会变，调用方用它在正确的槽位复用原 id、给新段发新 id。
   */
  segmentIds?: Array<string | null>;
}

export function rebuildMulticamGroup(
  project: ClipProject,
  groupId: string,
  slotAngles: number[],
  options: RebuildMulticamGroupOptions = {},
): MulticamRebuildResult {
  const groups = Array.isArray(project?.multicamGroups) ? project.multicamGroups : [];
  const groupIndex = groups.findIndex((g) => g.id === groupId);
  if (groupIndex < 0) return { ok: false, error: `多机位组不存在：${groupId || '(空 id)'}` };
  const group = groups[groupIndex];
  const clipIds = (Array.isArray(group.clipIds) ? group.clipIds : []).map((id) => String(id || ''));
  if (!clipIds.length) return { ok: false, error: '多机位组没有记录片段 id，无法原地重建' };

  const planned = rebuildMulticamCuts(group, slotAngles);
  if (!planned.ok) return planned;

  const targetIds: Array<string | null> = Array.isArray(options.segmentIds)
    ? options.segmentIds.map((id) => (id == null ? null : String(id)))
    : clipIds;
  if (targetIds.length !== planned.cuts.length) {
    return {
      ok: false,
      error: `槽位数量（${planned.cuts.length}）与目标片段数（${targetIds.length}）不一致，无法原地重建`,
    };
  }
  // 只有有 id 的段需要已存在且连续；null 段是新插入的（由 buildMulticamSegments 发新 id）。
  const namedIds = targetIds.filter((id): id is string => !!id);
  if (!namedIds.length) return { ok: false, error: '多机位组没有记录片段 id，无法原地重建' };
  const clipIdSet = new Set(clipIds);
  const foreign = namedIds.filter((id) => !clipIdSet.has(id));
  if (foreign.length) {
    return { ok: false, error: `目标片段 id 不属于该多机位组（${foreign.join('、')}），无法原地重建` };
  }

  const clips = Array.isArray(project.clips) ? project.clips : [];
  // 连续性按**原组全部片段**校验：删切点时被合并掉的那段仍在时间轴上，不能被当成“中间插入的片段”。
  const positions = clipIds.map((id) => clips.findIndex((c) => c.id === id));
  const missing = clipIds.filter((_, i) => positions[i] < 0);
  if (missing.length) {
    return { ok: false, error: `多机位组片段已被删除（${missing.join('、')}），无法原地重建` };
  }
  const first = positions[0];
  const last = positions[positions.length - 1];
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] !== positions[0] + i) {
      return { ok: false, error: '多机位组片段在时间轴上不再连续（中间插入了其他片段），无法原地重建' };
    }
  }

  // 复用原 id：把待替换片段从「已占用 id」集合里排除，避免被去重成 id-2
  const idSet = new Set(namedIds);
  const remaining = clips.filter((c) => !idSet.has(c.id));
  const built = buildMulticamSegments(
    { clips: remaining },
    planned.cuts,
    (i) => targetIds[i] ?? `${group.id}_s${i + 1}`,
  );
  if (!built.ok) return built;

  const total = round3(planned.cuts.reduce((sum, c) => sum + (c.filmEnd - c.filmStart), 0));
  if (Math.abs(total - planned.groupDurationSec) > 1e-6) {
    return { ok: false, error: `重建后的片段总时长 ${total}s 与组时长 ${planned.groupDurationSec}s 不一致` };
  }

  const nextClips = [...clips.slice(0, first), ...built.segments, ...clips.slice(last + 1)];
  const nextGroup: MulticamGroup = {
    ...group,
    slotAngles: slotAngles.map((n) => Number(n)),
    clipIds: built.segments.map((s) => s.id),
  };
  const nextGroups = groups.map((g, i) => (i === groupIndex ? nextGroup : g));
  return {
    ok: true,
    project: { ...project, clips: nextClips, multicamGroups: nextGroups, updatedAt: Date.now() },
    groupId: group.id,
    segments: built.segments.length,
    note: `已按槽位重切 ${built.segments.length} 段（总时长 ${planned.groupDurationSec}s 不变）`,
  };
}

export type MulticamBoundariesResult =
  | {
      ok: true;
      project: ClipProject;
      groupId: string;
      boundaries: number[];
      slotAngles: number[];
      segments: number;
      warnings: string[];
      note: string;
    }
  | { ok: false; error: string };

/** 现有 slotAngles 循环补齐/截断到 count 个；非法值回退到 0。 */
function cycleSlotAngles(existing: unknown, count: number, fileCount: number): number[] {
  const src = Array.isArray(existing) && existing.length ? existing : [0];
  return Array.from({ length: count }, (_, i) => {
    const a = Number(src[i % src.length]);
    return Number.isInteger(a) && a >= 0 && a < fileCount ? a : 0;
  });
}

/** 组的“旧边界”：优先用落盘的 slotBoundariesSec；等间隔组按 slotSec 推导。数量必须 = count-1。 */
function groupBoundariesForCount(group: MulticamGroup, count: number): number[] | null {
  const dur = Number(group.groupDurationSec);
  const existing = (Array.isArray(group.slotBoundariesSec) ? group.slotBoundariesSec : [])
    .map((n) => round3(Number(n)));
  if (existing.length === count - 1) {
    const check = validateSlotBoundaries(existing, dur);
    if (check.ok && check.boundaries.length === existing.length) return check.boundaries;
  }
  const slot = Number(group.slotSec);
  if (!(dur > 0) || !(slot > 0)) return null;
  const derived = Array.from({ length: Math.max(0, count - 1) }, (_, i) => round3((i + 1) * slot));
  const check = validateSlotBoundaries(derived, dur);
  if (!check.ok || check.boundaries.length !== derived.length) return null;
  return check.boundaries;
}

function sameBoundary(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** 新边界比旧边界多一个 → 返回被插入的下标；对不上返回 -1。 */
function findInsertedBoundaryIndex(oldB: number[], newB: number[]): number {
  let j = 0;
  for (let i = 0; i < newB.length; i++) {
    if (j < oldB.length && sameBoundary(newB[i], oldB[j])) { j++; continue; }
    return i;
  }
  return -1;
}

/** 新边界比旧边界少一个 → 返回被删除的下标；对不上返回 -1。 */
function findRemovedBoundaryIndex(oldB: number[], newB: number[]): number {
  let j = 0;
  for (let i = 0; i < oldB.length; i++) {
    if (j < newB.length && sameBoundary(oldB[i], newB[j])) { j++; continue; }
    return i;
  }
  return -1;
}

/**
 * 服务路径（纯函数）：把一组新切点写进组并**原地重建**组内片段。
 *
 * · 组不存在 / 组时长过短 / 没有有效切点 → 可读错误；
 * · 切点数量可以比原组多 1 / 少 1（增删切点）：按新旧边界差异定位插入/删除位置，
 *   在正确槽位复用原片段 id，新段发新 id；超过 1 个的批量增删不支持；
 * · slotAngles 缺省时按现有槽位循环补齐/截断；给了则必须长度 = 切点数+1、值域合法；
 * · 更新组 `slotBoundariesSec` 后复用 `rebuildMulticamGroup`（id/组时长/其他图层均不动）。
 */
export function applyMulticamBoundaries(
  project: ClipProject,
  groupId: string,
  rawBoundaries: number[],
  slotAngles?: number[],
): MulticamBoundariesResult {
  const groups = Array.isArray(project?.multicamGroups) ? project.multicamGroups : [];
  const groupIndex = groups.findIndex((g) => g.id === groupId);
  if (groupIndex < 0) return { ok: false, error: `多机位组不存在：${groupId || '(空 id)'}` };
  const group = groups[groupIndex];
  const files = (Array.isArray(group.files) ? group.files : []).map((f) => String(f || '').trim()).filter(Boolean);
  if (files.length < 2) return { ok: false, error: '多机位组缺少机位文件（至少需要 2 个）' };

  const normalized = normalizeMulticamBoundaries(rawBoundaries, group.groupDurationSec);
  if (!normalized.ok) return normalized;
  const count = normalized.boundaries.length + 1;
  if (normalized.boundaries.length > MULTICAM_MAX_BOUNDARIES) {
    return { ok: false, error: `切点数量已达上限（${MULTICAM_MAX_BOUNDARIES} 个）` };
  }

  const clipIds = (Array.isArray(group.clipIds) ? group.clipIds : []).map((id) => String(id || ''));
  if (!clipIds.length) return { ok: false, error: '多机位组没有记录片段 id，无法原地重建' };

  // 段数变化：只允许单次 +1（加切点）/-1（删切点），并从新旧边界差异定位是哪一个槽位。
  let segmentIds: Array<string | null>;
  const delta = count - clipIds.length;
  if (delta === 0) {
    segmentIds = clipIds;
  } else if (delta === 1) {
    const oldB = groupBoundariesForCount(group, clipIds.length);
    if (!oldB) return { ok: false, error: '无法确定多机位组原有切点，不能添加切点' };
    const j = findInsertedBoundaryIndex(oldB, normalized.boundaries);
    if (j < 0) return { ok: false, error: '无法识别新增切点的位置，不能重建' };
    segmentIds = [...clipIds.slice(0, j + 1), null, ...clipIds.slice(j + 1)];
  } else if (delta === -1) {
    const oldB = groupBoundariesForCount(group, clipIds.length);
    if (!oldB) return { ok: false, error: '无法确定多机位组原有切点，不能删除切点' };
    const i = findRemovedBoundaryIndex(oldB, normalized.boundaries);
    if (i < 0) return { ok: false, error: '无法识别删除切点的位置，不能重建' };
    // 合并时保留左侧槽位的片段（去掉右槽位的 id）
    segmentIds = clipIds.filter((_, k) => k !== i + 1);
  } else {
    return {
      ok: false,
      error: `切点对应 ${count} 段，原组是 ${clipIds.length} 段；一次只支持增删一个切点`,
    };
  }

  let angles: number[];
  if (slotAngles == null) {
    angles = cycleSlotAngles(group.slotAngles, count, files.length);
  } else {
    if (!Array.isArray(slotAngles)) return { ok: false, error: 'slotAngles 必须是机位下标的数组' };
    if (slotAngles.length !== count) {
      return { ok: false, error: `槽位数量应为 ${count}（${normalized.boundaries.length} 个切点 + 1），实际 ${slotAngles.length}` };
    }
    angles = slotAngles.map((n) => Number(n));
    for (let i = 0; i < angles.length; i++) {
      if (!Number.isInteger(angles[i]) || angles[i] < 0 || angles[i] >= files.length) {
        return { ok: false, error: `第 ${i + 1} 个槽位的机位 ${JSON.stringify(slotAngles[i])} 无效（可选 1~${files.length}）` };
      }
    }
  }

  const nextGroup: MulticamGroup = {
    ...group,
    slotBoundariesSec: normalized.boundaries,
    slotAngles: angles,
  };
  const projected: ClipProject = {
    ...project,
    multicamGroups: groups.map((g, i) => (i === groupIndex ? nextGroup : g)),
  };
  const rebuilt = rebuildMulticamGroup(projected, groupId, angles, { segmentIds });
  if (!rebuilt.ok) return rebuilt;
  return {
    ok: true,
    project: rebuilt.project,
    groupId: group.id,
    boundaries: normalized.boundaries,
    slotAngles: angles,
    segments: rebuilt.segments,
    warnings: normalized.warnings,
    note: `已按 ${normalized.boundaries.length} 个切点重切 ${rebuilt.segments} 段（总时长 ${round3(Number(group.groupDurationSec))}s 不变）`,
  };
}

export type InsertMulticamBoundaryResult =
  | { ok: true; boundaries: number[]; slotAngles: number[]; note: string }
  | { ok: false; error: string };

/**
 * 纯函数：在最长的槽位中点插入一个切点（切点增删的“加”）。
 *
 * · 槽位 = `[0, ...boundaries, 组时长]`；取最长的一段插中点，避免越加越碎；
 * · 新槽位的机位 = **左侧槽位机位 + 1**（对 angleCount 取模）；
 * · 结果再过一遍 `normalizeMulticamBoundaries`：中点离相邻切点不足 0.5s 会被推开/丢弃，
 *   数量没有真的 +1 就报可读错误（UI 保持原样并提示），不静默丢切点。
 */
export function insertMulticamBoundary(
  boundaries: number[],
  slotAngles: number[],
  groupDurationSec: number,
  angleCount: number,
): InsertMulticamBoundaryResult {
  const dur = Number(groupDurationSec);
  if (!Number.isFinite(dur) || !(dur > 2 * MULTICAM_BEAT_EDGE_SEC + 1e-9)) {
    return {
      ok: false,
      error: `组时长过短（${round3(Number.isFinite(dur) ? dur : 0)}s），两侧各需留 ${MULTICAM_BEAT_EDGE_SEC}s，无法添加切点`,
    };
  }
  const count = Number(angleCount);
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: '机位数量无效，无法添加切点' };
  const base = (Array.isArray(boundaries) ? boundaries : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (base.length >= MULTICAM_MAX_BOUNDARIES) {
    return { ok: false, error: `切点数量已达上限（${MULTICAM_MAX_BOUNDARIES} 个）` };
  }

  const edges = [0, ...base, round3(dur)];
  let longest = 0;
  for (let i = 1; i < edges.length - 1; i++) {
    if (edges[i + 1] - edges[i] > edges[longest + 1] - edges[longest] + 1e-9) longest = i;
  }
  const longestLen = round3(edges[longest + 1] - edges[longest]);
  const mid = round3((edges[longest] + edges[longest + 1]) / 2);

  const normalized = normalizeMulticamBoundaries([...base, mid].sort((a, b) => a - b), dur);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  if (normalized.boundaries.length !== base.length + 1) {
    return {
      ok: false,
      error: `最长的一段只有 ${longestLen}s，中点离相邻切点不足 ${MULTICAM_BEAT_MIN_GAP_SEC}s，无法再插入切点`,
    };
  }

  // 规整后找“新出现的那个切点”的下标 = 被插入的切点下标 = 左侧槽位下标。
  let insertAt = longest;
  const matched = new Set<number>();
  for (let i = 0; i < normalized.boundaries.length; i++) {
    const hit = base.findIndex((b, k) => !matched.has(k) && sameBoundary(b, normalized.boundaries[i]));
    if (hit < 0) { insertAt = i; break; }
    matched.add(hit);
  }

  const expected = base.length + 1;
  const slots = Array.isArray(slotAngles) && slotAngles.length === expected
    ? slotAngles.map((n) => Number(n))
    : cycleSlotAngles(slotAngles, expected, count);
  const leftAngle = Number.isInteger(slots[insertAt]) && slots[insertAt] >= 0 && slots[insertAt] < count
    ? slots[insertAt]
    : 0;
  const newAngle = (leftAngle + 1) % count;
  const nextSlots = [
    ...slots.slice(0, insertAt + 1),
    newAngle,
    ...slots.slice(insertAt + 1),
  ].map((n) => (Number.isInteger(n) && n >= 0 && n < count ? n : 0));

  return {
    ok: true,
    boundaries: normalized.boundaries,
    slotAngles: nextSlots,
    note: `已在最长一段（第 ${longest + 1} 段，${round3(edges[longest])}s→${round3(edges[longest + 1])}s）中点 ${normalized.boundaries[insertAt]}s 插入切点；新段取机位${newAngle + 1}`,
  };
}

export type RemoveMulticamBoundaryResult =
  | { ok: true; boundaries: number[]; slotAngles: number[] }
  | { ok: false; error: string };

/**
 * 纯函数：删除第 index 个切点（0 基，切点增删的“删”）。
 *
 * · 删除 = 合并左右两个槽位，**保留左侧槽位的机位**（slotAngles 去掉右槽位）；
 * · 索引越界 / 只剩一个槽位（没有切点）/ 删完只剩一个槽位 → 可读错误，不改数据。
 */
export function removeMulticamBoundary(
  boundaries: number[],
  slotAngles: number[],
  index: number,
): RemoveMulticamBoundaryResult {
  const list = (Array.isArray(boundaries) ? boundaries : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (list.length <= 1) {
    return {
      ok: false,
      error: list.length
        ? '至少要保留一个切点（再删组内只剩一个槽位）'
        : '该组没有切点（只剩一个槽位），无法删除',
    };
  }
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    return {
      ok: false,
      error: `第 ${Number.isFinite(idx) ? idx + 1 : '?'} 个切点不存在（共 ${list.length} 个）`,
    };
  }
  const slots = Array.isArray(slotAngles) ? slotAngles.map((n) => Number(n)) : [];
  if (slots.length !== list.length + 1) {
    return {
      ok: false,
      error: `槽位数量（${slots.length}）与切点数（${list.length}）不一致，无法删除切点`,
    };
  }
  return {
    ok: true,
    boundaries: list.filter((_, i) => i !== idx),
    slotAngles: slots.filter((_, i) => i !== idx + 1),
  };
}

/** 生成一个不与现有组冲突的组 id（mcg + 时间戳 base36）。 */
export function nextMulticamGroupId(project: Pick<ClipProject, 'multicamGroups'>): string {
  const used = new Set((project?.multicamGroups || []).map((g) => g.id));
  const base = `mcg${Date.now().toString(36)}`;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  return id;
}

export interface MulticamGroupInput {
  files: string[];
  /** 与 files 同序；机位 0 恒为 0 */
  offsetsSec: number[];
  /** 规划结果（d_i - min(d)），与 files 同序 */
  headsSec: number[];
  /** 实际插入位置（成片秒） */
  filmStart: number;
  groupDurationSec: number;
  slotSec: number;
  /** 本次规划出的切点（slotAngles 由它派生，保证与生成的片段一致） */
  cuts: MulticamCut[];
  /** 本次生成的片段（clipIds 由它派生） */
  segments: ClipSegment[];
  /** 跟节拍切点（可选；不传/空 = 等间隔组） */
  slotBoundariesSec?: number[];
}

/**
 * 纯函数：把一次 add_multicam 的规划结果固化成组元数据。
 * ★ 单独抽出来是为了可单测「写入的字段是否正确」，也让执行器不必手抄字段。
 */
export function makeMulticamGroup(
  project: Pick<ClipProject, 'multicamGroups'>,
  input: MulticamGroupInput,
): MulticamGroup {
  const boundaries = Array.isArray(input.slotBoundariesSec) ? input.slotBoundariesSec : [];
  return {
    id: nextMulticamGroupId(project),
    files: [...input.files],
    offsetsSec: [...input.offsetsSec],
    headsSec: [...input.headsSec],
    filmStart: Number(input.filmStart) || 0,
    groupDurationSec: Number(input.groupDurationSec),
    slotSec: Number(input.slotSec),
    slotAngles: input.cuts.map((c) => c.angleIndex),
    ...(boundaries.length ? { slotBoundariesSec: boundaries.map((b) => Number(b)) } : {}),
    clipIds: input.segments.map((s) => s.id),
  };
}
