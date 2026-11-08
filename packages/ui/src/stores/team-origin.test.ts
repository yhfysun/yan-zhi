/**
 * Task 4 契约测试：团队资源进入常规选择器（前端侧）。
 *
 * ★ 与 agentPicker.test.ts 同风格：纯文本契约（node 环境无 DOM）。
 *   来源判定的"真假"已由服务端 test/team-origin-shared.test.ts 真跑覆盖；
 *   这里钉住前端**接线**：三个选择器真的渲染标签、三个 store 真的映射字段、
 *   撤权后缓存真的被失效 —— 静态断言抓不住"字段映射了但 UI 忘了渲染"这类漏接。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const AGENT_STORE = read('../stores/agent.ts');
const SKILL_STORE = read('../stores/skill.ts');
const PLATFORM_STORE = read('../stores/platform.ts');
const PICKER = read('../components/chat/AgentPicker.vue');
const SKILL_CARDS = read('../components/chat/ChatSkillCards.vue');
const INPUT = read('../components/chat/ChatInputArea.vue');
const ACL_DIALOG = read('../components/common/ResourceAclDialog.vue');
const CHAT_CSS = read('../views/chat.css');
describe('选择器渲染团队标签', () => {
  it('智能体选择器按 shared 渲染「团队」标签', () => {
    expect(PICKER).toContain('v-if="ag.shared"');
    expect(PICKER).toContain('yz-team-tag');
  });

  it('Skill 挂载选择器按 shared 渲染「团队」标签', () => {
    expect(SKILL_CARDS).toContain('v-if="s.shared"');
    expect(SKILL_CARDS).toContain('yz-team-tag');
  });

  it('模型选择器（桌面 + 移动两个 popover）都按 shared 渲染标签', () => {
    // ChatInputArea 里桌面/移动各有一份模型列表模板，两处都要接
    const hits = INPUT.split('v-if="m.shared"').length - 1;
    expect(hits, '模型项模板有桌面/移动两份，标签必须两处都接').toBeGreaterThanOrEqual(2);
    expect(INPUT).toContain('yz-team-tag');
  });

  it('标签样式只收口在 chat.css 一处，三个选择器共用', () => {
    expect(CHAT_CSS).toContain('.yz-team-tag');
    // 组件内不允许再各写一份 scoped 的团队标签样式（避免样式漂移）
    expect(PICKER).not.toMatch(/\.yz-team-tag\s*\{/);
    expect(SKILL_CARDS).not.toMatch(/\.yz-team-tag\s*\{/);
    expect(INPUT).not.toMatch(/\.yz-team-tag\s*\{/);
  });
});

describe('store 映射 shared 字段', () => {
  it('agent / skill / model 的行映射都透传 shared', () => {
    expect(AGENT_STORE).toContain('shared: !!r.shared');
    expect(SKILL_STORE).toContain('shared: !!r.shared');
    expect(PLATFORM_STORE).toContain('shared: !!r.shared');
  });
});

describe('撤权后选择器缓存同步失效', () => {
  it('ACL 名单保存成功后失效模型 / Skill / 智能体三份缓存', () => {
    expect(ACL_DIALOG).toContain('invalidateModels()');
    expect(ACL_DIALOG).toContain('invalidateSkills()');
    expect(ACL_DIALOG).toContain('invalidateAgents()');
  });

  it('三个 store 都提供 invalidate 入口并已导出', () => {
    expect(PLATFORM_STORE).toMatch(/function invalidateModels\(\)/);
    expect(SKILL_STORE).toMatch(/function invalidateSkills\(\)/);
    expect(AGENT_STORE).toMatch(/function invalidateAgents\(\)/);
    expect(PLATFORM_STORE).toContain('invalidateModels,');
    expect(SKILL_STORE).toContain('invalidateSkills,');
    expect(AGENT_STORE).toContain('invalidateAgents,');
  });
});

describe('不改变个人资源现有行为', () => {
  it('标签只在 shared 时出现，个人资源渲染路径不变', () => {
    // v-if 保证个人资源（shared=false）不渲染任何额外节点
    expect(PICKER).toMatch(/\{\{ ag\.name \}\}<em v-if="ag\.shared"/);
    expect(SKILL_CARDS).toMatch(/\{\{ s\.name \}\}<em v-if="s\.shared"/);
    expect(INPUT).toMatch(/\{\{ m\.alias \|\| m\.modelId \}\}<em v-if="m\.shared"/);
  });
});
