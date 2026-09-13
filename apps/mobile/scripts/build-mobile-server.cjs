/**
 * 移动端内嵌 Node.js 后端构建脚本
 *
 * 功能：
 * 1. 复用 apps/server 的 tsc 编译产物（rootDir=../..，已包含 core/shared）
 * 2. 复制到 apps/mobile/nodejs/dist/（保持 monorepo 目录结构以解析 workspace import）
 * 3. 为 @yan-zhi/core 与 @yan-zhi/shared 生成 node_modules stub（ESM 解析需要）
 * 4. 生成启动入口 apps/mobile/nodejs/index.js
 * 5. 把整个 nodejs/ 同步到 dist/nodejs/（Capacitor webDir=dist，插件按 nodeDir 加载）
 *
 * 用法：node scripts/build-mobile-server.cjs
 *
 * 注意：
 * - 本脚本只做编译产物的搬运与拼装，不负责 Android 原生集成
 * - better-sqlite3 / sqlite-vec 为原生模块，需匹配内嵌 Node 运行时的 ABI
 */

const fs = require('node:fs');
const path = require('node:path');

// __dirname = <root>/apps/mobile/scripts
// ROOT 需要回到仓库根：scripts -> mobile -> apps -> root
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_DIR = path.join(ROOT, 'apps', 'server');
const SERVER_DIST = path.join(SERVER_DIR, 'dist');
const MOBILE_DIR = path.join(ROOT, 'apps', 'mobile');
const NODEJS_DIR = path.join(MOBILE_DIR, 'nodejs');
const NODEJS_DIST = path.join(NODEJS_DIR, 'dist');
const WEB_DIST = path.join(MOBILE_DIR, 'dist');

function log(msg) { console.log('[build-mobile-server]', msg); }
function error(msg) { console.error('[build-mobile-server][ERROR]', msg); }

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyDirIfExists(src, dest, label) {
  if (!fs.existsSync(src)) {
    error('未找到 ' + label + '，期望路径: ' + src);
    return false;
  }
  copyRecursive(src, dest);
  log('已复制 ' + label + ' -> ' + path.relative(ROOT, dest));
  return true;
}

// ── 步骤 1：清理旧产物 ──
log('=== 步骤 1: 清理旧产物 ===');
if (fs.existsSync(NODEJS_DIST)) {
  fs.rmSync(NODEJS_DIST, { recursive: true, force: true });
}
fs.mkdirSync(NODEJS_DIST, { recursive: true });
log('已重建 ' + path.relative(ROOT, NODEJS_DIST));

// ── 步骤 2：复用 apps/server 编译产物 ──
// server 的 tsconfig rootDir 为 ../..，故 dist 下同时包含：
//   apps/server/src        -> server 自身
//   packages/core/src      -> @yan-zhi/core
//   packages/shared/src    -> @yan-zhi/shared
log('=== 步骤 2: 复制 server 编译产物 ===');
const okServer = copyDirIfExists(
  path.join(SERVER_DIST, 'apps', 'server', 'src'),
  path.join(NODEJS_DIST, 'apps', 'server', 'src'),
  'server 产物',
);
const okCore = copyDirIfExists(
  path.join(SERVER_DIST, 'packages', 'core', 'src'),
  path.join(NODEJS_DIST, 'packages', 'core', 'src'),
  '@yan-zhi/core 产物',
);
const okShared = copyDirIfExists(
  path.join(SERVER_DIST, 'packages', 'shared', 'src'),
  path.join(NODEJS_DIST, 'packages', 'shared', 'src'),
  '@yan-zhi/shared 产物',
);

if (!okServer) {
  error('server 产物缺失。请先运行: pnpm --filter @yan-zhi/server build');
  process.exit(1);
}
if (!okCore || !okShared) {
  log('提示: core/shared 产物不完整，workspace import 可能解析失败');
}

// ── 步骤 3：为 workspace 包生成 node_modules stub ──
// 编译产物中的 import '@yan-zhi/core' 需要在 node_modules 下可解析
log('=== 步骤 3: 生成 workspace stub ===');
const stubSpecs = [
  { pkg: 'core', srcDir: path.join(NODEJS_DIST, 'packages', 'core', 'src') },
  { pkg: 'shared', srcDir: path.join(NODEJS_DIST, 'packages', 'shared', 'src') },
];
for (const spec of stubSpecs) {
  if (!fs.existsSync(spec.srcDir)) continue;
  const target = path.join(NODEJS_DIST, 'node_modules', '@yan-zhi', spec.pkg);
  fs.rmSync(target, { recursive: true, force: true });
  copyRecursive(spec.srcDir, target);
  fs.writeFileSync(
    path.join(target, 'package.json'),
    JSON.stringify(
      {
        name: '@yan-zhi/' + spec.pkg,
        version: '0.1.0',
        type: 'module',
        main: './index.js',
      },
      null,
      2,
    ),
  );
  log('stub 已生成: @yan-zhi/' + spec.pkg);
}

// ── 步骤 4：生成启动入口 ──
log('=== 步骤 4: 生成启动入口 ===');
const indexJs = [
  '/**',
  ' * 言智移动端内嵌 Node.js 后端启动入口（由 build-mobile-server.cjs 生成，请勿手改）',
  ' * 运行于 Capawesome Capacitor-NodeJS 插件提供的 Node 运行时内。',
  ' */',
  "import path from 'node:path';",
  "import fs from 'node:fs';",
  "import { fileURLToPath, pathToFileURL } from 'node:url';",
  '',
  'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
  '',
  '// 数据目录：优先用插件提供的可写目录，未设置时回退到工程目录',
  'const dataDir = process.env.NODEJS_MOBILE_DATA_DIR',
  '  || process.env.ANDROID_DATA_DIR',
  "  || path.join(__dirname, 'yan-zhi-data');",
  'fs.mkdirSync(dataDir, { recursive: true });',
  'process.env.DATA_DIR = dataDir;',
  '',
  '// 仅监听本机回环，供 WebView 访问',
  "process.env.PORT = process.env.PORT || '3001';",
  "process.env.HOST = '127.0.0.1';",
  '',
  '// 移动端模式标记：server 据此禁用桌面专属能力',
  "process.env.MOBILE_MODE = '1';",
  "process.env.DISABLE_PLAYWRIGHT = '1';",
  "process.env.DISABLE_COMPUTER_USE = '1';",
  '',
  "console.log('[mobile-server] 数据目录:', dataDir);",
  "console.log('[mobile-server] 监听: http://127.0.0.1:' + process.env.PORT);",
  '',
  '// 启动 server（路径与 tsc rootDir=../.. 的输出结构一致）',
  'try {',
  "  await import(pathToFileURL(path.join(__dirname, 'dist', 'apps', 'server', 'src', 'index.js')).href);",
  '} catch (err) {',
  "  console.error('[mobile-server] 启动失败:', err);",
  '  process.exit(1);',
  '}',
  '',
].join('\n');
fs.writeFileSync(path.join(NODEJS_DIR, 'index.js'), indexJs);
log('已生成: ' + path.relative(ROOT, path.join(NODEJS_DIR, 'index.js')));

// ── 步骤 5：同步到 dist/nodejs/（Capacitor webDir=dist，插件按 nodeDir 加载）──
log('=== 步骤 5: 同步到 dist/nodejs ===');
const webNodejs = path.join(WEB_DIST, 'nodejs');
if (!fs.existsSync(WEB_DIST)) {
  error('未找到前端构建产物 ' + WEB_DIST + '，请先运行 vite build');
  process.exit(1);
}
if (fs.existsSync(webNodejs)) {
  fs.rmSync(webNodejs, { recursive: true, force: true });
}
copyRecursive(NODEJS_DIR, webNodejs);
log('已同步: ' + path.relative(ROOT, webNodejs));

// ── 步骤 6：摘要 ──
log('=== 构建完成 ===');
const entry = path.join(webNodejs, 'dist', 'apps', 'server', 'src', 'index.js');
log('后端入口: ' + (fs.existsSync(entry) ? path.relative(ROOT, entry) : '缺失!'));
log('nodejs 工程: ' + path.relative(ROOT, webNodejs));
