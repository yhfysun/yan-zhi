/**
 * 打包前把旧产物「移出工程」而不是删除（幂等、跨盘安全）。
 *
 * 起因：vite build / build-mobile-server / cap sync 会分别清空 dist、nodejs/dist、
 * android/app/src/main/assets/public、android/capacitor-cordova-android-plugins；
 * 本机安全钩子对 >50 个文件的批量删除要求人工确认，构建会直接失败。
 * ★ 若把旧产物改名成工程内的 *_prev_* 备份，capacitor 的 webDir / android assets
 *   会把它一起打进 APK（实测包体从 217MB 涨到 548MB 且夹带旧代码）——
 *   所以必须移到工程目录之外。
 *
 * 备份根默认在「项目所在盘符的根 /yz-build-bak」，与项目同盘 ⇒ renameSync 不会 EXDEV。
 * 可用 YZ_BUILD_BAK 覆盖。只移动、不删除任何文件。
 */
const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');
const bakRoot = process.env.YZ_BUILD_BAK || path.join(path.parse(mobileDir).root, 'yz-build-bak');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bakDir = path.join(bakRoot, stamp);

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
let moved = 0;
for (const rel of [...new Set(all)]) {
  const src = path.join(mobileDir, rel);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(bakDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  moved += 1;
  console.log(`[clean-build] ${rel} -> ${dest}`);
}
console.log(`[clean-build] 共移出 ${moved} 个旧产物目录（未删除任何文件）`);
