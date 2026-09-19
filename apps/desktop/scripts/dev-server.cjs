// 用 Electron 内置 Node.js（ELECTRON_RUN_AS_NODE=1）启动后端，避免 better-sqlite3
// 原生绑定 ABI 不兼容（better-sqlite3 为 Electron 33 ABI 编译，系统 Node 加载会崩）。
// tsx watch：服务端代码（src/**）改动自动重启 —— 手动重启整个 dev 才能生效太痛苦。
//
// ★ 开发模式恒为高级版（pro）全量：开发者要能见到所有模式与入口，否则调 dev/ops/sec
//   相关代码时界面上根本没有入口。打包版不受影响 —— 那条路径由 main.cjs 按
//   app.isPackaged 读 edition.json，本文件只在 dev 下被调用。
//   这里写死而不读 edition.json：dev 的档位应当恒定，不该被上一次打包残留的
//   edition.json（可能停在 lite）影响，否则会出现「刚才还好好的，模式突然没了」。
const { spawn } = require('child_process');
const path = require('path');

const electronExe = require('electron');
const serverDir = path.resolve(__dirname, '..', '..', 'server');
const tsxPath = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

console.log('[dev-server] 版本档: pro（开发模式全量）');

const child = spawn(electronExe, [tsxPath, 'watch', 'src/index.ts'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    YZ_EDITION: 'pro',
    YZ_DEFAULT_EDITION: 'pro',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));