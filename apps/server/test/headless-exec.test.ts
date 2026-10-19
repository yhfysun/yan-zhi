// 无头执行入口（POST /api/exec）的守门测试（2026-10-19，对标 codex exec）。
//
// 守住的语义（每一条都是"无人值守"场景下的真实事故面）：
//   ① 终态判定只认 task:completed / task:error / task:aborted —— 把过程事件误当终态
//      会让请求提前返回空结果；
//   ② 必须是无人值守配置：includeUiTools:false（否则模型会停下来等一个不存在的用户点击）；
//   ③ 不自动选默认模型（自动选模型的口径已有两份，第三份必然漂移）；
//   ④ 超时必须先 abortTask（留下 running 任务会占住会话，后续消息全被"注入"进死任务）；
//   ⑤ 必须挂到 /api/exec。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TERMINAL_TASK_EVENTS } from '../src/routes/exec.js';

const SERVER_SRC = resolve(__dirname, '..');
const ROUTE = readFileSync(resolve(SERVER_SRC, 'src/routes/exec.ts'), 'utf8');
const INDEX = readFileSync(resolve(SERVER_SRC, 'src/index.ts'), 'utf8');

describe('① 终态事件集合', () => {
  it('只含三个任务终态', () => {
    expect([...TERMINAL_TASK_EVENTS].sort()).toEqual(['task:aborted', 'task:completed', 'task:error']);
  });

  it('过程事件不得混入（误判会让请求提前返回空结果）', () => {
    for (const t of ['message:added', 'tool:start', 'tool:result', 'task:cost', 'plan:updated']) {
      expect(TERMINAL_TASK_EVENTS.has(t), `★ ${t} 被当成终态`).toBe(false);
    }
  });
});

describe('② 无人值守配置', () => {
  it('★★ includeUiTools:false（否则模型等一个不存在的用户）', () => {
    expect(ROUTE, '★ 无头任务把 UI 工具放进了工具面').toMatch(/includeUiTools:\s*false/);
  });

  it('★★ 不自动选默认模型：缺 platformId/modelId 直接 400', () => {
    expect(ROUTE).toMatch(/platformId \/ modelId 必填/);
    expect(ROUTE, '★ 引入了默认模型选择（与 scheduled-tasks/memory-dreaming 的第三份口径）')
      .not.toMatch(/findDefaultModel/);
  });

  it('默认权限沿用会话值，允许显式覆盖（CI 要写文件需传 permissionMode）', () => {
    expect(ROUTE).toMatch(/permissionMode/);
    expect(ROUTE).toMatch(/permission_mode = \?/);
  });
});

describe('③ 超时语义', () => {
  it('★★ 超时先 abortTask 再返回失败（不留 running 任务占会话）', () => {
    const i = ROUTE.indexOf('setTimeout(');
    expect(i).toBeGreaterThan(-1);
    const body = ROUTE.slice(i, i + 400);
    expect(body, '★ 超时只返回失败、没有 abort → 任务继续跑，会话被占住').toMatch(/abortTask\(taskId\)/);
    expect(body).toMatch(/超时/);
  });
});

describe('④ 路由挂载', () => {
  it('挂到 /api/exec', () => {
    expect(INDEX).toMatch(/app\.use\('\/api\/exec',\s*execRoutes\)/);
  });
});
