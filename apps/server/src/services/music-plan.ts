// 乐谱规格与编曲展开 —— 「本地 AI 配乐」的第一步（纯函数，可脱机单测）。
//
// ★★★ 为什么是「模型写乐谱、代码做编曲」（2026-10-21 用户：「不能让模型编好曲子
//   歌词然后生成音乐？」→ 选定本地实现、不接三方 API）：
//   大模型不能直接"想"出音频，但它能可靠地输出**结构化音乐决定**：
//   调性、和弦进行、旋律音高与时值、风格、鼓型。剩下的"配器/声部/节奏织体"是
//   确定性工作，交给代码反而更稳（同样的和弦，出来的永远是同一条伴奏，不会每次飘）。
//   → 本文件把 MusicSpec 展开成 NoteEvent[]，再由 music-synth.ts 合成成音频。
//
// ★ 能力边界（必须诚实，别让用户以为有人声）：
//   · 能：器乐旋律、和弦伴奏、贝斯、鼓组、风格化织体、精确 BPM（可直接卡点）。
//   · 不能：人声演唱、真实乐器采样级音色、商业编曲质感。
//
// ★ 单一真相源：spec 的字段同时被工具 schema（packages/core/.../media.ts）与本文件消费，
//   新增字段要两边一起改（schema 只做描述，校验以本文件 arrangeMusic 为准）。

import type { InstrumentId } from './music-instruments.js';

export type MusicStyle = 'lofi' | 'pop' | 'epic' | 'gentle' | 'edm' | 'rock' | 'cn' | 'folk' | 'ballad';
export type DrumPattern = 'none' | 'pop' | 'rock' | 'edm' | 'lofi' | 'ballad';
export type TrackName = 'keys' | 'pad' | 'bass' | 'lead' | 'drums' | 'vox';

/** 演唱音节：歌词 + 拼音（拼音由模型给出，避免内置大字典）。 */
export interface LyricNote {
  /** 歌词字/词（显示与兜底用） */
  text: string;
  /** 拼音（不带声调，如 yue / shang / wo）—— 决定念哪个韵母 */
  py: string;
  /** 起点（拍） */
  start: number;
  /** 时值（拍） */
  len: number;
  /** 音高：'C4' / 'F#5' 或 MIDI */
  pitch: string | number;
}

export interface MelodyNote {
  /** 起点（拍，相对整段开头） */
  start: number;
  /** 时值（拍） */
  len: number;
  /** 音高：'C4' / 'F#5' 或 MIDI 数字 */
  pitch: string | number;
}

export interface MusicSpec {
  title?: string;
  /** 每分钟拍数 60~180（默认 96） */
  bpm?: number;
  /** 每小节拍数（默认 4；支持 3 / 4 / 6） */
  beatsPerBar?: number;
  /** 总小节数 1~64（默认 8） */
  bars?: number;
  style?: MusicStyle;
  /** 每小节一个和弦符号；不足时循环。支持 C / Am / F#m7 / Bb / Gsus4 / D7 */
  chords?: string[];
  /** 主旋律（可选）。不给则由键盘声部承担分解和弦 */
  melody?: MelodyNote[];
  /** 歌词演唱（可选）：每字一个音，带拼音；会走本地歌声合成（音色是合成人声） */
  lyrics?: LyricNote[];
  /** 覆盖某条声部的乐器（如 keys:'guzheng'） */
  instruments?: Partial<Record<'keys' | 'pad' | 'bass' | 'lead', InstrumentId>>;
  drums?: DrumPattern;
  /** 随机种子（同一种子 = 同一版编曲，保证可复现） */
  seed?: number;
}

export interface NoteEvent {
  track: TrackName;
  /** 起点（秒） */
  start: number;
  /** 时值（秒） */
  dur: number;
  /** MIDI 音高（鼓轨用不到，置 0） */
  midi: number;
  /** 力度 0~1 */
  vel: number;
  /** 鼓件（仅 drums 轨） */
  drum?: 'kick' | 'snare' | 'hat' | 'clap';
  /** 乐器（plan 按风格/覆盖写入，synth 只消费） */
  inst?: InstrumentId;
  /** 鼓组风格：acoustic 声学鼓 / electronic 电子鼓 */
  drumKit?: 'acoustic' | 'electronic';
  /** 演唱音节（仅 vox 轨） */
  syllable?: { text: string; py: string };
}

export interface Arrangement {
  title: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  /** 音乐本体时长（秒，不含混响尾巴） */
  duration: number;
  style: MusicStyle;
  chordNames: string[];
  notes: NoteEvent[];
}

// ===== 和弦解析 =====

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5,
  'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11,
};

const QUALITY: Array<{ re: RegExp; intervals: number[] }> = [
  { re: /^(maj7|M7)$/, intervals: [0, 4, 7, 11] },
  { re: /^m7$/, intervals: [0, 3, 7, 10] },
  { re: /^7$/, intervals: [0, 4, 7, 10] },
  { re: /^(m|min)$/, intervals: [0, 3, 7] },
  { re: /^dim$/, intervals: [0, 3, 6] },
  { re: /^aug$/, intervals: [0, 4, 8] },
  { re: /^sus4$/, intervals: [0, 5, 7] },
  { re: /^sus2$/, intervals: [0, 2, 7] },
  { re: /^6$/, intervals: [0, 4, 7, 9] },
  { re: /^(maj|M)?$/, intervals: [0, 4, 7] },
];

/** 解析和弦符号；无法解析返回 null（调用方跳过，不硬凑一个和弦）。 */
export function parseChord(sym: string): { root: number; intervals: number[] } | null {
  const s = String(sym || '').trim();
  if (!s) return null;
  const m = s.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return null;
  const pcKey = (m[1].toUpperCase() + (m[2] === 'b' ? 'B' : m[2])).toUpperCase();
  const root = PITCH_CLASS[pcKey];
  if (root == null) return null;
  const rest = (m[3] || '').trim();
  const q = QUALITY.find((x) => x.re.test(rest));
  if (!q) return null;
  return { root, intervals: q.intervals };
}

/** 音名/MIDI → MIDI 数字（'C4'=60）。解析失败返回 null。 */
export function pitchToMidi(p: string | number): number | null {
  if (typeof p === 'number' && Number.isFinite(p)) {
    const n = Math.round(p);
    return n >= 12 && n <= 108 ? n : null;
  }
  const s = String(p || '').trim();
  if (!s) return null;
  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!m) return null;
  const pcKey = (m[1].toUpperCase() + (m[2] === 'b' ? 'B' : m[2])).toUpperCase();
  const pc = PITCH_CLASS[pcKey];
  if (pc == null) return null;
  const midi = 12 * (Number(m[3]) + 1) + pc;
  return midi >= 12 && midi <= 108 ? midi : null;
}

// ===== 随机数（可复现） =====

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把和弦音排到指定音区（靠近 base 的紧凑排列）。 */
function voiceChord(root: number, intervals: number[], base: number): number[] {
  return intervals.map((iv) => {
    let n = base + (((root + iv - base) % 12) + 12) % 12;
    if (n < base) n += 12;
    return n;
  });
}

/**
 * 规格 → 编曲。
 * ★ 这里不抛异常：非法字段一律退回默认值（模型输出经常少字段/写错大小写），
 *   整段失败比"用了默认值但说一句"更糟 —— 调用方拿到 `warnings` 转述给用户。
 */
export function arrangeMusic(spec: MusicSpec): Arrangement & { warnings: string[] } {
  const warnings: string[] = [];
  const bpm = Math.max(60, Math.min(180, Math.round(Number(spec.bpm) || 96)));
  const beatsPerBar = [3, 4, 6].includes(Number(spec.beatsPerBar)) ? Number(spec.beatsPerBar) : 4;
  const bars = Math.max(1, Math.min(64, Math.round(Number(spec.bars) || 8)));
  const style: MusicStyle = (['lofi', 'pop', 'epic', 'gentle', 'edm', 'rock', 'cn', 'folk', 'ballad'] as const).includes(spec.style as MusicStyle)
    ? (spec.style as MusicStyle)
    : 'gentle';
  const defaultDrums: DrumPattern = style === 'edm' ? 'edm'
    : style === 'pop' ? 'pop'
      : style === 'epic' || style === 'rock' ? 'rock'
        : style === 'lofi' ? 'lofi'
          : 'ballad';
  const drums: DrumPattern = (['none', 'pop', 'rock', 'edm', 'lofi', 'ballad'] as const).includes(spec.drums as DrumPattern)
    ? (spec.drums as DrumPattern)
    : defaultDrums;

  const secPerBeat = 60 / bpm;
  const barSec = secPerBeat * beatsPerBar;
  const duration = bars * barSec;
  const rand = mulberry32(Number(spec.seed) || 1);

  // 和弦序列：未给就用 I–V–vi–IV，并如实告知（不要假装这是用户要的）
  let chordSyms = (spec.chords || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (!chordSyms.length) {
    chordSyms = ['C', 'G', 'Am', 'F'];
    warnings.push('未给和弦，已用默认进行 C–G–Am–F');
  }
  if (chordSyms.every((s) => !parseChord(s))) {
    warnings.push(`和弦无法解析（${chordSyms.join(' ')}），已改用 C–G–Am–F`);
    chordSyms = ['C', 'G', 'Am', 'F'];
  }

  const notes: NoteEvent[] = [];
  const chordNames: string[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const sym = chordSyms[bar % chordSyms.length] || 'C';
    chordNames.push(sym);
    const ch = parseChord(sym) || parseChord('C')!;
    const t0 = bar * barSec;
    const keysChord = voiceChord(ch.root, ch.intervals, 60);
    const padChord = voiceChord(ch.root, ch.intervals, 48);
    const bassNote = 36 + ((((ch.root - 36) % 12) + 12) % 12);

    arrangeKeys(notes, style, t0, barSec, secPerBeat, keysChord, rand);
    arrangePad(notes, style, t0, barSec, padChord);
    arrangeBass(notes, style, t0, barSec, secPerBeat, bassNote);
  }

  // 旋律（可选）：模型直接给音符；没给就让键盘声部的分解和弦当主体
  if (Array.isArray(spec.melody) && spec.melody.length) {
    for (const mn of spec.melody) {
      const midi = pitchToMidi(mn?.pitch as string | number);
      const start = Number(mn?.start);
      const len = Number(mn?.len);
      if (midi == null || !Number.isFinite(start) || !Number.isFinite(len) || len <= 0) continue;
      notes.push({ track: 'lead', start: start * secPerBeat, dur: len * secPerBeat, midi, vel: 0.72 });
    }
  }

  // 歌词演唱（可选）：每字一个音 + 拼音。拼音由调用方（模型）给，避免内置大字典。
  if (Array.isArray(spec.lyrics) && spec.lyrics.length) {
    for (const ln of spec.lyrics) {
      const midi = pitchToMidi(ln?.pitch as string | number);
      const start = Number(ln?.start);
      const len = Number(ln?.len);
      if (midi == null || !Number.isFinite(start) || !Number.isFinite(len) || len <= 0) continue;
      notes.push({
        track: 'vox',
        start: start * secPerBeat,
        dur: len * secPerBeat,
        midi,
        vel: 0.8,
        syllable: { text: String(ln.text ?? ''), py: String(ln.py ?? '').trim().toLowerCase() },
      });
    }
  }

  arrangeDrums(notes, drums, bars, barSec, secPerBeat, beatsPerBar, rand);

  // 过滤越界音符（模型偶尔给超长音符/负起点）；尾音夹到曲子末尾之后一点，交给合成器的释放段
  const clean = notes
    .filter((n) => n.start >= 0 && n.start < duration + 0.001 && n.dur > 0.01)
    .map((n) => ({ ...n, dur: Math.min(n.dur, duration - n.start + 0.5) }));

  // 按风格/覆盖指定乐器：编曲层只决定"谁在哪个音区弹什么"，音色选择集中在这里
  const inst = resolveInstruments(style, spec.instruments);
  const kit = styleDrumKit(style);
  const voiced = clean.map((n) => {
    if (n.track === 'drums') return { ...n, drumKit: kit };
    if (n.track === 'vox') return n;
    return { ...n, inst: inst[n.track as 'keys' | 'pad' | 'bass' | 'lead'] };
  });

  return {
    title: String(spec.title || '未命名配乐').slice(0, 60),
    bpm, beatsPerBar, bars, duration, style, chordNames,
    notes: voiced, warnings,
  };
}

/** 风格 → 各声部默认乐器（spec.instruments 可逐项覆盖）。 */
function resolveInstruments(
  style: MusicStyle,
  override?: MusicSpec['instruments'],
): Record<'keys' | 'pad' | 'bass' | 'lead', InstrumentId> {
  const base: Record<MusicStyle, Record<'keys' | 'pad' | 'bass' | 'lead', InstrumentId>> = {
    gentle: { keys: 'piano', pad: 'strings', bass: 'ebass', lead: 'dizi' },
    lofi: { keys: 'epiano', pad: 'synth_pad', bass: 'synth_bass', lead: 'epiano' },
    pop: { keys: 'guitar', pad: 'strings', bass: 'ebass', lead: 'piano' },
    epic: { keys: 'strings', pad: 'strings', bass: 'synth_bass', lead: 'strings' },
    edm: { keys: 'synth_lead', pad: 'synth_pad', bass: 'synth_bass', lead: 'synth_lead' },
    rock: { keys: 'dist_guitar', pad: 'strings', bass: 'ebass', lead: 'dist_guitar' },
    cn: { keys: 'guzheng', pad: 'erhu', bass: 'ebass', lead: 'dizi' },
    folk: { keys: 'guitar', pad: 'strings', bass: 'ebass', lead: 'dizi' },
    ballad: { keys: 'piano', pad: 'strings', bass: 'ebass', lead: 'piano' },
  };
  return { ...base[style], ...(override || {}) };
}

/** 鼓组音色：国风/民谣/抒情用声学鼓，电子用电子鼓，摇滚用声学（会更"砸"）。 */
function styleDrumKit(style: MusicStyle): 'acoustic' | 'electronic' {
  return style === 'edm' ? 'electronic' : 'acoustic';
}

// ===== 各声部织体 =====

function arrangeKeys(
  out: NoteEvent[], style: MusicStyle, t0: number, barSec: number,
  beatSec: number, chord: number[], rand: () => number,
): void {
  const step = beatSec / 2; // 八分音符
  const count = Math.max(1, Math.round(barSec / step));
  const hit = (offset: number, midi: number, dur: number, vel: number) => {
    out.push({ track: 'keys', start: t0 + offset * step, dur, midi, vel });
  };

  if (style === 'gentle') {
    // 分解和弦：根-五-三-五（八分），力度轻微起伏
    const order = [0, 2, 1, 2, 0, 2, 1, 2];
    for (let i = 0; i < count; i++) {
      hit(i, chord[order[i % order.length] % chord.length], step * 1.8, 0.42 + rand() * 0.12);
    }
    return;
  }
  if (style === 'lofi') {
    // 块状和弦只在 1、3 拍，带轻微错位（慵懒感）
    for (const b of [0, 2]) {
      if (b * beatSec >= barSec) continue;
      const off = b * 2 + (rand() < 0.35 ? 0.12 : 0);
      for (const m of chord) {
        out.push({ track: 'keys', start: t0 + off * step, dur: beatSec * 1.6, midi: m, vel: 0.38 + rand() * 0.1 });
      }
    }
    return;
  }
  if (style === 'pop') {
    // 上行八分琶音
    for (let i = 0; i < count; i++) hit(i, chord[i % chord.length], step * 0.9, 0.45 + rand() * 0.1);
    return;
  }
  if (style === 'epic') {
    // 八度强奏：1、3 拍整和弦 + 高八度
    for (const b of [0, 2]) {
      if (b * beatSec >= barSec) continue;
      for (const m of chord) {
        out.push({ track: 'keys', start: t0 + b * beatSec, dur: beatSec * 1.8, midi: m, vel: 0.62 });
        out.push({ track: 'keys', start: t0 + b * beatSec, dur: beatSec * 1.8, midi: m + 12, vel: 0.5 });
      }
    }
    return;
  }
  if (style === 'rock') {
    // 强力和弦八分扫弦：根 + 五度，1、3 拍加八度重音
    const root = chord[0];
    for (let i = 0; i < count; i++) {
      const accent = i % 4 === 0;
      const dur = step * 0.7;
      out.push({ track: 'keys', start: t0 + i * step, dur, midi: root, vel: accent ? 0.82 : 0.55 });
      out.push({ track: 'keys', start: t0 + i * step, dur, midi: root + 7, vel: accent ? 0.76 : 0.5 });
      if (accent) out.push({ track: 'keys', start: t0 + i * step, dur, midi: root + 12, vel: 0.45 });
    }
    return;
  }
  if (style === 'cn') {
    // 古筝：八分分解 + 每两拍一个高八度倚音（国风的"刮奏"感）
    const order = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let i = 0; i < count; i++) {
      const m = chord[order[i % order.length] % chord.length];
      hit(i, m, step * 1.6, 0.5 + rand() * 0.12);
      if (i % 4 === 2) {
        out.push({ track: 'keys', start: t0 + Math.max(0, i - 0.5) * step, dur: step * 0.6, midi: m + 12, vel: 0.3 });
      }
    }
    return;
  }
  if (style === 'folk') {
    // 民谣指弹：根-三-五-三
    const order = [0, 1, 2, 1];
    for (let i = 0; i < count; i++) hit(i, chord[order[i % order.length] % chord.length], step * 1.7, 0.42 + rand() * 0.1);
    return;
  }
  if (style === 'ballad') {
    // 钢琴抒情：四分音符分解，留白更多
    const order = [0, 1, 2, 1];
    for (let b = 0; b < Math.round(barSec / beatSec); b++) {
      out.push({ track: 'keys', start: t0 + b * beatSec, dur: beatSec * 1.5, midi: chord[order[b % 4] % chord.length], vel: 0.45 + rand() * 0.08 });
    }
    return;
  }
  // edm：反拍切音
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) continue;
    for (const m of chord) out.push({ track: 'keys', start: t0 + i * step, dur: step * 0.55, midi: m, vel: 0.5 });
  }
}

function arrangePad(out: NoteEvent[], style: MusicStyle, t0: number, barSec: number, chord: number[]): void {
  // 电子/流行靠键盘织体；摇滚是失真吉他墙，再叠 pad 会糊
  if (style === 'edm' || style === 'pop' || style === 'rock') return;
  // 国风：二胡长音只拉根音与五度（留出笛子/古筝的空间）
  const tones = style === 'cn' ? [chord[0], chord[0] + 7] : chord;
  for (const m of tones) {
    out.push({ track: 'pad', start: t0, dur: barSec, midi: m, vel: style === 'epic' ? 0.4 : 0.3 });
  }
}

function arrangeBass(
  out: NoteEvent[], style: MusicStyle, t0: number, barSec: number, beatSec: number, root: number,
): void {
  const push = (offsetBeat: number, durBeats: number, midi: number, vel: number) =>
    out.push({ track: 'bass', start: t0 + offsetBeat * beatSec, dur: durBeats * beatSec, midi, vel });
  const beats = Math.max(1, Math.round(barSec / beatSec));

  if (style === 'edm') {
    for (let b = 0; b < beats; b++) push(b, 0.45, b % 4 === 2 ? root + 12 : root, 0.62);
    return;
  }
  if (style === 'pop') {
    for (let b = 0; b < beats; b++) push(b, 0.8, b % 2 === 1 ? root + 7 : root, 0.55);
    return;
  }
  if (style === 'lofi') {
    push(0, 1.6, root, 0.5);
    push(2.5, 1, root + 7, 0.42);
    return;
  }
  if (style === 'rock') {
    for (let b = 0; b < beats; b++) push(b, 0.42, b % 4 === 2 ? root + 12 : root, 0.6);
    return;
  }
  if (style === 'cn') {
    push(0, beats * 0.75, root, 0.42);
    push(beats - 0.5, 0.5, root + 7, 0.34);
    return;
  }
  if (style === 'folk') {
    push(0, beats / 2, root, 0.5);
    push(beats / 2, beats / 2 - 0.2, root + 7, 0.42);
    return;
  }
  push(0, beats * 0.9, root, style === 'epic' ? 0.62 : 0.45);
}

function arrangeDrums(
  out: NoteEvent[], pattern: DrumPattern, bars: number, barSec: number,
  beatSec: number, beatsPerBar: number, rand: () => number,
): void {
  if (pattern === 'none') return;
  const hit = (bar: number, beat: number, drum: NonNullable<NoteEvent['drum']>, vel: number) => {
    out.push({ track: 'drums', start: bar * barSec + beat * beatSec, dur: 0.2, midi: 0, vel, drum });
  };
  for (let bar = 0; bar < bars; bar++) {
    if (pattern === 'pop') {
      hit(bar, 0, 'kick', 0.9); hit(bar, 2, 'kick', 0.75);
      if (beatsPerBar >= 4) { hit(bar, 1, 'snare', 0.7); hit(bar, 3, 'snare', 0.7); }
      for (let b = 0; b < beatsPerBar; b += 0.5) hit(bar, b, 'hat', 0.3 + rand() * 0.12);
      continue;
    }
    if (pattern === 'rock') {
      hit(bar, 0, 'kick', 1); hit(bar, 2, 'kick', 0.8);
      hit(bar, 1, 'snare', 0.8); hit(bar, 3, 'snare', 0.8);
      for (let b = 0; b < beatsPerBar; b += 0.5) hit(bar, b, 'hat', 0.32 + rand() * 0.1);
      continue;
    }
    if (pattern === 'edm') {
      for (let b = 0; b < beatsPerBar; b++) hit(bar, b, 'kick', 0.95);
      for (let b = 0.5; b < beatsPerBar; b += 1) hit(bar, b, 'hat', 0.35);
      hit(bar, 1, 'clap', 0.7); hit(bar, 3, 'clap', 0.7);
      continue;
    }
    if (pattern === 'lofi') {
      hit(bar, 0, 'kick', 0.85);
      hit(bar, 2, 'snare', 0.55);
      for (let b = 0; b < beatsPerBar; b += 0.5) hit(bar, b, 'hat', 0.22 + rand() * 0.1);
      continue;
    }
    // ballad：极简
    hit(bar, 0, 'kick', 0.7);
    if (beatsPerBar >= 4) hit(bar, 2, 'snare', 0.45);
  }
}
