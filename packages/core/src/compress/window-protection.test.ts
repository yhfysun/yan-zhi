// 工具结果保护窗口（2026-10-19 回归）—— 真跑验证。
//
// 实测事故：一次助手消息带多个并行工具调用时，旧的「按消息数保护」只护住 ~3 条
// 工具结果，其余同批结果立刻被裁成"已压缩"标记，弱模型误读为"新读取也被清理"，
// 任务原地打转；enforceBudget 又按"最长优先"清除、不保护最新结果。
import { describe, it, expect } from 'vitest';
import { capStaleToolResults, enforceBudget } from './window.js';

function toolMsg(id: string, chars: number, ch = 'x'): any {
  return { id, conversationId: 'c', role: 'tool', content: ch.repeat(chars), createdAt: 0 };
}
function assistantMsg(id: string): any {
  return { id, conversationId: 'c', role: 'assistant', content: '', createdAt: 0 };
}

describe('capStaleToolResults：保护窗口按工具结果条数计', () => {
  it('★ 同一批 8 条并行工具结果：最近 6 条原文，较早 2 条才裁剪', () => {
    const msgs: any[] = [assistantMsg('a1'), assistantMsg('a2')];
    for (let i = 0; i < 8; i++) msgs.push(toolMsg(`t${i}`, 10000)); // 每条 10KB > 8KB 上限
    const out = capStaleToolResults(msgs, 6);
    const tools = out.filter((m: any) => m.role === 'tool');
    // 最近的 6 条（t2..t7）保持原文
    for (let i = 2; i < 8; i++) {
      expect(tools[i].content.length, `tool t${i} 应保持原文`).toBe(10000);
    }
    // 较早的 2 条（t0,t1）被裁剪且带标记
    expect(tools[0].content.length).toBeLessThan(10000);
    expect(tools[0].content).toContain('已压缩');
    expect(tools[1].content).toContain('已压缩');
  });

  it('消息里混有非工具消息也不占保护名额', () => {
    const msgs: any[] = [];
    for (let i = 0; i < 7; i++) msgs.push(toolMsg(`t${i}`, 10000), assistantMsg(`a${i}`));
    const out = capStaleToolResults(msgs, 6);
    const tools = out.filter((m: any) => m.role === 'tool');
    for (let i = 1; i < 7; i++) expect(tools[i].content.length).toBe(10000);
    expect(tools[0].content).toContain('已压缩');
  });
});

describe('enforceBudget：最近工具结果受保护', () => {
  it('★ 超预算时先清老结果，最新 file_read 内容原样保留', () => {
    const msgs: any[] = [
      { id: 's', conversationId: 'c', role: 'system', content: 'sys', createdAt: 0 },
      toolMsg('old', 8000, 'o'),
      assistantMsg('a1'),
      toolMsg('fresh', 4000, 'f'),
    ];
    // budget 足够装下 system+fresh 但装不下 old（按 estimateTokens 的经验值取保守小预算）
    const out = enforceBudget(msgs, 2500);
    const fresh = out.find((m: any) => m.id === 'fresh')!;
    const old = out.find((m: any) => m.id === 'old');
    expect(fresh.content).toBe('f'.repeat(4000)); // 最新结果不被清除
    if (old) expect(old.content).not.toContain('oooo'); // 老结果被清或整体被丢
  });

  it('预算小到连受保护项都装不下时，最后兜底仍会清除（保证请求不超限）', () => {
    const msgs: any[] = [
      { id: 's', conversationId: 'c', role: 'system', content: 'sys', createdAt: 0 },
      toolMsg('fresh', 20000, 'f'),
    ];
    const out = enforceBudget(msgs, 500);
    const fresh = out.find((m: any) => m.id === 'fresh');
    // 要么被清除成占位符，要么整体被丢 —— 不允许超预算返回
    if (fresh) expect(fresh.content).toContain('已从历史中清理');
  });
});
