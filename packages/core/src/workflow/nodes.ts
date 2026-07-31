// 工作流节点 handler - LLM / Tool 节点
import type { NodeHandler, RunContext, NodeResult } from './engine';
import type { Platform, Model } from '@yan-zhi/shared';
import { LlmClient } from '../llm/client';
import { McpClient } from '../mcp/client';
import { getPlatformAdapter } from '../platform/types';

export class LlmNodeHandler implements NodeHandler {
  type = 'llm';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const platformId = config.platformId as string;
    const modelId = config.modelId as string;
    if (!platformId || !modelId) throw new Error('LLM 节点缺少 platformId/modelId');

    const adapter = getPlatformAdapter();
    const [platform] = await adapter.db.query<Platform>('SELECT * FROM platform WHERE id = ?', [platformId]);
    const [model] = await adapter.db.query<Model>('SELECT * FROM model WHERE id = ?', [modelId]);
    if (!platform) throw new Error(`平台不存在: ${platformId}`);
    if (!model) throw new Error(`模型不存在: ${modelId}`);

    const p: Platform = {
      id: platform.id, name: platform.name, protocol: platform.protocol,
      apiUrl: (platform as any).api_url, apiKeyEnc: (platform as any).api_key_enc,
      headers: (platform as any).headers_json ? JSON.parse((platform as any).headers_json) : {},
      status: 'unknown', createdAt: (platform as any).created_at,
    };
    const m: Model = {
      id: model.id, platformId: (model as any).platform_id, modelId: (model as any).model_id,
      alias: (model as any).alias, type: (model as any).type, contextWindow: (model as any).context_window,
      enabled: !!(model as any).enabled, isDefault: !!(model as any).is_default,
    };

    const systemPrompt = (config.systemPrompt as string) || '';
    const inputVal = ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs;
    const messages = [
      ...(systemPrompt ? [{ id: 'sys', conversationId: '', role: 'system' as const, content: systemPrompt, createdAt: 0 }] : []),
      { id: 'user', conversationId: '', role: 'user' as const, content: typeof inputVal === 'string' ? inputVal : JSON.stringify(inputVal), createdAt: 0 },
    ];

    const client = new LlmClient(p, m);
    const result = await client.chat(messages, { temperature: config.temperature as number, maxTokens: config.maxTokens as number });
    return { output: result.delta?.content || '' };
  }
}

/** 工具节点 — 支持 MCP / 内置 / 自定义三种来源
 *  config: { toolSource?: 'mcp'|'builtin'|'custom', mcpServerId?, toolName, arguments? } */
export class ToolNodeHandler implements NodeHandler {
  type = 'tool';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const toolSource = (config.toolSource as string) || 'mcp';
    const toolName = config.toolName as string;
    if (!toolName) throw new Error('工具节点缺少 toolName');

    let args = config.arguments;
    if (!args || (typeof args === 'object' && Object.keys(args as object).length === 0)) {
      args = ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs;
    }

    if (toolSource === 'builtin') {
      const { getApiToolRegistry } = await import('../tool/builtin/api-tools');
      return { output: { tool: toolName, hint: '内置工具通过 ToolRegistry 执行' } };
    }

    if (toolSource === 'custom') {
      const adapter = getPlatformAdapter();
      const [row] = await adapter.db.query<any>('SELECT * FROM custom_tool WHERE name = ? AND enabled = 1', [toolName]);
      if (!row) throw new Error(`自定义工具不存在或已禁用: ${toolName}`);
      const { runInSandbox } = await import('../tool/sandbox');
      const result = await runInSandbox(row.code, row.entry, (args as Record<string, unknown>) || {}, { timeout: row.timeout || 30000 });
      return { output: result };
    }

    // MCP（默认）
    const mcpServerId = config.mcpServerId as string;
    if (!mcpServerId) throw new Error('MCP 工具节点缺少 mcpServerId');

    const adapter = getPlatformAdapter();
    const [serverRow] = await adapter.db.query<any>('SELECT * FROM mcp_server WHERE id = ?', [mcpServerId]);
    if (!serverRow) throw new Error(`MCP 服务不存在: ${mcpServerId}`);

    const server = {
      id: serverRow.id, name: serverRow.name, transport: serverRow.transport,
      command: serverRow.command, args: serverRow.args_json ? JSON.parse(serverRow.args_json) : [],
      env: serverRow.env_json ? JSON.parse(serverRow.env_json) : {}, url: serverRow.url,
      headers: serverRow.headers_json ? JSON.parse(serverRow.headers_json) : {},
      status: 'disconnected' as const, autoReconnect: !!serverRow.auto_reconnect,
      reconnectInterval: serverRow.reconnect_interval, autoConnect: !!serverRow.auto_connect,
    };

    const client = new McpClient(server);
    await client.connect();
    try {
      const result = await client.callTool(toolName, args);
      return { output: result };
    } finally {
      await client.disconnect().catch(() => {});
    }
  }
}
