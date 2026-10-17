/**
 * 后台 AI 任务 P2（ops 任务中心）接线契约。
 *
 * 口径：
 *   ① 后台任务复用 `/llm/tasks` 建任务，再由 ops 插件把 taskId 登记为 `agent` 作业；
 *   ② 进度走同一套 job SSE（progressText / resultText），终态落库到任务历史；
 *   ③ llm-task-manager 必须**动态 import** —— 静态 import 会让所有 ops-shell 单测
 *      连带加载 db（better-sqlite3），在 ABI 不匹配的环境里直接挂；
 *   ④ 文件面板重开后靠 `/sftp/jobs/active` 把还在跑的任务接回来。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../src/plugins/ops-shell.ts'), 'utf8');

describe('ops-shell · 后台 AI 任务（P2）', () => {
  it('job 模型支持 agent，进度/结果字段进 SSE 帧', () => {
    expect(SRC).toMatch(/kind: 'upload' \| 'download' \| 'delete' \| 'agent'/);
    expect(SRC).toMatch(/progressText: j\.progressText/);
    expect(SRC).toMatch(/resultText: j\.resultText/);
    expect(SRC).toMatch(/taskId: j\.taskId/);
    expect(SRC).toMatch(/conversationId: j\.conversationId/);
  });

  it('★ 登记路由用动态 import，绝不静态加载 llm-task-manager', () => {
    expect(SRC).toMatch(/r\.post\('\/jobs\/agent'/);
    expect(SRC).toContain("await import('../llm-task-manager.js')");
    // 反向断言：文件顶部不能出现静态 import
    expect(SRC).not.toMatch(/^import .*llm-task-manager/m);
  });

  it('订阅任务事件：chunk 记进度、message:added 记结果、终态收尾', () => {
    expect(SRC).toMatch(/mod\.subscribe\(taskId, 0/);
    expect(SRC).toMatch(/ev\.type === 'chunk'/);
    expect(SRC).toMatch(/ev\.type === 'message:added'/);
    expect(SRC).toMatch(/ev\.type === 'task:completed'/);
    expect(SRC).toMatch(/ev\.type === 'task:error'/);
    expect(SRC).toMatch(/ev\.type === 'task:aborted'/);
    // 回放期间就收尾时，subscribe 返回的取消函数要补调（否则挂在已结束任务上）
    expect(SRC).toMatch(/if \(finished\) unsub\(\)/);
  });

  it('活动任务接口 + 历史摘要落库', () => {
    expect(SRC).toMatch(/r\.get\('\/sftp\/jobs\/active'/);
    expect(SRC).toMatch(/summary: isAgent \? \(j\.resultText \|\| j\.progressText \|\| ''\)\.slice\(-4000\)/);
    expect(SRC).toMatch(/conversationId: isAgent \? j\.conversationId/);
  });
});
