// 歌声合成运行时安装器 —— 让「国内也能装上」这件事变成一条可复现的流程。
//
// ★★★ 为什么必须做安装器（2026-10-21 用户：「国内都能下载吗？」）：
//   模型 256MB 只在 GitHub Release，国内直连基本不通。硬编码一个源 = 一部分用户永远装不上。
//   所以这里做**多镜像自动回退 + 断点续传 + 本地导入**，并把推理代码内置进仓库（那 200KB 不用下）。
//
// 运行时布局（%APPDATA%/yan-zhi/server-data/singing/）：
//   code/      内置的 MIT 推理代码
//   usr/ inference/  代码按相对路径用到的资源
//   pylibs/    pip --target 安装的依赖（不污染随包 Python）
//   model/     下载解压的模型
//   bridge.py  Node ↔ Python 的桥
//
// ★ 安全：不执行任何从网络下载的脚本；解压用 PowerShell 内置 Expand-Archive。

import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { singingRoot, diffsingerReady, singingPython } from './music-sing-diffsinger.js';

/** 模型下载源（按顺序尝试；前两个是国内常用的 GitHub 加速）。 */
const MODEL_MIRRORS = [
  'https://gh-proxy.com/https://github.com/HighCWu/DiffSinger-ONNX-Infer/releases/download/v0.1/model.zip',
  'https://ghfast.top/https://github.com/HighCWu/DiffSinger-ONNX-Infer/releases/download/v0.1/model.zip',
  'https://github.com/HighCWu/DiffSinger-ONNX-Infer/releases/download/v0.1/model.zip',
];
const PIP_MIRRORS = [
  'https://pypi.tuna.tsinghua.edu.cn/simple',
  'https://mirrors.aliyun.com/pypi/simple/',
  'https://pypi.org/simple',
];
const PIP_PACKAGES = ['numpy', 'onnxruntime', 'pypinyin', 'pyyaml', 'librosa', 'soundfile', 'tqdm'];
/** 模型 zip 合理下限（防镜像返回 HTML 错误页被当成模型）。 */
const MODEL_MIN_BYTES = 200 * 1024 * 1024;

export interface StatusResult {
  ready: boolean;
  root: string;
  hasCode: boolean;
  hasDeps: boolean;
  hasModel: boolean;
  modelMB: number;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

export async function singingStatus(): Promise<StatusResult> {
  const root = singingRoot();
  const hasCode = await exists(path.join(root, 'bridge.py'));
  const hasDeps = await exists(path.join(root, 'pylibs', 'onnxruntime'));
  const hasModel = await exists(path.join(root, 'model', 'fs2.onnx'));
  let modelMB = 0;
  if (hasModel) {
    try { modelMB = Math.round((await stat(path.join(root, 'model', 'fs2.onnx'))).size / 1048576); } catch { /* 读不到留 0 */ }
  }
  return { ready: hasCode && hasDeps && hasModel, root, hasCode, hasDeps, hasModel, modelMB };
}

/** 把仓库内置的推理代码同步到运行时目录（幂等）。 */
async function installCode(root: string): Promise<void> {
  const vendor = path.resolve(process.cwd(), 'apps', 'server', 'vendor', 'diffsinger-onnx-infer');
  await mkdir(root, { recursive: true });
  await cp(vendor, path.join(root, 'code'), { recursive: true, force: true });
  // usr/ 与 inference/：代码按**相对 cwd** 打开的资源配置
  await cp(path.join(vendor, 'usr'), path.join(root, 'usr'), { recursive: true, force: true });
  await cp(path.join(vendor, 'inference'), path.join(root, 'inference'), { recursive: true, force: true });
  await cp(path.join(vendor, 'bridge.py'), path.join(root, 'bridge.py'), { force: true });
}

/** pip 装依赖到 root/pylibs（清华 → 阿里 → 官方）。 */
async function installDeps(root: string): Promise<{ ok: boolean; error?: string }> {
  const python = singingPython();
  const target = path.join(root, 'pylibs');
  let last = '';
  for (const mirror of PIP_MIRRORS) {
    const r = await runCmd(python, [
      '-m', 'pip', 'install', '--target', target, '--upgrade',
      ...PIP_PACKAGES, '-i', mirror, '--disable-pip-version-check', '--no-warn-script-location',
    ], { timeoutMs: 900000, maxBuffer: 8 * 1024 * 1024 });
    if (r.ok && await exists(path.join(target, 'onnxruntime'))) return { ok: true };
    last = `${mirror}: ${(r.stderr || r.error).slice(-300)}`;
  }
  return { ok: false, error: `依赖安装失败（已尝试 ${PIP_MIRRORS.length} 个源）：${last}` };
}

/**
 * 断点续传下载（Node 原生 fetch，不依赖 curl）。
 * ★ 服务器忽略 Range（返回 200）时要把已有文件截断重下，否则会拼出损坏文件。
 */
async function downloadWithResume(url: string, dest: string): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  let start = 0;
  try { start = (await stat(dest)).size; } catch { /* 无旧文件 */ }
  const headers: Record<string, string> = {};
  if (start > 0) headers.Range = `bytes=${start}-`;
  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: 'follow' });
  } catch (e: unknown) {
    return { ok: false, error: `连接失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok && res.status !== 206) return { ok: false, error: `HTTP ${res.status}` };
  const append = res.status === 206 && start > 0;
  if (!res.body) return { ok: false, error: '响应体为空' };
  const out = createWriteStream(dest, { flags: append ? 'a' : 'w' });
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) out.write(Buffer.from(value));
    }
  } catch (e: unknown) {
    await new Promise<void>((resolve) => out.end(resolve));
    return { ok: false, error: `下载中断：${e instanceof Error ? e.message : String(e)}（已保留断点，可重试）` };
  }
  await new Promise<void>((resolve) => out.end(resolve));
  const size = (await stat(dest)).size;
  if (size < MODEL_MIN_BYTES) {
    return { ok: false, error: `产物过小（${Math.round(size / 1048576)}MB），镜像可能返回了错误页` };
  }
  return { ok: true, bytes: size };
}

/** 解压 model.zip 到 root（Windows 用内置 Expand-Archive）。 */
async function extractModel(root: string, zip: string): Promise<{ ok: boolean; error?: string }> {
  const r = await runCmd('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${root.replace(/'/g, "''")}' -Force`,
  ], { timeoutMs: 600000, maxBuffer: 4 * 1024 * 1024 });
  if (!r.ok) return { ok: false, error: `解压失败：${(r.stderr || r.error).slice(-300)}` };
  return (await exists(path.join(root, 'model', 'fs2.onnx')))
    ? { ok: true }
    : { ok: false, error: '解压后未找到 model/fs2.onnx（zip 结构异常）' };
}

export interface InstallResult {
  ok: boolean;
  root?: string;
  steps: string[];
  status?: StatusResult;
  error?: string;
  notes?: string[];
}

/** 安装/修复运行时（幂等：已装的部分会跳过）。 */
export async function installSingingRuntime(): Promise<InstallResult> {
  const root = singingRoot();
  const steps: string[] = [];
  const notes: string[] = [];
  try {
    await installCode(root);
    steps.push('推理代码已内置并同步');

    const status = await singingStatus();
    if (!status.hasDeps) {
      const deps = await installDeps(root);
      if (!deps.ok) return { ok: false, root, steps, error: deps.error };
      steps.push('Python 依赖已安装（清华/阿里镜像）');
    } else {
      steps.push('Python 依赖已存在，跳过');
    }

    if (!status.hasModel) {
      const zip = path.join(root, 'model.zip');
      let got = false;
      let lastErr = '';
      for (const url of MODEL_MIRRORS) {
        steps.push(`尝试下载模型：${new URL(url).host}`);
        const d = await downloadWithResume(url, zip);
        if (d.ok) { got = true; break; }
        lastErr = d.error || '未知错误';
        notes.push(`${new URL(url).host} 失败：${lastErr}`);
      }
      if (!got) {
        return {
          ok: false, root, steps, notes,
          error: `模型下载失败（已尝试 ${MODEL_MIRRORS.length} 个源）。可手动下载 model.zip 后用 action=import 导入。最后错误：${lastErr}`,
        };
      }
      const ex = await extractModel(root, zip);
      if (!ex.ok) return { ok: false, root, steps, error: ex.error };
      await rm(zip, { force: true }).catch(() => undefined);
      steps.push('模型已下载并解压');
    } else {
      steps.push('模型已存在，跳过下载');
    }

    const final = await singingStatus();
    if (!final.ready) return { ok: false, root, steps, status: final, error: '安装完成但自检未通过' };
    notes.push('模型在 Opencpop 数据集上训练，商用前请确认授权；换声库只需替换 model/ 下的 onnx 与 config.yaml');
    return { ok: true, root, steps, status: final, notes };
  } catch (e: unknown) {
    return { ok: false, root, steps, error: `安装异常：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 手动导入用户已下载的 model.zip。 */
export async function importModelZip(zipPath: string): Promise<InstallResult> {
  const root = singingRoot();
  const steps: string[] = [];
  try {
    if (!(await exists(zipPath))) return { ok: false, root, steps, error: `文件不存在：${zipPath}` };
    await installCode(root);
    steps.push('推理代码已同步');
    const ex = await extractModel(root, path.resolve(zipPath));
    if (!ex.ok) return { ok: false, root, steps, error: ex.error };
    steps.push('模型已解压');
    const status = await singingStatus();
    if (!status.hasDeps) steps.push('注意：Python 依赖尚未安装，请先执行 action=install');
    return { ok: status.ready, root, steps, status, error: status.ready ? undefined : '还缺 Python 依赖' };
  } catch (e: unknown) {
    return { ok: false, root, steps, error: `导入异常：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 供工具层判断（不触发下载）。 */
export { diffsingerReady };
