/**
 * 多机位音频对齐（clip-audio-sync）测试。
 *
 * 纯函数覆盖：已知位移的包络、完全一致、静音、maxLag 夹取；
 * ffmpeg 实跑覆盖：lavfi 合成「多段不同频率+不同颤音的正弦」A 与「1.2s 静音 + A」B，
 * 断言对齐到 1.2s（±0.25）。
 *
 * ★ 本机没有 ffmpeg 时整组实跑用例跳过；路径可用 YZ_FFMPEG_PATH 覆盖。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rmsEnvelope, findEnvelopeOffset, syncAudioFiles, formatSyncResult } from '../src/services/clip-audio-sync';

const FFMPEG = process.env.YZ_FFMPEG_PATH
  || path.join(process.env.APPDATA || '', 'yan-zhi', 'server-data', 'ffmpeg', 'ffmpeg.exe');
const HAS_FFMPEG = fs.existsSync(FFMPEG);

/** 确定性的“有起伏”包络（100 帧 = 10s，hop 0.1s）。 */
function makeEnvelope(frames: number): Float32Array {
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) env[i] = 0.2 + Math.abs(Math.sin(i * 1.7)) * 0.8;
  return env;
}

describe('findEnvelopeOffset · 纯函数', () => {
  it('B 前面补 12 个空包络（1.2s）→ offsetSec ≈ 1.2 且可信', () => {
    const a = makeEnvelope(100);
    const b = new Float32Array(112);
    b.set(a, 12);
    const r = findEnvelopeOffset(a, b);
    expect(r.offsetSec).toBeCloseTo(1.2, 6);
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.confident).toBe(true);
  });

  it('两条完全相同的包络 → offset 0', () => {
    const a = makeEnvelope(100);
    const b = a.slice();
    const r = findEnvelopeOffset(a, b);
    expect(r.offsetSec).toBe(0);
    expect(r.confident).toBe(true);
  });

  it('静音（方差≈0）不产生 NaN，返回不可信', () => {
    const a = new Float32Array(100);
    const b = new Float32Array(100);
    const r = findEnvelopeOffset(a, b);
    expect(Number.isFinite(r.offsetSec)).toBe(true);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.offsetSec).toBe(0);
    expect(r.confident).toBe(false);
  });

  it('空包络不抛错', () => {
    const r = findEnvelopeOffset(new Float32Array(0), new Float32Array(0));
    expect(r).toEqual({ offsetSec: 0, score: 0, confident: false });
  });

  it('maxLagSec 夹取到 0.5 下限：真位移 1.2s 时不会返回超出 ±0.5s 的结果', () => {
    const a = makeEnvelope(100);
    const b = new Float32Array(112);
    b.set(a, 12);
    const r = findEnvelopeOffset(a, b, { maxLagSec: 0.1 });
    expect(Math.abs(r.offsetSec)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('maxLagSec 放大到 1.2s 能找回真位移', () => {
    const a = makeEnvelope(100);
    const b = new Float32Array(112);
    b.set(a, 12);
    const r = findEnvelopeOffset(a, b, { maxLagSec: 1.2 });
    expect(r.offsetSec).toBeCloseTo(1.2, 6);
  });
});

describe('rmsEnvelope · 纯函数', () => {
  it('按 hop 分帧并归一化 Int16', () => {
    const sr = 8000;
    const pcm = new Int16Array(sr); // 1 秒
    for (let i = 0; i < pcm.length; i++) pcm[i] = i % 2 === 0 ? 16384 : -16384; // 满幅方波
    const env = rmsEnvelope(pcm, sr, 0.1);
    expect(env.length).toBe(10);
    for (const v of env) expect(v).toBeCloseTo(0.5, 3);
  });

  it('空输入返回空包络', () => {
    expect(rmsEnvelope(new Float32Array(0), 8000).length).toBe(0);
    expect(rmsEnvelope(new Int16Array(0), 8000).length).toBe(0);
  });
});

describe('syncAudioFiles · 文件边界（无需 ffmpeg）', () => {
  it('文件不存在 → ok:false 且错误可读', async () => {
    const r = await syncAudioFiles(
      path.join(os.tmpdir(), 'yz-not-exist-a.wav'),
      path.join(os.tmpdir(), 'yz-not-exist-b.wav'),
    );
    expect(r.ok).toBe(false);
    expect(r.error || '').toContain('文件不存在');
  });

  it('空路径 → ok:false', async () => {
    const r = await syncAudioFiles('', '');
    expect(r.ok).toBe(false);
    expect(r.error || '').toContain('路径不能为空');
  });
});

describe.skipIf(!HAS_FFMPEG)('syncAudioFiles · ffmpeg 实跑', () => {
  let tmp = '';
  let aWav = '';
  let bWav = '';
  let silentWav = '';

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-audio-sync-test-'));
    aWav = path.join(tmp, 'a.wav');
    bWav = path.join(tmp, 'b.wav');
    silentWav = path.join(tmp, 'silent.wav');

    // A：三段 2 秒、不同频率 + 不同颤音（能量包络各不相同，便于互相关定位）
    const segs: string[] = [];
    const specs: Array<[number, number]> = [[300, 1.7], [700, 4.3], [1200, 2.9]];
    specs.forEach(([freq, trem], i) => {
      const seg = path.join(tmp, `seg${i}.wav`);
      const expr = `0.5*sin(2*PI*${freq}*t)*(0.6+0.4*sin(2*PI*${trem}*t))`;
      execFileSync(FFMPEG, [
        '-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=2:s=8000`,
        '-ar', '8000', '-ac', '1', seg,
      ]);
      segs.push(seg);
    });
    execFileSync(FFMPEG, [
      '-y', '-v', 'error',
      '-i', segs[0], '-i', segs[1], '-i', segs[2],
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]', '-ar', '8000', '-ac', '1', aWav,
    ]);

    // B：1.2 秒静音 + A
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono:d=1.2',
      '-i', aWav,
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[out]',
      '-map', '[out]', '-ar', '8000', '-ac', '1', bWav,
    ]);

    // 静音素材：3 秒全静音
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono:d=3',
      '-ar', '8000', '-ac', '1', silentWav,
    ]);
  }, 120000);

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('「1.2s 静音 + A」对齐到 offsetSec ≈ 1.2，且可信', async () => {
    const r = await syncAudioFiles(aWav, bWav);
    expect(r.ok).toBe(true);
    expect(Math.abs((r.offsetSec ?? 0) - 1.2)).toBeLessThanOrEqual(0.25);
    expect(r.score ?? 0).toBeGreaterThan(0.55);
    expect(r.confident).toBe(true);
    expect(r.aUsedSec ?? 0).toBeGreaterThan(5);
    expect(r.bUsedSec ?? 0).toBeGreaterThan(5);
  }, 120000);

  it('同一文件自己对齐 → offset 0 且可信', async () => {
    const r = await syncAudioFiles(aWav, aWav);
    expect(r.ok).toBe(true);
    expect(r.offsetSec).toBe(0);
    expect(r.confident).toBe(true);
  }, 120000);

  it('静音素材 → ok:false 且说明静音', async () => {
    const r = await syncAudioFiles(silentWav, aWav);
    expect(r.ok).toBe(false);
    expect(r.error || '').toContain('静音');
  }, 120000);
});


describe('formatSyncResult · 符号解释（防再次写反）', () => {
  const base = { ok: true as const, score: 0.9, confident: true, aUsedSec: 10, bUsedSec: 10 };
  it('offset>0 → B 多出头部，裁 B 开头', () => {
    const msg = formatSyncResult({ ...base, offsetSec: 1.2 });
    expect(msg).toContain('裁掉 B 开头');
    expect(msg).not.toContain('裁掉 A 开头');
  });
  it('offset<0 → B 缺头部，裁 A 开头', () => {
    const msg = formatSyncResult({ ...base, offsetSec: -1.2 });
    expect(msg).toContain('裁掉 A 开头');
    expect(msg).not.toContain('裁掉 B 开头');
  });
});
