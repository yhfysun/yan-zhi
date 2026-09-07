// confirm_user 内置工具 —— 多页确认向导
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（弹出向导 UI 并 await 用户回答），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ConfirmUserTool implements BuiltInTool {
  name = 'confirm_user';
  description =
    '以分页向导的形式让用户依次确认多个相关事项，每页一个问题。' +
    '用户可从预设选项中选择（单选或多选）、输入自由文本答案、或附加补充说明。' +
    '对话会暂停，直到用户走完所有页面。当需要一次性收集多个决策或结构化答案（并附带说明）时，' +
    '请用 confirm_user 代替 ask_user。';
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
