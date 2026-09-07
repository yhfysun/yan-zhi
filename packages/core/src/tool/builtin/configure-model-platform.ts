// configure_model_platform 内置工具 —— 引导用户填写模型平台/模型信息
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（弹出配置表单并 await 用户保存），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ConfigureModelPlatformTool implements BuiltInTool {
  name = 'configure_model_platform';
  description =
    '弹出模型平台/模型的配置对话框，并等待用户填写完成后再继续。' +
    '当用户希望新增或调整模型平台/模型时使用该工具。' +
    '用户可填写平台名称、协议、API 地址、API Key、模型 ID 等信息。' +
    '对话会暂停，直到用户保存或取消。';
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Optional platform name prefilled in the dialog.' },
      protocol: { type: 'string', enum: ['openai', 'anthropic', 'custom'], description: 'Optional platform protocol prefilled in the dialog.' },
      apiUrl: { type: 'string', description: 'Optional API URL prefilled in the dialog.' },
      apiKey: { type: 'string', description: 'Optional API key prefilled in the dialog.' },
      modelId: { type: 'string', description: 'Optional model ID prefilled in the dialog.' },
      alias: { type: 'string', description: 'Optional model alias prefilled in the dialog.' },
      contextWindow: { type: 'number', description: 'Optional model context window prefilled in the dialog.' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `configure_model_platform intercepted by dispatch loop. args=${JSON.stringify(args)}` }],
    };
  }
}
