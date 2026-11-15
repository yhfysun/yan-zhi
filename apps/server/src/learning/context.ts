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

// ── 非英语科目的注入块（传统文化与音乐学习模式方案 §4.6 P1：按科目分块） ────────

export type SubjectLearningContextInput = {
  subject: '传统文化' | '音乐' | '周易';
  /** 最近完成的课时 id（最近在前，最多 5 条，调用方截断） */
  recentLessons: string[];
  /** 传统文化：错误本 top（对句/自测的薄弱点引用，最多 3 条） */
  topErrors: Array<{ wrong: string; right: string }>;
};

/**
 * 传统文化/音乐/周易科目的注入块：[学习档案-科目]（最近完成课时）+（音乐）[方向分域]
 * +（文化）[对句薄弱点]。
 * ★ 无数据（没课时也没薄弱点）返回空串 —— 调用方拿到空串就不注入，不给模型塞空块。
 * ★ 音乐方向分域（音乐双方向重构方案 2026-11-15 §3.4）：从课时 id 前缀（mus_w_/mus_t_）
 *   推断方向占比注入，陪练据此分域讲解、术语不串味。
 */
export function buildSubjectLearningContextSummary(input: SubjectLearningContextInput): string {
  const lessons = input.recentLessons.filter(Boolean);
  const errors = input.subject === '传统文化' ? input.topErrors : [];
  if (!lessons.length && !errors.length) return '';
  const lines: string[] = [];
  lines.push('【学习档案 · 系统注入】（以下是用户在本科目的学习状态摘要，供你个性化教学，不要原样照读）');
  if (lessons.length) lines.push(`[学习档案-${input.subject}] 最近完成课时：${lessons.join('、')}`);
  if (input.subject === '音乐') {
    const wCount = lessons.filter((l) => l.startsWith('mus_w_')).length;
    const tCount = lessons.filter((l) => l.startsWith('mus_t_')).length;
    if (wCount || tCount) {
      const parts: string[] = [];
      if (wCount) parts.push(`现代通用乐理（western）×${wCount}`);
      if (tCount) parts.push(`中国传统音乐（traditional）×${tCount}`);
      lines.push(`[学习档案-音乐·方向] ${parts.join('；')}——按所在方向分域讲解，两套体系术语不串味`);
    }
  }
  if (errors.length) {
    lines.push(`[对句薄弱点] 错误本记录（可引用）：${errors.map((e) => `「${e.wrong}」→「${e.right}」`).join('；')}`);
  }
  return lines.join('\n');
}
