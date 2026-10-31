/**
 * 蒙版增强（P1-4）单测：线性蒙版 / 蒙版关键帧 / 钢笔路径。
 *
 * ★ 关键不变量：
 *   ① 线性蒙版 = 法线方向有符号距离 + 角度/位置/羽化（不是再画一个矩形）；
 *   ② 蒙版关键帧用 geq 的 T 变量生成分段表达式（必须带段长归一化）；
 *   ③ 钢笔路径必须先烘成 PNG（movie+alphamerge），不能挂逐像素多边形表达式到主链；
 *   ④ 老蒙版（形状/色键）输出不变。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  buildMaskFilter, flattenMaskPath, polygonAlphaExpr, shapeAlphaExpr,
} from '../src/services/clip-mask';
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

describe('P1-4 · 线性蒙版', () => {
  it('表达式是"法线方向距离 + 位置"（cos/sin/hypot），不是矩形', () => {
    const e = buildMaskFilter({ shape: 'linear', angle: 0, position: 0.5 }, () => null)!;
    expect(e).toContain('cos(');
    expect(e).toContain('sin(');
    expect(e).toContain('hypot(W\\,H)');
    expect(e).toContain('geq=');
  });

  it('位置改变分界（0.2 与 0.8 的偏移常量不同）', () => {
    const left = buildMaskFilter({ shape: 'linear', angle: 0, position: 0.2 }, () => null)!;
    const right = buildMaskFilter({ shape: 'linear', angle: 0, position: 0.8 }, () => null)!;
    expect(left).not.toBe(right);
    expect(left).toContain('((0.2)-0.5)');
    expect(right).toContain('((0.8)-0.5)');
  });

  it('羽化给过渡带（hard 与 soft 不同；soft 含 1-…/feather）', () => {
    const hard = buildMaskFilter({ shape: 'linear', feather: 0 }, () => null)!;
    const soft = buildMaskFilter({ shape: 'linear', feather: 20 }, () => null)!;
    expect(soft.length).toBeGreaterThan(hard.length);
    expect(soft).toContain('/20');
  });
});

describe('P1-4 · 蒙版关键帧', () => {
  it('有段长 + 关键帧 → 表达式出现 T/段长；无段长则保持静态', () => {
    const mask = { shape: 'circle' as const, keyframes: [{ t: 0, offsetX: -0.3 }, { t: 1, offsetX: 0.3 }] };
    const animated = buildMaskFilter(mask, () => null, { segDur: 2 })!;
    expect(animated).toContain('T/2.000000');
    const staticOne = buildMaskFilter(mask, () => null)!;
    expect(staticOne).not.toContain('T/');
  });

  it('单个关键帧不足以形成动画（退回静态值）', () => {
    const f = buildMaskFilter({ shape: 'circle', offsetX: 0.2, keyframes: [{ t: 0.5, offsetX: 0.4 }] }, () => null, { segDur: 2 })!;
    expect(f).not.toContain('T/');
    expect(f).toContain('0.2000');
  });
});

describe('P1-4 · 钢笔路径', () => {
  it('平滑路径展开成更多采样点；折线保持原锚点数', () => {
    const pts = Array.from({ length: 6 }, (_, i) => ({ x: 0.1 + i * 0.1, y: 0.2 + (i % 2) * 0.3 }));
    expect(flattenMaskPath({ smooth: false, points: pts }, 320, 568)).toHaveLength(6);
    const smooth = flattenMaskPath({ smooth: true, points: pts }, 320, 568);
    expect(smooth.length).toBe(6 * 8);
    // 坐标已换算到像素域
    expect(smooth.some((p) => p.x > 1 && p.y > 1)).toBe(true);
  });

  it('多边形 alpha 表达式：奇偶规则（mod 2），含 X/Y 与 \\, 转义', () => {
    const e = polygonAlphaExpr([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }, { x: 10, y: 100 }]);
    expect(e).toContain('mod(');
    expect(e).toContain('\\,2');
    expect(e).toContain('X\\,');
    // 水平边被跳过：4 条边里只剩 2 条竖直边
    expect((e.match(/gt\(/g) || []).length).toBe(4); // 每条边两个 gt()
  });

  it('路径蒙版滤镜：movie + alphamerge + 黑底合成（不能依赖新增 -i 输入）', () => {
    const f = buildMaskFilter({
      path: { smooth: true, points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.8 }] },
    }, () => null, { pathFile: 'C:/w/mask-c1.png', W: 320, H: 568 })!;
    expect(f).toContain("movie='C\\:/w/mask-c1.png'");
    expect(f).toContain('alphamerge');
    expect(f).toContain('drawbox=c=black@1:t=fill');
    expect(f).not.toContain('geq=');
  });
});

describe('P1-4 · 归一化', () => {
  it('角度/位置钳制；关键帧去重排序；路径 <3 点丢弃；只有路径也算有效蒙版', () => {
    let p = run(baseProject(), [['update_clip', {
      index: 1,
      patch: {
        mask: {
          shape: 'linear', angle: 999, position: -1,
          keyframes: [{ t: 0.8, offsetX: 9 }, { t: 0.2, offsetX: -9 }, { t: 0.2, offsetX: 0.3 }],
        },
      },
    }]]);
    const m = p.clips[0].mask!;
    expect(m.angle).toBe(180);
    expect(m.position).toBe(0);
    expect(m.keyframes!.map((k) => k.t)).toEqual([0.2, 0.8]);
    expect(m.keyframes![0].offsetX).toBe(0.3);
    expect(m.keyframes![1].offsetX).toBe(0.5);

    // 两点太近/少于 3 点的路径不生效
    p = run(p, [['update_clip', { index: 1, patch: { mask: { path: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } } } }]]);
    expect(p.clips[0].mask).toBeUndefined();

    // 只有路径（无 shape/key）也是有效蒙版
    p = run(p, [['update_clip', { index: 1, patch: { mask: {
      path: { smooth: true, points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }] },
    } } }]]);
    expect(p.clips[0].mask?.path?.points).toHaveLength(3);
    expect(p.clips[0].mask?.path?.smooth).toBe(true);
  });
});

describe('P1-4 · 渲染计划', () => {
  it('路径蒙版先出「生成蒙版」步骤，段滤镜引用该 PNG', () => {
    const p = run(baseProject(), [['update_clip', { index: 1, patch: { mask: {
      path: { smooth: false, points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }] },
    } } }]]);
    const plan = buildRenderPlan({
      project: p, durations: { 'C:/a.mp4': 2 }, hasAudio: { 'C:/a.mp4': false },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false,
    });
    if (!plan.ok) throw new Error(plan.error);
    const maskStep = plan.plan.steps.find((s) => s.label.includes('生成蒙版'))!;
    expect(maskStep).toBeTruthy();
    expect(maskStep.out).toMatch(/mask-c1\.png$/);
    expect(maskStep.args.join(' ')).toContain('geq=lum=');
    const segStep = plan.plan.steps.find((s) => s.label.includes('加工第 1 段'))!;
    expect(segStep.args.join(' ')).toContain("movie='C\\:/w/mask-c1.png'");
  });
});

// ===== ffmpeg 实跑 =====
const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

function lumaAtRegion(file: string, at: number, w: number, h: number, x: number, y: number): number {
  const r = spawnSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', `crop=${w}:${h}:${x}:${y},signalstats,metadata=print:file=-`, '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stdout || '');
  if (!m) throw new Error(`没取到亮度：${(r.stdout || '').slice(-200)}`);
  return Number(m[1]);
}

async function renderMask(outDir: string, mask: Record<string, unknown>, base: string): Promise<string> {
  const p = run(null, [
    ['create', { size: '320x568', fps: 30 }],
    ['add_clip', { clips: [{ file: base, mask }] }],
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

describe.skipIf(!HAS_FFMPEG)('P1-4 · ffmpeg 实跑', () => {
  it('线性蒙版：左半有画面、右半全黑；钢笔路径同样生效', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-mask-adv-'));
    try {
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=2:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);

      const linear = await renderMask(path.join(tmp, 'lin'), { shape: 'linear', angle: 0, position: 0.5, feather: 0 }, base);
      expect(lumaAtRegion(linear, 1.0, 80, 200, 20, 180)).toBeGreaterThan(20);
      expect(lumaAtRegion(linear, 1.0, 80, 200, 220, 180)).toBeLessThan(20);

      const pathOut = await renderMask(path.join(tmp, 'path'), {
        path: { smooth: false, points: [{ x: 0.02, y: 0.02 }, { x: 0.48, y: 0.02 }, { x: 0.48, y: 0.98 }, { x: 0.02, y: 0.98 }] },
      }, base);
      expect(lumaAtRegion(pathOut, 1.0, 80, 200, 20, 180)).toBeGreaterThan(20);
      expect(lumaAtRegion(pathOut, 1.0, 80, 200, 220, 180)).toBeLessThan(20);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 180000);
});
