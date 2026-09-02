const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');
const apkRoot = path.join(mobileDir, 'android', 'app', 'build', 'outputs', 'apk');
const outDir = path.join(mobileDir, '..', '..', 'dist-release');

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
console.log(`[copy-apk] 完成，共拷贝 ${count} 个 APK 到 ${path.relative(mobileDir, outDir)}`);