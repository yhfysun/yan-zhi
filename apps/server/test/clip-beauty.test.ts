/**
 * 基础美颜（非 AI，全画面）单测：滤镜串 / 归一化 / 位置顺序 / ffmpeg 实跑。
 *
 * ★ 定位：柔肤 = 轻度 boxblur，美白 = eq 提亮 + 轻微降饱和。
 *   不识别面部、不做人脸网格/局部磨皮/美体 —— 测试也只钉这两条滤镜，不假装有 AI 能力。
 * ★ 缺省路径必须零变化：没有 beauty 时滤镜串与历史逐字节一致（钉一条基线）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { FX_EFFECTS, fxFilter } from '@yan-zhi/shared';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';
import { buildSegmentFilters, buildRenderPlan, runRenderPlan } from '../src/services/clip-render';

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

const filtersOf = (seg: ClipProject['clips'][number]) =>
  buildSegmentFilters({ seg, segDur: 3, isImage: false, W: 320, H: 568, fps: 30 });

describe('P2-2 · 基础美颜（非 AI）滤镜串', () => {
  it('缺省/全 0：不含 boxblur / 额外 eq，与基线逐字节一致', () => {
    const plain = filtersOf(baseProject().clips[0]);
    expect(plain.some((f) => f.startsWith('boxblur='))).toBe(false);
    const zero = filtersOf({ ...baseProject().clips[0], beauty: { smooth: 0, whiten: 0 } });
    expect(zero).toEqual(plain);
    const empty = filtersOf({ ...baseProject().clips[0], beauty: {} });
    expect(empty).toEqual(plain);
  });

  it('柔肤：boxblur 半径 = 1 + round(2*smooth)，夹在 1~3', () => {
    const f = (smooth: number) => filtersOf({ ...baseProject().clips[0], beauty: { smooth } })
      .find((x) => x.startsWith('boxblur='));
    expect(f(0.05)).toBe('boxblur=luma_radius=1:luma_power=1');
    expect(f(0.5)).toBe('boxblur=luma_radius=2:luma_power=1');
    expect(f(1)).toBe('boxblur=luma_radius=3:luma_power=1');
  });

  it('美白：eq 亮度 0.06*whiten、饱和 1-0.08*whiten', () => {
    const f = (whiten: number) => filtersOf({ ...baseProject().clips[0], beauty: { whiten } })
      .filter((x) => x.startsWith('eq='));
    expect(f(0.5)).toEqual(['eq=brightness=0.030:saturation=0.960']);
    expect(f(1)).toEqual(['eq=brightness=0.060:saturation=0.920']);
  });

  it('位置：在 adjust 调色之后、结构类特效之前', () => {
    // 用注册表里真实存在的 FX（单一真相源），不手写滤镜假设
    const fxId = FX_EFFECTS.find((e) => e.id !== 'none' && !!e.filter)!.id;
    const seg = {
      ...baseProject().clips[0],
      adjust: { brightness: 0.1 },
      beauty: { smooth: 1, whiten: 1 },
      fx: fxId,
    };
    const fs2 = filtersOf(seg);
    const iAdj = fs2.findIndex((x) => x.startsWith('eq=brightness=0.100'));
    const iBlur = fs2.findIndex((x) => x.startsWith('boxblur='));
    const fxStr = fxFilter(fxId, 320, 568)!;
    const iFx = fs2.indexOf(fxStr);
    expect(iAdj).toBeGreaterThan(-1);
    expect(iBlur).toBeGreaterThan(iAdj);
    expect(iFx).toBeGreaterThan(iBlur);
  });

  it('图片段同样适用（滤镜串里也插 boxblur）', () => {
    const fs2 = buildSegmentFilters({
      seg: { ...baseProject().clips[0], beauty: { smooth: 1 } },
      segDur: 3, isImage: true, W: 320, H: 568, fps: 30,
    });
    expect(fs2.some((x) => x.startsWith('boxblur='))).toBe(true);
  });

  it('渲染计划里能落到段加工命令（不是只在纯函数里）', () => {
    const p = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: { smooth: 1, whiten: 1 } }] }],
    ]);
    const plan = buildRenderPlan({
      project: p, durations: { 'C:/a.mp4': 3 }, hasAudio: { 'C:/a.mp4': false },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
    });
    if (!plan.ok) throw new Error(plan.error);
    const cmd = plan.plan.steps.find((s) => s.label.includes('加工第 1 段'))!.args.join(' ');
    expect(cmd).toContain('boxblur=luma_radius=3:luma_power=1');
    expect(cmd).toContain('eq=brightness=0.060:saturation=0.920');
  });
});

describe('P2-2 · 基础美颜归一化', () => {
  it('越界值夹到 0~1，非法值丢弃', () => {
    const p = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: { smooth: 2, whiten: -1 } }] }],
    ]);
    expect(p.clips[0].beauty).toEqual({ smooth: 1 });
    const q = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: { smooth: 'abc' as unknown as number, whiten: 0.4 } }] }],
    ]);
    expect(q.clips[0].beauty).toEqual({ whiten: 0.4 });
  });

  it('全 0 / 非法输入 → 不写字段', () => {
    const p = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: { smooth: 0, whiten: 0 } }] }],
    ]);
    expect('beauty' in p.clips[0]).toBe(false);
    const q = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: 'nope' }] }],
    ]);
    expect('beauty' in q.clips[0]).toBe(false);
  });

  it('update_clip 设成 0 会删字段（回到"没开美颜"）', () => {
    const p = run(null, [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4', beauty: { smooth: 0.6 } }] }],
    ]);
    expect(p.clips[0].beauty).toEqual({ smooth: 0.6 });
    const q = run(p, [['update_clip', { index: 1, patch: { beauty: { smooth: 0 } } }]]);
    expect('beauty' in q.clips[0]).toBe(false);
  });
});

// ===== ffmpeg 实跑（可选）=====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

function yavgAt(file: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到 YAVG：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

/** 一帧灰度原始像素（用于算高频能量）。 */
function grayFrame(file: string, at: number): Buffer {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'format=gray', '-f', 'rawvideo', '-',
  ], { maxBuffer: 16 * 1024 * 1024 });
  return r.stdout;
}

/** 水平相邻像素差的均值 = 高频能量（柔化后应明显变小）。 */
function highFreq(frame: Buffer): number {
  let s = 0;
  for (let i = 1; i < frame.length; i++) s += Math.abs(frame[i] - frame[i - 1]);
  return frame.length ? s / frame.length : 0;
}

async function renderBeauty(outDir: string, base: string, beauty?: Record<string, unknown>): Promise<string> {
  const p = run(null, [
    ['create', { size: '320x568', fps: 30 }],
    ['add_clip', { clips: [{ file: base, ...(beauty ? { beauty } : {}) }] }],
  ]);
  const workDir = path.join(outDir, 'work');
  const outFile = path.join(outDir, 'out.mp4');
  fs.mkdirSync(workDir, { recursive: true });
  const plan = buildRenderPlan({ project: p, durations: { [base]: 1 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
  if (!plan.ok) throw new Error(plan.error);
  const r = await runRenderPlan(FFMPEG, plan.plan.steps);
  if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
  return outFile;
}

describe.skipIf(!HAS_FFMPEG)('P2-2 · ffmpeg 实跑（基础美颜）', () => {
  it('柔肤降低高频；美白提高平均亮度', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-beauty-e2e-'));
    try {
      // testsrc2 有大量锐利纹理（检查器/条纹），适合观察柔化
      const src = path.join(tmp, 'src.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
        '-i', 'testsrc2=s=320x568:d=1:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);

      const plain = await renderBeauty(path.join(tmp, 'plain'), src);
      const smooth = await renderBeauty(path.join(tmp, 'smooth'), src, { smooth: 1 });
      const whiten = await renderBeauty(path.join(tmp, 'whiten'), src, { whiten: 1 });

      const hfPlain = highFreq(grayFrame(plain, 0.5));
      const hfSmooth = highFreq(grayFrame(smooth, 0.5));
      expect(hfSmooth).toBeLessThan(hfPlain * 0.9);

      expect(yavgAt(whiten, 0.5)).toBeGreaterThan(yavgAt(plain, 0.5) + 5);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
