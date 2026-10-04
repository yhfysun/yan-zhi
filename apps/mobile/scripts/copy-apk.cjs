const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');
const apkRoot = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk');

// ★ 产物路径单一真相源在 apps/desktop/scripts/lib/pack-helpers.cjs（跨包相对引用，
//   仅用路径函数、不引入构建依赖）：安卓统一落到 dist-release/android/<版本>/app-debug.apk。
//   YZ_ALL_OUT_DIR 可换产物根目录，与 package.cjs / build-all-editions.cjs 保持一致。
const { DEFAULT_RELEASE_ROOT, androidOutDir, resolvePkgVersion } = require(
  path.join(mobileDir, '..', '..', 'apps', 'desktop', 'scripts', 'lib', 'pack-helpers.cjs'),
);
const version = resolvePkgVersion({ pkgPath: path.join(mobileDir, 'package.json') });
const outDir = androidOutDir({
  repoRoot: path.join(mobileDir, '..', '..'),
  version,
  outRoot: process.env.YZ_ALL_OUT_DIR || DEFAULT_RELEASE_ROOT,
});

if (!fs.existsSync(apkRoot)) {
  console.error('[copy-apk] 未找到 APK 输出目录:', apkRoot);
  console.error('[copy-apk] 请先运行 cap build android');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

let count = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (/\.apk$/i.test(name)) {
      const dest = path.join(outDir, name);
      fs.copyFileSync(full, dest);
      console.log(`[copy-apk] ${path.relative(mobileDir, full)} -> ${path.relative(mobileDir, dest)}`);
      count++;
    }
  }
}
walk(apkRoot);

if (count === 0) {
  console.warn('[copy-apk] 未发现任何 .apk 文件');
  process.exit(2);
}
console.log(`[copy-apk] 完成（v${version}），共拷贝 ${count} 个 APK 到 ${path.relative(mobileDir, outDir)}`);