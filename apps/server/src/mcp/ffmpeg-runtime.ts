// ffmpeg 可执行文件定位 + 按需下载安装。
//
// 策略：不随包，按平台从官方静态构建源按需下载到数据目录（<dataDir>/ffmpeg）。
// 理由：随包要为每个平台预置二进制（体积翻几倍，且 mac/linux 构建无法在 win 上准备）；
// 按需下载一次到位，各平台各自取自己的构建。
//
// 解析顺序：YZ_FFMPEG_PATH（显式）> 数据目录/ffmpeg（下载安装位）> 随包目录（兼容）> PATH。
import { existsSync, promises as fsp } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FFMPEG_BIN = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
export const FFPROBE_BIN = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

export interface FfmpegStatus {
  ok: boolean;
  ffmpeg: string;
  ffprobe: string;
  /** 命中来源：env(显式配置) / installed(已下载) / bundled(随包) / path(系统 PATH) / none */
  source: 'env' | 'installed' | 'bundled' | 'path' | 'none';
  error: string;
  /** 当前平台可用的下载源；无源时为空串 */
  downloadUrl: string;
  /** 下载安装目录（用户手动放置也可放这里） */
  installDir: string;
}

/**
 * 纯函数：按平台给出 ffmpeg 静态构建下载地址。
 * - win32：gyan.dev release-essentials.zip（含 ffmpeg + ffprobe）
 * - darwin：evermeet.cx（ffmpeg 与 ffprobe 是两个独立包，主地址给 ffmpeg，probe 另给）
 * - linux：johnvansickle.com 静态构建 tar.xz
 * 注意：win32 已端到端实测；darwin / linux 两条**未在本机验证**（开发机为 Windows）。
 */
export function buildDownloadUrl(
  platform: NodeJS.Platform,
  arch: string,
): { url: string; archive: 'zip' | 'tarxz'; extraProbe?: { url: string; archive: 'zip' | 'tarxz' } } | null {
  if (platform === 'win32') {
    return { url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', archive: 'zip' };
  }
  if (platform === 'darwin') {
    return {
      url: 'https://evermeet.cx/ffmpeg/getrelease/zip',
      archive: 'zip',
      extraProbe: { url: 'https://evermeet.cx/ffprobe/getrelease/zip', archive: 'zip' },
    };
  }
  if (platform === 'linux') {
    const a = arch === 'arm64' ? 'arm64' : 'amd64';
    return { url: `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${a}-static.tar.xz`, archive: 'tarxz' };
  }
  return null;
}

/** 纯函数：解压命令（用系统自带工具，不引新依赖）。 */
export function buildExtractCommand(archive: 'zip' | 'tarxz', archivePath: string, destDir: string): { cmd: string; args: string[] } {
  if (archive === 'tarxz') return { cmd: 'tar', args: ['-xJf', archivePath, '-C', destDir] };
  if (process.platform === 'win32') {
    return {
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`],
    };
  }
  return { cmd: 'unzip', args: ['-o', archivePath, '-d', destDir] };
}

/**
 * 纯函数：从「当前模块目录」向上找 ffmpeg 的候选目录（仅兼容随包形态）。
 *
 * 打包实测层数：模块在 <安装目录>/resources/server/dist/apps/server/src/mcp，
 * 若随包则 ffmpeg 在 <安装目录>/resources/ffmpeg —— 从 mcp 往上要 **7 层**。
 * 这里取 8 层留余量。搜索深度不足会表现为「打包版找不到、dev 正常」——最难查的一类问题。
 */
export function buildBundledCandidates(moduleDir: string): string[] {
  const out: string[] = [];
  let cur = path.resolve(moduleDir);
  for (let i = 0; i < 8; i++) {
    out.push(path.join(cur, 'ffmpeg'));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return out;
}

function firstExisting(dirs: string[]): { ffmpeg: string; ffprobe: string } | null {
  for (const dir of dirs) {
    const f = path.join(dir, FFMPEG_BIN);
    const p = path.join(dir, FFPROBE_BIN);
    if (existsSync(f) && existsSync(p)) return { ffmpeg: f, ffprobe: p };
  }
  return null;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(err ? stderr || err.message : stdout) });
    });
  });
}

function lookupOnPath(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, [file], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const first = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      resolve(first && existsSync(first) ? first : null);
    });
  });
}

let cached: FfmpegStatus | null = null;

/**
 * 下载安装目录：默认数据目录下 ffmpeg；可用 YZ_FFMPEG_DIR 覆盖。
 *
 * 为什么不直接 import db.js 取 dataDir：那会把 better-sqlite3 拖进一个纯路径解析器
 * （耦合过重，且让本模块无法在不起库的情况下单测/冒烟）。这里只依赖 DATA_DIR 环境变量，
 * 与 db.ts 的取法保持一致。
 */
/**
 * 下载安装目录：默认数据目录下 ffmpeg；可用 YZ_FFMPEG_DIR 覆盖。
 *
 * 为什么不直接 import db.js 取 dataDir：那会把 better-sqlite3 拖进一个纯路径解析器
 * （耦合过重，且让本模块无法在不起库的情况下单测/冒烟）。
 *
 * 兜底必须与 db.ts 的 dataDir 推导保持一致：db.ts 是 `process.env.DATA_DIR || path.join(__dirname, '..')`，
 * 而本模块编译后在 `<repo>/apps/server/dist/apps/server/src/mcp/`，`__dirname/..` 即 `.../src`。
 * 往上两级（src → server → dist-copy 的 apps 层）实际对应源码树的 `apps/server`。
 * ⚠️ 曾写成「向上溯源 8 层」，结果落到仓库外的上级目录（`Desktop/github/ffmpeg`）——
 * 会把 196MB 下到别的项目旁边，且因为 bundled 兜底存在而**不报错**，极难发现。
 */
function installDir(): string {
  const override = process.env.YZ_FFMPEG_DIR?.trim();
  if (override) return path.resolve(override);
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'ffmpeg');
  // 与 db.ts 的 `__dirname/..` 对齐：定位到 apps/server（含 src 与 dist 两种形态）
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  // moduleDir 形如 <root>/apps/server/dist/apps/server/src/mcp 或 <root>/apps/server/src/mcp
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'ffmpeg');
  // 兜底：退到模块目录的父级（不退到仓库外）
  return path.join(path.dirname(moduleDir), 'ffmpeg');
}

/** 解析 ffmpeg / ffprobe。结果缓存；不可用时 error 与 downloadUrl 供上层构造「一键下载」引导。 */
export async function resolveFfmpeg(): Promise<FfmpegStatus> {
  if (cached) return cached;
  const dir = installDir();
  const base = { installDir: dir };

  // 1) 显式环境变量（目录或可执行文件路径）
  const envPath = process.env.YZ_FFMPEG_PATH?.trim();
  if (envPath) {
    const looksLikeBin = !existsSync(path.join(envPath, FFMPEG_BIN)) && /ffmpeg(\.exe)?$/i.test(envPath);
    const hit = firstExisting([looksLikeBin ? path.dirname(envPath) : envPath]);
    if (hit) {
      cached = { ok: true, ...hit, source: 'env', error: '', downloadUrl: '', ...base };
      return cached;
    }
  }

  // 2) 数据目录（按需下载的安装位）
  const installed = firstExisting([dir]);
  if (installed) {
    cached = { ok: true, ...installed, source: 'installed', error: '', downloadUrl: '', ...base };
    return cached;
  }

  // 3) 随包目录（兼容历史/自定义打包形态）
  const bundled = firstExisting(buildBundledCandidates(path.dirname(fileURLToPath(import.meta.url))));
  if (bundled) {
    cached = { ok: true, ...bundled, source: 'bundled', error: '', downloadUrl: '', ...base };
    return cached;
  }

  // 4) 系统 PATH
  const onPath = await lookupOnPath(FFMPEG_BIN);
  if (onPath) {
    const probe = (await lookupOnPath(FFPROBE_BIN)) || path.join(path.dirname(onPath), FFPROBE_BIN);
    cached = { ok: true, ffmpeg: onPath, ffprobe: probe, source: 'path', error: '', downloadUrl: '', ...base };
    return cached;
  }

  const d = buildDownloadUrl(process.platform, process.arch);
  cached = {
    ok: false, ffmpeg: '', ffprobe: '', source: 'none',
    error: d
      ? `本机尚未安装 ffmpeg（媒体合成需要它）。可用 media_install_ffmpeg 一键下载安装，或自行放入：${dir}`
      : `本机尚未安装 ffmpeg，且当前平台（${process.platform}/${process.arch}）无自动下载源，请自行安装并加入 PATH`,
    downloadUrl: d?.url || '',
    ...base,
  };
  return cached;
}

export function resetFfmpegCache(): void { cached = null; }

/** 递归查找文件（各平台压缩包内目录结构不一，不做路径假设）。 */
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

export interface InstallResult { ok: boolean; message: string; dir?: string; }

/**
 * 带重试的下载。
 * 大文件（ffmpeg 静态构建 100MB+）经代理隧道传输时连接被重置是常态，一次失败即放弃太脆。
 * 注意：这里不做断点续传（需要服务端 Range 支持且实现复杂），靠重试覆盖瞬时故障；
 * 若网络持续不可用，最终会明确报错而不是无限重试。
 */
async function downloadWithRetry(url: string, timeoutMs: number, attempts = 3, onProgress?: (m: string) => void): Promise<Buffer> {
  const { downloadMediaBinary } = await import('../services/media-fetch.js');
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const buf = await downloadMediaBinary(url, timeoutMs);
      if (buf && buf.length > 0) return buf;
      lastErr = new Error('下载到空内容');
    } catch (e: unknown) {
      lastErr = e;
      if (i < attempts) onProgress?.(`下载中断，重试 ${i}/${attempts - 1}…`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * 按需下载并安装 ffmpeg 到数据目录。
 * 已在任意来源可用时直接返回成功（幂等）；下载 → 解压 → 取二进制 → 就位。
 */
export async function installFfmpeg(onProgress?: (msg: string) => void): Promise<InstallResult> {
  const before = await resolveFfmpeg();
  if (before.ok) return { ok: true, message: `ffmpeg 已可用（来源：${before.source}）`, dir: path.dirname(before.ffmpeg) };

  const src = buildDownloadUrl(process.platform, process.arch);
  if (!src) return { ok: false, message: `当前平台（${process.platform}/${process.arch}）没有自动下载源，请手动安装 ffmpeg 并加入 PATH` };

  const dir = installDir();
  const work = path.join(tmpdir(), `yz-ffmpeg-${Date.now()}`);
  await fsp.mkdir(work, { recursive: true });
  await fsp.mkdir(dir, { recursive: true });

  try {
    const archives: Array<{ url: string; archive: 'zip' | 'tarxz' }> = [{ url: src.url, archive: src.archive }];
    if (src.extraProbe) archives.push({ url: src.extraProbe.url, archive: src.extraProbe.archive });

    const found: Array<{ name: string; file: string }> = [];
    for (let i = 0; i < archives.length; i++) {
      const a = archives[i];
      onProgress?.(`下载中（${i + 1}/${archives.length}）…`);
      // 大文件必须带重试：经代理隧道传输时 ECONNRESET 属常态
      const buf = await downloadWithRetry(a.url, 900000, 3, onProgress);
      if (buf.length < 1024) throw new Error(`下载内容异常（${buf.length} 字节）`);
      const archivePath = path.join(work, `pkg-${i}.${a.archive === 'zip' ? 'zip' : 'tar.xz'}`);
      await fsp.writeFile(archivePath, buf);

      onProgress?.('解压中…');
      const destDir = path.join(work, `x-${i}`);
      await fsp.mkdir(destDir, { recursive: true });
      const cmd = buildExtractCommand(a.archive, archivePath, destDir);
      const r = await run(cmd.cmd, cmd.args, 900000);
      if (!r.ok) throw new Error(`解压失败：${r.out.slice(-300)}`);

      for (const bin of [FFMPEG_BIN, FFPROBE_BIN]) {
        if (found.some((f) => f.name === bin)) continue;
        const f = await findFile(destDir, bin);
        if (f) found.push({ name: bin, file: f });
      }
    }

    const missing = [FFMPEG_BIN, FFPROBE_BIN].filter((b) => !found.some((f) => f.name === b));
    if (missing.length) throw new Error(`压缩包内未找到：${missing.join(', ')}`);

    for (const f of found) {
      const target = path.join(dir, f.name);
      await fsp.copyFile(f.file, target);
      if (process.platform !== 'win32') await fsp.chmod(target, 0o755);
    }

    resetFfmpegCache();
    const after = await resolveFfmpeg();
    if (!after.ok) throw new Error('安装后仍无法定位 ffmpeg');
    return { ok: true, message: `ffmpeg 安装完成（${found.length} 个可执行文件）`, dir };
  } catch (e: unknown) {
    return { ok: false, message: `安装失败：${e instanceof Error ? e.message : String(e)}`, dir };
  } finally {
    try { await fsp.rm(work, { recursive: true, force: true }); } catch { /* 临时目录清理失败无碍 */ }
  }
}