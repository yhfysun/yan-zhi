// 笔记智能体工具回归（notes/tools.ts，真 SQLite —— DATA_DIR 由全局 setup 隔离）。
// 为什么值得测：
//   1) 工具名是「笔记四件套无条件广播」的名单值（拼错 = 模型看不到，静默丢弃）；
//   2) ★ 用户态隔离：setNoteToolUser 不设时必须拒绝 —— 笔记外泄到无关会话是隐私事故；
//   3) 时间入参解析是纯函数（模型给 'YYYY-MM-DD HH:mm' 而非 epoch，解析错 = 提醒永远不响）。
import { describe, it, expect, beforeAll } from 'vitest';
import { getToolRegistry } from '@yan-zhi/core';
import { setNoteToolUser, NOTE_TOOL_NAMES, parseNoteTimeInput } from '../src/notes/tools';
import { listNotes, ensureCategory, getNoteAnalytics } from '../src/notes/service';
import { db } from '../src/db';
import { buildToolsForBackend } from '../src/llm-task-manager';
import { ensureToolsInitialized } from '../src/mcp/index';

const registry = getToolRegistry();
const uid = `note-tool-user-${Date.now()}`;

beforeAll(() => {
  // 唯一注册入口（与生产同路径）：内部注册管理工具 + learning + 笔记四件套，
  // 且幂等 —— 广播契约用例调 buildToolsForBackend 会再次触发它，手动 register 会撞重复注册
  ensureToolsInitialized();
});

describe('笔记四件套 · 注册契约', () => {
  it('四个工具都在 registry（拼错名 = 静默丢弃，模型看不到）', () => {
    const names = registry.list().map((t) => t.name);
    for (const n of NOTE_TOOL_NAMES) expect(names, `缺 ${n}`).toContain(n);
  });

  it('工具 description 写明「仅用户明确要求」边界（方案 §3 用户拍板）', () => {
    for (const n of NOTE_TOOL_NAMES) {
      const def = registry.get(n)!;
      expect(def.description).toContain('明确');
    }
  });
});

describe('时间入参解析（parseNoteTimeInput）', () => {
  it('epoch 毫秒（数字与数字串）', () => {
    const t = 1_700_000_000_000;
    expect(parseNoteTimeInput(t)).toBe(t);
    expect(parseNoteTimeInput('1700000000000')).toBe(t);
  });

  it('★ 本地时间字符串 YYYY-MM-DD HH:mm（模型最常给的自然格式）', () => {
    const got = parseNoteTimeInput('2026-12-25 09:30')!;
    const d = new Date(got);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it('非法输入返回 null（工具层会回明确错误，不静默丢时间）', () => {
    expect(parseNoteTimeInput('not-a-date')).toBeNull();
    expect(parseNoteTimeInput('')).toBeNull();
    expect(parseNoteTimeInput(null)).toBeNull();
    expect(parseNoteTimeInput(0)).toBeNull();
  });
});

describe('笔记工具 · 用户态与读写行为', () => {
  it('未设置用户态时拒绝执行（不猜测数据归属）', async () => {
    setNoteToolUser('');
    const r = await registry.execute('notes_add', { title: 'x' }) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('用户态');
  });

  it('notes_add 真写库 + category_name 自动创建；notes_search 能查回', async () => {
    setNoteToolUser(uid);
    const r = await registry.execute('notes_add', {
      title: '工具写入的笔记',
      content: '内容正文',
      category_name: '工具建类',
    }) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(false);
    const payload = JSON.parse(r.content[0].text);
    expect(payload.ok).toBe(true);
    // 写入 ≠ 生效：库里必须真的有
    const rows = listNotes(uid, { q: '工具写入的笔记' });
    expect(rows.length).toBe(1);
    expect(rows[0].categoryName).toBe('工具建类');
    expect(rows[0].source).toBe('chat');
    // 搜索工具按关键词查回
    const s = await registry.execute('notes_search', { q: '工具写入' }) as { content: Array<{ text: string }>; isError: boolean };
    const found = JSON.parse(s.content[0].text);
    expect(found.total).toBeGreaterThanOrEqual(1);
    expect(found.items[0].id).toBe(rows[0].id);
  });

  it('notes_add 非法时间给明确错误（不静默丢提醒）', async () => {
    setNoteToolUser(uid);
    const r = await registry.execute('notes_add', { title: '坏时间', remind_at: 'yesterday maybe' }) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('无法解析');
  });

  it('notes_add 可通过 template_id + data 创建结构化支出并进入账本汇总', async () => {
    setNoteToolUser(uid);
    const at = Date.now() - 1000;
    const r = await registry.execute('notes_add', {
      title: '工具记账',
      template_id: 'template.expense',
      occurred_at: at,
      data: { amount: 36.5, category: 'food', account: 'wechat', occurredAt: at },
    }) as { content: Array<{ text: string }>; isError: boolean };
    expect(r.isError).toBe(false);
    const payload = JSON.parse(r.content[0].text);
    expect(payload.templateId).toBe('template.expense');
    expect(payload.data.amount).toBe(36.5);
    const report = getNoteAnalytics(uid, at - 1000, at + 1000);
    expect(report.totals.expense).toBeGreaterThanOrEqual(36.5);

    const analytics = await registry.execute('notes_analytics', { range: 'today' }) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(analytics.isError).toBe(false);
    const summary = JSON.parse(analytics.content[0].text);
    expect(summary.totals.expense).toBeGreaterThanOrEqual(36.5);
  });

  it('notes_update 按分类名迁移；空串移到未分类', async () => {
    setNoteToolUser(uid);
    ensureCategory(uid, '目标类');
    const created = await registry.execute('notes_add', { title: '待迁移', category_name: '工具建类' }) as { content: Array<{ text: string }> };
    const id = JSON.parse(created.content[0].text).id as string;
    const up = await registry.execute('notes_update', { id, category_name: '目标类' }) as { content: Array<{ text: string }>; isError: boolean };
    expect(up.isError).toBe(false);
    expect(JSON.parse(up.content[0].text).category).toBe('目标类');
    const up2 = await registry.execute('notes_update', { id, category_name: '' }) as { content: Array<{ text: string }>; isError: boolean };
    expect(JSON.parse(up2.content[0].text).category).toBeNull();
  });

  it('manage_categories：list 含计数 / create 幂等 / rename / delete', async () => {
    setNoteToolUser(uid);
    const list = await registry.execute('notes_manage_categories', { action: 'list' }) as { content: Array<{ text: string }> };
    const names = JSON.parse(list.content[0].text).categories.map((c: { name: string }) => c.name);
    expect(names).toContain('工具建类');
    await registry.execute('notes_manage_categories', { action: 'rename', name: '工具建类', new_name: '改名类' });
    const list2 = await registry.execute('notes_manage_categories', { action: 'list' }) as { content: Array<{ text: string }> };
    const names2 = JSON.parse(list2.content[0].text).categories.map((c: { name: string }) => c.name);
    expect(names2).toContain('改名类');
    expect(names2).not.toContain('工具建类');
    await registry.execute('notes_manage_categories', { action: 'delete', name: '改名类' });
    const list3 = await registry.execute('notes_manage_categories', { action: 'list' }) as { content: Array<{ text: string }> };
    expect(JSON.parse(list3.content[0].text).categories.map((c: { name: string }) => c.name)).not.toContain('改名类');
  });

  it('★ 用户隔离：A 建的笔记切到 B 查不到', async () => {
    setNoteToolUser(`other-user-${Date.now()}`);
    const s = await registry.execute('notes_search', { q: '工具写入' }) as { content: Array<{ text: string }>; isError: boolean };
    expect(JSON.parse(s.content[0].text).total).toBe(0);
  });
});

describe('★ 笔记四件套无条件广播（buildToolsForBackend 1.55 段，方案 §3「挂全部聊天智能体」）', () => {
  it('agent builtin_tool_ids 为空数组（没手工挂）时，工具面仍含四个 notes_* —— 注册≠挂载，必须真跑钉住', () => {
    const userId = `broadcast-user-${Date.now()}`;
    const agentId = `a_broadcast_${Date.now().toString(36)}`;
    db.prepare(
      'INSERT INTO agent (id, user_id, name, builtin_tool_ids, is_public, type, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    ).run(agentId, userId, '广播验证智能体', '[]', 'harness', Date.now(), Date.now());
    const tools = buildToolsForBackend(agentId, userId) as Array<{ function: { name: string } }>;
    const names = tools.map((t) => t.function.name);
    for (const n of NOTE_TOOL_NAMES) expect(names, `广播段漏 ${n}`).toContain(n);
  });

  it('pageAgent 不广播（浏览器操作助手不聊天，纯噪音）', () => {
    const userId = `broadcast-pa-${Date.now()}`;
    // 排除判据就是 PAGE_AGENT_ID 本体 —— 用真实 id 钉住（假 id 永远≠它，测不出排除逻辑）
    db.prepare(
      'INSERT OR REPLACE INTO agent (id, user_id, name, builtin_tool_ids, is_public, type, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    ).run('a_builtin_page_agent', userId, 'pageAgent', '[]', 'harness', Date.now(), Date.now());
    const tools = buildToolsForBackend('a_builtin_page_agent', userId) as Array<{ function: { name: string } }>;
    const names = tools.map((t) => t.function.name);
    for (const n of NOTE_TOOL_NAMES) expect(names, `pageAgent 不应挂 ${n}`).not.toContain(n);
  });
});
