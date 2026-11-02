// 离线多机位音频对齐（纯 DSP，模型无关）—— 「多机位」P2 的前置能力。
//
// ★ 为什么自己做：
//   两机位/多机位素材是**同时开始录、但起点不同**的两段（或多段）画面，
//   对齐的可靠锚点是**声音**：把两段音频转成能量包络，再做去均值归一化互相关，
//   找最佳时间位移即可。全程本地计算、不上传、不调用任何模型。
//
// ★ 限定：本工具只做**两两对齐**，返回位移量，不负责多机位编排/切换/多时间线。
//   （编排与合成仍走 clip_project / clip_jianying 的既有链路。）
//
// ★ 符号约定（工具描述里也要写，模型靠它决定裁哪一边）：
//   offsetSec > 0 表示 **B 的内容比 A 晚 offsetSec 秒出现**（即 B 开始录音更晚）；
//   offsetSec < 0 表示 **B 比 A 早出现**（B 开始录音更早）。
//   使用建议：
//     · B 更早（offsetSec < 0）→ B 多出 |offsetSec| 秒头部，裁掉 B 开头即可对齐；
//     · B 更晚（offsetSec > 0）→ 裁掉 A 的开头 |offsetSec| 秒。
//
// ★ 边界：静音/近乎静音的素材包络方差≈0，无法对齐（返回 ok:false）；
//   音乐与说话声大量重叠时互相关可能被音乐主导而失准；两段素材重叠时长太短也会不可靠。

import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';

/** 解码采样率：对齐只需要能量轮廓，8kHz 足够且解码快。 */
const SAMPLE_RATE = 8000;
const DEFAULT_HOP_SEC = 0.1;
const DEFAULT_MAX_LAG_SEC = 15;
const MIN_MAX_LAG_SEC = 0.5;
const MAX_MAX_LAG_SEC = 60;
/** 最佳相关分数达到该值才认为对齐可信。 */
const CONFIDENT_SCORE = 0.55;
const DEFAULT_CAP_SEC = 180;
const MIN_CAP_SEC = 30;
const MAX_CAP_SEC = 600;
/** 包络方差低于该值视为静音（RMS 已归一化到 0~1）。 */
const SILENCE_STD = 1e-6;

export interface EnvelopeOffset {
  /** >0：B 的内容比 A 晚出现；<0：B 更早（见文件头符号约定） */
  offsetSec: number;
  /** 最佳位置的归一化相关分数，-1~1 */
  score: number;
  /** score ≥ 0.55 */
  confident: boolean;
}

export interface AudioSyncOptions {
  /** 每个文件最多解码前多少秒，默认 180（夹在 30~600） */
  capSec?: number;
  /** 互相关搜索的最大位移（秒），默认 15（夹在 0.5~60） */
  maxLagSec?: number;
  /** 包络帧移（秒），默认 0.1 */
  hopSec?: number;
}

export interface AudioSyncResult {
  ok: boolean;
  /** 见文件头符号约定 */
  offsetSec?: number;
  score?: number;
  confident?: boolean;
  /** 实际参与对齐的 A/B 时长（秒） */
  aUsedSec?: number;
  bUsedSec?: number;
  error?: string;
}

/** 夹取到 [lo, hi]；非有限值走默认。 */
function clampNum(v: number | undefined, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 纯函数：PCM → 每 hopSec 一帧的 RMS 能量包络。
 * Int16 会按 /32768 归一化；Float32 视为已在 -1~1。
 */
export function rmsEnvelope(
  samples: Float32Array | Int16Array,
  sampleRate: number,
  hopSec = DEFAULT_HOP_SEC,
): Float32Array {
  if (!samples || samples.length === 0 || !(sampleRate > 0)) return new Float32Array(0);
  const hop = Math.max(1, Math.round(sampleRate * (hopSec > 0 ? hopSec : DEFAULT_HOP_SEC)));
  const frames = Math.floor(samples.length / hop);
  if (frames <= 0) return new Float32Array(0);
  const isInt16 = samples instanceof Int16Array;
  const scale = isInt16 ? 1 / 32768 : 1;
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = base; i < base + hop; i++) {
      const v = samples[i] * scale;
      sum += v * v;
    }
    env[f] = Math.sqrt(sum / hop);
  }
  return env;
}

/** 包络标准差（用于静音判定；空包络返回 0）。 */
export function envelopeStd(env: Float32Array): number {
  const n = env?.length ?? 0;
  if (n === 0) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (env[i] - mean) ** 2;
  return Math.sqrt(variance / n);
}

/**
 * 纯函数：去均值归一化互相关，找 B 相对 A 的时间位移。
 *
 * 符号约定：offsetSec > 0 表示 B 的内容比 A 晚 offsetSec 秒出现（B 开始录音更晚）；
 * offsetSec < 0 表示 B 更早。
 *
 * 极端输入（空包络/静音/重叠过短）不抛错：返回 offsetSec=0、score=0、confident=false。
 * 最佳分数低于 0.55 时 confident=false，但仍返回最佳候选与分数。
 */
export function findEnvelopeOffset(
  envA: Float32Array,
  envB: Float32Array,
  opts: { hopSec?: number; maxLagSec?: number } = {},
): EnvelopeOffset {
  const hopSec = opts.hopSec && opts.hopSec > 0 ? opts.hopSec : DEFAULT_HOP_SEC;
  const maxLagSec = clampNum(opts.maxLagSec, MIN_MAX_LAG_SEC, MAX_MAX_LAG_SEC, DEFAULT_MAX_LAG_SEC);
  const maxLagFrames = Math.max(1, Math.round(maxLagSec / hopSec));
  const nA = envA?.length ?? 0;
  const nB = envB?.length ?? 0;
  if (nA < 2 || nB < 2) return { offsetSec: 0, score: 0, confident: false };

  // 重叠太短的位移分数没有意义（1 帧重叠的相关永远是 ±1）。
  const minOverlap = Math.max(4, Math.floor(Math.min(nA, nB) * 0.25));
  const limit = Math.min(maxLagFrames, Math.max(nA, nB) - minOverlap);
  if (limit < 0) return { offsetSec: 0, score: 0, confident: false };

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -limit; lag <= limit; lag++) {
    const startA = Math.max(0, -lag);
    const startB = Math.max(0, lag);
    const overlap = Math.min(nA - startA, nB - startB);
    if (overlap < minOverlap) continue;

    let meanA = 0;
    let meanB = 0;
    for (let i = 0; i < overlap; i++) {
      meanA += envA[startA + i];
      meanB += envB[startB + i];
    }
    meanA /= overlap;
    meanB /= overlap;

    let num = 0;
    let varA = 0;
    let varB = 0;
    for (let i = 0; i < overlap; i++) {
      const da = envA[startA + i] - meanA;
      const db = envB[startB + i] - meanB;
      num += da * db;
      varA += da * da;
      varB += db * db;
    }
    if (!(varA > 0) || !(varB > 0)) continue;

    const raw = num / Math.sqrt(varA * varB);
    if (!Number.isFinite(raw)) continue;
    const score = Math.min(1, Math.max(-1, raw));
    // 分数相同优先取 |lag| 小的（避免无谓地选一个更远的位移）
    if (score > bestScore + 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && Math.abs(lag) < Math.abs(bestLag))) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (!Number.isFinite(bestScore)) return { offsetSec: 0, score: 0, confident: false };
  // 连正相关都没有：没有任何可用候选，回落到 0 但不标可信。
  if (bestScore <= 0) return { offsetSec: 0, score: Number(bestScore.toFixed(4)), confident: false };

  const offsetSec = Number((bestLag * hopSec).toFixed(3));
  const score = Number(bestScore.toFixed(4));
  return { offsetSec, score, confident: bestScore >= CONFIDENT_SCORE };
}

interface DecodedPcm {
  ok: boolean;
  pcm?: Int16Array;
  error?: string;
}

/**
 * 用 ffmpeg 解码为 8kHz 单声道 s16le 临时文件。
 * ★ 走临时文件而不是 stdout：runCmd 的 stdout 是 utf8 字符串，二进制 PCM 会被破坏。
 * ★ 只取前 capSec 秒：对齐不需要整段素材，长素材也能快速返回。
 */
async function decodePcm(ffmpegBin: string, file: string, out: string, capSec: number): Promise<DecodedPcm> {
  const r = await runCmd(ffmpegBin, [
    '-v', 'error', '-y',
    '-t', String(capSec),
    '-i', file,
    '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', out,
  ], { timeoutMs: 300000, maxBuffer: 8 * 1024 * 1024 });
  if (!r.ok) {
    const raw = (r.stderr || r.error || '').slice(-300);
    const msg = /does not contain any stream|matches no streams|no audio/i.test(raw)
      ? '该文件没有音轨（视频可以，但必须有声音）'
      : `解码失败：${raw}`;
    return { ok: false, error: msg };
  }
  try {
    const buf = await readFile(out);
    if (buf.length < 2) return { ok: false, error: '没有解码出音频数据' };
    // ffmpeg s16le 明确是小端；去掉可能的半个采样字节。
    const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length - (buf.length % 2))));
    return { ok: true, pcm };
  } catch (e: unknown) {
    return { ok: false, error: `读取解码结果失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

async function assertFile(p: string, label: string): Promise<string | null> {
  const v = String(p || '').trim();
  if (!v) return `${label} 路径不能为空`;
  try {
    const st = await stat(v);
    if (!st.isFile()) return `${label} 不是文件：${v}`;
    return null;
  } catch {
    return `${label} 文件不存在：${v}`;
  }
}

/**
 * 对齐两个本机音视频文件（多机位/双机位）。
 *
 * offsetSec 符号：>0 表示 B 的内容比 A 晚出现（B 开始录音更晚）；<0 表示 B 更早。
 * 若 B 更早，B 多出 |offsetSec| 秒头部，裁掉 B 开头即可对齐；B 更晚则裁 A 开头。
 */
export async function syncAudioFiles(
  aPath: string,
  bPath: string,
  opts: AudioSyncOptions = {},
): Promise<AudioSyncResult> {
  try {
    const aErr = await assertFile(aPath, 'A');
    if (aErr) return { ok: false, error: aErr };
    const bErr = await assertFile(bPath, 'B');
    if (bErr) return { ok: false, error: bErr };

    const ff = await resolveFfmpeg();
    if (!ff.ok) return { ok: false, error: ff.error || '本机尚未安装 ffmpeg（音频对齐需要它）' };

    const capSec = Math.round(clampNum(opts.capSec, MIN_CAP_SEC, MAX_CAP_SEC, DEFAULT_CAP_SEC));
    const hopSec = opts.hopSec && opts.hopSec > 0 ? opts.hopSec : DEFAULT_HOP_SEC;
    const maxLagSec = clampNum(opts.maxLagSec, MIN_MAX_LAG_SEC, MAX_MAX_LAG_SEC, DEFAULT_MAX_LAG_SEC);

    const dir = await mkdtemp(path.join(tmpdir(), 'yz-audio-sync-'));
    try {
      const a = await decodePcm(ff.ffmpeg, aPath, path.join(dir, 'a.pcm'), capSec);
      if (!a.ok || !a.pcm) return { ok: false, error: `A ${a.error || '解码失败'}` };
      const b = await decodePcm(ff.ffmpeg, bPath, path.join(dir, 'b.pcm'), capSec);
      if (!b.ok || !b.pcm) return { ok: false, error: `B ${b.error || '解码失败'}` };

      const aSec = a.pcm.length / SAMPLE_RATE;
      const bSec = b.pcm.length / SAMPLE_RATE;
      if (aSec < 1) return { ok: false, error: `A 音频过短（${aSec.toFixed(2)} 秒，至少需要 1 秒）` };
      if (bSec < 1) return { ok: false, error: `B 音频过短（${bSec.toFixed(2)} 秒，至少需要 1 秒）` };

      const envA = rmsEnvelope(a.pcm, SAMPLE_RATE, hopSec);
      const envB = rmsEnvelope(b.pcm, SAMPLE_RATE, hopSec);
      if (envelopeStd(envA) < SILENCE_STD) return { ok: false, error: 'A 是静音（或音量过低），无法对齐' };
      if (envelopeStd(envB) < SILENCE_STD) return { ok: false, error: 'B 是静音（或音量过低），无法对齐' };

      const hit = findEnvelopeOffset(envA, envB, { hopSec, maxLagSec });
      return {
        ok: true,
        offsetSec: hit.offsetSec,
        score: hit.score,
        confident: hit.confident,
        aUsedSec: Number((envA.length * hopSec).toFixed(3)),
        bUsedSec: Number((envB.length * hopSec).toFixed(3)),
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (e: unknown) {
    return { ok: false, error: `音频对齐异常：${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * 工具执行器用的轻量封装：把 syncAudioFiles 的结果整理成 MCP 工具结果。
 * （放在服务侧，避免执行器里再复制一遍文案。）
 */
export function formatSyncResult(r: AudioSyncResult): string {
  if (!r.ok) return `音频对齐失败：${r.error || '未知错误'}`;
  const dir = (r.offsetSec ?? 0) > 0
    ? `B 的内容比 A 晚 ${r.offsetSec}s 出现（B 开始录音更晚）→ 裁掉 A 开头 ${r.offsetSec}s 即可对齐`
    : (r.offsetSec ?? 0) < 0
      ? `B 的内容比 A 早 ${Math.abs(r.offsetSec!)}s 出现（B 开始录音更早）→ 裁掉 B 开头 ${Math.abs(r.offsetSec!)}s 即可对齐`
      : '两段音频起点一致，无需裁剪';
  return [
    `offsetSec=${r.offsetSec}`,
    `score=${r.score}${r.confident ? '（可信）' : '（相关分数偏低，建议人工复核）'}`,
    dir,
    `参与对齐时长：A ${r.aUsedSec}s / B ${r.bUsedSec}s`,
  ].join('\n');
}
