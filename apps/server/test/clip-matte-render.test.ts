/**
 * 智能抠像接入渲染（P2-1）单测 + 不依赖模型的合成 e2e。
 *
 * 覆盖：
 *   ① matteCacheKey：源文件/裁剪/背景/颜色/羽化/帧率/模型任一变化 → 键变；同输入稳定；
 *   ② normalizeMatte：背景缺省/非法、颜色仅绿幕、羽化 0~20、fps 5~15、model 裁剪；
 *   ③ deriveMatteSegment：trim 重基 0~段长、去掉 matte、保留 speed/volume/label；
 *   ④ composeMatteWithMask（本机有 ffmpeg 才跑）：绿幕背景 + 完美蒙版 →
 *      角落背景变绿、主体保留原色、音轨保留、时长正确；
 *   ⑤ 无 matte 工程的渲染计划不含任何抠像步骤（纯函数零变化）；
 *   ⑥ 缺模型时 materialize 返回可读错误（绝不静默跳过）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyClipOp, createEmptyProject, normalizeMatte, type ClipProject } from '../src/services/clip-project';
import { buildRenderPlan } from '../src/services/clip-render';
import {
  matteCacheKey, effectiveMatte, deriveMatteSegment, composeMatteWithMask, materializeSegmentMatte,
} from '../src/services/clip-matte-render';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');

function proj(ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur: ClipProject | null = createEmptyProject('t');
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`${op}: ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

// ════════════════════════════════════════════════════════════════════════════
// ① 缓存键
// ════════════════════════════════════════════════════════════════════════════
describe('matteCacheKey · 每个影响画面的字段都失效', () => {
  const stat = { size: 12345, mtimeMs: 1700000000000 };
  const baseSeg = {
    id: 'c1', file: 'C:/v/a.mp4', trimStart: 1, trimEnd: 5,
    matte: { background: 'green' as const, color: '#00FF00', feather: 2, fps: 10, model: 'u2netp' },
  };

  it('同输入稳定；各字段变化都换键', () => {
    const base = matteCacheKey(baseSeg, { sourceStat: stat, modelId: 'u2netp' });
    expect(matteCacheKey(baseSeg, { sourceStat: stat, modelId: 'u2netp' })).toBe(base);
    const variants = [
      { ...baseSeg, file: 'C:/v/b.mp4' },
      { ...baseSeg, trimStart: 0 },
      { ...baseSeg, trimEnd: 6 },
      { ...baseSeg, matte: { ...baseSeg.matte, background: 'black' as const } },
      { ...baseSeg, matte: { ...baseSeg.matte, color: '#0000FF' } },
      { ...baseSeg, matte: { ...baseSeg.matte, feather: 8 } },
      { ...baseSeg, matte: { ...baseSeg.matte, fps: 12 } },
      { ...baseSeg, matte: { ...baseSeg.matte, model: 'u2net' } },
    ];
    for (const v of variants) {
      expect(matteCacheKey(v, { sourceStat: stat, modelId: 'u2netp' })).not.toBe(base);
    }
    // 源文件 size/mtime 变化同样失效（同路径换了内容）
    expect(matteCacheKey(baseSeg, { sourceStat: { ...stat, size: 1 }, modelId: 'u2netp' })).not.toBe(base);
    expect(matteCacheKey(baseSeg, { sourceStat: { ...stat, mtimeMs: 1 }, modelId: 'u2netp' })).not.toBe(base);
    // 运行时解析到的模型 id 也进键（auto 时不同模型不能复用同一份合成）
    expect(matteCacheKey(baseSeg, { sourceStat: stat, modelId: 'u2net' })).not.toBe(base);
  });

  it('effectiveMatte 缺省值 / 夹取', () => {
    expect(effectiveMatte(undefined)).toMatchObject({ background: 'black', feather: 0, fps: 10 });
    expect(effectiveMatte({ background: 'green' })).toMatchObject({ background: 'green', color: '#00FF00' });
    expect(effectiveMatte({ background: 'green', color: '#123456' })).toMatchObject({ color: '#123456' });
    expect(effectiveMatte({ background: 'white', color: '#123456' }).color).toBeUndefined();
    expect(effectiveMatte({ feather: 99 })).toMatchObject({ feather: 20 });
    expect(effectiveMatte({ fps: 1 })).toMatchObject({ fps: 5 });
    expect(effectiveMatte({ fps: 99 })).toMatchObject({ fps: 15 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ② 归一化
// ════════════════════════════════════════════════════════════════════════════
describe('normalizeMatte · 白名单与范围', () => {
  it('空对象 = 启用（全默认）', () => {
    expect(normalizeMatte({})).toEqual({});
  });

  it('非法背景 → black（不写字段）', () => {
    expect(normalizeMatte({ background: 'rainbow' })).toEqual({});
    expect(normalizeMatte({ background: 'white' })).toEqual({ background: 'white' });
  });

  it('颜色只在绿幕时收；非法颜色丢弃；默认绿不写', () => {
    expect(normalizeMatte({ background: 'green', color: '#ff0000' })).toEqual({ background: 'green', color: '#FF0000' });
    expect(normalizeMatte({ background: 'green', color: 'red' })).toEqual({ background: 'green' });
    expect(normalizeMatte({ background: 'green', color: '#00FF00' })).toEqual({ background: 'green' });
    expect(normalizeMatte({ background: 'black', color: '#FF0000' })).toEqual({});
  });

  it('羽化 0~20、fps 5~15；默认值不写', () => {
    expect(normalizeMatte({ feather: 50 })).toEqual({ feather: 20 });
    expect(normalizeMatte({ feather: -3 })).toEqual({});
    expect(normalizeMatte({ fps: 1 })).toEqual({ fps: 5 });
    expect(normalizeMatte({ fps: 99 })).toEqual({ fps: 15 });
    expect(normalizeMatte({ fps: 10 })).toEqual({});
  });

  it('model 去空格；非对象 → null（关闭）', () => {
    expect(normalizeMatte({ model: '  u2netp ' })).toEqual({ model: 'u2netp' });
    expect(normalizeMatte(null)).toBeNull();
    expect(normalizeMatte([])).toBeNull();
    expect(normalizeMatte('x')).toBeNull();
  });

  it('add_clip / update_clip 写入与清除', () => {
    const p = proj([
      ['add_clip', { clips: [{ file: 'C:/v/a.mp4', matte: { background: 'blur', feather: 3 } }] }],
    ]);
    expect(p.clips[0].matte).toEqual({ background: 'blur', feather: 3 });
    const up = applyClipOp(p, 'update_clip', { id: 'c1', patch: { matte: { background: 'green', color: '#12AB34' } } });
    expect(up.ok).toBe(true);
    if (up.ok) expect(up.project.clips[0].matte).toEqual({ background: 'green', color: '#12AB34' });
    const off = up.ok ? applyClipOp(up.project, 'update_clip', { id: 'c1', patch: { matte: null } }) : null;
    expect(off?.ok).toBe(true);
    if (off?.ok) expect(off.project.clips[0].matte).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ③ 派生段
// ════════════════════════════════════════════════════════════════════════════
describe('deriveMatteSegment · 只换文件与 trim', () => {
  it('trim 重基 0~段长、去掉 matte、保留其余字段', () => {
    const seg = {
      id: 'c7', file: 'C:/v/a.mp4', label: '主角', trimStart: 12, trimEnd: 15,
      speed: 0.5, volume: 0.8, audioFile: 'C:/a.mp3', keepOriginalAudio: true,
      matte: { background: 'green' as const },
    };
    const d = deriveMatteSegment(seg, 'C:/cache/composite-x.mp4', 3);
    expect(d.file).toBe('C:/cache/composite-x.mp4');
    expect(d.trimStart).toBe(0);
    expect(d.trimEnd).toBe(3);
    expect(d.label).toBe('主角');
    expect(d.speed).toBe(0.5);
    expect(d.volume).toBe(0.8);
    expect(d.audioFile).toBe('C:/a.mp3');
    expect(d.keepOriginalAudio).toBe(true);
    expect(d.matte).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ④ 合成 e2e（不依赖任何 ONNX 模型）
// ════════════════════════════════════════════════════════════════════════════
function pixelAt(file: string, x: number, y: number): [number, number, number] {
  const buf = execFileSync(FFMPEG, [
    '-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1',
    '-vf', `crop=4:4:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ]);
  return [buf[0], buf[1], buf[2]];
}

function probeStreams(file: string): { hasAudio: boolean; duration: number } {
  const out = execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'stream=codec_type',
    '-show_entries', 'format=duration', '-of', 'json', file,
  ]).toString();
  const j = JSON.parse(out) as { streams?: Array<{ codec_type?: string }>; format?: { duration?: string } };
  return {
    hasAudio: (j.streams || []).some((s) => s.codec_type === 'audio'),
    duration: Number(j.format?.duration) || 0,
  };
}

describe.skipIf(!HAS_FFMPEG)('composeMatteWithMask · 完美蒙版合成（无模型）', () => {
  let tmp = '';
  let source = '';
  let mask = '';
  let out = '';

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-matte-compose-'));
    source = path.join(tmp, 'source.mp4');
    mask = path.join(tmp, 'mask.mp4');
    out = path.join(tmp, 'out.mp4');
    // 源：蓝底 + 居中红矩形（主体）+ 440Hz 音轨；蒙版：同尺寸黑底 + 同位置白矩形
    execFileSync(FFMPEG, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2:r=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-vf', 'drawbox=x=80:y=60:w=160:h=120:color=red:t=fill',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source,
    ]);
    execFileSync(FFMPEG, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=10',
      '-vf', 'drawbox=x=80:y=60:w=160:h=120:color=white:t=fill',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mask,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('绿幕背景：角落变绿、主体保留原色、音轨与时长保留', async () => {
    const r = await composeMatteWithMask({
      ffmpeg: FFMPEG, sourceFile: source, maskFile: mask, outFile: out,
      width: 320, height: 240, fps: 10, background: 'green', feather: 2,
    });
    expect(r.ok, r.error).toBe(true);

    const corner = pixelAt(out, 10, 10);
    expect(corner[1]).toBeGreaterThan(100);            // 绿通道高
    expect(corner[0]).toBeLessThan(90);                // 红通道低
    expect(corner[2]).toBeLessThan(90);                // 蓝通道低

    const subject = pixelAt(out, 160, 120);
    expect(subject[0]).toBeGreaterThan(100);           // 主体仍是红
    expect(subject[0]).toBeGreaterThan(subject[1] + 30);
    expect(subject[0]).toBeGreaterThan(subject[2] + 30);

    const meta = probeStreams(out);
    expect(meta.hasAudio).toBe(true);
    expect(meta.duration).toBeGreaterThan(1.7);
    expect(meta.duration).toBeLessThan(2.3);
  }, 180000);

  it('blur 背景：角落不是绿色（原画面模糊仍在），主体仍是红', async () => {
    const out2 = path.join(tmp, 'out-blur.mp4');
    const r = await composeMatteWithMask({
      ffmpeg: FFMPEG, sourceFile: source, maskFile: mask, outFile: out2,
      width: 320, height: 240, fps: 10, background: 'blur', feather: 0,
    });
    expect(r.ok, r.error).toBe(true);
    const corner = pixelAt(out2, 10, 10);
    expect(corner[2]).toBeGreaterThan(60);             // 蓝底（模糊后仍是蓝）
    expect(corner[2]).toBeGreaterThan(corner[0] + 20);
    const subject = pixelAt(out2, 160, 120);
    expect(subject[0]).toBeGreaterThan(subject[1] + 30);
  }, 180000);
});

// ════════════════════════════════════════════════════════════════════════════
// ⑤ 无 matte 工程：渲染计划零变化
// ════════════════════════════════════════════════════════════════════════════
describe('无 matte 路径', () => {
  it('渲染计划里没有任何抠像/alphamerge 步骤', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/v/a.mp4', colorPreset: 'warm' }] }]]);
    expect(p.clips[0].matte).toBeUndefined();
    const r = buildRenderPlan({
      project: p, durations: { c1: 2, 'C:/v/a.mp4': 2 },
      hasAudio: { c1: false, 'C:/v/a.mp4': false },
      workDir: path.join(os.tmpdir(), 'yz-matte-plan-test'),
      outFile: path.join(os.tmpdir(), 'yz-matte-plan-test-out.mp4'),
      cover: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.totalDuration).toBe(2);
    const all = r.plan.steps.flatMap((s) => s.args).join(' ');
    expect(all).not.toContain('alphamerge');
    expect(all).not.toContain('composite-');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ⑥ 缺模型 → 可读错误（不静默跳过）
// ════════════════════════════════════════════════════════════════════════════
describe('materializeSegmentMatte · 失败必须可读', () => {
  it('缺模型 → ok:false 且含放置/下载指引', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-matte-missing-'));
    const src = path.join(tmp, 'a.mp4');
    fs.writeFileSync(src, 'not-a-real-video');
    const origDataDir = process.env.DATA_DIR;
    const origModel = process.env.YZ_MATTE_MODEL;
    const origPython = process.env.YZ_CLIP_PYTHON;
    process.env.DATA_DIR = tmp;
    delete process.env.YZ_MATTE_MODEL;
    // 用 node 当"Python"：import cv2 必然失败，探测快速返回"运行时未就绪"
    process.env.YZ_CLIP_PYTHON = process.execPath;
    try {
      const r = await materializeSegmentMatte(
        { id: 'c1', file: src, matte: { background: 'green' } },
        { ffmpeg: FFMPEG || 'ffmpeg' },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain('智能抠像不可用');
        expect(r.error).toContain('模型');
      }
    } finally {
      if (origDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = origDataDir;
      if (origModel === undefined) delete process.env.YZ_MATTE_MODEL; else process.env.YZ_MATTE_MODEL = origModel;
      if (origPython === undefined) delete process.env.YZ_CLIP_PYTHON; else process.env.YZ_CLIP_PYTHON = origPython;
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }, 60000);
});
