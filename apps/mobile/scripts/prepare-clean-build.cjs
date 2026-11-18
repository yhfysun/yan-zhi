/**
 * 打包前直接删除已知旧产物，避免每次构建都在工程外堆出时间戳备份目录。
 *
 * Windows 上 Gradle / Node / 文件预览可能短暂占用目录或文件，因此统一使用
 * fs.rmSync 的 maxRetries/retryDelay；仍失败时明确提示关闭占用进程后重试。
 * 工程内旧版 *_prev_* 目录也一并清理，防止被 Capacitor 打进 APK。
 */
const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');

const relTargets = [
  'dist',
  'nodejs/dist',
  'android/app/src/main/assets/public',
  'android/capacitor-cordova-android-plugins',
];

/** 扫一层遗留备份（旧版手工清理留下的 *_prev_*，留在工程内会被打进 APK）。 */
function staleBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes('_prev_'))
    .map((entry) => path.join(dir, entry.name));
}

const all = [...relTargets, ...staleBackups('dist'), ...staleBackups('nodejs'),
  ...staleBackups('android/app/src/main/assets'), ...staleBackups('android')];
let removed = 0;
for (const rel of [...new Set(all)]) {
  const src = path.join(mobileDir, rel);
  if (!fs.existsSync(src)) continue;
  try {
    fs.rmSync(src, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (error) {
    const code = error && error.code ? ` (${error.code})` : '';
    throw new Error(
      `[clean-build] 无法删除旧产物 ${rel}${code}。请关闭正在占用该目录的构建、预览或同步进程后重试。`,
      { cause: error },
    );
  }
  removed += 1;
  console.log(`[clean-build] 已删除 ${rel}`);
}
console.log(`[clean-build] 共清理 ${removed} 个旧产物目录`);
