/**
 * 会话生命周期（归档 / 回收站）**行为级**集成测试（2026-10-16）。
 *
 * ★ 为什么需要：归档/回收站是"看不见的状态"——写错一个 SQL 条件不会报错，
 *   只表现为"会话莫名从列表消失/复活/删不掉"。这类缺陷静态断言抓不住，
 *   必须真拉起 express + 真 sqlite 走完整 HTTP 链路。
 *
 * ★ 环境坑全部继承自 conversation-messages-pagination.integration.test.ts（同套路，
 *   改这里之前先读那个文件的注释）：
 *   ① better-sqlite3 的 .node 按 ABI 懒加载 → YZ_TEST_FORCE_SQLJS=1 走 sql.js；
 *   ② vi.mock 工厂提升到文件顶部 → 外层值一律经 vi.hoisted 传递，工厂只放 getter；
 *   ③ 路由读 req.user!.userId → auth mock 必须注入身份；
 *   ④ 路由挂在 /api/conversations 前缀下 → fetch 路径必须带前缀。
 *
 * ★ conversation-lifecycle.ts **刻意不 mock**：它就是本测试的被测对象
 *   （软删/恢复/归档/真删的唯一出口），mock 掉等于什么都没测。
 *
 * ★★★ 用例之间**不共享会话 id**（2026-10-16 第一版踩过）：DELETE 是幂等的状态机，
 *   同一个 id 被前一个用例软删后，后一个用例再 DELETE 会走"已在回收站 ⇒ 真删"分支，
 *   于是后一个用例看到的是 { permanent: true } 而不是 { trashed: true }，
 *   且会话行已经没了 —— 后面全部 404。每个用例一律用独立 id。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { openSqlite } from '../src/services/sqlite-driver.js';

const hoisted = vi.hoisted(() => {
  process.env.YZ_TEST_FORCE_SQLJS = '1';
  return {
    conn: null as any,
    testUser: 'u_lifecycle',
    messageListCols: 'id, conversation_id, user_id, role, content, tokens, created_at',
  };
});

vi.mock('../src/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    req.user = { userId: hoisted.testUser };
    next();
  },
}));

vi.mock('../src/db.js', () => ({
  get db() { return hoisted.conn; },
  MESSAGE_LIST_COLS: hoisted.messageListCols,
  clearMessageSummaries: () => {},
  listMessageSummaries: () => [],
  deleteMessageSummariesAfter: () => 0,
  hasSqliteVec: false,
}));
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

const { db: conn } = await openSqlite(':memory:');
hoisted.conn = conn;
const { default: conversationsRouter } = await import('../src/routes/conversations.js');

const app = express();
app.use(express.json());
app.use('/api/conversations', conversationsRouter);

let server: Server | null = null;
let base = '';

/** 与真实 schema 对齐的最小建表：**必须含生命周期三列**，否则测的是另一张表 */
function seed() {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agent_id TEXT, platform_id TEXT, model_id TEXT, space_id TEXT,
      mcp_servers_json TEXT DEFAULT '[]', skill_ids_json TEXT DEFAULT '[]',
      system_prompt TEXT, pinned INTEGER DEFAULT 0,
      permission_mode TEXT DEFAULT 'readonly',
      mode TEXT DEFAULT 'office',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived_at INTEGER, deleted_at INTEGER, last_activity_at INTEGER,
      task_plan_json TEXT
    );
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls_json TEXT, tool_call_id TEXT, reasoning_content TEXT,
      system_prompt_snapshot TEXT, tokens INTEGER DEFAULT 0,
      parent_tool_call_id TEXT, sub_agent_id TEXT, sub_agent_name TEXT,
      sub_agent_depth INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_summary (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT,
      message_ids_json TEXT, summary TEXT, tokens INTEGER, created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS task_plan_item (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
      step_id TEXT, title TEXT, status TEXT, note TEXT, updated_at INTEGER
    );
  `);
  const USER = hoisted.testUser;
  const now = Date.now();
  const ins = conn.prepare(
    `INSERT INTO conversation (id, user_id, title, mode, pinned, created_at, updated_at, last_activity_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  );
  ins.run('c_normal', USER, '正常会话', 'office', now, now, now);
  ins.run('c_other_mode', USER, '开发模式会话', 'dev', now, now, now);
  // 每个会话塞 2 条消息 + 1 条计划项：用来验证"软删不丢 / 真删才清"
  const m = conn.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const p = conn.prepare(
    'INSERT INTO task_plan_item (id, conversation_id, step_id, title, status) VALUES (?, ?, ?, ?, ?)',
  );
  for (const cid of ['c_normal', 'c_other_mode']) {
    m.run(`m_${cid}_1`, cid, USER, 'user', '问题', now);
    m.run(`m_${cid}_2`, cid, USER, 'assistant', '回答', now);
    p.run(`plan_${cid}`, cid, 's1', '步骤', 'pending');
  }
}

/** 现场造一个全新会话（每个用例独立 id，避免状态机用例之间互相污染） */
function freshConv(id: string, mode = 'office'): string {
  const now = Date.now();
  conn.prepare(
    `INSERT INTO conversation (id, user_id, title, mode, pinned, created_at, updated_at, last_activity_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(id, hoisted.testUser, id, mode, now, now, now);
  conn.prepare(
    'INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(`m_${id}_1`, id, hoisted.testUser, 'user', '问题', now);
  conn.prepare(
    'INSERT INTO task_plan_item (id, conversation_id, step_id, title, status) VALUES (?, ?, ?, ?, ?)',
  ).run(`plan_${id}`, id, 's1', '步骤', 'pending');
  return id;
}

async function req(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/api/conversations${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { __raw: text.slice(0, 300) }; }
  return { status: res.status, body: parsed };
}

const listIds = (body: any) => (body.data || []).map((c: any) => c.id).sort();
const msgCount = (cid: string) =>
  (conn.prepare('SELECT COUNT(*) AS n FROM message WHERE conversation_id = ?').get(cid) as any).n as number;
const planCount = (cid: string) =>
  (conn.prepare('SELECT COUNT(*) AS n FROM task_plan_item WHERE conversation_id = ?').get(cid) as any).n as number;

beforeAll(async () => {
  seed();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as { port: number };
      base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe('会话列表 · 生命周期过滤', () => {
  it('默认（scope=active）回全部正常会话', async () => {
    const { body } = await req('GET', '/');
    expect(listIds(body)).toEqual(['c_normal', 'c_other_mode']);
  });

  it('带 mode 的那条 SQL 分支同样过滤（历史上两条 SQL 各写一遍，最容易只改一边）', async () => {
    freshConv('c_a1');
    freshConv('c_a2');
    await req('POST', '/c_a1/archive', { archived: true });
    await req('DELETE', '/c_a2');

    expect(listIds((await req('GET', '/')).body)).toEqual(['c_normal', 'c_other_mode']);
    expect(listIds((await req('GET', '/?mode=office')).body)).toEqual(['c_normal']);
    // 开发模式的会话在自己的模式下可见，且不受归档/删除影响
    expect(listIds((await req('GET', '/?mode=dev')).body)).toEqual(['c_other_mode']);
  });

  it('非法 mode 视为不过滤，但仍按生命周期收口', async () => {
    freshConv('c_a3');
    await req('POST', '/c_a3/archive', { archived: true });
    const { body } = await req('GET', '/?mode=__nope__');
    expect(listIds(body)).toEqual(['c_normal', 'c_other_mode']);
  });

  it('scope=archived / trashed / all 分别只回对应集合，且互不污染', async () => {
    freshConv('c_b1');
    freshConv('c_b2');
    freshConv('c_b3');
    await req('POST', '/c_b1/archive', { archived: true });
    await req('DELETE', '/c_b2');

    expect(listIds((await req('GET', '/')).body)).toEqual(['c_b3', 'c_normal', 'c_other_mode']);
    expect(listIds((await req('GET', '/?scope=archived')).body)).toEqual(['c_a1', 'c_a3', 'c_b1']);
    expect(listIds((await req('GET', '/?scope=trashed')).body)).toEqual(['c_a2', 'c_b2']);
    expect(listIds((await req('GET', '/?scope=all')).body))
      .toEqual(['c_a1', 'c_a2', 'c_a3', 'c_b1', 'c_b2', 'c_b3', 'c_normal', 'c_other_mode']);
    // scope=all 不能污染默认视图
    expect(listIds((await req('GET', '/')).body)).toEqual(['c_b3', 'c_normal', 'c_other_mode']);
  });

  it('GET /counts 给出归档/回收站数量（侧栏角标数据源）', async () => {
    const { body } = await req('GET', '/counts');
    expect(body.data).toMatchObject({ archived: 3, trashed: 2 });
  });
});

describe('归档 · 只读语义', () => {
  it('归档后 user 消息被 409 拦下，assistant 回执仍可落库', async () => {
    const cid = freshConv('c_c1');
    await req('POST', `/${cid}/archive`, { archived: true });
    const before = msgCount(cid);

    const blocked = await req('POST', `/${cid}/messages`, { role: 'user', content: '继续说' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CONVERSATION_ARCHIVED');
    expect(msgCount(cid)).toBe(before); // 被拦的消息不落库

    // 只拦"用户开口"：任务跑到一半被归档时，后台补录的回复不该被劈掉
    const ok = await req('POST', `/${cid}/messages`, { role: 'assistant', content: '后台回执' });
    expect(ok.status).toBe(200);
    expect(msgCount(cid)).toBe(before + 1);
  });

  it('取消归档后恢复可写，历史消息一条不少', async () => {
    const cid = freshConv('c_c2');
    await req('POST', `/${cid}/archive`, { archived: true });
    const before = msgCount(cid);

    await req('POST', `/${cid}/archive`, { archived: false });
    const ok = await req('POST', `/${cid}/messages`, { role: 'user', content: '继续' });
    expect(ok.status).toBe(200);
    expect(msgCount(cid)).toBe(before + 1);
    expect(listIds((await req('GET', '/?scope=archived')).body)).not.toContain(cid);
  });

  it('发消息会刷新 last_activity_at（自动归档的判据，与 updated_at 分开）', async () => {
    conn.prepare('UPDATE conversation SET last_activity_at = 1 WHERE id = ?').run('c_normal');
    await req('POST', '/c_normal/messages', { role: 'user', content: 'hi' });
    const row = conn.prepare('SELECT last_activity_at, updated_at FROM conversation WHERE id = ?').get('c_normal') as any;
    expect(row.last_activity_at).toBeGreaterThan(1000);
    expect(row.updated_at).toBe(row.last_activity_at);
  });

  it('回收站里的会话不能改归档态（避免"恢复后不知该回哪个列表"的组合）', async () => {
    const cid = freshConv('c_c3');
    await req('DELETE', `/${cid}`);
    const r = await req('POST', `/${cid}/archive`, { archived: true });
    expect(r.status).toBe(404);
  });

  it('归档不丢消息、不丢计划项', async () => {
    const cid = freshConv('c_c4');
    await req('POST', `/${cid}/archive`, { archived: true });
    expect(msgCount(cid)).toBe(1);
    expect(planCount(cid)).toBe(1);
    // 归档会话的历史仍然可读（只读 ≠ 不可见）
    const msgs = await req('GET', `/${cid}/messages`);
    expect(msgs.status).toBe(200);
    expect((msgs.body.data || []).length).toBe(1);
  });
});

describe('回收站 · 软删与真删', () => {
  it('DELETE 默认是软删：消息与计划项一条不丢，列表不再可见', async () => {
    const cid = freshConv('c_d1');
    const r = await req('DELETE', `/${cid}`);
    expect(r.status).toBe(200);
    expect(r.body.trashed).toBe(true);
    expect(msgCount(cid)).toBe(1);
    expect(planCount(cid)).toBe(1);
    expect(listIds((await req('GET', '/')).body)).not.toContain(cid);
    expect(listIds((await req('GET', '/?scope=trashed')).body)).toContain(cid);
  });

  it('restore 后会话回到主列表，消息完好', async () => {
    const cid = freshConv('c_d2');
    await req('DELETE', `/${cid}`);
    const r = await req('POST', `/${cid}/restore`, {});
    expect(r.status).toBe(200);
    expect(listIds((await req('GET', '/')).body)).toContain(cid);
    expect(msgCount(cid)).toBe(1);
  });

  it('往回收站里的会话发消息被 409 拦下', async () => {
    const cid = freshConv('c_d3');
    await req('DELETE', `/${cid}`);
    const r = await req('POST', `/${cid}/messages`, { role: 'user', content: '喂' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONVERSATION_TRASHED');
  });

  it('DELETE /:id/permanent 真删：消息 + 计划项 + 会话行全部清掉', async () => {
    const cid = freshConv('c_d4');
    const r = await req('DELETE', `/${cid}/permanent`);
    expect(r.status).toBe(200);
    expect(r.body.permanent).toBe(true);
    expect(msgCount(cid)).toBe(0);
    expect(planCount(cid)).toBe(0);
    expect((conn.prepare('SELECT COUNT(*) AS n FROM conversation WHERE id = ?').get(cid) as any).n).toBe(0);
  });

  it('已在回收站的会话再 DELETE 一次 = 真删（与 permanent 同语义，同出口）', async () => {
    const cid = freshConv('c_d5');
    await req('DELETE', `/${cid}`);
    const r = await req('DELETE', `/${cid}`);
    expect(r.status).toBe(200);
    expect(r.body.permanent).toBe(true);
    expect((conn.prepare('SELECT COUNT(*) AS n FROM conversation WHERE id = ?').get(cid) as any).n).toBe(0);
  });

  it('DELETE /trash 清空回收站（只影响已删除的，归档会话不受牵连）', async () => {
    const trashed = freshConv('c_d6');
    const archived = freshConv('c_d7');
    await req('DELETE', `/${trashed}`);
    await req('POST', `/${archived}/archive`, { archived: true });

    const r = await req('DELETE', '/trash');
    expect(r.status).toBe(200);
    expect(r.body.removed).toBeGreaterThanOrEqual(1);
    expect((conn.prepare('SELECT COUNT(*) AS n FROM conversation WHERE id = ?').get(trashed) as any).n).toBe(0);
    expect(listIds((await req('GET', '/?scope=archived')).body)).toContain(archived);
  });
});

describe('DELETE /clear（设置页「清空缓存」）', () => {
  it('语义是"全部移入回收站"，不是真删', async () => {
    const r = await req('DELETE', '/clear');
    expect(r.status).toBe(200);
    expect(r.body.trashed).toBe(true);
    // 主列表空了，但数据还在回收站里
    expect(listIds((await req('GET', '/')).body)).toEqual([]);
    const trashed = listIds((await req('GET', '/?scope=trashed')).body);
    expect(trashed).toContain('c_normal');
    expect(trashed).toContain('c_d7'); // 已归档的也一并收进来
    // 消息没被真删
    expect(msgCount('c_normal')).toBeGreaterThan(0);
  });
});
