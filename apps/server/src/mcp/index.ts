import { Router, type Request, type Response } from 'express';
import {
  getApiToolRegistry,
  getToolRegistry,
  registerManagementTools,
} from '@yan-zhi/core';
import { resolveJwtUser } from '../auth.js';
import { executeApiTool, SUPPORTED_API_TOOLS } from './api-tool-executor.js';
import { db } from '../db.js';
import { getSearchBackend, getSearchBackendWithFallback, createLlmSummarizer } from './search-backend.js';

const router = Router();

/** 确保管理类工具（get_api_tools/list_platforms 等）与 searchBackend 在首次获取 registry 时已就位 */
let _toolsInitialized = false;
export function ensureToolsInitialized(): void {
  if (_toolsInitialized) return;
  _toolsInitialized = true;
  const registry = getToolRegistry(getSearchBackend());
  registerManagementTools(registry, () => db);
  // Layer 3：注入 LLM 结果总结器（web_search summarize=true 时启用；失败静默退回原始列表）
  try {
    (registry.get('web_search') as any)?.setSummarizer?.(createLlmSummarizer());
  } catch { /* 注入失败不影响搜索 */ }
  // 后台升级到降级链（默认 DuckDuckGo/Bing API，不依托宿主机浏览器），不阻塞启动
  getSearchBackendWithFallback()
    .then((backend) => {
      (getToolRegistry().get('web_search') as any)?.setBackend?.(backend);
      // 打印最终选用的 backend 名称，方便排查 web_search 后端选型
      const name = backend?.constructor?.name || 'unknown';
      console.log(`[mcp] web_search 后端就绪: ${name}`);
    })
    .catch(() => { /* 保留初始 backend */ });
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
