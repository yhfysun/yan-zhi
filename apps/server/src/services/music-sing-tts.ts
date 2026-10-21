// TTS 唱法 —— 用现成语音合成（Edge 真人音色）做"人声演唱"。
//
// ★★★ 为什么换掉纯共振峰合成（2026-10-21 用户：「人声效果太拉胯」）：
//   共振峰合成只能做到"像人声的电子音"，再怎么调也是机器人。而项目里已经有 Edge TTS
//   的真人音色 —— 把它**变调到音符 + 拉伸到音符时值**，就能得到"真人音色在唱歌"的效果
//   （早期 utau/初音"翻唱"也是这个思路）。流程：
//     单音节 TTS → 去静音 → 估基频 F0 → 变调（重采样）→ 时长拉伸（WSOLA）
//   ★ 边界：单字 TTS 带原声调，拉伸后会有轻微滑音；辅音是朗读式而非演唱式。
//     但音色是真人，远好于共振峰合成。
//
// ★ 离线/网络不通时**自动回落**到 music-vocal 的共振峰合成，并在结果里如实说明。

import path from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { edgeSpeak } from '../mcp/edge-tts.js';
import type { Arrangement } from './music-plan.js';

export interface SingOptions {
  /** Edge 音色（默认中文女声） */
  voice?: string;
  /** ffmpeg 可执行文件（解码 TTS 的 mp3） */
  ffmpeg: string;
}

export interface VocalPrepared {
  /** 音符下标 → 单声道样本（已变调/拉伸到目标音高与时长） */
  map: Map<number, Float32Array>;
  /** 实际用到的引擎 */
  engine: 'system-tts' | 'edge-tts' | 'formant';
  /** 回落/失败原因（UI 与工具结果都要能说清） */
  warnings: string[];
}

const CACHE_DIR = () => path.join(tmpdir(), 'yz-sing-cache');
const SAMPLE_RATE = 44100;

function cacheKey(text: string, voice: string): string {
  return createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 20);
}

/** 取一个音节的 TTS PCM（44.1k 单声道）。失败返回 null（调用方回落）。 */
async function syllablePcm(text: string, voice: string, ffmpeg: string): Promise<{ pcm: Float32Array; engine: 'system-tts' | 'edge-tts' } | null> {
  const dir = CACHE_DIR();
  await mkdir(dir, { recursive: true });
  const key = cacheKey(text, voice);

  // ① 本机离线语音（Windows SAPI：中文机器通常自带 Microsoft Huihui）
  //    ★ 优先离线：Edge 端点在部分网络下直接 403（2026-10-21 实测），离线才不会时好时坏。
  if (process.platform === 'win32') {
    const sys = await systemSyllable(text, dir, key, ffmpeg);
    if (sys) return { pcm: sys, engine: 'system-tts' };
  }

  // ② Edge 在线（真人音色更好，但依赖网络）
  const mp3 = path.join(dir, `${key}.mp3`);
  const raw = path.join(dir, `${key}.f32`);
  try {
    let has = false;
    try { has = (await stat(mp3)).size > 0; } catch { /* 未缓存 */ }
    if (!has) {
      const r = await edgeSpeak(text, { voice, timeoutMs: 30000 });
      if (!r.buffer?.length) return null;
      await writeFile(mp3, r.buffer);
    }
    const pcm = await decodeToPcm(ffmpeg, mp3, raw);
    return pcm ? { pcm, engine: 'edge-tts' } : null;
  } catch {
    return null;
  }
}

/** ffmpeg 解码任意音频 → 44.1k 单声道 f32。 */
async function decodeToPcm(ffmpeg: string, src: string, raw: string): Promise<Float32Array | null> {
  const dec = await runCmd(ffmpeg, [
    '-y', '-v', 'error', '-i', src, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', raw,
  ], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 });
  if (!dec.ok) return null;
  const buf = await readFile(raw);
  return trimSilence(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4))));
}

/**
 * Windows 离线合成一个音节（System.Speech / SAPI）。
 * ★ 用 -EncodedCommand 传脚本：中文与引号直接拼命令行会被 PowerShell 解析坏。
 */
async function systemSyllable(text: string, dir: string, key: string, ffmpeg: string): Promise<Float32Array | null> {
  const wav = path.join(dir, `${key}-sys.wav`);
  try {
    try { if ((await stat(wav)).size > 1000) return decodeToPcm(ffmpeg, wav, `${wav}.f32`); } catch { /* 未缓存 */ }
    const safe = text.replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      // 优先中文音色（不同机器可能是 Huihui / Yaoyao / Kangkang）
      "$zh = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1",
      'if ($zh) { $s.SelectVoice($zh.VoiceInfo.Name) }',
      '$s.Rate = -1',
      `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}')`,
      `$s.Speak('${safe}')`,
      '$s.Dispose()',
    ].join('; ');
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    const r = await runCmd('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { timeoutMs: 30000, maxBuffer: 1024 * 1024 });
    if (!r.ok) return null;
    try { if ((await stat(wav)).size < 1000) return null; } catch { return null; }
    return await decodeToPcm(ffmpeg, wav, `${wav}.f32`);
  } catch {
    return null;
  }
}

/** 去掉首尾静音（TTS 常带 100~300ms 空白，不去掉音符会"迟到"）。 */
function trimSilence(pcm: Float32Array): Float32Array {
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  if (peak <= 0) return pcm;
  const thr = peak * 0.04;
  let a = 0;
  let b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < thr) a++;
  while (b > a && Math.abs(pcm[b]) < thr) b--;
  const pad = Math.round(0.008 * SAMPLE_RATE); // 前后留 8ms，避免切掉辅音
  return pcm.subarray(Math.max(0, a - pad), Math.min(pcm.length, b + pad + 1));
}

/**
 * 估基频（自相关，80~500Hz）。
 * ★ 单独导出便于单测：变调比例错一个因子，听起来就是"男声变童声"。
 */
export function estimateF0(pcm: Float32Array, sr: number): number {
  const win = Math.min(pcm.length, Math.round(0.04 * sr));
  if (win < (sr / 500) * 2) return 0;
  const start = Math.max(0, Math.floor((pcm.length - win) / 2));
  const seg = pcm.subarray(start, start + win);
  let energy = 0;
  for (const v of seg) energy += v * v;
  if (energy <= 1e-9) return 0;

  const minLag = Math.floor(sr / 500);
  const maxLag = Math.floor(sr / 80);
  let bestLag = 0;
  let best = -1;
  for (let lag = minLag; lag <= Math.min(maxLag, win - 1); lag++) {
    let sum = 0;
    for (let i = 0; i + lag < win; i++) sum += seg[i] * seg[i + lag];
    const norm = sum / energy;
    if (norm > best) { best = norm; bestLag = lag; }
  }
  if (bestLag <= 0 || best < 0.2) return 0; // 清音/噪声段不估
  return sr / bestLag;
}

/** 线性重采样（变调同时改变长度）。 */
function resample(pcm: Float32Array, ratio: number): Float32Array {
  const outLen = Math.max(2, Math.floor(pcm.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = pcm[Math.min(i0, pcm.length - 1)];
    const b = pcm[Math.min(i0 + 1, pcm.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * WSOLA 时长拉伸（保音高）。
 * 帧 1024 / 跳 512 / 搜索 ±128 —— 对 50ms 级音节足够，比纯 OLA 少"金属感"。
 */
function wsola(input: Float32Array, outLen: number, sr: number): Float32Array {
  const frame = Math.min(1024, Math.max(256, Math.round(0.023 * sr)));
  const hop = Math.floor(frame / 2);
  const search = Math.floor(frame / 8);
  const out = new Float32Array(Math.max(1, outLen));
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));

  const stretch = outLen / Math.max(1, input.length);
  const hopIn = hop / Math.max(0.05, stretch);
  let prevTail = new Float32Array(hop);
  let outPos = 0;
  let k = 0;
  while (outPos < outLen) {
    const nominal = Math.round(k * hopIn);
    // 在 nominal 附近找与上一帧尾部最相似的片段（波形相似叠加，减少相位跳动）
    let bestOff = nominal;
    let bestCorr = -Infinity;
    const lo = Math.max(0, nominal - search);
    const hi = Math.min(input.length - hop - 1, nominal + search);
    for (let off = lo; off <= hi; off++) {
      let corr = 0;
      for (let i = 0; i < hop; i++) corr += input[off + i] * prevTail[i];
      if (corr > bestCorr) { bestCorr = corr; bestOff = off; }
    }
    for (let i = 0; i < frame; i++) {
      const idx = Math.min(input.length - 1, bestOff + i);
      const o = outPos + i;
      if (o < outLen) out[o] += input[idx] * win[i];
    }
    for (let i = 0; i < hop; i++) {
      const idx = Math.min(input.length - 1, bestOff + hop + i);
      prevTail[i] = input[idx];
    }
    outPos += hop;
    k++;
    if (nominal >= input.length) break;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.9) {
    const g = 0.9 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return out;
}

/** 把一段语音变成指定音高/时长的"唱音"。 */
export function singFromPcm(
  pcm: Float32Array, sr: number, targetFreq: number, targetSec: number,
): Float32Array {
  const src = estimateF0(pcm, sr) || 220; // 估不出来按女声基频近似（总比不变调强）
  const ratio = Math.max(0.25, Math.min(4, targetFreq / src));
  const shifted = resample(pcm, ratio);
  const targetLen = Math.max(1, Math.round(targetSec * sr));
  const stretched = wsola(shifted, targetLen, sr);
  // 首尾 8ms 淡入淡出，避免拼接爆音
  const fade = Math.min(Math.round(0.008 * sr), Math.floor(stretched.length / 4));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    stretched[i] *= g;
    stretched[stretched.length - 1 - i] *= g;
  }
  return stretched;
}

/**
 * 为整段编曲准备人声。
 * 逐个音节合成；**任一音节失败不影响其他音节**（失败音符由调用方回落到共振峰）。
 */
export async function prepareVocals(arr: Arrangement, opts: SingOptions): Promise<VocalPrepared> {
  const voice = opts.voice || 'zh-CN-XiaoxiaoNeural';
  const map = new Map<number, Float32Array>();
  const warnings: string[] = [];
  let ok = 0;
  let fail = 0;
  let sysOk = 0;
  let edgeOk = 0;

  for (let i = 0; i < arr.notes.length; i++) {
    const n = arr.notes[i];
    if (n.track !== 'vox') continue;
    const text = (n.syllable?.text || '').trim();
    if (!text) continue;
    const r = await syllablePcm(text, voice, opts.ffmpeg);
    if (!r?.pcm?.length) { fail++; continue; }
    const freq = 440 * Math.pow(2, (n.midi - 69) / 12);
    map.set(i, singFromPcm(r.pcm, SAMPLE_RATE, freq, n.dur));
    if (r.engine === 'system-tts') sysOk++; else edgeOk++;
    ok++;
  }

  if (ok === 0) {
    warnings.push('本机离线语音与 Edge 均不可用，人声回落到本地共振峰合成（机器人音色）');
    return { map, engine: 'formant', warnings };
  }
  if (fail > 0) warnings.push(`${fail} 个音节 TTS 失败，这些字回落到共振峰合成`);
  const engine = sysOk >= edgeOk ? 'system-tts' : 'edge-tts';
  if (engine === 'system-tts') warnings.push('人声用本机离线语音（System.Speech）变调，音色取决于系统已装中文嗓');
  return { map, engine, warnings };
}
