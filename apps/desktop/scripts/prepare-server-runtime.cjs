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

const ESBUILD_VERSION = '0.28.2';

// 原生依赖按「构建机平台 + 架构」挑选。
// 之前这里写死 win32-x64，在 macOS / Linux runner 上 npm 直接 EBADPLATFORM 失败，
// 因此改成宿主平台映射（构建产物架构与构建机一致，不做交叉编译）。
// 注：node-llama-cpp 已移除——本地模型引擎改用 Ollama，运行时无引用（孤儿依赖）。
const PLATFORM_BINDINGS = {
  'win32-x64': { esbuild: '@esbuild/win32-x64', sqliteVec: 'sqlite-vec-windows-x64' },
  'darwin-x64': { esbuild: '@esbuild/darwin-x64', sqliteVec: 'sqlite-vec-darwin-x64' },
  'darwin-arm64': { esbuild: '@esbuild/darwin-arm64', sqliteVec: 'sqlite-vec-darwin-arm64' },
  'linux-x64': { esbuild: '@esbuild/linux-x64', sqliteVec: 'sqlite-vec-linux-x64' },
};

const hostKey = `${process.platform}-${process.arch}`;
const bindings = PLATFORM_BINDINGS[hostKey];
if (!bindings) {
  throw new Error(
    `[prepare-server-runtime] 暂不支持的平台/架构: ${hostKey}。\n` +
      `支持项: ${Object.keys(PLATFORM_BINDINGS).join(', ')}`,
  );
}

function assertInside(parent, child) {
  const resolved = path.resolve(child);
  if (resolved !== parent && !resolved.startsWith(parent + path.sep)) {
    throw new Error(`Refusing to touch path outside runtime dir: ${resolved}`);
  }
}

// 统一执行子进程：CI 上把输出吞掉会导致排查不到真实报错，
// 因此失败时回打输出尾部，成功时只回打摘要行。
function runCommand(file, args, options = {}) {
  const display = [path.basename(file), ...args].join(' ');
  console.log(`[prepare-server-runtime] > ${display}`);
  try {
    const out = execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    if (out) {
      console.log(
        out
          .split('\n')
          .slice(-8)
          .filter(Boolean)
          .map((line) => `  | ${line}`)
          .join('\n'),
      );
    }
    return out;
  } catch (err) {
    const detail = `${err.stdout || ''}${err.stderr || ''}`.trim();
    if (detail) {
      console.error(
        detail
          .split('\n')
          .slice(-80)
          .map((line) => `  | ${line}`)
          .join('\n'),
      );
    }
    const reason = detail ? '' : `（无输出，退出码 ${err.status}）`;
    throw new Error(`[prepare-server-runtime] 命令失败: ${display}${reason}`);
  }
}

console.log(
  `[prepare-server-runtime] 生成扁平后端运行依赖（平台 ${hostKey}，` +
    `原生包 ${bindings.esbuild}@${ESBUILD_VERSION}）...`,
);

// 删除深层 node_modules 时可能因路径超长/文件占用/安全策略失败。
// 失败时退化为「重命名让路」。
// 注意：rmSync 和 renameSync 都可能因文件被占用/符号链接而 EPERM，
// 两者都要吞掉异常——清理失败不能阻断构建（产物已经就位，残留留待下次清理）。
function removeDirBestEffort(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  } catch (err) {
    console.warn(`[prepare-server-runtime] 删除失败（${err.message.split('\n')[0]}），尝试重命名让路`);
  }
  try {
    const stale = `${dir}.stale-${Date.now()}`;
    fs.renameSync(dir, stale);
    console.warn(`[prepare-server-runtime] 已重命名为 ${path.basename(stale)}，残留留待下次清理`);
  } catch (err2) {
    console.warn(`[prepare-server-runtime] 重命名也失败（${err2.message.split('\n')[0]}），忽略并继续构建`);
  }
}

// 顺带清理上次残留的 stale 目录（尽力而为）
// 先确保父目录存在：CI 干净 checkout 下 runtime/server-runtime 尚未生成，
// 直接 readdir 会 ENOENT（旧版在 build 目录 mkdir 之前就扫父目录导致构建中断）。
const runtimeParentDir = path.dirname(buildDir);
fs.mkdirSync(runtimeParentDir, { recursive: true });
for (const entry of fs.readdirSync(runtimeParentDir)) {
  if (entry.startsWith(path.basename(buildDir) + '.stale-')) {
    try {
      fs.rmSync(path.join(path.dirname(buildDir), entry), { recursive: true, force: true });
    } catch {
      // 忽略：下次构建继续尝试
    }
  }
}

// @yan-zhi/core、@yan-zhi/shared 不交给 npm 安装：它们是 workspace 源码包，
// 安装后再用产物目录整体覆盖，避免 npm 复制一份再丢弃的额外开销与协议差异。
const pkg = {
  name: 'yan-zhi-server-runtime',
  version: '0.1.0',
  private: true,
  type: 'module',
  dependencies: {
    [bindings.esbuild]: ESBUILD_VERSION,
    [bindings.sqliteVec]: '^0.1.9',
    'adm-zip': '^0.6.0',
    bcryptjs: '^2.4.3',
    'better-sqlite3': '^11.10.0',
    cors: '^2.8.5',
    express: '^4.21.0',
    jsonwebtoken: '^9.0.2',
    jszip: '^3.10.1',
    mammoth: '^1.8.0',
    pg: '^8.23.0',
    playwright: '^1.62.1',
    'simple-git': '^3.36.0',
    'sqlite-vec': '^0.1.9',
    'tesseract.js': '^5.1.1',
    tsx: '^4.19.0',
    unpdf: '^0.12.1',
    uuid: '^10.0.0',
    ws: '^8.18.0',
    xlsx: '^0.18.5',
    yaml: '^2.4.0',
    mysql2: '^3.24.3',
  },
};

// 依赖缓存：npm install（213 个包，约 2 分钟）在依赖清单未变时完全跳过。
// 之前每次打包都把 .build-package 删光重建，导致必定回源重装，离线/受限网络下极易卡死。
const cacheFile = path.join(runtimeDir, '.runtime-cache.json');
const cacheKey = JSON.stringify({ hostKey, deps: pkg.dependencies });
const readCache = () => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return null;
  }
};
const cached = readCache();
const needInstall = !(cached && cached.key === cacheKey && fs.existsSync(runtimeNodeModules));

const tempNodeModules = path.join(buildDir, 'node_modules');

if (!needInstall) {
  console.log(
    `[prepare-server-runtime] 依赖缓存命中（${new Date(cached.at).toLocaleString()}），跳过 npm install / postinstall`,
  );
} else {
  removeDirBestEffort(buildDir);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'package.json'), JSON.stringify(pkg, null, 2));

  console.log('[prepare-server-runtime] npm install --omit=optional --ignore-scripts...');
  runCommand(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'],
    {
      cwd: buildDir,
      shell: true,
      timeout: 10 * 60 * 1000,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        // 后端只通过浏览器路由按需使用 playwright；安装阶段跳过 Chromium 下载以控制包体。
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
        PLAYWRIGHT_BROWSERS_PATH: '0',
      },
    },
  );
}

// 命中缓存时直接在 runtime/node_modules 上继续加工，不再走临时目录。
const workNodeModules = needInstall ? tempNodeModules : runtimeNodeModules;

for (const dep of [bindings.esbuild]) {
  if (!fs.existsSync(path.join(workNodeModules, ...dep.split('/')))) {
    throw new Error(`[prepare-server-runtime] 平台原生包未安装成功: ${dep}（${hostKey}）`);
  }
}

// better-sqlite3 会在下方使用 Electron ABI 的预编译二进制覆盖，不能在 npm install
// 阶段触发 node-gyp 构建。这里只单独执行 esbuild 必需的后置脚本，
// 避免整包开启 scripts 导致 better-sqlite3 因缺少 VS 构建失败。
const runPackagePostinstall = (scriptPath, args = []) => {
  const resolved = path.join(workNodeModules, scriptPath);
  if (!fs.existsSync(resolved)) {
    console.log(`[prepare-server-runtime] postinstall 跳过（不存在）: ${scriptPath}`);
    return;
  }
  console.log(`[prepare-server-runtime] postinstall: ${scriptPath}`);
  runCommand(process.execPath, [resolved, ...args], {
    cwd: path.dirname(resolved),
    // 关键：之前这一步没有超时保护，受限网络/首次执行扫描时会无限等待（实测卡过 19 分钟）。
    timeout: 3 * 60 * 1000,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      PLAYWRIGHT_BROWSERS_PATH: '0',
    },
  });
};

if (needInstall) {
  runPackagePostinstall(path.join('esbuild', 'install.js'));
}

// 复制 workspace 源码包（排除 node_modules：里面是 pnpm 软链，复制过去会断链且徒增体积）
const yanZhiDir = path.join(workNodeModules, '@yan-zhi');
const copyFilter = (src) => path.basename(src) !== 'node_modules';
for (const name of ['core', 'shared']) {
  const target = path.join(yanZhiDir, name);
  fs.mkdirSync(yanZhiDir, { recursive: true });
  fs.cpSync(path.join(rootDir, 'packages', name), target, {
    recursive: true,
    force: true,
    filter: copyFilter,
  });

  // 生产环境用 Electron Node 直接运行 apps/server/dist 的编译产物，
  // 因此把 @yan-zhi/* 的入口指到同目录的 dist，并去掉 workspace 依赖声明。
  const targetPkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  fs.writeFileSync(
    path.join(target, 'package.json'),
    JSON.stringify(
      {
        name: targetPkg.name,
        version: targetPkg.version,
        private: true,
        type: 'module',
        main: `../../../dist/packages/${name}/src/index.js`,
        types: `../../../dist/packages/${name}/src/index.js`,
      },
      null,
      2,
    ),
  );
}

if (!fs.existsSync(desktopBetterSqlite)) {
  throw new Error(
    `[prepare-server-runtime] 找不到 Electron 版 better_sqlite3.node: ${desktopBetterSqlite}\n` +
      '请先运行 apps/desktop 的 postinstall 或 pnpm install。',
  );
}
const sqliteBuildDir = path.join(workNodeModules, 'better-sqlite3', 'build', 'Release');
fs.mkdirSync(sqliteBuildDir, { recursive: true });
fs.copyFileSync(desktopBetterSqlite, path.join(sqliteBuildDir, 'better_sqlite3.node'));

if (needInstall) {
  assertInside(runtimeDir, runtimeNodeModules);
  removeDirBestEffort(runtimeNodeModules);
  fs.cpSync(tempNodeModules, runtimeNodeModules, { recursive: true, force: true });

  // 缓存先落盘再清理：否则清理失败会把整轮 npm install（2 分钟）的收益一起丢掉。
  fs.writeFileSync(
    cacheFile,
    JSON.stringify({ key: cacheKey, hostKey, at: new Date().toISOString() }, null, 2),
  );
  console.log('[prepare-server-runtime] 依赖缓存已写入:', path.basename(cacheFile));

  console.log('[prepare-server-runtime] 清理临时目录:', buildDir);
  removeDirBestEffort(buildDir);
}

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
