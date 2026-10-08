// whisper.cpp（本地 ASR）可执行文件 + 模型 定位 / 按需下载。
//
// 策略（2026-10-08，用户拍板「本地 whisper.cpp，不接云端 API」）：照搬 ffmpeg-runtime 的
// 成熟惯例 —— **不随包，按需下载到数据目录（<dataDir>/whisper），且支持用户手动放置**。
//
// 解析顺序：YZ_WHISPER_PATH（显式）> 数据目录/whisper（下载安装位＝手动放置位）> 随包 > PATH。
//
// ★★★ 为什么"自动下载"只能是尽力而为（实测结论，别改成"默认能下"）：
//   ① whisper.cpp 的**正式 release 零二进制资产** —— 实测 `releases/latest` → `v1.9.5`
//      的 `assets: []`，正文自述「Nightly build: b5454」；二进制**只在 nightly tag** 上。
//   ② nightly tag（形如 `b5454`）是**滚动的**，不能写死版本。
//   ③ 本项目开发机 GitHub **直连不可达（000）**，只有在代理启动时才通（200）。
//   三重叠加 → 下载失败是常态而非异常，**必须给"开代理/手动放置"两条明确指引**，
//   绝不允许静默降级或假装成功。
import { existsSync, promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCmd, lookupOnPath } from '../services/exec-cmd.js';

/** whisper.cpp 的 CLI 可执行名（v1.7 起由 main 改名 whisper-cli）。 */
export const WHISPER_BIN = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
/** 兼容旧版命名（部分构建里仍叫 main）。 */
const WHISPER_BIN_LEGACY = process.platform === 'win32' ? 'main.exe' : 'main';

/** 支持的模型档位与体积（用于给用户明确的下载预期）。 */
export const WHISPER_MODELS: Record<string, { sizeMB: number; note: string }> = {
  base: { sizeMB: 142, note: '轻量快速，中文效果一般' },
  small: { sizeMB: 466, note: '中文明显更好，推荐默认' },
  medium: { sizeMB: 1530, note: '中文最好但慢，质量优先时选' },
};
export const DEFAULT_WHISPER_MODEL = 'small';

/** GitHub 仓库（whisper.cpp 官方，2024 起归 ggml-org）。 */
const GH_REPO = 'ggml-org/whisper.cpp';
/** 模型文件在 HuggingFace 的仓库（官方转换版 ggml 权重）。 */
const HF_REPO = 'ggerganov/whisper.cpp';
const HF_BASE = 'https://huggingface.co';
const HF_MIRROR_BASE = 'https://hf-mirror.com';
/**
 * ★★★ 模型源优先级（2026-10-08 实测后调整，**这是本模块最重要的取舍**）：
 *   实测三个源在本机（国内网络、未开代理）的连通性：
 *     · ModelScope（国内站）  → **HTTP 200，直连可用**，148MB 实测 14 秒下完
 *     · huggingface.co        → 000（不可达）
 *     · hf-mirror.com         → 000（不可达）
 *   ⇒ 所以**首选 ModelScope**，HF 系作后备。这与"官方源优先"的直觉相反，
 *     但本项目在受限网络下，**能下到**才是硬道理（下不到等于功能不存在）。
 *   ★ 判据：源优先级必须按**实测可达性**排，不能按"官方与否"排。
 *   ★ ModelScope 的下载 URL 形态与 HF 不同（有 query 参数），见 buildModelUrls。
 */
const MS_REPO = 'cjc1887415157/whisper.cpp';
const MS_BASE = 'https://www.modelscope.cn';

export interface WhisperStatus {
  ok: boolean;
  /** whisper-cli 可执行文件绝对路径 */
  bin: string;
  /** 默认模型的 .bin 绝对路径（未下载时为空） */
  model: string;
  /** 命中来源：env / installed / bundled / path / none */
  source: 'env' | 'installed' | 'bundled' | 'path' | 'none';
  error: string;
  /** 下载安装目录（用户手动放置也可放这里） */
  installDir: string;
  /** 模型目录 */
  modelsDir: string;
}

/**
 * 纯函数：解析 nightly tag 列表，取最新的一个（形如 `b5454`）。
 *
 * ★ 为什么不打 latest：实测正式 release **零资产**，二进制只在 nightly 上。
 * ★ 为什么取"最新"而不是写死：nightly tag 滚动，写死会在旧 tag 被清理后 404。
 * 输入任意 GitHub releases 列表 JSON，返回第一个 `b<数字>` 形态的 tag；找不到返回 null。
 */
export function pickNightlyTag(releases: Array<{ tag_name?: string; assets?: unknown[] }> | null | undefined): string | null {
  if (!Array.isArray(releases)) return null;
  for (const r of releases) {
    const t = String(r?.tag_name || '').trim();
    if (/^b\d+$/.test(t) && Array.isArray(r?.assets) && r.assets.length > 0) return t;
  }
  return null;
}

/**
 * 纯函数：按平台/架构给出 whisper.cpp 二进制的**资产名**。
 * 实测资产（nightly b5454，共 12 个）里与本项目相关的：
 *   whisper-bin-x64.zip（8MB，CPU，默认选它）/ whisper-blas-bin-x64.zip（20MB 加速）/
 *   whisper-bin-Win32.zip / whisper-bin-win-cpu-arm64.zip / whisper-bin-ubuntu-{x64,arm64}.tar.gz
 * CUDA 版（271~653MB）**刻意不选**：需 N 卡且体积大，CPU 版已够字幕场景。
 */
export function buildAssetName(
  platform: NodeJS.Platform,
  arch: string,
): { asset: string; archive: 'zip' | 'targz' } | null {
  const isArm = arch === 'arm64';
  if (platform === 'win32') {
    return { asset: isArm ? 'whisper-bin-win-cpu-arm64.zip' : 'whisper-bin-x64.zip', archive: 'zip' };
  }
  if (platform === 'linux') {
    return { asset: isArm ? 'whisper-bin-ubuntu-arm64.tar.gz' : 'whisper-bin-ubuntu-x64.tar.gz', archive: 'targz' };
  }
  // macOS 官方不发预编译包（需自建）→ 明确返回 null，让上层引导用户手动放置
  return null;
}

/** 模型文件名（HuggingFace 上的命名）。 */
export function modelFileName(model: string): string {
  return `ggml-${model}.bin`;
}

/**
 * 模型下载候选源（**按实测可达性排序**，不是按"官方与否"）。
 * 实测（2026-10-08，国内网络未开代理）：ModelScope 200 / HF 000 / hf-mirror 000。
 */
export function buildModelUrls(model: string): { primary: string; mirror: string; all: Array<{ label: string; url: string }> } {
  const f = modelFileName(model);
  const ms = `${MS_BASE}/api/v1/models/${MS_REPO}/repo?Revision=master&FilePath=${f}`;
  const hf = `${HF_BASE}/${HF_REPO}/resolve/main/${f}`;
  const mirror = `${HF_MIRROR_BASE}/${HF_REPO}/resolve/main/${f}`;
  return {
    primary: ms,
    mirror: mirror,
    all: [
      { label: 'ModelScope（国内直连）', url: ms },
      { label: 'hf-mirror 镜像', url: mirror },
      { label: 'HuggingFace 官方（通常需代理）', url: hf },
    ],
  };
}

/**
 * 下载安装目录：默认数据目录下 whisper；可用 YZ_WHISPER_DIR 覆盖。
 * 与 ffmpeg-runtime 的 installDir() 同构（含"别退到仓库外"那条踩坑注释的教训）。
 */
export function installDir(): string {
  const override = process.env.YZ_WHISPER_DIR?.trim();
  if (override) return path.resolve(override);
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'whisper');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'whisper');
  return path.join(path.dirname(moduleDir), 'whisper');
}

/** 模型目录（与二进制同根，便于用户一次性放置）。 */
export function modelsDir(): string {
  return path.join(installDir(), 'models');
}

/** 在目录里找可执行文件（含旧命名 main）。返回绝对路径或 null。 */
export function findBinIn(dir: string): string | null {
  for (const name of [WHISPER_BIN, WHISPER_BIN_LEGACY]) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** 在目录里找模型文件。 */
export function findModelIn(dir: string, model = DEFAULT_WHISPER_MODEL): string | null {
  const p = path.join(dir, modelFileName(model));
  return existsSync(p) ? p : null;
}

/** 常见安装位自动发现（与 ffmpeg 同思路：dev 模式未设 DATA_DIR 时不至于全断）。 */
export function discoverKnownInstallDirs(): string[] {
  const out: string[] = [];
  const push = (p: string) => { if (p) out.push(p); };
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  if (process.platform === 'win32') {
    push(appData ? `${appData}/yan-zhi/server-data/whisper` : '');
    push(appData ? `${appData}/yan-zhi-dev/server-data/whisper` : '');
    push(localAppData ? `${localAppData}/yan-zhi/server-data/whisper` : '');
  } else if (process.platform === 'darwin') {
    push(home ? `${home}/Library/Application Support/yan-zhi/server-data/whisper` : '');
  } else {
    push(home ? `${home}/.config/yan-zhi/server-data/whisper` : '');
  }
  return out;
}

let cached: WhisperStatus | null = null;

/**
 * 解析 whisper-cli 与模型。结果缓存。
 * 不可用时 error 里**必须含可执行的补救指引**（开代理重试 / 手动放到 installDir）。
 */
export async function resolveWhisper(model = DEFAULT_WHISPER_MODEL): Promise<WhisperStatus> {
  if (cached && cached.ok) return cached;
  const dir = installDir();
  const mdir = modelsDir();
  const base = { installDir: dir, modelsDir: mdir };

  /**
   * 组装结果。
   * ★★★ `binDir`/`modelsDirOverride` 的作用（2026-10-08 实测缺陷）：
   *   二进制可能被**自动发现**到别的目录（如 `%APPDATA%/yan-zhi-dev/server-data/whisper`），
   *   而 `installDir()` 算出的却是兜底路径（`apps/server/whisper`）。
   *   此时若报错里写 installDir()，用户会**放错地方** —— 真跑时就是这么暴露的。
   *   所以：命中哪个目录，指引就必须写那个目录。
   */
  const build = (
    bin: string,
    source: WhisperStatus['source'],
    hitDir?: string,
    hitModelsDir?: string,
  ): WhisperStatus | null => {
    if (!bin) return null;
    const mDir = hitModelsDir || (hitDir ? path.join(hitDir, 'models') : mdir);
    const m = findModelIn(mDir, model) || findModelIn(hitDir || dir, model);
    if (!m) {
      const urls = buildModelUrls(model);
      cached = {
        ok: false, bin, model: '', source,
        installDir: hitDir || dir, modelsDir: mDir,
        error: `whisper-cli 已就位（${bin}），但缺少模型 ${modelFileName(model)}。`
          + `请用 whisper_install {what:"model"} 下载，或手动下载后放入：${mDir}`
          + `\n（下载地址见 whisper_install 的返回，或直接：${urls.primary}）`,
      };
      return cached;
    }
    cached = { ok: true, bin, model: m, source, installDir: hitDir || dir, modelsDir: mDir, error: '' };
    return cached;
  };

  // 1) 显式环境变量（目录或可执行文件路径）
  const envPath = process.env.YZ_WHISPER_PATH?.trim();
  if (envPath) {
    const isFile = /whisper-cli(\.exe)?$|main(\.exe)?$/i.test(envPath);
    const hit = isFile ? (existsSync(envPath) ? envPath : null) : findBinIn(envPath);
    const r = build(hit || '', 'env', hit ? path.dirname(hit) : undefined);
    if (r) return r;
  }

  // 2) 数据目录（下载安装位＝手动放置位）
  {
    const b = findBinIn(dir);
    const r = build(b || '', 'installed');
    if (r) return r;
  }

  // 3) 常见安装位自动发现（★ 命中时指引必须写这个目录，见 build 的注释）
  for (const d of discoverKnownInstallDirs()) {
    const b = findBinIn(d);
    const r = build(b || '', 'bundled', b ? d : undefined);
    if (r) return r;
  }

  // 4) 系统 PATH
  const onPath = (await lookupOnPath(WHISPER_BIN)) || (await lookupOnPath(WHISPER_BIN_LEGACY));
  if (onPath) {
    const r = build(onPath, 'path', path.dirname(onPath));
    if (r) return r;
  }

  const assets = buildAssetName(process.platform, process.arch);
  cached = {
    ok: false, bin: '', model: '', source: 'none', ...base,
    error: assets
      ? `本机尚未安装 whisper.cpp（本地语音转字幕需要它）。`
        + `可用 whisper_install 一键下载（约 8MB 二进制 + 模型），或手动把 whisper-cli 放入：${dir}`
        + `\n★ 若下载失败：本项目开发机 GitHub 直连不可达，请先启动代理后重试；`
        + `或从 whisper.cpp 的 **nightly build**（正式 release 没有二进制资产）手动下载 `
        + `${assets.asset} 解压后放入上述目录。`
      : `当前平台（${process.platform}/${process.arch}）无官方预编译二进制（macOS 需自行构建），`
        + `请手动构建 whisper-cli 后放入：${dir}`,
  };
  return cached;
}

export function resetWhisperCache(): void { cached = null; }

/** 下载（带重试；大文件经代理隧道时连接重置是常态）。 */
async function downloadWithRetry(
  url: string,
  timeoutMs: number,
  retries: number,
  onProgress?: (msg: string) => void,
): Promise<Buffer> {
  let lastErr = '';
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await runCmd('curl', ['-fsSL', '--max-time', String(Math.floor(timeoutMs / 1000)), url], {
        timeoutMs,
        maxBuffer: 256 * 1024 * 1024,
      });
      if (r.ok) return Buffer.from(r.stdout, 'binary');
      lastErr = r.stderr || r.error || 'curl 失败';
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
    if (i < retries) onProgress?.(`下载失败，重试 ${i + 1}/${retries}…`);
  }
  throw new Error(lastErr);
}

/** 递归查找文件（压缩包内目录结构不一，不做路径假设）。 */
async function findFile(root: string, fileName: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null;
  let entries: import('node:fs').Dirent[] = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === fileName.toLowerCase()) return path.join(root, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = await findFile(path.join(root, e.name), fileName, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** 解压（用系统自带工具，不引新依赖）。 */
function buildExtractCommand(archive: 'zip' | 'targz', archivePath: string, destDir: string): { cmd: string; args: string[] } {
  if (archive === 'targz') return { cmd: 'tar', args: ['-xzf', archivePath, '-C', destDir] };
  if (process.platform === 'win32') {
    return { cmd: 'powershell', args: ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`] };
  }
  return { cmd: 'unzip', args: ['-o', archivePath, '-d', destDir] };
}

export interface WhisperInstallResult { ok: boolean; message: string; dir?: string; bin?: string; model?: string; }

/**
 * 从 GitHub releases API 取最新 nightly tag。
 * 失败（离线/无代理）返回 null —— **不抛**，让上层给"手动放置"指引。
 */
async function fetchLatestNightlyTag(): Promise<string | null> {
  try {
    const r = await runCmd('curl', ['-fsSL', '--max-time', '30', `https://api.github.com/repos/${GH_REPO}/releases?per_page=20`], {
      timeoutMs: 35000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!r.ok) return null;
    return pickNightlyTag(JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

/** 安装 whisper-cli 二进制。 */
async function installBinary(onProgress?: (m: string) => void): Promise<WhisperInstallResult> {
  const assets = buildAssetName(process.platform, process.arch);
  if (!assets) {
    return { ok: false, message: `当前平台（${process.platform}/${process.arch}）无官方预编译二进制，请自行构建后放入：${installDir()}` };
  }
  const dir = installDir();
  const work = path.join(tmpdir(), `yz-whisper-${Date.now()}`);

  onProgress?.('查询最新 nightly 版本…');
  const tag = await fetchLatestNightlyTag();
  if (!tag) {
    return {
      ok: false,
      message: `无法获取 whisper.cpp 版本信息（GitHub 不可达）。`
        + `\n★ 补救：① 启动代理后重试；② 手动下载 http://github.com/${GH_REPO}/releases 里`
        + `**nightly build** 的 ${assets.asset}（正式 release 没有二进制资产），解压后把 whisper-cli 放入：${dir}`,
      dir,
    };
  }

  const url = `https://github.com/${GH_REPO}/releases/download/${tag}/${assets.asset}`;
  onProgress?.(`下载 ${assets.asset}（nightly ${tag}）…`);
  try {
    await fsp.mkdir(work, { recursive: true });
    await fsp.mkdir(dir, { recursive: true });
    const buf = await downloadWithRetry(url, 600000, 3, onProgress);
    if (buf.length < 1024) throw new Error(`下载内容异常（${buf.length} 字节）`);
    const archivePath = path.join(work, `whisper.${assets.archive === 'zip' ? 'zip' : 'tar.gz'}`);
    await fsp.writeFile(archivePath, buf);

    onProgress?.('解压中…');
    const dest = path.join(work, 'x');
    await fsp.mkdir(dest, { recursive: true });
    const cmd = buildExtractCommand(assets.archive, archivePath, dest);
    const r = await runCmd(cmd.cmd, cmd.args, { timeoutMs: 300000, maxBuffer: 32 * 1024 * 1024 });
    if (!r.ok) throw new Error(`解压失败：${r.stderr || r.error}`);

    // 压缩包内目录结构不一 → 递归找可执行文件
    const found = (await findFile(dest, WHISPER_BIN)) || (await findFile(dest, WHISPER_BIN_LEGACY));
    if (!found) throw new Error(`解压后未找到 ${WHISPER_BIN}`);

    // 复制可执行文件 + 同目录的依赖 dll/so（whisper.cpp 会带 ggml*.dll）
    const srcDir = path.dirname(found);
    const entries = await fsp.readdir(srcDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) {
        await fsp.copyFile(path.join(srcDir, e.name), path.join(dir, e.name));
      }
    }
    resetWhisperCache();
    return { ok: true, message: `whisper.cpp 已安装（nightly ${tag}）`, dir, bin: findBinIn(dir) || '' };
  } catch (e: any) {
    return {
      ok: false,
      message: `下载/解压失败：${e?.message || e}`
        + `\n★ 补救：① 启动代理后重试；② 手动下载 http://github.com/${GH_REPO}/releases 的 `
        + `**nightly build** 里的 ${assets.asset}，解压后把 whisper-cli 放入：${dir}`,
      dir,
    };
  } finally {
    try { await fsp.rm(work, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ }
  }
}

/** 下载模型（官方 HF 失败自动试镜像）。 */
async function installModel(model: string, onProgress?: (m: string) => void): Promise<WhisperInstallResult> {
  const dir = modelsDir();
  const target = path.join(dir, modelFileName(model));
  if (existsSync(target)) return { ok: true, message: `模型 ${modelFileName(model)} 已存在`, dir, model: target };

  const urls = buildModelUrls(model);
  const info = WHISPER_MODELS[model];
  onProgress?.(`下载模型 ${modelFileName(model)}（约 ${info?.sizeMB ?? '?'}MB）…`);
  try {
    await fsp.mkdir(dir, { recursive: true });
    let buf: Buffer | null = null;
    const errs: string[] = [];
    // ★ 按 buildModelUrls 的可达性顺序逐个试（ModelScope 优先，实测国内直连可用）
    for (const cand of urls.all) {
      try {
        onProgress?.(`尝试 ${cand.label}…`);
        const got = await downloadWithRetry(cand.url, 900000, 2, onProgress);
        if (got.length > 1024 * 1024) { buf = got; break; }   // 模型至少几 MB，过小视为异常
        errs.push(`${cand.label}：返回内容过小（${got.length} 字节）`);
      } catch (e: any) {
        errs.push(`${cand.label}：${e?.message || e}`);
      }
    }
    if (!buf) throw new Error(errs.join('；'));
    await fsp.writeFile(target, buf);
    resetWhisperCache();
    return { ok: true, message: `模型 ${modelFileName(model)} 已就位`, dir, model: target };
  } catch (e: any) {
    return {
      ok: false,
      message: `模型下载失败：${e?.message || e}`
        + `\n★ 补救：① 启动代理后重试；② 手动下载任一源的文件后放入：${dir}`
        + urls.all.map((c) => `\n   · ${c.label}：${c.url}`).join(''),
      dir,
    };
  }
}

/**
 * 一键安装（what: cli / model / all）。
 * ★ 任何失败都返回**带补救指引**的 message，绝不静默。
 */
export async function installWhisper(
  what: 'cli' | 'model' | 'all' = 'cli',
  model = DEFAULT_WHISPER_MODEL,
  onProgress?: (m: string) => void,
): Promise<WhisperInstallResult> {
  if (!WHISPER_MODELS[model]) {
    return { ok: false, message: `未知模型 ${model}，可选：${Object.keys(WHISPER_MODELS).join(' / ')}` };
  }
  const msgs: string[] = [];
  if (what === 'cli' || what === 'all') {
    const already = findBinIn(installDir());
    if (already) msgs.push(`whisper-cli 已存在：${already}`);
    else {
      const r = await installBinary(onProgress);
      msgs.push(r.message);
      if (!r.ok) return { ok: false, message: msgs.join('\n'), dir: r.dir };
    }
  }
  if (what === 'model' || what === 'all') {
    const r = await installModel(model, onProgress);
    msgs.push(r.message);
    if (!r.ok) return { ok: false, message: msgs.join('\n'), dir: r.dir };
  }
  const st = await resolveWhisper(model);
  return { ok: st.ok, message: msgs.join('\n'), dir: installDir(), bin: st.bin, model: st.model };
}

/**
 * 把音频/视频转成 whisper 要求的 16kHz 单声道 WAV。
 * 视频输入自动只取音轨。返回 wav 路径（临时文件，调用方负责清理）。
 */
export async function ensureWav16k(
  inputPath: string,
  ffmpegPath: string,
  outDir?: string,
): Promise<{ ok: boolean; wav: string; error?: string }> {
  const dir = outDir || path.join(tmpdir(), `yz-whisper-wav-${Date.now()}`);
  const wav = path.join(dir, 'audio16k.wav');
  try {
    await fsp.mkdir(dir, { recursive: true });
    const r = await runCmd(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-vn',                    // 丢视频轨（视频输入时只留音频）
      '-ac', '1',               // 单声道
      '-ar', '16000',           // 16kHz（whisper.cpp 要求）
      '-c:a', 'pcm_s16le',
      wav,
    ], { timeoutMs: 600000, maxBuffer: 16 * 1024 * 1024 });
    if (!r.ok) return { ok: false, wav, error: `ffmpeg 抽音轨失败：${r.stderr || r.error}` };
    if (!existsSync(wav)) return { ok: false, wav, error: 'ffmpeg 未产出音频文件' };
    return { ok: true, wav };
  } catch (e: any) {
    return { ok: false, wav, error: e?.message || String(e) };
  }
}

/**
 * 跑 whisper-cli 产出 SRT。
 * 参数用 whisper.cpp 稳定 CLI（`-m` 模型 / `--output-srt` / `-l` 语言 / `-of` 输出前缀），
 * 不依赖其内部函数名，降低版本变动风险。
 */
export async function runWhisperToSrt(opts: {
  bin: string;
  model: string;
  wav: string;
  outPrefix: string;
  language?: string;
  maxSeconds?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; srt: string; error?: string; raw?: string }> {
  const args = [
    '-m', opts.model,
    '-f', opts.wav,
    '--output-srt',
    '-of', opts.outPrefix,
    '-l', opts.language || 'zh',
    '--print-progress',
  ];
  // 截断（防长音频跑很久）：whisper.cpp 用 -d 毫秒表示"只处理前 N 毫秒"
  if (opts.maxSeconds && opts.maxSeconds > 0) args.push('-d', String(Math.floor(opts.maxSeconds * 1000)));

  const r = await runCmd(opts.bin, args, { timeoutMs: opts.timeoutMs || 1800000, maxBuffer: 32 * 1024 * 1024 });
  const srt = `${opts.outPrefix}.srt`;
  if (!existsSync(srt)) {
    return { ok: false, srt, error: `whisper 未产出 SRT。stderr: ${(r.stderr || r.error || '').slice(0, 600)}`, raw: r.stdout };
  }
  return { ok: true, srt, raw: r.stdout };
}