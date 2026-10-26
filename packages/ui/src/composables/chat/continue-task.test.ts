// 「新任务继续」预填文案的守门测试。
//
// 背景（2026-10-24）：右键「新任务继续」只把「从哪断的」带进首条消息，
// 属性靠会话字段继承。这里断言两件事：① 有计划时能说清已完成/未完成与接续点；
// ② 没计划时也给出可用的接续说明（不产出空消息）。

import { describe, it, expect } from 'vitest';
import { formatContinueTaskPrefill } from './continue-task';

describe('formatContinueTaskPrefill', () => {
  it('有计划时列出已完成 / 未完成，并从第一个未完成步骤接着做', () => {
    const text = formatContinueTaskPrefill({
      title: '抖音账号定位',
      taskType: 'douyin_traffic',
      taskPlan: {
        title: '抖音引流',
        steps: [
          { id: '1', title: '账号与人群定位', status: 'done' },
          { id: '2', title: '风口选题', status: 'done' },
          { id: '3', title: '出内容', status: 'pending' },
          { id: '4', title: '发布执行', status: 'failed' },
        ],
      },
    });
    expect(text).toContain('接续自任务《抖音账号定位》（抖音引流）');
    expect(text).toContain('已完成：账号与人群定位、风口选题');
    expect(text).toContain('未完成：出内容、发布执行');
    expect(text).toContain('请从「出内容」继续');
  });

  it('没计划时给出通用接续说明，不产出空文案', () => {
    const text = formatContinueTaskPrefill({ title: '一个任务', taskPlan: null });
    expect(text).toContain('《一个任务》');
    expect(text).toContain('请继续这个任务未完成的工作');
    expect(text.trim().length).toBeGreaterThan(10);
  });

  it('计划已全部完成时提示按新要求继续，而不是硬说「未完成」', () => {
    const text = formatContinueTaskPrefill({
      title: 'X',
      taskPlan: { title: 'X', steps: [{ id: '1', title: 'a', status: 'done' }] },
    });
    expect(text).toContain('计划已全部走完');
    expect(text).not.toContain('未完成：');
  });

  it('标题为空时用兜底称呼，不出现《》空壳', () => {
    const text = formatContinueTaskPrefill({ title: '   ' });
    expect(text).toContain('《上一个任务》');
  });
});
