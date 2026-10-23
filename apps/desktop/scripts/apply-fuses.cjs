#!/usr/bin/env node
/**
 * 给 Electron 可执行文件写入安全 fuses（打包后、出安装包前）。
 *
 * ★ 为什么 RunAsNode 必须保持开启（true）：
 *   本项目后端用 `ELECTRON_RUN_AS_NODE=1` + Electron 自身作为 Node 运行时启动
 *   （见 main.cjs 的 spawn，ABI 与 better-sqlite3 对齐）。关掉它 = 后端起不来。
 *   这一条是硬约束，改动前先改后端启动方式。
 *
 * 其余关闭项：
 *   - EnableNodeOptionsEnvironmentVariable=false：客户设 NODE_OPTIONS 无法注入代码；
 *   - EnableNodeCliInspectArguments=false：`--inspect` 调试口关闭；
 *   - EnableEmbeddedAsarIntegrityValidation=true：asar 被改动即拒绝启动
 *     （electron-builder 25.1.8 会在打包时把 asar 哈希写进可执行文件）；
 *   - OnlyLoadAppFromAsar=true：只认 app.asar，堵住「解包后改 resources/app」这条最常用的破解路径。
 */
const fs = require('node:fs');
const path = require('node:path');
const { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options } = require('@electron/fuses');

/** 定位打包后的可执行文件（win/mac/linux 三平台）。 */
function resolveExecutable(appOutDir, platform = process.platform) {
  if (platform === 'darwin') {
    const apps = fs.readdirSync(appOutDir).filter((n) => n.endsWith('.app'));
    if (!apps.length) throw new Error(`[fuses] ${appOutDir} 下没有 .app`);
    const macOsDir = path.join(appOutDir, apps[0], 'Contents', 'MacOS');
    const bin = fs.readdirSync(macOsDir)[0];
    if (!bin) throw new Error(`[fuses] ${macOsDir} 为空`);
    return path.join(macOsDir, bin);
  }
  if (platform === 'win32') {
    const exes = fs.readdirSync(appOutDir).filter((n) => n.toLowerCase().endsWith('.exe'));
    // 优先 productName 对应的主程序；排除安装器/uninstaller 一类
    const main = exes.find((n) => !/uninstall|setup/i.test(n)) || exes[0];
    if (!main) throw new Error(`[fuses] ${appOutDir} 下没有 .exe`);
    return path.join(appOutDir, main);
  }
  const bin = path.join(appOutDir, 'yan-zhi');
  if (!fs.existsSync(bin)) throw new Error(`[fuses] 找不到可执行文件: ${bin}`);
  return bin;
}

async function applyFuses({ appOutDir, platform = process.platform }) {
  const exe = resolveExecutable(appOutDir, platform);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    // ★ 必须开启：后端依赖 ELECTRON_RUN_AS_NODE 启动（见文件头）。
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableCookieEncryption]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    // 保持默认（开启）：应用自身用 file:// 加载 dist 资源，关掉会误伤。
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  });
  console.log(`[fuses] 已写入: ${path.relative(process.cwd(), exe)}`);

  // 写后自检：fuse 写入失败在部分环境下是静默的（文件被占用/只读），必须读回确认。
  const wire = await getCurrentFuseWire(exe);
  const expected = {
    [FuseV1Options.RunAsNode]: '1', // 后端依赖 ELECTRON_RUN_AS_NODE
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: '0',
    [FuseV1Options.EnableNodeCliInspectArguments]: '0',
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: '1',
    [FuseV1Options.OnlyLoadAppFromAsar]: '1',
  };
  const bad = [];
  for (const [opt, want] of Object.entries(expected)) {
    const got = String.fromCharCode(Number(wire[opt]));
    if (got !== want) bad.push(`${FuseV1Options[opt]}=${got}（期望 ${want}）`);
  }
  if (bad.length) throw new Error(`[fuses] 写入校验失败: ${bad.join('；')}`);
  return exe;
}

module.exports = { applyFuses, resolveExecutable };

if (require.main === module) {
  const appOutDir = process.argv[2];
  if (!appOutDir) {
    console.error('用法: node scripts/apply-fuses.cjs <appOutDir>');
    process.exit(1);
  }
  applyFuses({ appOutDir }).catch((e) => {
    console.error('[fuses] 失败:', e.message);
    process.exit(1);
  });
}
