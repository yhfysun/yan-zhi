/**
 * 任务计划跨会话持久化（task-plan-file service）单测 —— 用户 2026-09-30 拍板
 * 「跨会话就写到工作目录里面去」的行为钉死。
 *
 * 覆盖四块硬约定：
 *   1. 渲染/解析往返：markdown 勾选框格式（[x]/[~]/[-]/[ ]）与 note 的「 —— 」分隔可无损往返
 *   2. 文件写入：绑目录空间落 <dir_path>/.yan-zhi/task-memory/plan.md；
 *      未挂空间回退全局 workspaceDir；未配置 workspaceDir 返回 null 不写；
 *      plan=null 删除文件
 *   3. 链路静态断言（读源码剥注释）：llm-task-manager 的无人值守兜底分支与
 *      loadTaskPlan 文件回退存在；conversations.ts 的 PATCH 镜像写存在
 *      —— 防入口漂移（同一件事有多个入口，只修看得见的必漏）。
 *
 * 2026-10-05 用户拍板「任务规划是单会话的」：跨会话播种（seedTaskPlanFromFile /
 * seedPlanRows）已整体删除 —— UI 不向新会话还原旧计划；新会话靠 loadTaskPlan
 * 文件回退让模型「找到之前的任务记录」自行 task_plan 重新规划。
 * 静态断言反向钉死：conversations.ts 与 task-plan-file.ts 不得再出现播种入口。
 *
 * db 与 serverState 用内存 mock（同 artifact-dir.test.ts 套路），磁盘用临时目录真建真探。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const hoisted = vi.hoisted(() => {
  const conversations: Record<string, { space_id?: string | null; task_plan_json?: string | null }> = {
    conv_bound: { space_id: 'sp1', task_plan_json: null },
    conv_loose: { space_id: null, task_plan_json: null },
    conv_seeded: { space_id: 'sp1', task_plan_json: null },
    conv_hasplan: { space_id: 'sp1', task_plan_json: JSON.stringify({ title: '会话自己的计划', steps: [{ title: '已有步骤', status: 'done' }] }) },
  };
  const spaces: Record<string, { dir_path: string | null }> = {
    sp1: { dir_path: '' }, // 运行时由测试填充真实临时目录
  };
  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT space_id FROM conversation WHERE id = \?$/.test(s)) {
        return { get: (id: string) => (conversations[id] ? { space_id: conversations[id].space_id } : undefined), all: () => [], run: () => {} };
      }
      if (/^SELECT id, dir_path FROM space WHERE id = \?$/.test(s)) {
        return { get: (id: string) => (spaces[id] ? { id, dir_path: spaces[id].dir_path } : undefined), all: () => [], run: () => {} };
      }
      if (/^SELECT task_plan_json FROM conversation WHERE id = \?$/.test(s)) {
        return { get: (id: string) => (conversations[id] ? { task_plan_json: conversations[id].task_plan_json ?? null } : undefined), all: () => [], run: () => {} };
      }
      if (/^UPDATE conversation SET task_plan_json = \? WHERE id = \?$/.test(s)) {
        return {
          get: () => undefined, all: () => [],
          run: (json: string, id: string) => { if (conversations[id]) conversations[id].task_plan_json = json; },
        };
      }
      return { get: () => undefined, all: () => [], run: () => {} };
    },
    exec: () => {},
    pragma: () => {},
  };
  return { db, conversations, spaces, serverState: { workspaceDir: '' } };
});

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  // 2026-10-02：补齐 db.js 导出（手写白名单 mock 必须与生产代码同步，否则报
  //   `No "X" export is defined on the "../src/db.js" mock`，表象却是「任务 failed」）。
  MESSAGE_LIST_COLS:
  'id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at',
  deleteMessageSummariesAfter: () => 0,
  clearMessageSummaries: () => {},
  // 2026-10-02：services/context-view.ts（上下文组装唯一出口）新增依赖。
  // ★ 手写白名单 mock 必须同步补，否则 ESM 直接报 "does not provide an export"，
  //   表现为"任务 failed"，看不出真因（本文件此前已记录过同类教训）。
  getLatestMessageSummary: () => null,
  insertMessageSummary: () => "sum_test",
  hasSqliteVec: false,
}));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import {
  getTaskPlanPath,
  renderTaskPlanMarkdown,
  parseTaskPlanMarkdown,
  writeTaskPlanFile,
  loadTaskPlanFromFile,
} from '../src/services/task-plan-file';

let tmp: string;
const PLAN_REL = path.join('.yan-zhi', 'task-memory', 'plan.md');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-plan-'));
  hoisted.spaces.sp1.dir_path = tmp;
  hoisted.serverState.workspaceDir = tmp;
  hoisted.conversations.conv_bound.task_plan_json = null;
  hoisted.conversations.conv_loose.task_plan_json = null;
  hoisted.conversations.conv_seeded.task_plan_json = null;
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 沙箱拦截时忽略 */ }
});

const SAMPLE = {
  title: '《驭兽斋》第二章 有声小说视频',
  steps: [
    { title: '核对素材与既有进度', status: 'done', note: '素材齐全' },
    { title: '生成配音', status: 'running' },
    { title: '合成视频', status: 'pending' },
    { title: '封面图', status: 'failed', note: '原图损坏' },
  ],
};

describe('renderTaskPlanMarkdown / parseTaskPlanMarkdown 往返', () => {
  it('结构化计划 → markdown → 结构化，标题/状态/note 无损往返', () => {
    const md = renderTaskPlanMarkdown(SAMPLE as any);
    expect(md).toContain('# 任务计划：《驭兽斋》第二章 有声小说视频');
    expect(md).toContain('- [x] 核对素材与既有进度 —— 素材齐全');
    expect(md).toContain('- [~] 生成配音');
    expect(md).toContain('- [ ] 合成视频');
    expect(md).toContain('- [-] 封面图 —— 原图损坏');

    const back = parseTaskPlanMarkdown(md)!;
    expect(back.title).toBe(SAMPLE.title);
    expect(back.steps.map((s) => [s.title, s.status, s.note])).toEqual([
      ['核对素材与既有进度', 'done', '素材齐全'],
      ['生成配音', 'running', undefined],
      ['合成视频', 'pending', undefined],
      ['封面图', 'failed', '原图损坏'],
    ]);
  });

  it('无标题计划与空步骤仍可渲染/解析', () => {
    const md = renderTaskPlanMarkdown({ steps: [] } as any);
    expect(md).toContain('# 任务计划');
    expect(parseTaskPlanMarkdown(md)).toBeNull(); // 无有效步骤 → null（不伪造计划）
  });

  it('对 X 大写勾选与 [~] 之外的字面量容错', () => {
    const back = parseTaskPlanMarkdown('# 任务计划：t\n- [X] 大写完成\n- [x]带空格缺 —— note')!;
    expect(back.steps[0].status).toBe('done');
    expect(back.steps[0].title).toBe('大写完成');
  });
});

describe('getTaskPlanPath 落盘位置', () => {
  it('绑目录空间 → <dir_path>/.yan-zhi/task-memory/plan.md', () => {
    expect(getTaskPlanPath('conv_bound')).toBe(path.join(tmp, PLAN_REL));
  });
  it('未挂空间的会话 → 回退全局工作目录（跨会话在未挂空间时也成立）', () => {
    expect(getTaskPlanPath('conv_loose')).toBe(path.join(tmp, PLAN_REL));
  });
  it('未配置 workspaceDir 且未挂空间 → null（不写）', () => {
    hoisted.serverState.workspaceDir = '';
    expect(getTaskPlanPath('conv_loose')).toBeNull();
  });
});

describe('writeTaskPlanFile / loadTaskPlanFromFile', () => {
  it('写入后按相同路径可读回，结构与原计划一致', async () => {
    const ok = await writeTaskPlanFile('conv_bound', SAMPLE as any);
    expect(ok).toBe(true);
    expect(fs.existsSync(path.join(tmp, PLAN_REL))).toBe(true);
    const back = loadTaskPlanFromFile('conv_bound')!;
    expect(back.title).toBe(SAMPLE.title);
    expect(back.steps).toHaveLength(4);
    expect(back.steps[0].status).toBe('done');
  });
  it('plan=null 删除文件；文件本就不存在也不报错', async () => {
    await writeTaskPlanFile('conv_bound', SAMPLE as any);
    expect(await writeTaskPlanFile('conv_bound', null)).toBe(true);
    expect(fs.existsSync(path.join(tmp, PLAN_REL))).toBe(false);
    expect(await writeTaskPlanFile('conv_bound', null)).toBe(true);
  });
  it('无可用路径（未挂空间且无 workspaceDir）→ false', async () => {
    hoisted.serverState.workspaceDir = '';
    expect(await writeTaskPlanFile('conv_loose', SAMPLE as any)).toBe(false);
  });
});

// ── 链路静态断言：读源码剥注释，防入口漂移 ──
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const LTM = strip(readFileSync('src/llm-task-manager.ts', 'utf-8'));
const CONV = strip(readFileSync('src/routes/conversations.ts', 'utf-8'));

describe('链路接线（静态断言，防入口漂移）', () => {
  it('llm-task-manager：无人值守兜底分支存在（task_plan/task_step + subscribers 为空 → 后端执行）', () => {
    expect(LTM).toContain("toolName === 'task_plan' || toolName === 'task_step'");
    expect(LTM).toContain('backendTaskPlan(task.conversationId');
    expect(LTM).toContain('backendTaskStep(task.conversationId');
    // 兜底分支必须在 subscribers.size === 0 的条件下（前端在线仍走 UI 渲染）
    expect(LTM).toMatch(/task_plan' \|\| toolName === 'task_step'[^\n]*\n[^\n]*subscribers\.size === 0|subscribers\.size === 0[\s\S]{0,200}backendTaskPlan/);
  });
  it('llm-task-manager：loadTaskPlan 有文件回退；readPlanRemainingSteps 复用 loadTaskPlan', () => {
    expect(LTM).toContain('loadTaskPlanFromFile(conversationId)');
    // readPlanRemainingSteps 不再手写 JSON.parse(task_plan_json)（两处解析必然漂移）
    const fn = LTM.slice(LTM.indexOf('function readPlanRemainingSteps'), LTM.indexOf('function readPlanRemainingSteps') + 600);
    expect(fn).toContain('loadTaskPlan(conversationId)');
    expect(fn).not.toContain('JSON.parse');
  });
  it('conversations.ts：PATCH taskPlan 镜像写文件', () => {
    expect(CONV).toContain('writeTaskPlanFile(cidForFile, planSnapshot)');
  });
  it('conversations.ts / task-plan-file.ts：跨会话播种已删除，且不得复活（2026-10-05 反向守卫）', () => {
    expect(CONV).not.toContain('seedPlanRows');
    expect(CONV).not.toContain('seedTaskPlanFromFile');
    const TPF = strip(readFileSync('src/services/task-plan-file.ts', 'utf-8'));
    expect(TPF).not.toContain('seedTaskPlanFromFile');
    // 文件回退仍在（模型「找到之前的任务记录」的通道），不许被一起误删
    expect(LTM).toContain('loadTaskPlanFromFile');
  });
});
