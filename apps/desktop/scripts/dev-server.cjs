// 用 Electron 内置 Node.js（ELECTRON_RUN_AS_NODE=1）启动后端，避免 better-sqlite3
// 原生绑定 ABI 不兼容（better-sqlite3 为 Electron 33 ABI 编译，系统 Node 加载会崩）。
//
// ★★★ 默认 **不** 开热重载（2026-10-26 用户决定，与 bin/dev.mjs、apps/server/scripts/dev.cjs、
//   main.cjs 的 dev 分支同源）：`tsx watch` 会在改任意一个 server 源码时重启进程，而重启
//   那一下正在发送的消息恰好落在 create_task 往返中间 ⇒ 前端只拿到「连接已断开，这条消息
//   未发出」。跑任务时改代码是开发常态 ⇒ 默认静态运行、改完手动重启；
//   需要热重载时显式 `YZ_WATCH=1`（此时才注入 YZ_HOT_RELOAD，见下）。
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
const watch = process.env.YZ_WATCH === '1';

console.log('[dev-server] 版本档: pro（开发模式全量）');
console.log(watch ? '[dev-server] 热重载: 开（YZ_WATCH=1）' : '[dev-server] 热重载: 关（需要请设 YZ_WATCH=1）');

const child = spawn(electronExe, watch ? [tsxPath, 'watch', 'src/index.ts'] : [tsxPath, 'src/index.ts'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    YZ_EDITION: 'pro',
    YZ_DEFAULT_EDITION: 'pro',
    // 热重载标记：只在真 watch 时注入 —— 它是"这次重启是热重载"的分流标记，
    // 不 watch 还注入会把用户的手动重启误判成「可续的暂停」。
    ...(watch ? { YZ_HOT_RELOAD: '1' } : {}),
    // dev 专属：可选插件自动装载（本文件只在 dev 下被调用）
    YZ_DEV_AUTOLOAD_PLUGINS: process.env.YZ_DEV_AUTOLOAD_PLUGINS ?? 'desktop-manager',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));