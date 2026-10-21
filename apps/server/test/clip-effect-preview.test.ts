/**
 * 效果预览（卡片缩略图）单测。
 *
 * 分两层：
 *  · 参数校验：**不需要 ffmpeg** —— 未知 kind/id 必须在起进程之前就报错，
 *    否则"拼错 id"会渲染出一张原片当成功（比报错更难发现）。
 *  · 实跑：默认跳过（`YZ_LIVE_MEDIA=1` 才跑）。这类用例必须真起 ffmpeg ——
 *    滤镜串写错时 ffmpeg 往往"命令成功、产物是坏的"，纯字符串断言抓不到。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureEffectPreview } from '../src/services/clip-effect-preview';
import { assembleSegmentChain } from '../src/services/clip-render';
import { COLOR_EFFECTS, FX_EFFECTS, MASK_SHAPES, MASK_KEYS, TEXT_STYLES, TRANSITIONS } from '@yan-zhi/shared';

const LIVE = process.env.YZ_LIVE_MEDIA === '1';
const FFMPEG = process.env.YZ_FFMPEG_BIN?.trim() ||
  path.join(process.env.APPDATA || '', 'yan-zhi/server-data/ffmpeg/ffmpeg.exe');
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');

describe('效果预览 · 参数校验（不需要 ffmpeg）', () => {
  it('未知 kind 直接报错', async () => {
    const r = await ensureEffectPreview({ kind: 'nope' as never, id: 'warm', ffmpeg: 'ffmpeg' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未知预览种类');
  });

  it('未知效果 id 直接报错（不能渲染成原片当成功）', async () => {
    const r = await ensureEffectPreview({ kind: 'color', id: 'not-a-filter', ffmpeg: 'ffmpeg' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('效果不存在');
  });

  it('动态特效 id 也走同一份校验', async () => {
    const r = await ensureEffectPreview({ kind: 'fx', id: 'nope', ffmpeg: 'ffmpeg' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('效果不存在');
  });
});

describe.skipIf(!LIVE)('效果预览 · 实跑（需 ffmpeg）', () => {
  it('调色出 jpg', async () => {
    const r = await ensureEffectPreview({ kind: 'color', id: 'warm', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(r.ok, r.error).toBe(true);
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('形状蒙版出 jpg', async () => {
    const r = await ensureEffectPreview({ kind: 'mask', id: 'circle', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(r.ok, r.error).toBe(true);
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('字幕模板出 jpg', async () => {
    const r = await ensureEffectPreview({ kind: 'style', id: 'vlog', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(r.ok, r.error).toBe(true);
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('转场出 mp4', async () => {
    const r = await ensureEffectPreview({ kind: 'transition', id: 'fade', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(r.ok, r.error).toBe(true);
    expect(r.mime).toBe('video/mp4');
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('动态特效出 mp4（时间相关效果静帧看不出来）', async () => {
    const r = await ensureEffectPreview({ kind: 'fx', id: 'shake', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(r.ok, r.error).toBe(true);
    expect(r.mime).toBe('video/mp4');
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('★ 奇数尺寸也能出片（libx264 不接受奇数高，服务内要自动取偶）', async () => {
    const r = await ensureEffectPreview({ kind: 'fx', id: 'oldfilm', ffmpeg: FFMPEG, width: 241, height: 135 });
    expect(r.ok, r.error).toBe(true);
    expect(fs.statSync(r.file!).size).toBeGreaterThan(1000);
  });

  it('缓存命中不重复渲染', async () => {
    const a = await ensureEffectPreview({ kind: 'color', id: 'cool', ffmpeg: FFMPEG, width: 160, height: 90 });
    const b = await ensureEffectPreview({ kind: 'color', id: 'cool', ffmpeg: FFMPEG, width: 160, height: 90 });
    expect(b.ok).toBe(true);
    expect(b.cached).toBe(true);
    expect(b.file).toBe(a.file);
  });

  /**
   * ★★★ 全量实测（2026-10-21）：注册表里**每一项**都必须真的渲得出来。
   *   为什么不能只测几个代表：滤镜串写错时 ffmpeg 通常"命令成功、产物是坏的"，
   *   或者某个滤镜在用户机器上的构建里不存在 —— 只有逐条实跑才能发现。
   *   （注册表是单一真相源，UI/工具/渲染共用，一处坏 = 三个面同时骗人。）
   */
  it('注册表每一项都能渲染（调色/特效/蒙版/字幕模板/转场）', async () => {
    const cases: Array<[import('../src/services/clip-effect-preview').EffectPreviewKind, string]> = [
      ...COLOR_EFFECTS.map((e) => ['color', e.id] as [never, string]),
      ...FX_EFFECTS.map((e) => ['fx', e.id] as [never, string]),
      ...MASK_SHAPES.map((e) => ['mask', e.id] as [never, string]),
      ...MASK_KEYS.map((e) => ['mask', e.id] as [never, string]),
      ...TEXT_STYLES.map((e) => ['style', e.id] as [never, string]),
      ...TRANSITIONS.map((e) => ['transition', e.id] as [never, string]),
    ];
    const failed: string[] = [];
    for (const [kind, id] of cases) {
      const r = await ensureEffectPreview({ kind, id, ffmpeg: FFMPEG, width: 160, height: 90 });
      if (!r.ok) failed.push(`${kind}/${id}: ${r.error}`);
      else if (!fs.statSync(r.file!).size) failed.push(`${kind}/${id}: 产物为空`);
    }
    expect(failed, failed.join('\n')).toEqual([]);
  }, 180000);

  /**
   * ★★★ 特效不能改变画幅（2026-10-21）：整条片子靠 `concat demuxer + -c copy` 拼接，
   *   前提是每段**输出尺寸完全相同**。震动/马赛克这类要缩放再裁切的滤镜只要有 1px 误差，
   *   拼接就会失败或被迫整条重编码 —— 而且报错完全指不到是哪个特效。
   *   这里逐条走**真实的段滤镜装配层**（assembleSegmentChain），再 ffprobe 校验产物尺寸。
   */
  it('每个动态特效经整段滤镜链后仍是 320×180', async () => {
    const src = path.join(os.tmpdir(), 'yz-fx-src.mp4');
    if (!fs.existsSync(src)) {
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '2', '-pix_fmt', 'yuv420p', src]);
    }
    const bad: string[] = [];
    for (const fx of FX_EFFECTS) {
      const seg = { id: 'c1', file: src, fx: fx.id };
      const chain = assembleSegmentChain({ seg, segDur: 1, isImage: false, W: 320, H: 180, fps: 30, keyFilterOf: () => null });
      const out = path.join(os.tmpdir(), `yz-fx-${fx.id}.mp4`);
      const args = chain.fcHead
        ? ['-y', '-v', 'error', '-i', src, '-filter_complex', chain.fcHead, '-map', `[${chain.vLabel}]`, '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]
        : ['-y', '-v', 'error', '-i', src, '-vf', chain.vf!, '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out];
      try {
        execFileSync(FFMPEG, args, { timeout: 30000 });
        const probe = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
        if (probe !== '320,180' && probe !== '320,180,') bad.push(`${fx.id}: ${probe}`);
      } catch (e) {
        bad.push(`${fx.id}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  }, 120000);
});
