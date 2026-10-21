// DiffSinger ONNX 歌声合成（本地、无 torch）—— 「能听的人声」的正确路线。
//
// ★★★ 为什么走这条（2026-10-21 用户：TTS 变调"太拉胯/刺耳"）：
//   朗读变调的本质是把语音硬拗成音符，共振峰跟着音高跑，必然刺耳。
//   真正做演唱的是**歌声合成（SVS）**：音符 + 音素 + 时长直接生成歌声。
//   开源里中文能落地的就是 DiffSinger —— 官方 ONNX 导出只给 OpenUTAU 用，
//   没有独立推理器，所以这里用 MIT 许可的 Python 参考实现（HighCWu/DiffSinger-ONNX-Infer）
//   做桥接：Node 生成「歌词 + 音高 + 时值」，Python 跑 onnxruntime，回传 WAV。
//
// ★ 运行时（按需下载，不进安装包）：
//   %APPDATA%/yan-zhi/server-data/singing/
//     model/      模型（fs2/p_sample/pe/vocoder.onnx + config.yaml，约 256MB）
//     pylibs/     onnxruntime/numpy/pypinyin/librosa/soundfile（--target 安装）
//     code/       MIT 推理代码
//     usr/ inference/  代码依赖的相对路径资源
//     bridge.py   桥（stdin JSON → wav）
//
// ★ 模型原生输出 24kHz → ffmpeg 重采样到 44.1k。

import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runCmd } from './exec-cmd.js';
import type { Arrangement } from './music-plan.js';

export interface DsOptions {
  /** ffmpeg（重采样/解码用） */
  ffmpeg: string;
  /** Python 解释器（默认随包 Python） */
  python?: string;
}

/** 运行时根目录（与音乐渲染共用数据目录）。 */
export function singingRoot(): string {
  const base = (process.env.DATA_DIR || '').trim() ||
    path.join(process.env.APPDATA || process.env.HOME || '.', 'yan-zhi', 'server-data');
  return path.join(base, 'singing');
}

/** 随包 Python 候选路径（开发态 + 安装态）。 */
function pythonCandidates(): string[] {
  const out: string[] = [];
  const env = (process.env.YZ_PYTHON || '').trim();
  if (env) out.push(env);
  const repo = path.resolve(process.cwd());
  out.push(path.join(repo, 'apps', 'desktop', 'resources', 'python', 'python.exe'));
  out.push(path.join(repo, '..', 'apps', 'desktop', 'resources', 'python', 'python.exe'));
  const resources = (process as unknown as { resourcesPath?: string }).resourcesPath || '';
  if (resources) out.push(path.join(resources, 'python', 'python.exe'));
  out.push('python');
  return out;
}

/** 解析随包 Python（供安装器与推理共用）。 */
export function singingPython(): string {
  return pythonCandidates().find(Boolean) || 'python';
}

/** 运行时是否就绪（模型 + 依赖 + 桥都在）。 */
export async function diffsingerReady(): Promise<boolean> {
  const root = singingRoot();
  const need = [
    path.join(root, 'bridge.py'),
    path.join(root, 'model', 'fs2.onnx'),
    path.join(root, 'model', 'vocoder.onnx'),
    path.join(root, 'model', 'config.yaml'),
    path.join(root, 'pylibs', 'onnxruntime'),
    path.join(root, 'usr', 'configs'),
    path.join(root, 'inference'),
  ];
  for (const p of need) {
    try { await stat(p); } catch { return false; }
  }
  return true;
}

function midiToName(m: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

interface Token { text: string; note: string; dur: number }

/**
 * 编曲里的 vox 音符 → DiffSinger 的「文字 | 音高 | 时值」序列。
 * ★ 音符之间的空档必须补 `AP/rest`：不补的话整首会挤在一起（所有字连唱）。
 */
function buildTokens(arr: Arrangement): Token[] {
  const vox = arr.notes
    .map((n) => n)
    .filter((n) => n.track === 'vox')
    .sort((a, b) => a.start - b.start);

  const tokens: Token[] = [];
  let cursor = 0;
  for (const n of vox) {
    const gap = n.start - cursor;
    if (gap > 0.06) tokens.push({ text: 'AP', note: 'rest', dur: Number(gap.toFixed(3)) });
    tokens.push({
      text: (n.syllable?.text || '啊').slice(0, 1),
      note: midiToName(n.midi),
      dur: Number(n.dur.toFixed(3)),
    });
    cursor = n.start + n.dur;
  }
  return tokens;
}

/** 调 Python 桥合成整首人声，返回 44.1k 单声道 PCM。 */
export async function renderSingingTrack(
  arr: Arrangement, opts: DsOptions,
): Promise<{ pcm: Float32Array; seconds: number } | { error: string }> {
  if (!(await diffsingerReady())) return { error: 'DiffSinger 运行时未安装' };

  const tokens = buildTokens(arr);
  if (!tokens.length) return { error: '没有可演唱的歌词' };

  const root = singingRoot();
  const work = path.join(tmpdir(), `yz-sing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await mkdir(work, { recursive: true });
  const wav = path.join(work, 'vocal.wav');
  const payload = JSON.stringify({
    text: tokens.map((t) => t.text).join(' '),
    notes: tokens.map((t) => t.note).join(' | '),
    durations: tokens.map((t) => t.dur.toFixed(3)).join(' | '),
    out: wav.replace(/\\/g, '/'),
  });

  const python = opts.python || singingPython();
  const res = await new Promise<{ ok: boolean; out: string; err: string }>((resolve) => {
    const child = spawn(python, [path.join(root, 'bridge.py')], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: [path.join(root, 'pylibs'), path.join(root, 'code')].join(path.delimiter),
      },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, 600000);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, out, err: `${err}\n${e.message}` }); });
    child.on('close', () => { clearTimeout(timer); resolve({ ok: true, out, err }); });
    child.stdin.write(payload, 'utf8');
    child.stdin.end();
  });

  // 桥只输出一行 JSON；stderr 里是 tqdm 进度条，不算错误
  const line = res.out.split(/\r?\n/).reverse().find((l) => l.trim().startsWith('{')) || '';
  let parsed: { ok?: boolean; error?: string; seconds?: number } = {};
  try { parsed = JSON.parse(line); } catch { /* 解析失败走下面兜底 */ }
  if (!parsed.ok) {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    return { error: parsed.error || (res.err.slice(-400) || 'DiffSinger 推理失败') };
  }

  // 24k WAV → 44.1k 单声道 f32
  const raw = path.join(work, 'vocal.f32');
  const dec = await runCmd(opts.ffmpeg, [
    '-y', '-v', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-f', 'f32le', raw,
  ], { timeoutMs: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (!dec.ok) {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    return { error: `解码人声失败：${(dec.stderr || dec.error).slice(-200)}` };
  }
  const buf = await readFile(raw);
  const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));
  await rm(work, { recursive: true, force: true }).catch(() => undefined);
  return { pcm, seconds: Number(parsed.seconds) || pcm.length / 44100 };
}

/** 是否具备演唱条件（供 UI/工具判断，不触发加载）。 */
export async function canSing(): Promise<boolean> {
  return diffsingerReady();
}
