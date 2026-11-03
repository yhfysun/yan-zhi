import { describe, expect, it } from 'vitest';
import { retainReplayEvents } from '../src/services/task-event-buffer.js';

describe('任务重放事件缓冲', () => {
  it('超限时优先淘汰旧 chunk，保留工具和控制事件', () => {
    const events = [
      { type: 'chunk', seq: 1 },
      { type: 'tool:execute', seq: 2 },
      { type: 'chunk', seq: 3 },
      { type: 'tool:result', seq: 4 },
      { type: 'chunk', seq: 5 },
    ];

    expect(retainReplayEvents(events, 3).map((event) => event.seq)).toEqual([2, 4, 5]);
  });

  it('非 chunk 事件本身超限时只淘汰最旧项', () => {
    const events = [
      { type: 'tool:start', seq: 1 },
      { type: 'tool:result', seq: 2 },
      { type: 'message:added', seq: 3 },
    ];
    expect(retainReplayEvents(events, 2).map((event) => event.seq)).toEqual([2, 3]);
  });

  it('未超限时保持原顺序', () => {
    const events = [{ type: 'chunk', seq: 1 }, { type: 'tool:execute', seq: 2 }];
    expect(retainReplayEvents(events, 10)).toEqual(events);
  });
});
