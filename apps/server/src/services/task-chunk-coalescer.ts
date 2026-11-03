export interface TaskChunkEvent {
  type: 'chunk';
  content?: string;
  reasoning?: string;
  subAgentId?: string;
  parentToolCallId?: string;
  [key: string]: unknown;
}

/**
 * 把短时间内的流式增量按“主任务/子任务”分桶合并。
 *
 * 上游可能每几毫秒吐一个字符；逐条 emit 会让事件缓冲很快达到 10000 上限，
 * 并把 tool:execute 等关键事件挤出重放窗口。合并只改变推送粒度，不丢文本。
 */
export class TaskChunkCoalescer {
  private readonly buckets = new Map<string, TaskChunkEvent>();

  push(event: TaskChunkEvent): void {
    const content = typeof event.content === 'string' ? event.content : '';
    const reasoning = typeof event.reasoning === 'string' ? event.reasoning : '';
    if (!content && !reasoning) return;

    const key = `${event.subAgentId || ''}\u0000${event.parentToolCallId || ''}`;
    const prev = this.buckets.get(key);
    if (!prev) {
      this.buckets.set(key, {
        ...event,
        ...(content ? { content } : {}),
        ...(reasoning ? { reasoning } : {}),
      });
      return;
    }
    this.buckets.set(key, {
      ...prev,
      ...(content ? { content: `${prev.content || ''}${content}` } : {}),
      ...(reasoning ? { reasoning: `${prev.reasoning || ''}${reasoning}` } : {}),
    });
  }

  drain(): TaskChunkEvent[] {
    const events = [...this.buckets.values()];
    this.buckets.clear();
    return events;
  }

  get size(): number {
    return this.buckets.size;
  }
}
