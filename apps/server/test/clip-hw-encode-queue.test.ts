/**
 * P1-9 单测：硬件编码参数/探测 + 渲染队列（顺序执行、取消、清理）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { videoEncodeArgs, buildRenderPlan } from '../src/services/clip-render';
import { detectHwEncoder, resetHwEncoderCache } from '../src/services/clip-hw-encode';
import {
  setRenderQueueRunner, enqueueRenderJob, listRenderJobs, cancelRenderJob,
  clearFinishedRenderJobs, resetRenderQueueForTests,
} from '../src/services/clip-render-queue';
import { applyClipOp, type ClipProject } from '../src/services/clip-project';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor 超时');
    await sleep(10);
  }
}

describe('P1-9 · 编码参数', () => {
  it('CPU / nvenc / qsv / amf 各自的参数形态', () => {
    const q = { crf: 21, preset: 'medium' };
    expect(videoEncodeArgs(q, false, null)).toEqual(['-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p']);
    expect(videoEncodeArgs(q, false, 'nvenc')).toContain('h264_nvenc');
    expect(videoEncodeArgs(q, false, 'nvenc')).toContain('-cq');
    expect(videoEncodeArgs(q, false, 'qsv')).toContain('h264_qsv');
    expect(videoEncodeArgs(q, false, 'qsv')).toContain('-global_quality');
    expect(videoEncodeArgs(q, false, 'amf')).toContain('h264_amf');
    expect(videoEncodeArgs(q, false, 'amf')).toContain('-qp_i');
    // 预览档统一 crf30（CPU 与硬件一致）
    expect(videoEncodeArgs(q, true, null)).toContain('30');
    expect(videoEncodeArgs(q, true, 'nvenc')).toContain('30');
  });

  it('渲染计划按 hwEncoder 切换编码器（步骤里能看到 h264_nvenc）', () => {
    let p: ClipProject | null = null;
    for (const [op, args] of [
      ['create', { size: '320x568', fps: 30 }],
      ['add_clip', { clips: [{ file: 'C:/a.mp4' }] }],
    ] as Array<[string, Record<string, unknown>]>) {
      const r = applyClipOp(p, op, args);
      if (!r.ok) throw new Error(r.error);
      p = r.project;
    }
    const plan = buildRenderPlan({
      project: p!, durations: { 'C:/a.mp4': 2 }, hasAudio: { 'C:/a.mp4': false },
      workDir: 'C:/w', outFile: 'C:/w/out.mp4', cover: false, hwEncoder: 'nvenc',
    });
    if (!plan.ok) throw new Error(plan.error);
    const seg = plan.plan.steps.find((s) => s.label.includes('加工第 1 段'))!.args.join(' ');
    expect(seg).toContain('h264_nvenc');
    expect(seg).not.toContain('libx264');
  });

  it('探测：不存在的 ffmpeg 返回 null（不抛错）', async () => {
    resetHwEncoderCache();
    expect(await detectHwEncoder('C:/definitely/not/ffmpeg.exe')).toBeNull();
  });

  it.skipIf(!HAS_FFMPEG)('探测：本机真实 ffmpeg 返回合法结果', async () => {
    resetHwEncoderCache();
    const enc = await detectHwEncoder(FFMPEG);
    expect([null, 'nvenc', 'qsv', 'amf']).toContain(enc);
  }, 60000);

  it.skipIf(!HAS_FFMPEG)('有可用硬件编码器时，计划真跑能出片（否则跳过）', async () => {
    resetHwEncoderCache();
    const enc = await detectHwEncoder(FFMPEG);
    if (!enc) return;   // 没有硬件就跳过（CI/无显卡机器）
    const { execFileSync, spawnSync } = await import('node:child_process');
    const os = await import('node:os');
    const fs2 = await import('node:fs');
    const tmp = fs2.mkdtempSync(path.join(os.tmpdir(), 'yz-hw-e2e-'));
    try {
      const base = path.join(tmp, 'base.mp4');
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=1:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
      let p: ClipProject | null = null;
      for (const [op, args] of [
        ['create', { size: '320x568', fps: 30 }],
        ['add_clip', { clips: [{ file: base }] }],
      ] as Array<[string, Record<string, unknown>]>) {
        const r = applyClipOp(p, op, args);
        if (!r.ok) throw new Error(r.error);
        p = r.project;
      }
      const workDir = path.join(tmp, 'w');
      const outFile = path.join(tmp, 'out.mp4');
      fs2.mkdirSync(workDir, { recursive: true });
      const plan = buildRenderPlan({
        project: p!, durations: { [base]: 1 }, hasAudio: { [base]: false }, workDir, outFile, cover: false, hwEncoder: enc,
      });
      if (!plan.ok) throw new Error(plan.error);
      for (const a of plan.plan.assets) fs2.writeFileSync(a.file, a.content, 'utf8');
      const { runRenderPlan } = await import('../src/services/clip-render');
      const r = await runRenderPlan(FFMPEG, plan.plan.steps);
      if (!r.ok) throw new Error(`${r.failedLabel}: ${r.stderr}`);
      // 产物必须能解码（编码器参数写错时 ffmpeg 多半直接失败，这里再兜一层）
      const probe = spawnSync(FFMPEG, ['-v', 'error', '-i', outFile, '-f', 'null', '-'], { encoding: 'utf8' });
      expect(probe.status).toBe(0);
      expect(fs2.statSync(outFile).size).toBeGreaterThan(1000);
    } finally {
      try { fs2.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 120000);
});

describe('P1-9 · 渲染队列', () => {
  it('顺序执行：先入先跑，状态按 queued→running→done 迁移', async () => {
    resetRenderQueueForTests();
    const order: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((res) => { release = res; });
    setRenderQueueRunner(async (job) => {
      order.push(job.title);
      if (order.length === 1) await gate;   // 第一个卡住，验证第二个不会并发
      return { ok: true, file: `C:/out/${job.id}.mp4` };
    });
    const j1 = enqueueRenderJob({ conversationId: 'c1', title: 'A' });
    const j2 = enqueueRenderJob({ conversationId: 'c1', title: 'B' });
    await waitFor(() => listRenderJobs('c1').find((j) => j.id === j1.id)?.status === 'running');
    // B 必须还在排队（同一时间只跑一个）
    expect(listRenderJobs('c1').find((j) => j.id === j2.id)?.status).toBe('queued');
    release!();
    await waitFor(() => listRenderJobs('c1').every((j) => j.status === 'done'));
    expect(order).toEqual(['A', 'B']);
    expect(listRenderJobs('c1').every((j) => !!j.file)).toBe(true);
  });

  it('失败任务记录 error；排队中的可以取消；清理只删已结束的', async () => {
    resetRenderQueueForTests();
    setRenderQueueRunner(async (job) => (job.title === 'bad' ? { ok: false, error: 'ffmpeg 挂了' } : { ok: true }));
    const bad = enqueueRenderJob({ conversationId: 'c2', title: 'bad' });
    await waitFor(() => listRenderJobs('c2').find((j) => j.id === bad.id)?.status === 'failed');
    expect(listRenderJobs('c2')[0].error).toContain('ffmpeg');

    // 让执行器一直卡住，第二个任务才能处于"排队中"
    resetRenderQueueForTests();
    let release: (() => void) | null = null;
    setRenderQueueRunner(async () => {
      await new Promise<void>((res) => { release = res; });
      return { ok: true };
    });
    const a = enqueueRenderJob({ conversationId: 'c3', title: 'A' });
    const b = enqueueRenderJob({ conversationId: 'c3', title: 'B' });
    await waitFor(() => listRenderJobs('c3').find((j) => j.id === a.id)?.status === 'running');
    expect(cancelRenderJob(b.id)).toBe(true);
    expect(listRenderJobs('c3').find((j) => j.id === b.id)?.status).toBe('canceled');
    release!();
    await waitFor(() => listRenderJobs('c3').find((j) => j.id === a.id)?.status === 'done');
    expect(clearFinishedRenderJobs('c3')).toBe(2);
    expect(listRenderJobs('c3')).toHaveLength(0);
  });
});
