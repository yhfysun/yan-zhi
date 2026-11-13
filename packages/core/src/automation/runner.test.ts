import { describe, expect, it, vi } from 'vitest';
import type { AutomationScriptDraft, AutomationStep } from '@yan-zhi/shared';
import {
  runAutomationScript,
  type AutomationStepAdapter,
  type AutomationStepExecution,
} from './runner';

function script(steps: AutomationStep[]): AutomationScriptDraft {
  return {
    schemaVersion: 1,
    name: '测试脚本',
    kind: 'browser',
    params: [
      {
        key: 'keyword',
        label: '关键词',
        type: 'string',
        required: true,
      },
    ],
    steps,
  };
}

describe('runAutomationScript', () => {
  it('按顺序执行步骤并插值 {{参数}}', async () => {
    const calls: Array<{ step: AutomationStep; params: Record<string, unknown> }> = [];
    const adapter: AutomationStepAdapter = {
      async execute(step, context): Promise<AutomationStepExecution> {
        calls.push({ step, params: context.params });
        return { output: { ok: true } };
      },
    };

    const result = await runAutomationScript(
      script([
        { id: 's1', type: 'browser.navigate', url: 'https://example.com/search?q={{keyword}}' },
        { id: 's2', type: 'browser.assertText', text: '{{keyword}}' },
      ]),
      { keyword: '报表' },
      { runId: 'run1', userId: 'guest', adapter },
    );

    expect(result.status).toBe('completed');
    expect(result.steps.map((s) => s.status)).toEqual(['completed', 'completed']);
    expect((calls[0].step as any).url).toBe('https://example.com/search?q=报表');
    expect((calls[1].step as any).text).toBe('报表');
  });

  it('步骤失败后停止后续执行并返回失败步骤', async () => {
    const execute = vi
      .fn<AutomationStepAdapter['execute']>()
      .mockResolvedValueOnce({ output: 'ok' })
      .mockRejectedValueOnce(new Error('元素未找到'));
    const adapter: AutomationStepAdapter = { execute };

    const result = await runAutomationScript(
      script([
        { id: 's1', type: 'browser.navigate', url: 'https://example.com' },
        { id: 's2', type: 'browser.click', target: { by: 'text', text: '不存在' } },
        { id: 's3', type: 'browser.assertText', text: '不会执行' },
      ]),
      {},
      { runId: 'run2', userId: 'guest', adapter },
    );

    expect(result.status).toBe('failed');
    expect(result.failedStepId).toBe('s2');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.steps[1].error).toContain('元素未找到');
  });

  it('取消信号在步骤边界生效', async () => {
    const controller = new AbortController();
    const execute = vi.fn<AutomationStepAdapter['execute']>().mockImplementation(async () => {
      controller.abort();
      return { output: 'ok' };
    });
    const adapter: AutomationStepAdapter = { execute };

    const result = await runAutomationScript(
      script([
        { id: 's1', type: 'browser.navigate', url: 'https://example.com' },
        { id: 's2', type: 'browser.assertText', text: '不会执行' },
      ]),
      {},
      { runId: 'run3', userId: 'guest', adapter, signal: controller.signal },
    );

    expect(result.status).toBe('cancelled');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
  });

  it('onStep 回调收到开始与结束事件', async () => {
    const events: string[] = [];
    const adapter: AutomationStepAdapter = {
      async execute() {
        return { output: 'ok' };
      },
    };

    await runAutomationScript(
      script([{ id: 's1', type: 'browser.navigate', url: 'https://example.com' }]),
      {},
      {
        runId: 'run4',
        userId: 'guest',
        adapter,
        onStep(event) {
          events.push(`${event.type}:${event.stepId}`);
        },
      },
    );

    expect(events).toEqual(['start:s1', 'finish:s1']);
  });
});
