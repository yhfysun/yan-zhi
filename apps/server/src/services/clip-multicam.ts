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
import type { ClipProject, ClipSegment } from './clip-project.js';

/** 默认每段切换间隔（秒）。 */
export const MULTICAM_DEFAULT_SWITCH_SEC = 3;
export const MULTICAM_MIN_SWITCH_SEC = 0.5;
export const MULTICAM_MAX_SWITCH_SEC = 30;
/** 组时长下限（秒）：再短连一次切换都放不下，没有意义。 */
const MIN_GROUP_SEC = 0.5;
/** 可用尾部时长下限（秒）：扣掉头部偏移后不足这么多就没有可剪内容。 */
const MIN_AVAILABLE_SEC = 0.1;

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
}

export type MulticamPlanResult =
  | { ok: true; cuts: MulticamCut[]; groupDurationSec: number; headSec: number[]; warnings: string[] }
  | { ok: false; error: string };

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

  return { ok: true, cuts, groupDurationSec: groupDuration, headSec, warnings };
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
