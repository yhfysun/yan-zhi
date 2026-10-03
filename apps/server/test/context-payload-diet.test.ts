// 上下文负载瘦身（2026-10-01）—— 正式测试类。
//
// ★ 用户报障（原话）：「上下文太长的任务，我消息发出去不是里面返回一个思考中的节点啊，
//   而是等大模型响应后才输出？这样等很久啊」。
//
// ★ 排查结论：不是模型慢，是**每个 step 都在做 O(n) 的重复劳动**。用生产库
//   （315MB / 会话 deed2862 1156 条消息）实测出四处，本文件钉死其中三处：
//
//   ① `loadMessages` 用 `SELECT *`：把单条可达 200KB 的 `system_prompt_snapshot`
//      读进内存再被 `rowToMsg` 原样丢弃 —— 实测该会话**每步白读 183MB**（快照占 99.8%）。
//      ⇒ 改用 db.ts:MESSAGE_LIST_COLS 白名单列，`llm-task-manager` 与
//        `routes/conversations` **共用同一常量**（同一语义两处各写一份必然漂移）。
//   ② 快照里 messages 是**逐步累积的全量历史**（实测 2→4→6→9→12→16…1154 条），
//      每步存一份 → O(n²)。摘要缓存消除"每步重发一次全量摘要 LLM 请求"。
//   ③ SSE `message:added` 曾每步推 86KB 快照 —— 而前端只在点「查看提示词」时才需要，
//      改为按需拉取（`fetchSnapshotFor` 会回退 GET /api/messages/:mid/snapshot）。
//
// ★ 手法说明（为什么不 import src/db）：
//   `db.ts` 在**模块加载时**就会 `openSqlite(DB_PATH)` 打开真实数据库 —— 测试里 import 它会
//   ① 产生副作用、② 依赖 better-sqlite3 的 ABI（与本机 node 版本绑定）。
//   故 ①③ 采用**源码级断言**（读文件文本 + 正则），零副作用、跨 node 版本可跑；
//   core 的压缩行为（②④）直接 import 真实实现（纯逻辑包，无副作用）。
//
// ★ 标定（实测，供本文件阈值设定参考）：
//   `ContextWindow.forContextWindow(n)` 触发阈值 = `n × COMPRESS_TRIGGER_RATIO(0.5)`；
//   `estimateTokens` 约 4 字符/token，故一条 400 字符消息 ≈ 100 token:
//     · 40 条 × 400 字符 = 4000 token（`forContextWindow(400)` 阈值 200 → 必触发）
//     · 含一条 60KB tool 输出 ≈ 16960 token，裁剪到 8KB 后 ≈ 3648 token
//
// ★ 缓存的真实语义（决定了测试必须怎么构造）：
//   真实主循环**每一步都重新 loadMessages 全量历史**，保留窗口 keepRecent 固定 →
//   被压缩段 `cut = len - keepRecent` 随历史增长而**单调增长** ⇒ 上一步的 cache.ids
//   必然是下一步被压缩段的**前缀**（历史只追加）。
//   故测试必须**用真实连续两次压缩**来验证，而不是手工塞一个任意长的 ids
//   （那样构造出的"缓存比被压缩段还长"在真实链路里不会出现）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ContextWindow } from '@yan-zhi/core';
// ★ 真实常量（不是正则匹配的字符串）：db.ts 的模块级 openSqlite 在本仓库测试里已被
//   empty-args-and-compress.test.ts 间接加载多次，属既有可接受行为。
import { MESSAGE_LIST_COLS } from '../src/db.js';

const readSrc = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

const TASK_SRC = readSrc('../src/llm-task-manager.ts');
const CONV_SRC = readSrc('../src/routes/conversations.ts');

describe('① message 列表列白名单：绝不携带超大的提示词快照', () => {
  it('白名单**不含** system_prompt_snapshot（这是每步白读 183MB 的根因）', () => {
    expect(MESSAGE_LIST_COLS).not.toContain('system_prompt_snapshot');
  });

  it('白名单仍含上下文与回放所必需的列（收窄不得误伤功能）', () => {
    for (const col of [
      'id', 'conversation_id', 'role', 'content', 'tool_calls_json', 'tool_call_id',
      'reasoning_content', 'tokens', 'parent_tool_call_id', 'sub_agent_id',
      'sub_agent_name', 'sub_agent_depth', 'created_at',
    ]) {
      expect(MESSAGE_LIST_COLS).toContain(col);
    }
  });

  it('ReAct 热路径的两个 loader 都用白名单常量，且不再 SELECT *', () => {
    const loads = TASK_SRC.match(/function loadMessages\([\s\S]*?\n\}/)?.[0] || '';
    const subLoads = TASK_SRC.match(/function loadSubAgentMessages\([\s\S]*?\n\}/)?.[0] || '';
    expect(loads).toContain('MESSAGE_LIST_COLS');
    expect(loads).not.toContain('SELECT * FROM message');
    expect(subLoads).toContain('MESSAGE_LIST_COLS');
    expect(subLoads).not.toContain('SELECT * FROM message');
  });

  it('历史还原路由与热路径**共用同一常量**（防止两处各写一份而漂移）', () => {
    expect(CONV_SRC).toContain('MESSAGE_LIST_COLS');
    // 不得再就地重复定义一份列清单
    expect(CONV_SRC).not.toMatch(/const MESSAGE_LIST_COLS\s*=\s*'/);
  });
});

describe('③ SSE 不再每步推送大快照（改为按需拉取）', () => {
  it('message:added 事件体里不再携带 systemPromptSnapshot', () => {
    const lines = TASK_SRC.split('\n').filter((l) => l.includes("type: 'message:added'"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).not.toContain('systemPromptSnapshot');
    }
  });

  it('快照仍会落库（功能不能丢；改走按需接口 GET /api/messages/:mid/snapshot）', () => {
    expect(TASK_SRC).toMatch(/insertMessage\([^)]*systemPromptSnapshot: snap/);
  });

  it('摘要缓存挂在 task 上（跨 step 复用，否则每步都会重发全量摘要）', () => {
    expect(TASK_SRC).toMatch(/summaryCache\s*:\s*task\.summaryCache/);
    expect(TASK_SRC).toContain('summaryCache?: SummaryCache');
  });
});

/** 造一条消息（id 稳定，便于构造"前缀命中"场景） */
const mk = (id: string, content = 'x'.repeat(400), role = 'user') =>
  ({ id, conversationId: 'c1', role, content, createdAt: 0 }) as any;

/** 40×400字符=4000 token，`forContextWindow(400)` 阈值 200 → 必触发整段摘要 */
const win = (keepRecent = 6) => ContextWindow.forContextWindow(400, keepRecent);

/** 用真实实现跑一次压缩并返回"被摘要的消息 id" */
async function compressAndTrace(
  cw: ContextWindow,
  msgs: any[],
  cache?: { ids: string[]; summary: string },
): Promise<{ summarized: string[]; out: any[] }> {
  let summarized: string[] = [];
  (cw as any).summarize = async (m: any[]) => { summarized = m.map((x) => x.id); return 'S'; };
  const out = await cw.compress(msgs, cache ? { summaryCache: cache } : undefined);
  return { summarized, out };
}

describe('② 摘要缓存：命中前缀时不再重发全量摘要', () => {
  it('同一批消息再次压缩 → 复用缓存摘要，**零摘要调用**', async () => {
    const cw = win();
    const msgs = Array.from({ length: 40 }, (_, i) => mk(`m${i}`));
    const cache = { ids: [] as string[], summary: '' };

    const first = await compressAndTrace(cw, msgs, cache);
    expect(first.summarized.length).toBe(34); // 40 - keepRecent(6)
    expect(cache.ids.length).toBe(34);

    // 第二次：历史未变 → 前缀完全一致 → 直接复用
    let calls = 0;
    (cw as any).summarize = async () => { calls++; return 'X'; };
    const second = await cw.compress(msgs, { summaryCache: cache });
    expect(calls).toBe(0);
    expect(second[0].content).toContain('S');
  });

  it('历史只追加 → 只对**新增部分**做增量摘要（核心收益）', async () => {
    const cw = win();
    const base = Array.from({ length: 40 }, (_, i) => mk(`m${i}`));
    const cache = { ids: [] as string[], summary: '' };

    const first = await compressAndTrace(cw, base, cache);
    expect(first.summarized.length).toBe(34);

    // 追加 3 条 → 总 43 条，cut = 43-6 = 37；缓存 34 条是其前缀 → 只摘要第 35-37 条
    // （注意：被摘要的**不是**刚追加的 n0..n2 —— 它们仍落在保留窗口内，
    //   真正新滑入"可压缩区"的是 m34/m35/m36。这正是保留窗口随历史前移的正确表现。）
    const grown = [...base, mk('n0'), mk('n1'), mk('n2')];
    const second = await compressAndTrace(cw, grown, cache);

    expect(second.summarized).toEqual(['m34', 'm35', 'm36']);
    expect(second.summarized).not.toContain('m0'); // 起始消息绝不重复摘要
    expect(second.summarized.length).toBe(3);      // 远小于全量的 37 条
    expect(second.out[0].content).toContain('增量');
  });

  it('连续多步递增（模拟真实主循环）→ 依旧只摘要增量，不是全量', async () => {
    const cw = win();
    const cache = { ids: [] as string[], summary: '' };
    let history = Array.from({ length: 40 }, (_, i) => mk(`m${i}`));
    await compressAndTrace(cw, history, cache);

    for (let step = 0; step < 3; step++) {
      history = [...history, mk(`s${step}a`), mk(`s${step}b`)];
      const { summarized } = await compressAndTrace(cw, history, cache);
      // 每步被摘要的只有新增的尾部，绝不包含最早的消息
      expect(summarized).not.toContain('m0');
      expect(summarized.length).toBeLessThanOrEqual(6);
    }
  });

  it('消息被删改（指纹不再是前缀）→ 退回全量摘要，绝不复用错误摘要', async () => {
    const cw = win();
    const cache = { ids: ['zzz', 'yyy'], summary: '不该被复用的旧摘要' };
    let called = false;
    (cw as any).summarize = async () => { called = true; return '新摘要'; };

    const msgs = Array.from({ length: 40 }, (_, i) => mk(`m${i}`));
    const out = await cw.compress(msgs, { summaryCache: cache });

    expect(called).toBe(true);
    expect(out[0].content).toContain('新摘要');
    expect(out[0].content).not.toContain('不该被复用的旧摘要');
  });

  it('缓存覆盖过少 + 增量过大 → 退回全量摘要（增量收益低且拼接易失真）', async () => {
    const cw = win();
    const cache = { ids: ['m0', 'm1', 'm2', 'm3'], summary: '仅早期摘要' };
    const { summarized } = await compressAndTrace(
      cw, Array.from({ length: 40 }, (_, i) => mk(`m${i}`)), cache,
    );
    // 全量：被摘要 34 条（而非增量的 30 条）
    expect(summarized.length).toBe(34);
  });

  it('摘要调用异常 → 降级为截断文本，**不阻塞主循环**', async () => {
    const cw = win();
    (cw as any).summarize = async () => { throw new Error('上游 500'); };

    const msgs = Array.from({ length: 40 }, (_, i) => mk(`m${i}`, 'hello world '.repeat(40)));
    const out = await cw.compress(msgs, { summaryTimeoutMs: 50 });

    expect(Array.isArray(out)).toBe(true);
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('前文摘要');
  });

  it('未提供缓存 → 保持历史行为（每次都全量摘要），不因新增功能而回归', async () => {
    const cw = win();
    let calls = 0;
    (cw as any).summarize = async () => { calls++; return 'S'; };

    const msgs = Array.from({ length: 40 }, (_, i) => mk(`m${i}`));
    await cw.compress(msgs);
    await cw.compress(msgs);
    expect(calls).toBe(2);
  });
});

describe('④ 压缩本体：分级裁剪优先，保住对话结构', () => {
  it('仅靠裁剪超长老工具输出即可降到阈值下 → **不做摘要**（一条消息都不丢）', async () => {
    // 阈值 4000（forContextWindow(8000) × 0.5）：16960 token → 裁剪后 3648 < 4000
    const cw = ContextWindow.forContextWindow(8000, 6);
    let called = false;
    (cw as any).summarize = async () => { called = true; return 'S'; };

    const msgs = [
      ...Array.from({ length: 10 }, (_, i) => mk(`t${i}`)),
      mk('huge', 'y'.repeat(60 * 1024), 'tool'),
      ...Array.from({ length: 6 }, (_, i) => mk(`k${i}`)),
    ];
    const out = await cw.compress(msgs);
    expect(called).toBe(false);
    expect(out.length).toBe(msgs.length); // 一条不丢（结构完整）
  });

  it('裁剪后仍超限 → 才进入整段摘要', async () => {
    const cw = win(); // 阈值 200，裁剪后 3648 仍超
    let called = false;
    (cw as any).summarize = async () => { called = true; return 'S'; };

    const msgs = [
      ...Array.from({ length: 10 }, (_, i) => mk(`t${i}`)),
      mk('huge', 'y'.repeat(60 * 1024), 'tool'),
      ...Array.from({ length: 6 }, (_, i) => mk(`k${i}`)),
    ];
    const out = await cw.compress(msgs);
    expect(called).toBe(true);
    expect(out[0].role).toBe('system'); // 首条被换成摘要
  });

  it('保留窗口不从 tool 消息中间开始（避免孤儿 tool → 上游 400）', async () => {
    // keepRecent=1 → cut 正好落在最后那条 tool 上，实现必须前移到 assistant
    const cw = win(1);
    (cw as any).summarize = async () => 'S';

    const msgs = [
      ...Array.from({ length: 40 }, (_, i) => mk(`a${i}`)),
      { ...mk('asst', ''), role: 'assistant', toolCalls: [{ id: 'c' }] } as any,
      { ...mk('tool1', 'r'), role: 'tool', toolCallId: 'c' } as any,
    ];
    const out = await cw.compress(msgs);
    // 摘要之后的第一条不得是 tool（否则它配对的 assistant 被切掉 → 孤儿 tool）
    expect(out.slice(1)[0].role).not.toBe('tool');
    // 且 assistant + tool 这一对必须都还在
    const kept = out.slice(1).map((m) => m.id);
    expect(kept).toContain('asst');
    expect(kept).toContain('tool1');
  });
});