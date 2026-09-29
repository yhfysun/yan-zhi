// 上下文滑动窗口压缩
import type { Message } from '@yan-zhi/shared';
import { estimateTokens } from '@yan-zhi/shared';
import { LlmClient } from '../llm/client';
import type { Model, Platform } from '@yan-zhi/shared';

/**
 * 压缩触发点系数：阈值 = 模型上下文窗口 × 该系数。
 *
 * ★★★ 为什么需要它（2026-09-29 排障）：此前调用侧直接把 `model.contextWindow`（100 万级）
 *   当阈值传给本类，而判据 `tokenCount()` 是**保守低估**的估算（实测约为真实 token 的一半），
 *   两者不是同一个量纲 → 压缩几乎永不触发，上下文无限膨胀
 *   （实测单会话 1156 条消息 / 真实 prompt ≈ 22 万 token）。
 *
 * 取 0.5 是**双重保守**：① 估算函数偏低，需要留出低估余量；
 *   ② 还要给本轮输出与工具结果留出空间，避免"刚压缩完又超限"。
 *   这是经验值，不是精确换算 —— 若要收紧/放宽，改这里一个数即可。
 */
export const COMPRESS_TRIGGER_RATIO = 0.5;

/**
 * 分级压缩：**先裁剪超长老工具输出，再考虑整段摘要**（2026-09-29，对齐 CodeBuddy 的多级压缩）。
 *
 * ★ 为什么需要（此前是"单级瀑布"）：只有"整段摘要"一档，一旦触发就丢前文、只留一条摘要。
 *   但长任务里真正吃 token 的往往是**少数几条超长工具输出**（cmd_exec 的日志、
 *   file_read 的大文件、python_exec 的 stdout），单条上限 64KB、保留窗口 6 条 → 最坏 384KB 常驻。
 *   把这些老输出裁成"首尾 + 截断标记"就能省下绝大部分，**且完全不破坏对话结构**
 *   （tool 消息仍在、配对仍完整、模型仍能看到"我调用过什么、结果大概是什么"）。
 *
 * 顺序：① 先对**保留窗口之外**的老 tool 消息做裁剪 → 若已降到阈值以下就**不摘要**
 *       （保住了全部对话结构，比丢前文温和得多）；② 仍超限才走整段摘要。
 */
export const COMPRESS_TOOL_CAP_CHARS = 8 * 1024;

/** 把超长文本裁成 头部 75% + 尾部 25%（错误信息/结论常在末尾），未超限原样返回。 */
export function capLongText(text: string, max: number = COMPRESS_TOOL_CAP_CHARS): string {
  if (!text || text.length <= max) return text;
  const marker = `\n…[已压缩：原文 ${text.length} 字符，此处为节选]…\n`;
  const head = Math.max(Math.floor((max - marker.length) * 0.75), 0);
  const tail = Math.max(max - head - marker.length, 0);
  if (head + tail <= 0) return text.slice(0, max);
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

export class ContextWindow {
  private summaryClient: LlmClient | null = null;

  constructor(
    private maxTokens: number = 8000,
    private keepRecent: number = 6,
    private summaryPlatform?: Platform,
    private summaryModel?: Model,
  ) {}

  /**
   * 推荐入口：按**模型上下文窗口**创建（内部换算成触发阈值）。
   * ★ 请用本方法而不是 `new ContextWindow(model.contextWindow)` —— 直接传上下文窗口
   *   会把阈值抬到 100 万级，等于关掉压缩（见 COMPRESS_TRIGGER_RATIO 注释）。
   *
   * ★★ 说明：`contextWindow` 缺失/不合理时的**保守兜底已上移到调用侧**（32K，见
   *   `apps/server/src/constants.ts` 的 `resolveContextWindow`）—— 因为"该按多少窗口估算"
   *   是**运行环境**的知识（依赖模型/平台配置），core 是纯逻辑包不该替宿主猜。
   *   这里只做"非法值不得把阈值算成 0/NaN"的防御。
   */
  static forContextWindow(contextWindow: number, keepRecent = 6): ContextWindow {
    const cw = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 8000;
    return new ContextWindow(Math.max(1, Math.floor(cw * COMPRESS_TRIGGER_RATIO)), keepRecent);
  }

  /** 设置摘要用的 LLM 客户端 */
  setSummaryModel(platform: Platform, model: Model): void {
    this.summaryPlatform = platform;
    this.summaryModel = model;
    this.summaryClient = new LlmClient(platform, model);
  }

  /**
   * 统计 token 数。
   * ★★★ 必须计入 `toolCalls`（2026-09-29 排障）：工具的**参数全在 toolCalls 里**
   *   （尤其 python_exec / file_write 的 code/content，往往是单条消息最长的那部分）。
   *   此前只算 content + reasoningContent → 实测漏算约 13% 的字符，
   *   叠加阈值口径错误，压缩几乎永不触发，上下文无限膨胀。
   */
  tokenCount(messages: Message[]): number {
    return messages.reduce(
      (sum, m) =>
        sum +
        estimateTokens(m.content || '') +
        estimateTokens(m.reasoningContent || '') +
        estimateTokens(this.toolCallsToText(m)),
      0,
    );
  }

  /** 把 tool_calls 序列化成可估算的文本（两种形态都认：嵌套 DeltaToolCall 与顶层 ToolCall）。 */
  private toolCallsToText(m: Message): string {
    const tcs = (m as any).toolCalls;
    if (!Array.isArray(tcs) || tcs.length === 0) return '';
    try {
      return tcs
        .map((tc: any) => {
          const name = tc?.function?.name || tc?.toolName || '';
          const raw = tc?.function?.arguments ?? tc?.arguments;
          const args = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
          return `${name}${args}`;
        })
        .join(' ');
    } catch {
      return '';
    }
  }

  /** 压缩上下文（可选 beforeCompress hook：压缩丢失前抢救细节，由调用侧注入，core 不依赖存储层） */
  async compress(
    messages: Message[],
    opts?: {
      beforeCompress?: (toCompress: Message[]) => Promise<void>;
      /** 分级压缩中「裁剪老工具输出」这一档的最大字符数（默认 8KB） */
      toolCapChars?: number;
    },
  ): Promise<Message[]> {
    if (this.tokenCount(messages) <= this.maxTokens) {
      return messages;
    }

    // ★ 第 ① 级：先裁剪超长老工具输出（不动对话结构、tool 配对完整）。
    //   很多长任务只靠这一档就能降到阈值以下 —— 比"丢前文换一条摘要"温和得多。
    //   只有裁剪后仍超限，才进入第 ② 级整段摘要。
    const toolCapChars = opts?.toolCapChars ?? COMPRESS_TOOL_CAP_CHARS;
    const trimmed = messages.map((m) => {
      if (m.role !== 'tool') return m;
      const text = m.content || '';
      if (text.length <= toolCapChars) return m;
      return { ...m, content: capLongText(text, toolCapChars) };
    });
    if (this.tokenCount(trimmed) <= this.maxTokens) return trimmed; // 裁剪即够 → 保住全部消息

    // 切窗边界对齐：保留窗口绝不能从 tool 消息中间开始（否则产生孤儿 tool，
    // 严格上游 400，兜底清洗只能丢弃 → tool 返回值丢失）。把边界回退到该组
    // tool 应答所属的 assistant（带 tool_calls）处，整对保留，返回值一条不丢。
    let cut = trimmed.length - this.keepRecent;
    while (cut > 0 && trimmed[cut].role === 'tool') cut--;
    if (cut <= 0) return trimmed; // 无法在保住配对的前提下压缩，保持（已裁剪的）原样发送

    const toCompress = trimmed.slice(0, cut);
    const toKeep = trimmed.slice(cut);

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
    // ★★★ 摘要输入必须**带上 tool_calls**（2026-09-29 排障）：
    //   此前 `map((m) => m.content || '')` 直接丢弃 toolCalls —— 而「模型如何调用工具」
    //   恰恰是它最需要模仿的行为样本。丢掉之后，历史里只剩 keepRecent 窗口内的调用，
    //   一旦那些调用是空参，模型就持续模仿空参（自我强化退化循环）。
    //   这里保留工具**名字与参数原文**，让摘要里始终存在「用完整参数调用工具」的示范。
    const render = (m: Message) => {
      const tools = this.toolCallsToText(m);
      const parts = [m.content || ''];
      if (tools) parts.push(`[调用工具] ${tools}`);
      return `${m.role}: ${parts.filter(Boolean).join(' ')}`;
    };

    if (!this.summaryClient || !this.summaryModel) {
      // 无摘要模型时，简单截断
      const content = messages.map(render).join('\n').slice(0, 500);
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
        content: messages.map(render).join('\n'),
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
