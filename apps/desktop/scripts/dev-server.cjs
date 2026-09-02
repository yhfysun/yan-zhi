// 用 Electron 内置 Node.js（ELECTRON_RUN_AS_NODE=1）启动后端，避免 better-sqlite3
// 原生绑定 ABI 不兼容（better-sqlite3 为 Electron 33 ABI 编译，系统 Node 加载会崩）。
const { spawn } = require('child_process');
const path = require('path');

const electronExe = require('electron');
const serverDir = path.resolve(__dirname, '..', '..', 'server');
const tsxPath = path.join(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(electronExe, [tsxPath, 'src/index.ts'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));