// 合成器装配层 —— 把编曲事件渲染成音频（乐器音色见 music-instruments，歌声见 music-vocal）。
//
// ★ 本层只做三件事：按音符调度渲染 → 分轨混音（声像/增益）→ 混响 + 软削波 + 归一。
//   音色细节一律在 music-instruments / music-vocal，避免"改一个音色要动混音"。
//
// ★ 确定性：同一条编曲 + 同一个种子 → 同一份音频（噪声用种子 PRNG），便于单测与"重渲染不变版"。
// ★ 输出 WAV 再交给 ffmpeg 转 m4a：PCM 生成本身是纯计算（好测、跨平台），编码复用既有链路。

import type { Arrangement, NoteEvent, TrackName } from './music-plan.js';
import { renderInstrument } from './music-instruments.js';
import { renderVocal } from './music-vocal.js';

export interface SynthOptions {
  /** 采样率（默认 44100） */
  sampleRate?: number;
  /** 尾部余韵（秒，默认 1.6） */
  tailSec?: number;
  /**
   * 预渲染的人声（音符下标 → 样本，44.1k）。
   * ★ 由 music-sing-tts 的 prepareVocals 提供（TTS 变调唱法，异步）；
   *   缺省时回落到共振峰合成 renderVocal（同步、机器人音色）。
   */
  vocals?: Map<number, Float32Array>;
  /**
   * 整条人声轨（44.1k，从 0 开始）。
   * ★ DiffSinger 一次性生成整首（含 rest 空档），直接叠在时间轴上；
   *   给了它就不再逐音符渲染 vox。
   */
  vocalTrack?: Float32Array;
}

export interface RenderedAudio {
  wav: Buffer;
  sampleRate: number;
  /** 音频总时长（含尾巴） */
  seconds: number;
  /** 归一后的峰值（0~1，排障用） */
  peak: number;
}

/** 分轨增益/声像（乐器自身已含力度，这里只调平衡）。 */
const TRACK_GAIN: Record<TrackName, number> = {
  keys: 0.55, pad: 0.5, bass: 0.65, lead: 0.55, drums: 0.6, vox: 1.0,
};
const TRACK_PAN: Record<TrackName, number> = {
  keys: -0.12, pad: 0.15, bass: 0, lead: 0.06, drums: 0, vox: 0,
};

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** 渲染整段编曲为 16-bit 立体声 WAV。 */
export function renderArrangement(arr: Arrangement, opts: SynthOptions = {}): RenderedAudio {
  const sr = Math.max(8000, Math.min(96000, Math.round(opts.sampleRate || 44100)));
  const tail = Math.max(0.2, Math.min(4, Number(opts.tailSec ?? 1.6)));
  const totalSec = arr.duration + tail;
  const total = Math.ceil(totalSec * sr);
  const left = new Float32Array(total);
  const right = new Float32Array(total);

  /**
   * ★ 有人声时伴奏自动降 25%（2026-10-21 用户：「没听到有人声」的实测修正）：
   *   合成器的键盘/铺底是连续音墙，人声在同一频段很容易被盖住 ——
   *   这是混音问题，不是合成问题。真人编曲也会给主唱让位。
   */
  const hasVox = arr.notes.some((n) => n.track === 'vox');
  const bedScale = hasVox ? 0.75 : 1;

  // 整条人声轨（DiffSinger）优先：从 0 叠加，不再逐音符渲染 vox
  if (opts.vocalTrack && opts.vocalTrack.length) {
    mixIn(left, right, opts.vocalTrack, 0, TRACK_GAIN.vox, 0);
  }

  for (let i = 0; i < arr.notes.length; i++) {
    const n = arr.notes[i];
    if (n.track === 'vox' && opts.vocalTrack) continue;
    const seed = i + 1;
    if (n.track === 'drums') {
      addDrum(left, right, sr, n, seed, n.drumKit || 'acoustic');
      continue;
    }
    const mono = n.track === 'vox'
      ? (opts.vocals?.get(i)
        ?? renderVocal({ sr, freq: midiToFreq(n.midi), dur: n.dur, vel: n.vel, seed, py: n.syllable?.py || '' }))
      : renderInstrument(n.inst, { sr, freq: midiToFreq(n.midi), dur: n.dur, vel: n.vel, seed });
    const gain = TRACK_GAIN[n.track] * (n.track === 'vox' ? 1 : bedScale);
    mixIn(left, right, mono, Math.floor(n.start * sr), gain, TRACK_PAN[n.track]);
  }

  applyReverb(left, right, sr);

  // 软削波 + 峰值归一（防爆音；归一后音量稳定，用户不用每次调）
  let peak = 0;
  for (let i = 0; i < total; i++) {
    left[i] = Math.tanh(left[i] * 1.1) * 0.9;
    right[i] = Math.tanh(right[i] * 1.1) * 0.9;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const norm = peak > 0.89 ? 0.89 / peak : 1;
  for (let i = 0; i < total; i++) { left[i] *= norm; right[i] *= norm; }

  return { wav: encodeWav(left, right, sr), sampleRate: sr, seconds: totalSec, peak: peak * norm };
}

function mixIn(L: Float32Array, R: Float32Array, mono: Float32Array, start: number, gain: number, pan: number): void {
  const gl = gain * (1 - Math.max(0, pan));
  const gr = gain * (1 + Math.min(0, pan));
  for (let i = 0; i < mono.length; i++) {
    const idx = start + i;
    if (idx >= L.length) break;
    const v = mono[i];
    L[idx] += v * gl;
    R[idx] += v * gr;
  }
}

// ===== 鼓组 =====

/**
 * 鼓件合成：声学 vs 电子两套。
 * ★ 声学鼓的关键不是"更响"，而是**击打噪声 + 基频的衰减形状**（军鼓有鼓皮双音、
 *   底鼓有音高下滑、镲是金属噪声而不是白噪）。
 */
function addDrum(
  L: Float32Array, R: Float32Array, sr: number, n: NoteEvent, seed: number,
  kit: 'acoustic' | 'electronic',
): void {
  const start = Math.floor(n.start * sr);
  const rnd = prng(seed * 7919 + 17);
  const kind = n.drum || 'kick';
  const gain = TRACK_GAIN.drums * n.vel;
  const acoustic = kit === 'acoustic';

  let len = 0.2;
  const fn = (t: number, r: number): number => {
    if (kind === 'kick') {
      len = acoustic ? 0.42 : 0.3;
      const f0 = acoustic ? 42 : 48;
      const f1 = acoustic ? 120 : 160;
      const f = f0 + f1 * Math.exp(-t / (acoustic ? 0.045 : 0.03));
      const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (acoustic ? 0.13 : 0.1));
      const click = acoustic ? r * Math.exp(-t / 0.006) * 0.3 : 0;
      return body * 1.1 + click;
    }
    if (kind === 'snare') {
      len = acoustic ? 0.26 : 0.2;
      const noise = r * Math.exp(-t / (acoustic ? 0.09 : 0.07));
      if (!acoustic) return noise * 1.5 + 0.25 * Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t / 0.05);
      // 声学军鼓：鼓皮双音 + 响弦噪声
      const tone = (Math.sin(2 * Math.PI * 185 * t) + 0.6 * Math.sin(2 * Math.PI * 330 * t)) * Math.exp(-t / 0.055);
      return tone * 0.55 + noise * 1.25;
    }
    if (kind === 'hat') {
      len = acoustic ? 0.1 : 0.07;
      // 金属噪声：几个不谐和方波叠加后取高频差分量
      const metal = Math.sin(2 * Math.PI * 6300 * t) + Math.sin(2 * Math.PI * 8100 * t) + Math.sin(2 * Math.PI * 10400 * t);
      const nz = r - 0; // 原始噪声做高频
      return (nz * 0.6 + metal * 0.06) * Math.exp(-t / (acoustic ? 0.035 : 0.028));
    }
    // clap
    len = 0.28;
    const burst = Math.exp(-t / 0.02)
      + (t > 0.012 ? Math.exp(-(t - 0.012) / 0.02) : 0)
      + (t > 0.026 ? Math.exp(-(t - 0.026) / 0.05) : 0);
    return r * burst * (acoustic ? 0.5 : 0.4);
  };

  // 先算长度（fn 内会更新 len，这里先跑一次 0 时刻确定类型长度）
  fn(0, 0);
  const samples = Math.floor(len * sr);
  let prev = 0;
  for (let i = 0; i < samples; i++) {
    const idx = start + i;
    if (idx >= L.length) break;
    const t = i / sr;
    let r = rnd() * 2 - 1;
    // 镲要高通：单差分去低频，否则是"噗"
    if (kind === 'hat') { const cur = r; r = cur - prev; prev = cur; }
    const v = fn(t, r) * gain;
    L[idx] += v;
    R[idx] += v;
  }
}

/** Schroeder 混响（4 梳状 + 2 全通）。延迟长度按采样率换算。 */
function applyReverb(L: Float32Array, R: Float32Array, sr: number): void {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.max(1, Math.round(d * sr)));
  const aps = [0.005, 0.0017].map((d) => Math.max(1, Math.round(d * sr)));
  const fb = 0.72;
  const wet = 0.16;
  const n = L.length;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;

  const out = new Float32Array(n);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[idx];
      buf[idx] = mono[i] + y * fb;
      idx = (idx + 1) % d;
      out[i] += y * 0.25;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const bufOut = buf[idx];
      const x = out[i];
      buf[idx] = x + bufOut * 0.5;
      idx = (idx + 1) % d;
      out[i] = bufOut - x * 0.5;
    }
  }
  for (let i = 0; i < n; i++) {
    L[i] += out[i] * wet;
    R[i] += out[i] * wet;
  }
}

/** Float32 立体声 → 16-bit PCM WAV。 */
export function encodeWav(L: Float32Array, R: Float32Array, sampleRate: number): Buffer {
  const n = Math.min(L.length, R.length);
  const dataBytes = n * 2 * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);             // PCM 块大小
  buf.writeUInt16LE(1, 20);              // PCM
  buf.writeUInt16LE(2, 22);              // 声道数
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); // 字节率
  buf.writeUInt16LE(4, 32);              // 块对齐
  buf.writeUInt16LE(16, 34);             // 位深
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    buf.writeInt16LE(Math.round(l * 32767), o); o += 2;
    buf.writeInt16LE(Math.round(r * 32767), o); o += 2;
  }
  return buf;
}
