import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const LEARNING_EDGE_VOICE = 'en-US-JennyNeural';

/**
 * 学习朗读语速档位（唯一映射出口，/learning/tts 消费）。
 * 用户实测默认语速偏快（Jenny 原生语速本身就偏快），三档全部 ≤ 原生语速：
 * - slow：逐词跟读；- normal（默认）：比原生慢一档；- fast：原生速度。
 * sapi 是 Windows SAPI 刻度（-10..10，0 = 原生）；edge 是 edge-tts 百分比刻度。
 */
export type LearningTtsSpeed = 'slow' | 'normal' | 'fast';
export const LEARNING_TTS_SPEEDS: Record<LearningTtsSpeed, { sapi: number; edge: string }> = {
  slow: { sapi: -5, edge: '-30%' },
  normal: { sapi: -2, edge: '-12%' },
  fast: { sapi: 0, edge: '0%' },
};

export function normalizeLearningTtsSpeed(value: unknown): LearningTtsSpeed {
  return value === 'slow' || value === 'fast' ? value : 'normal';
}

/**
 * TTS 朗读前的英文文本规范化（唯一出口，/learning/tts 调用）。
 * ① 词表分隔符 `·` → 逗号：不换就整串连读飞快（用户实测「读的很快」）；
 * ② 独立冠词 A/a → Uh/uh：系统语音会把句首的 "A" 读成**字母名 /eɪ/**，
 *    而句子里冠词应读 /ə/（用户实测「a 在句子里面读额，不是 A」）。
 *    教学场景下独立的 a/A 只有冠词用法，整词替换安全。
 */
export function normalizeEnglishTtsText(text: string): string {
  return String(text || '')
    .replace(/\s*·\s*/g, ', ')
    // (?!\.) 排除 a.m. / p.m. 这类缩写里的 a
    .replace(/\bA\b(?!\.)/g, 'Uh')
    .replace(/\ba\b(?!\.)/g, 'uh');
}

/** 执行器签名（默认 execFile；测试注入用）。 */
export type BundledEdgeRunner = (
  exe: string,
  args: string[],
  opts: { timeout: number; windowsHide: boolean; maxBuffer: number },
) => Promise<unknown>;

/**
 * 找随包 Python 解释器（目录推导规则与 resolveBundledEdgeTts 一致）。
 *
 * ★★ 为什么合成不许直接跑 Scripts/edge-tts.exe：那个 exe 是 pip 在**构建机**上
 * 生成的 console launcher，会把构建机 python.exe 的**绝对路径**烧进自身 shebang
 * （实测包内为 `#!C:\Users\<构建机用户>\...\python.exe`）—— 随包拷到任何其它机器
 * 都必然启动失败（EXIT=1、零输出）。⇒ 一律优先 `python.exe -m edge_tts`，
 * exe 只保留给构建机本机兜底（2026-11-13 家用电脑学习朗读全断的根因之一）。
 */
export function resolveBundledPython(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  resourcesPath = String((process as unknown as { resourcesPath?: string }).resourcesPath || ''),
): string | null {
  const candidates = [
    env.YZ_BUNDLED_PYTHON,
    resourcesPath ? path.join(resourcesPath, 'python', 'python.exe') : '',
    path.resolve(cwd, '..', 'desktop', 'resources', 'python', 'python.exe'),
    path.resolve(cwd, 'apps', 'desktop', 'resources', 'python', 'python.exe'),
  ].filter((item): item is string => !!String(item || '').trim());
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

/** 找随包 edge-tts CLI（仅构建机本机可用的兜底，见 resolveBundledPython 注释）。 */
export function resolveBundledEdgeTts(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  resourcesPath = String((process as unknown as { resourcesPath?: string }).resourcesPath || ''),
): string | null {
  const candidates = [
    env.YZ_BUNDLED_EDGE_TTS,
    resourcesPath ? path.join(resourcesPath, 'python', 'Scripts', 'edge-tts.exe') : '',
    path.resolve(cwd, '..', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe'),
    path.resolve(cwd, 'apps', 'desktop', 'resources', 'python', 'Scripts', 'edge-tts.exe'),
  ].filter((item): item is string => !!String(item || '').trim());
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

/** edge-tts 命令行参数（exe 与 python -m 两条路径共用同一形态，避免口径漂移）。 */
function edgeTtsArgs(text: string, outFile: string, rate: string): string[] {
  return ['--voice', LEARNING_EDGE_VOICE, `--rate=${rate}`, '--text', text, '--write-media', outFile];
}

async function statOutput(outFile: string): Promise<{ file: string; bytes: number; voice: string } | null> {
  const info = await stat(outFile);
  if (!info.isFile() || info.size <= 0) return null;
  return { file: outFile, bytes: info.size, voice: LEARNING_EDGE_VOICE };
}

const DEFAULT_RUNNER: BundledEdgeRunner = (exe, args, opts) => execFileAsync(exe, args, opts);

/**
 * 用随包 Python edge-tts 合成英文。
 * 这条路径专门解决“Windows 只装了中文系统音色”的机器，不依赖用户另下语音包。
 * 执行顺序：`python -m edge_tts`（任何机器可用）→ `Scripts/edge-tts.exe`（仅构建机本机可用）。
 */
export async function synthesizeBundledEnglishEdge(input: {
  text: string;
  outFile: string;
  exePath?: string | null;
  /** 显式指定 python 解释器；缺省时自动推导（resolveBundledPython），传 null 强制跳过。 */
  pythonPath?: string | null;
  /** 语速档位；缺省 normal（见 LEARNING_TTS_SPEEDS）。 */
  speed?: LearningTtsSpeed;
  /** 注入执行器（测试用），默认 execFile。 */
  run?: BundledEdgeRunner;
}): Promise<{ file: string; bytes: number; voice: string } | null> {
  const run = input.run || DEFAULT_RUNNER;
  const runOpts = { timeout: 60_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 };
  const rate = LEARNING_TTS_SPEEDS[normalizeLearningTtsSpeed(input.speed)].edge;
  const python = input.pythonPath !== undefined ? input.pythonPath : resolveBundledPython();
  if (python) {
    try {
      await run(python, ['-m', 'edge_tts', ...edgeTtsArgs(input.text, input.outFile, rate)], runOpts);
      const ok = await statOutput(input.outFile);
      if (ok) return ok;
    } catch { /* 模块缺失 / 网络失败 → 回退 exe（构建机本机） */ }
  }
  const exe = input.exePath || resolveBundledEdgeTts();
  if (!exe) return null;
  try {
    await run(exe, edgeTtsArgs(input.text, input.outFile, rate), runOpts);
    return await statOutput(input.outFile);
  } catch {
    return null;
  }
}
