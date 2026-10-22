// ACE-Step 运行时安装器（2026-10-22）
//
// ★★★ 设计前提：**已部署的不重下**。
//   本机 `singing/acestep` 下已经有 8.9GB（turbo 4.5G + lm 2.9G + qwen 1.2G + vae 322M）
//   和 `singing/acestep-venv`（681MB）。用户要求"复用"，所以安装器必须：
//     · 权重齐全 → 跳过下载
//     · venv 存在 → 只在依赖缺失时补装
//     · torch 是 CPU 版 → 这是必须修的真实缺陷（实测踩到：权重全对但跑不了显卡）
//
// ★ 实测踩过的四个坑（全部固化在这里，否则换机器必复现）：
//   1. torch 必须是 **CUDA 版**。`pip install torch` 默认给 CPU 版
//      （实测装出 2.14.1+cpu，`cuda.is_available()==False`），必须指定
//      `--index-url https://download.pytorch.org/whl/cu128`。
//   2. **torchaudio 必须与 torch 同版本**。2.11.0 配 2.7.1 会 `WinError 127 找不到指定的程序`
//      （DLL 加载失败），表现为模型加载即崩。
//   3. **VAE 文件名**：diffusers 找 `diffusion_pytorch_model.safetensors`，
//      官方权重叫 `model.safetensors` → 报 `Model not fully initialized`。
//      （bridge 里已用硬链接自动补，这里也顺手做一次）
//   4. **路径结构**：yan-zhi 部署是扁平 {turbo,lm,qwen,vae}，代码要 `checkpoints/<规范名>`
//      （bridge 里建 junction 解决，这里不重复做）
//
// ★ 下载源：国内优先（ModelScope → hf-mirror → HF），复用 shared 的 HF_MODEL_SOURCES。

import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, link, copyFile, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createLogger } from './logger.js';
import { singingRoot, singingPython } from './music-sing-diffsinger.js';
import { cnFirst, HF_MODEL_SOURCES, PIP_SOURCES, TORCH_WHEEL_SOURCES, RESOURCE_BYTES, humanBytes } from '@yan-zhi/shared';
import type { ProgressFn, InstallOutcome } from './installer-registry.js';

const logger = createLogger('acestep-install');

/** ACE-Step 权重仓库（ModelScope / HF 同名）。 */
const REPO = 'ACE-Step/Ace-Step1.5';

/** 扁平目录名 → checkpoints 规范名（与 bridge 保持一致）。 */
const FLAT_TO_CANON: Record<string, string> = {
  turbo: 'acestep-v15-turbo',
  lm: 'acestep-5Hz-lm-1.7B',
  qwen: 'Qwen3-Embedding-0.6B',
  vae: 'vae',
};

/** 每个扁平目录至少需要的一个文件（判断是否已下载）。 */
const REQUIRED: Record<string, string> = {
  turbo: 'model.safetensors',
  vae: 'model.safetensors',
  qwen: 'model.safetensors',
};

export function acestepRootDir(): string {
  return path.join(singingRoot(), 'acestep');
}

function venvPython(): string {
  // 与 DiffSinger 共用 singing 目录，但 ACE-Step 有独立 venv
  return path.join(singingRoot(), 'acestep-venv', 'Scripts', 'python.exe');
}

function repoDir(): string {
  return path.join(acestepRootDir(), 'ACE-Step-1.5');
}

async function run(
  cmd: string,
  args: string[],
  onLine?: (s: string) => void,
  timeoutMs = 30 * 60 * 1000,
): Promise<{ ok: boolean; code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    const t = setTimeout(() => { try { p.kill(); } catch { /* ignore */ } }, timeoutMs);
    p.stdout.on('data', (b) => { const s = String(b); out += s; onLine?.(s); });
    p.stderr.on('data', (b) => { const s = String(b); err += s; onLine?.(s); });
    p.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }); });
    p.on('error', (e) => { clearTimeout(t); resolve({ ok: false, code: null, out, err: err + e.message }); });
  });
}

/** 探测 venv 状态：python 是否存在、torch 是否 CUDA 版、缺哪些包。 */
async function probeVenv(py: string): Promise<{
  hasPython: boolean;
  cuda: boolean;
  torchVersion?: string;
  missing: string[];
}> {
  if (!existsSync(py)) return { hasPython: false, cuda: false, missing: ['python'] };
  const code = `
import json, importlib.util as u
need = ["torch","torchaudio","transformers","diffusers","soundfile","loguru","einops","safetensors","numba","scipy","modelscope"]
miss = [m for m in need if not u.find_spec(m)]
info = {"missing": miss}
if "torch" not in miss:
    import torch
    info["cuda"] = bool(torch.cuda.is_available())
    info["torchVersion"] = torch.__version__
else:
    info["cuda"] = False
print(json.dumps(info))
`;
  const r = await run(py, ['-c', code], undefined, 60000);
  try {
    const line = (r.out || '').trim().split('\n').filter(Boolean).pop() || '{}';
    const j = JSON.parse(line);
    return { hasPython: true, cuda: !!j.cuda, torchVersion: j.torchVersion, missing: j.missing || [] };
  } catch {
    return { hasPython: true, cuda: false, missing: ['(探测失败)'] };
  }
}

/**
 * 安装/修复 ACE-Step 运行时（幂等）。
 *
 * 顺序刻意如此：**先修 venv 再补权重** —— venv 坏了的话权重下完也用不了，
 * 而且 venv 修复（torch 版本）通常比 8.9GB 权重快，先失败早报错。
 */
export async function installAcestepRuntime(
  variant: string | undefined,
  onProgress: ProgressFn,
): Promise<InstallOutcome> {
  const root = acestepRootDir();
  const notes: string[] = [];
  const py = venvPython();

  try {
    // ── 1. venv 与依赖 ──
    if (!existsSync(py)) {
      onProgress('创建 Python 虚拟环境…', 2);
      const base = process.env.YZ_PYTHON || singingPython();
      const venvDir = path.join(singingRoot(), 'acestep-venv');
      const r = await run(base, ['-m', 'venv', venvDir]);
      if (!r.ok) {
        return { ok: false, error: `创建 venv 失败：${(r.err || r.out).slice(-400)}` };
      }
      notes.push('已创建 venv');
    }

    let probe = await probeVenv(py);

    // 1a. CUDA 版 torch（★ 坑 1：默认 pip 装的是 CPU 版）
    const needTorch = probe.missing.includes('torch') || !probe.cuda;
    if (needTorch) {
      const why = probe.missing.includes('torch') ? '未安装' : `当前是 CPU 版（${probe.torchVersion}）`;
      onProgress(`安装 CUDA 版 PyTorch（${why}）…`, 6);
      const pipArgs = [
        '-m', 'pip', 'install', '--force-reinstall',
        'torch==2.7.1', 'torchvision==0.22.1', 'torchaudio==2.7.1',
        '--index-url', 'https://download.pytorch.org/whl/cu128',
      ];
      const r = await run(py, pipArgs, (s) => {
        if (/Downloading|Installing/.test(s)) onProgress('下载 PyTorch CUDA 轮子…', 10);
      }, 60 * 60 * 1000);
      // ★ 沙箱/杀软可能在卸载旧包报错，但只要新包装上了就算成功 —— 用探测确认
      const after = await probeVenv(py);
      if (!after.cuda) {
        return {
          ok: false,
          error:
            `PyTorch CUDA 版安装后仍未启用显卡。\n` +
            `pip 输出末尾：${(r.err || r.out).slice(-500)}\n` +
            `手动修复：${py} -m pip install --force-reinstall torch==2.7.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128`,
        };
      }
      notes.push(`PyTorch 已升级为 CUDA 版（${after.torchVersion}）`);
      probe = after;
    } else {
      notes.push(`PyTorch 已是 CUDA 版（${probe.torchVersion}）`);
    }

    // 1b. torchaudio 必须与 torch 同版本（★ 坑 2：版本错配 WinError 127）
    const taCheck = await run(py, ['-c', 'import torchaudio; print(torchaudio.__version__)'], undefined, 60000);
    if (!taCheck.ok) {
      onProgress('修复 torchaudio 版本…', 20);
      await run(py, ['-m', 'pip', 'install', '--force-reinstall', 'torchaudio==2.7.1',
        '--index-url', 'https://download.pytorch.org/whl/cu128', '--no-deps'], undefined, 20 * 60 * 1000);
      notes.push('已重装 torchaudio==2.7.1');
    }

    // 1c. 其余依赖（国内源优先）
    const stillMissing = (await probeVenv(py)).missing.filter((m) => m !== 'torch' && m !== 'torchaudio');
    if (stillMissing.length) {
      onProgress(`安装依赖（${stillMissing.slice(0, 3).join('/')}…）`, 26);
      const pkgs = ['transformers>=4.51.0,<4.58.0', 'diffusers', 'soundfile', 'loguru', 'einops',
        'safetensors', 'numba', 'scipy', 'modelscope', 'toml', 'xxhash', 'vector-quantize-pytorch',
        'accelerate', 'fastapi', 'uvicorn[standard]', 'python-multipart'];
      let lastErr = '';
      let done = false;
      for (const src of cnFirst(PIP_SOURCES)) {
        const r = await run(py, ['-m', 'pip', 'install', ...pkgs, '-i', src.url, '--disable-pip-version-check'], undefined, 30 * 60 * 1000);
        if (r.ok) { done = true; notes.push(`依赖已从 ${src.label} 安装`); break; }
        lastErr = `${src.label}: ${(r.err || r.out).slice(-300)}`;
      }
      if (!done) return { ok: false, error: `依赖安装失败（已尝试 ${PIP_SOURCES.length} 个源）：${lastErr}` };
    } else {
      notes.push('依赖已齐全');
    }

    // ── 2. 源码 ──
    if (!existsSync(repoDir())) {
      onProgress('下载 ACE-Step 源码（30MB）…', 40);
      await mkdir(root, { recursive: true });
      const ghSources = [
        'https://gh-proxy.com/https://github.com/ACE-Step/ACE-Step-1.5',
        'https://ghfast.top/https://github.com/ACE-Step/ACE-Step-1.5',
        'https://github.com/ACE-Step/ACE-Step-1.5',
      ];
      let cloned = false;
      for (const url of ghSources) {
        const r = await run('git', ['clone', '--depth', '1', url, repoDir()], undefined, 10 * 60 * 1000);
        if (r.ok) { cloned = true; break; }
      }
      if (!cloned) {
        return { ok: false, error: 'ACE-Step 源码克隆失败（三个源均不可用）。可手动 git clone 到 ' + repoDir() };
      }
      notes.push('源码已下载');
    } else {
      notes.push('源码已存在');
    }

    // ── 3. 权重 ──
    const missingDirs = Object.entries(REQUIRED)
      .filter(([flat, file]) => !existsSync(path.join(root, flat, file)))
      .map(([flat]) => flat);

    if (missingDirs.length && variant === 'weights-only') {
      // 只装权重模式（venv 已就绪时用）
      notes.push(`待下载权重：${missingDirs.join(', ')}`);
    }

    if (missingDirs.length) {
      onProgress(`下载模型权重（${missingDirs.join('/')}，约 6GB）…`, 50);
      const dl = await downloadWeights(root, missingDirs, (msg, p) => onProgress(msg, 50 + p * 0.45));
      if (!dl.ok) return { ok: false, error: dl.error, notes };
      notes.push(...(dl.notes || []));
    } else {
      notes.push('模型权重已齐全');
    }

    // ── 4. checkpoints 布局 + VAE 兼容名（★ 坑 3/4）──
    onProgress('适配目录结构与文件名…', 97);
    const layout = await ensureLayout(root);
    notes.push(...layout);

    // ── 5. 终检 ──
    onProgress('自检…', 99);
    const final = await probeVenv(py);
    if (!final.cuda) return { ok: false, error: '自检失败：torch 仍未启用 CUDA', notes };
    if (missingDirs.length === 0 && !existsSync(path.join(root, 'checkpoints', 'acestep-v15-turbo', 'model.safetensors'))) {
      return { ok: false, error: '自检失败：checkpoints 布局不完整', notes };
    }

    return { ok: true, notes, path: root };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), notes };
  }
}

/**
 * 下载权重（国内优先：ModelScope → hf-mirror → HF）。
 *
 * ★ 只下**缺的那几份**：本机已有 8.9GB 时这里一次网络请求都不会发。
 * ★ 断点续传：服务器支持 Range 就续传；返回 200（忽略 Range）就截断重下，
 *   否则会拼出损坏文件（这个坑在 music-sing-install.ts 里踩过，此处照搬教训）。
 */
async function downloadWeights(
  root: string,
  dirs: string[],
  onProgress: (msg: string, p: number) => void,
): Promise<{ ok: boolean; error?: string; notes?: string[] }> {
  const notes: string[] = [];
  // 每个扁平目录要下的文件清单（与官方仓库一致）
  const FILES: Record<string, string[]> = {
    turbo: ['config.json', 'model.safetensors', 'configuration_acestep_v15.py', 'modeling_acestep_v15_turbo.py', 'silence_latent.pt'],
    vae: ['config.json', 'model.safetensors'],
    qwen: ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt', 'special_tokens_map.json', 'added_tokens.json'],
    lm: ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt', 'special_tokens_map.json', 'added_tokens.json', 'chat_template.jinja'],
  };
  // 仓库内的子路径（hf 仓库里权重在各自子目录下）
  const SUBPATH: Record<string, string> = {
    turbo: 'checkpoints/acestep-v15-turbo',
    vae: 'checkpoints/vae',
    qwen: 'checkpoints/Qwen3-Embedding-0.6B',
    lm: 'checkpoints/acestep-5Hz-lm-1.7B',
  };

  const total = dirs.reduce((s, d) => s + (FILES[d]?.length || 0), 0);
  let done = 0;

  for (const flat of dirs) {
    const targetDir = path.join(root, flat);
    await mkdir(targetDir, { recursive: true });
    const files = FILES[flat] || [];
    const sub = SUBPATH[flat] || '';

    // ★ 大多数字段直接放在模型根，只有 safetensors 在 checkpoints/<name>/ 下 ——
    //   实际仓库结构以 ModelScope 为准，这里对两种情况都试一遍。
    for (const f of files) {
      const dest = path.join(targetDir, f);
      if (existsSync(dest)) { done++; continue; }
      const candidates = [
        `${sub}/${f}`,
        f,
      ];
      let ok = false;
      let lastErr = '';
      for (const src of cnFirst(HF_MODEL_SOURCES)) {
        for (const rel of candidates) {
          const url = src.url.replace('{repo}', REPO).replace('{file}', rel);
          const r = await fetchWithResume(url, dest);
          if (r.ok) { ok = true; break; }
          lastErr = `${src.label}(${rel}): ${r.error}`;
          if (r.error?.includes('404')) continue; // 换路径试
        }
        if (ok) break;
      }
      if (!ok) {
        return { ok: false, error: `下载 ${flat}/${f} 失败：${lastErr}`, notes };
      }
      done++;
      onProgress(`下载 ${flat}/${f}（${done}/${total}）…`, done / Math.max(1, total));
    }
    notes.push(`${flat} 已就绪`);
  }
  return { ok: true, notes };
}

/** 带断点续传的单文件下载。 */
async function fetchWithResume(url: string, dest: string): Promise<{ ok: boolean; error?: string }> {
  const { stat, createWriteStream } = await import('node:fs');
  let start = 0;
  try { start = (await new Promise<number>((res, rej) => stat(dest, (e, s) => (e ? rej(e) : res(s.size))))); } catch { start = 0; }
  const headers: Record<string, string> = {};
  if (start > 0) headers.Range = `bytes=${start}-`;
  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: 'follow' });
  } catch (e: unknown) {
    return { ok: false, error: `${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.status === 404) return { ok: false, error: '404' };
  if (!res.ok && res.status !== 206) return { ok: false, error: `HTTP ${res.status}` };
  const append = res.status === 206 && start > 0;
  if (!res.body) return { ok: false, error: '响应体为空' };
  // ★ 服务器忽略 Range（返回 200）时必须截断重下，不能追加 —— 否则文件损坏
  const ws = createWriteStream(dest, { flags: append ? 'a' : 'w' });
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) ws.write(Buffer.from(value));
    }
  } catch (e: unknown) {
    await new Promise<void>((r) => ws.end(r));
    return { ok: false, error: `中断：${e instanceof Error ? e.message : String(e)}` };
  }
  await new Promise<void>((r) => ws.end(r));
  return { ok: true };
}

/** 建 checkpoints 布局（junction）+ VAE 兼容名（硬链接）。 */
async function ensureLayout(root: string): Promise<string[]> {
  const notes: string[] = [];
  const ckpt = path.join(root, 'checkpoints');
  await mkdir(ckpt, { recursive: true });

  for (const [flat, canon] of Object.entries(FLAT_TO_CANON)) {
    const src = path.join(root, flat);
    const dst = path.join(ckpt, canon);
    if (!existsSync(src) || existsSync(dst)) continue;
    try {
      // Windows 用 junction（不需要管理员权限）
      const r = await run('cmd', ['/c', 'mklink', '/J', dst, src]);
      if (r.ok) notes.push(`映射 ${flat} → checkpoints/${canon}`);
      else throw new Error(r.err || 'mklink failed');
    } catch {
      notes.push(`无法建目录联接（${flat}），bridge 启动时会再试`);
    }
  }

  // ★ 坑 3：diffusers 找 diffusion_pytorch_model.safetensors
  const vaeDir = path.join(ckpt, 'vae');
  const alias = path.join(vaeDir, 'diffusion_pytorch_model.safetensors');
  const orig = path.join(vaeDir, 'model.safetensors');
  if (!existsSync(alias) && existsSync(orig)) {
    try {
      await link(orig, alias);
      notes.push('VAE 兼容名已建（硬链接）');
    } catch {
      try {
        await copyFile(orig, alias);
        notes.push('VAE 兼容名已建（复制）');
      } catch (e: unknown) {
        notes.push(`VAE 兼容名失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return notes;
}
