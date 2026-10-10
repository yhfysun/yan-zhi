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
 * ★★★ 必须注入 DATA_DIR（2026-10-08 修，血泪教训）：
 *   `db.ts` 的 dataDir 是 `process.env.DATA_DIR || path.join(__dirname, '..')`。
 *   安装版由 main.cjs 注入 DATA_DIR（userData/server-data），而**本脚本此前没注入**
 *   → dev 的库落到 `apps/server/data.db`（**源码目录里**）。后果：
 *     ① dev 与安装版各写一份库，数据互相看不见（用户以为"会话丢了"）；
 *     ② 源码目录里混进一个 80MB 数据库，git status 常年脏、打包可能被扫进去；
 *     ③ 实测该库发生过 B 树损坏（conversation/message 两棵树）→ 会话接口全 500。
 *   → 这里对齐 apps/desktop/instance.cjs 的 `DEV_USERDATA_NAME`（'yan-zhi-dev'），
 *     把 DATA_DIR 指到 `%APPDATA%/yan-zhi-dev/server-data`，与生产彻底分开。
 *   ★ 为什么目录名要与 instance.cjs 一致而不是自己起一个：实例配置是「端口 / userData /
 *     共享目录」的单一真相源（instance.cjs 注释里写明"各处一律引用，不再各自硬编码"），
 *     再硬编码一份必然漂移。
 *
 * 用法：node scripts/dev.cjs [tsx 额外参数...]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const serverDir = path.join(__dirname, '..');
const tsxCli = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/**
 * 解析 dev 实例应使用的 DATA_DIR —— 与 bin/dev.mjs 共用同一判据。
 *
 * ★ 优先级：
 *   1. 显式 DATA_DIR（由 bin/dev.mjs / main.cjs 或用户/CI 下发，最高优先）
 *   2. `%APPDATA%/yan-zhi/server-data`（本脚本被**单独**调用时的兜底，
 *      与 bin/dev.mjs 的目录口径一致 —— 两处不一致会让同一个 dev 实例
 *      因启动方式不同而用两个库）
 * 判据只有一条：库**不许再落在 apps/server/ 根**（源码目录）。
 *
 * ★★★ 2026-10-10：目录名从 'yan-zhi-dev' 改为 'yan-zhi'，与安装版**共用同一套库**
 *   （用户诉求：「我直接 dev 启动就能测试」）。见 bin/dev.mjs 顶部说明。
 */
const DEV_USERDATA_NAME = 'yan-zhi'; // 与 apps/desktop/instance.cjs 同值
function resolveDevDataDir() {
  const explicit = (process.env.DATA_DIR || '').trim();
  if (explicit) return explicit;
  const home = os.homedir();
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(appData, DEV_USERDATA_NAME, 'server-data');
}

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
const devDataDir = resolveDevDataDir();
fs.mkdirSync(devDataDir, { recursive: true });

console.log('[dev] 版本档: pro（开发模式全量）');
console.log(isElectron ? '[dev] 运行时: Electron 内置 Node（原生模块 ABI 一致）'
  : '[dev] 运行时: 系统 Node（未找到 Electron；better-sqlite3 需为系统 Node 重编，否则会 ERR_DLOPEN_FAILED）');
console.log(`[dev] DATA_DIR: ${devDataDir}`);

const child = spawn(bin, args, {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Electron 作为纯 Node 运行的必需开关
    ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    YZ_EDITION: 'pro',
    YZ_DEFAULT_EDITION: 'pro',
    // ★★★ 热重载标记（2026-10-09）：本启动器用 `tsx watch`，**每改一次源码就重启进程**。
    //   不标记的话，下次启动的孤儿任务回收会把上一批 running 任务一律标成
    //   「服务重启，任务被中断」→ 用户体感"任务老跑不起来"（实测 16 次中断里 13 次源于此）。
    //   注入后回收改为标 `resumable` + 提示"计划与进度已保留，可直接继续"（见 llm-task-manager）。
    //   ★ 只在本启动器注入：生产路径（dist / main.cjs）不设 → 行为完全不变。
    YZ_HOT_RELOAD: '1',
    // ★ 数据目录：不注入的话 db.ts 会退回 apps/server/（源码目录）—— 见文件头注释
    DATA_DIR: devDataDir,
  },
});
child.on('exit', (code) => process.exit(code ?? 0));