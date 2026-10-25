import { Router, type Request, type Response } from 'express';
import {
  getApiToolRegistry,
  getToolRegistry,
  registerManagementTools,
} from '@yan-zhi/core';
import { resolveJwtUser } from '../auth.js';
import { executeApiTool, isApiExecutableTool, SUPPORTED_API_TOOLS } from './api-tool-executor.js';
import { getToolsFromDb, mcpShortIdOf } from './client-manager.js';
import { db } from '../db.js';

const router = Router();

/**
 * 工具发现的额外来源：自定义工具 + MCP 工具（2026-10-25 全量覆盖）。
 * 用户要求：查询工具列表的工具必须能查到系统里**所有**工具 —— api/内置由 registry 反射，
 * 自定义与 MCP 在 server 侧拼好**可调用暴露名**（custom_<id8>_<name> / mcp_<shortId>__<name>，
 * 与 buildToolsForBackend 的暴露口径逐字一致）注入给 get_api_tools。
 */
function collectExtraDiscoverySources(userId?: string): Array<{ name: string; description?: string; source: 'custom' | 'mcp' }> {
  const rows: Array<{ name: string; description?: string; source: 'custom' | 'mcp' }> = [];
  try {
    const customs = (userId
      ? db.prepare('SELECT id, name, description FROM custom_tool WHERE user_id = ? AND enabled = 1').all(userId)
      : db.prepare('SELECT id, name, description FROM custom_tool WHERE enabled = 1').all()) as any[];
    for (const ct of customs) {
      rows.push({
        name: 'custom_' + String(ct.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '_' + ct.name,
        description: ct.description || ct.name,
        source: 'custom',
      });
    }
  } catch { /* 表不存在/坏数据不影响发现主路径 */ }
  try {
    const servers = db.prepare('SELECT id FROM mcp_server').all() as any[];
    for (const s of servers) {
      for (const t of getToolsFromDb(s.id)) {
        if (t.enabled === false) continue;
        rows.push({ name: `mcp_${mcpShortIdOf(s.id)}__${t.name}`, description: t.alias || t.description || t.name, source: 'mcp' });
      }
    }
  } catch { /* 同上 */ }
  return rows;
}

/** 确保管理类工具（get_api_tools/list_platforms 等）在首次获取 registry 时已就位 */
let _toolsInitialized = false;
export function ensureToolsInitialized(): void {
  if (_toolsInitialized) return;
  _toolsInitialized = true;
  const registry = getToolRegistry();
  registerManagementTools(registry, () => db, collectExtraDiscoverySources);
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function jsonError(id: string | number | null | undefined, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  };
}

function jsonResult(id: string | number | null | undefined, result: unknown) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

function listAllTools() {
  ensureToolsInitialized();
  const apiTools: Array<Record<string, unknown>> = [];
  for (const tools of getApiToolRegistry().values()) {
    for (const tool of tools) {
      // 白名单判定：api_ 前缀工具与 media_compose 这类无前缀但由 executeApiTool 实现的
      // 工具都在 SUPPORTED_API_TOOLS 里（漏了 → MCP 客户端列不到 → 模型看不到）
      if (!isApiExecutableTool(tool.name)) continue;
      apiTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  const builtInTools = getToolRegistry().list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  }));

  return [...apiTools, ...builtInTools];
}

router.post('/', async (req: Request, res: Response) => {
  const request = (Array.isArray(req.body) ? req.body[0] : req.body) as JsonRpcRequest | undefined;
  if (!request || typeof request.method !== 'string') {
    res.status(400).json(jsonError(null, -32600, 'Invalid Request'));
    return;
  }

  if (request.method === 'initialize') {
    res.json(
      jsonResult(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'yan-zhi-server',
          version: '0.1.0',
        },
      }),
    );
    return;
  }

  if (request.method === 'notifications/initialized') {
    res.status(202).end();
    return;
  }

  if (request.method === 'tools/list') {
    res.json(jsonResult(request.id, { tools: listAllTools() }));
    return;
  }

  if (request.method === 'tools/call') {
    ensureToolsInitialized();
    const userId = resolveJwtUser(req.headers.authorization)?.userId;
    const name = String(request.params?.name || '');
    const args = (request.params?.arguments || {}) as Record<string, unknown>;

    if (!name) {
      res.status(400).json(jsonError(request.id, -32602, 'Missing tool name'));
      return;
    }

    try {
      const result = isApiExecutableTool(name)
        ? await executeApiTool(name, args, userId)
        : await getToolRegistry().execute(name, args);
      res.json(jsonResult(request.id, result));
    } catch (error: unknown) {
      res.json(
        jsonResult(request.id, {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }),
      );
    }
    return;
  }

  if (request.method === 'resources/list') {
    res.json(jsonResult(request.id, { resources: [] }));
    return;
  }

  res.status(404).json(jsonError(request.id, -32601, `Method not found: ${request.method}`));
});

export default router;
