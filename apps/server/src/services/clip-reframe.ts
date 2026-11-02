// 智能竖屏重构（P2-4 MVP）—— 静态人脸居中裁切。
//
// ★ 诚实定位（2026-11-02 用户拍板 MVP）：
//   **只做静态裁切，不做逐帧跟踪、不做动态运镜。** 做法是抽若干帧做 Haar 正脸检测，
//   取所有检出人脸的**中位中心**，据此算一个目标画幅（默认 9:16）的裁切窗口，写进
//   片段既有的 `crop` 字段。渲染管线一行不改（crop 已是既有能力）。
//   检测不到人脸 → 回退画面中心裁切并给 warning，绝不静默假装成功。
//
// ★ 为什么拆成「纯函数 + IO」：
//   居中算法是最容易错、也最值得反复回归的部分；把它与 ffprobe/Python 隔开，
//   单测不依赖本机 OpenCV（CV 环境在 CI/打包机并不可靠）。
//
// ★ 裁切语义（与 clip-project 的 `ClipSegment.crop` 一致）：
//   x/y/w/h 都是**相对素材画面**的 0~1 比例；渲染时先 crop 再回填工程画幅
//   （见 clip-render 的 `buildSegmentFilters`）。本模块只产出比例，不碰像素。

import fs from 'node:fs';
import os from 'node:os';
import { runCmd, lookupOnPath } from './exec-cmd.js';
import { parseProbeJson, probeArgs } from './clip-render.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { findPython, getPythonScript, runPythonScript } from '@yan-zhi/core';

/** 目标画幅（宽/高）。UI 只暴露这三种；也接受任意正数供将来扩展。 */
export const TARGET_ASPECTS = { '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 } as const;
export type TargetAspectKey = keyof typeof TARGET_ASPECTS;

export interface FaceBox {
  /** 该帧在源视频中的时间（秒） */
  t?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CropCenterResult {
  crop: CropBox;
  /** 0~1：检出人脸的采样帧占比（未传 sampleCount 时按 6 帧封顶估算） */
  confidence: number;
  warning?: string;
}

export interface ComputeFaceCenteredCropInput {
  frameW: number;
  frameH: number;
  /** 每帧至多一张（脚本已取最大脸）；可含异常框，函数内部会过滤 */
  faces: FaceBox[];
  /** 目标宽高比 = 宽/高（如 9/16 = 0.5625） */
  targetAspect: number;
  /** 1=最宽松（窗口撑满画面一边）；0.6=更贴近主体。默认 1，夹到 0.6~1 */
  zoom?: number;
  /** 实际采样帧数（仅用于 confidence；缺省按 faces.length/6 估算） */
  sampleCount?: number;
}

/** zoom 下限：再小窗口会碎到没有构图意义（0.6 = 比最大窗口放大 1.67 倍） */
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1;
/** 与 clip-project.normalizeCrop 的最小窗口一致（w/h ≥ 0.1），避免落盘后被放大漂移 */
const MIN_CROP_REL = 0.1;
/** 人脸框超过画面这个比例 = 误检（近景大脸也不会占满 90%） */
const MAX_FACE_FRAME_RATIO = 0.9;
/** 小于画面 0.5% 的框当噪点 */
const MIN_FACE_FRAME_RATIO = 0.005;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 过滤越界/尺寸异常/非数值的人脸框（误检比没有更糟：会把构图拽偏）。 */
function validFaces(faces: FaceBox[], frameW: number, frameH: number): Array<{ cx: number; cy: number }> {
  const out: Array<{ cx: number; cy: number }> = [];
  for (const f of faces) {
    if (!f || typeof f !== 'object') continue;
    const x = Number(f.x);
    const y = Number(f.y);
    const w = Number(f.w);
    const h = Number(f.h);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    if (w <= 0 || h <= 0) continue;
    if (w > frameW * MAX_FACE_FRAME_RATIO || h > frameH * MAX_FACE_FRAME_RATIO) continue;
    if (w < frameW * MIN_FACE_FRAME_RATIO || h < frameH * MIN_FACE_FRAME_RATIO) continue;
    // 完全在画面外（含只有边角露出的情况）
    if (x + w <= 0 || y + h <= 0 || x >= frameW || y >= frameH) continue;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (cx < 0 || cx > frameW || cy < 0 || cy > frameH) continue;
    out.push({ cx, cy });
  }
  return out;
}

/**
 * 纯函数：人脸中位中心 → 目标画幅裁切窗口（0~1 相对值）。
 *
 * 窗口尺寸 = 「保持目标宽高比、撑满画面一边」的最大窗口 × zoom；
 * 位置 = 中位人脸中心（无人脸则画面中心），再夹到画面内。
 * ★ 非法 frameW/frameH 直接抛错（没有画幅就谈不上比例裁切）；
 *   非法 targetAspect/zoom 走兜底并写 warning，不让一次误传把请求打挂。
 */
export function computeFaceCenteredCrop(input: ComputeFaceCenteredCropInput): CropCenterResult {
  const frameW = Number(input.frameW);
  const frameH = Number(input.frameH);
  if (!Number.isFinite(frameW) || !Number.isFinite(frameH) || frameW <= 0 || frameH <= 0) {
    throw new Error('computeFaceCenteredCrop: frameW/frameH 必须是正数（请先探测视频分辨率）');
  }

  const warnings: string[] = [];

  const aspectRaw = Number(input.targetAspect);
  const aspect = Number.isFinite(aspectRaw) && aspectRaw > 0 ? aspectRaw : TARGET_ASPECTS['9:16'];
  if (!(Number.isFinite(aspectRaw) && aspectRaw > 0)) warnings.push('目标画幅无效，已按 9:16 计算');

  const zoomRaw = Number(input.zoom ?? 1);
  const zoom = Number.isFinite(zoomRaw) ? clamp(zoomRaw, MIN_ZOOM, MAX_ZOOM) : 1;
  if (Number.isFinite(zoomRaw) && (zoomRaw < MIN_ZOOM || zoomRaw > MAX_ZOOM)) {
    warnings.push(`zoom 超出 ${MIN_ZOOM}~${MAX_ZOOM}，已夹取`);
  }

  // 窗口：保持目标比例的最大内接矩形，再乘 zoom（zoom<1 = 裁得更紧）
  const frameAspect = frameW / frameH;
  let winW = frameW;
  let winH = frameH;
  if (frameAspect > aspect) winW = frameH * aspect;
  else winH = frameW / aspect;
  winW *= zoom;
  winH *= zoom;

  // 兜底：比例极端时窗口可能小于持久化下限（0.1），按最小窗口整体放大
  const minW = frameW * MIN_CROP_REL;
  const minH = frameH * MIN_CROP_REL;
  if (winW < minW || winH < minH) {
    const k = Math.max(minW / winW, minH / winH);
    winW *= k;
    winH *= k;
    warnings.push('目标画幅与素材比例差异过大，已按最小可裁窗口处理');
  }

  const faces = Array.isArray(input.faces) ? input.faces : [];
  const centers = validFaces(faces, frameW, frameH);
  let cx = frameW / 2;
  let cy = frameH / 2;
  if (centers.length) {
    cx = median(centers.map((f) => f.cx));
    cy = median(centers.map((f) => f.cy));
  } else {
    warnings.push('未检测到人脸，已回退画面中心裁切');
  }

  const left = clamp(cx - winW / 2, 0, Math.max(0, frameW - winW));
  const top = clamp(cy - winH / 2, 0, Math.max(0, frameH - winH));
  const crop: CropBox = {
    x: round4(left / frameW),
    y: round4(top / frameH),
    w: round4(winW / frameW),
    h: round4(winH / frameH),
  };
  // 四舍五入后再夹一次，保证 x+w ≤ 1 / y+h ≤ 1（渲染层虽然会自然夹，但语义要干净）
  crop.w = round4(Math.min(crop.w, 1 - crop.x));
  crop.h = round4(Math.min(crop.h, 1 - crop.y));

  const sampleCount = Number(input.sampleCount ?? 0);
  const confidence = centers.length
    ? round4(clamp(centers.length / (sampleCount > 0 ? sampleCount : 6), 0, 1))
    : 0;

  return {
    crop,
    confidence,
    ...(warnings.length ? { warning: warnings.join('；') } : {}),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// IO 层：ffprobe 探测 → 跑 Python 抽帧检测 → 算裁切
// ════════════════════════════════════════════════════════════════════════════

export interface ReframeVerticalInput {
  /** 源视频绝对路径 */
  file: string;
  /** '9:16' | '1:1' | '16:9'（缺省 9:16）；也接受任意正数宽高比 */
  targetAspect?: string | number;
  zoom?: number;
  /** 抽样帧数（默认 12，脚本上限 24） */
  samples?: number;
  /** 抽样间隔秒（>0 时覆盖 samples） */
  interval?: number;
  /** 只分析片段使用的区间（trimStart / trimEnd），避免长素材里的无关镜头干扰 */
  start?: number;
  duration?: number;
}

export interface ReframeVerticalResult {
  ok: boolean;
  /** 建议的 HTTP 状态码（路由直接用） */
  status?: number;
  error?: string;
  crop?: CropBox;
  confidence?: number;
  warning?: string;
  /** 源视频像素尺寸 */
  width?: number;
  height?: number;
  /** 检出的人脸（每帧至多一张，源视频像素坐标） */
  faces?: FaceBox[];
  /** 实际采样帧数 */
  sampleCount?: number;
  need?: string;
  hint?: string;
}

/** 解析目标画幅：字符串键（9:16…）或正数宽高比；非法返回 null。 */
export function parseTargetAspect(v: string | number | undefined): number | null {
  if (v == null || v === '') return TARGET_ASPECTS['9:16'];
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const key = String(v).trim();
  if (key in TARGET_ASPECTS) return TARGET_ASPECTS[key as TargetAspectKey];
  return null;
}

/** ffprobe 探测宽高（单一出口：probeArgs/parseProbeJson 与其它媒体链路同口径）。 */
async function probeSize(ffprobe: string, file: string): Promise<{ width: number; height: number } | null> {
  const r = await runCmd(ffprobe, probeArgs(file), { timeoutMs: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (!r.ok) return null;
  const p = parseProbeJson(r.stdout);
  return p.width > 0 && p.height > 0 ? { width: p.width, height: p.height } : null;
}

interface ScriptFaceOutput {
  ok?: boolean;
  error?: string;
  width?: number;
  height?: number;
  faces?: FaceBox[];
}

/** 只取最后一行 JSON（脚本/OpenCV 可能往 stdout 打杂音）。 */
function parseScriptJson(stdout: string): ScriptFaceOutput | null {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as ScriptFaceOutput;
    } catch { /* 继续往前找 */ }
  }
  return null;
}

/** 解释器候选：显式覆盖 > 统一解析（随包/系统）> PATH 上的 python/python3/py。 */
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

/** 这些错误说明「这个解释器的 cv2 不行」，值得换一个解释器再试；其余错误不重试。 */
function isCvUnavailable(msg: string): boolean {
  return /cv2|opencv|objdetect|CascadeClassifier|haarcascade/i.test(msg);
}

const CV_INSTALL_HINT = '请安装完整版 opencv-python：pip install --upgrade opencv-python（随包 Python 的精简 cv2 不含 Haar 人脸检测），或用 YZ_CLIP_PYTHON 指定带 cv2 的解释器';

/**
 * 智能竖屏重构（IO）：探测宽高 → Python 抽样检测人脸 → 人脸中位中心裁切。
 * ★ Python/cv2 缺失给可执行错误；文件不存在/无视频流直接 4xx。
 * ★ 不写工程、不落盘 —— 由路由决定把 crop 写进哪个片段。
 */
export async function reframeVertical(input: ReframeVerticalInput): Promise<ReframeVerticalResult> {
  const file = String(input.file || '').trim();
  if (!file) return { ok: false, status: 400, error: 'file 必填（源视频路径）' };
  if (!fs.existsSync(file)) {
    return { ok: false, status: 400, error: `视频文件不存在：${file}`, hint: '素材可能被移动或删除' };
  }

  const targetAspect = parseTargetAspect(input.targetAspect);
  if (targetAspect == null) {
    return {
      ok: false, status: 400,
      error: `targetAspect 无效：${String(input.targetAspect)}（可选 9:16 / 1:1 / 16:9）`,
    };
  }

  const ff = await resolveFfmpeg();
  if (!ff.ok) {
    return { ok: false, status: 503, error: ff.error, need: 'ffmpeg', hint: '可调用 media_install_ffmpeg。' };
  }
  const size = await probeSize(ff.ffprobe, file);
  if (!size) {
    return { ok: false, status: 422, error: '无法探测视频分辨率（可能不是视频/文件损坏/ffprobe 不支持该编码）' };
  }

  const script = getPythonScript('clip_reframe/face_center.py');
  if (!script) {
    return {
      ok: false, status: 500,
      error: '缺少人脸检测脚本 clip_reframe/face_center.py（随包脚本缺失或安装不完整）',
    };
  }

  const samples = clamp(Math.round(Number(input.samples ?? 12)), 1, 24);
  const start = Math.max(0, Number(input.start ?? 0) || 0);
  const duration = Math.max(0, Number(input.duration ?? 0) || 0);
  const args = ['--video', file, '--samples', String(samples)];
  if (input.interval != null && Number(input.interval) > 0) args.push('--interval', String(Number(input.interval)));
  if (start > 0) args.push('--start', String(start));
  if (duration > 0) args.push('--duration', String(duration));

  const candidates = await pythonCandidates();
  if (!candidates.length) {
    return {
      ok: false, status: 503,
      error: '未找到 Python 解释器，无法运行人脸检测',
      need: 'python',
      hint: '请安装 Python 3，或用 YZ_CLIP_PYTHON 指定解释器路径',
    };
  }

  let lastError = '';
  for (const py of candidates) {
    let r: { stdout: string; stderr: string; exitCode: number };
    try {
      r = await runPythonScript(script, args, { timeout: 120000, cwd: os.tmpdir(), pythonPath: py });
    } catch (e: unknown) {
      lastError = `无法启动 Python（${py}）：${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const parsed = parseScriptJson(r.stdout);
    if (parsed?.ok === true) {
      const faces = (Array.isArray(parsed.faces) ? parsed.faces : []).map((f) => ({
        ...(Number.isFinite(Number(f.t)) ? { t: Number(f.t) } : {}),
        x: Number(f.x), y: Number(f.y), w: Number(f.w), h: Number(f.h),
      }));
      const w = Number(parsed.width) || size.width;
      const h = Number(parsed.height) || size.height;
      const calc = computeFaceCenteredCrop({
        frameW: w, frameH: h, faces, targetAspect, zoom: input.zoom, sampleCount: samples,
      });
      return {
        ok: true,
        crop: calc.crop,
        confidence: calc.confidence,
        ...(calc.warning ? { warning: calc.warning } : {}),
        width: w,
        height: h,
        faces,
        sampleCount: samples,
      };
    }
    const msg = String(parsed?.error || r.stderr || '').trim().slice(0, 400)
      || `人脸检测脚本退出码 ${r.exitCode}`;
    lastError = msg;
    // 只有「解释器的 cv2 不可用」才换下一个解释器；视频打不开等错误换谁都一样
    if (!isCvUnavailable(msg)) break;
  }

  const cvProblem = isCvUnavailable(lastError);
  return {
    ok: false,
    status: cvProblem ? 500 : 422,
    error: `人脸检测失败：${lastError || '未知错误'}`,
    // 只有 cv2 能力缺失才给安装指引；视频打不开之类的错误给 opencv 指引会误导
    ...(cvProblem ? { need: 'opencv', hint: CV_INSTALL_HINT } : {}),
  };
}
