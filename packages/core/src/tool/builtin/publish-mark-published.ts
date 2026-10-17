// publish_mark_published 内置工具 —— 发布执行完成后回写队列状态
// 注意：实际执行由 server 的 executeTool 拦截处理（校验条目归属与状态流转，写 publish_queue），
// 此类仅提供 schema 注册。只允许 approved → published（发布执行任务收尾用）。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class PublishMarkPublishedTool implements BuiltInTool {
  name = 'publish_mark_published';
  description =
    '把发布队列里的一条**已确认（approved）**内容标记为「已发布」。仅在发布动作真实完成后调用——' +
    '发布没完成就标记属于谎报。id 来自发布任务的指令里给出的队列条目 ID。';
  inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: '发布队列条目 ID（发布任务指令里给出）。必填。' },
      note: { type: 'string', description: '可选：发布结果备注（如发布链接、平台返回的稿件 ID）。' },
    },
    required: ['id'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'publish_mark_published intercepted by server.' }],
    };
  }
}
