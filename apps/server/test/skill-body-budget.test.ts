// 内置 skill 正文预算守门。
//
// ★ 为什么需要（2026-10-30 实测踩到）：
//   注入 skill 时会走 truncateSkillBody(body, 2000) —— 超过 2000 字符**静默截断**，
//   而正文末尾通常是「硬约束」「交付口径」这类最关键的纪律，被砍掉后模型照样跑，
//   只是行为变差且没有任何报错。写长正文时人是感觉不到 2000 这个坎的。
//
// ★ 判据：所有内置 skill 的 body 都必须 ≤ 上限；写长内容请下沉到 filesJson（references/）。
//   2026-10-30 七条存量欠账（动漫分镜 / 跨境选品 / 亚马逊 Listing / 广告利润 / 1688 货源 /
//   抖音图文 / 文档类型）已按「正文=纪律与流程骨架，细则进 references」重写并清零。
//
// ★ 第二条判据（正文提到 references/ 就必须真的带 filesJson）：
//   提示词里的「📁 参考资料」指针由 filesJson 生成，指针写进正文但 filesJson 为空时，
//   模型会去 file_read 一个不存在的文件 —— 读起来像有资料、实际是死链，比没有更糟。
import { describe, it, expect } from 'vitest';
import { builtinSkillDefaults } from '../src/db';
import { PROJECT_SKILL_BODY_MAX_CHARS } from '../src/services/project-skills';
import { parseSkillFiles } from '../src/services/skill-files';

describe('内置 skill 正文长度', () => {
  it(`body 不超过 ${PROJECT_SKILL_BODY_MAX_CHARS} 字符（超了会被静默截断）`, () => {
    const over = builtinSkillDefaults
      .map((s) => ({ id: s.id, len: (s.body || '').length }))
      .filter((x) => x.len > PROJECT_SKILL_BODY_MAX_CHARS);
    expect(
      over,
      `以下 skill 正文超限，末尾内容会被截断：${over.map((o) => `${o.id}=${o.len}`).join(', ')}`,
    ).toEqual([]);
  });

  it('正文引用的 references/ 文件必须真实存在', () => {
    const dead = builtinSkillDefaults.flatMap((s) => {
      const refs = [...String(s.body || '').matchAll(/references\/([\w./-]+\.md)/g)].map((m) => m[1]);
      if (!refs.length) return [];
      const have = new Set(parseSkillFiles(s.filesJson).map((f) => f.path.replace(/^references\//, '')));
      const missing = [...new Set(refs)].filter((r) => !have.has(r));
      return missing.map((r) => `${s.id} → references/${r}`);
    });
    expect(dead, `正文写了指针但 filesJson 里没有：${dead.join(', ')}`).toEqual([]);
  });
});
