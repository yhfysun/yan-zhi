// 智能体选择器（openspec 8b.3–8b.10）契约（2026-10-17）
// ★ 纯文本契约（node 环境无 DOM），剥注释后匹配。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const STORE = strip(readFileSync(resolve(__dirname, '../../stores/agent.ts'), 'utf8'));
const PICKER = strip(readFileSync(resolve(__dirname, 'AgentPicker.vue'), 'utf8'));
// ★ ChatInputArea 模板里有 `accept="image/*"`：`/*` 会让「剥块注释」吃掉后续 import，
//   所以这里读原文，只断言模板/导入（样式里的旧 class 不参与判定）。
const INPUT = readFileSync(resolve(__dirname, 'ChatInputArea.vue'), 'utf8');
const CSS = readFileSync(resolve(__dirname, '../../views/chat.css'), 'utf8');

describe('8b.3 · 分组数据', () => {
  it('groupedChatAgents 按 config.mode 分组，未知归办公', () => {
    expect(STORE).toMatch(/const groupedChatAgents = computed/);
    expect(STORE).toMatch(/\(a\.config as Record<string, unknown> \| undefined\)\?\.mode \|\| 'office'/);
    expect(STORE).toContain("office: '办公'");
    expect(STORE).toContain("ops: '运维'");
    expect(STORE).toContain("sec: '安全'");
    expect(STORE).toMatch(/groupedChatAgents, delegatableAgents/);
  });
});

describe('8b.4–8b.9 · 选择器', () => {
  it('★ 用 el-popover（不是 el-dropdown）', () => {
    expect(PICKER).toContain('<el-popover');
    expect(PICKER).not.toContain('<el-dropdown');
    expect(CSS).toContain('.agent-picker-popper');
  });

  it('搜索匹配 name + description，命中自动展开', () => {
    expect(PICKER).toMatch(/\$\{a\.name\} \$\{a\.description \|\| ''\}/);
    expect(PICKER).toMatch(/if \(searching\.value\) return false/);
  });

  it('★ 当前模式分组默认展开、其余折叠；折叠态持久化', () => {
    expect(PICKER).toContain('yz:agentGroups:collapsed');
    expect(PICKER).toMatch(/return mode !== activeGroup\.value/);
    expect(PICKER).toMatch(/localStorage\.setItem\(COLLAPSE_KEY/);
  });

  it('子智能体不出现（仍走 chatAgents 过滤）', () => {
    expect(PICKER).toMatch(/agentStore\.groupedChatAgents/);
    // 分组数据源本身就是 chatAgents（已过滤 sub）
    expect(STORE).toMatch(/chatAgents = computed\(\(\) => agents\.value\.filter\(\(a\) => isChatSelectableAgent\(a\)\)\)/);
  });

  it('ChatInputArea 已换用 AgentPicker', () => {
    expect(INPUT).toContain("import AgentPicker from './AgentPicker.vue'");
    expect(INPUT).toContain('<AgentPicker />');
    expect(INPUT).not.toMatch(/<el-dropdown[^>]*agent-switch-popper/);
  });
});
