import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from './logger.js';
import { dataDir } from '../db.js';
import {
  OPENCLAW_MIN_NODE,
  INITIAL_LOGIN_STATE,
  compareNodeVersion,
  parseLoginOutput,
  mergePluginEntry,
} from './openclaw-util.js';
import type { LoginPhase, LoginParseState } from './openclaw-util.js';

const logger = createLogger('openclaw-manager');

/**
 * OpenClaw 托管服务：个人微信连接器的「程序代劳」层。
 *
 * 真实栈（2026-10-17 扒源码 + 官方文档核实）：
 *   openclaw 宿主（npm，需 Node ≥24.16）→ @tencent-weixin/openclaw-weixin 插件
 *   → `openclaw channels login` 扫码（CLI 会打印「备用链接」即二维码 URL）。
 * 桥接：自带 yanzhi-bridge 插件（内嵌模板生成到数据目录），
 *   before_dispatch 把微信消息 POST 给言智同步桥接路由，回复文本由宿主回发。
 *
 * ⚠️ 一切以真跑为准：扫码输出标记、hook 字段名以运行期日志核验为准，不臆造。
 */

const OPENCLAW_STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
const OPENCLAW_CTRL_URL = 'http://127.0.0.1:18789/';
/** 托管运行时与插件的根目录（dev 与安装版统一走数据目录） */
export const openclawDataDir = path.join(dataDir, 'openclaw');
const NODE_RUNTIME_DIR = path.join(openclawDataDir, 'node24');
const BRIDGE_PLUGIN_DIR = path.join(openclawDataDir, 'plugins', 'yanzhi-bridge');
export const BRIDGE_PLUGIN_ID = 'yanzhi-bridge';

// ============================================================
// 环境检测 / 安装
// ============================================================

function runCapture(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, { shell: true, windowsHide: true });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'spawn failed' });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function getNodeVersion(nodeCmd: string): Promise<string | null> {
  const r = await runCapture(nodeCmd, ['--version'], 10_000);
  const m = r.stdout.match(/v(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

export interface OpenclawEnv {
  nodeCmd: string;
  nodeVersion: string;
  nodeOk: boolean;
  openclawVersion: string | null;
  gatewayRunning: boolean;
  portableNodeReady: boolean;
}

/** 探测本机环境：可用 node（系统或已下载的托管版）、openclaw、gateway 运行状态 */
export async function detectOpenclawEnv(): Promise<OpenclawEnv> {
  let nodeCmd = 'node';
  let nodeVersion = await getNodeVersion('node');
  // 系统版本不达标 → 看托管运行时
  if (!nodeVersion || compareNodeVersion(nodeVersion, OPENCLAW_MIN_NODE) < 0) {
    const portableMarker = path.join(NODE_RUNTIME_DIR, 'portable-node.ok');
    if (fs.existsSync(portableMarker)) {
      const portableNode = path.join(NODE_RUNTIME_DIR, portableNodeRelativeBin());
      const pv = await getNodeVersion(`"${portableNode}"`);
      if (pv && compareNodeVersion(pv, OPENCLAW_MIN_NODE) >= 0) {
        nodeCmd = `"${portableNode}"`;
        nodeVersion = pv;
      }
    }
  }
  const oc = await runCapture('openclaw --version', [], 15_000);
  const ocVer = oc.code === 0 ? (oc.stdout.match(/(\d{4}\.\d+\.\d+)/)?.[1] ?? null) : null;
  let gatewayRunning = false;
  try {
    const res = await fetch(OPENCLAW_CTRL_URL, { signal: AbortSignal.timeout(2000) });
    gatewayRunning = res.ok || res.status < 500;
  } catch {
    gatewayRunning = false;
  }
  return {
    nodeCmd,
    nodeVersion: nodeVersion || '',
    nodeOk: !!nodeVersion && compareNodeVersion(nodeVersion, OPENCLAW_MIN_NODE) >= 0,
    openclawVersion: ocVer,
    gatewayRunning,
    portableNodeReady: fs.existsSync(path.join(NODE_RUNTIME_DIR, 'portable-node.ok')),
  };
}

function portableNodeRelativeBin(): string {
  if (process.platform === 'win32') return 'node.exe';
  return 'bin/node';
}

/** portable node 全局 prefix 即 node 目录本身，openclaw bin 落在其下 */
function portableOpenclawRelative(): string {
  return process.platform === 'win32' ? 'openclaw.cmd' : 'bin/openclaw';
}

/** 已解析的 openclaw 命令（PATH 或托管目录），resolveOpenclawCmd 缓存 */
let cachedOpenclawCmd: string | null = null;

/** 解析可用的 openclaw 命令：先 PATH，再托管 node 目录（portable 安装不在 PATH 上） */
export async function resolveOpenclawCmd(): Promise<string> {
  if (cachedOpenclawCmd) return cachedOpenclawCmd;
  const oc = await runCapture('openclaw --version', [], 15_000);
  if (oc.code === 0) {
    cachedOpenclawCmd = 'openclaw';
    return cachedOpenclawCmd;
  }
  const portable = path.join(NODE_RUNTIME_DIR, portableOpenclawRelative());
  if (fs.existsSync(portable)) {
    cachedOpenclawCmd = `"${portable}"`;
    return cachedOpenclawCmd;
  }
  throw new Error('openclaw 未安装，请先执行一键安装');
}

/** 托管 node 的 npm 入口（portable zip 里自带 npm） */
function portableNpmCmd(nodeDir: string): string {
  if (process.platform === 'win32') return path.join(nodeDir, 'npm.cmd');
  return path.join(nodeDir, 'bin', 'npm');
}

type LogFn = (line: string) => void;

/**
 * 下载并解压便携 Node 24（OpenClaw 的最低版本门槛，系统 node 不达标时用）。
 * 镜像优先 npmmirror（本机网络对 nodejs.org 不保证可达），失败回落官方源。
 */
export async function ensurePortableNode(onLog: LogFn): Promise<string> {
  fs.mkdirSync(NODE_RUNTIME_DIR, { recursive: true });
  const okMarker = path.join(NODE_RUNTIME_DIR, 'portable-node.ok');
  if (fs.existsSync(okMarker)) {
    const bin = path.join(NODE_RUNTIME_DIR, portableNodeRelativeBin());
    if (fs.existsSync(bin)) return bin;
    // marker 在但二进制缺失（损坏安装）：清掉重来
    fs.rmSync(okMarker, { force: true });
  }

  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(`暂不支持的平台：${process.platform}`);
  }
  const isWin = process.platform === 'win32';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platformKey = isWin ? 'win-x64' : `${process.platform}-${arch}`;
  const archiveExt = isWin ? 'zip' : 'tar.gz';

  // 1. 解析最新 v24.x.x 版本（npmmirror 二进制 API 优先，nodejs.org 兜底）
  const version = await resolveLatestV24(onLog);
  if (!version) throw new Error('未能从任何镜像解析到 Node 24 下载地址');
  onLog(`解析到 Node 最新 24 版本：v${version}`);

  // 2. 候选下载地址（zip 真实路径在版本化目录根，不在 /<platform>/ 下）
  const zipName = `node-v${version}-${platformKey}.${archiveExt}`;
  const candidates = [
    `https://registry.npmmirror.com/-/binary/node/v${version}/${zipName}`,
    `https://nodejs.org/dist/v${version}/${zipName}`,
  ];

  let zipPath: string | null = null;
  for (const url of candidates) {
    try {
      onLog(`下载 ${url} ...`);
      const res = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      if (!res.ok) {
        onLog(`  HTTP ${res.status}，跳过`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      zipPath = path.join(NODE_RUNTIME_DIR, zipName);
      fs.writeFileSync(zipPath, buf);
      onLog(`下载完成 ${Math.round(buf.length / 1024 / 1024)}MB`);
      break;
    } catch (e) {
      onLog(`下载失败 ${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!zipPath) throw new Error('所有镜像下载 Node 24 均失败');

  // 3. 解压到临时目录，再拍平官方包的嵌套 node-v* 子目录到 NODE_RUNTIME_DIR
  onLog('解压中...');
  const extractDir = path.join(NODE_RUNTIME_DIR, '__extract__');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const extCode = await new Promise<number>((resolve) => {
    const child = spawn('tar', ['-xf', zipPath, '-C', extractDir], { windowsHide: true });
    child.on('close', (c) => resolve(c ?? -1));
    child.on('error', () => resolve(-1));
  });
  if (extCode !== 0) {
    if (isWin) {
      await extractZipWithPowerShell(zipPath, extractDir);
    } else {
      throw new Error(`解压失败 exit=${extCode}（需要系统 tar 支持）`);
    }
  }
  flattenExtractedNode(extractDir);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });

  fs.writeFileSync(okMarker, new Date().toISOString());
  const bin = path.join(NODE_RUNTIME_DIR, portableNodeRelativeBin());
  const v = await getNodeVersion(`"${bin}"`);
  if (!v) throw new Error('解压后无法执行 node，请检查系统解压能力');
  onLog(`托管 Node 就绪：v${v}`);
  return bin;
}

/**
 * 解析最新 Node 24.x.x 版本号（不含 v 前缀，如 "24.22.0"）。
 * 优先 npmmirror 二进制 API（JSON listing），兜底 nodejs.org 目录 listing（HTML 正则）。
 */
export async function resolveLatestV24(onLog: LogFn): Promise<string | null> {
  const fetchers: Array<() => Promise<string | null>> = [
    async () => {
      const res = await fetch('https://registry.npmmirror.com/-/binary/node/', { signal: AbortSignal.timeout(15_000) });
      const list = (await res.json()) as Array<{ name?: string }>;
      const vers = list
        .map((x) => (x.name || '').replace(/\/$/, ''))
        .filter((n) => /^v24\.\d+\.\d+$/.test(n))
        .sort((a, b) => compareNodeVersion(a, b));
      return vers.length ? vers[vers.length - 1].slice(1) : null;
    },
    async () => {
      const res = await fetch('https://nodejs.org/dist/latest-v24.x/', { signal: AbortSignal.timeout(15_000) });
      const html = await res.text();
      // 取 listing 里所有匹配版本，按语义排序取最大（避免目录顺序导致拿到非最新版）
      const all = [...html.matchAll(/node-v(24\.\d+\.\d+)-(?:win-x64|darwin-|linux-)/g)].map((m) => m[1]);
      if (!all.length) return null;
      return all.sort((a, b) => compareNodeVersion(`v${a}`, `v${b}`)).pop() as string;
    },
  ];
  for (const f of fetchers) {
    try {
      const v = await f();
      if (v) return v;
    } catch (e) {
      onLog(`版本解析失败: ${e instanceof Error ? e.message : e}`);
    }
  }
  return null;
}

/** 把解压出的官方包（顶层 node-v* 子目录）内容提到上级目录并拍平 */
export function flattenExtractedNode(extractDir: string): void {
  const top = fs.readdirSync(extractDir).find((e) => /^node-v/.test(e));
  if (!top) throw new Error('解压后未找到 node 目录（包结构可能变更）');
  const srcDir = path.join(extractDir, top);
  const destDir = path.dirname(extractDir);
  for (const f of fs.readdirSync(srcDir)) {
    fs.renameSync(path.join(srcDir, f), path.join(destDir, f));
  }
}

/** Windows 上 tar 不可用时的 zip 解压兜底（PowerShell Expand-Archive，无需 Add-Type） */
async function extractZipWithPowerShell(zipPath: string, dest: string): Promise<void> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const ps = `Expand-Archive -Path '${esc(zipPath)}' -DestinationPath '${esc(dest)}' -Force`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
    child.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`PowerShell 解压失败 exit=${c}`))));
    child.on('error', reject);
  });
}

async function npmGlobalInstall(nodeDir: string | null, pkg: string, onLog: LogFn): Promise<void> {
  let npmCmd: string;
  const env = { ...process.env };
  if (nodeDir) {
    npmCmd = portableNpmCmd(nodeDir);
    // portable node 的全局 prefix 就是 node 目录本身
    env.npm_config_prefix = nodeDir;
  } else {
    // 系统 node 达标时直接用裸 npm.cmd 会被 PATH 里其它 node/npm 劫持（dev 仓库本地 npm 软链尤甚）。
    // 优先用「运行服务的 node 自带的 npm-cli.js」，避免解析到错误 npm。
    const nodeBin = process.execPath;
    const npmCli = path.join(path.dirname(nodeBin), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(npmCli)) {
      npmCmd = `"${nodeBin}" "${npmCli}"`;
    } else {
      npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    }
  }
  onLog(`npm install -g ${pkg} ...`);
  const r = await runCapture(`"${npmCmd}" install -g ${pkg}`, [], 900_000);
  if (r.code !== 0) {
    throw new Error(`npm install -g ${pkg} 失败：${(r.stderr || r.stdout).slice(-800)}`);
  }
  onLog(`${pkg} 安装完成`);
}

// ============================================================
// 扫码登录会话（子进程 + 输出解析 + 验证码 stdin）
// ============================================================

interface LoginSession {
  child: ChildProcess | null;
  state: LoginParseState;
  logs: string[];
  startedAt: number;
  exited: boolean;
  exitCode: number | null;
}

let loginSession: LoginSession | null = null;

export function startLoginSession(openclawCmd: string): { ok: boolean; error?: string } {
  if (loginSession && !loginSession.exited) {
    return { ok: false, error: '已有登录会话进行中，请先等待完成或取消' };
  }
  loginSession = { child: null, state: { ...INITIAL_LOGIN_STATE }, logs: [], startedAt: Date.now(), exited: false, exitCode: null };
  const child = spawn(openclawCmd, ['channels', 'login', '--channel', 'openclaw-weixin'], {
    shell: true,
    windowsHide: true,
    env: { ...process.env },
  });
  loginSession.child = child;
  const push = (s: string) => {
    loginSession!.logs.push(s);
    if (loginSession!.logs.length > 400) loginSession!.logs.shift();
    loginSession!.state = parseLoginOutput(loginSession!.state, s);
  };
  child.stdout?.on('data', (d) => push(String(d)));
  child.stderr?.on('data', (d) => push(String(d)));
  child.on('close', (code) => {
    if (!loginSession) return;
    loginSession.exited = true;
    loginSession.exitCode = code;
    if (code === 0 && loginSession.state.phase !== 'error') loginSession.state.phase = 'success';
  });
  child.on('error', (e) => {
    if (!loginSession) return;
    loginSession.exited = true;
    loginSession.state.phase = 'error';
    loginSession.state.message = String(e);
  });
  return { ok: true };
}

export function getLoginStatus() {
  if (!loginSession) {
    return { active: false, state: { ...INITIAL_LOGIN_STATE, message: '尚未开始登录' }, logs: [] as string[] };
  }
  return {
    active: !loginSession.exited,
    state: loginSession.state,
    logs: loginSession.logs.slice(-40),
    exitCode: loginSession.exitCode,
    elapsedMs: Date.now() - loginSession.startedAt,
  };
}

export function sendVerifyCode(code: string): { ok: boolean; error?: string } {
  if (!loginSession || loginSession.exited || !loginSession.child?.stdin) {
    return { ok: false, error: '没有进行中的登录会话' };
  }
  loginSession.child.stdin.write(`${code}\n`);
  return { ok: true };
}

export function cancelLoginSession(): void {
  if (loginSession && !loginSession.exited) {
    try { loginSession.child?.kill(); } catch { /* ignore */ }
  }
  loginSession = null;
}

// ============================================================
// 桥接插件模板（内嵌生成，免打包映射）
// ============================================================

const BRIDGE_PACKAGE_JSON = JSON.stringify(
  { name: 'yanzhi-bridge', version: '1.0.0', type: 'module', openclaw: { extensions: ['./index.ts'] } },
  null,
  2,
);

const BRIDGE_PLUGIN_JSON = JSON.stringify(
  {
    id: BRIDGE_PLUGIN_ID,
    name: 'Yan-zhi Bridge',
    activation: { onStartup: true },
    configSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string' },
        token: { type: 'string' },
        timeoutMs: { type: 'number' },
        channelFilter: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  null,
  2,
);

const BRIDGE_INDEX_TS = `import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// 言智桥接：微信消息 → 言智 AI（同步等待回复）→ 宿主回发。
// before_dispatch 返回 {handled:true, text} 时宿主直接把 text 发回原通道，
// 不需要插件侧调用任何 send API（2026-10-17 官方 hooks 文档核实）。
export default definePluginEntry({
  id: "${BRIDGE_PLUGIN_ID}",
  name: "Yan-zhi Bridge",
  description: "把微信消息转发给言智 AI 并把回复经宿主回发",
  register(api) {
    const cfg = (api.pluginConfig || {}) as Record<string, unknown>;
    const endpoint = String(cfg.endpoint || "");
    const token = String(cfg.token || "");
    const timeoutMs = Number(cfg.timeoutMs || 120000);
    const channelFilter = String(cfg.channelFilter || "weixin");
    if (!endpoint || !token) {
      console.error("[yanzhi-bridge] 缺少 endpoint/token 配置，桥接未启用");
      return;
    }
    console.log("[yanzhi-bridge] 已注册 before_dispatch，endpoint=" + endpoint + " filter=" + channelFilter);
    api.on("before_dispatch", async (event: any, ctx: any) => {
      // 只拦微信通道：字段名以运行期日志核验为准，候选全试一遍
      const meta = event?.metadata || {};
      const channel = String(
        meta.channel || meta.channelId || meta.provider || meta.source || ctx?.sessionKey || "",
      );
      if (channel && !channel.includes(channelFilter)) return undefined;
      const text = String(event?.bodyForAgent ?? event?.content ?? event?.text ?? "").trim();
      if (!text) return undefined;
      const messageId = String(event?.messageId ?? ctx?.messageId ?? "");
      const fromUser = String(event?.senderId ?? ctx?.senderId ?? "unknown");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-bridge-token": token },
          body: JSON.stringify({ messageId, text, fromUser, channel }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}) as any);
        if (data?.ok && typeof data.reply === "string" && data.reply.trim()) {
          return { handled: true, text: data.reply };
        }
        if (data?.reason === "duplicate") {
          return { handled: true }; // 平台重投：静默吞掉，避免宿主 agent 接管
        }
        const reason = String(data?.error || data?.reason || "");
        const friendly = reason === "reply_timeout"
          ? "⏳ 处理超时了，请稍后重试"
          : reason === "no_default_model"
            ? "⚠️ 言智还没有配置默认模型"
            : "⚠️ 言智处理失败，请稍后重试";
        return { handled: true, text: friendly };
      } catch (e) {
        console.error("[yanzhi-bridge] 转发失败:", String(e));
        return { handled: true, text: "⚠️ 言智服务不可达，请确认言智正在运行" };
      } finally {
        clearTimeout(timer);
      }
    });
  },
});
`;

/** 生成桥接插件文件（幂等；每次装配都覆盖，保证模板与服务端同版本） */
export function writeBridgePluginFiles(): string {
  fs.mkdirSync(BRIDGE_PLUGIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(BRIDGE_PLUGIN_DIR, 'package.json'), BRIDGE_PACKAGE_JSON);
  fs.writeFileSync(path.join(BRIDGE_PLUGIN_DIR, 'openclaw.plugin.json'), BRIDGE_PLUGIN_JSON);
  fs.writeFileSync(path.join(BRIDGE_PLUGIN_DIR, 'index.ts'), BRIDGE_INDEX_TS);
  return BRIDGE_PLUGIN_DIR;
}

function readOpenclawConfig(): Record<string, any> {
  const p = path.join(OPENCLAW_STATE_DIR, 'openclaw.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeOpenclawConfig(cfg: Record<string, any>): void {
  fs.mkdirSync(OPENCLAW_STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(OPENCLAW_STATE_DIR, 'openclaw.json'), JSON.stringify(cfg, null, 2));
}

/**
 * 解析 OpenClaw Gateway 的 HTTP 鉴权令牌（/tools/invoke 调用所需）。
 * 优先级：环境变量 OPENCLAW_GATEWAY_TOKEN / OPENCLAW_GATEWAY_PASSWORD
 *          → openclaw.json 的 gateway.auth.token / gateway.auth.password。
 * 返回 null 表示未配置（此时直接调用会被网关 401 拒绝）。
 */
export function resolveOpenclawGatewayToken(): string | null {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_PASSWORD;
  if (envTok) return envTok;
  const cfg = readOpenclawConfig();
  const auth = cfg?.gateway?.auth || {};
  return auth.token || auth.password || null;
}

/**
 * 确保 Gateway 已配置共享令牌：未配置则生成随机令牌并写回 openclaw.json。
 * ⚠️ 必须在 gateway 启动/重启之前调用，否则运行中的网关不会加载新令牌（令牌在启动时读取）。
 * 返回的令牌同时作为 /tools/invoke 调用凭据。
 */
export function ensureOpenclawGatewayToken(): string {
  const cfg = readOpenclawConfig();
  cfg.gateway = cfg.gateway || {};
  cfg.gateway.auth = cfg.gateway.auth || {};
  const existing = cfg.gateway.auth.token || cfg.gateway.auth.password;
  if (existing) return existing;
  const token = crypto.randomBytes(24).toString('hex');
  cfg.gateway.auth.mode = 'token';
  cfg.gateway.auth.token = token;
  writeOpenclawConfig(cfg);
  return token;
}

// ============================================================
// 安装 / 装配 编排（长任务，走 job 轮询）
// ============================================================

interface InstallJob {
  id: string;
  step: 'install_node' | 'install_openclaw' | 'install_plugin' | 'done' | 'error';
  logs: string[];
  error: string;
  startedAt: number;
  finishedAt: number;
}

let installJob: InstallJob | null = null;

export function getInstallJob() {
  return installJob;
}

async function openclawCmdOf(): Promise<string> {
  return resolveOpenclawCmd();
}

/**
 * 一键安装编排：托管 Node（按需）→ openclaw 宿主 → 微信插件。
 * install/login 分离：login（扫码）单独走 startLoginSession。
 */
export function startInstallJob(): string {
  if (installJob && !installJob.finishedAt && installJob.step !== 'error') {
    return installJob.id;
  }
  const job: InstallJob = { id: `oc-${Date.now()}`, step: 'install_node', logs: [], error: '', startedAt: Date.now(), finishedAt: 0 };
  installJob = job;
  const log: LogFn = (l) => {
    job.logs.push(l);
    if (job.logs.length > 500) job.logs.shift();
    logger.info(`[openclaw-install] ${l}`);
  };
  void (async () => {
    try {
      // 1. Node 门槛：系统达标直接用，否则下载托管版
      let nodeVersion = await getNodeVersion('node');
      let nodeDir: string | null = null;
      if (nodeVersion && compareNodeVersion(nodeVersion, OPENCLAW_MIN_NODE) >= 0) {
        log(`系统 Node v${nodeVersion} 满足要求 (≥${OPENCLAW_MIN_NODE})`);
      } else {
        log(`系统 Node ${nodeVersion || '缺失'} 不满足 ≥${OPENCLAW_MIN_NODE}，下载托管运行时...`);
        await ensurePortableNode(log);
        nodeDir = NODE_RUNTIME_DIR;
        log('托管 Node 就绪');
      }
      job.step = 'install_openclaw';

      // 2. openclaw 宿主
      const ocCheck = await runCapture('openclaw --version', [], 15_000);
      if (ocCheck.code !== 0) {
        await npmGlobalInstall(nodeDir, 'openclaw', log);
        if (nodeDir) {
          // portable 安装不在 PATH 上，显式缓存 bin 路径供后续命令使用
          cachedOpenclawCmd = `"${path.join(nodeDir, portableOpenclawRelative())}"`;
          log(`openclaw bin：${cachedOpenclawCmd}`);
        }
      } else {
        log(`openclaw 已安装：${ocCheck.stdout.trim().slice(0, 80)}`);
      }

      // 3. 微信通道插件（直接 plugins install，扫码单独走 login 会话）
      const cmd = await openclawCmdOf();
      log('安装微信通道插件 @tencent-weixin/openclaw-weixin@latest ...');
      const ins = await runCapture(`${cmd} plugins install "@tencent-weixin/openclaw-weixin@latest" --accept-capabilities`, [], 600_000);
      if (ins.code !== 0 && !/already exists/.test(ins.stderr + ins.stdout)) {
        // 已装过会非零，容错重试 update
        const upd = await runCapture(`${cmd} plugins update openclaw-weixin`, [], 600_000);
        if (upd.code !== 0) {
          throw new Error(`插件安装失败：${(ins.stderr || ins.stdout).slice(-500)}`);
        }
      }
      log('微信通道插件就绪');
      job.step = 'done';
      job.finishedAt = Date.now();
      log('安装完成，可开始扫码连接');
    } catch (e) {
      job.step = 'error';
      job.error = e instanceof Error ? e.message : String(e);
      job.finishedAt = Date.now();
      log(`安装失败：${job.error}`);
    }
  })();
  return job.id;
}

/**
 * 装配桥接：生成插件文件 → plugins install --link → 写 plugins.entries 配置 → gateway restart。
 * endpoint 指向言智同步桥接路由；token 为连接器 bridgeToken。
 */
export async function assembleBridge(opts: { endpoint: string; token: string; timeoutMs?: number }, onLog: LogFn): Promise<void> {
  const cmd = await openclawCmdOf();
  const dir = writeBridgePluginFiles();
  onLog(`桥接插件文件已生成：${dir}`);

  // 确保 Gateway 已配置共享令牌：主动外发（sendWechatPersonal）经 /tools/invoke 必须带此令牌。
  // 必须在 gateway restart 之前写入，运行中的网关在启动时才读取令牌。
  try {
    const gwToken = ensureOpenclawGatewayToken();
    onLog(`Gateway 鉴权令牌已就绪（${gwToken.slice(0, 6)}…），用于个人微信主动外发`);
  } catch (e) {
    onLog(`确保 Gateway 令牌失败（主动外发可能 401）：${e instanceof Error ? e.message : e}`);
  }

  const link = await runCapture(`${cmd} plugins install --link "${dir}" --force --accept-capabilities`, [], 120_000);
  onLog((link.stdout || link.stderr || '').trim().slice(-400) || 'plugins install --link 完成');
  if (link.code !== 0 && !/already/i.test(link.stdout + link.stderr)) {
    throw new Error(`桥接插件安装失败：${(link.stderr || link.stdout).slice(-500)}`);
  }

  const cfg = readOpenclawConfig();
  const merged = mergePluginEntry(cfg, BRIDGE_PLUGIN_ID, {
    enabled: true,
    hooks: { allowConversationAccess: true },
    config: {
      endpoint: opts.endpoint,
      token: opts.token,
      timeoutMs: opts.timeoutMs ?? 120_000,
      channelFilter: 'weixin',
    },
  });
  writeOpenclawConfig(merged);
  onLog('openclaw.json 已写入 plugins.entries.yanzhi-bridge');

  const en = await runCapture(`${cmd} plugins enable ${BRIDGE_PLUGIN_ID}`, [], 60_000);
  if (en.code !== 0) onLog(`plugins enable 返回 ${en.code}（可能已启用）：${(en.stderr || en.stdout).slice(-200)}`);

  const rs = await runCapture(`${cmd} gateway restart`, [], 120_000);
  if (rs.code !== 0) {
    // gateway 可能以 service 方式跑；restart 失败不致命，提示手动
    onLog(`gateway restart 返回 ${rs.code}，可手动执行 openclaw gateway restart`);
  } else {
    onLog('Gateway 已重启');
  }
}

/** 启动 Gateway（未运行时兜底拉起，detached 不随言智退出） */
export async function startGateway(onLog: LogFn): Promise<void> {
  const env = await detectOpenclawEnv();
  if (env.gatewayRunning) {
    onLog('Gateway 已在运行');
    return;
  }
  const cmd = await openclawCmdOf();
  const child = spawn(cmd, ['gateway', 'start'], {
    shell: true,
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  onLog('已在后台拉起 openclaw gateway start');
}
