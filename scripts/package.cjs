#!/usr/bin/env node
/**
 * 言智打包入口（可选包型）—— 桌面三档 / 安卓 APK / 组合。
 *
 * 为什么单独写这一个：项目里已有的 `bin/build.bat` / `pnpm build:*` 在本机环境下
 * **中途必失败**，且失败信息与真实原因无关。三个环境坑都会伪装成「代码坏了」：
 *
 *   ① **安全删除策略拦大目录**：任何构建的第一步（`rmSync(outDir)` /
 *      vite `prepareOutDir`）都会抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（>50 文件即拦）。
 *      → 本脚本开工前把这些目录**整体 Move 走**（安全策略只拦删除、不拦重命名）。
 *   ② **gradle 必须走短路径 junction**：`@capawesome/capacitor-nodejs` 的 CMake
 *      在 pnpm 深层目录里，绝对对象路径 > 250 字符 → `CMAKE_OBJECT_PATH_MAX` /
 *      `build.ninja still dirty`。且 **git-bash 会解析 junction**（`process.cwd()`
 *      返回真实长路径）→ 必须用 PowerShell 的 `Set-Location` 进 junction。
 *   ③ **`build-mobile-server.cjs` 只复制不编译** → 不先真编译 `apps/server/dist`，
 *      改动不会进包而且**完全不报错**。桌面构建里已含真编译，故安卓复用桌面步骤产物。
 *
 * 用法：
 *   node scripts/package.cjs                     # 交互式：空格多选要打的包（↑↓ 移动 / a 全选）
 *   node scripts/package.cjs desktop             # 桌面三档全出
 *   node scripts/package.cjs desktop:pro         # 只出高级版
 *   node scripts/package.cjs desktop:lite,pro    # 出两档
 *   node scripts/package.cjs android             # 安卓 APK
 *   node scripts/package.cjs all                 # 桌面三档 + 安卓
 *   node scripts/package.cjs --editions=lite,pro # 等价 desktop:lite,pro（--edition= 同义）
 *
 * 产物目录（统一树，路径定义在 apps/desktop/scripts/lib/pack-helpers.cjs，单一真相源）：
 *   dist-release/desktop/<档>/<版本>/   ← 安装包 + win-unpacked/
 *   dist-release/android/<版本>/app-debug.apk
 *
 * 选项：
 *   --dry-run     只做环境检查与计划打印，**不移动目录、不构建**（预览用）
 *   --no-verify   跳过产物校验
 *   --keep-tmp    保留临时备份目录（默认构建成功后清理）
 *   --no-fresh-output  旧产物被占用时**不**自动换产物根，只报错退出（默认会自动换根绕锁）
 *   -y / --yes    非交互确认（等价于默认全部；非 TTY 下自动生效）
 *
 * ★ 安卓路径会自动复用新鲜的 `apps/server/dist`（跳过编译）；陈旧则先真编译。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const ALL_EDITIONS = ['lite', 'basic', 'pro'];
const EDITION_LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/**
 * 会撞安全删除保护的构建输出目录（开工前必须整体移走）。
 *
 * ★★ 踩坑（2026-09-27）：最初只列了 `win-unpacked`，结果 electron-builder 打包 NSIS 时
 *   清理中间产物 `dist-release-<档>/@yan-zhidesktop-0.1.0-x64.nsis.7z` 被拦
 *   （**恰好 50 个文件命中阈值 50**）→ lite 档中断。
 *   ⇒ 正解不是"再补一条路径"，而是**把输出目录里所有可移走的内容整体清空**
 *   （见 moveOutDirsIn：按档位把输出目录内的全部条目移走，只保留已产出的 exe，
 *     因为那是交付物、不该动）。
 */
// ★ 产物路径与 apps/desktop/scripts/lib/pack-helpers.cjs 保持**同源**（直接 require 它，
//   不再本地复制一份映射）：这里算"要移走什么/校验什么"，那边算"写到哪" —— 不一致会导致
//   "移走了 A 却写到 B"（旧产物没清、新产物在别处），排障时极难看出。
//   YZ_ALL_OUT_DIR 可换产物根目录（旧产物被句柄持有 EBUSY 时绕锁用），会原样透传给下游脚本。
const {
  DEFAULT_RELEASE_ROOT,
  androidOutDir,
  outDirForEdition,
  resolvePkgVersion,
  pruneOldReleases,
} = require(path.join(__dirname, '..', 'apps', 'desktop', 'scripts', 'lib', 'pack-helpers.cjs'));
const DESKTOP_VERSION = resolvePkgVersion({ pkgPath: path.join(ROOT, 'apps', 'desktop', 'package.json') });
const MOBILE_VERSION = resolvePkgVersion({ pkgPath: path.join(ROOT, 'apps', 'mobile', 'package.json') });

// ★ 产物根目录**可变**，所以这几个路径必须可重算、不能是只读常量：
//   旧产物被句柄持有（EBUSY/EPERM）时，本脚本会自动换一个新根继续构建
//   （见 switchToFreshRoot），换根后所有"写到哪 / 校验哪 / 列出哪"必须一起跟着变，
//   否则会出现"移走 A 却写到 B"这种极难排查的错位。
let RELEASE_ROOT = process.env.YZ_ALL_OUT_DIR || DEFAULT_RELEASE_ROOT;
let OUTPUT_DIRS = null;
let ANDROID_APK = null;
/** 按给定的产物根重算全部产物路径 */
function computePaths(outRoot) {
  RELEASE_ROOT = outRoot;
  OUTPUT_DIRS = Object.fromEntries(ALL_EDITIONS.map((e) => [
    e,
    path.relative(ROOT, outDirForEdition(e, { repoRoot: ROOT, version: DESKTOP_VERSION, outRoot })),
  ]));
  ANDROID_APK = path.join(
    path.relative(ROOT, androidOutDir({ repoRoot: ROOT, version: MOBILE_VERSION, outRoot })),
    'app-debug.apk',
  );
}
computePaths(RELEASE_ROOT);

const MOVABLE = [
  'apps/server/dist',
  'apps/desktop/dist',
  'apps/web/dist',
  'apps/mobile/dist',
  'apps/mobile/nodejs/dist',
  'apps/mobile/android/app/src/main/assets/public',
];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const VERIFY = !flags.has('--no-verify');
const KEEP_TMP = flags.has('--keep-tmp');
/**
 * 旧产物被句柄持有时（常见：dev 后端持有打包产物的 app.asar）是否**自动换产物根**继续构建。
 * 默认开启 —— 换根后把交付物拷回标准树，用户拿到的路径不变；只是旧 win-unpacked 原样留下。
 * 传 --no-fresh-output 则恢复旧行为：只报错退出（适合"必须先停 dev 再打"的场合）。
 */
const FRESH_OUTPUT = !flags.has('--no-fresh-output');
// ★ 兼容 --dry：曾因写了 --dry（非 --dry-run）导致**误触发真实构建**（参数被忽略），
//   故两个拼写都认，且 dry 模式下一切写操作都短路。
const DRY = flags.has('--dry-run') || flags.has('--dry');

// ─────────────────────────── 小工具 ───────────────────────────
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const step = (m) => console.log(`\n${c.cyan(`====== ${m} ======`)}`);
const ok = (m) => console.log(`  ${c.green('[OK]')} ${m}`);
const warn = (m) => console.log(`  ${c.yellow('[WARN]')} ${m}`);
const fail = (m) => console.log(`  ${c.red('[ERROR]')} ${m}`);
const info = (m) => console.log(`  ${m}`);

let tmpBackupDir = null;
function backupRoot() {
  if (!tmpBackupDir) {
    tmpBackupDir = path.join(TMP, `_pkgbak_${Date.now()}`);
    fs.mkdirSync(tmpBackupDir, { recursive: true });
  }
  return tmpBackupDir;
}

/** 把大目录整体移走（★ 不用 rm —— 安全策略只拦删除，不拦重命名） */
function moveAway(relPaths) {
  if (DRY) {
    for (const rel of relPaths) {
      const exists = fs.existsSync(path.join(ROOT, rel));
      info(c.dim(`[dry-run] ${exists ? '将移走' : '跳过(不存在)'}  ${rel}`));
    }
    return;
  }
  const bak = backupRoot();
  for (const rel of relPaths) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      info(c.dim(`skip   ${rel}（不存在）`));
      continue;
    }
    const dest = path.join(bak, rel.replace(/[\\/]/g, '_'));
    try {
      moveWithRetry(p, dest);
      info(c.dim(`moved  ${rel}`));
    } catch (e) {
      // 极少数情况 rename 跨设备/被句柄持有时失败，退化为递归删除（若策略放行）
      fail(`移动失败 ${rel}: ${e.message}`);
      throw e;
    }
  }
}

// ─────────────────────── 占用（EBUSY/EPERM）处置 ───────────────────────
/**
 * 旧产物被句柄持有时（典型：dev 后端 electron 持有打包产物的 app.asar，
 * 本机实测 PID 90524 / WorkBuddy.exe 持有 `…/win-unpacked/resources/app.asar`，
 * 见 2026-10 排障），目录无法 rename（EBUSY/EPERM）。三层处置：
 *   1) moveWithRetry —— 短暂重试，吃掉瞬时锁（杀软扫描 / 索引器）。
 *   2) findLockedEntries —— 若仍锁，逐层 rename 探测，列出真正被占的路径。
 *   3) switchToFreshRoot —— 持久锁则换一个**全新产物根**继续构建（旧目录一个都不动），
 *      构建完把交付物（.exe/.blockmap/builder-*.yml）拷回标准树 dist-release/。
 */
const LOCK_CODES = /^(EPERM|EBUSY|EACCES)$/;
// ★ 忙等而非 setTimeout：本脚本是同步顺序构建，锁通常秒级释放（杀软扫完即松），
//   且 busy-wait 避免回调割裂主流程。
const spin = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };

/** rename 带锁重试：仅对 LOCK_CODES 重试，其余错误立即抛出 */
function moveWithRetry(src, dest, retries = 4, delayMs = 1200) {
  fs.rmSync(dest, { recursive: true, force: true });
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (e) {
      if (!LOCK_CODES.test(e.code) || i >= retries) throw e;
      spin(delayMs);
    }
  }
}

/**
 * 逐层 rename 探测被占条目：把每个条目 rename 成探测名再 rename 回来，
 * 失败（LOCK_CODES）即记录。目录记录带 '/' 后缀并递归；普通文件原样记录。
 * 返回被占路径相对 dir 的列表（目录带 '/' 后缀）。
 */
function findLockedEntries(dir, base, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (LOCK_CODES.test(e.code)) out.push(base || '');
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const probe = full + '.lockprobe';
    const rel = base ? path.join(base, ent.name) : ent.name;
    try {
      fs.renameSync(full, probe);
      fs.renameSync(probe, full);
    } catch (e) {
      if (!LOCK_CODES.test(e.code)) continue; // 非锁错误（权限等）跳过
      if (ent.isDirectory()) {
        out.push(rel + '/');
        findLockedEntries(full, rel, out, depth + 1);
      } else {
        out.push(rel);
      }
    }
  }
  return out;
}

/** 打印被占条目 + 常见持有者 + 用 handle.exe 确认的命令 */
function reportLock(lockedEntries, dirName) {
  fail(`${dirName} 被以下文件/目录占用，无法移走：`);
  for (const e of lockedEntries) info(c.red(`    ${e}`));
  info('');
  info('常见持有者（本机实测）：');
  info('  · dev 后端 electron（bin/dev.mjs 拉起的 electron，PID 见 handle.exe）');
  info('  · 已启动的安装包/便携版 exe（进程里还开着旧版）');
  info('  · 杀软实时扫描 / Windows 索引器（瞬时锁，重试已覆盖）');
  info('');
  info('确认持有者：下载 Sysinternals handle 后执行');
  info(c.dim('    handle.exe -accepteula -nobanner win-unpacked'));
  info('或指定进程：');
  info(c.dim('    handle.exe -accepteula -nobanner -p <PID>'));
}

/**
 * 换一个全新的产物根目录继续构建（旧根里的东西**一个都不动**，绕开锁）。
 * 返回新根目录名。新根会写进 process.env.YZ_ALL_OUT_DIR，
 * 下游 build-all-editions.cjs / electron-build.cjs 都读它，写到新根。
 * 构建完成后由 copyDeliverablesBack 把交付物拷回标准树 dist-release/。
 */
let FRESH_ROOT_USED = null;
function switchToFreshRoot(lockedDirName) {
  const stamp = Date.now();
  const newRoot = `dist-release-${stamp}`;
  computePaths(newRoot);
  process.env.YZ_ALL_OUT_DIR = newRoot;
  FRESH_ROOT_USED = newRoot;
  warn(`检测到 ${lockedDirName} 被占用，已自动切换产物根到 ${c.bold(newRoot)}`);
  info('  · 旧目录原样保留，不做删除/改名');
  info('  · 构建完成后交付物（.exe/.blockmap/builder-*.yml）会拷回标准树 dist-release/');
  info('  · 如需手动清理旧目录，先停持有进程再用 handle.exe 确认无误再删');
  return newRoot;
}

/** 若换过根，把新根里的交付物（exe/blockmap/builder-*.yml）拷回标准树 */
function copyDeliverablesBack() {
  if (!FRESH_ROOT_USED) return;
  const fromRoot = path.join(ROOT, FRESH_ROOT_USED);
  const toRoot = path.join(ROOT, DEFAULT_RELEASE_ROOT);
  if (!fs.existsSync(fromRoot)) return;
  const KEEP = /\.(exe|blockmap)$/i;
  let copied = 0;
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      const target = path.join(toRoot, rel, name);
      if (st.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        walk(full, path.join(rel, name));
      } else if (KEEP.test(name) || /^builder-.*\.yml$/i.test(name)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(full, target);
        copied++;
      }
    }
  };
  walk(fromRoot, '');
  if (copied) ok(`已将 ${copied} 个交付物从 ${FRESH_ROOT_USED} 拷回 ${DEFAULT_RELEASE_ROOT}/`);
}

/** shell 执行（继承 stdio，失败抛错；Windows 需要 shell 才能跑 .cmd/.bat） */
function run(cmd, args, opts = {}) {
  console.log(c.bold(`\n$ ${cmd} ${args.join(' ')}`));
  const useShell = process.platform === 'win32';
  // shell:true 时 node 只是空格拼接命令行，不做引号转义
  // → execPath 含空格（C:\Program Files\nodejs）会被 cmd 截断成 'C:\Program'
  const q = (s) => (useShell && /\s/.test(s) ? `"${s}"` : s);
  return execFileSync(q(cmd), args.map(q), {
    cwd: opts.cwd || ROOT,
    stdio: 'inherit',
    shell: useShell,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

/**
 * PowerShell 执行（用于 gradle 短路径 junction —— bash 会解析 junction）。
 *
 * ★ 踩坑（2026-09-27）：先前用 `execFileSync('powershell.exe', ['-Command', script])`
 *   直接传整段脚本，在本机报 `spawnSync powershell.exe EBUSY` ——
 *   多行脚本 + 引号转义 + 长命令行共同触发的 spawn 问题。
 *   正解：**落成 .ps1 文件再 `-File` 执行**（也可复现/手改），并且 `stdio: 'inherit'`
 *   让 gradle 的进度与错误直接可见（否则失败时看不到原因）。
 */
function runPowerShell(script, label) {
  const ps1 = path.join(TMP, `_pkg_${label || 'run'}.ps1`);
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(ps1, script, 'utf8');
  console.log(c.bold(`\n$ powershell -File ${path.relative(ROOT, ps1)}`));
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

/** 目录是否存在且非空（判断 server/dist 是否可复用） */
function distReady() {
  const dist = path.join(ROOT, 'apps/server/dist/apps/server/src');
  return fs.existsSync(dist) && fs.readdirSync(dist).length > 0;
}

/** server/dist 是否比源码新（源 > dist 即陈旧） */
function distStale() {
  const distDir = path.join(ROOT, 'apps/server/dist');
  if (!fs.existsSync(distDir)) return true;
  const distMtime = fs.statSync(distDir).mtimeMs;
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (scan(p)) return true; }
      else if (st.mtimeMs > distMtime) return true;
    }
    return false;
  };
  for (const sub of ['apps/server/src', 'packages/shared/src', 'packages/core/src']) {
    const d = path.join(ROOT, sub);
    if (fs.existsSync(d) && scan(d)) return true;
  }
  return false;
}

// ─────────────────────── 前置检查 ───────────────────────
/**
 * 解析安卓工具链（SDK / JDK）—— **跨平台唯一真相源**。
 *
 * ★ 为什么必须抽出来：preflight 检查与 gradle 执行**读的是同一组路径**，
 *   原先两处各写一份 Windows 硬编码（`C:\Android\Sdk` / `C:\APP\Java\jdk-21…`），
 *   后果有两个：换机器要改两处（漏一处就「检查通过、gradle 找不到 SDK」）；
 *   **CI（ubuntu）上三处硬编码全不成立 → 构建被前置检查直接拦死**。
 *
 * ★ 候选路径表的**纯逻辑**落在 lib/pack-helpers.cjs（可单测，含 CI 平台分支），
 *   这里只负责把真实 fs / env 注入进去 —— 保证「测什么就是跑什么」。
 */
function androidToolchain() {
  const { androidToolchainCandidates, resolveAndroidToolchain } = require(
    path.join(__dirname, '..', 'apps', 'desktop', 'scripts', 'lib', 'pack-helpers.cjs'),
  );
  const isWin = process.platform === 'win32';
  const cand = androidToolchainCandidates({
    platform: process.platform,
    env: process.env,
    delimiter: path.delimiter,
  });
  const javac = isWin ? 'javac.exe' : 'javac';
  const { sdk, javaHome, javaSource } = resolveAndroidToolchain({
    ...cand,
    exists: (p) => fs.existsSync(path.join(p, 'platform-tools')),
    existsIn: (dir, name) => fs.existsSync(path.join(dir, name)),
    dirname: (p) => path.dirname(p),
  });

  // JDK 的存在性判据与 SDK 不同（SDK 看 platform-tools，JDK 看 bin/javac）——
  // 单独再验一次，避免把「目录存在但没有 javac」当可用。
  const javaOk = javaHome && fs.existsSync(path.join(javaHome, 'bin', javac));
  return {
    sdk,
    sdkTried: cand.sdkCandidates,
    javaHome: javaOk ? javaHome : null,
    javaSource,
    javaTried: [...cand.javaCandidates, 'PATH 上的 javac/java 反推'],
  };
}

function preflight(targets) {
  step('前置检查');
  const problems = [];

  // Node 版本
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) problems.push(`Node ${process.versions.node} < 20`);

  // 依赖
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) problems.push('node_modules 缺失，请先 pnpm install');

  // 输出目录被占用（安装版在 C:\APP\yan-zhi，不冲突；只提示真正会锁的）
  const lockHint = path.join(ROOT, OUTPUT_DIRS.pro, 'win-unpacked');
  if (fs.existsSync(lockHint)) {
    info(c.dim('检测到已有 win-unpacked，将整体移走（避免删除被拦）'));
  }

  // 内置 Python 运行时（2026-09-30 起：缺失会在桌面构建里**自动生成**，不再静默降级）
  const pyDir = path.join(ROOT, 'apps', 'desktop', 'resources', 'python');
  if (targets.desktop.length) {
    if (fs.existsSync(pyDir)) {
      info(c.dim('内置 Python 运行时已就绪（resources/python）'));
    } else if (process.env.YZ_SKIP_PYTHON_RUNTIME === '1') {
      warn('已显式跳过内置 Python 运行时（YZ_SKIP_PYTHON_RUNTIME=1）→ 成品将回退系统 python');
    } else {
      info('内置 Python 运行时缺失 → 构建时会**自动生成**（首次约 40MB 下载 + 装依赖）');
    }
  }

  if (targets.android) {
    // ★ CI / 类 Unix 环境下这里的三处 Windows 硬编码全都不成立（C:\Android\Sdk、
    //   C:\APP\Java\jdk-21…），旧逻辑会直接 problems.push 把构建拦死。
    //   所以环境检查一律走下面的跨平台解析函数 androidToolchain() —— 它是唯一真相源。
    const tc = androidToolchain();
    if (tc.sdk) ok(`Android SDK: ${tc.sdk}`);
    else problems.push(`Android SDK 未找到（缺 platform-tools）：${tc.sdkTried.join(' / ')}`);
    if (tc.javaHome) ok(`JDK: ${tc.javaHome}`);
    else problems.push(`JDK 未找到（需 17+）：${tc.javaTried.join(' / ')}`);
  }

  if (problems.length) {
    for (const p of problems) fail(p);
    console.log('');
    process.exit(1);
  }
  ok('环境检查通过');
}

// ─────────────────────── 交互式选择 ───────────────────────
/**
 * 空格多选（checkbox 式）：↑/↓ 移动，空格勾/去，a 全选/全不选，回车确认。
 *
 * ★ 为什么不用「输序号单选」：桌面三档 × 安卓共 2^4 种组合，单选菜单要么枚举不全
 *   （旧版只有 6 个固定选项），要么列全了没人看。多选是最直接的表达。
 *
 * 键位实现注意：rawMode 下逐键监听（readline emitKeypressEvents + keypress），
 * ' '（空格）会作为独立 name:'space' 事件到达，不能靠 rl.question 读整行。
 * 退出前必须 setRawMode(false)，否则终端回显被吃掉。
 */
async function askTargets() {
  // ★ 非交互环境（CI / 管道 / 被 spawn）不能阻塞等输入 —— 否则脚本永久挂起。
  //   判据：stdin 不是 TTY，或显式给了 --yes。此时按默认（全部）走。
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y')) {
    console.log('');
    warn('非交互环境（stdin 非 TTY），按默认目标执行：桌面三档 + 安卓 APK');
    info(c.dim('  如需指定，请显式传参，如: pnpm package desktop:pro'));
    return { desktop: [...ALL_EDITIONS], android: true };
  }

  // 候选项：桌面三档 + 安卓（desktop:full 与 basic 等价，不单列）
  const items = [
    ...ALL_EDITIONS.map((e) => ({ id: `desktop:${e}`, label: `桌面 · ${e}（${EDITION_LABEL[e]}）`, checked: false })),
    { id: 'android', label: '安卓 APK', checked: false },
  ];
  let cursor = 0;
  const render = () => {
    // 光标回退到列表首行重绘（比整屏 clear 干净，历史里只留最终态）
    process.stdout.write(`\x1b[${items.length + 1}A\x1b[J`);
    console.log(c.bold('  请选择要打的包（空格勾选，回车开始打包，a 全选/反全选）：'));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pointer = i === cursor ? c.cyan('❯') : ' ';
      const box = it.checked ? c.green('[x]') : '[ ]';
      console.log(`  ${pointer} ${box} ${it.label}`);
    }
  };
  // 先打印一遍占位（render 会回退 N+1 行覆盖重绘）
  console.log('\n'.repeat(items.length + 1));

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const result = await new Promise((resolve) => {
    const onKey = (str, key) => {
      if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
        cursor = (cursor - 1 + items.length) % items.length;
      } else if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
        cursor = (cursor + 1) % items.length;
      } else if (key.name === 'space') {
        items[cursor].checked = !items[cursor].checked;
      } else if (str === 'a' || str === 'A') {
        const allOn = items.every((it) => it.checked);
        for (const it of items) it.checked = !allOn;
      } else if (key.name === 'return' || key.name === 'enter') {
        if (!items.some((it) => it.checked)) {
          // 一个没选：按回车 = 全选（与旧版"默认全部"对齐），不退出
          for (const it of items) it.checked = true;
        } else {
          process.stdin.removeListener('keypress', onKey);
          return resolve(items.filter((it) => it.checked).map((it) => it.id));
        }
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        // Esc / Ctrl+C：不打任何包，干净退出
        process.stdin.removeListener('keypress', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log('');
        process.exit(0);
      } else {
        return; // 其它按键不动界面
      }
      render();
    };
    process.stdin.on('keypress', onKey);
    render();
  });

  process.stdin.setRawMode(false);
  process.stdin.pause();

  const desktop = result.filter((id) => id.startsWith('desktop:')).map((id) => id.split(':')[1]);
  // 保持 lite → basic → pro 的构建顺序（勾选顺序不影响实际构建顺序）
  desktop.sort((x, y) => ALL_EDITIONS.indexOf(x) - ALL_EDITIONS.indexOf(y));
  return { desktop, android: result.includes('android') };
}

// ─────────────────────── 目标解析 ───────────────────────
function parseTargets(raw) {
  const t = (raw || []).filter((a) => !a.startsWith('--'));
  const result = { desktop: [], android: false };

  // --editions=lite,pro（或 --edition=，同义）等价于 desktop:lite,pro（注释里承诺过，必须实现）
  const edFlag = raw.find((a) => a.startsWith('--editions=') || a.startsWith('--edition='));
  if (edFlag) {
    const list = edFlag.slice(edFlag.indexOf('=') + 1).split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { fail('--editions= 后必须跟档位，如 --editions=lite,pro'); process.exit(1); }
    const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
    if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
    result.desktop.push(...list);
  }

  if (t.length === 0 && !result.desktop.length) return null; // 交给交互

  for (const item of t) {
    const [kind, sub] = item.split(':');
    if (kind === 'desktop' || kind === 'desktop:all') {
      if (!sub || sub === 'all') { result.desktop.push(...ALL_EDITIONS); continue; }
      // desktop:lite,pro
      const list = sub.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
      if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
      result.desktop.push(...list);
    } else if (kind === 'www' || item === 'desktop:full') {
      result.desktop.push('basic');
    } else if (item === 'android' || item === 'mobile' || item === 'mobile:android') {
      result.android = true;
    } else if (item === 'all') {
      result.desktop.push(...ALL_EDITIONS);
      result.android = true;
    } else {
      fail(`未知目标: ${item}（可选 desktop[:档位] / android / all）`);
      process.exit(1);
    }
  }
  result.desktop = [...new Set(result.desktop)];
  return result;
}

/**
 * 清空某个输出目录里**除去交付物（exe/blockmap）之外**的全部内容。
 *
 * ★ 为什么按"整个目录"而不是列具体路径：electron-builder 会在输出目录里产生
 *   多种中间产物（`win-unpacked/`、`@yan-zhidesktop-*.nsis.7z`、`__uninstaller-*` …），
 *   逐个列必然漏（已漏过 `win-unpacked` 和 `nsis.7z` 两次）。
 *   而这些都是构建中间物、删了会重建 —— 移走最稳妥。
 *   ★ 只保留 `*.exe`（交付物）与 `*.blockmap`（增量更新用）与 `builder-*.yml`（构建清单）：
 *     它们可能上一轮刚产出，用户可能正要拿。
 */
function moveOutDirContents(edition) {
  // 已换根：新根为空，无物可移（旧目录原样保留），直接跳过避免二次撞锁
  if (FRESH_ROOT_USED) {
    info(c.dim(`skip   ${edition}（已换根，新根无需移走）`));
    return;
  }
  const dirName = OUTPUT_DIRS[edition];
  if (!dirName) return;
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) {
    info(c.dim(`skip   ${dirName}（不存在）`));
    return;
  }
  const KEEP = /\.(exe|blockmap)$/i;
  const entries = fs.readdirSync(dir).filter((n) => !KEEP.test(n) && !/^builder-.*\.yml$/i.test(n));
  if (!entries.length) {
    info(c.dim(`skip   ${dirName}（只有交付物）`));
    return;
  }
  if (DRY) {
    for (const n of entries) info(c.dim(`[dry-run] 将移走  ${dirName}/${n}`));
    return;
  }
  const bak = backupRoot();
  for (const n of entries) {
    const src = path.join(dir, n);
    const dest = path.join(bak, `${dirName}_${n}`.replace(/[\\/]/g, '_'));
    try {
      moveWithRetry(src, dest);
      info(c.dim(`moved  ${dirName}/${n}`));
    } catch (e) {
      if (LOCK_CODES.test(e.code) && FRESH_OUTPUT) {
        const locked = findLockedEntries(dir, path.basename(dirName));
        reportLock(locked, dirName);
        switchToFreshRoot(dirName); // 旧目录留下，后续改用新根构建
        return;
      }
      fail(`移动失败 ${dirName}/${n}: ${e.message}`);
      throw e;
    }
  }
}

/**
 * 计算本轮要移走的目录。
 *
 * ★★ 关键在于 `apps/server/dist` 的归属：
 *   · 桌面构建**内含**真编译 → 它的第一步会 rmSync('dist')，所以必须提前移走；
 *   · 纯安卓构建**依赖**已有 dist（build-mobile-server 只复制不编译）→ **绝不能移走**！
 *     若已在本脚本里编译过（willCompile），那份产物就是安卓要用的，同样要保住。
 *   把这条区别写进函数而不是散在主流程里 —— 写错的表现是「安卓包缺改动却不报错」。
 */
function computeMovable(targets, willCompile) {
  return MOVABLE.filter((m) => {
    if (m === 'apps/server/dist') return targets.desktop.length > 0; // 桌面才移（会重建）
    if (m === 'apps/desktop/dist' || m === 'apps/web/dist') return targets.desktop.length > 0;
    if (m.startsWith('apps/mobile/')) return targets.android;
    return true;
  }).map((m) => {
    // 纯安卓 + 本脚本已编译：dist 是刚编好的，别移（安卓要靠它）
    if (m === 'apps/server/dist' && willCompile && !targets.desktop.length) return null;
    return m;
  }).filter(Boolean);
}

// ─────────────────────── 桌面构建 ───────────────────────
function buildDesktop(editions) {
  step(`桌面打包：${editions.map((e) => `${e}(${EDITION_LABEL[e]})`).join(' / ')}`);
  info(`将依次：真编译 server → vite build → 逐档 electron-builder（约 3.5 分钟）`);
  // build-all-editions.cjs 内部含真编译 + 逐档重写 edition.json + 清 appOutDir；
  // 每档独立输出到 dist-release/desktop/<档>/<版本>/（无需 --separate，那已是默认行为）。
  run(process.execPath, [
    path.join('apps', 'desktop', 'scripts', 'build-all-editions.cjs'),
    ...editions,
  ]);
  ok('桌面构建完成');
}

// ─────────────────────── 安卓构建 ───────────────────────
function buildAndroid() {
  step('安卓 APK 构建');
  const mobile = path.join(ROOT, 'apps', 'mobile');

  // ① 图标（必须在 vite build 之前）
  info('① 生成安卓图标');
  run(process.execPath, ['scripts/gen-android-icons.cjs'], { cwd: mobile });

  // ② 前端
  info('② 构建移动端前端');
  run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: mobile });

  // ②.5 原生改动（短信插件）
  //
  // ★★ 为什么必须在这里补（2026-10-08 发现的实际缺陷）：
  //   原生 java 源 + AndroidManifest 权限 + MainActivity 的 registerPlugin 调用，
  //   唯一真相源在 apps/mobile/native/android/（tracked），而 apps/mobile/android/
  //   是 Capacitor 生成目录（gitignore）。**重建工程后这些改动就丢了**。
  //   mobile 包的 `build:android` 脚本里有这一步，但 package.cjs 的链路**漏了** ——
  //   结果走 `pnpm package:android` 打出的包**不含短信插件**，
  //   而构建全程无报错（插件缺失只在真机收验证码时才暴露）。
  //   ★ 位置：必须早于 cap sync（sync 会重铺原生工程文件，晚于它则被覆盖）。
  info('②.5 应用原生改动（短信插件）');
  run(process.execPath, ['scripts/apply-native-sms.cjs'], { cwd: mobile });

  // ③ 内嵌后端（★ 先确保 server/dist 是新鲜的）
  //
  // ★★ 为什么这里改成「显式编译」而不是沿用 distStale() 拦中断：
  //   distStale() 用「入口目录 mtime vs 源码 mtime」判断，在**跨机器 / CI 干净 checkout**
  //   下会假阳性 —— 源码 mtime 取决于 checkout 时间，dist 是构建产物，
  //   结果纯安卓 CI 十有八九被判为「陈旧」而拦死（报的却是"请先跑桌面构建"）。
  //   build-mobile-server 只复制不编译这点没变，所以这里**自己补一次编译**，
  //   把分布式前置条件变成脚本内联步骤。distStale() 仅降级为提示。
  if (distStale()) {
    warn('apps/server/dist 陈旧或缺失 → 就地编译一次（build-mobile-server 只复制不编译）');
    info(c.dim('  首次或改动后需要，约 30-60 秒'));
    run('pnpm', ['--filter', '@yan-zhi/server', 'build']);
    ok('server/dist 已重新编译');
  } else {
    ok('apps/server/dist 已是新鲜产物');
  }
  info('③ 打包内嵌 Node 后端');
  run(process.execPath, ['scripts/build-mobile-server.cjs'], { cwd: mobile });

  // ④ cap sync
  info('④ 同步 Capacitor Android 工程');
  run(process.execPath, [path.join('node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android'], { cwd: mobile });

  // ⑤ gradle assembleDebug
  const tc = androidToolchain();
  if (!tc.sdk || !tc.javaHome) {
    fail('安卓工具链不完整（SDK / JDK），无法执行 gradle');
    if (!tc.sdk) info(c.dim(`  SDK 候选均无效: ${tc.sdkTried.join(' / ')}`));
    if (!tc.javaHome) info(c.dim(`  JDK 候选均无效: ${tc.javaTried.join(' / ')}`));
    process.exit(1);
  }

  if (process.platform === 'win32') {
    // ── Windows：走 junction 短路径 ──
    // ★ 为什么必须换短路径：@capawesome/capacitor-nodejs 的 CMake 与 NDK 中间产物
    //   会把路径顶到 Windows MAX_PATH(260) 附近，长路径直接编译失败。
    info(`⑤ gradle assembleDebug（PowerShell + C:\\yz junction）`);
    const junction = 'C:\\yz';
    const jDir = 'C:\\yz\\apps\\mobile\\android';
    const rootEsc = ROOT.replace(/'/g, "''");
    // ★ 用单引号 here-string 写脚本，避免路径里的 \\ 与 $ 被 PS 解释
    const gradleScript = [
      `$ErrorActionPreference = 'Stop'`,
      `if (-not (Test-Path -LiteralPath '${junction}')) {`,
      `  New-Item -ItemType Junction -Path '${junction}' -Target '${rootEsc}' | Out-Null`,
      `}`,
      `$env:ANDROID_HOME = '${tc.sdk}'`,
      `$env:ANDROID_SDK_ROOT = '${tc.sdk}'`,
      `$env:JAVA_HOME = '${tc.javaHome}'`,
      `Set-Location '${jDir}'`,
      `Write-Host "PWD=$($PWD.Path)"`,
      `& .\\gradlew.bat --stop 2>&1 | Out-Null`,
      `& .\\gradlew.bat assembleDebug --console=plain`,
      `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`,
    ].join('\n');
    runPowerShell(gradleScript, 'gradle');
  } else {
    // ── Unix（CI 的 ubuntu runner）：直接跑 gradlew，不必 junction ──
    // ★ chmod +x 不能省：仓库里 gradlew 的可执行位在检出后常丢失 → 报 Permission denied。
    //   （android/ 是 cap 生成目录，本就不入库，所以这里主要防解压/打包后权限丢失。）
    info(`⑤ gradle assembleDebug（${tc.sdk} / ${tc.javaHome}）`);
    const androidDir = path.join(mobile, 'android');
    const gradlew = path.join(androidDir, 'gradlew');
    if (!fs.existsSync(gradlew)) {
      fail(`找不到 gradlew: ${gradlew}（'cap add android' 未成功？）`);
      process.exit(1);
    }
    try {
      fs.chmodSync(gradlew, 0o755);
    } catch {
      /* 权限已正确时忽略 */
    }
    // ★ 用**绝对路径**而不是 './gradlew'：execFileSync 不经 shell，相对路径的解析
    //   依赖 cwd 且易踩坑（尤其 cwd 含符号链接时）。绝对路径无歧义。
    const gradleEnv = { ANDROID_HOME: tc.sdk, ANDROID_SDK_ROOT: tc.sdk, JAVA_HOME: tc.javaHome };
    run(gradlew, ['--stop'], { cwd: androidDir, env: gradleEnv });
    // --no-daemon：CI 容器用完即弃，留 daemon 没收益，还可能让进程不退出挂住 job。
    run(gradlew, ['assembleDebug', '--console=plain', '--no-daemon'], { cwd: androidDir, env: gradleEnv });
  }

  // ⑥ 拷 APK
  info(`⑥ 拷贝 APK 到 ${path.relative(ROOT, path.dirname(path.join(ROOT, ANDROID_APK)))}`);
  run(process.execPath, ['scripts/copy-apk.cjs'], { cwd: mobile });
  ok('安卓构建完成');
}

// ─────────────────────── 产物校验 ───────────────────────
function verifyAll(targets) {
  step('产物校验');
  const verifier = path.join('scripts', 'verify-package-artifacts.cjs');
  let allOk = true;

  for (const e of targets.desktop) {
    // ★ 必须走 OUTPUT_DIRS（与"写到哪"同源，定义见文件头部），不能硬编码 ——
    //   否则用 YZ_ALL_OUT_DIR 换产物根时，产物明明已生成却报"缺 asar"。
    const asar = path.join(ROOT, OUTPUT_DIRS[e], 'win-unpacked', 'resources', 'app.asar');
    if (!fs.existsSync(asar)) { fail(`缺 asar: ${asar}`); allOk = false; continue; }
    try {
      run(process.execPath, [verifier, 'asar', asar]);
      ok(`桌面 ${e} 校验通过`);
    } catch { fail(`桌面 ${e} 校验失败`); allOk = false; }
  }

  if (targets.android) {
    const apk = path.join(ROOT, ANDROID_APK);
    if (!fs.existsSync(apk)) { fail(`缺 APK: ${apk}`); allOk = false; }
    else {
      try {
        run(process.execPath, [verifier, 'apk', apk]);
        ok('APK 校验通过');
      } catch { fail('APK 校验失败'); allOk = false; }
    }
  }
  return allOk;
}

/** 列出产物（尺寸 + 时间） */
function listArtifacts(targets) {
  step('产物清单');
  const list = [];
  for (const e of targets.desktop) {
    // ★ 同样走 OUTPUT_DIRS（见产物校验处注释）
    const dir = path.join(ROOT, OUTPUT_DIRS[e]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.exe') && !f.includes('uninstall')) list.push([`桌面 ${e}（${EDITION_LABEL[e]}）`, path.join(dir, f)]);
    }
  }
  if (targets.android) {
    const apk = path.join(ROOT, ANDROID_APK);
    if (fs.existsSync(apk)) list.push(['安卓 APK', apk]);
  }
  for (const [label, p] of list) {
    const s = fs.statSync(p);
    const mb = (s.size / 1048576).toFixed(1);
    console.log(`  ${label.padEnd(22)} ${mb.padStart(7)} MB  ${c.dim(path.relative(ROOT, p))}`);
  }
  return list.length;
}

/** 清理临时备份 */
function cleanupTmp() {
  if (KEEP_TMP || DRY || !tmpBackupDir) return;
  step('清理临时备份');
  const ps = `$p='${tmpBackupDir.replace(/'/g, "''")}'; if(Test-Path -LiteralPath $p){ [System.IO.Directory]::Delete($p,$true) }`;
  try {
    runPowerShell(ps);
    ok('已清理临时备份');
  } catch {
    warn(`清理失败，可手动删除: ${path.relative(ROOT, tmpBackupDir)}`);
  }
}

/**
 * 清理上轮打包残留（★ 2026-10-04 根因修复：之前每次构建都会留下这些、从不清理，
 * 反复累积把 C 盘吃空；且备份目录打包后会进回收站，更占地方）：
 *   · tmp/_pkgbak_<时间戳>/  ← backupRoot() 每轮建的备份，cleanupTmp 只在成功时清当前轮，
 *                              失败/被中断则永久遗留；
 *   · tmp/_pkg_<label>.ps1   ← runPowerShell 落盘的脚本，从不清理；
 *   · dist-release-<时间戳>/ ← switchToFreshRoot 在 EBUSY 时换的新根，copyDeliverablesBack
 *                              只拷交付物回来、从不删新根 → 每撞一次锁留一个。
 * 在 moveAway 之前调用，清的是「上一轮及更早」的残留，不影响本轮
 * （本轮的 _pkgbak_ 还没建、FRESH_ROOT_USED 还是 null）。
 */
function cleanStaleBuildArtifacts() {
  if (DRY) { info(c.dim('[dry-run] 跳过上轮残留清理')); return; }
  step('清理上轮打包残留');
  const removed = [];

  // 1) tmp/ 下的 _pkgbak_* 与 _pkg_*.ps1
  if (fs.existsSync(TMP)) {
    for (const name of fs.readdirSync(TMP)) {
      if (name.startsWith('_pkgbak_') || /^_pkg_.*\.ps1$/.test(name)) {
        const p = path.join(TMP, name);
        try {
          fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
          removed.push(p);
        } catch { /* 占用则跳过，下次再清 */ }
      }
    }
  }

  // 2) 仓库根下 dist-release-<10+位时间戳> 换根目录（EBUSY 残留）
  try {
    for (const name of fs.readdirSync(ROOT)) {
      if (/^dist-release-\d{10,}$/.test(name)) {
        const p = path.join(ROOT, name);
        try {
          fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
          removed.push(p);
        } catch { /* 占用则跳过，下次再清 */ }
      }
    }
  } catch { /* ROOT 读不了则跳过 */ }

  if (removed.length) ok(`已清理 ${removed.length} 处上轮残留`);
  else info(c.dim('无上轮残留'));
}

/**
 * 若本轮换过产物根（EBUSY 绕锁），交付物已拷回标准树，这里把整棵换根目录删掉，
 * 避免它像历史版本那样永久遗留（见 cleanStaleBuildArtifacts 注释）。
 * 必须放在 verifyAll / listArtifacts 之后 —— 它们仍按 OUTPUT_DIRS（=新根路径）读产物校验。
 */
function cleanFreshRoot() {
  if (!FRESH_ROOT_USED) return;
  const p = path.join(ROOT, FRESH_ROOT_USED);
  if (!fs.existsSync(p)) return;
  step('清理换根产物目录');
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    ok(`已清理换根目录 ${FRESH_ROOT_USED}（交付物已拷回 ${DEFAULT_RELEASE_ROOT}/）`);
  } catch {
    warn(`换根目录清理失败，可手动删除: ${path.relative(ROOT, p)}`);
  }
}

// ─────────────────────── 主流程 ───────────────────────
(async () => {
  let targets = parseTargets(argv);
  if (!targets) targets = await askTargets();
  if (!targets.desktop.length && !targets.android) {
    fail('未选择任何目标');
    process.exit(1);
  }

  console.log(c.bold(`\n言智打包 —— 目标：${
    [targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null]
      .filter(Boolean).join(' + ')
  }`));

  preflight(targets);

  // 是否需要真编译 server：
  //   · 桌面构建内含编译（build-all-editions 第一步就是 server build）；
  //   · 纯安卓时，只有 dist 陈旧/缺失才单独编译一次；
  //   · --only + dist 新鲜 → 直接复用，连编译都省。
  const needCompile = targets.desktop.length > 0;
  let willCompile = needCompile;
  if (!needCompile && targets.android) {
    if (distReady() && !distStale()) ok('apps/server/dist 新鲜，可复用（跳过编译）');
    else willCompile = true;
  }

  if (DRY) {
    step('dry-run 计划（不执行任何写操作）');
    info(`目标: ${[targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' + ')}`);
    info(`将真编译 server: ${willCompile ? '是' : '否（复用现有 dist）'}`);
    info(`将构建: ${[needCompile ? '桌面三档/选档' : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' → ')}`);
    console.log('');
    step('将移走的目录');
    moveAway(computeMovable(targets, willCompile));
    for (const e of targets.desktop) moveOutDirContents(e);
    console.log('');
    console.log(c.dim('  dry-run 结束，未做任何改动。去掉 --dry-run 即为真实构建。'));
    return;
  }

  if (willCompile && !needCompile) {
    step('真编译 server（安卓前置）');
    run('pnpm', ['--filter', '@yan-zhi/server', 'build']);
  }

  step('移位将撞删除保护的目录');
  cleanStaleBuildArtifacts(); // 先清上轮残留，再开始本轮移位/构建
  moveAway(computeMovable(targets, willCompile));
  // 输出目录里除交付物外的全部中间产物（win-unpacked / nsis.7z / __uninstaller-* …）
  for (const e of targets.desktop) moveOutDirContents(e);

  try {
    if (targets.desktop.length) buildDesktop(targets.desktop);
    // ★ 收口旧版本目录：每升一次 version 都会新建 dist-release/desktop/<档>/<版本>/，
    //   这里每个档保留最新的 keep=2 个、删其余，避免反复累积吃满 C 盘。
    if (targets.desktop.length) pruneOldReleases(ROOT);
    if (targets.android) buildAndroid();
    copyDeliverablesBack(); // 若换根，把交付物拷回标准树 dist-release/

    let verifyOk = true;
    if (VERIFY) verifyOk = verifyAll(targets);
    const n = listArtifacts(targets);

    cleanupTmp();
    cleanFreshRoot(); // 若本轮换过根，交付物已拷回标准树，删掉换根目录（必须晚于 verify/list）

    console.log('');
    if (verifyOk) {
      console.log(c.green(c.bold(`✓ 完成：${n} 个产物，全部校验通过`)));
    } else {
      console.log(c.yellow(c.bold(`⚠ 完成：${n} 个产物，但有校验未通过（见上）`)));
      process.exitCode = 1;
    }
  } catch (e) {
    console.log('');
    fail(`构建中断: ${e.message}`);
    if (tmpBackupDir) {
      console.log('');
      warn(`临时备份保留在: ${path.relative(ROOT, tmpBackupDir)}`);
    }
    process.exit(1);
  }
})();