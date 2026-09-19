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

const { resolveArtifactSuffix, clearAppOutDirs } = require('./lib/pack-helpers.cjs');

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
  env.YZ_OUTPUT_DIR = path.resolve(__dirname, '..', '..', '..', 'dist-release');
}

// 旧产物先清干净：清不掉就明确报错退出，**不静默改输出到 dist-release-<时间戳>**。
// 静默换目录 = 产物散落多处、用户找不到包（旧版行为）。
// 需要换目录请显式指定 YZ_OUTPUT_DIR，或用 build-all-editions.cjs --separate。
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

const args = ['exec', 'electron-builder', '--config', config, ...extraArgs, '--publish', 'never'];
const child = spawn('pnpm', args, {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));