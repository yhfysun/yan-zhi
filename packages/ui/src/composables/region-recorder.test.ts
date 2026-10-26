import { describe, it, expect } from 'vitest';
import { computeRegionCrop, pickRecorderMime } from './region-recorder';

describe('computeRegionCrop（选区 → 视频帧裁剪）', () => {
  const display = { bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 2 };

  it('按实际帧宽/逻辑宽换算（不硬用 scaleFactor）', () => {
    // 采集帧被 Chromium 压到 1920 宽（不是 2560）→ 比例 1.5
    const c = computeRegionCrop(1920, 1080, display, { x: 100, y: 50, width: 400, height: 300 });
    expect(c).toEqual({ x: 150, y: 75, width: 600, height: 450, scale: 1.5 });
  });

  it('选区越界时夹到帧内，至少 1px', () => {
    const c = computeRegionCrop(1280, 720, display, { x: 1200, y: 700, width: 400, height: 300 });
    expect(c.x).toBeLessThanOrEqual(1279);
    expect(c.y).toBeLessThanOrEqual(719);
    expect(c.width).toBeGreaterThanOrEqual(1);
    expect(c.height).toBeGreaterThanOrEqual(1);
    expect(c.x + c.width).toBeLessThanOrEqual(1280);
    expect(c.y + c.height).toBeLessThanOrEqual(720);
  });

  it('显示信息缺失时按 1:1 处理，不抛错', () => {
    const c = computeRegionCrop(800, 600, { bounds: { x: 0, y: 0, width: 0, height: 0 }, scaleFactor: 1 }, { x: 10, y: 20, width: 100, height: 50 });
    expect(c).toEqual({ x: 10, y: 20, width: 100, height: 50, scale: 1 });
  });
});

describe('pickRecorderMime', () => {
  it('优先 vp9，退化 vp8，再退化裸 webm', () => {
    expect(pickRecorderMime((m) => m.includes('vp9'))).toBe('video/webm;codecs=vp9');
    expect(pickRecorderMime((m) => m.includes('vp8'))).toBe('video/webm;codecs=vp8');
    expect(pickRecorderMime((m) => m === 'video/webm')).toBe('video/webm');
  });

  it('全都不支持时返回空串（交给 MediaRecorder 自己选默认）', () => {
    expect(pickRecorderMime(() => false)).toBe('');
  });
});
