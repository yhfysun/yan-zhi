/**
 * 轻量壳打包守门测试（2026-11-02）。
 *
 * ★ 背景：`electron-builder.shell.yml` 2026-11-01 就有了，但**没有打包入口、真机没验过**，
 *   而且启动链路会去探活本机 127.0.0.1 —— 壳包没有本机后端，等于干等 120 秒后报「启动失败」。
 *   这里钉住三件事：
 *   ① 壳模式判定存在，健康检查走内置远程地址而不是本机；
 *   ② 打包入口 scripts/build-shell.cjs 会把地址写进 resources/server-base.json；
 *   ③ 根/桌面两个 package.json 都有可调用的脚本。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const BUILD_SHELL = path.join(DESKTOP, 'scripts', 'build-shell.cjs');
const SHELL_YML = fs.readFileSync(path.join(DESKTOP, 'electron-builder.shell.yml'), 'utf8');

describe('轻量壳：启动链路', () => {
  test('★ 壳模式判定与远程健康检查目标存在（否则会干等 120 秒报启动失败）', () => {
    assert.ok(MAIN.includes('const SHELL_MODE'), 'main.cjs 缺 SHELL_MODE 判定');
    assert.ok(
      MAIN.includes("shellHealthBase ? shellHealthBase + '/api/health' : ''"),
      '健康检查未按壳模式切到内置远程地址',
    );
    const reqIdx = MAIN.indexOf("const req = http.get(healthUrl");
    assert.ok(reqIdx > 0, '健康检查必须使用 healthUrl（壳模式/本机两种目标）');
    assert.ok(!MAIN.includes("http.get(API_ORIGIN + '/api/health'"), '健康检查又写死本机地址了');
  });

  test('壳模式跳过本机后端启动（无后端资源时不 spawn）', () => {
    assert.ok(MAIN.includes("未内置后端资源（轻量壳模式），跳过本地后端启动"), '缺少壳模式跳过分支');
  });
});

describe('轻量壳：打包入口', () => {
  test('★ build-shell.cjs 存在且写入 resources/server-base.json', () => {
    assert.ok(fs.existsSync(BUILD_SHELL), '缺少 scripts/build-shell.cjs 入口');
    const src = fs.readFileSync(BUILD_SHELL, 'utf8');
    assert.ok(src.includes("'resources', 'server-base.json'"), '未写入 resources/server-base.json');
    assert.ok(src.includes('electron-builder.shell.yml'), '未使用 shell.yml 打包');
    assert.ok(src.includes('--server-url'), '不支持 --server-url 指定默认后端地址');
    // ★ 2026-11-02：不显式给后缀时 electron-build 会读残留的 edition.json，
    //   产物会落进 dist-release/desktop/pro-office-dev-ops-sec-wf-clip-shop/ 这种怪目录。
    assert.ok(src.includes("'-shell'"), '壳包未固定产物后缀（会沿用 edition.json 的 pro 后缀）');
    assert.ok(src.includes('YZ_ARTIFACT_SUFFIX'), '壳包未把后缀传给 electron-build');
  });

  test('shell.yml 把 server-base.json 带进包', () => {
    assert.match(SHELL_YML, /from:\s*resources\/server-base\.json/, 'shell.yml 未打包 server-base.json');
    assert.match(SHELL_YML, /to:\s*server-base\.json/, 'shell.yml 未映射到 resources/server-base.json');
  });

  test('两个 package.json 都登记了打包脚本', () => {
    const deskPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
    assert.ok(deskPkg.scripts['build:shell'], 'apps/desktop 缺 build:shell');
    const repoRoot = path.join(DESKTOP, '..', '..');
    const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.ok(rootPkg.scripts['build:desktop:shell'], '根 package.json 缺 build:desktop:shell');
    assert.ok(rootPkg.scripts['package:desktop:shell'], '根 package.json 缺 package:desktop:shell');
    assert.ok(
      fs.existsSync(path.join(repoRoot, 'scripts', 'package-desktop-shell.cjs')),
      '缺 scripts/package-desktop-shell.cjs 包装入口',
    );
  });

  test('★ package.cjs 交互菜单里有 shell 选项（用户实报：菜单只有 lite/basic/pro）', () => {
    const pkgSrc = fs.readFileSync(path.join(DESKTOP, '..', '..', 'scripts', 'package.cjs'), 'utf8');
    assert.ok(pkgSrc.includes("const SHELL_EDITION = 'shell'"), 'package.cjs 缺 SHELL_EDITION');
    assert.ok(pkgSrc.includes('id: \'desktop:shell\''), '交互菜单缺 desktop:shell 选项');
    assert.ok(pkgSrc.includes('SHELL_EDITION') && pkgSrc.includes('build-shell.cjs'), '未接到 build-shell.cjs');
    assert.ok(
      pkgSrc.includes('targets.desktop.some((e) => e !== SHELL_EDITION)'),
      '壳包不该真编译 server（needCompile 必须排除 shell）',
    );
  });
});
