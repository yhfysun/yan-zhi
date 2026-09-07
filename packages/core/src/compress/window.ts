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

  /** 压缩上下文（可选 beforeCompress hook：压缩丢失前抢救细节，由调用侧注入，core 不依赖存储层） */
  async compress(
    messages: Message[],
    opts?: { beforeCompress?: (toCompress: Message[]) => Promise<void> },
  ): Promise<Message[]> {
    if (this.tokenCount(messages) <= this.maxTokens) {
      return messages;
    }

    // 切窗边界对齐：保留窗口绝不能从 tool 消息中间开始（否则产生孤儿 tool，
    // 严格上游 400，兜底清洗只能丢弃 → tool 返回值丢失）。把边界回退到该组
    // tool 应答所属的 assistant（带 tool_calls）处，整对保留，返回值一条不丢。
    let cut = messages.length - this.keepRecent;
    while (cut > 0 && messages[cut].role === 'tool') cut--;
    if (cut <= 0) return messages; // 无法在保住配对的前提下压缩，保持原样发送

    const toCompress = messages.slice(0, cut);
    const toKeep = messages.slice(cut);

    // 压缩前钩子：把即将被摘要吞掉的细节先落盘（失败不阻塞压缩）
    if (opts?.beforeCompress) {
      try { await opts.beforeCompress(toCompress); } catch {}
    }

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
        content: [
          '请把以下对话压缩成结构化摘要，不超过 400 字，分节输出：',
          '## 任务目标',
          '## 已完成',
          '## 关键决定',
          '## 待办/下一步',
          '铁律（不可妥协）：文件路径、URL、命令、ID、函数名、API Key 占位符、错误信息原文等所有不透明标识符（opaque identifiers）必须原样保留、一字不改，禁止缩写、改写或省略。',
          '关键数据（数值、版本号、配置项）同样原样保留。',
        ].join('\n'),
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
      maxTokens: 800,
      temperature: 0.3,
    });

    return result.delta?.content || '';
  }

  /** 判断是否需要压缩 */
  needsCompression(messages: Message[]): boolean {
    return this.tokenCount(messages) > this.maxTokens;
  }
}
