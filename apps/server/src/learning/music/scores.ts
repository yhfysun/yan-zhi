// 公版曲目包 v2（按方向分组：western 三段 + traditional 五段；单声部；时值含八分/附点）。
// docs/音乐双方向重构方案-2026-11-15.md §六：小星星恢复原版（含 fa/si）、归 western、不再标宫调式；
// 传统曲目调式标注按通行简谱复核（茉莉花改徵调式；康定=羽、沂蒙=徵、彩云=宫 与常见分析一致）。
// 版权：小星星（法国民歌）、欢乐颂主题（贝多芬，1824，公版）；茉莉花/康定情歌/沂蒙山小调（传统民歌）、
// 彩云追月（任光，1935，已公版）。

import type { MusicTrack, NoteEvent, Score, Step } from './types';

const n = (step: Step, octave: number, beats = 1, lyric?: string, alter?: -1 | 0 | 1): NoteEvent =>
  ({ step, octave, beats, ...(lyric !== undefined ? { lyric } : {}), ...(alter !== undefined ? { alter } : {}) });

// ── western（现代通用乐理 · C 大调 4/4） ────────────────────────────────────────

/** 小星星（原版·首两句，含 fa/si）：1 1 5 5 6 6 5– | 4 4 3 3 2 2 1– */
const twinkleNotes: NoteEvent[] = [
  n('C', 4, 1, '一'), n('C', 4, 1, '闪'), n('G', 4, 1, '一'), n('G', 4, 1, '闪'),
  n('A', 4, 1, '亮'), n('A', 4, 1, '晶'), n('G', 4, 2, '晶'),
  n('F', 4, 1, '满'), n('F', 4, 1, '天'), n('E', 4, 1, '都'), n('E', 4, 1, '是'),
  n('D', 4, 1, '小'), n('D', 4, 1, '星'), n('C', 4, 2, '星'),
];

/** 欢乐颂（主题·贝多芬，8 小节）：3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2 2– |（后四小节同头收 2. 1 1–） */
const odeNotes: NoteEvent[] = [
  n('E', 4), n('E', 4), n('F', 4), n('G', 4),
  n('G', 4), n('F', 4), n('E', 4), n('D', 4),
  n('C', 4), n('C', 4), n('D', 4), n('E', 4),
  n('E', 4, 1.5), n('D', 4, 0.5), n('D', 4, 2),
  n('E', 4), n('E', 4), n('F', 4), n('G', 4),
  n('G', 4), n('F', 4), n('E', 4), n('D', 4),
  n('C', 4), n('C', 4), n('D', 4), n('E', 4),
  n('D', 4, 1.5), n('C', 4, 0.5), n('C', 4, 2),
];

/** C 大调音阶（上行 + 下行，各 2 小节）：识谱 / 唱名课的教材曲 */
const cScaleNotes: NoteEvent[] = [
  n('C', 4), n('D', 4), n('E', 4), n('F', 4), n('G', 4), n('A', 4), n('B', 4), n('C', 5),
  n('C', 5), n('B', 4), n('A', 4), n('G', 4), n('F', 4), n('E', 4), n('D', 4), n('C', 4),
];

/** 两只老虎（法国民歌 Frère Jacques，公版；轮唱/卡农教学曲）：C D E C ×2 | E F G– ×2 | G A G F E C ×2 | C G(C3)– ×2 */
const frereNotes: NoteEvent[] = [
  n('C', 4, 1, '两'), n('D', 4, 1, '只'), n('E', 4, 1, '老'), n('C', 4, 1, '虎'),
  n('C', 4, 1, '两'), n('D', 4, 1, '只'), n('E', 4, 1, '老'), n('C', 4, 1, '虎'),
  n('E', 4, 1, '跑'), n('F', 4, 1, '得'), n('G', 4, 2, '快'),
  n('E', 4, 1, '跑'), n('F', 4, 1, '得'), n('G', 4, 2, '快'),
  n('G', 4, 0.5, '一'), n('A', 4, 0.5, '只'), n('G', 4, 0.5, '没'), n('F', 4, 0.5, '有'), n('E', 4, 1, '耳'), n('C', 4, 1, '朵'),
  n('G', 4, 0.5, '一'), n('A', 4, 0.5, '只'), n('G', 4, 0.5, '没'), n('F', 4, 0.5, '有'), n('E', 4, 1, '尾'), n('C', 4, 1, '巴'),
  n('C', 4, 1, '跑'), n('G', 3, 1, '得'), n('C', 3, 2, '快'),
  n('C', 4, 1, '跑'), n('G', 3, 1, '得'), n('C', 3, 2, '快'),
];

/** 主和弦琶音练习（自编教材曲）：大三和弦 C–E–G 的分解听感，对应「音程与三和弦」课 */
const chordArpNotes: NoteEvent[] = [
  n('C', 4), n('E', 4), n('G', 4), n('C', 5),
  n('A', 4), n('G', 4), n('E', 4), n('C', 4),
  n('F', 4), n('A', 4), n('C', 5), n('A', 4),
  n('G', 4), n('E', 4), n('C', 4, 2),
];

// ── traditional（中国传统音乐 · C 宫系统 4/4，全部五声正音） ────────────────────

/** 茉莉花（江苏民歌节选·首句，徵调式）：3 3 5 6 | 1̇ 1̇ 6 5 | 5 6 5 – */
const moliNotes: NoteEvent[] = [
  n('E', 4), n('E', 4), n('G', 4), n('A', 4),
  n('C', 5), n('C', 5), n('A', 4), n('G', 4),
  n('G', 4), n('A', 4), n('G', 4, 2),
];

/** 彩云追月（节选·A 段主题动机，宫调式）：3 5 6 1̇ | 6 5 3 5 | 6 1̇ 6 5 | 3 5 6 – */
const caiyunNotes: NoteEvent[] = [
  n('E', 4), n('G', 4), n('A', 4), n('C', 5),
  n('A', 4), n('G', 4), n('E', 4), n('G', 4),
  n('A', 4), n('C', 5), n('A', 4), n('G', 4),
  n('E', 4), n('G', 4), n('A', 4, 2),
];

/** 康定情歌（四川民歌节选·首句，羽调式色彩）：3 3 5 6 | 1̇ 6 5 6 | 3 3 5 6 | 1̇ 6 5 – */
const kangdingNotes: NoteEvent[] = [
  n('E', 4), n('E', 4), n('G', 4), n('A', 4),
  n('C', 5), n('A', 4), n('G', 4), n('A', 4),
  n('E', 4), n('E', 4), n('G', 4), n('A', 4),
  n('C', 5), n('A', 4), n('G', 4, 2),
];

/** 沂蒙山小调（山东民歌节选·首句，徵调式收束）：3 5 6 1̇ | 6 5 3 5 | 6 5 3 2 | 1 2 5 – */
const yimengNotes: NoteEvent[] = [
  n('E', 4), n('G', 4), n('A', 4), n('C', 5),
  n('A', 4), n('G', 4), n('E', 4), n('G', 4),
  n('A', 4), n('G', 4), n('E', 4), n('D', 4),
  n('C', 4), n('D', 4), n('G', 4, 2),
];

/** 五声音阶练习（自编教材曲）：宫→羽上行 + 羽→宫下行，编曲课的落音参照 */
const pentaPracticeNotes: NoteEvent[] = [
  n('C', 4), n('D', 4), n('E', 4), n('G', 4),
  n('A', 4, 2), n('A', 4, 2),
  n('A', 4), n('G', 4), n('E', 4), n('D', 4),
  n('C', 4, 4),
];

/** 五声问答小曲（自编教材曲）：上句宫起、下句呼应收宫——「问-答」结构听感课 */
const pentaQaNotes: NoteEvent[] = [
  n('C', 4), n('D', 4), n('E', 4), n('G', 4),
  n('A', 4, 2), n('G', 4, 2),
  n('E', 4), n('G', 4), n('A', 4), n('C', 5),
  n('D', 4), n('E', 4), n('C', 4, 2),
];

export const MUSIC_SCORES: Score[] = [
  { id: 'score_twinkle_w', title: '小星星（原版节选）', track: 'western', clef: 'treble', key: 'C', meter: [4, 4], mode: { kind: 'major', tonic: 'C' }, notes: twinkleNotes },
  { id: 'score_odetojoy', title: '欢乐颂（主题·贝多芬）', track: 'western', clef: 'treble', key: 'C', meter: [4, 4], mode: { kind: 'major', tonic: 'C' }, notes: odeNotes },
  { id: 'score_scale_c', title: 'C 大调音阶', track: 'western', clef: 'treble', key: 'C', meter: [4, 4], mode: { kind: 'major', tonic: 'C' }, notes: cScaleNotes },
  { id: 'score_frerejacques', title: '两只老虎（法国民歌）', track: 'western', clef: 'treble', key: 'C', meter: [4, 4], mode: { kind: 'major', tonic: 'C' }, notes: frereNotes },
  { id: 'score_chord_arp', title: '主和弦琶音练习（自编）', track: 'western', clef: 'treble', key: 'C', meter: [4, 4], mode: { kind: 'major', tonic: 'C' }, notes: chordArpNotes },
  { id: 'score_moli', title: '茉莉花（节选·江苏民歌）', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'zhi' }, notes: moliNotes },
  { id: 'score_caiyun', title: '彩云追月（节选）', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'gong' }, notes: caiyunNotes },
  { id: 'score_kangding', title: '康定情歌（节选）', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'yu' }, notes: kangdingNotes },
  { id: 'score_yimeng', title: '沂蒙山小调（节选）', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'zhi' }, notes: yimengNotes },
  { id: 'score_penta_practice', title: '五声音阶练习', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'gong' }, notes: pentaPracticeNotes },
  { id: 'score_penta_qa', title: '五声问答小曲（自编）', track: 'traditional', clef: 'treble', key: 'C 宫', meter: [4, 4], mode: { kind: 'pentatonic', tonic: 'gong' }, notes: pentaQaNotes },
];

export function getMusicScore(id: string): Score | undefined {
  return MUSIC_SCORES.find((s) => s.id === id);
}

/** 按方向取曲目（路线 / 编曲台音高块用） */
export function scoresByTrack(track: MusicTrack): Score[] {
  return MUSIC_SCORES.filter((s) => s.track === track);
}
