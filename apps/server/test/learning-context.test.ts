// 学习上下文注入块回归（learning/context.ts）。
// ★ 成对维护契约：注入块首行必须含 LEARNING_PROMPT_CONTEXT_MARK，且该标记必须出现在
//   builtin-learning-agents.ts 的提示词里——两边不同步 = 模型看不到档案或提示词找不到注入位。
import { describe, it, expect } from 'vitest';
import { buildLearningContextSummary, type LearningContextInput } from '../src/learning/context';
import { LEARNING_PROMPT_CONTEXT_MARK, LEARNING_AGENT_SYSTEM_PROMPT } from '../src/builtin-learning-agents';

const base: LearningContextInput = {
  profile: { cefr: 'B1', goals: '能应付日常口语' },
  recentLevels: [{ bookName: 'CET4 高频核心 · 示例', levelNo: 3, stars: 2, clearedAt: 1 }],
  dueWords: ['abandon', 'casual'],
  topErrors: [{ wrong: 'I have seen him yesterday', right: 'I saw him yesterday' }],
  customBooks: [{ name: '面试词汇', wordCount: 12, maxLevelCleared: 1 }],
  now: 1_700_000_000_000,
};

describe('学习上下文注入块', () => {
  it('首行含系统注入标记（模型识别锚点，改文案不丢标记）', () => {
    const s = buildLearningContextSummary(base);
    expect(s.startsWith('【学习档案 · 系统注入】') || s.includes(LEARNING_PROMPT_CONTEXT_MARK)).toBe(true);
    expect(s).toContain(LEARNING_PROMPT_CONTEXT_MARK);
  });

  it('★ 标记与提示词成对：提示词里必须出现同一个标记', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain(LEARNING_PROMPT_CONTEXT_MARK);
  });

  it('包含档案/最近学习/到期/薄弱点/自定义词单各段', () => {
    const s = buildLearningContextSummary(base);
    expect(s).toContain('[学习档案] CEFR B1');
    expect(s).toContain('目标：能应付日常口语');
    expect(s).toContain('[最近学习] 最近一次：CET4 高频核心 · 示例 第 3 关（2 星）');
    expect(s).toContain('[到期复习] 2 个词今天到期：abandon, casual');
    expect(s).toContain('[薄弱点]');
    expect(s).toContain('「I have seen him yesterday」应为「I saw him yesterday」');
    expect(s).toContain('[自定义词单] 「面试词汇」（12 词，已闯到第 1 关）');
  });

  it('连续学习天数进档案段', () => {
    const s = buildLearningContextSummary(base, { streakDays: 5 });
    expect(s).toContain('连续学习 5 天');
  });

  it('新用户（空输入）也要给摸底指引段，且不崩', () => {
    const s = buildLearningContextSummary({
      profile: null, recentLevels: [], dueWords: [], topErrors: [], customBooks: [], now: 0,
    });
    expect(s).toContain('尚未定级');
    expect(s).not.toContain('[到期复习]');
    expect(s).not.toContain('[最近学习]');
  });

  it('到期词超量截断由调用方负责（本函数不截）——契约：service LIMIT 8', () => {
    const s = buildLearningContextSummary({ ...base, dueWords: Array.from({ length: 20 }, (_, i) => `w${i}`) });
    expect(s).toContain('20 个词今天到期');
  });
});
