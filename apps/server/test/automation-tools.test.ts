import { afterEach, describe, expect, it } from 'vitest';
import { getToolRegistry } from '@yan-zhi/core';
import { registerAutomationTools, AUTOMATION_TOOL_NAMES } from '../src/services/automation-tools.js';
import { classifyToolAction } from '../src/tool-permission.js';

afterEach(() => {
  const registry = getToolRegistry();
  for (const name of AUTOMATION_TOOL_NAMES) registry.unregister(name);
});

describe('automation tools', () => {
  it('注册运行、编辑、校验与取消工具', () => {
    registerAutomationTools();
    const registry = getToolRegistry();

    for (const name of AUTOMATION_TOOL_NAMES) {
      expect(registry.has(name), name).toBe(true);
    }
  });

  it('运行与编辑类按写操作管控，查询类保持只读', () => {
    expect(classifyToolAction('rpa_run_script')).toBe('write');
    expect(classifyToolAction('rpa_script_create_draft')).toBe('write');
    expect(classifyToolAction('rpa_script_update_draft')).toBe('write');
    expect(classifyToolAction('rpa_script_publish')).toBe('write');
    expect(classifyToolAction('rpa_script_list')).toBe('read');
    expect(classifyToolAction('rpa_script_get')).toBe('read');
    expect(classifyToolAction('rpa_get_run')).toBe('read');
  });
});
