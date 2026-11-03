// 剪辑工程 v3（S1）：多轨时间线的**数据层**。不接渲染、不接 UI。
//
// ★★★ 为什么单独成文件，而不是把 ClipProject 改成 tracks[]：
//   v2 是现网唯一事实源 —— 渲染（clip-render）、预览、代理、剪映导出、AI 工具、
//   UI 全部读 v2 形状。S1 的目标是「落盘换成 v3，出片零变化」（方案文档 §6/§7）。
//   所以 v3 只替换**落盘格式与内存规范模型**：读盘后由 v3 派生 v2 投影视图
//   （clips/layers/texts/overlays/audios/stickers/effects），消费方一行不改。
//
// ★ 时间语义（与 v2 的差异只有一处）：
//   · v2 clips[] 是**顺序**时间轴（首尾相接，位置由累计推算）；
//   · v3 轨道项带**绝对** start/duration。但旧片段可能没写 trimEnd（= 到素材结尾），
//     不探测素材就推不出时长 —— 此时 start/duration 留空（undefined），
//     由 S2 拿到实测时长后再物化（见 materializeTrackTimes）。
//   · 转场仍是 segment.transition：S1 的 start 用「段时长累加」（名义时间轴），
//     xfade 造成的时间重叠在 S2 渲染计划里物化 —— 否则任何带转场的老工程
//     都会被「同轨重叠拒绝」误判（转场本身就是设计上的重叠）。
//
// ★ 校验口径（方案 §8 的拍板）：
//   · 同轨重叠：**只对视频轨**拒绝。音频轨重叠是正常的（音效叠在音乐上），
//     定时图层（字幕/贴纸/画中画/特效）同理不校验重叠。
//   · 嵌套深度上限 3（根工程算 1 层）。
//   · 多机位仍保留拍平（multicamGroups 原样保留）。

import {
  COMPOUND_MAX_DEPTH as SHARED_COMPOUND_MAX_DEPTH,
  compoundProjectDepth,
  speedCurveDuration,
  type BlendModeId,
  type LayerKfPoint,
} from '@yan-zhi/shared';
import {
  layersFromV1Fields,
  normalizeOutput,
  v1FieldsFromLayers,
  type ClipAudio,
  type ClipEffect,
  type ClipOverlay,
  type ClipProject,
  type ClipSegment,
  type ClipSticker,
  type ClipText,
  type Layer,
  type LayerKind,
  type MulticamGroup,
} from './clip-project.js';

export const CLIP_PROJECT_V3_VERSION = 3 as const;
/** 复合片段嵌套深度上限（根工程 = 1 层）。 */
export const MAX_COMPOUND_DEPTH = SHARED_COMPOUND_MAX_DEPTH;

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** 定时图层：字幕/贴纸/画中画/特效（**不含**音频 —— 音频走音频轨）。 */
export interface TimedLayer {
  id: string;
  /**
   * 图层类型。用 string 而不是封闭联合：v2 的 layers 本来就允许未知 kind
   * （`clip-store-v2.test.ts` 用 'hologram' 钉住"未知图层原样保留"），
   * 迁移必须无损，不能把未来 kind 吞掉。已知 kind：text/image/video/sticker/effect。
   */
  kind: string;
  file?: string;
  text?: ClipText;
  /** 成片时间轴上的绝对起点（秒） */
  start: number;
  /** 成片持续时间（秒） */
  duration: number;
  /** 同刻多图层的叠放次序（大者在上），沿用 v2 Layer.track */
  track: number;
  transform: Layer['transform'];
  keyframes?: LayerKfPoint[];
  effect?: { fx: string; intensity?: number };
}

/** 视频轨上的普通片段。 */
export interface ClipItem {
  type: 'clip';
  id: string;
  /** 绝对起点（秒）；undefined = 旧片段未探测时长，暂不可知 */
  start?: number;
  /** 成片时长（秒）；undefined = 到素材结尾 / 未探测 */
  duration?: number;
  /** 源素材与本段裁剪（语义同 v2 ClipSegment，字段原样保留） */
  segment: ClipSegment;
}

/** 复合片段（S4 才接渲染；S1 只建模与校验）。 */
export interface CompoundItem {
  type: 'compound';
  id: string;
  start: number;
  duration: number;
  /** 内部独立时间线（从 0 开始，可再嵌一层） */
  project: ClipProjectV3;
  transform?: { x?: number; y?: number; scale?: number; rotation?: number; opacity?: number };
  audio?: { volume?: number; muted?: boolean };
}

/** 音频轨上的一段声音（对应 v2 的 ClipAudio）。 */
export interface AudioItem {
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

export type TrackItem = ClipItem | CompoundItem | AudioItem;

export interface Track {
  id: string;
  kind: 'video' | 'audio';
  name?: string;
  /** 音频轨静音 / 视频轨不参与合成 */
  muted?: boolean;
  /** 仅视频轨：不参与合成 */
  hidden?: boolean;
  /** 仅 UI */
  locked?: boolean;
  /** 视频轨合成权重；audio 轨忽略 */
  blend?: BlendModeId;
  /** 0~1，整轨透明度 */
  opacity?: number;
  /** S5：多机位角度参考轨所属组与角度下标（只读，不参与合成）。 */
  multicamGroupId?: string;
  multicamAngleIndex?: number;
  items: TrackItem[];
}

export interface ClipProjectV3 {
  version: 3;
  name: string;
  updatedAt: number;
  output: ClipProject['output'];
  /** 轨道：数组顺序 = 合成顺序（后面的盖前面） */
  tracks: Track[];
  /** 定时图层（独立于轨道：语义是「整段区间 + 变换」） */
  timedLayers: TimedLayer[];
  /** 音频总线（工程级，不进轨道） */
  audioFx?: string[];
  bgm?: { file: string; volume: number; duck: boolean };
  /** 多机位组：主轨保留当前激活角度投影，同时保留各角度参考轨。 */
  multicamGroups?: MulticamGroup[];
}

/**
 * 内存形态：v3 规范模型 + v2 投影视图。
 * ★ 与 v2 的 layers/texts/overlays 是同一个设计：视图由规范模型派生，
 *   消费方（渲染/UI/AI op）继续读 v2 形状。
 */
export interface ClipProjectV3Loaded extends ClipProjectV3 {
  clips: ClipSegment[];
  layers: Layer[];
  texts: ClipText[];
  overlays?: ClipOverlay[];
  audios?: ClipAudio[];
  stickers?: ClipSticker[];
  effects?: ClipEffect[];
}

// ===== 基础映射 =====

/**
 * 旧片段在**已知信息下**的成片时长。
 * ★ 与 clip-render 的 segmentDuration 同口径（裁剪 → 变速/曲线变速）；
 *   图片素材优先用 kenburns.duration（渲染也是这么算的，见 clip-render ②.1）。
 * ★ 返回 undefined 的情形：没写 trimEnd（到素材结尾）、或图片没写 kenburns 时长 ——
 *   没有素材探测结果就猜不出来，宁可留空也不写一个假时间轴。
 */
export function plannedClipDuration(seg: ClipSegment): number | undefined {
  if (seg.kenburns?.duration != null && seg.kenburns.duration > 0) return round6(seg.kenburns.duration);
  if (seg.trimEnd == null) return undefined;
  const trimmed = Math.max(0, seg.trimEnd - (seg.trimStart ?? 0));
  if (seg.speedCurve?.length) return round6(speedCurveDuration(seg.speedCurve, trimmed));
  const sp = seg.speed && seg.speed > 0 ? seg.speed : 1;
  return round6(trimmed / sp);
}

/** v2 clips → 视频轨 items（绝对 start 用段时长累加；遇到未知时长后全部留空）。 */
export function buildClipItems(clips: ClipSegment[]): ClipItem[] {
  let cursor = 0;
  let cursorKnown = true;
  return clips.map((c) => {
    const duration = plannedClipDuration(c);
    const start = cursorKnown ? round6(cursor) : undefined;
    if (duration == null) cursorKnown = false;
    else cursor += duration;
    return {
      type: 'clip',
      id: c.id,
      ...(start != null ? { start } : {}),
      ...(duration != null ? { duration } : {}),
      segment: { ...c },
    };
  });
}

function audioItemOf(a: ClipAudio): AudioItem {
  return {
    type: 'audio',
    id: a.id,
    file: a.file,
    start: a.start,
    duration: round6(Math.max(0, a.end - a.start)),
    ...(a.volume != null ? { volume: a.volume } : {}),
    ...(a.fadeIn != null ? { fadeIn: a.fadeIn } : {}),
    ...(a.fadeOut != null ? { fadeOut: a.fadeOut } : {}),
    ...(a.trimStart != null ? { trimStart: a.trimStart } : {}),
  };
}

function clipAudioOf(a: AudioItem): ClipAudio {
  return {
    id: a.id,
    file: a.file,
    start: a.start,
    end: round6(a.start + a.duration),
    ...(a.volume != null && Math.abs(a.volume - 1) > EPS ? { volume: a.volume } : {}),
    ...(a.fadeIn != null && a.fadeIn > 0 ? { fadeIn: a.fadeIn } : {}),
    ...(a.fadeOut != null && a.fadeOut > 0 ? { fadeOut: a.fadeOut } : {}),
    ...(a.trimStart != null && a.trimStart > 0 ? { trimStart: a.trimStart } : {}),
  };
}

function timedLayerOf(l: Layer): TimedLayer {
  return {
    id: l.id,
    kind: l.kind,
    ...(l.file ? { file: l.file } : {}),
    ...(l.text ? { text: { ...l.text } } : {}),
    start: l.start,
    duration: round6(Math.max(0, l.end - l.start)),
    track: l.track,
    transform: { ...l.transform },
    ...(l.keyframes?.length ? { keyframes: l.keyframes.map((k) => ({ ...k })) } : {}),
    ...(l.effect ? { effect: { ...l.effect } } : {}),
  };
}

function layerOf(t: TimedLayer): Layer {
  return {
    id: t.id,
    kind: t.kind as LayerKind,
    ...(t.file ? { file: t.file } : {}),
    ...(t.text ? { text: { ...t.text } } : {}),
    start: t.start,
    end: round6(t.start + t.duration),
    track: t.track,
    transform: { ...t.transform },
    ...(t.keyframes?.length ? { keyframes: t.keyframes.map((k) => ({ ...k })) } : {}),
    ...(t.effect ? { effect: { ...t.effect } } : {}),
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 稳定序列化（对象键排序）：用于判断"视图有没有被 op 改过"。 */
const stable = (v: unknown): string => JSON.stringify(v, (_k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : val);

function cloneV3(p: ClipProjectV3): ClipProjectV3 {
  return clone(p);
}

export function isLoadedV3(p: ClipProject): p is ClipProjectV3Loaded {
  return p.version === 3 && Array.isArray((p as Partial<ClipProjectV3Loaded>).tracks);
}

// ===== v2 → v3 =====

/** v2 的定时图层来源：落盘的 layers 是权威；没有 layers 的旧对象按视图派生。 */
function timedLayersOfV2(p: ClipProject): TimedLayer[] {
  const source = Array.isArray(p.layers) && p.layers.length
    ? p.layers
    : layersFromV1Fields(p.texts || [], p.overlays || [], [], p.stickers || [], p.effects || []);
  return source.filter((l) => l.kind !== 'audio').map(timedLayerOf);
}

/** v2 的定时音频来源：视图字段权威（显式空数组也算）；缺失时从 layers 派生。 */
function audioViewsOfV2(p: ClipProject): ClipAudio[] {
  if (Array.isArray(p.audios)) return p.audios;
  if (Array.isArray(p.layers) && p.layers.length) return v1FieldsFromLayers(p.layers).audios;
  return [];
}

/**
 * v2 → v3 纯函数迁移（读 v2 文件时调用）。
 *
 * 映射（方案 §6）：
 *   clips[]            → tracks[0]（video，items 按累计时长转 start）
 *   audios[]           → 一条 audio 轨（轨内多个 AudioItem，允许重叠）
 *   texts/overlays/
 *   stickers/effects   → timedLayers（不塞进视频轨）
 *   bgm/audioFx/
 *   multicamGroups     → 工程级字段原样保留
 */
export function migrateV2ToV3(p: ClipProject): ClipProjectV3 {
  const videoItems = buildClipItems(p.clips || []);
  const audios = audioViewsOfV2(p);
  const tracks: Track[] = [
    { id: 'v1', kind: 'video', name: '主轨', items: videoItems },
  ];
  if (audios.length) {
    tracks.push({ id: 'a1', kind: 'audio', name: '音频', items: audios.map(audioItemOf) });
  }
  return {
    version: CLIP_PROJECT_V3_VERSION,
    name: p.name,
    updatedAt: p.updatedAt,
    output: { ...p.output },
    tracks,
    timedLayers: timedLayersOfV2(p),
    ...(p.audioFx ? { audioFx: [...p.audioFx] } : {}),
    ...(p.bgm ? { bgm: { ...p.bgm } } : {}),
    ...(p.multicamGroups?.length ? { multicamGroups: clone(p.multicamGroups) } : {}),
  };
}

// ===== v3 → v2 视图投影 =====

function isClipItem(it: TrackItem): it is ClipItem {
  return it.type === 'clip';
}
function isAudioItem(it: TrackItem): it is AudioItem {
  return it.type === 'audio';
}

/** 所有项都有 start 时才按 start 排序；有未知时间就保持原顺序（顺序即名义时间轴）。 */
function orderByStart<T extends { start?: number }>(items: T[]): T[] {
  if (!items.every((it) => it.start != null)) return items;
  return [...items].sort((a, b) => (a.start as number) - (b.start as number));
}

/**
 * v3 规范模型 → v2 投影视图（读 v3 文件后派生内存形状用）。
 * ★ 主轨 = **第一条**视频轨（与方案 §3 的"保留主轨概念"一致）。
 * ★ 该投影对 migrateV2ToV3 的输出是**幂等**的（round-trip 逐字段相等，
 *   由 clip-project-v3.test.ts 的快照用例钉住），这是"出片零变化"的根据。
 */
export function v2ViewsOfV3(v3: ClipProjectV3): ClipProjectV3Loaded {
  const tracks = clone(v3.tracks);
  const timedLayers = clone(v3.timedLayers);
  const mainVideo = tracks.find((t) => t.kind === 'video');
  const clips = orderByStart(mainVideo?.items.filter(isClipItem) ?? []).map((it) => ({
    ...it.segment,
    id: it.segment.id || it.id,
  }));
  // 音频视图 = **第一条**音频轨（与写入规则对称：额外音频轨不在 v2 视图里，
  // 否则读→写的重建会把它们并进主音频轨，造成声音重复）
  const mainAudio = tracks.find((t) => t.kind === 'audio');
  const audioItems = orderByStart((mainAudio?.items ?? []).filter(isAudioItem));
  const audios = audioItems.map(clipAudioOf);
  const layers = timedLayers.map(layerOf);
  const { texts, overlays, stickers, effects } = v1FieldsFromLayers(layers);
  return {
    version: CLIP_PROJECT_V3_VERSION,
    name: v3.name,
    updatedAt: v3.updatedAt,
    // 补帧方式只认 off/blend/mci；历史脏值摘掉（与 v2 读盘同口径）
    output: normalizeOutput({ ...v3.output }),
    tracks,
    timedLayers,
    clips,
    layers,
    texts,
    ...(overlays.length ? { overlays } : {}),
    ...(audios.length ? { audios } : {}),
    ...(stickers.length ? { stickers } : {}),
    ...(effects.length ? { effects } : {}),
    ...(v3.audioFx ? { audioFx: [...v3.audioFx] } : {}),
    ...(v3.bgm ? { bgm: { ...v3.bgm } } : {}),
    multicamGroups: v3.multicamGroups ? clone(v3.multicamGroups) : [],
  };
}

/**
 * v2 工程读入后的内存形态：**原样保留 v2 视图**（与今天 readClipProject 的输出逐字段相同），
 * 再挂上迁移得到的 tracks/timedLayers。
 * ★ 为什么不直接走 v2ViewsOfV3：投影会经过 v1FieldsFromLayers 的"默认值归一化"，
 *   虽然等价，但会让"老工程读入后内存结构不变"多一层可怀疑的环节；
 *   直接沿用原视图 = 出片路径零改动，最硬的保证。
 */
export function loadedFromV2(p: ClipProject): ClipProjectV3Loaded {
  const v3 = migrateV2ToV3(p);
  return {
    ...v3,
    clips: p.clips,
    layers: p.layers || [],
    texts: p.texts || [],
    ...(p.overlays ? { overlays: p.overlays } : {}),
    ...(p.audios ? { audios: p.audios } : {}),
    ...(p.stickers ? { stickers: p.stickers } : {}),
    ...(p.effects ? { effects: p.effects } : {}),
    multicamGroups: p.multicamGroups || [],
  };
}

// ===== 写盘形态（v2 视图是 S1 的编辑权威）=====

/**
 * 生成要落盘的 v3 工程。
 *
 * ★ 为什么每次都从 v2 视图重建轨道：S1 期间 applyClipOp 与 UI 仍然编辑 clips/texts/overlays…
 *   （op 语义不变是红线），如果直接写内存里的旧 tracks，AI/UI 的改动会**静默丢失**。
 *   重建规则是确定性的，所以 v2 工程读→写→读 是稳定不动点。
 * ★ 额外轨道（第 2 条起的视频/音频轨）原样保留：S1 虽然不开放多轨 UI，
 *   但数据层不能因为一次保存就把将来（或手工写入）的轨道抹掉。
 */
export function buildProjectV3ForWrite(p: ClipProject): ClipProjectV3 {
  const base: ClipProjectV3 = isLoadedV3(p)
    ? cloneV3({
        version: CLIP_PROJECT_V3_VERSION,
        name: p.name,
        updatedAt: p.updatedAt,
        output: p.output,
        tracks: p.tracks,
        timedLayers: p.timedLayers,
        ...(p.audioFx ? { audioFx: p.audioFx } : {}),
        ...(p.bgm ? { bgm: p.bgm } : {}),
        ...(p.multicamGroups?.length ? { multicamGroups: p.multicamGroups } : {}),
      })
    : migrateV2ToV3(p);

  // 主视频轨 ← clips（第一条视频轨，没有就补一条）
  let mainVideoIdx = base.tracks.findIndex((t) => t.kind === 'video');
  if (mainVideoIdx < 0) {
    base.tracks.unshift({ id: 'v1', kind: 'video', name: '主轨', items: [] });
    mainVideoIdx = 0;
  }
  // ★ 视图没变 → 保留原轨道布局（含 S2 的主轨空档）；视图变了（op 编辑过）→ 按视图重建。
  //   只比对 id + segment 语义：op 改了片段内容必须重建，否则 AI/UI 的改动静默丢失。
  const clips = p.clips || [];
  const currentItems = base.tracks[mainVideoIdx].items;
  const currentClips = currentItems.filter(isClipItem);
  const hasCompound = currentItems.some((it) => it.type === 'compound');
  const sameView = currentClips.length === clips.length
    && orderByStart(currentClips).every((raw, i) =>
      raw.id === clips[i].id && stable(raw.segment) === stable(clips[i]));
  if (!sameView && hasCompound) {
    // ★ v2 clips 视图无法表达 compound；此时主轨必须以 tracks 为权威。
    //   只同步普通片段的 segment / 增删，compound 原对象与位置保持不变。
    const viewIds = new Set(clips.map((c) => c.id));
    const nextItems: TrackItem[] = currentItems
      .filter((it) => it.type === 'compound' || viewIds.has(it.id))
      .map((it) => {
        if (it.type !== 'clip') return it;
        const view = clips.find((c) => c.id === it.id);
        return view ? { ...it, segment: { ...view } } : it;
      });
    let cursor = nextItems.reduce((max, it) => {
      const start = typeof it.start === 'number' ? it.start : 0;
      const duration = typeof it.duration === 'number' ? it.duration : 0;
      return Math.max(max, start + duration);
    }, 0);
    for (const clip of clips) {
      if (nextItems.some((it) => it.id === clip.id)) continue;
      const duration = plannedClipDuration(clip);
      nextItems.push({
        type: 'clip',
        id: clip.id,
        start: round6(cursor),
        ...(duration != null ? { duration } : {}),
        segment: { ...clip },
      });
      if (duration != null) cursor += duration;
    }
    nextItems.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    base.tracks[mainVideoIdx] = { ...base.tracks[mainVideoIdx], items: nextItems };
  } else if (!sameView) {
    base.tracks[mainVideoIdx] = {
      ...base.tracks[mainVideoIdx],
      items: buildClipItems(clips),
    };
  }

  // 主音频轨 ← audios 视图（第一条音频轨；视图清空则移除该轨，额外音频轨保留）
  const audioIdx = base.tracks.findIndex((t) => t.kind === 'audio');
  const audios = Array.isArray(p.audios) ? p.audios : [];
  if (audios.length) {
    const items = audios.map(audioItemOf);
    if (audioIdx < 0) base.tracks.push({ id: 'a1', kind: 'audio', name: '音频', items });
    else base.tracks[audioIdx] = { ...base.tracks[audioIdx], items };
  } else if (audioIdx >= 0) {
    // 视图清空：清掉主音频轨的项，但**保留轨道本身**。
    // ★ S3 起 UI 允许空轨道（先加轨再拖素材）；删轨由 UI 显式删除。
    //   保留空轨不会让已删音频"复活"：项已经清空，读回的 audios 视图仍为空。
    base.tracks[audioIdx] = { ...base.tracks[audioIdx], items: [] };
  }

  // timedLayers ← 视图重建（未知 kind 从旧 layers 保留），规则与 v2 的 layers 重建同构
  const rebuilt = layersFromV1Fields(
    p.texts || [],
    p.overlays || [],
    [],
    p.stickers || [],
    p.effects || [],
  );
  const extra = (p.layers || []).filter(
    (l) => l.kind !== 'text' && l.kind !== 'video'
      && l.kind !== 'sticker' && l.kind !== 'effect' && l.kind !== 'audio',
  );
  const byId = new Map<string, Layer>();
  for (const l of extra) byId.set(l.id, l);
  for (const l of rebuilt) byId.set(l.id, l);
  base.timedLayers = [...byId.values()].map(timedLayerOf);

  return base;
}

// ===== 校验 =====

export type V3Validation = { ok: true } | { ok: false; error: string };

/** 复合片段嵌套深度（根工程 = 1）。 */
export function projectDepth(p: ClipProjectV3): number {
  return compoundProjectDepth(p);
}

/** 按 compound id 路径进入内部工程（用于内部编辑预览）。 */
export function compoundProjectAtPath(project: ClipProjectV3, ids: string[]): ClipProjectV3 | null {
  let current: ClipProjectV3 = project;
  for (const id of ids) {
    let next: CompoundItem | null = null;
    for (const track of current.tracks) {
      const hit = track.items.find((item): item is CompoundItem => item.type === 'compound' && item.id === id);
      if (hit) {
        next = hit;
        break;
      }
    }
    if (!next) return null;
    current = next.project;
  }
  return current;
}

/** 播放头落在哪个 compound 窗口内（用于外层时间线递归预览）。 */
export function compoundItemAtTime(project: ClipProjectV3, timeSec: number): CompoundItem | null {
  const track = project.tracks.find((item) =>
    item.kind === 'video' && !item.hidden && !item.muted && item.opacity !== 0);
  if (!track) return null;
  for (const item of track.items) {
    if (item.type !== 'compound') continue;
    if (timeSec >= item.start - EPS && timeSec < item.start + item.duration - EPS) return item;
  }
  return null;
}

function validateTracks(tracks: Track[], prefix: string): string | null {
  const ids = new Set<string>();
  for (const t of tracks) {
    if (!t || (t.kind !== 'video' && t.kind !== 'audio')) return `${prefix}轨道 ${t?.id ?? '?'} 的类型非法`;
    if (ids.has(t.id)) return `${prefix}轨道 id 重复：${t.id}`;
    ids.add(t.id);
    const itemIds = new Set<string>();
    for (const it of t.items) {
      if (!it || !it.id) return `${prefix}轨道 ${t.id} 有缺少 id 的项`;
      if (itemIds.has(it.id)) return `${prefix}轨道 ${t.id} 内项 id 重复：${it.id}`;
      itemIds.add(it.id);
      if (t.kind === 'audio' && it.type !== 'audio') return `${prefix}音频轨 ${t.id} 只能放音频项`;
      if (t.kind === 'video' && it.type === 'audio') return `${prefix}视频轨 ${t.id} 不能放音频项`;
      if (it.type === 'audio' || it.type === 'compound') {
        if (!(it.start >= 0)) return `${prefix}项 ${it.id} 的起点非法`;
        if (!(it.duration > 0)) return `${prefix}项 ${it.id} 的时长必须大于 0`;
      } else {
        if (it.start != null && !(it.start >= 0)) return `${prefix}项 ${it.id} 的起点非法`;
        if (it.duration != null && !(it.duration > 0)) return `${prefix}项 ${it.id} 的时长必须大于 0`;
      }
    }
    // 同轨重叠：只对视频轨拒绝（音频叠加是正常用法）
    if (t.kind === 'video') {
      const timed = t.items
        .filter((it) => it.start != null && it.duration != null)
        .sort((a, b) => (a.start as number) - (b.start as number));
      for (let i = 1; i < timed.length; i++) {
        const prevEnd = (timed[i - 1].start as number) + (timed[i - 1].duration as number);
        if (prevEnd > (timed[i].start as number) + EPS) {
          return `${prefix}视频轨 ${t.id} 的 ${timed[i - 1].id} 与 ${timed[i].id} 重叠（同轨不允许重叠，请移到新轨）`;
        }
      }
    }
    for (const it of t.items) {
      if (it.type === 'compound') {
        const inner = validateProjectV3(it.project, `${prefix}复合片段 ${it.id} / `);
        if (!inner.ok) return inner.error;
      }
    }
  }
  return null;
}

/** 校验 v3 工程（读盘与落盘共用；失败时调用方**不得写盘**）。 */
export function validateProjectV3(p: ClipProjectV3, prefix = ''): V3Validation {
  if (!p || p.version !== CLIP_PROJECT_V3_VERSION) return { ok: false, error: `${prefix}工程版本不是 v3` };
  if (!Array.isArray(p.tracks) || !p.tracks.length) return { ok: false, error: `${prefix}工程没有任何轨道` };
  if (!Array.isArray(p.timedLayers)) return { ok: false, error: `${prefix}timedLayers 必须是数组` };
  const depth = projectDepth(p);
  if (depth > MAX_COMPOUND_DEPTH) {
    return { ok: false, error: `${prefix}复合片段嵌套深度 ${depth} 超过上限 ${MAX_COMPOUND_DEPTH}` };
  }
  const err = validateTracks(p.tracks, prefix);
  return err ? { ok: false, error: err } : { ok: true };
}

/**
 * 用实测时长物化轨道项的 start/duration（S2 渲染准备用；S1 不调用）。
 * ★ 只补**未知**项，不覆盖已有值 —— 迁移得到的已知时间与渲染同口径。
 */
export function materializeTrackTimes(p: ClipProjectV3, durations: Record<string, number>): ClipProjectV3 {
  const out = cloneV3(p);
  for (const t of out.tracks) {
    if (t.kind !== 'video') continue;
    let cursor = 0;
    let known = true;
    for (const it of orderByStart(t.items)) {
      if (it.type === 'compound') {
        if (known) cursor = Math.max(cursor, it.start + it.duration);
        continue;
      }
      if (it.type !== 'clip') continue;
      const raw = durations[it.id] ?? durations[it.segment.file] ?? 0;
      const duration = it.duration ?? (raw > 0 ? plannedClipDuration({ ...it.segment, trimEnd: it.segment.trimEnd ?? raw }) : undefined);
      if (known && it.start == null && duration != null) it.start = round6(cursor);
      if (duration == null) {
        it.duration = undefined;
        known = false;
      } else {
        it.duration = duration;
        cursor = Math.max(cursor, (it.start ?? cursor) + duration);
      }
    }
  }
  return out;
}
