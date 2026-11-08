// 学习模式 · 只读查询工具（§3.6 第 2 层）：挂在教学智能体上，模型可主动查学习记录。
//
// ★ 用户态注入收口：工具的 execute 拿不到任务上下文 —— 与 browser 工具同款解法，
//   在 registry.execute 唯一出口旁 setLearningToolUser(task.userId)（llm-task-manager），
//   每次调用前都设置，避免残留上一个会话的值。
// ★ 只读边界：三个工具全部 SELECT，不提供任何写入口 —— 学习数据不外泄也不可篡改。
import type { BuiltInTool, ToolRegistry } from '@yan-zhi/core';
import { getProfileWithStreak, listWordBooks, countDueWords, listErrors, getLearningContext } from './service.js';
import { db } from '../db.js';

// toolOk/toolError 在 core 的 tool/result.ts，但未随包导出 —— 本地同构实现（形状一致）
function toolOk(text: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { content: [{ type: 'text', text }], isError: false };
}
function toolError(msg: string): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

let currentUserId = '';
export function setLearningToolUser(userId: string): void {
  currentUserId = userId || '';
}

/** 词本行（脱掉内部字段，只给模型可读摘要） */
type WordRowLite = { book: string; word: string; phonetic: string | null; gloss: string; box: number; dueAt: number | null };

function queryWords(userId: string, opts: { bookId?: string; dueOnly?: boolean; box?: number; limit?: number }): WordRowLite[] {
  const args: unknown[] = [userId];
  let where = 'lw.user_id = ?';
  if (opts.bookId) { where += ' AND lw.book_id = ?'; args.push(opts.bookId); }
  if (opts.dueOnly) { where += ' AND (lw.due_at IS NULL OR lw.due_at <= ?)'; args.push(Date.now()); }
  if (opts.box) { where += ' AND lw.box = ?'; args.push(opts.box); }
  args.push(Math.min(50, Math.max(1, opts.limit || 15)));
  const rows = db.prepare(
    `SELECT lw.word, lw.phonetic, lw.gloss, lw.box, lw.due_at, wb.name AS book
     FROM learning_word lw LEFT JOIN word_book wb ON wb.id = lw.book_id
     WHERE ${where} ORDER BY lw.due_at ASC LIMIT ?`,
  ).all(...args) as Array<{ book: string; word: string; phonetic: string | null; gloss: string; box: number; due_at: number | null }>;
  return rows.map((r) => ({ book: r.book || '', word: r.word, phonetic: r.phonetic, gloss: r.gloss, box: r.box, dueAt: r.due_at }));
}

class LearningGetProfileTool implements BuiltInTool {
  name = 'learning_get_profile';
  description = '查询用户英语学习档案：CEFR 等级、连续学习天数、各词书进度、错误本条数、到期词数';
  inputSchema = { type: 'object', properties: {}, required: [] };
  async execute() {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const profile = getProfileWithStreak(currentUserId);
      const books = listWordBooks(currentUserId).map((b) => ({ name: b.name, words: b.wordCount, levels: b.levelCount, cleared: b.maxLevelCleared }));
      const data = { profile, books, dueWords: countDueWords(currentUserId), errors: listErrors(currentUserId, 100).length };
      return toolOk(JSON.stringify(data));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

class LearningQueryWordsTool implements BuiltInTool {
  name = 'learning_query_words';
  description = '查用户的词本：按词书/只看到期/按 SRS 盒数过滤，返回词+释义+复习盒（教学参考，只读）';
  inputSchema = {
    type: 'object',
    properties: {
      bookId: { type: 'string', description: '词书 id（可选，不填查全部）' },
      dueOnly: { type: 'boolean', description: '只看到期词（默认 false）' },
      box: { type: 'number', description: 'SRS 盒号 1-5（可选）' },
      limit: { type: 'number', description: '最多返回几条（默认 15，上限 50）' },
    },
    required: [],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const rows = queryWords(currentUserId, {
        bookId: typeof args.bookId === 'string' && args.bookId ? args.bookId : undefined,
        dueOnly: args.dueOnly === true,
        box: typeof args.box === 'number' ? args.box : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      return toolOk(JSON.stringify(rows));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

class LearningGetHistoryTool implements BuiltInTool {
  name = 'learning_get_history';
  description = '查用户最近的学习练习记录（闯关/复习/场景，含分数与时间），用于个性化教学引用';
  inputSchema = {
    type: 'object',
    properties: { limit: { type: 'number', description: '最多几条（默认 10，上限 30）' } },
    required: [],
  };
  async execute(args: Record<string, unknown>) {
    if (!currentUserId) return toolError('当前会话没有用户态（非登录环境）');
    try {
      const limit = Math.min(30, Math.max(1, typeof args.limit === 'number' ? args.limit : 10));
      const rows = db.prepare(
        'SELECT mode, scene_id, score, started_at FROM learning_session WHERE user_id = ? ORDER BY started_at DESC LIMIT ?',
      ).all(currentUserId, limit) as Array<{ mode: string; scene_id: string | null; score: number | null; started_at: number }>;
      return toolOk(JSON.stringify({ recent: rows, context: getLearningContext(currentUserId) }));
    } catch (e) { return toolError(e instanceof Error ? e.message : String(e)); }
  }
}

export function registerLearningTools(registry: ToolRegistry): void {
  registry.register(new LearningGetProfileTool());
  registry.register(new LearningQueryWordsTool());
  registry.register(new LearningGetHistoryTool());
}

export const LEARNING_TOOL_NAMES = ['learning_get_profile', 'learning_query_words', 'learning_get_history'] as const;
