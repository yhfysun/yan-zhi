/**
 * 节拍检测单测（apps/server/src/services/clip-beats）。
 *
 * 用**合成 PCM**（每 0.5s 一个短促击打）验证算法本身：
 *   · 120 BPM 的规则鼓点必须被识别出来，且 BPM 估算正确；
 *   · 静音/极短素材必须返回空（硬凑节拍会让用户切出一堆碎段）。
 * 真音频解码走 ffmpeg，属实跑层（`YZ_LIVE_MEDIA=1`）。
 */

import { describe, it, expect } from 'vitest';
import { detectBeats } from '../src/services/clip-beats';

const SR = 8000;

/** 生成规则击打：每 60/bpm 秒一次 10ms 的衰减脉冲（模拟鼓点）。 */
function clickTrack(bpm: number, seconds: number): Int16Array {
  const n = Math.floor(SR * seconds);
  const pcm = new Int16Array(n);
  const interval = 60 / bpm;
  for (let t = 0.1; t < seconds; t += interval) {
    const start = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.01; i++) {
      const idx = start + i;
      if (idx >= n) break;
      pcm[idx] = Math.round(24000 * Math.exp(-i / (SR * 0.003)));
    }
  }
  return pcm;
}

describe('节拍检测 · 纯算法', () => {
  it('识别 120 BPM 的规则鼓点', () => {
    const r = detectBeats(clickTrack(120, 10), SR);
    expect(r.beats.length).toBeGreaterThanOrEqual(15);
    expect(r.bpm).toBeGreaterThanOrEqual(110);
    expect(r.bpm).toBeLessThanOrEqual(130);
    // 相邻间隔应接近 0.5s
    const gaps = r.beats.slice(1).map((t, i) => t - r.beats[i]);
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    expect(median).toBeGreaterThan(0.42);
    expect(median).toBeLessThan(0.58);
  });

  it('识别 90 BPM', () => {
    const r = detectBeats(clickTrack(90, 10), SR);
    expect(r.bpm).toBeGreaterThanOrEqual(80);
    expect(r.bpm).toBeLessThanOrEqual(100);
  });

  it('静音不产生节拍', () => {
    const r = detectBeats(new Int16Array(SR * 5), SR);
    expect(r.beats).toEqual([]);
    expect(r.bpm).toBe(0);
  });

  it('极短素材直接返回空（不报错）', () => {
    const r = detectBeats(new Int16Array(100), SR);
    expect(r.beats).toEqual([]);
  });

  it('节拍点必须单调递增且间隔 ≥ 0.18s', () => {
    const r = detectBeats(clickTrack(140, 8), SR);
    for (let i = 1; i < r.beats.length; i++) {
      expect(r.beats[i] - r.beats[i - 1]).toBeGreaterThanOrEqual(0.18 - 1e-6);
    }
  });
});
