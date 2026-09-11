#!/usr/bin/env node
// 打包「内置 Python 运行时」：下载 python-build-standalone + 预烤依赖 + 拷入随包脚本。
//
// 产物落点（相对仓库根）：
//   apps/desktop/resources/python        → 解释器本体（python.exe / bin/python3 + Lib + Scripts）
//   apps/desktop/resources/python-tools  → 随包 Python 脚本（doyz / security / pdf_preview）+ 预烤依赖
//
// electron-builder 会把这两个目录拷进成品的 resources/，运行时由
// packages/core/src/tool/builtin/python-runtime.ts 的 getBundledPythonPath() /
// getPythonToolsDir() 解析。dev 模式（无 resources/python）自动回退系统 python。
//
// 受限网络：可用环境变量覆盖下载源与 pip 源
//   YZ_PYTHON_STANDALONE_MIRROR  e.g. https://mirrors.example.com/pystandalone
//   YZ_PIP_INDEX_URL             e.g. https://pypi.rsproxy.cn/simple
//
// 用法：
//   node scripts/build-python-runtime.mjs                 # 当前平台
//   node scripts/build-python-runtime.mjs --platform=win --arch=x64
//   node scripts/build-python-runtime.mjs --no-deps      # 只下载解释器，不装依赖（调试用）

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESOURCES = path.join(ROOT, 'apps', 'desktop', 'resources');
const PY_DIR = path.join(RESOURCES, 'python');
const TOOLS_DIR = path.join(RESOURCES, 'python-tools');
const SRC_SCRIPTS = path.join(ROOT, 'packages', 'core', 'src', 'tool', 'builtin', 'python-scripts');

// python-build-standalone 版本与三元组
const PBS_VERSION = '20240726';
const PBS_BASE = (process.env.YZ_PYTHON_STANDALONE_MIRROR || `https://github.com/indygreg/python-build-standalone/releases/download/${PBS_VERSION}`).replace(/\/$/, '');
const PY_VER = '3.11.9';

// 平台/架构 → 资源文件名
function pickAsset(platform, arch) {
  if (platform === 'win' && arch === 'x64') return `cpython-${PY_VER}+${PBS_VERSION}-x86_64-pc-windows-msvc-shared-install_only.tar.gz`;
  if (platform === 'mac' && arch === 'x64') return `cpython-${PY_VER}+${PBS_VERSION}-x86_64-apple-darwin-install_only.tar.gz`;
  if (platform === 'mac' && arch === 'arm64') return `cpython-${PY_VER}+${PBS_VERSION}-aarch64-apple-darwin-install_only.tar.gz`;
  if (platform === 'linux' && arch === 'x64') return `cpython-${PY_VER}+${PBS_VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
  if (platform === 'linux' && arch === 'arm64') return `cpython-${PY_VER}+${PBS_VERSION}-aarch64-unknown-linux-gnu-install_only.tar.gz`;
  throw new Error(`不支持的平台/架构组合: ${platform}/${arch}`);
}

function detect() {
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return { platform, arch };
}

function arg(name) {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.*)$`));
    if (m) return m[1];
  }
  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}

function run(cmd, args, opts = {}) {
  console.log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} 失败（exit ${r.status ?? r.error?.message}）`);
}

async function download(url, dest) {
  console.log('下载:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log('已下载', (buf.length / 1024 / 1024).toFixed(1), 'MB');
}

// 用系统 tar 解压（Windows 10+ 自带 tar.exe；mac/linux 原生）。支持 .tar.gz。
function extractWithTar(archive, dest) {
  mkdirSync(dest, { recursive: true });
  run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', archive, '-C', dest]);
}

// 定位解压后内层 python/ 目录并扁平到 PY_DIR（保证 PY_DIR/python.exe 或 PY_DIR/bin/python3 存在）
function flattenPython(innerRoot) {
  // 解压根下应直接有 python/ 子目录
  const candidate = path.join(innerRoot, 'python');
  const src = existsSync(candidate) ? candidate : innerRoot;
  rmSync(PY_DIR, { recursive: true, force: true });
  mkdirSync(PY_DIR, { recursive: true });
  cpSync(src, PY_DIR, { recursive: true });
}

function pipInstall(pythonExe, deps) {
  const indexUrl = process.env.YZ_PIP_INDEX_URL || 'https://pypi.org/simple';
  run(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip', '-i', indexUrl]);
  run(pythonExe, ['-m', 'pip', 'install', '-i', indexUrl, ...deps]);
}

function copyScripts() {
  rmSync(TOOLS_DIR, { recursive: true, force: true });
  mkdirSync(TOOLS_DIR, { recursive: true });
  // 拷入 doyz/ security/ pdf_preview/ 等随包脚本目录
  for (const entry of readdirSync(SRC_SCRIPTS)) {
    const from = path.join(SRC_SCRIPTS, entry);
    if (statSync(from).isDirectory()) {
      cpSync(from, path.join(TOOLS_DIR, entry), { recursive: true });
    }
  }
}

const DEPS = [
  'python-docx==1.1.2',
  'python-pptx==1.0.2',
  'openpyxl==3.1.5',
  'pyyaml==6.0.2',
  'matplotlib==3.9.2',
  'pandas==2.2.2',
  'requests==2.32.3',
  'beautifulsoup4==4.12.3',
  'dnspython==2.6.1',
  'PyMuPDF==1.24.10',
];

async function main() {
  const platform = arg('platform') || detect().platform;
  const arch = arg('arch') || detect().arch;
  const noDeps = arg('no-deps') === 'true';
  const force = arg('force') === 'true';
  const asset = pickAsset(platform, arch);
  const url = `${PBS_BASE}/${asset}`;

  console.log(`目标: ${platform}/${arch}  →  ${asset}`);
  mkdirSync(RESOURCES, { recursive: true });

  const pythonExe = platform === 'win' ? path.join(PY_DIR, 'python.exe') : path.join(PY_DIR, 'bin', 'python3');
  const havePython = existsSync(pythonExe);

  // 已存在解释器且非 --force：跳过「下载 + 装依赖」（耗时最长两步），仅同步随包脚本。
  // 加速本地重包；CI 为全新 checkout，havePython 为 false，仍会走完整构建。
  // 改了 doyz/security/pdf 脚本后本地重包无需重下 Python 即可拿到新版。
  // 注意：若曾用 --no-deps 装过半截依赖，需 --force 强制重建。
  if (!force && havePython) {
    console.log('检测到已有 python 运行时，跳过下载与依赖安装（用 --force 强制重建）');
    copyScripts();
    console.log('完成（仅同步随包脚本）。');
    console.log('  python       →', PY_DIR);
    console.log('  python-tools →', TOOLS_DIR);
    return;
  }

  const tmp = path.join(RESOURCES, `_pbs_${platform}_${arch}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const archive = path.join(tmp, asset);

  await download(url, archive);
  extractWithTar(archive, tmp);
  flattenPython(tmp);

  if (!existsSync(pythonExe)) throw new Error(`未找到解释器: ${pythonExe}`);
  console.log('解释器就绪:', pythonExe);

  if (!noDeps) {
    pipInstall(pythonExe, DEPS);
  }
  copyScripts();

  rmSync(tmp, { recursive: true, force: true });
  console.log('完成。资源目录:');
  console.log('  python       →', PY_DIR);
  console.log('  python-tools →', TOOLS_DIR);
  console.log('下一步：electron-builder 会把这两个目录拷入成品 resources/（见 electron-builder.*.yml 的 extraResources）。');
}

main().catch((e) => {
  console.error('build-python-runtime 失败:', e.message);
  process.exit(1);
});
