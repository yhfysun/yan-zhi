// 上下文滑动窗口压缩
import type { Message } from '@yan-zhi/shared';
import { estimateTokens } from '@yan-zhi/shared';
import { LlmClient } from '../llm/client';
import type { Model, Platform } from '@yan-zhi/shared';

export class ContextWindow {
  private summaryClient: LlmClient | null = null;

  constructor(
    private maxTokens: number = 8000,
    private keepRecent: number = 6,
    private summaryPlatform?: Platform,
    private summaryModel?: Model,
  ) {}

  /** 设置摘要用的 LLM 客户端 */
  setSummaryModel(platform: Platform, model: Model): void {
    this.summaryPlatform = platform;
    this.summaryModel = model;
    this.summaryClient = new LlmClient(platform, model);
  }

  /** 统计 token 数 */
  tokenCount(messages: Message[]): number {
    return messages.reduce(
      (sum, m) => sum + estimateTokens(m.content || '') + estimateTokens(m.reasoningContent || ''),
      0,
    );
  }

  /** 压缩上下文 */
  async compress(messages: Message[]): Promise<Message[]> {
    if (this.tokenCount(messages) <= this.maxTokens) {
      return messages;
    }

    const toCompress = messages.slice(0, -this.keepRecent);
    const toKeep = messages.slice(-this.keepRecent);

    const summary = await this.summarize(toCompress);

    return [
      {
        id: 'summary',
        conversationId: toKeep[0]?.conversationId || '',
        role: 'system',
        content: `前文摘要：${summary}`,
        createdAt: Date.now(),
      },
      ...toKeep,
    ];
  }

  /** 生成摘要 */
  private async summarize(messages: Message[]): Promise<string> {
    if (!this.summaryClient || !this.summaryModel) {
      // 无摘要模型时，简单截断
      const content = messages
        .map((m) => m.content || '')
        .join('\n')
        .slice(0, 500);
      return content + '...';
    }

    const summaryMessages: Message[] = [
      {
        id: 'sum-instr',
        conversationId: '',
        role: 'system',
        content: '请把以下对话压缩成简洁摘要，保留关键信息和上下文。不超过 300 字。',
        createdAt: Date.now(),
      },
      {
        id: 'sum-input',
        conversationId: '',
        role: 'user',
        content: messages.map((m) => `${m.role}: ${m.content || ''}`).join('\n'),
        createdAt: Date.now(),
      },
    ];

    const result = await this.summaryClient.chat(summaryMessages, {
      maxTokens: 500,
      temperature: 0.3,
    });

    return result.delta?.content || '';
  }

  /** 判断是否需要压缩 */
  needsCompression(messages: Message[]): boolean {
    return this.tokenCount(messages) > this.maxTokens;
  }
}
