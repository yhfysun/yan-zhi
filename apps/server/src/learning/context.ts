// 学习模式 · 学习上下文注入纯函数（方案 §3.6 第 1 层）。
// 输入是从库里查出的行，输出是拼进 system_prompt 的摘要块——纯函数可单测，
// 与 builtin-learning-agents.ts 的 LEARNING_PROMPT_CONTEXT_MARK 成对维护（单测钉住）。

export type LearningContextInput = {
  profile: { cefr?: string | null; goals?: string | null } | null;
  /** 最近完成的关卡（按时间倒序，最多 3 条） */
  recentLevels: Array<{ bookName: string; levelNo: number; stars: number; clearedAt: number }>;
  /** 今日到期词（最多取 8 个） */
  dueWords: string[];
  /** 错误本 top（最多 3 条） */
  topErrors: Array<{ wrong: string; right: string }>;
  /** 自定义词单（名称 + 词数 + 学到第几关） */
  customBooks: Array<{ name: string; wordCount: number; maxLevelCleared: number }>;
  now: number;
};

/** 连续学习天数：给定最近一次学习时间戳与 streak 基础值（本期简化：由 service 直接传入） */
export type StreakInput = { streakDays: number } | null;

export function buildLearningContextSummary(input: LearningContextInput, streak: StreakInput = null): string {
  const lines: string[] = [];
  lines.push('【学习档案 · 系统注入】（以下是用户的学习状态摘要，供你个性化教学，不要原样照读）');
  if (input.profile?.cefr) {
    lines.push(`[学习档案] CEFR ${input.profile.cefr}${input.profile.goals ? `；目标：${input.profile.goals}` : ''}`);
  } else {
    // 新用户（没档案或没定级）：明确告知模型走摸底流程
    lines.push('[学习档案] 尚未定级：新用户，先做摸底对话');
  }
  if (input.recentLevels.length) {
    const latest = input.recentLevels[0];
    const rest = input.recentLevels.length > 1 ? `；更早：${input.recentLevels.slice(1).map((l) => `${l.bookName}第${l.levelNo}关`).join('、')}` : '';
    lines.push(`[最近学习] 最近一次：${latest.bookName} 第 ${latest.levelNo} 关（${latest.stars} 星）${rest}`);
  }
  if (streak && streak.streakDays > 0) lines.push(`[学习档案] 连续学习 ${streak.streakDays} 天`);
  if (input.dueWords.length) lines.push(`[到期复习] ${input.dueWords.length} 个词今天到期：${input.dueWords.join(', ')}`);
  if (input.topErrors.length) {
    lines.push(`[薄弱点] 错误本 top：${input.topErrors.map((e) => `「${e.wrong}」应为「${e.right}」`).join('；')}`);
  }
  for (const b of input.customBooks) {
    lines.push(`[自定义词单] 「${b.name}」（${b.wordCount} 词，已闯到第 ${b.maxLevelCleared} 关）`);
  }
  return lines.join('\n');
}
