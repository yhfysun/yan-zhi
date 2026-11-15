// 编曲服务回归 v2（learning/music/arrange.ts + compositions.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离）。
// docs/音乐双方向重构方案-2026-11-15.md §八：自动编曲可复现可编辑 / AI spec 分域硬闸 /
// 谱面 ↔ spec 往返等价 / 作品 CRUD 用户隔离。
import { describe, it, expect } from 'vitest';
import { scoreToSpec, specToScore, autoArrange, validateAiSpec } from '../src/learning/music/arrange';
import { getMusicScore } from '../src/learning/music/scores';
import {
  createComposition, listCompositions, getComposition, updateComposition, deleteComposition,
} from '../src/learning/music/compositions';
import { buildSubjectLearningContextSummary } from '../src/learning/context';
import type { NoteEvent, Score } from '../src/learning/music/types';

const uidA = `comp-user-a-${Date.now()}`;
const uidB = `comp-user-b-${Date.now()}`;

const PENTA_STEPS = ['C', 'D', 'E', 'G', 'A'];

function beatsOf(score: Score): number {
  return score.notes.reduce((s, n) => s + n.beats, 0);
}

describe('scoreToSpec / specToScore（谱面 ↔ 编曲决定的唯一通道）', () => {
  it('★ 小星星 → spec：melody 逐音对应、style=gentle、chords=C 系、bars 铺满', () => {
    const twinkle = getMusicScore('score_twinkle_w')!;
    const spec = scoreToSpec(twinkle, 42);
    expect(spec.bpm).toBe(96);
    expect(spec.bars).toBe(4);
    expect(spec.style).toBe('gentle');
    expect(spec.chords).toEqual(['C', 'G', 'Am', 'F']);
    expect(spec.seed).toBe(42);
    expect(spec.melody!.length).toBe(twinkle.notes.filter((n) => !n.rest).length);
    expect(spec.melody![0]).toEqual({ start: 0, len: 1, pitch: 'C4' });
  });

  it('★ 传统曲目 → spec：style=cn、国风乐器、chords 是 C 宫系统口径', () => {
    const moli = getMusicScore('score_moli')!;
    const spec = scoreToSpec(moli, 7);
    expect(spec.style).toBe('cn');
    expect(spec.instruments).toMatchObject({ keys: 'guzheng', lead: 'dizi', pad: 'erhu' });
    expect(spec.chords!.every((c) => ['C', 'Am', 'F', 'G'].includes(c))).toBe(true);
  });

  it('★ specToScore 往返：白键旋律 step/octave/beats 与原谱一致；黑键 pitch 落升号侧', () => {
    const twinkle = getMusicScore('score_twinkle_w')!;
    const back = specToScore(scoreToSpec(twinkle, 1), 'western', 't1', 'twinkle-back', twinkle.mode);
    expect(back.notes.length).toBe(twinkle.notes.length);
    back.notes.forEach((n, i) => {
      expect(n.step, `#${i}`).toBe(twinkle.notes[i].step);
      expect(n.octave, `#${i}`).toBe(twinkle.notes[i].octave);
      expect(n.beats, `#${i}`).toBe(twinkle.notes[i].beats);
    });
    const sharp = specToScore({ title: '', melody: [{ start: 0, len: 1, pitch: 'F#5' }] } as never, 'western', 't2', 'sharp', { kind: 'major', tonic: 'C' });
    expect(sharp.notes[0]).toMatchObject({ step: 'F', alter: 1, octave: 5 });
  });
});

describe('autoArrange（规则自动编曲：可复现、可编辑、不越体系）', () => {
  it('★ 同 seed 逐音符相同（可复现），换 seed 不同', () => {
    const a1 = autoArrange({ track: 'western', mode: { kind: 'major', tonic: 'C' }, bars: 8, seed: 1 });
    const a2 = autoArrange({ track: 'western', mode: { kind: 'major', tonic: 'C' }, bars: 8, seed: 1 });
    const a3 = autoArrange({ track: 'western', mode: { kind: 'major', tonic: 'C' }, bars: 8, seed: 2 });
    expect(a2.notes).toEqual(a1.notes);
    expect(a3.notes).not.toEqual(a1.notes);
  });

  it('★ 铺满整数小节、收束落在主音（大调收 C、小调收 A、五声收宫）', () => {
    const w = autoArrange({ track: 'western', mode: { kind: 'major', tonic: 'C' }, bars: 8, seed: 9 });
    expect(beatsOf(w)).toBe(32);
    expect(w.notes.at(-1)!.step).toBe('C');
    const minor = autoArrange({ track: 'western', mode: { kind: 'minor', tonic: 'A' }, bars: 8, seed: 9 });
    expect(minor.notes.at(-1)!.step).toBe('A');
    const t = autoArrange({ track: 'traditional', mode: { kind: 'pentatonic', tonic: 'gong' }, bars: 8, seed: 9 });
    expect(beatsOf(t)).toBe(32);
    expect(t.notes.at(-1)!.step).toBe('C');
  });

  it('★ traditional 产物全在五声集（不越体系）', () => {
    const t = autoArrange({ track: 'traditional', mode: { kind: 'pentatonic', tonic: 'yu' }, bars: 8, seed: 5 });
    for (const [i, n] of t.notes.entries()) {
      expect(PENTA_STEPS, `#${i}`).toContain(n.step);
      expect(n.alter ?? 0, `#${i}`).toBe(0);
    }
  });
});

describe('validateAiSpec（AI 输出分域硬闸：非法一律回落）', () => {
  const goodMelody = [
    { start: 0, len: 1, pitch: 'C5' }, { start: 1, len: 1, pitch: 'A4' },
    { start: 2, len: 2, pitch: 'G4' }, { start: 4, len: 4, pitch: 'C5' },
  ];

  it('★ 非 JSON / 无旋律 / 和弦不可解析 → fallbackReason', () => {
    expect(validateAiSpec(null, 'western').fallbackReason).toBeTruthy();
    expect(validateAiSpec({ melody: [] }, 'western').fallbackReason).toBeTruthy();
    expect(validateAiSpec({ melody: goodMelody, chords: ['X13'] }, 'western').fallbackReason).toContain('和弦');
    expect(validateAiSpec({ melody: [{ start: 0, len: 1, pitch: 'H4' }] }, 'western').fallbackReason).toContain('不合法');
  });

  it('★ 分域：traditional 旋律出现五声外音 / style 不是国风系 → 拒；western style=cn → 拒', () => {
    expect(validateAiSpec({ style: 'cn', melody: goodMelody }, 'western').fallbackReason).toContain('国风');
    expect(validateAiSpec({ style: 'edm', melody: goodMelody }, 'traditional').fallbackReason).toContain('style');
    expect(validateAiSpec({ style: 'cn', melody: [{ start: 0, len: 1, pitch: 'F4' }] }, 'traditional').fallbackReason).toContain('五声外');
    const okTrad = validateAiSpec({ style: 'cn', title: '小曲', melody: goodMelody }, 'traditional');
    expect(okTrad.spec).toBeTruthy();
    expect(okTrad.spec!.melody!.length).toBe(4);
  });

  it('★ 合法 western spec 通过（style gentle、白键旋律）', () => {
    const ok = validateAiSpec({ style: 'gentle', title: 'Joy', melody: goodMelody }, 'western');
    expect(ok.spec).toBeTruthy();
    expect(ok.fallbackReason).toBeUndefined();
  });
});

describe('学习上下文 · 音乐方向分域注入（context.ts）', () => {
  it('★ 从课时 id 前缀推断方向并注入分域提示；无音乐课时不注入', () => {
    const mixed = buildSubjectLearningContextSummary({
      subject: '音乐',
      recentLessons: ['mus_w_staff', 'mus_w_names', 'mus_t_gongche'],
      topErrors: [],
    });
    expect(mixed).toContain('[学习档案-音乐·方向]');
    expect(mixed).toContain('现代通用乐理（western）×2');
    expect(mixed).toContain('中国传统音乐（traditional）×1');
    const none = buildSubjectLearningContextSummary({ subject: '音乐', recentLessons: ['xxx_other'], topErrors: [] });
    expect(none).not.toContain('[学习档案-音乐·方向]');
  });

  it('传统文化不注入方向块（对句薄弱点语义不变）', () => {
    const out = buildSubjectLearningContextSummary({
      subject: '传统文化',
      recentLessons: ['mus_w_staff'],
      topErrors: [{ wrong: '山对水', right: '山对海' }],
    });
    expect(out).not.toContain('[学习档案-音乐·方向]');
    expect(out).toContain('[对句薄弱点]');
  });
});

describe('编曲作品 CRUD（learning_composition · 用户隔离）', () => {
  const score = (id: string): Score => ({
    id, title: `小曲 ${id}`, track: 'western', clef: 'treble', key: 'C',
    meter: [4, 4], mode: { kind: 'major', tonic: 'C' },
    notes: [{ step: 'C', octave: 4, beats: 4 }] as NoteEvent[],
  });

  it('★ 创建 → 查回 → 更新 → 删除（写入必须生效）', () => {
    const item = createComposition(uidA, { track: 'western', title: '我的小曲', score: score('s1'), origin: 'auto', seed: 3 });
    expect(getComposition(uidA, item.id)?.title).toBe('我的小曲');
    expect(getComposition(uidA, item.id)?.origin).toBe('auto');
    const updated = updateComposition(uidA, item.id, { title: '改名了', audioUrl: '/api/generated/audios/x.m4a' });
    expect(updated?.title).toBe('改名了');
    expect(updated?.audioUrl).toBe('/api/generated/audios/x.m4a');
    expect(deleteComposition(uidA, item.id)).toBe(true);
    expect(getComposition(uidA, item.id)).toBeUndefined();
    expect(deleteComposition(uidA, item.id)).toBe(false);
  });

  it('★ 用户隔离：B 用户查不到 / 更新不到 A 的作品', () => {
    const item = createComposition(uidA, { track: 'traditional', title: 'A 的曲', score: score('s2') });
    expect(listCompositions(uidB).find((c) => c.id === item.id)).toBeUndefined();
    expect(updateComposition(uidB, item.id, { title: '越权改' })).toBeUndefined();
    expect(deleteComposition(uidB, item.id)).toBe(false);
    expect(getComposition(uidA, item.id)?.title).toBe('A 的曲');
    deleteComposition(uidA, item.id);
  });
});
