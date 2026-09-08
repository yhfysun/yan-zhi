// P0 验证一键运行：node scripts/poc-webview/run.mjs [--ni]
// 验证 webview 方案 4 个关键点，结果写入 scripts/poc-webview/result.json + shots/
//  ① DOM 浮层能否覆盖 webview（层级痛点，BrowserView 做不到）
//  ② webview 元素方法可用性 + 主进程 webContents.fromId 取 guest
//  ③ sendInputEvent 键盘输入（guest 失焦 / 聚焦 两种）
//  ④ 隐藏 tab（display:none / 移出视口）的 capturePage 结果
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..', '..', 'apps', 'desktop');
const candidates = [
  path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe'), // win
  path.join(desktop, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'), // mac
  path.join(desktop, 'node_modules', 'electron', 'dist', 'electron'), // linux
];
const electron = candidates.find((p) => fs.existsSync(p));
if (!electron) {
  console.error('未找到 electron，请先在 apps/desktop 执行 pnpm install');
  process.exit(1);
}

const args = [path.join(here, 'main.js')];
if (process.argv.includes('--ni')) args.push('--ni');
console.log('> 启动 POC:', electron, args.join(' '));
const child = spawn(electron, args, { stdio: 'inherit', cwd: path.resolve(here, '..', '..') });
child.on('exit', (code) => {
  const rp = path.join(here, 'result.json');
  if (fs.existsSync(rp)) {
    console.log('\n--- result.json ---');
    console.log(fs.readFileSync(rp, 'utf-8'));
  }
  process.exit(code ?? 0);
});
