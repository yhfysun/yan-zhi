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
 *   3. 端口治理：1420 / 3001 / 5173 被本项目的 node/electron 残留进程占用时清理
 *   4. 就绪探测：Vite 返回 200 后才拉起 Electron，杜绝白屏
 *   5. 退出清理：Ctrl+C 或关闭时连带杀掉子进程树
 */
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
// 缓存指纹放在 .workbuddy/dev-cache（已 gitignore，且不受 node_modules 写保护影响）
const CACHE_DIR = path.join(ROOT, '.workbuddy', 'dev-cache');

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

// dev 与生产实例共用 3001/1420，正在运行的「言智」正式版同样需要让位
const SAFE_TO_KILL = /^(node|electron|tsx|vite|esbuild|yan-zhi|言智)(\.exe)?$/i;

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
    await freePort(3001, 'backend');
    // 浏览器工具执行面：CDP 端口（9222）有活的调试浏览器时优先注入 cdp env（与桌面 main.cjs
    // 同源，避免 server 另起一套 Chromium 造成双浏览器分裂）；不可达则保持 launch 模式
    // （server 侧已强制 headless，不会再弹独立浏览器窗口）。
    const browserEnv = (await isPortOpen(9222))
      ? { BROWSER_MODE: 'cdp', CDP_ENDPOINT: 'http://127.0.0.1:9222' }
      : {};
    if (Object.keys(browserEnv).length) log('检测到 CDP 调试浏览器 (9222)，server 浏览器工具走 cdp 模式');
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
        { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', ...browserEnv }
      );
      return;
    }
    if (!electronBin) warn('未找到 Electron 二进制，回退 PATH node 启动 server（native 模块 ABI 不匹配时会 ERR_DLOPEN_FAILED）');
    const pnpm = resolvePnpm();
    if (!pnpm) throw new Error('未找到 pnpm');
    start('server', pnpm.cmd, [...pnpm.args, '--filter', '@yan-zhi/server', 'dev'], ROOT, browserEnv);
    return;
  }

  await syncDeps();
  await manageCache();

  // 3001 必须留给 Electron 主进程内置后端（ABI 兼容），先释放外部残留
  if (appName === 'desktop') await freePort(3001, 'backend');
  await freePort(app.vitePort, `${appName} vite`);

  const viteBin = resolveViteBin();
  if (!viteBin) throw new Error(`未找到 vite: ${app.dir}/node_modules/vite`);
  log(`启动 Vite (${app.dir}) ...`);
  start('vite', resolveNode(), [viteBin, '--host', '127.0.0.1'], path.join(ROOT, app.dir));

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
  log('  env 净化: 已剥离 ELECTRON_* 变量，NODE_OPTIONS 置空');

  let gpuRetry = false;
  const launchElectron = (extraArgs) => {
    log(
      `启动 Electron${extraArgs.length ? ` (${extraArgs.join(' ')})` : ''}（内置后端会自动拉起 3001）...`
    );
    start('electron', electronBin, ['.', '--dev', ...extraArgs], path.join(ROOT, 'apps/desktop'), electronEnv, (code) => {
      // GPU 进程不可用导致的 fatal（0x80000003 软断点），自动切软件渲染重试一次
      if (!gpuRetry && (code === 2147483651 || code === 3221225477)) {
        gpuRetry = true;
        warn('GPU 进程不可用（受限环境 / 无显卡 / 远程桌面常见），自动改用软件渲染重试...');
        freePort(3001, 'backend').then(() =>
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

  log('后端就绪探测中 (http://127.0.0.1:3001) ...');
  await waitForPort(3001, 60000).catch(() => warn('3001 未在 60s 内就绪，请检查后端日志'));
  log('全部就绪。Ctrl+C 结束全部进程。');
}

main().catch((err) => {
  console.error('\n[dev] 启动失败:', err.message);
  shutdown(1);
});
