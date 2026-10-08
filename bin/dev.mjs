#!/usr/bin/env node
/**
 * Yan-Zhi 开发启动编排器（跨平台）
 *
 * 用法:
 *   node bin/dev.mjs [app] [options]
 *
 *   app:      desktop (默认) | web | server
 *   options:
 *     --clean        强制清理 Vite 缓存（默认仅在依赖/配置指纹变化时清理）
 *     --no-install   跳过依赖同步检查
 *     --no-kill     端口被占用时不杀进程，仅提示
 *     --vite-only    只启动 Vite，不拉起 Electron（排障/CI 用）
 *     --disable-gpu  直接以软件渲染启动 Electron（GPU 崩溃时会自动重试，一般无需手动加）
 *
 * 做了什么:
 *   1. 依赖指纹比对：lockfile / workspace package.json 变化才 pnpm install
 *   2. 缓存指纹比对：依赖或 vite 配置变化才删 node_modules/.vite，其余情况直接复用（启动快）
 *   3. 端口治理：1420 / 3002 / 5173 被本项目 **dev 残留进程**占用时清理
 *   4. 就绪探测：Vite 返回 200 后才拉起 Electron，杜绝白屏
 *   5. 退出清理：Ctrl+C 或关闭时连带杀掉子进程树
 */
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
// 缓存指纹放在 .workbuddy/dev-cache（已 gitignore，且不受 node_modules 写保护影响）
const CACHE_DIR = path.join(ROOT, '.workbuddy', 'dev-cache');

/**
 * 开发实例的数据目录（单一真相源，server 与 Electron 两条启动路径共用）。
 *
 * ★★★ 为什么必须有（2026-10-08 真实故障）：
 *   `db.ts` 的 dataDir = `process.env.DATA_DIR || path.join(__dirname, '..')`。
 *   安装版由 main.cjs 注入 DATA_DIR，而**开发模式此前谁都没注入** → dev 的库落到
 *   `apps/server/data.db`（**源码目录里**）。后果：dev 与安装版各写一份库、数据互不可见；
 *   实测该库还发生过 B 树损坏（conversation/message）→ 会话接口全 500。
 *
 * ★ 目录选 `%APPDATA%/yan-zhi-dev/server-data`，与 apps/desktop/instance.cjs 的
 *   `DEV_USERDATA_NAME = 'yan-zhi-dev'` **同源**（Electron 的 userData 就是它，
 *   后端数据放其 server-data 子目录）—— 与安装版 `yan-zhi/server-data` 布局对称：
 *   同机可以同时跑「安装版」与「dev 版」，各用各的库，互不干扰。
 *   （不选「项目内 apps/server/dev-data」：那会让 Electron 的 keyring/localStorage
 *     落在 %APPDATA%/yan-zhi-dev，而 DB 落在项目里，两处分裂、备份时容易漏。）
 */
const DEV_USERDATA_NAME = 'yan-zhi-dev'; // 与 instance.cjs 的 DEV_USERDATA_NAME 同值（注释同步）

function resolveDevDataDir() {
  const explicit = (process.env.DATA_DIR || '').trim();
  if (explicit) return explicit;
  const home = os.homedir();
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(appData, DEV_USERDATA_NAME, 'server-data');
}

const DEV_DATA_DIR = resolveDevDataDir();

const APPS = {
  desktop: { dir: 'apps/desktop', vitePort: 1420, label: 'Desktop (Electron)' },
  web: { dir: 'apps/web', vitePort: 5173, label: 'Web' },
  server: { dir: 'apps/server', vitePort: null, label: 'Server' },
};

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const appName = argv.find((a) => !a.startsWith('--')) || 'desktop';
const app = APPS[appName];

if (!app) {
  console.error(`[dev] 未知目标: ${appName}（可选: ${Object.keys(APPS).join(' | ')}）`);
  process.exit(1);
}

const OPT = {
  clean: flags.has('--clean'),
  install: !flags.has('--no-install'),
  kill: !flags.has('--no-kill'),
  viteOnly: flags.has('--vite-only'),
  disableGpu: flags.has('--disable-gpu'),
};

const log = (...a) => console.log('[dev]', ...a);
const warn = (...a) => console.warn('[dev] !', ...a);

/**
 * Windows 下以 shell:true 启动时，Node 不会给可执行文件加引号，
 * 路径含空格（如 C:\Program Files\nodejs\node.exe）会被 cmd 截断成 'C:\Program'。
 * 这里手动补引号；非 Windows（不走 shell）不能加，否则引号会被当成路径的一部分。
 */
function q(cmd) {
  return IS_WIN && /\s/.test(cmd) && !cmd.startsWith('"') ? `"${cmd}"` : cmd;
}

// ---------------------------------------------------------------- utils
function sha256(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) {
    const abs = path.join(ROOT, f);
    h.update(f);
    h.update(fs.existsSync(abs) ? fs.readFileSync(abs) : '<missing>');
  }
  return h.digest('hex').slice(0, 16);
}

async function readHash(name) {
  try {
    return (await fsp.readFile(path.join(CACHE_DIR, name), 'utf8')).trim();
  } catch {
    return null;
  }
}

async function writeHash(name, value) {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    const p = path.join(CACHE_DIR, name);
    try { await fsp.chmod(p, 0o644); } catch { /* 不存在或只读，忽略 */ }
    await fsp.writeFile(p, value);
  } catch (err) {
    warn(`写缓存指纹失败（${err.code}），本次跳过记录（不影响启动）`);
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(q(cmd), args, {
      cwd: opts.cwd || ROOT,
      stdio: opts.silent ? 'pipe' : 'inherit',
      shell: IS_WIN,
      env: { ...process.env, NODE_OPTIONS: '', ...(opts.env || {}) },
    });
    const timer = opts.timeout
      ? setTimeout(() => {
          warn(`${cmd} 超过 ${opts.timeout / 1000}s 未退出，强制结束`);
          child.kill('SIGKILL');
        }, opts.timeout)
      : null;
    child.on('exit', (code) => {
      if (timer) clearTimeout(timer);
      resolve(code ?? 0);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      warn(`${cmd} 启动失败: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * 同步执行短命令。
 * pnpm 在本环境存在「输出完成但进程不退出」的已知怪象，故用 execFileSync + timeout 兜底，
 * 避免启动流程被卡死。
 */
function runSync(cmd, args, opts = {}) {
  try {
    execFileSync(q(cmd), args, {
      cwd: opts.cwd || ROOT,
      stdio: opts.silent ? 'pipe' : 'inherit',
      shell: IS_WIN,
      windowsHide: true,
      timeout: opts.timeout || 600000,
      env: { ...process.env, NODE_OPTIONS: '', ...(opts.env || {}) },
    });
    return 0;
  } catch (err) {
    if (err && err.signal === 'SIGTERM' && err.status === null) {
      warn(`${cmd} 执行超时（${(opts.timeout || 600000) / 1000}s），继续后续步骤`);
    }
    return err && typeof err.status === 'number' ? err.status : 1;
  }
}

/**
 * 捕获命令输出。
 * 注意：Windows 上不能用 shell:true —— cmd 会重排引号，导致 tasklist 的
 * `/FI "PID eq 123"` 被拆成多个参数而报错。直接执行即可。
 */
function capture(cmd, args) {
  try {
    const buf = execFileSync(cmd, args, {
      encoding: 'buffer',
      shell: false,
      windowsHide: true,
      timeout: 15000,
    });
    // Windows 控制台输出为 GBK（如中文进程名「言智.exe」），需按 GBK 解码
    if (IS_WIN) {
      try {
        return new TextDecoder('gbk').decode(buf);
      } catch {
        /* 落到 utf8 */
      }
    }
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

/** 端口占用探测，返回 PID 列表 */
function pidsOnPort(port) {
  if (IS_WIN) {
    const out = capture('netstat', ['-ano', '-p', 'TCP']);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+(\w+)\s+(\d+)/);
      if (m && Number(m[1]) === port && m[2] === 'LISTENING') pids.add(m[3]);
    }
    return [...pids];
  }
  const out = capture('lsof', ['-ti', `:${port}`]);
  return out.split(/\s+/).filter(Boolean);
}

function processName(pid) {
  if (IS_WIN) {
    const out = capture('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']);
    const m = out.match(/"([^"]+)","(\d+)"/);
    return m ? m[1] : '';
  }
  return capture('ps', ['-p', pid, '-o', 'comm=']).trim();
}

/**
 * 可安全结束的进程名 —— **仅限本项目 dev 自己拉起的开发工具链**。
 *
 * ★★★ 为什么 `yan-zhi` / `言智` 被移除（2026-09-27 用户报障）：
 *   旧版把「正在运行的安装版」也列入可杀名单（注释原话：
 *   「dev 与生产实例共用 3001/1420，正在运行的『言智』正式版同样需要让位」），
 *   于是启动开发版会**强杀用户正在使用的安装版后端**，再用自己的后端占住同一端口。
 *   → 安装版窗口前端是旧的，但所有 /api 请求打到开发版后端，
 *     用户看到的现象就是「我都装好了，你改代码它还在变」。
 *   **把用户正在用的正式版当"残留进程"清掉，是设计错误，不是顺手。**
 *
 * 现在：两个实例各占一个端口（生产 3001 / 开发 3002）→ 互不干扰，可同时运行。
 * 端口被**正式版**占用时不再杀，只提示（见 guardProductionPort）。
 */
const SAFE_TO_KILL = /^(node|electron|tsx|vite|esbuild)(\.exe)?$/i;

/** 正式版进程名 —— 命中即说明用户在用安装版，绝不能杀 */
const PRODUCTION_PROCESS = /^(yan-zhi|言智)(\.exe)?$/i;

/** 本实例（开发）使用的后端端口 —— 与生产错开，见 apps/desktop/instance.cjs */
const DEV_API_PORT = 3002;

/**
 * 目标端口被**安装版**占用时的处置：**不杀，明确提示**。
 *
 * 为什么不能杀：那是用户正在用的软件（可能正跑着任务）。杀它 = 用户的软件莫名退出。
 * 为什么必须提示：如果我们继续往这个端口上塞后端，两个实例的服务会互相顶替 ——
 * 正是本次要修的 bug。所以宁可让用户知道"端口被正式版占着"，也不要悄悄抢。
 *
 * @returns true 表示端口可用（无占用 或 已成功释放 dev 残留）；false 表示被正式版占着
 */
async function guardProductionPort(port, label) {
  const pids = pidsOnPort(port);
  if (!pids.length) return true;
  const prodPids = pids.filter((pid) => PRODUCTION_PROCESS.test(processName(pid)));
  if (!prodPids.length) return true;
  warn(`端口 ${port}（${label}）被**已安装的言智正式版**占用（pid=${prodPids.join(',')}）。`);
  warn(`  → 开发实例改用 ${DEV_API_PORT}，不会影响正式版；若你要开发实例也用 ${port}，请先退出正式版。`);
  return false;
}

async function freePort(port, label) {
  const pids = pidsOnPort(port);
  if (!pids.length) return;
  for (const pid of pids) {
    const name = processName(pid);
    const safe = SAFE_TO_KILL.test(name);
    if (!safe) {
      warn(`端口 ${port} 被 ${name}(${pid}) 占用，非本项目进程，跳过`);
      continue;
    }
    if (!OPT.kill) {
      warn(`端口 ${port} 被 ${name}(${pid}) 占用（--no-kill，不处理）`);
      continue;
    }
    log(`释放端口 ${port}（${label}）: 结束 ${name} pid=${pid}`);
    if (IS_WIN) await run('taskkill', ['/PID', pid, '/T', '/F'], { silent: true, cwd: ROOT });
    else await run('kill', ['-9', pid], { silent: true });
  }
}

/**
 * 清理残留的 Electron 主进程（旧窗口）。
 * freePort 按端口杀，但旧 Electron 主窗口不占 1420/3001（它只是 loadURL 加载 vite），
 * 所以必须在启动新 Electron 之前按命令行特征过滤杀掉，否则重跑会叠出多个窗口，
 * 用户容易点到 pull 之前的旧窗口，误以为"代码没更新"。
 * 匹配条件：进程名是 electron，且命令行含本项目特征（apps/desktop 或 --dev 或仓库根路径）。
 */
async function killLingeringElectron() {
  if (!OPT.kill) return;
  const rootPattern = ROOT.replace(/\\/g, '\\\\');
  const cmd = IS_WIN
    ? `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'electron.exe') -and ($_.CommandLine -match 'apps.DEdesktop|--dev|${rootPattern}') } | ForEach-Object { $_.ProcessId }`
    : `ps aux | grep -E 'electron.*apps/desktop|electron.*--dev' | grep -v grep | awk '{print $2}'`;
  const out = capture(IS_WIN ? 'powershell' : 'bash', IS_WIN ? ['-NoProfile', '-Command', cmd] : ['-c', cmd]);
  const pids = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!pids.length) return;
  for (const pid of pids) {
    log(`清理残留 Electron 主进程 pid=${pid}`);
    if (IS_WIN) await run('taskkill', ['/PID', pid, '/T', '/F'], { silent: true, cwd: ROOT });
    else await run('kill', ['-9', pid], { silent: true });
  }
}

function waitForPort(port, timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sock = net.connect({ host: '127.0.0.1', port });
      const onDone = (ok) => {
        sock.destroy();
        ok ? resolve() : retry();
      };
      const retry = () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`等待端口 ${port} 就绪超时（${timeoutMs / 1000}s）`));
          return;
        }
        setTimeout(tick, 500);
      };
      sock.setTimeout(1000);
      sock.once('connect', () => onDone(true));
      sock.once('error', () => onDone(false));
      sock.once('timeout', () => onDone(false));
    };
    tick();
  });
}

/** 端口立即探测（短超时）：判断调试浏览器（CDP 9222）当前是否可达 */
function isPortOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
  });
}

// ---------------------------------------------------------------- 工具链解析
/** 读取 Electron 实例的 DevToolsActivePort，返回实际 CDP 端点（未就绪返回 null）。
 *  ★ 与桌面 main.cjs 同源：CDP 端口默认自动分配（remote-debugging-port=0），实际端口
 *  写在 userData/DevToolsActivePort 首行 —— 固定 9222 会被残留进程抢占导致抓取全灭。 */
function readDevToolsActivePortEndpoint() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates =
    process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'yan-zhi-dev'), path.join(home, 'Library', 'Application Support', 'yan-zhi')]
      : process.platform === 'win32'
        ? [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'yan-zhi-dev'), path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'yan-zhi')]
        : [path.join(home, '.config', 'yan-zhi-dev'), path.join(home, '.config', 'yan-zhi')];
  for (const dir of candidates) {
    try {
      const port = parseInt(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0], 10);
      if (port > 0 && port < 65536) return `http://127.0.0.1:${port}`;
    } catch { /* 未就绪/不存在 */ }
  }
  return null;
}

function resolveNode() {
  return process.execPath;
}

function resolvePnpm() {
  const inPath = IS_WIN ? capture('where', ['pnpm']) : capture('which', ['pnpm']);
  if (inPath.trim()) return { cmd: 'pnpm', args: [] };
  const local = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.workbuddy/binaries/node/workspace/node_modules/pnpm/bin/pnpm.cjs'
  );
  if (fs.existsSync(local)) return { cmd: resolveNode(), args: [local] };
  return null;
}

function resolveViteBin() {
  const p = path.join(ROOT, app.dir, 'node_modules/vite/bin/vite.js');
  return fs.existsSync(p) ? p : null;
}

function resolveElectronBin() {
  const pkgDir = path.join(ROOT, 'apps/desktop/node_modules/electron');
  const dist = path.join(pkgDir, 'dist');
  const name = IS_WIN ? 'electron.exe' : 'electron';
  if (fs.existsSync(path.join(dist, name))) return path.join(dist, name);
  const txt = path.join(pkgDir, 'path.txt');
  if (fs.existsSync(txt)) {
    const rel = fs.readFileSync(txt, 'utf8').trim();
    const resolved = path.join(pkgDir, rel, IS_WIN ? 'electron.exe' : 'electron');
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

// ---------------------------------------------------------------- 步骤 1: 依赖同步
// 关键依赖目录：只要这些都在，就认为依赖齐备，跳过 install。
// 不依赖 hash 文件（部分沙箱环境禁止覆盖写已存在文件，会导致每次误触发 install）。
// 注意：不只查"核心启动"依赖(vite/electron/tsx)，还必须包含"运行时动态 import"的边缘依赖
// （docx→mammoth、pdf→unpdf、二维码→qrcode/jsqr、diff→@codemirror/*）。
// 否则依赖缺失时 APP 能起、但用户一旦打开相关页面/保存文件触发 vite 热更新 import，
// 就会抛 "Failed to resolve import mammoth/unpdf..." 这种哑雷（曾经真实发生）。
const KEY_DEPS = [
  'apps/desktop/node_modules/vite',
  'apps/desktop/node_modules/electron',
  'apps/server/node_modules/tsx',
  // 注：node-llama-cpp 已是孤儿依赖（本地模型引擎改用 Ollama，不在任何 package.json 中），
  // 列在这里会导致每次启动都误触发 pnpm install 且永远装不上，故不再检查。
  'packages/ui/node_modules/vue',
  'packages/core/node_modules/xlsx',
  // 运行时动态 import 的边缘依赖（缺失时 vite 热更新才炸，须纳入检查防哑雷）
  'packages/core/node_modules/mammoth',        // file-read.ts docx 解析
  'packages/core/node_modules/unpdf',          // file-read.ts pdf 解析
  'packages/ui/node_modules/qrcode',           // Connections.vue 二维码
  'packages/ui/node_modules/jsqr',             // Connections.vue 二维码(识)
  'packages/ui/node_modules/@codemirror/view', // CodeEditor/DiffEditor
  // 代码模式（/code）按扩展名【动态 import】语言包，缺失时只有打开对应后缀才炸，
  // 属于典型哑雷，必须纳入检查：lang-python / lang-java / legacy-modes(yaml·properties·shell)。
  'packages/ui/node_modules/@codemirror/lang-python',
  'packages/ui/node_modules/@codemirror/lang-java',
  'packages/ui/node_modules/@codemirror/legacy-modes',
];

async function syncDeps() {
  const missing = KEY_DEPS.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length === 0) {
    log('关键依赖齐备（跳过 pnpm install）');
    return;
  }
  if (!OPT.install) {
    warn(`缺失依赖但 --no-install 已跳过: ${missing.join(', ')}`);
    return;
  }
  const pnpm = resolvePnpm();
  if (!pnpm) {
    warn('未找到 pnpm，请手动执行 pnpm install');
    return;
  }
  warn(`缺失依赖: ${missing.join(', ')}`);
  log('执行 pnpm install ...');
  // 注：pnpm install 在本环境可能返回非 0 / 输出完成后进程不退出（已知怪象），
  // 只要关键依赖目录就位即视为完成，不阻断启动。
  runSync(pnpm.cmd, [...pnpm.args, 'install'], { timeout: 300000 });
  const stillMissing = KEY_DEPS.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (stillMissing.length) {
    warn(`install 后仍缺失: ${stillMissing.join(', ')}，请手动执行 pnpm install`);
  } else {
    log('依赖安装完成');
  }
}

// ---------------------------------------------------------------- 步骤 2: 缓存治理
const VITE_CACHE_DIRS = [
  'apps/desktop/node_modules/.vite',
  'apps/web/node_modules/.vite',
  'apps/mobile/node_modules/.vite',
  'node_modules/.vite',
];

async function rmrf(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return false;
  await fsp.rm(abs, { recursive: true, force: true, maxRetries: 3 });
  return true;
}

/** 清理 Vite 异常退出留下的 vite.config.ts.timestamp-*.mjs 残留 */
async function cleanStaleTimestampFiles() {
  for (const dir of ['apps/desktop', 'apps/web', 'apps/mobile']) {
    try {
      const entries = await fsp.readdir(path.join(ROOT, dir));
      for (const e of entries) {
        if (/^vite\.config\.[jt]s\.timestamp-/.test(e)) {
          await fsp.rm(path.join(ROOT, dir, e), { force: true });
          log(`  清理残留 ${dir}/${e}`);
        }
      }
    } catch {
      /* 目录不存在则忽略 */
    }
  }
}

async function manageCache() {
  // 指纹 = vite 配置内容 + workspace 包 package.json（依赖增减也会反映在 package.json）
  const configFiles = [
    'apps/desktop/vite.config.ts',
    'apps/web/vite.config.ts',
    'apps/mobile/vite.config.ts',
    'packages/ui/package.json',
    'packages/core/package.json',
    'packages/shared/package.json',
  ];
  const full = sha256(configFiles);
  const saved = await readHash('vite.hash');
  const stale = saved !== full;

  if (!OPT.clean && !stale) {
    log('Vite 缓存有效，直接复用（无需每次清理）');
    await cleanStaleTimestampFiles();
    return;
  }
  log(OPT.clean ? '--clean：清理 Vite 缓存' : '配置/依赖已变化：清理 Vite 缓存');
  for (const dir of VITE_CACHE_DIRS) {
    if (await rmrf(dir)) log(`  已删除 ${dir}`);
  }
  await cleanStaleTimestampFiles();
  await writeHash('vite.hash', full);
}

// ---------------------------------------------------------------- 步骤 3: 启动
const children = [];
let shuttingDown = false;

function start(name, cmd, args, cwd, env, onExit) {
  // 注意：对象展开只能覆盖、不能删除键。想删掉某个环境变量（如 ELECTRON_RUN_AS_NODE），
  // 需传入 undefined 值，这里统一过滤掉 undefined 后再交给 spawn。
  const merged = { ...process.env, NODE_OPTIONS: '', ...(env || {}) };
  const childEnv = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) childEnv[k] = v;
  }
  const child = spawn(q(cmd), args, {
    cwd,
    stdio: 'inherit',
    shell: IS_WIN,
    env: childEnv,
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (onExit && onExit(code, signal) === 'handled') return;
    log(`${name} 退出 (code=${code} signal=${signal})，正在关闭其余进程...`);
    shutdown(code ?? 0);
  });
  children.push({ name, child });
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { name, child } of children) {
    if (child.exitCode !== null) continue;
    const pid = child.pid;
    if (!pid) continue;
    if (IS_WIN) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {
        /* 已退出 */
      }
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* 已退出 */
        }
      }
    }
    log(`已停止 ${name}`);
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  log(`目标: ${app.label}  分支工作区: ${ROOT}`);

  if (appName === 'server') {
    // 独立跑 server（不带 Electron）：同样用开发端口，且以 YANZHI_DEV_INSTANCE=1
    // 让 server 侧拿到与「开发实例」一致的实例语义（env 供 shared/local-server 读取）。
    await guardProductionPort(DEV_API_PORT, 'backend');
    await freePort(DEV_API_PORT, 'backend');
    // 浏览器工具执行面：CDP 端口优先读 Electron 实例的 DevToolsActivePort（与桌面
    // main.cjs 同源，自动端口也认得）；不可达再退回探测 9222；都没有则保持 launch 模式
    // （server 侧已强制 headless，不会再弹独立浏览器窗口）。
    const cdpFromPortFile = readDevToolsActivePortEndpoint();
    // 文件可能是已退出实例的残留 → 读到端口后再做活体探测
    let cdpEndpoint = null;
    if (cdpFromPortFile) {
      const port = parseInt(cdpFromPortFile.split(':').pop(), 10);
      if (await isPortOpen(port)) cdpEndpoint = cdpFromPortFile;
    }
    const browserEnv = cdpEndpoint
      ? { BROWSER_MODE: 'cdp', CDP_ENDPOINT: cdpEndpoint }
      : (await isPortOpen(9222))
        ? { BROWSER_MODE: 'cdp', CDP_ENDPOINT: 'http://127.0.0.1:9222' }
        : {};
    if (browserEnv.CDP_ENDPOINT) log(`CDP 调试浏览器: ${browserEnv.CDP_ENDPOINT}，server 浏览器工具走 cdp 模式`);
    // server 依赖 better-sqlite3 等 native 模块，其预编译 ABI 跟 Electron 内嵌 node 对齐。
    // 用 PATH 上的 node 启动会因 NODE_MODULE_VERSION 不匹配直接 ERR_DLOPEN_FAILED（且
    // 报错容易被终端其它输出冲掉，表现为"莫名退出"）。所以这里与打包版 main.cjs 同源：
    // 一律用 Electron 内嵌 node（ELECTRON_RUN_AS_NODE=1）+ tsx watch 启动，与 PATH node 版本解耦。
    const electronBin = resolveElectronBin();
    const tsxCli = path.join(ROOT, 'apps/server/node_modules/tsx/dist/cli.mjs');
    if (electronBin && fs.existsSync(tsxCli)) {
      log('用 Electron 内嵌 node 启动 server（ABI 与 native 模块对齐，不受 PATH node 版本影响）');
      start(
        'server',
        electronBin,
        [tsxCli, 'watch', 'src/index.ts'],
        path.join(ROOT, 'apps/server'),
        {
          ELECTRON_RUN_AS_NODE: '1',
          NODE_OPTIONS: '',
          PORT: String(DEV_API_PORT),
          YANZHI_DEV_INSTANCE: '1',
          YANZHI_API_PORT: String(DEV_API_PORT),
          DATA_DIR: DEV_DATA_DIR,
          ...browserEnv,
        }
      );
      return;
    }
    if (!electronBin) warn('未找到 Electron 二进制，回退 PATH node 启动 server（native 模块 ABI 不匹配时会 ERR_DLOPEN_FAILED）');
    const pnpm = resolvePnpm();
    if (!pnpm) throw new Error('未找到 pnpm');
    start('server', pnpm.cmd, [...pnpm.args, '--filter', '@yan-zhi/server', 'dev'], ROOT, {
      PORT: String(DEV_API_PORT),
      YANZHI_DEV_INSTANCE: '1',
      YANZHI_API_PORT: String(DEV_API_PORT),
      DATA_DIR: DEV_DATA_DIR,
      ...browserEnv,
    });
    return;
  }

  await syncDeps();
  await manageCache();

  // 开发实例端口（默认 3002）必须留给 Electron 主进程内置后端。
  // ★ 先查是否被**正式版**占用：若被占，只提示不杀（那是用户在用的软件）；
  //   再清理 dev 自己可能残留的 node/electron（不带 yan-zhi.exe —— 见 SAFE_TO_KILL 注释）。
  if (appName === 'desktop') {
    await guardProductionPort(DEV_API_PORT, 'backend');
    await freePort(DEV_API_PORT, 'backend');
  }
  await freePort(app.vitePort, `${appName} vite`);

  const viteBin = resolveViteBin();
  if (!viteBin) throw new Error(`未找到 vite: ${app.dir}/node_modules/vite`);
  log(`启动 Vite (${app.dir}) ...`);
  // vite 的 /api 代理目标端口随实例（dev=3002）→ 把端口传进 vite 进程，
  // 否则 vite.config.ts 只能读不到 YANZHI_API_PORT 而回落 3001（打到正式版后端）。
  start('vite', resolveNode(), [viteBin, '--host', '127.0.0.1'], path.join(ROOT, app.dir), {
    YANZHI_API_PORT: String(DEV_API_PORT),
  });

  log(`等待 Vite 就绪 (http://127.0.0.1:${app.vitePort}) ...`);
  await waitForPort(app.vitePort);
  log(`Vite 就绪 -> http://localhost:${app.vitePort}`);

  if (appName === 'web' || OPT.viteOnly) {
    log(OPT.viteOnly ? '--vite-only：不拉起 Electron' : 'Web 模式：请在浏览器打开上面的地址');
    return;
  }

  const electronBin = resolveElectronBin();
  if (!electronBin) throw new Error('未找到 Electron 二进制，请先执行 pnpm install');
  // 关键：环境里若残留 ELECTRON_RUN_AS_NODE=1（部分终端/工具链会注入），
  // electron.exe 会退化成纯 Node，require('electron') 拿到的是可执行文件路径字符串，
  // 导致 ipcMain 等 API 全部 undefined 并崩溃。这里剥离所有 ELECTRON_* 变量。
  const electronEnv = { NODE_OPTIONS: '' }; // NODE_OPTIONS 含 --use-system-ca 时 Electron 会拒绝启动
  for (const k of Object.keys(process.env)) {
    if (/^ELECTRON_/i.test(k)) electronEnv[k] = undefined; // 置 undefined 即从子环境删除
  }
  // ★ 实例隔离三件套（主进程据此选 userData 与端口，见 apps/desktop/instance.cjs）：
  //   YANZHI_DEV_INSTANCE → userData 用 yan-zhi-dev（不碰安装版的 yan-zhi）
  //   YANZHI_API_PORT     → 后端监听 3002（不占用正式版的 3001）
  //   两者缺一都会退回"共用"，等于没隔离。
  electronEnv.YANZHI_DEV_INSTANCE = '1';
  electronEnv.YANZHI_API_PORT = String(DEV_API_PORT);
  // ★ 数据目录也下发（main.cjs 会在 app.getPath('userData') 基础上用 server-data 子目录；
  //   这里显式传一份，保证「dev.mjs server」与「dev.mjs desktop」两条路径拿到同一个值，
  //   不会因为一个走 Electron、一个走裸 server 就落到两个不同的库上）。
  electronEnv.DATA_DIR = DEV_DATA_DIR;
  log('  env 净化: 已剥离 ELECTRON_* 变量，NODE_OPTIONS 置空');
  log(`  实例隔离: YANZHI_DEV_INSTANCE=1, YANZHI_API_PORT=${DEV_API_PORT}（与安装版 3001 / yan-zhi 分开）`);
  log(`  数据目录: DATA_DIR=${DEV_DATA_DIR}`);

  // 清理残留 Electron 主进程（旧窗口不占端口，freePort 杀不到；不清理会叠窗口导致看到旧界面）
  // ★ 只清 dev 自己拉起的（命令行含仓库根 / apps/desktop / --dev）；
  //   安装版进程命令行是 C:\APP\...\yan-zhi.exe，不含这些特征 → 不会被误杀。
  await killLingeringElectron();

  let gpuRetry = false;
  const launchElectron = (extraArgs) => {
    log(
      `启动 Electron${extraArgs.length ? ` (${extraArgs.join(' ')})` : ''}（内置后端会自动拉起 ${DEV_API_PORT}）...`
    );
    start('electron', electronBin, ['.', '--dev', ...extraArgs], path.join(ROOT, 'apps/desktop'), electronEnv, (code) => {
      // GPU 进程不可用导致的 fatal（0x80000003 软断点），自动切软件渲染重试一次
      if (!gpuRetry && (code === 2147483651 || code === 3221225477)) {
        gpuRetry = true;
        warn('GPU 进程不可用（受限环境 / 无显卡 / 远程桌面常见），自动改用软件渲染重试...');
        freePort(DEV_API_PORT, 'backend').then(() =>
          setTimeout(
            () =>
              launchElectron([
                '--disable-gpu',
                '--disable-gpu-sandbox',
                '--no-sandbox',
                '--disable-software-rasterizer',
              ]),
            1500
          )
        );
        return 'handled';
      }
      return undefined;
    });
  };
  launchElectron(OPT.disableGpu ? ['--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'] : []);

  log(`后端就绪探测中 (http://127.0.0.1:${DEV_API_PORT}) ...`);
  await waitForPort(DEV_API_PORT, 60000).catch(() => warn(`${DEV_API_PORT} 未在 60s 内就绪，请检查后端日志`));
  log('全部就绪。Ctrl+C 结束全部进程。');
}

main().catch((err) => {
  console.error('\n[dev] 启动失败:', err.message);
  shutdown(1);
});
