// 通用安装器注册表（2026-10-22）
//
// ★★★ 为什么需要这一层（用户 2026-10-22 拍板"两条路嘛"）：
//   安装类资源原本只有两条互不相通的路径：
//   · **通道 A（UI 点按钮）**：`VoicePackPanel.vue` 那套 —— 清单 + 下载按钮 + 进度条 +
//     卸载二次确认 + 手动兜底提示。做得很好，但只有语音包享受到了。
//   · **通道 B（模型调工具）**：`media_install_ffmpeg` / `whisper_install` /
//     `media_install_singing` 各自实现，确认只写在描述里当"建议"，模型可以不理；
//     而 `tts-pack` **压根没有工具**，`api_tts_voices` 报"未安装语音包，可在 设置→语音包
//     中下载"时，模型只能让用户自己动手 —— 这正是要消灭的断点。
//
//   本文件把"可安装资源"抽象成一个契约，两条通道都调同一个 `install()`：
//     通道 A：UI 按钮 → POST /xxx/install → INSTALLERS[id].install
//     通道 B：模型 → install_resource 工具 → 确认卡 → INSTALLERS[id].install
//   ★ 共用同一个函数是关键：两套实现必然漂移（UI 下好了工具认为没装、或反之）。
//     守门测试 `install-dual-channel.test.ts` 断言"只 mock 一次 install，两条路都能触发"。
//
// ★ 不重写任何下载逻辑：全部转发到既有服务（ffmpeg-runtime / whisper-runtime /
//   ytdlp-runtime / tts-packs / music-sing-install）。本层只做「元信息 + 统一形状」，
//   这样已有的镜像回退、断点续传、解压校验全部原样受益。

import path from 'node:path';
import {
  RESOURCE_BYTES,
  humanBytes,
  cnFirst,
  FFMPEG_SOURCES,
  GITHUB_RELEASE_SOURCES,
  type DownloadSource,
} from '@yan-zhi/shared';
import { resolveFfmpeg, installFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { resolveWhisper, installWhisper } from '../mcp/whisper-runtime.js';
import { resolveYtdlp, installYtdlp } from '../mcp/ytdlp-runtime.js';
import { listTtsPacks, installTtsPack, getDownloadState } from './tts-packs.js';
import { singingStatus, installSingingRuntime } from './music-sing-install.js';
import { singingRoot } from './music-sing-diffsinger.js';
// ACE-Step 安装器（2026-10-22）：权重复用 + 修 CUDA torch，逻辑单独一个文件
import { installAcestepRuntime, acestepRootDir } from './music-acestep-install.js';
import { acestepStatus } from './music-acestep.js';
import { HF_MODEL_SOURCES } from '@yan-zhi/shared';

/** 进度回调：文案 + 0~100（渠道 A 用于进度条，渠道 B 用于工具返回）。 */
export type ProgressFn = (message: string, progress?: number) => void;

export interface InstallState {
  state: 'idle' | 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
}

export interface InstallOutcome {
  ok: boolean;
  error?: string;
  notes?: string[];
  /** 安装后的绝对路径（可执行文件或模型目录），便于工具直接回报给模型 */
  path?: string;
}

/**
 * 一个「可安装资源」的统一契约。
 * ★ 新增资源只写一个对象，两条通道自动都获得（不用改 UI，也不用改工具）。
 */
export interface Installer {
  /** 稳定 id（工具参数与前端共用） */
  id: string;
  /** 展示名（确认卡标题） */
  title: string;
  /** 一句话用途（确认卡正文，让用户知道装了能干嘛） */
  purpose: string;
  /** 体积（字节）。变体按 variant 算 */
  bytes: (variant?: string) => number;
  /** 下载源（已按国内优先排好序） */
  sources: () => DownloadSource[];
  /** 落盘目录（确认卡展示，用户要知道东西放哪） */
  targetDir: () => string;
  /** 预计耗时文案（不给精确值——带宽差异太大，给量级） */
  eta: (variant?: string) => string;
  /** 是否已就绪（幂等：已装则**不弹确认**，直接返回状态） */
  isInstalled: (variant?: string) => Promise<boolean>;
  /** 真正执行。两条通道共用这一个函数 */
  install: (variant: string | undefined, onProgress: ProgressFn) => Promise<InstallOutcome>;
  /** 进行中的下载进度（供 UI 轮询；无状态返回 null） */
  progress: (variant?: string) => InstallState | null;
  /** 下载失败时的手动兜底指引 */
  manualHint: () => { dir: string; text: string };
}

// ───────────────────────────────────────────────────────────────────
// ffmpeg
// ───────────────────────────────────────────────────────────────────
const ffmpegInstaller: Installer = {
  id: 'ffmpeg',
  title: 'ffmpeg',
  purpose: '音视频合成的必备依赖：配音混入视频、拼接、烧字幕、转码都靠它',
  bytes: () => RESOURCE_BYTES.ffmpeg,
  sources: () => cnFirst(FFMPEG_SOURCES),
  targetDir: () => path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'ffmpeg'),
  eta: () => '约 1~3 分钟（取决于带宽）',
  async isInstalled() {
    const s = await resolveFfmpeg();
    return s.ok && s.source !== 'none';
  },
  async install(_variant, onProgress) {
    const r = await installFfmpeg((msg) => onProgress(msg));
    // ★ 各安装器返回形状不同（这里是 message/dir，歌声那边是 steps/error），
    //   契约层负责归一，调用方只认 InstallOutcome
    return { ok: r.ok, error: r.ok ? undefined : r.message, path: r.dir };
  },
  progress: () => null,
  manualHint: () => ({
    dir: path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'ffmpeg'),
    text: '下载失败时，可自行下载 ffmpeg 静态构建，解压后把 ffmpeg.exe / ffprobe.exe 放进该目录',
  }),
};

// ───────────────────────────────────────────────────────────────────
// yt-dlp
// ───────────────────────────────────────────────────────────────────
const ytdlpInstaller: Installer = {
  id: 'ytdlp',
  title: 'yt-dlp',
  purpose: '从公开视频站抓取素材（B站/YouTube 等）的视频信息与直链',
  bytes: () => RESOURCE_BYTES.ytdlp,
  sources: () => cnFirst(GITHUB_RELEASE_SOURCES),
  targetDir: () => path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'ytdlp'),
  eta: () => '约 30 秒~1 分钟',
  async isInstalled() {
    const s = await resolveYtdlp();
    return !!s.ok;
  },
  async install(_variant, onProgress) {
    const r = await installYtdlp((msg) => onProgress(msg));
    return { ok: r.ok, error: r.ok ? undefined : r.message, path: r.dir };
  },
  progress: () => null,
  manualHint: () => ({
    dir: path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'ytdlp'),
    text: '下载失败时，可自行下载 yt-dlp.exe 放进该目录',
  }),
};

// ───────────────────────────────────────────────────────────────────
// whisper.cpp（二进制约 8MB + 模型按档位 142MB~1.5GB）
// ───────────────────────────────────────────────────────────────────
const WHISPER_MODEL_BYTES: Record<string, number> = {
  base: RESOURCE_BYTES['whisper-model-base'],
  small: RESOURCE_BYTES['whisper-model-small'],
  medium: RESOURCE_BYTES['whisper-model-medium'],
};

const whisperInstaller: Installer = {
  id: 'whisper',
  title: '本地语音识别（whisper.cpp）',
  purpose: '把音频/视频里的人声转成带时间轴的字幕，全程离线不上传',
  bytes: (variant) => RESOURCE_BYTES['whisper-cli'] + (WHISPER_MODEL_BYTES[variant || 'small'] ?? WHISPER_MODEL_BYTES.small),
  sources: () => cnFirst(GITHUB_RELEASE_SOURCES),
  targetDir: () => path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'whisper'),
  eta: (variant) =>
    (variant || 'small') === 'medium' ? '约 10~20 分钟（模型 1.5GB）' : '约 2~5 分钟',
  async isInstalled(variant) {
    const s = await resolveWhisper(variant || 'small');
    return !!s.ok && !!s.model;
  },
  async install(variant, onProgress) {
    // ★ 位置参数：（what, model, onProgress）—— 不是对象参数
    const r = await installWhisper(
      'all',
      (variant || 'small') as 'base' | 'small' | 'medium',
      (msg) => onProgress(msg),
    );
    return { ok: r.ok, error: r.ok ? undefined : r.message, path: r.dir };
  },
  progress: () => null,
  manualHint: () => ({
    dir: path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'whisper'),
    text: '下载失败时，可手动下载 whisper-cli 与 ggml-*.bin 模型放进该目录',
  }),
};

// ───────────────────────────────────────────────────────────────────
// DiffSinger 歌声合成运行时（现有 media_install_singing 的能力面）
// ───────────────────────────────────────────────────────────────────
const diffsingerInstaller: Installer = {
  id: 'diffsinger',
  title: '歌声合成运行时（DiffSinger）',
  purpose: '给乐谱配上真人感的人声演唱（不需要显卡），music_compose 会自动用它',
  bytes: () => RESOURCE_BYTES.diffsinger,
  sources: () => cnFirst(GITHUB_RELEASE_SOURCES),
  targetDir: () => singingRoot(),
  eta: () => '约 3~8 分钟',
  async isInstalled() {
    const s = await singingStatus();
    return !!s.ready;
  },
  async install(_variant, onProgress) {
    onProgress('同步推理代码与依赖…');
    const r = await installSingingRuntime();
    return { ok: r.ok, error: r.error, notes: r.steps, path: r.root };
  },
  progress: () => null,
  manualHint: () => ({
    dir: singingRoot(),
    text: '下载失败时，可自行下载 model.zip 后调用 media_install_singing 的 import 动作导入',
  }),
};

// ───────────────────────────────────────────────────────────────────
// 本地语音包（★ 2026-10-22 补的缺口：原本只有 UI 通道，没有工具）
// ───────────────────────────────────────────────────────────────────
const ttsPackInstaller: Installer = {
  id: 'tts-pack',
  title: '本地语音包',
  purpose: '离线多音色 TTS（174 个中文说话人），装后配音完全不需要联网',
  bytes: () => RESOURCE_BYTES['tts-pack'],
  // 语音包源在 services/tts-packs.ts 的 mirrorUrls() 里维护，这里只做展示占位
  sources: () => [
    { id: 'builtin', label: '内置镜像（国内优先，自动回退）', region: 'cn', url: '' },
  ],
  targetDir: () => path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'tts-models'),
  eta: () => '约 1~2 分钟',
  async isInstalled() {
    const packs = await listTtsPacks();
    return packs.some((p) => p.installed);
  },
  async install(variant, onProgress) {
    const packs = await listTtsPacks();
    const target = variant ? packs.find((p) => p.id === variant) : packs[0];
    if (!target) return { ok: false, error: `没有这个语音包：${variant || '(默认)'}` };
    onProgress(`开始下载 ${target.name}…`, 1);
    const r = await installTtsPack(target.id, (msg) => onProgress(msg));
    return { ok: r.ok, error: r.ok ? undefined : r.message, path: r.dir };
  },
  progress(variant) {
    const st = getDownloadState(variant || '');
    if (!st) return null;
    return { state: st.state, progress: st.progress, message: st.message };
  },
  manualHint: () => ({
    dir: path.join(process.env.APPDATA || process.cwd(), 'yan-zhi', 'server-data', 'tts-models'),
    text: '下载失败时可在 设置 → 语音包 里用「手动放置」复制目标路径，自行解压模型',
  }),
};

/**
 * ACE-Step 本地写歌运行时（2026-10-22，第二段）。
 *
 * ★ 这个安装器与别处不同：**权重已在本机的用户不该重新下载 8.9GB**。
 *   所以 isInstalled 走 `acestepStatus()`，它除了查文件，还会探测
 *   torch 是不是 CUDA 版 —— 实测部署场景出现过"8.9GB 权重齐全、torch 却是 CPU 版"
 *   的情况（`2.14.1+cpu`，`cuda.is_available()==False`），权重看着全但根本用不了显卡。
 *   这种状态下 isInstalled 返回 false，install 会去补装 CUDA torch。
 */
const acestepInstaller: Installer = {
  id: 'acestep',
  title: 'AI 写歌运行时（ACE-Step）',
  purpose: '本地模型，给歌词就能唱出整首歌；不上传歌词、不需要 API key',
  bytes: (variant) => {
    // 权重 ~6GB + venv（torch cu128 约 3GB）
    return variant === 'weights-only' ? 6 * 1024 ** 3 : RESOURCE_BYTES.acestep;
  },
  sources: () => cnFirst(HF_MODEL_SOURCES),
  targetDir: () => acestepRootDir(),
  eta: () => '约 20~40 分钟（8.9GB，取决于带宽）',
  async isInstalled() {
    const st = await acestepStatus();
    return st.state === 'ready';
  },
  async install(variant, onProgress) {
    return installAcestepRuntime(variant, onProgress);
  },
  progress: () => null,
  manualHint: () => ({
    dir: acestepRootDir(),
    text:
      '下载失败时：模型权重可从 ModelScope 的 ACE-Step/Ace-Step1.5 手动下载，' +
      '按 {turbo→checkpoints/acestep-v15-turbo, vae→checkpoints/vae, qwen→checkpoints/Qwen3-Embedding-0.6B} 放置',
  }),
};

/**
 * ★ 注册表。key 即工具参数 `resource`。
 */
export const INSTALLERS: Record<string, Installer> = {
  ffmpeg: ffmpegInstaller,
  ytdlp: ytdlpInstaller,
  whisper: whisperInstaller,
  diffsinger: diffsingerInstaller,
  'tts-pack': ttsPackInstaller,
  acestep: acestepInstaller,
};

/** 列资源清单（通道 A 的清单面板 + 通道 B 的 action=list 共用）。 */
export async function listInstallers(): Promise<
  Array<{ id: string; title: string; purpose: string; bytes: number; humanBytes: string; installed: boolean }>
> {
  const out = [];
  for (const inst of Object.values(INSTALLERS)) {
    let installed = false;
    try { installed = await inst.isInstalled(); } catch { installed = false; }
    const bytes = inst.bytes();
    out.push({
      id: inst.id,
      title: inst.title,
      purpose: inst.purpose,
      bytes,
      humanBytes: humanBytes(bytes),
      installed,
    });
  }
  return out;
}

export function getInstaller(id: string): Installer | undefined {
  return INSTALLERS[id];
}
