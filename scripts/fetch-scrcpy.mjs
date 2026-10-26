#!/usr/bin/env node
/**
 * 下载内置的 scrcpy（Windows x64）到 tools/scrcpy，供 android-mirror 插件使用。
 *
 * 幂等：已存在 scrcpy.exe 直接跳过。需要访问 GitHub（国内环境请自行配置网络）。
 * 用法：node scripts/fetch-scrcpy.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'tools', 'scrcpy');
const EXE = path.join(DEST, 'scrcpy.exe');

if (fs.existsSync(EXE)) {
  console.log(`[fetch-scrcpy] 已存在，跳过：${EXE}`);
  process.exit(0);
}
if (process.platform !== 'win32') {
  console.error('[fetch-scrcpy] 目前只自动化 Windows 下载；其它平台请用包管理器安装 scrcpy 并设置 YZ_SCRCPY');
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'tools'), { recursive: true });

console.log('[fetch-scrcpy] 查询最新版本…');
const relRes = await fetch('https://api.github.com/repos/Genymobile/scrcpy/releases/latest', {
  headers: { 'user-agent': 'yan-zhi-fetch-scrcpy' },
});
if (!relRes.ok) {
  console.error(`[fetch-scrcpy] 查询失败 HTTP ${relRes.status}（需要能访问 GitHub）`);
  process.exit(1);
}
const rel = await relRes.json();
const asset = (rel.assets || []).find((a) => /^scrcpy-win64-.*\.zip$/.test(String(a.name)));
if (!asset) {
  console.error('[fetch-scrcpy] 该版本没有 win64 压缩包');
  process.exit(1);
}
console.log(`[fetch-scrcpy] 下载 ${asset.name}（${(Number(asset.size) / 1048576).toFixed(1)} MB）…`);

const zip = path.join(ROOT, 'tools', 'scrcpy-download.zip');
const res = await fetch(asset.browser_download_url);
if (!res.ok || !res.body) {
  console.error(`[fetch-scrcpy] 下载失败 HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));

const tmp = path.join(ROOT, 'tools', '_scrcpy_tmp');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('[fetch-scrcpy] 解压…');
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${tmp}' -Force`], { stdio: 'inherit' });
const inner = fs.readdirSync(tmp).map((n) => path.join(tmp, n)).find((p) => fs.statSync(p).isDirectory());
if (!inner) {
  console.error('[fetch-scrcpy] 压缩包结构异常');
  process.exit(1);
}
fs.rmSync(DEST, { recursive: true, force: true });
fs.renameSync(inner, DEST);
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
console.log(`[fetch-scrcpy] 完成：${DEST}`);
