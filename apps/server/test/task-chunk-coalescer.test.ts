import { describe, expect, it } from 'vitest';
import { TaskChunkCoalescer } from '../src/services/task-chunk-coalescer.js';

describe('TaskChunkCoalescer', () => {
  it('合并同一流窗口内的 content 与 reasoning，不改变文本顺序', () => {
    const b = new TaskChunkCoalescer();
    b.push({ type: 'chunk', content: '你' });
    b.push({ type: 'chunk', content: '好' });
    b.push({ type: 'chunk', reasoning: '先确' });
    b.push({ type: 'chunk', reasoning: '认口径' });

    expect(b.drain()).toEqual([{
      type: 'chunk',
      content: '你好',
      reasoning: '先确认口径',
    }]);
    expect(b.drain()).toEqual([]);
  });

  it('主智能体与子智能体的增量分开合并', () => {
    const b = new TaskChunkCoalescer();
    b.push({ type: 'chunk', content: '主' });
    b.push({ type: 'chunk', content: '子', subAgentId: 'agent-1', parentToolCallId: 'tool-1' });
    b.push({ type: 'chunk', content: '体' });

    expect(b.drain()).toEqual([
      { type: 'chunk', content: '主体' },
      { type: 'chunk', content: '子', subAgentId: 'agent-1', parentToolCallId: 'tool-1' },
    ]);
  });

  it('空增量不产生事件', () => {
    const b = new TaskChunkCoalescer();
    b.push({ type: 'chunk' });
    b.push({ type: 'chunk', content: '' });
    expect(b.drain()).toEqual([]);
  });
});
