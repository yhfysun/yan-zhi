// 配乐渲染编排：乐谱 → 编曲 → 合成 → 落盘。
//
// ★ 目录由调用方传进来（api-tool-executor 的 mediaTarget）：落盘位置只有一处逻辑，
//   本模块不自己拼路径，避免"工具产物在交付目录、配乐却在别处"的漂移。
// ★ ffmpeg 只负责**编码**（wav → m4a）。合成本身是纯 JS，不依赖 ffmpeg 才能跑，
//   所以 ffmpeg 不可用时仍能产出 wav —— 降级要给用户能看到的结果，而不是整段失败。

import path from 'node:path';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { arrangeMusic, type MusicSpec } from './music-plan.js';
import { renderArrangement } from './music-synth.js';
import { prepareVocals } from './music-sing-tts.js';
import { renderSingingTrack } from './music-sing-diffsinger.js';

export interface ComposeInput {
  spec: MusicSpec;
  /** 产物目录（调用方用 mediaTarget 解析） */
  dir: string;
  /** ffmpeg 可执行文件；为空则只出 wav */
  ffmpeg?: string;
  /** 文件名（不含扩展名）；默认按标题/时间生成 */
  baseName?: string;
  /** 演唱音色（Edge 音色名，如 zh-CN-XiaoxiaoNeural / zh-CN-YunxiNeural） */
  vocalVoice?: string;
}

export interface ComposeResult {
  ok: boolean;
  file?: string;
  name?: string;
  bytes?: number;
  /** 音乐本体时长（秒，不含混响尾巴） */
  duration?: number;
  /** 音频文件实际时长（含尾巴） */
  audioSeconds?: number;
  bpm?: number;
  bars?: number;
  style?: string;
  chordNames?: string[];
  /** 人声引擎（有歌词时）：edge-tts = 真人音色变调唱法；formant = 共振峰回落 */
  vocalEngine?: string;
  warnings?: string[];
  error?: string;
}

/** 文件名安全化（中文保留，去掉路径分隔符与保留字符）。 */
function safeName(s: string): string {
  const t = String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return t || 'music';
}

export async function composeMusic(input: ComposeInput): Promise<ComposeResult> {
  const arr = arrangeMusic(input.spec || {});
  if (!arr.notes.length) return { ok: false, error: '编曲结果为空（和弦与旋律都没能解析出音符）' };

  let audio;
  const vocalWarnings: string[] = [];
  let vocalEngine = '';
  try {
    // 有歌词就先生成人声：DiffSinger（神经歌声合成）优先 → TTS 变调 → 共振峰
    const hasVox = arr.notes.some((n) => n.track === 'vox');
    let vocals: Map<number, Float32Array> | undefined;
    let vocalTrack: Float32Array | undefined;
    if (hasVox) {
      if (input.ffmpeg) {
        const ds = await renderSingingTrack(arr, { ffmpeg: input.ffmpeg });
        if ('pcm' in ds) {
          vocalTrack = ds.pcm;
          vocalEngine = 'diffsinger';
        } else {
          vocalWarnings.push(`DiffSinger 不可用（${ds.error}），改用 TTS 变调唱法`);
        }
      }
      if (!vocalTrack) {
        if (input.ffmpeg) {
          const prepared = await prepareVocals(arr, { voice: input.vocalVoice, ffmpeg: input.ffmpeg });
          vocals = prepared.map;
          vocalEngine = prepared.engine;
          vocalWarnings.push(...prepared.warnings);
        } else {
          vocalWarnings.push('未提供 ffmpeg，无法解码 TTS，人声回落到共振峰合成');
          vocalEngine = 'formant';
        }
      }
    }
    audio = renderArrangement(arr, { vocals, vocalTrack });
  } catch (e: unknown) {
    return { ok: false, error: `合成失败：${e instanceof Error ? e.message : String(e)}` };
  }

  const base = safeName(input.baseName || arr.title || `music-${Date.now()}`);
  const stamp = Date.now().toString(36);
  const wavFile = path.join(input.dir, `${base}-${stamp}.wav`);
  const m4aFile = path.join(input.dir, `${base}-${stamp}.m4a`);

  try {
    await mkdir(input.dir, { recursive: true });
    await writeFile(wavFile, audio.wav);
  } catch (e: unknown) {
    return { ok: false, error: `写文件失败：${e instanceof Error ? e.message : String(e)}` };
  }

  const meta = {
    duration: Number(arr.duration.toFixed(2)),
    audioSeconds: Number(audio.seconds.toFixed(2)),
    bpm: arr.bpm,
    bars: arr.bars,
    style: arr.style,
    chordNames: arr.chordNames.slice(0, 16),
    warnings: [...arr.warnings, ...vocalWarnings],
    ...(vocalEngine ? { vocalEngine } : {}),
  };

  // 无 ffmpeg：直接交付 wav（体积大但可用），并如实说明
  if (!input.ffmpeg) {
    return {
      ok: true, file: wavFile, name: path.basename(wavFile), bytes: audio.wav.length, ...meta,
      warnings: [...arr.warnings, 'ffmpeg 不可用，已交付 WAV（体积较大），安装 ffmpeg 后可转 m4a'],
    };
  }

  const r = await runCmd(input.ffmpeg, [
    '-y', '-v', 'error', '-i', wavFile,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart', m4aFile,
  ], { timeoutMs: 120000, maxBuffer: 4 * 1024 * 1024 });

  if (!r.ok) {
    // 编码失败保留 wav：产物已经能用，没必要让整次调用失败
    return {
      ok: true, file: wavFile, name: path.basename(wavFile), bytes: audio.wav.length, ...meta,
      warnings: [...arr.warnings, `转 m4a 失败已交付 WAV：${(r.stderr || r.error).slice(-200)}`],
    };
  }

  let size = 0;
  try { size = (await stat(m4aFile)).size; } catch { /* 取不到大小不影响交付 */ }
  await rm(wavFile, { force: true }).catch(() => undefined);
  return { ok: true, file: m4aFile, name: path.basename(m4aFile), bytes: size, ...meta };
}
