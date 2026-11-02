// 智能抠像（P2-1）—— 运行时解析 / 蒙版脚本契约（**骨架，未接渲染**）。
//
// ★ 诚实定位（2026-11-02，P2-1 骨架）：
//   本模块只做三件事：解析 Python + onnxruntime + ONNX 分割模型；给出可执行的放置指引；
//   把「视频 → 单通道人像蒙版视频」的脚本跑通。**没有接渲染管线**（不产生透明视频、
//   不替换片段画面），路由的 apply 明确返回 501。不要把它当成"抠像已完成"。
//
// ★ 为什么不自动下载模型：分割模型体积大（RMBG/U2Net ~170MB）且许可各异；
//   沿用 whisper 的既有原则 —— 按需、显式、由用户放置。probe 结果必须真实：
//   缺模型就是 ok:false，绝不假装可用。
//
// ★ 解释器解析沿用仓库既有链路（与 clip-reframe 完全一致）：
//   YZ_CLIP_PYTHON > findPython()（YZ_PYTHON / 随包 / 系统）> PATH 上的 python/python3/py。
//   不另写第二套定位逻辑。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython, getPythonScript, runPythonScript } from '@yan-zhi/core';
import { runCmd, lookupOnPath } from './exec-cmd.js';

/** 抠像预处理预设（与 python-scripts/clip_matte/portrait_mask.py 的 PRESETS 同值）。 */
export interface MatteModelSpec {
  id: string;
  label: string;
  /** 建议文件名（放进模型目录时用这个名字可免侧车 JSON）。 */
  fileHint: string;
  /** 模型输入边长（正方形）。必须与 ONNX 模型实际输入一致。 */
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
  channelOrder: 'RGB' | 'BGR';
  /** 约体积（MB），仅用于给用户明确的放置预期；不参与校验。 */
  approxSizeMB: number;
  note?: string;
}

/**
 * 已知分割模型注册表 —— **单一真相源**（路由/UI/指引都读这里）。
 * ★ 体积为公开权重的近似值，仅作提示；实际文件大小以用户下载的为准。
 * ★ u2net/u2netp 用 ImageNet 归一化（RGB）；RMBG-1.4 与 MODNet 用 0.5/0.5。
 */
export const MATTE_MODELS: Record<string, MatteModelSpec> = {
  rmbg14: {
    id: 'rmbg14', label: 'RMBG-1.4（人像/商品通用，质量好）', fileHint: 'rmbg14.onnx',
    inputSize: 1024, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], channelOrder: 'RGB',
    approxSizeMB: 176, note: 'BRIA RMBG-1.4 的 ONNX 导出；非商用需遵守其许可',
  },
  u2net: {
    id: 'u2net', label: 'U²-Net（通用显著性分割）', fileHint: 'u2net.onnx',
    inputSize: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], channelOrder: 'RGB',
    approxSizeMB: 176, note: '输入 320×320，ImageNet mean/std',
  },
  u2netp: {
    id: 'u2netp', label: 'U²-Netp（轻量版，快但精度低）', fileHint: 'u2netp.onnx',
    inputSize: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], channelOrder: 'RGB',
    approxSizeMB: 5, note: '输入 320×320，ImageNet mean/std',
  },
  modnet: {
    id: 'modnet', label: 'MODNet（人像软蒙版）', fileHint: 'modnet.onnx',
    inputSize: 256, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], channelOrder: 'RGB',
    approxSizeMB: 25, note: '输入 256×256',
  },
};

export const DEFAULT_MATTE_MODEL = 'rmbg14';

const MIN_INPUT_SIZE = 64;
const MAX_INPUT_SIZE = 4096;
const MIN_STD = 1e-6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number): number {
  return Math.round(v);
}

/** 纯函数：解析侧车 JSON。非法 → 可读错误；越界的 inputSize/mean/std 夹到安全范围。 */
export type MatteSidecarResult =
  | { ok: true; preset: MatteModelSpec }
  | { ok: false; error: string };

function norm3(raw: unknown, name: string): { ok: true; value: [number, number, number] } | { ok: false; error: string } {
  let arr: unknown[] | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) arr = [raw, raw, raw];
  else if (Array.isArray(raw) && raw.length === 3) arr = raw;
  if (!arr) return { ok: false, error: `${name} 必须是数字或长度为 3 的数组` };
  const out: number[] = [];
  for (const v of arr) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: `${name} 含非数字项：${JSON.stringify(v)}` };
    }
    out.push(v);
  }
  return { ok: true, value: out as [number, number, number] };
}

export function parseMatteSidecar(raw: unknown): MatteSidecarResult {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '侧车 JSON 必须是对象' };
  }
  const obj = raw as Record<string, unknown>;

  let sizeRaw = obj.inputSize;
  if (Array.isArray(sizeRaw)) {
    if (sizeRaw.length !== 2 || sizeRaw[0] !== sizeRaw[1]) {
      return { ok: false, error: 'inputSize 数组必须是 [N, N]（宽高相同）' };
    }
    sizeRaw = sizeRaw[0];
  }
  if (typeof sizeRaw !== 'number' || !Number.isFinite(sizeRaw)) {
    return { ok: false, error: '缺少或非法 inputSize（应为正整数，如 1024）' };
  }
  const inputSize = clamp(round(sizeRaw), MIN_INPUT_SIZE, MAX_INPUT_SIZE);

  if (obj.mean === undefined) return { ok: false, error: '缺少 mean（如 [0.5,0.5,0.5]）' };
  if (obj.std === undefined) return { ok: false, error: '缺少 std（如 [0.5,0.5,0.5]）' };
  const mean = norm3(obj.mean, 'mean');
  if (!mean.ok) return mean;
  const std = norm3(obj.std, 'std');
  if (!std.ok) return std;

  let channelOrder: 'RGB' | 'BGR' = 'RGB';
  if (obj.channelOrder !== undefined) {
    const s = String(obj.channelOrder).trim().toUpperCase();
    if (s !== 'RGB' && s !== 'BGR') {
      return { ok: false, error: `channelOrder 只能是 RGB 或 BGR（收到 ${String(obj.channelOrder)}）` };
    }
    channelOrder = s;
  }

  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'custom';
  return {
    ok: true,
    preset: {
      id,
      label: `自定义模型（${id}）`,
      fileHint: `${id}.onnx`,
      inputSize,
      mean: mean.value.map((v) => clamp(v, -10, 10)) as [number, number, number],
      std: std.value.map((v) => clamp(v, -10, 10)) as [number, number, number],
      channelOrder,
      approxSizeMB: 0,
      note: '来自侧车 JSON；inputSize/mean/std 必须与模型训练时一致',
    },
  };
}

/**
 * 模型目录：<dataDir>/matte。
 * 取法与 db.ts / tts-packs.ts 一致：DATA_DIR → 用户 AppData → 模块路径兜底。
 * ⚠️ 刻意不 import db.js：本模块是纯文件/运行时解析，不该拖入 SQLite 初始化。
 */
export function matteModelDir(): string {
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'matte');
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appData =
    process.platform === 'win32'
      ? (process.env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : ''))
      : process.platform === 'darwin'
        ? (home ? path.join(home, 'Library', 'Application Support') : '')
        : (process.env.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : ''));
  if (appData) return path.join(appData, 'yan-zhi', 'server-data', 'matte');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) {
    return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'matte');
  }
  return path.join(path.dirname(moduleDir), 'matte');
}

/** 侧车 JSON 示例（指引/UI 共用，避免两处文案漂移）。 */
export function matteSidecarExample(id = 'custom'): string {
  return JSON.stringify({
    id, inputSize: 1024, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], channelOrder: 'RGB',
  });
}

export interface MatteRuntime {
  ok: boolean;
  /** 实际使用的解释器（未找到时为空） */
  python: string;
  modelId: string;
  modelPath: string;
  preset: MatteModelSpec | null;
  /** 可执行的补救指引（缺什么写什么；永远包含模型放置目录） */
  guidance: string[];
  /** onnxruntime 版本（导入失败为空） */
  onnxruntime: string;
  /** 自定义模型同名侧车 JSON 路径（generate 时作为 --config 传给脚本） */
  configPath?: string;
  error?: string;
}

interface ResolvedModel {
  ok: boolean;
  modelPath?: string;
  modelId?: string;
  preset?: MatteModelSpec;
  configPath?: string;
  error?: string;
}

/** 从模型文件解析规格：优先同名 .json 侧车；其次文件名命中已知 preset。 */
function resolveModelFile(file: string): ResolvedModel {
  const base = path.basename(file).replace(/\.onnx$/i, '');
  const sidecar = file.replace(/\.onnx$/i, '.json');
  if (existsSync(sidecar)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(sidecar, 'utf8'));
    } catch (e) {
      return { ok: false, error: `侧车 JSON 解析失败（${sidecar}）：${e instanceof Error ? e.message : String(e)}` };
    }
    const parsed = parseMatteSidecar(raw);
    if (!parsed.ok) return { ok: false, error: `侧车 JSON 不合法（${sidecar}）：${parsed.error}` };
    const preset = parsed.preset.id === 'custom'
      ? { ...parsed.preset, id: base, label: `自定义模型（${base}）`, fileHint: `${base}.onnx` }
      : parsed.preset;
    return { ok: true, modelPath: file, modelId: preset.id, preset, configPath: sidecar };
  }
  const known = MATTE_MODELS[base] || Object.values(MATTE_MODELS).find((m) => m.id.toLowerCase() === base.toLowerCase());
  if (known) return { ok: true, modelPath: file, modelId: known.id, preset: known };
  return {
    ok: false,
    error: `无法识别模型 ${path.basename(file)}：文件名不是已知 preset（${Object.keys(MATTE_MODELS).join(' / ')}），`
      + `且缺少同名侧车 JSON。请放置 ${base}.json，内容示例：${matteSidecarExample(base)}`,
  };
}

/** 解释器候选：与 clip-reframe 同一条链路（显式覆盖 > findPython > PATH）。 */
async function pythonCandidates(): Promise<string[]> {
  const out: string[] = [];
  const push = (p?: string | null) => {
    const s = String(p || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(process.env.YZ_CLIP_PYTHON);
  try { push(await findPython()); } catch { /* 无 Python → 由后续错误统一报告 */ }
  for (const cmd of ['python', 'python3', 'py']) push(await lookupOnPath(cmd));
  return out;
}

/** 在这些解释器里找一个能 import cv2 + onnxruntime 的。 */
async function findRuntimePython(): Promise<{ python: string; onnxruntime: string; error: string }> {
  const candidates = await pythonCandidates();
  if (!candidates.length) {
    return {
      python: '', onnxruntime: '',
      error: '未找到 Python 解释器。请安装 Python 3，或用 YZ_CLIP_PYTHON 指定带 onnxruntime/opencv 的解释器',
    };
  }
  let lastError = '';
  for (const py of candidates) {
    const probe = 'import cv2, onnxruntime as o; print(cv2.__version__ + "|" + o.__version__)';
    const r = await runCmd(py, ['-c', probe], { timeoutMs: 20000, maxBuffer: 1024 * 1024 });
    if (r.ok) {
      const lines = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      const version = last.includes('|') ? last.split('|').pop()!.trim() : last.trim();
      return { python: py, onnxruntime: version, error: '' };
    }
    lastError = String(r.stderr || r.error || '').trim().slice(-400) || `退出码 ${r.code}`;
  }
  const isCv = /cv2|opencv/i.test(lastError);
  const isOrt = /onnxruntime|onnx/i.test(lastError);
  const need = [isOrt ? 'onnxruntime' : '', isCv ? 'opencv-python' : ''].filter(Boolean).join(' ');
  return {
    python: candidates[0], onnxruntime: '',
    error: `Python 已找到（${candidates[0]}），但缺少抠像运行时依赖${need ? `：${need}` : ''}（${lastError}）。`
      + `请执行：pip install --upgrade onnxruntime opencv-python，或用 YZ_CLIP_PYTHON 指定带依赖的解释器`,
  };
}

let cached: MatteRuntime | null = null;

export function resetMatteRuntimeCache(): void { cached = null; }

/**
 * 探测抠像运行时：Python / onnxruntime / 模型。
 * 成功结果缓存（避免每次 UI 探测都起子进程）；失败不缓存，用户放置模型后可立即重试。
 */
export async function resolveMatteRuntime(): Promise<MatteRuntime> {
  if (cached?.ok) return cached;

  const dir = matteModelDir();
  const guidance: string[] = [`模型放置目录：${dir}`];
  const rt = await findRuntimePython();
  if (rt.python) guidance.splice(0, 0, `Python：${rt.python}`);
  if (rt.error) guidance.push(rt.error);

  let resolved: ResolvedModel;
  const envModel = process.env.YZ_MATTE_MODEL?.trim();
  if (envModel) {
    if (!path.isAbsolute(envModel)) {
      resolved = { ok: false, error: `YZ_MATTE_MODEL 必须是绝对路径（当前：${envModel}）` };
    } else if (!existsSync(envModel)) {
      resolved = { ok: false, error: `YZ_MATTE_MODEL 指向的模型文件不存在：${envModel}` };
    } else {
      resolved = resolveModelFile(envModel);
    }
  } else {
    resolved = resolveModelFromDir(dir, guidance);
  }

  if (resolved.ok && resolved.modelPath) {
    guidance.push(`模型：${resolved.modelPath}`);
  } else if (resolved.error) {
    guidance.push(resolved.error);
  }
  if (!resolved.ok) {
    guidance.push(
      '请自行放置 ONNX 分割模型（本应用不自动下载）：',
      `  · 方式一：把 rmbg14.onnx（约176MB，1024 输入）/ u2net.onnx（约176MB，320）放入上面的目录`,
      `  · 方式二：任意 <名称>.onnx + 同名 <名称>.json，JSON 示例：${matteSidecarExample()}`,
      '  · 方式三：设置环境变量 YZ_MATTE_MODEL=<模型绝对路径>',
    );
  }

  const ok = Boolean(rt.python && rt.onnxruntime && resolved.ok && resolved.modelPath);
  const result: MatteRuntime = {
    ok,
    python: rt.python,
    modelId: resolved.modelId || '',
    modelPath: resolved.modelPath || '',
    preset: resolved.preset || null,
    guidance,
    onnxruntime: rt.onnxruntime,
    ...(resolved.configPath ? { configPath: resolved.configPath } : {}),
    ...(ok ? {} : { error: resolved.error || rt.error || '抠像运行时未就绪' }),
  };
  if (ok) cached = result;
  return result;
}

/** 在模型目录里找：已知 preset 优先（固定顺序），其次任意 .onnx + 侧车。 */
function resolveModelFromDir(dir: string, guidance: string[]): ResolvedModel {
  if (!existsSync(dir)) return { ok: false, error: `模型目录不存在（首次放置时创建即可）：${dir}` };

  for (const model of Object.values(MATTE_MODELS)) {
    const file = path.join(dir, model.fileHint);
    if (existsSync(file)) return { ok: true, modelPath: file, modelId: model.id, preset: model };
  }

  let onnxFiles: string[] = [];
  try {
    onnxFiles = readdirSync(dir).filter((n) => /\.onnx$/i.test(n)).sort();
  } catch (e) {
    return { ok: false, error: `读取模型目录失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!onnxFiles.length) return { ok: false, error: '目录里没有 .onnx 模型文件' };

  let firstError = '';
  for (const name of onnxFiles) {
    const hit = resolveModelFile(path.join(dir, name));
    if (hit.ok) return hit;
    if (!firstError) firstError = hit.error || '';
  }
  guidance.push(`发现 ${onnxFiles.length} 个 .onnx，但没有可用的侧车 JSON`);
  return { ok: false, error: firstError || '没有可用的抠像模型' };
}

// ════════════════════════════════════════════════════════════════════════════
// 脚本执行：视频 → 单通道人像蒙版视频（不接渲染）
// ════════════════════════════════════════════════════════════════════════════

export interface GeneratePortraitMatteInput {
  /** 源视频绝对路径 */
  file: string;
  /** 蒙版视频输出路径（.mp4；父目录会自动创建） */
  outPath: string;
  ss?: number;
  duration?: number;
  /** 蒙版输出帧率（默认 10，夹到 1~60） */
  fps?: number;
}

export interface GeneratePortraitMatteResult {
  ok: boolean;
  status?: number;
  error?: string;
  hint?: string;
  need?: string;
  frames?: number;
  width?: number;
  height?: number;
  fps?: number;
  model?: string;
  outPath?: string;
}

/** 只取最后一行 JSON（脚本/OpenCV 可能往 stdout 打杂音）。 */
function parseScriptJson(stdout: string): Record<string, unknown> | null {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) as Record<string, unknown>; } catch { /* 继续往前找 */ }
  }
  return null;
}

/**
 * 生成人像蒙版视频。
 * ★ 运行时未就绪 → 503 + 完整指引（缺 Python/onnxruntime/模型分别说明）。
 * ★ 脚本报告成功但产物不存在/为空 → 仍按失败返回（不伪造成功）。
 */
export async function generatePortraitMatte(input: GeneratePortraitMatteInput): Promise<GeneratePortraitMatteResult> {
  const file = String(input.file || '').trim();
  const rawOut = String(input.outPath || '').trim();
  if (!file) return { ok: false, status: 400, error: 'file 必填（源视频路径）' };
  if (!rawOut) return { ok: false, status: 400, error: 'outPath 必填（蒙版视频输出路径）' };
  const outPath = path.resolve(rawOut);
  if (!existsSync(file)) {
    return { ok: false, status: 400, error: `视频文件不存在：${file}`, hint: '素材可能被移动或删除' };
  }
  if (!/\.mp4$/i.test(outPath)) {
    return { ok: false, status: 400, error: 'outPath 必须是 .mp4（蒙版容器固定为 mp4v/yuv420p）' };
  }

  const rt = await resolveMatteRuntime();
  if (!rt.ok) {
    return {
      ok: false, status: 503,
      error: rt.error || '抠像运行时未就绪',
      need: 'matte-runtime',
      hint: rt.guidance.join('\n'),
    };
  }

  const script = getPythonScript('clip_matte/portrait_mask.py');
  if (!script) {
    return {
      ok: false, status: 500,
      error: '缺少抠像脚本 clip_matte/portrait_mask.py（随包脚本缺失或安装不完整）',
    };
  }

  const fps = clamp(Number(input.fps ?? 10) || 10, 1, 60);
  const args = ['--input', file, '--out', outPath, '--model', rt.modelPath, '--fps', String(fps)];
  if (rt.configPath) args.push('--config', rt.configPath);
  else args.push('--preset', rt.modelId);
  const ss = Number(input.ss ?? 0);
  const duration = Number(input.duration ?? 0);
  if (Number.isFinite(ss) && ss > 0) args.push('--ss', String(ss));
  if (Number.isFinite(duration) && duration > 0) args.push('--duration', String(duration));

  let r: { stdout: string; stderr: string; exitCode: number };
  try {
    r = await runPythonScript(script, args, {
      timeout: 30 * 60 * 1000,
      cwd: path.dirname(outPath),
      pythonPath: rt.python,
    });
  } catch (e) {
    return { ok: false, status: 500, error: `无法启动 Python（${rt.python}）：${e instanceof Error ? e.message : String(e)}` };
  }

  const parsed = parseScriptJson(r.stdout);
  if (!parsed || parsed.ok !== true) {
    const msg = String(parsed?.error || r.stderr || '').trim().slice(0, 600)
      || `抠像脚本退出码 ${r.exitCode}`;
    return { ok: false, status: 422, error: `蒙版生成失败：${msg}` };
  }

  if (!existsSync(outPath)) {
    return { ok: false, status: 500, error: `脚本报告成功，但未产出蒙版文件：${outPath}` };
  }
  let size = 0;
  try {
    size = statSync(outPath).size;
  } catch { /* 读取失败按 0 处理 */ }
  if (size <= 0) {
    return { ok: false, status: 500, error: `蒙版文件为空（0 字节）：${outPath}` };
  }

  return {
    ok: true,
    frames: Number(parsed.frames) || 0,
    width: Number(parsed.width) || 0,
    height: Number(parsed.height) || 0,
    fps: Number(parsed.fps) || fps,
    model: String(parsed.model || rt.modelId),
    outPath,
  };
}
