// image_analyze 内置工具 —— 图片识别/分析
// 实际执行由 chat.ts 的 dispatchToolCall 拦截：优先用多模态 vision 模型，
// 无 vision 模型时降级走服务端 Tesseract OCR。此类仅注册 schema 让大模型知道工具存在。
//
// ★ 路径说明（2026-09-30）：本类是**占位实现**，不读文件，所以**不需要**
//   `resolveToolPath` —— 真正解析 `args.path` 的是前端 dispatchToolCall
//   （`packages/ui/src/composables/chat/useChat.ts`）。
//   此处**刻意不加** ToolContext / resolveToolPath，避免留无用导入（曾误加后清理）。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ImageAnalyzeTool implements BuiltInTool {
  name = 'image_analyze';
  description = '分析图像文件。支持常见格式（png/jpg/jpeg/gif/webp/bmp）。优先用当前会话模型直接看图（多模态模型无需额外配置）；当前模型看不了或失败时依次尝试其它启用的 vision 模型，最后才回退本地 OCR（RapidOCR，只抽取文字）。只要图中文字、不需要理解画面时，直接传 engine=ocr 跳过模型（快且省 token）。可传 prompt 对图像提出具体问题。';

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
      engine: {
        type: 'string',
        enum: ['auto', 'ocr'],
        description: 'auto（默认）= 先用视觉模型看图，全部失败才降级 OCR；ocr = 跳过模型，直接用本地 OCR 提取文字（快、省 token，适合只想要图片里的文字、或当前模型看不了图时）。',
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