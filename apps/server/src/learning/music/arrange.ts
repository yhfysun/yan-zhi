// 学习谱面 ↔ MusicSpec 适配 + 规则自动编曲 + AI spec 校验（纯函数，单测：test/music-composition.test.ts）。
// docs/音乐双方向重构方案-2026-11-15.md §3.2：
// ★ 架构判据沿用 2026-10-21 已拍板（music-plan.ts:3-8）：模型/规则只写「乐谱决定」，代码做编曲与合成。
// ★ 学习谱面 NoteEvent（拍制单声部）与 music-plan 的 NoteEvent（秒制多声部）同名不同义，
//   只经本文件 scoreToSpec / specToScore 显式转换，禁止直接当同一类型用。

import { arrangeMusic, parseChord, pitchToMidi, type MusicSpec } from '../../services/music-plan.js';
import type { CompositionOrigin, MusicTrack, NoteEvent, Score, ScoreMode } from './types';
import { noteToHz, noteToTrad, PENTA_ORDER, STEP_ORDER } from './scale';

// ── 学习谱面 → MusicSpec（服务端 composeMusic 的输入） ───────────────────────────

const MAJOR_CHORDS: Record<string, string[]> = {
  C: ['C', 'G', 'Am', 'F'], G: ['G', 'D', 'Em', 'C'], F: ['F', 'C', 'Dm', 'Bb'],
};
const MINOR_CHORDS: Record<string, string[]> = {
  A: ['Am', 'F', 'C', 'G'], E: ['Em', 'C', 'G', 'D'], D: ['Dm', 'Bb', 'F', 'C'],
};
const TRAD_CHORDS = ['C', 'Am', 'F', 'G']; // C 宫系统 P0 口径：宫-羽循环，风格交给 'cn' 织体

function pitchName(n: NoteEvent): string {
  const acc = n.alter === 1 ? '#' : n.alter === -1 ? 'b' : '';
  return `${n.step}${acc}${n.octave}`;
}

/** 学习谱面 → MusicSpec（bpm 固定 96；和弦 P0 白键根查表，表外回落 C 系并在 spec.warnings 由 arrangeMusic 提示） */
export function scoreToSpec(score: Score, seed = 1): MusicSpec {
  const totalBeats = score.notes.reduce((s, n) => s + n.beats, 0);
  const beatsPerBar = score.meter[0];
  const bars = Math.max(1, Math.ceil(totalBeats / beatsPerBar));
  const spec: MusicSpec = { title: score.title, bpm: 96, beatsPerBar, bars, seed };
  let start = 0;
  const melody = score.notes
    .filter((n) => !n.rest)
    .map((n) => { const m = { start, len: n.beats, pitch: pitchName(n) }; start += n.beats; return m; });
  spec.melody = melody;
  if (score.track === 'traditional') {
    spec.style = 'cn';
    spec.chords = TRAD_CHORDS;
    spec.instruments = { keys: 'guzheng', lead: 'dizi', pad: 'erhu' };
  } else if (score.mode.kind === 'major') {
    spec.style = 'gentle';
    spec.chords = MAJOR_CHORDS[score.mode.tonic] ?? MAJOR_CHORDS.C;
  } else {
    spec.style = 'ballad';
    spec.chords = MINOR_CHORDS[score.mode.tonic] ?? MINOR_CHORDS.A;
  }
  return spec;
}

/** 黑键 MIDI → 白键 + 升降号（P0 命名取升号侧：1=C# 3=D# 6=F# 8=G# 10=A#） */
const MIDI_PC: Array<{ step: string; alter: -1 | 0 | 1 }> = [
  { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
  { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
  { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
];

/** MusicSpec.melody → 学习谱面（编曲台把自动/AI 产物转回可编辑 Score） */
export function specToScore(spec: MusicSpec, track: MusicTrack, id: string, title: string, mode: ScoreMode): Score {
  const beatsPerBar = [3, 4, 6].includes(Number(spec.beatsPerBar)) ? Number(spec.beatsPerBar) : 4;
  const notes: NoteEvent[] = (spec.melody ?? []).map((m) => {
    const midi = pitchToMidi(m.pitch);
    if (midi == null) return { step: 'C' as const, octave: 4, beats: 1, rest: true };
    const pc = ((midi % 12) + 12) % 12;
    const { step, alter } = MIDI_PC[pc];
    const octave = Math.floor(midi / 12) - 1;
    return { step: step as NoteEvent['step'], octave, beats: Math.max(0.5, m.len), ...(alter !== 0 ? { alter: alter as -1 | 1 } : {}) };
  });
  return { id, title, track, clef: 'treble', key: track === 'traditional' ? 'C 宫' : 'C', meter: [beatsPerBar, 4], mode, notes };
}

// ── 规则自动编曲（离线、零 LLM、同 seed 可复现） ─────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AutoArrangeInput = {
  track: MusicTrack;
  mode: ScoreMode;
  bars?: number;         // 2~16，默认 8
  seed?: number;
  bpm?: number;
  title?: string;
};

/** 音池：western = C4..C5 白键（小调收束 A）；traditional = 五声 C4..A4 + C5 */
function pitchPool(track: MusicTrack): NoteEvent[] {
  if (track === 'traditional') {
    const pool: NoteEvent[] = [];
    for (const p of PENTA_ORDER) {
      const semi = { gong: 0, shang: 2, jue: 4, zhi: 7, yu: 9 }[p];
      const step = { gong: 'C', shang: 'D', jue: 'E', zhi: 'G', yu: 'A' }[p] as NoteEvent['step'];
      pool.push({ step, octave: 4, beats: 1 });
      if (p === 'gong') pool.push({ step: 'C', octave: 5, beats: 1 });
      void semi;
    }
    return pool;
  }
  return (STEP_ORDER.map((s) => ({ step: s, octave: 4, beats: 1 })) as NoteEvent[]).concat([{ step: 'C', octave: 5, beats: 1 }]);
}

/**
 * 规则自动编曲：调式音池内随机游走 + 收束约束（末小节落主音长音）。
 * 同 seed 逐音符相同（mulberry32）；结果是一份可继续手改的 Score，不是黑盒音频。
 * P0 口径：主旋律单声部；伴奏与鼓型交给 arrangeMusic（compose/render 时展开）。
 */
export function autoArrange(input: AutoArrangeInput): Score & { seed: number } {
  const bars = Math.max(2, Math.min(16, Math.round(input.bars ?? 8)));
  const seed = Math.round(Number(input.seed) || 1);
  const rand = mulberry32(seed);
  const beatsPerBar = 4;
  const pool = pitchPool(input.track);
  const tonicSemi = input.mode.kind === 'pentatonic' ? 0 : 0; // 收束音 = 主音（池内索引另取）
  void tonicSemi;
  const homeIdx = input.mode.kind === 'pentatonic' ? 0 : 0; // 两池首音都是主音（C4）
  const endIdx = input.mode.kind === 'minor' ? pool.findIndex((p) => p.step === 'A' && p.octave === 4) : homeIdx;
  const beats = bars * beatsPerBar;
  const notes: NoteEvent[] = [];
  let cur = homeIdx;
  for (let b = 0; b < beats; b++) {
    const inLastBar = b >= beats - beatsPerBar;
    if (inLastBar) {
      // 收束小节：主音全音符占满（「回到主音」= 收束感）
      notes.push({ ...pool[endIdx >= 0 ? endIdx : homeIdx], beats: beatsPerBar });
      break;
    }
    // 游走步长加权（小步为主），每小节头回到主音附近的概率高一些
    const barPos = b % beatsPerBar;
    const deltaPool = barPos === 0 ? [-1, 0, 1] : [-2, -1, -1, 0, 1, 1, 2];
    const delta = deltaPool[Math.floor(rand() * deltaPool.length)];
    cur = Math.max(0, Math.min(pool.length - 1, cur + delta));
    const beatsHere = rand() < 0.25 && barPos <= beatsPerBar - 2 ? 2 : 1;
    notes.push({ ...pool[cur], beats: beatsHere });
    if (beatsHere === 2) b += 1;
  }
  // 时值补偿：铺满整数拍（防游走溢出）
  let sum = notes.reduce((s, x) => s + x.beats, 0);
  while (sum < beats) { notes.push({ ...pool[homeIdx], beats: 1 }); sum += 1; }
  const trimmed = notes.filter((x) => x.beats > 0).slice(0, 64);
  return {
    id: `comp_auto_${seed}`,
    title: input.title || `自动编曲 #${seed}`,
    track: input.track,
    clef: 'treble',
    key: input.track === 'traditional' ? 'C 宫' : (input.mode.kind === 'major' ? input.mode.tonic : input.mode.tonic),
    meter: [beatsPerBar, 4],
    mode: input.mode,
    notes: trimmed,
    seed,
  };
}

// ── AI spec 分域硬闸（模型输出不可信：非法一律回落，绝不静默采用） ───────────────

const TRAD_STYLES = ['cn', 'folk', 'gentle', 'ballad'];

/**
 * 校验 AI 生成的 MusicSpec：
 * - 非 JSON / 无有效旋律 / 和弦不可解析 / pitch 不合法 → 拒绝
 * - 分域：traditional 只允许国风系 style 且旋律全在五声集；western 不允许 'cn'
 * 返回 { spec } 或 { fallbackReason }；调用方 fallbackReason 存在时回落 autoArrange。
 */
export function validateAiSpec(raw: unknown, track: MusicTrack): { spec?: MusicSpec; fallbackReason?: string } {
  if (!raw || typeof raw !== 'object') return { fallbackReason: '模型输出不是 JSON 对象' };
  const o = raw as Record<string, unknown>;
  const spec: MusicSpec = {
    title: typeof o.title === 'string' ? o.title.slice(0, 40) : undefined,
    bpm: Number(o.bpm) || 96,
    beatsPerBar: Number(o.beatsPerBar) || 4,
    bars: Number(o.bars) || 8,
    seed: Number(o.seed) || 1,
  };
  const style = typeof o.style === 'string' ? o.style : '';
  if (track === 'traditional' && !TRAD_STYLES.includes(style)) return { fallbackReason: `style「${style}」不在传统方向允许范围（${TRAD_STYLES.join('/')}）` };
  if (track === 'western' && style === 'cn') return { fallbackReason: '西方方向不允许国风 style' };
  spec.style = style as MusicSpec['style'];
  if (Array.isArray(o.chords) && o.chords.length) {
    const chords = o.chords.map((c) => String(c));
    if (chords.some((c) => !parseChord(c))) return { fallbackReason: '和弦符号无法解析' };
    spec.chords = chords;
  }
  if (!Array.isArray(o.melody) || !o.melody.length) return { fallbackReason: '没有旋律' };
  const melody: MusicSpec['melody'] = [];
  for (const m of o.melody as Array<Record<string, unknown>>) {
    const midi = pitchToMidi(m?.pitch as string | number);
    const start = Number(m?.start);
    const len = Number(m?.len);
    if (midi == null || !Number.isFinite(start) || !Number.isFinite(len) || len <= 0) return { fallbackReason: `旋律音符不合法（pitch=${String(m?.pitch)}）` };
    if (track === 'traditional') {
      const step = MIDI_PC[((midi % 12) + 12) % 12].step;
      if (!['C', 'D', 'E', 'G', 'A'].includes(step)) return { fallbackReason: `旋律出现五声外音 ${String(m?.pitch)}` };
    }
    melody.push({ start, len, pitch: m?.pitch as string | number });
  }
  spec.melody = melody;
  return { spec };
}

// ── 试听辅助（编曲台即时试听直接用谱面，这里只做频率换算再导出） ─────────────────
export { noteToHz, noteToTrad, arrangeMusic, type CompositionOrigin };
