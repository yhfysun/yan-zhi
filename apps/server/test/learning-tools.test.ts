// 学习查询工具回归（learning/tools.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离）。
// 为什么值得测：
//   1) 工具名是 agent builtin_tool_ids 的白名单值（拼错 = 静默丢弃，模型看不到）；
//   2) ★ 用户态隔离：setLearningToolUser 不设/设错时工具必须拒绝或查不到别人的数据 ——
//      学习数据外泄到无关会话是隐私事故；
//   3) 三个工具全 SELECT（只读边界），执行后库里数据不变。
import { describe, it, expect, beforeAll } from 'vitest';
import { getToolRegistry } from '@yan-zhi/core';
import { registerLearningTools, setLearningToolUser, LEARNING_TOOL_NAMES } from '../src/learning/tools';
import { createCustomBook, addError } from '../src/learning/service';
import { db } from '../src/db';

const registry = getToolRegistry();
const uid = `tool-user-${Date.now()}`;

beforeAll(() => {
  registerLearningTools(registry);
});

describe('学习查询工具 · 注册与白名单契约', () => {
  it('三个工具都在 registry（拼错名 = 静默丢弃）', () => {
    const names = registry.list().map((t) => t.name);
    for (const n of LEARNING_TOOL_NAMES) expect(names, `缺 ${n}`).toContain(n);
  });

  it('★ 名单与 agent builtin_tool_ids 完全一致（两边手写必须钉住）', async () => {
    const { LEARNING_AGENT_BUILTIN_TOOLS } = await import('../src/builtin-learning-agents');
    expect([...LEARNING_AGENT_BUILTIN_TOOLS].sort()).toEqual([...LEARNING_TOOL_NAMES].sort());
  });

  it('全部只读：执行后 learning 表行数不变', async () => {
    setLearningToolUser(uid);
    const count = () => {
      const tables = ['learning_word', 'learning_error', 'learning_session', 'word_level', 'learning_profile'];
      return tables.map((t) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c).join(',');
    };
    const before = count();
    await registry.execute('learning_get_profile', {});
    await registry.execute('learning_query_words', { dueOnly: true });
    await registry.execute('learning_get_history', { limit: 5 });
    expect(count()).toBe(before);
  });
});

describe('学习查询工具 · 用户态与数据可见性', () => {
  it('未设置用户态时拒绝执行（不猜测数据归属）', async () => {
    setLearningToolUser('');
    const r = await registry.execute('learning_get_profile', {}) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('用户态');
  });

  it('★ 只能看到当前用户的数据：A 建的词书，切到 B 查不到', async () => {
    const bookId = createCustomBook(uid, 'A的词书', [{ word: 'solo', gloss: 'adj. 单独的' }]);
    expect(bookId).toBeTruthy();
    addError(uid, { wrong: 'I go yesterday', right: 'I went yesterday' });

    setLearningToolUser(uid);
    const mine = await registry.execute('learning_query_words', { limit: 50 }) as { content: Array<{ text: string }>; isError: boolean };
    expect(mine.isError).toBe(false);
    expect(mine.content[0].text).toContain('solo');

    setLearningToolUser(`someone-else-${Date.now()}`);
    const theirs = await registry.execute('learning_query_words', { limit: 50 }) as { content: Array<{ text: string }>; isError: boolean };
    expect(theirs.isError).toBe(false);
    expect(theirs.content[0].text).not.toContain('solo');

    const prof = await registry.execute('learning_get_profile', {}) as { content: Array<{ text: string }>; isError: boolean };
    expect(prof.content[0].text).not.toContain('A的词书');
  });

  it('learning_get_history 返回 context 摘要（个性化引用用）', async () => {
    setLearningToolUser(uid);
    const r = await registry.execute('learning_get_history', {}) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toContain('recent');
  });
});
