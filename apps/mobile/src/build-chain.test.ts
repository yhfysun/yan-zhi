/**
 * Android 打包链接线契约 —— 把本轮三次真实踩坑钉死，防止以后改回去又炸。
 *
 * ① 正式链必须走 gradlew assembleRelease（固定签名、非 debuggable）；
 *    assembleDebug 仅保留给模拟器和显式开发调试。
 * ② cap sync 每次重写 capacitor.settings.gradle，把 nodejs 原生库指回 pnpm 长路径
 *    → 短路径补丁必须排在 cap sync 之后、Gradle 之前，否则 Windows MAX_PATH 又炸。
 * ③ M1 NFC 原生插件由幂等脚本铺进被 gitignore 的 android/ → 必须排在 cap sync 之前。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(ROOT, '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const chain = (): string => JSON.parse(read('package.json')).scripts['build:android'];
const devChain = (): string => JSON.parse(read('package.json')).scripts['build:android:dev'];

describe('Android 打包链接线', () => {
  it('★ 正式链使用 assembleRelease，调试链显式保留 assembleDebug', () => {
    const c = chain();
    expect(c).not.toContain('cap build android');
    expect(c).toContain('scripts/assemble-release.cjs');
    expect(c).toContain('scripts/apply-native-release.cjs');
    expect(devChain()).toContain('scripts/assemble-debug.cjs');
    expect(devChain()).toContain('copy-apk.cjs --debug');
    const assemble = read('scripts/assemble-debug.cjs');
    expect(assemble).toContain("'assembleRelease'");
    expect(assemble).toContain("'assembleDebug'");
    expect(assemble).toContain('resolveJavaHome');
    expect(assemble).toContain('jdk-21');
    expect(assemble).toContain('resolveAndroidSdk');
    expect(assemble).toContain('local.properties');
    expect(assemble).toContain('assertCapacitorNodeAssets');
    expect(assemble).toContain("'nodejs', 'index.js'");
    expect(assemble).toContain("'dist', 'apps', 'server', 'src', 'index.js'");
    expect(assemble).toContain('拒绝构建空后端 APK');
    expect(assemble).toContain('assertCapacitorFrontendAssets');
    expect(assemble).toContain('Android Web 入口与移动端 dist 不一致');
    expect(assemble).toContain('Android Web 入口引用了不存在的构建资源');
    expect(assemble).toContain('assertApkNativeLibraries');
    expect(assemble).toContain("'clean', gradleTask");
    expect(assemble).toContain('libnode.so');
    expect(assemble).toContain('libcapacitor-nodejs.so');
  });

  it('★ 短路径补丁排在 cap sync 之后、Gradle 之前，且不批量删缓存', () => {
    const c = chain();
    expect(c).toContain('apply-native-nodejs-shortpath.cjs');
    expect(c.indexOf('cap sync android')).toBeLessThan(c.indexOf('apply-native-nodejs-shortpath.cjs'));
    expect(c.indexOf('apply-native-nodejs-shortpath.cjs')).toBeLessThan(c.indexOf('assemble-release.cjs'));

    const patch = read('scripts/apply-native-nodejs-shortpath.cjs');
    expect(patch).toContain('capacitor.settings.gradle');
    expect(patch).toContain('capawesome-capacitor-nodejs');
    // 短路径工程必须自己配置 CMake；只复制源码会把 libnode.so 留在深路径缓存里，
    // Gradle 仍能成功，但 APK 缺原生库后会 UnsatisfiedLinkError 闪退。
    expect(patch).toContain('externalNativeBuild');
    expect(patch).toContain('path "CMakeLists.txt"');
    expect(patch).toContain('-DLIBNODE_DIR=');
    expect(patch).toContain('legacyJniLine');
    // externalNativeBuild 会随 CMake 产物打包 STL；再手铺一份会触发 duplicate native lib。
    expect(patch).toContain('externalNativeBuild');
    expect(patch).not.toContain('libc++_shared.so');
    expect(patch).toContain("jniLibs.srcDirs += ['src/main/jniLibs']");
    // CMake 的 include_directories 指向 ../ios/PluginNative；漏掉 bridge.h 会直接断编。
    expect(patch).toContain("'PluginNative'");
    // 同步原生源码时只复制不删除，避免触发批量删除保护
    expect(patch).not.toMatch(/\brmSync\s*\(/);
  });

  it('★ 固定签名紧跟在原生工程同步后，并在复制 APK 前校验证书', () => {
    const c = chain();
    expect(c).toContain('node scripts/apply-native-signing.cjs');
    expect(c.indexOf('apply-native-nodejs-shortpath.cjs'))
      .toBeLessThan(c.indexOf('apply-native-signing.cjs'));
    expect(c.indexOf('apply-native-signing.cjs')).toBeLessThan(c.indexOf('apply-native-release.cjs'));
    expect(c.indexOf('apply-native-release.cjs')).toBeLessThan(c.indexOf('assemble-release.cjs'));

    const copyApk = read('scripts/copy-apk.cjs');
    expect(copyApk).toContain('verifyApkSignature');
    expect(copyApk).toContain('APK 签名校验失败');
    expect(copyApk).toContain('application-debuggable');
  });

  it('M1 NFC 插件脚本排在 cap sync 之前，copy-apk 是链路终点', () => {
    const c = chain();
    expect(c.indexOf('apply-native-m1nfc.cjs')).toBeLessThan(c.indexOf('cap sync android'));
    expect(c.trimEnd().endsWith('copy-apk.cjs')).toBe(true);
    const copyApk = read('scripts/copy-apk.cjs');
    expect(copyApk).toContain("['arm64-v8a', 'armeabi-v7a', 'x86_64']");
    expect(copyApk).toContain('`lib/${abi}/libnode.so`');
    expect(copyApk).toContain('`lib/${abi}/libcapacitor-nodejs.so`');
    expect(copyApk).toContain('`lib/${abi}/libc++_shared.so`');
    expect(copyApk).toContain('assets/public/nodejs/dist/apps/server/src/index.js');
    expect(copyApk).toContain("profile === 'slim' ? 140 : 300");
  });

  it('★ package:android 默认走精简发行链，完整全 ABI 包必须显式选择', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['package:android']).toBe('node scripts/package-android.cjs');
    expect(pkg.scripts['package:android:full']).toBe('node scripts/package-android.cjs --android-full');

    const packageSource = readFileSync(resolve(REPO_ROOT, 'scripts/package.cjs'), 'utf8');
    expect(packageSource).toContain('const ANDROID_FULL = flags.has');
    expect(packageSource).toContain("'build-android-slim.cjs'");
    expect(packageSource).toContain("info('① 构建安卓完整调试包");

    const slim = read('scripts/build-android-slim.cjs');
    expect(slim).toContain('loadMobileProfile');
    expect(slim).toContain('MOBILE_PROFILE.abis');
    expect(slim).toContain("YZ_ANDROID_PACKAGE_PROFILE: 'slim'");
    expect(slim).toContain('YZ_EXPECTED_ABIS: abi');
    expect(slim).toContain('(?:\\.\\/)?scripts\\/copy-apk\\.cjs');
    expect(slim, '精简链失败时必须抛错走 finally 还原全量模式表').not.toContain('process.exit(');
  });

  it('★ 旧产物清理是链路第一步，直接删除且不再生成时间戳备份目录', () => {
    const c = chain();
    expect(c.startsWith('node scripts/prepare-clean-build.cjs')).toBe(true);
    const cleaner = read('scripts/prepare-clean-build.cjs');
    expect(cleaner).toContain('rmSync');
    expect(cleaner).toContain('maxRetries: 10');
    expect(cleaner).toContain('retryDelay: 250');
    expect(cleaner).toContain('capacitor-cordova-android-plugins');
    expect(cleaner).not.toContain('renameSync');
    expect(cleaner).not.toContain('yz-build-bak');
    expect(cleaner, '清理失败时不能静默留下一份新备份').not.toContain('bakDir');
    expect(cleaner).not.toMatch(/\bunlinkSync\s*\(/);
  });

  it('★ 移动端白名单与发行配置同源，店铺/安全/运维不能再次被裁掉', () => {
    const modeSource = readFileSync(resolve(REPO_ROOT, 'packages/ui/src/stores/mode.ts'), 'utf8');
    const slim = read('scripts/build-android-slim.cjs');
    const profile = JSON.parse(readFileSync(resolve(REPO_ROOT, 'build/mobile.catalog.json'), 'utf8'));

    expect(modeSource).toContain("import mobileProfile from '../../../../build/mobile.catalog.json'");
    expect(modeSource).toContain('const MOBILE_ALLOWED_MODES: readonly string[] = mobileProfile.modes');
    expect(slim).toContain('loadMobileProfile');
    for (const plugin of profile.plugins) {
      expect(slim, `发行配置缺少 ${plugin}`).not.toContain(`'${plugin}'`);
    }
    const viteIndex = slim.indexOf("path.join(MOBILE_DIR, 'node_modules', 'vite', 'bin', 'vite.js')");
    const verifyIndex = slim.indexOf('run(process.execPath, [VERIFY_MODE_PRUNE');
    expect(verifyIndex).toBeGreaterThan(viteIndex);
    expect(slim).toContain("'--dirs=apps/mobile/dist'");
  });

  it('★ 前端构建校验后立即恢复全量模式表，不能等整条 APK 链结束', () => {
    const slim = read('scripts/build-android-slim.cjs');
    const selectIndex = slim.indexOf('selectSlimModes();');
    const verifyIndex = slim.indexOf('run(process.execPath, [VERIFY_MODE_PRUNE');
    const restoreIndex = slim.indexOf('restoreModes();', verifyIndex);
    const backendIndex = slim.indexOf('build-mobile-server.cjs', verifyIndex);

    expect(selectIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(verifyIndex);
    expect(backendIndex).toBeGreaterThan(restoreIndex);
    expect(slim).toContain('slimModesSelected');
  });

  it('★ 精简包必须物理删除未选模式的后端入口与专属实现', () => {
    const slim = read('scripts/build-android-slim.cjs');
    const serverBuild = read('scripts/build-mobile-server.cjs');
    const copyApk = read('scripts/copy-apk.cjs');
    const serverIndex = readFileSync(resolve(REPO_ROOT, 'apps/server/src/index.ts'), 'utf8');

    expect(slim).toContain('verifySlimBackend');
    expect(slim).toContain('Object.keys(MODES_CATALOG.modes || {})');
    expect(slim).toContain('MOBILE_PROFILE.modes.includes(mode)');
    expect(serverBuild).toContain('pruneExcludedModeSources');
    expect(serverBuild).toContain('staticDependencyClosure');
    expect(serverBuild).toContain('YZ_BUILD_PLUGIN_KEEP');
    expect(copyApk).toContain('forbiddenSlimEntries');
    expect(serverBuild).not.toContain("plugin.kind !== 'mode'");
    for (const mode of ['dev-mode', 'wf-mode', 'rpa-mode', 'clip-mode']) {
      expect(copyApk).toContain(`plugins/${mode}.js`);
      expect(serverIndex).toContain(`await import('./plugins/${mode}.js')`);
    }
    for (const feature of ['git-explorer', 'cicd-pipeline', 'java-suite', 'computer-use', 'android-mirror']) {
      expect(serverIndex).toContain(`await import('./plugins/${feature}.js')`);
      expect(serverIndex).not.toContain(`from './plugins/${feature}.js';`);
    }
    for (const route of ['git', 'env', 'debug']) {
      expect(serverIndex).toContain(`import('./routes/${route}.js')`);
      expect(serverIndex).not.toContain(`from './routes/${route}.js';`);
    }
    expect(serverBuild).toContain('plugins/desktop-capability.js');
    expect(serverIndex).not.toMatch(
      /^import\s*\{[^}]+\}\s*from\s*'\.\/plugins\/(?:dev|wf|rpa|clip)-mode\.js';/m,
    );
  });

  it('★ GitHub 移动打包先构建 Web 入口，再生成 Android 工程', () => {
    const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/build-mobile.yml'), 'utf8');
    const vite = workflow.indexOf('pnpm --filter @yan-zhi/mobile exec vite build');
    const capAdd = workflow.indexOf('capacitor add android');

    expect(vite).toBeGreaterThan(-1);
    expect(capAdd).toBeGreaterThan(-1);
    expect(vite).toBeLessThan(capAdd);
    expect(workflow).not.toMatch(/mkdir -p\s+dist(?:\s|$)/);
    expect(workflow).not.toMatch(/pnpm[^\n]*\btest\b/);
    expect(workflow, 'packages/ui 变更必须触发移动端重新打包').toContain("- 'packages/ui/**'");
  });

  it('★ Android 构建必须先拉取 Sherpa TTS 资源，再应用原生接线', () => {
    const c = chain();
    const fetchIndex = c.indexOf('node scripts/fetch-sherpa.cjs');
    const applyIndex = c.indexOf('node scripts/apply-native-sherpa.cjs');

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeLessThan(applyIndex);
  });

  it('★ 移动发行配置是唯一真相源：五模式、保留 TTS/皮肤/远控控制端，排除 Git/CICD/Java', () => {
    const profile = JSON.parse(readFileSync(resolve(REPO_ROOT, 'build/mobile.catalog.json'), 'utf8'));

    expect(profile.modes).toEqual(['office', 'shop', 'ops', 'sec', 'learning']);
    expect(profile.plugins).toEqual(expect.arrayContaining([
      'office-core',
      'shop-ops',
      'ops-shell',
      'sec-lab',
      'learning-mode',
      'remote-control',
      'skins',
    ]));
    for (const excluded of [
      'git-explorer',
      'cicd-pipeline',
      'java-suite',
      'dev-mode',
      'wf-mode',
      'rpa-mode',
      'clip-mode',
      'computer-use',
      'android-mirror',
    ]) {
      expect(profile.plugins, `手机发行包不能包含 ${excluded}`).not.toContain(excluded);
    }
    expect(profile.abis).toEqual(['arm64-v8a', 'armeabi-v7a']);
    expect(profile.keepOfflineTts).toBe(true);
    expect(profile.keepSkins).toBe(true);
    expect(profile.stripBuiltinFrontends).toBe(true);
    expect(profile.stripDesktopPetAssets).toBe(true);
    expect(profile.stripSourceMaps).toBe(true);
  });

  it('★ 移动发行链按配置逐 ABI 出包，并只复制当前构建的 APK', () => {
    const slim = read('scripts/build-android-slim.cjs');
    const copyApk = read('scripts/copy-apk.cjs');

    expect(slim).toContain("require('../../../scripts/lib/mobile-build-profile.cjs')");
    expect(slim).toContain('for (const abi of MOBILE_PROFILE.abis)');
    expect(slim).toContain('YZ_EXPECTED_ABIS: abi');
    expect(slim).toContain('YZ_ANDROID_ARTIFACT_NAME');
    expect(slim).toContain("'--exact-plugins'");
    expect(slim).not.toContain("process.env.YZ_SLIM_ABIS ||");

    expect(copyApk).not.toContain('walk(apkRoot)');
    expect(copyApk).toContain("`app-${buildType}.apk`");
    expect(copyApk).toContain('expectedVersionCode');
    expect(copyApk).toContain('YZ_ANDROID_ARTIFACT_NAME');
    expect(copyApk).toContain('YZ_CLEAN_ANDROID_OUT');
  });

  it('★ 手机包不携带重复插件前端、桌宠素材和 sourcemap', () => {
    const serverBuild = read('scripts/build-mobile-server.cjs');
    const mobileVite = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8');

    expect(serverBuild).not.toContain("'--with-frontend'");
    expect(serverBuild).toContain('pruneMobileArtifacts');
    expect(serverBuild).toContain('frontend');
    expect(serverBuild).toContain(".map");
    expect(mobileVite).toContain('pet-assets.mobile.ts');
    expect(mobileVite).toContain('yz-mobile-pet-asset-stub');
  });

  it('★ 手机端统一拦截桌面专属路由、插件安装和动态路由', () => {
    const routerSource = readFileSync(resolve(REPO_ROOT, 'packages/ui/src/router/index.ts'), 'utf8');
    const pluginManager = readFileSync(
      resolve(REPO_ROOT, 'packages/ui/src/components/plugin/PluginManager.vue'),
      'utf8',
    );
    const pluginRoutes = readFileSync(resolve(REPO_ROOT, 'apps/server/src/routes/plugins.ts'), 'utf8');
    const serverIndex = readFileSync(resolve(REPO_ROOT, 'apps/server/src/index.ts'), 'utf8');

    for (const path of ['/pet-settings', '/pet-window', '/pet-popup', '/live', '/git-explorer']) {
      expect(routerSource).toContain(`'${path}'`);
    }
    expect(routerSource).toContain('meta?.desktopOnly');
    expect(routerSource).toContain('isMobileBlockedPath');
    expect(pluginManager).toContain('v-if="pluginStore.canInstall"');
    expect(pluginRoutes).toContain('MOBILE_PLUGIN_INSTALL_DISABLED');
    expect(serverIndex).toMatch(/if \(!process\.env\.MOBILE_MODE\) \{\s+const \{ default: gitRoutes \} = await import\('\.\/routes\/git\.js'\);\s+app\.use\('\/api\/git'/);
  });

  it('★ 打包说明与正式脚本同源，禁止后续再写回旧产物口径', () => {
    const docs = readFileSync(resolve(REPO_ROOT, 'docs/android-packaging.md'), 'utf8');
    const mobileReadme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    const rootReadme = readFileSync(resolve(REPO_ROOT, 'README.md'), 'utf8');

    for (const text of [docs, mobileReadme, rootReadme]) {
      expect(text).toContain('build/mobile.catalog.json');
    }
    expect(docs).toContain('yan-zhi-<版本>-arm64-v8a.apk');
    expect(docs).toContain('yan-zhi-<版本>-armeabi-v7a.apk');
    expect(docs).not.toContain('双 ABI arm64-v8a + armeabi-v7a）≈ **279 MB**');
    expect(rootReadme).not.toContain('dist-release/android/<version>/app-debug.apk');
  });

  it('★ GitHub Android 工作流同步双 ABI 命名、配置触发和旧产物拦截', () => {
    const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/build-mobile.yml'), 'utf8');

    expect(workflow).toContain("'build/mobile.catalog.json'");
    expect(workflow).toContain("'scripts/lib/mobile-build-profile.cjs'");
    expect(workflow).toContain('yan-zhi-${VERSION}-arm64-v8a.apk');
    expect(workflow).toContain('yan-zhi-${VERSION}-armeabi-v7a.apk');
    expect(workflow).toContain('Android-Release-APK-5Mode-Split-ABI');
    expect(workflow).toContain("'apps/mobile/scripts/assemble-release.cjs'");
    expect(workflow).toContain("'apps/mobile/scripts/apply-native-release.cjs'");
    expect(workflow).toContain('正式发行目录出现了调试包 app-debug.apk');
    expect(workflow).toContain('正式发行目录出现了 x86/x86_64 调试包');
  });
});
