// 音高换算内核（十二平均律）+ 五声只读视图（纯函数，直接单测：test/music-score.test.ts）。
// docs/音乐双方向重构方案-2026-11-15.md §四：LETTER_SEMI 是唯一半音表；PENTA_VIEW 只是视图。
// 频率：C4 = 261.63 Hz，hz = 261.63 * 2^(semi/12)（semi 以 C4 为 0）。

import type { NoteEvent, Score, ScoreMode, Step, TradPitch } from './types';

/** 七个基本音级的半音数（C0 D2 E4 F5 G7 A9 B11）—— 唯一音高换算表 */
export const LETTER_SEMI: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const STEP_ORDER: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** 音的半音数（以 C4 = 0）。每个 octave +12；例：noteToSemi(C5) = 12。 */
export function noteToSemi(n: NoteEvent): number {
  return LETTER_SEMI[n.step] + (n.alter ?? 0) + 12 * (n.octave - 4);
}

/** 频率（Hz）：C4 = 261.63；baseOffsetSemi 用于整体移调试听 */
export function noteToHz(n: NoteEvent, baseOffsetSemi = 0): number {
  return 261.63 * Math.pow(2, (noteToSemi(n) + baseOffsetSemi) / 12);
}

// ── 传统方向：五声只读视图（C 为宫） ────────────────────────────────────────────
// 宫=1=上=C=0 半音、商=2=尺=D=2、角=3=工=E=4、徵=5=六=G=7、羽=6=五=A=9。
// ★ 只作标签视图（记法切换 / 调式命名），不参与音高计算。

export const PENTA_VIEW: Record<TradPitch, { w: string; n: string; g: string; e: string; semi: number }> = {
  gong: { w: '宫', n: '1', g: '上', e: 'C', semi: 0 },
  shang: { w: '商', n: '2', g: '尺', e: 'D', semi: 2 },
  jue: { w: '角', n: '3', g: '工', e: 'E', semi: 4 },
  zhi: { w: '徵', n: '5', g: '六', e: 'G', semi: 7 },
  yu: { w: '羽', n: '6', g: '五', e: 'A', semi: 9 },
};
export const PENTA_ORDER: TradPitch[] = ['gong', 'shang', 'jue', 'zhi', 'yu'];

/** 五声音集对应的白键（C D E G A）；F / B 与黑键是偏音或体系外音，不在五声内 */
const PENTA_STEP: Record<TradPitch, Step> = { gong: 'C', shang: 'D', jue: 'E', zhi: 'G', yu: 'A' };
const STEP_PENTA: Partial<Record<Step, TradPitch>> = { C: 'gong', D: 'shang', E: 'jue', G: 'zhi', A: 'yu' };

/** 白键 → 五声名；F / B（偏音）与带 alter 的音返回 null */
export function noteToTrad(n: NoteEvent): TradPitch | null {
  if ((n.alter ?? 0) !== 0) return null;
  return STEP_PENTA[n.step] ?? null;
}

/** 五声名 → 白键 NoteEvent 骨架（octave 由调用方定） */
export function tradToNote(p: TradPitch, octave: number): NoteEvent {
  return { step: PENTA_STEP[p], octave, beats: 1 };
}

// ── 调式标签与移调 ───────────────────────────────────────────────────────────────

/** 调式显示名：C 大调 / a 小调 / 宫调式（跨方向术语由测试钉死不串） */
export function modeLabel(mode: ScoreMode): string {
  if (mode.kind === 'pentatonic') return `${PENTA_VIEW[mode.tonic].w}调式`;
  return `${mode.tonic} ${mode.kind === 'major' ? '大调' : '小调'}`;
}

/**
 * 移调：保持调式 kind 不变，以新主音为锚。
 * - major/minor：**音级平移**（dLetter = 新根音级 - 旧根音级，白键根），每音 letterIdx + dLetter，
 *   八度按音级进位补偿；alter 不变（P0 只支持白键根，半音结构在平移中保持）。
 * - pentatonic：旧算法（五声度数环 + 八度折回），结果一定仍是五声正音集。
 * - kind 不匹配 / 音越集（传统方向遇偏音）→ 该音原样保留，不静默改写。
 */
export function transposeScore(score: Score, target: ScoreMode): Score {
  if (target.kind !== score.mode.kind) return score;
  if (target.kind === 'pentatonic' && score.mode.kind === 'pentatonic') {
    const oldIdx = PENTA_ORDER.indexOf(score.mode.tonic);
    const newIdx0 = PENTA_ORDER.indexOf(target.tonic);
    const notes = score.notes.map((n) => {
      const t = noteToTrad(n);
      if (!t) return n; // 偏音/体系外音：不参与五声度数环，原样保留
      const deg = PENTA_ORDER.indexOf(t) - oldIdx;
      let octShift = Math.floor(deg / 5);
      const degInOct = deg - octShift * 5;
      let idx = newIdx0 + degInOct;
      if (idx >= 5) { idx -= 5; octShift += 1; }
      const p = PENTA_ORDER[idx];
      return { ...n, step: PENTA_STEP[p], alter: 0 as const, octave: n.octave + octShift };
    });
    return { ...score, mode: target, notes };
  }
  if (target.kind !== 'pentatonic' && score.mode.kind !== 'pentatonic') {
    const dLetter = STEP_ORDER.indexOf(target.tonic) - STEP_ORDER.indexOf(score.mode.tonic);
    const notes = score.notes.map((n) => {
      const linear = STEP_ORDER.indexOf(n.step) + dLetter;
      const newIdx = ((linear % 7) + 7) % 7;
      const octShift = Math.floor(linear / 7);
      return { ...n, step: STEP_ORDER[newIdx], octave: n.octave + octShift };
    });
    return { ...score, mode: target, notes };
  }
  return score;
}
