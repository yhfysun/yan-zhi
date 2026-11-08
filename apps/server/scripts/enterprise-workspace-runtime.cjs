'use strict';
/**
 * 节点侧云工作区运行时（Task 2：容器化云工作区）。
 *
 * ★ 为什么单独抽 .cjs：enterprise-node-agent.mjs 是带 main() 自启动的 ESM 脚本，
 *   vitest 无法直接 import；把生命周期逻辑埋进去只能靠 readFileSync 锚点猜分支顺序。
 *   宿主用 createRequire 引入、测试也 require 同一份实现，才能真正验证
 *   「无 Docker 明确失败」「停止移除容器」「目录保留策略」这些行为。
 *
 * ★ 安全默认（见 docs/baizhi-monkeyai-feature-migration-plan 风险表）：
 *   非 root、只读根文件系统、cap-drop ALL、no-new-privileges、默认无网络、
 *   CPU/内存限额、仅挂载该工作区自己的目录。端口预览属于 Task 3，届时再显式开网络。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONTAINER_PREFIX = 'yz-ws-';
const WORKDIR = '/workspace';
const METADATA_FILE = '.yan-zhi-workspace.json';

function defaultRunner(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (r.error) throw new Error(`无法执行 ${bin}: ${r.error.message}`);
  return { status: r.status == null ? 1 : r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

/** 容器名只保留安全字符，避免 workspaceId 被拼进 docker 参数造成注入。 */
function containerName(workspaceId) {
  const safe = String(workspaceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (!safe) throw new Error('缺少 workspaceId，无法生成容器名');
  return `${CONTAINER_PREFIX}${safe}`;
}

/** 唯一模式判定点：带 image 就走容器，绝不静默回退目录。 */
function resolveWorkspaceMode(input) {
  return String((input && input.image) || '').trim() ? 'container' : 'directory';
}

function shouldRemoveDirectory(input) {
  return input && input.keepDir === true ? false : true;
}

function buildDockerRunArgs(input) {
  const workspaceId = String((input && input.workspaceId) || '').trim();
  const image = String((input && input.image) || '').trim();
  if (!workspaceId) throw new Error('容器工作区缺少 workspaceId');
  if (!image) throw new Error('容器工作区缺少 image');
  const hostDir = path.resolve(String((input && input.hostDir) || ''));
  if (!hostDir || hostDir === path.parse(hostDir).root) throw new Error('容器工作区宿主目录无效');

  const publishPorts = Array.isArray(input.publishPorts)
    ? input.publishPorts.map(Number).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535)
    : [];
  const args = [
    'run', '-d',
    '--name', containerName(workspaceId),
    '--label', `yan-zhi.workspace=${workspaceId}`,
    '--workdir', WORKDIR,
    '--mount', `type=bind,source=${hostDir},target=${WORKDIR}`,
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', String(input.user || '1000:1000'),
    // 没有登记端口时完全断网；有端口才开 bridge，且只发布到节点回环地址。
    '--network', String(input.network || (publishPorts.length ? 'bridge' : 'none')),
  ];
  for (const p of publishPorts) args.push('-p', `127.0.0.1:${p}:${p}`);
  const cpu = Number(input.cpu);
  if (Number.isFinite(cpu) && cpu > 0) args.push('--cpus', String(cpu));
  const memoryMb = Number(input.memoryMb);
  if (Number.isFinite(memoryMb) && memoryMb > 0) args.push('--memory', `${Math.floor(memoryMb)}m`);
  const ttl = Number(input.ttlMinutes);
  if (Number.isFinite(ttl) && ttl > 0) args.push('--label', `yan-zhi.ttl-minutes=${Math.floor(ttl)}`);
  args.push(image);
  if (Array.isArray(input.command) && input.command.length) args.push(...input.command.map(String));
  else args.push('sleep', 'infinity');
  return args;
}

/** Docker 探测失败必须给出可行动错误，不允许调用方 fallback 成目录模式。 */
function detectDocker(runner = defaultRunner) {
  let result;
  try {
    result = runner('docker', ['version', '--format', '{{.Server.Version}}']);
  } catch (e) {
    throw new Error(
      '节点未安装 Docker 或 Docker 守护进程不可用（无法执行 docker version）。'
      + '请在节点上安装并启动 Docker 后重试；容器工作区不会回退成目录模式。',
    );
  }
  if (result.status !== 0 || !String(result.stdout || '').trim()) {
    throw new Error(
      '节点未安装 Docker 或 Docker 守护进程不可用（docker version 失败）。'
      + '请在节点上安装并启动 Docker 后重试；容器工作区不会回退成目录模式。',
    );
  }
  return String(result.stdout).trim();
}

function readMetadata(hostDir) {
  try { return JSON.parse(fs.readFileSync(path.join(hostDir, METADATA_FILE), 'utf8')); }
  catch { return {}; }
}

function writeMetadata(hostDir, meta) {
  fs.mkdirSync(hostDir, { recursive: true });
  fs.writeFileSync(path.join(hostDir, METADATA_FILE), JSON.stringify(meta, null, 2));
}

function parseContainerState(output) {
  const text = String(output || '').trim();
  if (!text) return 'missing';
  if (/^Up\b|Up\s+\d|running/i.test(text)) return 'running';
  if (/Exited|Created|Paused|Restarting|Dead/i.test(text)) return 'stopped';
  return 'unknown';
}

/**
 * 创建工作区。container 模式：先探测 Docker → docker run → 成功后才写元数据。
 * 任何一步失败都抛错，绝不留下"看起来是 running 的目录工作区"。
 */
function createWorkspaceOnNode(input, runner = defaultRunner) {
  const workspaceId = String((input && input.workspaceId) || '').trim();
  if (!workspaceId) throw new Error('缺少 workspaceId');
  const hostDir = path.resolve(String(input.hostDir || ''));
  if (!hostDir || hostDir === path.parse(hostDir).root) throw new Error('工作区宿主目录无效');
  const mode = resolveWorkspaceMode(input);
  const common = {
    id: workspaceId,
    name: input.name || '工作区',
    image: input.image || null,
    cpu: input.cpu ?? null,
    memoryMb: input.memoryMb ?? null,
    mode,
    createdAt: Date.now(),
  };

  if (mode === 'directory') {
    writeMetadata(hostDir, { ...common, containerId: null, containerName: null });
    return { mode, path: hostDir, containerId: null, containerName: null, dockerVersion: null, ports: [] };
  }

  const dockerVersion = detectDocker(runner);
  fs.mkdirSync(hostDir, { recursive: true });
  const args = buildDockerRunArgs({ ...input, workspaceId, hostDir });
  const result = runner('docker', args);
  if (result.status !== 0) {
    throw new Error(`Docker 启动容器失败：${String(result.stderr || result.stdout || '').trim().slice(0, 300)}`);
  }
  const containerId = String(result.stdout || '').trim().split(/\s+/).pop();
  if (!containerId) throw new Error('Docker 未返回容器 ID，无法登记容器工作区');
  const name = containerName(workspaceId);
  const ports = Array.isArray(input.publishPorts)
    ? input.publishPorts.map(Number).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535)
    : [];
  writeMetadata(hostDir, { ...common, containerId, containerName: name, ports });
  return { mode, path: hostDir, containerId, containerName: name, dockerVersion, ports };
}

/** 停止并清理：容器一律 rm -f；目录按 keepDir 策略决定保留还是删除。 */
function stopWorkspaceOnNode(input, runner = defaultRunner) {
  const workspaceId = String((input && input.workspaceId) || '').trim();
  if (!workspaceId) throw new Error('缺少 workspaceId');
  const hostDir = path.resolve(String(input.hostDir || ''));
  if (!hostDir || hostDir === path.parse(hostDir).root) throw new Error('工作区宿主目录无效');
  const meta = readMetadata(hostDir);
  const mode = input.mode || meta.mode || (input.containerId || meta.containerId ? 'container' : 'directory');
  const containerId = input.containerId || meta.containerId || null;
  const containerNameValue = input.containerName || meta.containerName || containerName(workspaceId);
  let removedContainer = false;

  if (mode === 'container') {
    const target = containerId || containerNameValue;
    const result = runner('docker', ['rm', '-f', target]);
    const text = String(result.stderr || result.stdout || '');
    // 容器已被外部清理 / 从未创建成功：视为已清理，不把 TTL 巡检卡住。
    if (result.status !== 0 && !/No such container|not found|No such object/i.test(text)) {
      throw new Error(`Docker 移除容器失败：${text.trim().slice(0, 300)}`);
    }
    removedContainer = true;
  }

  const removeDir = shouldRemoveDirectory(input);
  if (removeDir && fs.existsSync(hostDir)) fs.rmSync(hostDir, { recursive: true, force: true });
  return {
    mode,
    path: hostDir,
    removedContainer,
    removedDirectory: removeDir,
  };
}

module.exports = {
  CONTAINER_PREFIX,
  WORKDIR,
  METADATA_FILE,
  containerName,
  resolveWorkspaceMode,
  shouldRemoveDirectory,
  buildDockerRunArgs,
  detectDocker,
  readMetadata,
  parseContainerState,
  createWorkspaceOnNode,
  stopWorkspaceOnNode,
  defaultRunner,
};
