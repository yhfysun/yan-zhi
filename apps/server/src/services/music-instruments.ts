// 乐器音色库 —— 让配乐"不像电子"的底层。
//
// ★★★ 为什么重写音色层（2026-10-21 用户：「音色再优化一下，别太电子，摇滚、民乐啊这些都要」）：
//   上一版所有声部都是"正弦/谐波叠加"，听感必然是电子琴。真乐器之所以真，主要差在两件事：
//   ① **起音**（拨弦/击弦的噪声瞬态、弓弦的缓起）② **共振**（琴箱/管体的固定共振峰）。
//   所以这里补三类做法：
//   · **Karplus-Strong 拨弦**（吉他/古筝/琵琶/贝斯）——用一段噪声在延迟线里循环衰减，
//     这是"物理建模"里最便宜也最像真拨弦的方法，一耳朵就不是合成器；
//   · **共振峰乐器**（二胡的鼻腔、笛子的管口）——在谐波上叠带通，而不是只有亮/暗；
//   · **失真链路**（电吉他）——锯齿 → tanh 过载 → 低通，摇滚的基础音色。
//
// ★ 边界：这是**物理建模级**音色（像"乐器"，不是"某品牌采样"）。
//   民乐（古筝/笛子/二胡/琵琶）为近似建模，不追求以一敌真的采样库。

import type { TrackName } from './music-plan.js';

export type InstrumentId =
  | 'piano' | 'epiano' | 'organ'
  | 'strings' | 'erhu' | 'dizi'
  | 'guitar' | 'guzheng' | 'pipa'
  | 'dist_guitar'
  | 'ebass' | 'synth_bass'
  | 'synth_pad' | 'synth_lead';

export interface VoiceRequest {
  sr: number;
  /** 基频（Hz） */
  freq: number;
  /** 音符时值（秒） */
  dur: number;
  /** 力度 0~1 */
  vel: number;
  /** 随机种子（噪声/抖动要可复现） */
  seed: number;
}

function prng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** 一阶低通系数（fc 截止频率）。 */
function lpCoef(fc: number, sr: number): number {
  const x = Math.exp((-2 * Math.PI * fc) / sr);
  return 1 - x;
}

// ===== Karplus-Strong 拨弦（吉他 / 古筝 / 琵琶 / 贝斯） =====

/**
 * @param brightness 0.05~0.95：激励噪声的低通强度，越大越亮（琵琶最亮、贝斯最闷）
 * @param decaySec 振幅衰减到 -60dB 的时间（越长越像空弦余音）
 * @param body 逐采样包络修正（模拟琴箱/起音）
 */
function karplus(
  req: VoiceRequest, brightness: number, decaySec: number, body: (t: number) => number = () => 1,
): Float32Array {
  const { sr, freq, dur, vel, seed } = req;
  const N = Math.max(2, Math.round(sr / Math.max(20, freq)));
  const buf = new Float32Array(N);
  const rnd = prng(seed);
  let prev = 0;
  const a = Math.max(0.02, Math.min(0.95, brightness));
  for (let i = 0; i < N; i++) {
    const w = rnd() * 2 - 1;
    prev = prev * (1 - a) + w * a;
    buf[i] = prev;
  }
  const len = Math.floor((dur + Math.min(0.8, decaySec * 0.5)) * sr);
  const out = new Float32Array(len);
  // 每个周期损失：decaySec 对应 -60dB（0.001）
  const loss = Math.pow(0.001, 1 / Math.max(1, (decaySec * sr) / N));
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % N];
    buf[idx] = 0.5 * (cur + nxt) * loss;
    out[i] = cur * vel * body(i / sr);
    idx = (idx + 1) % N;
  }
  return out;
}

// ===== 谐波 + 共振峰（弓弦 / 管乐） =====

interface HarmOpts {
  /** 谐波数量 */
  harmonics: number;
  /** 谐波幅度指数（1 = 1/n，越大越暗） */
  tilt: number;
  /** 起音秒 */
  attack: number;
  /** 颤音频率与深度（相对音高） */
  vibHz?: number;
  vibDepth?: number;
  /** 共振峰：[中心频率, 增益, 带宽] */
  formants?: Array<[number, number, number]>;
  /** 气声噪声量 0~1（笛子） */
  breath?: number;
  /** 释放秒 */
  release?: number;
}

/** 算每个谐波被共振峰抬升的增益（每音一次，避免逐采样三角运算）。 */
function formantGains(
  formants: Array<[number, number, number]>, f0: number, harmonics: number,
): Float32Array {
  const g = new Float32Array(harmonics + 1);
  for (let h = 1; h <= harmonics; h++) {
    const f = f0 * h;
    let s = 1;
    for (const [fc, gain, bw] of formants) {
      const d = (f - fc) / bw;
      s += gain / (1 + d * d);
    }
    g[h] = s;
  }
  return g;
}

function bowed(req: VoiceRequest, o: HarmOpts): Float32Array {
  const { sr, freq, dur, vel, seed } = req;
  const release = o.release ?? 0.35;
  const len = Math.floor((dur + release) * sr);
  const out = new Float32Array(len);
  const rnd = prng(seed);
  const gains = o.formants ? formantGains(o.formants, freq, o.harmonics) : null;
  const lp = lpCoef(6500, sr);
  let lpState = 0;
  let phase = 0;
  const vibHz = o.vibHz ?? 0;
  const vibDepth = o.vibDepth ?? 0;
  const breath = o.breath ?? 0;
  const vibRamp = 0.25; // 颤音渐入（真乐器不会一上来就抖）
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = (t < o.attack ? t / o.attack : 1) * (t <= dur ? 1 : Math.exp(-(t - dur) / (release / 3)));
    if (env < 1e-5) continue;
    const vibAmt = vibDepth * Math.min(1, Math.max(0, (t - vibRamp) / 0.4)) * Math.sin(2 * Math.PI * vibHz * t);
    const f = freq * (1 + vibAmt);
    phase += (2 * Math.PI * f) / sr;
    let s = 0;
    for (let h = 1; h <= o.harmonics; h++) {
      const amp = (gains ? gains[h] : 1) / Math.pow(h, o.tilt);
      s += amp * Math.sin(phase * h);
    }
    if (breath > 0) s += (rnd() * 2 - 1) * breath;
    lpState += lp * (s - lpState);
    out[i] = lpState * env * vel * 0.5;
  }
  return out;
}

// ===== 键盘 =====

function pianoLike(req: VoiceRequest): Float32Array {
  const { sr, freq, dur, vel, seed } = req;
  const release = 0.5;
  const len = Math.floor((dur + release) * sr);
  const out = new Float32Array(len);
  const rnd = prng(seed);
  const clickLen = Math.floor(0.012 * sr); // 击弦噪声很短，是"木头味"的关键
  const loud = 0.6 + 0.4 * vel;
  const amps = [1, 0.55 * loud, 0.3 * loud, 0.16 * loud, 0.09 * loud, 0.05 * loud];
  const decs = [1.6, 2.4, 3.4, 4.8, 6.6, 8.5];
  const inh = 0.0004; // 轻微非谐性：真实琴弦泛音不是严格整数倍
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = (t < 0.004 ? t / 0.004 : 1) * (t <= dur ? 1 : Math.exp(-(t - dur) / (release / 3)));
    if (env < 1e-5) continue;
    let s = 0;
    for (let h = 0; h < amps.length; h++) {
      const fh = freq * (h + 1) * Math.sqrt(1 + inh * (h + 1) * (h + 1));
      s += amps[h] * Math.sin(2 * Math.PI * fh * t) * Math.exp(-t * decs[h]);
    }
    if (i < clickLen) s += (rnd() * 2 - 1) * 0.25 * (1 - i / clickLen) * vel;
    out[i] = s * env * vel * 0.5;
  }
  return out;
}

function epiano(req: VoiceRequest): Float32Array {
  const { sr, freq, dur, vel } = req;
  const release = 0.35;
  const len = Math.floor((dur + release) * sr);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = (t < 0.006 ? t / 0.006 : 1) * (t <= dur ? 1 : Math.exp(-(t - dur) / (release / 3)));
    // FM：调制器 = 2 倍频，指数衰减（Rhodes 的"铃"感）
    const mod = Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 3.2) * 1.6;
    out[i] = Math.sin(2 * Math.PI * freq * t + mod) * env * vel * 0.55;
  }
  return out;
}

function organ(req: VoiceRequest): Float32Array {
  const { sr, freq, dur, vel } = req;
  const len = Math.floor((dur + 0.15) * sr);
  const out = new Float32Array(len);
  const draws = [1, 0.6, 0.4, 0.25, 0.18, 0.1];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.01) * (t <= dur ? 1 : Math.exp(-(t - dur) / 0.04));
    let s = 0;
    for (let h = 0; h < draws.length; h++) s += draws[h] * Math.sin(2 * Math.PI * freq * (h + 1) * t);
    out[i] = s * env * vel * 0.28;
  }
  return out;
}

// ===== 失真吉他 =====

function distGuitar(req: VoiceRequest): Float32Array {
  const { sr, freq, dur, vel, seed } = req;
  const len = Math.floor((dur + 0.25) * sr);
  const out = new Float32Array(len);
  const rnd = prng(seed);
  const lp = lpCoef(3200, sr);
  let s1 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = (t < 0.004 ? t / 0.004 : 1) * (t <= dur ? 1 : Math.exp(-(t - dur) / 0.08));
    // 双锯齿微失谐（和弦整体更厚）
    p1 += (2 * Math.PI * freq) / sr;
    p2 += (2 * Math.PI * freq * 1.004) / sr;
    const saw = ((p1 % (2 * Math.PI)) / Math.PI - 1) + (((p2 % (2 * Math.PI)) / Math.PI - 1) * 0.7);
    const drive = 3 + vel * 3;
    let x = Math.tanh(saw * drive);
    x += (rnd() * 2 - 1) * 0.03; // 拾音器底噪
    s1 += lp * (x - s1);
    out[i] = s1 * env * vel * 0.32;
  }
  return out;
}

// ===== 统一入口 =====

/**
 * 渲染一个音（单声道样本）。返回值长度含释放段，调用方负责混音/声像。
 * ★ 未知 instrument 回落到钢琴：宁可音色不对，也不要静音（静音会让人以为配乐坏了）。
 */
export function renderInstrument(inst: InstrumentId | undefined, req: VoiceRequest): Float32Array {
  switch (inst) {
    case 'piano': return pianoLike(req);
    case 'epiano': return epiano(req);
    case 'organ': return organ(req);
    case 'guitar': return karplus(req, 0.55, 1.8, (t) => 1 + 0.1 * Math.exp(-t * 40));
    case 'guzheng': return karplus(req, 0.85, 2.6, (t) => 1 + 0.15 * Math.exp(-t * 60));
    case 'pipa': return karplus(req, 0.92, 0.9, (t) => 1 + 0.2 * Math.exp(-t * 90));
    case 'ebass': return karplus(req, 0.25, 1.2);
    case 'synth_bass': {
      const { sr, freq, dur, vel } = req;
      const len = Math.floor((dur + 0.12) * sr);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.005) * (t <= dur ? 1 : Math.exp(-(t - dur) / 0.04));
        out[i] = (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t) * Math.exp(-t * 4)) * env * vel * 0.44;
      }
      return out;
    }
    case 'strings':
      return bowed(req, { harmonics: 9, tilt: 1.15, attack: 0.12, vibHz: 5.2, vibDepth: 0.0025, release: 0.7 });
    case 'erhu':
      // 二胡：强颤音 + 1.2k 附近鼻腔共振
      return bowed(req, {
        harmonics: 10, tilt: 1.1, attack: 0.09, vibHz: 5.8, vibDepth: 0.006, release: 0.45,
        formants: [[1250, 1.4, 420], [2800, 0.5, 900]],
      });
    case 'dizi':
      // 笛子：气声 + 管口共振，高次谐波少
      return bowed(req, {
        harmonics: 5, tilt: 1.5, attack: 0.045, vibHz: 5.5, vibDepth: 0.004, breath: 0.06, release: 0.25,
        formants: [[2200, 0.8, 700], [3400, 0.4, 1200]],
      });
    case 'dist_guitar': return distGuitar(req);
    case 'synth_pad':
      return bowed(req, { harmonics: 6, tilt: 0.95, attack: 0.35, vibHz: 0.2, vibDepth: 0.002, release: 0.9 });
    case 'synth_lead':
      return bowed(req, { harmonics: 5, tilt: 1.6, attack: 0.01, vibHz: 5, vibDepth: 0.003, release: 0.25 });
    default:
      return pianoLike(req);
  }
}

/** 各轨默认乐器（spec 未覆盖时）。 */
export const DEFAULT_TRACK_INSTRUMENT: Record<Exclude<TrackName, 'drums' | 'vox'>, InstrumentId> = {
  keys: 'piano',
  pad: 'strings',
  bass: 'ebass',
  lead: 'dizi',
};
