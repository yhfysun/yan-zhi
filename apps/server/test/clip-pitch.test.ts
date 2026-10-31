/**
 * 升降调（P1-7）单测：归一化 / 音频滤镜链 / ffmpeg 实跑（440Hz 升八度到 880Hz）。
 *
 * ★ 实现：ffmpeg rubberband（变调不变速）——半音 n → 频率比 2^(n/12)。
 *   只改音高，时长/时间轴/视频完全不受影响。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan } from '../src/services/clip-render';

function run(base: ClipProject | null, ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur = base;
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`[${op}] ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

const baseProject = () => run(null, [
  ['create', { size: '320x568', fps: 30 }],
  ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
]);

function planOf(p: ClipProject, hasAudio = true) {
  const r = buildRenderPlan({
    project: p, durations: { 'C:/a.mp4': 3 }, hasAudio: { 'C:/a.mp4': hasAudio },
    workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
  });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe('P1-7 · 归一化', () => {
  it('半音钳制 -12~12；0 不写字段；update 传 0 清除', () => {
    const hi = run(baseProject(), [['update_clip', { index: 1, patch: { pitch: 99 } }]]);
    expect(hi.clips[0].pitch).toBe(12);
    const lo = run(baseProject(), [['update_clip', { index: 1, patch: { pitch: -99 } }]]);
    expect(lo.clips[0].pitch).toBe(-12);
    const zero = run(baseProject(), [['update_clip', { index: 1, patch: { pitch: 0 } }]]);
    expect(zero.clips[0].pitch).toBeUndefined();
    const cleared = run(hi, [['update_clip', { index: 1, patch: { pitch: 0 } }]]);
    expect(cleared.clips[0].pitch).toBeUndefined();
    // add_clip 也接受
    const added = run(null, [['add_clip', { clips: [{ file: 'C:/b.mp4', pitch: 7 }] }]]);
    expect(added.clips[0].pitch).toBe(7);
  });
});

describe('P1-7 · 音频滤镜链', () => {
  it('原声路径：-af 里出现 rubberband 与正确的频率比（+7 半音 ≈ 1.498307）', () => {
    const p = run(baseProject(), [['update_clip', { index: 1, patch: { pitch: 7 } }]]);
    const step = planOf(p).steps.find((s) => s.label.includes('加工第 1 段'))!;
    const s = step.args.join(' ');
    expect(s).toContain('rubberband=pitch=1.498307');
  });

  it('配音路径：filter_complex 里也带 rubberband；pitch=0 时全链不出现', () => {
    const withAudioFile = run(baseProject(), [['update_clip', { index: 1, patch: { audioFile: 'C:/v.mp3', pitch: -12 } }]]);
    const s1 = planOf(withAudioFile).steps.find((x) => x.label.includes('加工第 1 段'))!.args.join(' ');
    expect(s1).toContain('rubberband=pitch=0.500000');

    const plain = run(baseProject(), [['update_clip', { index: 1, patch: { volume: 0.5 } }]]);
    const s2 = planOf(plain).steps.find((x) => x.label.includes('加工第 1 段'))!.args.join(' ');
    expect(s2).not.toContain('rubberband');
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 取某频段能量（dB）：bandpass + astats 的 RMS_level。 */
function bandDb(file: string, freq: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'info', '-i', file, '-af', `bandpass=f=${freq}:width_type=h:w=40,astats=metadata=1:reset=0`,
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  // astats 的统计行走 stderr（info 级）
  const out = `${r.stderr || ''}\n${r.stdout || ''}`;
  const m = /RMS level dB:\s*(-?(?:inf|[\d.]+))/.exec(out);
  if (!m) throw new Error(`没取到频谱能量：${out.slice(-300)}`);
  return m[1] === '-inf' ? -120 : Number(m[1]);
}

describe.skipIf(!HAS_FFMPEG)('P1-7 · ffmpeg 实跑', () => {
  it('440Hz 正弦 +12 半音 → 能量转到 880Hz；时长不变', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-pitch-e2e-'));
    try {
      const base = path.join(tmp, 'sine.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
        '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=1:r=30',
        '-map', '1:v', '-map', '0:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', base]);

      let p: ClipProject | null = null;
      for (const [op, args] of [
        ['create', { size: '320x568', fps: 30 }],
        ['add_clip', { clips: [{ file: base, pitch: 12 }] }],
      ] as Array<[string, Record<string, unknown>]>) {
        const r = applyClipOp(p, op, args);
        if (!r.ok) throw new Error(r.error);
        p = r.project;
      }
      const workDir = path.join(tmp, 'w');
      const outFile = path.join(tmp, 'out.mp4');
      fs.mkdirSync(workDir, { recursive: true });
      const plan = buildRenderPlan({ project: p!, durations: { [base]: 1 }, hasAudio: { [base]: true }, workDir, outFile, cover: false });
      if (!plan.ok) throw new Error(plan.error);
      for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
      const r = await runRenderPlan(FFMPEG, plan.plan.steps);
      if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);

      const db880 = bandDb(outFile, 880);
      const db440 = bandDb(outFile, 440);
      expect(db880).toBeGreaterThan(db440 + 10);   // 主能量已转到 880

      // 时长不变（rubberband 变调不变速）—— ffmpeg 没有 -show_entries，解析 Duration 行
      const probe = spawnSync(FFMPEG, ['-v', 'info', '-i', outFile, '-f', 'null', '-'], { encoding: 'utf8' });
      const dm = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(probe.stderr || '');
      const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0;
      expect(dur).toBeGreaterThan(0.8);
      expect(dur).toBeLessThan(1.3);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
