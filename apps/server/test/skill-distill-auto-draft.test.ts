// 自动蒸馏入库守卫（2026-10-15，P2-13）
// 守护点：
//   ① `insertSkillDraft` 的字段映射与默认值（status 缺省='overview'、两个 JSON 列、epoch 毫秒时间戳）
//   ② 自动草稿确实能被「草稿列表」查询查到（user_id 归属过滤与路由 GET 同款语句）
//   ③ `skillDraftNotifyText` 三态：失败/已存在 → 静默；新草稿 → 指向「Skill 蒸馏」页
//   ④ 接线：llm-task-manager 在 proposeSkillDraft 成功后真的落库，且 user_id 取 task.userId
// 为什么必须有：这条链是后台无人触发的（同一步骤第 2 次成功才启动），落库失败只有一行 logger.warn，
//   表现出来就是"自动草稿在 UI 里永远看不到"，属于最难归因的静默失效。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { insertSkillDraft } from '../src/services/skill-draft-store.js';
import { skillDraftNotifyText } from '../src/services/skill-distill.js';

/** 剥注释后再匹配：注释里出现同一个词会假绿 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

const cleanup = (id: string) => db.prepare('DELETE FROM skill_draft WHERE id = ?').run(id);

describe('skill_draft 自动蒸馏入库', () => {
  it('insertSkillDraft 落库字段与默认值正确', () => {
    const row = insertSkillDraft({
      userId: 'guest2',
      title: '验收：自动草稿',
      status: 'draft',
      sourceConvId: 'conv_auto_1',
      resultMd: '---\nname: demo-skill\n---\n## 工作流程\n1. 第一步',
    });
    try {
      expect(row.user_id).toBe('guest2');
      expect(row.title).toBe('验收：自动草稿');
      expect(row.status).toBe('draft');
      expect(row.source_conv_id).toBe('conv_auto_1');
      expect(row.result_md).toContain('第一步');
      expect(row.source_msg_ids_json).toBeNull();
      expect(row.overview_json).toBeNull();
      expect(row.error).toBe('');
      // 时间戳是 epoch 毫秒（UI 侧 createdAt 直接当 number 格式化），不是日期字符串
      expect(typeof row.created_at).toBe('number');
      expect(row.created_at).toBeGreaterThan(1_600_000_000_000);
      expect(row.updated_at).toBe(row.created_at);
    } finally {
      cleanup(row.id);
    }
  });

  it('status 缺省时落 overview（与路由 POST 的收敛规则一致）', () => {
    const row = insertSkillDraft({ userId: 'guest2', title: '验收：缺省状态' });
    try {
      expect(row.status).toBe('overview');
    } finally {
      cleanup(row.id);
    }
  });

  it('自动草稿出现在草稿列表查询结果里（user_id 归属过滤同路由 GET）', () => {
    const row = insertSkillDraft({ userId: 'guest', title: '验收：列表可见', status: 'draft', resultMd: 'x' });
    try {
      const rows = db
        .prepare('SELECT * FROM skill_draft WHERE user_id = ? OR user_id = ? ORDER BY updated_at DESC')
        .all('guest', 'guest') as Array<{ id: string }>;
      expect(rows.map((r) => r.id)).toContain(row.id);
    } finally {
      cleanup(row.id);
    }
  });

  it('skillDraftNotifyText：失败/已存在不打扰，新草稿指向「Skill 蒸馏」页', () => {
    expect(skillDraftNotifyText({ ok: false, reason: '模型输出缺少 name/body' })).toBeNull();
    expect(skillDraftNotifyText({ ok: true, name: 'demo-skill', existed: true })).toBeNull();
    const text = skillDraftNotifyText({ ok: true, name: '演示技能', resultMd: 'x' });
    expect(text).toContain('演示技能');
    expect(text).toContain('Skill 蒸馏');
  });

  it('★ 接线：proposeSkillDraft 成功后写 skill_draft，user_id 取 task.userId', () => {
    const src = strip(readFileSync(resolve(__dirname, '../src/llm-task-manager.ts'), 'utf8'));
    const m = src.match(/proposeSkillDraft\(\{[\s\S]*?\}\);([\s\S]{0,900})/);
    expect(m, '在 llm-task-manager.ts 里找不到 proposeSkillDraft 调用点').toBeTruthy();
    const after = m![1];
    expect(after, '自动草稿未落 skill_draft 表').toMatch(/insertSkillDraft\(\{/);
    expect(after, 'user_id 必须取调用方的 task.userId').toMatch(/userId:\s*task\.userId/);
    expect(after, 'source_conv_id 必须取 task.conversationId').toMatch(/sourceConvId:\s*task\.conversationId/);
    // 已存在的草稿不能重复落库，否则列表里会堆同名重复项
    expect(after, '未排除 existed 分支 = 重复草稿').toMatch(/draft\.ok\s*&&\s*!draft\.existed/);
  });
});
