// 实时预览 —— 拖动播放头即出帧（"边剪辑边预览"的核心）。
//
// ★★★ 为什么必须做（2026-10-07 用户报「边剪辑边预览没有？感觉啥剪辑功能都没有」）：
//   此前所谓"预览"就是 `loadFiles` 里取**上一次渲染的成片**塞进 <video> ——
//   没有任何实时性：改了参数不动，必须整段渲染完才能看。
//   剪辑软件的核心体验就是"改一下、马上看到"，缺了它整个工作台就只是参数表单。
//
// 实现路径（**单帧出图**，而不是实时视频流）：
//   播放头时间 t → 定位到哪一段 → 段内相对时间 → ffmpeg -ss 抽**该位置经过完整滤镜链**的一帧
//   → 返回 PNG。整链（规格化/裁剪/变速/蒙版/调色/淡入淡出）与导出**共用** buildSegmentFilters，
//   所以"预览看到的画面"就是"导出后的画面"。
//
// 取舍说明（诚实记录）：
//   · 不做逐帧视频流（服务端持续编码 + 前端 MSE 推流）—— 复杂度和资源占用都高一个量级，
//     而剪辑中最需要的是"参数调对了没"的即时反馈，单帧抽图已覆盖。
//   · 字幕图层本版不叠加（字幕在 ASS 里按整段时间渲染，单帧叠加要复制一遍 ASS 逻辑，
//     容易与导出漂移）。字幕的核对走"出预览档"（低码率整段渲染，见 render preview=true）。

import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { MASK_KEYS, overlayAnchorOf } from '@yan-zhi/shared';
import { assembleSegmentChain, segmentDuration } from './clip-render.js';
import type { ClipProject } from './clip-project.js';

interface FrameCacheEntry {
  /** 缓存键：工程内容 hash + 段 id + 段内时间 */
  key: string;
  png: Buffer;
  at: number;
}

/** 帧缓存（同一位置的反复拖动不该反复起 ffmpeg；上限 40 张，FIFO 淘汰）。 */
const frameCache: FrameCacheEntry[] = [];
const CACHE_MAX = 40;

export interface PreviewFrameInput {
  project: ClipProject;
  /** 成片时间轴上的秒数 */
  timeSec: number;
  /** 每段真实时长（键为 clip.id 或 file；由 probe 得到） */
  durations: Record<string, number>;
  ffmpeg: string;
}

export interface PreviewFrameResult {
  ok: boolean;
  /** PNG 字节（ok=true 时） */
  png?: Buffer;
  /** 命中/未命中缓存（便于前端与排障判断） */
  cached?: boolean;
  error?: string;
  /** 当前播放头落在第几段（1 基）与段内秒数（便于 UI 显示） */
  segmentIndex?: number;
  offsetInSegment?: number;
}

/** 工程指纹：任一影响画面的字段变了就该重取帧（不能只按"段 id + 时间"缓存）。 */
function projectFingerprint(p: ClipProject): string {
  return JSON.stringify({
    o: p.output,
    c: p.clips.map((c) => [c.id, c.file, c.trimStart, c.trimEnd, c.speed, c.colorPreset, c.fadeIn, c.fadeOut, c.kenburns, c.mask, c.crop, c.keyframes]),
    // 画中画影响合成画面，必须进指纹（改了画中画不换帧 = 预览骗人）
    ov: (p.overlays || []).map((o) => [o.id, o.file, o.start, o.end, o.pos, o.scale]),
  });
}

/**
 * 定位：成片时间 t 落在哪一段、段内偏移多少。
 * 返回 null = t 超出成片范围（前端应夹住，不请求）。
 */
export function locateTimeline(project: ClipProject, t: number, durations: Record<string, number>):
  { segIndex: number; offsetInSeg: number; speed: number; trimStart: number } | null {
  let cursor = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const seg = project.clips[i];
    const raw = durations[seg.id] ?? durations[seg.file] ?? 0;
    const isImg = !!seg.kenburns;
    const dur = isImg ? (seg.kenburns!.duration) : segmentDuration(seg, raw);
    if (dur <= 0) continue;
    if (t < cursor + dur || i === project.clips.length - 1) {
      return {
        segIndex: i,
        offsetInSeg: Math.max(0, Math.min(dur, t - cursor)),
        speed: isImg ? 1 : (seg.speed ?? 1),
        trimStart: seg.trimStart ?? 0,
      };
    }
    cursor += dur;
  }
  return null;
}

/** 取指定时间点的预览帧（PNG）。 */
export async function renderPreviewFrame(input: PreviewFrameInput): Promise<PreviewFrameResult> {
  const { project, ffmpeg } = input;
  if (!project.clips.length) return { ok: false, error: '工程还没有片段' };

  const loc = locateTimeline(project, Math.max(0, input.timeSec), input.durations);
  if (!loc) return { ok: false, error: '时间超出成片范围' };
  const seg = project.clips[loc.segIndex];
  const raw = input.durations[seg.id] ?? input.durations[seg.file] ?? 0;
  if (!seg.kenburns && raw <= 0) {
    return { ok: false, error: '该段素材时长未知（可能是文件已被移动）', segmentIndex: loc.segIndex + 1 };
  }

  // 缓存键包含工程指纹 → 改了参数立刻失效，不会拿旧帧骗用户
  const key = `${projectFingerprint(project)}|${seg.id}|${loc.offsetInSeg.toFixed(2)}`;
  const hit = frameCache.find((e) => e.key === key);
  if (hit) {
    hit.at = Date.now();
    return { ok: true, png: hit.png, cached: true, segmentIndex: loc.segIndex + 1, offsetInSegment: loc.offsetInSeg };
  }

  const [W, H] = project.output.size.split('x').map(Number);
  const fps = project.output.fps || 30;
  const isImage = !!seg.kenburns;
  // 段内时长（用于淡出起点等需要"段长"的滤镜）
  const segDur = isImage ? (seg.kenburns!.duration) : segmentDuration(seg, raw);

  const keyFilterOf = (id: string) => MASK_KEYS.find((k) => k.id === id)?.filter || null;
  // ★★★ 预览与导出**共用同一份装配层**（vf / 垫黑底 fc 二选一）—— 这是"预览所见即导出所得"的唯一保证
  const chain = assembleSegmentChain({ seg, segDur, isImage, W, H, fps, keyFilterOf });
  // 播放头时刻生效的画中画（叠加在段画面之上）
  const activeOverlays = (project.overlays || []).filter((o) => o.end > o.start && input.timeSec >= o.start && input.timeSec < o.end);

  const workDir = path.join(tmpdir(), `yz-prev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const outPng = path.join(workDir, 'frame.png');
  try {
    await mkdir(workDir, { recursive: true });

    // 段内时间 → 素材内的真实时间：变速后时长 = 素材时长/speed，
    // 所以素材内偏移 = 段内偏移 × speed（trimStart 之前的平移单独加）
    const inSource = loc.trimStart + loc.offsetInSeg * loc.speed;

    const args: string[] = ['-y', '-v', 'error'];
    if (isImage) {
      args.push('-loop', '1', '-t', String(Math.max(0.05, segDur)), '-i', seg.file);
      // 图片没有时间轴，抽帧位置靠 -ss 无效 → 用 -vf 的 zoompan 起始帧即可（offset 影响小）
    } else {
      // ★ -ss 放在 -i 之前（输入端 seek，快且准到关键帧附近）；抽帧不要求帧精确
      args.push('-ss', Math.max(0, inSource).toFixed(3), '-i', seg.file);
    }
    // 抽单帧，走完整滤镜链（含裁剪/关键帧运镜/蒙版/调色）
    if (chain.fcHead) {
      // 透明度关键帧：垫黑底合成（与导出同一份 fc 定义）
      args.push('-filter_complex', chain.fcHead, '-map', `[${chain.vLabel}]`, '-frames:v', '1', '-q:v', '3', outPng);
    } else {
      args.push('-vf', chain.vf!, '-frames:v', '1', '-q:v', '3', outPng);
    }

    const r = await runCmd(ffmpeg, args, { timeoutMs: 60000, maxBuffer: 8 * 1024 * 1024 });
    if (!r.ok) {
      return { ok: false, error: `取帧失败：${(r.stderr || r.error || '').slice(-300)}`, segmentIndex: loc.segIndex + 1 };
    }
    let png: Buffer = await readFile(outPng);
    if (!png.length) return { ok: false, error: '取帧产物为空' };

    // 画中画：把生效中的叠加层合成到该帧上（与导出同一套 anchor/scale 口径）
    if (activeOverlays.length) {
      png = await compositeOverlaysOnFrame(ffmpeg, outPng, activeOverlays, W, input.timeSec, workDir);
      if (!png.length) return { ok: false, error: '画中画合成失败' };
    }

    frameCache.push({ key, png, at: Date.now() });
    if (frameCache.length > CACHE_MAX) {
      // FIFO 淘汰最旧的（按写入顺序，不看访问时间 —— 简单且够用）
      frameCache.splice(0, frameCache.length - CACHE_MAX);
    }
    return { ok: true, png, cached: false, segmentIndex: loc.segIndex + 1, offsetInSegment: loc.offsetInSeg };
  } catch (e: unknown) {
    return { ok: false, error: `取帧异常：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { await rm(workDir, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ }
  }
}

/** 清空帧缓存（工程切换/删段时调用，避免残留旧工程的帧）。 */
export function clearPreviewCache(): void {
  frameCache.length = 0;
}

/**
 * 把画中画叠加层合成到一张预览帧上（预览专用；导出走 buildRenderPlan 的 ②.5 步）。
 * ★ anchor/scale 与导出**同一份**取值（overlayAnchorOf + W*scale）—— 口径漂移 = 预览骗人。
 */
async function compositeOverlaysOnFrame(
  ffmpeg: string,
  basePng: string,
  overlays: Array<{ file: string; start: number; end: number; pos?: string; scale?: number }>,
  W: number,
  timelineSec: number,
  workDir: string,
): Promise<Buffer> {
  const outPng = path.join(workDir, 'frame-pip.png');
  const args: string[] = ['-y', '-v', 'error', '-i', basePng];
  const fc: string[] = [];
  let prev = '0:v';
  for (let k = 0; k < overlays.length; k++) {
    const ov = overlays[k];
    // 叠加素材内的相对位置：成片时间 - 叠加起点（clamp 到素材内）
    const rel = Math.max(0, timelineSec - ov.start);
    args.push('-ss', rel.toFixed(3), '-i', ov.file);
    const ovW = Math.max(16, Math.round(W * (ov.scale ?? 0.35)));
    const anchor = overlayAnchorOf(ov.pos);
    fc.push(`[${k + 1}:v]scale=${ovW}:-2,setsar=1[ov${k}]`);
    fc.push(`[${prev}][ov${k}]overlay=x='${anchor.x}':y='${anchor.y}'[v${k}]`);
    prev = `v${k}`;
  }
  args.push('-filter_complex', fc.join(';'), '-map', `[${prev}]`, '-frames:v', '1', '-q:v', '3', outPng);
  const r = await runCmd(ffmpeg, args, { timeoutMs: 60000, maxBuffer: 8 * 1024 * 1024 });
  if (!r.ok) return Buffer.alloc(0);
  try {
    return await readFile(outPng);
  } catch {
    return Buffer.alloc(0);
  }
}