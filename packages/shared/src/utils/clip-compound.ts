// 复合片段（S4）的共享纯函数：UI 打包/解包与服务端深度/缓存口径必须一致。

export const COMPOUND_MAX_DEPTH = 3;

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface CompoundItemLike {
  type: 'compound';
  id: string;
  start: number;
  duration: number;
  project: CompoundProjectLike;
  transform?: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number };
  audio?: { volume?: number; muted?: boolean };
  [key: string]: unknown;
}

export interface CompoundTrackItemLike {
  type: 'clip' | 'audio' | 'compound';
  id: string;
  start?: number;
  duration?: number;
  segment?: any;
  file?: string;
  [key: string]: any;
}

export interface CompoundTrackLike {
  id: string;
  kind: 'video' | 'audio';
  name?: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  blend?: string;
  opacity?: number;
  items: CompoundTrackItemLike[];
  [key: string]: any;
}

export interface CompoundTimedLayerLike {
  id: string;
  kind: string;
  start: number;
  duration: number;
  track: number;
  transform?: Record<string, unknown>;
  [key: string]: any;
}

export interface CompoundProjectLike {
  version?: number;
  name?: string;
  updatedAt?: number;
  output?: any;
  tracks?: CompoundTrackLike[];
  timedLayers?: CompoundTimedLayerLike[];
  clips?: any[];
  layers?: any[];
  texts?: any[];
  audios?: any[];
  overlays?: any[];
  stickers?: any[];
  effects?: any[];
  audioFx?: string[];
  bgm?: any;
  multicamGroups?: any[];
  [key: string]: any;
}

export interface PackCompoundOptions {
  trackId?: string;
  clipIds?: string[];
  start?: number;
  end?: number;
  compoundId: string;
  name?: string;
  transform?: CompoundItemLike['transform'];
  audio?: CompoundItemLike['audio'];
}

export interface PackCompoundResult {
  project: CompoundProjectLike;
  compound: CompoundItemLike;
}

export interface UnpackCompoundResult {
  project: CompoundProjectLike;
  restoredMainItemIds: string[];
}

function itemEnd(it: CompoundTrackItemLike): number | null {
  return typeof it.start === 'number' && typeof it.duration === 'number'
    ? it.start + it.duration
    : null;
}

function intersects(it: CompoundTrackItemLike, start: number, end: number): boolean {
  if (typeof it.start !== 'number' || typeof it.duration !== 'number') return false;
  return it.start < end - EPS && it.start + it.duration > start + EPS;
}

function trimClipItem(it: CompoundTrackItemLike, start: number, end: number, shift: number): CompoundTrackItemLike {
  const oldStart = Number(it.start ?? 0);
  const oldEnd = oldStart + Number(it.duration ?? 0);
  const from = Math.max(oldStart, start);
  const to = Math.min(oldEnd, end);
  const nextDuration = Math.max(0, to - from);
  const out = clone(it);
  out.start = round6(from - shift);
  out.duration = round6(nextDuration);
  if (out.type === 'clip' && out.segment) {
    if (Math.abs(from - oldStart) > EPS || Math.abs(to - oldEnd) > EPS) {
      const speed = out.segment.speed && out.segment.speed > 0 ? out.segment.speed : 1;
      const trimStart = Number(out.segment.trimStart ?? 0) + (from - oldStart) * speed;
      out.segment.trimStart = round6(trimStart);
      out.segment.trimEnd = round6(trimStart + nextDuration * speed);
      if (out.segment.kenburns) out.segment.kenburns.duration = round6(nextDuration);
    }
  } else if (out.type === 'audio' && Math.abs(from - oldStart) > EPS) {
    out.trimStart = round6(Number(out.trimStart ?? 0) + (from - oldStart));
  }
  return out;
}

function trimTimedLayer(layer: CompoundTimedLayerLike, start: number, end: number, shift: number): CompoundTimedLayerLike {
  const oldStart = Number(layer.start ?? 0);
  const oldEnd = oldStart + Number(layer.duration ?? 0);
  const from = Math.max(oldStart, start);
  const to = Math.min(oldEnd, end);
  return {
    ...clone(layer),
    start: round6(from - shift),
    duration: round6(Math.max(0, to - from)),
  };
}

function rebuildClips(project: CompoundProjectLike): void {
  const main = project.tracks?.find((t) => t.kind === 'video');
  if (!main) {
    project.clips = [];
    return;
  }
  project.clips = [...main.items]
    .filter((it) => it.type === 'clip' && typeof it.start === 'number')
    .sort((a, b) => Number(a.start) - Number(b.start))
    .map((it) => ({ ...clone(it.segment), id: it.segment?.id || it.id }));
}

/** 把 timedLayers 投影回 v2 视图，保证内部编辑与解包后的下一次保存不丢字幕/图层。 */
export function applyTimedLayerViews(project: CompoundProjectLike): void {
  const layers = (project.timedLayers || []).map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    ...(layer.file ? { file: layer.file } : {}),
    ...(layer.text ? { text: clone(layer.text) } : {}),
    start: layer.start,
    end: round6(layer.start + layer.duration),
    track: layer.track,
    transform: clone(layer.transform || {}),
    ...(layer.keyframes?.length ? { keyframes: clone(layer.keyframes) } : {}),
    ...(layer.effect ? { effect: clone(layer.effect) } : {}),
  }));
  const texts: any[] = [];
  const overlays: any[] = [];
  const stickers: any[] = [];
  const effects: any[] = [];
  for (const layer of project.timedLayers || []) {
    const transform = layer.transform || {};
    if (layer.kind === 'text' && layer.text) {
      texts.push({
        ...clone(layer.text),
        start: layer.start,
        end: round6(layer.start + layer.duration),
        ...(Object.keys(transform).length ? { transform: clone(transform) } : {}),
        ...(layer.keyframes?.length ? { keyframes: clone(layer.keyframes) } : {}),
      });
    } else if (layer.kind === 'video' && layer.file) {
      overlays.push({
        id: layer.id,
        file: layer.file,
        start: layer.start,
        end: round6(layer.start + layer.duration),
        ...clone(transform),
        ...(layer.keyframes?.length ? { keyframes: clone(layer.keyframes) } : {}),
      });
    } else if (layer.kind === 'sticker' && layer.file) {
      stickers.push({
        id: layer.id,
        file: layer.file,
        start: layer.start,
        end: round6(layer.start + layer.duration),
        ...(transform.scale != null ? { scale: transform.scale } : {}),
        ...(transform.x != null ? { x: transform.x } : {}),
        ...(transform.y != null ? { y: transform.y } : {}),
        ...(transform.rotation != null ? { rotation: transform.rotation } : {}),
        ...(transform.opacity != null ? { opacity: transform.opacity } : {}),
        ...(layer.keyframes?.length ? { keyframes: clone(layer.keyframes) } : {}),
      });
    } else if (layer.kind === 'effect' && layer.effect?.fx) {
      effects.push({
        id: layer.id,
        fx: layer.effect.fx,
        start: layer.start,
        end: round6(layer.start + layer.duration),
        ...(layer.effect.intensity != null ? { intensity: layer.effect.intensity } : {}),
      });
    }
  }
  project.layers = layers;
  project.texts = texts;
  project.overlays = overlays;
  project.stickers = stickers;
  project.effects = effects;
  const mainAudio = project.tracks?.find((track) => track.kind === 'audio');
  project.audios = (mainAudio?.items || [])
    .filter((item) => item.type === 'audio')
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0))
    .map((item) => ({
      id: item.id,
      file: item.file,
      start: Number(item.start ?? 0),
      end: round6(Number(item.start ?? 0) + Number(item.duration ?? 0)),
      ...(item.volume != null ? { volume: item.volume } : {}),
      ...(item.fadeIn != null ? { fadeIn: item.fadeIn } : {}),
      ...(item.fadeOut != null ? { fadeOut: item.fadeOut } : {}),
      ...(item.trimStart != null ? { trimStart: item.trimStart } : {}),
    }));
}

/** 根工程深度（根 = 1）。 */
export function compoundProjectDepth(project: CompoundProjectLike): number {
  let max = 0;
  for (const track of project.tracks || []) {
    for (const item of track.items || []) {
      if (item.type === 'compound') {
        max = Math.max(max, compoundProjectDepth(item.project as CompoundProjectLike));
      }
    }
  }
  return 1 + max;
}

/**
 * 把主轨连续区间打包成 CompoundItem。
 * 内部工程裁剪到该区间并归零，普通片段/字幕/图层/音轨/其它视频轨都保留。
 */
export function packMainTrackRange(
  source: CompoundProjectLike,
  opts: PackCompoundOptions,
): PackCompoundResult {
  if (!source?.tracks?.length) throw new Error('打包复合片段：工程没有轨道');
  const project = clone(source);
  const main = opts.trackId
    ? project.tracks!.find((t) => t.id === opts.trackId)
    : project.tracks!.find((t) => t.kind === 'video');
  if (!main || main.kind !== 'video') throw new Error('打包复合片段：找不到主视频轨');

  let rangeStart = opts.start;
  let rangeEnd = opts.end;
  if (rangeStart == null || rangeEnd == null) {
    const ids = new Set(opts.clipIds || []);
    if (!ids.size) throw new Error('打包复合片段：请至少选择一个主轨片段');
    const ordered = [...main.items].sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
    const positions = ordered
      .map((it, index) => ids.has(it.id) ? index : -1)
      .filter((index) => index >= 0);
    if (positions.length !== ids.size) throw new Error('打包复合片段：选择中包含不属于主轨的片段');
    if (positions[positions.length - 1] - positions[0] + 1 !== positions.length) {
      throw new Error('打包复合片段：只能选择连续的主轨片段');
    }
    const selected = positions.map((index) => ordered[index]);
    if (selected.some((it) => it.type !== 'clip')) {
      throw new Error('打包复合片段：只能直接选择普通片段');
    }
    const starts = selected.map((it) => Number(it.start));
    const ends = selected.map(itemEnd);
    if (starts.some((n) => !Number.isFinite(n)) || ends.some((n) => n == null || !Number.isFinite(n))) {
      throw new Error('打包复合片段：片段缺少时间信息，请先探测素材时长');
    }
    rangeStart = Math.min(...starts);
    rangeEnd = Math.max(...(ends as number[]));
    const inside = ordered.filter((it) => intersects(it, rangeStart!, rangeEnd!));
    if (inside.some((it) => !ids.has(it.id))) {
      throw new Error('打包复合片段：所选区间内还有未选中的片段，请选择连续片段');
    }
  }

  if (!(Number.isFinite(rangeStart)) || !(Number.isFinite(rangeEnd)) || rangeEnd! <= rangeStart! + EPS) {
    throw new Error('打包复合片段：区间必须大于 0 秒');
  }
  const start = rangeStart!;
  const end = rangeEnd!;
  const hitMain = main.items.filter((it) => intersects(it, start, end));
  if (!hitMain.length) throw new Error('打包复合片段：所选范围内没有主轨内容');
  const contentEnd = main.items.reduce((max, it) => Math.max(max, itemEnd(it) ?? 0), 0);
  if (end > contentEnd + EPS) {
    throw new Error(`打包复合片段：区间终点 ${end.toFixed(2)}s 超出主轨范围 ${contentEnd.toFixed(2)}s`);
  }

  const innerTracks = (project.tracks || []).map((track) => ({
    ...clone(track),
    items: (track.items || [])
      .filter((it) => intersects(it, start, end))
      .map((it) => trimClipItem(it, start, end, start))
      .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0)),
  }));
  const innerTimedLayers = (project.timedLayers || [])
    .filter((layer) => layer.start < end - EPS && layer.start + layer.duration > start + EPS)
    .map((layer) => trimTimedLayer(layer, start, end, start))
    .sort((a, b) => a.start - b.start);

  const inner: CompoundProjectLike = {
    version: 3,
    name: `${project.name || '未命名剪辑'} / ${opts.name || '复合片段'}`,
    updatedAt: Number(project.updatedAt || 0),
    output: clone(project.output),
    tracks: innerTracks,
    timedLayers: innerTimedLayers,
  };
  rebuildClips(inner);
  applyTimedLayerViews(inner);
  const compound: CompoundItemLike = {
    type: 'compound',
    id: opts.compoundId,
    start: round6(start),
    duration: round6(end - start),
    project: inner,
    ...(opts.transform ? { transform: clone(opts.transform) } : {}),
    ...(opts.audio ? { audio: clone(opts.audio) } : {}),
  };

  const outside = main.items.filter((it) => !intersects(it, start, end));
  outside.push(compound as CompoundTrackItemLike);
  outside.sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  main.items = outside;
  project.version = 3;
  rebuildClips(project);

  if (compoundProjectDepth(project) > COMPOUND_MAX_DEPTH) {
    throw new Error(`打包复合片段失败：嵌套深度将超过上限 ${COMPOUND_MAX_DEPTH}`);
  }
  return { project, compound };
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** 解包复合片段：主轨恢复为普通片段，内部其它轨/图层/音频整体平移回外层。 */
export function unpackCompound(source: CompoundProjectLike, compoundId: string): UnpackCompoundResult {
  if (!source?.tracks?.length) throw new Error('解包复合片段：工程没有轨道');
  const project = clone(source);
  let parent: CompoundTrackLike | null = null;
  let compound: CompoundItemLike | null = null;
  for (const track of project.tracks || []) {
    const hit = track.items.find((it) => it.type === 'compound' && it.id === compoundId);
    if (hit) {
      parent = track;
      compound = hit as unknown as CompoundItemLike;
      break;
    }
  }
  if (!parent || !compound) throw new Error(`解包复合片段失败：找不到 ${compoundId}`);

  const offset = compound.start;
  const innerMain = compound.project.tracks?.find((t) => t.kind === 'video');
  const restored = (innerMain?.items || []).map((it) => {
    const out = clone(it);
    out.start = round6(Number(out.start ?? 0) + offset);
    return out;
  });
  parent.items = parent.items
    .filter((it) => !(it.type === 'compound' && it.id === compoundId))
    .concat(restored)
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));

  const usedTrackIds = new Set((project.tracks || []).map((t) => t.id));
  for (const track of compound.project.tracks || []) {
    if (track.id === innerMain?.id) continue;
    const copy = clone(track);
    copy.id = uniqueId(track.id, usedTrackIds);
    copy.items = copy.items.map((it) => ({
      ...it,
      start: round6(Number(it.start ?? 0) + offset),
    }));
    project.tracks!.push(copy);
  }

  const usedLayerIds = new Set((project.timedLayers || []).map((l) => l.id));
  const restoredLayers = (compound.project.timedLayers || []).map((layer) => {
    const copy = clone(layer);
    copy.id = uniqueId(layer.id, usedLayerIds);
    copy.start = round6(layer.start + offset);
    return copy;
  });
  project.timedLayers = [...(project.timedLayers || []), ...restoredLayers]
    .sort((a, b) => a.start - b.start);

  project.version = 3;
  rebuildClips(project);
  applyTimedLayerViews(project);
  return {
    project,
    restoredMainItemIds: restored.map((it) => it.id),
  };
}

/** 稳定 JSON（对象键排序；数组顺序保留）。 */
export function stableCompoundJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
    return Object.fromEntries(Object.entries(val as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

function fnv1a(input: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 跨端稳定指纹（不依赖 node:crypto，浏览器可用）。 */
export function compoundFingerprint(value: unknown): string {
  const text = stableCompoundJson(value);
  return `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x9e3779b9)}`;
}

/** 缓存键 = compoundId + 内部工程指纹 + 输出规格指纹。 */
export function compoundCacheKey(compoundId: string, project: CompoundProjectLike, outputSpec: unknown): string {
  const safeId = String(compoundId || 'compound').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
  // 只指纹 v3 规范字段；clips/layers/texts 是投影视图，不能因读写一次就改变缓存键。
  const canonical = {
    version: project.version,
    name: project.name,
    updatedAt: project.updatedAt,
    output: project.output,
    tracks: project.tracks,
    timedLayers: project.timedLayers,
    audioFx: project.audioFx,
    bgm: project.bgm,
    multicamGroups: project.multicamGroups,
  };
  return `${safeId}-${compoundFingerprint(canonical)}-${compoundFingerprint(outputSpec)}`;
}
