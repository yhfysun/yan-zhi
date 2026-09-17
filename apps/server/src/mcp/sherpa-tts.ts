// sherpa-onnx 本地语音推理 —— 调用 VITS 模型做完全离线的多说话人 TTS。
//
// 为什么用「动态加载」而不是直接 require：
//  1. `sherpa-onnx-node` 只是 JS 包装（约 0.1MB），**原生二进制在同名平台包**里
//     （如 `sherpa-onnx-win-x64`，约 22MB）。没装时 require 会抛异常，
//     而本地语音只是**第三层兜底**，绝不能因为缺原生模块把整个 TTS 链路拖崩。
//  2. 未被使用时应零开销（不加载 22MB 原生库）。
//
// 加载顺序（与 sherpa-onnx-node 的 addon.js 约定一致）：
//   仓库本地 node_modules 逐级向上找 → 环境变量 YZ_SHERPA_LIB 指定的目录。
// 若都找不到，返回 unavailable + 安装指引（由上层决定是否提示用户）。
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

export interface SherpaStatus {
  available: boolean;
  /** 命中来源：node_modules（仓库已装）/ downloaded（按需下载位）/ env（手动指定）/ none */
  source: 'node_modules' | 'downloaded' | 'env' | 'none';
  libPath: string;
  error: string;
}

/** 引擎安装目录：<dataDir>/sherpa（与 ffmpeg 同策略，刻意不依赖 npm 依赖树）。 */
export function sherpaDir(): string {
  const override = process.env.YZ_SHERPA_DIR?.trim();
  if (override) return path.resolve(override);
  const base = process.env.DATA_DIR?.trim();
  if (base) return path.join(base, 'sherpa');
  // 与 db.ts 的 dataDir 推导对齐：按 apps/server 标记切分（避免落到仓库外）
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const marker = `${path.sep}apps${path.sep}server${path.sep}`;
  const at = moduleDir.indexOf(marker);
  if (at >= 0) return path.join(moduleDir.slice(0, at + marker.length).replace(/[\\/]$/, ''), 'sherpa');
  return path.join(path.dirname(moduleDir), 'sherpa');
}

let cachedStatus: SherpaStatus | null = null;
/** 已加载的 TTS 实例（按模型目录缓存，避免重复加载 120MB 权重）。 */
const ttsCache = new Map<string, any>();
/** 已加载的 sherpa 模块（与 resolveSherpaLib 的定位结果一致，避免「能定位却按包名找不到」）。 */
let sherpaModule: any = null;

/**
 * 加载 sherpa 模块（与 resolveSherpaLib 使用同一套定位逻辑）。
 *
 * ⚠️ 曾经这里直接 `require_('sherpa-onnx-node')` 按**包名**查找，
 * 而 resolveSherpaLib 支持「按需下载位 / 手动指定目录」——
 * 两者不一致会导致「状态显示可用、合成时报 Cannot find module」。
 */
function loadSherpaModule(): any {
  if (sherpaModule) return sherpaModule;
  const st = resolveSherpaLib();
  if (!st.available) throw new Error(st.error);
  if (st.source === 'node_modules') {
    sherpaModule = require_('sherpa-onnx-node');
  } else {
    sherpaModule = require_(st.libPath);
  }
  return sherpaModule;
}

function platformPkgName(): string {
  const p = process.platform === 'win32' ? 'win' : process.platform;
  return `sherpa-onnx-${p}-${process.arch}`;
}

/** 解析原生模块位置：优先仓库 node_modules，其次 `<dataDir>/sherpa`（按需下载位），最后 YZ_SHERPA_LIB。 */
export function resolveSherpaLib(): SherpaStatus {
  if (cachedStatus) return cachedStatus;
  const pkg = platformPkgName();
  const tried: string[] = [];

  // 1) 常规 require（node_modules 里已装 sherpa-onnx-node + 平台包）
  try {
    const mod = require_('sherpa-onnx-node');
    cachedStatus = { available: true, source: 'node_modules', libPath: 'sherpa-onnx-node', error: '' };
    return cachedStatus;
  } catch (e: unknown) {
    tried.push(`node_modules: ${firstLine(e)}`);
  }

  // 2) 按需下载位 <dataDir>/sherpa（与 ffmpeg 同策略：不随包，按平台取）
  const dir = sherpaDir();
  const entry = path.join(dir, 'node_modules', 'sherpa-onnx-node', 'sherpa-onnx.js');
  if (existsSync(entry)) {
    try {
      // 平台包需与 JS 层同级，供 addon.js 的 `../sherpa-onnx-<plat>/sherpa-onnx.node` 命中
      const mod = require_(entry);
      cachedStatus = { available: true, source: 'downloaded', libPath: entry, error: '' };
      return cachedStatus;
    } catch (e: unknown) {
      tried.push(`downloaded: ${firstLine(e)}`);
    }
  } else {
    tried.push(`downloaded: 未安装（${dir}）`);
  }

  // 3) YZ_SHERPA_LIB 指向的目录（用户手动放置原生二进制）
  const envDir = process.env.YZ_SHERPA_LIB?.trim();
  if (envDir) {
    const bin = path.join(envDir, 'sherpa-onnx.node');
    if (existsSync(bin)) {
      try {
        const mod = require_(bin);
        cachedStatus = { available: true, source: 'env', libPath: bin, error: '' };
        return cachedStatus;
      } catch (e: unknown) {
        tried.push(`env: ${firstLine(e)}`);
      }
    } else {
      tried.push(`env: 未找到 ${bin}`);
    }
  }

  cachedStatus = {
    available: false, source: 'none', libPath: '',
    error: `语音引擎未安装（需 ${pkg}）。${tried.join(' | ')}`,
  };
  return cachedStatus;
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

export function resetSherpaCache(): void {
  cachedStatus = null;
  ttsCache.clear();
  sherpaModule = null;
}

/** 引擎版本（JS 层与平台包必须同版本，否则原生 ABI 不匹配）。 */
export const SHERPA_VERSION = '1.13.8';
/** npm registry（优先国内镜像，失败回落官方源）。 */
const REGISTRIES = [
  'https://registry.npmmirror.com',
  'https://registry.npmjs.org',
];

/** 纯函数：包名 → 下载地址候选（便于单测）。 */
export function packageUrls(reg: string, pkg: string, version: string): string {
  return `${reg}/${pkg}/-/${pkg}-${version}.tgz`;
}

/** 纯函数：平台包名。win32 → `win`（上游刻意改名，避免 win32 触发 spam 过滤）。 */
export function platformPackage(platform: string, arch: string): string {
  const p = platform === 'win32' ? 'win' : platform;
  return `sherpa-onnx-${p}-${arch}`;
}

/**
 * 下载并安装语音推理引擎（JS 层 + 平台原生包）。
 *
 * 为什么不进 npm 依赖：原生二进制约 22MB 且**平台相关**，
 * 打包时无法在 Windows 上准备 mac/linux 构建（与 ffmpeg 同一教训）。
 * 故改为运行时按平台下载到 <dataDir>/sherpa。
 */
export async function installSherpaEngine(
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; message: string; dir?: string }> {
  if (resolveSherpaLib().available) return { ok: true, message: '语音引擎已就绪', dir: sherpaDir() };

  const dir = sherpaDir();
  const nm = path.join(dir, 'node_modules');
  const tmp = path.join(dir, '.tmp');
  const platPkg = platformPackage(process.platform, process.arch);
  try {
    await fsp.mkdir(nm, { recursive: true });
    await fsp.mkdir(tmp, { recursive: true });

    const { downloadMediaBinary } = await import('../services/media-fetch.js');
    const pkgs = ['sherpa-onnx-node', platPkg];

    for (const pkg of pkgs) {
      let buf: Buffer | null = null;
      let lastErr = '';
      for (const reg of REGISTRIES) {
        for (const ver of [SHERPA_VERSION]) {
          try {
            onProgress?.(`下载 ${pkg}@${ver}（${reg.includes('npmmirror') ? '镜像' : '官方'}）…`);
            buf = await downloadMediaBinary(packageUrls(reg, pkg, ver), 600000);
            if (buf && buf.length > 512) break;
          } catch (e: unknown) {
            lastErr = e instanceof Error ? e.message : String(e);
          }
        }
        if (buf && buf.length > 512) break;
      }
      if (!buf || buf.length <= 512) throw new Error(`${pkg} 下载失败：${lastErr}`);

      onProgress?.(`解压 ${pkg}…`);
      const archive = path.join(tmp, `${pkg}.tgz`);
      await fsp.writeFile(archive, buf);
      const dest = path.join(tmp, pkg);
      await fsp.mkdir(dest, { recursive: true });
      // npm 包是 tar.gz，tar 能直接解（Windows 自带 bsdtar 亦支持）
      const r = await run('tar', ['-xzf', archive, '-C', dest], 300000);
      if (!r.ok) throw new Error(`${pkg} 解压失败：${r.out.slice(-200)}`);

      // tar 内统一是 package/ 前缀 → 搬到 node_modules/<pkg>
      const inner = path.join(dest, 'package');
      const srcDir = existsSync(inner) ? inner : dest;
      await copyAll(srcDir, path.join(nm, pkg));
    }

    resetSherpaCache();
    const st = resolveSherpaLib();
    if (!st.available) throw new Error(`安装后仍无法加载：${st.error}`);
    return { ok: true, message: '语音引擎安装完成', dir };
  } catch (e: unknown) {
    return { ok: false, message: `引擎安装失败：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try { await fsp.rm(tmp, { recursive: true, force: true }); } catch { /* 清理失败无碍 */ }
  }
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    void import('node:child_process').then(({ execFile }) => {
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
        resolve({ ok: !err, out: String(err ? stderr || err.message : '') });
      });
    });
  });
}

async function copyAll(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  for (const e of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyAll(s, d);
    else await fsp.copyFile(s, d);
  }
}

export interface LocalSpeakOptions {
  /** 模型根目录（含 model.onnx / tokens.txt / lexicon.txt） */
  modelDir: string;
  /** 说话人编号（aishell3 为 0-173） */
  speakerId: number;
  /** 语速 0.5~2.0，1.0 为正常 */
  speed?: number;
  /** 采样率（合成后重采样用，模型自带采样率由配置决定） */
  onProgress?: (p: number) => void;
}

/** 在模型目录里找关键文件（release 常多包一层同名目录）。 */
function resolveModelPaths(modelDir: string): { dir: string; model: string; tokens: string; lexicon: string } | null {
  const cands = [modelDir, ...safeDirs(modelDir).map((d) => path.join(modelDir, d))];
  for (const d of cands) {
    const model = ['model.onnx', 'model.fp16.onnx'].map((f) => path.join(d, f)).find((f) => existsSync(f));
    const tokens = path.join(d, 'tokens.txt');
    if (model && existsSync(tokens)) {
      const lexicon = ['lexicon.txt', 'lexicon-zh.txt'].map((f) => path.join(d, f)).find((f) => existsSync(f)) || '';
      return { dir: d, model, tokens, lexicon };
    }
  }
  return null;
}

function safeDirs(dir: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require_('node:fs').readdirSync(dir, { withFileTypes: true }).filter((e: any) => e.isDirectory()).map((e: any) => e.name);
  } catch {
    return [];
  }
}

/**
 * 用本地模型合成语音，返回 Float32 PCM 与采样率。
 * 失败抛错 —— 上层按四层兜底继续降级。
 */
export async function localSpeak(
  text: string,
  opts: LocalSpeakOptions,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const st = resolveSherpaLib();
  if (!st.available) throw new Error(st.error);

  const paths = resolveModelPaths(opts.modelDir);
  if (!paths) throw new Error(`模型目录缺少 model.onnx / tokens.txt：${opts.modelDir}`);

  let tts = ttsCache.get(opts.modelDir);
  if (!tts) {
    const sherpa = loadSherpaModule();
    const config = {
      model: {
        vits: {
          model: paths.model,
          tokens: paths.tokens,
          ...(paths.lexicon ? { lexicon: paths.lexicon } : {}),
        },
        numThreads: 2,
        provider: 'cpu',
        debug: false,
      },
      // ruleFsts 做文本正则化（数字/日期/电话），缺文件不影响合成
      ...(findRuleFsts(paths.dir) ? { ruleFsts: findRuleFsts(paths.dir) } : {}),
    };
    tts = new sherpa.OfflineTts(config);
    ttsCache.set(opts.modelDir, tts);
  }

  const speed = Math.min(2, Math.max(0.5, opts.speed ?? 1));
  const audio = tts.generate({
    // 预处理：阿拉伯数字会被 lexicon 当 OOV 忽略，转汉字后再合成
    text: normalizeForTts(text),
    sid: opts.speakerId,
    speed,
    // ⚠️ 必须关掉外部缓冲区：`enableExternalBuffer` 默认 true，会让原生层直接映射内存，
    // 在部分运行时（tsx 转译 / express 进程内）创建会抛 `External buffers are not allowed`。
    // 关掉后返回普通 Float32Array，代价只是一次拷贝（毫秒级）。
    enableExternalBuffer: false,
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
  });
  if (!audio?.samples?.length) throw new Error('本地模型未产出音频');
  return { samples: audio.samples, sampleRate: audio.sampleRate };
}

/** 找 ruleFsts（可选，用于数字/日期规范化）。 */
function findRuleFsts(dir: string): string {
  const names = ['date.fst', 'number.fst', 'phone.fst', 'new_heteronym.fst'];
  const found = names.map((n) => path.join(dir, n)).filter((p) => existsSync(p));
  return found.join(',');
}

/**
 * 把 Float32 PCM 写成 16-bit WAV 字节。
 *
 * ⚠️ **必须先把样本拷进普通 Float32Array**：sherpa-onnx 返回的是「外部缓冲区」
 * （external buffer，直接映射原生内存），对它逐样本读取会抛
 * `External buffers are not allowed` —— 这是 napi 的限制，不是数据问题。
 * 拷贝一次（毫秒级）即可安全转换。
 */
export function pcmToWav(samples: Float32Array, sampleRate: number): Buffer {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);        // fmt chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  // 拷贝到普通数组：绕开 napi 外部缓冲区限制
  const plain = new Float32Array(n);
  for (let i = 0; i < n; i++) plain[i] = samples[i];
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, plain[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * aishell3 说话人精选表 —— **本表是「可用性优先」的默认值，不是声学结论**。
 *
 * ️ 重要：aishell3 的 174 个说话人**无官方性别/年龄标注**（编号形如 SSB0005）。
 * 因此这里按「常见角色 → 说话人编号」给出一份**分散选号**的预置映射，
 * 目的是**保证不同角色拿到不同声音**（可区分性），而不是保证「男主一定像男声」。
 * 用户若对某个角色音色不满意，可在 `api_tts_speak` 里传 voice: "local:<编号>" 覆盖。
 */
export const AISHELL3_ROLE_MAP: Record<string, number> = {
  '男主': 88, '女主': 12, '旁白': 0, '少年': 30, '少女': 45,
  '爷爷': 150, '奶奶': 120, '父亲': 100, '母亲': 60, '小孩': 70,
};

/** 说话人编号总数（aishell3 = 174）。 */
export const AISHELL3_SPEAKERS = 174;

/**
 * 纯函数：解析本地音色标识 → 说话人编号。
 * 支持三种写法：`local:88`（显式编号）/ `88`（纯数字）/ 角色名（查预置表）。
 * 解析不出时返回 null，由调用方决定回退策略。
 */
export function parseLocalVoice(voice: string, character: string): number | null {
  const v = String(voice || '').trim();
  if (v) {
    const m = /^(?:local:)?(\d{1,3})$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n < AISHELL3_SPEAKERS) return n;
    }
  }
  const name = String(character || '').trim();
  if (name && AISHELL3_ROLE_MAP[name] !== undefined) return AISHELL3_ROLE_MAP[name];
  return null;
}

/**
 * 按角色稳定分配说话人编号 —— 纯函数。
 * 未在预置表里的角色用「名字散列」分配（保证同角色恒定同编号、不同角色大概率不同）。
 */
export function pickSpeakerForRole(roleName: string, used: Set<number>): number {
  const preset = AISHELL3_ROLE_MAP[roleName];
  if (preset !== undefined && !used.has(preset)) return preset;
  // 散列兜底：同角色恒定结果，避免每次调用换声音
  let h = 0;
  for (let i = 0; i < roleName.length; i++) h = (h * 31 + roleName.charCodeAt(i)) % AISHELL3_SPEAKERS;
  let n = h;
  for (let i = 0; i < AISHELL3_SPEAKERS; i++) {
    const cand = (h + i) % AISHELL3_SPEAKERS;
    if (!used.has(cand)) { n = cand; break; }
  }
  return n;
}

/**
 * 文本预处理 —— 纯函数。
 * 模型的 lexicon 只认汉字与少量符号，**阿拉伯数字会触发 OOV 警告并被忽略**（实测日志可见）。
 * 这里把 0-9 转成汉字，避免「编号 88」被吃掉数字。
 */
export function normalizeForTts(text: string): string {
  const digits = '零一二三四五六七八九';
  return String(text || '')
    // 先处理「数值 + 单位」里的数字串，逐位读（8kHz 语音场景下逐位读更自然）
    .replace(/\d/g, (d) => digits[Number(d)]);
}