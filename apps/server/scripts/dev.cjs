#!/usr/bin/env node
/**
 * 开发模式启动后端（带高级版档位）。
 *
 * 为什么要包一层而不用 `YZ_EDITION=pro tsx watch ...`：
 *   `VAR=x cmd` 是 POSIX 语法，在 Windows 的 cmd/PowerShell 下不生效，
 *   而本项目开发机是 Windows。为此装 cross-env 只为设两个变量不值当，
 *   用 node 写个 10 行的启动器更稳、也不引入依赖。
 *
 * ★ 必须用 Electron 内置的 Node 跑（ELECTRON_RUN_AS_NODE=1），不能用系统 Node：
 *   better-sqlite3 是按 Electron 的 ABI 编译的（postinstall 的 fix-sqlite-binding），
 *   系统 Node 加载会直接 `ERR_DLOPEN_FAILED`（NODE_MODULE_VERSION 130 vs 127）。
 *   找不到 Electron 时回退系统 Node —— 少数环境（如纯后端开发、没装 electron）
 *   需要这个退路；此时 better-sqlite3 需自行按系统 Node 重编。
 *
 * ★ 开发模式恒为 pro（全量）：开发者要能见到所有模式与入口 —— 否则调 dev/ops/sec
 *   相关代码时界面上根本没入口，得先弄一张 pro 码才能开工。
 *   打包版不受影响：那条路径走 apps/desktop/main.cjs（按 app.isPackaged 判定），
 *   本脚本只在 dev 下使用。
 *
 * 用法：node scripts/dev.cjs [tsx 额外参数...]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '..');
const tsxCli = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 找 Electron 可执行文件（用它作为 Node 运行时，保证原生模块 ABI 一致）。
 *
 *  为什么不能直接 require('electron')：apps/server 不依赖 electron（那是 apps/desktop 的依赖），
 *  在 server 目录下 require 会 MODULE_NOT_FOUND。而 pnpm 把 electron 放在
 *  `<root>/node_modules/.pnpm/electron@<版本>/node_modules/electron/dist/` —— 版本号在路径里，
 *  只能扫目录，所以这里逐个候选探测（含 .pnpm 兜底）。 */
function findElectron() {
  const pnpmRoot = path.join(serverDir, '..', '..', 'node_modules', '.pnpm');
  const direct = [
    path.join(serverDir, '..', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(serverDir, '..', 'desktop', 'node_modules', 'electron', 'dist', 'electron'),
  ];
  const fromPnpm = () => {
    try {
      for (const d of fs.readdirSync(pnpmRoot)) {
        if (!d.startsWith('electron@')) continue;
        for (const rel of ['electron.exe', 'electron']) {
          const p = path.join(pnpmRoot, d, 'node_modules', 'electron', 'dist', rel);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* .pnpm 不存在 */ }
    return null;
  };
  for (const p of direct) {
    try { if (fs.existsSync(p)) return p; } catch { /* 继续 */ }
  }
  return fromPnpm();
}

const electronBin = findElectron();
const isElectron = !!electronBin;
const bin = electronBin || process.execPath;
const args = [tsxCli, 'watch', 'src/index.ts', ...process.argv.slice(2)];

console.log('[dev] 版本档: pro（开发模式全量）');
console.log(isElectron ? '[dev] 运行时: Electron 内置 Node（原生模块 ABI 一致）'
  : '[dev] 运行时: 系统 Node（未找到 Electron；better-sqlite3 需为系统 Node 重编，否则会 ERR_DLOPEN_FAILED）');

const child = spawn(bin, args, {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Electron 作为纯 Node 运行的必需开关
    ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    YZ_EDITION: 'pro',
    YZ_DEFAULT_EDITION: 'pro',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));