/**
 * 交付文件归轮回归测试（2026-10-27 用户实报「三个交付文件只显示一个」）
 *
 * 现场：任务产出 xlsx / md / docx 三份交付物，文件管理面板显示 3 个，聊天区只有 1 张卡片。
 * 根因：卡片按轮次渲染，归组原先只认 messageId —— agent file_write 的 md 带 messageId，
 * 而 Excel / Word / PNG 走前端导出通道（saveDeliverableBytes），登记时**没有 messageId**，
 * 被归组逻辑直接跳过。修法：没有（或匹配不上）messageId 的文件按创建时间归轮。
 */
import { describe, it, expect } from 'vitest';
import type { ConversationFile } from '@yan-zhi/shared';
import type { MessageRound } from '../composables/chat/message-rounds';
import { groupDeliverablesByRound, roundIndexForTime } from './deliverable-rounds';

function round(userAt: number, assistantId: string, stepIds: string[] = []): MessageRound {
  return {
    user: { id: 'u-' + userAt, role: 'user', content: 'q', createdAt: userAt } as any,
    steps: stepIds.map((id) => ({ messageId: id, toolCalls: [], toolResults: [] })),
    allToolCalls: [],
    finalAssistant: { id: assistantId, role: 'assistant', content: 'a', createdAt: userAt } as any,
  };
}

function file(id: string, createdAt: number, messageId?: string): ConversationFile {
  return {
    id, conversationId: 'c1', name: id + '.bin', path: 'C:/d/' + id + '.bin',
    category: 'deliverable', size: 1, source: 'agent', createdAt, messageId,
  };
}

describe('交付文件归轮', () => {
  const rounds = [round(1000, 'm1'), round(5000, 'm2', ['m2-step'])];

  it('★ 没有 messageId 的导出文件（xlsx/docx/png）按时间归轮，不再凭空消失', () => {
    const files = [file('md', 5200, 'm2'), file('xlsx', 5300), file('docx', 5400)];
    const out = groupDeliverablesByRound(rounds, files);
    expect(out[0]).toHaveLength(0);
    expect(out[1].map((f) => f.id).sort()).toEqual(['docx', 'md', 'xlsx']);
  });

  it('messageId 精确命中优先于时间窗（哪怕时间落在别的轮次窗口）', () => {
    const out = groupDeliverablesByRound(rounds, [file('a', 6000, 'm1')]);
    expect(out[0].map((f) => f.id)).toEqual(['a']);
    expect(out[1]).toHaveLength(0);
  });

  it('步骤消息 id 也算本轮命中（file_write 可能挂在中途某条助手消息上）', () => {
    const out = groupDeliverablesByRound(rounds, [file('a', 6000, 'm2-step')]);
    expect(out[1].map((f) => f.id)).toEqual(['a']);
  });

  it('时间落在第一轮窗口 → 归第一轮；早于所有轮次（更早历史未加载）也归第一轮', () => {
    const out = groupDeliverablesByRound(rounds, [file('old-in', 2000), file('older', 10)]);
    expect(out[0].map((f) => f.id).sort()).toEqual(['old-in', 'older']);
  });

  it('messageId 匹配不上任何轮（消息未加载）→ 按时间兜底，仍然可见', () => {
    const out = groupDeliverablesByRound(rounds, [file('a', 3000, 'not-loaded')]);
    expect(out[0].map((f) => f.id)).toEqual(['a']);
  });

  it('没有创建时间 → 归最后一轮（宁可挂错一轮也不能消失）', () => {
    const out = groupDeliverablesByRound(rounds, [file('no-time', 0)]);
    expect(out[1].map((f) => f.id)).toEqual(['no-time']);
  });

  it('每份文件只出现一次（精确命中后不会被时间窗重复归组）', () => {
    const files = [file('md', 5200, 'm2'), file('xlsx', 5300)];
    const out = groupDeliverablesByRound(rounds, files);
    expect(out.flat().map((f) => f.id).sort()).toEqual(['md', 'xlsx']);
  });

  it('roundIndexForTime 边界：恰好在用户消息时刻归该轮', () => {
    expect(roundIndexForTime(5000, rounds)).toBe(1);
    expect(roundIndexForTime(4999, rounds)).toBe(0);
    expect(roundIndexForTime(undefined, rounds)).toBe(1);
    expect(roundIndexForTime(1, [])).toBe(0);
  });
});
