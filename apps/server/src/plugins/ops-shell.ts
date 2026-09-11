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
  createdAt: number;
}

interface StoredConnection extends Omit<OpsConnection, 'secretEnc'> {
  secretEnc: string;
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
  if (!pluginStorage) return;
  await pluginStorage.set('connections', list);
}

function toClientView(c: StoredConnection) {
  const { secretEnc, ...rest } = c;
  return rest;
}

function isProduction(c: StoredConnection): boolean {
  return isProductionTag(c.tag);
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

function makeTools(): BuiltInTool[] {
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
      description: '通过 SFTP 上传本机文件到远程服务器。生产连接需 confirmed=true。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          localPath: { type: 'string', description: '本机文件绝对路径' },
          remotePath: { type: 'string', description: '远程目标绝对路径' },
          confirmed: { type: 'boolean', description: '生产连接必须为 true' },
        },
        required: ['connection', 'localPath', 'remotePath'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        if (isProduction(conn) && !args.confirmed) return textResult('生产连接的文件写入需确认后带 confirmed=true 重新调用');
        const localPath = String(args.localPath || '');
        const remotePath = String(args.remotePath || '');
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
      description: '通过 SFTP 从远程服务器下载文件到本机。',
      inputSchema: {
        type: 'object',
        properties: {
          connection: { type: 'string', description: '连接名称（或 connectionId）' },
          remotePath: { type: 'string', description: '远程文件绝对路径' },
          localPath: { type: 'string', description: '本机保存绝对路径' },
        },
        required: ['connection', 'remotePath', 'localPath'],
      },
      execute: async (args) => {
        const conn = await resolveConn(args);
        const remotePath = String(args.remotePath || '');
        const localPath = String(args.localPath || '');
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
        delete: (p: string, h: (...a: unknown[]) => void) => void;
      };

      // 连接列表（密钥永不回显）
      r.get('/connections', async (_req: unknown, res: unknown) => {
        const list = await loadConnections();
        (res as { json: (d: unknown) => void }).json({ data: list.map(toClientView) });
      });

      // 新建连接（type: ssh | docker | database；docker/database 复用 SSH 字段语义，database 直连）
      r.post('/connections', async (req: unknown, res: unknown) => {
        const body = (req as { body: Record<string, unknown> }).body || {};
        const name = String(body.name || '').trim();
        const host = String(body.host || '').trim();
        const username = String(body.username || '').trim();
        const secret = String(body.secret || '');
        const type: OpsConnType = body.type === 'docker' || body.type === 'database' ? body.type : 'ssh';
        const dbType = body.dbType === 'postgres' ? 'postgres' : 'mysql';
        const database = String(body.database || '').trim();
        if (!name || !host || !username || !secret) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: 'name/host/username/secret 均必填' });
          return;
        }
        if (type === 'database' && !database) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(400).json({ error: '数据库连接必须指定库名（database）' });
          return;
        }
        const list = await loadConnections();
        if (list.some((c) => c.name === name)) {
          (res as { status: (n: number) => { json: (d: unknown) => void } }).status(409).json({ error: `连接「${name}」已存在` });
          return;
        }
        const defaultPort = type === 'database' ? (dbType === 'postgres' ? 5432 : 3306) : 22;
        const conn: StoredConnection = {
          id: `ops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          type, name, host,
          port: Number(body.port) > 0 ? Number(body.port) : defaultPort,
          username,
          authType: body.authType === 'key' ? 'key' : 'password',
          secretEnc: encrypt(secret),
          tag: body.tag ? String(body.tag) : undefined,
          dbType: type === 'database' ? dbType : undefined,
          database: type === 'database' ? database : undefined,
          createdAt: Date.now(),
        };
        list.push(conn);
        await saveConnections(list);
        await audit('connection.create', { connection: name, ok: true });
        (res as { json: (d: unknown) => void }).json({ data: toClientView(conn) });
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
        await saveConnections(next);
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
          await audit('term.open', { connection: conn.name, ok: true });
          (res as { json: (d: unknown) => void }).json({ data: { sessionId } });
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
