/**
 * 实时预览单测（apps/server/src/services/clip-preview）。
 *
 * ★★★ 为什么必须测 locateTimeline（2026-10-07「边剪辑边预览」）：
 *   它是"成片时间 → 哪一段 + 段内偏移"的换算，**预览取帧全靠它**。
 *   算错的症状：拖到某处看到的画面是别的位置的（或另一段素材的），
 *   而画面本身看着正常 —— 用户只会觉得"预览不准"，很难反馈成具体 bug。
 *
 * ★ ffmpeg 层面（真的能抽到帧、画面正确）由 tools/verify-live-preview.cjs 实跑核验。
 */
import { describe, it, expect } from 'vitest';
import { locateTimeline } from '../src/services/clip-preview';
import { createEmptyProject, applyClipOp, type ClipProject } from '../src/services/clip-project';

function proj(ops: Array<[string, Record<string, unknown>]>): ClipProject {
  let cur: ClipProject | null = createEmptyProject('t');
  for (const [op, args] of ops) {
    const r = applyClipOp(cur, op, args);
    if (!r.ok) throw new Error(`${op}: ${r.error}`);
    cur = r.project;
  }
  return cur!;
}

describe('locateTimeline · 成片时间 → 段定位', () => {
  it('★ 单段：段内偏移等于时间本身', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const loc = locateTimeline(p, 3.5, { 'C:/a.mp4': 10 });
    expect(loc).not.toBeNull();
    expect(loc!.segIndex).toBe(0);
    expect(loc!.offsetInSeg).toBeCloseTo(3.5);
    expect(loc!.trimStart).toBe(0);
  });

  it('★★ 多段：跨段边界要切到正确的段（这是最容易错的点）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }, { file: 'C:/b.mp4' }] }]]);
    const d = { 'C:/a.mp4': 10, 'C:/b.mp4': 3.5 };
    // 第一段内
    expect(locateTimeline(p, 5, d)!.segIndex).toBe(0);
    expect(locateTimeline(p, 5, d)!.offsetInSeg).toBeCloseTo(5);
    // 边界处（10.0）应进入第二段、偏移 0
    expect(locateTimeline(p, 10, d)!.segIndex).toBe(1);
    expect(locateTimeline(p, 10, d)!.offsetInSeg).toBeCloseTo(0);
    // 第二段内
    expect(locateTimeline(p, 12, d)!.segIndex).toBe(1);
    expect(locateTimeline(p, 12, d)!.offsetInSeg).toBeCloseTo(2);
  });

  it('★★ 裁剪 + 变速时偏移要按段内有效时长算，并且带出 speed/trimStart', () => {
    // 段1：裁 2~6s（4 秒）；段2：10s 素材 2 倍速（5 秒）
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4', trimStart: 2, trimEnd: 6 }, { file: 'C:/b.mp4', speed: 2 }] }]]);
    const d = { 'C:/a.mp4': 10, 'C:/b.mp4': 10 };
    const l1 = locateTimeline(p, 1, d)!;
    expect(l1.segIndex).toBe(0);
    expect(l1.speed).toBe(1);
    expect(l1.trimStart).toBe(2);   // ★ 取帧时要用它做素材内偏移
    // 段2 起点在第 4 秒
    const l2 = locateTimeline(p, 5, d)!;
    expect(l2.segIndex).toBe(1);
    expect(l2.offsetInSeg).toBeCloseTo(1);
    expect(l2.speed).toBe(2);       // ★ 素材内偏移 = 段内偏移 × speed
  });

  it('★ 超出成片范围时夹到最后一段末尾（不返回 null 让前端空白）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const loc = locateTimeline(p, 999, { 'C:/a.mp4': 10 });
    expect(loc).not.toBeNull();
    expect(loc!.segIndex).toBe(0);
    expect(loc!.offsetInSeg).toBeLessThanOrEqual(10);
  });

  it('★ 空工程返回 null（调用方据此报"还没有片段"）', () => {
    expect(locateTimeline(createEmptyProject('x'), 1, {})).toBeNull();
  });

  it('★ 时长为 0 的段被跳过（素材丢失时不能让定位卡在它上）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/missing.mp4' }, { file: 'C:/a.mp4' }] }]]);
    // missing 时长 0 → 应落到第二段
    const loc = locateTimeline(p, 1, { 'C:/missing.mp4': 0, 'C:/a.mp4': 10 });
    expect(loc!.segIndex).toBe(1);
  });

  it('★ 图片段用 kenburns 的 duration 作为段长', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/pic.png', kenburns: { direction: 'in', duration: 4 } }] }]]);
    const loc = locateTimeline(p, 3, {});
    expect(loc).not.toBeNull();
    expect(loc!.segIndex).toBe(0);
    expect(loc!.offsetInSeg).toBeCloseTo(3);
  });

  it('★ durations 按段 id 或文件路径都能查到（调用方两种键都可能给）', () => {
    const p = proj([['add_clip', { clips: [{ file: 'C:/a.mp4' }] }]]);
    const byId = locateTimeline(p, 2, { c1: 10 });
    const byFile = locateTimeline(p, 2, { 'C:/a.mp4': 10 });
    expect(byId!.offsetInSeg).toBeCloseTo(2);
    expect(byFile!.offsetInSeg).toBeCloseTo(2);
  });
});