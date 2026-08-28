import { Router, type Request, type Response } from 'express';
import {
  getApiToolRegistry,
  getToolRegistry,
  registerManagementTools,
  FetchSearchBackend,
  type SearchBackend,
} from '@yan-zhi/core';
import { resolveJwtUser } from '../auth.js';
import { executeApiTool, SUPPORTED_API_TOOLS } from './api-tool-executor.js';
import { db } from '../db.js';
import { PlaywrightSearchBackend } from './search-backend.js';

const router = Router();

/** 解析 web_search 后端：优先用内置 Playwright 浏览器（YANZHI_SEARCH_ENGINE=bing|baidu，默认 bing）；否则可用 YANZHI_SEARCH_ENDPOINT 指定外部搜索 API */
function resolveSearchBackend(): SearchBackend {
  const engine = (process.env.YANZHI_SEARCH_ENGINE || 'bing').toLowerCase();
  if (engine === 'bing' || engine === 'baidu') {
    return new PlaywrightSearchBackend(engine);
  }
  const endpoint = process.env.YANZHI_SEARCH_ENDPOINT;
  if (endpoint) {
    return new FetchSearchBackend({
      endpoint,
      extractResults: (data: unknown) => (data as { results?: Array<{ title?: string; url?: string; snippet?: string }> })?.results?.map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.snippet || '',
      })) || [],
    });
  }
  // 无配置时默认仍走浏览器，避免 web_search 直接报「无后端」
  return new PlaywrightSearchBackend('bing');
}

/** 确保管理类工具（get_api_tools/list_platforms 等）与 searchBackend 在首次获取 registry 时已就位 */
let _toolsInitialized = false;
function ensureToolsInitialized(): void {
  if (_toolsInitialized) return;
  _toolsInitialized = true;
  const registry = getToolRegistry(resolveSearchBackend());
  registerManagementTools(registry, () => db);
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
      if (!SUPPORTED_API_TOOLS.has(tool.name)) continue;
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
      const result = name.startsWith('api_')
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
