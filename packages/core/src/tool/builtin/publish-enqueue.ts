// publish_enqueue 内置工具 —— 内容入发布队列（人工确认后才发布，不代发）
// 注意：实际执行由 server 的 executeTool 拦截处理（写 publish_queue 表），此类仅提供 schema 注册。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class PublishEnqueueTool implements BuiltInTool {
  name = 'publish_enqueue';
  description =
    '把一条准备好的内容（视频/图文/文章）提交到应用的「发布队列」，等用户在发布面板确认后才执行真正的发布——' +
    '本工具**只入队，绝不直接发布**。用于演示视频、科普动画、图文等产物的发布流转：入队 → 用户确认（approved）→ 发布执行（后续接入 pageAgent）→ 已发布。';
  inputSchema = {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['douyin', 'xiaohongshu', 'bilibili', 'wechat', 'csdn', 'juejin', 'zhihu'],
        description: '目标平台：douyin=抖音 / xiaohongshu=小红书 / bilibili=B站 / wechat=公众号 / csdn=CSDN / juejin=掘金 / zhihu=知乎专栏。技术文章优先 csdn/juejin（支持 Markdown）。',
      },
      title: {
        type: 'string',
        description: '发布标题（≤30 字，符合平台规范，不含极限词）。',
      },
      content: {
        type: 'string',
        description: '发布正文/文案（含话题标签建议）。',
      },
      mediaPaths: {
        type: 'array',
        items: { type: 'string' },
        description: '要发布的媒体文件路径列表（如成片 mp4 / 封面图）。',
      },
      tags: {
        type: 'string',
        description: '话题标签（空格分隔，如 "#AI #大模型"）。',
      },
      collection: {
        type: 'string',
        description: '合集/专栏名（强烈建议传）：同主题内容用统一合集名（如"言智·智能体工程实录"），发布时归入合集能引导连续订阅。系列内容务必保持合集名一致。',
      },
    },
    required: ['platform', 'title'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'publish_enqueue intercepted by server.' }],
    };
  }
}
