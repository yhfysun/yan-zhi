/**
 * 安卓工具链解析单测（scripts/package.cjs 的跨平台前置逻辑）。
 *
 * ★ 为什么值得测：这块逻辑的出错方式**在单机上根本验证不了** ——
 *   · 原先 CI（ubuntu）上三处 Windows 硬编码（C:\Android\Sdk / C:\APP\Java\jdk-21…）
 *     全不成立 → preflight 直接 process.exit(1)，构建在第一步就死，
 *     而报错只说「Android SDK 未找到」，看不出是"路径写死了 Windows"；
 *   · 换开发机后 JAVA_HOME 与默认路径谁优先，靠人肉试错太贵。
 *   这两条用假 fs + 假 env 注入平台分支，秒级可验，且能同时覆盖 win32 与 linux。
 *
 * 全部纯函数，不触碰真实磁盘、不需要 Electron。
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  androidToolchainCandidates,
  resolveAndroidToolchain,
} = require('../scripts/lib/pack-helpers.cjs');

describe('androidToolchainCandidates — 平台候选表', () => {
  test('win32：含 Windows 默认落点，且不含 linux 路径', () => {
    const { sdkCandidates } = androidToolchainCandidates({
      platform: 'win32',
      env: {},
      delimiter: ';',
    });
    assert.ok(sdkCandidates.includes('C:\\Android\\Sdk'), 'win32 必须含 C:\\Android\\Sdk');
    assert.ok(
      !sdkCandidates.some((p) => p.startsWith('/usr/')),
      'win32 不该出现 linux 默认路径',
    );
  });

  test('linux（CI）：含 ubuntu runner 的 SDK 落点，且不含 Windows 路径', () => {
    const { sdkCandidates } = androidToolchainCandidates({
      platform: 'linux',
      env: { HOME: '/home/runner' },
      delimiter: ':',
    });
    assert.ok(
      sdkCandidates.includes('/usr/local/lib/android/sdk'),
      'CI 上必须有 ubuntu runner 的 SDK 默认路径（这是原缺陷的根因）',
    );
    assert.ok(
      !sdkCandidates.some((p) => /^[A-Z]:\\/.test(p)),
      'linux 不该出现 Windows 盘符路径',
    );
  });

  test('环境变量优先级最高（ANDROID_HOME 在 ANDROID_SDK_ROOT 之前）', () => {
    const { sdkCandidates } = androidToolchainCandidates({
      platform: 'linux',
      env: { ANDROID_HOME: '/custom/sdk', ANDROID_SDK_ROOT: '/other/sdk' },
    });
    assert.strictEqual(sdkCandidates[0], '/custom/sdk');
    assert.strictEqual(sdkCandidates[1], '/other/sdk');
  });

  test('JAVA_HOME 进候选；win32 追加项目约定的 jdk-21 落点', () => {
    const win = androidToolchainCandidates({
      platform: 'win32',
      env: { JAVA_HOME: 'D:\\jdk' },
    });
    assert.strictEqual(win.javaCandidates[0], 'D:\\jdk');
    assert.ok(win.javaCandidates.includes('C:\\APP\\Java\\jdk-21.0.12.1+1'));

    const linux = androidToolchainCandidates({ platform: 'linux', env: {} });
    assert.ok(
      !linux.javaCandidates.some((p) => /^[A-Z]:\\/.test(p)),
      'linux 不该带 Windows JDK 默认路径',
    );
  });

  test('PATH 分隔符随平台切换（; / :）', () => {
    const win = androidToolchainCandidates({
      platform: 'win32',
      env: { PATH: 'C:\\a;C:\\b' },
      delimiter: ';',
    });
    assert.deepStrictEqual(win.pathDirs, ['C:\\a', 'C:\\b']);

    const nix = androidToolchainCandidates({
      platform: 'linux',
      env: { PATH: '/a:/b' },
      delimiter: ':',
    });
    assert.deepStrictEqual(nix.pathDirs, ['/a', '/b']);
  });

  test('javac 可执行名随平台切换（javac.exe / javac）', () => {
    assert.deepStrictEqual(
      androidToolchainCandidates({ platform: 'win32', env: {} }).javacNames,
      ['javac.exe', 'java.exe'],
    );
    assert.deepStrictEqual(
      androidToolchainCandidates({ platform: 'linux', env: {} }).javacNames,
      ['javac', 'java'],
    );
  });
});

describe('resolveAndroidToolchain — 选取逻辑', () => {
  /**
   * 构造「只认某些路径」的存在性判据。
   *
   * ★ 注意用 path.join 拼期望值而不是硬编码 '/'：本仓开发机是 Windows（path.join 出 '\\'），
   *   CI 是 Linux（出 '/'）—— 测试要在两边都能过，就不能把分隔符写死。
   */
  const makeExists = (presentSet) => (p) => presentSet.has(p);
  const makeExistsIn = (presentSet) => (dir, name) => presentSet.has(path.join(dir, name));
  const j = (...parts) => path.join(...parts);

  test('SDK 与 JDK 都命中候选时，取第一个可用的', () => {
    const cand = androidToolchainCandidates({
      platform: 'linux',
      env: { ANDROID_HOME: j('/sdk'), JAVA_HOME: j('/jdk') },
    });
    const r = resolveAndroidToolchain({
      ...cand,
      exists: makeExists(new Set([j('/sdk'), j('/jdk')])),
      existsIn: () => false,
    });
    assert.strictEqual(r.sdk, j('/sdk'));
    assert.strictEqual(r.javaHome, j('/jdk'));
    assert.strictEqual(r.javaSource, 'env');
  });

  test('CI 场景：无 JAVA_HOME，靠 PATH 上的 javac 反推 JAVA_HOME', () => {
    const jdkHome = j('/usr/lib/jvm/temurin-21-jdk-amd64');
    const cand = androidToolchainCandidates({
      platform: 'linux',
      env: {
        ANDROID_HOME: j('/sdk'),
        PATH: [j(jdkHome, 'bin'), j('/usr/bin')].join(':'),
      },
    });
    const r = resolveAndroidToolchain({
      ...cand,
      exists: makeExists(new Set([j('/sdk')])),
      // 只有 temurin 的 bin/javac 存在
      existsIn: makeExistsIn(new Set([j(jdkHome, 'bin', 'javac')])),
    });
    assert.strictEqual(r.javaHome, jdkHome, '必须从 <home>/bin/javac 反推一级，得到 JAVA_HOME');
    assert.strictEqual(r.javaSource, 'PATH');
  });

  test('PATH 上只有 java（无 javac）时也要能反推 —— setup-java 在部分镜像上如此', () => {
    const jdkHome = j('/opt/java/openjdk');
    const cand = androidToolchainCandidates({
      platform: 'linux',
      env: { PATH: [j(jdkHome, 'bin'), j('/usr/bin')].join(':') },
    });
    const r = resolveAndroidToolchain({
      ...cand,
      exists: () => false,
      existsIn: makeExistsIn(new Set([j(jdkHome, 'bin', 'java')])),
    });
    assert.strictEqual(r.javaHome, jdkHome);
  });

  test('全都不命中时 SDK / JDK 均为 null（调用方据此报错退出）', () => {
    const cand = androidToolchainCandidates({ platform: 'linux', env: {} });
    const r = resolveAndroidToolchain({
      ...cand,
      exists: () => false,
      existsIn: () => false,
    });
    assert.strictEqual(r.sdk, null);
    assert.strictEqual(r.javaHome, null);
    assert.strictEqual(r.javaSource, null);
  });

  test('SDK 判据是 platform-tools 在位：空目录不算（exists 返回 false 即跳过）', () => {
    const cand = androidToolchainCandidates({
      platform: 'linux',
      env: { ANDROID_HOME: j('/empty-sdk'), ANDROID_SDK_ROOT: j('/real-sdk') },
    });
    const r = resolveAndroidToolchain({
      ...cand,
      // 只有 /real-sdk 通过了 platform-tools 判据
      exists: makeExists(new Set([j('/real-sdk')])),
      existsIn: () => false,
    });
    assert.strictEqual(r.sdk, j('/real-sdk'), '空目录要被跳过，落到下一个候选');
  });

  test('win32 候选顺序：ANDROID_HOME → ANDROID_SDK_ROOT → C:\\Android\\Sdk → LOCALAPPDATA', () => {
    const cand = androidToolchainCandidates({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' },
    });
    assert.deepStrictEqual(cand.sdkCandidates, [
      'C:\\Android\\Sdk',
      'C:\\Users\\x\\AppData\\Local\\Android\\Sdk',
    ]);
  });
});
