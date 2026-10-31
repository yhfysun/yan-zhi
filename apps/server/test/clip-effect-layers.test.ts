/**
 * 特效层（P1-3）单测：op 归一化 / 图层投影 / 渲染计划 / 序列化 / ffmpeg 实跑。
 *
 * ★ 关键不变量：
 *   ① fx 必须命中 shared 的 EFFECT_LAYERS 注册表（拼错的 id 只会"看着正常但没效果"）；
 *   ② 特效层与贴纸/画中画同一套"视图权威 + 双向投影"（UI 删掉后旧层不复活）；
 *   ③ 没有特效层的工程渲染计划**一步不多**（老工程出片不变）；
 *   ④ source 类（闪光/漏光/星点）走 alpha 叠加 + enable 窗口；
 *      filter 类（颗粒）直接给主画面挂带 enable 的 noise。
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { applyClipOp, layersFromV1Fields, v1FieldsFromLayers, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan, runRenderPlan, effectSourceSpec, effectLayerChain } from '../src/services/clip-render';
import { readClipProject, writeClipProject, clipProjectPath } from '../src/services/clip-store';
import { EFFECT_LAYERS } from '@yan-zhi/shared';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-clip-fx-test-'));
vi.mock('../src/host-bridge.js', () => ({
  resolveArtifactDirFor: (arg: { conversationId?: string; category?: string }) => ({
    dir: path.join(TMP, arg.conversationId || 'no-conv', arg.category || 'intermediate'),
  }),
}));

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

describe('P1-3 · 注册表', () => {
  it('四种特效齐全、id 唯一、kind 分流正确', () => {
    const ids = EFFECT_LAYERS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['flash', 'light-leak', 'sparkle', 'grain']);
    expect(EFFECT_LAYERS.find((e) => e.id === 'grain')!.kind).toBe('filter');
    expect(EFFECT_LAYERS.filter((e) => e.kind === 'source').map((e) => e.id))
      .toEqual(['flash', 'light-leak', 'sparkle']);
  });

  it('source 类每个都有 lavfi 源规格；filter 类没有', () => {
    for (const e of EFFECT_LAYERS.filter((x) => x.kind === 'source')) {
      expect(effectSourceSpec(e.id, { W: 320, H: 568, fps: 30, dur: 1.5 })).toContain('s=320x568');
    }
    expect(effectSourceSpec('grain', { W: 320, H: 568, fps: 30, dur: 1.5 })).toBeNull();
    expect(effectSourceSpec('nope', { W: 320, H: 568, fps: 30, dur: 1.5 })).toBeNull();
  });
});

describe('P1-3 · add_effect / update_effect / remove_effect', () => {
  it('分配 e1/e2…；默认强度取注册表；值域钳制', () => {
    const p = run(null, [['add_effect', { effects: [
      { fx: 'flash', start: 1, end: 2 },
      { fx: 'grain', start: 0, end: 4, intensity: 9 },
    ] }]]);
    expect(p.effects!.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(p.effects![0]).toMatchObject({ fx: 'flash', start: 1, end: 2, intensity: 0.55 });
    expect(p.effects![1].intensity).toBe(1);        // 9 → 钳到 1
  });

  it('未知 fx / end<=start 直接拒绝（别让"没效果"静默通过）', () => {
    const bad = applyClipOp(baseProject(), 'add_effect', { effects: [{ fx: 'glow', start: 0, end: 1 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('fx 必须是');
    expect(applyClipOp(baseProject(), 'add_effect', { effects: [{ fx: 'flash', start: 2, end: 2 }] }).ok).toBe(false);
    expect(applyClipOp(baseProject(), 'add_effect', { fx: 'flash', start: 0, end: 1 }).ok).toBe(true);
  });

  it('update 改时间/强度；remove 删空清字段；clear 清空', () => {
    let p = run(baseProject(), [['add_effect', { effects: [{ fx: 'light-leak', start: 0, end: 1 }] }]]);
    p = run(p, [['update_effect', { id: 'e1', patch: { start: 2, end: 3.5, intensity: 0.2 } }]]);
    expect(p.effects![0]).toMatchObject({ start: 2, end: 3.5, intensity: 0.2 });
    p = run(p, [['remove_effect', { id: 'e1' }]]);
    expect(p.effects).toBeUndefined();
    p = run(p, [['add_effect', { effects: [{ fx: 'flash', start: 0, end: 1 }] }]]);
    p = run(p, [['clear_effects']]);
    expect(p.effects).toBeUndefined();
  });
});

describe('P1-3 · 双向投影', () => {
  it('effects ↔ layers[kind=effect] 不丢字段', () => {
    const effects = [{ id: 'e1', fx: 'flash', start: 1, end: 2.5, intensity: 0.7 }];
    const L = layersFromV1Fields([], [], [], [], effects);
    expect(L[0].kind).toBe('effect');
    expect(L[0].track).toBe(3);
    expect(L[0].effect).toEqual({ fx: 'flash', intensity: 0.7 });
    expect(v1FieldsFromLayers(L).effects).toEqual(effects);
  });

  it('序列化 round-trip：写盘只存 layers，读盘派生 effects；视图删掉后不复活', () => {
    const conv = 'fx-conv';
    fs.mkdirSync(path.join(TMP, conv, 'intermediate'), { recursive: true });
    const p = run(baseProject(), [['add_effect', { effects: [{ fx: 'sparkle', start: 0.5, end: 2 }] }]]);
    writeClipProject(conv, p);

    const disk = JSON.parse(fs.readFileSync(clipProjectPath(conv).file, 'utf8')) as { layers: Array<{ kind: string }> };
    expect(disk.layers.some((l) => l.kind === 'effect')).toBe(true);

    const back = readClipProject(conv)!;
    expect(back.effects).toEqual(p.effects);

    // ★ 视图权威：把 effects 清掉再写，layer 必须一起消失
    delete back.effects;
    writeClipProject(conv, back);
    const disk2 = JSON.parse(fs.readFileSync(clipProjectPath(conv).file, 'utf8')) as { layers: Array<{ kind: string }> };
    expect(disk2.layers.some((l) => l.kind === 'effect')).toBe(false);
    expect(readClipProject(conv)!.effects).toBeUndefined();
  });
});

describe('P1-3 · 渲染计划', () => {
  it('★ 没有特效层 → 不产生特效步骤（老工程计划不变）', () => {
    const labels = planOf(baseProject()).steps.map((s) => s.label);
    expect(labels.some((l) => l.includes('特效'))).toBe(false);
  });

  it('flash：lavfi 暖白源 + alpha 强度 + 淡入淡出 + setpts 对齐 + enable 窗口', () => {
    const p = run(baseProject(), [['add_effect', { effects: [{ fx: 'flash', start: 1, end: 2, intensity: 0.5 }] }]]);
    const plan = planOf(p);
    const step = plan.steps.find((s) => s.label.includes('特效层合成'))!;
    expect(step.label).toContain('（1 层）');
    const s = step.args.join(' ');
    expect(step.args).toContain('-f');
    expect(s).toContain('color=c=0xFFF3DC:s=320x568:r=30:d=1.000');
    expect(s).toContain('colorchannelmixer=aa=0.500');
    expect(s).toContain('fade=t=in:st=0:d=0.250:alpha=1');
    expect(s).toContain('setpts=PTS+1.000/TB');
    expect(s).toContain("enable='between(t,1.000,2.000)'");
    expect(s).toContain('overlay=x=0:y=0');
  });

  it('grain：直接给主画面挂带 enable 的 noise（无额外输入）', () => {
    const p = run(baseProject(), [['add_effect', { effects: [{ fx: 'grain', start: 1, end: 2, intensity: 0.4 }] }]]);
    const step = planOf(p).steps.find((s) => s.label.includes('特效层合成'))!;
    const s = step.args.join(' ');
    expect(s).toContain("[0:v]noise=alls=60:allf=t:enable='between(t,1.000,2.000)'");
    expect(step.args.filter((a) => a === '-i')).toHaveLength(1); // 只有当前成片这一路输入
  });

  it('多条叠加：闪光 + 颗粒按时间排序，逐层串联', () => {
    const p = run(baseProject(), [['add_effect', { effects: [
      { fx: 'grain', start: 2, end: 4 },
      { fx: 'flash', start: 0.5, end: 1 },
    ] }]]);
    const step = planOf(p).steps.find((s) => s.label.includes('特效层合成'))!;
    expect(step.label).toContain('（2 层）');
    const s = step.args.join(' ');
    expect(s.indexOf('0xFFF3DC')).toBeLessThan(s.indexOf('noise=alls=60'));
    // 两层各产出一个链路标签，最终映射到最后一级
    expect(s).toContain('[vfx1]');
    expect(s).toContain('-map');
  });

  it('星点：半分辨率随机点放大成 2px + alphamerge 合成白点 + 透明底', () => {
    const p = run(baseProject(), [['add_effect', { effects: [{ fx: 'sparkle', start: 0, end: 1.5 }] }]]);
    const s = planOf(p).steps.find((x) => x.label.includes('特效层合成'))!.args.join(' ');
    expect(s).toContain('split=2[fw0][fm0]');
    expect(s).toContain('alphamerge');
    expect(s).toContain("geq=lum='if(gt(random(1),0.99),255,0)'");
    expect(s).toContain('scale=320:568:flags=neighbor');   // 半分辨率再放大 → 2px 星点
  });

  it('漏光：径向渐变源 + 柔化 + 闪烁（不是整屏铺色）', () => {
    expect(effectSourceSpec('light-leak', { W: 1080, H: 1440, fps: 25, dur: 1.2 }))
      .toContain('gradients=s=1080x1440:');
    expect(effectSourceSpec('light-leak', { W: 1080, H: 1440, fps: 25, dur: 1.2 }))
      .toContain('c0=0xFF7A1E:c1=black');
    const p = run(baseProject(), [['add_effect', { effects: [{ fx: 'light-leak', start: 0, end: 1.2 }] }]]);
    const s = planOf(p).steps.find((x) => x.label.includes('特效层合成'))!.args.join(' ');
    expect(s).toContain('t=radial');
    expect(s).toContain('gblur=sigma=');
    expect(s).toContain('noise=alls=12:allf=t');
  });

  it('effectLayerChain 对未知 id 返回 null（绝不回退到别的特效）', () => {
    expect(effectLayerChain('nope', {
      inLabel: '0:v', outLabel: 'v0', W: 320, H: 568, fps: 30, start: 0, end: 1, intensity: 0.5, idx: 0,
    })).toBeNull();
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 取某时刻整帧平均亮度。 */
function lumaAt(file: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到亮度：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

/** 取某时刻**一块区域**的平均亮度（漏光从左上角来，整帧平均会被其余暗部稀释）。 */
function lumaAtRegion(file: string, at: number, w: number, h: number, x: number, y: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `crop=${w}:${h}:${x}:${y},signalstats,metadata=print:file=-`, '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到亮度：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

/** 两版成片在同一时刻的画面差异（blend difference 均值）。 */
function diffAt(a: string, b: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', a, '-ss', at.toFixed(3), '-i', b, '-frames:v', '1',
    '-filter_complex', '[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:file=-',
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到画面差异：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

/** 取某时刻相邻两帧差异的均值（噪点=时间上随机 → 差异明显；静态画面=0）。 */
function frameDiffAt(file: string, at: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '2',
    '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到帧差：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

async function renderTo(outDir: string, p: ClipProject, base: string): Promise<string> {
  const workDir = path.join(outDir, 'work');
  const outFile = path.join(outDir, 'out.mp4');
  fs.mkdirSync(workDir, { recursive: true });
  const plan = buildRenderPlan({
    project: p, durations: { [base]: 4 }, hasAudio: { [base]: false }, workDir, outFile, cover: false,
  });
  if (!plan.ok) throw new Error(plan.error);
  for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
  const r = await runRenderPlan(FFMPEG, plan.plan.steps);
  if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
  return outFile;
}

describe.skipIf(!HAS_FFMPEG)('P1-3 · ffmpeg 实跑（4 秒：四种特效各一段）', () => {
  it('窗口内画面变化、窗口外与无特效版本一致', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-clip-fx-e2e-'));
    try {
      // 静态灰底：luma 不受素材本身运动干扰，"变亮"就是特效造成
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=320x568:d=4:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);

      const mk = (withFx: boolean): ClipProject => ({
        version: 2, name: 'p', updatedAt: 1, output: { size: '320x568', fps: 30 },
        clips: [{ id: 'c1', file: base }], texts: [], layers: [],
        ...(withFx ? { effects: [
          { id: 'e1', fx: 'flash', start: 1.0, end: 1.5, intensity: 0.6 },
          { id: 'e2', fx: 'light-leak', start: 1.5, end: 2.3, intensity: 0.6 },
          { id: 'e3', fx: 'sparkle', start: 2.3, end: 3.1, intensity: 0.8 },
          { id: 'e4', fx: 'grain', start: 3.1, end: 3.7, intensity: 0.4 },
        ] } : {}),
      });

      const plain = await renderTo(path.join(tmp, 'plain'), mk(false), base);
      const fxed = await renderTo(path.join(tmp, 'fxed'), mk(true), base);

      // 窗口外（0.4s）与无特效版本一致（允许一次重编码的 ±2 亮度抖动）
      expect(Math.abs(lumaAt(fxed, 0.4) - lumaAt(plain, 0.4))).toBeLessThan(2);
      // 闪光窗口内明显更亮
      expect(lumaAt(fxed, 1.25)).toBeGreaterThan(lumaAt(plain, 1.25) + 30);
      // 漏光：只在局部加光，**不把整屏压暗**（旧实现整屏铺色会压暗整帧）
      expect(diffAt(fxed, plain, 1.9)).toBeGreaterThan(2);
      expect(Math.abs(lumaAtRegion(fxed, 1.9, 100, 100, 220, 468) - lumaAtRegion(plain, 1.9, 100, 100, 220, 468))).toBeLessThan(3);
      // 星点在窗口内逐帧变化（闪烁），窗口外为 0
      expect(frameDiffAt(fxed, 2.6)).toBeGreaterThan(0.5);
      // 颗粒窗口内帧间差明显，窗口外为 0
      expect(frameDiffAt(fxed, 3.4)).toBeGreaterThan(3);
      expect(frameDiffAt(fxed, 0.6)).toBeLessThan(0.5);
      expect(frameDiffAt(plain, 0.6)).toBeLessThan(0.5);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
