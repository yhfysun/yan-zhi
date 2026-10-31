/**
 * HSL 分色（P1-6）单测：色带数学 / 3D LUT 生成 / 归一化 / 渲染计划 / ffmpeg 实跑。
 *
 * ★ 实现要点：本机 ffmpeg 没有 HSL 分色滤镜，所以把色带参数烘成 17³ 的 .cube，
 *   走 P1-5 的 lut3d 链路（预览与导出共用）。测试必须钉住"只影响目标色相"。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyHslBands, hslCube, rgbToHsl, hslToRgb } from '../src/services/clip-hsl';
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

describe('P1-6 · 色带数学', () => {
  it('RGB↔HSL 往返不失真', () => {
    for (const rgb of [[1, 0, 0], [0.2, 0.6, 0.9], [0.5, 0.5, 0.5]] as const) {
      const [h, s, l] = rgbToHsl(...rgb);
      const back = hslToRgb(h, s, l);
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 5));
    }
  });

  it('红色带降饱和 -100 → 灰；蓝色完全不受红色带影响', () => {
    const [r, g, b] = applyHslBands(1, 0, 0, [{ color: 'red', saturation: -100 }]);
    expect(r).toBeCloseTo(0.5, 2);
    expect(g).toBeCloseTo(0.5, 2);
    expect(b).toBeCloseTo(0.5, 2);
    expect(applyHslBands(0, 0, 1, [{ color: 'red', saturation: -100 }])).toEqual([0, 0, 1]);
  });

  it('色相偏移只作用于邻近色相（红色带不动绿色）', () => {
    const shifted = applyHslBands(1, 0, 0, [{ color: 'red', hue: 60 }]);
    // 红 → 黄：R 仍接近 1、G 抬起来、B 保持 0
    expect(shifted[1]).toBeGreaterThan(0.8);
    expect(shifted[2]).toBeLessThan(0.2);
    expect(applyHslBands(0, 1, 0, [{ color: 'red', hue: 60 }])).toEqual([0, 1, 0]);
  });
});

describe('P1-6 · 3D LUT 生成', () => {
  it('尺寸/行数正确；红色带降饱和后纯红格点变灰、纯蓝格点不变', () => {
    const cube = hslCube([{ color: 'red', saturation: -100 }], 5);
    const lines = cube.trim().split('\n');
    expect(lines[0]).toBe('LUT_3D_SIZE 5');
    expect(lines).toHaveLength(1 + 125);
    const at = (r: number, g: number, b: number) => {
      const idx = b * 25 + g * 5 + r;
      return lines[1 + idx].split(' ').map(Number);
    };
    const red = at(4, 0, 0);
    red.forEach((v) => expect(v).toBeCloseTo(0.5, 2));
    expect(at(0, 0, 4)).toEqual([0, 0, 1]);
  });

  it('空色带 = 恒等', () => {
    expect(applyHslBands(0.3, 0.7, 0.2, [])).toEqual([0.3, 0.7, 0.2]);
  });
});

describe('P1-6 · 归一化', () => {
  it('未知色带丢弃；H/S/L 钳制；全 0 色带丢弃；全空 → 删字段', () => {
    let p = run(baseProject(), [['update_clip', { index: 1, patch: { hsl: { bands: [
      { color: 'red', hue: 999, saturation: -999 },
      { color: 'nope', saturation: 50 },
      { color: 'blue', hue: 0, saturation: 0, lightness: 0 },
    ] } } }]]);
    expect(p.clips[0].hsl).toEqual({ bands: [{ color: 'red', hue: 180, saturation: -100 }] });
    p = run(p, [['update_clip', { index: 1, patch: { hsl: { bands: [] } } }]]);
    expect(p.clips[0].hsl).toBeUndefined();
  });
});

describe('P1-6 · 渲染计划', () => {
  it('HSL 生成 .cube 资产，段滤镜用 lut3d 引用；与用户 LUT 按 HSL→LUT 顺序叠加', () => {
    const p = run(baseProject(), [
      ['update_clip', { index: 1, patch: {
        lut: { file: 'C:/fx/look.cube' },
        hsl: { bands: [{ color: 'green', saturation: -50 }] },
      } }],
    ]);
    const plan = buildRenderPlan({
      project: p, durations: { 'C:/a.mp4': 3 }, hasAudio: { 'C:/a.mp4': false },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
    });
    if (!plan.ok) throw new Error(plan.error);
    const asset = plan.plan.assets.find((a) => a.file.endsWith('hsl-c1.cube'))!;
    expect(asset).toBeTruthy();
    expect(asset.content.startsWith('LUT_3D_SIZE 17')).toBe(true);
    const seg = plan.plan.steps.find((s) => s.label.includes('加工第 1 段'))!.args.join(' ');
    const iHsl = seg.indexOf("lut3d=file='C\\:/w/hsl-c1.cube'");
    const iLut = seg.indexOf("lut3d=file='C\\:/fx/look.cube'");
    expect(iHsl).toBeGreaterThan(-1);
    expect(iLut).toBeGreaterThan(-1);
    expect(iHsl).toBeLessThan(iLut);
  });

  it('没有 HSL 的工程不生成 .cube 资产', () => {
    const plan = buildRenderPlan({
      project: baseProject(), durations: { 'C:/a.mp4': 3 }, hasAudio: { 'C:/a.mp4': false },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
    });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.plan.assets.some((a) => a.file.endsWith('.cube'))).toBe(false);
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

function uvAt(file: string, at: number): { u: number; v: number } {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const u = /lavfi\.signalstats\.UAVG=([\d.]+)/.exec(r.stdout || '');
  const v = /lavfi\.signalstats\.VAVG=([\d.]+)/.exec(r.stdout || '');
  if (!u || !v) throw new Error(`没取到色度：${(r.stdout || '').slice(-200)}`);
  return { u: Number(u[1]), v: Number(v[1]) };
}

async function renderHsl(outDir: string, base: string, bands: Array<Record<string, unknown>>): Promise<string> {
  const p = run(null, [
    ['create', { size: '320x568', fps: 30 }],
    ['add_clip', { clips: [{ file: base, hsl: { bands } }] }],
  ]);
  const workDir = path.join(outDir, 'work');
  const outFile = path.join(outDir, 'out.mp4');
  fs.mkdirSync(workDir, { recursive: true });
  const plan = buildRenderPlan({ project: p, durations: { [base]: 1 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
  if (!plan.ok) throw new Error(plan.error);
  for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
  const r = await runRenderPlan(FFMPEG, plan.plan.steps);
  if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
  return outFile;
}

describe.skipIf(!HAS_FFMPEG)('P1-6 · ffmpeg 实跑', () => {
  it('红色带去饱和把红画面变灰；蓝画面不受影响', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-hsl-e2e-'));
    try {
      const red = path.join(tmp, 'red.mp4');
      const blue = path.join(tmp, 'blue.mp4');
      for (const [file, color] of [[red, 'red'], [blue, 'blue']] as const) {
        execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x568:d=1:r=30`,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      }
      const redOut = await renderHsl(path.join(tmp, 'red-out'), red, [{ color: 'red', saturation: -100 }]);
      const blueOut = await renderHsl(path.join(tmp, 'blue-out'), blue, [{ color: 'red', saturation: -100 }]);

      const rUV = uvAt(redOut, 0.5);
      expect(Math.abs(rUV.u - 128)).toBeLessThan(6);   // 去饱和 → U/V 回到中性
      expect(Math.abs(rUV.v - 128)).toBeLessThan(6);

      const bNo = await renderHsl(path.join(tmp, 'blue-plain'), blue, []);
      const before = uvAt(bNo, 0.5);
      const after = uvAt(blueOut, 0.5);
      expect(Math.abs(after.u - before.u)).toBeLessThan(1);
      expect(Math.abs(after.v - before.v)).toBeLessThan(1);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
