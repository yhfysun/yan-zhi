// MCP 客户端连接管理器（后端）
//
// 背景：MCP 连接原本只存在于前端 stores/mcp.ts，后端 ReAct 循环遇到 mcp_ 工具时
// 要把调用回抛给前端执行，前端一关工具就废。这里把连接与调用全部收口到后端：
//  - sse / http 传输：复用 @yan-zhi/core 的 McpClient（纯 fetch 实现，Node 可直接跑）
//  - stdio 传输：用本地 StdioMcpClient 自己管子进程（core 的 adapter 路径缺握手且 key 错配）
// 连接按 serverId 复用，工具清单在连接成功后同步回 mcp_tool 表，供离线解析与构建工具 schema。
import { randomBytes } from 'node:crypto';
import type { McpServer, McpTool } from '@yan-zhi/shared';
import { McpClient } from '@yan-zhi/core';
import { db } from '../db.js';
import { StdioMcpClient, type McpCallResult } from './stdio-client.js';

export type { McpCallResult };

interface Connection {
  server: McpServer;
  client: McpClient | StdioMcpClient;
  connectedAt: number;
  tools: McpTool[];
}

/** serverId → 连接（进程内单例，跨任务复用） */
const connections = new Map<string, Connection>();
/** serverId → 连接中的 Promise，避免并发重复连接 */
const connecting = new Map<string, Promise<Connection>>();

function rowToServer(row: any): McpServer {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport || 'stdio',
    command: row.command || undefined,
    args: (() => { try { return JSON.parse(row.args_json || '[]'); } catch { return []; } })(),
    env: (() => { try { return JSON.parse(row.env_json || '{}'); } catch { return {}; } })(),
    url: row.url || undefined,
    headers: (() => { try { return JSON.parse(row.headers_json || '{}'); } catch { return {}; } })(),
    status: row.status ? 'connected' : 'disconnected',
    autoReconnect: !!row.auto_reconnect,
    reconnectInterval: row.reconnect_interval || 5000,
    autoConnect: !!row.auto_connect,
  };
}

export function loadServer(serverId: string, userId?: string): McpServer | null {
  const row = userId
    ? db.prepare('SELECT * FROM mcp_server WHERE id = ? AND user_id = ?').get(serverId, userId) as any
    : db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(serverId) as any;
  return row ? rowToServer(row) : null;
}

export function isConnected(serverId: string): boolean {
  const conn = connections.get(serverId);
  if (!conn) return false;
  if (conn.client instanceof StdioMcpClient) return conn.client.isConnected;
  return true; // McpClient 无 isConnected 暴露，连上即认为可用
}

/** 建立或复用连接。失败会抛出，调用方自行降级。 */
export async function ensureConnected(serverId: string, userId?: string): Promise<Connection> {
  const existing = connections.get(serverId);
  if (existing) {
    if (existing.client instanceof StdioMcpClient && !existing.client.isConnected) {
      connections.delete(serverId); // 子进程已退出，重建
    } else {
      return existing;
    }
  }
  const inflight = connecting.get(serverId);
  if (inflight) return inflight;

  const p = (async (): Promise<Connection> => {
    const server = loadServer(serverId, userId);
    if (!server) throw new Error(`MCP 服务不存在: ${serverId}`);

    const client: McpClient | StdioMcpClient =
      server.transport === 'stdio' ? new StdioMcpClient(server) : new McpClient(server);
    await client.connect();

    const tools = await client.listTools();
    const conn: Connection = { server, client, connectedAt: Date.now(), tools };
    connections.set(serverId, conn);
    syncToolsToDb(serverId, tools);
    try { db.prepare('UPDATE mcp_server SET status = ? WHERE id = ?').run(1, serverId); } catch {}
    console.log(`[mcp] 已连接 ${server.name}(${serverId}) transport=${server.transport} tools=${tools.length}`);
    return conn;
  })();

  connecting.set(serverId, p);
  try {
    return await p;
  } catch (e) {
    // 失败时清理可能半初始化出来的进程
    const partial = connections.get(serverId);
    if (partial?.client instanceof StdioMcpClient) {
      try { await partial.client.disconnect(); } catch {}
    }
    connections.delete(serverId);
    try { db.prepare('UPDATE mcp_server SET status = ? WHERE id = ?').run(0, serverId); } catch {}
    throw e;
  } finally {
    connecting.delete(serverId);
  }
}

/** 把工具清单写回 mcp_tool 表（保留 alias/remark/enabled 等用户配置） */
function syncToolsToDb(serverId: string, tools: McpTool[]): void {
  try {
    const oldRows = db.prepare('SELECT name, alias, remark, enabled FROM mcp_tool WHERE mcp_server_id = ?').all(serverId) as any[];
    const meta = new Map<string, any>(oldRows.map((r: any) => [r.name, r]));
    db.prepare('DELETE FROM mcp_tool WHERE mcp_server_id = ?').run(serverId);
    const insert = db.prepare(
      'INSERT INTO mcp_tool (id, mcp_server_id, name, description, input_schema_json, alias, remark, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const t of tools) {
      const old = meta.get(t.name);
      insert.run(
        'mt_' + randomBytes(8).toString('hex'),
        serverId,
        t.name,
        t.description || null,
        JSON.stringify(t.inputSchema || {}),
        old?.alias ?? null,
        old?.remark ?? null,
        old?.enabled === undefined ? 1 : old.enabled,
      );
    }
  } catch (e) {
    console.error('[mcp] 同步工具清单失败', serverId, e instanceof Error ? e.message : e);
  }
}

/** 断开并清理连接 */
export async function disconnectServer(serverId: string): Promise<void> {
  const conn = connections.get(serverId);
  if (!conn) return;
  connections.delete(serverId);
  try { await conn.client.disconnect(); } catch {}
  try { db.prepare('UPDATE mcp_server SET status = ? WHERE id = ?').run(0, serverId); } catch {}
}

/** 从 DB 读工具清单（不需要已连接，供工具名解析与 schema 构建） */
export function getToolsFromDb(serverId: string): McpTool[] {
  try {
    const rows = db.prepare('SELECT * FROM mcp_tool WHERE mcp_server_id = ?').all(serverId) as any[];
    return rows.map((r: any) => ({
      id: r.id,
      mcpServerId: serverId,
      name: r.name,
      description: r.description || undefined,
      alias: r.alias || undefined,
      remark: r.remark || undefined,
      enabled: r.enabled === undefined ? true : !!r.enabled,
      inputSchema: (() => { try { return JSON.parse(r.input_schema_json || '{}'); } catch { return {}; } })(),
    }));
  } catch {
    return [];
  }
}

/** 调用 MCP 工具，返回可直接塞进 ReAct 消息的纯文本 */
export async function callMcpTool(serverId: string, toolName: string, args: unknown): Promise<string> {
  let conn: Connection;
  try {
    conn = await ensureConnected(serverId);
  } catch {
    // 子进程可能已崩，清掉缓存重建一次；再次失败则把错误抛给调用方降级处理
    connections.delete(serverId);
    conn = await ensureConnected(serverId);
  }
  const result = await conn.client.callTool(toolName, args) as McpCallResult;
  const text = (result?.content || []).map((c: any) => c.text ?? JSON.stringify(c)).join('\n');
  if (result?.isError) return `MCP 工具返回错误: ${text}`;
  return text || '(工具无输出)';
}

// ============================================================
// 暴露名解析：mcp_{shortId8}__{toolName}
// 规则与前端 stores/chat.ts 保持一致，搬到后端使无前端时也能路由
// ============================================================

/** serverId → 8 位 shortId（去掉 mcp_ 前缀后取前 8 个字母数字） */
export function mcpShortIdOf(serverId: string): string {
  const base = serverId.startsWith('mcp_') ? serverId.slice(4) : serverId;
  return base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
}

/**
 * 解析暴露名 → { serverId, toolName }。
 * 仅在 shortId 唯一对应一个已挂载 server、且该工具确实存在时命中（防幽灵调用/前缀碰撞）。
 */
export function resolveMcpToolName(
  mountedServerIds: string[],
  fullName: string,
): { serverId: string; toolName: string } | null {
  const m = fullName.match(/^mcp_([a-zA-Z0-9]{1,8})__(.+)$/);
  if (!m) return null;
  const shortId = m[1];
  const toolName = m[2];

  const groups = new Map<string, string[]>();
  for (const sid of mountedServerIds) {
    const s = mcpShortIdOf(sid);
    if (!s) continue;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(sid);
  }
  const candidates = groups.get(shortId);
  if (!candidates || candidates.length !== 1) return null;
  const serverId = candidates[0];

  const tools = getToolsFromDb(serverId);
  if (!tools.some((t) => t.name === toolName)) return null;
  return { serverId, toolName };
}

/** 构建 MCP 工具的 OpenAI function schema（供后端 buildToolsForBackend 使用） */
export function buildMcpToolSchemas(mountedServerIds: string[]): any[] {
  const schemas: any[] = [];
  for (const sid of mountedServerIds) {
    const shortId = mcpShortIdOf(sid);
    if (!shortId) continue;
    for (const t of getToolsFromDb(sid)) {
      if (t.enabled === false) continue;
      schemas.push({
        type: 'function',
        function: {
          name: `mcp_${shortId}__${t.name}`,
          description: t.alias || t.description || t.name,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }
  return schemas;
}

/** 测试一份 MCP 配置能否连通（不落库、不留连接） */
export async function testServerConfig(config: any): Promise<{ ok: boolean; msg: string; tools?: any[]; durationMs?: number }> {
  const started = Date.now();
  const server: McpServer = {
    id: config.id || 'tmp_' + randomBytes(4).toString('hex'),
    name: config.name || '临时配置',
    transport: config.transport || 'stdio',
    command: config.command || undefined,
    args: config.args || [],
    env: config.env || {},
    url: config.url || undefined,
    headers: config.headers || {},
    status: 'disconnected',
    autoReconnect: false,
    reconnectInterval: 5000,
    autoConnect: false,
  };
  let client: McpClient | StdioMcpClient | null = null;
  try {
    client = server.transport === 'stdio' ? new StdioMcpClient(server) : new McpClient(server);
    await client.connect();
    const tools = await client.listTools();
    return {
      ok: true,
      msg: `连接成功，发现 ${tools.length} 个工具`,
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    return { ok: false, msg: e?.message || String(e), durationMs: Date.now() - started };
  } finally {
    if (client) { try { await client.disconnect(); } catch {} }
  }
}

/** 进程退出时清理所有 MCP 子进程 */
export async function disconnectAll(): Promise<void> {
  for (const [serverId] of connections) {
    try { await disconnectServer(serverId); } catch {}
  }
}

// ============================================================
// resources / prompts（MCP 管理页只读能力，后端代理执行）
// ============================================================

export async function listMcpResources(serverId: string): Promise<any[]> {
  const conn = await ensureConnected(serverId);
  return await (conn.client as any).listResources?.() ?? [];
}

export async function readMcpResource(serverId: string, uri: string): Promise<any[]> {
  const conn = await ensureConnected(serverId);
  const read = (conn.client as any).readResource;
  if (!read) throw new Error('当前传输方式不支持 resources');
  return await read.call(conn.client, uri);
}

export async function listMcpPrompts(serverId: string): Promise<any[]> {
  const conn = await ensureConnected(serverId);
  return await (conn.client as any).listPrompts?.() ?? [];
}

export async function getMcpPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<any> {
  const conn = await ensureConnected(serverId);
  const get = (conn.client as any).getPrompt;
  if (!get) throw new Error('当前传输方式不支持 prompts');
  return await get.call(conn.client, name, args);
}
