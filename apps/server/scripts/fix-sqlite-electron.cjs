// Fix better-sqlite3 for the Electron runtime used by the desktop app.
// The backend runs under ELECTRON_RUN_AS_NODE=1, so the native addon must be
// built for Electron's Node ABI rather than the system Node ABI.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronVersion = '33.4.11';
const serverDir = path.resolve(__dirname, '..');
const sqliteLink = path.join(serverDir, 'node_modules', 'better-sqlite3');

if (!fs.existsSync(sqliteLink)) {
  console.log('[fix-sqlite-electron] better-sqlite3 未找到，跳过');
  process.exit(0);
}

const sqliteDir = fs.realpathSync(sqliteLink);
const prebuildCli = path.join(sqliteDir, '..', 'prebuild-install', 'bin.js');

if (!fs.existsSync(prebuildCli)) {
  console.log('[fix-sqlite-electron] prebuild-install 未找到，跳过');
  process.exit(0);
}

console.log(`[fix-sqlite-electron] 为 Electron ${electronVersion} 拉取 better-sqlite3 预编译...`);
try {
  execFileSync(
    process.execPath,
    [prebuildCli, '--runtime=electron', `--target=${electronVersion}`],
    { cwd: sqliteDir, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } },
  );
  console.log('[fix-sqlite-electron] OK');
} catch (error) {
  console.warn(`[fix-sqlite-electron] 预编译拉取失败: ${error && error.message ? error.message : error}`);
  process.exit(0);
}
