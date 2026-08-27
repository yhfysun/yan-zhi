// confirm_user 内置工具 —— 多页确认向导
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（弹出向导 UI 并 await 用户回答），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ConfirmUserTool implements BuiltInTool {
  name = 'confirm_user';
  description =
    'Ask the user to confirm several related items as a paginated wizard. Each page contains one question. ' +
    'The user can choose from preset options (single or multiple), type a free-form answer, and add a supplementary note. ' +
    'The conversation pauses until the user finishes every page. Use this instead of ask_user when you need more than one ' +
    'decision or want to collect structured answers plus user notes before continuing.';
  inputSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Optional title shown at the top of the confirmation wizard.',
      },
      pages: {
        type: 'array',
        description: 'One question per page, shown one page at a time in the order provided.',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question or decision shown on this page.',
            },
            description: {
              type: 'string',
              description: 'Optional supporting text rendered below the question.',
            },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional preset choices. Single choice by default; set multiSelect for multiple choices.',
            },
            multiSelect: {
              type: 'boolean',
              description: 'If true, the user can choose multiple options on this page.',
            },
            allowText: {
              type: 'boolean',
              description: 'Allow a free-form text answer. Defaults to true.',
            },
            allowSupplement: {
              type: 'boolean',
              description: 'Allow an extra supplementary note on this page. Defaults to true.',
            },
            required: {
              type: 'boolean',
              description: 'If true, the page cannot be skipped. Defaults to false.',
            },
          },
          required: ['question'],
        },
      },
    },
    required: ['pages'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    const count = Array.isArray(args.pages) ? args.pages.length : 0;
    return {
      content: [{ type: 'text', text: `confirm_user intercepted by dispatch loop. pages=${count}` }],
    };
  }
}
