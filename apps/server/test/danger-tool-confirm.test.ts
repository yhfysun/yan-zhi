/**
 * 危险工具默认确认的档位判定（2026-10-21）。
 *
 * ★ 现场（用户实报）：输入框选的是「All（不确认）」，python_exec 仍被反复弹窗确认。
 *   根因：同日新增的「危险工具默认确认」只看 `isDangerousTool`，没看 `permissionMode` ——
 *   而危险**命令**护栏（checkDangerousCommand）早已按 `all → 跳过` 处理，两条护栏口径不一。
 *
 * 口径（本次钉死）：
 *   · all        → 不问（用户已明确承担全部风险）
 *   · readonly/default/full → 问（首次），选过「本会话内允许该工具」后不再问
 *   · 用户自己配的 confirm 规则 → 由前置分支处理，这里不再重复问
 */
import { describe, it, expect } from 'vitest';
import { needsDangerConfirm } from '../src/llm-task-manager.js';

const base = { hasConfirmRules: false, alreadyAuthorized: false };

describe('needsDangerConfirm', () => {
  it('default 档位：危险工具要问', () => {
    expect(needsDangerConfirm({ ...base, toolName: 'python_exec', permissionMode: 'default' })).toBe(true);
  });

  it('★ all 档位：不问（本次修复的核心）', () => {
    expect(needsDangerConfirm({ ...base, toolName: 'python_exec', permissionMode: 'all' })).toBe(false);
    expect(needsDangerConfirm({ ...base, toolName: 'cmd_exec', permissionMode: 'all' })).toBe(false);
  });

  it('readonly / full 档位仍要问', () => {
    for (const mode of ['readonly', 'full']) {
      expect(needsDangerConfirm({ ...base, toolName: 'python_exec', permissionMode: mode })).toBe(true);
    }
  });

  it('本会话已允许该工具 → 不再问', () => {
    expect(needsDangerConfirm({
      ...base, alreadyAuthorized: true, toolName: 'python_exec', permissionMode: 'default',
    })).toBe(false);
  });

  it('用户 confirm 规则已命中 → 不在这里重复问', () => {
    expect(needsDangerConfirm({
      ...base, hasConfirmRules: true, toolName: 'python_exec', permissionMode: 'default',
    })).toBe(false);
  });

  it('非危险工具从不问', () => {
    expect(needsDangerConfirm({ ...base, toolName: 'file_read', permissionMode: 'default' })).toBe(false);
    expect(needsDangerConfirm({ ...base, toolName: 'file_write', permissionMode: 'readonly' })).toBe(false);
  });

  it('api_im_* 外部发送同样按危险处理', () => {
    expect(needsDangerConfirm({ ...base, toolName: 'api_im_wechat_send', permissionMode: 'default' })).toBe(true);
  });
});
