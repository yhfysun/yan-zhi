/**
 * 3D LUT 调色（P1-5）单测：归一化 / 渲染计划 / ffmpeg 实跑。
 *
 * ★ 关键不变量：
 *   ① 只收 .cube（其它扩展名 lut3d 读不了，报错点在渲染）；
 *   ② 强度 <1 = 原片与 LUT 结果混合（lut3d 没有强度参数）；
 *   ③ 身份 LUT 出片与原片一致；反相 LUT 明显改变画面（实跑核验）。
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

function planOf(p: ClipProject) {
  const r = buildRenderPlan({
    project: p, durations: { 'C:/a.mp4': 3 }, hasAudio: { 'C:/a.mp4': false },
    workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
  });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

const segStepOf = (p: ClipProject) => planOf(p).steps.find((s) => s.label.includes('加工第 1 段'))!;

describe('P1-5 · 归一化', () => {
  it('只收 .cube；强度钳制 0~1，等于 1 时不写字段', () => {
    const ok = run(baseProject(), [['update_clip', { index: 1, patch: { lut: { file: 'C:/fx/look.CUBE', strength: 0.5 } } }]]);
    expect(ok.clips[0].lut).toEqual({ file: 'C:/fx/look.CUBE', strength: 0.5 });
    const full = run(baseProject(), [['update_clip', { index: 1, patch: { lut: { file: 'C:/fx/look.cube', strength: 9 } } }]]);
    expect(full.clips[0].lut).toEqual({ file: 'C:/fx/look.cube' });
    const bad = run(baseProject(), [['update_clip', { index: 1, patch: { lut: { file: 'C:/fx/look.txt' } } }]]);
    expect(bad.clips[0].lut).toBeUndefined();
    // 空对象清除（update 传 {} 时 normalizeLut 返回 null）
    const cleared = run(ok, [['update_clip', { index: 1, patch: { lut: {} } }]]);
    expect(cleared.clips[0].lut).toBeUndefined();
  });
});

describe('P1-5 · 渲染计划', () => {
  it('强度 1：直接 lut3d（路径转义）', () => {
    const p = run(baseProject(), [['update_clip', { index: 1, patch: { lut: { file: 'C:/fx/look.cube' } } }]]);
    const s = segStepOf(p).args.join(' ');
    expect(s).toContain("lut3d=file='C\\:/fx/look.cube'");
    expect(s).not.toContain('all_opacity');
  });

  it('强度 0.5：原片与 LUT 结果按比例混合', () => {
    const p = run(baseProject(), [['update_clip', { index: 1, patch: { lut: { file: 'C:/fx/look.cube', strength: 0.5 } } }]]);
    const s = segStepOf(p).args.join(' ');
    expect(s).toContain("lut3d=file='C\\:/fx/look.cube'");
    expect(s).toContain('blend=all_mode=normal:all_opacity=0.500');
  });

  it('没有 LUT 的工程计划不含 lut3d（老工程不变）', () => {
    expect(segStepOf(baseProject()).args.join(' ')).not.toContain('lut3d');
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

const IDENTITY_CUBE = `LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;
const INVERT_CUBE = `LUT_3D_SIZE 2
1 1 1
0 1 1
1 0 1
0 0 1
1 1 0
0 1 0
1 0 0
0 0 0
`;

function diffAt(a: string, b: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', a, '-ss', at.toFixed(3), '-i', b, '-frames:v', '1',
    '-filter_complex', '[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:file=-',
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.eE+-]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到差异：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

async function renderLut(outDir: string, lut: Record<string, unknown> | null, base: string): Promise<string> {
  const p = run(null, [
    ['create', { size: '320x568', fps: 30 }],
    ['add_clip', { clips: [{ file: base, ...(lut ? { lut } : {}) }] }],
  ]);
  const workDir = path.join(outDir, 'work');
  const outFile = path.join(outDir, 'out.mp4');
  fs.mkdirSync(workDir, { recursive: true });
  const plan = buildRenderPlan({ project: p, durations: { [base]: 2 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
  if (!plan.ok) throw new Error(plan.error);
  for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
  const r = await runRenderPlan(FFMPEG, plan.plan.steps);
  if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
  return outFile;
}

describe.skipIf(!HAS_FFMPEG)('P1-5 · ffmpeg 实跑', () => {
  it('身份 LUT 与原片一致；反相 LUT 明显改变；强度 0.5 介于两者之间', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-lut-e2e-'));
    try {
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=2:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
      const idCube = path.join(tmp, 'id.cube');
      const invCube = path.join(tmp, 'inv.cube');
      fs.writeFileSync(idCube, IDENTITY_CUBE, 'utf8');
      fs.writeFileSync(invCube, INVERT_CUBE, 'utf8');

      const plain = await renderLut(path.join(tmp, 'plain'), null, base);
      const ident = await renderLut(path.join(tmp, 'id'), { file: idCube }, base);
      const inverted = await renderLut(path.join(tmp, 'inv'), { file: invCube }, base);
      const half = await renderLut(path.join(tmp, 'half'), { file: invCube, strength: 0.5 }, base);

      expect(diffAt(plain, ident, 1.0)).toBeLessThan(1);
      const full = diffAt(plain, inverted, 1.0);
      expect(full).toBeGreaterThan(20);
      const halfDiff = diffAt(plain, half, 1.0);
      expect(halfDiff).toBeGreaterThan(3);
      expect(halfDiff).toBeLessThan(full - 3);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
