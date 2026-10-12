// list_models 内置工具 —— 列出当前用户已启用的模型平台与模型（type/capabilities/description）
// 注意：实际执行逻辑由 llm-task-manager 后端直查 DB（需访问 db + userId），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ListModelsTool implements BuiltInTool {
  name = 'list_models';
  description =
    '列出当前用户所有已启用的模型平台与模型，返回每个模型的平台、别称、模型 ID、类型(type)、能力(capabilities)、描述(description)。' +
    '在需要用特定模型（如图片/视频生成、视觉识别、向量化等）完成任务的场景，先调用本工具确认有哪些可用模型及其能力，' +
    '再把目标平台的 id 与模型 id 传给 call_agent 或 image_analyze 之类的工具指定使用。' +
    '支持按 category 语义分类快速筛选（llm=对话大模型 / image=文生图 / video=文生视频 / vision=视觉识别 / embedding=向量化 / audio=语音），' +
    '也支持 limit/offset 分页（默认每页 50 条）。';
  inputSchema = {
    type: 'object',
    properties: {
      platformId: { type: 'string', description: '可选：只列出指定平台下的模型。' },
      type: { type: 'string', description: '可选：按模型 type 过滤，如 llm / image / video / audio / tts / embedding / rerank。' },
      capability: { type: 'string', description: '可选：按能力过滤，如 vision / function_call / reasoning。' },
      category: {
        type: 'string',
        description:
          '可选：按语义类别筛选，等价于组合 type/capability。取值：llm(对话大模型) / image(文生图) / video(文生视频) / vision(视觉识别) / embedding(向量化) / audio(语音)。与 type/capability 同时传时以 category 为准。',
        enum: ['llm', 'image', 'video', 'vision', 'embedding', 'audio'],
      },
      limit: { type: 'number', description: '可选：分页每页条数，默认 50，最大 200。' },
      offset: { type: 'number', description: '可选：分页偏移量，默认 0（从第 1 条开始）。' },
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
