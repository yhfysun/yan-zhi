/**
 * 消息分页 **行为级** 集成测试（2026-10-11）。
 *
 * ★ 为什么需要（补充静态守门 conversation-messages-pagination.test.ts 的缺口）：
 *   静态断言只能证明"游标 SQL 接线在"，证明不了：
 *     ① 同毫秒多条消息不漏不错位（组合游标的正确性）
 *     ② 多页翻完的拼接 == 全量（分页的不变量）
 *     ③ hasMore / oldestCursor 在边界上的表现（恰满一页 / 不满一页 / 空会话）
 *   ⇒ 用真 sqlite（sql.js WASM，与 CI 回退路径同源）+ express 真拉起路由实测。
 *
 * ★ 环境的四个坑（全部实测踩过，改这里之前先读完）：
 *   ① better-sqlite3 的 .node 按 ABI 懒加载（`new Database()` 才炸，require 的
 *      try/catch 拦不住）→ YZ_TEST_FORCE_SQLJS=1 强制走 sqlite-driver 的 sql.js。
 *   ② vi.mock 工厂提升到文件顶部：工厂内引用外层 `const` = TDZ；工厂内
 *      `await import('../src/db.js')` 自引用被 mock 的模块 = 连接错位
 *      （"no such table"）。⇒ 外层值一律经 vi.hoisted 传递，工厂只放 getter。
 *   ③ 路由读 `req.user!.userId`，auth mock 必须注入用户身份，不能只 next()。
 *   ④ 路由挂在 /api/conversations 前缀下，fetch 路径必须带前缀（否则 Express
 *      默认 404 HTML 页，res.json() 抛 "Unexpected token '<'"）。
 *
 * MESSAGE_LIST_COLS 内联自 db.ts（漂移由静态守门测试 conversation-messages-pagination.test.ts
 * 的列清单断言钉住）。本文件自己建表，不依赖 db.ts 的建表流程。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { openSqlite } from '../src/services/sqlite-driver.js';

const hoisted = vi.hoisted(() => {
  process.env.YZ_TEST_FORCE_SQLJS = '1'; // 必须先于任何 openSqlite 调用
  return {
    conn: null as any,
    testUser: 'u_paging',
    messageListCols:
      'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  };
});

vi.mock('../src/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    req.user = { userId: hoisted.testUser }; // 坑③：路由读 req.user!.userId
    next();
  },
}));

vi.mock('../src/db.js', () => ({
  // 坑②：getter 延迟取值 —— 工厂执行时（首次 import db.js）顶层已建好连接
  get db() {
    return hoisted.conn;
  },
  MESSAGE_LIST_COLS: hoisted.messageListCols,
  clearMessageSummaries: () => {},
  listMessageSummaries: () => [],
  deleteMessageSummariesAfter: () => 0,
  hasSqliteVec: false,
}));

// 其余 import 都是重依赖（llm-task-manager 拉起整个任务体系），桩掉 —— 分页路由只用到它们的导出名
vi.mock('../src/llm-task-manager.js', () => ({
  buildSystemPromptForBackend: () => '',
  buildToolsForBackend: () => [],
  setRunningTaskPermissionMode: () => {},
  compressConversationNow: async () => ({}),
}));
vi.mock('../src/tool-permission.js', () => ({ normalizePermissionMode: (v: string) => v || 'default' }));
vi.mock('../src/services/task-plan-file.js', () => ({ writeTaskPlanFile: () => {} }));
vi.mock('../src/services/workflow-tool-registry.js', () => ({
  WF_TOOL_PREFIX: 'wf_',
  MAX_WF_TOOLS_PER_CONVERSATION: 20,
}));
vi.mock('../src/services/path-guard.js', () => ({ clearAuthorization: () => {} }));

// ── 连接就绪后再拉起被测路由（此刻 mock 工厂首次执行，db = hoisted.conn）──
const { db: conn } = await openSqlite(':memory:');
hoisted.conn = conn;
const { default: conversationsRouter } = await import('../src/routes/conversations.js');

const app = express();
app.use(express.json());
app.use('/api/conversations', conversationsRouter);
let server: Server | null = null;
let base = '';

async function get(path: string): Promise<{ status: number; body: any }> {
  // 坑④：路由挂载在 /api/conversations 前缀下
  const res = await fetch(`${base}/api/conversations${path}`);
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { __raw: text.slice(0, 300) }; // 非 JSON：保留前 300 字符便于诊断
  }
  return { status: res.status, body };
}

let seeded: Array<{ id: string; createdAt: number }> = [];

/** 建表 + 造数据：N 条消息，其中 **同毫秒批量** 若干组（组合游标的靶子） */
function seed(n: number): Array<{ id: string; createdAt: number }> {
  const USER = hoisted.testUser;
  const CONV = 'conv_paging';
  conn.exec(`
    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, mode TEXT,
      pinned INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0,
      permission_mode TEXT, agent_id TEXT, skill_ids_json TEXT, task_type TEXT,
      -- 生命周期三列（2026-10-16）：列表 SQL 带 lifecycle 过滤，缺列 = no such column
      archived_at INTEGER, deleted_at INTEGER, last_activity_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls_json TEXT,
      tool_call_id TEXT,
      reasoning_content TEXT,
      system_prompt_snapshot TEXT,
      tokens INTEGER DEFAULT 0,
      parent_tool_call_id TEXT,
      sub_agent_id TEXT,
      sub_agent_name TEXT,
      sub_agent_depth INTEGER,
      data_view_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_message_conv_created ON message(conversation_id, created_at, id);
  `);
  conn.prepare('INSERT INTO conversation (id, user_id, title) VALUES (?, ?, ?)').run(CONV, USER, '分页测试');

  const inserted: Array<{ id: string; createdAt: number }> = [];
  const ins = conn.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  // 7 条一组同毫秒（模拟流式批量落库），组间隔 1ms
  for (let i = 0; i < n; i++) {
    const id = `m${String(i).padStart(4, '0')}`;
    const createdAt = Math.floor(i / 7); // 每 7 条同毫秒
    ins.run(id, CONV, USER, i % 2 === 0 ? 'user' : 'assistant', `消息${i}`, createdAt);
    inserted.push({ id, createdAt });
  }
  return inserted;
}

beforeAll(async () => {
  seeded = seed(120); // 120 条 / 每组 7 条同毫秒 → 组边界正好考验游标
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as { port: number };
      base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe('GET /:id/messages 分页口径 · 显示消息 vs 工具执行明细（2026-10-24）', () => {
  // 复刻实况：主链路里夹着中间步骤/工具回执，同时有大量子智能体明细。
  // 计数只数"页面显示消息"（user + 无 toolCalls 的 assistant）；
  // 返回窗口内的顶层行（工具卡片要用），子智能体明细不下发。
  const CONV = 'conv_display';
  const rows: Array<{ id: string; role: string; t: number; parent?: string; toolCalls?: string }> = [
    { id: 'u1', role: 'user', t: 1 },
    { id: 'a1', role: 'assistant', t: 2 },
    { id: 'a2', role: 'assistant', t: 3, toolCalls: '[{"id":"call_1"}]' },  // 中间步骤（明细）
    { id: 't2', role: 'tool', t: 4 },                                          // 工具回执（明细）
    { id: 's1', role: 'assistant', t: 5, parent: 'call_1' },                   // 子智能体（明细，不下发）
    { id: 's2', role: 'tool', t: 6, parent: 'call_1' },
    { id: 'u2', role: 'user', t: 7 },
    { id: 'a3', role: 'assistant', t: 8 },
    { id: 's3', role: 'assistant', t: 9, parent: 'call_2' },
    { id: 'a4', role: 'assistant', t: 10, toolCalls: '[{"id":"call_2"}]' },
    { id: 't4', role: 'tool', t: 11 },
  ];

  beforeAll(() => {
    conn.prepare('INSERT INTO conversation (id, user_id, title) VALUES (?, ?, ?)').run(CONV, hoisted.testUser, '显示消息口径');
    const ins = conn.prepare(
      'INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, parent_tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of rows) {
      ins.run(r.id, CONV, hoisted.testUser, r.role, `${r.id}-content`, r.toolCalls ?? null, r.role === 'tool' ? 'call_x' : null, r.parent ?? null, r.t);
    }
  });

  it('★ limit 数的是显示消息：limit=2 → 只有 u2 + a3（概览 + 最终回答）', async () => {
    const res = await get(`/${CONV}/messages?limit=2`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((m: any) => m.id);
    expect(ids).toEqual(['u2', 'a3']);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.oldestCursor.id).toBe('u2');
    // 过程规模随显示消息下发（概览条文案用），但明细本身没拉
    expect(res.body.roundMeta).toEqual({ u2: { steps: 1, tools: 1, sub: 1 } });
  });

  it('★ 首屏不含工具执行明细与子智能体明细（用户要的只有概览 + 最终回答）', async () => {
    const res = await get(`/${CONV}/messages?limit=50`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: any) => m.id)).toEqual(['u1', 'a1', 'u2', 'a3']);
    for (const m of res.body.data) {
      expect(m.parent_tool_call_id ?? null).toBeNull();
      expect(m.role === 'assistant' ? !m.tool_calls_json : true).toBe(true);
    }
    expect(res.body.roundMeta).toEqual({
      u1: { steps: 1, tools: 1, sub: 2 },
      u2: { steps: 1, tools: 1, sub: 1 },
    });
  });

  it('翻页拼接 == 全部显示消息（不丢最终回答，也不重复）', async () => {
    const collected: string[] = [];
    let cursor: { createdAt: number; id: string } | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const q = cursor ? `limit=2&before=${cursor.createdAt}&beforeId=${cursor.id}` : 'limit=2';
      const r = await get(`/${CONV}/messages?${q}`);
      expect(r.status).toBe(200);
      collected.unshift(...r.body.data.map((m: any) => m.id));
      if (r.body.hasMore === false) break;
      cursor = r.body.oldestCursor;
      expect(cursor).toBeTruthy();
    }
    expect(collected).toEqual(['u1', 'a1', 'u2', 'a3']);
  });

  it('hasMore 只看显示消息（明细不充数，否则永远"还有下一页"）', async () => {
    const r = await get(`/${CONV}/messages?limit=50`);
    expect(r.body.hasMore).toBe(false);
    expect(r.body.oldestCursor.id).toBe('u1');
  });

  it('★ 展开某一轮才拉执行详情：中间步骤 + 工具回执，子智能体明细仍不下发', async () => {
    const r1 = await get(`/${CONV}/messages/round/u1`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.map((m: any) => m.id)).toEqual(['a1', 'a2', 't2']);
    expect(r1.body.data.every((m: any) => !m.parent_tool_call_id)).toBe(true);

    const r2 = await get(`/${CONV}/messages/round/u2`);
    expect(r2.body.data.map((m: any) => m.id)).toEqual(['a3', 'a4', 't4']);

    const missing = await get(`/${CONV}/messages/round/nope`);
    expect(missing.status).toBe(404);
  });

  it('★ 点开 call_agent 卡片才拉子智能体内部步骤', async () => {
    const res = await get(`/${CONV}/messages/sub-agent/call_1`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: any) => m.id)).toEqual(['s1', 's2']);
    const otherConv = await get(`/conv_other/messages/sub-agent/call_1`);
    expect(otherConv.status).toBe(404);
  });
});

describe('GET /:id/messages 分页协议 · 行为级不变量', () => {
  it('★★★ 核心不变量：按客户端真实用法（每页 prepend）翻完页，拼接结果与全量完全一致', async () => {
    // 全量基线
    const all = await get('/conv_paging/messages');
    expect(all.status).toBe(200);
    const fullIds: string[] = all.body.data.map((m: any) => m.id);

    // 分页循环。★ 契约：页内 ASC（服务端 DESC 取页后反转），页与页从新到旧 ——
    // 客户端 loadMoreHistory 对每页做 prepend（unshift），这里必须同构拼装。
    const collected: string[] = [];
    let cursor: { createdAt: number; id: string } | null = null;
    for (let guard = 0; guard < 50; guard++) {
      const q = cursor
        ? `limit=10&before=${cursor.createdAt}&beforeId=${cursor.id}`
        : 'limit=10';
      const r = await get(`/conv_paging/messages?${q}`);
      expect(r.status).toBe(200);
      collected.unshift(...r.body.data.map((m: any) => m.id));
      if (r.body.hasMore === false) break;
      cursor = r.body.oldestCursor;
      expect(cursor, 'hasMore=true 时必须带 oldestCursor').toBeTruthy();
    }
    expect(collected).toEqual(fullIds);
    expect(collected.length).toBe(seeded.length);
  });

  it('★ 同毫秒边界不漏消息：组内 7 条全在同一毫秒，任何一页都不应吞掉同组成员', async () => {
    // 从第 3 组的中间开始翻：游标落在同毫秒组内部
    const anchor = seeded[17]; // 第 3 组（14-20 同毫秒）内部
    const r = await get(`/conv_paging/messages?limit=5&before=${anchor.createdAt}&beforeId=${anchor.id}`);
    expect(r.status).toBe(200);
    const ids = r.body.data.map((m: any) => m.id);
    // 游标之前的组内成员（m014..m016）必须都在第一页
    for (const id of ['m0014', 'm0015', 'm0016']) {
      expect(ids).toContain(id);
    }
    // 游标本身及其之后的（m0017..）绝不能出现
    expect(ids).not.toContain('m0017');
  });

  it('恰满一页：hasMore=false（off-by-one 靶子）', async () => {
    const r = await get('/conv_paging/messages?limit=120'); // 恰好等于总数
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(120);
    expect(r.body.hasMore).toBe(false); // 多取一条探测，第 121 条不存在 → false
  });

  it('limit=119（比总数小 1）：hasMore=true，翻一次后到底', async () => {
    const r1 = await get('/conv_paging/messages?limit=119');
    expect(r1.body.hasMore).toBe(true);
    const c = r1.body.oldestCursor;
    const r2 = await get(`/conv_paging/messages?limit=119&before=${c.createdAt}&beforeId=${c.id}`);
    expect(r2.body.data).toHaveLength(1);
    expect(r2.body.hasMore).toBe(false);
  });

  it('空会话：hasMore=false、oldestCursor=null、data=[]', async () => {
    conn.prepare('INSERT INTO conversation (id, user_id, title) VALUES (?, ?, ?)').run('conv_empty', hoisted.testUser, '空');
    const r = await get('/conv_empty/messages?limit=10');
    expect(r.body).toEqual({ data: [], hasMore: false, oldestCursor: null, roundMeta: {} });
  });

  it('参数校验：limit 非法 / before 与 beforeId 不成对 → 400', async () => {
    expect((await get('/conv_paging/messages?limit=0')).status).toBe(400);
    expect((await get('/conv_paging/messages?limit=501')).status).toBe(400);
    expect((await get('/conv_paging/messages?limit=1.5')).status).toBe(400);
    expect((await get('/conv_paging/messages?limit=10&before=123')).status).toBe(400);
  });

  it('越权：别人的会话 → 404（不泄露存在性）', async () => {
    conn.prepare('INSERT INTO conversation (id, user_id, title) VALUES (?, ?, ?)').run('conv_other', 'u_other', '别人的');
    const r = await get('/conv_other/messages?limit=10');
    expect(r.status).toBe(404);
  });
});
