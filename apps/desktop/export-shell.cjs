/**
 * export-shell.cjs — 从当前完整安装目录导出「轻量壳（无后端）」包（2026-11-08）。
 *
 * ★★★ 为什么可以运行时导出而不用打包工具链：
 *   壳与完整版的 app.asar 内容完全一致（electron-builder.shell.yml 与 full.yml 的
 *   files: 段同源），壳只少 extraResources 里的后端专属资源（server / license /
 *   python / python-tools）。⇒ 完整安装目录 = 壳安装目录 + 后端专属资源。
 *   导出 = 拷贝自身目录 → 剔除后端资源 → 写入 server-base.json → 压缩 zip。
 *   附带收益：导出的壳与主机后端**版本天然一致**（比另行打包更可靠）。
 *
 * 模块约束：不依赖 electron（路径/版本全部由调用方传入），便于 node --test 直测。
 * 守门：本文件被 main.cjs `require('./export-shell.cjs')` 引用，必须登记三份
 * electron-builder yml 的 files: 段（test/packaged-entry-modules.test.cjs 会拦）。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/** resources 下后端专属目录：壳包必须剔除（与 electron-builder.full.yml extraResources 对应） */
const BACKEND_ONLY_RESOURCES = ['server', 'license', 'python', 'python-tools'];

/** NSIS 安装器遗留物：绿色壳包不该带卸载器 */
const INSTALLER_LEFTOVERS = [/^Uninstall /i, /^unins\d+\./i];

/**
 * 收集本机 IPv4 私网地址（导出壳包时烘焙进 server-base.json 的候选来源）。
 * @returns {Array<{name:string,address:string}>}
 */
function collectLanIps(ifaces) {
  const out = [];
  const table = ifaces || os.networkInterfaces();
  for (const [name, list] of Object.entries(table)) {
    for (const it of list || []) {
      if (it.family !== 'IPv4' || it.internal) continue;
      // 只要私网段（RFC1918 + 链路本地）：公网 IP 不能当同事可直连的后端来源
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(it.address)) continue;
      out.push({ name, address: it.address });
    }
  }
  return out;
}

/**
 * 判断某路径是否应从拷贝中剔除。
 * @param {string} rel 相对安装根目录的路径，统一 '/' 分隔
 */
function isExcluded(rel) {
  const segs = rel.split('/');
  if (segs[0] === 'resources' && BACKEND_ONLY_RESOURCES.includes(segs[1])) return true;
  const base = segs[segs.length - 1];
  if (INSTALLER_LEFTOVERS.some((re) => re.test(base))) return true;
  return false;
}

/** 构造 fs.cpSync 用的 filter（dest 也要挡：cpSync 对目录会先拷目录再递归子项） */
function makeCopyFilter(rootDir) {
  return (src, dest) => {
    void dest;
    const rel = path.relative(rootDir, src).split(path.sep).join('/');
    return !isExcluded(rel);
  };
}

/**
 * 用 PowerShell Compress-Archive 压缩目录（Windows 内置、零依赖）。
 * 失败时抛错，由调用方决定是否降级为保留文件夹。
 */
function zipWithPowerShell(srcDir, outZip, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const script = [
      `$ErrorActionPreference='Stop'`,
      `Compress-Archive -Path (Join-Path '${srcDir.replace(/'/g, "''")}' '*') -DestinationPath '${outZip.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`,
    ].join('; ');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => { try { p.kill(); } catch {} reject(new Error('压缩超时')); }, timeoutMs);
    p.stderr.on('data', (d) => { stderr += String(d); });
    p.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`Compress-Archive 退出码 ${code}: ${stderr.trim().slice(0, 500)}`));
    });
    p.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function rmrfSync(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * 导出壳包。
 * @param {object} opts
 * @param {string} opts.sourceDir    安装根目录（打包版 = exe 所在目录）
 * @param {string} opts.destDir      输出目录（已存在）
 * @param {string} opts.serverBase   烘焙的后端地址（http://<内网IP>:<port>）
 * @param {string} [opts.appVersion] 版本号（产物命名用）
 * @param {boolean} [opts.zip=true]  false = 只产出文件夹不压缩
 * @param {object}  [opts._di]       测试注入：{ netIfaces, now }
 * @param {(p:object)=>void} [onProgress] 进度回调 { phase, detail?, pct? }
 * @returns {Promise<{ok:boolean, outputPath?:string, folderPath?:string, error?:string}>}
 */
async function exportShell(opts, onProgress) {
  const prog = (p) => { try { onProgress && onProgress(p); } catch { /* 回调异常不阻断 */ } };
  try {
    const sourceDir = String(opts.sourceDir || '');
    const destDir = String(opts.destDir || '');
    const serverBase = String(opts.serverBase || '').trim().replace(/\/+$/, '');
    if (!sourceDir || !fs.existsSync(path.join(sourceDir, 'resources', 'app.asar'))) {
      return { ok: false, error: `源目录不是有效的言智安装目录（缺 resources/app.asar）: ${sourceDir}` };
    }
    if (!/^https?:\/\//i.test(serverBase)) {
      return { ok: false, error: '后端地址必须以 http:// 或 https:// 开头' };
    }
    if (!destDir) return { ok: false, error: '未选择输出目录' };
    // 不存在就建（防御：正常流程 destDir 来自目录选择框必然存在）
    fs.mkdirSync(destDir, { recursive: true });

    const version = String(opts.appVersion || '0.0.0').replace(/[^\w.\-]/g, '');
    const di = opts._di || {};
    const stamp = (di.now || new Date()).toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
    const baseName = `yan-zhi-shell-${version}-${stamp}`;
    const outZip = path.join(destDir, baseName + '.zip');
    const staging = path.join(destDir, baseName + '.building');
    const outFolder = path.join(destDir, baseName);

    // 产物冲突：同名已存在 → 先清理（导出是幂等重建，不是增量合并）
    for (const p of [outZip, staging, outFolder]) { try { rmrfSync(p); } catch { /* ignore */ } }

    prog({ phase: 'copy', detail: '正在拷贝应用文件（剔除后端资源）…' });
    fs.cpSync(sourceDir, staging, { recursive: true, filter: makeCopyFilter(sourceDir) });

    prog({ phase: 'config', detail: '写入内置后端地址…' });
    // 与 build-shell.cjs 同一格式：_说明 字段给人看，运行时只读 serverBase
    fs.writeFileSync(path.join(staging, 'resources', 'server-base.json'), JSON.stringify({
      serverBase,
      _说明: '轻量壳内置后端地址（2026-11-08 由完整版「导出壳安装包」生成）。★ 仅在轻量壳包（resources/server 缺失）时生效，完整版包即使带了也会忽略。',
    }, null, 2), 'utf8');

    let outputPath;
    if (opts.zip === false) {
      fs.renameSync(staging, outFolder);
      outputPath = outFolder;
      prog({ phase: 'done', detail: outFolder, pct: 100 });
      return { ok: true, folderPath: outFolder, outputPath };
    }
    prog({ phase: 'zip', detail: '正在压缩（约 1~2 分钟，取决于磁盘速度）…' });
    try {
      await zipWithPowerShell(staging, outZip);
      rmrfSync(staging);
      outputPath = outZip;
    } catch (zipErr) {
      // 压缩失败降级：保留文件夹（功能不损失，只是多一步手动压缩）
      fs.renameSync(staging, outFolder);
      outputPath = outFolder;
      prog({ phase: 'done', detail: `${outFolder}（压缩失败已降级为文件夹：${zipErr && zipErr.message}）`, pct: 100 });
      return { ok: true, folderPath: outFolder, outputPath, warning: String(zipErr && zipErr.message) };
    }
    prog({ phase: 'done', detail: outZip, pct: 100 });
    return { ok: true, zipPath: outZip, outputPath };
  } catch (err) {
    return { ok: false, error: String((err && err.stack) || err) };
  }
}

module.exports = {
  BACKEND_ONLY_RESOURCES,
  collectLanIps,
  isExcluded,
  makeCopyFilter,
  exportShell,
  zipWithPowerShell,
};
