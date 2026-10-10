/**
 * 手动压缩（D3-转，2026-10-10）守门测试。
 *
 * ★ 定位：这是**便利性增强（feature）**，不是缺陷修复 ——
 *   自动压缩只在超过有效窗口（标称×25%）时触发；用户有时**明知上下文很满**
 *   （想省钱/提速/避免触顶）却没有手段提前压。
 *
 * ★ 设计要点（本测试钉的就是这些）：
 *   ① **不另写一份压缩**：`buildContextView` 加 `forceCompress` → **只跳过阈值判定**，
 *      摘要/落库/记忆抢救/兜底**全部走同一条流水线**（另写必然漂移）；
 *   ② **真跑**：`forceCompress: true` 时，**未超阈值也必须压**（无 LLM 走 `fallbackSummary`）；
 *      且 `false` 时行为完全不变（**不越界压缩** —— 防"顺手把自动路径也改了"）；
 *   ③ 压缩结果**落库**（`message_summary`）⇒ 能在「压缩历史」里看到、可回退；
 *   ④ 路由 + 前端入口齐备（缺任一段 = 用户点不到）；
 *   ⑤ 运行中任务**拒绝手动压缩**（与主循环每步压缩并发会互相干扰）。
 *
 * ★ 手法：直接调用**真实实现** + 真实 sqlite（与 `context-view-layering.test.ts` 同一范式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-compact-'));
  process.env.DATA_DIR = dir;
  (globalThis as any).__YZ_COMPACT_TMP__ = dir;
});

const { buildContextView } = await import('../src/services/context-view.js');
const { getLatestMessageSummary, db } = await import('../src/db.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');

const UID = 'u_cp';
const CID = 'c_cp';

function seedBase() {
  const ts = Date.now();
  db.prepare('INSERT OR REPLACE INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(UID, UID, 'x', ts);
  db.prepare('INSERT OR REPLACE INTO conversation (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(CID, UID, '压缩测试', ts, ts);
}

/**
 * 造 N 条消息。★ 必须**够大**才走"整段摘要"路径 ——
 * 消息太少时 `compress` 会在 `cut <= 0` / "裁剪即够"处**原样返回**（那是**有意设计**：
 * 裁剪比摘要温和、且保住全部消息），**不产生摘要** ⇒ 落库断言会假红。
 *
 * ★★ 实测门槛（**本次踩了两次才对**）：`EFFECTIVE_CONTEXT_FLOOR = 16384` 是有效窗口的**下限**
 *   ⇒ 连 16384 的小窗口也会被"抬"到 16384。因此内容 token 必须**超过 16384** 才走摘要：
 *   · 12 条 × 60 字  → 远远不够（第一次踩）；
 *   · 40 条 × 800 字 → 实测仅 **8160 token**，仍"裁剪即够"（第二次踩）；
 *   · 120 条 × 800 字 → ≈3.6 万 token ✅ 才真正触发整段摘要。
 *   ⇒ 判据：**"手动压缩真的压出摘要"这类断言，数据必须真超过有效窗口下限**，
 *     否则测的是"裁剪路径"，而它会**静默不产生摘要**（功能看着在、压缩历史永远空）。
 */
function seedMessages(n: number, contentLen = 800) {
  const ins = db.prepare(
    'INSERT OR REPLACE INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const ts = Date.now();
  for (let i = 0; i < n; i++) {
    ins.run(`cm${i}`, CID, UID, i % 2 === 0 ? 'user' : 'assistant', '内容' + i + ' ' + 'y'.repeat(contentLen), ts + i);
  }
}

function loadRaw(): any[] {
  const rows = db.prepare(
    'SELECT id, conversation_id, role, content FROM message WHERE conversation_id = ? ORDER BY created_at ASC',
  ).all(CID) as any[];
  return rows.map((r) => ({ id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content || '' }));
}

/** 窗口给得很大 → 确保"未超阈值"（这样才能证明 forceCompress 真的绕过了阈值） */
const bigModel = () => ({ id: 'mo_cp', modelId: 'mo_cp', alias: 'T', contextWindow: 1048576 } as any);
/** 小窗口 → 内容必然超阈值 ⇒ 会走**整段摘要**路径（用于验证"摘要落库"） */
const smallModel = () => ({ id: 'mo_cp2', modelId: 'mo_cp2', alias: 'S', contextWindow: 16384 } as any);

async function runCompress(force: boolean, model = bigModel()) {
  return buildContextView({
    conversationId: CID,
    userId: UID,
    rawMessages: loadRaw(),
    model,
    keepRecent: 2,
    keepFirst: 1,
    summaryCache: { ids: [], summary: '' },
    // ★ 不传 setSummaryModel → 走 `fallbackSummary`（无 LLM 降级），测试可离线真跑
    forceCompress: force,
  });
}

beforeEach(() => { seedBase(); seedMessages(120); });
afterEach(() => {
  for (const t of ['message_summary', 'message', 'conversation']) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch {}
  }
});

describe('① 真跑：forceCompress 必须真的绕过阈值', () => {
  it('★★★ 不传 forceCompress 时**不压**（窗口很大、未超阈值 → 行为不变）', async () => {
    const view = await runCompress(false);
    expect(view.compacted, '★ 未超阈值却压缩了 —— 自动路径行为被改坏（越界）').toBe(false);
    expect(getLatestMessageSummary(CID), '★ 不该产生摘要').toBeNull();
  });

  it('★★★ 传 forceCompress 时**必须压**（这才叫"手动可用"）', async () => {
    const view = await runCompress(true);
    expect(view.compacted, '★ forceCompress 未生效 → 手动压缩点了没反应（静默失效）').toBe(true);
    // ★ 注意：`compacted: true` 只说明"压了"，**不代表产生了摘要** ——
    //   `compress` 是**分级**的：内容不大时走第 ① 级「裁剪老工具输出」即够
    //   （`window.ts:403` 的"裁剪即够 → 保住全部消息"），**那是有意设计**（比重摘温和得多）。
    //   ⇒ 摘要是否落库在下面那条"小窗口"用例里验（那才会走整段摘要路径）。
  });

  it('★★★ 真超阈值（小窗口）时必须产生**摘要并落库**（压缩历史可见）', async () => {
    // ★ 关键：`forceCompress` 不能"绕过摘要本身"—— 超阈值时该有摘要就得有摘要。
    const view = await runCompress(true, smallModel());
    expect(view.compacted, '★ 小窗口下未压').toBe(true);
    const sum = getLatestMessageSummary(CID);
    expect(sum, '★ 压了却没落库 → 在「压缩历史」里看不到（半截功能）').toBeTruthy();
    expect(sum!.messageIds.length, '★ 摘要未覆盖任何消息').toBeGreaterThan(0);
    expect(String(sum!.summary || '').length, '★ 摘要为空').toBeGreaterThan(0);
  });

  it('★★★ 重复手动压缩必须**幂等**（第二次没有新消息可压 → 不报错）', async () => {
    await runCompress(true);
    const second = await runCompress(true);
    // 第二次：覆盖段之外没有新消息可摘要 → 不应抛错（可压或不可压都接受，但必须不崩）
    expect(second, '★ 重复压缩抛错了').toBeTruthy();
  });
});

describe('② 唯一实现（不得另写一份压缩）', () => {
  it('★★★ forceCompress 只应影响"是否触发"，不应绕过其余流水线', () => {
    const CV = read('apps/server/src/services/context-view.ts');
    const i = CV.indexOf('forceCompress || cw.needsCompression(payload)');
    expect(i, '★ 未找到 forceCompress 与 needsCompression 的并联判定').toBeGreaterThan(-1);
    // 断言是**并联**（||）而不是"直接 return"
    expect(CV.slice(i, i + 120), '★ 判定写法异常').toContain('forceCompress || cw.needsCompression');
  });

  it('★★★ 手动压缩必须复用 buildContextView（而非自建压缩）', () => {
    const LTM = read('apps/server/src/llm-task-manager.ts');
    const i = LTM.indexOf('export async function compressConversationNow');
    expect(i, '★ 锚点缺失：compressConversationNow').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 2600);
    expect(body, '★ 手动压缩未走 buildContextView（另写一份必然漂移）').toMatch(/buildContextView\(/);
    expect(body, '★ 未传 forceCompress').toMatch(/forceCompress:\s*true/);
    expect(body, '★ 未剔除子智能体消息（破坏隔离语义）').toMatch(/mainlineMessages\(/);
  });
});

describe('③ 路由与前端入口齐备', () => {
  it('★★★ 服务端必须有 POST /:id/compact', () => {
    const ROUTE = read('apps/server/src/routes/conversations.ts');
    expect(ROUTE, '★ 缺路由 → 前端点不到').toMatch(/router\.post\('\/:id\/compact'/);
  });

  it('★★★ 运行中任务必须被拒绝（409）', () => {
    const ROUTE = read('apps/server/src/routes/conversations.ts');
    const i = ROUTE.indexOf("router.post('/:id/compact'");
    const body = ROUTE.slice(i, i + 1400);
    expect(body, '★ 未拒绝运行中任务 → 与主循环每步压缩并发会互相干扰').toMatch(/409/);
  });

  it('★★★ 前端 store 必须有 compactNow 并导出', () => {
    const CHAT = read('packages/ui/src/stores/chat.ts');
    expect(CHAT, '★ store 缺 compactNow').toMatch(/async function compactNow\(/);
    expect(CHAT, '★ compactNow 未导出（组件拿不到）').toMatch(/^\s*compactNow,/m);
  });

  it('★★★ 前端必须有可见入口（否则用户无从触发）', () => {
    const SIDEBAR = read('packages/ui/src/components/chat/ChatContextSidebar.vue');
    expect(SIDEBAR, '★ 上下文栏未提供手动压缩入口 → feature 不可达').toMatch(/立即压缩/);
    expect(SIDEBAR, '★ 未调用 store.compactNow').toMatch(/store\.compactNow\(/);
    expect(SIDEBAR, '★ 未展示压缩历史（压了看不到 = 半截功能）').toMatch(/loadSummaries/);
  });
});

describe('④ 与既有能力的关系（防重复/防冲突）', () => {
  it('★★ 压缩历史列表接口必须已存在（手动压缩依赖它展示结果）', () => {
    const ROUTE = read('apps/server/src/routes/conversations.ts');
    expect(ROUTE, '★ 缺 GET /:id/summaries（D8 已加，防被误删）').toMatch(/router\.get\('\/:id\/summaries'/);
  });

  it('★★ 行动作运行中时前端也应拦（避免无谓 409）', () => {
    const CHAT = read('packages/ui/src/stores/chat.ts');
    const i = CHAT.indexOf('async function compactNow(');
    const body = CHAT.slice(i, i + 1200);
    expect(body, '★ 前端未在运行中拦截').toMatch(/runningConvIds\.value\.has\(cid\)/);
  });
});