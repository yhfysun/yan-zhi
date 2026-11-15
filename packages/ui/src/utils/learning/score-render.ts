// 谱面渲染纯函数 v2（docs/音乐双方向重构方案-2026-11-15.md §四/§五）。
// 十二平均律（step+alter+octave）为唯一音高内核；记法集合按 track 派生，不再有全局四记法 Tab。
// ★ 与服务端 apps/server/src/learning/music/{types,scale}.ts 保持同口径（前端不能直接 import 服务端
//   源码，这里内嵌同一份映射与移调算法；两侧行为由各自单测钉死）。

// ── 与服务端同口径的数据模型 ───────────────────────────────────────────────────

export type MusicTrack = 'western' | 'traditional';
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type TradPitch = 'gong' | 'shang' | 'jue' | 'zhi' | 'yu';

export type NoteEvent = {
  step: Step;
  alter?: -1 | 0 | 1;
  octave: number;
  beats: number;
  lyric?: string;
  rest?: boolean;
};

export type ScoreMode =
  | { kind: 'major' | 'minor'; tonic: Step }
  | { kind: 'pentatonic'; tonic: TradPitch };

export type Score = {
  id: string;
  title: string;
  track: MusicTrack;
  clef: 'treble';
  key: string;
  meter: [number, number];
  mode: ScoreMode;
  notes: NoteEvent[];
};

// ── 音高内核（与服务端 scale.ts 同口径） ────────────────────────────────────────

export const LETTER_SEMI: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const STEP_ORDER: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export function noteToSemi(n: NoteEvent): number {
  return LETTER_SEMI[n.step] + (n.alter ?? 0) + 12 * (n.octave - 4);
}

export function noteToHz(n: NoteEvent, baseOffsetSemi = 0): number {
  return 261.63 * Math.pow(2, (noteToSemi(n) + baseOffsetSemi) / 12);
}

/** 五声只读视图（C 为宫）：宫=1=上=C=0、商=2=尺=D=2、角=3=工=E=4、徵=5=六=G=7、羽=6=五=A=9 */
export const PENTA_VIEW: Record<TradPitch, { w: string; n: string; g: string; e: string; semi: number }> = {
  gong: { w: '宫', n: '1', g: '上', e: 'C', semi: 0 },
  shang: { w: '商', n: '2', g: '尺', e: 'D', semi: 2 },
  jue: { w: '角', n: '3', g: '工', e: 'E', semi: 4 },
  zhi: { w: '徵', n: '5', g: '六', e: 'G', semi: 7 },
  yu: { w: '羽', n: '6', g: '五', e: 'A', semi: 9 },
};
export const PENTA_ORDER: TradPitch[] = ['gong', 'shang', 'jue', 'zhi', 'yu'];

const PENTA_STEP: Record<TradPitch, Step> = { gong: 'C', shang: 'D', jue: 'E', zhi: 'G', yu: 'A' };
const STEP_PENTA: Partial<Record<Step, TradPitch>> = { C: 'gong', D: 'shang', E: 'jue', G: 'zhi', A: 'yu' };

export function noteToTrad(n: NoteEvent): TradPitch | null {
  if ((n.alter ?? 0) !== 0) return null;
  return STEP_PENTA[n.step] ?? null;
}

export function modeLabel(mode: ScoreMode): string {
  if (mode.kind === 'pentatonic') return `${PENTA_VIEW[mode.tonic].w}调式`;
  return `${mode.tonic} ${mode.kind === 'major' ? '大调' : '小调'}`;
}

export function trackLabel(track: MusicTrack): string {
  return track === 'western' ? '现代通用乐理' : '中国传统音乐';
}

/**
 * 移调（与服务端同算法）：major/minor 音级平移（白键根，八度进位补偿）；
 * pentatonic 五声度数环 + 八度折回；kind 不匹配 / 偏音原样保留，不静默改写。
 */
export function transposeScore(score: Score, target: ScoreMode): Score {
  if (target.kind !== score.mode.kind) return score;
  if (target.kind === 'pentatonic' && score.mode.kind === 'pentatonic') {
    const oldIdx = PENTA_ORDER.indexOf(score.mode.tonic);
    const newIdx0 = PENTA_ORDER.indexOf(target.tonic);
    const notes = score.notes.map((n) => {
      const t = noteToTrad(n);
      if (!t) return n;
      const deg = PENTA_ORDER.indexOf(t) - oldIdx;
      const octShift0 = Math.floor(deg / 5);
      const degInOct = deg - octShift0 * 5;
      let idx = newIdx0 + degInOct;
      let octShift = octShift0;
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

// ── 记法集合（按方向派生；方案 §四：不再有全局四记法 Tab） ─────────────────────

export type NotationMode = 'staff' | 'num' | 'names' | 'gongche' | 'wu';

export const NOTATION_BY_TRACK: Record<MusicTrack, Array<{ mode: NotationMode; label: string }>> = {
  western: [
    { mode: 'staff', label: '五线谱' },
    { mode: 'names', label: '音名唱名' },
    { mode: 'num', label: '简谱' },
  ],
  traditional: [
    { mode: 'gongche', label: '工尺谱' },
    { mode: 'wu', label: '宫商角徵羽' },
    { mode: 'num', label: '简谱' },
    { mode: 'staff', label: '五线谱·对照' },
  ],
};

// ── 大字标签（简谱 / 音名唱名 / 工尺 / 五声） ──────────────────────────────────

export type ScoreLabel = { index: number; label: string; sub?: string };

/** 高八度加点（1̇），低八度加点（6̣）——简谱惯例（P0 简谱一律按 do=C 记，谱头有 1=C 说明） */
function octaveMark(label: string, octave: number): string {
  if (octave >= 5) return `${label}˙`;
  if (octave <= 3) return `${label}̣`;
  return label;
}

/** 记法标签：只输出非休止音符，index 回指 notes 数据源（切换记法不换数据） */
export function labelsFor(mode: NotationMode, notes: NoteEvent[]): ScoreLabel[] {
  const out: ScoreLabel[] = [];
  notes.forEach((n, index) => {
    if (n.rest) return;
    const acc = n.alter === 1 ? '♯' : n.alter === -1 ? '♭' : '';
    if (mode === 'num') {
      const t = noteToTrad(n);
      out.push({ index, label: t ? octaveMark(PENTA_VIEW[t].n, n.octave) : `${octaveMark('', n.octave)}${n.step}${acc}` });
    } else if (mode === 'names') {
      const fixed = { C: 'do', D: 're', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' }[n.step];
      out.push({ index, label: `${n.step}${acc}${n.octave}`, sub: acc && fixed ? fixed : fixed });
    } else if (mode === 'gongche') {
      const t = noteToTrad(n);
      out.push({ index, label: t ? PENTA_VIEW[t].g : `${n.step}${acc}` });
    } else if (mode === 'wu') {
      const t = noteToTrad(n);
      out.push({ index, label: t ? PENTA_VIEW[t].w : `${n.step}${acc}` });
    }
  });
  return out;
}

// ── 五线谱布局（SVG 图元；含升降号 / 附点 / 符尾 / 休止） ────────────────────────

export type StaffNoteGlyph = {
  index: number;
  x: number;
  y: number;
  stem: 'up' | 'down' | 'none';
  stemEndY: number;
  hollow: boolean;
  /** 附点（beats = 1.5） */
  dotted: boolean;
  /** 八分符尾（beats ≤ 0.5） */
  flag: boolean;
  /** 临时记号文本：♯ / ♭（alter ≠ 0） */
  accidental: string;
  rest: boolean;
  ledgerY: number[];
  beats: number;
  lyric?: string;
};

export type StaffLayout = {
  lineY: number[];
  width: number;
  height: number;
  /** 谱头元素 x：谱号 / 拍号 / key 文本依次摆放（P0 调号以文本呈现） */
  headX: { clef: number; meter: number; key: number };
  notes: StaffNoteGlyph[];
};

/** 高音谱表最下线 = E4 的记谱步进（C4=28、E4=30…每 +1 步 = 半个线距） */
const E4_STEP = 4 * 7 + 2;

export function staffLayout(
  notes: NoteEvent[],
  opts: { key?: string; meter?: [number, number]; spacing?: number; lineGap?: number; leftPad?: number; topPad?: number } = {},
): StaffLayout {
  const spacing = opts.spacing ?? 44;
  const lineGap = opts.lineGap ?? 11;
  const leftPad = opts.leftPad ?? 118; // 谱头：谱号 + 拍号 + key 文本
  const topPad = opts.topPad ?? 24;
  const bottomY = topPad + lineGap * 4;
  const lineY = [0, 1, 2, 3, 4].map((i) => bottomY - i * lineGap);
  const height = bottomY + lineGap * 4 + topPad;
  const width = leftPad + notes.length * spacing + 40;
  const stemLen = lineGap * 3.5;
  const glyphs: StaffNoteGlyph[] = notes.map((n, index) => {
    const x = leftPad + index * spacing;
    const base = { index, x, beats: n.beats, lyric: n.lyric, rest: !!n.rest } as StaffNoteGlyph;
    if (n.rest) {
      return { ...base, y: bottomY - lineGap * 2, stem: 'none', stemEndY: bottomY - lineGap * 2, hollow: false, dotted: false, flag: false, accidental: '', ledgerY: [] };
    }
    const letterIdx = STEP_ORDER.indexOf(n.step);
    const step = n.octave * 7 + letterIdx + (n.alter ?? 0) * 0.5;
    const y = bottomY - (step - E4_STEP) * (lineGap / 2);
    const stem: 'up' | 'down' | 'none' = n.beats >= 4 ? 'none' : (step < E4_STEP + 4 ? 'up' : 'down');
    const stemEndY = stem === 'up' ? y - stemLen : stem === 'down' ? y + stemLen : y;
    const ledgerY: number[] = [];
    for (let below = bottomY + lineGap; y >= below - lineGap * 0.2; below += lineGap) ledgerY.push(below);
    for (let above = bottomY - lineGap * 5; y <= above + lineGap * 0.2; above -= lineGap) ledgerY.push(above);
    return {
      ...base, y, stem, stemEndY,
      hollow: n.beats >= 2,
      dotted: n.beats === 1.5,
      flag: n.beats <= 0.5 && stem !== 'none',
      accidental: n.alter === 1 ? '♯' : n.alter === -1 ? '♭' : '',
      ledgerY,
    };
  });
  const meter = opts.meter ?? [4, 4];
  return { lineY, width, height, notes: glyphs, headX: { clef: 26, meter: 62, key: 86 } };
}
