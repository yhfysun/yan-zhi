/**
 * 定时音频层 · ffmpeg 实跑验证（P0-7）。
 *
 * ★ 这层不可省：纯函数只能证明滤镜串长这样，证明不了
 *   ① adelay 真把声音放到了指定时间点；② 两段音频在交界处不断档；③ 音效窗口之外仍然是静音。
 *   这三件事写错了 ffmpeg 都不报错（只是"听着不对"）。
 *
 * ★ 本机没有 ffmpeg 时整组跳过；路径可用 YZ_FFMPEG_PATH 覆盖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan } from '../src/services/clip-render';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 成片某窗口的平均音量（dB；静音约 -91）。 */
function meanVolume(file: string, ss: number, dur: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'info', '-ss', ss.toFixed(3), '-t', dur.toFixed(3), '-i', file,
    '-vn', '-af', 'volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || '');
  if (!m) throw new Error(`没取到音量：${(r.stderr || '').slice(-300)}`);
  return Number(m[1]);
}

describe.skipIf(!HAS_FFMPEG)('定时音频层 · ffmpeg 实跑', () => {
  let tmp = '';
  let base = '';
  let tone = '';
  let bgm = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-audio-e2e-'));
    base = path.join(tmp, 'base.mp4');
    tone = path.join(tmp, 'tone.m4a');
    bgm = path.join(tmp, 'bgm.m4a');
    // 主轨：5 秒纯黑 + 静音音轨（窗口内外的音量差就是"有没有声音"的唯一判据）
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=5:r=30',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', base,
    ]);
    // 音效素材：0.6 秒 440Hz（够短，放进 0.6 秒的窗口正好铺满）
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6:sample_rate=48000',
      '-af', 'volume=0.9', '-c:a', 'aac', '-b:a', '192k', tone,
    ]);
    // BGM 素材：3 秒（拼接测试的两段各取 1.5 秒，交界两侧都还有素材可用）
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000',
      '-af', 'volume=0.9', '-c:a', 'aac', '-b:a', '192k', bgm,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function render(name: string, audios: Array<Record<string, unknown>>): Promise<string> {
    let p: ClipProject | null = null;
    const ops: Array<[string, Record<string, unknown>]> = [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: base }] }],
      ['add_audio', { audios }],
    ];
    for (const [op, args] of ops) {
      const r = applyClipOp(p, op, args);
      if (!r.ok) throw new Error(`[${op}] ${r.error}`);
      p = r.project;
    }
    const workDir = path.join(tmp, `work-${name}`);
    const outFile = path.join(tmp, `${name}.mp4`);
    fs.mkdirSync(workDir, { recursive: true });
    const plan = buildRenderPlan({
      project: p!, durations: { [base]: 5 }, hasAudio: { [base]: true },
      workDir, outFile, cover: false,
    });
    if (!plan.ok) throw new Error(plan.error);
    const run = await runRenderPlan(FFMPEG, plan.plan.steps);
    if (!run.ok) throw new Error(`${run.failedLabel}: ${run.stderr}`);
    return outFile;
  }

  it('转场音效落在指定时间点：窗口内有声、前后都是静音', async () => {
    const out = await render('sfx', [{ file: tone, start: 1.5, end: 2.1, volume: 0.9 }]);
    const before = meanVolume(out, 0.3, 0.6);
    const during = meanVolume(out, 1.7, 0.3);
    const after = meanVolume(out, 2.5, 0.6);
    expect(during).toBeGreaterThan(-40);
    expect(before).toBeLessThan(during - 25);
    expect(after).toBeLessThan(during - 25);
  }, 120000);

  it('两段 BGM 首尾相接：交界处不断档（无缝）', async () => {
    // 同一段素材，前一段 [0,1.5]、后一段 [1.5,3.0] —— 交界正好落在 1.5 秒
    const out = await render('seam', [
      { file: bgm, start: 0, end: 1.5, volume: 0.9 },
      { file: bgm, start: 1.5, end: 3.0, volume: 0.9 },
    ]);
    const left = meanVolume(out, 1.2, 0.25);
    const seam = meanVolume(out, 1.3, 0.4);   // 跨交界
    const right = meanVolume(out, 1.8, 0.25);
    expect(seam).toBeGreaterThan(-40);
    // 交界窗口不比两侧明显低（不断档）；允许 6dB 余量吸收正弦过零与编码抖动
    expect(seam).toBeGreaterThan(Math.min(left, right) - 6);
  }, 120000);
});
