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
import {
  buildRenderPlan, runRenderPlan, segmentDuration,
  type BuildPlanInput,
} from './clip-render.js';
import type { ClipProject, ClipSegment } from './clip-project.js';

/** 代理画幅：长边 480（竖屏 270x480，横屏 480x270，方图按比例）。 */
export const PROXY_LONG_EDGE = 480;

/** 缓存上限（条）。短视频段 480p 代理一般 <2MB/条，500 条 ≈ 1GB 顶格。 */
export const PROXY_CACHE_MAX = 500;

/** 触发清理的占比（超过即淘汰到 75%）。 */
const PRUNE_RATIO = 0.75;

/** 缓存目录版本号：改了代理口径（画幅/编码/指纹结构）就改这里，旧缓存整体作废。 */
const PROXY_CACHE_VERSION = 'v1';

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
  ]);
}

/** 缓存键：版本 + 段指纹 + 代理画幅 + fps（画幅/fps 属于 output，改了同样失效）。 */
export function proxyCacheKey(
  seg: ClipSegment,
  size: { w: number; h: number },
  fps: number,
): string {
  return createHash('sha1')
    .update(`${PROXY_CACHE_VERSION}|${segmentFingerprint(seg)}|${size.w}x${size.h}|${fps}`)
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
 * 生成（或命中）某一段的 480p 代理 mp4。
 *
 * ★ 渲染走 buildRenderPlan + runRenderPlan（与成片同一出口、同一执行器）：
 *   派生单段工程（clips=[该段]、texts/overlays/bgm/audioFx 清空），画幅换代理规格，
 *   fast=true（预览档编码参数）。产物先落临时目录、成功后 rename 进缓存位 ——
 *   半成品绝不占缓存位（否则命中判定会拿到坏文件）。
 */
export async function ensureSegmentProxy(input: {
  project: ClipProject;
  /** 段下标（0 基） */
  segIndex: number;
  probe: ProxyProbeRow;
  ffmpeg: string;
}): Promise<{ ok: boolean; file?: string; cached?: boolean; key?: string; seconds?: number; error?: string }> {
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

  const key = proxyCacheKey(seg, size, fps);
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
  const single: ClipProject = {
    ...project,
    clips: [seg],
    texts: [],
    overlays: [],
    audioFx: undefined,
    bgm: undefined,
    output: { ...project.output, size: `${size.w}x${size.h}` },
  };
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
    return { ok: true, file, cached: false, key, seconds: segDur };
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
