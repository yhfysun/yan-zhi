// image_analyze 内置工具 —— 图片识别/分析
// 实际执行由 chat.ts 的 dispatchToolCall 拦截：优先用多模态 vision 模型，
// 无 vision 模型时降级走服务端 Tesseract OCR。此类仅注册 schema 让大模型知道工具存在。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ImageAnalyzeTool implements BuiltInTool {
  name = 'image_analyze';
  description = '分析图像文件。支持常见格式（png/jpg/jpeg/gif/webp/bmp）。如配置了具备视觉能力的 LLM，会调用它返回更丰富的理解（物体、文字、场景、对问题的回答）；否则回退到服务端 Tesseract OCR（只做文字抽取）。可传 prompt 对图像提出具体问题。';

  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute or relative path to the image file to analyze.',
      },
      prompt: {
        type: 'string',
        description: 'Question or instruction about the image, e.g. "图里有什么文字" / "描述这张图的内容". Defaults to a general description.',
      },
      platformId: {
        type: 'string',
        description: 'Optional: specify a platform whose vision model to use. If omitted, auto-selects any enabled model with vision capability, or the current conversation model if it supports vision.',
      },
      modelId: {
        type: 'string',
        description: 'Optional: specify a model id (with vision capability) to use. Must belong to the given platformId (or auto-resolved platform).',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `image_analyze intercepted by dispatch loop. path=${args.path}` }],
    };
  }
}