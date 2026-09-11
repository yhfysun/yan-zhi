const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

const config = process.argv[2];
if (!config) {
  console.error('[electron-build] 用法: node scripts/electron-build.cjs <config.yml> [electron-builder 额外参数...]');
  process.exit(1);
}

const extraArgs = process.argv.slice(3);
const skipClean = extraArgs.includes('--no-clean');
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

// 预清理 + 必要时将产物重定位到 workspace 之外（规避 WorkBuddy 桌面端守护进程持锁）
let effectiveConfig = config;
if (!isMacBuild && !skipClean) {
  effectiveConfig = preCleanWinUnpacked(config);
}

const args = ['exec', 'electron-builder', '--config', effectiveConfig, ...extraArgs.filter((a) => a !== '--no-clean'), '--publish', 'never'];
const child = spawn('pnpm', args, {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));

/**
 * 根因：WorkBuddy 桌面端守护进程（main/daemon-app-server-entry.js）会泄漏文件句柄，
 * 持有 workspace 内所有 .asar 文件（含 dist-release/win-unpacked/resources/app.asar）。
 * electron-builder 解包 electron 前会 EnsureEmptyDir(win-unpacked) 清空该目录，
 * 被持锁的 app.asar 无法删除 → 报 "The process cannot access the file because it
 * is being used by another process"。该锁与 Defender / 搜索索引无关，重试无法解除，
 * 也不能在当前会话杀掉守护进程（它是会话宿主）。
 *
 * 策略：构建前尝试删除 win-unpacked；
 *  - 能删 → 沿用 workspace 内默认输出 dist-release（CI / 守护进程未持锁时）。
 *  - 删不掉（守护进程持锁）→ 生成一份临时配置，把 output 改到 workspace 之外
 *    （默认 Desktop/yanzhi-dist-release，可用 YANZHI_BUILD_OUT 覆盖），
 *    守护进程不会打开那里的 asar，从而绕开锁。
 *
 * @param {string} configPath electron-builder 配置文件路径（相对于 cwd）
 * @returns {string} 实际传给 electron-builder 的配置文件路径
 */
function preCleanWinUnpacked(configPath) {
  const cfgDir = path.dirname(path.resolve(configPath));
  const outputDir = path.resolve(cfgDir, '../../dist-release'); // workspace 内默认输出
  const winUnpacked = path.join(outputDir, 'win-unpacked');

  // 廉价保险：给输出目录打 NotContentIndexed，规避 Windows 搜索索引持锁（非主因）
  setNotContentIndexed(outputDir);

  if (!fs.existsSync(winUnpacked)) {
    console.log('[electron-build] win-unpacked 不存在，无需预清理，沿用默认输出');
    return configPath;
  }

  // 1) 结束可能持有句柄的残留 electron / 言智 / yan-zhi 进程（用户自己跑起来的 app）
  //    言智.exe：productName 改 yan-zhi 前的旧产物名，机器上仍可能残留
  for (const name of ['electron.exe', 'yan-zhi.exe', '言智.exe']) {
    try {
      execSync(`taskkill /F /IM "${name}"`, { stdio: 'ignore', windowsHide: true });
      console.log(`[electron-build] 已尝试结束残留进程: ${name}`);
    } catch {
      // 进程不存在，忽略
    }
  }

  // 2) 重试删除 win-unpacked，判断到底能不能删（无锁）
  const maxAttempts = 20; // 20 * 400ms ≈ 8s
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      console.log(`[electron-build] 已删除 win-unpacked（第 ${attempt} 次尝试），沿用默认输出`);
      return configPath;
    } catch (err) {
      if (attempt < maxAttempts) {
        // 同步等待 400ms，给残留进程释放文件句柄的时间
        const sab = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(sab), 0, 0, 400);
      }
    }
  }

  // 3) 持久 EBUSY：判定为 WorkBuddy 桌面端守护进程持锁。重定位输出到 workspace 之外。
  const repoRoot = path.resolve(cfgDir, '..');
  const outside = process.env.YANZHI_BUILD_OUT || path.resolve(repoRoot, '..', 'yanzhi-dist-release');
  const tmpConfig = writeRelocatedConfig(configPath, outside);
  console.warn(
    `[electron-build] ⚠ win-unpacked 删除失败，判定为 WorkBuddy 桌面端守护进程泄漏句柄持锁（非 Defender / 搜索索引）。\n` +
      `  本次构建将产物输出到 workspace 之外以绕开锁：\n` +
      `    ${outside}\n` +
      `  （守护进程只持锁 workspace 内的 asar；外部目录不会被它打开。关闭 WorkBuddy 桌面端后\n` +
      `   再构建即可恢复写入原 dist-release。可用 YANZHI_BUILD_OUT 自定义外部目录。）`
  );
  return tmpConfig;
}

/**
 * 生成一份仅覆盖 output 的临时配置，把产物输出到 workspace 之外。
 * 源配置里的 files / extraResources 等相对路径以本临时文件所在目录（与原配置同目录）为基准，
 * 解析结果与原配置一致，仅 output 被改写到外部目录。
 * @param {string} configPath
 * @param {string} outsidePath 绝对外部目录
 * @returns {string} 临时配置路径
 */
function writeRelocatedConfig(configPath, outsidePath) {
  const cfgDir = path.dirname(path.resolve(configPath));
  const text = fs.readFileSync(path.resolve(configPath), 'utf8');
  // 仅替换 directories.output 那一行（yml 中唯一以 output: 开头的行）
  const replaced = text.replace(/^(\s*output:\s*).+$/m, `$1'${outsidePath}'`);
  const tmp = path.join(cfgDir, path.basename(configPath, '.yml') + '.relocated.yml');
  fs.writeFileSync(tmp, replaced, 'utf8');
  return tmp;
}

/**
 * 给目录打上 FILE_ATTRIBUTE_NOT_CONTENT_INDEXED，使 Windows 搜索索引
 * （SearchIndexer）跳过该目录及其子目录，规避其对大文件 app.asar 的持锁。
 * 无需管理员，幂等，失败仅告警不影响主流程。
 * @param {string} dir
 */
function setNotContentIndexed(dir) {
  if (process.platform !== 'win32' || !fs.existsSync(dir)) return;
  try {
    const ps = `try { $d = Get-Item -LiteralPath '${dir.replace(/'/g, "''")}' -Force; $d.Attributes = $d.Attributes -bor [System.IO.FileAttributes]::NotContentIndexed } catch { exit 1 }`;
    execSync(`powershell -NoProfile -NonInteractive -Command ${JSON.stringify(ps)}`, {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // 失败不影响主流程
  }
}
