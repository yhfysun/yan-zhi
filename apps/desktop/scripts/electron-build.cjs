const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const DEFAULT_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';

const env = { ...process.env };
// CI 环境（GitHub Actions 等）直连 GitHub CDN 更快，不覆盖镜像；
// 本地开发环境默认用国内镜像加速（用户可通过 ELECTRON_MIRROR 覆盖）
const isCI = !!env.CI;
if (!env.ELECTRON_MIRROR && !isCI) {
  env.ELECTRON_MIRROR = DEFAULT_ELECTRON_MIRROR;
  console.log(`[electron-build] ELECTRON_MIRROR 未设置，使用默认: ${DEFAULT_ELECTRON_MIRROR}`);
}
if (!env.ELECTRON_BUILDER_BINARIES_MIRROR && !isCI) {
  env.ELECTRON_BUILDER_BINARIES_MIRROR = DEFAULT_BINARIES_MIRROR;
}

const { resolveArtifactSuffix, resolvePkgVersion, editionDirName, clearAppOutDirs } = require('./lib/pack-helpers.cjs');

env.YZ_ARTIFACT_SUFFIX = resolveArtifactSuffix({
  fromEnv: process.env.YZ_ARTIFACT_SUFFIX,
  editionJsonPath: path.join(__dirname, '..', 'edition.json'),
});
console.log(`[electron-build] 产物后缀: ${env.YZ_ARTIFACT_SUFFIX}`);

/**
 * 清理上一次构建残留的 appOutDir（win-unpacked 等）并打印处置提示。
 *
 * 清理逻辑本身在 lib/pack-helpers.cjs（可单测）；这里只负责呈现与退出码。
 * ★ 为什么是「报错退出」而不是「换个目录」：产物路径必须可预测。
 *   自动改到 dist-release-<时间戳> 会让产物散落多处（旧版行为），正是要避免的结果。
 */
function clearStaleAppOutDir(outputDir) {
  const { removed, failed } = clearAppOutDirs(outputDir);
  for (const p of removed) {
    console.log(`[electron-build] 已清理旧产物目录: ${path.basename(p)}`);
  }
  if (!failed.length) return;

  const first = failed[0];
  console.error('');
  console.error('========================================================');
  console.error(`  ✗ 无法清理旧产物目录（${first.code}）`);
  console.error(`    ${first.dir}`);
  console.error('--------------------------------------------------------');
  console.error('  常见原因：');
  console.error('    · 言智应用仍在运行（请彻底退出，含托盘图标）');
  console.error('    · 杀毒软件正在扫描上一轮产物（实时防护持有 app.asar 句柄）');
  console.error('    · 另有构建进程在跑（同一输出目录不能并发构建）');
  console.error('  处置（任选其一）：');
  console.error('    1) 彻底退出言智与其它构建终端后重跑');
  console.error('    2) 换输出目录：YZ_OUTPUT_DIR=dist-release-new node scripts/electron-build.cjs <config.yml>');
  console.error('    3) 给项目目录加杀软排除项，避免反复发生');
  console.error('========================================================');
  console.error('');
  process.exit(1);
}

if (!env.YZ_OUTPUT_DIR) {
  // 默认落到统一产物树（与 build-all-editions.cjs / package.cjs 同源，见 lib/pack-helpers.cjs）：
  //   dist-release/desktop/<档>/<版本>/，档取自产物后缀，版本取自 apps/desktop/package.json。
  const desktopVersion = resolvePkgVersion({ pkgPath: path.join(__dirname, '..', 'package.json') });
  env.YZ_OUTPUT_DIR = path.resolve(
    __dirname, '..', '..', '..',
    'dist-release', 'desktop', editionDirName(env.YZ_ARTIFACT_SUFFIX), desktopVersion,
  );
}

// 旧产物先清干净：清不掉就明确报错退出，**不静默改输出到 dist-release-<时间戳>**。
// 静默换目录 = 产物散落多处、用户找不到包（旧版行为）。
// 需要换目录请显式指定 YZ_OUTPUT_DIR，或用 build-all-editions.cjs 的 YZ_ALL_OUT_DIR 换产物根。
clearStaleAppOutDir(env.YZ_OUTPUT_DIR);
console.log(`[electron-build] 输出目录: ${env.YZ_OUTPUT_DIR}`);

const config = process.argv[2];
if (!config) {
  console.error('[electron-build] 用法: node scripts/electron-build.cjs <config.yml> [electron-builder 额外参数...]');
  process.exit(1);
}

const extraArgs = process.argv.slice(3);
const isMacBuild = config.includes('mac') || extraArgs.includes('--mac');

if (isMacBuild && process.platform !== 'darwin') {
  console.error('');
  console.error('========================================================');
  console.error('  Mac 包必须在 macOS 上构建');
  console.error('--------------------------------------------------------');
  console.error('  原因:');
  console.error('    1. dmg 打包需要 macOS 原生工具 hdiutil');
  console.error('    2. better-sqlite3 原生模块需编译为 Mac Electron ABI');
  console.error('  解决方案:');
  console.error('    A. 在 Mac 机器上运行: pnpm electron:build:mac');
  console.error('    B. 用 GitHub Actions macOS runner（见 .github/workflows/）');
  console.error('    C. Windows 上跑 macOS 虚拟机（VMware/VirtualBox）');
  console.error('========================================================');
  console.error('');
  process.exit(1);
}

// electron-builder 的启动方式（★★ 2026-09-29 加固）：
//
// 原来直接 `spawn('pnpm', ['exec','electron-builder', ...])`，依赖 pnpm 生成的
// `node_modules/.bin/electron-builder` 链接。但**本机 pnpm 的 .bin 链接可能未生成**
// （实测 `apps/*/node_modules/.bin/` 全为空、root 只有 6 项 —— 与 tsc 同一类装包不完整），
// 于是报 `'electron-builder' 不是内部或外部命令` —— 看起来像"没装依赖"，
// 实际**包是完整的**（`.pnpm/electron-builder@x/node_modules/electron-builder/cli.js` 在）。
//
// → 改为：**优先 .bin**（正常环境走这条），**缺失时直接 node 调 cli.js**。
//   这条兜底比原来更稳：不依赖 shell PATH、也不依赖 pnpm 的 bin 链接。
const fs = require('fs');

/** 解析 electron-builder 的启动方式：{ cmd, argv } —— 找不到任何入口时返回 null */
function resolveElectronBuilder(desktopDir) {
  // ① 首选 pnpm exec（正常环境；保留原行为）
  const binLink = path.join(desktopDir, 'node_modules', '.bin', 'electron-builder');
  if (fs.existsSync(binLink)) {
    return { cmd: 'pnpm', argv: ['exec', 'electron-builder'], via: 'pnpm exec' };
  }
  // ② 兜底：直接把 cli.js 交给 node 跑。
  //    在 `.pnpm/` 里按名字找 —— 注意目录名带 peer 后缀（electron-builder@25.1.8_...），
  //    所以用前缀匹配而不是精确名。
  const pnpmDir = path.resolve(desktopDir, '..', '..', 'node_modules', '.pnpm');
  let cli = null;
  try {
    const hit = fs.readdirSync(pnpmDir).find((n) => n.startsWith('electron-builder@'));
    if (hit) {
      const p = path.join(pnpmDir, hit, 'node_modules', 'electron-builder', 'cli.js');
      if (fs.existsSync(p)) cli = p;
    }
  } catch { /* 目录不可读：交给下面报错 */ }
  if (cli) {
    return { cmd: process.execPath, argv: [cli], via: '直接 cli.js（.bin 链接缺失兜底）' };
  }
  return null;
}

const desktopDir = path.resolve(__dirname, '..');
const eb = resolveElectronBuilder(desktopDir);
if (!eb) {
  console.error('');
  console.error('========================================================');
  console.error('  ✗ 找不到 electron-builder（.bin 链接与 .pnpm 包内 cli.js 都不存在）');
  console.error('--------------------------------------------------------');
  console.error('  处置：在仓库根执行 pnpm install（确保 electron-builder 装上）');
  console.error('========================================================');
  console.error('');
  process.exit(1);
}
console.log(`[electron-build] 启动方式: ${eb.via}`);

const args = [...eb.argv, '--config', config, ...extraArgs, '--publish', 'never'];
const child = spawn(eb.cmd, args, {
  stdio: 'inherit',
  env,
  // pnpm 需要 shell（它是 .cmd）；直调 node + cli.js 则不需要，且更稳。
  shell: eb.cmd === 'pnpm',
});

child.on('exit', (code) => process.exit(code ?? 1));