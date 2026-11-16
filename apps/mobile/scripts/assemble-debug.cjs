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
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

/**
 * 透传的 Gradle property（-Pxxx）。
 * ★ 目前只有 yanZhiAbiFilters —— 精简包用它裁掉 x86_64 的 libnode.so（省 55.6MB）。
 *   普通构建不传 ⇒ 与此前行为逐字一致（保留模拟器 ABI）。
 */
const gradleProps = [];
if (process.env.YZ_GRADLE_PROPS) {
  for (const p of String(process.env.YZ_GRADLE_PROPS).split(/[;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    gradleProps.push(`-P${p}`);
  }
}

const result = spawnSync(gradlew, ['assembleDebug', '--console=plain', ...gradleProps], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
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
