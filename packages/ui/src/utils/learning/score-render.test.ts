// 谱面渲染纯函数回归 v2（score-render.ts）—— docs/音乐双方向重构方案-2026-11-15.md §八。
// ★ 与服务端 scale.ts 同口径：两侧单测钉同一组数值，漂移一侧即红。
// ★ 分域硬闸的另一半：记法 Tab 按方向派生，western 不出现工尺/宫商角徵羽 Tab。
import { describe, it, expect } from 'vitest';
import {
  LETTER_SEMI, noteToSemi, noteToHz, PENTA_VIEW, noteToTrad, modeLabel, trackLabel,
  transposeScore, NOTATION_BY_TRACK, labelsFor, staffLayout,
  type NoteEvent, type Score,
} from './score-render';

const PENTA_STEPS = ['C', 'D', 'E', 'G', 'A'];

describe('音高内核（与服务端同口径）', () => {
  it('★ LETTER_SEMI = C0 D2 E4 F5 G7 A9 B11；noteToSemi 八度/升降号', () => {
    expect(LETTER_SEMI).toEqual({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
    expect(noteToSemi({ step: 'C', octave: 4, beats: 1 })).toBe(0);
    expect(noteToSemi({ step: 'F', octave: 4, beats: 1, alter: 1 })).toBe(6);
  });

  it('★ noteToHz：C4≈261.63 / F4≈349.23 / B4≈493.88 / C5=523.25', () => {
    expect(noteToHz({ step: 'C', octave: 4, beats: 1 })).toBeCloseTo(261.63, 1);
    expect(noteToHz({ step: 'F', octave: 4, beats: 1 })).toBeCloseTo(349.23, 1);
    expect(noteToHz({ step: 'B', octave: 4, beats: 1 })).toBeCloseTo(493.88, 1);
    expect(noteToHz({ step: 'C', octave: 5, beats: 1 })).toBeCloseTo(523.25, 1);
  });

  it('★ PENTA_VIEW 口径不变（降级为视图）；noteToTrad 偏音/黑键 null', () => {
    expect(PENTA_VIEW.gong.e).toBe('C');
    expect(noteToTrad({ step: 'F', octave: 4, beats: 1 })).toBeNull();
    expect(noteToTrad({ step: 'A', octave: 4, beats: 1 })).toBe('yu');
  });

  it('★ modeLabel / trackLabel 分域', () => {
    expect(modeLabel({ kind: 'major', tonic: 'C' })).toBe('C 大调');
    expect(modeLabel({ kind: 'pentatonic', tonic: 'zhi' })).toBe('徵调式');
    expect(trackLabel('western')).toBe('现代通用乐理');
    expect(trackLabel('traditional')).toBe('中国传统音乐');
  });
});

describe('transposeScore（两套算法按 kind 分派）', () => {
  const score: Score = {
    id: 's', title: 't', track: 'western', clef: 'treble', key: 'C', meter: [4, 4],
    mode: { kind: 'major', tonic: 'C' },
    notes: [
      { step: 'C', octave: 4, beats: 1 }, { step: 'F', octave: 4, beats: 1 },
      { step: 'B', octave: 4, beats: 1 }, { step: 'C', octave: 5, beats: 2 },
    ],
  };

  it('★ major 音级平移：C→G 时 C4→G4、F4→C5（八度进位）、结构不变', () => {
    const t = transposeScore(score, { kind: 'major', tonic: 'G' });
    expect(t.notes.map((n) => `${n.step}${n.octave}`)).toEqual(['G4', 'C5', 'F5', 'G5']);
  });

  it('★ 同主音原样；kind 不匹配不静默改写', () => {
    expect(transposeScore(score, { kind: 'major', tonic: 'C' }).notes).toEqual(score.notes);
    const trad: Score = { ...score, track: 'traditional', mode: { kind: 'pentatonic', tonic: 'gong' }, notes: [{ step: 'C', octave: 4, beats: 1 }] };
    expect(transposeScore(trad, { kind: 'major', tonic: 'G' })).toBe(trad);
  });

  it('★ pentatonic 度数环不越五声集', () => {
    const trad: Score = {
      ...score, track: 'traditional', mode: { kind: 'pentatonic', tonic: 'gong' },
      notes: PENTA_STEPS.map((s) => ({ step: s as NoteEvent['step'], octave: 4, beats: 1 })),
    };
    for (const tonic of ['gong', 'shang', 'jue', 'zhi', 'yu'] as const) {
      const t = transposeScore(trad, { kind: 'pentatonic', tonic });
      for (const n of t.notes) expect(PENTA_STEPS, `${tonic}:${n.step}`).toContain(n.step);
    }
  });
});

describe('NOTATION_BY_TRACK（记法集合按方向派生）', () => {
  it('★ western = 五线谱/音名唱名/简谱，无工尺无宫商角徵羽', () => {
    expect(NOTATION_BY_TRACK.western.map((t) => t.mode)).toEqual(['staff', 'names', 'num']);
  });

  it('★ traditional = 工尺谱/宫商角徵羽/简谱/五线谱对照', () => {
    expect(NOTATION_BY_TRACK.traditional.map((t) => t.mode)).toEqual(['gongche', 'wu', 'num', 'staff']);
  });
});

describe('labelsFor（大字卡：简谱加点 / 音名唱名 / 工尺与五声回退）', () => {
  const notes: NoteEvent[] = [
    { step: 'C', octave: 4, beats: 1 }, { step: 'G', octave: 5, beats: 1 },
    { step: 'F', octave: 4, beats: 1, alter: 1 }, { step: 'C', octave: 4, beats: 1, rest: true },
  ];

  it('★ num：C=1、高八度加点 5˙、偏音回退音名、休止不输出', () => {
    const out = labelsFor('num', notes);
    expect(out.map((l) => l.label)).toEqual(['1', '5˙', 'F♯']);
  });

  it('★ names：音名+唱名副行', () => {
    const out = labelsFor('names', notes);
    expect(out[0]).toEqual({ index: 0, label: 'C4', sub: 'do' });
    expect(out[2].label).toBe('F♯4');
  });

  it('★ gongche / wu：五声内出汉字，偏音回退音名', () => {
    expect(labelsFor('gongche', notes).map((l) => l.label)).toEqual(['上', '六', 'F♯']);
    expect(labelsFor('wu', notes).map((l) => l.label)).toEqual(['宫', '徵', 'F♯']);
  });
});

describe('staffLayout（SVG 图元：谱头 / 时值符号 / 加线 / 休止）', () => {
  const notes: NoteEvent[] = [
    { step: 'C', octave: 4, beats: 2 },            // 二分：空心、C4 需加线
    { step: 'E', octave: 4, beats: 1.5 },          // 附点四分
    { step: 'G', octave: 4, beats: 0.5 },          // 八分：符尾
    { step: 'F', octave: 4, beats: 1, alter: 1 },  // 升号
    { step: 'C', octave: 5, beats: 1, rest: true },// 休止
  ];
  const layout = staffLayout(notes, { key: 'C', meter: [4, 4] });

  it('★ 图元逐项：hollow / dotted / flag / accidental / rest', () => {
    expect(layout.notes[0]).toMatchObject({ hollow: true, dotted: false, flag: false, accidental: '', rest: false });
    expect(layout.notes[1]).toMatchObject({ hollow: false, dotted: true, flag: false });
    expect(layout.notes[2]).toMatchObject({ hollow: false, dotted: false, flag: true });
    expect(layout.notes[3]).toMatchObject({ accidental: '♯' });
    expect(layout.notes[4].rest).toBe(true);
  });

  it('★ 音位：E4 落最下线（lineY[0]），C4 在其下方一个线距（加线）', () => {
    const e4 = staffLayout([{ step: 'E', octave: 4, beats: 1 }]).notes[0];
    expect(e4.y).toBeCloseTo(layout.lineY[0], 5);
    const c4 = layout.notes[0];
    expect(c4.ledgerY.length).toBeGreaterThan(0);
    expect(c4.y).toBeGreaterThan(layout.lineY[0]);
  });

  it('★ 谱头三件：谱号 / 拍号 / key 文本坐标', () => {
    expect(layout.headX).toEqual({ clef: 26, meter: 62, key: 86 });
  });
});
