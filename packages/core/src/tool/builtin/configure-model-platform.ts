// configure_model_platform 内置工具 —— 引导用户填写模型平台/模型信息
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（弹出配置表单并 await 用户保存），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ConfigureModelPlatformTool implements BuiltInTool {
  name = 'configure_model_platform';
  description =
    'Open a model-platform configuration dialog and WAIT for the user to fill in the platform and model details. ' +
    'Use this whenever the user wants to add or configure a model platform/model. ' +
    'The user can provide the platform name, protocol, API URL, API key, and model ID. ' +
    'The conversation pauses until the user submits or cancels.';
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
