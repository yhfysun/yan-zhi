/**
 * 输入框下一步建议 · 行为级测试（2026-10-31）。
 *
 * 被测：services/next-step-suggestion.ts（清洗 / 素材 / 指纹缓存 / 并发去重 / 失败静默）。
 *
 * ★ 用真 sqlite（sql.js WASM），与 conversation-title.test.ts 同一套环境约定：
 *   YZ_TEST_FORCE_SQLJS=1 → vi.hoisted 建连接 → mock db.js / llm-call.js → 再 import 被测模块。
 * ★ 覆盖点（按成本控制三道闸）：
 *   ① 指纹缓存：同一最后消息只真正调一次 LLM；新消息到达必须重算；
 *   ② 失败静默：chatViaRow 抛错 / 无模型 / 无素材一律返回 suggestion:null，绝不抛给路由；
 *   ③ 清洗：引号、前缀、多行、结尾标点、「无」。
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { openSqlite } from '../src/services/sqlite-driver.js';

const hoisted = vi.hoisted(() => {
  process.env.YZ_TEST_FORCE_SQLJS = '1';
  return {
    conn: null as any,
    testUser: 'u_suggest',
    chatViaRowMock: vi.fn(),
  };
});

vi.mock('../src/db.js', () => ({
  get db() { return hoisted.conn; },
  get dataDir() { return process.env.DATA_DIR || ''; },
}));

vi.mock('../src/services/llm-call.js', () => ({
  chatViaRow: hoisted.chatViaRowMock,
}));

vi.mock('../src/services/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

const { db: conn } = await openSqlite(':memory:');
hoisted.conn = conn;
const { suggestNextFor, sanitizeSuggestion, collectSuggestionMaterial, __resetSuggestCache } =
  await import('../src/services/next-step-suggestion.js');

function createTables(): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model (
      id TEXT PRIMARY KEY, user_id TEXT, platform_id TEXT, model_id TEXT,
      enabled INTEGER DEFAULT 1, type TEXT DEFAULT 'llm', visible INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS platform (
      id TEXT PRIMARY KEY, user_id TEXT, api_url TEXT, api_key_enc TEXT,
      protocol TEXT DEFAULT 'openai', headers_json TEXT, llm_enabled INTEGER DEFAULT 1, is_builtin INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS platform_api_key (
      id TEXT PRIMARY KEY, platform_id TEXT, user_id TEXT, api_key TEXT, label TEXT,
      fail_count INTEGER DEFAULT 0, last_fail_at INTEGER, enabled INTEGER DEFAULT 1, created_at INTEGER
    );
  `);
}

function seedModel(): void {
  conn.prepare(
    "INSERT OR IGNORE INTO platform (id, user_id, api_url, protocol, llm_enabled) VALUES ('p1', ?, 'https://api.test/v1', 'openai', 1)",
  ).run(hoisted.testUser);
  conn.prepare(
    "INSERT OR IGNORE INTO model (id, user_id, platform_id, model_id, enabled, type, visible) VALUES ('m1', ?, 'p1', 'test-model', 1, 'llm', 1)",
  ).run(hoisted.testUser);
}

let msgSeq = 0;
function seedMsg(convId: string, role: string, content: string): void {
  msgSeq += 1;
  conn.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(`msg_${msgSeq}`, convId, hoisted.testUser, role, content, msgSeq);
}

const MODEL = { platformId: 'p1', modelId: 'm1' };

beforeAll(() => {
  createTables();
  seedModel();
});

beforeEach(() => {
  __resetSuggestCache();
  hoisted.chatViaRowMock.mockReset();
  hoisted.chatViaRowMock.mockResolvedValue({ content: '继续 P1-9 硬编+渲染队列', tokens: 12 });
});

describe('sanitizeSuggestion · 模型输出清洗', () => {
  it('去引号、去「建议：」前缀、去结尾句号', () => {
    expect(sanitizeSuggestion('「建议：继续 P1-9 硬编+渲染队列。」')).toBe('继续 P1-9 硬编+渲染队列');
  });

  it('多行输出只取第一行', () => {
    expect(sanitizeSuggestion('继续跑测试\n原因：上一轮失败')).toBe('继续跑测试');
  });

  it('「无」/空串视为没有建议', () => {
    expect(sanitizeSuggestion('无')).toBeNull();
    expect(sanitizeSuggestion('   ')).toBeNull();
    expect(sanitizeSuggestion('None')).toBeNull();
  });

  it('超长建议截断到 30 字', () => {
    expect(sanitizeSuggestion('一'.repeat(60))).toHaveLength(30);
  });
});

describe('collectSuggestionMaterial · 素材收集', () => {
  it('只要 user/assistant 正文，工具/空内容被跳过', () => {
    const material = collectSuggestionMaterial([
      { role: 'user', content: '继续做 P1' },
      { role: 'tool', content: '{"ok":true}' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'P1-6 已完成，还剩 P1-7/8/9' },
    ]);
    expect(material).toContain('用户: 继续做 P1');
    expect(material).toContain('助手: P1-6 已完成');
    expect(material).not.toContain('ok');
  });

  it('从尾部优先取：超过 8 条时保留最近的对话', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `第${i}条`,
    }));
    const material = collectSuggestionMaterial(rows);
    expect(material).toContain('第19条');
    expect(material).not.toContain('第0条');
  });
});

describe('suggestNextFor · 调用与缓存', () => {
  it('正常生成：返回清洗后的一句话', async () => {
    seedMsg('c_basic', 'user', '帮我继续做 P1');
    const r = await suggestNextFor('c_basic', hoisted.testUser, MODEL);
    expect(r.suggestion).toBe('继续 P1-9 硬编+渲染队列');
    expect(r.cached).toBe(false);
    expect(hoisted.chatViaRowMock).toHaveBeenCalledTimes(1);
  });

  it('同一最后消息第二次调用命中缓存，不再调 LLM', async () => {
    seedMsg('c_cache', 'user', '继续');
    const first = await suggestNextFor('c_cache', hoisted.testUser, MODEL);
    const second = await suggestNextFor('c_cache', hoisted.testUser, MODEL);
    expect(first.suggestion).toBe('继续 P1-9 硬编+渲染队列');
    expect(second).toEqual({ suggestion: '继续 P1-9 硬编+渲染队列', cached: true });
    expect(hoisted.chatViaRowMock).toHaveBeenCalledTimes(1);
  });

  it('新消息到达后指纹变化 → 重新调用', async () => {
    seedMsg('c_newmsg', 'user', '继续');
    await suggestNextFor('c_newmsg', hoisted.testUser, MODEL);
    seedMsg('c_newmsg', 'assistant', '已完成 P1-9');
    await suggestNextFor('c_newmsg', hoisted.testUser, MODEL);
    expect(hoisted.chatViaRowMock).toHaveBeenCalledTimes(2);
  });

  it('LLM 抛错 → 静默返回空建议，不向上抛', async () => {
    seedMsg('c_fail', 'user', '继续');
    hoisted.chatViaRowMock.mockRejectedValueOnce(new Error('boom'));
    await expect(suggestNextFor('c_fail', hoisted.testUser, MODEL)).resolves.toEqual({
      suggestion: null, cached: false,
    });
  });

  it('会话没有消息 → 不调用模型', async () => {
    const r = await suggestNextFor('c_empty', hoisted.testUser, MODEL);
    expect(r.suggestion).toBeNull();
    expect(hoisted.chatViaRowMock).not.toHaveBeenCalled();
  });

  it('没有可用模型 → 返回空建议', async () => {
    seedMsg('c_nomodel', 'user', '继续');
    // 传不存在的模型标识 → 主键路径不命中，回退默认模型也查不到（本库只有 p1/m1）
    const r = await suggestNextFor('c_nomodel', 'u_other', { platformId: 'px', modelId: 'mx' });
    expect(r.suggestion).toBeNull();
  });
});
