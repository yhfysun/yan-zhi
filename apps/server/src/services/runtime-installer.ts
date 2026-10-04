// 运行时 / 工具依赖的自安装框架 —— 把 ffmpeg 那套「探测 → 提示 → 下载 → 校验 → 重试」
// 抽象成通用能力，并落实用户拍板的**体积策略**（2026-09-27 方案 §八 第 5 条）：
//
//   ≤ 50MB  静默自动下载（用户不必为「装个 3MB 的启动器」再点一次确认）
//   >  50MB 必须确认（大文件占带宽/磁盘，且可能是用户不想要的）
//
// 为什么要有「体积」这个中间量，而不是一律确认或一律静默：
//   · 一律确认 → 每次连个 MCP 都要用户点「同意下载 2MB 的包」，噪音大到用户会习惯性点同意，
//     确认本身就失去意义（安全提示被训练成盲点）；
//   · 一律静默 → 100MB+ 的二进制（ffmpeg / Chromium）静默下载会占用大量带宽与磁盘，
//     用户看到磁盘少了几个 G 却不知道是谁干的。
//   所以阈值不是「保守/激进」的取舍，而是让**确认只留给真正需要确认的事**。
//
// ★ 阈值可配：YZ_INSTALL_SILENT_MAX_MB（默认 50）。给运维/企业环境留一个收紧或放宽的口子。
// ★ 本模块只做「判定 + 探测 + 计划」，**不做系统级安装**（apt/winget/注册表）：那类动作
//   需要提权且不可逆，一律降级为「给用户明确的手动指引」。能自动装的只有
//   「下载压缩包 → 解压 → 放到数据目录」这一种形态（与 ffmpeg 同构，幂等、可删）。

import path from 'node:path';
import { existsSync } from 'node:fs';
import { runCmd, lookupOnPath } from './exec-cmd.js';

/** 静默下载的体积上限（字节）。默认 50MB，可用 YZ_INSTALL_SILENT_MAX_MB 覆盖。 */
export const DEFAULT_SILENT_MAX_BYTES = 50 * 1024 * 1024;

/** 解析静默阈值（MB → 字节）。非法值回落默认值，绝不因为环境变量写错就变成「一律静默」。 */
export function resolveSilentMaxBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env.YZ_INSTALL_SILENT_MAX_MB ?? '').trim();
  if (!raw) return DEFAULT_SILENT_MAX_BYTES;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_SILENT_MAX_BYTES;
  // 上限 10GB：再大会溢出成奇怪的数（且本身也不合理）
  return Math.min(mb, 10 * 1024) * 1024 * 1024;
}

export type InstallDecision = 'silent' | 'confirm' | 'manual';

export interface InstallPolicy {
  decision: InstallDecision;
  /** 已知体积（bytes）；未知体积时为 null */
  bytes: number | null;
  /** 判定依据（回显给用户/模型，让「为什么这次没问我」是可解释的） */
  reason: string;
}

/**
 * 体积 → 安装策略。
 *
 * ★ 未知体积一律 **confirm**（不是 silent）：
 *   「不知道多大」绝不能当成「很小」—— 静默下载一个体积未知的东西正是要防的事。
 *   宁可多问一次，也不要在用户不知情时拉一个可能上百 MB 的包。
 */
export function decideInstallPolicy(bytes: number | null | undefined, opts?: { manual?: boolean; silentMaxBytes?: number }): InstallPolicy {
  const max = opts?.silentMaxBytes ?? resolveSilentMaxBytes();
  if (opts?.manual) {
    return { decision: 'manual', bytes: bytes ?? null, reason: '该依赖需要系统级安装（提权/不可逆），只能给出手动指引' };
  }
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return { decision: 'confirm', bytes: null, reason: '体积未知，按需用户确认后再下载' };
  }
  if (bytes <= max) {
    return {
      decision: 'silent',
      bytes,
      reason: `约 ${formatBytes(bytes)}，不超过静默阈值 ${formatBytes(max)}，可静默安装`,
    };
  }
  return {
    decision: 'confirm',
    bytes,
    reason: `约 ${formatBytes(bytes)}，超过静默阈值 ${formatBytes(max)}，需用户确认`,
  };
}

/** 人类可读体积（判据与提示文案共用，避免两处各写一套舍入） */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── 命令探测 ────────────────────────────────────────────────────────────

/** 在 PATH 上查命令是否存在（where / which）。返回绝对路径或 null。 */
export function probeCommand(file: string): Promise<string | null> {
  if (!file || /[\\/]/.test(file)) {
    // 带分隔符 = 显式路径：直接判存在性，查 PATH 反而查不到
    return Promise.resolve(existsSync(file) ? path.resolve(file) : null);
  }
  return lookupOnPath(file);
}

/** 自动拉包的启动器（它们本身就负责按需下载包，不需要我们预装包本体） */
export const AUTO_PULL_LAUNCHERS = ['npx', 'pnpm', 'yarn', 'bunx', 'uvx', 'uv', 'pipx'] as const;

/**
 * 解析 MCP 配置的启动器：command 是否可用 + 是否属于「自动拉包型」。
 *
 * ★ 为什么单独判「自动拉包型」：`npx -y @scope/server` 这类命令**天然就是自安装**的 ——
 *   npx 首次运行会把包拉到缓存。此时「包不在本机」不是错误，用户不该被要求先手动装包。
 *   真正需要拦的是「启动器本身都没有」（连 npx 都没装）。
 */
export async function precheckMcpCommand(command: string): Promise<{
  command: string;
  available: boolean;
  resolvedPath: string | null;
  /** 是否属于自动拉包型启动器（装好启动器即可，包本体不用预装） */
  autoPull: boolean;
  /** 给出建议时的提示文本（不可用时） */
  hint: string;
}> {
  const cmd = String(command || '').trim();
  if (!cmd) {
    return { command: '', available: false, resolvedPath: null, autoPull: false, hint: 'MCP 配置缺少 command' };
  }
  const base = path.basename(cmd).replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
  const autoPull = (AUTO_PULL_LAUNCHERS as readonly string[]).includes(base);
  const resolved = await probeCommand(cmd);
  if (resolved) {
    return {
      command: cmd,
      available: true,
      resolvedPath: resolved,
      autoPull,
      hint: autoPull
        ? '启动器已就绪：首次连接时会由它自动拉取包（无需预装包本体）。'
        : '命令已就绪。',
    };
  }
  return {
    command: cmd,
    available: false,
    resolvedPath: null,
    autoPull,
    hint: autoPull
      ? `未找到 ${cmd}。它是自动拉包型启动器，装好它即可（例如安装 Node.js 自带 npx，或安装 Python 后 pip install uv 得到 uvx）。`
      : `未找到命令 ${cmd}。请确认它已安装并加入 PATH，或改用一个存在的可执行文件。`,
  };
}

// ── 已知依赖的「安装计划」────────────────────────────────────────────────

export type InstallKind = 'archive' | 'npm-package' | 'manual';

export interface InstallPlan {
  /** 依赖标识（ffmpeg / <npm 包名> …） */
  id: string;
  kind: InstallKind;
  /** 计划动作：silent=可直接装；confirm=先问用户；manual=只能手动 */
  decision: InstallDecision;
  /** 预估体积（bytes）；null = 未知（→ confirm） */
  estimatedBytes: number | null;
  /** 面向用户/模型的说明（含体积与为什么） */
  reason: string;
  /** 可直接执行的动作描述（kind=archive 时为下载源；kind=npm-package 时为 npx 命令） */
  action: string;
}

/**
 * 已知依赖的体积表（保守估计，只为「要不要问用户」服务，不追求精确）。
 *
 * ★ 为什么不联网查（npm registry 的 dist.unpackedSize 确实可查）：
 *   预检必须**快且离线可用** —— 用户保存 MCP 配置时同步等一次 registry 请求，
 *   网络一慢就变成「保存配置卡住」。宁可估个偏大的数（偏大 → 多问一次，安全侧）。
 *   ffmpeg 用实测值（win32 essentials 包约 100MB）。
 */
const KNOWN_SIZES: Record<string, number> = {
  ffmpeg: 100 * 1024 * 1024,
  '@modelcontextprotocol/server-filesystem': 3 * 1024 * 1024,
  '@modelcontextprotocol/server-memory': 2 * 1024 * 1024,
  '@modelcontextprotocol/server-everything': 4 * 1024 * 1024,
  '@modelcontextprotocol/server-sequential-thinking': 2 * 1024 * 1024,
  '@playwright/mcp': 30 * 1024 * 1024,
  'playwright-chromium': 180 * 1024 * 1024,
  uv: 15 * 1024 * 1024,
};

/** 查已知体积（前缀匹配，兼容带版本号/子路径的写法）；未知返回 null */
export function knownSizeOf(name: string): number | null {
  const s = String(name || '').trim();
  if (!s || !(s in KNOWN_SIZES)) return null;
  return KNOWN_SIZES[s];
}

/**
 * 为一个依赖生成安装计划（不执行）。
 *
 * 判定链：系统级 → manual；npm 包 → 按体积走 silent/confirm；压缩包 → 按体积走 silent/confirm。
 */
export function planInstall(
  id: string,
  opts?: { kind?: InstallKind; bytes?: number | null; action?: string; manual?: boolean },
): InstallPlan {
  const kind = opts?.kind ?? 'archive';
  const bytes = opts?.bytes !== undefined ? opts.bytes : knownSizeOf(id);
  const policy = decideInstallPolicy(bytes, { manual: opts?.manual });
  return {
    id,
    kind,
    decision: policy.decision,
    estimatedBytes: policy.bytes,
    reason: policy.reason,
    action: opts?.action || '',
  };
}

/**
 * 给一组依赖批量生成计划（MCP 配置预检用）。
 * 返回里**只看 available 与 autoPull 就够判断能不能连**；plans 只是「缺什么、要不要问」的补充。
 */
export async function precheckDependencies(
  items: Array<{ id: string; command?: string; kind?: InstallKind; bytes?: number | null; action?: string }>,
): Promise<Array<{ id: string; ok: boolean; probe?: Awaited<ReturnType<typeof precheckMcpCommand>>; plan: InstallPlan }>> {
  const out: Array<{ id: string; ok: boolean; probe?: Awaited<ReturnType<typeof precheckMcpCommand>>; plan: InstallPlan }> = [];
  for (const it of items) {
    const plan = planInstall(it.id, { kind: it.kind, bytes: it.bytes, action: it.action });
    if (it.command) {
      const probe = await precheckMcpCommand(it.command);
      out.push({ id: it.id, ok: probe.available, probe, plan });
    } else {
      out.push({ id: it.id, ok: true, plan });
    }
  }
  return out;
}

// ── 通用「下载压缩包并放置」执行器（与 ffmpeg 同构）─────────────────────

export interface ArchiveInstallSpec {
  /** 下载地址 */
  url: string;
  /** 归档格式（决定解压命令） */
  archive: 'zip' | 'tarxz';
  /** 归档内要找的文件名（递归查找，不假设压缩包内目录结构） */
  files: string[];
  /** 放置目录 */
  destDir: string;
}

export interface ArchiveInstallResult {
  ok: boolean;
  message: string;
  /** 实际放置的文件绝对路径 */
  placed: string[];
  dir?: string;
}

/**
 * 通用归档安装：下载 → 解压 → 找文件 → 就位。
 *
 * ★ 与 ffmpeg-runtime 的分工：ffmpeg 有自己的一套（含 bundled/PATH/env 四级探测与平台源），
 *   这里只负责「拿到一个归档，把里面指定文件放到指定目录」这段**纯搬运**逻辑，
 *   供未来的运行时（uv / 其它二进制）复用。抽出来是为了不再复制一遍解压/重试/递归查找。
 * ★ 必须先看策略：decision !== 'silent' 时**拒绝执行**，由调用方先去问用户。
 *   这样「静默」不是调用方的自觉，而是执行器强制的前置条件。
 */
export async function installFromArchive(
  spec: ArchiveInstallSpec,
  opts: { onProgress?: (msg: string) => void; estimatedBytes?: number | null; silentMaxBytes?: number; confirmed?: boolean },
): Promise<ArchiveInstallResult> {
  const policy = decideInstallPolicy(opts.estimatedBytes ?? null, { silentMaxBytes: opts.silentMaxBytes });
  if (policy.decision !== 'silent' && !opts.confirmed) {
    return { ok: false, message: `需要用户确认后才能安装：${policy.reason}`, placed: [], dir: spec.destDir };
  }
  if (!spec.url) return { ok: false, message: '缺少下载地址', placed: [], dir: spec.destDir };
  if (!spec.files.length) return { ok: false, message: '未指定要放置的文件', placed: [], dir: spec.destDir };

  const onProgress = opts.onProgress;
  let work = '';
  try {
    const fsp = (await import('node:fs/promises')).default;
    const os = await import('node:os');
    const { downloadMediaBinary } = await import('./media-fetch.js');

    work = path.join(os.tmpdir(), `yz-runtime-${Date.now()}`);
    await fsp.mkdir(work, { recursive: true });
    await fsp.mkdir(spec.destDir, { recursive: true });

    onProgress?.('下载中…');
    // 大文件经代理隧道传输时 ECONNRESET 属常态 → 带重试（与 ffmpeg 同策略）
    let buf: Buffer | null = null;
    let lastErr: unknown = null;
    for (let i = 1; i <= 3; i++) {
      try {
        buf = await downloadMediaBinary(spec.url, 900000);
        if (buf && buf.length > 0) break;
        lastErr = new Error('下载到空内容');
      } catch (e) {
        lastErr = e;
        if (i < 3) onProgress?.(`下载中断，重试 ${i}/2…`);
      }
    }
    if (!buf || buf.length === 0) {
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || '下载失败'));
    }

    const archivePath = path.join(work, `pkg.${spec.archive === 'zip' ? 'zip' : 'tar.xz'}`);
    await fsp.writeFile(archivePath, buf);

    onProgress?.('解压中…');
    const dest = path.join(work, 'x');
    await fsp.mkdir(dest, { recursive: true });
    const { buildExtractCommand } = await import('../mcp/ffmpeg-runtime.js');
    const cmd = buildExtractCommand(spec.archive, archivePath, dest);
    const ran = await runProcess(cmd.cmd, cmd.args, 900000);
    if (!ran.ok) throw new Error(`解压失败：${ran.out.slice(-300)}`);

    const placed: string[] = [];
    const missing: string[] = [];
    for (const name of spec.files) {
      const found = await findFileDeep(dest, name);
      if (!found) { missing.push(name); continue; }
      const target = path.join(spec.destDir, path.basename(found));
      await fsp.copyFile(found, target);
      if (process.platform !== 'win32') await fsp.chmod(target, 0o755);
      placed.push(target);
    }
    if (missing.length) {
      return { ok: false, message: `压缩包内未找到：${missing.join(', ')}`, placed, dir: spec.destDir };
    }
    return { ok: true, message: `安装完成（${placed.length} 个文件）`, placed, dir: spec.destDir };
  } catch (e: unknown) {
    return { ok: false, message: `安装失败：${e instanceof Error ? e.message : String(e)}`, placed: [], dir: spec.destDir };
  } finally {
    if (work) {
      try {
        const fsp = (await import('node:fs/promises')).default;
        await fsp.rm(work, { recursive: true, force: true });
      } catch { /* 临时目录清理失败无碍 */ }
    }
  }
}

function runProcess(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return runCmd(cmd, args, { timeoutMs, maxBuffer: 32 * 1024 * 1024 }).then((r) => ({
    ok: r.ok,
    out: r.ok ? r.stdout : r.stderr || r.error,
  }));
}

/** 递归查找文件（各平台压缩包内目录结构不一，不做路径假设）；深度上限防异常归档打转 */
async function findFileDeep(root: string, fileName: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null;
  const fsp = (await import('node:fs/promises')).default;
  let entries: import('node:fs').Dirent[] = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === fileName.toLowerCase()) return path.join(root, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = await findFileDeep(path.join(root, e.name), fileName, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}