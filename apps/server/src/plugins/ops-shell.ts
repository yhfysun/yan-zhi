// ops-shell 内置插件：服务器运维（SSH 命令执行 / 文件传输 / Docker 管理 / 数据库只读查询 / 交互式终端）。
// 形态对齐 computer-use（manifest + 入口模块 + 权限护栏 + 审计），默认启用（仅首次注册生效，之后随 DB 状态）。
// 实现：ssh2（纯 JS，无原生编译）+ Docker over SSH（远程执行 docker CLI，免 dockerode/本地 socket 依赖）
//      + mysql2/pg 直连数据库（只读护栏，单条 SELECT/SHOW/DESC/EXPLAIN/WITH）。
// 智能体挂载：a_builtin_ops_agent（db.ts seedAgents）绑定 plugin_ops-shell__* 工具，
// 对话模式走现有聊天链路；命令模式为 /ops 控制台的 xterm 终端（SSE 输出 + POST 输入）。
// 护栏：remote-shell 权限声明 / 危险命令黑名单 / 生产连接写操作二次确认 / 空闲会话回收 / 全量审计（plugin_storage.audit）。
import { getPluginManager } from '@yan-zhi/core';
import type { BuiltInTool, McpCallResult, PluginManifest, PluginModule } from '@yan-zhi/core';
import { Client } from 'ssh2';
import { readdirSync, lstatSync, mkdirSync } from 'node:fs';
import mysql from 'mysql2/promise';
import pg from 'pg';
import type { ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2';
import { encrypt, decrypt } from '../utils/crypto.js';
import { guard, capOutput, isProductionTag } from './ops-shell-guard.js';

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
    sidebar: [
      {
        id: 'ops',
        label: '运维',
        route: '/ops',
        icon: 'ops',
        // 进「更多」下拉新建「运维」分组（桌面 TitleBar）；缺省时渲染侧栏「插件」分组
        moreGroup: 'ops',
        moreGroupLabel: '运维',
        desc: '服务器 · Docker · 数据库',
        order: 10,
      },
    ],
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
  createdAt: number;
}

interface StoredConnection extends Omit<OpsConnection, 'secretEnc'> {
  secretEnc: string;
}

/** 资源目录（分类分组）：与连接平级，用于左侧树形归类 */
interface OpsGroup {
  id: string;
  name: string;
  createdAt: number;
}

let pluginStorage: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> } | null = null;

async function loadConnections(): Promise<StoredConnection[]> {
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
    createdAt: base?.createdAt ?? Date.now(),
  };
}

/** SFTP 默认目录兜底：把相对路径拼到 sftpPath 下；已是绝对路径或未配置则原样返回 */
function resolveRemotePath(conn: StoredConnection, remotePath: string): string {
  const p = remotePath.trim();
  if (/^[/~]/.test(p) || !conn.sftpPath) return p;
  return `${conn.sftpPath.replace(/\/+$/, '')}/${p.replace(/^\.\//, '')}`;
}

// ---------- SSH 连接池 ----------

interface PoolEntry {
  client: Client;
  lastUsed: number;
}
const sshPool = new Map<string, PoolEntry>();
const IDLE_TIMEOUT_MS = 600000;

function getSsh(conn: StoredConnection): Promise<Client> {
  const cached = sshPool.get(conn.id);
  if (cached) {
    cached.lastUsed = Date.now();
    return Promise.resolve(cached.client);
  }
  return new Promise((resolve, reject) => {
    const client = new Client();
    const cfg: ConnectConfig = {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      readyTimeout: 15000,
      keepaliveInterval: 30000,
    };
    if (conn.authType === 'key') cfg.privateKey = Buffer.from(decrypt(conn.secretEnc), 'utf8');
    else cfg.password = decrypt(conn.secretEnc);
    client
      .on('ready', () => {
        sshPool.set(conn.id, { client, lastUsed: Date.now() });
        client.once('close', () => sshPool.delete(conn.id));
        client.once('error', () => sshPool.delete(conn.id));
        resolve(client);
      })
      .on('error', (err: Error) => reject(new Error(`SSH 连接失败: ${err.message}`)))
      .connect(cfg);
  });
}

function disconnect(connId: string): void {
  const e = sshPool.get(connId);
  if (e) {
    try { e.client.end(); } catch {}
    sshPool.delete(connId);
  }
}

/** 一次性 SSH 连接（不入连接池）：表单内「测试连接」用，测完即断 */
function sshProbe(conn: StoredConnection): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const cfg: ConnectConfig = {
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      readyTimeout: 15000,
    };
    if (conn.authType === 'key') cfg.privateKey = Buffer.from(decrypt(conn.secretEnc), 'utf8');
    else cfg.password = decrypt(conn.secretEnc);
    client
      .on('ready', () => resolve(client))
      .on('error', (err: Error) => reject(new Error(`SSH 连接失败: ${err.message}`)))
      .connect(cfg);
  });
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

function getSftp(conn: StoredConnection): Promise<SFTPWrapper> {
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

async function statRemote(sftp: SFTPWrapper, path: string): Promise<{ mode: number; size: number; mtime: number; isDir: boolean }> {
  const st = await new Promise<{ mode: number; size: number; mtime: number }>((resolve, reject) =>
    sftp.stat(path, (err, s) => (err ? reject(err) : resolve(s as never))),
  );
  return { mode: st.mode, size: st.size ?? 0, mtime: (st.mtime ?? 0) * 1000, isDir: modeIsDir(st.mode) };
}

/** fastPut 封装：带 step 进度回调（transferred 为已传字节，total 为文件总大小） */
function sftpFastPut(sftp: SFTPWrapper, localPath: string, remotePath: string, onStep: (transferred: number, total: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    sftp.fastPut(localPath, remotePath, { step: (transferred, _chunk, total) => onStep(transferred, total) }, (err) => (err ? reject(err) : resolve())),
  );
}

/** fastGet 封装：带 step 进度回调 */
function sftpFastGet(sftp: SFTPWrapper, remotePath: string, localPath: string, onStep: (transferred: number, total: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) =>
    sftp.fastGet(remotePath, localPath, { step: (transferred, _chunk, total) => onStep(transferred, total) }, (err) => (err ? reject(err) : resolve())),
  );
}

/** 逐级创建远程目录（ssh2 mkdir 不支持 recursive），忽略已存在 */
async function ensureRemoteDir(sftp: SFTPWrapper, dirPath: string): Promise<void> {
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
function collectLocalFiles(dirAbs: string, relPrefix = ''): Array<{ abs: string; rel: string }> {
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
  if (!pluginStorage) return;
  const list = (await pluginStorage.get<AuditEntry[]>('audit')) || [];
  list.push({ at: Date.now(), action, ...opts });
  await pluginStorage.set('audit', list.slice(-500));
}

// ---------- SSH 命令执行 ----------

function sshExec(client: Client, command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
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

async function execOnConnection(conn: StoredConnection, command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
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
  if (conn.dbType === 'postgres') {
    const client = new pg.Client({
      host: conn.host, port: conn.port || 5432, user: conn.username,
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
      host: conn.host, port: conn.port || 3306, user: conn.username,
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
      description: '在指定 SSH 连接上执行 shell 命令并返回 stdout/stderr/退出码。生产标签连接的非只读命令需 confirmed=true。危险命令（rm -rf /、mkfs、dd、shutdown 等）一律拒绝。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          command: { type: 'string', description: '要执行的 shell 命令' },
          confirmed: { type: 'boolean', description: '生产连接非只读命令时必须为 true' },
          timeoutMs: { type: 'number', description: '超时毫秒数，默认 30000' },
        },
        required: ['connection', 'command'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const command = String(args.command || '');
        const rejected = guard(command, { isProduction: isProduction(conn), confirmed: !!args.confirmed });
        if (rejected) { await audit('ssh_exec.rejected', { connection: conn.name, detail: command.slice(0, 200), ok: false }); return textResult(rejected); }
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
        '通过 SFTP 上传本机文件到远程服务器。remotePath 传相对路径时会自动拼到该连接的 SFTP 默认目录下；省略 remotePath 则上传到默认目录。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          localPath: { type: 'string', description: '本机文件绝对路径' },
          remotePath: { type: 'string', description: '远程目标路径；相对路径按连接的 SFTP 默认目录解析，省略则用默认目录' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'localPath'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
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
      description: '重启远程服务器上的指定容器（docker restart）。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          container: { type: 'string', description: '容器名或 ID' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'container'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const container = String(args.container || '').replace(/['"`;]/g, '');
        if (!container) return textResult('容器名不能为空');
        if (isProduction(conn) && !args.confirmed) {
          return textResult(`生产连接上重启容器 ${container} 需确认后带 confirmed=true 重新调用`);
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
        const lines = conns.map((c) => {
          const addr = c.type === 'database'
            ? `${c.username}@${c.host}:${c.port}/${c.database || ''}`
            : `${c.username}@${c.host}:${c.port}`;
          const bits = [`类型=${c.type}`, `地址=${addr}`, `目录=${gname(c.groupId)}`];
          if (c.tag) bits.push(`标签=${c.tag}`);
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
          sftpPath: { type: 'string', description: 'SFTP 默认目录（可选）' },
          defaultCommand: { type: 'string', description: '进终端后自动执行的命令（可选）' },
          note: { type: 'string', description: '备注（可选）' },
        },
        required: ['name', 'host', 'username'],
      },
      execute: async (args) => {
        const groupName = String(args.group || '').trim();
        let groupId: string | undefined;
        if (groupName) {
          const groups = await loadGroups();
          const g = groups.find((x) => x.name === groupName);
          if (!g) return textResult(`目录「${groupName}」不存在。现有目录：${groups.map((x) => x.name).join('、') || '（无）'}`);
          groupId = g.id;
        }
        const input = parseConnInput({
          ...args,
          secret: String(args.password || args.privateKey || ''),
          groupId,
        });
        const invalid = validateConnInput(input, { requireSecret: true });
        if (invalid) return textResult(invalid);
        const list = await loadConnections();
        if (list.some((c) => c.name === input.name)) return textResult(`连接「${input.name}」已存在，要改它请用 conn_update`);
        const conn = buildConnection(input);
        list.push(conn);
        try {
          await saveConnections(list);
        } catch (e) {
          return textResult(`保存失败: ${(e as Error).message}`);
        }
        await audit('connection.create', { connection: conn.name, detail: 'agent tool', ok: true });
        return textResult(`已新建连接「${conn.name}」（${conn.type} ${conn.username}@${conn.host}:${conn.port}），目录：${groupName || '未分组'}`);
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
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
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
        };
        const invalid = validateConnInput(input, { requireSecret: false });
        if (invalid) return textResult(invalid);
        const list = await loadConnections();
        const idx = list.findIndex((c) => c.id === conn.id);
        if (idx < 0) return textResult('连接不存在');
        if (list.some((c) => c.id !== conn.id && c.name === input.name)) return textResult(`连接「${input.name}」已存在`);
        list[idx] = buildConnection(input, list[idx]);
        try {
          await saveConnections(list);
        } catch (e) {
          return textResult(`保存失败: ${(e as Error).message}`);
        }
        disconnect(conn.id); // 字段变了，池里的旧连接不能继续复用
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
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接删除需确认后带 confirmed=true 重新调用');
        const list = await loadConnections();
        try {
          await saveConnections(list.filter((c) => c.id !== conn.id));
        } catch (e) {
          return textResult(`删除失败: ${(e as Error).message}`);
        }
        disconnect(conn.id);
        await audit('connection.delete', { connection: conn.name, detail: 'agent tool', ok: true });
        return textResult(`已删除连接「${conn.name}」`);
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
      description: '在远程创建目录（父目录不存在会一并创建）。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          path: { type: 'string', description: '要创建的远程目录；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'path'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
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
      description: '重命名 / 移动远程文件或目录。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名（或 connectionId）' },
          from: { type: 'string', description: '原路径；相对路径按 SFTP 默认目录解析' },
          to: { type: 'string', description: '新路径；相对路径按 SFTP 默认目录解析' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'from', 'to'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (conn.type === 'database') return textResult('数据库连接不支持文件操作');
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
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
        + '改配置前先备份是个好习惯。只能备份文件，不支持目录。生产连接需 confirmed=true。',
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
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
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
      description: '删除远程文件（不支持目录，目录请用 ssh_exec 的 rm -r 并自行确认）。生产连接需 confirmed=true。',
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
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
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

const opsShellModule: PluginModule = {
  activate(ctx) {
    pluginStorage = ctx.storage;

    // 注册工具（供智能体挂载，运行时名 plugin_ops-shell__<tool>）
    for (const tool of makeTools()) {
      ctx.registerTool(tool);
    }

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

      // 新建目录（同级重名拒绝）
      r.post('/groups', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        if (!name) { failRes(res, 400, '目录名称必填'); return; }
        const list = await loadGroups();
        if (list.some((g) => g.name === name)) { failRes(res, 409, `目录「${name}」已存在`); return; }
        const group: OpsGroup = { id: `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, createdAt: Date.now() };
        list.push(group);
        try { await saveGroups(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: group });
      });

      // 重命名目录
      r.put('/groups/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        if (!name) { failRes(res, 400, '目录名称必填'); return; }
        const list = await loadGroups();
        const idx = list.findIndex((g) => g.id === id);
        if (idx < 0) { failRes(res, 404, '目录不存在'); return; }
        if (list.some((g) => g.id !== id && g.name === name)) { failRes(res, 409, `目录「${name}」已存在`); return; }
        list[idx] = { ...list[idx], name };
        try { await saveGroups(list); } catch (e) { failRes(res, 500, (e as Error).message); return; }
        jsonRes(res).json({ data: list[idx] });
      });

      // 删除目录：其下连接回落为「未分组」（连接本身不删）
      r.delete('/groups/:id', async (req: unknown, res: unknown) => {
        const id = (req as { params: { id: string } }).params.id;
        const groups = await loadGroups();
        if (!groups.some((g) => g.id === id)) { failRes(res, 404, '目录不存在'); return; }
        const conns = await loadConnections();
        for (const c of conns) if (c.groupId === id) delete c.groupId;
        try {
          await saveGroups(groups.filter((g) => g.id !== id));
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
        try {
          await saveConnections(list);
        } catch (e) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(500).json({ error: (e as Error).message });
          return;
        }
        // 主机/端口/账号/密钥有变动 → 断开旧 SSH 会话，避免复用失效连接
        const changed =
          base.host !== next.host || base.port !== next.port || base.username !== next.username ||
          base.authType !== next.authType || base.secretEnc !== next.secretEnc;
        if (changed) disconnect(id);
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
            const client = await sshProbe(probe);
            try {
              const cmd = probe.type === 'docker' ? 'docker ps >/dev/null 2>&1 && echo ok' : 'echo ok';
              const r = await sshExec(client, cmd, 15000);
              if (!r.stdout.includes('ok')) throw new Error(r.stderr.trim() || `命令退出码 ${r.code}`);
            } finally {
              try { client.end(); } catch { /* ignore */ }
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
        disconnect(id);
        try {
          await saveConnections(next);
        } catch (e) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(500).json({ error: (e as Error).message });
          return;
        }
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
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
      // 进度走 SSE：上传/下载启动后返回 sessionId，前端连 /sftp/progress/:id/stream 订阅
      const sftpJobs = new Map<string, { aborted: boolean; last: { transferred: number; total: number } }>();
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

      // 删除（仅文件/空目录；生产二次确认）
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
        try {
          const st = await statRemote(got.sftp, path);
          if (st.isDir) {
            await new Promise<void>((resolve, reject) => got.sftp.rmdir(path, (err) => (err ? reject(err) : resolve())));
          } else {
            await new Promise<void>((resolve, reject) => got.sftp.unlink(path, (err) => (err ? reject(err) : resolve())));
          }
          await audit('sftp.delete', { connection: got.conn.name, detail: path, ok: true });
          json(res, { data: { ok: true } });
        } catch (e) {
          fail(res, 500, `删除失败(目录可能非空): ${(e as Error).message}`);
        } finally {
          try { got.sftp.end(); } catch { /* ignore */ }
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
        const timer = setInterval(() => {
          const j = sftpJobs.get(jobId);
          if (!j) { clearInterval(timer); try { rr.end(); } catch { /* ignore */ } return; }
          try { rr.write(`data:${JSON.stringify({ transferred: j.last.transferred, total: j.last.total })}\n\n`); } catch { clearInterval(timer); }
        }, 300);
        (req as unknown as { on: (ev: string, cb: (...a: unknown[]) => void) => void }).on('close', () => clearInterval(timer));
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

        // 进度按总字节聚合，多文件/文件夹上传时进度条不会来回跳
        const jobId = `sftp-up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const job = { aborted: false, last: { transferred: 0, total: totalBytes || 1 } };
        sftpJobs.set(jobId, job);
        json(res, { data: { jobId, count: plan.length, total: totalBytes } });
        // 异步执行，不阻塞响应
        void (async () => {
          try {
            const ensuredDirs = new Set<string>([destDir]);
            let done = 0;
            for (const p of plan) {
              const parent = p.dest.slice(0, p.dest.lastIndexOf('/'));
              if (parent && !ensuredDirs.has(parent)) {
                await ensureRemoteDir(got.sftp, parent);
                ensuredDirs.add(parent);
              }
              await sftpFastPut(got.sftp, p.src, p.dest, (transferred) => {
                job.last = { transferred: done + transferred, total: totalBytes || 1 };
              });
              done += p.size;
              job.last = { transferred: done, total: totalBytes || 1 };
            }
            await audit('sftp.upload', { connection: got.conn.name, detail: `${plan.length} 个文件 → ${destDir}`, ok: true });
            job.last = { transferred: 0, total: 1 }; // 完成标记
          } catch (e) {
            job.last = { transferred: -1, total: 1 }; // -1 表示失败
            console.warn('[ops-sftp] 上传失败', e);
          } finally {
            try { got.sftp.end(); } catch { /* ignore */ }
            setTimeout(() => sftpJobs.delete(jobId), 3000);
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
        const jobId = `sftp-dn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const job = { aborted: false, last: { transferred: 0, total: 0 } };
        sftpJobs.set(jobId, job);
        json(res, { data: { jobId } });
        void (async () => {
          try {
            await sftpFastGet(got.sftp, remotePath, localPath, (transferred, total) => {
              job.last = { transferred, total };
            });
            await audit('sftp.download', { connection: got.conn.name, detail: `${remotePath} → ${localPath}`, ok: true });
            job.last = { transferred: 0, total: 1 };
          } catch (e) {
            job.last = { transferred: -1, total: 1 };
            console.warn('[ops-sftp] 下载失败', e);
          } finally {
            try { got.sftp.end(); } catch { /* ignore */ }
            setTimeout(() => sftpJobs.delete(jobId), 3000);
          }
        })();
      });

      // 进度订阅（SSE）
      r.get('/sftp/progress/:id/stream', (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        sftpProgressStream(req, res, id);
      });

      // 操作日志（工具执行审计）：运维控制台「操作日志」面板消费（倒序，最近 200 条）
      r.get('/audit', async (_req: unknown, res: unknown) => {
        const list = (pluginStorage ? await pluginStorage.get<AuditEntry[]>('audit') : []) || [];
        (res as { json: (d: unknown) => void }).json({ data: list.slice(-200).reverse() });
      });

      // 终端会话（命令模式）：open 返回 sessionId，SSE 读输出，POST 写输入
      const termSessions = new Map<string, { stream: ClientChannel; lastActive: number }>();
      const termTimer = setInterval(() => {
        const now = Date.now();
        for (const [id, s] of termSessions) {
          if (now - s.lastActive > IDLE_TIMEOUT_MS) {
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
          termSessions.set(sessionId, { stream, lastActive: Date.now() });
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
        s.stream.write(data);
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
      });

      r.post('/term/:id/resize', async (req: unknown, res: unknown) => {
        const { id } = (req as { params: { id: string } }).params;
        const body = (req as { body: { cols?: number; rows?: number } }).body || {};
        const s = termSessions.get(id);
        if (!s) { (res as { status: (n: number) => { json: (d: unknown) => void } }).status(404).json({ error: '会话已关闭' }); return; }
        s.lastActive = Date.now();
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
          try { s.stream.close(); } catch {}
          termSessions.delete(id);
        }
        (res as { json: (d: unknown) => void }).json({ data: { ok: true } });
      });
    });
  },

  deactivate() {
    for (const [id] of sshPool) disconnect(id);
    pluginStorage = null;
  },
};
export { opsShellModule };
