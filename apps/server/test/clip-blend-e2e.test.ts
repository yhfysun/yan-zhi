/**
 * 混合模式 · ffmpeg 实跑验证（P0-3）。
 *
 * ★ 为什么要有这一层：纯函数单测只能证明"滤镜串长这样"，证明不了
 *   **ffmpeg 能接受它、并且真的产生了混合效果**。blend 的中性色底、setpts 对齐、
 *   `shortest` 这些细节一旦写错，ffmpeg 要么报错、要么静默出一版看不出区别的片子。
 *
 * ★ 本机没有 ffmpeg 时整组跳过（CI/新环境不阻塞）；路径可用 YZ_FFMPEG_PATH 覆盖。
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

/** 取成片某时刻的平均亮度（signalstats 的 YAVG）。 */
function lumaAt(file: string, at: number): number {
  const out = execFileSync(FFMPEG, [
    '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
    '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-',
  ]).toString();
  const m = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (!m) throw new Error(`没取到亮度：${out.slice(0, 300)}`);
  return Number(m[1]);
}

describe.skipIf(!HAS_FFMPEG)('混合模式 · ffmpeg 实跑', () => {
  let tmp = '';
  let base = '';
  let pip = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-blend-e2e-'));
    base = path.join(tmp, 'base.mp4');
    pip = path.join(tmp, 'pip.mp4');
    // 主画面：**静态**深青灰（亮度恒定 → 窗口内外可直接比亮度）；画中画：中灰满屏
    //   ★ 不能用 testsrc2：它是动态图案，不同时刻本身亮度就不同，会把混合效果淹没在噪声里。
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x405060:s=320x568:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=320x568:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', pip]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function renderWith(blend?: string, pipFile?: string): Promise<string> {
    const src = pipFile || pip;
    const tag = `${blend ?? 'unset'}${pipFile ? '-alt' : ''}`;
    let p: ClipProject | null = null;
    for (const [op, args] of [
      ['add_clip', { clips: [{ file: base }] }],
      ['add_overlay', { file: src, start: 1, end: 3, pos: 'center', scale: 1, ...(blend ? { blend } : {}) }],
    ] as Array<[string, Record<string, unknown>]>) {
      const r = applyClipOp(p, op, args);
      if (!r.ok) throw new Error(`[${op}] ${r.error}`);
      p = r.project;
    }
    p = { ...p!, output: { size: '320x568', fps: 30 } };
    const workDir = path.join(tmp, `work-${tag}`);
    const outFile = path.join(tmp, `out-${tag}.mp4`);
    fs.mkdirSync(workDir, { recursive: true });
    const r = buildRenderPlan({
      project: p,
      durations: { [base]: 4 },
      hasAudio: { [base]: false },
      workDir,
      outFile,
      cover: false,
    });
    if (!r.ok) throw new Error(r.error);
    const run = await runRenderPlan(FFMPEG, r.plan.steps);
    if (!run.ok) throw new Error(`${run.failedLabel}: ${run.stderr}`);
    return outFile;
  }

  it('★ screen 在窗口内提亮、窗口外不变（中性黑底真的中性）', async () => {
    const file = await renderWith('screen');
    const before = lumaAt(file, 0.5);      // 1s 之前：窗口外
    const inside = lumaAt(file, 2.0);      // 1~3s：窗口内
    const after = lumaAt(file, 3.5);       // 3s 之后：窗口外
    expect(inside).toBeGreaterThan(before + 8);
    expect(Math.abs(after - before)).toBeLessThan(1.5);   // 窗口外必须原样（中性色生效）
  }, 180000);

  it('★ multiply 在窗口内压暗、窗口外不变（白色中性底）', async () => {
    const file = await renderWith('multiply');
    const before = lumaAt(file, 0.5);
    const inside = lumaAt(file, 2.0);
    const after = lumaAt(file, 3.5);
    expect(inside).toBeLessThan(before - 8);
    expect(Math.abs(after - before)).toBeLessThan(1.5);
  }, 180000);

  it('★ normal 与「未设置 blend」产物亮度一致（不为默认值白付一次全帧混合）', async () => {
    const a = await renderWith(undefined);
    const b = await renderWith('normal');
    for (const at of [0.5, 2.0, 3.5]) {
      expect(Math.abs(lumaAt(a, at) - lumaAt(b, at))).toBeLessThan(0.5);
    }
  }, 180000);

  it('★ 画中画内容与时间轴对齐：1~3s 窗口显示素材 1~3s（不是错位+冻结帧）', async () => {
    // 素材亮度随时间分段：0-1s=50、1-2s=120、2-3s=190、3-4s=240 —— 用亮度当"帧指纹"。
    // ★ 这条是回归护栏：`-ss/-t` 之后不补 `setpts=PTS+st/TB`，1.2s 处会显示素材 2.2s 的画面（190），
    //   且窗口后半段一直是冻结的最后一帧（实测过）。
    const stepPip = path.join(tmp, 'pip-step.mp4');
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=4:r=30',
      '-vf', "geq=lum='if(lt(T,1),50,if(lt(T,2),120,if(lt(T,3),190,240)))':cb=128:cr=128",
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', stepPip,
    ]);
    const file = await renderWith(undefined, stepPip);
    expect(lumaAt(file, 0.5)).toBeLessThan(100);      // 窗口外 = 主画面（0x405060 ≈ 82）
    expect(lumaAt(file, 1.2)).toBeGreaterThan(105);   // ≈120（素材 1~2s）
    expect(lumaAt(file, 1.2)).toBeLessThan(145);
    expect(lumaAt(file, 2.2)).toBeGreaterThan(170);   // ≈190（素材 2~3s）
    expect(lumaAt(file, 2.2)).toBeLessThan(215);
    expect(lumaAt(file, 3.5)).toBeLessThan(100);      // 窗口外
  }, 180000);
});
