/**
 * 本机 Playwright / Chromium 定位（供独立自测脚本共用）。
 *
 * 本机 playwright 1.65 期望 chromium_headless_shell-1254，但实际只装了 1234，
 * 直接 chromium.launch() 会报 "Executable doesn't exist"。统一在这里探测已装的
 * chrome.exe / headless_shell.exe 并显式传 executablePath，避免每个脚本各写一套。
 */
const fs = require('fs');
const path = require('path');

function loadPlaywright(repoRoot) {
  return require(require.resolve('playwright', { paths: [path.join(repoRoot, 'apps', 'server')] }));
}

function findChromium() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base)
    .filter((d) => /^chromium(?:_headless_shell)?-\d+$/.test(d))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const rel of [
      'chrome-win64/chrome.exe',
      'chrome-win/chrome.exe',
      'chrome-headless-shell-win64/chrome-headless-shell.exe',
      'chrome-headless-shell-win32/chrome-headless-shell.exe',
    ]) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

module.exports = { loadPlaywright, findChromium };
