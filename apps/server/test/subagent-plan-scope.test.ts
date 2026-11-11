/**
 * pageAgent 长任务分段与计划隔离回归。
 *
 * 现场问题：pageAgent 跑满约 1000 次循环仍不结束，且它调用的 task_plan/task_step
 * 会写入父会话唯一的 task_plan_json，导致外层业务计划被浏览器子计划覆盖。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('pageAgent 子计划作用域', () => {
  const LTM = read('apps/server/src/llm-task-manager.ts');

  it('每个子智能体调用都有按 parentToolCallId 隔离的计划槽位', () => {
    expect(LTM).toMatch(/subAgentPlans\?: Map<string, TaskPlan>/);
    expect(LTM).toContain('createInMemoryTaskPlanStore');
    expect(LTM).toContain('ownership?.parentToolCallId');
  });

  it('子智能体计划工具不回写父会话 task_plan_json', () => {
    const start = LTM.indexOf("const isPlanTool = !isMcp");
    const end = LTM.indexOf('if (task.subscribers.size > 0)', start);
    const block = LTM.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('planStore');
    expect(block).toContain("type: 'sub_agent:plan'");
    const scopedStart = block.indexOf('if (planStore && planScopeId)');
    const scopedEnd = block.indexOf('} else {', scopedStart);
    const scopedBranch = block.slice(scopedStart, scopedEnd);
    expect(scopedBranch).not.toContain("type: 'plan:updated'");
    expect(scopedBranch).not.toContain('persisted: true');
  });

  it('子任务检查点回注给模型，并在步骤边界触发上下文压缩', () => {
    expect(LTM).toContain('buildSubAgentPlanCheckpoint');
    expect(LTM).toContain('浏览器任务检查点');
    expect(LTM).toContain('subtaskBoundaryKey');
    expect(LTM).toMatch(/forceCompress:\s*forceSubtaskCompress/);
  });

  it('pageAgent 单次调用有明确步数边界，不能靠 1000 步硬跑', () => {
    const SHARED = read('packages/shared/src/page-agent.ts');
    const DB = read('apps/server/src/db.ts');
    const UI = read('packages/ui/src/stores/agent.ts');

    expect(SHARED).toContain('PAGE_AGENT_MAX_REACT_STEPS = 160');
    expect(SHARED).toContain('PAGE_AGENT_AUTO_CONTINUE_MAX_ROUNDS = 0');
    expect(DB).toContain('PAGE_AGENT_MAX_REACT_STEPS');
    expect(UI).toContain('PAGE_AGENT_MAX_REACT_STEPS');
  });

  it('pageAgent 提示词要求先规划、逐步推进并在断点返回阶段回执', () => {
    const DB = read('apps/server/src/db.ts');
    const SHARED = read('packages/shared/src/page-agent.ts');

    expect(DB).toContain('【浏览器子任务规划与检查点');
    expect(DB).toContain('每个子任务只对应一个可核验结果');
    expect(DB).toContain('浏览器阶段计划未完成');
    expect(SHARED).toContain('外层主智能体负责整条业务任务');
    expect(SHARED).toContain('pageAgent 只在本次委派内规划');
  });

  it('浏览器面板优先展示本次 pageAgent 子计划，不覆盖聊天区外层计划', () => {
    const CHAT = read('packages/ui/src/stores/chat.ts');
    const PANEL = read('packages/ui/src/components/BrowserPanel.vue');

    expect(CHAT).toContain("case 'sub_agent:plan'");
    expect(CHAT).toContain('browserSubPlansByConv');
    expect(CHAT).toContain('browserPlanSteps');
    expect(CHAT).toContain('browserPlanTitle');
    expect(PANEL).toContain('chatStore.browserPlanSteps');
    expect(PANEL).toContain('chatStore.browserPlanTitle');
  });
});
