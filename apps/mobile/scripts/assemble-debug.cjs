/**
 * 构建 Android debug/release APK（幂等、跨平台）。
 *
 * 默认仍是 debug，方便模拟器排障；正式发行由 assemble-release.cjs
 * 设置 YZ_ANDROID_BUILD_TYPE=release 后复用本脚本。release 必须传入单 ABI，
 * 防止误生成 universal APK。
 *
 * ★ 必须排在 apply-native-nodejs-shortpath.cjs 之后：cap sync 会重写
 *   capacitor.settings.gradle，短路径补丁被冲掉后原生库又会撞 Windows MAX_PATH。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const buildType = String(process.env.YZ_ANDROID_BUILD_TYPE || 'debug').trim().toLowerCase();
if (!['debug', 'release'].includes(buildType)) {
  throw new Error(`YZ_ANDROID_BUILD_TYPE 必须是 debug 或 release，实际为 ${buildType}`);
}
const isRelease = buildType === 'release';
const gradleTask = isRelease ? 'assembleRelease' : 'assembleDebug';
const gradleTaskLabel = gradleTask.charAt(0).toUpperCase() + gradleTask.slice(1);

const androidDir = path.join(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const localProperties = path.join(androidDir, 'local.properties');
const androidWebAssets = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public');
const distDir = path.join(__dirname, '..', 'dist');
const apkDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', buildType);
const apkPath = path.join(apkDir, `app-${buildType}.apk`);

function referencedAssets(html) {
  return [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((match) => match[1]);
}

/**
 * Capacitor 同步可能只复制了一半资源，留下旧 index.html + 新 assets/。
 * 这种包 Gradle 仍会成功，但 WebView 会回退到缓存里的旧前端，表现为代码
 * 明明已修复、装上却仍是旧行为。入口 HTML 与 dist 不一致时必须直接中止。
 */
function assertCapacitorFrontendAssets() {
  const distIndex = path.join(distDir, 'index.html');
  const copiedIndex = path.join(androidWebAssets, 'index.html');
  if (!fs.existsSync(distIndex) || !fs.existsSync(copiedIndex)) {
    throw new Error('缺少前端入口 index.html，请先运行 vite build 与 cap sync android。');
  }

  const distHtml = fs.readFileSync(distIndex, 'utf8');
  const copiedHtml = fs.readFileSync(copiedIndex, 'utf8');
  const distAssets = referencedAssets(distHtml);
  const copiedAssets = referencedAssets(copiedHtml);
  if (!distAssets.length || distAssets.join('\n') !== copiedAssets.join('\n')) {
    throw new Error(
      'Android Web 入口与移动端 dist 不一致，拒绝构建混用新旧前端的 APK。\n'
      + `  dist:    ${distAssets.join(', ') || '(无资源引用)'}\n`
      + `  android: ${copiedAssets.join(', ') || '(无资源引用)'}\n`
      + '请重新执行 cap sync android。',
    );
  }

  const missing = copiedAssets.filter((asset) => {
    const file = path.join(androidWebAssets, ...asset.split('/'));
    return !fs.existsSync(file) || fs.statSync(file).size === 0;
  });
  if (missing.length) {
    throw new Error(
      'Android Web 入口引用了不存在的构建资源，拒绝构建无法启动的 APK：\n  '
      + missing.join('\n  ')
      + '\n请重新执行 cap sync android。',
    );
  }
}

const abiFilterArg = String(process.env.YZ_GRADLE_PROPS || '')
  .split(/[;\s]+/)
  .find((arg) => arg.startsWith('yanZhiAbiFilters='));
const expectedAbis = abiFilterArg
  ? abiFilterArg.slice('yanZhiAbiFilters='.length).split(',').map((abi) => abi.trim()).filter(Boolean)
  : ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
if (isRelease && expectedAbis.length !== 1) {
  throw new Error(`正式 release 包必须显式指定单 ABI，当前为: ${expectedAbis.join(',') || '(空)'}`);
}

/**
 * ABI 切换时 Gradle 可能错误复用 mergeDebugNativeLibs 缓存，产出只带 ABI
 * 目录却缺少 libnode.so 的“能安装、启动即崩”包。这里在成功构建后直接读
 * APK 中央目录，关键原生库缺失就拒绝放行。
 */
function assertApkNativeLibraries() {
  if (!fs.existsSync(apkPath) || fs.statSync(apkPath).size === 0) {
    throw new Error('Gradle 成功结束但未找到 APK: ' + apkPath);
  }
  const fd = fs.openSync(apkPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 2 * 1024 * 1024);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const required = expectedAbis.flatMap((abi) => [
      `lib/${abi}/libnode.so`,
      `lib/${abi}/libcapacitor-nodejs.so`,
      `lib/${abi}/libc++_shared.so`,
      `lib/${abi}/libonnxruntime.so`,
      `lib/${abi}/libsherpa-onnx-jni.so`,
      `lib/${abi}/libsqlcipher.so`,
    ]);
    const missing = required.filter((name) => !tail.includes(name));
    const unexpected = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']
      .filter((abi) => !expectedAbis.includes(abi) && tail.includes(`lib/${abi}/`));
    if (missing.length) {
      throw new Error(
        'APK 缺少关键原生库，拒绝交付：\n  '
        + missing.join('\n  ')
        + `\n请清理 Android native 构建缓存后重新执行 clean ${gradleTask}。`,
      );
    }
    if (unexpected.length) {
      throw new Error(
        'APK 混入了未声明的 ABI，拒绝交付：\n  '
        + unexpected.join('\n  ')
        + `\n本次 ABI=${expectedAbis.join(',')}，请检查 Gradle clean 与 ABI 过滤。`,
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Vite 会清空 dist；若只跑 `vite build → cap sync` 而漏掉
 * build-mobile-server.cjs，APK 仍会构建成功，但启动时 NodejsPlugin 会报
 * “The Node.js project directory was not found”，插件路由全部不可用。
 * 在 Gradle 前检查真正会被打进 APK 的资产，避免再次产出“空后端”包。
 */
function assertCapacitorNodeAssets() {
  const required = [
    path.join(androidWebAssets, 'nodejs', 'index.js'),
    path.join(androidWebAssets, 'nodejs', 'dist', 'apps', 'server', 'src', 'index.js'),
  ];
  const missing = required.filter((file) => !fs.existsSync(file) || fs.statSync(file).size === 0);
  if (!missing.length) return;
  const rel = missing.map((file) => path.relative(androidDir, file)).join('\n  ');
  throw new Error(
    'Android Web 资产缺少内嵌 Node 后端，拒绝构建空后端 APK：\n  ' + rel
    + '\n请先运行 node scripts/build-mobile-server.cjs，再执行 cap sync android。',
  );
}

function hasJava21(home) {
  if (!home) return false;
  const java = path.join(home, 'bin', isWin ? 'java.exe' : 'java');
  if (!fs.existsSync(java)) return false;
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const match = /version "(\d+)/.exec(text);
  return !!match && Number(match[1]) >= 21;
}

/** JDK 21 是 Capacitor 8 的硬要求；优先环境变量，其次扫描常见安装根目录自动探测版本。 */
function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Android', 'Android Studio', 'jbr') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr') : '',
  ];
  // 扫描 Java 安装根目录下的子目录（不写死版本号目录名，如 jdk-21.0.12.1+1 也能命中）
  const javaRoots = [
    'C:/APP/Java',
    'C:/Program Files/Java',
    'C:/Program Files/Eclipse Adoptium',
    'C:/Program Files/Microsoft',
  ];
  for (const root of javaRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      candidates.push(path.join(root, name));
    }
  }
  const found = candidates.find(hasJava21);
  if (!found) throw new Error('未找到 JDK 21。请设置 JAVA_HOME 指向 JDK 21+ 后重试。');
  return found;
}

function readConfiguredSdk() {
  if (!fs.existsSync(localProperties)) return '';
  const match = /^sdk\.dir=(.+)$/m.exec(fs.readFileSync(localProperties, 'utf8'));
  return match ? match[1].trim() : '';
}

function validSdk(dir) {
  if (!dir) return false;
  return fs.existsSync(path.join(dir, 'platform-tools', isWin ? 'adb.exe' : 'adb'))
    && fs.existsSync(path.join(dir, 'platforms'));
}

/** 顺序：环境变量 → local.properties → 标准位置 → 本机包装管理器内的 SDK。 */
function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    readConfiguredSdk(),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    'C:/Android/Sdk',
  ];
  const packagesRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Packages')
    : '';
  if (packagesRoot && fs.existsSync(packagesRoot)) {
    for (const name of fs.readdirSync(packagesRoot)) {
      candidates.push(path.join(packagesRoot, name, 'LocalCache', 'Local', 'Android', 'Sdk'));
    }
  }
  const found = candidates.find(validSdk);
  if (!found) throw new Error('未找到 Android SDK。请设置 ANDROID_HOME，或先安装 Android SDK。');
  fs.writeFileSync(localProperties, `sdk.dir=${found.replace(/\\/g, '/')}\n`, 'utf8');
  return found;
}

/**
 * 透传的 Gradle property（-Pxxx）。
 * ★ 目前只有 yanZhiAbiFilters —— 精简包用它裁掉模拟器 ABI（省 150MB+）。
 *   普通构建不传 ⇒ 与此前行为逐字一致（保留模拟器 ABI）。
 */
const gradleProps = [];
if (process.env.YZ_GRADLE_PROPS) {
  for (const p of String(process.env.YZ_GRADLE_PROPS).split(/[;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    gradleProps.push(`-P${p}`);
  }
}

const javaHome = resolveJavaHome();
const androidSdk = resolveAndroidSdk();
assertCapacitorFrontendAssets();
assertCapacitorNodeAssets();
console.log('[assemble-android] JAVA_HOME:', javaHome);
console.log('[assemble-android] ANDROID_HOME:', androidSdk);
console.log(`[assemble-android] BUILD_TYPE=${buildType} TASK=${gradleTask} ABI=${expectedAbis.join(',')}`);

const result = spawnSync(gradlew, ['clean', gradleTask, '--console=plain', ...gradleProps], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
  },
});

if (result.error) {
  console.error('[assemble-android] 启动 Gradle 失败:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[assemble-android] Gradle 退出码:', result.status);
  process.exit(result.status || 1);
}
assertApkNativeLibraries();
console.log(`[assemble-android] ${gradleTaskLabel} 完成，APK 在 ${path.relative(__dirname, apkDir)}`);
