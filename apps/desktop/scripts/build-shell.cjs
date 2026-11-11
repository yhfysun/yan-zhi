#!/usr/bin/env node
/**
 * 轻量壳打包入口（2026-11-02）：只出前端壳，不含后端，开箱直连远程 yan-zhi 后端。
 *
 * 用法：
 *   node scripts/build-shell.cjs                                  # 默认 http://127.0.0.1:3001
 *   node scripts/build-shell.cjs --server-url http://192.168.1.100:3001
 *   YZ_SERVER_BASE=http://10.0.0.8:3001 node scripts/build-shell.cjs
 *   node scripts/build-shell.cjs --skip-builder                   # 只写配置 + 构建前端，不打安装包
 *
 * 做的事：
 *   1. 把目标后端地址写进 resources/server-base.json（shell.yml 的 extraResources 会带进包）；
 *   2. 构建本机能力运行时（远控被控端、浏览器/电脑使用执行桥）；
 *   3. vite build 出 dist/**；
 *   4. 交给 scripts/electron-build.cjs 用 electron-builder.shell.yml 出安装包。
 *
 * 地址优先级（运行时）：登录页/Setup 页手填（localStorage yz_server_base）> 本文件写入的内置地址。
 * 所以内置地址只是「默认值」，用户装完仍可改。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DESKTOP = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP, '..', '..');
const DEFAULT_SERVER_BASE = 'http://127.0.0.1:3001';
const SERVER_BASE_FILE = path.join(DESKTOP, 'resources', 'server-base.json');

const iconSync = spawnSync(
  process.execPath,
  [path.join(REPO_ROOT, 'scripts', 'sync-yanzhi-icons.cjs')],
  { cwd: REPO_ROOT, stdio: 'inherit' },
);
if (iconSync.status !== 0) fail('approved 图标同步失败');

function readArg(name) {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(inline.indexOf('=') + 1);
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : undefined;
}

function fail(msg) {
  console.error(`[build-shell] ${msg}`);
  process.exit(1);
}

const skipBuilder = process.argv.includes('--skip-builder');
const raw = String(readArg('server-url') ?? process.env.YZ_SERVER_BASE ?? DEFAULT_SERVER_BASE).trim();
const serverBase = raw.replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s]+/i.test(serverBase)) {
  fail(`后端地址非法（需 http:// 或 https:// 开头）: ${raw}`);
}

fs.mkdirSync(path.dirname(SERVER_BASE_FILE), { recursive: true });
fs.writeFileSync(
  SERVER_BASE_FILE,
  `${JSON.stringify({
    _说明: '轻量壳内置后端地址：打包前把 serverBase 改成目标后端（如 http://192.168.1.100:3001），空串=不内置（用户在登录页手填）。★ 仅在轻量壳包（resources/server 缺失）时生效，完整版包即使带了也会忽略。',
    serverBase,
  }, null, 2)}\n`,
  'utf8',
);
console.log(`[build-shell] 内置后端地址: ${serverBase}（装好后可在登录页改）`);

const localCapabilities = spawnSync(
  process.execPath,
  [path.join(DESKTOP, 'scripts', 'build-local-capabilities.cjs')],
  { cwd: DESKTOP, stdio: 'inherit' },
);
if (localCapabilities.status !== 0) fail('本机能力运行时构建失败');

const viteBin = path.join(DESKTOP, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) fail(`找不到 vite（${viteBin}），请先 pnpm install`);
const vite = spawnSync(process.execPath, [viteBin, 'build'], { cwd: DESKTOP, stdio: 'inherit' });
if (vite.status !== 0) fail('vite build 失败');

if (skipBuilder) {
  console.log('[build-shell] --skip-builder：前端已构建，跳过 electron-builder');
  process.exit(0);
}

// ★ 产物目录/文件名走固定后缀 `-shell`：electron-build.cjs 默认会读 edition.json 的
//   artifactSuffix（上一次 pro 构建留下的 -pro-office-dev-ops-sec-wf-clip-shop），
//   壳包沿用那串会让产物落进一个莫名奇妙的目录名。
const artifactSuffix = process.env.YZ_ARTIFACT_SUFFIX || '-shell';
console.log(`[build-shell] 产物目录: dist-release/desktop/${artifactSuffix.replace(/^-+/, '')}/<版本>/`);
const builder = spawnSync(
  process.execPath,
  [path.join(DESKTOP, 'scripts', 'electron-build.cjs'), 'electron-builder.shell.yml'],
  { cwd: DESKTOP, stdio: 'inherit', env: { ...process.env, YZ_ARTIFACT_SUFFIX: artifactSuffix } },
);
process.exit(builder.status ?? 1);
