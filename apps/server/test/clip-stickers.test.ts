/**
 * 贴纸层（P1-1）单测：op 归一化 / 图层投影 / 渲染计划 / 贴纸库 + ffmpeg 实跑。
 *
 * ★ 关键不变量：
 *   ① 贴纸与画中画共用同一条 overlay 合成链路（不为贴纸另写一套 → 必然漂移）；
 *   ② 没有贴纸的工程渲染计划**一步不多**（老工程不受影响）；
 *   ③ 贴纸是透明 PNG，合成后应按时间窗口出现/消失（实跑验）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyClipOp, layersFromV1Fields, v1FieldsFromLayers, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan } from '../src/services/clip-render';
import { STICKER_LIBRARY, stickerById, stickerArgs } from '../src/services/sticker-library';

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
    project: p, durations: { 'C:/a.mp4': 5 }, hasAudio: { 'C:/a.mp4': true },
    workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
  });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
}

describe('P1-1 · add_sticker / update_sticker / remove_sticker', () => {
  it('分配 s1/s2…；默认 scale 0.3；值域钳制', () => {
    const p = run(null, [['add_sticker', { stickers: [
      { file: 'C:/s.png', start: 1, end: 2 },
      { file: 'C:/t.png', start: 2, end: 3, scale: 9, x: -9, rotation: 999, opacity: 2 },
    ] }]]);
    expect(p.stickers!.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(p.stickers![0]).toMatchObject({ file: 'C:/s.png', start: 1, end: 2, scale: 0.3 });
    expect(p.stickers![0].x).toBeUndefined();      // 缺省不写
    expect(p.stickers![1].scale).toBe(1);           // 钳到 1
    expect(p.stickers![1].x).toBe(-0.5);            // 钳到 -0.5
    expect(p.stickers![1].rotation).toBe(180);
    expect(p.stickers![1].opacity).toBeUndefined(); // 2 → 1 = 默认，丢弃
  });

  it('缺 file / end<=start 报错；update 改时间与位置；remove 删空清字段', () => {
    expect(applyClipOp(null, 'add_sticker', { stickers: [{ start: 0, end: 1 }] }).ok).toBe(false);
    expect(applyClipOp(null, 'add_sticker', { stickers: [{ file: 'C:/s.png', start: 2, end: 2 }] }).ok).toBe(false);
    let p = run(baseProject(), [['add_sticker', { stickers: [{ file: 'C:/s.png', start: 0, end: 1 }] }]]);
    p = run(p, [['update_sticker', { id: 's1', patch: { start: 3, end: 4.5, x: 0.2 } }]]);
    expect(p.stickers![0]).toMatchObject({ start: 3, end: 4.5, x: 0.2 });
    p = run(p, [['remove_sticker', { id: 's1' }]]);
    expect(p.stickers).toBeUndefined();
  });

  it('双向投影：stickers ↔ layers[kind=sticker] 不丢字段', () => {
    const stickers = [{ id: 's1', file: 'C:/s.png', start: 1, end: 2.5, scale: 0.5, x: 0.1, rotation: 15 }];
    const L = layersFromV1Fields([], [], [], stickers);
    expect(L[0].kind).toBe('sticker');
    expect(L[0].transform).toMatchObject({ scale: 0.5, x: 0.1, rotation: 15 });
    expect(v1FieldsFromLayers(L).stickers[0]).toEqual(stickers[0]);
  });
});

describe('P1-1 · 渲染计划（走画中画链路）', () => {
  it('★ 没有贴纸 → 不产生叠加步骤（老工程计划不变）', () => {
    const labels = planOf(baseProject()).steps.map((s) => s.label);
    expect(labels.some((l) => l.includes('画中画合成'))).toBe(false);
  });

  it('贴纸进入「画中画合成」，默认居中 + 宽度 30% + 时间窗口', () => {
    const p = run(baseProject(), [['add_sticker', { stickers: [{ file: 'C:/s.png', start: 1, end: 2 }] }]]);
    const plan = planOf(p);
    const step = plan.steps.find((s) => s.label.includes('画中画合成'))!;
    expect(step.label).toContain('（1 层）');
    const s = step.args.join(' ');
    expect(s).toContain('C:/s.png');
    expect(s).toContain('scale=96:-2');                    // 320 * 0.3
    expect(s).toContain('(main_w-overlay_w)/2');           // 居中锚点
    expect(s).toContain("enable='between(t,1.000,2.000)");
  });

  it('贴纸与画中画共存：合成两层，贴纸在后（压在上面）', () => {
    const p = run(baseProject(), [
      ['add_overlay', { file: 'C:/pip.mp4', start: 0, end: 2, pos: 'topright', scale: 0.4 }],
      ['add_sticker', { stickers: [{ file: 'C:/s.png', start: 1, end: 2 }] }],
    ]);
    const step = planOf(p).steps.find((s) => s.label.includes('画中画合成'))!;
    expect(step.label).toContain('（2 层）');
    const s = step.args.join(' ');
    expect(s.indexOf('pip.mp4')).toBeLessThan(s.indexOf('s.png'));
  });
});

describe('P1-1 · 贴纸库', () => {
  it('内置 id 唯一、可查、参数里带 rgba 与输出路径', () => {
    const ids = STICKER_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('check');
    const item = stickerById('star')!;
    const args = stickerArgs(item, 'C:/out.png');
    expect(args).toContain('-frames:v');
    expect(args.join(' ')).toContain('format=rgba');
    expect(args[args.length - 1]).toBe('C:/out.png');
    expect(stickerById('nope')).toBeNull();
  });
});

// ===== ffmpeg 实跑：生成贴纸 + 叠到黑底成片，按时间窗口出现/消失 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 取成片某时刻**画面中心**的平均亮度（贴纸就在中心，整帧平均会被黑底稀释）。 */
function lumaAt(file: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'crop=120:120:(iw-120)/2:(ih-120)/2,signalstats,metadata=print:file=-', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到亮度：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

describe.skipIf(!HAS_FFMPEG)('P1-1 · 贴纸 ffmpeg 实跑', () => {
  it('合成后窗口内有画面、窗口外全黑', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-sticker-e2e-'));
    try {
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
      const sticker = path.join(tmp, 'star.png');
      execFileSync(FFMPEG, stickerArgs(stickerById('star')!, sticker));

      let p: ClipProject = {
        version: 2, name: 'p', updatedAt: 1, output: { size: '320x568', fps: 30 },
        clips: [{ id: 'c1', file: base }], texts: [], layers: [],
        stickers: [{ id: 's1', file: sticker, start: 1, end: 2, scale: 0.5 }],
      };
      const workDir = path.join(tmp, 'work');
      const outFile = path.join(tmp, 'out.mp4');
      fs.mkdirSync(workDir, { recursive: true });
      const plan = buildRenderPlan({ project: p, durations: { [base]: 3 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
      if (!plan.ok) throw new Error(plan.error);
      for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
      const r = await runRenderPlan(FFMPEG, plan.plan.steps);
      if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);

      const outside = lumaAt(outFile, 0.4);
      const inside = lumaAt(outFile, 1.5);
      // yuv420p 的"黑"亮度是 16；中心区出现黄色星星时应明显更亮
      expect(outside).toBeLessThan(20);
      expect(inside).toBeGreaterThan(40);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 120000);
});
