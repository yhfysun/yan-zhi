/**
 * Android 打包链接线契约 —— 把本轮三次真实踩坑钉死，防止以后改回去又炸。
 *
 * ① `cap build android` 是 release 构建，缺 keystore 四项会直接报
 *    "Missing options. Please supply all options for android signing."
 *    → 内测包必须走 gradlew assembleDebug（默认 debug.keystore 自动签名）。
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

describe('Android 打包链接线', () => {
  it('★ 不再用 cap build android；改走可直接安装的 assembleDebug', () => {
    const c = chain();
    expect(c).not.toContain('cap build android');
    expect(c).toContain('scripts/assemble-debug.cjs');
    const assemble = read('scripts/assemble-debug.cjs');
    expect(assemble).toContain("'assembleDebug'");
    expect(assemble).toContain('resolveJavaHome');
    expect(assemble).toContain('jdk-21');
    expect(assemble).toContain('resolveAndroidSdk');
    expect(assemble).toContain('local.properties');
  });

  it('★ 短路径补丁排在 cap sync 之后、Gradle 之前，且不批量删缓存', () => {
    const c = chain();
    expect(c).toContain('apply-native-nodejs-shortpath.cjs');
    expect(c.indexOf('cap sync android')).toBeLessThan(c.indexOf('apply-native-nodejs-shortpath.cjs'));
    expect(c.indexOf('apply-native-nodejs-shortpath.cjs')).toBeLessThan(c.indexOf('assemble-debug.cjs'));

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
    expect(slim).toContain("YZ_ANDROID_PACKAGE_PROFILE: 'slim'");
    expect(slim).toContain('YZ_EXPECTED_ABIS: SLIM_ABIS');
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

  it('★ 精简包模式必须与移动端白名单一致，店铺/安全/运维不能再次被裁掉', () => {
    const modeSource = readFileSync(resolve(REPO_ROOT, 'packages/ui/src/stores/mode.ts'), 'utf8');
    const slim = read('scripts/build-android-slim.cjs');
    const modeList = /const MOBILE_ALLOWED_MODES[^=]*=\s*\[([^\]]+)\]/.exec(modeSource)?.[1] || '';
    const slimList = /const SLIM_MODES\s*=\s*\[([^\]]+)\]/.exec(slim)?.[1] || '';
    const parse = (source: string) => [...source.matchAll(/'([^']+)'/g)].map((hit) => hit[1]);

    expect(parse(modeList)).toEqual(['office', 'shop', 'ops', 'sec', 'learning']);
    expect(parse(slimList)).toEqual(parse(modeList));
    for (const plugin of ['office-core', 'shop-ops', 'ops-shell', 'sec-lab', 'learning-mode']) {
      expect(slim, `精简包缺少 ${plugin}`).toContain(`'${plugin}'`);
    }
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
});
