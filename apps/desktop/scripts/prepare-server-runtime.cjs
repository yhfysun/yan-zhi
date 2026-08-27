const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..', '..');
const runtimeDir = path.join(desktopDir, 'runtime', 'server-runtime');
const buildDir = path.join(runtimeDir, '.build-package');
const runtimeNodeModules = path.join(runtimeDir, 'node_modules');
const desktopBetterSqlite = path.join(
  desktopDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
);

function fileUrl(p) {
  return 'file:' + p.replace(/\\/g, '/');
}

function assertInside(parent, child) {
  const resolved = path.resolve(child);
  if (resolved !== parent && !resolved.startsWith(parent + path.sep)) {
    throw new Error(`Refusing to touch path outside runtime dir: ${resolved}`);
  }
}

console.log('[prepare-server-runtime] 生成扁平后端运行依赖...');

if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });

const pkg = {
  name: 'yan-zhi-server-runtime',
  version: '0.1.0',
  private: true,
  type: 'module',
  dependencies: {
    '@esbuild/win32-x64': '0.28.2',
    '@node-llama-cpp/win-x64': '3.20.0',
    '@yan-zhi/core': fileUrl(path.join(rootDir, 'packages', 'core')),
    '@yan-zhi/shared': fileUrl(path.join(rootDir, 'packages', 'shared')),
    bcryptjs: '^2.4.3',
    'better-sqlite3': '^11.10.0',
    cors: '^2.8.5',
    express: '^4.21.0',
    jsonwebtoken: '^9.0.2',
    'node-llama-cpp': '3.20.0',
    playwright: '^1.62.1',
    tsx: '^4.19.0',
    uuid: '^10.0.0',
    xlsx: '^0.18.5',
  },
};

fs.writeFileSync(path.join(buildDir, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('[prepare-server-runtime] npm install --omit=optional --ignore-scripts...');
execFileSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'],
  {
    cwd: buildDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      // 后端只通过浏览器路由按需使用 playwright；安装阶段跳过 Chromium 下载以控制包体。
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      PLAYWRIGHT_BROWSERS_PATH: '0',
    },
  },
);

const tempNodeModules = path.join(buildDir, 'node_modules');

// better-sqlite3 会在下方使用 Electron ABI 的预编译二进制覆盖，不能在 npm install
// 阶段触发 node-gyp 构建。这里只单独执行 esbuild / node-llama-cpp 必需的后置脚本，
// 避免整包开启 scripts 导致 better-sqlite3 因缺少 VS 构建失败。
const runPackagePostinstall = (scriptPath, args = []) => {
  const resolved = path.join(tempNodeModules, scriptPath);
  if (!fs.existsSync(resolved)) return;
  console.log(`[prepare-server-runtime] postinstall: ${scriptPath}`);
  execFileSync(process.execPath, [resolved, ...args], {
    cwd: path.dirname(resolved),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      PLAYWRIGHT_BROWSERS_PATH: '0',
    },
  });
};

runPackagePostinstall('esbuild/install.js');
runPackagePostinstall('node-llama-cpp/dist/cli/cli.js', ['postinstall']);

const yanZhiDir = path.join(tempNodeModules, '@yan-zhi');
for (const name of ['core', 'shared']) {
  const target = path.join(yanZhiDir, name);
  const backup = target + '.bak';
  if (fs.existsSync(target)) {
    fs.renameSync(target, backup);
  }
  fs.cpSync(path.join(rootDir, 'packages', name), target, { recursive: true, force: true });

  // npm 安装阶段会把本地 workspace 包复制成源码包；生产环境用 Electron Node 直接
  // 运行 apps/server/dist 的编译产物，因此把 @yan-zhi/* 的入口指到同目录的 dist。
  const targetPkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  targetPkg.main = `../../../dist/packages/${name}/src/index.js`;
  targetPkg.types = `../../../dist/packages/${name}/src/index.js`;
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(targetPkg, null, 2));
}

if (!fs.existsSync(desktopBetterSqlite)) {
  throw new Error(
    `[prepare-server-runtime] 找不到 Electron 版 better_sqlite3.node: ${desktopBetterSqlite}\n` +
      '请先运行 apps/desktop 的 postinstall 或 pnpm install。',
  );
}
const sqliteBuildDir = path.join(tempNodeModules, 'better-sqlite3', 'build', 'Release');
fs.mkdirSync(sqliteBuildDir, { recursive: true });
fs.copyFileSync(desktopBetterSqlite, path.join(sqliteBuildDir, 'better_sqlite3.node'));

assertInside(runtimeDir, runtimeNodeModules);
if (fs.existsSync(runtimeNodeModules)) {
  fs.rmSync(runtimeNodeModules, { recursive: true, force: true });
}
fs.cpSync(tempNodeModules, runtimeNodeModules, { recursive: true, force: true });

console.log('[prepare-server-runtime] 清理临时目录:', buildDir);
fs.rmSync(buildDir, { recursive: true, force: true });

const totalBytes = (() => {
  let sum = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) sum += fs.statSync(p).size;
    }
  };
  walk(runtimeNodeModules);
  return sum;
})();

console.log(`[prepare-server-runtime] OK: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
