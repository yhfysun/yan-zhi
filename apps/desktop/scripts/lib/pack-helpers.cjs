#!/usr/bin/env node
/**
 * 打包脚本的纯逻辑层（可单测）。
 *
 * ★ 为什么把这些从 build-all-editions.cjs / electron-build.cjs 里抽出来：
 *   那两个脚本在 require 时就会执行完整打包链路（编译 + electron-builder，数分钟），
 *   无法直接单测。而这里的三件事恰恰是**出错代价最高、又最容易写错**的部分：
 *     1) 产物后缀解析（漏了 → 打出「后缀与内容档位不一致」的包）；
 *     2) 旧产物目录清理（清不掉 → EBUSY 中断，报错却看不出是锁）；
 *     3) 档位参数解析（拼错 → 静默打出兜底档的包）。
 *   抽成纯函数后可在裸 Node 下用假 fs 秒级验证。
 *
 * 约定：需要触碰文件系统的地方一律接受注入的 `fs`，便于测试构造「被占用」等异常。
 */
const fsDefault = require('fs');
const path = require('path');

/** 三档全集，顺序即默认构建顺序。 */
const ALL_EDITIONS = ['lite', 'basic', 'pro'];

/** 各档对应的 electron-builder 配置（lite 与 full 目前内容等价，保留映射以便日后分叉）。 */
const EDITION_CONFIG = {
  lite: 'electron-builder.lite.yml',
  basic: 'electron-builder.full.yml',
  pro: 'electron-builder.full.yml',
};

const EDITION_LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/**
 * 统一产物根目录（仓库根下的相对路径）。
 *
 * ★ 目录结构（2026-10-04 定稿，所有打包脚本共用，**单一真相源**）：
 *     dist-release/desktop/<档>/<版本>/   ← 桌面安装包 + win-unpacked/
 *     dist-release/android/<版本>/        ← app-debug.apk
 *   每档天生独立目录，旧的 `dist-release-<档>/` 平级散落模式与
 *   `YZ_SEPARATE_PREFIX` 前缀换目录绕锁的做法一并废除；
 *   被占用（EBUSY）时的绕法改为换根：`YZ_ALL_OUT_DIR`（build-all-editions.cjs /
 *   package.cjs 透传）或直接 `YZ_OUTPUT_DIR`（electron-build.cjs）。
 */
const DEFAULT_RELEASE_ROOT = 'dist-release';

/**
 * 读取某端 package.json 的 version（桌面 / 安卓目录路径的 `<版本>` 段）。
 * 读取失败或无 version 时兜底 '0.0.0' —— 不中断构建：electron-builder 自己
 * 也读同一份 package.json，真缺版本号时它会先报错，这里兜底只为让路径可预测。
 */
function resolvePkgVersion({ pkgPath, fs = fsDefault } = {}) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch {
    /* package.json 缺失 / 损坏 → 走兜底 */
  }
  return '0.0.0';
}

/**
 * 从产物后缀（如 '-pro'）推出档位目录名（'pro'）。
 * 空后缀兜底 'basic'（与 resolveArtifactSuffix 的兜底同源）；
 * 自定义后缀（如 '-v3-pro'）保留为 'v3-pro'，Windows 非法路径字符替换为 '-'。
 */
function editionDirName(artifactSuffix) {
  const name = String(artifactSuffix || '').replace(/^-+/, '').trim();
  if (!name) return 'basic';
  return name.replace(/[\\/:*?"<>|\s]+/g, '-');
}

/**
 * 规范化用户指定的产物名（`--name=v2` / `--name 办公版`）。
 *
 * 返回**带前导 `-` 的后缀**（`-v2`），与 edition.json 的 artifactSuffix 同形态；
 * 空值返回 ''，表示「没指定」。Windows 文件名非法字符一律替换为 `-`。
 *
 * ★ 为什么必须规范化：后缀直接拼进安装包名与目录名，原样透传时一个 `/`
 *   或 `:` 就让写盘失败，而报错只会说路径不存在，看不出是参数里的字符捅的。
 */
function normalizeArtifactSuffix(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/^-+/, '');
  return cleaned ? `-${cleaned}` : '';
}

/**
 * 本次构建的产物后缀 —— **唯一判定**（set-edition 与 build-all-editions 共用）。
 *
 * 优先级：显式 override（--name / YZ_ARTIFACT_SUFFIX）> 模式短码 > 纯档位。
 * ★ 两处判定必须同源：分叉会打出「目录名与安装包名不一致」的包，
 *   表现为产物散落到两个地方、用户找不到。
 */
function artifactSuffixFor({ edition, modes, override } = {}) {
  const custom = normalizeArtifactSuffix(override);
  if (custom) return custom;
  const list = Array.isArray(modes) ? modes.filter(Boolean) : [];
  return list.length ? `-${edition}-${list.join('-')}` : `-${edition}`;
}

/**
 * electron-builder 会复用（并需要清空重建）的 appOutDir，按平台列举。
 *
 * 同一输出目录连续构建多档时，上一档留在这里的 app.asar 有 200MB+，
 * 若被残留进程 / 杀软扫描持有，Windows 下删除会 EBUSY，
 * electron-builder 直接中断，报错却指向
 * `app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`（看不出是锁）。
 */
const APP_OUT_DIRS = ['win-unpacked', 'win-ia32-unpacked', 'mac', 'mac-arm64', 'linux-unpacked'];

/**
 * 解析产物名后缀。
 *
 * 优先环境变量，其次 edition.json，最后兜底 '-basic'。
 *
 * ★ 为什么必须有兜底而不是留空：electron-builder 展开 `${env.X}` 时
 *   变量不存在会直接抛 InvalidConfigurationError（不是忽略），留空即构建失败。
 *   ★ 为什么兜底是 basic 而不是别的：env / 配置文件写错属工程事故，
 *   按最小可用档跑比按最高档跑安全。
 */
function resolveArtifactSuffix({ fromEnv, editionJsonPath, fs = fsDefault } = {}) {
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(fs.readFileSync(editionJsonPath, 'utf8'));
    if (cfg && typeof cfg.artifactSuffix === 'string' && cfg.artifactSuffix) return cfg.artifactSuffix;
  } catch {
    /* edition.json 不存在（未跑 set-edition）→ 走兜底 */
  }
  return '-basic';
}

/**
 * 校验「输出目录可写且旧产物可清理」。
 *
 * ★ 为什么单独抽出来：这是同目录多档构建的**唯一硬约束**。
 *   安装包名带档位后缀，彼此不冲突，所以多档同目录本身没问题；
 *   真正会失败的是复用的 appOutDir（win-unpacked/）删不掉 —— 被残留进程或
 *   杀软扫描持有句柄时 EBUSY，electron-builder 报的却是
 *   ERR_ELECTRON_BUILDER_CANNOT_EXECUTE（看不出是锁）。
 *   与其等到打包中途炸，不如开工前先探一次：能提前几十秒给出可操作的提示。
 */
function checkOutputDirReady(outputDir, fs = fsDefault) {
  const blockers = [];
  for (const name of APP_OUT_DIRS) {
    const target = path.join(outputDir, name);
    if (!fs.existsSync(target)) continue;
    // 只探不改：真正删除由 clearAppOutDirs 负责，这里避免重复副作用。
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 1 });
    } catch (err) {
      blockers.push({ dir: target, code: err.code || 'UNKNOWN' });
    }
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * 清理输出目录下所有复用的 appOutDir。
 *
 * 不抛异常，而是把结果回给调用方 —— 由脚本决定如何呈现与退出码。
 * ★ 刻意不提供「清理失败就换个目录」的选项：产物路径必须可预测，
 *   静默改到 dist-release-<时间戳> 会让产物散落多处、用户找不到包。
 *
 * @returns {{removed: string[], failed: Array<{dir: string, code: string, message: string}>}}
 */
function clearAppOutDirs(outputDir, fs = fsDefault) {
  const removed = [];
  const failed = [];
  for (const name of APP_OUT_DIRS) {
    const target = path.join(outputDir, name);
    if (!fs.existsSync(target)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
      removed.push(target);
    } catch (err) {
      failed.push({ dir: target, code: err.code || 'UNKNOWN', message: err.message });
    }
  }
  return { removed, failed };
}

/**
 * 解析 build-all-editions.cjs 的命令行。
 *
 * @returns {{editions: string[], separate: boolean, invalid: string[]}}
 */
function parseEditionsArgv(argv) {
  const raw = (argv || []).filter((a) => typeof a === 'string');
  const separate = raw.includes('--separate');
  const requested = raw.filter((a) => !a.startsWith('-'));
  const editions = requested.length ? requested : ALL_EDITIONS;
  const invalid = editions.filter((e) => !ALL_EDITIONS.includes(e));
  return { editions, separate, invalid };
}

/**
 * 桌面某档的输出目录（绝对路径）：dist-release/desktop/<档>/<版本>/。
 *
 * `dirName` 覆盖中间的目录名 —— 用 `--name` 自定义命名时传进来，
 * 这样每个命名各占一个目录，重打包不会碰上一份产物。
 */
function outDirForEdition(edition, { repoRoot, version, outRoot = DEFAULT_RELEASE_ROOT, dirName } = {}) {
  return path.resolve(repoRoot, outRoot, 'desktop', dirName || edition, version || '0.0.0');
}

/** 安卓 APK 的输出目录（绝对路径）：dist-release/android/<版本>/。 */
function androidOutDir({ repoRoot, version, outRoot = DEFAULT_RELEASE_ROOT }) {
  return path.resolve(repoRoot, outRoot, 'android', version || '0.0.0');
}

/**
 * 清理 dist-release/desktop/<档>/ 下过期的**版本目录**。
 *
 * ★★ 为什么需要（2026-10-17）：每升一次版本（apps/desktop/package.json 的 version），
 *   构建都会新建 `dist-release/desktop/<档>/<版本>/`；旧版本目录从不清理 → 反复累积。
 *   这是 C 盘「又不够了」的元凶之一（另一元凶见 scripts/package.cjs 的 tmp/_pkgbak 备份）。
 *
 * 行为：每个档位把版本目录名（即版本号字符串）升序排，保留最新的 `keep` 个，删其余。
 *   · 版本号目录名来自 resolvePkgVersion，形如 `0.1.0` / `0.1.0-r8`，字符串升序即时间升序；
 *   · 只删 `dist-release/desktop/<档>/` 下的**子目录**，不动交付物、不删当前构建目录；
 *   · 删不动（被占用）的项跳过，下次构建再清 —— 不报错、不中断。
 *
 * @param {string} root 仓库根
 * @param {{keep?: number, fs?: object}} [opts]
 * @returns {{removed: string[], kept: string[]}}
 */
function pruneOldReleases(root, { keep = 2, fs = fsDefault } = {}) {
  const removed = [];
  const kept = [];
  const desktopRoot = path.join(root, DEFAULT_RELEASE_ROOT, 'desktop');
  if (!fs.existsSync(desktopRoot)) return { removed, kept };
  for (const edition of ALL_EDITIONS) {
    const edDir = path.join(desktopRoot, edition);
    if (!fs.existsSync(edDir)) continue;
    let names;
    try {
      names = fs.readdirSync(edDir).filter((n) => {
        try { return fs.statSync(path.join(edDir, n)).isDirectory(); } catch { return false; }
      }).sort();
    } catch { continue; }
    const excess = names.slice(0, Math.max(0, names.length - keep));
    for (const n of excess) {
      const p = path.join(edDir, n);
      try {
        fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
        removed.push(p);
      } catch { /* 占用则跳过，下次再清 */ }
    }
    kept.push(...names.slice(Math.max(0, names.length - keep)).map((n) => path.join(edDir, n)));
  }
  return { removed, kept };
}


/**
 * 安卓工具链（SDK / JDK）候选路径 —— **纯函数，可单测**。
 *
 * ★★ 为什么必须抽出来（2026-10-08）：
 *   preflight 检查与 gradle 执行读的是同一组路径。原先两处各写一份 Windows 硬编码
 *   （`C:\Android\Sdk` / `C:\APP\Java\jdk-21…`），后果有两个：
 *     · 换机器要改两处，漏一处 → 「检查通过但 gradle 找不到 SDK」；
 *     · **CI（ubuntu）上三处硬编码全不成立 → 构建直接被前置检查拦死**。
 *   抽到这里后，包内只有一份定义，且能用假 fs 把「CI 环境」也测到 ——
 *   这类平台分支在真机上无法在一台机器里同时验证。
 *
 * @param {object} opts
 * @param {string} opts.platform  process.platform
 * @param {object} opts.env       process.env（取 ANDROID_HOME / JAVA_HOME / HOME 等）
 * @param {string} [opts.delimiter] PATH 分隔符（win32 为 ';'，其余 ':'）
 * @returns {{sdkCandidates: string[], javaCandidates: string[]}}
 */
function androidToolchainCandidates({ platform = process.platform, env = {}, delimiter } = {}) {
  const isWin = platform === 'win32';
  const d = delimiter || (isWin ? ';' : ':');

  const sdkCandidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    ...(isWin
      ? ['C:\\Android\\Sdk', env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android', 'Sdk') : null]
      : [
          env.HOME ? path.join(env.HOME, 'Android', 'Sdk') : null,
          // ubuntu runner 自带 SDK 的默认落点（android-actions/setup-android 同源）
          '/usr/local/lib/android/sdk',
          '/opt/android-sdk',
        ]),
  ].filter(Boolean);

  const javaCandidates = [
    env.JAVA_HOME,
    ...(isWin ? ['C:\\APP\\Java\\jdk-21.0.12.1+1'] : []),
  ].filter(Boolean);

  // ★ PATH 反推：gradle 要的是 JAVA_HOME，而 CI 往往只把 javac 放进 PATH。
  //   注意不能断言 PATH 上有 `javac` —— setup-java 在部分镜像上只放 java/java.exe，
  //   所以两个名字都认，命中后取其所在目录的上一级（<home>/bin/javac → <home>）。
  const javacNames = isWin ? ['javac.exe', 'java.exe'] : ['javac', 'java'];
  const pathDirs = String(env.PATH || '').split(d).filter(Boolean);
  return { sdkCandidates, javaCandidates, javacNames, pathDirs };
}

/**
 * 从候选里挑出**可用**的 SDK / JDK（存在性判据由调用方注入，便于测试）。
 *
 * @param {object} opts
 * @param {string[]} opts.sdkCandidates
 * @param {string[]} opts.javaCandidates
 * @param {string[]} opts.javacNames
 * @param {string[]} opts.pathDirs
 * @param {(p: string) => boolean} opts.exists  判存在（SDK 判 platform-tools，JDK 判 bin/javac）
 * @param {(dir: string, name: string) => boolean} opts.existsIn  判 dir/name 是否存在
 * @param {(p: string) => string} opts.dirname
 */
function resolveAndroidToolchain({
  sdkCandidates = [],
  javaCandidates = [],
  javacNames = [],
  pathDirs = [],
  exists = () => false,
  existsIn = () => false,
  dirname = (p) => path.dirname(p),
} = {}) {
  const sdk = sdkCandidates.find((p) => exists(p)) || null;

  let javaHome = javaCandidates.find((p) => exists(p)) || null;
  let javaSource = javaHome ? 'env' : null;
  if (!javaHome) {
    for (const dir of pathDirs) {
      if (javacNames.some((n) => existsIn(dir, n))) {
        javaHome = dirname(dir);
        javaSource = 'PATH';
        break;
      }
    }
  }
  return { sdk, javaHome, javaSource };
}

/**
 * 解析 pnpm 的启动方式（★★ 2026-10-18 加固，三处裸 spawn('pnpm') 的收口点）。
 *
 * ★ 本机病灶：三套 node（受管 / nvm / Program Files）都**没有独立安装 pnpm**
 *   （`where pnpm` 为空，node 目录里只有 corepack）。直接 spawn('pnpm') 报
 *   「'pnpm' 不是内部或外部命令」，看起来像"pnpm 没装"，实际 pnpm 能力一直
 *   都在 —— 由 corepack 托管（缓存于 %LOCALAPPDATA%/node/corepack/v1/pnpm）。
 *
 * 解析顺序：
 *   ① corepack.js（随 node 分发，位于 <node目录>/node_modules/corepack/dist/）
 *      → `node corepack.js pnpm <args>`，完全不依赖 PATH；
 *   ② 兜底裸 'pnpm'（环境真装了 pnpm 的场景，保留原行为）。
 *
 * 返回 { cmd, argv, extraEnv, via }：extraEnv 在走 corepack 时带
 * COREPACK_ENABLE_DOWNLOAD_PROMPT=0 —— 缓存未命中的机器上不弹交互确认
 * （打包脚本全是非交互链路，弹窗 = 挂死）。
 *
 * 纯逻辑：fs 探测注入 `exists`，便于在裸 Node 下单测两条分支。
 */
function resolvePnpm(argv, { exists = (p) => fsDefault.existsSync(p), execPath = process.execPath } = {}) {
  const corepackJs = path.join(path.dirname(execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  if (exists(corepackJs)) {
    return {
      cmd: execPath,
      argv: [corepackJs, 'pnpm', ...argv],
      extraEnv: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
      via: 'corepack（node 直调 corepack.js，不依赖 PATH）',
    };
  }
  return { cmd: 'pnpm', argv, extraEnv: undefined, via: 'PATH 上的 pnpm（兜底）' };
}

module.exports = {
  ALL_EDITIONS,
  EDITION_CONFIG,
  EDITION_LABEL,
  DEFAULT_RELEASE_ROOT,
  APP_OUT_DIRS,
  resolveArtifactSuffix,
  normalizeArtifactSuffix,
  artifactSuffixFor,
  resolvePkgVersion,
  resolvePnpm,
  editionDirName,
  checkOutputDirReady,
  clearAppOutDirs,
  parseEditionsArgv,
  outDirForEdition,
  androidOutDir,
  pruneOldReleases,
  androidToolchainCandidates,
  resolveAndroidToolchain,
};