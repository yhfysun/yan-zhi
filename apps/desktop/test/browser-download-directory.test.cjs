/**
 * 浏览器下载目录设置（2026-11-10）。
 *
 * 用户要求：浏览器还没设置下载路径时，首次下载要弹窗让用户选择；
 * 选择后持久化，后续下载直接使用；取消则本次回退默认目录，不反复打断。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(DESKTOP, 'preload.cjs'), 'utf8');
const SETTINGS = fs.readFileSync(
  path.resolve(DESKTOP, '..', '..', 'packages', 'ui', 'src', 'views', 'Settings.vue'),
  'utf8',
);

test('★ 未配置下载目录时首下载弹原生目录选择器，并暂停/恢复下载', () => {
  assert.match(MAIN, /function promptForBrowserDownloadDir/);
  assert.match(MAIN, /configuredBrowserDownloadDir/);
  assert.match(MAIN, /item\.pause\(\)/);
  assert.match(MAIN, /item\.resume\(\)/);
  assert.match(MAIN, /browserDownloadDir/);
  assert.match(MAIN, /writeHostConfig\(\{\s*browserDownloadDir/);
});

test('★ 用户取消后本次回退默认目录，并在本会话内停止重复弹窗', () => {
  assert.match(MAIN, /downloadDirPromptDismissed/);
  assert.match(MAIN, /resolveDownloadDir\(lastAgentWorkspaceDir\)/);
});

test('★ 主进程与 preload 暴露读取、选择、清除下载目录 IPC', () => {
  assert.match(MAIN, /browser-download:get-dir/);
  assert.match(MAIN, /browser-download:pick-dir/);
  assert.match(MAIN, /browser-download:clear-dir/);
  assert.match(PRELOAD, /getDownloadDir:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('browser-download:get-dir'\)/);
  assert.match(PRELOAD, /pickDownloadDir:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('browser-download:pick-dir'\)/);
  assert.match(PRELOAD, /clearDownloadDir:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('browser-download:clear-dir'\)/);
});

test('★ 设置页提供浏览器下载目录入口与选择/清除操作', () => {
  assert.match(SETTINGS, /浏览器下载目录/);
  assert.match(SETTINGS, /pickDownloadDir/);
  assert.match(SETTINGS, /clearDownloadDir/);
  assert.match(SETTINGS, /未设置.*首次下载会弹窗/);
});
