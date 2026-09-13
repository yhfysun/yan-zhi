import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getToolRegistry, runUserCode } from '@yan-zhi/core';
import { db } from '../db.js';
import { resolveAccessKey } from './inbound-auth.js';

/**
 * 入站 MCP 服务端：作为 MCP server 被外部客户端连接。
 * 支持两种传输（与现有 McpClient 兼容）：
 *  - Streamable HTTP：POST /mcp（Accept: text/event-stream 时以 SSE 返回响应）、GET /mcp（SSE 保活）、DELETE /mcp（结束会话）
 *  - 旧版 SSE：GET /mcp/sse（开流并下发 endpoint 事件）、POST /mcp/sse?sessionId=...（收 JSON-RPC，结果回写 SSE 流）
 * 所有请求必须携带 Authorization: Bearer <访问凭证>，凭证绑定到具体 user_id，外部客户端以该用户身份调用我们的工具。
 */

interface Session {
  id: string;
  userId: string;
  createdAt: number;
  sseRes?: Response; // 旧版 SSE 流
}

const sessions = new Map<string, Session>();
const SESSION_TTL = 30 * 60 * 1000;

function sweepSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) {
      try { s.sseRes?.end(); } catch { /* noop */ }
      sessions.delete(id);
    }
  }
}
setInterval(sweepSessions, 5 * 60 * 1000).unref?.();

function authUserId(req: Request): string | null {
  const a = resolveAccessKey(req.headers['authorization']);
  return a ? a.userId : null;
}

function err(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** tools/list：内置工具（注册表）+ 该用户的自定义工具 */
function listTools(userId: string): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = getToolRegistry()
    .list()
    .map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? (t.inputSchema as Record<string, unknown>) : { type: 'object', properties: {} },
    }));

  const custom = db.prepare('SELECT name, description, input_schema_json, enabled FROM custom_tool WHERE user_id = ?').all(userId) as any[];
  for (const c of custom) {
    if (c.enabled === 0) continue;
    let schema: Record<string, unknown> = { type: 'object', properties: {} };
    try {
      if (c.input_schema_json) {
        const p = JSON.parse(c.input_schema_json);
        if (p && typeof p === 'object') schema = p;
      }
    } catch { /* 用默认 schema */ }
    tools.push({ name: c.name, description: c.description || '', inputSchema: schema });
  }
  return tools;
}

/** tools/call：内置走注册表 execute，自定义走沙箱 runUserCode；均返回 MCP 结果形态 */
async function callTool(userId: string, name: string, args: unknown): Promise<{ content: Array<{ type: string; text?: string }>; isError: boolean }> {
  const reg = getToolRegistry();
  if (reg.has(name)) {
    const r = await reg.execute(name, (args as Record<string, unknown>) || {});
    return { content: r.content, isError: !!r.isError };
  }
  const c = db.prepare('SELECT * FROM custom_tool WHERE user_id = ? AND name = ?').get(userId, name) as any;
  if (!c || c.enabled === 0) {
    return { content: [{ type: 'text', text: `Tool not found: ${name}` }], isError: true };
  }
  try {
    const r = await runUserCode(c.code, c.entry, (args as Record<string, unknown>) || {}, { timeout: c.timeout || 30000, runtime: c.runtime || 'node' });
    return { content: r.content, isError: !!r.isError };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e?.message || String(e) }], isError: true };
  }
}

async function dispatch(session: Session, msg: any): Promise<any | null> {
  const method = msg?.method;
  const id = msg?.id;
  if (!method) return err(id, -32600, 'Invalid Request');

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'yan-zhi', version: '0.1.0' },
      };
    case 'ping':
      return {};
    case 'notifications/initialized':
      return null; // 通知类，无响应
    case 'tools/list':
      return { tools: listTools(session.userId) };
    case 'tools/call': {
      const r = await callTool(session.userId, String(msg.params?.name || ''), msg.params?.arguments || {});
      return r;
    }
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

async function handleStreamablePost(req: Request, res: Response) {
  const userId = authUserId(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const headerSid = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
  let session = headerSid ? sessions.get(headerSid) : undefined;

  const body = req.body;
  const messages = Array.isArray(body) ? body : [body];
  const responses: any[] = [];

  for (const msg of messages) {
    // initialize 时若还没有会话则创建（绑定当前凭证的 user_id）
    if (msg?.method === 'initialize' && !session) {
      const sid = crypto.randomUUID();
      session = { id: sid, userId, createdAt: Date.now() };
      sessions.set(sid, session);
    }
    if (!session) {
      responses.push(err(msg?.id, -32000, 'No session. Send initialize first.'));
      continue;
    }
    const result = await dispatch(session, msg);
    if (result !== null) {
      responses.push({ jsonrpc: '2.0', id: msg?.id, ...(result.error ? { error: result.error } : { result }) });
    }
  }

  if (!session) { res.status(400).json(responses[0] || { error: 'no session' }); return; }
  if (responses.length === 0) { res.status(202).end(); return; } // 纯通知（如 notifications/initialized）

  const accept = String(req.headers.accept || '');
  const sid = session.id;
  if (accept.includes('text/event-stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Mcp-Session-Id': sid,
    });
    for (const r of responses) res.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Mcp-Session-Id', sid);
    res.status(200).json(Array.isArray(body) ? responses : responses[0]);
  }
}

function handleStreamableGet(req: Request, res: Response) {
  const sid = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
  if (!sid || !sessions.has(sid)) { res.status(400).json({ error: 'Invalid or missing session' }); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Mcp-Session-Id': sid,
  });
  res.write(': keepalive\n\n');
  const ping = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { /* noop */ } }, 15000);
  req.on('close', () => { clearInterval(ping); try { res.end(); } catch { /* noop */ } });
}

function handleStreamableDelete(req: Request, res: Response) {
  const sid = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
  if (sid && sessions.has(sid)) {
    const s = sessions.get(sid)!;
    try { s.sseRes?.end(); } catch { /* noop */ }
    sessions.delete(sid);
  }
  res.status(200).json({ ok: true });
}

function handleLegacySseGet(req: Request, res: Response) {
  const userId = authUserId(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const sid = crypto.randomUUID();
  const session: Session = { id: sid, userId, createdAt: Date.now() };
  sessions.set(sid, session);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: endpoint\ndata: /mcp/sse?sessionId=${sid}\n\n`);
  session.sseRes = res;
  req.on('close', () => { sessions.delete(sid); });
}

async function handleLegacySsePost(req: Request, res: Response) {
  const sid =
    typeof req.query.sessionId === 'string' ? req.query.sessionId :
    (req.body && typeof req.body.sessionId === 'string' ? req.body.sessionId : undefined);
  const session = sid ? sessions.get(sid) : undefined;
  if (!session) { res.status(404).json({ error: 'Unknown session' }); return; }

  const body = req.body;
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    const result = await dispatch(session, msg);
    if (result !== null && session.sseRes) {
      const framed = { jsonrpc: '2.0', id: msg?.id, ...(result.error ? { error: result.error } : { result }) };
      try { session.sseRes.write(`event: message\ndata: ${JSON.stringify(framed)}\n\n`); } catch { /* noop */ }
    }
  }
  res.status(202).end();
}

export function createInboundMcpRouter(): Router {
  const router = Router();
  // 跨域由 app 级全局 cors() 统一处理，这里不再重复设置，避免 Access-Control-Allow-Origin 冲突。

  // Streamable HTTP（现代）
  router.post('/', handleStreamablePost);
  router.get('/', handleStreamableGet);
  router.delete('/', handleStreamableDelete);
  // 旧版 SSE
  router.get('/sse', handleLegacySseGet);
  router.post('/sse', handleLegacySsePost);

  return router;
}
