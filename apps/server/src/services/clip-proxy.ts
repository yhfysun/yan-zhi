// 段代理预览（P0-10）—— 每段按工程指纹生成 480p 代理 mp4 并磁盘缓存，前端顺序播放。
//
// ★★★ 为什么必须做（用户原话）：现在的"实时预览"是拖动播放头抽单帧（clip-preview.ts），
//   没有连续播放，节奏看不见（0.3s 转场、2 帧卡点都调不出来）。
//   代理预览 = 每段渲一条 480p 短 mp4，前端把各段代理**顺序连播**，
//   改了一段只重渲那一段 —— 节奏终于能"看"出来。
//
// ★★★ 渲染出口唯一（铁律）：代理生成**复用 buildRenderPlan**（派生单段工程走渲染计划），
//   不另拼 ffmpeg 命令、不另写滤镜逻辑 —— 代理与成片是同一份实现渲的，
//   "预览所见=成片所得"才有保证。
//
// 取舍（诚实记录）：
//   · 代理不含字幕/BGM/画中画/音效链（整片级元素，单段代理叠不进去；
//     字幕核对走"出预览档"）。段级效果（裁剪/变速/调色/特效/蒙版/运镜/淡入淡出）全覆盖。
//   · 同步生成（未命中当场渲）+ 落盘缓存：480p veryfast 下 1~10s 的段通常 1~3s 出片；
//     命中后 ≤2s 连续播放的验收指标由缓存达成。
//
// 磁盘缓存（LRU 近似）：上限按条数（PROXY_CACHE_MAX），超阈值按 mtime 淘汰最旧
//   （与 clip-effect-preview 的 pruneCache 同一手法）。键 = sha1(段指纹|画幅|fps)。

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { buildRenderPlan, buildTrackPlan, runRenderPlan, segmentDuration,
  type BuildPlanInput,
} from './clip-render.js';
import { materializeSegmentMatte, matteRuntimeHint } from './clip-matte-render.js';
import type { ClipProject, ClipSegment } from './clip-project.js';
import { compoundCacheKey } from '@yan-zhi/shared';
import {
  v2ViewsOfV3, type ClipProjectV3, type CompoundItem, type Track, type TrackItem,
} from './clip-project-v3.js';

/** 代理画幅：长边 480（竖屏 270x480，横屏 480x270，方图按比例）。 */
export const PROXY_LONG_EDGE = 480;

/** 缓存上限（条）。短视频段 480p 代理一般 <2MB/条，500 条 ≈ 1GB 顶格。 */
export const PROXY_CACHE_MAX = 500;

/** 触发清理的占比（超过即淘汰到 75%）。 */
const PRUNE_RATIO = 0.75;

/** 缓存目录版本号：改了代理口径（画幅/编码/指纹结构/包含哪些图层）就改这里，旧缓存整体作废。 */
// v2（P1-10）：代理不再烤贴纸（矢量图层改由前端实时合成），旧的带贴纸缓存必须作废。
const PROXY_CACHE_VERSION = 'v2';

export function proxyCacheDir(): string {
  return path.join(tmpdir(), `yz-clip-proxy-${PROXY_CACHE_VERSION}`);
}

/**
 * 段指纹：**只含影响本段画面/声音的字段**（不含 output/bgm/overlays/texts）。
 * ★ 与 clip-preview 的 projectFingerprint 不同口径：那是"整工程变了就重取帧"，
 *   这里要的是"这一段变了才重渲" —— 别的段改参数不应把这段标脏。
 */
export function segmentFingerprint(seg: ClipSegment): string {
  return JSON.stringify([
    seg.id, seg.file,
    seg.trimStart ?? null, seg.trimEnd ?? null,
    seg.speed ?? 1, seg.speedCurve ?? null,
    seg.colorPreset ?? '', seg.colorStrength ?? 1,
    seg.adjust ?? null, seg.fx ?? '', seg.fxParams ?? null,
    seg.fadeIn ?? 0, seg.fadeOut ?? 0,
    seg.kenburns ?? null, seg.mask ?? null, seg.crop ?? null,
    seg.keyframes ?? null, seg.reverse ?? false, seg.rotate ?? 0, seg.flip ?? '',
    seg.audioFile ?? '', seg.keepOriginalAudio ?? false, seg.volume ?? 1,
    // P2-1：抠像参数变了必须重渲代理（否则预览还是旧背景）
    seg.matte ?? null,
  ]);
}

/** 缓存键：版本 + 段指纹 + 代理画幅 + fps（画幅/fps 属于 output，改了同样失效）。 */
export function proxyCacheKey(
  seg: ClipSegment,
  size: { w: number; h: number },
  fps: number,
  /** 额外失效因子（P2-1：模型是否已放置 —— 装好模型后旧代理必须重渲） */
  extra = '',
): string {
  return createHash('sha1')
    .update(`${PROXY_CACHE_VERSION}|${segmentFingerprint(seg)}|${size.w}x${size.h}|${fps}|${extra}`)
    .digest('hex')
    .slice(0, 20);
}

/** 复合片段整体代理键：compoundId + 内部工程指纹 + transform/audio + 代理规格。 */
export function compoundProxyCacheKey(
  compound: CompoundItem,
  size: { w: number; h: number },
  fps: number,
  extra = '',
): string {
  const spec = {
    kind: 'compound-proxy',
    w: size.w,
    h: size.h,
    fps,
    duration: compound.duration,
    transform: compound.transform || null,
    audio: compound.audio || null,
    extra,
  };
  return createHash('sha1')
    .update(`${PROXY_CACHE_VERSION}|${compoundCacheKey(compound.id, compound.project, spec)}`)
    .digest('hex')
    .slice(0, 20);
}

/**
 * 工程画幅 → 代理画幅（长边 480，保比例，偶数对齐 —— yuv420p 要求宽高皆偶）。
 * 工程画幅非法（0/NaN）时回落 270x480。
 */
export function proxyTargetSize(outputSize: string): { w: number; h: number } {
  const [W, H] = String(outputSize || '').split('x').map(Number);
  if (!(W > 0 && H > 0)) return { w: 270, h: 480 };
  const k = PROXY_LONG_EDGE / Math.max(W, H);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(W * k), h: even(H * k) };
}

/** 在任意视频轨定位代理项；指定 trackId 时避免跨轨同名 id 误取。 */
export function locateProxyTrackItem(
  project: ClipProjectV3,
  input: { trackId?: string; itemId: string },
): { track: Track; item: TrackItem } | null {
  const tracks = project.tracks.filter((track) =>
    track.kind === 'video' && (!input.trackId || track.id === input.trackId));
  for (const track of tracks) {
    const item = track.items.find((entry) => entry.id === input.itemId);
    if (item) return { track, item };
  }
  return null;
}

/**
 * 段时长换算（纯函数，单测覆盖）：与渲染/预览定位同一口径 ——
 * kenburns 段用其 duration；其余走 segmentDuration（裁剪夹源长 + 曲线变速切片数学）。
 * 返回 null = 段时长不可知（素材丢失/探测失败），代理无法生成。
 */
export function proxySegmentSeconds(seg: ClipSegment, rawDur: number): number | null {
  if (seg.kenburns) return seg.kenburns.duration > 0 ? seg.kenburns.duration : null;
  if (!(rawDur > 0)) return null;
  const d = segmentDuration(seg, rawDur);
  return d > 0 ? d : null;
}

/** 代理生成所需的探测行（与 buildRenderPlan 的输入口径一致）。 */
export interface ProxyProbeRow {
  /** 每段真实时长（键挂 clip.id 与 file） */
  durations: Record<string, number>;
  /** 每段是否有音轨（键挂 clip.id 与 file） */
  hasAudio: Record<string, number | boolean>;
  /** 已知图片素材路径列表 */
  imageFiles: string[];
}

/**
 * 代理用的「单段派生工程」：只保留该段素材与音频处理，把所有**矢量图层**清空。
 *
 * ★★★ 为什么必须清贴纸（P1-10，2026-11-02）：
 *   P1-10 起字幕/贴纸/画中画由前端 DOM 实时合成。若代理里还烤了一遍贴纸，
 *   前端再叠一层就是**重影**，而且拖动时旧贴纸会留在底图上（看起来像"拖动失效"）。
 *   texts/overlays 原本就清空；stickers 是 P1-1 新增的独立视图字段，此前漏了。
 * ★ 特效层（effects）**不清**：那是像素级效果（C-2 才上前端），代理里烤进去是
 *   "代理近似"的一部分，前端不会重复绘制。
 * ★ 定时音频层（audios）保持原样：属于代理听感范围，不在本项动。
 */
export function proxyDerivedProject(
  project: ClipProject,
  seg: ClipSegment,
  size: { w: number; h: number },
): ClipProject {
  return {
    ...project,
    clips: [seg],
    texts: [],
    overlays: [],
    stickers: [],
    audioFx: undefined,
    bgm: undefined,
    output: { ...project.output, size: `${size.w}x${size.h}` },
  };
}

/** 复合片段代理的派生工程：只保留该 compound，并归一到代理时间轴 0 点。 */
export function proxyDerivedCompoundProject(
  compound: CompoundItem,
  size: { w: number; h: number },
  fps = 30,
): ReturnType<typeof v2ViewsOfV3> {
  const normalized: CompoundItem = {
    ...compound,
    start: 0,
    project: JSON.parse(JSON.stringify(compound.project)) as CompoundItem['project'],
    ...(compound.transform ? { transform: { ...compound.transform } } : {}),
    ...(compound.audio ? { audio: { ...compound.audio } } : {}),
  };
  const outer: ClipProjectV3 = {
    version: 3,
    name: `${compound.project.name || '复合片段'} / proxy`,
    updatedAt: compound.project.updatedAt || 0,
    output: { ...compound.project.output, size: `${size.w}x${size.h}`, fps },
    tracks: [{ id: 'proxy-v1', kind: 'video', items: [normalized] }],
    timedLayers: [],
  };
  return v2ViewsOfV3(outer);
}

/**
 * 生成复合片段整体 480p 代理。渲染走 buildTrackPlan，保留内部字幕/图层/音轨，
 * 并应用外层 transform/audio；键只随该 compound 与代理规格变化。
 */
export async function ensureCompoundProxy(input: {
  compound: CompoundItem;
  size: { w: number; h: number };
  fps: number;
  probe: ProxyProbeRow;
  ffmpeg: string;
}): Promise<{ ok: boolean; file?: string; cached?: boolean; key?: string; seconds?: number; error?: string }> {
  const key = compoundProxyCacheKey(input.compound, input.size, input.fps);
  const dir = proxyCacheDir();
  const file = path.join(dir, `compound-${key}.mp4`);
  try {
    const st = await stat(file);
    if (st.isFile() && st.size > 0) {
      const now = new Date();
      await fs.promises.utimes(file, now, now).catch(() => undefined);
      return { ok: true, file, cached: true, key, seconds: input.compound.duration };
    }
  } catch { /* miss */ }

  const workDir = path.join(dir, `tmp-compound-${key}-${Date.now()}`);
  try {
    await mkdir(workDir, { recursive: true });
    const outFile = path.join(workDir, 'proxy.mp4');
    const derived = proxyDerivedCompoundProject(input.compound, input.size, input.fps);
    const planned = buildTrackPlan({
      project: derived,
      durations: input.probe.durations,
      hasAudio: input.probe.hasAudio,
      workDir,
      outFile,
      imageFiles: input.probe.imageFiles,
      fast: true,
      cover: false,
    });
    if (!planned.ok) return { ok: false, error: planned.error };
    for (const asset of planned.plan.assets) {
      await mkdir(path.dirname(asset.file), { recursive: true });
      await writeFile(asset.file, asset.content, 'utf8');
    }
    const ran = await runRenderPlan(input.ffmpeg, planned.plan.steps);
    if (!ran.ok) {
      return { ok: false, error: `复合片段代理渲染失败（${ran.failedLabel}）：${(ran.stderr || '').slice(-300)}` };
    }
    const st = await stat(outFile);
    if (!(st.isFile() && st.size > 0)) return { ok: false, error: '复合片段代理产物为空' };
    await mkdir(dir, { recursive: true });
    await rename(outFile, file);
    await pruneProxyCache();
    return { ok: true, file, cached: false, key, seconds: input.compound.duration };
  } catch (e: unknown) {
    return { ok: false, error: `复合片段代理生成异常：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * 生成（或命中）某一段的 480p 代理 mp4。
 *
 * ★ 渲染走 buildRenderPlan + runRenderPlan（与成片同一出口、同一执行器）：
 *   派生单段工程（clips=[该段]、矢量图层清空），画幅换代理规格，
 *   fast=true（预览档编码参数）。产物先落临时目录、成功后 rename 进缓存位 ——
 *   半成品绝不占缓存位（否则命中判定会拿到坏文件）。
 */
export async function ensureSegmentProxy(input: {
  project: ClipProject;
  /** 段下标（0 基） */
  segIndex: number;
  probe: ProxyProbeRow;
  ffmpeg: string;
  /** ffprobe（抠像物质化需要探测源分辨率/帧率；缺省由 ffmpeg 路径推导） */
  ffprobe?: string;
}): Promise<{
  ok: boolean; file?: string; cached?: boolean; key?: string; seconds?: number;
  error?: string;
  /** 非致命提示（例如抠像失败已退回原片段） */
  warning?: string;
  matteFallback?: boolean;
}> {
  const { project, ffmpeg } = input;
  const seg = project.clips[input.segIndex];
  if (!seg) return { ok: false, error: '段下标越界' };
  const fps = project.output.fps || 30;
  const size = proxyTargetSize(project.output.size);

  const rawDur = input.probe.durations[seg.id] ?? input.probe.durations[seg.file] ?? 0;
  const isImage = input.probe.imageFiles.some((f) => f.toLowerCase() === seg.file.toLowerCase()) || !!seg.kenburns;
  const segDur = isImage
    ? (seg.kenburns?.duration ?? Math.max(3, rawDur || 3))
    : (proxySegmentSeconds(seg, rawDur) ?? 0);
  if (!(segDur > 0)) {
    return { ok: false, error: '段时长不可知（素材丢失或探测失败），无法生成代理' };
  }

  const key = proxyCacheKey(seg, size, fps, seg.matte ? matteRuntimeHint(seg.matte) : '');
  const dir = proxyCacheDir();
  const file = path.join(dir, `${key}.mp4`);

  // ---- 命中判定：文件存在且非空 ----
  try {
    const st = await stat(file);
    if (st.isFile() && st.size > 0) {
      // LRU touch：把访问时间刷新（mtime 即我们的"最近使用"标记）
      const now = new Date();
      await fs.promises.utimes(file, now, now).catch(() => undefined);
      return { ok: true, file, cached: true, key, seconds: segDur };
    }
  } catch { /* 不存在 → 未命中 */ }

  // ---- 未命中 → 同步生成（派生单段工程走渲染计划）----
  // ★ 智能抠像：代理也要物质化（否则代理预览无抠像）。抠像失败**退回原片段**并带 warning ——
  //   预览宁可少一个效果，也不能整段黑/空白；成片导出仍会因抠像失败而明确报错。
  let effectiveSeg = seg;
  let matteWarning: string | undefined;
  if (seg.matte) {
    const mat = await materializeSegmentMatte(seg, {
      ffmpeg,
      ...(input.ffprobe ? { ffprobe: input.ffprobe } : {}),
      durations: input.probe.durations,
    });
    if (mat.ok) {
      effectiveSeg = mat.segment;
    } else {
      matteWarning = `智能抠像不可用，代理已退回原片段（成片导出会明确报错）：${mat.error}`;
    }
  }
  const single = proxyDerivedProject(project, effectiveSeg, size);
  const workDir = path.join(dir, `tmp-${key}-${Date.now()}`);
  try {
    await mkdir(workDir, { recursive: true });
    const outFile = path.join(workDir, 'proxy.mp4');
    const planInput: BuildPlanInput = {
      project: single,
      durations: input.probe.durations,
      hasAudio: input.probe.hasAudio,
      workDir,
      outFile,
      imageFiles: input.probe.imageFiles,
      fast: true,
      cover: false,
    };
    const planned = buildRenderPlan(planInput);
    if (!planned.ok) return { ok: false, error: planned.error };
    for (const a of planned.plan.assets) {
      await mkdir(path.dirname(a.file), { recursive: true });
      await writeFile(a.file, a.content, 'utf8');
    }
    const ran = await runRenderPlan(ffmpeg, planned.plan.steps);
    if (!ran.ok) {
      return { ok: false, error: `代理渲染失败（${ran.failedLabel}）：${(ran.stderr || '').slice(-300)}` };
    }
    const st = await stat(outFile);
    if (!(st.isFile() && st.size > 0)) return { ok: false, error: '代理产物为空' };

    await mkdir(dir, { recursive: true });
    await rename(outFile, file);
    await pruneProxyCache();
    return {
      ok: true, file, cached: false, key, seconds: segDur,
      ...(matteWarning ? { warning: matteWarning, matteFallback: true } : {}),
    };
  } catch (e: unknown) {
    return { ok: false, error: `代理生成异常：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ }
  }
}

/**
 * 缓存清理（LRU 近似）：条数超上限时按 mtime 淘汰最旧的一批（淘汰到 75%）。
 * ★ tmp-* 子目录不清理在 finally 里逐个删；这里只清正式缓存位 *.mp4。
 */
export async function pruneProxyCache(): Promise<void> {
  try {
    const dir = proxyCacheDir();
    const names = (await readdir(dir)).filter((n) => n.endsWith('.mp4'));
    if (names.length <= PROXY_CACHE_MAX) return;
    const rows = await Promise.all(names.map(async (n) => {
      const p = path.join(dir, n);
      try { return { p, at: (await stat(p)).mtimeMs }; } catch { return null; }
    }));
    const list = rows.filter((r): r is { p: string; at: number } => !!r).sort((a, b) => a.at - b.at);
    const keep = Math.floor(PROXY_CACHE_MAX * PRUNE_RATIO);
    const drop = list.slice(0, Math.max(0, list.length - keep));
    await Promise.all(drop.map((r) => unlink(r.p).catch(() => undefined)));
  } catch { /* 清理失败不影响主流程 */ }
}
