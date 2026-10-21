// 音乐节拍检测 —— 「智能踩点」的底层（纯计算 + 一次 ffmpeg 解码）。
//
// ★★★ 为什么自己做（2026-10-21 用户：「向剪映靠齐…AI 一键能力」）：
//   剪映的"自动踩点"是它的招牌功能之一。ffmpeg 本身**没有**节拍检测滤镜
//   （`astats`/`silencedetect` 都不是），所以这里解码成 PCM 自己做能量突变检测。
//   好处：零依赖、可单测、不联网；代价：只能抓"鼓点/重音"这类明显onset，
//   对连绵弦乐/人声为主的 BGM 会漏 —— 所以结果少于 6 个点就如实报"素材节拍不明显"，
//   绝不硬凑出一堆点让用户去删。
//
// 算法（简单但有效，够用于剪辑打点）：
//   ① 8kHz 单声道解码 → 每 20ms 一帧算 RMS 能量；
//   ② novelty = 相邻帧能量的正向差（能量突然变大 = 一个击打）；
//   ③ 阈值 = 全曲均值 + 0.9×标准差；取局部极大值；
//   ④ 两个点至少间隔 0.18s（避免同一击打的双峰）；
//   ⑤ BPM = 60 / 相邻间隔中位数（仅作展示，不参与切分）。

import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';

export interface BeatDetection {
  /** 节拍时间点（秒，从素材 0 开始） */
  beats: number[];
  /** 估算 BPM（0 = 未测出） */
  bpm: number;
  /** 分析时长（秒） */
  duration: number;
}

const FRAME_SEC = 0.02;
const MIN_GAP_SEC = 0.18;
/** 少于这个数量就认为"没有明显节拍"——硬凑出来的点比没有更糟 */
const MIN_BEATS = 6;

/** 纯函数：PCM → 节拍点（可脱机单测）。 */
export function detectBeats(pcm: Int16Array, sampleRate: number): BeatDetection {
  const duration = pcm.length / Math.max(1, sampleRate);
  const hop = Math.max(1, Math.round(sampleRate * FRAME_SEC));
  const frames = Math.floor(pcm.length / hop);
  if (frames < 8) return { beats: [], bpm: 0, duration };

  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = base; i < base + hop; i++) {
      const v = pcm[i] / 32768;
      sum += v * v;
    }
    energy[f] = Math.sqrt(sum / hop);
  }

  const novelty = new Float64Array(frames);
  for (let f = 1; f < frames; f++) novelty[f] = Math.max(0, energy[f] - energy[f - 1]);

  // 全局均值/标准差（对整曲一次性算，够稳且实现简单）
  let mean = 0;
  for (let f = 0; f < frames; f++) mean += novelty[f];
  mean /= frames;
  let variance = 0;
  for (let f = 0; f < frames; f++) variance += (novelty[f] - mean) ** 2;
  const std = Math.sqrt(variance / frames);
  // ★ 绝对下限（2026-10-21 单测抓到）：静音时 mean=std=0 → 阈值 0 → "0 >= 0" 会被判成
  //   每一帧都是峰，静音素材直接返回几百个假节拍。噪声/静音的 novelty 必须被这个 floor 挡掉。
  const threshold = Math.max(mean + std * 0.9, 1e-5);

  const beats: number[] = [];
  let last = -Infinity;
  for (let f = 1; f < frames - 1; f++) {
    if (novelty[f] < threshold) continue;
    if (novelty[f] < novelty[f - 1] || novelty[f] < novelty[f + 1]) continue; // 只取局部峰
    const t = f * FRAME_SEC;
    if (t - last < MIN_GAP_SEC) continue;
    beats.push(Number(t.toFixed(3)));
    last = t;
  }

  if (beats.length < MIN_BEATS) return { beats: [], bpm: 0, duration };

  // BPM：相邻间隔中位数（对漏拍/多拍不敏感）
  const gaps = beats.slice(1).map((t, i) => t - beats[i]).sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  let bpm = median > 0 ? Math.round(60 / median) : 0;
  // 常见 BPM 区间校正（半拍/双拍误判时拉回 60~180）
  while (bpm && bpm < 60) bpm *= 2;
  while (bpm > 180) bpm = Math.round(bpm / 2);

  return { beats, bpm, duration };
}

/**
 * 解码音频为 8kHz 单声道 PCM 并检测节拍。
 * ★ 走临时**文件**而不是 stdout：runCmd 的 stdout 是 utf8 字符串，二进制 PCM 会被破坏。
 */
export async function analyzeBeats(ffmpegBin: string, file: string): Promise<BeatDetection & { ok: boolean; error?: string }> {
  const dir = path.join(tmpdir(), `yz-beats-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const raw = path.join(dir, 'pcm.raw');
  const sampleRate = 8000;
  try {
    await mkdir(dir, { recursive: true });
    const r = await runCmd(ffmpegBin, [
      '-y', '-v', 'error', '-i', file,
      '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', raw,
    ], { timeoutMs: 180000, maxBuffer: 4 * 1024 * 1024 });
    if (!r.ok) {
      const raw = (r.stderr || r.error || '').slice(-300);
      // 常见且必须说人话的情况：视频没有音轨（用户选了纯画面素材）
      const msg = /does not contain any stream|matches no streams/i.test(raw)
        ? '该文件没有音轨（视频也可以，但必须有声音）'
        : `解码失败：${raw}`;
      return { ok: false, error: msg, beats: [], bpm: 0, duration: 0 };
    }
    const buf = await readFile(raw);
    // Buffer → Int16Array（小端；ffmpeg s16le 明确是小端）
    const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2)));
    const out = detectBeats(pcm, sampleRate);
    return { ok: true, ...out };
  } catch (e: unknown) {
    return { ok: false, error: `节拍分析异常：${e instanceof Error ? e.message : String(e)}`, beats: [], bpm: 0, duration: 0 };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
