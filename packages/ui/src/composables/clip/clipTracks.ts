// 多轨时间轴（S3）的纯逻辑：轨道模型 ↔ v2 视图同步、吸附、同轨重叠约束。
//
// ★ 为什么单独成文件：ClipWorkbench.vue 已经很大，而这类"时间轴算术"最容易出错
//   （像素↔秒、空档、重叠、吸附），放在组件里只能靠肉眼验收。抽成纯函数后可直接单测。
//
// ★ 数据分工（与 server 的 S1/S2 口径一致）：
//   · `tracks` 是 v3 规范模型；
//   · `clips` / `audios` 是 v2 投影视图（渲染/AI op 继续读它们）；
//   · UI 的轨道编辑**立即镜像**到视图（clips 顺序、audios 内容），
//     既有 op 编辑视图后在 save 时由 syncProjectModel 重建主轨。

export type TrackKind = 'video' | 'audio';

export interface UiClipItem {
  type: 'clip';
  id: string;
  start?: number;
  duration?: number;
  /** 与组件里的 ClipSegment 同构；这里只搬运不解释字段 */
  segment: any;
}

export interface UiAudioItem {
  type: 'audio';
  id: string;
  file: string;
  start: number;
  duration: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  trimStart?: number;
}

export interface UiCompoundItem {
  type: 'compound';
  id: string;
  start: number;
  duration: number;
  project: UiProject;
  transform?: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number };
  audio?: { volume?: number; muted?: boolean };
}

export type UiTrackItem = UiClipItem | UiAudioItem | UiCompoundItem;

export interface UiTrack {
  id: string;
  kind: TrackKind;
  name?: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  blend?: string;
  opacity?: number;
  multicamGroupId?: string;
  multicamAngleIndex?: number;
  items: UiTrackItem[];
}

export interface UiProject {
  version?: number;
  name?: string;
  updatedAt?: number;
  output?: { size: string; fps: number; [key: string]: unknown };
  clips: any[];
  audios?: any[];
  tracks?: UiTrack[];
  timedLayers?: any[];
}

/** 已解析时间位置（用于渲染/拖拽；不写回工程）。 */
export type ResolvedClipItem = UiClipItem & { start: number; duration: number };
export type ResolvedAudioItem = UiAudioItem & { start: number; duration: number };
export type ResolvedCompoundItem = UiCompoundItem & { start: number; duration: number };

const EPS = 1e-6;
export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export const isClipItem = (it: UiTrackItem): it is UiClipItem => it.type === 'clip';
export const isAudioItem = (it: UiTrackItem): it is UiAudioItem => it.type === 'audio';
export const isCompoundItem = (it: UiTrackItem): it is UiCompoundItem => it.type === 'compound';

export function nextTrackId(tracks: UiTrack[], kind: TrackKind): string {
  const prefix = kind === 'video' ? 'v' : 'a';
  let max = 0;
  for (const t of tracks) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

function toAudioItem(a: any): UiAudioItem {
  return {
    type: 'audio',
    id: String(a.id),
    file: String(a.file),
    start: Number(a.start) || 0,
    duration: round3(Math.max(0, (Number(a.end) || 0) - (Number(a.start) || 0))),
    ...(a.volume != null ? { volume: a.volume } : {}),
    ...(a.fadeIn != null ? { fadeIn: a.fadeIn } : {}),
    ...(a.fadeOut != null ? { fadeOut: a.fadeOut } : {}),
    ...(a.trimStart != null ? { trimStart: a.trimStart } : {}),
  };
}

function toClipAudio(a: UiAudioItem): any {
  return {
    id: a.id,
    file: a.file,
    start: a.start,
    end: round3(a.start + a.duration),
    ...(a.volume != null && Math.abs(a.volume - 1) > 1e-6 ? { volume: a.volume } : {}),
    ...(a.fadeIn != null && a.fadeIn > 0 ? { fadeIn: a.fadeIn } : {}),
    ...(a.fadeOut != null && a.fadeOut > 0 ? { fadeOut: a.fadeOut } : {}),
    ...(a.trimStart != null && a.trimStart > 0 ? { trimStart: a.trimStart } : {}),
  };
}

/** 稳定序列化（键排序）：判断"视图有没有被改过"。 */
const stable = (v: unknown): string => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : val);

/** 轨道项按起点排序；有未知起点保持原顺序（顺序即名义时间轴）。 */
export function sortItems<T extends { start?: number }>(items: T[]): T[] {
  if (!items.every((it) => it.start != null)) return [...items];
  return [...items].sort((a, b) => (a.start as number) - (b.start as number));
}

/**
 * 解析视频轨的显示布局：缺 start/duration 的项按前一项结束时间顺排。
 * ★ 不修改入参 —— 渲染与拖拽都基于解析结果，落盘时只写用户实际改过的值。
 */
export function resolveClipItems(track: UiTrack, durationOf: (seg: any) => number): ResolvedClipItem[] {
  const clips = track.items.filter(isClipItem);
  const ordered = sortItems(clips);
  const out: ResolvedClipItem[] = [];
  let cursor = 0;
  for (const it of ordered) {
    const d = it.duration ?? Math.max(0, durationOf(it.segment));
    const st = it.start ?? cursor;
    out.push({ ...it, start: round3(st), duration: round3(Math.max(0, d)) });
    cursor = st + Math.max(0, d);
  }
  return out;
}

export function resolveAudioItems(track: UiTrack): ResolvedAudioItem[] {
  return sortItems(track.items.filter(isAudioItem)).map((it) => ({
    ...it,
    start: round3(it.start),
    duration: round3(Math.max(0, it.duration)),
  }));
}

export function resolveVideoItems(
  track: UiTrack,
  durationOf: (seg: any) => number,
): Array<ResolvedClipItem | ResolvedCompoundItem> {
  const clipResolved = new Map(resolveClipItems(track, durationOf).map((it) => [it.id, it]));
  const compounds = new Map<string, ResolvedCompoundItem>();
  for (const item of track.items) {
    if (!isCompoundItem(item)) continue;
    compounds.set(item.id, {
      ...item,
      start: round3(Number(item.start) || 0),
      duration: round3(Math.max(0, Number(item.duration) || 0)),
    });
  }
  return sortItems([...clipResolved.values(), ...compounds.values()]) as Array<ResolvedClipItem | ResolvedCompoundItem>;
}

/** 只读视图：有 tracks 用 tracks；没有就按 clips/audios 合成（不写回工程）。 */
export function viewVideoRows(p: UiProject | null | undefined, durationOf: (seg: any) => number): UiTrack[] {
  if (!p) return [];
  if (Array.isArray(p.tracks) && p.tracks.some((t) => t.kind === 'video')) {
    return p.tracks.filter((t) => t.kind === 'video');
  }
  let cursor = 0;
  const items: UiClipItem[] = (p.clips || []).map((seg) => {
    const d = Math.max(0, durationOf(seg));
    const it: UiClipItem = { type: 'clip', id: seg.id, start: round3(cursor), duration: round3(d), segment: seg };
    cursor += d;
    return it;
  });
  return [{ id: 'v1', kind: 'video', name: '主轨', items }];
}

export function viewAudioRows(p: UiProject | null | undefined): UiTrack[] {
  if (!p) return [];
  if (Array.isArray(p.tracks) && p.tracks.some((t) => t.kind === 'audio')) {
    return p.tracks.filter((t) => t.kind === 'audio');
  }
  const items = (p.audios || []).map(toAudioItem);
  return items.length ? [{ id: 'a1', kind: 'audio', name: '音频', items }] : [];
}

/** 把 v2 视图物化成 v3 轨道（首次做轨道编辑时调用；会写回工程并升版本）。 */
export function ensureTracks(p: UiProject | null | undefined, durationOf: (seg: any) => number): UiTrack[] {
  if (!p) return [];
  if (!Array.isArray(p.tracks) || !p.tracks.length) {
    let cursor = 0;
    const items: UiClipItem[] = (p.clips || []).map((seg) => {
      const d = Math.max(0, durationOf(seg));
      const it: UiClipItem = { type: 'clip', id: seg.id, start: round3(cursor), duration: round3(d), segment: seg };
      cursor += d;
      return it;
    });
    const tracks: UiTrack[] = [{ id: 'v1', kind: 'video', name: '主轨', items }];
    const audios = (p.audios || []).map(toAudioItem);
    if (audios.length) tracks.push({ id: 'a1', kind: 'audio', name: '音频', items: audios });
    p.tracks = tracks;
    p.version = 3;
    return tracks;
  }
  if (!p.tracks.some((t) => t.kind === 'video')) {
    p.tracks.unshift({ id: nextTrackId(p.tracks, 'video'), kind: 'video', name: '主轨', items: [] });
  }
  p.version = 3;
  return p.tracks;
}

function sameClipView(items: UiClipItem[], clips: any[]): boolean {
  if (items.length !== clips.length) return false;
  const ordered = sortItems(items);
  return ordered.every((it, i) =>
    it.id === clips[i]?.id && stable(it.segment) === stable(clips[i]));
}

function sameAudioView(items: UiAudioItem[], audios: any[]): boolean {
  if (items.length !== audios.length) return false;
  const ordered = sortItems(items);
  return ordered.every((it, i) => stable(toClipAudio(it)) === stable(audios[i]));
}

/**
 * 保存前同步：v2 视图 ↔ 轨道。
 *
 * 规则（与 server 的 buildProjectV3ForWrite 同构）：
 *   · 视频主轨：视图没变 → 以轨道布局为准，刷新 clips 顺序（保住空档/绝对位置）；
 *     视图变了（既有 op 改过）→ 按 clips 重建主轨（顺序首尾相接）。
 *   · 音频主轨：始终以 audios 视图为准重建（UI 的音频轨道编辑已即时镜像到 audios）。
 *   · 额外轨道原样保留。
 */
export function syncProjectModel(p: UiProject | null | undefined, durationOf: (seg: any) => number): void {
  if (!p) return;
  const tracks = p.tracks;
  if (!Array.isArray(tracks) || !tracks.length) return;
  const mainVideo = tracks.find((t) => t.kind === 'video');
  const clips = Array.isArray(p.clips) ? p.clips : (p.clips = []);
  if (mainVideo) {
    const items = mainVideo.items.filter(isClipItem);
    const hasCompound = mainVideo.items.some(isCompoundItem);
    if (sameClipView(items, clips)) {
      // 轨道布局权威 → 视图按起点顺序跟随（id/segment 原样）
      p.clips = resolveClipItems(mainVideo, durationOf).map((it) => ({
        ...it.segment,
        id: it.segment?.id || it.id,
      }));
    } else if (hasCompound) {
      // v2 clips 无法表达 compound：保留 compound，只协调普通片段。
      const viewIds = new Set(clips.map((c) => String(c.id)));
      const next: UiTrackItem[] = mainVideo.items
        .filter((it) => isCompoundItem(it) || viewIds.has(it.id))
        .map((it) => {
          if (!isClipItem(it)) return it;
          const view = clips.find((c) => String(c.id) === it.id);
          return view ? { ...it, segment: view } : it;
        });
      let cursor = next.reduce((max, it) => Math.max(max, (it.start ?? 0) + (it.duration ?? 0)), 0);
      for (const seg of clips) {
        if (next.some((it) => it.id === String(seg.id))) continue;
        const d = Math.max(0, durationOf(seg));
        next.push({ type: 'clip', id: String(seg.id), start: round3(cursor), duration: round3(d), segment: seg });
        cursor += d;
      }
      mainVideo.items = next.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
      p.clips = resolveClipItems(mainVideo, durationOf).map((it) => ({
        ...it.segment,
        id: it.segment?.id || it.id,
      }));
    } else {
      // 视图被 op 改过 → 主轨按顺序首尾相接重建
      let cursor = 0;
      mainVideo.items = clips.map((seg) => {
        const d = Math.max(0, durationOf(seg));
        const it: UiClipItem = { type: 'clip', id: seg.id, start: round3(cursor), duration: round3(d), segment: seg };
        cursor += d;
        return it;
      });
    }
  }
  const mainAudio = tracks.find((t) => t.kind === 'audio');
  const audios = Array.isArray(p.audios) ? p.audios : (p.audios = []);
  if (mainAudio) {
    if (sameAudioView(mainAudio.items.filter(isAudioItem), audios)) {
      p.audios = resolveAudioItems(mainAudio).map(toClipAudio);
    } else {
      mainAudio.items = audios.map(toAudioItem);
    }
  } else if (audios.length) {
    tracks.push({ id: nextTrackId(tracks, 'audio'), kind: 'audio', name: '音频', items: audios.map(toAudioItem) });
  }
}

/** 轨道编辑后立即镜像：主轨 items → clips（顺序按起点）。 */
export function mirrorClipsFromMainTrack(p: UiProject | null | undefined, durationOf: (seg: any) => number): void {
  if (!p) return;
  const main = p.tracks?.find((t) => t.kind === 'video');
  if (!main) return;
  p.clips = resolveClipItems(main, durationOf).map((it) => ({ ...it.segment, id: it.segment?.id || it.id }));
}

/** 音频轨道编辑后立即镜像：第一条音频轨 → audios。 */
export function mirrorAudiosFromMainTrack(p: UiProject | null | undefined): void {
  if (!p) return;
  const main = p.tracks?.find((t) => t.kind === 'audio');
  p.audios = main ? resolveAudioItems(main).map(toClipAudio) : [];
}

/** 同轨可用空隙（已排除自身）。 */
export function freeRanges(items: Array<{ id: string; start: number; duration: number }>, excludeId: string): Array<{ s: number; e: number }> {
  const others = items
    .filter((i) => i.id !== excludeId && i.duration > EPS)
    .sort((a, b) => a.start - b.start);
  const out: Array<{ s: number; e: number }> = [];
  let cur = 0;
  for (const o of others) {
    if (o.start > cur + EPS) out.push({ s: cur, e: o.start });
    cur = Math.max(cur, o.start + o.duration);
  }
  out.push({ s: cur, e: Infinity });
  return out;
}

/**
 * 把期望起点夹进"放得下当前时长"的空隙里（同轨不许重叠）。
 * 返回 null = 该轨没有任何能放下这段的空隙。
 */
export function clampWithinGaps(
  items: Array<{ id: string; start: number; duration: number }>,
  excludeId: string,
  desiredStart: number,
  duration: number,
): number | null {
  const feasible = freeRanges(items, excludeId).filter((r) => r.e - r.s >= duration - EPS);
  if (!feasible.length) return null;
  const desired = Math.max(0, desiredStart);
  const containing = feasible.find((r) => desired >= r.s - EPS && desired + duration <= r.e + EPS);
  if (containing) return round3(Math.max(containing.s, Math.min(desired, containing.e - duration)));
  let bestStart: number | null = null;
  let bestDist = Infinity;
  for (const r of feasible) {
    const s = Math.max(r.s, Math.min(desired, r.e - duration));
    const d = Math.abs(s - desired);
    if (d < bestDist) { bestDist = d; bestStart = s; }
  }
  return round3(bestStart ?? 0);
}

/** 与其它项是否重叠（排除自身）。 */
export function overlapsOthers(
  items: Array<{ id: string; start: number; duration: number }>,
  excludeId: string,
  start: number,
  duration: number,
): boolean {
  return items.some((i) =>
    i.id !== excludeId
    && i.duration > EPS
    && start < i.start + i.duration - EPS
    && start + duration > i.start + EPS);
}

/**
 * 吸附：把片段起点对齐到附近的时间点。
 * ★ 同时尝试"起点对齐"与"终点对齐"（贴住邻居的右边缘时是终点吸附，只对齐起点会差一段）。
 * ★ thresholdSec 由调用方按 8px 换算 —— 缩放变化时吸附手感不变。
 */
export function snapStart(desiredStart: number, duration: number, points: number[], thresholdSec: number): number {
  if (!(thresholdSec > 0)) return round3(Math.max(0, desiredStart));
  let best = desiredStart;
  let bestDist = thresholdSec;
  for (const p of points) {
    for (const cand of [p, p - duration]) {
      const d = Math.abs(cand - desiredStart);
      if (d < bestDist) { bestDist = d; best = cand; }
    }
  }
  return round3(Math.max(0, best));
}
