/**
 * 剪辑真机验收 · 自动验收（2026-11-02）
 *
 * 目标：把「能 headless 验的」一次性跑真（不启 HTTP / Electron / vite，不动用户数据）。
 * 每个用例独立 temp 目录并清理；ffmpeg 用随包/本机已解析的那份真实出片/抽帧。
 *
 * 覆盖：
 *   ① 字幕动画 11 种：buildAss → ASS 文本 → ffmpeg subtitles 烧到 1s 纯色视频 → 抽帧；
 *   ② 补帧：10fps/2s 素材 → buildSegmentFilters(interpolate=mci) → 30fps 段；off 分支无 minterpolate；
 *   ③ 美颜：smooth=0 vs 1 同帧高频能量对比；缺省滤镜串不含 boxblur；
 *   ④ 多机位：合成 B 前置 1.2s 静音的素材 → syncAudioFiles ≈1.2 → plan/build 6s 组 → 原地重建时长不变；
 *   ⑤ 智能竖屏：无脸回退中心 + warning；多脸中位 + 9:16 窗口 + 边界夹取；人脸轨迹首尾覆盖/单调；
 *   ⑥ 音效匹配：搜「紧张」首选 heartbeat；「量子纠缠」matched=false；
 *   ⑦ 智能抠像（真实 u2netp 模型，模型缺失整组 skip）：蒙版 → 绿背景合成 → 角落变绿/主体保留/音轨保留。
 *
 * ★ 找不到 ffmpeg / 模型时如实 skip，绝不伪造通过。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolveFfmpeg } from '../src/mcp/ffmpeg-runtime';
import { buildAss, SUBTITLE_ANIMATION_PRESETS } from '../src/mcp/subtitle-style';
import { buildSegmentFilters, buildBeautyFilters } from '../src/services/clip-render';
import { createEmptyProject, type ClipSegment } from '../src/services/clip-project';
import { syncAudioFiles } from '../src/services/clip-audio-sync';
import {
  planMulticamCuts, buildMulticamSegments, rebuildMulticamGroup, makeMulticamGroup,
} from '../src/services/clip-multicam';
import { computeFaceCenteredCrop } from '../src/services/clip-reframe';
import { buildFaceTrack, trackToCropExpr } from '../src/services/clip-crop-track';
import { searchSfxLibrary } from '../src/services/sfx-library';
import { generatePortraitMatte } from '../src/services/clip-matte';
import { composeMatteWithMask } from '../src/services/clip-matte-render';
// 抠像走 @yan-zhi/core 的 runPythonScript → 需要平台适配器（正式入口在 src/index.ts 里 set）。
// 测试进程不启服务，这里显式装配服务端的 nodeAdapter；DATA_DIR 已由全局 setup 隔离到临时目录。
import { setPlatformAdapter } from '@yan-zhi/core';
import { nodeAdapter } from '../src/node-adapter';

// ── 环境探测（沿用仓库既有写法：YZ_FFMPEG_PATH > 数据目录/ffmpeg） ──
const ENV_FFMPEG = process.env.YZ_FFMPEG_PATH;
const DATA_FFMPEG = path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
let ffmpegBin = ENV_FFMPEG || DATA_FFMPEG;
let ffprobeBin = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
const HAS_FFMPEG = fs.existsSync(ffmpegBin);
const MATTE_MODEL = process.env.YZ_MATTE_MODEL
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'matte', 'u2netp.onnx');
const HAS_MODEL = fs.existsSync(MATTE_MODEL);

const W = 320;
const H = 240;

// 环境摘要（即使某些 describe 被 skip 也会打印，便于写验收文档）
console.log(`[验收环境] ffmpeg=${ffmpegBin} exists=${HAS_FFMPEG}`);
console.log(`[验收环境] matteModel=${MATTE_MODEL} exists=${HAS_MODEL}`);
console.log(`[验收环境] 字幕预设 ${SUBTITLE_ANIMATION_PRESETS.length} 种：${SUBTITLE_ANIMATION_PRESETS.map((p) => p.id).join(',')}`);

function runFfmpeg(args: string[], timeoutMs = 120000): void {
  execFileSync(ffmpegBin, args, { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
}

function probe(file: string): { duration: number; fps: number; hasAudio: boolean } {
  const out = execFileSync(ffprobeBin, [
    '-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate',
    '-show_entries', 'format=duration', '-of', 'json', file,
  ], { maxBuffer: 8 * 1024 * 1024 }).toString();
  const j = JSON.parse(out) as {
    streams?: Array<{ codec_type?: string; r_frame_rate?: string }>;
    format?: { duration?: string };
  };
  const streams = j.streams || [];
  let fps = 0;
  for (const s of streams) {
    if (s.codec_type === 'video' && s.r_frame_rate) {
      const [a, b] = s.r_frame_rate.split('/').map(Number);
      if (b) fps = a / b;
      break;
    }
  }
  return {
    duration: Number(j.format?.duration) || 0,
    fps,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

function countFrames(file: string): number {
  return Number(execFileSync(ffprobeBin, [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file,
  ]).toString().trim());
}

/** 抽一帧灰度原始像素（w×h）。 */
function grayFrame(file: string, atSec: number): Buffer {
  return execFileSync(ffmpegBin, [
    '-v', 'error', '-ss', String(atSec), '-i', file, '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
  ], { maxBuffer: 32 * 1024 * 1024 }) as Buffer;
}

/** 抽一帧 RGB 的 4x4 区域均值（避开 yuv420p 奇数裁切）。 */
function pixelAt(file: string, x: number, y: number, atSec = 1): [number, number, number] {
  const buf = execFileSync(ffmpegBin, [
    '-v', 'error', '-ss', String(atSec), '-i', file, '-frames:v', '1',
    '-vf', `crop=4:4:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 8 * 1024 * 1024 }) as Buffer;
  return [buf[0], buf[1], buf[2]];
}

/** 水平相邻像素差的平均绝对值 —— 高频能量（越大越“锐”）。 */
function highFreq(buf: Buffer, w: number, h: number): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w; x++) {
      sum += Math.abs(buf[row + x] - buf[row + x - 1]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function assFilterPath(file: string): string {
  // filtergraph 里 Windows 盘符的冒号必须转义；路径统一正斜杠。
  return file.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function hasBoxblur(filters: string[]): boolean {
  return filters.join(',').includes('boxblur');
}

// ════════════════════════════════════════════════════════════════════════════
// ① 字幕动画 11 种
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!HAS_FFMPEG)('字幕动画 11 种 · buildAss + ffmpeg 烧录', () => {
  let tmp = '';
  const results: Array<{ id: string; duration: number; bytes: number; md5: string }> = [];

  beforeAll(async () => {
    const r = await resolveFfmpeg();
    if (r.ok) { ffmpegBin = r.ffmpeg; ffprobeBin = r.ffprobe; }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-acc-sub-'));
  }, 60000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('11 个预设逐个生成 ASS → 烧到 1s 视频 → 时长/抽帧有效', () => {
    const ids = SUBTITLE_ANIMATION_PRESETS.map((p) => p.id);
    expect(ids).toHaveLength(11);

    for (const preset of ids) {
      const built = buildAss(
        [{ start: 0, end: 1, text: '验收字幕 ABC' }],
        {
          preset,
          playResX: W,
          playResY: H,
          fontSizePx: 28,
          primaryColor: '&H00FFFFFF&',
          outlineColor: '&H00000000&',
          outlinePx: 2,
          alignment: 2,
          marginVPx: 16,
        },
      );
      expect(built.ok, `buildAss(${preset}) 应成功`).toBe(true);
      if (!built.ok) continue;

      const assFile = path.join(tmp, `${preset}.ass`);
      fs.writeFileSync(assFile, built.ass, 'utf8');

      const outFile = path.join(tmp, `${preset}.mp4`);
      runFfmpeg([
        '-y', '-v', 'error',
        '-f', 'lavfi', '-i', `color=c=blue:s=${W}x${H}:d=1:r=30`,
        '-vf', `subtitles='${assFilterPath(assFile)}'`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outFile,
      ]);

      expect(fs.existsSync(outFile), `${preset} 产物应存在`).toBe(true);
      const meta = probe(outFile);
      expect(meta.duration, `${preset} 时长应≈1s`).toBeGreaterThan(0.75);
      expect(meta.duration, `${preset} 时长应≈1s`).toBeLessThan(1.3);

      const frame = grayFrame(outFile, 0.15);
      expect(frame.length, `${preset} 抽帧应为 ${W}x${H}`).toBe(W * H);
      const md5 = crypto.createHash('md5').update(frame).digest('hex');
      results.push({ id: preset, duration: meta.duration, bytes: frame.length, md5 });
      console.log(`[字幕] ${preset.padEnd(10)} events=${built.events} dur=${meta.duration.toFixed(3)}s frame=${frame.length}B md5=${md5.slice(0, 8)}`);
    }

    const distinct = new Set(results.map((r) => r.md5)).size;
    console.log(`[字幕] 11 个预设 0.15s 帧 md5 去重数=${distinct}/11`);
    // 不同动画在入场帧上至少应有两种不同画面（不做“11 种全不同”的过强断言：
    // fade/pop 等在同一时刻可能都已定格为同一终态）。
    expect(distinct).toBeGreaterThanOrEqual(2);
  }, 180000);
});

// ════════════════════════════════════════════════════════════════════════════
// ② 补帧（非 AI 光流）
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!HAS_FFMPEG)('补帧 · buildSegmentFilters interpolate=mci', () => {
  let tmp = '';
  let src = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-acc-interp-'));
    src = path.join(tmp, 'src-10fps.mp4');
    runFfmpeg([
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('off 分支滤镜串无 minterpolate；mci 分支含 minterpolate', () => {
    const base = { seg: { id: 'c1', file: src } as ClipSegment, segDur: 2, isImage: false, W, H, fps: 30 };
    const off = buildSegmentFilters({ ...base, interpolate: 'off' });
    const mci = buildSegmentFilters({ ...base, interpolate: 'mci' });
    console.log(`[补帧] off=${off.join(',')}`);
    console.log(`[补帧] mci=${mci.join(',')}`);
    expect(off.join(',')).not.toContain('minterpolate');
    expect(off.join(',')).toContain('fps=30');
    expect(mci.join(',')).toContain('minterpolate=fps=30:mi_mode=mci');
    expect(mci.join(',')).toContain('mc_mode=aobmc');
  });

  it('mci 实跑：10fps 素材 → 30fps、时长≈2s、帧数≈60', () => {
    const filters = buildSegmentFilters({
      seg: { id: 'c1', file: src } as ClipSegment,
      segDur: 2, isImage: false, W, H, fps: 30, interpolate: 'mci',
    });
    const out = path.join(tmp, 'out-mci.mp4');
    runFfmpeg([
      '-y', '-v', 'error', '-i', src,
      '-vf', filters.join(','), '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
    ], 180000);
    const meta = probe(out);
    const frames = countFrames(out);
    console.log(`[补帧] mci 产物 fps=${meta.fps} dur=${meta.duration.toFixed(3)}s frames=${frames}`);
    expect(meta.fps).toBeCloseTo(30, 0);
    expect(meta.duration).toBeGreaterThan(1.7);
    expect(meta.duration).toBeLessThan(2.3);
    expect(frames).toBeGreaterThanOrEqual(55);
    expect(frames).toBeLessThanOrEqual(65);
  }, 180000);
});

// ════════════════════════════════════════════════════════════════════════════
// ③ 美颜（非 AI，全画面柔肤）
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!HAS_FFMPEG)('美颜 · smooth 柔化生效', () => {
  let tmp = '';
  let src = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-acc-beauty-'));
    src = path.join(tmp, 'src-hf.mp4');
    runFfmpeg([
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=30:d=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('缺省滤镜串不含 boxblur；smooth=1 含 boxblur', () => {
    const base = { segDur: 2, isImage: false, W, H, fps: 30 };
    const plain = buildSegmentFilters({ ...base, seg: { id: 'c1', file: src } as ClipSegment });
    const smooth = buildSegmentFilters({
      ...base,
      seg: { id: 'c1', file: src, beauty: { smooth: 1 } } as ClipSegment,
    });
    expect(hasBoxblur(plain)).toBe(false);
    expect(hasBoxblur(smooth)).toBe(true);
    console.log(`[美颜] plain boxblur=${hasBoxblur(plain)} smooth boxblur=${hasBoxblur(smooth)}`);
    expect(buildBeautyFilters(undefined)).toEqual([]);
  });

  it('smooth=1 同帧高频能量显著低于 smooth=0', () => {
    const base = { segDur: 2, isImage: false, W, H, fps: 30 };
    const plainFilters = buildSegmentFilters({ ...base, seg: { id: 'c1', file: src } as ClipSegment });
    const smoothFilters = buildSegmentFilters({
      ...base,
      seg: { id: 'c1', file: src, beauty: { smooth: 1 } } as ClipSegment,
    });

    const render1 = (filters: string[], name: string): string => {
      const out = path.join(tmp, name);
      runFfmpeg([
        '-y', '-v', 'error', '-ss', '1', '-i', src,
        '-vf', filters.join(','), '-frames:v', '1',
        '-f', 'rawvideo', '-pix_fmt', 'gray', out,
      ]);
      return out;
    };
    const rawPlain = render1(plainFilters, 'plain.gray');
    const rawSmooth = render1(smoothFilters, 'smooth.gray');
    const hfPlain = highFreq(fs.readFileSync(rawPlain), W, H);
    const hfSmooth = highFreq(fs.readFileSync(rawSmooth), W, H);
    console.log(`[美颜] 高频能量 plain=${hfPlain.toFixed(3)} smooth=${hfSmooth.toFixed(3)} 比值=${(hfSmooth / hfPlain).toFixed(3)}`);
    expect(hfPlain).toBeGreaterThan(1);
    expect(hfSmooth).toBeLessThan(hfPlain * 0.85);
  }, 120000);
});

// ════════════════════════════════════════════════════════════════════════════
// ④ 多机位：对齐 + 编排 + 原地重建
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!HAS_FFMPEG)('多机位 · 对齐/编排/原地重建', () => {
  let tmp = '';
  let aMp4 = '';
  let bMp4 = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-acc-multicam-'));
    // A：三段 2s、不同频率 + 颤音（能量包络可区分）
    const segs: string[] = [];
    const specs: Array<[number, number]> = [[300, 1.7], [700, 4.3], [1200, 2.9]];
    specs.forEach(([freq, trem], i) => {
      const seg = path.join(tmp, `seg${i}.wav`);
      const expr = `0.5*sin(2*PI*${freq}*t)*(0.6+0.4*sin(2*PI*${trem}*t))`;
      runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=2:s=8000`, '-ar', '8000', '-ac', '1', seg]);
      segs.push(seg);
    });
    const aWav = path.join(tmp, 'a.wav');
    runFfmpeg([
      '-y', '-v', 'error', '-i', segs[0], '-i', segs[1], '-i', segs[2],
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]', '-ar', '8000', '-ac', '1', aWav,
    ]);
    const bWav = path.join(tmp, 'b.wav');
    runFfmpeg([
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono:d=1.2',
      '-i', aWav,
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[out]',
      '-map', '[out]', '-ar', '8000', '-ac', '1', bWav,
    ]);
    // 视频外壳：A 6s，B 7.2s（B 前置 1.2s“静音画面”）
    aMp4 = path.join(tmp, 'a.mp4');
    bMp4 = path.join(tmp, 'b.mp4');
    runFfmpeg([
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=6:r=10',
      '-i', aWav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', aMp4,
    ]);
    runFfmpeg([
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=7.2:r=10',
      '-i', bWav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', bMp4,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('syncAudioFiles：B 前置 1.2s 静音 → offset≈1.2（±0.25）', async () => {
    const r = await syncAudioFiles(aMp4, bMp4);
    expect(r.ok, r.error).toBe(true);
    const off = r.offsetSec ?? 0;
    console.log(`[多机位] sync offset=${off.toFixed(3)}s score=${(r.score ?? 0).toFixed(3)} confident=${r.confident}`);
    expect(Math.abs(off - 1.2)).toBeLessThanOrEqual(0.25);
  }, 120000);

  it('plan/build 生成 6s 组：区间连续、总长 6、trim 含头部偏移', () => {
    const planned = planMulticamCuts({
      angles: [
        { file: aMp4, offsetSec: 0, usableSec: 6 },
        { file: bMp4, offsetSec: 1.2, usableSec: 7.2 },
      ],
      switchEverySec: 3,
      durationSec: 6,
    });
    expect(planned.ok, planned.ok ? '' : planned.error).toBe(true);
    if (!planned.ok) return;

    const { cuts, groupDurationSec } = planned;
    console.log(`[多机位] cuts=${cuts.length} groupDur=${groupDurationSec}s ` +
      cuts.map((c) => `#${c.angleIndex}[${c.filmStart}-${c.filmEnd}]src[${c.srcStart}-${c.srcEnd}]`).join(' '));
    expect(groupDurationSec).toBeCloseTo(6, 3);
    expect(cuts[0].filmStart).toBeCloseTo(0, 6);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i].filmStart).toBeCloseTo(cuts[i - 1].filmEnd, 6);
    }
    expect(cuts[cuts.length - 1].filmEnd).toBeCloseTo(6, 3);
    // 机位 2 的源起点 = 头部 1.2 + 组内偏移 3
    expect(cuts[1].srcStart).toBeCloseTo(4.2, 3);
    expect(cuts[1].srcEnd).toBeCloseTo(7.2, 3);

    const built = buildMulticamSegments(createEmptyProject('acc'), cuts);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.segments.map((s) => s.trimStart)).toEqual([0, 4.2]);
    expect(built.segments.map((s) => s.trimEnd)).toEqual([3, 7.2]);
    expect(built.segments.map((s) => s.label)).toEqual(['机位1', '机位2']);
  });

  it('rebuildMulticamGroup：[1,0] 原地替换后组时长与 id 不变', () => {
    const planned = planMulticamCuts({
      angles: [
        { file: aMp4, offsetSec: 0, usableSec: 6 },
        { file: bMp4, offsetSec: 1.2, usableSec: 7.2 },
      ],
      switchEverySec: 3,
      durationSec: 6,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const built = buildMulticamSegments(createEmptyProject('acc'), planned.cuts);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const group = makeMulticamGroup(createEmptyProject('acc'), {
      files: [aMp4, bMp4],
      offsetsSec: [0, 1.2],
      headsSec: [0, 1.2],
      filmStart: 0,
      groupDurationSec: planned.groupDurationSec,
      slotSec: 3,
      cuts: planned.cuts,
      segments: built.segments,
    });
    const project = {
      ...createEmptyProject('acc'),
      clips: built.segments,
      multicamGroups: [group],
    };
    const totalOf = (clips: ClipSegment[]) => clips.reduce((s, c) => s + ((c.trimEnd ?? 0) - (c.trimStart ?? 0)), 0);
    const before = totalOf(project.clips);

    const rebuilt = rebuildMulticamGroup(project, group.id, [1, 0]);
    expect(rebuilt.ok, rebuilt.ok ? '' : rebuilt.error).toBe(true);
    if (!rebuilt.ok) return;
    const after = rebuilt.project.clips;
    console.log(`[多机位] rebuild ids=${after.map((c) => c.id).join(',')} files=${after.map((c) => path.basename(c.file)).join(',')} total=${totalOf(after).toFixed(3)}(was ${before.toFixed(3)})`);
    expect(after.map((c) => c.id)).toEqual(project.clips.map((c) => c.id));
    expect(totalOf(after)).toBeCloseTo(before, 3);
    expect(after.map((c) => path.basename(c.file))).toEqual(['b.mp4', 'a.mp4']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ⑤ 智能竖屏（纯函数）
// ════════════════════════════════════════════════════════════════════════════
describe('智能竖屏 · 静态裁切 + 人脸轨迹', () => {
  const FRAME_W = 1920;
  const FRAME_H = 1080;

  it('无脸 → 中心窗口 + warning，窗口比例 9:16', () => {
    const r = computeFaceCenteredCrop({ frameW: FRAME_W, frameH: FRAME_H, faces: [], targetAspect: 9 / 16 });
    const pxW = r.crop.w * FRAME_W;
    const pxH = r.crop.h * FRAME_H;
    console.log(`[竖屏] 无脸 crop=${JSON.stringify(r.crop)} px=${pxW.toFixed(1)}x${pxH.toFixed(1)} aspect=${(pxW / pxH).toFixed(4)} warning=${r.warning}`);
    expect(r.warning || '').toContain('未检测到人脸');
    expect(pxW / pxH).toBeCloseTo(9 / 16, 2);
    expect(r.crop.x + r.crop.w / 2).toBeCloseTo(0.5, 2);
    expect(r.crop.y + r.crop.h / 2).toBeCloseTo(0.5, 2);
  });

  it('多脸 → 中位中心；边界脸 → 窗口夹在画面内', () => {
    const faces = [
      { x: 1200, y: 300, w: 200, h: 200 },
      { x: 1400, y: 350, w: 180, h: 180 },
    ];
    const r = computeFaceCenteredCrop({ frameW: FRAME_W, frameH: FRAME_H, faces, targetAspect: 9 / 16 });
    const cx = (r.crop.x + r.crop.w / 2) * FRAME_W;
    console.log(`[竖屏] 多脸 crop=${JSON.stringify(r.crop)} centerX=${cx.toFixed(1)} (期望中位≈1390)`);
    expect(Math.abs(cx - 1390)).toBeLessThanOrEqual(30);

    const edge = computeFaceCenteredCrop({
      frameW: FRAME_W, frameH: FRAME_H,
      faces: [{ x: 1800, y: 900, w: 140, h: 140 }],
      targetAspect: 9 / 16,
    });
    console.log(`[竖屏] 边界 crop=${JSON.stringify(edge.crop)}`);
    expect(edge.crop.x).toBeGreaterThanOrEqual(0);
    expect(edge.crop.y).toBeGreaterThanOrEqual(0);
    expect(edge.crop.x + edge.crop.w).toBeLessThanOrEqual(1.0001);
    expect(edge.crop.y + edge.crop.h).toBeLessThanOrEqual(1.0001);
  });

  it('buildFaceTrack/trackToCropExpr：t 单调、首尾覆盖、表达式可生成', () => {
    const fw = 720;
    const fh = 1280;
    const faces = [
      { t: 0, x: 100, y: 500, w: 120, h: 120 },
      { t: 1, x: 180, y: 510, w: 120, h: 120 },
      { t: 2, x: 260, y: 520, w: 120, h: 120 },
      { t: 3, x: 340, y: 530, w: 120, h: 120 },
      { t: 4, x: 420, y: 540, w: 120, h: 120 },
    ];
    const r = buildFaceTrack(faces, fw, fh, 4, { targetAspect: 9 / 16, sampleCount: 5 });
    console.log(`[竖屏] track points=${r.track.length} t=[${r.track.map((p) => p.t.toFixed(3)).join(',')}] confidence=${r.confidence}`);
    expect(r.track.length).toBeGreaterThanOrEqual(2);
    expect(r.track[0].t).toBe(0);
    expect(r.track[r.track.length - 1].t).toBe(1);
    for (let i = 1; i < r.track.length; i++) {
      expect(r.track[i].t).toBeGreaterThanOrEqual(r.track[i - 1].t);
    }
    const expr = trackToCropExpr(r.track, { w: 0.5625, h: 1, dur: 4 });
    expect(expr).not.toBeNull();
    if (!expr) return;
    console.log(`[竖屏] expr.x=${expr.x.slice(0, 90)}...`);
    expect(expr.x).toContain('lerp(');
    expect(expr.x).toContain('if(lt(');
    expect(expr.x).toContain('iw');
    expect(expr.x).toContain('ow');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ⑥ 音效匹配
// ════════════════════════════════════════════════════════════════════════════
describe('音效匹配 · 按描述搜索', () => {
  it('「紧张」首选 heartbeat；「量子纠缠」matched=false', () => {
    const hit = searchSfxLibrary('紧张', 5);
    console.log(`[音效] 紧张 matched=${hit.matched} top=${hit.hits[0]?.item.id} score=${hit.hits[0]?.score}`);
    expect(hit.matched).toBe(true);
    expect(hit.hits[0].item.id).toBe('heartbeat');

    const miss = searchSfxLibrary('量子纠缠', 5);
    console.log(`[音效] 量子纠缠 matched=${miss.matched} hits=${miss.hits.length}`);
    expect(miss.matched).toBe(false);
    expect(miss.hits).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ⑦ 智能抠像（真实 u2netp 模型）
// ════════════════════════════════════════════════════════════════════════════
describe.skipIf(!HAS_FFMPEG || !HAS_MODEL)('智能抠像 · 真实模型（u2netp）', () => {
  let tmp = '';
  let source = '';
  let mask = '';
  let out = '';
  let prevModel: string | undefined;
  let runtime: { width: number; height: number; model?: string } | null = null;

  beforeAll(async () => {
    // 测试进程没有应用入口，显式装配平台适配器（只影响本测试文件进程，DATA_DIR 已隔离）
    setPlatformAdapter(nodeAdapter);
    prevModel = process.env.YZ_MATTE_MODEL;
    process.env.YZ_MATTE_MODEL = MATTE_MODEL;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-acc-matte-'));
    source = path.join(tmp, 'source.mp4');
    // 黑底 + 居中白色矩形（主体）+ 440Hz 音轨
    runFfmpeg([
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=2:r=10`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-vf', 'drawbox=x=80:y=40:w=160:h=160:color=white:t=fill',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source,
    ]);
    mask = path.join(tmp, 'mask.mp4');
    const gen = await generatePortraitMatte({ file: source, outPath: mask, fps: 10 });
    expect(gen.ok, `generatePortraitMatte 失败：${gen.error || ''}\n${gen.hint || ''}`).toBe(true);
    runtime = { width: gen.width || W, height: gen.height || H, model: gen.model };
    console.log(`[抠像] mask=${path.basename(mask)} ${gen.width}x${gen.height}@${gen.fps}fps frames=${gen.frames} model=${gen.model}`);
  }, 300000);

  afterAll(() => {
    if (prevModel === undefined) delete process.env.YZ_MATTE_MODEL;
    else process.env.YZ_MATTE_MODEL = prevModel;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('生成蒙版 → 绿背景合成：角落变绿、主体保留、音轨与时长正确', async () => {
    expect(runtime).not.toBeNull();
    if (!runtime) return;
    out = path.join(tmp, 'out-green.mp4');
    const r = await composeMatteWithMask({
      ffmpeg: ffmpegBin,
      sourceFile: source,
      maskFile: mask,
      outFile: out,
      width: runtime.width,
      height: runtime.height,
      fps: 10,
      background: 'green',
      feather: 0,
    });
    expect(r.ok, r.error).toBe(true);
    expect(fs.existsSync(out)).toBe(true);

    const corner = pixelAt(out, 10, 10);
    const subject = pixelAt(out, 160, 120);
    const meta = probe(out);
    console.log(`[抠像] corner rgb=${corner.join(',')} subject rgb=${subject.join(',')} dur=${meta.duration.toFixed(3)}s hasAudio=${meta.hasAudio}`);

    // 角落：绿通道高、红蓝低
    expect(corner[1]).toBeGreaterThan(100);
    expect(corner[0]).toBeLessThan(90);
    expect(corner[2]).toBeLessThan(90);
    // 主体：白矩形被保留（三通道都高）
    expect(subject[0]).toBeGreaterThan(150);
    expect(subject[1]).toBeGreaterThan(150);
    expect(subject[2]).toBeGreaterThan(150);
    // 音轨与时长
    expect(meta.hasAudio).toBe(true);
    expect(meta.duration).toBeGreaterThan(1.7);
    expect(meta.duration).toBeLessThan(2.3);
  }, 180000);
});
