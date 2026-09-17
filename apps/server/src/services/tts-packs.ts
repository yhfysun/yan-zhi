// 本地语音包（TTS 模型）管理：清单 / 下载 / 状态。
//
// 为什么需要它：系统语音（Windows）中文音色只有 3 个，离线时「男女老少」凑不齐；
// Edge 在线虽音色多但要联网。本地神经语音模型（sherpa-onnx VITS）能在**完全离线**下提供上百种音色。
//
// 设计取舍：
//  - **按需下载，不随包**（用户明确要求）：安装包不涨；代价是首次使用需联网下载约 120MB。
//  - 模型落在 `<dataDir>/tts-models/<id>`，解压后即用，无需重启。
//  - 下载复用 `services/media-fetch` 的统一入口（直连优先 → 本机代理隧道），
//    大文件走代理是常态，且那里的重定向跟随/字节保留修复对本链路同样必要。
import { promises as fsp } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadMediaBinary } from './media-fetch.js';

export interface TtsPackFile {
  /** 相对模型根目录的路径 */
  rel: string;
  bytes: number;
}

export interface TtsPack {
  id: string;
  name: string;
  /** 中文音色数（VITS 说话人数） */
  speakers: number;
  /** 约多少 MB（下载前展示） */
  sizeMb: number;
  sampleRate: number;
  license: string;
  desc: string;
  /** 是否带性别/年龄标注（决定能否自动按角色性别分配） */
  genderLabeled: boolean;
  note?: string;
}

export interface TtsPackStatus extends TtsPack {
  installed: boolean;
  /** 已落盘大小（MB，保留一位） */
  onDiskMb?: number;
  /** 实际可用的模型目录（下载位或手动放置位） */
  modelDir: string;
  /** 手动放置目录（网络不通时用户可自行下载解压到此） */
  manualDir: string;
}

export interface DownloadState {
  state: 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
  bytes?: number;
  totalBytes?: number;
}

/**
 * 可下载的语音包清单。URL 用 GitHub Releases（走 release-assets 重定向，1 次跟随）。
 *
 * ⚠️ `sizeMb` 是**实测值**（解压后的核心文件），不是网上流传的数字：
 * aishell3 的 tar.bz2 仅 30.1MB，解压后核心文件约 33MB —— 网上说「120MB」是含 rule.far(172MB)
 * 等可选规则包的口径。我们只装推理必需文件，故体积小得多。
 */
export const TTS_PACKS: TtsPack[] = [
  {
    id: 'vits-zh-aishell3',
    name: '中文多说话人（aishell3）',
    speakers: 174,
    sizeMb: 31,
    sampleRate: 8000,
    license: 'Apache-2.0（可商用）',
    desc: '174 个中文说话人，音色最多，适合多角色短剧。采样率 8kHz（电话音质）。',
    genderLabeled: false,
    note: '说话人无官方性别标注（编号形如 SSB0005），需按编号试听挑选；已提供精选预选表。',
  },
  {
    id: 'vits-zh-hf-theresa',
    name: '中文多说话人（theresa）',
    speakers: 804,
    sizeMb: 120,
    sampleRate: 22050,
    license: 'Apache-2.0',
    desc: '804 个说话人（数量最多），22.05kHz 音质明显优于 aishell3。',
    genderLabeled: false,
    note: '说话人极多但无标注，挑选成本高；音质比 aishell3 好。体积未实测，按上游口径。',
  },
  {
    id: 'vits-melo-tts-zh_en',
    name: '中英混读（MeloTTS）',
    speakers: 1,
    sizeMb: 163,
    sampleRate: 44100,
    license: 'MIT',
    desc: '单音色但音质最好（44.1kHz），支持中英文混读。适合旁白/朗读类场景。',
    genderLabeled: false,
    note: '仅 1 个音色，多角色场景区分度低。',
  },
];

/**
 * 模型根目录：<dataDir>/tts-models
 *
 * ⚠️ 刻意不 `import { dataDir } from '../db.js'`：那会把 better-sqlite3 拖进本模块，
 * 而这是一个「纯文件/下载」服务，不该依赖数据库初始化（且裸跑时 ABI 不匹配会直接崩）。
 * 取法必须与 db.ts 一致：DATA_DIR 环境变量 → 否则按 apps/server 标记切分模块路径。
 */
export function ttsRoot(): string {
  const override = process.env.YZ_TTS_DIR?.trim();
  if (override) return path.resolve(override);
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'tts-models');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  // 编译后在 <root>/apps/server/dist/apps/server/src/services，按 apps/server 标记切分
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'tts-models');
  return path.join(path.dirname(moduleDir), 'tts-models');
}

export function packDir(id: string): string {
  return path.join(ttsRoot(), id);
}

const RELEASE_BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';
/** 包名 → release 文件名（绝大多数同名，个别带前缀差异） */
const RELEASE_FILE: Record<string, string> = {
  'vits-zh-aishell3': 'vits-icefall-zh-aishell3.tar.bz2',
  'vits-melo-tts-zh_en': 'vits-melo-tts-zh_en.tar.bz2',
  'vits-zh-hf-theresa': 'vits-zh-hf-theresa.tar.bz2',
};

export function packUrl(id: string): string | null {
  const f = RELEASE_FILE[id];
  return f ? `${RELEASE_BASE}/${f}` : null;
}

/**
 * 纯函数：给定 release 直链，产出多源候选（按尝试顺序）。
 *
 * 为什么需要：GitHub Releases 在国内网络下**时通时不通**（实测有整段时间直连超时、
 * 代理 TLS 也失败）。单源必然失败，多源 + 重试才能显著提高成功率。
 * 顺序：国内加速镜像优先（若有可用），其次官方直链，最后由 media-fetch 自动走代理隧道。
 */
export function mirrorUrls(fileName: string): string[] {
  const official = `${RELEASE_BASE}/${fileName}`;
  const mirrors = [
    `https://ghfast.top/${official}`,
    `https://gh-proxy.com/${official}`,
    `https://ghproxy.net/${official}`,
    `https://gh.llkk.cc/${official}`,
  ];
  return [...mirrors, official];
}

/** 允许用户手动放置模型（网络不通时的兜底）。扫描 <ttsRoot>/manual/<id>。 */
export function manualDir(id: string): string {
  return path.join(ttsRoot(), 'manual', id);
}

/** 内存中的下载状态（进度轮询用）。 */
const downloads = new Map<string, DownloadState>();

export function getDownloadState(id: string): DownloadState | null {
  return downloads.get(id) ?? null;
}

/** 判断模型是否已安装：目录存在且含 model.onnx。同时认「用户手动放置」的位置。 */
export async function isInstalled(id: string): Promise<boolean> {
  for (const dir of [packDir(id), manualDir(id)]) {
    if (!existsSync(dir)) continue;
    // 解压后结构可能是 <id>/<id>/model.onnx，递归找一层
    for (const cand of [path.join(dir, 'model.onnx'), path.join(dir, id, 'model.onnx')]) {
      if (existsSync(cand)) return true;
    }
  }
  return false;
}

/** 实际可用的模型目录（优先下载位，其次手动放置位）。 */
export async function installedDir(id: string): Promise<string | null> {
  for (const dir of [packDir(id), manualDir(id)]) {
    for (const cand of [path.join(dir, 'model.onnx'), path.join(dir, id, 'model.onnx')]) {
      if (existsSync(cand)) return dir;
    }
  }
  return null;
}

/** 已安装模型的真实磁盘占用（MB）。 */
async function dirSizeMb(dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string) => {
    let entries: import('node:fs').Dirent[] = [];
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { try { total += (await fsp.stat(p)).size; } catch { /* 跳过取不到的文件 */ } }
    }
  };
  await walk(dir);
  return Math.round((total / 1048576) * 10) / 10;
}

/** 列出全部语音包及安装状态。 */
export async function listTtsPacks(): Promise<TtsPackStatus[]> {
  const out: TtsPackStatus[] = [];
  for (const p of TTS_PACKS) {
    const real = await installedDir(p.id);
    const installed = real !== null;
    out.push({
      ...p,
      installed,
      ...(installed ? { onDiskMb: await dirSizeMb(real) } : {}),
      // 用真实可用目录（下载位或手动放置位），供推理层直接使用
      modelDir: real || packDir(p.id),
      manualDir: manualDir(p.id),
    });
  }
  return out;
}

/** 解压命令。tar.bz2 用系统 tar（Win10+ 自带 bsdtar 支持 bz2）。 */
export function buildExtractCommand(archivePath: string, destDir: string): { cmd: string; args: string[] } {
  // Windows 自带 bsdtar 与 Linux/mac 的 tar 都支持 -xjf
  return { cmd: 'tar', args: ['-xjf', archivePath, '-C', destDir] };
}

/** 纯函数：把解压后的单层目录「拉平」（release 包常多包一层同名目录）。 */
export function flattenTarget(dir: string, id: string): string {
  return path.join(dir, id);
}

/**
 * 下载并安装语音包。幂等：已装则直接返回。
 * 返回后需由调用方（或下次推理时）加载模型。
 */
export async function installTtsPack(
  id: string,
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; message: string; dir?: string }> {
  const pack = TTS_PACKS.find((p) => p.id === id);
  if (!pack) return { ok: false, message: `未知语音包：${id}` };
  if (await isInstalled(id)) return { ok: true, message: `${pack.name} 已安装`, dir: packDir(id) };

  const url = packUrl(id);
  if (!url) return { ok: false, message: `语音包 ${id} 暂无下载源` };
  const fileName = RELEASE_FILE[id];

  const dir = packDir(id);
  const tmp = path.join(ttsRoot(), `.tmp-${id}`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(tmp, { recursive: true });

  downloads.set(id, { state: 'downloading', progress: 0, message: '开始下载…' });
  try {
    // 多源重试：GitHub 在国内网络时通时不通，单源失败概率高。
    // ⚠️ 每个源必须**独立短超时**：曾用统一 30 分钟超时 × 5 个源 → 网络差时用户要等 2.5 小时，
    // 表现为「点了下载就卡死」。大文件传输本身可能很久，故给单个源 10 分钟（够 31MB 慢速下完），
    // 且**直连失败会快速转下一个源**（media-fetch 内部直连只有 20s 超时）。
    const urls = mirrorUrls(fileName);
    let buf: Buffer | null = null;
    const errs: string[] = [];
    const PER_SOURCE_TIMEOUT = 10 * 60 * 1000;
    for (let i = 0; i < urls.length; i++) {
      const host = safeHost(urls[i]);
      try {
        onProgress?.(`下载中（源 ${i + 1}/${urls.length}：${host}）…`);
        downloads.set(id, { state: 'downloading', progress: 5 + i * 4, message: `下载中（${host}）…` });
        const got = await downloadMediaBinary(urls[i], PER_SOURCE_TIMEOUT);
        if (got && got.length > 1048576) { buf = got; break; }
        errs.push(`${host}: 内容过小（${got?.length ?? 0} 字节）`);
      } catch (e: unknown) {
        errs.push(`${host}: ${e instanceof Error ? e.message : String(e)}`);
      }
      downloads.set(id, {
        state: 'downloading', progress: 5 + i * 4,
        message: `源 ${i + 1}/${urls.length}（${host}）失败，换下一个…`,
      });
    }
    if (!buf) {
      throw new Error(
        `所有下载源均失败（${errs.join(' | ')}）。` +
        `可手动下载后放入：${manualDir(id)}（解压后确保该目录下有 model.onnx）`,
      );
    }
    if (buf.length < pack.sizeMb * 1048576 * 0.5) {
      throw new Error(`下载不完整（${(buf.length / 1048576).toFixed(1)}MB，预期约 ${pack.sizeMb}MB）`);
    }
    downloads.set(id, { state: 'downloading', progress: 60, message: '解压中…', bytes: buf.length, totalBytes: buf.length });

    const archive = path.join(tmp, 'pack.tar.bz2');
    await fsp.writeFile(archive, buf);
    onProgress?.('解压中…');
    const { cmd, args } = buildExtractCommand(archive, tmp);
    const r = await run(cmd, args, 600000);
    if (!r.ok) throw new Error(`解压失败：${r.out.slice(-300)}`);

    // 把解压出来的必需文件搬进目标目录（release 通常包一层同名目录）
    const entries = await fsp.readdir(tmp, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const src = dirs.length === 1 ? path.join(tmp, dirs[0].name) : tmp;
    const copied = await copyRequired(src, dir);
    if (copied === 0) throw new Error('解压后未找到任何必需文件，包结构可能已变更');

    downloads.set(id, { state: 'downloading', progress: 95, message: '校验中…' });
    if (!(await isInstalled(id))) throw new Error('解压后未找到 model.onnx，包结构可能已变更');

    downloads.set(id, { state: 'done', progress: 100, message: '安装完成' });
    return { ok: true, message: `${pack.name} 安装完成`, dir };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    downloads.set(id, { state: 'error', progress: 0, message: `安装失败：${msg}` });
    return { ok: false, message: `安装失败：${msg}` };
  } finally {
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* 临时目录清理失败无碍 */ }
  }
}

/**
 * 推理必需文件（白名单复制）。**刻意不装 rule.far**（aishell3 里它占 172MB），
 * 因为那是可选的正则规则包，缺了只是数字/日期不做规范化，不影响合成。
 * 实证：只装 model.onnx + tokens.txt + lexicon.txt + 小 fst 即可正常合成。
 */
const REQUIRED_FILES = [
  'model.onnx', 'model.fp16.onnx',
  'tokens.txt', 'lexicon.txt', 'lexicon-zh.txt',
  'date.fst', 'number.fst', 'phone.fst', 'new_heteronym.fst',
  'speakers.txt', 'README.md', 'LICENSE',
];

/** 复制时纳入的文件判定（纯函数，便于单测）。 */
export function isRequiredFile(name: string): boolean {
  return REQUIRED_FILES.includes(name);
}

async function copyRequired(src: string, dest: string): Promise<number> {
  await fsp.mkdir(dest, { recursive: true });
  let copied = 0;
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    if (e.isDirectory()) { copied += await copyRequired(path.join(src, e.name), path.join(dest, e.name)); continue; }
    if (!isRequiredFile(e.name)) continue;
    await fsp.copyFile(path.join(src, e.name), path.join(dest, e.name));
    copied++;
  }
  return copied;
}

function safeHost(u: string): string {
  try { return new URL(u).hostname; } catch { return u.slice(0, 30); }
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    import('node:child_process').then(({ execFile }) => {
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
        resolve({ ok: !err, out: String(err ? stderr || err.message : '') });
      });
    });
  });
}

/** 删除已安装的语音包（释放磁盘）。 */
export async function removeTtsPack(id: string): Promise<void> {
  const dir = packDir(id);
  if (existsSync(dir)) await fsp.rm(dir, { recursive: true, force: true });
  const man = manualDir(id);
  if (existsSync(man)) await fsp.rm(man, { recursive: true, force: true });
  downloads.delete(id);
}

/**
 * 试听：用指定语音包合成一句样例，落盘到交付产物目录并返回可播放地址。
 * 供设置页「语音包」面板的试听按钮使用（本项目没有通用的 HTTP 工具执行端点，
 * 所以这里给一个试听专用接口，比让前端去猜端点可靠）。
 */
export async function previewTtsPack(
  id: string,
  opts: { text?: string; speakerId?: number } = {},
): Promise<{ ok: boolean; message: string; url?: string; file?: string; speakerId?: number; bytes?: number }> {
  const dir = await installedDir(id);
  if (!dir) return { ok: false, message: '该语音包尚未安装' };

  // 延迟 import：避免 services → mcp 的顶层循环依赖
  const { localSpeak, pcmToWav, pickSpeakerForRole, resolveSherpaLib, resetSherpaCache } = await import('../mcp/sherpa-tts.js');
  const speakerId = typeof opts.speakerId === 'number'
    ? opts.speakerId
    : pickSpeakerForRole('旁白', new Set());
  const text = opts.text?.trim() || '这是本地语音试听，用于确认音色效果。';

  // 诊断信息随错误一起抛出：服务进程内的失败与裸跑不一致时，要先知道它用的是哪份引擎/模型
  const diag = () => {
    const st = resolveSherpaLib();
    return `engine=${st.available}(${st.source} @ ${st.libPath}) model=${dir}`;
  };

  try {
    const { samples, sampleRate } = await localSpeak(text, { modelDir: dir, speakerId });
    const wav = pcmToWav(samples, sampleRate);
    // 落盘到会话产物目录（与 media_compose / api_tts_speak 同一处，便于前端直接播放）
    const { mediaTarget } = await import('../mcp/api-tool-executor.js');
    const target = mediaTarget({ kind: 'audios' });
    await fsp.mkdir(target.dir, { recursive: true });
    const file = path.join(target.dir, `preview-${id}-${Date.now()}.wav`);
    await fsp.writeFile(file, wav);
    return {
      ok: true, message: 'ok', file, speakerId, bytes: wav.length,
      url: `${target.urlBase}/${path.basename(file)}`,
    };
  } catch (e: unknown) {
    // 首次失败时重置缓存重试一次：引擎/模型可能是热重载前加载的旧句柄
    try {
      resetSherpaCache();
      const { samples, sampleRate } = await localSpeak(text, { modelDir: dir, speakerId });
      const wav = pcmToWav(samples, sampleRate);
      const { mediaTarget } = await import('../mcp/api-tool-executor.js');
      const target = mediaTarget({ kind: 'audios' });
      await fsp.mkdir(target.dir, { recursive: true });
      const file = path.join(target.dir, `preview-${id}-${Date.now()}.wav`);
      await fsp.writeFile(file, wav);
      return {
        ok: true, message: 'ok', file, speakerId, bytes: wav.length,
        url: `${target.urlBase}/${path.basename(file)}`,
      };
    } catch (e2: unknown) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`${msg}（诊断：${diag()}）`);
    }
  }
}