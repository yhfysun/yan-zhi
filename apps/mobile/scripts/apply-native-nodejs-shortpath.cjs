/**
 * 修复 nodejs-mobile 原生库在 Windows 下的 CMake / ninja 长路径失败（幂等）。
 *
 * 症状：assembleDebug 编译 :capawesome-capacitor-nodejs 时 CXX 编译器探测报
 * 「文件名或扩展名太长」，因为 pnpm store 路径 + .cxx/<hash>/<abi>/CMakeFiles/...
 * 逼近 Windows MAX_PATH。README「打包排障」记录过手工解法，这里把它固化进构建链。
 *
 * ★ 必须排在 `cap sync android` 之后：cap sync 每次都会重写 capacitor.settings.gradle，
 *   把 projectDir 指回 pnpm 长路径。排在它之前等于白做。
 * ★ 只同步原生源码（CMakeLists.txt / build.gradle / src / ios assets）到短真实路径，
 *   不复制也不删除 .cxx / build 缓存；避免触发批量删除，也让 Gradle 自行按新 hash 重建。
 */
const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..', '..');
const settingsFile = path.join(mobileDir, 'android', 'capacitor.settings.gradle');
const shortRoot = process.env.YZ_NATIVE_LIB_DIR || 'C:/yz-libs/capnodejs';
const shortAndroid = path.join(shortRoot, 'android');

function copyTree(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += copyTree(src, dest);
    } else {
      fs.copyFileSync(src, dest);
      count += 1;
    }
  }
  return count;
}

// 1) 定位当前 pnpm store 里的插件 android 目录
const pnpmRoot = path.join(repoRoot, 'node_modules', '.pnpm');
if (!fs.existsSync(pnpmRoot)) throw new Error('未找到 pnpm store：' + pnpmRoot);
const candidates = fs.readdirSync(pnpmRoot)
  .filter((name) => name.startsWith('@capawesome+capacitor-nodejs@'))
  .map((name) => path.join(pnpmRoot, name, 'node_modules', '@capawesome', 'capacitor-nodejs', 'android'))
  .filter((dir) => fs.existsSync(path.join(dir, 'CMakeLists.txt')));
if (candidates.length !== 1) {
  throw new Error(`应定位到唯一的 capacitor-nodejs 原生目录，实际 ${candidates.length} 个`);
}
const srcAndroid = candidates[0];

// 2) 同步到短真实路径（不碰 .cxx / build 缓存）
fs.mkdirSync(shortAndroid, { recursive: true });
let copied = 0;
for (const name of ['CMakeLists.txt', 'build.gradle', 'proguard-rules.pro']) {
  const src = path.join(srcAndroid, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(shortAndroid, name));
    copied += 1;
  }
}
copied += copyTree(path.join(srcAndroid, 'src'), path.join(shortAndroid, 'src'));
// build.gradle 里 assets.srcDirs += '../ios/Plugin/Assets'
copied += copyTree(
  path.join(srcAndroid, '..', 'ios', 'Plugin', 'Assets'),
  path.join(shortRoot, 'ios', 'Plugin', 'Assets'),
);

// 3) 把 gradle 模块指向短路径（幂等）
if (!fs.existsSync(settingsFile)) throw new Error('未找到 ' + settingsFile + '，请先 cap sync android');
let text = fs.readFileSync(settingsFile, 'utf8');
const marker = /project\(':capawesome-capacitor-nodejs'\)\.projectDir = new File\([^\r\n]*\)/;
if (!marker.test(text)) throw new Error('capacitor.settings.gradle 里没有 nodejs 模块的 projectDir');
const shortPosix = shortAndroid.replace(/\\/g, '/');
const replacement = `project(':capawesome-capacitor-nodejs').projectDir = new File('${shortPosix}')`;
if (text.includes(replacement)) {
  console.log('[nodejs-shortpath] 补丁已生效：' + shortPosix);
} else {
  text = text.replace(marker, replacement);
  fs.writeFileSync(settingsFile, text);
  console.log('[nodejs-shortpath] 已重写 projectDir -> ' + shortPosix);
}
console.log(`[nodejs-shortpath] 已同步 ${copied} 个原生源码文件（不清理 .cxx 缓存）`);
