// ask_user 内置工具 —— 向用户弹出反问对话框，等待用户回答后再继续
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（需弹出 UI 对话框并 await 用户回答），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class AskUserTool implements BuiltInTool {
  name = 'ask_user';
  description =
    '向用户提出一个澄清问题并等待回答后再继续。适用于需要在多个选项中让用户选、补充缺失信息、确认决策或消除歧义的场景。' +
    '对话会暂停，直到用户作答。建议尽量传入 options 让用户一键选择。';
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
      allowSupplement: {
        type: 'boolean',
        description: 'If true, show an optional supplementary note input below the answer. Defaults to true.',
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
