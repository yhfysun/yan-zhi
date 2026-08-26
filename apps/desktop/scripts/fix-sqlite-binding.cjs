// 修复 better-sqlite3 在 Electron 下的原生绑定
// 背景：
//  - better-sqlite3 是原生模块，Electron 主进程（App）与后端 server 都运行在
//    Electron 内置的 Node.js（ELECTRON_RUN_AS_NODE=1）下，因此需要 electron ABI 的绑定。
//  - 官方 11.10.0 提供 electron-v130（Electron 33）预编译，直接下载即可，无需 MSVC 编译。
//  - 之前的 postinstall 用 electron-rebuild 强制源码编译，既需要 MSVC 又会被沙箱拦截，
//    已被本脚本取代：改为用 prebuild-install 拉取匹配 Electron 版本的预编译二进制。
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Electron 版本（与 apps/desktop/package.json 中 devDependencies.electron 保持一致）
const electronVersion = '33.4.11';

// 定位 better-sqlite3（pnpm 软链结构：apps/desktop/node_modules/better-sqlite3 -> .pnpm/better-sqlite3@x/node_modules/better-sqlite3）
const desktopDir = path.resolve(__dirname, '..');
const sqliteLink = path.join(desktopDir, 'node_modules', 'better-sqlite3');
const sqliteDir = fs.realpathSync(sqliteLink); // .../better-sqlite3@x/node_modules/better-sqlite3
// prebuild-install 是 better-sqlite3 的依赖，位于其同级 node_modules（pnpm 结构）
const prebuildCli = path.join(sqliteDir, '..', 'prebuild-install', 'bin.js');

if (!fs.existsSync(prebuildCli)) {
  console.log('[fix-sqlite-binding] prebuild-install 未找到，跳过（better-sqlite3 自身 install 脚本会处理）');
  process.exit(0);
}

console.log(`[fix-sqlite-binding] 为 Electron ${electronVersion} 拉取 better-sqlite3 预编译...`);
try {
  execFileSync(
    process.execPath,
    [prebuildCli, '--runtime=electron', `--target=${electronVersion}`],
    { cwd: sqliteDir, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } },
  );
  console.log('[fix-sqlite-binding] OK');
} catch (e) {
  // 预编译缺失（例如极新 Electron 无对应产物）时退回源码编译，但不阻断安装
  console.warn('[fix-sqlite-binding] 预编译拉取失败，尝试 node-gyp 源码编译（需 MSVC）...');
  try {
    execFileSync(
      process.execPath,
      ['node_modules/node-gyp/bin/node-gyp.js', 'rebuild', '--release',
       '--runtime=electron', `--target=${electronVersion}`, '--dist-url=https://electronjs.org/headers'],
      { cwd: sqliteDir, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } },
    );
    console.log('[fix-sqlite-binding] node-gyp 编译 OK');
  } catch (e2) {
    console.warn('[fix-sqlite-binding] 编译失败（可能缺 MSVC），数据库功能将不可用:', e2.message);
    process.exit(0); // 不让 postinstall 失败阻断整个 install
  }
}
