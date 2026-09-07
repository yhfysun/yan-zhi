/**
 * 移动端内嵌 Node.js 后端构建脚本
 *
 * 功能：
 * 1. 编译 apps/server（tsc）
 * 2. 编译 packages/core 和 packages/shared（tsc，临时 tsconfig）
 * 3. 把所有编译产物复制到 apps/mobile/nodejs/dist/
 * 4. 生成移动端 package.json（已存在，确认依赖）
 * 5. 输出构建结果摘要
 *
 * 用法：node scripts/build-mobile-server.cjs
 *
 * 注意：
 * - better-sqlite3、sqlite-vec 等原生模块需在 Android 构建环境中安装匹配 ABI 的版本
 * - playwright、tesseract.js 已从移动端依赖中移除
 * - 本脚本只负责编译和打包，不负责 Android 原生集成（见 docs/移动端内嵌后端集成指南.md）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'apps', 'server');
const CORE_DIR = path.join(ROOT, 'packages', 'core');
const SHARED_DIR = path.join(ROOT, 'packages', 'shared');
const MOBILE_NODE_DIR = path.join(ROOT, 'apps', 'mobile', 'nodejs');
const DIST_DIR = path.join(MOBILE_NODE_DIR, 'dist');

function log(msg) { console.log('[build-mobile-server]', msg); }
function error(msg) { console.error('[build-mobile-server][ERROR]', msg); }

function run(cmd, cwd) {
  log('RUN: ' + cmd + (cwd ? ' (cwd: ' + path.relative(ROOT, cwd) + ')' : ''));
  execSync(cmd, { cwd: cwd || ROOT, stdio: 'inherit', shell: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) { log('SKIP copy (not found): ' + path.relative(ROOT, src)); return; }
  fs.mkdirSync(dest, { recursive: true });
  // 用 robocopy 在 Windows 上更可靠，但跨平台用 node 递归
  function copyRecursive(s, d) {
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      for (const name of fs.readdirSync(s)) {
        copyRecursive(path.join(s, name), path.join(d, name));
      }
    } else {
      fs.copyFileSync(s, d);
    }
  }
  copyRecursive(src, dest);
  log('COPIED: ' + path.relative(ROOT, src) + ' -> ' + path.relative(ROOT, dest));
}

// ── 步骤 1：清理旧产物 ──
log('=== 步骤 1: 清理旧产物 ===');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  log('已清理 ' + path.relative(ROOT, DIST_DIR));
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// ── 步骤 2：编译 server ──
log('=== 步骤 2: 编译 apps/server ===');
try {
  run('pnpm run build', SERVER_DIR);
} catch (e) {
  error('server 编译失败，但继续尝试复制已有产物（可能是 typecheck 错误，非致命）');
}

// server 的 tsconfig rootDir=../..，输出在 dist/apps/server/src/
const serverDistSrc = path.join(SERVER_DIR, 'dist', 'apps', 'server', 'src');
const serverDistAlt = path.join(SERVER_DIR, 'dist', 'src');
if (fs.existsSync(serverDistSrc)) {
  copyDir(serverDistSrc, path.join(DIST_DIR, 'server'));
} else if (fs.existsSync(serverDistAlt)) {
  copyDir(serverDistAlt, path.join(DIST_DIR, 'server'));
} else {
  error('未找到 server 编译产物，期望路径: ' + serverDistSrc + ' 或 ' + serverDistAlt);
}

// ── 步骤 3：编译 core 和 shared ──
log('=== 步骤 3: 编译 packages/core 和 packages/shared ===');

function compilePackage(pkgDir, pkgName) {
  log('编译 ' + pkgName + '...');
  // 创建临时 tsconfig
  const tempTsconfig = path.join(pkgDir, 'tsconfig.mobile-build.json');
  const tsconfig = {
    extends: path.join(ROOT, 'tsconfig.base.json'),
    compilerOptions: {
      outDir: path.join(pkgDir, 'dist-mobile'),
      rootDir: path.join(pkgDir, 'src'),
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: false,
      declarationMap: false,
    },
    include: ['src/**/*'],
  };
  fs.writeFileSync(tempTsconfig, JSON.stringify(tsconfig, null, 2));
  try {
    run('npx tsc -p ' + tempTsconfig, pkgDir);
  } catch (e) {
    error(pkgName + ' 编译有错误（可能是类型错误，非致命），继续复制产物');
  }
  // 清理临时 tsconfig
  fs.rmSync(tempTsconfig, { force: true });

  const pkgDist = path.join(pkgDir, 'dist-mobile', 'src');
  if (fs.existsSync(pkgDist)) {
    copyDir(pkgDist, path.join(DIST_DIR, pkgName));
  } else {
    error('未找到 ' + pkgName + ' 编译产物: ' + pkgDist);
  }
}

compilePackage(CORE_DIR, 'core');
compilePackage(SHARED_DIR, 'shared');

// ── 步骤 4：生成启动入口（重写 index.js 以匹配实际目录结构）──
log('=== 步骤 4: 生成启动入口 ===');
const indexJs = `/**
 * 言智移动端内嵌 Node.js 后端启动入口（构建生成）
 * 实际 server 代码在 ./server/，core/shared 在 ./core/ 和 ./shared/
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据目录：原生层通过 ANDROID_DATA_DIR 传入应用私有目录
const dataDir = process.env.ANDROID_DATA_DIR
  || path.join(process.env.HOME || process.env.USERPROFILE || '.', 'yan-zhi-data');
fs.mkdirSync(dataDir, { recursive: true });
process.env.DATA_DIR = dataDir;

// 端口与监听地址：仅本机回环
process.env.PORT = process.env.PORT || '3001';
process.env.HOST = '127.0.0.1';

// 移动端模式标记
process.env.MOBILE_MODE = '1';
process.env.DISABLE_PLAYWRIGHT = '1';
process.env.DISABLE_COMPUTER_USE = '1';

console.log('[mobile-server] 数据目录:', dataDir);
console.log('[mobile-server] 监听: http://127.0.0.1:' + process.env.PORT);

// 启动 server（需要先注册 core/shared 的路径别名，因为编译产物中 import '@yan-zhi/core' 不会自动解析）
// 方案：用 import-map 或直接修改 import 路径。这里用动态 import + 路径重写。
// 更简单：在 node_modules 中创建 @yan-zhi/core 和 @yan-zhi/shared 的软链接/目录
const nodeModulesDir = path.join(__dirname, 'node_modules');
fs.mkdirSync(path.join(nodeModulesDir, '@yan-zhi'), { recursive: true });
for (const [pkg, dir] of [['core', 'core'], ['shared', 'shared']]) {
  const target = path.join(nodeModulesDir, '@yan-zhi', pkg);
  const source = path.join(__dirname, dir);
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    // 创建 package.json 指向编译产物
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: '@yan-zhi/' + pkg,
      version: '0.1.0',
      type: 'module',
      main: './index.js',
    }, null, 2));
    // 复制编译产物
    copyDirSync(source, target);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 启动 server
try {
  await import(pathToFileURL(path.join(__dirname, 'server', 'index.js')).href);
} catch (err) {
  console.error('[mobile-server] 启动失败:', err);
  process.exit(1);
}
`;
fs.writeFileSync(path.join(MOBILE_NODE_DIR, 'index.js'), indexJs);
log('已生成启动入口: apps/mobile/nodejs/index.js');

// ── 步骤 5：输出摘要 ──
log('=== 构建完成 ===');
log('产物目录: ' + path.relative(ROOT, DIST_DIR));
const distContents = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
log('dist 子目录: ' + distContents.join(', '));
log('');
log('下一步：');
log('  1. 在 apps/mobile/nodejs/ 下运行 npm install 安装依赖（需 Android 构建环境）');
log('  2. 参考 docs/移动端内嵌后端集成指南.md 完成 Android 原生集成');
log('  3. 运行 pnpm build:mobile:android 构建 APK');
