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
 * ★ 必须把复制后的 build.gradle 改为真正配置 externalNativeBuild。历史补丁曾把
 *   jniLibs 指向原深路径中的固定 CMake 产物；工程换到短路径后该目录不存在，
 *   Gradle 仍会“构建成功”，但 APK 只剩 Web/Sherpa，缺 libnode.so 后启动闪退。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..', '..');
const settingsFile = path.join(mobileDir, 'android', 'capacitor.settings.gradle');
const shortRoot = process.env.YZ_NATIVE_LIB_DIR || (
  process.platform === 'win32'
    ? 'C:/yz-libs/capnodejs'
    : path.join(os.tmpdir(), 'yz-libs', 'capnodejs')
);
const shortAndroid = path.join(shortRoot, 'android');
const shortJniLibs = path.join(shortAndroid, 'src', 'main', 'jniLibs');

const ABI_TO_NDK_TRIPLE = {
  'arm64-v8a': 'aarch64-linux-android',
  'armeabi-v7a': 'arm-linux-androideabi',
  'x86_64': 'x86_64-linux-android',
};

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

function resolveAndroidNdk() {
  const explicit = [process.env.ANDROID_NDK_HOME, process.env.ANDROID_NDK_ROOT].filter(Boolean);
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
  ].filter(Boolean);
  const candidates = [...explicit];
  for (const sdkRoot of sdkRoots) {
    const ndkRoot = path.join(sdkRoot, 'ndk');
    if (!fs.existsSync(ndkRoot)) continue;
    for (const name of fs.readdirSync(ndkRoot).sort().reverse()) candidates.push(path.join(ndkRoot, name));
  }
  const hostTags = process.platform === 'win32'
    ? ['windows-x86_64']
    : process.platform === 'darwin'
      ? ['darwin-x86_64', 'darwin-arm64']
      : ['linux-x86_64'];
  let found = null;
  let foundHost = '';
  for (const dir of candidates) {
    const host = hostTags.find((tag) =>
      fs.existsSync(path.join(dir, 'toolchains', 'llvm', 'prebuilt', tag, 'sysroot', 'usr', 'lib')),
    );
    if (host) {
      found = dir;
      foundHost = host;
      break;
    }
  }
  if (!found) throw new Error('未找到 Android NDK（需要 libc++_shared.so）');
  return { dir: found, host: foundHost };
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
copied += copyTree(
  path.join(srcAndroid, '..', 'ios', 'PluginNative'),
  path.join(shortRoot, 'ios', 'PluginNative'),
);

// nodejs-mobile 的 libnode.so 动态依赖 libc++_shared.so。AGP 不会仅因
// CMake 导入了预编译 libnode 就自动打包 STL 运行库，必须按 ABI 显式铺入。
const ndk = resolveAndroidNdk();
const ndkDir = ndk.dir;
const ndkSysrootLib = path.join(
  ndkDir, 'toolchains', 'llvm', 'prebuilt', ndk.host, 'sysroot', 'usr', 'lib',
);
for (const [abi, triple] of Object.entries(ABI_TO_NDK_TRIPLE)) {
  const src = path.join(ndkSysrootLib, triple, 'libc++_shared.so');
  if (!fs.existsSync(src)) throw new Error(`NDK 缺少 ${abi} libc++_shared.so: ${src}`);
  const dest = path.join(shortJniLibs, abi, 'libc++_shared.so');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied += 1;
}

// 3) 修正复制后的 build.gradle：从短路径 CMake 实际编译，不再引用深路径固定产物
const shortBuildFile = path.join(shortAndroid, 'build.gradle');
let buildGradle = fs.readFileSync(shortBuildFile, 'utf8');
const legacyJniLine = /\s*jniLibs\.srcDirs \+= \['build\/intermediates\/cxx\/Debug\/[^']+'\]\r?\n/;
buildGradle = buildGradle.replace(legacyJniLine, '\n');

if (!buildGradle.includes('path "CMakeLists.txt"')) {
  const sourceSetsMarker = '    sourceSets {';
  if (!buildGradle.includes(sourceSetsMarker)) {
    throw new Error('capacitor-nodejs build.gradle 缺少 sourceSets 配置');
  }
  buildGradle = buildGradle.replace(sourceSetsMarker, `    externalNativeBuild {
        cmake {
            path "CMakeLists.txt"
            version "3.22.1"
        }
    }
${sourceSetsMarker}`);
}

if (!buildGradle.includes('-DLIBNODE_DIR=')) {
  const runnerMarker = '        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"';
  if (!buildGradle.includes(runnerMarker)) {
    throw new Error('capacitor-nodejs build.gradle 缺少 defaultConfig 标记');
  }
  const cmakeArguments = `        externalNativeBuild {
            cmake {
                arguments "-DLIBNODE_DIR=\${libnodeDir.absolutePath.replace('\\\\', '/')}"
            }
        }`;
  buildGradle = buildGradle.replace(runnerMarker, `${runnerMarker}\n${cmakeArguments}`);
}
if (!buildGradle.includes("jniLibs.srcDirs += ['src/main/jniLibs']")) {
  const mainSourceSet = /sourceSets\s*\{\s*\r?\n\s*main\s*\{/;
  if (!mainSourceSet.test(buildGradle)) {
    throw new Error('capacitor-nodejs build.gradle 缺少 main sourceSet');
  }
  buildGradle = buildGradle.replace(mainSourceSet, (match) =>
    `${match}\n            jniLibs.srcDirs += ['src/main/jniLibs']`,
  );
}
fs.writeFileSync(shortBuildFile, buildGradle);

// 4) 把 gradle 模块指向短路径（幂等）
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
console.log('[nodejs-shortpath] CMake 构建已启用（libnode.so 将进入 APK）');
console.log(`[nodejs-shortpath] 已铺入 3 个 ABI 的 libc++_shared.so（NDK: ${ndkDir} / ${ndk.host}）`);
