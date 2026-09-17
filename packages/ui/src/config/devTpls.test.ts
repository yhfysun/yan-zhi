// 开发模式任务模板（config/devTpls.ts）完整性回归测试。
//
// 钉住的契约（这些值错了不会报错，只会静默失效 —— 本次就踩过）：
//   1) agentId 必须是真实存在的内置智能体 id（写错 → 点卡片不切智能体）；
//   2) skillIds 必须是已内置的 skill id（写错 → 空挂载、模板等于没用）；
//   3) 每个模板必须有 label/desc/examples，key 唯一；
//   4) 覆盖开发全流程（建项目/开发/排查/审查/测试/发布）。

import { describe, it, expect } from 'vitest';
import { DEV_TPLS } from './devTpls';

/** 与 apps/server/src/db.ts 的内置智能体 id 对齐（用错 id 会静默失效） */
const KNOWN_AGENT_IDS = new Set([
  'a_default_assistant',
  'a_builtin_code_agent',
  'a_builtin_code_explorer',
  'a_builtin_backend_dev',
  'a_builtin_ui_designer',
  'a_builtin_frontend_dev',
  'a_builtin_java_agent',
  'a_builtin_cicd_agent',
  'a_builtin_page_agent',
]);

/** 与 apps/server/src/db.ts 的 builtinSkillDefaults 对齐 */
const KNOWN_SKILL_IDS = new Set([
  // 代码相关（开发模式模板会用到的全部）
  'skill_arch_design', 'skill_cross_cutting', 'skill_api_design',
  'skill_code_review', 'skill_code_refactor', 'skill_code_explain',
  'skill_code_security_audit', 'skill_unit_test_gen', 'skill_git_workflow',
  'skill_backend_impl', 'skill_frontend_page_build', 'skill_css_styling',
  'skill_frontend_performance', 'skill_form_interaction', 'skill_ui_design_spec',
  'skill_markdown_doc',
]);

describe('开发模板完整性', () => {
  it('每个模板的 agentId 都指向真实内置智能体', () => {
    const bad = DEV_TPLS.filter((t) => !KNOWN_AGENT_IDS.has(t.agentId));
    expect(bad.map((t) => `${t.key}:${t.agentId}`)).toEqual([]);
  });

  it('每个模板的 skillIds 都是已内置的 skill（写错会空挂载）', () => {
    const bad = DEV_TPLS.filter((t) => t.skillIds.some((id) => !KNOWN_SKILL_IDS.has(id)));
    expect(bad.map((t) => `${t.key}:${t.skillIds.join(',')}`)).toEqual([]);
  });

  it('每个模板至少挂 1 个 skill，且自身不重复', () => {
    for (const t of DEV_TPLS) {
      expect(t.skillIds.length, `${t.key} 未挂 skill`).toBeGreaterThan(0);
      expect(new Set(t.skillIds).size, `${t.key} skill 重复`).toBe(t.skillIds.length);
    }
  });

  it('key 唯一、字段齐备（label/desc/agentLabel/examples）', () => {
    const keys = DEV_TPLS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of DEV_TPLS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.desc.length).toBeGreaterThan(0);
      expect(t.agentLabel.length).toBeGreaterThan(0);
      expect(t.examples.length).toBeGreaterThan(0);
    }
  });

  it('覆盖开发全流程：建项目 / 开发 / 排查 / 审查 / 测试 / 发布', () => {
    const labels = DEV_TPLS.map((t) => t.label);
    for (const need of ['建立项目', '需求开发', 'Bug 修复', '代码审查', '补单元测试', '打包发布']) {
      expect(labels, `缺模板：${need}`).toContain(need);
    }
  });

  it('用到的智能体覆盖主智能体 + 全部专属子智能体（团队都被模板用上）', () => {
    const used = new Set(DEV_TPLS.map((t) => t.agentId));
    for (const id of ['a_builtin_code_agent', 'a_builtin_code_explorer', 'a_builtin_backend_dev',
      'a_builtin_frontend_dev', 'a_builtin_ui_designer', 'a_builtin_java_agent', 'a_builtin_cicd_agent']) {
      expect(used, `未使用的智能体：${id}`).toContain(id);
    }
  });
});