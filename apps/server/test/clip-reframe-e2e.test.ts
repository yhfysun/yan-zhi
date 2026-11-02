/**
 * 动态人脸跟随裁切 · ffmpeg 实跑验证（2026-11-02）。
 *
 * ★ 为什么要有这一层：
 *   纯函数单测只能证明表达式"生成了"，证明不了 **ffmpeg 接受 if/lerp/min/max 的嵌套、
 *   且 crop 的 t 确实是逐帧变化的段内时间**。表达式写错时 ffmpeg 往往直接报
 *   "No option name near ..." 或整段纹丝不动 —— 都必须真跑才能发现。
 *
 * ★ 做法：合成一段「白色方块左右移动」的 9:16 视频 → 把方块的已知位置当人脸输入
 *   buildFaceTrack → 生成 crop 表达式 → 整段渲染 → 在每个时间点抽帧，检查白色像素
 *   的重心仍在画面中央附近（±120px）。方块跑出裁剪窗口就会失败。
 *
 * ★ 本机没有 ffmpeg 时整组跳过；路径可用 YZ_FFMPEG_PATH 覆盖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSegmentFilters } from '../src/services/clip-render';
import type { ClipSegment } from '../src/services/clip-project';
import { buildFaceTrack } from '../src/services/clip-crop-track';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 取一帧的灰度原始像素，返回亮像素（方块）的重心 x；没有亮像素返回 -1。 */
function brightCentroidX(file: string, atSec: number, w: number, h: number): number {
  const buf = execFileSync(FFMPEG, [
    '-v', 'error', '-ss', String(atSec), '-i', file, '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
  ], { maxBuffer: 32 * 1024 * 1024 });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 200) {
      sum += i % w;
      n += 1;
    }
  }
  return n > 0 ? sum / n : -1;
}

describe.skipIf(!HAS_FFMPEG)('动态跟随裁切 · ffmpeg 实跑', () => {
  let tmp = '';
  let src = '';
  let out = '';
  const W = 720;
  const H = 1280;
  const BOX = 80;
  const T = 4;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-track-e2e-'));
    src = path.join(tmp, 'src.mp4');
    // 9:16 源（与输出同比例，缩放层是恒等变换 → 人脸相对坐标可直接对应画面坐标）
    // 方块 x 从 60 线性移动到 580（4s 内），y 固定在 600。
    // ★ 用 overlay 的 x 表达式做移动，不用 drawbox —— 实测本机 ffmpeg 6.1 里
    //   drawbox 的 x 表达式不认 t（画面全黑），overlay 认。
    execFileSync(FFMPEG, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=25:d=${T}`,
      '-f', 'lavfi', '-i', `color=c=white:s=${BOX}x${BOX}:r=25:d=${T}`,
      '-filter_complex', `[0:v][1:v]overlay=x='60+130*t':y=600`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
    ], { timeout: 120000 });

    // 把方块中心当成人脸中心（时间单位：源文件秒）
    const faces = Array.from({ length: 11 }, (_, i) => {
      const t = (i * T) / 10;
      const cx = 60 + 130 * t + BOX / 2;
      return { t, x: cx - 40, y: 600 + 20, w: 80, h: 80 };
    });
    const trackRes = buildFaceTrack(faces, W, H, T, { targetAspect: 9 / 16, zoom: 0.6, sampleCount: faces.length });
    expect(trackRes.track.length).toBeGreaterThanOrEqual(2);

    const seg: ClipSegment = {
      id: 'c1',
      file: src,
      crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, track: trackRes.track },
    };
    const vf = buildSegmentFilters({ seg, segDur: T, isImage: false, W, H, fps: 25 })
      .join(',');
    out = path.join(tmp, 'out.mp4');
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-i', src, '-vf', vf, '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
    ], { timeout: 120000 });
  }, 180000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('crop 表达式被 ffmpeg 接受，且裁切窗口跟随移动（方块始终在画面中央附近）', () => {
    for (const at of [0.5, 1.5, 2.5, 3.5]) {
      const cx = brightCentroidX(out, at, W, H);
      expect(cx, `t=${at}s 找不到白色方块（可能被裁出画面）`).toBeGreaterThan(0);
      // 窗口跟随时方块应保持居中；夹到画面边缘时最多偏 ~85px
      expect(Math.abs(cx - W / 2), `t=${at}s 方块偏离中心 ${Math.round(Math.abs(cx - W / 2))}px`).toBeLessThan(120);
    }
  });

  it('2 倍速：crop 的 t 是 setpts 之后的段内时间（轨迹仍对齐）', () => {
    const track = buildFaceTrack(
      Array.from({ length: 11 }, (_, i) => {
        const t = (i * T) / 10;
        const cx = 60 + 130 * t + BOX / 2;
        return { t, x: cx - 40, y: 620, w: 80, h: 80 };
      }),
      W, H, T, { targetAspect: 9 / 16, zoom: 0.6, sampleCount: 11 },
    ).track;
    const seg: ClipSegment = {
      id: 'c1', file: src, speed: 2,
      crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, track },
    };
    const vf = buildSegmentFilters({ seg, segDur: T / 2, isImage: false, W, H, fps: 25 }).join(',');
    const out2 = path.join(tmp, 'out-2x.mp4');
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-i', src, '-vf', vf, '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out2,
    ], { timeout: 120000 });
    // 输出 0.5s / 1.5s = 源 1.0s / 3.0s；方块若按源时间轴对齐就会偏出中心
    for (const at of [0.5, 1.5]) {
      const cx = brightCentroidX(out2, at, W, H);
      expect(cx, `2x t=${at}s 找不到白色方块`).toBeGreaterThan(0);
      expect(Math.abs(cx - W / 2), `2x t=${at}s 方块偏离中心 ${Math.round(Math.abs(cx - W / 2))}px`).toBeLessThan(120);
    }
  });
});
