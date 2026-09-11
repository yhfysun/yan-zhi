// 清理 Windows 图标缓存，使更新后的应用图标（assets/icons/icon.ico）在任务栏/快捷方式立即生效。
//
// 背景：Windows Explorer 会把 exe/ico 图标缓存在
//   %LOCALAPPDATA%\IconCache.db
//   %LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db
// 换图标后不删缓存，任务栏/桌面/快捷方式会一直显示旧图标。缓存文件被 explorer
// 占用锁定，必须先结束 explorer 才能删除，删除后重启 explorer 重建。
//
// 用法：
//   node clean-icon-cache.cjs            # 智能模式：icon.ico 的 hash 与上次清理时不同才清理（dev 每次启动调用，无变化时秒退）
//   node clean-icon-cache.cjs --force    # 无条件清理（重启 explorer）
//   node clean-icon-cache.cjs --status   # 只查看缓存状态，不做清理
//
// 幂等性：清理完成后把 icon.ico 的 md5 记录到 %LOCALAPPDATA%\yan-zhi\icon-cache-state.json，
// 同一图标版本不会重复重启 explorer（避免每次 dev 启动都闪一次桌面）。
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const IS_WIN = process.platform === 'win32';
const ICON_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'icons', 'icon.ico');
const STATE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'yan-zhi');
const STATE_FILE = path.join(STATE_DIR, 'icon-cache-state.json');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const STATUS_ONLY = args.has('--status');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hashIcon() {
  try {
    const buf = fs.readFileSync(ICON_PATH);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch {
    return null;
  }
}

function localAppData() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

/** 图标缓存文件列表（存在才返回） */
function iconCacheFiles() {
  const lad = localAppData();
  const files = [path.join(lad, 'IconCache.db')];
  const explorerDir = path.join(lad, 'Microsoft', 'Windows', 'Explorer');
  try {
    for (const name of fs.readdirSync(explorerDir)) {
      if (/^iconcache_.*\.db$/i.test(name)) files.push(path.join(explorerDir, name));
    }
  } catch { /* 目录不存在 */ }
  return files.filter((f) => { try { return fs.existsSync(f); } catch { return false; } });
}

function deleteCacheFiles() {
  let deleted = 0;
  for (const f of iconCacheFiles()) {
    try {
      fs.rmSync(f, { force: true });
      deleted++;
    } catch { /* 被 explorer 锁定，需先结束 explorer */ }
  }
  return deleted;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(iconHash) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ iconHash, cleanedAt: new Date().toISOString() }, null, 2));
  } catch { /* 写不进去也不影响主流程 */ }
}

/** 检测当前进程是否处于管理员/提权 token。
 * 提权状态下重启 explorer 会导致桌面 shell 无法接管（整台电脑白屏），必须降级处理。 */
function isElevated() {
  try {
    const out = spawnSync('whoami', ['/groups'], { encoding: 'utf8' }).stdout || '';
    // High Mandatory Level / System Mandatory Level
    return /S-1-16-(12288|16384)/.test(out);
  } catch {
    return false;
  }
}

/** 结束 explorer → 删除缓存 → 重启 explorer，并调用 ie4uinit 刷新 shell 通知 */
function deepClean() {
  if (isElevated()) {
    // 提权终端中运行的 explorer 将无法接管桌面（白屏），降级为温和清理
    console.log('[icon-cache] 检测到管理员权限，跳过重启 explorer（避免桌面白屏），仅温和清理');
    const deleted = deleteCacheFiles();
    console.log(`[icon-cache] 已删除 ${deleted} 个缓存文件（被锁定的将在下次普通权限启动时清理）`);
    return;
  }
  console.log('[icon-cache] 结束 explorer 并清理图标缓存...');
  spawnSync('taskkill', ['/f', '/im', 'explorer.exe'], { stdio: 'ignore' });
  sleep(600);
  const deleted = deleteCacheFiles();
  console.log(`[icon-cache] 已删除 ${deleted} 个缓存文件`);
  // explorer 可能本来就没在运行，重启前避免重复拉起
  spawn('explorer.exe', { detached: true, stdio: 'ignore' }).unref();
  sleep(300);
  // 通知 shell 刷新图标关联（快捷方式立即重绘）
  spawnSync('ie4uinit.exe', ['-show'], { stdio: 'ignore', shell: false });
  spawnSync('ie4uinit.exe', ['-ClearIconCache'], { stdio: 'ignore', shell: false });
  console.log('[icon-cache] explorer 已重启，图标缓存已刷新');
}

function main() {
  if (!IS_WIN) {
    console.log('[icon-cache] 非 Windows 平台，跳过图标缓存清理');
    process.exit(0);
  }
  const iconHash = hashIcon();
  if (!iconHash) {
    console.log(`[icon-cache] 未找到 ${ICON_PATH}，跳过`);
    process.exit(0);
  }
  const state = readState();
  if (STATUS_ONLY) {
    console.log(JSON.stringify({ iconHash, cacheFiles: iconCacheFiles().length, lastCleaned: state }, null, 2));
    process.exit(0);
  }
  if (!FORCE && state && state.iconHash === iconHash) {
    console.log('[icon-cache] 图标未变化，跳过清理');
    process.exit(0);
  }

  // 先温和删除（部分文件被锁时删不掉），锁死则走深度清理
  const deleted = deleteCacheFiles();
  const locked = iconCacheFiles().length > 0;
  if (deleted > 0 && !locked) {
    console.log(`[icon-cache] 已删除 ${deleted} 个缓存文件（无需重启 explorer）`);
  } else {
    deepClean();
  }
  // ie4uinit 兜底刷新（ explorer 未重启时也能通知 shell）
  spawnSync('ie4uinit.exe', ['-show'], { stdio: 'ignore', shell: false });
  writeState(iconHash);
}

main();
