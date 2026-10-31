/**
 * 图层变换 / 关键帧（P0-2）· ffmpeg 实跑验证。
 *
 * ★ 纯函数单测只能证明"滤镜串长这样"：keyframes 的 time 换算、scale 的 eval=frame、
 *   旋转外扩的锚点补偿，任何一处写错 ffmpeg 都不报错，只是画面不对 —— 只能实测。
 * ★ 没有 ffmpeg 时整组跳过（路径可用 YZ_FFMPEG_PATH 覆盖）。
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
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 取成片某时刻的平均亮度（可先裁剪一块区域）。 */
function lumaAt(file: string, at: number, crop?: string): number {
  const vf = `${crop ? `crop=${crop},` : ''}signalstats,metadata=print:file=-`;
  const out = execFileSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'null', '-',
  ]).toString();
  const m = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (!m) throw new Error(`没取到亮度：${out.slice(0, 300)}`);
  return Number(m[1]);
}

describe.skipIf(!HAS_FFMPEG)('图层变换 · ffmpeg 实跑', () => {
  let tmp = '';
  let base = '';
  let pip = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-layer-e2e-'));
    base = path.join(tmp, 'base.mp4');
    pip = path.join(tmp, 'pip.mp4');
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x568:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', pip]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function render(overlay: Record<string, unknown>, tag: string): Promise<string> {
    let p: ClipProject | null = null;
    for (const [op, args] of [
      ['add_clip', { clips: [{ file: base }] }],
      ['add_overlay', { file: pip, start: 1, end: 3, scale: 0.5, ...overlay }],
    ] as Array<[string, Record<string, unknown>]>) {
      const r = applyClipOp(p, op, args);
      if (!r.ok) throw new Error(`[${op}] ${r.error}`);
      p = r.project;
    }
    p = { ...p!, output: { size: '320x568', fps: 30 } };
    const workDir = path.join(tmp, `w-${tag}`);
    const outFile = path.join(tmp, `o-${tag}.mp4`);
    fs.mkdirSync(workDir, { recursive: true });
    const r = buildRenderPlan({ project: p, durations: { [base]: 4 }, hasAudio: { [base]: false }, workDir, outFile, cover: false });
    if (!r.ok) throw new Error(r.error);
    const run = await runRenderPlan(FFMPEG, r.plan.steps);
    if (!run.ok) throw new Error(`${run.failedLabel}: ${run.stderr}`);
    return outFile;
  }

  it('★ 滑入 + 放大：起点在右侧、终点居中且更大', async () => {
    const file = await render({
      keyframes: [
        { t: 0, x: 0.3, scale: 0.6 },
        { t: 1, x: 0, scale: 1, ease: 'out' },
      ],
    }, 'slide');
    const RIGHT = '80:568:240:0';   // 右侧 1/4
    // 窗口外：纯黑
    expect(lumaAt(file, 0.5)).toBeLessThan(25);
    // 窗口初段：块在右侧 → 右四分之一能被白块提亮（块只占该区一部分，实测 ~47）
    expect(lumaAt(file, 1.1, RIGHT)).toBeGreaterThan(38);
    // 窗口末段：块已居中放大 → 右四分之一基本回到黑（实测 ~27）
    expect(lumaAt(file, 2.9, RIGHT)).toBeLessThan(33);
    // 整体亮度随尺寸增大而上升（说明 scale 关键帧真的生效）
    expect(lumaAt(file, 2.9)).toBeGreaterThan(lumaAt(file, 1.15) + 8);
  }, 180000);

  it('★ 旋转 + 透明度：ffmpeg 接受整条链并产出可播文件', async () => {
    const file = await render({ rotation: 30, opacity: 0.6, pos: 'center' }, 'rot');
    const inside = lumaAt(file, 2.0);
    const outside = lumaAt(file, 0.5);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
    expect(inside).toBeGreaterThan(outside + 10);   // 半透明白块仍然提亮画面
  }, 180000);
});
