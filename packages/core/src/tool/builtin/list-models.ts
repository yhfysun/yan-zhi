// list_models 内置工具 —— 列出当前用户已启用的模型平台与模型（type/capabilities/description）
// 注意：实际执行逻辑由 llm-task-manager 后端直查 DB（需访问 db + userId），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ListModelsTool implements BuiltInTool {
  name = 'list_models';
  description =
    '列出当前用户所有已启用的模型平台与模型，返回每个模型的平台、别称、模型 ID、类型(type)、能力(capabilities)、描述(description)。' +
    '在需要用特定模型（如图片/视频生成、视觉识别、推理等）完成任务的场景，先调用本工具确认有哪些可用模型及其能力，' +
    '再把目标平台的 id 与模型 id 传给 call_agent 或 image_analyze 之类的工具指定使用。';
  inputSchema = {
    type: 'object',
    properties: {
      platformId: { type: 'string', description: '可选：只列出指定平台下的模型。' },
      type: { type: 'string', description: '可选：按模型类型过滤，如 llm / image / video / audio / tts / embedding / rerank。' },
      capability: { type: 'string', description: '可选：按能力过滤，如 vision / function_call / reasoning。' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由后端 dispatch 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `list_models intercepted by dispatch loop. args=${JSON.stringify(args)}` }],
    };
  }
}
