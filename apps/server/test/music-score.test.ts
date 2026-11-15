// 音乐内容包与音高内核回归 v2（learning/music/*）—— docs/音乐双方向重构方案-2026-11-15.md §八。
// ★ 分域硬闸：western 不得出现宫商角徵羽/工尺术语（对照课显式白名单除外）；
//   traditional 不得出现大小调/音程/三和弦术语 —— 本轮用户指正「五线谱+宫调式混搭」的钉子。
// 为什么值得测：谱面/音频/四记法全部由音高内核派生——错一个半音，五种渲染会「一致地错」。
import { describe, it, expect } from 'vitest';
import {
  LETTER_SEMI, noteToSemi, noteToHz, PENTA_VIEW, noteToTrad, modeLabel, transposeScore,
} from '../src/learning/music/scale';
import { MUSIC_SCORES, getMusicScore, scoresByTrack } from '../src/learning/music/scores';
import { MUSIC_LEVELS, MUSIC_LESSONS, lessonsByTrack, getMusicLesson } from '../src/learning/music/curriculum';
import type { MusicLesson, Score } from '../src/learning/music/types';

const BEATS_SET = [0.5, 1, 1.5, 2, 4];
const PENTA_STEPS = ['C', 'D', 'E', 'G', 'A'];

describe('十二平均律内核 LETTER_SEMI', () => {
  it('★ 七个基本音级半音表 = C0 D2 E4 F5 G7 A9 B11', () => {
    expect(LETTER_SEMI).toEqual({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
  });

  it('★ noteToSemi：同音每 +1 八度 +12 半音（C4 = 0）', () => {
    expect(noteToSemi({ step: 'C', octave: 4, beats: 1 })).toBe(0);
    expect(noteToSemi({ step: 'C', octave: 5, beats: 1 })).toBe(12);
    expect(noteToSemi({ step: 'F', octave: 4, beats: 1 })).toBe(5);
    expect(noteToSemi({ step: 'F', octave: 4, beats: 1, alter: 1 })).toBe(6);
    expect(noteToSemi({ step: 'B', octave: 3, beats: 1 })).toBe(-1);
  });

  it('★ noteToHz 数值：C4≈261.63、F4≈349.23、B4≈493.88、C5=523.25（标准音对齐）', () => {
    expect(noteToHz({ step: 'C', octave: 4, beats: 1 })).toBeCloseTo(261.63, 1);
    expect(noteToHz({ step: 'F', octave: 4, beats: 1 })).toBeCloseTo(349.23, 1);
    expect(noteToHz({ step: 'B', octave: 4, beats: 1 })).toBeCloseTo(493.88, 1);
    expect(noteToHz({ step: 'C', octave: 5, beats: 1 })).toBeCloseTo(523.25, 1);
    expect(noteToHz({ step: 'C', octave: 4, beats: 1 }, 12)).toBeCloseTo(523.25, 1);
  });
});

describe('五声只读视图 PENTA_VIEW（传统方向标签用）', () => {
  it('★ 宫商角徵羽 = 1 2 3 5 6 = 上尺工六五 = C D E G A（口径不变，只是降级为视图）', () => {
    expect(PENTA_VIEW.gong).toEqual({ w: '宫', n: '1', g: '上', e: 'C', semi: 0 });
    expect(PENTA_VIEW.yu).toEqual({ w: '羽', n: '6', g: '五', e: 'A', semi: 9 });
  });

  it('★ noteToTrad：白键五声内返回名，F/B（偏音）与黑键返回 null', () => {
    expect(noteToTrad({ step: 'C', octave: 4, beats: 1 })).toBe('gong');
    expect(noteToTrad({ step: 'G', octave: 4, beats: 1 })).toBe('zhi');
    expect(noteToTrad({ step: 'F', octave: 4, beats: 1 })).toBeNull();
    expect(noteToTrad({ step: 'C', octave: 4, beats: 1, alter: 1 })).toBeNull();
  });

  it('★ modeLabel 分域：major → 「C 大调」、pentatonic → 「宫调式」', () => {
    expect(modeLabel({ kind: 'major', tonic: 'C' })).toBe('C 大调');
    expect(modeLabel({ kind: 'minor', tonic: 'A' })).toBe('A 小调');
    expect(modeLabel({ kind: 'pentatonic', tonic: 'yu' })).toBe('羽调式');
  });
});

describe('曲目包 MUSIC_SCORES（11 段 · 两方向）', () => {
  it('★ 11 段、id 唯一、每段时值铺满整数小节、时值集合 ⊆ {0.5,1,1.5,2,4}', () => {
    expect(MUSIC_SCORES.length).toBe(11);
    expect(new Set(MUSIC_SCORES.map((s) => s.id)).size).toBe(MUSIC_SCORES.length);
    for (const s of MUSIC_SCORES) {
      const totalBeats = s.notes.reduce((sum, x) => sum + x.beats, 0);
      const barBeats = s.meter[0] * (4 / s.meter[1]);
      expect(totalBeats % barBeats, `${s.id} 时值合计 ${totalBeats} 拍`).toBe(0);
      for (const [i, x] of s.notes.entries()) {
        expect(BEATS_SET, `${s.id}#${i} 时值 ${x.beats}`).toContain(x.beats);
        expect([3, 4, 5], `${s.id}#${i} 八度`).toContain(x.octave);
      }
    }
  });

  it('★ 小星星 = 原版（含 fa/si）且 track=western、mode=major C —— 钉死「宫调式小星星」事实错误', () => {
    const twinkle = getMusicScore('score_twinkle_w')!;
    expect(twinkle.track).toBe('western');
    expect(twinkle.mode).toEqual({ kind: 'major', tonic: 'C' });
    const steps = twinkle.notes.map((x) => x.step).join(' ');
    expect(steps).toContain('F'); // fa —— v1 曾为凑五声把它删掉（原曲本无 si，B 不出现在小星星里）
    const head = twinkle.notes.slice(0, 7).map((x) => `${x.step}${x.beats}`).join(' ');
    expect(head).toBe('C1 C1 G1 G1 A1 A1 G2');
  });

  it('★ 分域硬闸：western 曲目可含七音（欢乐颂含 F/B），traditional 曲目必须全在五声集', () => {
    for (const s of scoresByTrack('traditional')) {
      for (const [i, x] of s.notes.entries()) {
        if (x.rest) continue;
        expect(PENTA_STEPS, `${s.id}#${i} 出现五声外音 ${x.step}${x.alter ?? ''}`).toContain(x.step);
        expect(x.alter ?? 0, `${s.id}#${i}`).toBe(0);
      }
    }
    const ode = getMusicScore('score_odetojoy')!;
    expect(ode.track).toBe('western');
    // 欢乐颂主题（E E F G…）天然不含 B，七音完整性由小星星（含 F/B）钉住
    expect(ode.notes.map((x) => x.step)).toContain('F');
  });

  it('getMusicScore 未知 id 返回 undefined；scoresByTrack 按方向过滤', () => {
    expect(getMusicScore('nope')).toBeUndefined();
    expect(scoresByTrack('western').every((s) => s.track === 'western')).toBe(true);
    expect(scoresByTrack('traditional').every((s) => s.track === 'traditional')).toBe(true);
  });
});

describe('移调 transposeScore（按调式 kind 分两套算法）', () => {
  it('★ major 音级平移：C 大调 → G 大调，C4 → G4、F4 → C5（音级 +4，八度进位）', () => {
    const twinkle = getMusicScore('score_twinkle_w')!;
    const t = transposeScore(twinkle, { kind: 'major', tonic: 'G' });
    expect(t.mode).toEqual({ kind: 'major', tonic: 'G' });
    expect(t.notes[0]).toMatchObject({ step: 'G', octave: 4 });
    expect(t.notes[7]).toMatchObject({ step: 'C', octave: 5 }); // 原 F4 → C5
  });

  it('★ pentatonic 度数环：任意调式主音都不越五声集', () => {
    for (const s of scoresByTrack('traditional')) {
      for (const tonic of ['gong', 'shang', 'jue', 'zhi', 'yu'] as const) {
        const t = transposeScore(s, { kind: 'pentatonic', tonic });
        expect(t.mode).toEqual({ kind: 'pentatonic', tonic });
        for (const [i, x] of t.notes.entries()) {
          if (x.rest) continue;
          expect(PENTA_STEPS, `${s.id}→${tonic}#${i} 越集`).toContain(x.step);
        }
      }
    }
  });

  it('同主音移调 = 原样返回；kind 不匹配不静默改写', () => {
    const twinkle = getMusicScore('score_twinkle_w')!;
    expect(transposeScore(twinkle, { kind: 'major', tonic: 'C' }).notes).toEqual(twinkle.notes);
    const moli = getMusicScore('score_moli')!;
    expect(transposeScore(moli, { kind: 'major', tonic: 'C' })).toBe(moli); // kind 不同 → 原样
  });
});

describe('课时包 MUSIC_LESSONS（两方向）', () => {
  const WHITELIST_DOMAIN = new Set(['mus_w_bridge']); // 对照课显式提及另一方向术语（方案 §八白名单）

  function lessonText(l: MusicLesson): string {
    return [l.title, l.goal, l.quickCheck?.question, ...(l.quickCheck?.options ?? []), l.quickCheck?.answer, l.quickCheck?.explanation]
      .filter(Boolean).join('\n');
  }

  it('★ ≥20 课、id 唯一、两方向各 ≥10、每课有 track、scoreId 真实存在、每阶每方向有课', () => {
    expect(MUSIC_LESSONS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MUSIC_LESSONS.map((l) => l.id)).size).toBe(MUSIC_LESSONS.length);
    expect(lessonsByTrack('western').length).toBeGreaterThanOrEqual(10);
    expect(lessonsByTrack('traditional').length).toBeGreaterThanOrEqual(10);
    for (const l of MUSIC_LESSONS) {
      expect(['western', 'traditional'], l.id).toContain(l.track);
      if (l.scoreId) expect(getMusicScore(l.scoreId), l.id).toBeTruthy();
    }
    for (const level of MUSIC_LEVELS) {
      expect(MUSIC_LESSONS.filter((l) => l.level === level).length, level).toBeGreaterThanOrEqual(2);
    }
    expect(getMusicLesson('mus_w_staff')?.title).toBe('五线谱与高音谱号');
    expect(getMusicLesson('nope')).toBeUndefined();
  });

  it('★ 分域硬闸：western 课不得出现宫商角徵羽/工尺（白名单 mus_w_bridge）；traditional 不得出现大小调/音程/三和弦', () => {
    for (const l of lessonsByTrack('western')) {
      if (WHITELIST_DOMAIN.has(l.id)) continue;
      expect(lessonText(l), `${l.id} 串入传统术语`).not.toMatch(/宫|商|角|徵|羽|工尺/);
    }
    for (const l of lessonsByTrack('traditional')) {
      expect(lessonText(l), `${l.id} 串入西方术语`).not.toMatch(/大调|小调|音程|三和弦|升降号/);
    }
  });

  it('★ 含 quickCheck 的课 answer ∈ options、解析非空、options 无重复', () => {
    const withCheck = MUSIC_LESSONS.filter((l) => l.quickCheck);
    expect(withCheck.length).toBeGreaterThanOrEqual(10);
    for (const l of withCheck) {
      const qc = l.quickCheck!;
      expect(qc.options, l.id).toContain(qc.answer);
      expect(qc.explanation.length, l.id).toBeGreaterThan(3);
      expect(new Set(qc.options).size, l.id).toBe(qc.options.length);
    }
  });

  it('依谱写词课带曲谱与字位模板（模板位数 = 非休止音符数）', () => {
    for (const l of MUSIC_LESSONS.filter((x) => x.kind === 'lyric')) {
      const score = getMusicScore(l.scoreId!) as Score;
      expect(score, l.id).toBeTruthy();
      expect(l.lyricTemplate?.length, l.id).toBe(score.notes.filter((n) => !n.rest).length);
    }
  });
});
