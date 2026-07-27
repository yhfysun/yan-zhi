// 工作流节点 handler - LLM / Tool 节点的内置实现
import type { NodeHandler, RunContext, NodeResult } from './engine';
import type { Platform, Model } from '@yan-zhi/shared';
import { LlmClient } from '../llm/client';
import { McpClient } from '../mcp/client';
import { getPlatformAdapter } from '../platform/types';

/** LLM 节点：调用 LLM 生成回复
 *  config: { platformId, modelId, systemPrompt, temperature, maxTokens } */
export class LlmNodeHandler implements NodeHandler {
  type = 'llm';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const platformId = config.platformId as string;
    const modelId = config.modelId as string;
    if (!platformId || !modelId) throw new Error('LLM 节点缺少 platformId/modelId');

    // 从 DB 加载 platform 和 model
    const adapter = getPlatformAdapter();
    const [platform] = await adapter.db.query<Platform>(
      'SELECT * FROM platform WHERE id = ?', [platformId],
    );
    const [model] = await adapter.db.query<Model>(
      'SELECT * FROM model WHERE id = ?', [modelId],
    );
    if (!platform) throw new Error(`平台不存在: ${platformId}`);
    if (!model) throw new Error(`模型不存在: ${modelId}`);

    // 把 platform DB 行转换为 Platform 对象
    const p: Platform = {
      id: platform.id,
      name: platform.name,
      protocol: platform.protocol,
      apiUrl: (platform as any).api_url,
      apiKeyEnc: (platform as any).api_key_enc,
      headers: (platform as any).headers_json ? JSON.parse((platform as any).headers_json) : {},
      status: 'unknown',
      createdAt: (platform as any).created_at,
    };
    const m: Model = {
      id: model.id,
      platformId: (model as any).platform_id,
      modelId: (model as any).model_id,
      alias: (model as any).alias,
      type: (model as any).type,
      contextWindow: (model as any).context_window,
      enabled: !!(model as any).enabled,
      isDefault: !!(model as any).is_default,
    };

    const systemPrompt = (config.systemPrompt as string) || '';
    // 从上游节点取输入（取最近一个输出）
    const inputVal = ctx.outputs.size > 0
      ? Array.from(ctx.outputs.values()).pop()
      : ctx.inputs;

    const messages = [
      ...(systemPrompt ? [{ id: 'sys', conversationId: '', role: 'system' as const, content: systemPrompt, createdAt: 0 }] : []),
      { id: 'user', conversationId: '', role: 'user' as const, content: typeof inputVal === 'string' ? inputVal : JSON.stringify(inputVal), createdAt: 0 },
    ];

    const client = new LlmClient(p, m);
    const result = await client.chat(messages, {
      temperature: config.temperature as number,
      maxTokens: config.maxTokens as number,
    });

    return { output: result.delta?.content || '' };
  }
}

/** 工具节点：调用 MCP 工具
 *  config: { mcpServerId, toolName, arguments } */
export class ToolNodeHandler implements NodeHandler {
  type = 'tool';

  async execute(config: Record<string, unknown>, ctx: RunContext): Promise<NodeResult> {
    const mcpServerId = config.mcpServerId as string;
    const toolName = config.toolName as string;
    if (!mcpServerId || !toolName) throw new Error('工具节点缺少 mcpServerId/toolName');

    // 从 DB 加载 server
    const adapter = getPlatformAdapter();
    const [serverRow] = await adapter.db.query<any>(
      'SELECT * FROM mcp_server WHERE id = ?', [mcpServerId],
    );
    if (!serverRow) throw new Error(`MCP 服务不存在: ${mcpServerId}`);

    const server = {
      id: serverRow.id,
      name: serverRow.name,
      transport: serverRow.transport,
      command: serverRow.command,
      args: serverRow.args_json ? JSON.parse(serverRow.args_json) : [],
      env: serverRow.env_json ? JSON.parse(serverRow.env_json) : {},
      url: serverRow.url,
      headers: serverRow.headers_json ? JSON.parse(serverRow.headers_json) : {},
      status: 'disconnected' as const,
      autoReconnect: !!serverRow.auto_reconnect,
      reconnectInterval: serverRow.reconnect_interval,
      autoConnect: !!serverRow.auto_connect,
    };

    const client = new McpClient(server);
    await client.connect();
    try {
      // arguments 可以从 config 取，也可以从上游 ctx 取
      let args = config.arguments;
      if (!args || (typeof args === 'object' && Object.keys(args).length === 0)) {
        const upstream = ctx.outputs.size > 0 ? Array.from(ctx.outputs.values()).pop() : ctx.inputs;
        args = upstream;
      }
      const result = await client.callTool(toolName, args);
      return { output: result };
    } finally {
      await client.disconnect().catch(() => {});
    }
  }
}
