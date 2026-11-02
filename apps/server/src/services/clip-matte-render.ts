// 智能抠像接入渲染（P2-1）—— **物质化**：把带抠像的片段先合成成临时成片，再交给既有渲染链。
//
// ★★★ 为什么是"物质化"而不是改 buildRenderPlan（2026-11-02 定案）：
//   buildRenderPlan 是纯函数（不碰磁盘、不起子进程），是整条剪辑链路唯一的滤镜定义处。
//   抠像需要 Python 推理 + 蒙版视频 + 二次 ffmpeg 合成（重 IO），塞进纯函数层会：
//   ① 让单测必须起 Python/ffmpeg；② 让"无抠像工程"的渲染计划不再逐字节稳定。
//   所以把它放在**进入 buildRenderPlan 之前**：带 matte 的片段替换成"背景已合成的临时 mp4"，
//   渲染链看到的仍是普通片段（file/trim/speed/volume 语义不变）。无 matte 的片段与工程零变化。
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, utimes, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCmd } from './exec-cmd.js';
import { generatePortraitMatte, resolveMatteRuntime, MATTE_MODELS, matteModelDir } from './clip-matte-runtime.js';
import type { ClipProject, ClipSegment } from './clip-project.js';

/** 缓存目录版本号：改了合成口径（滤镜/编码/键结构）就改这里，旧缓存整体作废。 */
const MATTE_CACHE_VERSION = 'v1';

/** 缓存条数上限（按 composite-*.mp4 计；mask+composite 成对清理）。 */
export const MATTE_CACHE_MAX = 200;
const PRUNE_RATIO = 0.75;

/** 图片素材不支持抠像（蒙版生成脚本是视频解码器）。 */
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

export function matteRenderCacheDir(): string {
  return path.join(tmpdir(), `yz-clip-matte-render-${MATTE_CACHE_VERSION}`);
}

/**
 * 代理缓存用的"模型是否已放置"提示（**同步、廉价**，只查文件存在性）。
 * ★ 为什么需要：代理失败退回原片段的产物会被缓存；装好模型后如果缓存键不变，
 *   用户会一直看到"没抠像"的旧代理。把模型存在性放进代理缓存键 → 装模型后自动失效。
 * ★ 不探测 Python（那要起子进程）；Python 缺失属于运行时配置问题，另行处理。
 */
export function matteRuntimeHint(m?: ClipSegment['matte']): string {
  if (!m) return 'off';
  const env = process.env.YZ_MATTE_MODEL?.trim();
  if (env) return existsSync(env) ? `env:${path.basename(env)}` : 'env:missing';
  const dir = matteModelDir();
  const ids = m.model ? [m.model] : Object.values(MATTE_MODELS).map((x) => x.id);
  for (const id of ids) {
    if (existsSync(path.join(dir, `${id}.onnx`))) return `${id}:present`;
  }
  return `${m.model || 'auto'}:missing`;
}

/** 归一化后的有效抠像参数（缺省值在这里一次性确定，缓存键与合成共用）。 */
export function effectiveMatte(m?: ClipSegment['matte']): {
  background: 'black' | 'white' | 'green' | 'blur';
  color?: string;
  feather: number;
  fps: number;
  model: string;
} {
  const background = m?.background === 'white' || m?.background === 'green' || m?.background === 'blur'
    ? m.background : 'black';
  const featherRaw = Number(m?.feather);
  const feather = Number.isFinite(featherRaw) ? Math.max(0, Math.min(20, featherRaw)) : 0;
  const fpsRaw = Number(m?.fps);
  const fps = Number.isFinite(fpsRaw) ? Math.max(5, Math.min(15, Math.round(fpsRaw))) : 10;
  const color = background === 'green'
    ? (/^#[0-9a-fA-F]{6}$/.test(String(m?.color || '')) ? String(m?.color).toUpperCase() : '#00FF00')
    : undefined;
  return { background, ...(color ? { color } : {}), feather, fps, model: String(m?.model || '').trim() };
}

/**
 * 物质化缓存键（sha1 前 20 位）：源文件路径+size+mtime、裁剪区间、抠像参数、模型 id。
 * ★ 源文件被替换（同路径不同内容）也会因 size/mtime 变化而失效 —— 不会拿旧蒙版骗人。
 * ★ modelId 优先用运行时**实际解析到**的模型（auto 时也稳定）；测试可直接给。
 */
export function matteCacheKey(
  seg: ClipSegment,
  opts: { sourceStat?: { size: number; mtimeMs: number }; modelId?: string } = {},
): string {
  let st = opts.sourceStat;
  if (!st) {
    try {
      const s = statSync(seg.file);
      st = { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      st = { size: 0, mtimeMs: 0 };
    }
  }
  const m = effectiveMatte(seg.matte);
  const payload = [
    seg.file,
    st.size,
    Math.round(st.mtimeMs),
    seg.trimStart ?? '',
    seg.trimEnd ?? '',
    m.background,
    m.color ?? '',
    m.feather,
    m.fps,
    m.model || '',
    opts.modelId || 'auto',
  ].join('|');
  return createHash('sha1').update(payload).digest('hex').slice(0, 20);
}

export interface ComposeMatteInput {
  ffmpeg: string;
  /** 源视频（含音频） */
  sourceFile: string;
  /** 单通道蒙版视频（白=前景，黑=背景） */
  maskFile: string;
  outFile: string;
  width: number;
  height: number;
  /** 输出帧率（取源帧率） */
  fps: number;
  background: 'black' | 'white' | 'green' | 'blur';
  /** background=green 时的自定义颜色 #RRGGBB */
  color?: string;
  /** 蒙版边缘羽化 0~20px */
  feather?: number;
  /** 取源范围（秒）；缺省整段 */
  ss?: number;
  duration?: number;
}

/**
 * 用蒙版把源视频合成到新背景上（**纯 IO**：只看入参，不读工程/不做缓存）。
 *
 * 滤镜链路：
 *   蒙版 → scale 到源分辨率 → gray →（羽化 gblur）→ [mask]
 *   源 → rgba → alphamerge([mask]) → 前景
 *   背景：纯色 color 源 / 原画面先 gblur
 *   overlay(shortest=1) → yuv420p
 * ★ 音轨必须保留：`-map 0:a?`（源输入是第 0 个，-ss/-t 已作用在它上面）。
 */
export async function composeMatteWithMask(
  input: ComposeMatteInput,
): Promise<{ ok: boolean; outFile?: string; error?: string }> {
  const { ffmpeg, sourceFile, maskFile, outFile, width: W, height: H } = input;
  if (!ffmpeg) return { ok: false, error: 'ffmpeg 路径为空' };
  if (!existsSync(sourceFile)) return { ok: false, error: `源视频不存在：${sourceFile}` };
  if (!existsSync(maskFile)) return { ok: false, error: `蒙版视频不存在：${maskFile}` };
  if (!(W > 0 && H > 0)) return { ok: false, error: `非法分辨率：${W}x${H}` };
  const fps = Number(input.fps) > 0 ? Number(input.fps) : 30;
  const feather = Math.max(0, Math.min(20, Number(input.feather) || 0));
  const blurSigma = feather > 0 ? Math.max(0.1, feather / 2) : 0;
  const maskChain = [
    `scale=${W}:${H}`,
    'format=gray',
    ...(blurSigma > 0 ? [`gblur=sigma=${blurSigma.toFixed(2)}`] : []),
  ].join(',');

  const bg = input.background === 'blur' ? 'blur' : input.background;
  const color = bg === 'green'
    ? `0x${(input.color || '#00FF00').replace('#', '').toUpperCase()}`
    : bg === 'white' ? 'white' : 'black';
  const dur = Number(input.duration) > 0 ? Number(input.duration) : 0;

  let fc: string;
  if (bg === 'blur') {
    // 原画面模糊做底：分辨率缩放后再糊，大图不必先糊再缩（省一次全分辨率滤波）
    const sigma = Math.max(10, Math.round(Math.min(W, H) * 0.05));
    fc = `[1:v]${maskChain}[mask];`
      + `[0:v]split=2[fgsrc][bgsrc];`
      + `[bgsrc]scale=${W}:${H},format=yuv420p,gblur=sigma=${sigma}[bg];`
      + `[fgsrc]scale=${W}:${H},format=rgba[fg];`
      + `[fg][mask]alphamerge[fgm];`
      + `[bg][fgm]overlay=0:0:shortest=1,format=yuv420p[v]`;
  } else {
    fc = `[1:v]${maskChain}[mask];`
      + `[0:v]scale=${W}:${H},format=rgba[fg];`
      + `[fg][mask]alphamerge[fgm];`
      + `color=c=${color}:s=${W}x${H}:r=${fps}${dur > 0 ? `:d=${dur.toFixed(3)}` : ''}[bg];`
      + `[bg][fgm]overlay=0:0:shortest=1,format=yuv420p[v]`;
  }

  const ss = Number(input.ss) > 0 ? Number(input.ss) : 0;
  const args: string[] = ['-y', '-v', 'error'];
  // ★ -ss/-t 必须紧跟**本输入**并在 -i 之前（仓库铁律：放错位置会归属到后一个输入）
  if (ss > 0) args.push('-ss', ss.toFixed(3));
  if (dur > 0) args.push('-t', dur.toFixed(3));
  args.push('-i', sourceFile, '-i', maskFile);
  args.push(
    '-filter_complex', fc,
    '-map', '[v]',
    // 原音轨（没有就自动忽略）；-c:a 对无音轨输入不会报错
    '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outFile,
  );

  const r = await runCmd(ffmpeg, args, { timeoutMs: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  if (!r.ok) {
    return { ok: false, error: `抠像合成失败：${String(r.stderr || r.error || '').slice(-800)}` };
  }
  let size = 0;
  try { size = statSync(outFile).size; } catch { /* 下面按 0 处理 */ }
  if (!(size > 0)) return { ok: false, error: `抠像合成未产出文件：${outFile}` };
  return { ok: true, outFile };
}

interface SourceInfo {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

function parseRate(raw: unknown): number {
  const s = String(raw ?? '').trim();
  if (!s || s === '0/0') return 0;
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b > 0 && Number.isFinite(a) ? a / b : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function deriveFfprobe(ffmpeg: string, explicit?: string): string {
  if (explicit) return explicit;
  // 随包 ffmpeg/ffprobe 同目录同名（ffmpeg.exe → ffprobe.exe；无扩展名同理）
  return ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
}

/** ffprobe 源视频元数据（宽高/帧率/时长）；失败返回全 0，由调用方给可读错误。 */
async function probeSourceInfo(ffprobe: string, file: string): Promise<SourceInfo> {
  const r = await runCmd(ffprobe, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height,r_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'json', file,
  ], { timeoutMs: 60000, maxBuffer: 2 * 1024 * 1024 });
  if (!r.ok) return { width: 0, height: 0, fps: 0, durationSec: 0 };
  try {
    const j = JSON.parse(r.stdout) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
      format?: { duration?: string };
    };
    const v = (j.streams || []).find((s) => s.codec_type === 'video');
    const dur = Number(j.format?.duration);
    return {
      width: Number(v?.width) || 0,
      height: Number(v?.height) || 0,
      fps: parseRate(v?.r_frame_rate) || 0,
      durationSec: Number.isFinite(dur) && dur > 0 ? dur : 0,
    };
  } catch {
    return { width: 0, height: 0, fps: 0, durationSec: 0 };
  }
}

export interface MatteMaterializeIO {
  ffmpeg: string;
  ffprobe?: string;
  /** 调用方已探测的源时长（键挂 clip.id 与 file）；缺省时用 ffprobe。 */
  durations?: Record<string, number>;
}

export type MatteMaterializeResult =
  | { ok: true; segment: ClipSegment; cached: boolean }
  | { ok: false; error: string };

/**
 * 物质化后的派生片段（纯函数）：file=合成文件、trim 重基到 0~段长、去掉 matte 字段。
 * ★ 保留 label/speed/speedCurve/volume/audioFile/keepOriginalAudio 等全部其余字段 ——
 *   合成文件已经包含原段音频，音量/变速仍由后续渲染链处理。
 */
export function deriveMatteSegment(seg: ClipSegment, file: string, duration: number): ClipSegment {
  const { matte: _drop, ...rest } = seg;
  return { ...rest, file, trimStart: 0, trimEnd: Number(Math.max(0, duration).toFixed(3)) };
}

/**
 * 把单个片段物质化：生成蒙版 → 合成背景 → 返回派生片段（file=合成文件、trim 重基到 0）。
 *
 * ★ 失败一律返回可读错误（缺模型给放置/下载指引），**绝不返回一个"看起来成功"的原片段** ——
 *   那会让用户以为抠像生效了，导出后才发现背景没换。
 * ★ 派生段去掉 matte 字段（避免递归/重复物质化），其余字段（speed/volume/audioFile…）原样保留。
 */
export async function materializeSegmentMatte(
  seg: ClipSegment,
  io: MatteMaterializeIO,
): Promise<MatteMaterializeResult> {
  if (!seg.matte) return { ok: true, segment: seg, cached: true };
  if (IMAGE_RE.test(seg.file)) {
    return { ok: false, error: '图片素材不支持智能抠像（蒙版生成需要视频解码器），请先把它当视频处理或改用蒙版功能' };
  }
  if (!existsSync(seg.file)) {
    return { ok: false, error: `素材文件不存在：${seg.file}` };
  }

  // 1) 运行时（缺模型 → 可读错误 + 放置/下载指引）
  const rt = await resolveMatteRuntime(seg.matte.model ? { model: seg.matte.model } : undefined);
  if (!rt.ok) {
    return {
      ok: false,
      error: `智能抠像不可用：${rt.error || '运行时未就绪'}\n${(rt.guidance || []).join('\n')}`,
    };
  }

  const ffprobe = deriveFfprobe(io.ffmpeg, io.ffprobe);
  const info = await probeSourceInfo(ffprobe, seg.file);
  if (!(info.width > 0 && info.height > 0)) {
    return { ok: false, error: `无法读取素材分辨率：${seg.file}` };
  }
  let rawDur = io.durations?.[seg.id] ?? io.durations?.[seg.file] ?? info.durationSec;
  if (!(Number(rawDur) > 0)) rawDur = info.durationSec;

  const trimStart = Math.max(0, Number(seg.trimStart ?? 0) || 0);
  let trimEnd = seg.trimEnd != null ? Number(seg.trimEnd) : Number(rawDur);
  if (Number(rawDur) > 0) trimEnd = Math.min(trimEnd, Number(rawDur));
  const duration = trimEnd - trimStart;
  if (!(duration > 0.001)) {
    return { ok: false, error: `裁剪区间无效（${trimStart}s → ${trimEnd}s），无法抠像` };
  }

  // 2) 缓存键 + 命中
  let sourceStat: { size: number; mtimeMs: number };
  try {
    const st = statSync(seg.file);
    sourceStat = { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { ok: false, error: `无法读取素材文件状态：${seg.file}` };
  }
  const key = matteCacheKey(seg, { sourceStat, modelId: rt.modelId });
  const dir = matteRenderCacheDir();
  const composite = path.join(dir, `composite-${key}.mp4`);
  const mask = path.join(dir, `mask-${key}.mp4`);
  const derived: ClipSegment = deriveMatteSegment(seg, composite, duration);

  try {
    const st = await stat(composite);
    if (st.isFile() && st.size > 0) {
      const now = new Date();
      await utimes(composite, now, now).catch(() => undefined);
      return { ok: true, segment: derived, cached: true };
    }
  } catch { /* 未命中 */ }

  // 3) 蒙版（按 key 复用；生成失败直接报错，不静默跳过）
  try {
    await mkdir(dir, { recursive: true });
  } catch (e: unknown) {
    return { ok: false, error: `无法创建抠像缓存目录：${e instanceof Error ? e.message : String(e)}` };
  }
  let maskReady = false;
  try {
    const ms = await stat(mask);
    maskReady = ms.isFile() && ms.size > 0;
  } catch { maskReady = false; }
  if (!maskReady) {
    // ★ 先写临时名再 rename：脚本中途失败不会留下一段"非空但残缺"的蒙版被下次复用
    const tmpMask = path.join(dir, `mask-${key}-${process.pid}-${Date.now()}.tmp.mp4`);
    const gen = await generatePortraitMatte({
      file: seg.file,
      outPath: tmpMask,
      ss: trimStart,
      duration,
      fps: effectiveMatte(seg.matte).fps,
      ...(seg.matte.model ? { modelId: seg.matte.model } : {}),
    });
    if (!gen.ok) {
      try { await rm(tmpMask, { force: true }); } catch { /* ignore */ }
      return { ok: false, error: gen.error || '蒙版生成失败' };
    }
    try {
      await rename(tmpMask, mask);
    } catch (e: unknown) {
      try { await rm(tmpMask, { force: true }); } catch { /* ignore */ }
      return { ok: false, error: `写入蒙版缓存失败：${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // 4) 合成（临时名 + rename 原子落缓存位；半成品不占缓存位）
  const m = effectiveMatte(seg.matte);
  const tmpOut = path.join(dir, `composite-${key}-${process.pid}-${Date.now()}.tmp.mp4`);
  const composed = await composeMatteWithMask({
    ffmpeg: io.ffmpeg,
    sourceFile: seg.file,
    maskFile: mask,
    outFile: tmpOut,
    width: info.width,
    height: info.height,
    fps: info.fps || 30,
    background: m.background,
    ...(m.color ? { color: m.color } : {}),
    feather: m.feather,
    ss: trimStart,
    duration,
  });
  if (!composed.ok) {
    try { await rm(tmpOut, { force: true }); } catch { /* ignore */ }
    return { ok: false, error: composed.error || '抠像合成失败' };
  }
  try {
    // rename 覆盖旧缓存是安全的（同一 key = 同一参数，内容等价）
    await rename(tmpOut, composite);
  } catch (e: unknown) {
    try { await rm(tmpOut, { force: true }); } catch { /* ignore */ }
    return { ok: false, error: `写入抠像缓存失败：${e instanceof Error ? e.message : String(e)}` };
  }
  await pruneMatteCache();
  return { ok: true, segment: derived, cached: false };
}

/**
 * 工程级物质化：遍历 clips，把带 matte 的段替换成派生段。
 * ★ 没有任何 matte 时**原样返回同一个工程对象**（无 matte 路径零变化）。
 * ★ 任一段失败即整体失败（不渲染半成品）；错误带段号与段名，便于定位。
 */
export async function materializeProjectMatte(
  project: ClipProject,
  io: MatteMaterializeIO,
): Promise<
  | { ok: true; project: ClipProject; cleanup: () => Promise<void>; materialized: number }
  | { ok: false; error: string }
> {
  if (!project.clips.some((c) => c.matte)) {
    return { ok: true, project, cleanup: async () => undefined, materialized: 0 };
  }
  const clips: ClipSegment[] = [];
  let materialized = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const seg = project.clips[i];
    if (!seg.matte) {
      clips.push(seg);
      continue;
    }
    const r = await materializeSegmentMatte(seg, io);
    if (!r.ok) {
      return { ok: false, error: `第 ${i + 1} 段（${seg.label || path.basename(seg.file)}）抠像失败：${r.error}` };
    }
    clips.push(r.segment);
    materialized += 1;
  }
  return {
    ok: true,
    project: { ...project, clips },
    cleanup: async () => { await pruneMatteCache(); },
    materialized,
  };
}

/**
 * 缓存清理（LRU 近似）：composite 超过上限时按 mtime 淘汰最旧的一批（到 75%），
 * 同时删对应 mask。只动正式缓存位（composite-… 与 mask-…），临时 .tmp.mp4 由各自失败分支清理。
 */
export async function pruneMatteCache(): Promise<void> {
  try {
    const dir = matteRenderCacheDir();
    const names = (await readdir(dir)).filter((n) => /^composite-.*\.mp4$/.test(n));
    if (names.length <= MATTE_CACHE_MAX) return;
    const rows = await Promise.all(names.map(async (n) => {
      const p = path.join(dir, n);
      try {
        const s = await stat(p);
        return { key: n.slice('composite-'.length, -'.mp4'.length), at: s.mtimeMs };
      } catch {
        return null;
      }
    }));
    const list = rows.filter((r): r is { key: string; at: number } => !!r).sort((a, b) => a.at - b.at);
    const keep = Math.floor(MATTE_CACHE_MAX * PRUNE_RATIO);
    const drop = list.slice(0, Math.max(0, list.length - keep));
    await Promise.all(drop.map(async (r) => {
      await unlink(path.join(dir, `composite-${r.key}.mp4`)).catch(() => undefined);
      await unlink(path.join(dir, `mask-${r.key}.mp4`)).catch(() => undefined);
    }));
  } catch { /* 清理失败不影响主流程 */ }
}
