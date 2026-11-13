import { describe, expect, it } from 'vitest';
import {
  RPA_BUILDER_ID,
  RPA_BUILDER_TOOLS,
  RPA_RUNTIME_TOOLS,
  builtinAutomationAgentDefs,
} from '../src/builtin-automation-agent.js';

describe('RPA Builder seed', () => {
  it('使用稳定 id、主智能体形态，并挂载运行与创作工具', () => {
    const def = builtinAutomationAgentDefs.find((item) => item.id === RPA_BUILDER_ID)!;

    expect(def).toBeTruthy();
    expect(def.type).toBe('harness');
    expect(def.agent_kind).toBe('main');
    expect(JSON.parse(String(def.builtin_tool_ids))).toEqual(expect.arrayContaining([
      ...RPA_RUNTIME_TOOLS,
      ...RPA_BUILDER_TOOLS,
    ]));
    expect(JSON.parse(String(def.sub_agent_ids))).toContain('a_builtin_page_agent');
  });
});
