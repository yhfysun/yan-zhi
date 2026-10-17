// ops-shell 内置插件：服务器运维（SSH 命令执行 / 文件传输 / Docker 管理 / 数据库只读查询 / 交互式终端）。
// 形态对齐 computer-use（manifest + 入口模块 + 权限护栏 + 审计），默认启用（仅首次注册生效，之后随 DB 状态）。
// 实现：ssh2（纯 JS，无原生编译）+ Docker over SSH（远程执行 docker CLI，免 dockerode/本地 socket 依赖）
//      + mysql2/pg 直连数据库（只读护栏，单条 SELECT/SHOW/DESC/EXPLAIN/WITH）。
//      + 跳板机 ProxyJump：连接可指定另一条 ssh/docker 连接作跳板，经 forwardOut 隧道穿透，支持多级；
//        数据库连接经本地临时端口转发接入（pg 会对流调 socket 方法，不能直接塞 SSH channel）。
// 智能体挂载：a_builtin_ops_agent（db.ts seedAgents）绑定 plugin_ops-shell__* 工具，
// 对话模式走现有聊天链路；命令模式为 /ops 控制台的 xterm 终端（WebSocket 优先，SSE + POST 回退）。
// 护栏：remote-shell 权限声明 / 危险命令黑名单 / 生产连接写操作二次确认 / 空闲会话回收 / 全量审计（plugin_storage.audit）。
import { getPluginManager } from '@yan-zhi/core';
import type { BuiltInTool, McpCallResult, PluginManifest, PluginModule, PluginWebSocket, PluginWsRequest } from '@yan-zhi/core';
import { Client } from 'ssh2';
import { readdirSync, lstatSync, mkdirSync, renameSync, rmSync, createReadStream } from 'node:fs';
import { createServer, type Server } from 'node:net';
import mysql from 'mysql2/promise';
import pg from 'pg';
import type { ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2';
import { encrypt, decrypt } from '../utils/crypto.js';
import { pushPluginAudit } from '../services/plugin-audit.js';
import { guard, capOutput, isDangerous, isProductionTag } from './ops-shell-guard.js';
import {
  pruneApprovals, capApprovals, takeApproval, hasPending, makeRequest, pendingMessage, rejectedMessage,
  type ApprovalRequest,
} from './ops-approvals.js';
import {
  TermRecorder, MAX_RECORDINGS, parseCast, readRecordingFile, removeRecordingFile, sweepOrphanRecordings,
  type RecordingMeta,
} from './ops-recordings.js';
import {
  hostPortOf, verifyHostKey, outcomeAllows, mismatchMessage, unknownHostMessage,
  type HostKeyRecord, type KnownHostMode, type VerifyOutcome,
} from './ops-known-hosts.js';
import { createLogger } from '../services/logger.js';
const logger = createLogger('ops-shell');

export const OPS_SHELL_ID = 'ops-shell';

export const opsShellManifest: PluginManifest = {
  id: OPS_SHELL_ID,
  name: '运维',
  version: '0.1.0',
  category: '操作',
  description:
    '连接服务器执行命令（SSH）、上传/下载文件、管理 Docker 容器、数据库只读查询；「更多 → 运维」打开运维控制台：按连接类型呈现命令终端 / 容器面板 / SQL 查询 + 对话模式（内置运维助手）。默认开启，可在插件管理页停用。',
  permissions: ['remote-shell', 'shell', 'network'],
  contributes: {
    tools: [
      'ssh_exec',
      'ssh_upload',
      'ssh_download',
      'docker_ps',
      'docker_logs',
      'docker_restart',
      'db_query',
    ],
    // ★ 2026-10-16 去掉 sidebar 贡献：它渲染的「更多 → 运维」分组与顶栏**模式下拉**是同一个
    //   入口（都进 /ops），属重复，用户拍板只保留模式下拉。routes 必须留着 —— 模式仍要靠它拿路由。
    routes: [
      { path: '/ops', name: 'ops', component: 'views/plugin/OpsConsole.vue', meta: { desktopOnly: true } },
    ],
  },
  config: {
    type: 'object',
    properties: {
      execTimeoutMs: { type: 'number', description: 'ssh_exec 默认超时（ms）', default: 30000 },
      idleTimeoutMs: { type: 'number', description: 'SSH 会话空闲回收（ms）', default: 600000 },
      maxAuditEntries: { type: 'number', description: '审计记录上限', default: 500 },
      recordSessions: { type: 'boolean', description: '录制终端会话（asciinema .cast，可在「录像」页回放）', default: true },
      // 同时上传的文件数上限（2026-10-16，用户要求）：上传是先扫描成队列再排队传，
      // 所以要有个"同时在飞几个"的闸门 —— 其余的在队列里候补，传完一个补一个。
      uploadConcurrency: { type: 'number', description: '同时上传的文件数上限（1–32，其余排队候补；默认 10）', default: 10 },
      knownHostMode: { type: 'string', description: '主机密钥校验：tofu=首次记录后必须一致（默认）/ strict=只认已记录的 / off=不校验', default: 'tofu' },
    },
  },
};

// ---------- 连接管理 ----------

/** 连接类型：ssh=服务器终端；docker=Docker 宿主机（over SSH）；database=数据库（只读查询） */
type OpsConnType = 'ssh' | 'docker' | 'database';

interface OpsConnection {
  id: string;
  type: OpsConnType;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  /** password 或 privateKey 的密文（AES-256-GCM，主密钥机器绑定） */
  secretEnc: string;
  /** 连接标签：含"生产/prod"的连接写操作需二次确认 */
  tag?: string;
  /** database 类型专用：mysql / postgres */
  dbType?: 'mysql' | 'postgres';
  /** database 类型专用：默认连接的库名 */
  database?: string;
  /** ssh/docker 类型：进入终端后自动执行的默认命令（如 cd /data/app && ls -al） */
  defaultCommand?: string;
  /** ssh/docker 类型：SFTP 默认目录，上传/下载未指定远程路径时兜底 */
  sftpPath?: string;
  /** 备注说明 */
  note?: string;
  /** 所属目录（分组）id；缺省表示未分组 */
  groupId?: string;
  /**
   * 跳板机（ProxyJump）：经由此连接中转再连目标。
   * 存的是另一条 ssh/docker 连接的 id，链路可多级（跳板机自己也能挂跳板机）。
   * database 连接只能作为目标，不能作为跳板机。
   */
  jumpConnectionId?: string;
  createdAt: number;
}

export interface StoredConnection extends Omit<OpsConnection, 'secretEnc'> {
  secretEnc: string;
}

/** 资源目录（分类分组）：与连接平级，用于左侧树形归类 */
interface OpsGroup {
  id: string;
  name: string;
  createdAt: number;
  /** 父目录 id；为空 = 顶层目录。支持目录嵌套（拖拽形成子目录） */
  parentId?: string;
}

let pluginStorage: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> } | null = null;

export async function loadConnections(): Promise<StoredConnection[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<StoredConnection[]>('connections');
  if (!Array.isArray(rows)) return [];
  // 旧库兼容：type 缺省视为 ssh；dbType 兜底 mysql
  return rows.map((c) => ({
    ...c,
    type: c.type === 'docker' || c.type === 'database' ? c.type : 'ssh',
    dbType: c.dbType === 'postgres' ? 'postgres' : 'mysql',
  }));
}
async function saveConnections(list: StoredConnection[]): Promise<void> {
  if (!pluginStorage) {
    throw new Error('插件存储不可用（plugin_storage 未初始化）——连接无法持久化，请检查插件系统是否正常启用');
  }
  await pluginStorage.set('connections', list);
  // 回读校验：避免存储层静默失败导致"保存成功但列表为空"
  const check = await pluginStorage.get<StoredConnection[]>('connections');
  if (!Array.isArray(check) || check.length !== list.length) {
    throw new Error('连接写入校验失败（plugin_storage 未正确落库）');
  }
}

function toClientView(c: StoredConnection) {
  const { secretEnc, ...rest } = c;
  return rest;
}

// ---------- 资源目录（分类分组） ----------

async function loadGroups(): Promise<OpsGroup[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<OpsGroup[]>('groups');
  if (!Array.isArray(rows)) return [];
  return rows.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string');
}
async function saveGroups(list: OpsGroup[]): Promise<void> {
  if (!pluginStorage) throw new Error('插件存储不可用（plugin_storage 未初始化）——目录无法持久化');
  await pluginStorage.set('groups', list);
  const check = await pluginStorage.get<OpsGroup[]>('groups');
  if (!Array.isArray(check) || check.length !== list.length) {
    throw new Error('目录写入校验失败（plugin_storage 未正确落库）');
  }
}

function isProduction(c: StoredConnection): boolean {
  return isProductionTag(c.tag);
}

// ---------- 连接入参解析（新建 / 编辑 / 表单内测试共用） ----------

interface ConnInput {
  type: OpsConnType;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  secret: string;
  tag?: string;
  dbType?: 'mysql' | 'postgres';
  database?: string;
  defaultCommand?: string;
  sftpPath?: string;
  note?: string;
  groupId?: string;
  /** 跳板机连接 id；jumpProvided 区分「未传该字段」与「显式清空」 */
  jumpConnectionId?: string;
  jumpProvided?: boolean;
}

/** 归一化 HTTP 入参 → 连接字段（不做业务校验，校验见 validateConnInput） */
function parseConnInput(body: Record<string, unknown>): ConnInput {
  const type: OpsConnType = body.type === 'docker' || body.type === 'database' ? body.type : 'ssh';
  const dbType: 'mysql' | 'postgres' = body.dbType === 'postgres' ? 'postgres' : 'mysql';
  const defaultPort = type === 'database' ? (dbType === 'postgres' ? 5432 : 3306) : 22;
  const opt = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s || undefined;
  };
  return {
    type,
    name: String(body.name || '').trim(),
    host: String(body.host || '').trim(),
    port: Number(body.port) > 0 ? Number(body.port) : defaultPort,
    username: String(body.username || '').trim(),
    authType: body.authType === 'key' ? 'key' : 'password',
    secret: String(body.secret || ''),
    tag: opt(body.tag),
    dbType: type === 'database' ? dbType : undefined,
    database: type === 'database' ? opt(body.database) : undefined,
    // defaultCommand / sftpPath 对 ssh / docker 有意义（docker 也走 SSH）
    defaultCommand: opt(body.defaultCommand),
    sftpPath: opt(body.sftpPath),
    note: opt(body.note),
    groupId: opt(body.groupId),
    // 跳板机：空字符串 = 显式清空；字段缺席 = 保持原值（编辑只改端口时不该丢掉跳板）
    jumpProvided: body.jumpConnectionId !== undefined,
    jumpConnectionId: opt(body.jumpConnectionId),
  };
}

/** 必填校验；返回错误文案，通过则返回 null */
function validateConnInput(input: ConnInput, opts: { requireSecret: boolean }): string | null {
  if (!input.name || !input.host || !input.username) return '名称 / 主机 / 用户名 均必填';
  if (opts.requireSecret && !input.secret) return '密码或私钥必填';
  if (input.type === 'database' && !input.database) return '数据库连接必须指定库名（database）';
  return null;
}

/** 构造可入库的连接对象（编辑时保留 id/createdAt） */
function buildConnection(input: ConnInput, base?: StoredConnection): StoredConnection {
  return {
    id: base?.id ?? `ops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: input.type,
    name: input.name,
    host: input.host,
    port: input.port,
    username: input.username,
    authType: input.authType,
    // 编辑时未传新密钥 → 沿用原密文，避免"只改端口却要重填密码"
    secretEnc: input.secret ? encrypt(input.secret) : (base?.secretEnc ?? ''),
    tag: input.tag,
    dbType: input.dbType,
    database: input.database,
    defaultCommand: input.defaultCommand,
    sftpPath: input.sftpPath,
    note: input.note,
    // 编辑时未传 groupId（如只改端口）→ 保留原目录归属，避免被静默清空
    groupId: input.groupId ?? base?.groupId,
    // 显式传了 jumpConnectionId 才改动（空字符串表示清空），否则沿用原跳板
    jumpConnectionId: input.jumpProvided ? input.jumpConnectionId : base?.jumpConnectionId,
    createdAt: base?.createdAt ?? Date.now(),
  };
}

/** SFTP 默认目录兜底：把相对路径拼到 sftpPath 下；已是绝对路径或未配置则原样返回 */
function resolveRemotePath(conn: StoredConnection, remotePath: string): string {
  const p = remotePath.trim();
  if (/^[/~]/.test(p) || !conn.sftpPath) return p;
  return `${conn.sftpPath.replace(/\/+$/, '')}/${p.replace(/^\.\//, '')}`;
}

// ---------- 跳板机（ProxyJump） ----------

/** 跳板链路最大跳数：挡住误配置出的超长链路（建连逐跳变慢） */
export const MAX_JUMP_DEPTH = 5;

/**
 * 解析目标连接背后的完整跳板链路，返回「由外到内」排序的跳板连接（最外层最先建连）。
 * 链路非法时抛错：跳板不存在 / 指向数据库连接 / 自引用 / 成环 / 超过 MAX_JUMP_DEPTH。
 */
export function buildJumpChain(target: StoredConnection, all: StoredConnection[]): StoredConnection[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const seen = new Set<string>([target.id]);
  const chain: StoredConnection[] = [];
  let cursor = target.jumpConnectionId;
  while (cursor) {
    if (seen.has(cursor)) throw new Error(`跳板链路成环：连接「${target.name}」的跳板链绕回了自身`);
    seen.add(cursor);
    const hop = byId.get(cursor);
    if (!hop) throw new Error(`跳板机连接不存在（id=${cursor}），请重新指定`);
    if (hop.type === 'database') throw new Error(`连接「${hop.name}」是数据库连接，不能作为跳板机`);
    if (chain.length >= MAX_JUMP_DEPTH) throw new Error(`跳板链路超过 ${MAX_JUMP_DEPTH} 跳，请精简后再试`);
    chain.unshift(hop);
    cursor = hop.jumpConnectionId;
  }
  return chain;
}

/** 只校验不建连：保存连接 / 表单提交用。返回错误文案，通过则 null。target 为空表示新建场景 */
export function validateJumpRef(target: StoredConnection | undefined, jumpId: string | undefined, all: StoredConnection[]): string | null {
  if (!jumpId) return null;
  if (target && jumpId === target.id) return '跳板机不能是连接自身';
  const hop = all.find((c) => c.id === jumpId);
  if (!hop) return '跳板机连接不存在';
  if (hop.type === 'database') return `「${hop.name}」是数据库连接，不能作为跳板机`;
  // 假装目标已挂上该跳板再跑一遍解析，以检出成环 / 超深
  const hypothetical: StoredConnection = target
    ? { ...target, jumpConnectionId: jumpId }
    : { ...hop, id: '__pending__', name: '__pending__', jumpConnectionId: jumpId };
  try {
    buildJumpChain(hypothetical, all);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

// ---------- SSH 连接池 ----------

interface PoolEntry {
  client: Client;
  lastUsed: number;
  /** 被下游隧道占用的引用数：>0 时跳过空闲回收（掐掉会连带掐断下游连接） */
  refs: number;
}
const sshPool = new Map<string, PoolEntry>();
const IDLE_TIMEOUT_MS = 600000;

/**
 * 建立一条 SSH 连接；传了 sock 表示这条连接是从跳板机隧道里穿出去的。
 *
 * ★ 主机密钥校验在这里接（2026-10-16）：跳板机与目标各自走一次本函数，
 *   所以**每一跳都独立校验** —— 只验最终目标而放过跳板机，等于把信任根留了个洞。
 */
async function connectClient(conn: StoredConnection, sock?: ClientChannel): Promise<Client> {
  const hostPort = hostPortOf(conn.host, conn.port);
  // 校验结论在握手期间产生，而错误要到之后才抛出 —— 用 holder 把细节带出回调
  const hk: { mismatch: Extract<VerifyOutcome, { status: 'changed' }> | null; unknown: Buffer | null } = {
    mismatch: null, unknown: null,
  };
  const knownHosts = hostKeyMode === 'off' ? [] : await loadKnownHosts();
  const known = knownHosts.find((k) => k.host === hostPort);

  return new Promise((resolve, reject) => {
    const client = new Client();
    const cfg: ConnectConfig = {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      readyTimeout: 15000,
      keepaliveInterval: 30000,
    };
    if (sock) cfg.sock = sock;
    if (hostKeyMode !== 'off') {
      cfg.hostVerifier = (key: Buffer, verify: (ok: boolean) => void) => {
        const outcome = verifyHostKey(known, hostPort, key, hostKeyMode);
        if (outcome.status === 'new') void rememberHostKey(conn.name, outcome.record);
        else if (outcome.status === 'changed') hk.mismatch = outcome;
        else if (outcome.status === 'skipped' && hostKeyMode === 'strict') hk.unknown = key;
        verify(outcomeAllows(outcome, hostKeyMode));
      };
    }
    try {
      if (conn.authType === 'key') cfg.privateKey = Buffer.from(decrypt(conn.secretEnc), 'utf8');
      else cfg.password = decrypt(conn.secretEnc);
    } catch (e) {
      reject(new Error(`凭据解密失败：${(e as Error).message}`));
      return;
    }
    client
      .on('ready', () => resolve(client))
      .on('error', (err: Error) => {
        // 密钥问题要给可行动的报错，而不是 ssh2 那句「Host verification failed」
        if (hk.mismatch) {
          void audit('hostkey.mismatch', { connection: conn.name, detail: `${hostPort} ${hk.mismatch.actual}`, ok: false });
          reject(new Error(mismatchMessage(hostPort, hk.mismatch)));
        } else if (hk.unknown) {
          reject(new Error(unknownHostMessage(hostPort, hk.unknown)));
        } else {
          reject(new Error(`SSH 连接失败: ${err.message}`));
        }
      })
      .connect(cfg);
  });
}

/** 在已建立的连接上开一条到 targetHost:targetPort 的直通通道（跳板机隧道） */
function openTunnel(from: Client, targetHost: string, targetPort: number): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    from.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
      if (err) reject(new Error(`跳板机隧道建立失败: ${err.message}`));
      else resolve(stream);
    });
  });
}

/**
 * 一次性本地端口转发：在 127.0.0.1 上随机监听，把进来的 TCP 连接逐条引到远端 host:port。
 * 给「不能用自定义 stream 的客户端」用（pg 会对流调 setNoDelay/connect，塞 ssh2 channel 会崩），
 * 所以让这类客户端照常连本地端口，由这里换成经跳板的 channel。用完调 close()。
 * （导出仅为单测直接驱动，生产调用点只有 dbExec）
 */
export function openEphemeralTunnel(from: Client, targetHost: string, targetPort: number): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const channels = new Set<ClientChannel>();
    const server: Server = createServer((socket) => {
      from.forwardOut(socket.remoteAddress || '127.0.0.1', socket.remotePort || 0, targetHost, targetPort, (err, channel) => {
        if (err) { socket.destroy(); return; }
        channels.add(channel);
        socket.pipe(channel).pipe(socket);
        const drop = () => { channels.delete(channel); };
        channel.once('close', () => { drop(); socket.destroy(); });
        channel.once('error', drop);
        socket.once('error', () => { try { channel.close(); } catch { /* ignore */ } });
        socket.once('close', () => { drop(); try { channel.close(); } catch { /* ignore */ } });
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('本地隧道端口分配失败')); return; }
      resolve({
        port: addr.port,
        close: () => {
          for (const ch of channels) { try { ch.close(); } catch { /* ignore */ } }
          channels.clear();
          try { server.close(); } catch { /* ignore */ }
        },
      });
    });
  });
}

export async function getSsh(conn: StoredConnection): Promise<Client> {
  const cached = sshPool.get(conn.id);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  const jumpId = conn.jumpConnectionId;
  let jumpClient: Client | undefined;
  let tunnel: ClientChannel | undefined;
  if (jumpId) {
    const all = await loadConnections();
    const hop = all.find((c) => c.id === jumpId);
    if (!hop) throw new Error(`跳板机连接不存在（id=${jumpId}），请检查该连接的跳板设置`);
    // 递归：跳板机自己也可能挂在更外层跳板后面
    jumpClient = await getSsh(hop);
    tunnel = await openTunnel(jumpClient, conn.host, conn.port || 22);
  }
  let client: Client;
  try {
    client = await connectClient(conn, tunnel);
  } catch (e) {
    try { tunnel?.end(); } catch { /* ignore */ }
    throw e;
  }
  sshPool.set(conn.id, { client, lastUsed: Date.now(), refs: 0 });
  if (jumpClient && jumpId) {
    const entry = sshPool.get(jumpId);
    if (entry) { entry.refs += 1; entry.lastUsed = Date.now(); }
  }
  // close 与 error 都可能触发，用幂等释放避免引用计数被扣两次
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    // 只在池里仍是「这一条」时才摘除：断开重连期间可能已有新连接顶替，别被旧连接的 close 误删
    if (sshPool.get(conn.id)?.client === client) sshPool.delete(conn.id);
    if (jumpClient && jumpId) {
      const entry = sshPool.get(jumpId);
      if (entry && entry.refs > 0) entry.refs -= 1;
    }
  };
  client.once('close', release);
  client.once('error', release);
  return client;
}

function disconnect(connId: string): void {
  const e = sshPool.get(connId);
  if (e) {
    try { e.client.end(); } catch {}
    sshPool.delete(connId);
  }
}

/** 断开所有以 connId 为跳板的下游连接（含更深层级）；改跳板 / 删连接时调用 */
function disconnectDependents(connId: string, list: StoredConnection[], seen = new Set<string>()): void {
  if (seen.has(connId)) return;
  seen.add(connId);
  for (const c of list) {
    if (c.jumpConnectionId === connId) {
      disconnect(c.id);
      disconnectDependents(c.id, list, seen);
    }
  }
}

/** 一次性 SSH 连接（不入连接池）：表单内「测试连接」用，测完调 cleanup 断开整条链路 */
async function sshProbe(conn: StoredConnection, all?: StoredConnection[]): Promise<{ client: Client; cleanup: () => void }> {
  const jumpId = conn.jumpConnectionId;
  if (!jumpId) {
    const client = await connectClient(conn);
    return { client, cleanup: () => { try { client.end(); } catch { /* ignore */ } } };
  }
  const list = all ?? (await loadConnections());
  const hop = list.find((c) => c.id === jumpId);
  if (!hop) throw new Error(`跳板机连接不存在（id=${jumpId}）`);
  const upstream = await sshProbe(hop, list);
  let tunnel: ClientChannel | undefined;
  try {
    tunnel = await openTunnel(upstream.client, conn.host, conn.port || 22);
    const client = await connectClient(conn, tunnel);
    return {
      client,
      cleanup: () => {
        try { client.end(); } catch { /* ignore */ }
        try { tunnel?.end(); } catch { /* ignore */ }
        upstream.cleanup();
      },
    };
  } catch (e) {
    try { tunnel?.end(); } catch { /* ignore */ }
    upstream.cleanup();
    throw e;
  }
}

// ---------- SFTP 文件管理 ----------

/** 远程路径规范化：绝对化 + 消除 `..` 穿越，返回规范后的绝对路径 */
function normalizeRemotePath(input: string, fallback: string): string {
  let p = (input || '').trim();
  if (!p) p = '/';
  if (!p.startsWith('/')) p = '/' + p; // 相对 → 根下绝对
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      parts.pop(); // 消除穿越（超过根级则不越界）
    } else {
      parts.push(seg);
    }
  }
  const normalized = '/' + parts.join('/');
  return (normalized === '' ? fallback : normalized);
}

function joinRemotePath(base: string, name: string): string {
  return `${base.replace(/\/+$/, '')}/${name}`;
}

export function getSftp(conn: StoredConnection): Promise<SFTPWrapper> {
  return getSsh(conn).then(
    (client) =>
      new Promise<SFTPWrapper>((resolve, reject) =>
        client.sftp((err, s) => (err ? reject(err) : resolve(s!))),
      ),
  );
}

/** 解析文件 mode → 是否为目录 / 符号链接 */
function modeIsDir(mode: number): boolean {
  return ((mode >> 12) & 0xf) === 0x4; // S_IFDIR = 0o40000
}
function modeIsLink(mode: number): boolean {
  return ((mode >> 12) & 0xf) === 0xa; // S_IFLNK = 0o120000
}
function modeIsFile(mode: number): boolean {
  return !modeIsDir(mode) && !modeIsLink(mode);
}

interface SftpEntry {
  name: string;
  type: 'file' | 'dir' | 'link';
  size: number;
  mtime: number;
  mode: number;
}

async function listRemoteDir(sftp: SFTPWrapper, path: string): Promise<SftpEntry[]> {
  const entries = await new Promise<Array<{ filename: string; attrs: { mode: number; size: number; mtime: number } }>>(
    (resolve, reject) =>
      sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list as never))),
  );
  return entries
    .filter((e) => e.filename !== '.' && e.filename !== '..')
    .map((e): SftpEntry => ({
      name: e.filename,
      type: (modeIsDir(e.attrs.mode) ? 'dir' : modeIsLink(e.attrs.mode) ? 'link' : 'file') as SftpEntry['type'],
      size: e.attrs.size ?? 0,
      mtime: (e.attrs.mtime ?? 0) * 1000,
      mode: e.attrs.mode ?? 0,
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

/**
 * 解析 SFTP 起始目录（远程「用户目录」）。
 * sftpPath 未配置时用 realpath('.') 取登录用户 home：直接列 `/` 往往既没内容又可能无权限，
 * 在界面上表现为「文件列表什么都没有」。取不到 home 时回退 `/`。
 */
export async function resolveRemoteRoot(sftp: SFTPWrapper, configured?: string): Promise<string> {
  const cfg = (configured || '').trim();
  if (cfg) return normalizeRemotePath(cfg, '/');
  try {
    const home = await new Promise<string>((resolve, reject) =>
      sftp.realpath('.', (err, p) => (err ? reject(err) : resolve(p))),
    );
    if (!home) return '/';
    return normalizeRemotePath(home, '/');
  } catch {
    return '/';
  }
}

/** 本地目录递归创建（下载落盘前保证父目录存在） */
export function ensureLocalDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch { /* 已存在或不可写，交给后续写入报错 */ }
}

/** 备份文件名：<原名>.bak-YYYYMMDD-HHmmss（同目录同名同时刻只会有一份，够用且好识别） */
export function backupRemoteName(path: string, at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  return `${path.replace(/\/+$/, '')}.bak-${ts}`;
}

/**
 * 远程文件复制（备份用）。走 SFTP 读写流，**不依赖** OpenSSH 的 ext_openssh_copy 扩展
 * —— 不少服务器的 sftp-server 没开该扩展，直接调用会报不支持。
 */
export function copyRemoteFile(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };
    const rs = sftp.createReadStream(from);
    const ws = sftp.createWriteStream(to);
    rs.on('error', fail);
    ws.on('error', fail);
    ws.on('close', () => { if (!settled) { settled = true; resolve(); } });
    rs.pipe(ws);
  });
}

/**
 * 递归删除远程路径：文件直接 unlink；目录先深度遍历删子项、再 rmdir。
 *
 * ★ 原来这里只调 rmdir —— **非空目录必失败**，而界面上那个「删除」对目录也是显示的，
 *   用户点了只会拿到一句「目录可能非空」。现在按用户要求：目录连同内容一起删。
 *
 * 加条目上限是有意的：递归是逐条 RTT，几万条的目录会把这条连接占很久。
 * 那种规模更适合走 ssh_exec 的 `rm -rf`（那条路有危险命令黑名单 + 人工批准兜底）。
 */
/**
 * SFTP 任务记录 —— 上传 / 下载 / 删除**共用一份**形状（2026-10-16 引入）。
 *
 * 为什么统一：用户要的是「任务列表」，三种操作在界面上是同一种东西（一条带着
 * 进度、状态、名字的行），后端再分三种 payload 只会让前端写三套解析。
 *
 * 为什么不用旧的 `{ transferred, total }`：那两个字节数表达不了「删了多少个条目」，
 * 也没法说「正在处理哪个文件」—— 而用户明确要「删目录时实时看到删了哪些文件」。
 * 故改为条目口径（doneCount/totalCount）+ 当前项 + 删除明细列表；字节口径保留给
 * 上传/下载画进度条。
 */
export interface SftpJob {
  kind: 'upload' | 'download' | 'delete';
  /** 人类可读的任务名（界面上那一行） */
  label: string;
  state: 'running' | 'done' | 'failed';
  /** 字节口径（上传/下载用；删除任务恒为 0/1，表示"按条目数看进度"） */
  transferred: number;
  total: number;
  /** 条目口径：已处理 / 总数（三种任务都有） */
  doneCount: number;
  totalCount: number;
  /** 正在处理的条目路径（上传/下载），删除任务为空（它有 deleted 明细） */
  currentFile: string;
  /**
   * **正在传输的文件**（上传任务；有界并发下最多 uploadConcurrency 个）。
   * ★ 为什么不能只有 currentFile：上传是"扫描成队列 → 并发窗口里传"，
   *   界面既要显示"正在传哪几个"，也要按 activeFiles.length 算出"待执行从队列第几个开始"。
   */
  activeFiles: string[];
  /**
   * 上传任务是否被用户暂停（2026-10-16，用户要求「顶多加个暂停任务按钮」）。
   * ★ 暂停会**连正在传的文件一起停**（并记下断点，恢复时从断点续传，见 sftpUploadRange），
   *   不只是"不再领新文件" —— 用户要的就是"点了暂停，正在执行的和待执行的都停下"。
   * ★ 下载/删除恒为 false：那两类是"一条路走到黑"的连续动作，中途没有安全点
   *   （删除停在一半，远端留下的是删了半棵的目录树，比删完或没删都难收拾）。
   * ⚠️ 暂停期间任务保持 running（SSE 流不关，界面才看得到「已暂停」），
   *   也就是说它会一直占着那条 SFTP 连接，直到用户点继续。
   */
  paused: boolean;
  /**
   * 上传任务：扫描出来的待传目标路径（2026-10-17 新增）。
   * ★ 只用于**任务落库留痕**，不进 SSE 帧 —— 几千条路径会把每一帧都撑爆，
   *   而界面上的待执行清单本来就是拿 `/sftp/upload` 响应里的 plan 渲染的。
   */
  plan?: string[];
  /** 上传任务：待传文件**总数**（plan 可能被截断，落库时靠它对出"还有多少没记"） */
  planTotal?: number;
  /** 删除任务：累计已删条目数（不受保留上限影响） */
  deletedCount: number;
  /** 删除任务：最近删掉的路径（保留上限见 MAX_JOB_DELETED_KEEP） */
  deleted: string[];
  error?: string;
}

/**
 * 「已删路径」在任务里保留的条数上限。
 * 递归删十万个文件的目录时，全留会把内存和前端 DOM 一起撑爆；界面是「实时滚动看」，
 * 只需要最近这些。全量留痕由审计（sftp.delete，含条数与路径样本）负责。
 */
export const MAX_JOB_DELETED_KEEP = 500;

/**
 * 上传任务回给前端的「待传清单」条数上限（2026-10-16）。
 * 界面要按「已传 / 正在传 / 待传」三段展示队列，所以**扫描结果必须先回给前端**；
 * 但几万个文件时没必要把整张清单塞进响应体 —— 截断后 count/total 仍是全量口径，
 * 界面显示「…等 N 项」即可。
 */
export const MAX_UPLOAD_PLAN_ITEMS = 2000;

/**
 * 审计详情里的「已删路径样本」后缀：最多 12 条、总长 400 字符，其余以「共 N 项」收尾。
 * 审计是长期留痕（上限 500 条），不能因为一次删了十万个文件就往里塞一个几十 KB 的字符串 ——
 * 那是把审计表撑爆、而不是留痕。全量明细在删除进行时由任务列表实时展示。
 */
export function auditPathTail(paths: string[]): string {
  if (!paths.length) return '';
  const shown: string[] = [];
  let len = 0;
  for (const p of paths) {
    if (shown.length >= 12 || len + p.length > 400) break;
    shown.push(p);
    len += p.length + 2;
  }
  const rest = paths.length - shown.length;
  return `：${shown.join('、')}${rest > 0 ? ` …（共 ${paths.length} 项）` : ''}`;
}

/** SSE 每帧的负载：任务记录原样外，删除明细只推最近 50 条（前端实时看，不需要全量）。 */
function jobPayload(j: SftpJob): Record<string, unknown> {
  return {
    kind: j.kind,
    label: j.label,
    state: j.state,
    transferred: j.transferred,
    total: j.total,
    doneCount: j.doneCount,
    totalCount: j.totalCount,
    currentFile: j.currentFile,
    activeFiles: j.activeFiles,
    activeCount: j.activeFiles.length,
    paused: j.paused,
    deletedCount: j.deletedCount,
    deleted: j.deleted.slice(-50),
    error: j.error,
  };
}

/**
 * **已完成任务的历史记录**（2026-10-17，用户要求「已完成任务的明细也要能展示，这些数据都要入库」）。
 *
 * 为什么必须落库：内存里的 `sftpJobs` 在终态后 3 秒就回收，界面那份也是组件内状态 ——
 * 刷新一下、切个连接，"刚才删了哪些文件"就没了。而删除是不可撤销的操作，事后必须能翻账。
 *
 * 与审计（`sftp.delete` 等）的分工：审计是**合规留痕**（长期、精简、只留 12 条路径样本）；
 * 这里是**任务明细**（短期、可展开、带上每个文件），直接供界面「已执行完成」页消费。
 */
export interface SftpJobRecord {
  id: string;
  kind: 'upload' | 'download' | 'delete';
  label: string;
  state: 'done' | 'failed';
  /** 结束时间（epoch 毫秒） */
  at: number;
  totalCount: number;
  doneCount: number;
  /** 字节口径（删除任务恒为 1，没有意义） */
  totalBytes: number;
  error?: string;
  /** 删除任务：累计删了多少项（detail 只留最近 MAX_HISTORY_DETAIL 条） */
  deletedCount?: number;
  /** 明细：删除 = 删掉的路径；上传 = 传上去的目标路径 */
  detail: string[];
  /** detail 是否被截断（真总数看 totalCount / deletedCount） */
  detailTruncated: boolean;
}

/** 历史记录总条数上限：再多就靠滚动，别把插件 KV 撑成一本账 */
export const MAX_JOB_HISTORY = 60;
/** 单条记录里保留的明细条数上限（删十万个文件不能存十万行 JSON） */
export const MAX_HISTORY_DETAIL = 100;

async function loadJobHistory(): Promise<SftpJobRecord[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<SftpJobRecord[]>('sftp-job-history');
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === 'string') : [];
}

/**
 * 追加一条历史（读-改-写）。
 * ★ 必须串行：两个任务同时收尾时，各读一份旧数组再各自写回会丢掉一条。
 */
let jobHistoryChain: Promise<void> = Promise.resolve();
function pushJobHistory(rec: SftpJobRecord): Promise<void> {
  jobHistoryChain = jobHistoryChain
    .then(async () => {
      if (!pluginStorage) return;
      const rows = await loadJobHistory();
      await pluginStorage.set('sftp-job-history', [...rows, rec].slice(-MAX_JOB_HISTORY));
    })
    // 落库失败不该把任务本身带崩：任务已经跑完，留痕是附加价值
    .catch(() => { /* ignore */ });
  return jobHistoryChain;
}

/** 清空历史（用户要求：清除已完成要**连库一起清**）。
 *  ★ 走同一条串行链：否则正在收尾的任务会把刚清空的表又写回一条。 */
export function clearJobHistory(): Promise<void> {
  jobHistoryChain = jobHistoryChain
    .then(async () => {
      if (!pluginStorage) return;
      await pluginStorage.set('sftp-job-history', []);
    })
    .catch(() => { /* ignore */ });
  return jobHistoryChain;
}

/** 删掉一条历史；返回是否真删到了（没删到 = 已被清空或本来就没有） */
export function deleteJobHistory(id: string): Promise<boolean> {
  let removed = false;
  jobHistoryChain = jobHistoryChain
    .then(async () => {
      if (!pluginStorage) return;
      const rows = await loadJobHistory();
      const next = rows.filter((x) => x.id !== id);
      removed = next.length !== rows.length;
      if (removed) await pluginStorage.set('sftp-job-history', next);
    })
    .catch(() => { /* ignore */ });
  return jobHistoryChain.then(() => removed);
}

export const MAX_RECURSIVE_DELETE_ENTRIES = 20000;
/**
 * 递归删除远程路径：文件直接 unlink；目录先深度遍历删子项、再 rmdir。
 *
 * ★ 原来这里只调 rmdir —— **非空目录必失败**，而界面上那个「删除」对目录也是显示的，
 *   用户点了只会拿到一句「目录可能非空」。现在按用户要求：目录连同内容一起删。
 *
 * 加条目上限是有意的：递归是逐条 RTT，几万条的目录会把这条连接占很久。
 * 那种规模更适合走 ssh_exec 的 `rm -rf`（那条路有危险命令黑名单 + 人工批准兜底）。
 *
 * ★ 2026-10-16 新增 `onDeleted`（用户要求「删目录时要能实时看到正在删哪些文件」）：
 *   每删掉**一个条目**（文件 / 软链 / 子目录，按实际删除顺序、深度优先）回调一次。
 *   回调只做记账，不允许抛错或 await（抛了会中断整棵树的删除）。
 */
export async function removeRemoteRecursive(
  sftp: SFTPWrapper,
  target: string,
  budget = { n: 0 },
  onDeleted?: (path: string, isDir: boolean) => void,
): Promise<void> {
  budget.n += 1;
  if (budget.n > MAX_RECURSIVE_DELETE_ENTRIES) {
    throw new Error(
      `目录内条目超过 ${MAX_RECURSIVE_DELETE_ENTRIES} 个，已中止以免长时间占用连接；`
      + '请改用 ssh_exec 的 rm -rf（有危险命令护栏与人工批准）',
    );
  }
  // ★ 用 lstat 不跟随软链：断链不再报 "No such file"，指向目录的软链也只删链接本身（见 lstatRemote 注释）
  const st = await lstatRemote(sftp, target);
  if (!st.isDir) {
    await new Promise<void>((resolve, reject) => sftp.unlink(target, (err) => (err ? reject(err) : resolve())));
    onDeleted?.(target, false);
    return;
  }
  const names = await new Promise<string[]>((resolve, reject) => {
    sftp.readdir(target, (err, list) => (err ? reject(err) : resolve((list || []).map((x) => x.filename))));
  });
  for (const n of names) {
    if (n === '.' || n === '..') continue;
    await removeRemoteRecursive(sftp, `${target.replace(/\/+$/, '')}/${n}`, budget, onDeleted);
  }
  await new Promise<void>((resolve, reject) => sftp.rmdir(target, (err) => (err ? reject(err) : resolve())));
  onDeleted?.(target, true);
}

export async function statRemote(sftp: SFTPWrapper, path: string): Promise<{ mode: number; size: number; mtime: number; isDir: boolean }> {
  const st = await new Promise<{ mode: number; size: number; mtime: number }>((resolve, reject) =>
    sftp.stat(path, (err, s) => (err ? reject(err) : resolve(s as never))),
  );
  return { mode: st.mode, size: st.size ?? 0, mtime: (st.mtime ?? 0) * 1000, isDir: modeIsDir(st.mode) };
}

/**
 * 取**链接自身**的属性（lstat，不跟随软链）。
 *
 * ★★ 2026-10-16 修（用户实报「删除失败: No such file」）：删除路径此前用 `statRemote`（= sftp.stat，
 *   **跟随**软链），两个后果 —— 一个报错、一个更危险：
 *     ① 目录里的**断链**（目标已删的软链）：stat 直接 ENOENT ⇒ 界面上删除永远失败；
 *     ② 指向**目录**的软链被判成 dir ⇒ 递归下去把**目标目录的内容全删掉**，最后再用 rmdir
 *        收一个软链（rmdir 对软链必失败）—— 一次「删软链」等于删掉别人的真数据，还报错说没删成。
 *   列表侧（listRemoteDir）本就按 readdir 的 mode 判类型、不跟随；删除侧至此与它同口径：
 *   软链要删的就是**链接本身**，绝不穿透。
 */
export async function lstatRemote(sftp: SFTPWrapper, path: string): Promise<{ mode: number; size: number; mtime: number; isDir: boolean }> {
  const st = await new Promise<{ mode: number; size: number; mtime: number }>((resolve, reject) =>
    sftp.lstat(path, (err, s) => (err ? reject(err) : resolve(s as never))),
  );
  return { mode: st.mode, size: st.size ?? 0, mtime: (st.mtime ?? 0) * 1000, isDir: modeIsDir(st.mode) };
}

/** fastPut 封装：带 step 进度回调（transferred 为已传字节，total 为文件总大小） */
export function sftpFastPut(sftp: SFTPWrapper, localPath: string, remotePath: string, onStep: (transferred: number, total: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    sftp.fastPut(localPath, remotePath, { step: (transferred, _chunk, total) => onStep(transferred, total) }, (err) => (err ? reject(err) : resolve())),
  );
}

/**
 * 可中断、可续传的单文件上传（2026-10-16，用户要求：暂停要能停住**正在传的**那一个，
 * 恢复后从断点接着传，而不是整文件重来）。
 *
 * ★ 为什么不能用 sftp.fastPut：它是一次性黑盒 —— 没有"停"这个操作（暂停只能等它传完），
 *   也没有"从第 N 字节开始"（续传只能重头来）。要这两样只能自己拼
 *   本地 createReadStream + sftp.createWriteStream。
 * ★ 断点由**调用方**决定传进来（offset）：只有"本次任务已经动过"的目标文件才允许续传，
 *   免得把远端一个不相干的同名文件当成自己的半成品接着写。见上传任务里的 started 集合。
 * ★ 中断语义：`shouldAbort()` 变真时销毁两条流并 resolve `{ cancelled: true }`，
 *   **不当错误抛** —— 暂停不是失败。落盘了多少要看调用方重新 stat 远端，不能信这里的计数：
 *   被中断时写流里可能还有没落盘的缓冲，按内存计数续传会在文件中间留一个洞。
 * ⚠️ 前置条件：`offset > 0` 时**远端必须已经有这 offset 个字节**（续传用 `r+` 打开，不会 CREAT）。
 *   上传任务那边靠"每次尝试前先 stat 远端"来保证（stat 失败就把 offset 归零、按新文件重传）。
 *   谁要直接调这个函数，得自己把这条守住 —— 否则会拿到一个 NO_SUCH_FILE。
 */
export function sftpUploadRange(
  sftp: SFTPWrapper,
  localPath: string,
  remotePath: string,
  offset: number,
  onStep: (written: number) => void,
  shouldAbort: () => boolean,
): Promise<{ written: number; cancelled: boolean }> {
  return new Promise<{ written: number; cancelled: boolean }>((resolve, reject) => {
    let size: number;
    try { size = lstatSync(localPath).size; } catch (e) { reject(e as Error); return; }
    // ★ `offset > 0` 这个前置条件是必需的：0 字节的本地文件也该在远端建出来，
    //   少了它，"空文件"会因为 offset(0) >= size(0) 直接走捷径，远端永远多不出这个文件。
    if (offset > 0 && offset >= size) { onStep(size); resolve({ written: size, cancelled: false }); return; }

    const rs = createReadStream(localPath, { start: offset });
    // offset>0 说明远端已经有我们自己写进去的那一截 —— 用 r+ 定位续写；否则一律 w（截断重来）
    const ws = sftp.createWriteStream(remotePath, { flags: offset > 0 ? 'r+' : 'w', start: offset, autoClose: true });
    let read = offset;
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      try { rs.destroy(); } catch { /* ignore */ }
      try { ws.destroy(); } catch { /* ignore */ }
      fn();
    };
    // ★ pipe 必须挂完监听**之前**接上：先加 'data' 监听会把读流切进 flowing 态，
    //   在 pipe 接上之前到达的数据块会被直接丢掉（文件开头凭空少一截）。
    rs.pipe(ws);
    rs.on('data', (chunk: Buffer) => {
      read += chunk.length;
      onStep(read);
      if (shouldAbort()) settle(() => resolve({ written: read, cancelled: true }));
    });
    rs.on('error', (e: Error) => settle(() => reject(e)));
    ws.on('error', (e: Error) => settle(() => reject(e)));
    // 写流正常关闭 = 全部数据已落盘。被我们主动销毁时 settled 已为真，不会重复 resolve。
    ws.on('close', () => settle(() => resolve({ written: read, cancelled: false })));
  });
}

/** fastGet 封装：带 step 进度回调 */function sftpFastGet(sftp: SFTPWrapper, remotePath: string, localPath: string, onStep: (transferred: number, total: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    sftp.fastGet(remotePath, localPath, { step: (transferred, _chunk, total) => onStep(transferred, total) }, (err) => (err ? reject(err) : resolve())),
  );
}

/** 逐级创建远程目录（ssh2 mkdir 不支持 recursive），忽略已存在 */
export async function ensureRemoteDir(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  const segs = dirPath.split('/').filter(Boolean);
  let cur = '';
  for (const seg of segs) {
    cur += '/' + seg;
    await new Promise<void>((resolve) => {
      sftp.mkdir(cur, () => resolve()); // 已存在会报错，忽略之
    });
  }
}

/**
 * 递归收集本地目录下所有文件。
 * @param dirAbs    目录绝对路径
 * @param relPrefix 追加到每个结果 rel 前的前缀（用于上传时保留目录结构）
 * @returns [{ abs: 文件绝对路径, rel: 相对路径（含 relPrefix） }]
 */
export function collectLocalFiles(dirAbs: string, relPrefix = ''): Array<{ abs: string; rel: string }> {
  const base = dirAbs.replace(/\\/g, '/').replace(/\/+$/, '');
  const list: Array<{ abs: string; rel: string }> = [];
  for (const name of readdirSync(base)) {
    const childAbs = `${base}/${name}`;
    const childRel = relPrefix ? `${relPrefix}/${name}` : name;
    const st = lstatSync(childAbs);
    if (st.isDirectory()) {
      list.push(...collectLocalFiles(childAbs, childRel));
    } else if (st.isFile()) {
      list.push({ abs: childAbs, rel: childRel });
    }
  }
  return list;
}

/** 本地路径 basename（同时兼容 Windows 反斜杠） */
function basenameLocal(p: string): string {
  const t = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return t.split('/').pop() || t;
}

/** 本地文件大小，读取失败按 0 计（不影响传输，只影响进度基数） */
function safeFileSize(p: string): number {
  try { return lstatSync(p).size; } catch { return 0; }
}

/**
 * 有界并发跑一批任务：**最多 limit 个在飞**，其余排队候补（谁先完成谁领下一个）。
 *
 * ★ 为什么单独抽出来：这是"上传先扫描成队列、再按并发窗口排队传"的核心调度 ——
 *   用户明确要求「1000 个大文件不能同时上传，要有上限，其它的在待上传里，上传成功了就候补」。
 *   抽成纯函数就能用单测直接钉住三条契约：在飞数永不超过上限、每个条目恰好跑一次、
 *   出错后不再领新活并把第一个错误抛出去。
 *
 * ★ 出错语义：单个条目失败就**不再领新活**（在飞的让它跑完，避免"任务已标失败、后台还在传"），
 *   全部收尾后抛出第一个错误 —— 调用方据此把任务标成 failed。
 *   （不直接用 Promise.all：那样会留下仍在跑的 worker，任务状态就对不上了。）
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  opts: { beforeTake?: () => Promise<void> } = {},
): Promise<void> {
  const total = items.length;
  if (!total) return;
  // 收进 [1, total]：limit 传 0/负数/NaN 时按 1 串行跑，绝不出现"零个 worker 什么都不做"
  const workers = Math.max(1, Math.min(Math.floor(Number(limit)) || 1, total));
  let next = 0;
  let firstError: unknown = null;
  const run = async (): Promise<void> => {
    while (!firstError) {
      // ★ 顺序有讲究：先判"还有没有活"，再等闸门。
      //   反过来（先等闸门再判）会让暂停时空闲 worker 一起挂在闸门上 ——
      //   队列已经领完、只剩在飞的几个时，暂停一下就再也收不了尾了。
      if (next >= total) return;
      if (opts.beforeTake) {
        await opts.beforeTake();
        if (firstError) return;
      }
      const i = next++;
      if (i >= total) return;   // 等闸门期间可能已被别的 worker 领走
      try {
        await worker(items[i], i);
      } catch (e) {
        if (!firstError) firstError = e;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  if (firstError) throw firstError;
}

/**
 * 上传的**暂停闸门**：暂停期间在 `beforeTake` / worker 循环里原地等，一恢复就接着往下走。
 *
 * ★ 为什么轮询读状态、而不是用 Promise 通知：任务记录本身就有 `paused`（SSE 每 300ms 推一帧），
 *   闸门读同一个源，就不会出现"闸门和界面各说各话"。200ms 的粒度对上传毫无感知。
 * ★ 任务记录没了（进程重启 / 已被回收）也必须放行 —— 否则 worker 会永远等一个不存在的任务，
 *   整个上传既不完成也不失败，连接也跟着漏掉。
 */
export function createPauseGate(job: () => SftpJob | undefined, intervalMs = 200): () => Promise<void> {
  return async () => {
    while (job()?.paused) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
}

/**
 * 展开上传清单：目录递归成文件列表，保留目录结构；返回总字节数（进度基数）。
 * `files[].rel` 为相对目标目录的路径前缀（缺省取本地 basename）；路径不存在会抛错，由调用方转 400。
 */
export function buildUploadPlan(
  files: Array<{ localPath?: string; rel?: string }>,
  destDir: string,
): { plan: Array<{ src: string; dest: string; size: number }>; totalBytes: number } {
  const plan: Array<{ src: string; dest: string; size: number }> = [];
  for (const f of files) {
    const src = String(f.localPath || '').replace(/\\/g, '/').trim();
    if (!src) continue;
    const rel = String(f.rel || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    const st = lstatSync(src);
    if (st.isDirectory()) {
      // relPrefix 用「rel 或目录名」，展开后 rel 自带该前缀 → 远端保留整棵目录树
      for (const item of collectLocalFiles(src, rel || basenameLocal(src))) {
        plan.push({ src: item.abs, dest: joinRemotePath(destDir, item.rel), size: safeFileSize(item.abs) });
      }
    } else if (st.isFile()) {
      plan.push({ src, dest: joinRemotePath(destDir, rel || basenameLocal(src)), size: st.size });
    }
  }
  return { plan, totalBytes: plan.reduce((n, p) => n + p.size, 0) };
}

// 定时回收空闲连接
const idleTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, e] of sshPool) {
    // 有下游连接正在借用这条隧道时不能回收：掐掉会连带掐断下游
    if (e.refs > 0) continue;
    if (now - e.lastUsed > IDLE_TIMEOUT_MS) disconnect(id);
  }
}, 60000);
// 防止阻止进程退出
if (typeof idleTimer.unref === 'function') idleTimer.unref();

// ---------- 审计 ----------

interface AuditEntry {
  at: number;
  action: string;
  connection?: string;
  detail?: string;
  ok: boolean;
}
async function audit(action: string, opts: { connection?: string; detail?: string; ok: boolean }): Promise<void> {
  // 裁剪 cap 沿用 500（本插件事件密度高）；load/push/slice/save 收口在 pushPluginAudit
  await pushPluginAudit(pluginStorage, { at: Date.now(), action, ...opts }, 500);
}

// ---------- 会话录像索引 ----------

/** 是否录制终端会话。默认开（对齐堡垒机的合规口径），可在插件配置里关掉 */
let recordSessions = true;

/**
 * **同时上传的文件数上限**（2026-10-16，用户要求）。
 *
 * 背景：上传现在是"先扫描成队列、再排队传"。用户的原话是「1000 个大文件不能 1000 个同时上传，
 * 肯定有个最大限制，比如 10 个 20 个同时上传，其它的就在待上传里，上传成功了就候补」——
 * 于是有了这个闸门：同时在飞不超过它，其余在队列里候补，传完一个补一个。
 *
 * 取值理由：SFTP 是同一条 SSH 通道上多路请求，开太多会被服务端限流、反而更慢；
 * 家用/办公带宽下 10 路已足够喂满链路。可在插件配置里调（ops-shell.uploadConcurrency）。
 */
let uploadConcurrency = 10;
/** 上限（含配置校验用）：32 已经远超单条 SFTP 通道的合理并发 */
export const MAX_UPLOAD_CONCURRENCY = 32;

/** 把配置里的并发数收进合法区间（配置可能被手改成 0/负数/字符串） */
function normalizeConcurrency(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(MAX_UPLOAD_CONCURRENCY, n);
}

async function loadRecordings(): Promise<RecordingMeta[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<RecordingMeta[]>('recordings');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r.id === 'string');
}

/**
 * 落库一条录像元数据（新的排最前），并按上限淘汰最旧的。
 * ★ 淘汰时必须同步删掉对应的 .cast：否则索引被裁掉了、文件却一直躺在磁盘上，
 *   既占空间又再也看不到（用户视角就是「磁盘莫名变小」）。
 */
async function persistRecording(meta: RecordingMeta): Promise<void> {
  if (!pluginStorage) return;
  const list = [meta, ...(await loadRecordings()).filter((r) => r.id !== meta.id)];
  for (const evicted of list.slice(MAX_RECORDINGS)) removeRecordingFile(evicted.id);
  try {
    await pluginStorage.set('recordings', list.slice(0, MAX_RECORDINGS));
  } catch (e) {
    logger.warn('[ops-shell] 录像索引落库失败（.cast 文件仍在磁盘上，下次启动会当孤儿清掉）:', (e as Error).message);
  }
}

// ---------- 主机密钥（known_hosts） ----------

/** 主机密钥校验策略。默认 tofu：首次记录，之后必须一致（见 ops-known-hosts.ts） */
let hostKeyMode: KnownHostMode = 'tofu';

async function loadKnownHosts(): Promise<HostKeyRecord[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<HostKeyRecord[]>('known-hosts');
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r.host === 'string' && typeof r.keyB64 === 'string');
}

async function saveKnownHosts(list: HostKeyRecord[]): Promise<void> {
  if (!pluginStorage) return;
  await pluginStorage.set('known-hosts', list);
}

/** TOFU：记下首次见到的主机密钥（已在则只更新 lastSeenAt）。失败只记日志，不阻断连接。 */
async function rememberHostKey(connName: string, record: HostKeyRecord): Promise<void> {
  try {
    const list = await loadKnownHosts();
    const existing = list.find((k) => k.host === record.host);
    if (existing && existing.keyB64 !== record.keyB64) return;   // 变更由校验层拦，这里不动
    const next = existing
      ? list.map((k) => (k.host === record.host ? { ...k, lastSeenAt: record.lastSeenAt } : k))
      : [...list, record];
    await saveKnownHosts(next);
    if (!existing) {
      logger.info(`[ops-shell] 已记录 ${record.host} 的主机密钥（${record.keyType} ${record.fingerprint}）`);
      await audit('hostkey.trust', { connection: connName, detail: `${record.host} ${record.fingerprint}`, ok: true });
    }
  } catch (e) {
    logger.warn('[ops-shell] 记录主机密钥失败（本次连接不受影响）:', (e as Error).message);
  }
}

// ---------- 命令审批闸门 ----------

async function loadApprovals(): Promise<ApprovalRequest[]> {
  if (!pluginStorage) return [];
  const rows = await pluginStorage.get<ApprovalRequest[]>('approvals');
  if (!Array.isArray(rows)) return [];
  return pruneApprovals(rows.filter((a) => a && typeof a.id === 'string'));
}

async function saveApprovals(list: ApprovalRequest[]): Promise<void> {
  if (!pluginStorage) return;
  await pluginStorage.set('approvals', capApprovals(list));
}

/**
 * 生产连接上的非只读命令：模型一律不能自行确认，必须由人在界面上批准。
 *
 * 返回 null = 放行（已获人工批准，且这条批准已被消费）；
 * 返回字符串 = 不要执行，把这句话原样作为工具结果回给模型。
 */
async function gateProductionAction(conn: StoredConnection, command: string, reason: string): Promise<string | null> {
  const list = await loadApprovals();
  const { hit, rest } = takeApproval(list, conn.id, command);
  if (hit) {
    // 已决记录一律消费掉（批准只能用一次；拒绝也不能留着反复回放）
    await saveApprovals(rest);
    if (hit.status === 'approved') {
      await audit('approval.granted', { connection: conn.name, detail: command.slice(0, 200), ok: true });
      return null;
    }
    await audit('approval.rejected', { connection: conn.name, detail: command.slice(0, 200), ok: false });
    return rejectedMessage(hit);
  }

  const req = makeRequest(conn.id, conn.name, command, reason);
  // 幂等：模型反复重试同一条命令，不该刷出一堆待批准
  if (!hasPending(list, conn.id, command)) {
    await saveApprovals([req, ...list]);
    await audit('approval.requested', { connection: conn.name, detail: command.slice(0, 200), ok: true });
  }
  return pendingMessage(req);
}

// ---------- SSH 命令执行 ----------

export function sshExec(client: Client, command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let code: number | null = null;
    const timer = setTimeout(() => {
      try { stream?.close(); } catch {}
      reject(new Error(`命令执行超时（${timeoutMs}ms）`));
    }, timeoutMs);
    let stream: ClientChannel | undefined;
    client.exec(command, (err, s) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      stream = s;
      s.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
      s.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
      s.on('close', (c: number | null) => {
        clearTimeout(timer);
        code = c;
        resolve({ stdout, stderr, code });
      });
    });
  });
}

function textResult(text: string): McpCallResult {
  return { content: [{ type: 'text', text }] } as McpCallResult;
}

export async function execOnConnection(conn: StoredConnection, command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const client = await getSsh(conn);
  const res = await sshExec(client, command, timeoutMs);
  const out = capOutput(res.stdout);
  const errOut = capOutput(res.stderr);
  return { stdout: out.text, stderr: errOut.text, code: res.code };
}

// ---------- 数据库只读执行（mysql2 / pg 直连，每次查询独立连接） ----------

/** 写操作关键字黑名单：WITH 开头的语句也要过这道闸（防 CTE 夹带 INSERT/UPDATE） */
const DB_DENY_RE =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|merge|call|set|use|kill|shutdown|copy|comment|lock|unlock|vacuum|reindex|do|listen|notify|load)\b/i;

function assertReadOnly(sql: string): string {
  const s = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .replace(/;+\s*$/, '');
  if (!s) throw new Error('SQL 不能为空');
  if (s.includes(';')) throw new Error('仅支持单条语句（不允许用 ; 拼接多条）');
  if (!/^(select|show|desc|describe|explain|with)\b/i.test(s)) {
    throw new Error('仅支持只读查询（SELECT / SHOW / DESC / EXPLAIN / WITH）');
  }
  if (DB_DENY_RE.test(s)) throw new Error('检测到写操作关键字，已拒绝执行');
  return s;
}

interface DbExecResult {
  rows: Record<string, unknown>[];
  fields: string[];
  truncated: boolean;
}

const DB_MAX_ROWS = 200;
const DB_CELL_CAP = 500;

async function dbExec(conn: StoredConnection, rawSql: string): Promise<DbExecResult> {
  if (conn.type !== 'database') throw new Error(`连接「${conn.name}」不是数据库连接`);
  const sql = assertReadOnly(rawSql);
  const database = conn.database || '';
  let rows: Record<string, unknown>[];
  let fields: string[];
  // 跳板机：内网数据库只对跳板机可达时，本地开个临时端口把流量引进去，
  // mysql2/pg 照常连 127.0.0.1（pg 会调 socket 方法，不能直接塞 ssh2 channel）
  let tunnel: { port: number; close: () => void } | undefined;
  let host = conn.host;
  let port = conn.port || (conn.dbType === 'postgres' ? 5432 : 3306);
  if (conn.jumpConnectionId) {
    const all = await loadConnections();
    const hop = all.find((c) => c.id === conn.jumpConnectionId);
    if (!hop) throw new Error(`跳板机连接不存在（id=${conn.jumpConnectionId}），请检查该连接的跳板设置`);
    tunnel = await openEphemeralTunnel(await getSsh(hop), host, port);
    host = '127.0.0.1';
    port = tunnel.port;
  }
  try {
    if (conn.dbType === 'postgres') {
      const client = new pg.Client({
        host, port, user: conn.username,
        password: decrypt(conn.secretEnc), database, connectionTimeoutMillis: 10000,
      });
      await client.connect();
      try {
        const r = await client.query(sql);
        rows = (r.rows || []) as Record<string, unknown>[];
        fields = (r.fields || []).map((f) => f.name);
      } finally {
        try { await client.end(); } catch { /* ignore */ }
      }
    } else {
      const c = await mysql.createConnection({
        host, port, user: conn.username,
        password: decrypt(conn.secretEnc), database, connectTimeout: 10000,
      });
      try {
        const [result] = await c.query({ sql, timeout: 20000 });
        const r = result as unknown[];
        rows = (Array.isArray(r) ? r : []) as Record<string, unknown>[];
        const first = rows[0];
        fields = first ? Object.keys(first) : [];
      } finally {
        try { await c.end(); } catch { /* ignore */ }
      }
    }
  } finally {
    tunnel?.close();
  }
  const truncated = rows.length > DB_MAX_ROWS;
  const capped = (truncated ? rows.slice(0, DB_MAX_ROWS) : rows).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      out[k] = s.length > DB_CELL_CAP ? s.slice(0, DB_CELL_CAP) + '…' : s;
    }
    return out;
  });
  return { rows: capped, fields, truncated };
}

// ---------- 工具实现 ----------

/** 构造插件注册的全部工具（导出供测试断言「已挂载的工具都真的注册了」） */
export function makeTools(): BuiltInTool[] {
  const execTimeoutDefault = () => {
    try {
      const p = getPluginManager().get(OPS_SHELL_ID);
      const t = p?.config?.execTimeoutMs as number | undefined;
      return t && t > 0 ? t : 30000;
    } catch { return 30000; }
  };

  async function resolveConn(args: Record<string, unknown>): Promise<StoredConnection> {
    const list = await loadConnections();
    const connId = String(args.connectionId || '');
    const name = String(args.connection || '');
    const conn = list.find((c) => c.id === connId) || list.find((c) => c.name === name);
    if (!conn) {
      const names = list.map((c) => c.name).join(', ') || '（无连接）';
      throw new Error(`连接不存在（${connId || name || '未指定'}）。可用连接：${names}`);
    }
    return conn;
  }

  return [
    {
      name: 'ssh_exec',
      description: '在指定 SSH 连接上执行 shell 命令并返回 stdout/stderr/退出码。★ 生产标签连接的非只读命令需要**人工批准**：本工具会先返回「待批准」，运维人员在控制台点批准后原样重试即可；模型自己传 confirmed 无效。危险命令（rm -rf /、mkfs、dd、shutdown 等）一律拒绝。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          command: { type: 'string', description: '要执行的 shell 命令' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
          timeoutMs: { type: 'number', description: '超时毫秒数，默认 30000' },
        },
        required: ['connection', 'command'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const command = String(args.command || '');
        // ★ 恒传 confirmed:false —— 模型说的「已确认」不算数，见 ops-approvals.ts 文件头
        const rejected = guard(command, { isProduction: isProduction(conn), confirmed: false });
        if (rejected) {
          // 危险命令是黑名单，没有批准通道
          if (isDangerous(command)) {
            await audit('ssh_exec.rejected', { connection: conn.name, detail: command.slice(0, 200), ok: false });
            return textResult(rejected);
          }
          const gated = await gateProductionAction(conn, command, 'agent tool');
          if (gated !== null) return textResult(gated);
        }
        const timeout = Number(args.timeoutMs) > 0 ? Number(args.timeoutMs) : execTimeoutDefault();
        try {
          const r = await execOnConnection(conn, command, timeout);
          await audit('ssh_exec', { connection: conn.name, detail: command.slice(0, 200), ok: r.code === 0 });
          return textResult(`[exit=${r.code}]\n${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`);
        } catch (e) {
          await audit('ssh_exec.error', { connection: conn.name, detail: (e as Error).message.slice(0, 200), ok: false });
          return textResult(`执行失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'ssh_upload',
      description:
        '通过 SFTP 上传本机文件到远程服务器。remotePath 传相对路径时会自动拼到该连接的 SFTP 默认目录下；省略 remotePath 则上传到默认目录。生产连接需**人工批准**（模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          localPath: { type: 'string', description: '本机文件绝对路径' },
          remotePath: { type: 'string', description: '远程目标路径；相对路径按连接的 SFTP 默认目录解析，省略则用默认目录' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection', 'localPath'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn)) { const g = await gateProductionAction(conn, '上传 ' + String(args.localPath || '') + ' → ' + String(args.remotePath || '(默认目录)'), 'SFTP 上传'); if (g !== null) return textResult(g); }
        const localPath = String(args.localPath || '');
        if (!localPath) return textResult('localPath 必填');
        const remotePath = resolveRemotePath(conn, String(args.remotePath || ''));
        if (!remotePath) {
          return textResult('未指定 remotePath，且该连接未配置 SFTP 默认目录 —— 请补 remotePath 或在连接设置里填 SFTP 默认路径');
        }
        try {
          const client = await getSsh(conn);
          const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
            client.sftp((err, s) => (err ? reject(err) : resolve(s!))),
          );
          await new Promise<void>((resolve, reject) =>
            sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve())),
          );
          sftp.end();
          await audit('ssh_upload', { connection: conn.name, detail: `${localPath} → ${remotePath}`, ok: true });
          return textResult(`已上传 ${localPath} → ${conn.name}:${remotePath}`);
        } catch (e) {
          await audit('ssh_upload.error', { connection: conn.name, detail: (e as Error).message.slice(0, 200), ok: false });
          return textResult(`上传失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'ssh_download',
      description:
        '通过 SFTP 从远程服务器下载文件到本机。remotePath 传相对路径时会自动拼到该连接的 SFTP 默认目录下。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          remotePath: { type: 'string', description: '远程文件路径；相对路径按连接的 SFTP 默认目录解析' },
          localPath: { type: 'string', description: '本机保存绝对路径' },
        },
        required: ['connection', 'remotePath', 'localPath'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const remotePath = resolveRemotePath(conn, String(args.remotePath || ''));
        const localPath = String(args.localPath || '');
        if (!remotePath || !localPath) return textResult('remotePath / localPath 必填');
        try {
          const client = await getSsh(conn);
          const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
            client.sftp((err, s) => (err ? reject(err) : resolve(s!))),
          );
          await new Promise<void>((resolve, reject) =>
            sftp.fastGet(remotePath, localPath, (err) => (err ? reject(err) : resolve())),
          );
          sftp.end();
          await audit('ssh_download', { connection: conn.name, detail: `${remotePath} → ${localPath}`, ok: true });
          return textResult(`已下载 ${conn.name}:${remotePath} → ${localPath}`);
        } catch (e) {
          await audit('ssh_download.error', { connection: conn.name, detail: (e as Error).message.slice(0, 200), ok: false });
          return textResult(`下载失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'docker_ps',
      description: '列出远程服务器上的 Docker 容器（含状态、镜像、端口）。只读。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          all: { type: 'boolean', description: '是否包含已停止容器，默认 true' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const all = args.all === false ? '' : ' -a';
        try {
          const r = await execOnConnection(conn, `docker ps --format '{{json .}}'${all}`, execTimeoutDefault());
          await audit('docker_ps', { connection: conn.name, ok: r.code === 0 });
          return textResult(r.code === 0 ? r.stdout || '（无容器）' : `[exit=${r.code}] ${r.stderr}`);
        } catch (e) {
          return textResult(`查询失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'docker_logs',
      description: '查看远程服务器上指定容器的日志（docker logs）。只读。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          container: { type: 'string', description: '容器名或 ID' },
          tail: { type: 'number', description: '尾部行数，默认 100' },
        },
        required: ['connection', 'container'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const container = String(args.container || '').replace(/['"`;]/g, '');
        if (!container) return textResult('容器名不能为空');
        const tail = Number(args.tail) > 0 ? Math.min(Number(args.tail), 2000) : 100;
        try {
          const r = await execOnConnection(conn, `docker logs --tail ${tail} ${JSON.stringify(container)} 2>&1`, execTimeoutDefault());
          await audit('docker_logs', { connection: conn.name, detail: container, ok: r.code === 0 });
          return textResult(r.stdout || '（无日志输出）');
        } catch (e) {
          return textResult(`查询失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'docker_restart',
      description: '重启远程服务器上的指定容器（docker restart）。生产连接需**人工批准**（与 ssh_exec 同口径，模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          container: { type: 'string', description: '容器名或 ID' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection', 'container'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const container = String(args.container || '').replace(/['"`;]/g, '');
        if (!container) return textResult('容器名不能为空');
        // ★ 与 ssh_exec 同口径：生产连接的写操作必须人工批准，模型传 confirmed 不算数
        if (isProduction(conn)) {
          const gated = await gateProductionAction(conn, `docker restart ${container}`, '重启容器');
          if (gated !== null) return textResult(gated);
        }
        try {
          const r = await execOnConnection(conn, `docker restart ${JSON.stringify(container)}`, 60000);
          await audit('docker_restart', { connection: conn.name, detail: container, ok: r.code === 0 });
          return textResult(r.code === 0 ? `容器 ${container} 已重启` : `[exit=${r.code}] ${r.stderr}`);
        } catch (e) {
          return textResult(`重启失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'db_query',
      description:
        '在指定数据库连接（database 类型）上执行只读 SQL 查询并返回 JSON 行结果，最多 200 行。仅允许 SELECT / SHOW / DESC / EXPLAIN / WITH，任何写操作一律拒绝。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          sql: { type: 'string', description: '要执行的只读 SQL（单条语句）' },
        },
        required: ['connection', 'sql'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const sql = String(args.sql || '');
        try {
          const r = await dbExec(conn, sql);
          await audit('db_query', { connection: conn.name, detail: sql.slice(0, 200), ok: true });
          const body = r.rows.length ? JSON.stringify(r.rows, null, 1) : '（0 行）';
          return textResult(
            `字段: ${r.fields.join(', ') || '（无）'}\n行数: ${r.rows.length}${r.truncated ? `（已截断，仅返回前 ${DB_MAX_ROWS} 行，请加 LIMIT/过滤条件缩小范围）` : ''}\n${body}`,
          );
        } catch (e) {
          await audit('db_query.rejected', { connection: conn.name, detail: sql.slice(0, 200), ok: false });
          return textResult(`查询失败: ${(e as Error).message}`);
        }
      },
    },

    // ===== 资源管理（连接 / 目录）：让运维助手能在对话里直接建资源 =====
    {
      name: 'conn_list',
      description: '列出全部运维连接与资源目录。改资源前先调它确认连接名 / 目录名。密钥永不返回。',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const [conns, groups] = await Promise.all([loadConnections(), loadGroups()]);
        const gname = (id?: string) => groups.find((g) => g.id === id)?.name || '未分组';
        const cname = (id?: string) => conns.find((c) => c.id === id)?.name || '（已失效的跳板）';
        const lines = conns.map((c) => {
          const addr = c.type === 'database'
            ? `${c.username}@${c.host}:${c.port}/${c.database || ''}`
            : `${c.username}@${c.host}:${c.port}`;
          const bits = [`类型=${c.type}`, `地址=${addr}`, `目录=${gname(c.groupId)}`];
          if (c.tag) bits.push(`标签=${c.tag}`);
          if (c.jumpConnectionId) bits.push(`跳板机=${cname(c.jumpConnectionId)}`);
          if (c.sftpPath) bits.push(`SFTP默认目录=${c.sftpPath}`);
          return `- ${c.name}（${bits.join('，')}）`;
        });
        return textResult(
          `资源目录 ${groups.length} 个：\n${groups.map((g) => `- ${g.name}`).join('\n') || '（无）'}\n\n`
          + `连接 ${conns.length} 个：\n${lines.join('\n') || '（无）'}`,
        );
      },
    },
    {
      name: 'conn_create',
      description:
        '新建运维连接。type：ssh=服务器终端，docker=Docker 宿主机，database=数据库（只读查询）。'
        + '认证：authType=password 时填 password；authType=key 时填 privateKey。'
        + 'group 传已存在的目录名（不存在会报错并列出可选目录）。database 类型必须给 dbType 与 database。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '连接名称（唯一）' },
          type: { type: 'string', enum: ['ssh', 'docker', 'database'], description: '连接类型，默认 ssh' },
          host: { type: 'string', description: '主机地址' },
          port: { type: 'number', description: '端口，默认 22（mysql 3306 / postgres 5432）' },
          username: { type: 'string', description: '登录用户名' },
          authType: { type: 'string', enum: ['password', 'key'], description: '认证方式，默认 password' },
          password: { type: 'string', description: '登录密码（authType=password）' },
          privateKey: { type: 'string', description: '私钥内容（authType=key）' },
          dbType: { type: 'string', enum: ['mysql', 'postgres'], description: 'database 类型必填' },
          database: { type: 'string', description: 'database 类型必填：库名' },
          tag: { type: 'string', description: '标签，如「生产」' },
          group: { type: 'string', description: '所属目录名（可选）' },
          jump: { type: 'string', description: '跳板机：已有连接的名称或 id（可选）。目标机只对跳板机可达时填，支持多级' },
          sftpPath: { type: 'string', description: 'SFTP 默认目录（可选）' },
          defaultCommand: { type: 'string', description: '进终端后自动执行的命令（可选）' },
          note: { type: 'string', description: '备注（可选）' },
        },
        required: ['name', 'host', 'username'],
      },
      execute: async (args) => {
        const list = await loadConnections();
        const groupName = String(args.group || '').trim();
        let groupId: string | undefined;
        if (groupName) {
          const groups = await loadGroups();
          const g = groups.find((x) => x.name === groupName);
          if (!g) return textResult(`目录「${groupName}」不存在。现有目录：${groups.map((x) => x.name).join('、') || '（无）'}`);
          groupId = g.id;
        }
        const jumpName = String(args.jump || '').trim();
        let jumpConnectionId: string | undefined;
        if (jumpName) {
          const j = list.find((x) => x.name === jumpName || x.id === jumpName);
          if (!j) return textResult(`跳板机「${jumpName}」不存在。可用连接：${list.map((x) => x.name).join('、') || '（无）'}`);
          jumpConnectionId = j.id;
        }
        const input = parseConnInput({
          ...args,
          secret: String(args.password || args.privateKey || ''),
          groupId,
          ...(jumpConnectionId ? { jumpConnectionId } : {}),
        });
        const invalid = validateConnInput(input, { requireSecret: true });
        if (invalid) return textResult(invalid);
        if (list.some((c) => c.name === input.name)) return textResult(`连接「${input.name}」已存在，要改它请用 conn_update`);
        const jumpError = validateJumpRef(undefined, input.jumpConnectionId, list);
        if (jumpError) return textResult(jumpError);
        const conn = buildConnection(input);
        list.push(conn);
        try {
          await saveConnections(list);
        } catch (e) {
          return textResult(`保存失败: ${(e as Error).message}`);
        }
        await audit('connection.create', { connection: conn.name, detail: jumpName ? `经跳板 ${jumpName}` : 'agent tool', ok: true });
        return textResult(`已新建连接「${conn.name}」（${conn.type} ${conn.username}@${conn.host}:${conn.port}），目录：${groupName || '未分组'}${jumpName ? `，跳板机：${jumpName}` : ''}`);
      },
    },
    {
      name: 'conn_update',
      description:
        '修改已有连接。只传要改的字段，其余保持不变；不传 password/privateKey 时沿用原密钥。'
        + 'connection 既可用连接名也可用 connectionId 定位。group 传空字符串表示移出目录。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '要修改的连接名（或 connectionId）' },
          name: { type: 'string', description: '新名称' },
          host: { type: 'string' },
          port: { type: 'number' },
          username: { type: 'string' },
          authType: { type: 'string', enum: ['password', 'key'] },
          password: { type: 'string' },
          privateKey: { type: 'string' },
          tag: { type: 'string' },
          note: { type: 'string' },
          sftpPath: { type: 'string' },
          defaultCommand: { type: 'string' },
          database: { type: 'string', description: 'database 类型的库名' },
          group: { type: 'string', description: '目标目录名；传空字符串移出目录' },
          jump: { type: 'string', description: '跳板机：已有连接的名称或 id；传空字符串取消跳板' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接修改需确认后带 confirmed=true 重新调用');
        const pick = (v: unknown, old?: string): string | undefined => {
          if (v === undefined) return old;
          const s = String(v).trim();
          return s || undefined;
        };
        let groupId = conn.groupId;
        if (args.group !== undefined) {
          const gname = String(args.group).trim();
          if (!gname) groupId = undefined;
          else {
            const g = (await loadGroups()).find((x) => x.name === gname);
            if (!g) return textResult(`目录「${gname}」不存在`);
            groupId = g.id;
          }
        }
        let jumpConnectionId = conn.jumpConnectionId;
        let jumpProvided = false;
        if (args.jump !== undefined) {
          jumpProvided = true;
          const jname = String(args.jump).trim();
          if (!jname) jumpConnectionId = undefined;
          else {
            const all = await loadConnections();
            const j = all.find((x) => x.name === jname || x.id === jname);
            if (!j) return textResult(`跳板机「${jname}」不存在。可用连接：${all.map((x) => x.name).join('、') || '（无）'}`);
            jumpConnectionId = j.id;
          }
        }
        const input: ConnInput = {
          type: conn.type,
          name: String(args.name ?? conn.name).trim(),
          host: String(args.host ?? conn.host).trim(),
          port: Number(args.port) > 0 ? Number(args.port) : conn.port,
          username: String(args.username ?? conn.username).trim(),
          authType: args.authType === 'key' ? 'key' : args.authType === 'password' ? 'password' : conn.authType,
          secret: String(args.password || args.privateKey || ''),
          tag: pick(args.tag, conn.tag),
          dbType: conn.dbType,
          database: conn.type === 'database' ? pick(args.database, conn.database) : undefined,
          defaultCommand: pick(args.defaultCommand, conn.defaultCommand),
          sftpPath: pick(args.sftpPath, conn.sftpPath),
          note: pick(args.note, conn.note),
          groupId,
          jumpConnectionId,
          jumpProvided,
        };
        const invalid = validateConnInput(input, { requireSecret: false });
        if (invalid) return textResult(invalid);
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === conn.id);
        if (idx < 0) return textResult('连接不存在');
        if (list.some((c) => c.id !== conn.id && c.name === input.name)) return textResult(`连接「${input.name}」已存在`);
        const next = buildConnection(input, list[idx]);
        list[idx] = next;
        const jumpError = validateJumpRef(next, next.jumpConnectionId, list);
        if (jumpError) return textResult(jumpError);
        try {
          await saveConnections(list);
        } catch (e) {
          return textResult(`保存失败: ${(e as Error).message}`);
        }
        disconnect(conn.id); // 字段变了，池里的旧连接不能继续复用
        disconnectDependents(conn.id, list); // 出口变了，下游经它中转的连接也要重连
        await audit('connection.update', { connection: input.name, detail: 'agent tool', ok: true });
        return textResult(`已更新连接「${input.name}」`);
      },
    },
    {
      name: 'conn_delete',
      description: '删除运维连接（不可恢复）。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接删除需确认后带 confirmed=true 重新调用');
        const list = await loadConnections();
        const dependents = list.filter((c) => c.jumpConnectionId === conn.id).map((c) => c.name);
        try {
          await saveConnections(list.filter((c) => c.id !== conn.id));
        } catch (e) {
          return textResult(`删除失败: ${(e as Error).message}`);
        }
        disconnect(conn.id);
        disconnectDependents(conn.id, list);
        await audit('connection.delete', { connection: conn.name, detail: 'agent tool', ok: true });
        return textResult(
          `已删除连接「${conn.name}」`
          + (dependents.length ? `。注意：${dependents.join('、')} 以它为跳板机，需要重新指定跳板` : ''),
        );
      },
    },
    {
      name: 'conn_move',
      description: '把连接移动到某个资源目录；group 传空字符串表示移出目录（回到未分组）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          group: { type: 'string', description: '目标目录名；留空表示移出目录' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === conn.id);
        if (idx < 0) return textResult('连接不存在');
        const gname = String(args.group || '').trim();
        if (!gname) {
          delete list[idx].groupId;
          await saveConnections(list);
          return textResult(`已把「${conn.name}」移出目录`);
        }
        const g = (await loadGroups()).find((x) => x.name === gname);
        if (!g) return textResult(`目录「${gname}」不存在`);
        list[idx].groupId = g.id;
        await saveConnections(list);
        return textResult(`已把「${conn.name}」移动到目录「${g.name}」`);
      },
    },
    {
      name: 'group_create',
      description: '新建资源目录（给连接归类用）。不允许与已有目录重名。',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: '目录名称' } },
        required: ['name'],
      },
      execute: async (args) => {
        const name = String(args.name || '').trim();
        if (!name) return textResult('目录名称必填');
        const list = await loadGroups();
        if (list.some((g) => g.name === name)) return textResult(`目录「${name}」已存在`);
        list.push({ id: `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, createdAt: Date.now() });
        try {
          await saveGroups(list);
        } catch (e) {
          return textResult(`保存失败: ${(e as Error).message}`);
        }
        return textResult(`已新建目录「${name}」`);
      },
    },
    {
      name: 'group_rename',
      description: '重命名资源目录。',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string', description: '原目录名' },
          name: { type: 'string', description: '新目录名' },
        },
        required: ['group', 'name'],
      },
      execute: async (args) => {
        const oldName = String(args.group || '').trim();
        const newName = String(args.name || '').trim();
        if (!newName) return textResult('新目录名必填');
        const list = await loadGroups();
        const g = list.find((x) => x.name === oldName);
        if (!g) return textResult(`目录「${oldName}」不存在`);
        if (list.some((x) => x.id !== g.id && x.name === newName)) return textResult(`目录「${newName}」已存在`);
        g.name = newName;
        await saveGroups(list);
        return textResult(`目录「${oldName}」已重命名为「${newName}」`);
      },
    },
    {
      name: 'group_delete',
      description: '删除资源目录。目录下的连接不会被删除，只会回落为「未分组」。',
      inputSchema: {
        type: 'object',
        properties: { group: { type: 'string', description: '目录名' } },
        required: ['group'],
      },
      execute: async (args) => {
        const name = String(args.group || '').trim();
        const groups = await loadGroups();
        const g = groups.find((x) => x.name === name);
        if (!g) return textResult(`目录「${name}」不存在`);
        const conns = await loadConnections();
        let moved = 0;
        for (const c of conns) if (c.groupId === g.id) { delete c.groupId; moved += 1; }
        await saveGroups(groups.filter((x) => x.id !== g.id));
        if (moved) await saveConnections(conns);
        return textResult(`已删除目录「${name}」${moved ? `，其中 ${moved} 个连接已回落为未分组` : ''}`);
      },
    },

    // ===== 文件管理（SFTP） =====
    {
      name: 'sftp_list',
      description: '列出远程目录内容。path 省略时列该连接的 SFTP 根目录（登录用户 home）。绝对路径与相对路径都支持。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          path: { type: 'string', description: '远程目录；相对路径按连接的 SFTP 默认目录解析，省略则用根目录' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        try {
          const sftp = await getSftp(conn);
          const root = await resolveRemoteRoot(sftp, conn.sftpPath);
          const dir = normalizeRemotePath(String(args.path || ''), root);
          const entries = await listRemoteDir(sftp, dir);
          const body = entries
            .map((e) => `${e.type === 'dir' ? '[目录]' : e.type === 'link' ? '[链接]' : '[文件]'} ${e.name}${e.type === 'file' ? ` (${e.size}B)` : ''}`)
            .join('\n');
          return textResult(`目录 ${dir}（${entries.length} 项）\n${body || '（空目录）'}`);
        } catch (e) {
          return textResult(`列目录失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'sftp_mkdir',
      description: '在远程创建目录（父目录不存在会一并创建）。生产连接需**人工批准**（模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          path: { type: 'string', description: '要创建的远程目录；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection', 'path'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn)) { const g = await gateProductionAction(conn, '新建目录 ' + String(args.path || ''), 'SFTP 新建目录'); if (g !== null) return textResult(g); }
        try {
          const sftp = await getSftp(conn);
          const root = await resolveRemoteRoot(sftp, conn.sftpPath);
          const dir = normalizeRemotePath(String(args.path || ''), root);
          await ensureRemoteDir(sftp, dir);
          await audit('sftp_mkdir', { connection: conn.name, detail: dir, ok: true });
          return textResult(`已创建目录 ${dir}`);
        } catch (e) {
          return textResult(`创建目录失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'sftp_rename',
      description: '重命名 / 移动远程文件或目录。生产连接需**人工批准**（模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          from: { type: 'string', description: '原路径；相对路径按 SFTP 默认目录解析' },
          to: { type: 'string', description: '新路径；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '已废弃：生产写操作改由人工批准，模型无法自行确认' },
        },
        required: ['connection', 'from', 'to'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn)) { const g = await gateProductionAction(conn, '重命名 ' + String(args.from || '') + ' → ' + String(args.to || ''), 'SFTP 重命名'); if (g !== null) return textResult(g); }
        try {
          const sftp = await getSftp(conn);
          const root = await resolveRemoteRoot(sftp, conn.sftpPath);
          const from = normalizeRemotePath(String(args.from || ''), root);
          const to = normalizeRemotePath(String(args.to || ''), root);
          await new Promise<void>((resolve, reject) => sftp.rename(from, to, (err) => (err ? reject(err) : resolve())));
          await audit('sftp_rename', { connection: conn.name, detail: `${from} → ${to}`, ok: true });
          return textResult(`已重命名 ${from} → ${to}`);
        } catch (e) {
          return textResult(`重命名失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'sftp_backup',
      description:
        '备份远程文件：在同一目录复制一份带时间戳的副本（<文件名>.bak-YYYYMMDD-HHmmss）。'
        + '改配置前先备份是个好习惯。只能备份文件，不支持目录。生产连接需**人工批准**（模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          path: { type: 'string', description: '要备份的远程文件；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'path'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn)) { const g = await gateProductionAction(conn, '备份 ' + String(args.path || ''), 'SFTP 备份'); if (g !== null) return textResult(g); }
        try {
          const sftp = await getSftp(conn);
          const root = await resolveRemoteRoot(sftp, conn.sftpPath);
          const src = normalizeRemotePath(String(args.path || ''), root);
          const st = await statRemote(sftp, src);
          if (st.isDir) return textResult(`${src} 是目录，sftp_backup 只能备份文件`);
          const dst = backupRemoteName(src);
          await copyRemoteFile(sftp, src, dst);
          await audit('sftp_backup', { connection: conn.name, detail: `${src} → ${dst}`, ok: true });
          return textResult(`已备份 ${src} → ${dst}`);
        } catch (e) {
          await audit('sftp_backup.error', { connection: conn.name, detail: (e as Error).message.slice(0, 200), ok: false });
          return textResult(`备份失败: ${(e as Error).message}`);
        }
      },
    },
    {
      name: 'sftp_delete',
      description: '删除远程文件或目录（目录连同**全部内容**一起删除，不可恢复）。生产连接需**人工批准**（模型传 confirmed 无效）。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          path: { type: 'string', description: '要删除的远程文件；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'path'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn)) { const g = await gateProductionAction(conn, '删除 ' + String(args.path || ''), 'SFTP 删除'); if (g !== null) return textResult(g); }
        try {
          const sftp = await getSftp(conn);
          const root = await resolveRemoteRoot(sftp, conn.sftpPath);
          const path = normalizeRemotePath(String(args.path || ''), root);
          const st = await statRemote(sftp, path);
          if (st.isDir) return textResult(`${path} 是目录，sftp_delete 只删文件`);
          await new Promise<void>((resolve, reject) => sftp.unlink(path, (err) => (err ? reject(err) : resolve())));
          await audit('sftp_delete', { connection: conn.name, detail: path, ok: true });
          return textResult(`已删除 ${path}`);
        } catch (e) {
          await audit('sftp_delete.error', { connection: conn.name, detail: (e as Error).message.slice(0, 200), ok: false });
          return textResult(`删除失败: ${(e as Error).message}`);
        }
      },
    },
  ];
}

// ---------- 插件入口 ----------

// ---------- 交互式终端（WebSocket） ----------

const TERM_PING_INTERVAL_MS = 30000;

/** 控制消息（文本帧）发送；连接已关时静默丢弃 */
function sendWsJson(ws: PluginWebSocket, payload: unknown): void {
  if (ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(payload)); } catch { /* 对端已断 */ }
}

/**
 * WebSocket 版交互式终端。帧约定（与市面 Web SSH 实现同构）：
 *   服务端 → 客户端：二进制帧 = PTY 原始输出；文本帧 = JSON 控制消息（ready / exit / error）
 *   客户端 → 服务端：二进制帧 = 按键（原样字节）；文本帧 = JSON 控制消息（resize / ping）
 *
 * 为什么从 SSE + POST 换过来：SSE 是单向的，按键只能另开 HTTP POST ——
 * 每敲一个键一次往返，输入延迟叠加，Ctrl-C 与刷屏输出的时序保证很脆，
 * 多开终端还会撞 HTTP/1.1 的同源连接数上限。WS 是一条双向长连接，
 * I/O 与 resize 共用同一通道，也不再需要 base64（省一次编解码、不放大 33% 流量）。
 *
 * （导出仅为单测直接驱动协议收发；生产入口是 activate 里的 registerWebSocket）
 */
export async function handleTerminalWs(ws: PluginWebSocket, req: PluginWsRequest): Promise<void> {
  let query: URLSearchParams;
  try {
    query = new URL(req.url, 'http://localhost').searchParams;
  } catch {
    sendWsJson(ws, { type: 'error', message: '请求地址无法解析' });
    ws.close();
    return;
  }
  const fail = (message: string) => { sendWsJson(ws, { type: 'error', message }); ws.close(); };

  const cols = Number(query.get('cols')) || 120;
  const rows = Number(query.get('rows')) || 32;
  const list = await loadConnections();
  const conn = list.find((c) => c.id === (query.get('connectionId') || ''));
  if (!conn) { fail('连接不存在'); return; }
  if (conn.type === 'database') { fail('数据库连接不支持交互终端'); return; }

  let stream: ClientChannel;
  try {
    const client = await getSsh(conn);
    stream = await new Promise<ClientChannel>((resolve, reject) => {
      client.shell({ cols, rows }, (err, s) => (err ? reject(err) : resolve(s)));
    });
  } catch (e) {
    fail(`打开终端失败：${(e as Error).message}`);
    return;
  }

  // 会话录制：默认开（插件配置可关）。录制本身出问题不该影响终端，所以整体包 try/catch。
  let recorder: TermRecorder | null = null;
  if (recordSessions) {
    try {
      recorder = new TermRecorder({
        connectionId: conn.id, connectionName: conn.name, transport: 'websocket', cols, rows,
      });
    } catch (e) {
      logger.warn('[ops-shell] 启动会话录制失败（终端不受影响）:', (e as Error).message);
    }
  }

  let closed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (recorder) {
      // 先收尾录像再关流：stop() 会 flush 缓冲，掉线也能留下最后一段
      const meta = recorder.stop();
      recorder = null;
      void persistRecording(meta);
    }
    try { stream.close(); } catch { /* 已关 */ }
  };

  // 心跳：网络被硬断（拔网线 / 休眠）时 'close' 未必及时到达，靠 ping/pong 兜底回收 ——
  // 否则 SSH 会话会一直挂着，还占着连接池的引用计数，让跳板客户端永远不被回收。
  // 浏览器对协议级 ping 自动回 pong，前端不需要写任何代码。
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) { try { ws.close(); } catch { /* ignore */ } cleanup(); return; }
    alive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }, TERM_PING_INTERVAL_MS);
  pingTimer = heartbeat;
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  stream.on('data', (d: Buffer) => {
    // 录制与 ws 状态无关：客户端已经断了，会话尾部的输出同样值得留下
    recorder?.output(d);
    if (ws.readyState !== 1) return;
    try { ws.send(d); } catch { /* 对端已断，close 事件会收尾 */ }
  });
  stream.on('close', () => {
    // 幂等：ws 先断开时 cleanup 会关流，流再回弹一次 close 就会重复发 exit 帧
    if (closed) return;
    sendWsJson(ws, { type: 'exit' });
    cleanup();
    try { ws.close(); } catch { /* ignore */ }
  });

  ws.on('pong', () => { alive = true; });
  ws.on('message', (raw: Buffer, isBinary: boolean) => {
    alive = true;
    if (isBinary) {
      // 按键按原始字节写进 PTY：控制字符（Ctrl-C 等）不能走文本解码
      recorder?.input(raw.toString('utf8'));
      try { stream.write(raw); } catch { /* ignore */ }
      return;
    }
    let msg: { type?: string; cols?: number; rows?: number };
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (msg.type === 'resize') {
      const c = Number(msg.cols);
      const rw = Number(msg.rows);
      if (c > 0 && rw > 0) {
        recorder?.resize(c, rw);
        try { stream.setWindow(rw, c, 0, 0); } catch { /* ignore */ }
      }
    }
  });
  ws.on('close', cleanup);
  ws.on('error', cleanup);

  // 默认命令先算出来：ready 帧要带上它，前端据此提示「已自动执行默认命令」
  const defaultCommand = String(query.get('defaultCommand') ?? conn.defaultCommand ?? '').trim();
  const autoRun = query.get('autoRun') !== 'false' && !!defaultCommand;

  sendWsJson(ws, { type: 'ready', defaultCommand: defaultCommand || null, autoRun, recording: !!recorder });

  // 默认命令：shell 起来后自动执行一次（与 SSE 版同样的「等登录 banner」处理）
  if (autoRun) {
    setTimeout(() => {
      if (closed) return;
      try { stream.write(`${defaultCommand}\n`); } catch { /* 会话已关 */ }
    }, 600);
    await audit('term.default_command', { connection: conn.name, detail: defaultCommand.slice(0, 200), ok: true });
  }
  await audit('term.open', { connection: conn.name, detail: 'websocket', ok: true });
}

const opsShellModule: PluginModule = {
  activate(ctx) {
    pluginStorage = ctx.storage;
    // 录制开关：默认开（对齐堡垒机的合规口径），可在插件管理页关掉
    recordSessions = (ctx.config as { recordSessions?: boolean } | undefined)?.recordSessions !== false;
    // 同时上传的文件数上限（其余排队候补）：配置可能被手改坏，统一收进 1–32
    uploadConcurrency = normalizeConcurrency((ctx.config as { uploadConcurrency?: unknown } | undefined)?.uploadConcurrency);
    // 主机密钥校验策略：默认 tofu（首次记录、之后必须一致）。见 ops-known-hosts.ts
    const hk = (ctx.config as { knownHostMode?: string } | undefined)?.knownHostMode;
    hostKeyMode = hk === 'strict' || hk === 'off' ? hk : 'tofu';
    // ★ 孤儿清理是**破坏性**操作（会 unlink 文件），绝不能在测试进程里跑：
    //   测试的 cwd 与「dev 未设 DATA_DIR 时」的录像目录是同一个 →
    //   跑一次测试就会把开发者本机的真实录像删光。清理逻辑本身由
    //   ops-recordings.test.ts 直接调 sweepOrphanRecordings 覆盖。
    if (!process.env.VITEST) {
      void loadRecordings()
        .then((list) => {
          const n = sweepOrphanRecordings(list.map((r) => r.id));
          if (n > 0) logger.info(`[ops-shell] 已清理 ${n} 个孤儿录像文件`);
        })
        .catch(() => { /* 清理失败不影响启动 */ });
    }

    // 注册工具（供智能体挂载，运行时名 plugin_ops-shell__<tool>）
    for (const tool of makeTools()) {
      ctx.registerTool(tool);
    }

    // 交互式终端（WebSocket）：与下方 SSE + POST 通道并存。
    // 前端优先走 WS；WS 连不上（被代理拦掉等）时自动回退到 SSE，行为不变。
    ctx.registerWebSocket('/term/ws', (ws, req) => {
      void handleTerminalWs(ws, req).catch((e: unknown) => {
        logger.warn('[ops-shell] WS 终端处理异常:', (e as Error)?.message || e);
        sendWsJson(ws, { type: 'error', message: '终端会话异常结束' });
        try { ws.close(); } catch { /* ignore */ }
      });
    });

    // 后端路由：连接 CRUD + 终端会话 + Docker 面板（运维控制台 /ops 页面消费）
    ctx.registerBackendRoute((app: unknown) => {
      const r = app as {
        get: (p: string, h: (...a: unknown[]) => void) => void;
        post: (p: string, h: (...a: unknown[]) => void) => void;
        put: (p: string, h: (...a: unknown[]) => void) => void;
        delete: (p: string, h: (...a: unknown[]) => void) => void;
      };

      // 连接列表（密钥永不回显）
      r.get('/connections', async (_req: unknown, res: unknown) => {
        const list = await loadConnections();
        (res as { json: (d: unknown) => void }).json({ data: list.map(toClientView) });
      });

      // ===== 资源目录（分类分组）=====
      const jsonRes = (res: unknown) => res as { json: (d: unknown) => void };
      const failRes = (res: unknown, code: number, msg: string) =>
        (res as { status: (n: number) => { json: (d: unknown) => void } }).status(code).json({ error: msg });

      // 目录列表
      r.get('/groups', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: await loadGroups() });
      });

      // 新建目录（同级重名拒绝；parentId 省略 = 顶层目录）
      r.post('/groups', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        if (!name) { failRes(res, 400, '目录名称必填'); return; }
        const parentId = String(body.parentId ?? '').trim();
        const list = await loadGroups();
        if (parentId && !list.some((g) => g.id === parentId)) { failRes(res, 404, '父目录不存在'); return; }
        if (list.some((g) => g.name === name && (g.parentId || '') === parentId)) {
          failRes(res, 409, `当前层级下已存在目录「${name}」`); return;
        }
        const group: OpsGroup = {
          id: `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name, createdAt: Date.now(),
        };
        if (parentId) group.parentId = parentId;
        list.push(group);
        try { await saveGroups(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: group });
      });

      // 重命名目录（同级重名拒绝）
      r.put('/groups/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        if (!name) { failRes(res, 400, '目录名称必填'); return; }
        const list = await loadGroups();
        const idx = list.findIndex((g) => g.id === id);
        if (idx < 0) { failRes(res, 404, '目录不存在'); return; }
        const parentId = list[idx].parentId || '';
        if (list.some((g) => g.id !== id && g.name === name && (g.parentId || '') === parentId)) {
          failRes(res, 409, `当前层级下已存在目录「${name}」`); return;
        }
        list[idx] = { ...list[idx], name };
        try { await saveGroups(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: list[idx] });
      });

      // 移动目录（拖拽：parentId 传空 = 移到顶层）
      // 防环：不能移到自己或自己的子孙目录下（否则树断了，前端渲染会丢节点）
      r.put('/groups/:id/parent', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const parentId = String(body.parentId ?? '').trim();
        const list = await loadGroups();
        const idx = list.findIndex((g) => g.id === id);
        if (idx < 0) { failRes(res, 404, '目录不存在'); return; }
        if (parentId) {
          if (parentId === id) { failRes(res, 400, '不能把目录移到自己下面'); return; }
          if (!list.some((g) => g.id === parentId)) { failRes(res, 404, '目标父目录不存在'); return; }
          // 向上遍历祖先链，命中自己说明目标是自己的子孙
          let cur: OpsGroup | undefined = list.find((g) => g.id === parentId);
          const guard = new Set<string>();
          while (cur && !guard.has(cur.id)) {
            guard.add(cur.id);
            if (cur.id === id) { failRes(res, 400, '不能把目录移到自己的子目录下（会形成环）'); return; }
            cur = cur.parentId ? list.find((g) => g.id === cur!.parentId) : undefined;
          }
          const targetLevel = list.filter((g) => (g.parentId || '') === parentId);
          if (targetLevel.some((g) => g.id !== id && g.name === list[idx].name)) {
            failRes(res, 409, `目标层级下已存在目录「${list[idx].name}」`); return;
          }
          list[idx] = { ...list[idx], parentId };
        } else {
          delete list[idx].parentId;
          const top = list.filter((g) => !g.parentId);
          if (top.some((g) => g.id !== id && g.name === list[idx].name)) {
            failRes(res, 409, `顶层已存在目录「${list[idx].name}」`); return;
          }
        }
        try { await saveGroups(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: list[idx] });
      });

      // 删除目录：其下连接回落为「未分组」，子目录上提到父层级（都不删实体）
      r.delete('/groups/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const groups = await loadGroups();
        const target = groups.find((g) => g.id === id);
        if (!target) { failRes(res, 404, '目录不存在'); return; }
        const grandparent = target.parentId || '';
        const conns = await loadConnections();
        for (const c of conns) if (c.groupId === id) delete c.groupId;
        const next = groups
          .filter((g) => g.id !== id)
          .map((g) => {
            if ((g.parentId || '') !== id) return g;
            const copy: OpsGroup = { ...g };
            if (grandparent) copy.parentId = grandparent; else delete copy.parentId;
            return copy;
          });
        try {
          await saveGroups(next);
          await saveConnections(conns);
        } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: { ok: true } });
      });

      // 移动连接归属目录（groupId 传空 = 移到未分组）
      r.put('/connections/:id/group', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const raw = String(body.groupId ?? '').trim();
        if (raw) {
          const groups = await loadGroups();
          if (!groups.some((g) => g.id === raw)) { failRes(res, 404, '目标目录不存在'); return; }
        }
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === id);
        if (idx < 0) { failRes(res, 404, '连接不存在'); return; }
        if (raw) list[idx].groupId = raw; else delete list[idx].groupId;
        try { await saveConnections(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: toClientView(list[idx]) });
      });

      // 新建连接（type: ssh | docker | database；docker/database 复用 SSH 字段语义，database 直连）
      r.post('/connections', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const input = parseConnInput(body);
        const invalid = validateConnInput(input, { requireSecret: true });
        if (invalid) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: invalid });
          return;
        }
        const list = await loadConnections();
        if (list.some((c) => c.name === input.name)) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(409).json({ error: `连接「${input.name}」已存在` });
          return;
        }
        const jumpError = validateJumpRef(undefined, input.jumpConnectionId, list);
        if (jumpError) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: jumpError });
          return;
        }
        const conn = buildConnection(input);
        list.push(conn);
        try {
          await saveConnections(list);
        } catch (e) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(500).json({ error: (e as Error).message });
          return;
        }
        await audit('connection.create', { connection: input.name, ok: true });
        (res as { json: (d: unknown) => void }).json({ data: toClientView(conn) });
      });

      // 编辑连接：密钥留空表示沿用原密文（只改端口/标签/默认命令时无需重填）
      r.put('/connections/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === id);
        if (idx < 0) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' });
          return;
        }
        const base = list[idx];
        const input = parseConnInput(body);
        const invalid = validateConnInput(input, { requireSecret: false });
        if (invalid) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: invalid });
          return;
        }
        if (list.some((c) => c.id !== id && c.name === input.name)) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(409).json({ error: `连接「${input.name}」已存在` });
          return;
        }
        const next = buildConnection(input, base);
        list[idx] = next;
        const jumpError = validateJumpRef(next, next.jumpConnectionId, list);
        if (jumpError) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: jumpError });
          return;
        }
        try {
          await saveConnections(list);
        } catch (e) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(500).json({ error: (e as Error).message });
          return;
        }
        // 出口变了（主机/端口/账号/密钥/跳板）→ 断开旧 SSH 会话，避免复用失效连接；
        // 下游经它中转的连接也必须一并断开重连，否则会挂在旧隧道上
        const endpointChanged =
          base.host !== next.host || base.port !== next.port || base.username !== next.username ||
          base.authType !== next.authType || base.secretEnc !== next.secretEnc ||
          base.jumpConnectionId !== next.jumpConnectionId;
        if (endpointChanged) {
          disconnect(id);
          disconnectDependents(id, list);
        }
        await audit('connection.update', { connection: next.name, ok: true });
        (res as { json: (d: unknown) => void }).json({ data: toClientView(next) });
      });

      // 表单内测试：接收未保存的入参直连测试（id 可选，用于续用已存密钥）
      r.post('/connections/test', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const id = String(body.id || '');
        const list = await loadConnections();
        const base = id ? list.find((c) => c.id === id) : undefined;
        const input = parseConnInput(body);
        const invalid = validateConnInput(input, { requireSecret: !base });
        if (invalid) {
          (res as { json: (d: unknown) => void }).json({ data: { ok: false, error: invalid } });
          return;
        }
        // 借用既有连接做临时对象（不落库、不入连接池）
        const probe = buildConnection(input, base);
        if (!probe.secretEnc) {
          (res as { json: (d: unknown) => void }).json({ data: { ok: false, error: '密码或私钥必填' } });
          return;
        }
        try {
          if (probe.type === 'database') {
            await dbExec(probe, 'SELECT 1');
          } else {
            const { client, cleanup } = await sshProbe(probe);
            try {
              const cmd = probe.type === 'docker' ? 'docker ps >/dev/null 2>&1 && echo ok' : 'echo ok';
              const r = await sshExec(client, cmd, 15000);
              if (!r.stdout.includes('ok')) throw new Error(r.stderr.trim() || `命令退出码 ${r.code}`);
            } finally {
              cleanup();
            }
          }
          (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ data: { ok: false, error: (e as Error).message } });
        }
      });

      // 删除连接
      r.delete('/connections/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadConnections();
        const next = list.filter((c) => c.id !== id);
        if (next.length === list.length) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' });
          return;
        }
        // 被删的连接可能正被别处当跳板：一并断开下游，并在响应里回报，供前端提示
        const dependents = next.filter((c) => c.jumpConnectionId === id).map((c) => c.name);
        disconnect(id);
        disconnectDependents(id, next);
        try {
          await saveConnections(next);
        } catch (e) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(500).json({ error: (e as Error).message });
          return;
        }
        (res as { json: (d: unknown) => void }).json({ data: { ok: true, dependents } });
      });

      // 连接测试（按类型：ssh=echo；docker=docker ps；database=SELECT 1 直连）
      r.post('/connections/:id/test', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadConnections();
        const conn = list.find((c) => c.id === id);
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        try {
          if (conn.type === 'database') {
            await dbExec(conn, 'SELECT 1');
            (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
            return;
          }
          const cmd = conn.type === 'docker' ? 'docker ps >/dev/null 2>&1 && echo ok' : 'echo ok';
          const r = await execOnConnection(conn, cmd, 15000);
          (res as { json: (d: unknown) => void }).json({ data: { ok: r.stdout.includes('ok') } });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ data: { ok: false, error: (e as Error).message } });
        }
      });

      // 数据库面板：表列表（database 类型连接）
      r.get('/db/tables', async (req: unknown, res: unknown) => {
        const connId = (req as { query: Record<string, string> }).query.connectionId || '';
        const list = await loadConnections();
        const conn = list.find((c) => c.id === connId);
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        if (conn.type !== 'database') { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: '非数据库连接' }); return; }
        try {
          const r = await dbExec(
            conn,
            conn.dbType === 'postgres'
              ? "SELECT tablename AS name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY tablename"
              : 'SHOW TABLES',
          );
          const tables = conn.dbType === 'postgres'
            ? r.rows.map((row) => String(row.name ?? ''))
            : r.rows.map((row) => String(Object.values(row)[0] ?? ''));
          (res as { json: (d: unknown) => void }).json({ data: tables.filter(Boolean) });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      // 数据库面板：只读 SQL 查询
      r.post('/db/query', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const conn = list.find((c) => c.id === String(body.connectionId || ''));
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        if (conn.type !== 'database') { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: '非数据库连接' }); return; }
        try {
          const r = await dbExec(conn, String(body.sql || ''));
          await audit('db_query', { connection: conn.name, detail: String(body.sql || '').slice(0, 200), ok: true });
          (res as { json: (d: unknown) => void }).json({ data: r });
        } catch (e) {
          await audit('db_query.rejected', { connection: conn.name, detail: String(body.sql || '').slice(0, 200), ok: false });
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      // Docker 面板：容器列表（连接 id 查询参数）
      r.get('/docker/ps', async (req: unknown, res: unknown) => {
        const connId = (req as { query: Record<string, string> }).query.connectionId || '';
        const list = await loadConnections();
        const conn = list.find((c) => c.id === connId);
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        try {
          const r = await execOnConnection(conn, "docker ps -a --format '{{json .}}'", 20000);
          if (r.code !== 0) { (res as { json: (d: unknown) => void }).json({ error: r.stderr || `exit=${r.code}` }); return; }
          const rows = r.stdout.trim().split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
          (res as { json: (d: unknown) => void }).json({ data: rows });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      // Docker 面板：容器日志
      r.get('/docker/logs', async (req: unknown, res: unknown) => {
        const q = (req as { query: Record<string, string> }).query;
        const list = await loadConnections();
        const conn = list.find((c) => c.id === q.connectionId);
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        const container = String(q.container || '').replace(/['"`;]/g, '');
        const tail = Number(q.tail) > 0 ? Math.min(Number(q.tail), 2000) : 200;
        try {
          const r = await execOnConnection(conn, `docker logs --tail ${tail} ${JSON.stringify(container)} 2>&1`, 20000);
          (res as { json: (d: unknown) => void }).json({ data: r.stdout });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      // Docker 面板：重启容器（生产连接需 confirmed）
      r.post('/docker/restart', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const conn = list.find((c) => c.id === String(body.connectionId || ''));
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        const container = String(body.container || '').replace(/['"`;]/g, '');
        if (!container) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: 'container 必填' }); return; }
        if (isProduction(conn) && !body.confirmed) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(428).json({ error: `生产连接上重启容器 ${container} 需二次确认` });
          return;
        }
        try {
          const r = await execOnConnection(conn, `docker restart ${JSON.stringify(container)}`, 60000);
          await audit('docker_restart', { connection: conn.name, detail: container, ok: r.code === 0 });
          (res as { json: (d: unknown) => void }).json({ data: { ok: r.code === 0, output: r.stdout || r.stderr } });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      // ===== SFTP 文件管理器（远端目录列举 + 上传/下载 + 目录操作） =====
      // 进度走 SSE：上传/下载/**删除**启动后返回 jobId，前端连 /sftp/progress/:id/stream 订阅，
      // 据此渲染「任务列表」（2026-10-16 起三类操作同一套任务模型，见 SftpJob 注释）。
      const sftpJobs = new Map<string, SftpJob>();
      /** 新建一条任务记录（三类操作共用的入口，省得三处各写一遍字段） */
      const newJob = (
        kind: SftpJob['kind'],
        label: string,
        opts: { totalCount: number; totalBytes?: number },
      ): string => {
        const jobId = `sftp-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        sftpJobs.set(jobId, {
          kind, label, state: 'running',
          transferred: 0, total: opts.totalBytes || 1,
          doneCount: 0, totalCount: opts.totalCount,
          currentFile: '',
          activeFiles: [],
          paused: false,
          deletedCount: 0, deleted: [],
        });
        return jobId;
      };
      /** 任务收尾：置终态 + 落库留痕 + 延时回收（留 3s 让正在订阅的 SSE 把最后状态推完） */
      const finishJob = (jobId: string, state: 'done' | 'failed', error?: string) => {
        const j = sftpJobs.get(jobId);
        if (j) { j.state = state; if (error) j.error = error; }
        setTimeout(() => sftpJobs.delete(jobId), 3000);
        if (!j) return;
        // ★ 落库（用户要求「这些数据都要入库」）：内存记录 3 秒后就回收了，
        //   不写下来的话，刷新一下"刚才删了哪些文件"就查无此事。
        const isDelete = j.kind === 'delete';
        const all = isDelete ? j.deleted : (j.plan ?? []);
        const total = isDelete ? j.deletedCount : (j.planTotal ?? all.length);
        void pushJobHistory({
          id: jobId, kind: j.kind, label: j.label, state,
          at: Date.now(),
          totalCount: j.totalCount, doneCount: j.doneCount, totalBytes: j.total,
          error,
          deletedCount: isDelete ? j.deletedCount : undefined,
          detail: all.slice(-MAX_HISTORY_DETAIL),
          detailTruncated: total > MAX_HISTORY_DETAIL,
        });
      };
      const json = (res: unknown, body: unknown) => (res as { json: (d: unknown) => void }).json(body);
      const fail = (res: unknown, code: number, msg: string) =>
        (res as { status: (n: number) => { json: (d: unknown) => void } }).status(code).json({ error: msg });

      /** 解析连接 + 打开 SFTP，复用工具层 resolveConn 语义（按 id/name） */
      async function resolveSftpConn(req: unknown, res: unknown, idFromQueryOrBody: string): Promise<{ conn: StoredConnection; sftp: SFTPWrapper } | null> {
        const list = await loadConnections();
        const conn =
          list.find((c) => c.id === idFromQueryOrBody) || list.find((c) => c.name === idFromQueryOrBody);
        if (!conn || (conn.type !== 'ssh' && conn.type !== 'docker')) {
          fail(res, 404, '连接不存在或不是 SSH 类型');
          return null;
        }
        try {
          const sftp = await getSftp(conn);
          return { conn, sftp };
        } catch (e) {
          fail(res, 500, `SFTP 打开失败: ${(e as Error).message}`);
          return null;
        }
      }

      // 列目录
      r.get('/sftp/list', async (req: unknown, res: unknown) => {
        const q = (req as { query: Record<string, string> }).query;
        const got = await resolveSftpConn(req, res, q.connectionId || '');
        if (!got) return;
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const path = normalizeRemotePath(q.path || root, root);
        try {
          const entries = await listRemoteDir(got.sftp, path);
          json(res, { data: { path, entries, root } });
        } catch (e) {
          fail(res, 500, `列目录失败: ${(e as Error).message}`);
        } finally {
          try { got.sftp.end(); } catch { /* ignore */ }
        }
      });

      // 新建目录
      r.post('/sftp/mkdir', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const path = normalizeRemotePath(String(body.path || ''), root);
        try {
          await new Promise<void>((resolve, reject) =>
            got.sftp.mkdir(path, (err) => (err ? reject(err) : resolve())),
          );
          await audit('sftp.mkdir', { connection: got.conn.name, detail: path, ok: true });
          json(res, { data: { ok: true } });
        } catch (e) {
          fail(res, 500, `新建目录失败: ${(e as Error).message}`);
        } finally {
          try { got.sftp.end(); } catch { /* ignore */ }
        }
      });

      // 重命名 / 移动
      r.post('/sftp/rename', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const from = normalizeRemotePath(String(body.from || ''), root);
        const to = normalizeRemotePath(String(body.to || ''), root);
        try {
          await new Promise<void>((resolve, reject) =>
            got.sftp.rename(from, to, (err) => (err ? reject(err) : resolve())),
          );
          await audit('sftp.rename', { connection: got.conn.name, detail: `${from} → ${to}`, ok: true });
          json(res, { data: { ok: true } });
        } catch (e) {
          fail(res, 500, `重命名失败: ${(e as Error).message}`);
        } finally {
          try { got.sftp.end(); } catch { /* ignore */ }
        }
      });

      // 删除（文件 / 目录连同内容一起；生产二次确认）
      //
      // ★ 2026-10-16 改造成「任务」（用户要求：「删除远程目录或文件都要有记录，尤其是删除
      //   目录最后有个地方能看到实时删除的文件」）：
      //   旧实现**同步**删完才回一个 ok —— 删一个几万条的目录时界面整个卡住，也不知道
      //   删到哪儿了、删成了没有。现在立刻回 jobId，删除在后台逐条跑，边删边把「刚删掉的
      //   路径」推给界面（实时列表）；跑完落一条**含条目数与路径样本**的审计（留痕）。
      //   审计只落一条（不是每文件一条）：审计上限 500 条，按文件落会把整个日志冲掉。
      r.post('/sftp/unlink', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        if (isProduction(got.conn) && !body.confirmed) {
          fail(res, 428, '生产连接删除文件需二次确认');
          return;
        }
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const path = normalizeRemotePath(String(body.path || ''), root);
        // 先探一次类型（不跟随软链）：任务名与审计要说清删的是目录还是文件，删之前问准。
        let isDir = false;
        try {
          isDir = (await lstatRemote(got.sftp, path)).isDir;
        } catch (e) {
          fail(res, 404, `路径不可读：${(e as Error).message}`);
          try { got.sftp.end(); } catch { /* ignore */ }
          return;
        }
        const jobId = newJob('delete', `${isDir ? '删除目录' : '删除文件'} ${path}`, { totalCount: 1 });
        json(res, { data: { jobId, kind: 'delete', path, isDir } });
        void (async () => {
          const job = sftpJobs.get(jobId);
          try {
            await removeRemoteRecursive(got.sftp, path, { n: 0 }, (p) => {
              const j = sftpJobs.get(jobId);
              if (!j) return;
              j.deletedCount += 1;
              j.doneCount = j.deletedCount;
              j.deleted.push(p);
              // 超上限只丢最旧的明细（计数照累），见 MAX_JOB_DELETED_KEEP
              if (j.deleted.length > MAX_JOB_DELETED_KEEP) {
                j.deleted.splice(0, j.deleted.length - MAX_JOB_DELETED_KEEP);
              }
            });
            await audit('sftp.delete', {
              connection: got.conn.name,
              detail: `${path}（${isDir ? '目录' : '文件'}，共删 ${job?.deletedCount ?? 0} 项）${job ? auditPathTail(job.deleted) : ''}`,
              ok: true,
            });
            finishJob(jobId, 'done');
          } catch (e) {
            const msg = (e as Error).message;
            // 失败也要留痕：删了一半报错时，"已删掉哪些" 是事后排查的关键信息
            await audit('sftp.delete', {
              connection: got.conn.name,
              detail: `${path} 删除失败（已删 ${job?.deletedCount ?? 0} 项）：${msg}`,
              ok: false,
            });
            finishJob(jobId, 'failed', msg);
          } finally {
            try { got.sftp.end(); } catch { /* ignore */ }
          }
        })();
      });

      // ===== 本地目录操作（本地栏用） =====
      // 桌面端的服务进程就在本机，本地 fs 直接做即可，不必绕 Electron IPC。
      // 与 /sftp/download 同一信任模型（都接受客户端给的本地路径），但多了两道自保：
      // 拒绝根路径（删了不可挽回）、删目录必须显式带 recursive。
      /** 是否是文件系统根 / 盘符根 —— 这类路径删掉不可挽回 */
      const isLocalRoot = (p: string): boolean => {
        const norm = p.trim().replace(/[\\/]+$/, '');
        if (!norm) return true;              // '/' 或 '\'
        return /^[a-zA-Z]:$/.test(norm);     // 'C:'（'C:/' 'C:\' 去尾斜杠后）
      };
      const localPathOf = (v: unknown): string => String(v || '').trim();

      r.post('/local/mkdir', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const p = localPathOf(body.path);
        if (!p) { failRes(res, 400, '路径不能为空'); return; }
        try {
          mkdirSync(p, { recursive: true });
          await audit('local.mkdir', { detail: p, ok: true });
          jsonRes(res).json({ data: { ok: true } });
        } catch (e) {
          failRes(res, 500, `新建目录失败: ${(e as Error).message}`);
        }
      });

      r.post('/local/rename', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const from = localPathOf(body.from);
        const to = localPathOf(body.to);
        if (!from || !to) { failRes(res, 400, '源路径与目标路径均必填'); return; }
        if (isLocalRoot(from)) { failRes(res, 400, '拒绝操作文件系统根路径'); return; }
        try {
          renameSync(from, to);
          await audit('local.rename', { detail: `${from} → ${to}`, ok: true });
          jsonRes(res).json({ data: { ok: true, to } });
        } catch (e) {
          failRes(res, 500, `重命名失败: ${(e as Error).message}`);
        }
      });

      r.post('/local/delete', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const p = localPathOf(body.path);
        if (!p) { failRes(res, 400, '路径不能为空'); return; }
        if (isLocalRoot(p)) { failRes(res, 400, '拒绝删除文件系统根路径'); return; }
        try {
          const st = lstatSync(p);
          if (st.isDirectory()) {
            // 目录必须显式带 recursive：纯本地接口静默递归删整棵树太容易误伤
            if (body.recursive !== true) { failRes(res, 400, '删除目录需显式带 recursive: true'); return; }
            rmSync(p, { recursive: true, force: true });
          } else {
            rmSync(p, { force: true });
          }
          await audit('local.delete', { detail: p, ok: true });
          jsonRes(res).json({ data: { ok: true } });
        } catch (e) {
          failRes(res, 500, `删除失败: ${(e as Error).message}`);
        }
      });

      // 备份文件：同目录复制一份带时间戳的副本（<名>.bak-YYYYMMDD-HHmmss）
      r.post('/sftp/backup', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        if (isProduction(got.conn) && !body.confirmed) {
          fail(res, 428, '生产连接写文件需二次确认');
          return;
        }
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const path = normalizeRemotePath(String(body.path || ''), root);
        try {
          const st = await statRemote(got.sftp, path);
          if (st.isDir) { fail(res, 400, '备份只支持文件，不支持目录'); return; }
          const target = backupRemoteName(path);
          await copyRemoteFile(got.sftp, path, target);
          await audit('sftp.backup', { connection: got.conn.name, detail: `${path} → ${target}`, ok: true });
          json(res, { data: { ok: true, from: path, to: target } });
        } catch (e) {
          fail(res, 500, `备份失败: ${(e as Error).message}`);
        } finally {
          try { got.sftp.end(); } catch { /* ignore */ }
        }
      });

      /**
       * 任务进度订阅（SSE）。
       *
       * ★ 2026-10-16 改：以 `state` 为准（running / done / failed），**终态那一帧推完就关流**。
       *   旧版靠读字节数猜状态（0/1=完成、-1=失败），既要客户端也懂这套暗号，又一旦
       *   客户端漏读最后一帧就永远收不到终止信号。关流是协议层面的事实，谁都躲不过。
       *   首帧立刻推一次：几百毫秒就结束的小任务，不等第一个 300ms 心跳也能看到结果。
       */
      function sftpProgressStream(req: unknown, res: unknown, jobId: string) {
        const job = sftpJobs.get(jobId);
        const rr = res as unknown as {
          status: (n: number) => { json: (d: unknown) => void };
          setHeader: (k: string, v: string) => void;
          write: (d: string) => void;
          end: (d?: string) => void;
          on: (ev: string, cb: (...a: unknown[]) => void) => void;
        };
        if (!job) { rr.status(404).json({ error: '任务不存在' }); return; }
        rr.setHeader('Content-Type', 'text/event-stream');
        rr.setHeader('Cache-Control', 'no-cache');
        rr.setHeader('Connection', 'keep-alive');
        rr.setHeader('X-Accel-Buffering', 'no');
        rr.write(':connected\n\n');
        let closed = false;
        // ⚠️ timer 必须先声明成可空：首帧 push() 就可能落在终态上并回调 stop()，
        //    那时定时器还没建起来（TDZ 会直接抛，而不是"清掉一个不存在的定时器"）。
        let timer: ReturnType<typeof setInterval> | null = null;
        const stop = () => { if (closed) return; closed = true; if (timer !== null) clearInterval(timer); };
        const push = (): boolean => {
          const j = sftpJobs.get(jobId);
          // 任务记录已被回收（正常只发生在终态之后）：报一次 failed 让界面别停在「进行中」
          if (!j) {
            try { rr.write(`data:${JSON.stringify({ state: 'failed', error: '任务已结束' })}\n\n`); rr.end(); } catch { /* ignore */ }
            stop();
            return false;
          }
          try {
            rr.write(`data:${JSON.stringify(jobPayload(j))}\n\n`);
          } catch {
            stop();
            return false;
          }
          if (j.state !== 'running') {
            // 终态：把这一帧冲刷出去再关流（不关的话客户端只能靠超时判断"已经结束了"）
            setTimeout(() => { try { rr.end(); } catch { /* ignore */ } }, 50);
            stop();
            return false;
          }
          return true;
        };
        if (!push()) return;
        timer = setInterval(push, 300);
        (req as unknown as { on: (ev: string, cb: (...a: unknown[]) => void) => void }).on('close', stop);
      }

      // 上传（单文件 / 多文件 / 文件夹；目录由后端递归展开，前端只需传绝对路径）
      r.post('/sftp/upload', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        // 生产连接写操作二次确认
        if (isProduction(got.conn) && !body.confirmed) {
          fail(res, 428, '生产连接上传文件需二次确认');
          return;
        }
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const destDir = normalizeRemotePath(String(body.destDir || ''), root);
        // files: [{ localPath, rel }]；rel 为相对目标目录的路径前缀，缺省取本地 basename
        const files = Array.isArray(body.files) ? (body.files as Array<{ localPath?: string; rel?: string }>) : [];
        if (!files.length) { fail(res, 400, 'files 不能为空'); return; }

        // 展开上传清单：目录 → 递归成文件列表（拖入文件夹无需前端预处理）
        let plan: Array<{ src: string; dest: string; size: number }> = [];
        let totalBytes = 0;
        try {
          const built = buildUploadPlan(files, destDir);
          plan = built.plan;
          totalBytes = built.totalBytes;
        } catch (e) {
          fail(res, 400, `本地路径不可读：${(e as Error).message}`);
          return;
        }
        if (!plan.length) { fail(res, 400, '没有可上传的文件（目录为空？）'); return; }

        // 进度按总字节聚合，多文件/文件夹上传时进度条不会来回跳；
        // 同时给条目口径（doneCount/totalCount）与「当前文件」，供任务列表显示"第几个 / 正在传谁"
        const jobId = newJob('upload', `上传 → ${destDir}`, { totalCount: plan.length, totalBytes });
        // 留一份待传清单在任务上，任务收尾时落库（★ 不进 SSE 帧：几千条会把每一帧撑爆，
        //   界面上的待执行清单是拿这个响应里的 plan 渲染的）
        const jobForPlan = sftpJobs.get(jobId);
        if (jobForPlan) {
          jobForPlan.plan = plan.slice(0, MAX_UPLOAD_PLAN_ITEMS).map((p) => p.dest);
          jobForPlan.planTotal = plan.length;
        }
        // ★ 2026-10-16 把**扫描结果**一并回给前端（用户要求「先把要上传的文件扫描后排队上传」）：
        //   队列要在界面上分「已传 / 正在传 / 待传」三段展示，所以清单得在上传开始前就到手。
        //   截断上限：几万个文件时没必要把整张清单塞进响应体（count/total 仍是准确的全量口径）。
        const planForUi = plan.slice(0, MAX_UPLOAD_PLAN_ITEMS).map((p) => ({ name: p.dest, size: p.size }));
        json(res, {
          data: {
            jobId, kind: 'upload', count: plan.length, total: totalBytes, destDir,
            plan: planForUi,
            planTruncated: plan.length > planForUi.length,
          },
        });
        // 异步执行，不阻塞响应
        void (async () => {
          try {
            /**
             * 目标目录 → **"建目录"这个动作本身**（Promise），而不是"建过了"这个布尔事实。
             * ★ 为什么必须缓存 Promise（2026-10-17 用户实报「上传目录 4/27 失败：No such file」）：
             *   缓存布尔值时，worker B 看到 A 已经登记过，就**跳过等待直接开写** ——
             *   可那一刻 A 的 mkdir 还没回来，远端目录根本不存在，OPEN 立刻 NO_SUCH_FILE。
             *   串行上传时看不出来，并发 >1 才会露头：前面几个文件把目录建好了就"没事"，
             *   撞在窗口里的那个必挂。缓存 Promise 后，B await 的是同一个建目录动作，天然排队。
             */
            const dirReady = new Map<string, Promise<void>>();
            const ensureDirOnce = (dir: string): Promise<void> => {
              let ready = dirReady.get(dir);
              if (!ready) { ready = ensureRemoteDir(got.sftp, dir); dirReady.set(dir, ready); }
              return ready;
            };
            // 目标目录本身也可能还不存在（把东西拖进一个新目录）。先 stat 一次：
            // 常见情况（已存在）只花一个 RTT，不存在才逐级建。
            try { await statRemote(got.sftp, destDir); dirReady.set(destDir, Promise.resolve()); }
            catch { await ensureDirOnce(destDir); }
            let doneBytes = 0;
            let doneCount = 0;
            /** 在飞文件的字节进度：plan 下标 → 已传字节。
             *  ★ 并发下**必须逐文件记账**：串行时代码里那个"done + 当前文件已传"的写法
             *    在 N 路并飞时会漏算（done 只反映已完成，另外 N-1 个的字节全丢了）。 */
            const inFlight = new Map<number, number>();
            const syncProgress = () => {
              const j = sftpJobs.get(jobId);
              if (!j) return;
              let flying = 0;
              for (const v of inFlight.values()) flying += v;
              j.transferred = doneBytes + flying;
              j.doneCount = doneCount;
              j.activeFiles = [...inFlight.keys()].map((k) => plan[k].dest);
              j.currentFile = j.activeFiles[0] ?? '';
            };
            // 本次任务里**已经动过**的目标文件：只有它们才允许断点续传（见 sftpUploadRange 注释）
            const startedDests = new Set<string>();
            // 暂停闸门：调度层用它挡住「排队中的文件」，worker 里用它挡住「正在传的那个」
            const pauseGate = createPauseGate(() => sftpJobs.get(jobId));
            await runWithConcurrency(plan, uploadConcurrency, async (p, i) => {
              const parent = p.dest.slice(0, p.dest.lastIndexOf('/'));
              // ★ await 的是**同一个建目录动作**（见上面 dirReady 的注释）：
              //   并发 worker 共用它，不会有人抢在 mkdir 完成之前就开写。
              if (parent) await ensureDirOnce(parent);
              // ★ 一个文件是"循环"而不是"一次调用"：暂停要能停住正在传的**这一个**，
              //   恢复后从远端实际落盘的字节数接着写。
              //   断点取自 stat 远端、不取内存计数 —— 被中断时写流的缓冲里可能还有没落盘的字节。
              let offset = 0;
              if (startedDests.has(p.dest)) {
                try { offset = Math.min((await statRemote(got.sftp, p.dest)).size, p.size); } catch { offset = 0; }
              }
              startedDests.add(p.dest);
              inFlight.set(i, offset);
              syncProgress();
              try {
                for (;;) {
                  if (!sftpJobs.get(jobId)) throw new Error('任务已结束');
                  await pauseGate();
                  const r = await sftpUploadRange(
                    got.sftp, p.src, p.dest, offset,
                    (written) => { inFlight.set(i, written); syncProgress(); },
                    () => sftpJobs.get(jobId)?.paused === true,
                  );
                  if (r.cancelled) {
                    // 被暂停打断：断点以远端落盘的为准，回到循环顶部等恢复（continue 而不是 return）
                    try { offset = Math.min((await statRemote(got.sftp, p.dest)).size, p.size); } catch { offset = 0; }
                    continue;
                  }
                  if (r.written >= p.size) break;   // 传完了（0 字节文件也走这里收尾）
                  // 一次尝试一个字节都没推进 → 直接失败，别在这里空转
                  if (r.written <= offset) throw new Error('写入没有进展');
                  offset = r.written;
                }
              } catch (e) {
                // ssh2 的原话往往只有一句 "No such file"，不带路径 ——
                // 光看它没法知道是哪个文件、哪一级目录，补上才有得排查
                throw new Error(`「${p.dest}」上传失败：${(e as Error).message}`);
              } finally {
                inFlight.delete(i);
              }
              doneBytes += p.size;
              doneCount += 1;
              syncProgress();
            }, {
              beforeTake: pauseGate,
            });
            await audit('sftp.upload', { connection: got.conn.name, detail: `${plan.length} 个文件 → ${destDir}`, ok: true });
            finishJob(jobId, 'done');
          } catch (e) {
            const msg = (e as Error).message;
            logger.warn('[ops-sftp] 上传失败', e);
            await audit('sftp.upload', { connection: got.conn.name, detail: `${plan.length} 个文件 → ${destDir} 失败：${msg}`, ok: false });
            finishJob(jobId, 'failed', msg);
          } finally {
            try { got.sftp.end(); } catch { /* ignore */ }
          }
        })();
      });

      // 下载（单文件/单条绝对路径，fastGet 进度）
      r.post('/sftp/download', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const got = await resolveSftpConn(req, res, String(body.connectionId || ''));
        if (!got) return;
        const root = await resolveRemoteRoot(got.sftp, got.conn.sftpPath);
        const remotePath = normalizeRemotePath(String(body.remotePath || ''), root);
        const localPath = String(body.localPath || '').replace(/\\/g, '/');
        if (!localPath) { fail(res, 400, 'localPath 必填'); return; }
        // 本地父目录可能还不存在（如首次下载到 ~/下载），先递归建好再落盘
        const parent = localPath.slice(0, localPath.lastIndexOf('/'));
        if (parent) ensureLocalDir(parent);
        // 目录下载暂不支持（需递归遍历远端），给出明确指引而不是 fastGet 报晦涩错误
        try {
          const st = await statRemote(got.sftp, remotePath);
          if (st.isDir) { fail(res, 400, '暂不支持下载目录，请进入目录后选择文件下载'); return; }
        } catch (e) {
          fail(res, 404, `远端路径不可读：${(e as Error).message}`);
          return;
        }
        const localName = localPath.split('/').pop() || localPath;
        const jobId = newJob('download', `下载 ${localName}`, { totalCount: 1 });
        json(res, { data: { jobId, kind: 'download', name: localName } });
        void (async () => {
          try {
            const j0 = sftpJobs.get(jobId);
            if (j0) j0.currentFile = remotePath;
            await sftpFastGet(got.sftp, remotePath, localPath, (transferred, total) => {
              const j = sftpJobs.get(jobId);
              if (j) { j.transferred = transferred; j.total = total || 1; }
            });
            await audit('sftp.download', { connection: got.conn.name, detail: `${remotePath} → ${localPath}`, ok: true });
            const j1 = sftpJobs.get(jobId);
            if (j1) j1.doneCount = 1;
            finishJob(jobId, 'done');
          } catch (e) {
            const msg = (e as Error).message;
            logger.warn('[ops-sftp] 下载失败', e);
            await audit('sftp.download', { connection: got.conn.name, detail: `${remotePath} → ${localPath} 失败：${msg}`, ok: false });
            finishJob(jobId, 'failed', msg);
          } finally {
            try { got.sftp.end(); } catch { /* ignore */ }
          }
        })();
      });

      // 进度订阅（SSE）
      r.get('/sftp/progress/:id/stream', (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        sftpProgressStream(req, res, id);
      });

      // 暂停 / 继续（用户要求：「顶多加个暂停任务按钮」）
      // ★ 只有**上传**能暂停：上传是"扫描好的队列 + 一个有界并发窗口"，暂停就是不再领新文件，
      //   天然有安全点。下载/删除是一条路走到黑 —— 删除停在一半，远端留下的是删了半棵的目录树，
      //   比删完或没删都难收拾，所以这里直接拒掉，而不是给个"看起来能用"的按钮。
      // ★ 状态只改 `paused`，`state` 保持 running：SSE 流因此不关，界面才看得到「已暂停」，
      //   也不会被界面的终态判定误认成"结束了"。
      r.post('/sftp/job/pause', (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const jobId = String(body.jobId || '');
        const job = sftpJobs.get(jobId);
        if (!job) { fail(res, 404, '任务不存在（可能已结束）'); return; }
        if (job.kind !== 'upload') { fail(res, 400, '只有上传任务支持暂停'); return; }
        if (job.state !== 'running') { fail(res, 400, '任务已结束'); return; }
        // 不传 paused 就当"切换"，前端只管点按钮，不用自己维护一个可能过期的本地态
        job.paused = body.paused === undefined ? !job.paused : !!body.paused;
        json(res, { data: { jobId, paused: job.paused } });
      });

      // 已完成任务的历史（**落库的**，刷新/重启后还在）。
      // 「已执行完成」页靠它把明细翻出来 —— 内存里的任务 3 秒就回收了。
      r.get('/sftp/jobs/history', async (_req: unknown, res: unknown) => {
        const rows = await loadJobHistory();
        json(res, { data: rows.slice().reverse() }); // 最近的排最前
      });

      // 清空历史（用户要求：清除已完成要连库一起清，不能只清界面）
      r.delete('/sftp/jobs/history', async (_req: unknown, res: unknown) => {
        await clearJobHistory();
        json(res, { data: { cleared: true } });
      });

      // 删掉单条历史（用户要求：单个已完成任务也能删）
      r.delete('/sftp/jobs/history/:id', async (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const removed = await deleteJobHistory(id);
        if (!removed) { fail(res, 404, '历史记录不存在'); return; }
        json(res, { data: { removed: true } });
      });

      // 操作日志（工具执行审计）：运维控制台「操作日志」面板消费（倒序，最近 200 条）
      r.get('/audit', async (_req: unknown, res: unknown) => {
        const list = (pluginStorage ? await pluginStorage.get<AuditEntry[]>('audit') : []) || [];
        (res as { json: (d: unknown) => void }).json({ data: list.slice(-200).reverse() });
      });

      // 实时面板指标（只读遥测）：运维控制台左栏底部面板轮询消费。
      // 全部为只读命令，不入审计 —— 10s 轮询会把 500 条审计上限刷爆。
      r.get('/metrics', async (req: unknown, res: unknown) => {
        const q = (req as { query: Record<string, string> }).query || {};
        const connectionId = String(q.connectionId || '');
        const list = await loadConnections();
        const conn = list.find((c) => c.id === connectionId);
        if (!conn) { failRes(res, 404, '连接不存在'); return; }
        if (conn.type === 'database') { failRes(res, 400, '数据库连接不支持指标采集'); return; }
        const cmds = [
          'cat /proc/loadavg 2>/dev/null',
          'free -m 2>/dev/null',
          'df -hP / 2>/dev/null | tail -1',
          'ps aux --sort=-%cpu 2>/dev/null | head -6',
          'ps aux --sort=-%mem 2>/dev/null | head -6',
        ];
        try {
          const parts = await Promise.all(
            cmds.map((c) => execOnConnection(conn, c, 8000).catch(() => ({ stdout: '', stderr: '', code: 1 }))),
          );
          jsonRes(res).json({
            data: {
              loadavg: parts[0].stdout.trim(),
              mem: parts[1].stdout.trim(),
              disk: parts[2].stdout.trim(),
              topCpu: parts[3].stdout.trim(),
              topMem: parts[4].stdout.trim(),
            },
          });
        } catch (e) {
          failRes(res, 500, (e as Error).message);
        }
      });

      // 终端会话（命令模式）：open 返回 sessionId，SSE 读输出，POST 写输入
      const termSessions = new Map<string, { stream: ClientChannel; lastActive: number; recorder: TermRecorder | null }>();
      /** 收尾一条 SSE 会话的录像（幂等：recorder 置空后不会重复落库） */
      const stopTermRecording = (s: { recorder: TermRecorder | null }) => {
        if (!s.recorder) return;
        const meta = s.recorder.stop();
        s.recorder = null;
        void persistRecording(meta);
      };
      const termTimer = setInterval(() => {
        const now = Date.now();
        for (const [id, s] of termSessions) {
          if (now - s.lastActive > IDLE_TIMEOUT_MS) {
            stopTermRecording(s);
            try { s.stream.close(); } catch {}
            termSessions.delete(id);
          }
        }
      }, 60000);
      if (typeof termTimer.unref === 'function') termTimer.unref();

      r.post('/term/open', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const list = await loadConnections();
        const conn = list.find((c) => c.id === String(body.connectionId || ''));
        if (!conn) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '连接不存在' }); return; }
        try {
          const client = await getSsh(conn);
          const stream = await new Promise<ClientChannel>((resolve, reject) => {
            client.shell({ cols: Number(body.cols) || 120, rows: Number(body.rows) || 32 }, (err, s) => (err ? reject(err) : resolve(s!)));
          });
          const sessionId = `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          // SSE 回退通道同样录制：漏了它的话，走回退的会话在「录像」列表里会静默缺失
          let recorder: TermRecorder | null = null;
          if (recordSessions) {
            try {
              recorder = new TermRecorder({
                connectionId: conn.id, connectionName: conn.name, transport: 'sse',
                cols: Number(body.cols) || 120, rows: Number(body.rows) || 32,
              });
            } catch (e) {
              logger.warn('[ops-shell] 启动会话录制失败（终端不受影响）:', (e as Error).message);
            }
          }
          termSessions.set(sessionId, { stream, lastActive: Date.now(), recorder });
          // 默认命令：前端明确要求时（autoRun !== false）在 shell 就绪后自动执行一次
          const defaultCommand = String(body.defaultCommand ?? conn.defaultCommand ?? '').trim();
          const autoRun = body.autoRun !== false && !!defaultCommand && conn.type !== 'database';
          if (autoRun) {
            // 稍等 shell 提示符就绪再写入，避免命令被登录 banner 吞掉
            setTimeout(() => {
              try { stream.write(`${defaultCommand}\n`); } catch { /* 会话已关 */ }
            }, 600);
            await audit('term.default_command', { connection: conn.name, detail: defaultCommand.slice(0, 200), ok: true });
          }
          await audit('term.open', { connection: conn.name, ok: true });
          (res as { json: (d: unknown) => void }).json({
            data: { sessionId, defaultCommand: defaultCommand || null, autoRun: !!autoRun },
          });
        } catch (e) {
          (res as { json: (d: unknown) => void }).json({ error: (e as Error).message });
        }
      });

      r.post('/term/:id/input', async (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const data = String((req as { body: { data?: string } }).body?.data || '');
        const s = termSessions.get(id);
        if (!s) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '会话已关闭' }); return; }
        s.lastActive = Date.now();
        s.recorder?.input(data);
        s.stream.write(data);
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
      });

      r.post('/term/:id/resize', async (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const body = (req as { body: { cols?: number; rows?: number } }).body || {};
        const s = termSessions.get(id);
        if (!s) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '会话已关闭' }); return; }
        s.lastActive = Date.now();
        s.recorder?.resize(Number(body.cols) || 120, Number(body.rows) || 32);
        s.stream.setWindow(Number(body.rows) || 32, Number(body.cols) || 120, 0, 0);
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
      });

      r.get('/term/:id/stream', (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const s = termSessions.get(id);
        const rr = res as unknown as {
          status: (n: number) => { json: (d: unknown) => void };
          setHeader: (k: string, v: string) => void;
          write: (d: string) => void;
          end: (d?: string) => void;
          on: (ev: string, cb: (...a: unknown[]) => void) => void;
        };
        if (!s) { rr.status(404).json({ error: '会话已关闭' }); return; }
        s.lastActive = Date.now();
        rr.setHeader('Content-Type', 'text/event-stream');
        rr.setHeader('Cache-Control', 'no-cache');
        rr.setHeader('Connection', 'keep-alive');
        rr.setHeader('X-Accel-Buffering', 'no');
        rr.write(':connected\n\n');
        const onData = (d: Buffer) => {
          s.recorder?.output(d);
          try { rr.write(`data:${d.toString('base64')}\n\n`); } catch { cleanup(); }
        };
        const onClose = () => { try { rr.end(); } catch {} cleanup(); };
        const cleanup = () => {
          s.stream.removeListener('data', onData);
          s.stream.removeListener('close', onClose);
        };
        s.stream.on('data', onData);
        s.stream.on('close', onClose);
        (req as unknown as { on: (ev: string, cb: (...a: unknown[]) => void) => void }).on('close', cleanup);
      });

      r.post('/term/:id/close', async (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const s = termSessions.get(id);
        if (s) {
          stopTermRecording(s);
          try { s.stream.close(); } catch {}
          termSessions.delete(id);
        }
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
      });

      // ===== 会话录像 =====
      // 内容落在 <DATA_DIR>/ops-recordings/。列表只回元数据，正文按 id 单独取 ——
      // 否则几百 KB 的 .cast 会把列表接口撑成一次全量下载。
      r.get('/recordings', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: await loadRecordings(), recording: recordSessions });
      });

      // 取某条录像用于回放：服务端解析好再下发 ——
      // 前端就不必再实现一份 .cast 解析器（两份解析必然漂移），也省掉一次前端 JSON.parse 循环。
      r.get('/recordings/:id/play', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const text = readRecordingFile(id);
        if (text === null) { failRes(res, 404, '录像不存在或已被清理'); return; }
        const { header, events, skipped } = parseCast(text);
        const duration = events.reduce((m, e) => Math.max(m, e.t), 0);
        jsonRes(res).json({ data: { header, events, skipped, duration } });
      });

      // 删除某条录像（连同 .cast 文件）
      r.delete('/recordings/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const list = await loadRecordings();
        if (!list.some((x) => x.id === id)) { failRes(res, 404, '录像不存在'); return; }
        removeRecordingFile(id);
        try {
          await pluginStorage?.set('recordings', list.filter((x) => x.id !== id));
        } catch (e) {
          failRes(res, 500, (e as Error).message);
          return;
        }
        jsonRes(res).json({ data: { ok: true } });
      });

      // ===== 主机密钥（known_hosts）=====
      // 这个页面的职责就两件事：看清「这台机器的密钥是哪一把」，
      // 以及在服务器合法换过密钥之后把它忘掉（下次连接重新 TOFU）。
      // 刻意不做「手工导入指纹」—— 没有真实密钥可比对时，让用户手抄一串 base64
      // 只会引入抄错的风险，而抄错等于把信任根交给一个自己都不确定的值。
      r.get('/known-hosts', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: await loadKnownHosts(), mode: hostKeyMode });
      });

      r.delete('/known-hosts/:hostPort', async (req: unknown, res: unknown) => {
        const hostPort = decodeURIComponent((req as { params: { hostPort: string } }).params.hostPort);
        const list = await loadKnownHosts();
        if (!list.some((k) => k.host === hostPort)) { failRes(res, 404, '该主机不在已知列表中'); return; }
        try {
          await saveKnownHosts(list.filter((k) => k.host !== hostPort));
        } catch (e) {
          failRes(res, 500, (e as Error).message);
          return;
        }
        await audit('hostkey.forget', { detail: hostPort, ok: true });
        jsonRes(res).json({ data: { ok: true } });
      });

      // ===== 命令审批闸门 =====
      // 模型在生产连接上发起的非只读命令会先落到这里，等人点批准/拒绝。
      // 批准与「连接 + 命令原文」绑定、用一次即失效（见 ops-approvals.ts）。
      r.get('/approvals', async (_req: unknown, res: unknown) => {
        jsonRes(res).json({ data: await loadApprovals() });
      });

      r.post('/approvals/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const approve = body.approve;
        // 必须显式给布尔值：缺省当成「批准」是最危险的默认
        if (typeof approve !== 'boolean') { failRes(res, 400, '必须显式给出 approve: true / false'); return; }
        const list = await loadApprovals();
        const idx = list.findIndex((a) => a.id === id);
        if (idx < 0) { failRes(res, 404, '该审批请求不存在或已过期'); return; }
        if (list[idx].status !== 'pending') { failRes(res, 409, '该请求已被处理'); return; }
        list[idx] = {
          ...list[idx],
          status: approve ? 'approved' : 'rejected',
          decidedAt: Date.now(),
          decidedBy: 'operator',
        };
        try {
          await saveApprovals(list);
        } catch (e) {
          failRes(res, 500, (e as Error).message);
          return;
        }
        await audit(approve ? 'approval.approved' : 'approval.rejected', {
          connection: list[idx].connectionName, detail: list[idx].command.slice(0, 200), ok: approve,
        });
        jsonRes(res).json({ data: list[idx] });
      });
    });
  },

  deactivate() {
    for (const [id] of sshPool) disconnect(id);
    pluginStorage = null;
  },
};
export { opsShellModule };
