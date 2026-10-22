// ACE-Step 本地写歌服务（2026-10-22）
//
// ★ 与既有方案的关系（不是替代，是补位）：
//   music_compose  —— 本地合成器，和弦/BPM 精确，**不能唱**（机器人音色）。
//   music_generate —— 外部大模型（Suno/百炼），人声自然但要 key、要钱、要联网。
//   music_sing     —— 本文件：**本地模型，写词就能唱**，不上传歌词，不花钱。
//
// ★ 架构：常驻 Python 子进程 + JSON 行协议（bridge.py）
//   为什么不每次 spawn：模型加载约 40 秒，冷启动会让每首歌都多等 40 秒。
//   常驻后第一首约 60 秒（含加载），之后每首 40~90 秒（按时长）。
//
// ★ 生命周期：闲置 10 分钟自动卸载模型（6GB 卡上常驻吃 5.4GB，会影响其它任务）。
//
// ★ 状态三态：not-installed（缺权重/依赖）/ ready（可生成）/ error（启动失败，附原因）

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';
import { acestepRootDir } from './music-acestep-install.js';

const logger = createLogger('music-acestep');

/** 闲置多久卸载模型（毫秒）。6GB 卡常驻 5.4GB 会挤压其它任务。 */
const IDLE_UNLOAD_MS = 10 * 60 * 1000;
/** 单次生成超时：240 秒音频最长约 5 分钟推理，留余量。 */
const GENERATE_TIMEOUT_MS = 15 * 60 * 1000;
/** 首次加载（含模型到显存）超时。 */
const LOAD_TIMEOUT_MS = 5 * 60 * 1000;

export interface AcestepStatus {
  state: 'not-installed' | 'ready' | 'error';
  /** 缺失项（not-installed 时给用户看"要下什么"） */
  missing?: string[];
  /** 已就绪时：设备与显存 */
  device?: string;
  vramGB?: number;
  /** 说明（error 时是原因） */
  message?: string;
  root: string;
}

export interface SingOptions {
  lyrics: string;
  style?: string;
  duration?: number;
  seed?: number;
  vocalForward?: boolean;
  vocalLanguage?: string;
  inferenceSteps?: number;
  guidanceScale?: number;
  onProgress?: (stage: string, progress: number, message: string) => void;
}

export interface SingResult {
  file: string;
  duration: number;
  sampleRate: number;
  seed: number;
  elapsedSec: number;
  prompt: string;
}

/** 单例：进程 + 请求序号 + 在途 promise。 */
let child: ChildProcessWithoutNullStreams | null = null;
let seq = 0;
let idleTimer: NodeJS.Timeout | null = null;
const pending = new Map<string, {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  onEvent?: (ev: any) => void;
}>();

/** ACE-Step 根目录（与 DiffSinger 共用 singing 目录，不另开一级）。
 *  ★ 定义在 music-acestep-install.ts（安装器与运行时共用一个口径），此处仅转发。 */
export function acestepRoot(): string {
  return acestepRootDir();
}

function repoDir(): string {
  return path.join(acestepRoot(), 'ACE-Step-1.5');
}

/**
 * 安装状态探测（不启动进程，只查文件）。
 *
 * ★ 必须区分「有权重」和「装全了」：
 *   实测部署场景里出现过 8.9GB 权重齐全、但 venv 里 torch 是 **CPU 版**
 *   （`torch 2.14.1+cpu`，`torch.cuda.is_available()==False`）的情况 ——
 *   权重看着全，实际根本用不了显卡。所以这里要同时校验 torch 是否 CUDA 版。
 */
export async function acestepStatus(): Promise<AcestepStatus> {
  const root = acestepRoot();
  const missing: string[] = [];

  if (!existsSync(repoDir())) missing.push('ACE-Step 源码');
  if (!existsSync(path.join(root, 'turbo', 'model.safetensors'))) missing.push('DiT 权重（turbo，4.5GB）');
  if (!existsSync(path.join(root, 'vae', 'model.safetensors'))) missing.push('VAE 权重（322MB）');
  if (!existsSync(path.join(root, 'qwen', 'model.safetensors'))) missing.push('文本编码器（Qwen3，1.2GB）');

  const py = acestepPython();
  if (!existsSync(py)) missing.push('Python 运行时');

  if (missing.length) {
    return { state: 'not-installed', missing, root };
  }

  // 轻量探测：torch 是否 CUDA 版 + 依赖是否齐（3 秒内返回，不加载模型）
  const probe = await runProbe(py);
  if (!probe.ok) {
    return { state: 'error', message: probe.error, missing: probe.missing, root };
  }
  if (!probe.cuda) {
    // ★ 这是最容易误判成"装好了"的情况：权重大小全对，但跑在 CPU 上
    return {
      state: 'error',
      message:
        `torch 是 CPU 版（${probe.torchVersion}），无法使用显卡。` +
        '需要重装 CUDA 版：pip install --force-reinstall torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128',
      missing: ['CUDA 版 torch'],
      root,
    };
  }

  return { state: 'ready', device: probe.device, vramGB: probe.vramGB, root };
}

interface ProbeResult {
  ok: boolean;
  cuda?: boolean;
  device?: string;
  vramGB?: number;
  torchVersion?: string;
  error?: string;
  missing?: string[];
}

function runProbe(python: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const code = `
import json, importlib.util as u
miss=[m for m in ("torch","transformers","diffusers","soundfile","loguru","einops","safetensors") if not u.find_spec(m)]
if miss:
    print(json.dumps({"ok":False,"missing":miss})); raise SystemExit
import torch
d = "cuda" if torch.cuda.is_available() else "cpu"
vram = torch.cuda.get_device_properties(0).total_memory/1024**3 if d=="cuda" else 0
print(json.dumps({"ok":True,"cuda":d=="cuda","device":d,"vramGB":round(vram,1),"torchVersion":torch.__version__}))
`;
    const p = spawn(python, ['-c', code], { windowsHide: true });
    let out = '';
    let err = '';
    const t = setTimeout(() => p.kill(), 20000);
    p.stdout.on('data', (b) => { out += String(b); });
    p.stderr.on('data', (b) => { err += String(b); });
    p.on('close', () => {
      clearTimeout(t);
      try {
        const line = out.trim().split('\n').filter(Boolean).pop() || '';
        const j = JSON.parse(line);
        if (!j.ok) {
          resolve({ ok: false, missing: j.missing, error: `缺少依赖：${(j.missing || []).join(', ')}` });
        } else {
          resolve(j);
        }
      } catch {
        resolve({ ok: false, error: `探测失败：${(err || out).slice(-300) || '无输出'}` });
      }
    });
    p.on('error', (e) => { clearTimeout(t); resolve({ ok: false, error: `无法启动 Python：${e.message}` }); });
  });
}

/**
 * ★ ACE-Step 用**自己的 venv**，不是 DiffSinger 的随包 Python。
 *   实测踩到：误用 `singingPython()`（返回随包 python.exe，里面只有 onnxruntime）
 *   → 状态探测报「缺少 Python 运行时」，看起来像没安装，实际是找错了解释器。
 *   ACE-Step 需要 torch cu128 + transformers + diffusers，只有 acestep-venv 有。
 */
function acestepPython(): string {
  return path.join(path.dirname(acestepRootDir()), 'acestep-venv', 'Scripts', 'python.exe');
}

function bridgeScript(): string {
  // dev: apps/server/vendor/acestep-bridge/bridge.py
  // 打包后：随 resources 分发（与 python-tools 同策略）
  const candidates = [
    path.resolve(process.cwd(), 'apps', 'server', 'vendor', 'acestep-bridge', 'bridge.py'),
    path.resolve(process.cwd(), 'vendor', 'acestep-bridge', 'bridge.py'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

/** 确保子进程在跑（幂等）。 */
function ensureChild(): ChildProcessWithoutNullStreams {
  if (child) return child;

  const py = acestepPython();
  const script = bridgeScript();
  if (!existsSync(script)) throw new Error(`找不到 bridge 脚本：${script}`);

  const proc = spawn(py, [script], {
    windowsHide: true,
    env: {
      ...process.env,
      YZ_ACESTEP_ROOT: acestepRoot(),
      YZ_ACESTEP_OUT: path.join(acestepRoot(), 'out'),
      PYTHONUNBUFFERED: '1',
      // ★ 两个坑的环境变量保险（bridge 内也会设，这里双保险）
      YZ_FORCE_VAE_GPU: '1',
      ACESTEP_VAE_DECODE_CHUNK_SIZE: '256',
      HF_ENDPOINT: 'https://hf-mirror.com',
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
    },
  });

  let buf = '';
  proc.stdout.on('data', (b) => {
    buf += String(b);
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.event === 'progress') {
        pending.get(String(msg.id))?.onEvent?.(msg);
        continue;
      }
      const waiter = pending.get(String(msg.id));
      if (!waiter) continue;
      pending.delete(String(msg.id));
      if (msg.ok) waiter.resolve(msg.data);
      else waiter.reject(new Error(msg.error || '未知错误'));
    }
  });

  proc.stderr.on('data', (b) => {
    // bridge 的诊断信息走 stderr（含 traceback），只记不解析
    const s = String(b).trimEnd();
    if (s) logger.info(`[bridge] ${s.slice(0, 800)}`);
  });

  proc.on('exit', (code) => {
    logger.warn(`ACE-Step bridge 退出 code=${code}`);
    child = null;
    // 所有在途请求立即失败，别让模型干等
    for (const [, w] of pending) w.reject(new Error(`ACE-Step 进程已退出（code=${code}）`));
    pending.clear();
  });

  child = proc;
  return proc;
}

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    try {
      await request('unload', {}, undefined, 60000);
      logger.info('ACE-Step 闲置超时，已卸载模型释放显存');
    } catch { /* 卸载失败无所谓，下次复用即重载 */ }
  }, IDLE_UNLOAD_MS);
  // 不阻止进程退出（dev 热重启时别挂着）
  idleTimer.unref?.();
}

/** 发一条请求并等响应。 */
function request(
  cmd: string,
  payload: Record<string, unknown>,
  onEvent?: (ev: any) => void,
  timeoutMs = GENERATE_TIMEOUT_MS,
): Promise<any> {
  const proc = ensureChild();
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onEvent });
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`ACE-Step 超时（${Math.round(timeoutMs / 1000)}s）：${cmd}`));
    }, timeoutMs);
    const done = (fn: (v: any) => void) => (v: any) => { clearTimeout(timer); fn(v); };
    const orig = pending.get(id)!;
    pending.set(id, {
      resolve: done(orig.resolve),
      reject: done((e) => orig.reject(e)),
      onEvent,
    });
    try {
      proc.stdin.write(JSON.stringify({ id, cmd, ...payload }) + '\n');
    } catch (e: unknown) {
      pending.delete(id);
      clearTimeout(timer);
      reject(new Error(`写入 bridge 失败：${e instanceof Error ? e.message : String(e)}`));
    }
  });
}

/** 生成一首歌。 */
export async function singWithAcestep(opts: SingOptions): Promise<SingResult> {
  const st = await acestepStatus();
  if (st.state === 'not-installed') {
    throw new Error(
      `AI 写歌运行时尚未安装（缺：${(st.missing || []).join('、')}）。` +
      '请调用 install_resource({ resource: "acestep", action: "install" }) 安装，或让用户在设置中下载。',
    );
  }
  if (st.state === 'error') {
    throw new Error(`AI 写歌运行时不健康：${st.message}`);
  }

  touchIdle();
  const data = await request(
    'generate',
    {
      lyrics: opts.lyrics,
      style: opts.style || '',
      duration: opts.duration ?? 60,
      seed: opts.seed,
      vocal_forward: opts.vocalForward !== false,
      vocal_language: opts.vocalLanguage || 'zh',
      inference_steps: opts.inferenceSteps ?? 8,
      guidance_scale: opts.guidanceScale ?? 8.0,
    },
    (ev) => opts.onProgress?.(ev.stage, ev.progress, ev.message),
  );
  touchIdle();
  return data as SingResult;
}

/** 主动卸载（前端"释放显存"或任务结束时用）。 */
export async function unloadAcestep(): Promise<void> {
  if (!child) return;
  try { await request('unload', {}, undefined, 60000); } catch { /* ignore */ }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

/** 进程是否在跑（测试/诊断用）。 */
export function acestepRunning(): boolean {
  return !!child;
}
