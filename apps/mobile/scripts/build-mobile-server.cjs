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

function copyRecursive(src, dest, skip = null) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      // skip：按目录名排除（运行期数据目录，绝不打包 —— 打进去 = 设备升级后拿到打包机上的陈旧库）
      if (skip && skip.has(name)) continue;
      copyRecursive(path.join(src, name), path.join(dest, name), skip);
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

// ── 步骤 2.5：内置插件包（mode-pluginization P1）──
// apps/server/plugins/builtin/<id>/ 由 apps/desktop/scripts/build-plugins.mjs 生成
// （桌面打包链经 electron-build/build-all-editions 幂等补建）。服务端 builtin-packages.ts
// 的扫描候选含 <server>/plugins/builtin —— 拷到 nodejs/dist/plugins/builtin 即被扫到。
// 缺目录（未跑过构建）只提示不拦：源码兜底注册仍在。
{
  const builtinSrc = path.join(SERVER_DIST, '..', 'plugins', 'builtin');
  const keepRaw = String(process.env.YZ_BUILD_PLUGIN_KEEP || '').trim();
  if (fs.existsSync(builtinSrc)) {
    const keep = keepRaw
      ? new Set(keepRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))
      : null;
    const destDir = path.join(NODEJS_DIST, 'plugins', 'builtin');
    if (!keep) {
      copyRecursive(builtinSrc, destDir);
      log('已复制 内置插件包（全量） -> ' + path.relative(ROOT, destDir));
    } else {
      // 精简包：只拷保留项，其余包目录**不进包**（省体积）
      fs.mkdirSync(destDir, { recursive: true });
      const excluded = [];
      for (const name of fs.readdirSync(builtinSrc)) {
        const src = path.join(builtinSrc, name);
        if (!fs.statSync(src).isDirectory()) continue;
        if (keep.has(name)) copyRecursive(src, path.join(destDir, name));
        else excluded.push(name);
      }
      log(`已复制 内置插件包（精简） -> ${path.relative(ROOT, destDir)}：保留 ${[...keep].join(', ')}`);
      log(`已裁掉（不进包）: ${excluded.join(', ') || '无'}`);
      // 交给内嵌后端：未选插件**连源码兜底注册也跳过**（否则目录没了、插件却还在）
      process.env.YZ_BUILD_PLUGINS_EXCLUDED = excluded.join(',');
    }
  } else {
    log('提示: apps/server/plugins/builtin 不存在（未跑 build-plugins.mjs），内置插件走源码兜底注册');
  }
}

// ── 步骤 2.6：内置插件静态资源（皮肤壁纸/预览图）──
// routes/plugins.ts 的 resolveBuiltinAssetsDir 从 routes/ 逐级向上找首个 assets/plugin-assets
// —— 桌面由 electron-builder extraResources 拷到 resources/server/assets/plugin-assets，
// 移动端此前没人拷 ⇒ 真机 404「资源不存在」⇒ 皮肤缩略图全裂、壁纸应用后空白（2026-11-15 实报）。
// 拷到 nodejs/dist/assets/plugin-assets：routes → src → server → apps → dist 向上第 4 级命中。
{
  const assetsSrc = path.join(SERVER_DIR, 'assets', 'plugin-assets');
  if (fs.existsSync(assetsSrc)) {
    copyRecursive(assetsSrc, path.join(NODEJS_DIST, 'assets', 'plugin-assets'));
    log('已复制 插件静态资源(皮肤) -> ' + path.relative(ROOT, path.join(NODEJS_DIST, 'assets', 'plugin-assets')));
  } else {
    log('提示: ' + assetsSrc + ' 不存在，皮肤壁纸/预览图将 404（先跑构建或检查仓库完整性）');
  }
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

// ── 步骤 3.5：安装内嵌后端运行依赖 ──
// 此前缺这一步：nodejs/node_modules 从未生成，内嵌后端在手机上 import express 直接
// MODULE_NOT_FOUND。依赖清单在 nodejs/package.json —— **刻意不含 better-sqlite3**
//（nodejs-mobile 是 Node 18 ABI 108，原生二进制装不到；db.ts 驱动自适配回退 sql.js）。
// 插件会把整个 nodejs/ 目录（含 node_modules）打进 APK assets。
log('=== 步骤 3.5: 安装内嵌后端依赖 (npm install) ===');
if (process.env.YZ_SKIP_MOBILE_NPM === '1' && fs.existsSync(path.join(NODEJS_DIR, 'node_modules'))) {
  log('YZ_SKIP_MOBILE_NPM=1 且 node_modules 已存在，跳过');
} else {
  const { spawnSync } = require('node:child_process');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // shell:true 必须：新版 Node 出于 CVE-2024-27980 对 .cmd/.bat 直接 spawn 一律 EINVAL
  const r = spawnSync(npmCmd, ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: NODEJS_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    error('npm install 失败（exit=' + r.status + (r.error ? ', ' + r.error.message : '') + '），内嵌后端将缺依赖无法启动');
    process.exit(1);
  }
  // npm 包自带的 *.gz 预压缩文件（如 bcryptjs/dist/bcrypt.min.js.gz）会和
  // nodejs-mobile 插件构建期的 gzip 任务撞出「Duplicate resources」，
  // Gradle mergeDebugAssets 直接失败 —— 运行时不需要它们，统一剥掉。
  let gzRemoved = 0;
  const stripGz = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) stripGz(full);
      else if (name.endsWith('.gz')) { fs.rmSync(full); gzRemoved++; }
    }
  };
  stripGz(path.join(NODEJS_DIR, 'node_modules'));
  log('已剥离依赖内 *.gz 预压缩文件 ' + gzRemoved + ' 个');
  log('依赖安装完成');
}

// ── 步骤 3.55：剔除 sql.js 的非必需产物（省 ~20MB，零行为影响）──
// sql.js 实际只用 dist/sql-wasm.js + dist/sql-wasm.wasm（0.67MB，services/sqlite-driver.ts
// 的 locateFile 只找这两个）。包里另外还躺着：
//   sql-asm-debug.js 5.36MB + worker.sql-asm-debug.js 5.36MB（未压缩调试版）
//   sql-asm.js 1.29MB + worker.sql-asm.js 1.29MB（asm 变体，WASM 路径不用）
//   sql-wasm-debug.js/.wasm、sql-wasm-browser*（浏览器变体，Node 不用）
//   sqljs-all.zip 4.21MB 等（分发用 zip）
// 全是**静态冗余**（不是代码逻辑），删掉不影响任何运行路径 —— 移动端后端只 import('sql.js')
// 且 Node 分支只解析 sql-wasm.js。
{
  const sqlDist = path.join(NODEJS_DIR, 'node_modules', 'sql.js', 'dist');
  if (fs.existsSync(sqlDist)) {
    // 保留清单：Node 运行时真正会加载的文件
    const KEEP = new Set([
      'sql-wasm.js', 'sql-wasm.wasm',
      'sql-wasm-browser.js', 'sql-wasm-browser.wasm',
      'worker-sql-wasm.js', 'worker.sql-wasm.js',
      'package.json',
    ]);
    let removed = 0;
    let freed = 0;
    for (const name of fs.readdirSync(sqlDist)) {
      if (KEEP.has(name)) continue;
      const full = path.join(sqlDist, name);
      if (!fs.statSync(full).isFile()) continue;
      freed += fs.statSync(full).size;
      fs.rmSync(full);
      removed += 1;
    }
    if (removed) {
      log(`已剔除 sql.js 非必需产物 ${removed} 个（省 ${(freed / 1024 / 1024).toFixed(1)} MB）：只保留 sql-wasm.js/.wasm`);
    }
  } else {
    log('提示: 未找到 sql.js/dist（本次没装该依赖），跳过剔除');
  }
}

// ── 步骤 3.6：裸包导入硬闸（防依赖漂移静默进包）──
// ★ 2026-11-15 实报：pinyin-pro 只在 packages/shared 的 package.json 里，nodejs/package.json
//   没跟着补 ⇒ 内嵌后端 import index.js 直接 ERR_MODULE_NOT_FOUND ⇒ 手机上后端整体起不来
//   （WebView 降级壳：数据全空 + 插件快照拿不到 + 模式全部「未启用」），且构建期零报错。
//   同族事故：同日桌面版 splash 卡死（缺同一个包）。⇒ 判据：package.json 有依赖 ≠ 实物有，
//   构建期必须扫 dist 裸包 specifier 逐个核对 node_modules 实物，缺一个 fail-fast。
log('=== 步骤 3.6: 裸包导入核对（硬闸） ===');
{
  // 受控可选依赖：全部是动态 import + try/catch 降级路径（缺失只降级该功能，不影响启动）
  const OPTIONAL = new Set([
    'playwright',       // 浏览器自动化：移动端 DISABLE_PLAYWRIGHT，可用性探测失败即降级
    'better-sqlite3',   // 原生模块：nodejs-mobile ABI 装不到，sqlite-driver 回退 sql.js
    'tesseract.js',     // OCR 兜底：RapidOCR 优先，失败才 import
    'mongodb',          // 文档连接器：try/catch 动态 import
    'xlsx',             // 表格预览：调用方降级「暂不支持预览」
    'mammoth',          // Word 预览：同上
    'unpdf',            // PDF 预览：同上
    'jszip',            // 压缩包预览：同上
    '@larksuiteoapi/node-sdk', // 飞书长连接：loadLarkSdk try/catch，未装仅 warn
    'openclaw',         // 仅存在于模板字符串（openclaw-manager 生成桥接代码用），非运行时 import
  ]);
  const nodeBuiltins = new Set(require('node:module').builtinModules);
  // 合法 npm 包名/子路径字符集（scope/版本子路径）：含 ${ 插值、< > 占位、空白的必然是
  // 解析器/生成器源码里的字符串模板，不是真实 import（首版误报实锤：code-outline 的
  // `require('${im[1]}')`、code-symbols 的 `from('<path>')`）。
  const SPEC_RE = /^@?[a-zA-Z0-9][a-zA-Z0-9@/._-]*$/;
  const isBare = (s) =>
    s && SPEC_RE.test(s) && !s.startsWith('.') && !s.startsWith('/') && !s.startsWith('node:')
    && !s.startsWith('@yan-zhi/') && !/^[A-Za-z]:[\\/]/.test(s) && !s.startsWith('file:');
  const rootOf = (s) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
  const found = new Map(); // pkg -> 首个引用文件（报错定位用）
  const scanDirs = ['apps', 'packages', 'plugins'].map((d) => path.join(NODEJS_DIST, d));
  const scanOne = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { scanOne(full); continue; }
      if (!name.endsWith('.js') || name.endsWith('.map')) continue;
      const code = fs.readFileSync(full, 'utf8');
      // ★ 形态收窄（首版误报实锤）：① lookbehind 要求 from/import/require 前是非标识符
      //   字符（排除 playFrom / myImport( 这类子串与 .from 属性链）；② specifier 不含
      //   空白 —— 真包名永远无空格，源码字符串/正则字面量里 `from '...'` 大段内容
      //   （含换行的生成代码模板）全部排除。
      const re = /(?<![A-Za-z0-9_.$])(?:from|import\s*\(|require\s*\()\s*['"]([^'"\s]+)['"]/g;
      let m;
      while ((m = re.exec(code))) {
        const spec = m[1];
        if (!isBare(spec)) continue;
        const pkg = rootOf(spec);
        if (nodeBuiltins.has(pkg) || nodeBuiltins.has(spec) || OPTIONAL.has(pkg)) continue;
        if (!found.has(pkg)) found.set(pkg, path.relative(NODEJS_DIST, full));
      }
    }
  };
  scanDirs.forEach(scanOne);
  const missing = [...found.keys()].filter((pkg) => !fs.existsSync(path.join(NODEJS_DIR, 'node_modules', pkg)));
  if (missing.length) {
    for (const pkg of missing) {
      error('内嵌后端引用了未随包的依赖: ' + pkg + '  (首见于 ' + found.get(pkg) + ')');
    }
    error('请在 apps/mobile/nodejs/package.json 的 dependencies 补齐上述包后重跑（若是受控可选依赖，加入本脚本 OPTIONAL 清单并确认其 import 有 try/catch 降级）');
    process.exit(1);
  }
  log('裸包核对通过: ' + found.size + ' 个静态依赖全部在 node_modules 实物中');

  // ── 3.6b：Unicode 属性转义硬闸（2026-11-15 真机实报）──
  // nodejs-mobile 的老 V8 不支持 `\p{...}`：**正则字面量**在模块解析期直接 SyntaxError
  // ⇒ 后端整个起不来（与缺依赖同族：桌面绿、移动端死）。运行时构造形式
  // `new RegExp('...\\p{...}')`（源码里是字符串转义 \\p）配合 try/catch 可降级，放行；
  // dist 编译产物里字面量保持单反斜杠 `\p{` —— 出现即 fail-fast。
  const punctReFiles = [];
  const scanPunct = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { scanPunct(full); continue; }
      if (!name.endsWith('.js') || name.endsWith('.map')) continue;
      const code = fs.readFileSync(full, 'utf8');
      // 先剥块注释/行注释（dist 注释里常带 `\p{P}` 示例文案，2026-11-15 实报误报源）——
      // 粗粒度剥离对本闸够用：字符串里含 /* */ 的形态本仓 dist 无。
      const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      if (/(?<!\\)\\p\{/.test(stripped)) punctReFiles.push(path.relative(NODEJS_DIST, full));
    }
  };
  scanDirs.forEach(scanPunct);
  if (punctReFiles.length) {
    for (const f of punctReFiles) {
      error('内嵌后端存在 Unicode 属性转义正则字面量（\\p{...}，nodejs-mobile 老解析期必炸）: ' + f);
    }
    error('请改为运行时构造 new RegExp + try/catch 降级（参照 experience.ts PUNCT_RE / ontology-example.ts QUESTION_STRIP_RE）');
    process.exit(1);
  }
  log('Unicode 属性转义核对通过: 无字面量 \\p{...}');
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
  '// 数据目录：优先用插件提供的可写目录；否则放到 nodejs-project 的**上一级**。',
  '// ★ 绝不能落在 __dirname（nodejs-project）内部：capacitor-nodejs 检测到 APK 更新',
  '//   （lastUpdateTime 变化）会 deleteRecursively(projectDir) 整树重拷（Nodejs.java:163），',
  '//   数据放里面 = 每次升级 APK 全部清零（2026-11-15 实报「内置数据都没了」的根因）。',
  "//   __dirname 的上级 = 插件 baseDir，不在删除树内，升级幸存；且该目录绝不打进 APK",
  '//   （见步骤 5 同步排除清单），否则升级后会拿到打包机上的陈旧库。',
  'const dataDir = process.env.NODEJS_MOBILE_DATA_DIR',
  '  || process.env.ANDROID_DATA_DIR',
  "  || path.join(path.resolve(__dirname, '..'), 'yan-zhi-data');",
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
  // ★ 精简包（2026-11-16）：未选插件**连源码兜底注册也跳过**。
  //   必须写进 index.js（设备上跑的是这个文件，构建机的 env 传不过去）——
  //   否则目录裁掉了、插件却还在注册：包里「看起来有」、实际只有后端没界面。
  ...(process.env.YZ_BUILD_PLUGINS_EXCLUDED
    ? [`process.env.YZ_BUILD_PLUGINS_EXCLUDED = '${String(process.env.YZ_BUILD_PLUGINS_EXCLUDED).replace(/'/g, "\\'")}';`]
    : []),
  '',
  "console.log('[mobile-server] 数据目录:', dataDir);",
  "console.log('[mobile-server] 监听: http://127.0.0.1:' + process.env.PORT);",
  '',
  '// 启动 server（路径与 tsc rootDir=../.. 的输出结构一致）',
  'try {',
  "  await import(pathToFileURL(path.join(__dirname, 'dist', 'apps', 'server', 'src', 'index.js')).href);",
  '} catch (err) {',
  '  console.error(\'[mobile-server] 启动失败:\', err);',
  '  // ★ 绝不能 process.exit：capacitor-nodejs 的 Node 运行时与 Android App 同进程，',
  '  //   exit 会把整个 App 杀死（表现为安装后一启动就闪退）。',
  '  //   后端起不来时保持进程存活，WebView 壳照常打开并显示后端不可达的降级界面。',
  '  console.error(\'[mobile-server] 保持进程存活（不 exit），App 壳继续运行\');',
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
// ★ 运行期数据/日志目录必须排除（2026-11-15 实报）：nodejs/yan-zhi-data 是打包机本地
//   跑 index.js 冒烟测试留下的库（10-25 版：1 平台 / 76 技能），打进去后设备升级 APK
//   会拿到这份陈旧库 ——「内置模型平台空 / 内置数据都没了」的直接来源之一。
copyRecursive(NODEJS_DIR, webNodejs, new Set(['yan-zhi-data', 'logs', '.smoke-data', '.smoke-data18', '.smoke-data18b']));
log('已同步: ' + path.relative(ROOT, webNodejs));

// ── 步骤 6：摘要 ──
log('=== 构建完成 ===');
const entry = path.join(webNodejs, 'dist', 'apps', 'server', 'src', 'index.js');
log('后端入口: ' + (fs.existsSync(entry) ? path.relative(ROOT, entry) : '缺失!'));
log('nodejs 工程: ' + path.relative(ROOT, webNodejs));
