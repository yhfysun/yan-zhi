/**
 * 智能剪口播（P2-5）纯函数单测。
 *
 * ★ 这组测试守的是"剪完不跑偏"：
 *   ① 删除区间必须来自真实语音间隙（阈值/边距/夹取都对）；
 *   ② 切段只保留首尾的进入/离开语义（转场/淡入淡出不能每段重复）；
 *   ③ ripple 必须把字幕/画中画等成片时间字段一起前移，否则剪完字幕整体错位。
 */
import { describe, it, expect } from 'vitest';
import { createEmptyProject, type ClipProject, type ClipSegment } from '../src/services/clip-project';
import {
  planTalkingCut, isFillerCue, splitSegmentByKeeps, sourceCutsToFilm,
  removedBefore, rippleTimelineLayers,
} from '../src/services/clip-talking-cut';

const cue = (start: number, end: number, text = '字') => ({ start, end, text });

function baseSeg(over: Partial<ClipSegment> = {}): ClipSegment {
  return {
    id: 'c1', file: 'C:/a.mp4', trimStart: 2, trimEnd: 10, speed: 2,
    volume: 0.8, transition: { type: 'fade', duration: 0.3 }, fadeIn: 0.4, fadeOut: 0.5,
    ...over,
  };
}

describe('isFillerCue · 语气词判定', () => {
  it('纯语气词/标点 → true；有实词 → false', () => {
    expect(isFillerCue('嗯。')).toBe(true);
    expect(isFillerCue('啊？')).toBe(true);
    expect(isFillerCue('，。')).toBe(true);
    expect(isFillerCue('')).toBe(true);
    expect(isFillerCue('你好')).toBe(false);
    expect(isFillerCue('好的嗯')).toBe(false);   // 句尾夹带的语气词不单独切（需要逐字时间戳）
    expect(isFillerCue('哈哈')).toBe(false);     // 故意不收「哈」：笑声可能是有意义的
  });
});

describe('planTalkingCut · 静音规划', () => {
  it('★ 首尾静音：保留语音 ± padding，首尾各切一刀', () => {
    const p = planTalkingCut([cue(2, 4)], { start: 0, end: 5.2 }, { minSilence: 0.6, padding: 0.12 });
    expect(p.ok).toBe(true);
    expect(p.keeps).toEqual([{ start: 1.88, end: 4.12 }]);
    expect(p.cuts.map((c) => c.reason)).toEqual(['lead', 'tail']);
    expect(p.cuts[0]).toMatchObject({ start: 0, end: 1.88 });
    expect(p.cuts[1]).toMatchObject({ start: 4.12, end: 5.2 });
    expect(p.speechSec).toBe(2);
    expect(p.removedSec).toBeCloseTo(2.96, 3);
  });

  it('短停顿（< 阈值）不切：正常换气不该被剪碎', () => {
    const p = planTalkingCut([cue(0, 1), cue(1.4, 2.5)], { start: 0, end: 2.5 }, { minSilence: 0.6 });
    expect(p.ok).toBe(true);
    expect(p.cuts).toEqual([]);
    expect(p.keeps.length).toBe(1);
    expect(p.removedSec).toBe(0);
  });

  it('长停顿（≥ 阈值）切掉，原因 gap', () => {
    const p = planTalkingCut([cue(0, 1), cue(2, 3)], { start: 0, end: 3 }, { minSilence: 0.6, padding: 0.12 });
    expect(p.keeps).toEqual([{ start: 0, end: 1.12 }, { start: 1.88, end: 3 }]);
    expect(p.cuts).toHaveLength(1);
    expect(p.cuts[0]).toMatchObject({ start: 1.12, end: 1.88, reason: 'gap' });
    expect(p.removedSec).toBeCloseTo(0.76, 3);
  });

  it('★ 纯语气词 cue 被剔除，缺口原因标 filler 并带上原文', () => {
    const p = planTalkingCut(
      [cue(0, 1, '你好'), cue(1.2, 1.8, '嗯。'), cue(2.4, 3.4, '继续')],
      { start: 0, end: 3.4 },
      { minSilence: 0.6, padding: 0.12 },
    );
    expect(p.keeps).toEqual([{ start: 0, end: 1.12 }, { start: 2.28, end: 3.4 }]);
    expect(p.cuts).toHaveLength(1);
    expect(p.cuts[0]).toMatchObject({ start: 1.12, end: 2.28, reason: 'filler', text: '嗯。' });
  });

  it('关闭「删语气词」后，语气词 cue 当普通语音保留', () => {
    const p = planTalkingCut(
      [cue(0, 1, '你好'), cue(1.2, 1.8, '嗯。'), cue(2.4, 3.4, '继续')],
      { start: 0, end: 3.4 },
      { minSilence: 0.6, padding: 0.12, removeFillers: false },
    );
    // 0~1.2 合并（0.2s 停顿），1.8~2.4 是 0.6s → 切；原因不是 filler
    expect(p.cuts).toHaveLength(1);
    expect(p.cuts[0].reason).toBe('gap');
  });

  it('全是语气词 → 明确报错（不产出"全删光"的方案）', () => {
    const p = planTalkingCut([cue(0, 0.8, '嗯。')], { start: 0, end: 2 });
    expect(p.ok).toBe(false);
    expect(p.error).toContain('语气词');
  });

  it('没有 cue / 片段范围非法 → 报错而不是空方案', () => {
    expect(planTalkingCut([], { start: 0, end: 2 }).ok).toBe(false);
    expect(planTalkingCut([cue(0, 1)], { start: 2, end: 2 }).ok).toBe(false);
  });

  it('cue 超出片段范围 → 夹到范围内', () => {
    const p = planTalkingCut([cue(-1, 1), cue(1.5, 9)], { start: 0, end: 2 }, { minSilence: 0.6, padding: 0.12 });
    expect(p.keeps).toEqual([{ start: 0, end: 2 }]);
    expect(p.cuts).toEqual([]);
  });

  it('切点过多 → 拒绝并提示调大阈值（防止把时间轴炸成筛子）', () => {
    const p = planTalkingCut(
      [cue(0, 1), cue(2, 3), cue(4, 5)],
      { start: 0, end: 5 },
      { minSilence: 0.6, padding: 0.1, maxCuts: 1 },
    );
    expect(p.ok).toBe(false);
    expect(p.error).toContain('上限');
  });
});

describe('splitSegmentByKeeps · 切段', () => {
  it('★ 保留首尾进入/离开语义：转场与淡入只给第一片，淡出只给最后一片', () => {
    const r = splitSegmentByKeeps(baseSeg(), [{ start: 2, end: 4 }, { start: 6, end: 10 }], (i) => `c1-k${i + 1}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.segments;
    expect(a).toMatchObject({ id: 'c1-k1', trimStart: 2, trimEnd: 4, speed: 2, volume: 0.8 });
    expect(a.transition).toBeDefined();
    expect(a.fadeIn).toBeDefined();
    expect(a.fadeOut).toBeUndefined();
    expect(b).toMatchObject({ id: 'c1-k2', trimStart: 6, trimEnd: 10, speed: 2 });
    expect(b.transition).toBeUndefined();
    expect(b.fadeIn).toBeUndefined();
    expect(b.fadeOut).toBe(0.5);
  });

  it('曲线变速 / 段级关键帧 / 图片片段 → 拒绝并说明原因', () => {
    expect(splitSegmentByKeeps(baseSeg({ speedCurve: [{ t: 0, speed: 1 }] }), [{ start: 2, end: 4 }], () => 'x').ok).toBe(false);
    expect(splitSegmentByKeeps(baseSeg({ keyframes: [{ t: 0, scale: 1 }] }), [{ start: 2, end: 4 }], () => 'x').ok).toBe(false);
    expect(splitSegmentByKeeps(baseSeg({ file: 'C:/a.png' }), [{ start: 2, end: 4 }], () => 'x').ok).toBe(false);
  });

  it('空保留区间 → 拒绝', () => {
    const r = splitSegmentByKeeps(baseSeg(), [], () => 'x');
    expect(r.ok).toBe(false);
  });
});

describe('sourceCutsToFilm · 源时间 → 成片时间', () => {
  it('叠加片段起点并按倍速换算', () => {
    const film = sourceCutsToFilm([{ start: 4, end: 6 }], { trimStart: 2, speed: 2, clipStartFilm: 10 });
    expect(film).toEqual([{ start: 11, end: 12 }]);
  });
});

describe('removedBefore · 累计删除量', () => {
  const removals = [{ start: 5, end: 6 }, { start: 8, end: 10 }];
  it('删除点之前 0；区间内部分累计；之后全额', () => {
    expect(removedBefore(removals, 4)).toBe(0);
    expect(removedBefore(removals, 5.5)).toBeCloseTo(0.5, 6);
    expect(removedBefore(removals, 9)).toBeCloseTo(2, 6);
    expect(removedBefore(removals, 20)).toBeCloseTo(3, 6);
  });
});

describe('rippleTimelineLayers · 图层随剪辑前移', () => {
  function projectWithLayers(): ClipProject {
    const p = createEmptyProject('t');
    p.texts = [
      { id: 't1', text: '前', start: 1, end: 2 },          // 删除点之前 → 不动
      { id: 't2', text: '后', start: 6, end: 8 },          // 跨删除区间 → 时长缩短
      { id: 't3', text: '嗯', start: 8.2, end: 8.8 },      // 完全在删除区间 → 移除
    ];
    p.overlays = [{ id: 'o1', file: 'C:/p.mp4', start: 5.5, end: 7 }];
    p.stickers = [{ id: 's1', file: 'C:/s.png', start: 9, end: 12 }];
    p.audios = [{ id: 'a1', file: 'C:/a.wav', start: 0.5, end: 1.5 }];
    p.effects = [{ id: 'e1', fx: 'flash', start: 7.5, end: 8.5 }];
    return p;
  }

  it('★ 前移 + 跨区间缩短 + 区间内移除，并返回数量', () => {
    const p = projectWithLayers();
    const r = rippleTimelineLayers(p, [{ start: 5, end: 6 }, { start: 8, end: 10 }]);

    // t1 不动；t2 跨两个删除点 → 6→5、8→7（8 这一刻删除还没开始）；t3 整体在 8~10 内 → 移除
    expect(p.texts.find((t) => t.id === 't1')).toMatchObject({ start: 1, end: 2 });
    expect(p.texts.find((t) => t.id === 't2')).toMatchObject({ start: 5, end: 7 });
    expect(p.texts.find((t) => t.id === 't3')).toBeUndefined();
    // 画中画 5.5~7 → 5~6
    expect(p.overlays![0]).toMatchObject({ start: 5, end: 6 });
    // 贴纸 9~12 → 7~9（两段删除共 3s）
    expect(p.stickers![0]).toMatchObject({ start: 7, end: 9 });
    // 音频在删除点之前 → 不动
    expect(p.audios![0]).toMatchObject({ start: 0.5, end: 1.5 });
    // 特效 7.5~8.5 → 6.5~7（起点前移 1，终点跨过 8s 后前移 1.5）
    const fx = p.effects![0];
    expect(fx.start).toBeCloseTo(6.5, 3);
    expect(fx.end).toBeCloseTo(7, 3);
    expect(r.dropped).toBe(1);
    expect(r.shifted).toBeGreaterThanOrEqual(4);
  });

  it('没有删除区间 → 原样返回', () => {
    const p = projectWithLayers();
    const r = rippleTimelineLayers(p, []);
    expect(r).toEqual({ shifted: 0, dropped: 0 });
    expect(p.texts.length).toBe(3);
  });
});
