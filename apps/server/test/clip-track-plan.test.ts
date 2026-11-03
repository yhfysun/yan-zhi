/**
 * S2 多轨渲染计划（buildTrackPlan）单测 + ffmpeg 实跑。
 *
 * ★★★ 为什么必须测：
 *   · 单轨工程必须与旧计划**逐字节一致**（S2 不能改变任何老工程出片）；
 *   · 多轨叠加错一处，表现是"B-roll 不出现在画面上/出现时间偏移"，ffmpeg 不报错；
 *   · 主轨空档必须补黑，且成片长度按最大结束时间算（否则字幕/图层窗口被截）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadedFromV2, type ClipProjectV3Loaded } from '../src/services/clip-project-v3';
import { buildRenderPlan, buildTrackPlan, runRenderPlan, type BuildPlanInput } from '../src/services/clip-render';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

function singleTrack(): ClipProjectV3Loaded {
  return loadedFromV2({
    version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
    clips: [
      { id: 'c1', file: 'C:/a.mp4', trimStart: 0, trimEnd: 2 },
      { id: 'c2', file: 'C:/b.mp4', trimStart: 0, trimEnd: 1 },
    ],
    layers: [], texts: [],
  });
}

function inputOf(project: ClipProjectV3Loaded): BuildPlanInput {
  return {
    project,
    durations: { c1: 2, c2: 1, b1: 2, b2: 1 },
    hasAudio: { c1: true, c2: true, b1: true, b2: true },
    workDir: 'C:/work',
    outFile: 'C:/work/out.mp4',
    imageFiles: [],
  };
}

function filterComplexOf(steps: Array<{ args: string[] }>, labelStart: string): string {
  const st = steps.find((s) => (s as { label?: string }).label?.startsWith(labelStart));
  if (!st) throw new Error(`找不到步骤：${labelStart}`);
  const i = st.args.indexOf('-filter_complex');
  if (i < 0) throw new Error(`步骤 ${labelStart} 没有 filter_complex`);
  return st.args[i + 1];
}

describe('buildTrackPlan · 计划层', () => {
  it('★ 单视频轨 + 无额外音频轨 → 与 buildRenderPlan 完全相同（出片零变化）', () => {
    const p = singleTrack();
    expect(buildTrackPlan(inputOf(p))).toEqual(buildRenderPlan(inputOf(p)));
  });

  it('★ 隐藏的第二条视频轨被跳过 → 仍与旧计划相同', () => {
    const p = singleTrack();
    p.tracks.push({
      id: 'v2', kind: 'video', hidden: true,
      items: [{ type: 'clip', id: 'b1', start: 0, duration: 2, segment: { id: 'b1', file: 'C:/b.mp4' } }],
    });
    expect(buildTrackPlan(inputOf(p))).toEqual(buildRenderPlan(inputOf(p)));
  });

  it('★ 双视频轨：B-roll 按窗口叠加，成片长度取最大结束时间', () => {
    const p = singleTrack();
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [{ type: 'clip', id: 'b1', start: 1, duration: 2, segment: { id: 'b1', file: 'C:/b.mp4', trimStart: 0, trimEnd: 2 } }],
    });
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.totalDuration).toBe(3);           // 主轨 0~3，B-roll 1~3
    const fc = filterComplexOf(r.plan.steps, '视频轨叠加');
    expect(fc).toContain('setpts=PTS+1.000/TB');    // 对齐成片时间轴
    expect(fc).toContain("overlay=x=0:y=0:enable='between(t,1.000,3.000)'");
    // 下游收尾仍在：末步产物 = 成片
    expect(r.plan.steps[r.plan.steps.length - 1].out).toBe('C:/work/out.mp4');
  });

  it('★ 主轨空档：补黑段进入 concat 清单，时间轴不被压缩', () => {
    const p = singleTrack();
    // 直接写 v3 轨道布局（S1 的写盘会保留与视图一致的既有布局 → 空档不丢）
    p.tracks[0] = {
      ...p.tracks[0],
      items: [
        { type: 'clip', id: 'c1', start: 0, duration: 2, segment: { id: 'c1', file: 'C:/a.mp4', trimStart: 0, trimEnd: 2 } },
        { type: 'clip', id: 'c2', start: 4, duration: 1, segment: { id: 'c2', file: 'C:/b.mp4', trimStart: 0, trimEnd: 1 } },
      ],
    };
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [{ type: 'clip', id: 'b1', start: 5, duration: 1, segment: { id: 'b1', file: 'C:/b.mp4', trimStart: 0, trimEnd: 1 } }],
    });
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.totalDuration).toBe(6);           // 0~2 + 空档 2~4 + 4~5，其他轨到 6
    expect(r.plan.steps.some((s) => s.label === '主轨补黑场（2.00s）')).toBe(true);
    const concat = r.plan.assets.find((a) => a.file.endsWith('track0-concat.txt'));
    expect(concat?.content).toContain('track0-gap-002.mp4');
  });

  it('★ 额外音频轨：并入既有「混入音频层」阶段（不另写混音）', () => {
    // 第一条音频轨 = v2 audios 视图（主音频轨）；额外音频轨才是要合并的
    const p = loadedFromV2({
      version: 2, name: 'p', updatedAt: 1, output: { size: '1080x1920', fps: 30 },
      clips: [{ id: 'c1', file: 'C:/a.mp4', trimStart: 0, trimEnd: 2 }],
      audios: [{ id: 'a1', file: 'C:/main.wav', start: 0, end: 1 }],
      layers: [], texts: [],
    });
    p.tracks.push({
      id: 'a2', kind: 'audio',
      items: [
        { type: 'audio', id: 'x1', file: 'C:/sfx1.wav', start: 0.2, duration: 0.3 },
        { type: 'audio', id: 'x2', file: 'C:/sfx2.wav', start: 0.8, duration: 0.3 },
      ],
    });
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 主音频轨 1 条 + 额外 2 条 = 3 条
    expect(r.plan.steps.some((s) => s.label === '混入音频层（3 段）')).toBe(true);
    const fc = filterComplexOf(r.plan.steps, '混入音频层');
    expect(fc).toContain('amix=inputs=4');          // 主音轨(0:a) + 3 条定时音频
  });

  it('★ 非主轨的 mixed 音轨被跳过；blend 走中性色画布 + blend', () => {
    const p = singleTrack();
    p.tracks.push(
      { id: 'v2', kind: 'video', muted: true, items: [{ type: 'clip', id: 'b1', start: 0, duration: 1, segment: { id: 'b1', file: 'C:/b.mp4' } }] },
      { id: 'v3', kind: 'video', blend: 'screen', opacity: 0.5, items: [{ type: 'clip', id: 'b2', start: 0, duration: 1, segment: { id: 'b2', file: 'C:/b.mp4' } }] },
    );
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fc = filterComplexOf(r.plan.steps, '视频轨叠加');
    expect(fc).toContain('blend=all_mode=screen:all_opacity=0.500');
    expect(fc).toContain('color=c=0x');             // 中性色画布
    // muted 的轨不出现（只剩一条叠加）
    expect(fc.match(/overlay=x=0:y=0/g)?.length).toBe(1);
  });

  it('★ 同轨重叠拒绝（非主轨）', () => {
    const p = singleTrack();
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [
        { type: 'clip', id: 'b1', start: 0, duration: 2, segment: { id: 'b1', file: 'C:/b.mp4' } },
        { type: 'clip', id: 'b2', start: 1, duration: 2, segment: { id: 'b2', file: 'C:/b.mp4' } },
      ],
    });
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('重叠');
  });

  it('★ 复合片段（S4）拒绝而不是静默丢弃', () => {
    const p = singleTrack();
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [{
        type: 'compound', id: 'cmp1', start: 0, duration: 1,
        project: { version: 3, name: 'inner', updatedAt: 1, output: p.output, tracks: [], timedLayers: [] },
      }],
    });
    const r = buildTrackPlan(inputOf(p));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('复合片段');
  });

  it('★ 旧片段缺时间信息 → 明确报错（不猜时间轴）', () => {
    const p = singleTrack();
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [{ type: 'clip', id: 'b1', segment: { id: 'b1', file: 'C:/b.mp4' } }],
    });
    const r = buildTrackPlan({ ...inputOf(p), durations: { c1: 2, c2: 1 } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('缺少时间信息');
  });
});

describe.skipIf(!HAS_FFMPEG)('buildTrackPlan · ffmpeg 实跑（双轨）', () => {
  let tmp = '';
  let base = '';
  let broll = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-track-e2e-'));
    base = path.join(tmp, 'base.mp4');
    broll = path.join(tmp, 'broll.mp4');
    // 主轨：纯红 3s；B-roll：纯蓝 1s（静态纯色 → 抽帧颜色可直接判定）
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x568:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x568:d=1:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', broll]);
  }, 120000);
  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  /** 取某时刻画面的平均 RGB（rawvideo 一帧）。 */
  function rgbAt(file: string, at: number): { r: number; g: number; b: number } {
    const buf = execFileSync(FFMPEG, [
      '-v', 'error', '-ss', at.toFixed(3), '-i', file, '-frames:v', '1',
      '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ]);
    return { r: buf[0], g: buf[1], b: buf[2] };
  }

  it('★ B-roll 在窗口内覆盖主轨，窗口外恢复；成片时长不变', async () => {
    const p = loadedFromV2({
      version: 2, name: 'e2e', updatedAt: 1, output: { size: '320x568', fps: 30 },
      clips: [{ id: 'c1', file: base }],
      layers: [], texts: [],
    });
    p.tracks.push({
      id: 'v2', kind: 'video',
      items: [{ type: 'clip', id: 'b1', start: 1, duration: 1, segment: { id: 'b1', file: broll, trimStart: 0, trimEnd: 1 } }],
    });
    const workDir = path.join(tmp, 'work');
    fs.mkdirSync(workDir, { recursive: true });
    const outFile = path.join(tmp, 'out.mp4');
    const plan = buildTrackPlan({
      project: p,
      durations: { c1: 3, b1: 1 },
      hasAudio: {},
      workDir,
      outFile,
      imageFiles: [],
      cover: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    for (const a of plan.plan.assets) fs.writeFileSync(a.file, a.content, 'utf8');
    const ran = await runRenderPlan(FFMPEG, plan.plan.steps);
    expect(ran.ok, ran.ok ? '' : ran.stderr).toBe(true);

    expect(fs.existsSync(outFile)).toBe(true);
    expect(plan.plan.totalDuration).toBeCloseTo(3, 1);
    const before = rgbAt(outFile, 0.4);
    const during = rgbAt(outFile, 1.5);
    const after = rgbAt(outFile, 2.5);
    // 主轨红：R 明显高于 G/B
    expect(before.r).toBeGreaterThan(150);
    expect(before.b).toBeLessThan(100);
    // 窗口内被蓝覆盖：B 明显高于 R
    expect(during.b).toBeGreaterThan(150);
    expect(during.r).toBeLessThan(100);
    // 窗口外恢复红
    expect(after.r).toBeGreaterThan(150);
    expect(after.b).toBeLessThan(100);
  }, 120000);
});
