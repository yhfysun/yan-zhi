// 编译产物级验证：直接 import **编译后的 dist**（不是源码），跑通「压缩落库」闭环。
//
// ★ 为什么单独一个文件：本项目硬约束 ——「源码改了」≠「用户侧生效」，
//   必须核验编译后 js。`context-view-layering.test.ts` 打的是 src（ts），
//   本文件补一层「dist 里的东西真能跑起来」。
// ★ dist 不存在时自动跳过（首次 clone 未编译的机器不该因此变红）。
//
// 跑法：cd apps/server && vitest run test/dist-context-artifact.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist/apps/server/src');
const hasDist = fs.existsSync(path.join(DIST, 'services/context-view.js')) &&
  fs.existsSync(path.join(DIST, 'db.js'));

// 临时 DATA_DIR（不碰生产库）—— 必须在 import dist/db.js 之前设好（它在模块加载时开库）
vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-dist-ctx-'));
  process.env.DATA_DIR = dir;
  (globalThis as any).__YZ_DIST_TMP__ = dir;
});

const distDb = await import(new URL('db.js', 'file:///' + DIST.replace(/\\/g, '/') + '/').href);
const distCv = await import(new URL('services/context-view.js', 'file:///' + DIST.replace(/\\/g, '/') + '/').href);

const { db, getLatestMessageSummary } = distDb as any;
const { buildContextView, mainlineMessages, usableContextBudget } = distCv as any;

const UID = 'u_dist';
const CID = 'c_dist';

function seed(n: number, withSubAgent = false) {
  const ts = Date.now();
  db.prepare('INSERT OR REPLACE INTO user (id, username, password_hash, created_at) VALUES (?,?,?,?)').run(UID, UID, 'x', ts);
  db.prepare('INSERT OR REPLACE INTO conversation (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)').run(CID, UID, '验证', ts, ts);
  const ins = db.prepare('INSERT OR REPLACE INTO message (id, conversation_id, user_id, role, content, created_at) VALUES (?,?,?,?,?,?)');
  for (let i = 0; i < n; i++) ins.run('m' + i, CID, UID, i % 2 ? 'assistant' : 'user', 'x'.repeat(400), ts + i);
  if (withSubAgent) {
    db.prepare('INSERT OR REPLACE INTO message (id, conversation_id, user_id, role, content, parent_tool_call_id, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('sub1', CID, UID, 'assistant', '子智能体中间过程', 'call_x', ts + 100);
  }
}

function loadRaw(): any[] {
  return (db.prepare('SELECT id, conversation_id, role, content, parent_tool_call_id FROM message WHERE conversation_id=? ORDER BY created_at ASC').all(CID) as any[])
    .map((r) => ({ id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content || '', parentToolCallId: r.parent_tool_call_id || undefined }));
}

afterEach(() => {
  for (const t of ['message_summary', 'message', 'conversation']) { try { db.prepare(`DELETE FROM ${t}`).run(); } catch {} }
});

describe.skipIf(!hasDist)('编译产物（dist）· 压缩落库闭环', () => {
  beforeEach(() => seed(40, true));

  it('dist 版本行为与源码一致：剔除子智能体 + 压缩落库 + 第二步不重压', async () => {
    const main = mainlineMessages(loadRaw());
    expect(main.some((m: any) => m.id === 'sub1'), '★ 产物未剔除子智能体消息').toBe(false);
    expect(main.length).toBe(40);

    const base = { conversationId: CID, userId: UID, model: { id: 'mo', modelId: 'mo', alias: 'T', contextWindow: 800 },
      maxTokens: 100, keepRecent: 6, summaryCache: { ids: [] as string[], summary: '' } };

    const r1 = await buildContextView({ ...base, rawMessages: main });
    expect(r1.compacted).toBe(true);
    const s1 = getLatestMessageSummary(CID);
    expect(s1, '★ 产物未把摘要写进 message_summary').toBeTruthy();
    expect(s1.messageIds.every((id: string) => /^m\d+$/.test(id))).toBe(true);

    // 二次：摘要已落库 → 不再重压
    const r2 = await buildContextView({ ...base, rawMessages: main });
    expect(r2.compacted).toBe(false);
    expect(r2.messages.length).toBeLessThanOrEqual(10);
    expect(String(r2.messages[0].content)).toContain('前文摘要');
  });

  it('dist 版本的预算口径正确（输出预留 + 32K 保守兜底）', () => {
    expect(usableContextBudget(32768, 8192)).toBe(32768 - 8192);
    expect(usableContextBudget(undefined, 8192)).toBe(32768 - 8192);
  });
});

describe.skipIf(hasDist)('编译产物（dist）· 未编译时跳过', () => {
  it('dist 不存在 → 跳过（不误报红）', () => {
    expect(hasDist).toBe(false);
  });
});