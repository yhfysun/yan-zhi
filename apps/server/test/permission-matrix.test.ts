// 审批矩阵单测（2026-10-19，对标 Codex 的 sandbox × approval）。
//
// 守住的语义：
//   ① 矩阵是**唯一判定入口**：工具级（checkToolPermission）与位置级（checkPathAccess）必须给出
//      与表格一致的结果 —— 任何一处另写 if 都会让这张测试红；
//   ② 安全默认不变：readonly = 界内读放行、其余询问；default = 界内读写放行、越界/命令询问；
//      all = 全放行；
//   ③ 提示词与判定同源（readonly 的说明里出现矩阵的 sandbox/approval）。
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  PERMISSION_MATRIX,
  permissionDecision,
  classifyToolAction,
  checkToolPermission,
  permissionModePrompt,
  type PermissionAction,
  type PermissionMode,
  type PermissionScope,
} from '../src/tool-permission.js';
import { checkPathAccess } from '../src/services/path-guard.js';

const ACTIONS: PermissionAction[] = ['read', 'write', 'exec'];
const SCOPES: PermissionScope[] = ['inside', 'outside', 'unknown'];

const WS = process.platform === 'win32' ? 'C:\\proj\\demo' : '/proj/demo';
const OUTSIDE = process.platform === 'win32' ? 'C:\\other\\project' : '/other/project';
const join = (...p: string[]) => p.join(path.sep);

describe('① 矩阵本身（mode × action × scope）', () => {
  it('readonly：只有「界内读」放行，其余全部询问', () => {
    expect(permissionDecision('readonly', 'read', 'inside')).toBe('allow');
    for (const a of ACTIONS) {
      for (const s of SCOPES) {
        if (a === 'read' && s === 'inside') continue;
        expect(permissionDecision('readonly', a, s), `readonly/${a}/${s}`).toBe('ask');
      }
    }
  });

  it('default：界内读写放行；越界一律询问；命令（位置不可知）询问', () => {
    expect(permissionDecision('default', 'read', 'inside')).toBe('allow');
    expect(permissionDecision('default', 'write', 'inside')).toBe('allow');
    for (const a of ACTIONS) {
      expect(permissionDecision('default', a, 'outside'), `default/${a}/outside`).toBe('ask');
    }
    expect(permissionDecision('default', 'exec', 'unknown')).toBe('ask');
  });

  it('all：全放行（用户已明确承担风险）', () => {
    for (const a of ACTIONS) {
      for (const s of SCOPES) expect(permissionDecision('all', a, s)).toBe('allow');
    }
  });

  it('三档的沙箱/审批语义与 Codex 对齐（表即文档）', () => {
    expect(PERMISSION_MATRIX.readonly.sandbox).toBe('read-only');
    expect(PERMISSION_MATRIX.readonly.approval).toBe('always');
    expect(PERMISSION_MATRIX.default.sandbox).toBe('workspace-write');
    expect(PERMISSION_MATRIX.default.approval).toBe('on-violation');
    expect(PERMISSION_MATRIX.all.sandbox).toBe('danger-full-access');
    expect(PERMISSION_MATRIX.all.approval).toBe('never');
  });

  it('分类按实现的副作用判（不按名字猜）', () => {
    expect(classifyToolAction('file_read')).toBe('read');
    expect(classifyToolAction('ask_user')).toBe('read');
    expect(classifyToolAction('file_write')).toBe('write');
    expect(classifyToolAction('file_edit')).toBe('write');
    expect(classifyToolAction('cmd_exec')).toBe('exec');
    expect(classifyToolAction('python_exec')).toBe('exec');
    // 不可控来源 / 委派：副作用无法静态判定 → 按写处理
    expect(classifyToolAction('custom_whatever')).toBe('write');
    expect(classifyToolAction('mcp_some_tool')).toBe('write');
    expect(classifyToolAction('call_agent')).toBe('write');
    expect(classifyToolAction('plan_tasks')).toBe('write');
  });
});

describe('② 执行层必须与矩阵一致', () => {
  it('checkToolPermission（工具级，界内）', () => {
    expect(checkToolPermission('readonly', 'file_read').allowed).toBe(true);
    expect(checkToolPermission('readonly', 'file_write').allowed).toBe(false);
    expect(checkToolPermission('readonly', 'file_write').needsAuthorization).toBe(true);
    expect(checkToolPermission('readonly', 'cmd_exec').needsAuthorization).toBe(true);
    expect(checkToolPermission('default', 'file_write').allowed).toBe(true);
    expect(checkToolPermission('default', 'cmd_exec').allowed).toBe(true); // 命令由路径守卫按会话询问
    expect(checkToolPermission('all', 'file_write').allowed).toBe(true);
  });

  it('checkPathAccess（位置级）：界内放行、越界询问、all 放行', () => {
    const inside = join(WS, 'src', 'a.ts');
    const outside = join(OUTSIDE, 'evil.ts');
    const base = { toolName: 'file_read', workspaceDir: WS, allowedRoots: [WS] };

    expect(checkPathAccess({ ...base, args: { path: inside } }).kind).toBe('allow');
    expect(checkPathAccess({ ...base, args: { path: outside } }).kind).toBe('need-auth');
    expect(checkPathAccess({ ...base, args: { path: outside }, mode: 'all' }).kind).toBe('allow');
  });

  it('★ readonly 下界内写不在路径守卫二次弹窗（动作级审批归 checkToolPermission）', () => {
    const inside = join(WS, 'src', 'a.ts');
    const verdict = checkPathAccess({
      toolName: 'file_write', args: { path: inside }, workspaceDir: WS, allowedRoots: [WS], mode: 'readonly',
    });
    expect(verdict.kind).toBe('allow');
  });

  it('命令类：default/readonly 询问，all 放行', () => {
    const base = { toolName: 'cmd_exec', args: { command: 'npm test' }, workspaceDir: WS, allowedRoots: [WS] };
    expect(checkPathAccess({ ...base, mode: 'default' }).kind).toBe('need-auth');
    expect(checkPathAccess({ ...base, mode: 'readonly' }).kind).toBe('need-auth');
    expect(checkPathAccess({ ...base, mode: 'all' }).kind).toBe('allow');
  });
});

describe('③ 提示词与判定同源', () => {
  it('readonly 的说明引用矩阵值', () => {
    const p = permissionModePrompt('readonly');
    expect(p).toContain(`沙箱=${PERMISSION_MATRIX.readonly.sandbox}`);
    expect(p).toContain(`审批=${PERMISSION_MATRIX.readonly.approval}`);
    expect(p).toMatch(/授权/);
  });

  it('default / all 不注入权限段（避免每轮提示词膨胀）', () => {
    expect(permissionModePrompt('default')).toBe('');
    expect(permissionModePrompt('all')).toBe('');
  });
});
