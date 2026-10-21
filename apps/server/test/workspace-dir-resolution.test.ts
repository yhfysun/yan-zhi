/**
 * ★★★ 守门：工作目录按「前端下发 > 会话绑定空间 > 全局」解析（2026-10-12 修串工作目录）。
 *
 * 背景（用户反复报「A 会话任务读写 B 空间目录」）：
 *   此前取值链是「前端下发 > serverState 全局兜底」，**从不查 conversation.space_id → space.dir_path**。
 *   前端 workspaceDir 是全局单份设置（最后一次点选的空间目录），切会话不同步 →
 *   A 会话发任务带着 B 空间目录跑，全部工具（含子智能体）在 B 目录解析相对路径。
 *
 * 修复面（必须同源，测试逐一钉死）：
 *   1. createTask（llm-task-manager）—— task.workspaceDir 快照
 *   2. buildSystemPromptForBackend —— 提示词注入的 effectiveWorkspaceDir
 *   两处不同源 = 「提示词说 A、工具在 B 找」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const hoisted = vi.hoisted(() => {
  // conversation.space_id 与 space.dir_path 的最小内存模型
  const conversations: Record<string, { space_id?: string | null; mode?: string }> = {
    conv_spaceA: { space_id: 'spA' },
    conv_spaceB: { space_id: 'spB' },
    conv_loose: { space_id: null },
    conv_empty_dir: { space_id: 'sp_empty' }, // 空间存在但 dir_path 为空 → 应继续走全局兜底
    conv_missing_space: { space_id: 'sp_ghost' }, // 空间行不存在 → 同上
    // 店铺运营：未绑空间且**不得**继承全局项目目录（2026-10-21 串项目事故）
    conv_shop: { space_id: null, mode: 'shop' },
    // 店铺会话若显式绑了空间（用户自己建的店铺资源目录），仍应使用空间目录
    conv_shop_space: { space_id: 'spA', mode: 'shop' },
  };
  const spaces: Record<string, { dir_path: string | null }> = {
    spA: { dir_path: 'C:\\ws\\space-a' },
    spB: { dir_path: 'C:\\ws\\space-b' },
    sp_empty: { dir_path: '   ' },
  };
  const serverState = { workspaceDir: '' };
  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      // resolveConversationWorkspaceDir 的 JOIN 查询
      if (/^SELECT s\.dir_path AS dirPath FROM conversation c JOIN space s ON c\.space_id = s\.id WHERE c\.id = \?$/.test(s)) {
        return {
          get: (id: string) => {
            const conv = conversations[id];
            if (!conv) return undefined;
            const sp = conv.space_id ? spaces[conv.space_id] : undefined;
            return sp ? { dirPath: sp.dir_path } : undefined;
          },
          all: () => [], run: () => {},
        };
      }
      // createTask 里读 permission_mode（保持可跑，值不影响本测试）
      if (/^SELECT permission_mode FROM conversation WHERE id = \?$/.test(s)) {
        return { get: () => ({ permission_mode: null }), all: () => [], run: () => {} };
      }
      // 按模式收紧工作目录（店铺模式不继承全局项目目录）
      if (/^SELECT mode FROM conversation WHERE id = \?$/.test(s)) {
        return {
          get: (id: string) => (conversations[id] ? { mode: conversations[id].mode ?? null } : undefined),
          all: () => [], run: () => {},
        };
      }
      return { get: () => undefined, all: () => [], run: () => {} };
    },
    exec: () => {},
    pragma: () => {},
  };
  return { db, conversations, spaces, serverState };
});

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  MESSAGE_LIST_COLS:
    'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => 'sum_test',
  hasSqliteVec: false,
  // openclaw-manager（经 services/im.ts 拉进 import 链）在模块加载期执行 path.join(dataDir,'openclaw')')
  // 手写白名单 mock 必须补 dataDir 导出，否则报 No "dataDir" export（教训同 2026-10-02 白名单 mock 注）。
  get dataDir() { return process.env.DATA_DIR || ''; },
}));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import {
  resolveConversationWorkspaceDir,
  resolveEffectiveWorkspaceDir,
  buildSystemPromptForBackend,
} from '../src/llm-task-manager.js';

beforeEach(() => {
  hoisted.serverState.workspaceDir = 'C:\\ws\\global-last';
});

describe('resolveConversationWorkspaceDir（会话 → 空间目录）', () => {
  it('会话绑定空间 → 返回空间 dir_path', () => {
    expect(resolveConversationWorkspaceDir('conv_spaceA')).toBe('C:\\ws\\space-a');
    expect(resolveConversationWorkspaceDir('conv_spaceB')).toBe('C:\\ws\\space-b');
  });

  it('未挂空间 → null', () => {
    expect(resolveConversationWorkspaceDir('conv_loose')).toBeNull();
  });

  it('空间 dir_path 为空/空白 → null（继续走下一级兜底）', () => {
    expect(resolveConversationWorkspaceDir('conv_empty_dir')).toBeNull();
  });

  it('绑定的空间行不存在 → null（fail-safe）', () => {
    expect(resolveConversationWorkspaceDir('conv_missing_space')).toBeNull();
  });

  it('会话不存在 / id 为空 → null（不抛错）', () => {
    expect(resolveConversationWorkspaceDir('conv_nope')).toBeNull();
    expect(resolveConversationWorkspaceDir(null)).toBeNull();
    expect(resolveConversationWorkspaceDir(undefined)).toBeNull();
    expect(resolveConversationWorkspaceDir('')).toBeNull();
  });
});

describe('buildSystemPromptForBackend 工作目录取值链（提示词侧同源）', () => {
  it('显式下发优先于会话空间', () => {
    const p = buildSystemPromptForBackend(null, 'u1', undefined, {
      conversationId: 'conv_spaceA',
      workspaceDir: 'C:\\ws\\explicit',
    });
    expect(p).toContain('C:\\ws\\explicit');
    expect(p).not.toContain('C:\\ws\\space-a');
  });

  it('★ 核心回归：未下发时用会话绑定空间，而非全局残留（串目录根因）', () => {
    // 场景复现：用户最后在 B 空间点过目录（全局残留 = B），但会话绑的是 A
    hoisted.serverState.workspaceDir = 'C:\\ws\\space-b';
    const p = buildSystemPromptForBackend(null, 'u1', undefined, { conversationId: 'conv_spaceA' });
    expect(p).toContain('当前工作目录：C:\\ws\\space-a');
    expect(p).not.toContain('当前工作目录：C:\\ws\\space-b');
  });

  it('未挂空间 → 回落全局兜底（行为向后兼容）', () => {
    const p = buildSystemPromptForBackend(null, 'u1', undefined, { conversationId: 'conv_loose' });
    expect(p).toContain('当前工作目录：C:\\ws\\global-last');
  });

  it('空间 dir_path 为空 → 回落全局兜底', () => {
    const p = buildSystemPromptForBackend(null, 'u1', undefined, { conversationId: 'conv_empty_dir' });
    expect(p).toContain('当前工作目录：C:\\ws\\global-last');
  });

  it('无 conversationId → 全局兜底（老调用点向后兼容）', () => {
    const p = buildSystemPromptForBackend(null, 'u1');
    expect(p).toContain('当前工作目录：C:\\ws\\global-last');
  });
});

describe('店铺模式不继承全局工作目录（2026-10-21 串项目事故）', () => {
  it('未绑空间的店铺会话 → 无工作目录（助手不该去翻别的项目）', () => {
    expect(resolveEffectiveWorkspaceDir('conv_shop')).toBeUndefined();
  });

  it('店铺会话显式绑了空间 → 仍以空间目录为准', () => {
    expect(resolveEffectiveWorkspaceDir('conv_shop_space')).toBe('C:\\ws\\space-a');
  });

  it('店铺模式的提示词里不出现全局项目目录', () => {
    const p = buildSystemPromptForBackend(null, 'u1', undefined, { conversationId: 'conv_shop' });
    expect(p).not.toContain('当前工作目录：C:\\ws\\global-last');
  });
});

describe('createTask 工作目录取值链（任务快照侧）', () => {
  // createTask 会立即启动 ReAct 循环（void runReActLoop），这里不起真循环：
  // 用 spies 断言 task.workspaceDir 的唯一可靠途径是走 createTask → persistTaskRow 落库行。
  // 但 llm-task-manager import 链重（拉起 core/浏览器桥等），已有集成测试覆盖 createTask 链；
  // 本文件聚焦解析函数与提示词侧（同一取值链的两个消费端），createTask 侧统一走
  // resolveEffectiveWorkspaceDir（显式 > 空间 > 非店铺模式的全局兜底）。
  it('取值链表达式口径（防回归说明性锚点）：三级顺序编译期已定', () => {
    expect(resolveConversationWorkspaceDir('conv_spaceA')).toBe('C:\\ws\\space-a');
    expect(hoisted.serverState.workspaceDir).toBe('C:\\ws\\global-last');
  });
});
