// 上下文分层与压缩落库 —— 正式测试类（2026-10-02）。
//
// ★ 用户诉求（原话）：「单会话上下文过长，看看主流框架怎么处理，应该不是把所有消息给到大模型吧，
//   消息保存前端显示是一份，还有一份应该是跟大模型交互的，可以放文件里？多了还能压缩？」
//
// ★ 本轮修的三个结构性缺口（每条都对应一个真实缺陷，防止回归）：
//   ① **压缩结果不落库** → 每步 `loadMessages` 全量 + 重新判断压缩。`SummaryCache` 只挡住了
//      "重发 LLM 摘要请求"，**历史从未真正变短**（每步仍 O(n)）。等价于"压缩了但没生效"。
//   ② **子智能体消息污染主上下文** → `loadMessages` 只按 conversation_id 过滤，而子智能体与
//      主会话共用同一 conversation_id → 子智能体每一步都混进主上下文（破坏隔离语义）。
//   ③ **无输出预留 + 保留窗口只留尾部** → 阈值按整个窗口算（"刚压完又超限"）；
//      首轮任务目标被摘要吃掉（OpenHands 用 keep_first=4 正是为此）。
//
// ★ 手法：直接调用**真实实现**（不是复刻语义）。db 用临时目录 + 真实 sqlite 驱动，
//   使 `message_summary` 的落库/读取走真表，确保实现改坏时测试真会红。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';

// ★ 必须在 import db 之前设好 DATA_DIR —— db.ts 在**模块加载时**就打开数据库。
//   （与 artifact-dir.test.ts 同一手法）
vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ctxview-'));
  process.env.DATA_DIR = dir;
  (globalThis as any).__YZ_CTX_TMP__ = dir;
});

const { buildContextView, mainlineMessages, effectiveWindowOf, resolveOutputReserve } = await import('../src/services/context-view.js');
const { getLatestMessageSummary, insertMessageSummary, db } = await import('../src/db.js');

tmpDir = (globalThis as any).__YZ_CTX_TMP__;

// ── 造数据：真实表 + 真实外键（user / conversation 必须先存在）──────────────
const UID = 'u_test';
const CID = 'c_test';

function seedBase() {
  const ts = Date.now();
  db.prepare('INSERT OR REPLACE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, UID, 'x', ts);
  db.prepare('INSERT OR REPLACE INTO conversation (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(CID, UID, '测试会话', ts, ts);
}

function seedMessages(n: number, contentLen = 400, from = 0) {
  const ins = db.prepare(
    'INSERT OR REPLACE INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const ts = Date.now();
  for (let i = from; i < n; i++) {
    ins.run(`m${i}`, CID, UID, i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(contentLen), ts + i);
  }
}

/** 从 DB 读出原始消息（模拟 `loadMessages` + `rowToMsg` 的形态） */
function loadRaw(): any[] {
  const rows = db.prepare(
    'SELECT id, conversation_id, role, content, parent_tool_call_id FROM message WHERE conversation_id = ? ORDER BY created_at ASC',
  ).all(CID) as any[];
  return rows.map((r) => ({
    id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content || '',
    parentToolCallId: r.parent_tool_call_id || undefined,
  }));
}

const mkModel = (contextWindow: number) => ({ id: 'mo_test', modelId: 'mo_test', alias: 'T', contextWindow } as any);

beforeEach(() => {
  seedBase();
});

afterEach(() => {
  for (const t of ['message_summary', 'message', 'conversation']) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe('① 子智能体隔离：主上下文绝不能混入子智能体的中间过程', () => {
  it('mainlineMessages 剔除带 parentToolCallId 的消息', () => {
    const msgs = [
      { id: 'a', role: 'user' },
      { id: 'b', role: 'assistant', parentToolCallId: 'call_1' },
      { id: 'c', role: 'tool', parentToolCallId: 'call_1' },
      { id: 'd', role: 'assistant' },
      // 历史包袱：两种键形态都要认（本项目经典坑：有的字段有兜底、有的没有）
      { id: 'e', role: 'user', parent_tool_call_id: 'call_2' } as any,
    ];
    expect(mainlineMessages(msgs as any).map((m) => m.id)).toEqual(['a', 'd']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('② 压缩落库：历史真正变短，而不是每步重算', () => {
  it('超预算 → 压缩并把摘要写入 message_summary', async () => {
    seedMessages(40, 400); // 40×400 字符 ≈ 4000 token
    const cache = { ids: [] as string[], summary: '' };
    const r = await buildContextView({
      conversationId: CID, userId: UID,
      rawMessages: loadRaw(),
      model: mkModel(800), // 可用预算 800-4096 → 下限 4096；阈值 = 2048 → 4000 token 必触发
      maxTokens: 100,
      keepRecent: 6,
      summaryCache: cache,
    });
    expect(r.compacted).toBe(true);
    const saved = getLatestMessageSummary(CID);
    expect(saved).toBeTruthy();
    expect(saved!.summary.length).toBeGreaterThan(0);
    // 覆盖的是原始 message 表的**连续前缀**，且不含合成摘要 id
    expect(saved!.messageIds.length).toBeGreaterThan(0);
    expect(saved!.messageIds.every((id) => /^m\d+$/.test(id))).toBe(true);
    expect(saved!.messageIds).not.toContain('__summary__');
  });

  it('★ 关键收益：摘要落库后，下一步**不再重压**已覆盖的段（历史真的变短了）', async () => {
    seedMessages(40, 400);
    const cache = { ids: [] as string[], summary: '' };
    const base = { conversationId: CID, userId: UID, model: mkModel(800), maxTokens: 100, keepRecent: 6, summaryCache: cache };

    const first = await buildContextView({ ...base, rawMessages: loadRaw() });
    expect(first.compacted).toBe(true);                      // 第一次：全量 → 压缩
    const coveredAfterFirst = getLatestMessageSummary(CID)!.messageIds.length;
    expect(coveredAfterFirst).toBe(34);                      // 40 - keepRecent(6)

    // 追加 2 条后重跑：已覆盖的 34 条**不再进入上下文**（只剩摘要 + 8 条）
    seedMessages(42, 400, 40);
    const second = await buildContextView({ ...base, rawMessages: loadRaw() });
    // ★ 这才是本方案的核心收益：历史没长到需要再压的程度 → **零压缩、零摘要调用**
    expect(second.compacted).toBe(false);
    expect(second.messages.length).toBeLessThanOrEqual(10);   // 摘要 + 8 条，远小于 42
    expect(second.messages[0].content).toContain('前文摘要'); // 首条仍是摘要 → 前情没丢
    // 且没有新写摘要行（不重复劳动）
    expect(getLatestMessageSummary(CID)!.messageIds.length).toBe(coveredAfterFirst);

    // 再追加一大批 → 触发**增量**压缩：覆盖段只向后延伸，绝不推倒重来
    seedMessages(100, 400, 42);
    const third = await buildContextView({ ...base, rawMessages: loadRaw() });
    expect(third.compacted).toBe(true);
    const coveredAfterThird = getLatestMessageSummary(CID)!.messageIds.length;
    expect(coveredAfterThird).toBeGreaterThan(coveredAfterFirst);
    // 覆盖段仍是原始 message 表的严格前缀（信息不丢、可回滚）
    const ids = loadRaw().map((m) => m.id);
    expect(getLatestMessageSummary(CID)!.messageIds).toEqual(ids.slice(0, coveredAfterThird));
  });

  it('摘要被反复累积（增量吸收旧摘要），信息不丢：覆盖段始终是原始表的前缀', async () => {
    seedMessages(40, 400);
    const cache = { ids: [] as string[], summary: '' };
    const base = { conversationId: CID, userId: UID, model: mkModel(800), maxTokens: 100, keepRecent: 6, summaryCache: cache };
    for (let round = 0; round < 3; round++) {
      seedMessages(42 + round * 2, 400, 40 + round * 2);
      await buildContextView({ ...base, rawMessages: loadRaw() });
      const saved = getLatestMessageSummary(CID)!;
      const ids = loadRaw().map((m) => m.id);
      // 逐项前缀校验：必须严格等于原始表的前 N 项
      expect(saved.messageIds).toEqual(ids.slice(0, saved.messageIds.length));
    }
  });

  it('历史被删改（前缀不再成立）→ 旧摘要判失效，退回全量而不是复用错误摘要', async () => {
    seedMessages(40, 400);
    const cache = { ids: [] as string[], summary: '' };
    await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 6, summaryCache: cache,
    });
    expect(getLatestMessageSummary(CID)).toBeTruthy();

    // 删掉最早一条 → 前缀断裂
    db.prepare('DELETE FROM message WHERE id = ?').run('m0');
    const cache2 = { ids: [] as string[], summary: '' };
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 6, summaryCache: cache2,
    });
    // 必须仍能产出可用上下文（不炸），且覆盖段是当前真实历史的前缀
    const ids = loadRaw().map((m) => m.id);
    expect(r.coveredIds).toEqual(ids.slice(0, r.coveredIds.length));
  });

  it('persist:false（子智能体）→ 绝不写 message_summary，避免污染主会话读出', async () => {
    seedMessages(40, 400);
    const cache = { ids: [] as string[], summary: '' };
    await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 6, summaryCache: cache,
      persist: false,
    });
    expect(getLatestMessageSummary(CID)).toBeNull();
  });

  it('未超预算 → 零压缩、零落库（不因新增功能而乱写库）', async () => {
    seedMessages(3, 50);
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(200000), maxTokens: 8192, keepRecent: 6,
      summaryCache: { ids: [], summary: '' },
    });
    expect(r.compacted).toBe(false);
    expect(r.coveredIds).toEqual([]);
    expect(getLatestMessageSummary(CID)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('③ 预算分配：有效窗口折算（对齐 Chroma 的有效上下文 / Roo Code 的 allowedTokens）', () => {
  it('声明窗口（被信任）→ 按有效比例折算（绝不是"标称 = 可用"）', () => {
    expect(effectiveWindowOf(131072)).toBe(32768); // 128K × 25%
    // ★ 关键：绝不能等于标称窗口（那是"能塞就能用好"的被证伪假设）
    expect(effectiveWindowOf(131072)).toBeLessThan(131072);
  });

  it('★★ 两层折扣**不叠加**：未声明窗口已被判不可信 → 不再乘比例（防双重保守）', () => {
    // resolveContextWindow(1M) 会因"等于建库默认值"判不可信 → 退回 32K。
    // 此时若再乘 25% 就只剩 8K → 触发得离谱地早；正确做法是直接用 32K 有效值。
    expect(effectiveWindowOf(1048576)).toBe(32768);
    // ★ 与"把 1M 当可信"对照：那才是按 256K 算（判为不可信意味着我们已按小窗口保守估算）
    expect(effectiveWindowOf(1048576)).toBeLessThan(262144);
  });

  it('可信的大窗口（显式声明 2M）→ 按 500K 有效区算', () => {
    expect(effectiveWindowOf(2 * 1048576)).toBe(524288);
  });

  it('未声明/非法窗口 → 走 32K 保守兜底，恒定为正', () => {
    for (const bad of [undefined, 0, -1, NaN] as any[]) {
      expect(effectiveWindowOf(bad)).toBe(32768);
    }
    expect(effectiveWindowOf(1)).toBeGreaterThan(0);
  });

  it('输出预留夹在 4K~16K（buildContextView 的 hardCap 靠它）', () => {
    // 预留过小 → 抬到下限 4096
    expect(resolveOutputReserve(100)).toBe(4096);
    // 未传 / 非法 → 默认 8192
    expect(resolveOutputReserve()).toBe(8192);
    expect(resolveOutputReserve(NaN as any)).toBe(8192);
    // 预留过大 → 压到上限 16384
    expect(resolveOutputReserve(999999)).toBe(16384);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('④ 保留窗口「头 + 尾」：首轮任务目标不被摘要吃掉', () => {
  it('keepFirst>0 时，最早的用户消息必须原样保留在结果里', async () => {
    seedMessages(40, 400);
    const raw = loadRaw();
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: raw,
      model: mkModel(800), maxTokens: 100, keepRecent: 6, keepFirst: 2,
      summaryCache: { ids: [], summary: '' },
    });
    // m0/m1 属于头部保留段 → 必须原样在结果中（而不是只存在于摘要里）
    const ids = r.messages.map((m) => m.id);
    expect(ids).toContain('m0');
    expect(ids).toContain('m1');
  });

  it('keepFirst=0 → 保持历史行为（只留尾部），不误伤既有语义', async () => {
    seedMessages(40, 400);
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 6,
      summaryCache: { ids: [], summary: '' },
    });
    expect(r.messages.map((m) => m.id)).not.toContain('m0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('⑤ 硬兜底：压缩后仍超限 → 绝不把超长历史直接怼给上游（防 400）', () => {
  it('cut<=0（历史太短无法切窗）时，最终上下文仍受硬上限约束', async () => {
    // keepRecent 大于总条数 → compress 内部 cut<=0 → 原样返回；此时必须靠 enforceBudget 兜底
    seedMessages(6, 3000); // 6 条 × 3000 字符 ≈ 4500+ token，远超预算
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 50,
      summaryCache: { ids: [], summary: '' },
    });
    // 硬上限 = usable × 0.9；只要拿不到更小值就说明兜底没生效
    expect(r.tokens, '★ 硬兜底未生效：仍把超长历史原样发出').toBeLessThan(6 * 750);
    // 且必须仍是合法消息数组（结构不能被兜底破坏）
    expect(Array.isArray(r.messages)).toBe(true);
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it('超长工具输出在硬兜底中被替换成占位符（保留结构、丢弃内容）', async () => {
    seedMessages(4, 200);
    const ins = db.prepare('INSERT OR REPLACE INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?,?,?,?,?,?)');
    // 一条 200KB 的 tool 输出 —— compress 的 8KB 裁剪会处理它，但若路径被绕过则靠兜底
    ins.run('bigtool', CID, UID, 'tool', 'y'.repeat(200 * 1024), Date.now() + 500);
    const r = await buildContextView({
      conversationId: CID, userId: UID, rawMessages: loadRaw(),
      model: mkModel(800), maxTokens: 100, keepRecent: 50,
      summaryCache: { ids: [], summary: '' },
    });
    expect(r.tokens).toBeLessThan(200 * 1024 / 4);
  });
});