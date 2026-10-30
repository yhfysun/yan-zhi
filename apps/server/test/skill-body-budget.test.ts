// 内置 skill 正文预算守门。
//
// ★ 为什么需要（2026-10-30 实测踩到）：
//   注入 skill 时会走 truncateSkillBody(body, 2000) —— 超过 2000 字符**静默截断**，
//   而正文末尾通常是「硬约束」「交付口径」这类最关键的纪律，被砍掉后模型照样跑，
//   只是行为变差且没有任何报错。写长正文时人是感觉不到 2000 这个坎的。
//
// ★ 判据：所有内置 skill 的 body 都必须 ≤ 上限。要写长内容请拆到 files_json（references/）。
//
// ★ 存量欠账（KNOWN_OVER_BUDGET）：本测试首次跑起来时发现 7 条**早已超限**的 skill，
//   它们的尾部内容现在就在被静默截断。修它们属于各自的领域（电商/影视/文档），
//   不在本次改动范围内 —— 先钉住清单，保证**不再新增**；治理时逐条删掉并压到 2000 以内。
import { describe, it, expect } from 'vitest';
import { builtinSkillDefaults } from '../src/db';
import { PROJECT_SKILL_BODY_MAX_CHARS } from '../src/services/project-skills';

const KNOWN_OVER_BUDGET = new Set([
  'skill_anime_storyboard',
  'skill_shop_selection',
  'skill_amazon_listing',
  'skill_amazon_ads_profit',
  'skill_1688_sourcing',
  'skill_douyin_sell',
  'skill_document_type',
]);

describe('内置 skill 正文长度', () => {
  it(`新增的 body 不超过 ${PROJECT_SKILL_BODY_MAX_CHARS} 字符（超了会被静默截断）`, () => {
    const over = builtinSkillDefaults
      .map((s) => ({ id: s.id, len: (s.body || '').length }))
      .filter((x) => x.len > PROJECT_SKILL_BODY_MAX_CHARS && !KNOWN_OVER_BUDGET.has(x.id));
    expect(
      over,
      `以下 skill 正文超限，末尾内容会被截断：${over.map((o) => `${o.id}=${o.len}`).join(', ')}`,
    ).toEqual([]);
  });

  it('存量欠账清单里没有已修好的（修好后要从清单删掉）', () => {
    const fixed = builtinSkillDefaults
      .filter((s) => KNOWN_OVER_BUDGET.has(s.id) && (s.body || '').length <= PROJECT_SKILL_BODY_MAX_CHARS)
      .map((s) => s.id);
    expect(fixed, `这些已不超限，请从 KNOWN_OVER_BUDGET 移除：${fixed.join(', ')}`).toEqual([]);
  });
});
