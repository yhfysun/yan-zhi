// 只读会话工具授权制（2026-10-18，用户拍板：「只读代表其它命令要授权，而不是不能执行」）。
// 三层都要钉住：
//   ① 判定层（tool-permission）：写类/不可控/委派 → allowed=false + needsAuthorization=true；
//      读类照旧直接放行；.allowed 保持 false 让"可见性过滤"调用方行为不变。
//   ② 工具面（filterToolsByPermission）：readonly 不再摘除写工具（模型要有机会发起授权）。
//   ③ 运行时（llm-task-manager 唯一执行出口）：锚点钉 requestToolAuthorization 接线 +
//      无人值守 fail-fast —— 挂起等一个永远不会来的授权 = 变相卡死，必须当场拒。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkToolPermission, filterToolsByPermission, permissionModePrompt, parseToolAuthResult } from '../src/tool-permission.js';

const LTM_SRC = readFileSync(new URL('../src/llm-task-manager.ts', import.meta.url), 'utf8');

function win(src: string, startMarker: string, maxLen: number): string {
  const i = src.indexOf(startMarker);
  if (i < 0) return '';
  return src.slice(i, i + maxLen);
}

describe('① 判定层：readonly 命中写类 = 需授权而非直接拒绝', () => {
  it('写类工具（file_write）→ allowed=false + needsAuthorization=true', () => {
    const v = checkToolPermission('readonly', 'file_write');
    expect(v.allowed).toBe(false);
    expect(v.needsAuthorization).toBe(true);
  });
  it('不可控前缀（mcp_/custom_/wf_）→ needsAuthorization=true', () => {
    for (const name of ['mcp_x__send', 'custom_foo_run', 'wf_demo']) {
      const v = checkToolPermission('readonly', name);
      expect(v.allowed, name).toBe(false);
      expect(v.needsAuthorization, name).toBe(true);
    }
  });
  it('委派类（call_agent / spawn_subagent / app_create_task）→ needsAuthorization=true', () => {
    for (const name of ['call_agent', 'spawn_subagent', 'app_create_task']) {
      const v = checkToolPermission('readonly', name);
      expect(v.allowed, name).toBe(false);
      expect(v.needsAuthorization, name).toBe(true);
    }
  });
  it('读类工具照旧直接放行（不带 needsAuthorization）', () => {
    for (const name of ['file_read', 'web_search', 'api_kb_search']) {
      const v = checkToolPermission('readonly', name);
      expect(v.allowed, name).toBe(true);
      expect(v.needsAuthorization, name).toBeFalsy();
    }
  });
  it('default / all 模式一律放行（授权闸是 readonly 专属）', () => {
    expect(checkToolPermission('default', 'file_write').allowed).toBe(true);
    expect(checkToolPermission('all', 'cmd_exec').allowed).toBe(true);
  });
});

describe('② 工具面：readonly 不再摘除写工具（模型要有机会发起授权）', () => {
  it('filterToolsByPermission 在 readonly 下原样返回（不再裁剪）', () => {
    const tools = [
      { name: 'file_read' },
      { name: 'file_write' },
      { function: { name: 'cmd_exec' } },
    ];
    expect(filterToolsByPermission('readonly', tools)).toEqual(tools);
  });
});

describe('③ 运行时锚点：唯一执行出口接线授权卡（静态钉，防后续重构漏接）', () => {
  it('executeTool 权限闸消费 needsAuthorization 并调 requestToolAuthorization', () => {
    const body = win(LTM_SRC, 'const perm = checkToolPermission(task.permissionMode', 900);
    expect(body, '★ 权限闸没有消费 needsAuthorization（退回硬拒 = 只读永远不能执行）')
      .toMatch(/needsAuthorization/);
    expect(body, '★ 权限闸没有接 requestToolAuthorization').toMatch(/requestToolAuthorization\(task, toolName/);
    expect(body, '★ 已授权工具必须先查 authorizedTools 直接放行').toMatch(/authorizedTools\?\.has\(toolName\)/);
  });
  it('requestToolAuthorization 存在且无人值守 fail-fast（不挂起）', () => {
    const body = win(LTM_SRC, 'async function requestToolAuthorization', 1600);
    expect(body, '★ requestToolAuthorization 未定义').toBeTruthy();
    expect(body, '★ 无人值守（subscribers=0）必须当场拒绝，不能挂起等授权').toMatch(/subscribers\.size === 0/);
    expect(body, '★ 批准后必须记入 authorizedTools（本任务内放行）').toMatch(/authorizedTools\.add\(toolName\)/);
    expect(body, '★ 授权委托必须走 _tool_authorize 伪工具').toMatch(/TOOL_AUTH_TOOL/);
  });
  it('_tool_authorize 不在 registry（是前端拦截的伪工具，同 _path_authorize）', () => {
    expect(LTM_SRC).toMatch(/const TOOL_AUTH_TOOL = '_tool_authorize'/);
  });
});

describe('④ parseToolAuthResult：授权卡回执解析', () => {
  it('JSON 形态优先', () => {
    expect(parseToolAuthResult(JSON.stringify({ decision: 'allow' }))).toBe('allow');
    expect(parseToolAuthResult(JSON.stringify({ decision: 'deny' }))).toBe('deny');
  });
  it('文本兜底：allow/允许/批准 → allow', () => {
    expect(parseToolAuthResult('allow')).toBe('allow');
    expect(parseToolAuthResult('允许')).toBe('allow');
    expect(parseToolAuthResult('批准')).toBe('allow');
  });
  it('空串 / 垃圾值 / deny → deny（fail-safe：解析不出明确允许就拒绝）', () => {
    expect(parseToolAuthResult('')).toBe('deny');
    expect(parseToolAuthResult('   ')).toBe('deny');
    expect(parseToolAuthResult('不知道你在说什么')).toBe('deny');
    expect(parseToolAuthResult('{"decision":"whatever"}')).toBe('deny');
  });
});

describe('⑤ 提示词与旧语义残留', () => {
  it('permissionModePrompt(readonly) 说明授权制，不再宣称"禁止/绕过"', () => {
    const p = permissionModePrompt('readonly');
    expect(p).toMatch(/授权/);
    expect(p).not.toMatch(/禁止创建/);
    expect(p).not.toMatch(/不要尝试绕过限制/);
  });
  it('permissionModePrompt(default) 为空串', () => {
    expect(permissionModePrompt('default')).toBe('');
  });
});
