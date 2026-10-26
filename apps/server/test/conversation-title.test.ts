/**
 * 会话标题自动生成 · 行为级测试（2026-10-11）。
 *
 * 被测：services/conversation-title.ts + routes/conversations.ts 的 title_source 写入。
 *
 * ★ 用真 sqlite（sql.js WASM，与 CI 回退路径同源 —— YZ_TEST_FORCE_SQLJS=1）：
 *   判据查询 / CAS 写库 / PATCH 置 'user' 都是 SQL 语义，mock db 证明不了行为。
 *
 * ★ 环境坑与解法同 conversation-messages-pagination.integration.test.ts（先读那边）：
 *   ① ABI 懒加载 → 强制 sql.js；② vi.hoisted + getter；③ 本测试不走 express（直接调函数 +
 *   supersession：路由行为用「同库建表 + import 真路由模块」验证 PATCH 路径）。
 *
 * 覆盖面：
 *   - shouldGenerateTitle 四态判据（auto ✓ / llm ✗ / user ✗ / NULL(存量) ✗）
 *   - ★ CAS 竞态：生成期间用户改名（title_source→'user'）→ UPDATE 不命中 → 标题不被覆盖
 *   - 失败回退：chatViaRow 抛错 → 标题保留原值且 title_source 仍 'auto'（下次重试）
 *   - sanitizeTitle：引号/前缀/多行/截断/空输出
 *   - collectTitleMaterial：条数上限 / 总量上限 / 非法 role 过滤
 *   - 路由：POST 写 'auto'；PATCH title 强制置 'user'（服务端收口，前端伪造不了）
 *   - 成功链路端到端：生成 → 落库 title_source='llm' → notifier 收到回调 → 再跑不再生成
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { openSqlite } from '../src/services/sqlite-driver.js';

const hoisted = vi.hoisted(() => {
  process.env.YZ_TEST_FORCE_SQLJS = '1'; // 必须先于任何 openSqlite 调用
  return {
    conn: null as any,
    testUser: 'u_title',
    chatViaRowMock: vi.fn(),
    notifier: vi.fn(),
  };
});

vi.mock('../src/db.js', () => ({
  get db() { return hoisted.conn; },
  // openclaw-manager（经 services/im.ts 拉进 import 链）在模块加载期执行 path.join(dataDir,'openclaw')，
  // 手写白名单 mock 必须补 dataDir 导出，否则报 No "dataDir" export（教训同 2026-10-02 白名单 mock 注）。
  get dataDir() { return process.env.DATA_DIR || ''; },
}));

// 路由读 req.user!.userId：必须注入测试身份（否则真 auth 拦截，PATCH 404）
vi.mock('../src/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => {
    req.user = { userId: hoisted.testUser };
    next();
  },
}));

// ★ 核心桩：chatViaRow 返回可控行为（成功返回标题文本 / 抛错模拟失败）
vi.mock('../src/services/llm-call.js', () => ({
  chatViaRow: hoisted.chatViaRowMock,
}));

vi.mock('../src/services/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

// 连接就绪后再 import 被测模块（此刻 mock 工厂执行，db = hoisted.conn）
const { db: conn } = await openSqlite(':memory:');
hoisted.conn = conn;
const { shouldGenerateTitle, generateTitleFor, sanitizeTitle, collectTitleMaterial, setTitleChangeNotifier } =
  await import('../src/services/conversation-title.js');

/** 建最小表结构（与 db.ts / 路由 SQL 的实际列对齐 —— 探针证实缺列会 500） */
function createTables(): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, title_source TEXT,
      agent_id TEXT, platform_id TEXT, model_id TEXT, space_id TEXT,
      mcp_servers_json TEXT DEFAULT '[]', skill_ids_json TEXT DEFAULT '[]',
      pinned INTEGER DEFAULT 0, permission_mode TEXT, mode TEXT,
      task_type TEXT,
      updated_at INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0,
      -- 生命周期三列（2026-10-16）：PATCH 走 writableGuard 守卫，缺列 = no such column = 500
      archived_at INTEGER, deleted_at INTEGER, last_activity_at INTEGER,
      -- 来源标记两列（2026-10-16 页面内对话历史）：POST /conversations 的 INSERT 会写它们，
      -- 本测试 mock 掉了 db.js ⇒ apps/server/src/db.ts 的启动迁移不作用于本库，夹具必须自带
      source TEXT, source_meta_json TEXT,
      -- 运维会话绑定列（2026-10-2x IM/ops）：POST INSERT 同样会写，缺列 = no such column = 500
      ops_connection_id TEXT
    );
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT, created_at INTEGER NOT NULL
    );
    -- 路由 POST 用（默认智能体解析）；loadModelRow 回退查询用（本测试都命中不了行，但表必须在）
    CREATE TABLE IF NOT EXISTS agent (id TEXT PRIMARY KEY, user_id TEXT, is_public INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS model (
      id TEXT PRIMARY KEY, user_id TEXT, platform_id TEXT, model_id TEXT,
      enabled INTEGER DEFAULT 1, type TEXT DEFAULT 'llm', visible INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS platform (
      id TEXT PRIMARY KEY, user_id TEXT, api_url TEXT, api_key_enc TEXT,
      protocol TEXT DEFAULT 'openai', headers_json TEXT, llm_enabled INTEGER DEFAULT 1, is_builtin INTEGER DEFAULT 0
    );
    -- Token 池表（loadModelRow 回退查询的 Token 全停用剔除子查询需要；空表 = 无剔除）
    CREATE TABLE IF NOT EXISTS platform_api_key (
      id TEXT PRIMARY KEY, platform_id TEXT, user_id TEXT, api_key TEXT, label TEXT,
      fail_count INTEGER DEFAULT 0, last_fail_at INTEGER, enabled INTEGER DEFAULT 1, created_at INTEGER
    );
  `);
}

/** 种任务模型行（loadModelRow 主键路径命中） */
function seedTaskModel(): void {
  conn.prepare(
    "INSERT INTO platform (id, user_id, api_url, protocol, llm_enabled) VALUES ('p1', ?, 'https://api.test/v1', 'openai', 1)",
  ).run(hoisted.testUser);
  conn.prepare(
    "INSERT INTO model (id, user_id, platform_id, model_id, enabled, type, visible) VALUES ('m1', ?, 'p1', 'test-model', 1, 'llm', 1)",
  ).run(hoisted.testUser);
}

function seedConv(id: string, titleSource: string | null, title = '初始标题'): void {
  conn.prepare('INSERT INTO conversation (id, user_id, title, title_source, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, hoisted.testUser, title, titleSource, Date.now());
}

function seedMsg(id: string, convId: string, role: string, content: string, createdAt: number): void {
  conn.prepare('INSERT INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, convId, hoisted.testUser, role, content, createdAt);
}

function getConv(id: string): any {
  return conn.prepare('SELECT * FROM conversation WHERE id = ?').get(id);
}

beforeAll(() => {
  createTables();
  seedTaskModel();
  setTitleChangeNotifier(hoisted.notifier);
  // 默认成功桩：返回带引号和前缀污染的标题（顺带验证清洗链路）
  hoisted.chatViaRowMock.mockResolvedValue({ content: '"标题：帮我把数据导出成Excel"', tokens: 10 });
});

describe('shouldGenerateTitle · title_source 四态判据', () => {
  it("title_source='auto' → 允许生成", () => {
    seedConv('c_auto', 'auto');
    expect(shouldGenerateTitle('c_auto')).toBe(true);
  });
  it("title_source='llm'（已生成过）→ 不再生成", () => {
    seedConv('c_llm', 'llm');
    expect(shouldGenerateTitle('c_llm')).toBe(false);
  });
  it("title_source='user'（用户手动改名）→ 永不覆盖", () => {
    seedConv('c_user', 'user');
    expect(shouldGenerateTitle('c_user')).toBe(false);
  });
  it('title_source=NULL（存量会话）→ 行为不变不生成', () => {
    seedConv('c_legacy', null);
    expect(shouldGenerateTitle('c_legacy')).toBe(false);
  });
  it('会话不存在 → false（不抛错）', () => {
    expect(shouldGenerateTitle('c_missing')).toBe(false);
  });
});

describe('sanitizeTitle · 模型输出清洗', () => {
  it('去引号 + 去「标题：」前缀', () => {
    expect(sanitizeTitle('"标题：把数据导出成Excel"')).toBe('把数据导出成Excel');
  });
  it('多行取首行', () => {
    expect(sanitizeTitle('第一行标题\n第二行解释')).toBe('第一行标题');
  });
  it('超长截断到 32 字', () => {
    expect(sanitizeTitle('x'.repeat(50)).length).toBe(32);
  });
  it('空/纯空白 → null', () => {
    expect(sanitizeTitle('')).toBeNull();
    expect(sanitizeTitle('  \n  ')).toBeNull();
  });
});

describe('collectTitleMaterial · 素材收集', () => {
  it('只取 user/assistant，条数上限 6，单条截 300，总量截 2000', () => {
    const rows = [
      { role: 'system', content: '系统提示不应出现' }, // 过滤
      { role: 'tool', content: '工具结果不应出现' },   // 过滤
      ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `消息${i}`.repeat(40) })),
    ];
    const material = collectTitleMaterial(rows as any);
    expect(material).not.toContain('系统提示');
    expect(material).not.toContain('工具结果');
    expect(material.split('\n').length).toBe(6); // MAX_MESSAGES
    expect(material.length).toBeLessThanOrEqual(2000 + 6 * 'user: '.length);
  });
  it('空内容行跳过', () => {
    const material = collectTitleMaterial([
      { role: 'user', content: '  ' },
      { role: 'assistant', content: null },
      { role: 'user', content: '真实问题' },
    ] as any);
    expect(material).toBe('user: 真实问题');
  });
});

describe('generateTitleFor · 端到端（真库 + CAS）', () => {
  it('★★★ 成功链路：auto → LLM 生成 → CAS 落库 llm + notifier 回调；再跑一次不再生成', async () => {
    seedConv('c_e2e', 'auto', '帮我把数据导出成Exce…');
    seedMsg('m1', 'c_e2e', 'user', '帮我把这份数据导出成 Excel 并画个趋势图', 1000);
    seedMsg('m2', 'c_e2e', 'assistant', '好的，我来处理。', 2000);

    hoisted.notifier.mockClear();
    await generateTitleFor('c_e2e', hoisted.testUser, { platformId: 'p1', modelId: 'm1' });

    // 落库：标题被清洗 + title_source 置 llm
    const row = getConv('c_e2e');
    expect(row.title).toBe('帮我把数据导出成Excel');
    expect(row.title_source).toBe('llm');
    // notifier 收到（llm-task-manager 用它发 conversation:title 事件）
    expect(hoisted.notifier).toHaveBeenCalledWith('c_e2e', '帮我把数据导出成Excel');

    // 再跑：判据已变 'llm' → 不调 LLM、标题不变
    hoisted.chatViaRowMock.mockClear();
    hoisted.notifier.mockClear();
    await generateTitleFor('c_e2e', hoisted.testUser);
    expect(hoisted.chatViaRowMock).not.toHaveBeenCalled();
    expect(getConv('c_e2e').title).toBe('帮我把数据导出成Excel');
    expect(hoisted.notifier).not.toHaveBeenCalled();
  });

  it('★★★ CAS 竞态：生成期间用户改名（source→user）→ UPDATE 不命中 → 标题与 source 均不被覆盖', async () => {
    seedConv('c_race', 'auto', '原截断标题');
    seedMsg('r1', 'c_race', 'user', '做点什么事', 1000);

    // 挂钩模拟竞态：LLM 返回前（chatViaRow 被调用的瞬间）用户完成改名
    hoisted.chatViaRowMock.mockImplementationOnce(async () => {
      conn.prepare("UPDATE conversation SET title = '我的重要任务', title_source = 'user' WHERE id = 'c_race'").run();
      return { content: '晚到的标题', tokens: 1 };
    });

    await generateTitleFor('c_race', hoisted.testUser);

    const row = getConv('c_race');
    expect(row.title).toBe('我的重要任务'); // 用户名保留
    expect(row.title_source).toBe('user'); // 未被洗成 llm
  });

  it('LLM 失败 → 静默保留原标题，title_source 仍 auto（下次重试）', async () => {
    seedConv('c_fail', 'auto', '原标题');
    seedMsg('f1', 'c_fail', 'user', '内容', 1000);
    hoisted.chatViaRowMock.mockRejectedValueOnce(new Error('timeout'));

    await generateTitleFor('c_fail', hoisted.testUser); // 不抛

    const row = getConv('c_fail');
    expect(row.title).toBe('原标题');
    expect(row.title_source).toBe('auto');
  });

  it('LLM 返回空白 → 不写库不回调', async () => {
    seedConv('c_blank', 'auto', '原标题B');
    seedMsg('b1', 'c_blank', 'user', '内容', 1000);
    hoisted.chatViaRowMock.mockResolvedValueOnce({ content: '  \n  ', tokens: 1 });

    await generateTitleFor('c_blank', hoisted.testUser);

    expect(getConv('c_blank').title).toBe('原标题B');
    expect(getConv('c_blank').title_source).toBe('auto');
  });

  it('无素材（空会话）→ 不调 LLM', async () => {
    seedConv('c_empty', 'auto', '原标题C');
    hoisted.chatViaRowMock.mockClear();
    await generateTitleFor('c_empty', hoisted.testUser);
    expect(hoisted.chatViaRowMock).not.toHaveBeenCalled();
  });

  it('判据不满足（llm/user/NULL）→ 不调 LLM', async () => {
    hoisted.chatViaRowMock.mockClear();
    await generateTitleFor('c_llm', hoisted.testUser);
    await generateTitleFor('c_user', hoisted.testUser);
    await generateTitleFor('c_legacy', hoisted.testUser);
    await generateTitleFor('c_missing', hoisted.testUser);
    expect(hoisted.chatViaRowMock).not.toHaveBeenCalled();
  });
});

describe('routes/conversations.ts · title_source 写入收口', () => {
  it('POST 建会话写 title_source=auto', async () => {
    // 直接拉真路由模块（其依赖已被 mock 到本测试的库）
    const { default: conversationsRouter } = await import('../src/routes/conversations.js');
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationsRouter);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const res = await fetch(`${base}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新会话' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.title_source).toBe('auto');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('★ PATCH title 强制置 title_source=user（服务端收口，前端伪造不了 llm/auto）', async () => {
    seedConv('c_patch', 'auto', '自动生成的标题');
    const { default: conversationsRouter } = await import('../src/routes/conversations.js');
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationsRouter);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const res = await fetch(`${base}/api/conversations/c_patch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '我改的名字' }),
      });
      expect(res.status).toBe(200);
      const row = getConv('c_patch');
      expect(row.title).toBe('我改的名字');
      expect(row.title_source).toBe('user');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
