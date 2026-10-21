// 本地歌声合成 —— 用「声门源 + 元音共振峰」把歌词唱出来（零素材、零模型）。
//
// ★★★ 为什么自己做（2026-10-21 用户：「歌词呢？唱出来不行？现在不是能生成视频配音？」）：
//   现有 TTS（Edge/系统/模型层）只会**朗读**：没有音高曲线、没有音符时值，改不了唱腔。
//   要"唱"只能走歌声合成。这里用最经典也最轻的**共振峰合成**：
//      锯齿声门源（带抖动） → 三个元音共振峰带通 → 鼻音尾/声母噪声
//   拼音决定念哪个韵母（模型写歌词时顺手给拼音，避免内置几 MB 的拼音字典）。
//
// ★ 音色预期（必须提前说清楚）：
//   这是"合成人声"——像早期 Vocaloid/机器人唱腔：字能听清、音准正确，但**不像真人**。
//   真人级需要 DiffSinger/Sinsy 这类神经网络歌声合成（几 GB 权重），本轮不做。
//
// ★ 为什么不做"TTS 变速变调"：resample 会把共振峰一起搬走（花栗鼠化），
//   而且逐字拼接的断句/连音很难听；共振峰合成至少能控制元音与连音。

import type { VoiceRequest } from './music-instruments.js';

export interface VocalRequest extends VoiceRequest {
  /** 拼音（无声调，如 yue / shang / wo） */
  py: string;
}

// ===== 拼音 → 韵母 =====

type Vowel = [number, number, number]; // F1 F2 F3

const V: Record<string, Vowel> = {
  a: [800, 1200, 2600],
  o: [500, 900, 2500],
  e: [500, 1500, 2600],
  i: [300, 2300, 3000],
  u: [320, 800, 2400],
  v: [300, 1900, 2600], // ü
  r: [500, 1400, 1900], // 舌尖元音（zhi/chi/shi/ri/zi/ci/si 与 er）
};

/** 韵母 → 元音序列 + 鼻音尾。表外按"第一个能识别的元音"兜底。 */
const FINALS: Record<string, { seq: string[]; coda?: 'n' | 'ng' }> = {
  a: { seq: ['a'] }, o: { seq: ['o'] }, e: { seq: ['e'] }, i: { seq: ['i'] }, u: { seq: ['u'] }, v: { seq: ['v'] },
  er: { seq: ['r'] },
  ai: { seq: ['a', 'i'] }, ei: { seq: ['e', 'i'] }, ao: { seq: ['a', 'u'] }, ou: { seq: ['o', 'u'] },
  an: { seq: ['a'], coda: 'n' }, en: { seq: ['e'], coda: 'n' }, ang: { seq: ['a'], coda: 'ng' },
  eng: { seq: ['e'], coda: 'ng' }, ong: { seq: ['o'], coda: 'ng' },
  in: { seq: ['i'], coda: 'n' }, ing: { seq: ['i'], coda: 'ng' }, un: { seq: ['u'], coda: 'n' },
  ia: { seq: ['i', 'a'] }, ie: { seq: ['i', 'e'] }, iao: { seq: ['i', 'a', 'u'] }, iu: { seq: ['i', 'u'] },
  ian: { seq: ['i', 'a'], coda: 'n' }, iang: { seq: ['i', 'a'], coda: 'ng' }, iong: { seq: ['i', 'o'], coda: 'ng' },
  ua: { seq: ['u', 'a'] }, uo: { seq: ['u', 'o'] }, uai: { seq: ['u', 'a', 'i'] }, ui: { seq: ['u', 'i'] },
  uan: { seq: ['u', 'a'], coda: 'n' }, uang: { seq: ['u', 'a'], coda: 'ng' }, ueng: { seq: ['u', 'e'], coda: 'ng' },
  ve: { seq: ['v', 'e'] }, van: { seq: ['v', 'a'], coda: 'n' }, vn: { seq: ['v'], coda: 'n' },
  '': { seq: ['r'] },
};

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const PLOSIVES = new Set(['b', 'p', 'd', 't', 'g', 'k']);
const FRICATIVES = new Set(['f', 'h', 's', 'sh', 'x', 'c', 'ch', 'z', 'zh', 'j', 'q']);
const SONORANTS = new Set(['m', 'n', 'l', 'r']);

interface Syllable {
  initial: string;
  seq: string[];
  coda?: 'n' | 'ng';
}

/** 拼音拆分：声母 + 韵母（处理 y/w 与 j/q/x 的省写）。 */
export function parsePinyin(pyRaw: string): Syllable {
  let py = String(pyRaw || '').toLowerCase().replace(/[1-5]/g, '').trim();
  // 带声调符号的写法一并支持（模型偶尔写 yuè）
  py = py.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ü/g, 'v').replace(/u:/g, 'v');
  if (!py) return { initial: '', seq: ['a'] };

  let initial = '';
  for (const ini of INITIALS) {
    if (py.startsWith(ini)) { initial = ini; py = py.slice(ini.length); break; }
  }
  // y/w 是零声母的书写形式：yi→i、wu→u、yu→v
  if (initial === 'y') {
    if (py.startsWith('u')) { py = 'v' + py.slice(1); initial = ''; }
    else if (py.startsWith('i')) { initial = ''; }
    else { py = 'i' + py; initial = ''; }
  }
  if (initial === 'w') {
    if (py.startsWith('u')) { initial = ''; }
    else { py = 'u' + py; initial = ''; }
  }
  // j/q/x 后的 u 实际是 ü
  if (['j', 'q', 'x'].includes(initial) && py.startsWith('u')) py = 'v' + py.slice(1);

  // 舌尖元音：zhi/chi/shi/ri/zi/ci/si 里的 i 不是 [i]，是舌尖元音（共振峰更靠后）
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(initial) && py === 'i') {
    return { initial, seq: ['r'] };
  }

  const hit = FINALS[py];
  if (hit) return { initial, seq: hit.seq, coda: hit.coda };
  for (const ch of py) {
    if (V[ch]) return { initial, seq: [ch] };
  }
  return { initial, seq: ['a'] };
}

// ===== 共振峰滤波器 =====

interface Resonator {
  run(x: number): number;
  set(fc: number, bw: number): void;
}

/** 两极点谐振器（带通），中心 fc、带宽 bw；系数可中途更新（元音滑动）。 */
function makeResonator(sr: number, fc: number, bw: number): Resonator {
  let a1 = 0;
  let a2 = 0;
  let gain = 1;
  let y1 = 0;
  let y2 = 0;
  const set = (f: number, b: number) => {
    const rr = Math.exp((-Math.PI * b) / sr);
    const th = (2 * Math.PI * Math.min(Math.max(f, 60), sr * 0.45)) / sr;
    a1 = 2 * rr * Math.cos(th);
    a2 = -(rr * rr);
    gain = (1 - rr) * 2; // 归一化：Q 高时不至于爆音
  };
  set(fc, bw);
  return {
    set,
    run(x: number) {
      const y = gain * x + a1 * y1 + a2 * y2;
      y2 = y1;
      y1 = y;
      return y;
    },
  };
}

function lerpVowel(a: Vowel, b: Vowel, k: number): Vowel {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * 渲染一个音节（单声道）。返回长度含释放段。
 * 结构：声母（爆破/摩擦/鼻音）→ 元音（可多段滑动）→ 鼻音尾。
 */
export function renderVocal(req: VocalRequest): Float32Array {
  const { sr, freq, dur, vel, seed } = req;
  const syl = parsePinyin(req.py);
  const release = 0.09;
  const len = Math.floor((dur + release) * sr);
  const out = new Float32Array(len);

  const ini = syl.initial;
  const isPlosive = PLOSIVES.has(ini);
  const isFricative = FRICATIVES.has(ini);
  const isSonorant = SONORANTS.has(ini);
  const consLen = isPlosive ? 0.045 : isFricative ? 0.07 : isSonorant ? 0.05 : 0;

  const vowels: Vowel[] = syl.seq.map((s) => V[s] || V.a);
  const nasal = syl.coda;

  const res1 = makeResonator(sr, vowels[0][0], 90);
  const res2 = makeResonator(sr, vowels[0][1], 110);
  const res3 = makeResonator(sr, vowels[0][2], 140);
  const nasalRes = makeResonator(sr, 250, 120);

  let rnd = (seed * 7919 + 31) >>> 0;
  const rand = () => {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    return rnd / 4294967296;
  };

  let phase = 0;
  let prevNoise = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;

    // —— 声母段 ——
    if (t < consLen) {
      let x = 0;
      if (isPlosive) {
        if (t > consLen * 0.55) {
          const n = rand() * 2 - 1;
          x = (['p', 't', 'k'].includes(ini) ? n : n * 0.5) * 0.5;
        }
      } else if (isFricative) {
        const n = rand() * 2 - 1;
        const low = ['f', 'h'].includes(ini);
        x = low ? n * 0.35 : (n - prevNoise) * 0.5; // 差分提亮高频摩擦
        prevNoise = n;
      } else if (isSonorant) {
        x = Math.sin(2 * Math.PI * 180 * t) * 0.18;
      }
      out[i] = x * vel;
      continue;
    }

    const vt = t - consLen;
    const singDur = Math.max(0.05, dur - consLen);
    const env = Math.min(1, vt / 0.03) * (vt <= singDur ? 1 : Math.exp(-(vt - singDur) / (release / 3)));
    if (env < 1e-5) continue;

    // 音高：颤音（0.15s 渐入）+ 微抖动
    const vibAmt = 0.006 * Math.min(1, Math.max(0, (vt - 0.15) / 0.3)) * Math.sin(2 * Math.PI * 5.4 * vt);
    const f = freq * (1 + vibAmt) * (1 + (rand() * 2 - 1) * 0.004);
    phase += (2 * Math.PI * f) / sr;
    const saw = (phase % (2 * Math.PI)) / Math.PI - 1;

    // 元音滑动 + 鼻音尾
    let target = vowels[0];
    if (vowels.length > 1) {
      const p = Math.min(1, vt / Math.max(0.08, singDur * 0.8));
      const seg = Math.min(vowels.length - 1, Math.floor(p * (vowels.length - 1)));
      const local = p * (vowels.length - 1) - seg;
      target = seg >= vowels.length - 1
        ? vowels[vowels.length - 1]
        : lerpVowel(vowels[seg], vowels[seg + 1], local);
    }
    const nasalAmt = nasal ? Math.max(0, (vt / singDur - 0.78) / 0.22) : 0;

    // 每 64 采样更新共振峰中心（比逐采样换系数便宜一个量级，听感无差）
    if (i % 64 === 0) {
      res1.set(target[0], 90);
      res2.set(target[1] * (1 - 0.25 * nasalAmt), 110);
      res3.set(target[2], 140);
    }

    const y = res1.run(saw) + res2.run(saw) * 0.7 + res3.run(saw) * 0.35
      + (nasalAmt > 0 ? nasalRes.run(saw) * 0.5 * nasalAmt : 0);
    out[i] = y * env * vel * 0.9;
  }

  /**
   * ★★★ 去直流 + 单音限幅（2026-10-21 实测踩到）：
   *   高 Q 谐振器会累积直流/低频能量，单音峰值能到十几 —— 混音后归一化会把**整首歌压扁**
   *   （实测演唱版 −0.4 LUFS，等于一条嗡嗡声）。所以每个音节先自己去直流、限到 0.7 峰值。
   */
  let px = 0;
  let py = 0;
  for (let i = 0; i < len; i++) {
    const x = out[i];
    const y = x - px + 0.995 * py;
    px = x;
    py = y;
    out[i] = y;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.7) {
    const k = 0.7 / peak;
    for (let i = 0; i < len; i++) out[i] *= k;
  }
  return out;
}
