// 会话提示词合成单测（services/conv-prompt.ts，2026-10-19）。
// 钉住的核心不变量：agent 提示词更新必须能传到既有会话，但用户自写的会话提示词
// 的覆盖语义不能被破坏。
import { describe, it, expect } from 'vitest';
import { composeConversationBasePrompt } from '../src/services/conv-prompt.js';

const NEW_AGENT = '你是「代码编写助手」（codeAgent），这个编码团队的首席架构师。小活自己干，大活带团队。\n\n## 任务分级\n...新内容...';
const OLD_SNAPSHOT = '你是「代码编写助手」（codeAgent），这个编码团队的首席架构师。你不是搬砖的：一律委派。\n\n## 你的团队\n...旧内容...';
const SCENE = '## 当前场景：代码开发\n用户处于代码开发场景，你是一名资深开发工程师：\n- 先读代码再动手。';

describe('composeConversationBasePrompt', () => {
  it('会话无提示词 → 用 agent 当前提示词', () => {
    expect(composeConversationBasePrompt('', NEW_AGENT)).toBe(NEW_AGENT);
  });

  it('会话提示词已包含 agent 当前提示词 → 原样返回（不重复拼接）', () => {
    const conv = NEW_AGENT + '\n\n' + SCENE;
    expect(composeConversationBasePrompt(conv, NEW_AGENT)).toBe(conv);
  });

  it('★ 陈旧快照（同角色首行、正文不同）→ 刷新为新的 agent 提示词并保留场景段', () => {
    const conv = OLD_SNAPSHOT + '\n\n' + SCENE;
    const out = composeConversationBasePrompt(conv, NEW_AGENT);
    expect(out).toContain('小活自己干');
    expect(out).not.toContain('你不是搬砖的');
    expect(out).toContain('## 当前场景：代码开发');
    expect(out).toContain('先读代码再动手');
  });

  it('陈旧快照且无场景段 → 只剩新 agent 提示词', () => {
    expect(composeConversationBasePrompt(OLD_SNAPSHOT, NEW_AGENT)).toBe(NEW_AGENT);
  });

  it('用户自定义会话提示词（首行不同）→ 维持覆盖语义', () => {
    const custom = '你是我的专属助手，只按下面的规则回答：\n1. 用英文\n2. 不写代码';
    expect(composeConversationBasePrompt(custom, NEW_AGENT)).toBe(custom);
  });

  it('agent 提示词为空 → 用会话提示词', () => {
    expect(composeConversationBasePrompt(SCENE, '')).toBe(SCENE);
  });
});
