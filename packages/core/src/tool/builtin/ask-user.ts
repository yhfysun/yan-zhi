// ask_user 内置工具 —— 向用户弹出反问对话框，等待用户回答后再继续
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（需弹出 UI 对话框并 await 用户回答），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class AskUserTool implements BuiltInTool {
  name = 'ask_user';
  description =
    'Ask the user a clarifying question and WAIT for their answer before continuing. ' +
    'Use this whenever you need the user to choose between options, provide missing information, ' +
    'confirm a decision, or disambiguate a request. The conversation pauses until the user responds. ' +
    'Prefer passing `options` so the user can pick with one click.';
  inputSchema = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The clarifying question shown to the user.',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional preset answer options. If provided, the user picks from these (single choice unless multiSelect).',
      },
      multiSelect: {
        type: 'boolean',
        description: 'If true and `options` is provided, the user may select multiple options (answers joined with "、").',
      },
    },
    required: ['question'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `ask_user intercepted by dispatch loop. question=${args.question}` }],
    };
  }
}
