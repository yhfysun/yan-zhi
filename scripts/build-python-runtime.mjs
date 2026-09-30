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
// 受限网络：默认**国内镜像优先**（npmmirror 的 python-build-standalone 二进制目录），
// GitHub Release 作兜底。可用环境变量覆盖为单一源：
//   YZ_PYTHON_STANDALONE_MIRROR   e.g. https://mirrors.example.com/pystandalone
//   YZ_PIP_INDEX_URL              e.g. https://pypi.rsproxy.cn/simple
//
// 用法：
//   node scripts/build-python-runtime.mjs                 # 当前平台
//   node scripts/build-python-runtime.mjs --platform=win --arch=x64
//   node scripts/build-python-runtime.mjs --no-deps      # 只下载解释器，不装依赖（调试用）

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, readFileSync } from 'node:fs';
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
// ★★ 下载源**按顺序尝试**（2026-09-30 用户要求「自动生成」时踩到）：
//   GitHub 直连在国内受限网络（含本机沙箱）会 `UND_ERR_CONNECT_TIMEOUT`，
//   而 **npmmirror 的 python-build-standalone 二进制镜像可达**（实测 40.9MB 秒开）。
//   → 默认国内镜像优先，GitHub 作兜底；可用 YZ_PYTHON_STANDALONE_MIRROR 覆盖为**单一源**。
const PBS_VERSION_ENC = PBS_VERSION;
const PBS_MIRRORS = process.env.YZ_PYTHON_STANDALONE_MIRROR
  ? [process.env.YZ_PYTHON_STANDALONE_MIRROR.replace(/\/$/, '')]
  : [
      // ① 国内镜像：npmmirror 的 python-build-standalone 二进制目录（文件名里的 + 需编码为 %2B）
      `https://registry.npmmirror.com/-/binary/python-build-standalone/${PBS_VERSION_ENC}`,
      // ② 官方 GitHub Release（受限网络下可能不可达）
      `https://github.com/indygreg/python-build-standalone/releases/download/${PBS_VERSION_ENC}`,
    ];
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

async function downloadOnce(url, dest, timeoutMs = 120000) {
  console.log('尝试下载:', url);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // ★ 必须**流式**落盘：本机沙箱下 arrayBuffer() 对 40MB+ 大文件会 CONNECT_TIMEOUT / 中断，
    //   而逐块读 + 写流稳定（实测 npmmirror 源秒开）。
    const { createWriteStream } = await import('node:fs');
    const ws = createWriteStream(dest);
    let n = 0;
    for await (const chunk of res.body) {
      n += chunk.length;
      if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
    }
    await new Promise((r, j) => ws.end(() => r()) || ws.on('error', j));
    console.log('已下载', (n / 1024 / 1024).toFixed(1), 'MB');
    return n;
  } finally {
    clearTimeout(timer);
  }
}

/** 按镜像顺序依次尝试；全部失败才抛错（错误里列出每个源的失败原因，便于判断是网络还是配置） */
async function download(urls, dest) {
  const tried = [];
  for (const u of urls) {
    try {
      const n = await downloadOnce(u, dest);
      if (n > 0) return u;
      tried.push(`${u} → 0 字节`);
    } catch (e) {
      const reason = e?.cause?.code || e?.name === 'AbortError' ? '超时' : e?.message;
      console.log('  失败:', reason);
      tried.push(`${u} → ${reason}`);
    }
  }
  throw new Error(`所有下载源均失败：\n  ${tried.join('\n  ')}`);
}

// 用系统 tar 解压（Windows 10+ 自带 tar.exe；mac/linux 原生）。支持 .tar.gz。
//
// ★★ 必须「切工作目录 + 只用归档**基名**」—— 不能传 `-C C:\...` 或绝对归档路径：
//   git-bash 里的 tar 是 **GNU tar**，会把带冒号的 Windows 路径（`C:\x.tar.gz`）当成
//   `host:path` 形式的远程归档，报 `Cannot connect to C: resolve failed`。
//   切 cwd 后只用相对基名，两种 tar 实现（GNU / bsdtar）都稳。
function extractWithTar(archive, dest) {
  mkdirSync(dest, { recursive: true });
  const base = path.basename(archive);
  run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', base], { cwd: dest });
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
  // 拷入 doyz/ security/ pdf_preview/ excel_preview/ 等随包脚本目录
  for (const entry of readdirSync(SRC_SCRIPTS)) {
    const from = path.join(SRC_SCRIPTS, entry);
    if (statSync(from).isDirectory()) {
      cpSync(from, path.join(TOOLS_DIR, entry), { recursive: true });
    }
  }
}

// 依赖指纹文件：记录已预烤进 site-packages 的依赖清单。
// 本地重包跳过 pip 的加速路径上，用它检测 DEPS 变化（如新增 xlrd）→ 自动增量补装，
// 避免出现"本地打的包缺依赖、CI 打的包正常"的静默不一致。
const DEPS_MARKER = path.join(RESOURCES, '.baked-deps.json');

function readBakedDeps() {
  try {
    return JSON.parse(readFileSync(DEPS_MARKER, 'utf8'));
  } catch {
    return null;
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
  'xlrd==2.0.1',
];

async function main() {
  const platform = arg('platform') || detect().platform;
  const arch = arg('arch') || detect().arch;
  const noDeps = arg('no-deps') === 'true';
  const force = arg('force') === 'true';
  const asset = pickAsset(platform, arch);
  // ★ 文件名里的 `+` 必须编码为 %2B：否则部分静态服务器（含 npmmirror）会把它当空格 → 404
  const assetEnc = asset.replace(/\+/g, '%2B');
  const urls = PBS_MIRRORS.map((b) => `${b}/${assetEnc}`);

  console.log(`目标: ${platform}/${arch}  →  ${asset}`);
  mkdirSync(RESOURCES, { recursive: true });

  const pythonExe = platform === 'win' ? path.join(PY_DIR, 'python.exe') : path.join(PY_DIR, 'bin', 'python3');
  const havePython = existsSync(pythonExe);

  // 已存在解释器且非 --force：跳过「下载 + 装依赖」（耗时最长两步），仅同步随包脚本。
  // 加速本地重包；CI 为全新 checkout，havePython 为 false，仍会走完整构建。
  // 改了 doyz/security/pdf 脚本后本地重包无需重下 Python 即可拿到新版。
  // 注意：若曾用 --no-deps 装过半截依赖，需 --force 强制重建。
  if (!force && havePython) {
    console.log('检测到已有 python 运行时，跳过下载（用 --force 强制重建）');
    // 依赖清单变化（如新增 xlrd）时增量补装，保证本地重包与 CI 产物一致
    const baked = readBakedDeps();
    const sig = JSON.stringify(DEPS);
    if (baked?.deps !== sig) {
      console.log('预烤依赖清单已变化（上次:', baked?.deps ? '有记录' : '无记录', '）→ 增量 pip install');
      pipInstall(pythonExe, DEPS);
    } else {
      console.log('预烤依赖指纹一致，跳过 pip install');
    }
    copyScripts();
    writeFileSync(DEPS_MARKER, JSON.stringify({ deps: sig, at: new Date().toISOString() }, null, 2));
    console.log('完成（仅同步随包脚本）。');
    console.log('  python       →', PY_DIR);
    console.log('  python-tools →', TOOLS_DIR);
    return;
  }

  const tmp = path.join(RESOURCES, `_pbs_${platform}_${arch}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const archive = path.join(tmp, asset);

  const usedUrl = await download(urls, archive);
  console.log('下载源:', usedUrl);
  extractWithTar(archive, tmp);
  flattenPython(tmp);

  if (!existsSync(pythonExe)) throw new Error(`未找到解释器: ${pythonExe}`);
  console.log('解释器就绪:', pythonExe);

  if (!noDeps) {
    pipInstall(pythonExe, DEPS);
  }
  copyScripts();
  // ★ 写依赖指纹：**完整路径也要写**（此前只在"已存在"的快速路径写）——
  //   否则下次快速路径读到 null 会误判"依赖清单变化"，白白重跑一遍 pip install。
  writeFileSync(DEPS_MARKER, JSON.stringify({ deps: JSON.stringify(DEPS), at: new Date().toISOString() }, null, 2));

  // ★★ 清理临时目录**必须非致命**：某些宿主（含本机沙箱）对批量删除有安全网，
  //   会在这一步抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED / EBUSY。此时**产物已完整生成**，
  //   若让异常冒泡 → 整个生成返回非零 → 接进打包链后会**误判构建失败而中断**。
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    console.warn(`临时目录清理失败（不影响产物，可手动删除）: ${tmp}`);
    console.warn(`  ${String(e.message).split('\n')[0]}`);
  }
  console.log('完成。资源目录:');
  console.log('  python       →', PY_DIR);
  console.log('  python-tools →', TOOLS_DIR);
  console.log('下一步：electron-builder 会把这两个目录拷入成品 resources/（见 electron-builder.*.yml 的 extraResources）。');
}

main().catch((e) => {
  console.error('build-python-runtime 失败:', e.message);
  process.exit(1);
});
