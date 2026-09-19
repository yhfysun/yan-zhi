const { spawn } = require('child_process');
const fs = require('fs');
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

/**
 * 版本档 → 产物名后缀。
 *
 * 从 edition.json（scripts/set-edition.cjs 写入）读，再以环境变量交给 electron-builder
 * —— yml 里写 `-${env.YZ_ARTIFACT_SUFFIX}` 使用。
 *
 * ★ 必须是**环境变量**而不是读文件：electron-builder 的 yml 不支持读任意 JSON。
 *   而它展开 `${env.X}` 时若变量不存在会直接抛 InvalidConfigurationError（不是忽略），
 *   所以这里必须保证一定注入：读不到 edition.json 时回落到 '-basic' 而不是留空。
 */
function resolveArtifactSuffix() {
  const fromEnv = process.env.YZ_ARTIFACT_SUFFIX;
  if (fromEnv) return fromEnv;
  try {
    const p = path.join(__dirname, '..', 'edition.json');
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (cfg && typeof cfg.artifactSuffix === 'string' && cfg.artifactSuffix) return cfg.artifactSuffix;
  } catch {
    /* edition.json 不存在（未跑 set-edition）：走兜底 */
  }
  return '-basic';
}

env.YZ_ARTIFACT_SUFFIX = resolveArtifactSuffix();
console.log(`[electron-build] 产物后缀: ${env.YZ_ARTIFACT_SUFFIX}`);

/**
 * 上一次构建残留的 app.asar 是否被占用？
 *
 * ★ 为什么需要这个检测：electron-builder 打包前会清空 `<output>/win-unpacked` 重写 app.asar。
 *   而那份 asar 有 200MB+，常被**实时杀软扫描**或刚退出的应用进程短暂持有句柄。
 *   Windows 下此时删除会 EBUSY，electron-builder 直接中断，报错却指向
 *   `app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`（看不出是锁），
 *   排查成本很高。判别特征：文件**可读可写、但不可重命名/删除**。
 */
function isAsarLocked(outputDir) {
  const asar = path.join(outputDir, 'win-unpacked', 'resources', 'app.asar');
  if (!fs.existsSync(asar)) return false;
  const probe = asar + '.lockprobe';
  try {
    fs.renameSync(asar, probe);
    fs.renameSync(probe, asar);   // 可重命名 → 没锁，改回去
    return false;
  } catch {
    return true;                  // EBUSY/EPERM → 被占用
  }
}

if (!env.YZ_OUTPUT_DIR) {
  env.YZ_OUTPUT_DIR = path.resolve(__dirname, '..', '..', '..', 'dist-release');

  // 锁检测 + 自动换目录：不因上一轮的残留把这次构建卡死，也不必让用户手动清理。
  // 仅在**用户没显式指定** YZ_OUTPUT_DIR 时兜底（显式指定就尊重用户选择）。
  if (isAsarLocked(env.YZ_OUTPUT_DIR)) {
    const fallback = `${env.YZ_OUTPUT_DIR}-${Date.now()}`;
    console.warn('');
    console.warn('========================================================');
    console.warn('  ⚠ 检测到上次构建的 app.asar 被占用（杀软扫描 / 残留进程）');
    console.warn('--------------------------------------------------------');
    console.warn('  electron-builder 会因删不掉它而中断，因此本次改输出到:');
    console.warn('    ' + fallback);
    console.warn('');
    console.warn('  想回到默认目录 dist-release，请先彻底退出言智应用，或删除:');
    console.warn('    ' + path.join(env.YZ_OUTPUT_DIR, 'win-unpacked'));
    console.warn('  （亦可给项目目录加杀软排除项，避免反复发生）');
    console.warn('========================================================');
    console.warn('');
    env.YZ_OUTPUT_DIR = fallback;
  }
}
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