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

// ★ 发行目录只保留本次产物：拷贝前清空 dist-release/android/<版本>/ 里的旧 APK，
//   避免同版本多次打包后新旧文件混在一起分发错（2026-11-20 用户要求：前一次产物必须清理）。
//   只清 android/<版本> 这一层，桌面等其他发行目录不受影响。
for (const name of fs.readdirSync(outDir)) {
  fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
}

let count = 0;
/**
 * ★★ 闪退包硬闸（2026-11-16 真机实锤复盘）：曾有人把旧目录构建的 155.3MB APK
 *   （缺 nodejs-mobile 原生库）传进手机，启动即 `UnsatisfiedLinkError: libnode.so
 *   not found` 闪退。这里在拷贝前检查 APK 内必须含目标 ABI 的 Node.js 原生库与
 *   内嵌后端入口，并按发行档检查体积下限 —— 任一不满足都直接失败。
 *   检查原理：APK 是 zip，所有文件名以明文存在文件尾的 central directory 里，
 *   扫尾部 2MB 即可。
 */
const profile = process.env.YZ_ANDROID_PACKAGE_PROFILE === 'slim' ? 'slim' : 'full';
const defaultAbis = profile === 'slim'
  ? ['arm64-v8a', 'armeabi-v7a']
  : ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
const expectedAbis = String(process.env.YZ_EXPECTED_ABIS || defaultAbis.join(','))
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);
const minSizeMb = profile === 'slim' ? 140 : 300;

function assertCompleteApk(apkPath) {
  const fd = fs.openSync(apkPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 2 * 1024 * 1024);
    const buf = Buffer.alloc(tailLen);
    fs.readSync(fd, buf, 0, tailLen, size - tailLen);
    const required = expectedAbis.flatMap((abi) => [
      `lib/${abi}/libnode.so`,
      `lib/${abi}/libcapacitor-nodejs.so`,
      `lib/${abi}/libc++_shared.so`,
    ]).concat('assets/public/nodejs/dist/apps/server/src/index.js');
    const missing = required.filter((name) => !buf.includes(name));
    const minSize = minSizeMb * 1024 * 1024;
    if (missing.length || size < minSize) {
      const sizeMb = (size / 1024 / 1024).toFixed(2);
      console.error(`[copy-apk] ✗ 闪退包拦截：${path.basename(apkPath)}（${sizeMb} MB）`);
      for (const name of missing) console.error(`[copy-apk]   缺少 ${name}`);
      if (size < minSize) console.error(`[copy-apk]   ${profile} 包小于 ${minSizeMb}MB，疑似退回了缺原生库/内嵌资源的残缺产物`);
      console.error('[copy-apk]   这份 APK 启动必崩（UnsatisfiedLinkError），禁止分发/安装。');
      console.error('[copy-apk]   请检查 capacitor.settings.gradle 的 nodejs 短路径补丁与 nodejs-mobile 构建是否成功。');
      process.exit(3);
    }
  } finally {
    fs.closeSync(fd);
  }
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (/\.apk$/i.test(name)) {
      assertCompleteApk(full);
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
console.log(`[copy-apk] 完成（v${version}，${profile}，ABI=${expectedAbis.join(',')}），共拷贝 ${count} 个 APK 到 ${path.relative(mobileDir, outDir)}`);
