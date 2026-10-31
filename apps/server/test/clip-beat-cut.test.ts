import { describe, it, expect } from 'vitest';
import { planBeatCut, sliceKeyframes } from '../src/services/clip-beat-cut';
import type { ClipProject } from '../src/services/clip-project';

const proj = (clips: ClipProject['clips']): ClipProject => ({
  version: 1, name: 't', updatedAt: 0, output: { size: '1080x1920', fps: 30 }, clips, texts: [],
});

describe('planBeatCut · 一键卡点', () => {
  const p = proj([
    { id: 'c1', file: 'C:/a.mp4' },
    { id: 'c2', file: 'C:/b.mp4' },
  ]);
  const durations = { 'C:/a.mp4': 5, 'C:/b.mp4': 5 };
  const beats = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('按拍切段：段边界附近的拍点不切（留 minPiece 余量）', () => {
    const r = planBeatCut(p, durations, { beatTimes: beats });
    // 两段各在 1/2/3/4（段内）处切 4 刀 → 共 8 刀、10 片
    expect(r.cuts).toBe(8);
    expect(r.clips).toHaveLength(10);
    expect(new Set(r.clips.map((c) => c.id)).size).toBe(10);
  });

  it('切片首尾相接、完整覆盖原素材区间', () => {
    const r = planBeatCut(p, durations, { beatTimes: beats });
    const seg1 = r.clips.slice(0, 5);
    expect(seg1.map((c) => [c.trimStart, c.trimEnd])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
    const seg2 = r.clips.slice(5);
    expect(seg2.map((c) => [c.trimStart, c.trimEnd])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  });

  it('转场只挂"切出来的后一片"，每段第一片保留原转场', () => {
    const r = planBeatCut(p, durations, { beatTimes: beats, transition: { type: 'fade', duration: 0.15 } });
    expect(r.clips[0].transition).toBeUndefined();          // 原段没有转场
    expect(r.clips[1].transition).toEqual({ type: 'fade', duration: 0.15 });
    expect(r.clips[4].transition).toEqual({ type: 'fade', duration: 0.15 });
    expect(r.clips[5].transition).toBeUndefined();          // 第二段第一片
    expect(r.clips[6].transition).toEqual({ type: 'fade', duration: 0.15 });
  });

  it('everyNth=2：隔一拍切一次', () => {
    const r = planBeatCut(p, durations, { beatTimes: beats, everyNth: 2 });
    // 取第 0/2/4/6/8/10 拍 → 段内可用 2、4(边界)/6、8 → 每段 2 刀
    expect(r.cuts).toBe(4);
  });

  it('minPiece 太大时一刀都不切', () => {
    const r = planBeatCut(p, durations, { beatTimes: beats, minPieceSec: 2 });
    expect(r.cuts).toBe(0);
    expect(r.clips).toHaveLength(2);
  });

  it('曲线变速段整段跳过并报数（切开会让曲线每片重跑）', () => {
    const q = proj([{ id: 'c1', file: 'C:/a.mp4', speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 0.5 }] }]);
    const r = planBeatCut(q, { 'C:/a.mp4': 10 }, { beatTimes: beats });
    expect(r.skipped).toBe(1);
    expect(r.cuts).toBe(0);
    expect(r.clips[0].speedCurve).toBeTruthy();
  });

  it('关键帧随切点重映射（端点插值，不丢用户设置）', () => {
    const q = proj([{ id: 'c1', file: 'C:/a.mp4', keyframes: [{ t: 0, scale: 1 }, { t: 1, scale: 2 }] }]);
    const r = planBeatCut(q, { 'C:/a.mp4': 10 }, { beatTimes: [5] });
    expect(r.cuts).toBe(1);
    const a = r.clips[0].keyframes!;
    const b = r.clips[1].keyframes!;
    expect(a[0]).toMatchObject({ t: 0, scale: 1 });
    expect(a[a.length - 1].scale).toBeCloseTo(1.5, 3);   // 切点处的插值
    expect(b[0].scale).toBeCloseTo(1.5, 3);
    expect(b[b.length - 1]).toMatchObject({ t: 1, scale: 2 });
  });

  it('没有拍点落在段内时原样返回', () => {
    const r = planBeatCut(p, durations, { beatTimes: [0, 5, 10] });
    expect(r.cuts).toBe(0);
    expect(r.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('sliceKeyframes', () => {
  it('区间外无点 → 用端点插值造出两头锚点', () => {
    const kf = [{ t: 0, opacity: 0 }, { t: 1, opacity: 1 }];
    const out = sliceKeyframes(kf, 0.25, 0.75)!;
    expect(out[0]).toMatchObject({ t: 0 });
    expect(out[0].opacity).toBeCloseTo(0.25, 3);
    expect(out[out.length - 1].opacity).toBeCloseTo(0.75, 3);
  });

  it('无关键帧 / 空区间返回 undefined', () => {
    expect(sliceKeyframes(undefined, 0, 1)).toBeUndefined();
    expect(sliceKeyframes([{ t: 0, scale: 1.2 }], 0.5, 0.5)).toBeUndefined();
  });
});
