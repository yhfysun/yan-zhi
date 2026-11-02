/**
 * 非 AI 光流补帧 · ffmpeg 实跑验证（2026-11-02）。
 *
 * ★ 为什么要有这一层：纯函数单测只证明滤镜串写对了，证明不了
 *   **ffmpeg 接受 minterpolate、产出的帧数/时长仍然对**。
 *   补帧最容易出的错不是报错，而是时长漂移或帧数不对（下游 concat / 字幕时间轴全歪）。
 *
 * ★ 本机没有 ffmpeg 时整组跳过；路径可用 YZ_FFMPEG_PATH 覆盖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan } from '../src/services/clip-render';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
const HAS_FFMPEG = fs.existsSync(FFMPEG) && fs.existsSync(FFPROBE);

function probe(file: string): { frames: number; duration: number } {
  const frames = Number(execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file,
  ]).toString().trim());
  const duration = Number(execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]).toString().trim());
  return { frames, duration };
}

describe.skipIf(!HAS_FFMPEG)('非 AI 补帧 · ffmpeg 实跑', () => {
  let tmp = '';
  let src = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-interp-e2e-'));
    src = path.join(tmp, 'src-10fps.mp4');
    // 10fps、2 秒、带运动的测试图 —— 补帧有真实中间帧可插
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function renderWith(interpolate: 'blend' | 'mci'): Promise<{ frames: number; duration: number }> {
    let p: ClipProject | null = null;
    for (const [op, args] of [
      ['add_clip', { clips: [{ file: src }] }],
      ['set_output', { size: '320x240', fps: 30, interpolate }],
    ] as Array<[string, Record<string, unknown>]>) {
      const r = applyClipOp(p, op, args);
      if (!r.ok) throw new Error(`[${op}] ${r.error}`);
      p = r.project;
    }
    const workDir = path.join(tmp, `work-${interpolate}`);
    const outFile = path.join(tmp, `out-${interpolate}.mp4`);
    fs.mkdirSync(workDir, { recursive: true });
    const r = buildRenderPlan({
      project: p!, durations: { [src]: 2 }, hasAudio: { [src]: false }, workDir, outFile, cover: false,
    });
    if (!r.ok) throw new Error(r.error);
    // 帧复制（off）与补帧产物都应是 30fps；实跑证明 minterpolate 不改变时长口径
    const run = await runRenderPlan(FFMPEG, r.plan.steps);
    if (!run.ok) throw new Error(`${run.failedLabel}: ${run.stderr}`);
    return probe(outFile);
  }

  it('mci：10fps 素材输出 30fps，时长仍约 2s、帧数约 60', async () => {
    const r = await renderWith('mci');
    expect(r.duration).toBeGreaterThan(1.8);
    expect(r.duration).toBeLessThan(2.3);
    expect(r.frames).toBeGreaterThanOrEqual(55);
    expect(r.frames).toBeLessThanOrEqual(65);
  }, 180000);

  it('blend：同样不漂移（快档也走 minterpolate 路径）', async () => {
    const r = await renderWith('blend');
    expect(r.duration).toBeGreaterThan(1.8);
    expect(r.duration).toBeLessThan(2.3);
    expect(r.frames).toBeGreaterThanOrEqual(55);
    expect(r.frames).toBeLessThanOrEqual(65);
  }, 180000);
});
