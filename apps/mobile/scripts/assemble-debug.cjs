/**
 * 构建「可直接安装」的 Android debug APK（幂等、跨平台）。
 *
 * ★ 为什么不用 `cap build android`：Capacitor CLI 的 build 是 release 构建，
 *   强制要求 keystore 四项签名配置，否则直接报
 *   "Missing options. Please supply all options for android signing."
 *   课程内测包只需要 debug（Gradle 自动用 debug.keystore 签名），装机后可覆盖升级。
 * ★ 必须排在 apply-native-nodejs-shortpath.cjs 之后：cap sync 会重写
 *   capacitor.settings.gradle，短路径补丁被冲掉后原生库又会撞 Windows MAX_PATH。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const localProperties = path.join(androidDir, 'local.properties');

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
console.log('[assemble-debug] JAVA_HOME:', javaHome);
console.log('[assemble-debug] ANDROID_HOME:', androidSdk);

const result = spawnSync(gradlew, ['assembleDebug', '--console=plain', ...gradleProps], {
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
  console.error('[assemble-debug] 启动 Gradle 失败:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[assemble-debug] Gradle 退出码:', result.status);
  process.exit(result.status || 1);
}
console.log('[assemble-debug] assembleDebug 完成，APK 在 android/app/build/outputs/apk/debug/');
