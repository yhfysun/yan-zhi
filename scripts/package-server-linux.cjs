#!/usr/bin/env node
/**
 * Linux 纯后端 + Web 发布包。
 *
 * 产物是可直接解压运行的 tar.gz：
 *   dist/            编译后的 server
 *   node_modules/    Linux x64 扁平运行依赖
 *   web/             @yan-zhi/web 构建产物
 *   runtime/node/    自带 Node（默认开启）
 *   start.sh         启动脚本
 *
 * 必须在本机平台与目标一致时构建。Windows 上请使用
 * package-server-linux.cmd，它会在 Linux Docker 容器内完成构建。
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'apps', 'server');
const WEB_DIR = path.join(ROOT, 'apps', 'web');
const DESKTOP_DIR = path.join(ROOT, 'apps', 'desktop');
const RUNTIME_DIR = path.join(DESKTOP_DIR, 'runtime', 'server-runtime');
const DEFAULT_OUT_ROOT = path.join(ROOT, 'dist-release', 'server', 'linux-x64');

function fail(message) {
  throw new Error(`[package-server-linux] ${message}`);
}

function parseArgs(argv) {
  const out = {
    outRoot: DEFAULT_OUT_ROOT,
    stageDir: '',
    withWeb: true,
    withNode: true,
    withPython: true,
    skipBuild: false,
    archive: true,
    name: '',
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--no-web') out.withWeb = false;
    else if (arg === '--no-node') out.withNode = false;
    else if (arg === '--no-python') out.withPython = false;
    else if (arg === '--skip-build') out.skipBuild = true;
    else if (arg === '--no-archive') out.archive = false;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--out=')) out.outRoot = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--stage-dir=')) out.stageDir = path.resolve(arg.slice('--stage-dir='.length));
    else if (arg.startsWith('--name=')) out.name = arg.slice('--name='.length);
    else fail(`未知参数: ${arg}`);
  }
  return out;
}

function sanitizeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolvePackageIdentity({ name, version, platform = process.platform, arch = process.arch }) {
  const base = sanitizeName(name) || `yan-zhi-server-${platform}-${arch}`;
  return {
    base,
    archiveName: `${base}.tar.gz`,
    sha256Name: `${base}.tar.gz.sha256`,
    version: String(version || '0.0.0'),
  };
}

function assertLinuxX64(platform = process.platform, arch = process.arch) {
  if (platform !== 'linux' || arch !== 'x64') {
    fail(
      `当前是 ${platform}-${arch}，Linux 包必须在 Linux x64 上构建。` +
      ' Windows 请运行 package-server-linux.cmd（需要 Docker Desktop）。',
    );
  }
}

function printHelp() {
  console.log(`用法: node scripts/package-server-linux.cjs [选项]

选项:
  --out=<目录>       输出根目录，默认 dist-release/server/linux-x64
  --stage-dir=<目录> 临时打包目录（Docker 构建应放在 Linux 文件系统）
  --name=<名称>      发布目录/压缩包名称
  --skip-build       复用已有 server/web/plugins 产物
  --no-web           不打包 Web 前端
  --no-node          不自带 Node，目标机需预装 Node 20+
  --no-python        不自带 Python，目标机需预装 Python 3
  --no-archive       只生成目录，不生成 tar.gz
  -h, --help         显示帮助

说明:
  脚本必须在 Linux x64 上执行。Windows 推荐:
    package-server-linux.cmd
`);
}

function run(cmd, args, options = {}) {
  console.log(`[package-server-linux] $ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error) fail(`${cmd} 启动失败: ${result.error.message}`);
  if (result.status !== 0) fail(`${cmd} 退出码 ${result.status}`);
}

function findPnpmCommand() {
  const probe = spawnSync('corepack', ['--version'], { stdio: 'ignore' });
  return probe.status === 0 ? ['corepack', ['pnpm']] : ['pnpm', []];
}

function runPnpm(args) {
  const [cmd, prefix] = findPnpmCommand();
  run(cmd, [...prefix, ...args], {
    env: {
      CI: '1',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
    },
  });
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) fail(`缺少 ${label}: ${file}`);
}

function ensureDir(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`缺少 ${label}: ${dir}`);
}

function copyDir(from, to, label) {
  ensureDir(from, label);
  fs.cpSync(from, to, { recursive: true, force: true });
}

function copyDirWithLinuxCp(from, to, label) {
  ensureDir(from, label);
  fs.mkdirSync(to, { recursive: true });
  run('cp', ['-a', `${from}/.`, `${to}/`]);
}

/** 把 Python standalone 中指向构建目录的绝对符号链接改成包内相对链接。 */
function normalizePythonSymlinks(root, sourceRoots) {
  const normalizedRoots = sourceRoots.map((p) => path.resolve(p));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      const target = fs.readlinkSync(file);
      if (!path.isAbsolute(target)) continue;
      const sourceRoot = normalizedRoots.find((r) => target === r || target.startsWith(r + path.sep));
      if (!sourceRoot) continue;
      const rel = path.relative(sourceRoot, target);
      const fixedTarget = path.relative(path.dirname(file), path.join(root, rel));
      fs.unlinkSync(file);
      fs.symlinkSync(fixedTarget, file);
    }
  };
  walk(root);
}

function writeFile(file, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  fs.chmodSync(file, mode);
}

function renderStartScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

export NODE_ENV="\${NODE_ENV:-production}"
export PORT="\${PORT:-3001}"
export YZ_HOST="\${YZ_HOST:-0.0.0.0}"
export YZ_AUTH_MODE="\${YZ_AUTH_MODE:-multi}"
export YZ_EDITION="\${YZ_EDITION:-pro}"
export YZ_DEFAULT_EDITION="\${YZ_DEFAULT_EDITION:-basic}"
export YZ_DESKTOP_LOCAL_EXECUTION="\${YZ_DESKTOP_LOCAL_EXECUTION:-1}"
export DATA_DIR="\${DATA_DIR:-$ROOT/data}"

if [ -f "$ROOT/web/index.html" ]; then
  export WEB_DIST="\${WEB_DIST:-$ROOT/web}"
fi
if [ -f "$ROOT/license/default-codes.json" ]; then
  export YZ_LICENSE_CODES_FILE="\${YZ_LICENSE_CODES_FILE:-$ROOT/license/default-codes.json}"
fi
if [ -x "$ROOT/runtime/python/bin/python3" ]; then
  export YZ_PYTHON="\${YZ_PYTHON:-$ROOT/runtime/python/bin/python3}"
fi

NODE_BIN="\${YZ_NODE_BIN:-$ROOT/runtime/node/bin/node}"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "[yan-zhi] 未找到 Node。请重新打包并保留 runtime/node，或在目标机安装 Node 20+。" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
if [ -z "\${JWT_SECRET:-}" ]; then
  JWT_FILE="$DATA_DIR/.jwt-secret"
  if [ ! -s "$JWT_FILE" ]; then
    "$NODE_BIN" -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))" > "$JWT_FILE"
    chmod 600 "$JWT_FILE"
  fi
  JWT_SECRET="$(cat "$JWT_FILE")"
  export JWT_SECRET
fi

echo "[yan-zhi] 启动后端: http://\${YZ_HOST}:\${PORT}"
echo "[yan-zhi] 数据目录: \$DATA_DIR"
if [ -n "\${WEB_DIST:-}" ]; then
  echo "[yan-zhi] Web:      \$WEB_DIST"
fi

exec "$NODE_BIN" dist/apps/server/src/index.js
`;
}

function renderEnvExample() {
  return `# 复制为 .env 后按需修改；start.sh 会自动加载。
PORT=3001
YZ_HOST=0.0.0.0
YZ_AUTH_MODE=multi
YZ_EDITION=pro
YZ_DEFAULT_EDITION=basic
DATA_DIR=./data

# 不填写时，start.sh 会在 DATA_DIR/.jwt-secret 自动生成并复用。
# JWT_SECRET=

# 仅公网/多用户部署时建议开启授权门禁：
# YZ_LICENSE_GUARD=1
`;
}

function renderReadme({ base, version, withPython }) {
  return `# 言智 Linux 后端 + Web

版本：${version}
目录：${base}

## 启动

\`\`\`bash
tar -xzf ${base}.tar.gz
cd ${base}
cp .env.example .env
./start.sh
\`\`\`

首次启动会自动创建 \`data/\` 和 JWT 密钥。默认地址：

\`\`\`text
http://服务器IP:3001
\`\`\`

健康检查：

\`\`\`bash
curl http://127.0.0.1:3001/api/health
\`\`\`

## 配置

- \`DATA_DIR\`：数据库、日志、上传产物目录。
- \`PORT\` / \`YZ_HOST\`：监听端口和地址。
- \`YZ_AUTH_MODE=multi\`：多用户模式；首次打开 Web 时创建管理员。
- \`JWT_SECRET\`：不配置时使用 \`DATA_DIR/.jwt-secret\` 自动生成值。
- \`YZ_EDITION=pro\`：包含全部代码；实际放行模式仍由授权码决定。

## 注意

- 本包按 Linux x64 构建，不能直接复制到 Windows 运行。
- Web 静态文件由后端托管，无需另外启动 Nginx 或 Vite。
- ${withPython ? '内置 Linux Python 运行时与预烤依赖。' : '未内置 Python，依赖 Python 的工具需系统 Python 3。'}
- 如果服务用户不是解压目录的所有者，请保证 \`DATA_DIR\` 和
  \`dist/apps/server/plugins/installed\` 可写。
`;
}

function writePackageFiles(stage, identity, { withWeb, withNode, withPython }) {
  writeFile(
    path.join(stage, 'package.json'),
    `${JSON.stringify({
      name: identity.base,
      version: identity.version,
      private: true,
      type: 'module',
      main: 'dist/apps/server/src/index.js',
    }, null, 2)}\n`,
  );
  writeFile(path.join(stage, 'start.sh'), renderStartScript(), 0o755);
  writeFile(path.join(stage, '.env.example'), renderEnvExample());
  writeFile(path.join(stage, 'README-LINUX.md'), renderReadme({ ...identity, withPython }));
  writeFile(
    path.join(stage, 'BUILD-INFO.json'),
    `${JSON.stringify({
      product: 'yan-zhi-server',
      version: identity.version,
      target: 'linux-x64',
      builtAt: new Date().toISOString(),
      node: withNode ? 'bundled' : 'system-required',
      web: withWeb,
      python: withPython ? 'bundled' : 'system-required',
    }, null, 2)}\n`,
  );
}

function stagePackage({ outRoot, stageDir, withWeb, withNode, withPython, name, version }) {
  ensureDir(path.join(SERVER_DIR, 'dist'), 'server dist（先构建 @yan-zhi/server）');
  ensureDir(path.join(DESKTOP_DIR, 'runtime', 'server-runtime', 'node_modules'), 'server runtime node_modules');
  if (withWeb) ensureDir(path.join(WEB_DIR, 'dist'), 'web dist（先构建 @yan-zhi/web）');

  const identity = resolvePackageIdentity({
    name: name || `yan-zhi-server-linux-x64-${version}`,
    version,
  });
  const stageRoot = stageDir || outRoot;
  const stage = path.join(stageRoot, identity.base);
  fs.mkdirSync(stageRoot, { recursive: true });
  if (path.resolve(stageRoot) !== path.resolve(outRoot)) {
    fs.rmSync(path.join(outRoot, identity.base), { recursive: true, force: true });
  }
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  copyDir(path.join(SERVER_DIR, 'dist'), path.join(stage, 'dist'), 'server dist');
  copyDir(path.join(SERVER_DIR, 'assets'), path.join(stage, 'assets'), 'server assets');
  copyDir(path.join(RUNTIME_DIR, 'node_modules'), path.join(stage, 'node_modules'), 'runtime node_modules');

  if (withWeb) {
    copyDir(path.join(WEB_DIR, 'dist'), path.join(stage, 'web'), 'web dist');
  }

  if (withPython) {
    copyDirWithLinuxCp(
      path.join(DESKTOP_DIR, 'resources', 'python'),
      path.join(stage, 'runtime', 'python'),
      'bundled Linux Python',
    );
    normalizePythonSymlinks(path.join(stage, 'runtime', 'python'), [
      path.join(DESKTOP_DIR, 'resources', 'python'),
      path.join(DESKTOP_DIR, 'resources', '_pbs_linux_x64', 'python'),
    ]);
    copyDirWithLinuxCp(
      path.join(DESKTOP_DIR, 'resources', 'python-tools'),
      path.join(stage, 'dist', 'packages', 'core', 'src', 'tool', 'builtin', 'python-scripts'),
      'Python tool scripts',
    );
  }

  const licenseDir = path.join(DESKTOP_DIR, 'resources', 'license');
  if (fs.existsSync(licenseDir)) {
    copyDir(licenseDir, path.join(stage, 'license'), 'license codes');
  }

  if (withNode) {
    const nodeTarget = path.join(stage, 'runtime', 'node', 'bin', 'node');
    fs.mkdirSync(path.dirname(nodeTarget), { recursive: true });
    fs.copyFileSync(process.execPath, nodeTarget);
    fs.chmodSync(nodeTarget, 0o755);
  }

  fs.mkdirSync(path.join(stage, 'data'), { recursive: true });
  fs.mkdirSync(path.join(stage, 'dist', 'apps', 'server', 'plugins', 'installed'), { recursive: true });
  writePackageFiles(stage, identity, { withWeb, withNode, withPython });
  return { stage, identity };
}

function archivePackage({ outRoot, stage, identity }) {
  const archive = path.join(outRoot, identity.archiveName);
  const shaFile = path.join(outRoot, identity.sha256Name);
  fs.rmSync(archive, { force: true });
  fs.rmSync(shaFile, { force: true });
  run('tar', ['-czf', archive, '-C', path.dirname(stage), path.basename(stage)]);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(shaFile, `${digest}  ${identity.archiveName}\n`, 'utf8');
  return { archive, shaFile, digest };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  assertLinuxX64();

  const serverPkg = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));
  const version = serverPkg.version || '0.0.0';

  if (!opts.skipBuild) {
    runPnpm(['--filter', '@yan-zhi/server', 'build']);
    if (opts.withWeb) runPnpm(['--filter', '@yan-zhi/web', 'build']);
    if (opts.withPython) {
      run(process.execPath, [
        path.join(ROOT, 'scripts', 'build-python-runtime.mjs'),
        '--platform=linux',
        '--arch=x64',
      ]);
    }
  }
  run(process.execPath, [path.join(DESKTOP_DIR, 'scripts', 'prepare-server-runtime.cjs')]);

  const { stage, identity } = stagePackage({
    outRoot: opts.outRoot,
    stageDir: opts.stageDir,
    withWeb: opts.withWeb,
    withNode: opts.withNode,
    withPython: opts.withPython,
    name: opts.name,
    version,
  });

  console.log(`[package-server-linux] 目录: ${stage}`);
  if (opts.archive) {
    const { archive, shaFile, digest } = archivePackage({ outRoot: opts.outRoot, stage, identity });
    console.log(`[package-server-linux] 压缩包: ${archive}`);
    console.log(`[package-server-linux] SHA256: ${shaFile}`);
    console.log(`[package-server-linux] ${digest}  ${path.basename(archive)}`);
  }
}

module.exports = {
  parseArgs,
  sanitizeName,
  resolvePackageIdentity,
  assertLinuxX64,
  renderStartScript,
  renderEnvExample,
  renderReadme,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
