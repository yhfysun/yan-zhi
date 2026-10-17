// publish_record_stats 内置工具 —— 发布后的平台数据回传（复盘链路）
// 注意：实际执行由 server 的 executeTool 拦截处理（写 publish_queue.stats_json），
// 此类仅提供 schema 注册。数据来源：委派 pageAgent 读平台创作者后台的真实数据。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class PublishRecordStatsTool implements BuiltInTool {
  name = 'publish_record_stats';
  description =
    '记录一条已发布内容在平台上的表现数据（播放/点赞/评论/转发），存入发布队列供复盘。' +
    '数据必须是委派 pageAgent 从平台创作者后台**读到的真实数字**——读不到就如实说明，禁止编造。';
  inputSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', description: '发布队列条目 ID。必填。' },
      views: { type: 'number', description: '播放/曝光量。' },
      likes: { type: 'number', description: '点赞数。' },
      comments: { type: 'number', description: '评论数。' },
      shares: { type: 'number', description: '转发/分享数。' },
      note: { type: 'string', description: '可选：数据口径备注（如"发布后 48h 数据"、数据来源页面）。' },
    },
    required: ['id'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'publish_record_stats intercepted by server.' }],
    };
  }
}
