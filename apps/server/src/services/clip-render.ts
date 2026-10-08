// 剪辑工程 → ffmpeg 渲染 —— 剪辑模式的**唯一渲染出口**。
//
// 为什么单独一层（而不是让 UI 自己拼 ffmpeg 命令）：
//   ① UI 与智能体共用同一份工程，渲染必须也只有一份实现，否则「同一份 json 出两种成片」；
//   ② 渲染是本链路唯一不可单测的部分（要真跑 ffmpeg），所以把**可测的部分**（滤镜串构造、
//      时长换算）抽成纯函数 `buildRenderPlan`，`renderClipProject` 只负责执行；
//   ③ 与既有 media_edit 的关系：这里是「多段 + 字幕 + BGM」的组合渲染，
//      单段加工仍走 media_edit（不重复实现两套同样的滤镜逻辑）。
//
// ★ 已知铁律（沿用 media_edit / media_compose 的实测教训）：
//   · 有 `-map` 时 ffmpeg 默认流选择被禁用 → 视频流必须显式映射，否则可能只出音轨；
//   · anullsrc 是无限源，必须显式 `-t`（只靠 -shortest 在 ffmpeg 9.0 不生效）；
//   · concat 前各段规格必须一致 → 本模块统一先 normalize（scale+crop+setsar+fps）；
//   · moov 必须前置（`-movflags +faststart`），否则应用内预览要下完整文件才开播。

import path from 'node:path';
import { runCmd } from './exec-cmd.js';
import { parseSrt, buildAss, SUBTITLE_ANIMATION_PRESETS } from '../mcp/subtitle-style.js';
import { MASK_KEYS, AUDIO_EFFECTS, effectFilter, buildPiecewiseExpr, overlayAnchorOf } from '@yan-zhi/shared';
import { buildMaskFilter } from './clip-mask.js';
import type { ClipProject, ClipSegment } from './clip-project.js';

export interface RenderProbeResult {
  hasAudio: boolean;
  durationSec: number;
  width: number;
  height: number;
}

/**
 * 探测媒体元数据（时长/分辨率/有无音轨）—— **单一出口**。
 *
 * ★★★ 为什么必须只有一个实现：探测是"时间轴按真实时长排布"的依据，
 *   而这个依据要供三处用：渲染计划（本文件）、`clip_project` 工具、`/api/clip/probe`（前端时间轴）。
 *   三处各写一份必然会漂移 —— 症状是"模型算的时长与 UI 显示的不一致"，且都不报错。
 *   （此前 probeMedia 是 api-tool-executor 的私有函数，路由层根本用不到。）
 */
export function parseProbeJson(out: string): { hasAudio: boolean; durationSec: number; width: number; height: number } {
  try {
    const j = JSON.parse(out) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video');
    const dur = Number(j.format?.duration);
    return {
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
      durationSec: Number.isFinite(dur) && dur > 0 ? dur : 0,
      width: Number(v?.width) || 0,
      height: Number(v?.height) || 0,
    };
  } catch {
    return { hasAudio: false, durationSec: 0, width: 0, height: 0 };
  }
}

/** ffprobe 参数（各处必须一致，否则解析出来的字段口径不同）。 */
export function probeArgs(file: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=index,codec_type,width,height', '-of', 'json', file];
}

export interface RenderPlanStep {
  /** 人类可读的步骤说明（进度与排障用） */
  label: string;
  args: string[];
  /** 本步预期产出（绝对路径） */
  out: string;
}

/** 需要调用方先落盘的中间文本文件（纯函数层不写磁盘）。 */
export interface RenderAsset {
  file: string;
  content: string;
}

export interface RenderPlan {
  steps: RenderPlanStep[];
  /** 跑 steps 之前必须先写好的文本文件（concat 清单 / SRT / ASS） */
  assets: RenderAsset[];
  totalDuration: number;
}

export interface BuildPlanInput {
  project: ClipProject;
  /** 每段实测时长（秒），键为 clip.id 或 file */
  durations: Record<string, number>;
  /** 每段是否有音轨 */
  hasAudio: Record<string, number | boolean>;
  /** 中间与产出目录（临时文件都落这里） */
  workDir: string;
  /** 成片输出文件（绝对路径） */
  outFile: string;
  /** BGM 文件存在性由调用方保证；此处只用于是否生成混音步骤 */
  bgmFile?: string;
  /** 素材可解析性：已知不含视频流的图片素材（走 kenburns 分支） */
  imageFiles?: string[];
  /** 预览档：更快的 preset 与更高 crf */
  fast?: boolean;
}

/**
 * 段有效时长（秒）：裁剪区间 / 变速后的时长。
 *
 * ★ 必须夹到源片长（rawDuration > 0 时）：trimEnd 写超了不夹的话，
 *   ① 时间轴累计会算出一个不存在的时间轴长度；
 *   ② 以 segDur 推算的 `fade=t=out:st=` 会落在成片之后 → 淡出静默不生效
 *      （ffmpeg 不报错，只是看不到效果）。探测失败（rawDuration=0）时不能夹，否则时长归零。
 */
export function segmentDuration(seg: ClipSegment, rawDuration: number): number {
  const ts = seg.trimStart ?? 0;
  let te = seg.trimEnd ?? (rawDuration > 0 ? rawDuration : ts);
  if (rawDuration > 0) te = Math.min(te, rawDuration);
  const trimmed = Math.max(0, te - ts);
  const sp = seg.speed && seg.speed > 0 ? seg.speed : 1;
  return trimmed / sp;
}

/** 目录名安全化（避免中文/空格进 ffmpeg 路径引发转义分支）。 */
function safeStem(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || 'clip';
}

/** subtitles 滤镜路径转义（Windows 盘符冒号是 filtergraph 特殊字符）。 */
function escFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * 构造渲染计划（**纯函数**，不碰磁盘不跑命令 → 可脱机单测）。
 *
 * 渲染链路（段 → 拼接 → 字幕/BGM）：
 *   ① 每段加工成同规格 mp4（裁剪/变速/调色/淡入淡出/图片运镜/配音替换）；
 *   ② concat demuxer 直拼（规格已统一，-c copy 必过）；
 *   ③ 字幕：SRT→（有动画则 ASS）烧录；无字幕跳过；
 *   ④ BGM：与原声混音（可闪避）；无 BGM 跳过。
 */

/**
 * 构造一个片段的完整滤镜链（**渲染与实时预览共用**）。
 *
 * ★★★ 为什么必须共享（2026-10-07 用户报「边剪辑边预览没有？」）：
 *   预览与导出若各写一套滤镜逻辑，必然漂移 —— 用户会看到"预览挺好、导出不一样"，
 *   而且这种不一致几乎没有现场证据。本函数是**唯一**的段滤镜定义处。
 *
 * 滤镜顺序（每一步都有理由，别随意调换）：
 *   normVf（统一规格）→ 裁剪回填 → 关键帧运镜（zoompan）→ 蒙版（geq 依赖已确定的 W/H）
 *   → 调色 → 淡入淡出 → format=yuv420p
 * ★ 透明度关键帧**不在这里**：它需要垫黑底合成（yuv420p 无 alpha，直接改 alpha 会被
 *   丢掉——实测踩过），必须拆成 filter_complex（见 assembleSegmentChain）。
 */
export function buildSegmentFilters(opts: {
  seg: ClipSegment;
  /** 段内有效时长（秒，已含变速） */
  segDur: number;
  isImage: boolean;
  W: number;
  H: number;
  fps: number;
  keyFilterOf?: (id: string) => string | null;
}): string[] {
  const { seg, segDur, isImage, W, H, fps } = opts;
  const filters: string[] = [];

  const kf = seg.keyframes;
  // 运镜关键帧（缩放/位移）对图片素材跳过：kenburns 本身就是运镜，两个 zoompan 串联会复合叠加
  const hasZoomPan = !isImage && !!kf?.some((k) => (k.scale != null && Math.abs(k.scale - 1) > 0.001) || (k.offsetX != null && k.offsetX !== 0) || (k.offsetY != null && k.offsetY !== 0));

  if (isImage) {
    // 图片运镜：先放大 4 倍再 zoompan（直接 zoom 会因亚像素抖动明显）
    const frames = Math.max(2, Math.round(segDur * fps));
    const dir = seg.kenburns?.direction === 'out' ? 'out' : 'in';
    const stepZ = (0.25 / frames).toFixed(6);
    const zExpr = dir === 'out'
      ? `if(eq(on,1),1.25,max(zoom-${stepZ},1.0))`
      : `min(zoom+${stepZ},1.25)`;
    filters.push(`scale=${W * 4}:-2`, `zoompan=z='${zExpr}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`);
    filters.push('setsar=1');
  } else {
    filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}`);
  }

  // ★ 画面裁剪（取景）：裁子区域后回填画幅（fill 不变形）——蒙版/字幕坐标不受影响
  if (seg.crop) {
    const c = seg.crop;
    filters.push(
      `crop=iw*${c.w?.toFixed(4)}:ih*${c.h?.toFixed(4)}:iw*${c.x?.toFixed(4)}:ih*${c.y?.toFixed(4)}`,
      `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`,
    );
  }

  // ★ 关键帧运镜：放大 4 倍后 zoompan，z/x/y 都是分段线性表达式（变量 ot = 输出时间秒；
  //   归一化 t(0~1) 换算成 (ot/段长) 进表达式，与 buildPiecewiseExpr 的 0~1 定义域对齐）
  if (hasZoomPan && kf) {
    const tVar = `(ot/${segDur.toFixed(6)})`;
    const hasOffset = kf.some((k) => (k.offsetX != null && k.offsetX !== 0) || (k.offsetY != null && k.offsetY !== 0));
    let zExpr = buildPiecewiseExpr(kf.filter((k) => k.scale != null).map((k) => ({ t: k.t, v: k.scale! })), tVar);
    // ★ 只有位移没有缩放时 zoom=1 没有画面外的内容可移 → 兜底放大 1.2 倍留出位移余量
    if (hasOffset) zExpr = `max(${zExpr},1.2)`;
    const xExpr = `${kf.some((k) => k.offsetX) ? `(${buildPiecewiseExpr(kf.filter((k) => k.offsetX != null).map((k) => ({ t: k.t, v: k.offsetX! })), tVar)})*iw/zoom+` : ''}iw/2-(iw/zoom/2)`;
    const yExpr = `${kf.some((k) => k.offsetY) ? `(${buildPiecewiseExpr(kf.filter((k) => k.offsetY != null).map((k) => ({ t: k.t, v: k.offsetY! })), tVar)})*ih/zoom+` : ''}ih/2-(ih/zoom/2)`;
    filters.push(`scale=${W * 4}:-2`);
    filters.push(`zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${fps}`, 'setsar=1');
  }

  // ★ 蒙版紧跟规格化：geq 的 X/Y/W/H 依赖已确定的画面尺寸；
  //   且必须早于 format=yuv420p（yuv 无 alpha 通道，否则蒙版被丢弃）
  const mf = seg.mask ? buildMaskFilter(seg.mask, opts.keyFilterOf) : null;
  if (mf) filters.push(mf);

  if (seg.colorPreset) filters.push(colorFilter(seg.colorPreset));
  // 变速：对已统一的帧率做 setpts（必须在 scale 之后）
  const speed = isImage ? 1 : (seg.speed ?? 1);
  if (Math.abs(speed - 1) > 0.001) {
    const ptIdx = filters.findIndex((f) => f.startsWith('scale='));
    filters.splice(ptIdx + 1, 0, `setpts=PTS/${speed.toFixed(6)}`);
  }
  if (seg.fadeIn) filters.push(`fade=t=in:st=0:d=${seg.fadeIn}`);
  if (seg.fadeOut) filters.push(`fade=t=out:st=${Math.max(0, segDur - seg.fadeOut).toFixed(3)}:d=${seg.fadeOut}`);
  filters.push('format=yuv420p');
  return filters;
}

/**
 * 透明度关键帧的 alpha 表达式（geq 的 a= 参数值；T = 帧时间秒）。
 * 返回 null = 该段没有有效透明度关键帧。
 * ★ 只挑真正改透明度的点：全是 1 的点列生成"恒 255"没有意义。
 */
export function opacityKfExpr(seg: ClipSegment, segDur: number): string | null {
  const kf = seg.keyframes;
  if (!kf?.length) return null;
  const pts = kf.filter((k) => k.opacity != null && k.opacity < 0.999).map((k) => ({ t: k.t, v: k.opacity! }));
  // 只有下降到 <1 的点才需要合成；没有 → null（保持原链路，不付 geq 的性能代价）
  if (!pts.length) return null;
  // 全程为 0 会生成全黑段（合法但怪）——照常生成，由用户自己改
  return buildPiecewiseExpr(pts, `(T/${segDur.toFixed(6)})`);
}

export interface SegmentVideoChain {
  /** -vf 用的滤镜串（fcHead 为 null 时有效） */
  vf: string | null;
  /** filter_complex 的视频段前缀（透明度关键帧需要垫黑底合成时非 null），产物流标签 [v0] */
  fcHead: string | null;
  /** 视频产物流标签（'-map' / filter_complex 引用用） */
  vLabel: string;
}

/**
 * 装配片段的视频滤镜链 —— 渲染与预览**共用**的第三层（vf 或 垫黑底 filter_complex）。
 *
 * ★ 为什么要有这一层：透明度关键帧必须把带 alpha 的画面 overlay 到黑底上，
 *   单条 -vf 做不到（需要第二个输入 color 源）。没有这一层的话，渲染与预览要各自
 *   拼一遍 fc 字符串 —— 又是两份必然漂移的实现。
 */
export function assembleSegmentChain(opts: {
  seg: ClipSegment;
  segDur: number;
  isImage: boolean;
  W: number;
  H: number;
  fps: number;
  keyFilterOf?: (id: string) => string | null;
}): SegmentVideoChain {
  const filters = buildSegmentFilters(opts);
  const opExpr = opacityKfExpr(opts.seg, opts.segDur);
  // ★ vf 路径的输出标签是 'v'（调用方包成 [0:v]<vf>[v]）；fc 路径 fcHead 产出 [v0]。
  //   不能把输入标签 '0:v' 当输出标签 —— map 到 [0:v] 会把未加工的原始流一并输出（实测踩过）。
  if (!opExpr) return { vf: filters.join(','), fcHead: null, vLabel: 'v' };
  const fcHead =
    `[0:v]${filters.join(',')},format=yuva420p,` +
    `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*clip(${opExpr},0,1)'[kfg];` +
    `color=c=black:s=${opts.W}x${opts.H}:r=${opts.fps}[kbg];` +
    `[kbg][kfg]overlay=x=0:y=0:eof_action=repeat:shortest=1,format=yuv420p`;
  return { vf: null, fcHead, vLabel: 'v0' };
}

export function buildRenderPlan(input: BuildPlanInput): { ok: true; plan: RenderPlan } | { ok: false; error: string } {
  const { project, workDir, outFile } = input;
  if (!project.clips.length) return { ok: false, error: '工程里没有任何片段（先用 add_clip 加素材或 clip_import 导入目录）' };

  const [W, H] = project.output.size.split('x').map(Number);
  if (!(W > 0 && H > 0)) return { ok: false, error: `导出规格非法：${project.output.size}` };
  const fps = project.output.fps || 30;
  const imgSet = new Set((input.imageFiles || []).map((f) => f.toLowerCase()));
  const x264 = input.fast
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'];
  // 统一规格：较短边放大到覆盖目标框后居中裁切（横竖屏都填满不变形）
  const normVf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}`;

  const steps: RenderPlanStep[] = [];
  const assets: RenderAsset[] = [];
  const segFiles: string[] = [];
  let totalDuration = 0;

  // 蒙版滤镜构造所需的色键查表（来自效果库，单一真相源）
  const keyFilterOf = (id: string) => MASK_KEYS.find((k) => k.id === id)?.filter || null;

  for (let i = 0; i < project.clips.length; i++) {
    const seg = project.clips[i];
    const rawDur = input.durations[seg.id] ?? input.durations[seg.file] ?? 0;
    const isImage = imgSet.has(seg.file.toLowerCase()) || seg.kenburns != null;
    const segDur = isImage
      ? (seg.kenburns?.duration ?? Math.max(3, rawDur || 3))
      : segmentDuration(seg, rawDur);
    totalDuration += segDur;

    const segOut = path.join(workDir, `seg-${String(i + 1).padStart(3, '0')}-${safeStem(seg.id)}.mp4`);
    // ★ 段滤镜链走**共享装配层**（与实时预览同一份定义）—— 各写一套必然漂移
    const chain = assembleSegmentChain({ seg, segDur, isImage, W, H, fps, keyFilterOf });

    const args: string[] = ['-y'];
    const speed = isImage ? 1 : (seg.speed ?? 1);
    // 从源读多少秒：变速前的原始长度（setpts 之后自然变成 segDur）
    const readDur = isImage ? segDur : segDur * speed;
    if (isImage) {
      args.push('-loop', '1', '-i', seg.file, '-t', String(segDur));
    } else {
      if (seg.trimStart != null && seg.trimStart > 0) args.push('-ss', String(seg.trimStart));
      // ★★ `-t` 必须紧跟在 `-ss` 之后、**本输入 `-i` 之前**。
      //   放在两个 `-i` 之间时 ffmpeg 会把它归属到**后一个**输入 → 视频根本没被裁、
      //   反而把配音截短了：成片时长错、且完全不报错（实测踩到：3 段预算 10.5s 出了 12.5s）。
      if (seg.trimStart != null || seg.trimEnd != null) args.push('-t', readDur.toFixed(3), '-i', seg.file);
      else args.push('-i', seg.file);
    }

    const hasAudioIn = Boolean(input.hasAudio[seg.id] ?? input.hasAudio[seg.file]);
    const audioFile = seg.audioFile;
    // ★ 透明度关键帧存在时视频必须走 filter_complex（垫黑底），音频也要并进同一条 fc
    const useKfFc = chain.fcHead != null;
    const vLabel = `[${chain.vLabel}]`;

    if (audioFile) {
      args.push('-i', audioFile);
      const vol = seg.volume ?? 1;
      const aChain = [`volume=${vol.toFixed(3)}`];
      // ★★ 用 filter_complex 时**不能**再前置裸 `-map 0:v:0` ——
      //   那样会同时映射「原始未加工视频流」与滤镜链产物 `[v]`，产出**两条视频流**，
      //   而 ffmpeg 把未加工的那条放在前面 → 成片分辨率/裁剪/调色全部静默失效
      //   （实测：1080x1920 工程出成 1920x1080，且不报任何错）。
      if (!seg.keepOriginalAudio) {
        // 配音替换原声：只映射配音轨
        if (Math.abs(speed - 1) > 0.001) aChain.push(atempoChain(speed));
        const fc = useKfFc
          ? `${chain.fcHead};[1:a]${aChain.join(',')}[a]`
          : `[0:v]${chain.vf}[v];[1:a]${aChain.join(',')}[a]`;
        args.push('-filter_complex', fc, '-map', vLabel, '-map', '[a]');
      } else if (hasAudioIn) {
        // 保留原声并与配音混音
        const fc = (useKfFc ? `${chain.fcHead};` : `[0:v]${chain.vf}[v];`) +
          `[0:a]volume=${vol.toFixed(3)}[o];[1:a]volume=${vol.toFixed(3)}[d];[o][d]amix=inputs=2:duration=first:dropout_transition=2[a]`;
        args.push('-filter_complex', fc, '-map', vLabel, '-map', '[a]');
      } else {
        const fc = useKfFc
          ? `${chain.fcHead};[1:a]${aChain.join(',')}[a]`
          : `[0:v]${chain.vf}[v];[1:a]${aChain.join(',')}[a]`;
        args.push('-filter_complex', fc, '-map', vLabel, '-map', '[a]');
      }
      args.push(...x264, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', segOut);
    } else {
      // 无配音：用原音轨；无音轨则补等长静音（anullsrc 必须显式 -t）
      const vol = seg.volume;
      if (useKfFc) {
        // 透明度关键帧：视频+音频全走 filter_complex
        if (hasAudioIn) {
          const volPart = vol != null && Math.abs(vol - 1) > 0.001 ? `[0:a]volume=${vol.toFixed(3)}[a]` : `[0:a]anull[a]`;
          args.push('-filter_complex', `${chain.fcHead};${volPart}`, '-map', vLabel, '-map', '[a]');
        } else {
          args.push('-f', 'lavfi', '-t', String(segDur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
          args.push('-filter_complex', chain.fcHead!, '-map', vLabel, '-map', '1:a:0');
        }
      } else if (hasAudioIn) {
        const vArgs = vol != null && Math.abs(vol - 1) > 0.001 ? ['-af', `volume=${vol.toFixed(3)}`] : [];
        args.push('-map', '0:v:0', '-map', '0:a:0', '-vf', chain.vf!, ...vArgs, ...x264, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', segOut);
      } else {
        args.push('-f', 'lavfi', '-t', String(segDur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0', '-vf', chain.vf!, ...x264, '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', segOut);
      }
    }
    steps.push({ label: `加工第 ${i + 1} 段（${seg.label || path.basename(seg.file)}，${segDur.toFixed(2)}s）`, args, out: segOut });
    segFiles.push(segOut);
  }

  // ② 拼接：**有转场走 xfade 链，无转场走 -c copy 直拼**
  //
  // ★★★ 为什么分两条路（2026-10-07）：
  //   转场必须重编码（xfade 是滤镜），而**绝大多数工程没有转场** ——
  //   一律走 xfade 会让所有导出白白慢几倍、还掉画质。所以"有转场才付代价"。
  // ★ xfade 链是**逐段串接**的：每接一段都要把前面已拼好的结果当输入之一，
  //   所以 offset 要用"累计到该交界处的时长 - 转场时长"。
  const hasTransition = project.clips.some((c, i) => i > 0 && c.transition);
  let cursorFile = '';

  if (segFiles.length === 1) {
    cursorFile = segFiles[0];
  } else if (!hasTransition) {
    const listBody = segFiles.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
    const listFile = path.join(workDir, 'concat.txt');
    const joined = path.join(workDir, 'joined.mp4');
    assets.push({ file: listFile, content: listBody });
    steps.push({
      label: `拼接 ${segFiles.length} 段（直拼）`,
      args: ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', joined],
      out: joined,
    });
    cursorFile = joined;
  } else {
    // 逐段 xfade：先算出每段时长（复用与时间轴一致的口径）
    const segDurs: number[] = project.clips.map((seg, i) => {
      const rawDur = input.durations[seg.id] ?? input.durations[seg.file] ?? 0;
      const isImg = !!seg.kenburns || imgSet.has(seg.file.toLowerCase());
      return isImg ? (seg.kenburns?.duration ?? Math.max(3, rawDur || 3)) : segmentDuration(seg, rawDur);
    });

    let acc = segFiles[0];          // 已拼好的结果（初始=第 1 段）
    let accDur = segDurs[0];
    for (let i = 1; i < segFiles.length; i++) {
      const tr = project.clips[i].transition;
      const outFile = path.join(workDir, `xfade-${String(i).padStart(3, '0')}.mp4`);
      if (!tr) {
        // 该交界无转场：用 concat 把两段接起来（保持 copy，不重编码）
        const lf = path.join(workDir, `cat-${i}.txt`);
        const body = [acc, segFiles[i]].map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
        assets.push({ file: lf, content: body });
        steps.push({
          label: `接第 ${i + 1} 段（无转场直拼）`,
          args: ['-y', '-f', 'concat', '-safe', '0', '-i', lf, '-c', 'copy', '-movflags', '+faststart', outFile],
          out: outFile,
        });
        acc = outFile;
        accDur += segDurs[i];
        continue;
      }
      // 有转场：xfade。duration 不能超过任一段时长（否则 offset 为负 → ffmpeg 报错）
      const want = tr.duration ?? 0.8;
      const d = Math.max(0.1, Math.min(want, accDur - 0.05, segDurs[i] - 0.05));
      const offset = Math.max(0, accDur - d);
      // ★ 音频：两段都有音轨才做 acrossfade（我们的段管线保证每段都有音轨——无音轨已补静音）
      const fc = `[0:v][1:v]xfade=transition=${tr.type}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)},format=yuv420p[v];[0:a][1:a]acrossfade=d=${d.toFixed(3)}[a]`;
      steps.push({
        label: `转场 ${tr.type}（第 ${i} → ${i + 1} 段，${d.toFixed(2)}s）`,
        args: ['-y', '-i', acc, '-i', segFiles[i], '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
          ...x264, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile],
        out: outFile,
      });
      acc = outFile;
      accDur = accDur + segDurs[i] - d;   // 转场让总时长缩短 d
    }
    cursorFile = acc;
  }

  // ②.5 画中画（叠加轨）：在成片的某段时间叠一个小画面
  //
  // ★ 放在拼接之后、字幕之前：字幕永远在最上层（压在画中画上）；
  //   BGM 混音在最前（画中画不带音频——口播/配乐由主轨与 BGM 负责，小窗出声反而吵）。
  if (project.overlays?.length) {
    const piped = path.join(workDir, 'piped.mp4');
    const ovs = project.overlays.filter((o) => o.end > o.start && o.start < totalDuration);
    if (ovs.length) {
      const args: string[] = ['-y', '-i', cursorFile];
      const fc: string[] = [];
      let prev = '0:v';
      for (let k = 0; k < ovs.length; k++) {
        const ov = ovs[k];
        const st = Math.max(0, ov.start);
        const et = Math.min(totalDuration, ov.end);
        // ★ -t 紧跟 -ss 且在本输入 -i 之前（与段加工同一条铁律：归属到本输入）
        args.push('-ss', st.toFixed(3), '-t', Math.max(0.04, et - st).toFixed(3), '-i', ov.file);
        const ovW = Math.max(16, Math.round(W * (ov.scale ?? 0.35)));
        const anchor = overlayAnchorOf(ov.pos);
        fc.push(`[${k + 1}:v]scale=${ovW}:-2,setsar=1[ov${k}]`);
        fc.push(`[${prev}][ov${k}]overlay=x='${anchor.x}':y='${anchor.y}':enable='between(t,${st.toFixed(3)},${et.toFixed(3)})'[v${k}]`);
        prev = `v${k}`;
      }
      args.push('-filter_complex', fc.join(';'), '-map', `[${prev}]`, '-map', '0:a?', ...x264, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', piped);
      steps.push({
        label: `画中画合成（${ovs.length} 层）`,
        args,
        out: piped,
      });
      cursorFile = piped;
    }
  }

  // ③ 字幕（动画与非动画共用同一份 SRT；有动画时另生成 ASS 并用 subtitles 滤镜挂载）
  if (project.texts.length) {
    const subbed = path.join(workDir, 'subbed.mp4');
    const built = buildSubtitleAssets(project, W, H);
    const srtFile = path.join(workDir, 'subtitles.srt');
    assets.push({ file: srtFile, content: built.srt });
    const base = project.texts.find((t) => t.position === 'bottom') || project.texts[0];
    if (built.ass) {
      const assFile = path.join(workDir, 'subtitles.ass');
      assets.push({ file: assFile, content: built.ass });
      steps.push({
        label: `烧录字幕（动画 ${base.animation}，${project.texts.length} 条）`,
        args: ['-y', '-i', cursorFile, '-vf', `subtitles='${escFilterPath(assFile)}'`, '-c:a', 'copy', '-movflags', '+faststart', subbed],
        out: subbed,
      });
    } else {
      const mvPx = base.safeArea ? 420 : 200;
      const style = `FontSize=${Math.max(6, Math.round((base.fontSizePx ?? 88) * 384 / 1920))},` +
        `PrimaryColour=${hexToAss(base.color, '&H00FFFFFF&')},OutlineColour=${hexToAss(base.outlineColor, '&H00000000&')},` +
        `Outline=${Math.max(1, Math.round(12 * 384 / 1920))},Shadow=1,` +
        `Alignment=${base.position === 'top' ? 8 : base.position === 'center' ? 5 : 2},MarginV=${Math.round(mvPx * 288 / 1920)}`;
      steps.push({
        label: `烧录字幕（${project.texts.length} 条）`,
        args: ['-y', '-i', cursorFile, '-vf', `subtitles='${escFilterPath(srtFile)}':force_style='${style}'`, '-c:a', 'copy', '-movflags', '+faststart', subbed],
        out: subbed,
      });
    }
    cursorFile = subbed;
  }

  // ③.5 音效链（整片，按顺序串联）
  //
  // ★ 放在字幕之后、BGM 之前：BGM 依赖"说话时压低"（sidechain），
  //   让 BGM 看到的是**已降噪/已归一**的人声，压低判定才准。
  // ★ 响度归一（loudnorm）放最后会与 BGM 混音打架（混完音量又变），
  //   所以若链里有 loudnorm，顺序上它应当由用户在链里显式放好 —— 我们按用户给的顺序执行，不擅自重排。
  if (project.audioFx?.length) {
    const work = path.join(workDir, 'fx.mp4');
    const inputs = project.audioFx.map((id) => effectFilter(id, AUDIO_EFFECTS)).filter((f): f is string => !!f);
    if (inputs.length) {
      // 音效链串成一条 -af（音效都是 A->A 滤镜，可逗号串联）
      steps.push({
        label: `音效链（${project.audioFx.join(' → ')}）`,
        args: ['-y', '-i', cursorFile, '-af', inputs.join(','), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', work],
        out: work,
      });
      cursorFile = work;
    }
  }

  // ④ BGM 混音
  if (input.bgmFile) {
    const bgm = project.bgm!;
    const mixed = path.join(workDir, 'mixed.mp4');
    const bgChain = [`volume=${bgm.volume.toFixed(3)}`, `afade=t=in:st=0:d=0.5`];
    if (totalDuration > 0) bgChain.push(`afade=t=out:st=${Math.max(0, totalDuration - 1.5).toFixed(3)}:d=1.5`);
    const fc = bgm.duck
      ? `[0:a]asplit=2[v1][v2];[1:a]${bgChain.join(',')}[bg];[bg][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgd];[v1][bgd]amix=inputs=2:duration=first:dropout_transition=2[a]`
      : `[1:a]${bgChain.join(',')}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`;
    steps.push({
      label: `混入 BGM（音量 ${bgm.volume}${bgm.duck ? '，说话自动压低' : ''}）`,
      args: ['-y', '-i', cursorFile, '-i', input.bgmFile, '-filter_complex', fc, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mixed],
      out: mixed,
    });
    cursorFile = mixed;
  }

  // ⑤ 收尾：直接产出到目标文件（steps 内部已完成编码，末步产物改名为 outFile）
  const last = steps[steps.length - 1];
  if (last.out !== outFile) {
    if (steps.length === 1 && last.out === segFiles[0] && segFiles.length === 1) {
      // 单段无后续：直接输出到目标
      last.out = outFile;
      last.args[last.args.length - 1] = outFile;
    } else {
      steps.push({
        label: '收尾落盘',
        args: ['-y', '-i', cursorFile, '-c', 'copy', '-movflags', '+faststart', outFile],
        out: outFile,
      });
    }
  }

  return { ok: true, plan: { steps, assets, totalDuration: Number(totalDuration.toFixed(3)) } };
}

function atempoChain(factor: number): string {
  let f = Math.max(0.25, Math.min(4, factor));
  const parts: string[] = [];
  while (f > 2.0) { parts.push('atempo=2.0'); f /= 2.0; }
  while (f < 0.5) { parts.push('atempo=0.5'); f /= 0.5; }
  parts.push(`atempo=${f.toFixed(4)}`);
  return parts.join(',');
}

const COLOR_PRESETS: Record<string, string> = {
  warm: 'colorbalance=rs=.15:gs=.05:bs=-.10,eq=saturation=1.06',
  cool: 'colorbalance=rs=-.08:bs=.15,eq=saturation=1.02',
  bw: 'hue=s=0',
  vintage: 'curves=vintage,eq=saturation=.85:contrast=1.05',
  vivid: 'eq=saturation=1.35:contrast=1.08',
  film: 'eq=contrast=1.10:saturation=.90:gamma=.96,noise=alls=6:allf=t',
  fade: 'eq=brightness=.05:saturation=.75:contrast=.92',
};

function colorFilter(preset: string): string {
  return COLOR_PRESETS[preset] || COLOR_PRESETS.vivid;
}

/** #RRGGBB → libass &HAABBGGRR&（字节序反转）。 */
function hexToAss(v: string | undefined, fallback: string): string {
  const s = String(v || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallback;
  const r = s.slice(0, 2), g = s.slice(2, 4), b = s.slice(4, 6);
  return `&H00${b}${g}${r}&`.toUpperCase();
}

/** 字幕条目 → SRT（供无动画路线与外部播放器；有动画时另生成 ASS）。 */
export function buildSrtFromTexts(texts: ClipProject['texts']): string {
  const fmt = (sec: number) => {
    const c = Math.max(0, sec);
    const h = Math.floor(c / 3600), m = Math.floor((c % 3600) / 60), s = Math.floor(c % 60);
    const ms = Math.round((c - Math.floor(c)) * 1000);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  };
  return texts
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((t, i) => `${i + 1}\n${fmt(t.start)} --> ${fmt(t.end)}\n${t.text}`)
    .join('\n\n') + '\n';
}

/**
 * 生成字幕资产：返回 SRT 与（有动画时的）ASS 文本。
 *
 * ★ 逐条动画：条片子可以混用多种动效（片头 zoom、中段 karaoke、结尾 fade）——
 *   所以对**每一条**分别标记它自己的 preset/方向/对齐，而不是拿第一条的预设套全片
 *   （那样后两条会被静默按第一条渲染，用户看到的效果与要求不一致且不报错）。
 * 用 buildAss 复用 mcp/subtitle-style.ts 的 8 种动画 —— 剪辑模式与对话剪辑同一套实现。
 */
export function buildSubtitleAssets(
  project: ClipProject,
  resX: number,
  resY: number,
): { srt: string; ass?: string } {
  const srt = buildSrtFromTexts(project.texts);
  const anims = new Set(SUBTITLE_ANIMATION_PRESETS.map((p) => p.id));
  const withAnim = project.texts.filter((t) => t.animation && anims.has(t.animation));
  if (!withAnim.length) return { srt };
  const base = withAnim[0];
  const fsPx = Math.max(6, Math.round((base.fontSizePx ?? 88) * resY / 1920));
  // ★ 用字幕自己的 outlinePx（模板会写不同宽度），缺省 12；此前固定 12 导致"样式模板改了描边没反应"
  const olPx = Math.max(0, Math.round((base.outlinePx ?? 12) * resY / 1920));
  const mvPx = base.safeArea ? Math.round(420 * resY / 1920) : Math.round(200 * resY / 1920);

  // SRT 解析出的条目与工程 texts 一一对应（buildSrtFromTexts 按时序排序，这里同序取动画）
  const ordered = project.texts.slice().sort((a, b) => a.start - b.start);
  const cues = parseSrt(srt).map((c, i) => {
    const t = ordered[i];
    return t?.animation && anims.has(t.animation)
      ? { ...c, preset: t.animation, ...(t.slideDirection ? { slideDirection: t.slideDirection } : {}), ...(t.position ? { alignment: positionToAlign(t.position) } : {}) }
      : { ...c, preset: 'none' };
  });

  const r = buildAss(cues, {
    preset: base.animation!,
    playResX: resX,
    playResY: resY,
    fontSizePx: fsPx,
    primaryColor: hexToAss(base.color, '&H00FFFFFF&'),
    outlineColor: hexToAss(base.outlineColor, '&H00000000&'),
    outlinePx: olPx,
    // 底板色（样式模板的"标签/新闻条"用它；ASS 走 BorderStyle=3）
    ...(base.backColor ? { backColor: hexToAss(base.backColor, '&H7F000000') } : {}),
    alignment: positionToAlign(base.position),
    marginVPx: mvPx,
    direction: base.slideDirection,
  });
  return r.ok ? { srt, ass: r.ass } : { srt };
}

function positionToAlign(p?: string): number {
  return p === 'top' ? 8 : p === 'center' ? 5 : 2;
}

export interface RunStepResult {
  ok: boolean;
  failedLabel?: string;
  stderr?: string;
  done: number;
}

/**
 * 执行渲染计划（调用方负责先落盘 concat.txt / srt / ass —— 见 plan steps 上的附挂字段）。
 * 任一步失败立即停止并回报失败步骤（不是笼统的"渲染失败"）。
 */
export async function runRenderPlan(
  ffmpegBin: string,
  steps: RenderPlanStep[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<RunStepResult> {
  let done = 0;
  for (const step of steps) {
    if (!step.args.length) { done++; onProgress?.(done, steps.length, step.label); continue; }
    const r = await runCmd(ffmpegBin, step.args, { timeoutMs: 1800000, maxBuffer: 16 * 1024 * 1024 });
    if (!r.ok) {
      return { ok: false, failedLabel: step.label, stderr: (r.stderr || r.error || '').slice(-1500), done };
    }
    done++;
    onProgress?.(done, steps.length, step.label);
  }
  return { ok: true, done };
}