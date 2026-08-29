/* eslint-disable */
// llama-server 预编译二进制下载脚本（CI / 本地开发 / 打包前复用）。
// 二进制不入 git（.gitignore 已排除 apps/server/bin），构建前需先运行本脚本。
//
// 用法（在仓库根或 apps/server 下）：
//   node apps/server/scripts/download-llama-server.cjs
//
// 平台对应：
//   Windows → llama.cpp release 的 win-vulkan-x64（GPU 通用加速，Vulkan 覆盖 N/A/I 三家）
//   macOS   → macos-arm64（Metal 加速）
// 下载后精简：只保留 llama-server 可执行 + 运行依赖 DLL/dylib，删除其他工具 exe。
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

// 固定版本保证可复现构建；升级时改这里
const LLAMA_CPP_BUILD = 'b10603';

const binDir = path.resolve(__dirname, '..', 'bin');

function assetForPlatform() {
  if (process.platform === 'win32') {
    return {
      name: `llama-${LLAMA_CPP_BUILD}-bin-win-vulkan-x64.zip`,
      extract: 'zip',
      serverExe: 'llama-server.exe',
    };
  }
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return {
      name: `llama-${LLAMA_CPP_BUILD}-bin-macos-${arch}.zip`,
      extract: 'zip',
      serverExe: 'llama-server',
    };
  }
  // Linux：CI 未构建桌面 Linux 包，本地 Linux 用户可自行编译放置
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirects = 0) => {
      const lib = currentUrl.startsWith('https:') ? https : http;
      const req = lib.get(currentUrl, { headers: { 'User-Agent': 'yan-zhi-download' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 10) { reject(new Error('重定向过多')); return; }
          request(new URL(res.headers.location, currentUrl).toString(), redirects + 1);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}: ${currentUrl}`)); return; }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
      });
      req.setTimeout(120000, () => req.destroy(new Error('连接超时')));
      req.on('error', reject);
    };
    request(url);
  });
}

(async () => {
  const asset = assetForPlatform();
  if (!asset) {
    console.log('[llama-server] 当前平台无需自动下载（仅支持 win32/darwin），跳过。');
    return;
  }

  const serverExePath = path.join(binDir, asset.serverExe);
  if (fs.existsSync(serverExePath)) {
    console.log(`[llama-server] 已存在，跳过: ${serverExePath}`);
    return;
  }

  fs.mkdirSync(binDir, { recursive: true });
  const urls = [
    `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_BUILD}/${asset.name}`,
    `https://ghproxy.cn/https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_BUILD}/${asset.name}`,
  ];

  const zipPath = path.join(binDir, asset.name);
  let ok = false;
  for (const [i, url] of urls.entries()) {
    console.log(`[llama-server] 下载 (${i + 1}/${urls.length}): ${url}`);
    try {
      await download(url, zipPath);
      ok = true;
      break;
    } catch (err) {
      console.error(`[llama-server] 源 ${i + 1} 失败: ${err.message}`);
      try { fs.rmSync(zipPath, { force: true }); } catch {}
    }
  }
  if (!ok) {
    console.error('[llama-server] 所有下载源均失败。本地模型将回退内嵌 node-llama-cpp 引擎，不阻断构建。');
    process.exit(0); // 非致命：回退内嵌引擎
  }

  // 解压
  const extractDir = path.join(binDir, `_extract_${LLAMA_CPP_BUILD}`);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-q', zipPath, '-d', extractDir], { stdio: 'inherit' });
  }

  // 精简：保留 llama-server 可执行 + 所有动态库 + LICENSE；删除其他工具
  let kept = 0, removed = 0;
  for (const f of fs.readdirSync(extractDir)) {
    const isServer = f === asset.serverExe;
    const isLib = /\.(dll|dylib|so(\.\d+)*)$/i.test(f);
    const isLicense = /^license/i.test(f);
    if (isServer || isLib || isLicense) {
      fs.copyFileSync(path.join(extractDir, f), path.join(binDir, f));
      kept++;
    } else {
      removed++;
    }
  }
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  if (process.platform !== 'win32') {
    try { fs.chmodSync(serverExePath, 0o755); } catch {}
  }

  const totalMB = (fs.readdirSync(binDir).reduce((s, f) => {
    try { return s + fs.statSync(path.join(binDir, f)).size; } catch { return s; }
  }, 0) / 1024 / 1024).toFixed(1);
  console.log(`[llama-server] 完成：保留 ${kept} 个文件（删除 ${removed} 个工具），共 ${totalMB} MB → ${binDir}`);
})().catch((err) => {
  console.error('[llama-server] 失败（不阻断构建，回退内嵌引擎）:', err.message || err);
  process.exit(0);
});
