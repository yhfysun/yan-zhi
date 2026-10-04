// yt-dlp 可执行文件定位 + 按需下载安装（视频网站解析下载）。
//
// 策略：不随包，按平台从 GitHub release 按需下载到数据目录（<dataDir>/ytdlp/yt-dlp.exe）。
// Windows 的 yt-dlp.exe 是 PyInstaller 自包含可执行文件，**不需要本机 Python**；
// macOS/Linux 的对应可执行文件同样是自包含，直接可跑。
//
// 解析顺序：YZ_YTDLP_PATH（显式）> 数据目录/ytdlp > PATH。
//
// 两层开关：
//   - YZ_YTDLP_YOUTUBE=1 才允许解析 YouTube（反爬/cookie 不稳定，默认关闭，避免无谓失败）。
//   - YZ_YTDLP_PROXY 可显式指定代理（如 http://127.0.0.1:7890）；不传则读 HTTPS_PROXY/https_proxy。
import { existsSync, promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCmd, lookupOnPath } from '../services/exec-cmd.js';

export const YTDLP_BIN =
  process.platform === 'win32' ? 'yt-dlp.exe'
  : process.platform === 'darwin' ? 'yt-dlp_macos'
  : 'yt-dlp';

export interface YtdlpStatus {
  ok: boolean;
  bin: string;
  source: 'env' | 'installed' | 'path' | 'none';
  error: string;
  installDir: string;
  downloadUrl: string;
}

/** YouTube 域名开关：默认关闭（反爬 + bot 检测，常需代理/cookie），设 YZ_YTDLP_YOUTUBE=1 启用 */
export function youtubeEnabled(): boolean {
  return process.env.YZ_YTDLP_YOUTUBE === '1' || process.env.YZ_YTDLP_YOUTUBE === 'true';
}

export function isYoutubeHost(host: string): boolean {
  return /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(host);
}

/** GitHub latest release 直链（自包含可执行，无需 Python）。已验证 win32 形态。 */
export function buildDownloadUrl(): string {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
  if (process.platform === 'win32') return `${base}/yt-dlp.exe`;
  if (process.platform === 'darwin') return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp`;
}

function installDir(): string {
  const override = process.env.YZ_YTDLP_DIR?.trim();
  if (override) return path.resolve(override);
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'ytdlp');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'ytdlp');
  return path.join(path.dirname(moduleDir), 'ytdlp');
}

let cached: YtdlpStatus | null = null;

export async function resolveYtdlp(): Promise<YtdlpStatus> {
  if (cached) return cached;
  const dir = installDir();
  const base = { installDir: dir };

  const envPath = process.env.YZ_YTDLP_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    cached = { ok: true, bin: envPath, source: 'env', error: '', installDir: dir, downloadUrl: '' };
    return cached;
  }

  const installed = path.join(dir, YTDLP_BIN);
  if (existsSync(installed)) {
    cached = { ok: true, bin: installed, source: 'installed', error: '', installDir: dir, downloadUrl: '' };
    return cached;
  }

  const onPath = await lookupOnPath(YTDLP_BIN);
  if (onPath) {
    cached = { ok: true, bin: onPath, source: 'path', error: '', installDir: dir, downloadUrl: '' };
    return cached;
  }

  const url = buildDownloadUrl();
  cached = {
    ok: false,
    bin: '',
    source: 'none',
    error: `本机尚未安装 yt-dlp（视频网站解析下载需要它）。可用 media_install_ytdlp 一键下载安装，或自行放入：${dir}`,
    installDir: dir,
    downloadUrl: url,
  };
  return cached;
}

export function resetYtdlpCache(): void {
  cached = null;
}

export interface InstallResult {
  ok: boolean;
  message: string;
  dir?: string;
}

export async function installYtdlp(onProgress?: (m: string) => void): Promise<InstallResult> {
  const before = await resolveYtdlp();
  if (before.ok) return { ok: true, message: `yt-dlp 已可用（来源：${before.source}）`, dir: path.dirname(before.bin) };

  const url = buildDownloadUrl();
  const dir = installDir();
  const work = path.join(tmpdir(), `yz-ytdlp-${Date.now()}`);
  await fsp.mkdir(work, { recursive: true });
  await fsp.mkdir(dir, { recursive: true });
  try {
    onProgress?.('下载 yt-dlp 中…');
    const { downloadMediaBinary } = await import('../services/media-fetch.js');
    const buf = await downloadMediaBinary(url, 300000);
    if (!buf || buf.length < 1024) throw new Error('下载内容异常（可能网络被挡）');
    const target = path.join(dir, YTDLP_BIN);
    await fsp.writeFile(target, buf);
    if (process.platform !== 'win32') await fsp.chmod(target, 0o755);
    resetYtdlpCache();
    const after = await resolveYtdlp();
    if (!after.ok) throw new Error('安装后仍无法定位 yt-dlp');
    return { ok: true, message: 'yt-dlp 安装完成', dir };
  } catch (e: unknown) {
    return { ok: false, message: `安装失败：${e instanceof Error ? e.message : String(e)}`, dir };
  } finally {
    try {
      await fsp.rm(work, { recursive: true, force: true });
    } catch {
      /* 临时目录清理失败无碍 */
    }
  }
}

export interface YtdlpFetchResult {
  ok: boolean;
  file?: string;
  error?: string;
}

/**
 * 用 yt-dlp 解析页面链接并下载到磁盘。
 *
 * - outPrefix：不含扩展名的绝对路径；yt-dlp 用 `-o outPrefix.%(ext)s` 决定真实扩展名，
 *   下载后本函数回找 `outPrefix.*` 文件作为结果返回（避免猜测扩展名）。
 * - 走 yt-dlp 自带网络栈（不占 Node 内存，长视频合集可达数 GB），代理读 YZ_YTDLP_PROXY / HTTPS_PROXY。
 */
export async function ytdlpFetch(
  url: string,
  outPrefix: string,
  opts: { proxy?: string; timeoutMs?: number } = {},
): Promise<YtdlpFetchResult> {
  const st = await resolveYtdlp();
  if (!st.ok) return { ok: false, error: st.error };

  const proxy = opts.proxy || process.env.YZ_YTDLP_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  const args = ['-f', 'best', '-o', `${outPrefix}.%(ext)s`, '--no-playlist', '--no-warnings', '--no-overwrites'];
  if (proxy) args.push('--proxy', proxy);
  args.push(url);

  const r = await runCmd(st.bin, args, { timeoutMs: opts.timeoutMs ?? 600000, maxBuffer: 16 * 1024 * 1024 });
  if (!r.ok) {
    return { ok: false, error: (r.stderr || r.error).slice(-1500) };
  }
  const dir = path.dirname(outPrefix);
  const baseName = path.basename(outPrefix);
  try {
    const entries = await fsp.readdir(dir);
    const hit = entries.find((e) => e.startsWith(`${baseName}.`) && !e.endsWith('.part'));
    return hit
      ? { ok: true, file: path.join(dir, hit) }
      : { ok: false, error: 'yt-dlp 执行成功但未产出文件（可能该链接无法解析或受地区限制）' };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
