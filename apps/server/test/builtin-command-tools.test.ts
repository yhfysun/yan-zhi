// 只读内置工具「命令化」白名单的守门测试（2026-10-17）。
//
// 钉的是一条**安全性质**：命令面板里敲得出来的通用内置工具，必须全部是只读的。
// 本项目的同类事故已有三次（api_space_memory_append / api_message_send /
// api_custom_tool_execute —— 都是"写着只读实则可写"），所以这里不靠人记得，靠代码判。

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_COMMAND_TOOLS, readOnlyBuiltinCommands, type BuiltinCommandTool,
} from '../src/builtin-command-tools.js';
import { checkToolPermission } from '../src/tool-permission.js';

describe('只读内置工具命令白名单', () => {
  it('候选清单里每一条都是只读（readonly 模式下放行）', () => {
    for (const t of BUILTIN_COMMAND_TOOLS) {
      expect(checkToolPermission('readonly', t.name).allowed, `「${t.name}」不该出现在只读命令清单里`).toBe(true);
    }
  });

  it('★ 混进写工具 / 委派类也会被过滤掉（过滤在服务端，不靠人记得）', () => {
    const arr = BUILTIN_COMMAND_TOOLS as BuiltinCommandTool[];
    const injected: BuiltinCommandTool[] = [
      { name: 'file_write', desc: 'x', group: 'X' },
      { name: 'cmd_exec', desc: 'x', group: 'X' },
      { name: 'call_agent', desc: 'x', group: 'X' },
    ];
    arr.push(...injected);
    try {
      const names = readOnlyBuiltinCommands().map((t) => t.name);
      for (const bad of injected) {
        expect(names, `「${bad.name}」必须被 readonly 过滤掉`).not.toContain(bad.name);
      }
    } finally {
      arr.splice(arr.length - injected.length, injected.length);
    }
  });

  it('每条都有 name / desc / group（面板与 /help 要显示它们）', () => {
    const list = readOnlyBuiltinCommands();
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      expect(t.name).toBeTruthy();
      expect(t.desc).toBeTruthy();
      expect(t.group).toBeTruthy();
    }
  });
});
