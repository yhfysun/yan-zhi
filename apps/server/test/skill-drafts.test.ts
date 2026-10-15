// skill_draft 持久化守护（2026-10-15 对标 WorkMateAI 融合方案 P0-1）
// 守护点：
//   ① 表存在且列齐全（新库 CREATE TABLE IF NOT EXISTS；旧库由同语句幂等补建）
//   ② 草稿写入/读回字段映射正确（source_msg_ids_json / overview_json 两个 JSON 字段）
//   ③ 路由模块可加载（挂载点 /api/skill-drafts，见 src/index.ts）
// 为什么必须有：这是蒸馏任务从「前端内存」改「落库」的支点，一旦表没建出来，
//   表现是「保存草稿无声失败」（持久化刻意 fail-safe 不打扰主流程），极难归因。
import { describe, it, expect } from 'vitest';
import { db } from '../src/db.js';
import skillDraftRoutes from '../src/routes/skill-drafts.js';

describe('skill_draft 持久化', () => {
  it('表已创建且列齐全', () => {
    const cols = db.prepare(`SELECT name FROM pragma_table_info('skill_draft')`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const expected of [
      'id', 'user_id', 'title', 'status', 'source_conv_id',
      'source_msg_ids_json', 'overview_json', 'result_md', 'error',
      'created_at', 'updated_at',
    ]) {
      expect(names, `缺列 ${expected}`).toContain(expected);
    }
  });

  it('写入并读回草稿（含两个 JSON 字段）', () => {
    const now = Date.now();
    const id = `t_draft_${now}`;
    db.prepare(
      'INSERT INTO skill_draft (id, user_id, title, status, source_conv_id, source_msg_ids_json, overview_json, result_md, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id, 'guest', '验收：概览草稿', 'overview', 'conv_1',
      JSON.stringify(['m1', 'm2']),
      JSON.stringify({ nameZh: '示例技能', slug: 'example-skill', description: '', inputs: [], steps: [], outputs: [], triggers: [] }),
      '', '', now, now,
    );

    const row = db.prepare('SELECT * FROM skill_draft WHERE id = ?').get(id) as any;
    expect(row.title).toBe('验收：概览草稿');
    expect(row.status).toBe('overview');
    expect(JSON.parse(row.source_msg_ids_json)).toEqual(['m1', 'm2']);
    expect(JSON.parse(row.overview_json).slug).toBe('example-skill');

    // 状态推进（draft → published）也是日常路径
    db.prepare('UPDATE skill_draft SET status = ?, updated_at = ? WHERE id = ?').run('published', Date.now(), id);
    expect((db.prepare('SELECT status FROM skill_draft WHERE id = ?').get(id) as any).status).toBe('published');

    db.prepare('DELETE FROM skill_draft WHERE id = ?').run(id);
    expect(db.prepare('SELECT id FROM skill_draft WHERE id = ?').get(id)).toBeUndefined();
  });

  it('路由模块可加载（挂载点 /api/skill-drafts）', () => {
    expect(skillDraftRoutes).toBeTruthy();
  });
});
