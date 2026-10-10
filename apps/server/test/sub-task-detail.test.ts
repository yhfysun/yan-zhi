/**
 * 子任务执行详情单测（2026-10-09）。
 * 锁 formatSubTaskTrace 的排版契约：指令行/调用行/结果合并/截断/封顶。
 */
import { describe, it, expect } from 'vitest';
import { formatSubTaskTrace, type SubTaskTraceRow } from '../src/services/sub-task-detail.js';

function row(partial: Partial<SubTaskTraceRow> & { id: string; role: string }): SubTaskTraceRow {
  return { content: null, toolCallsJson: null, toolCallId: null, subAgentName: null, createdAt: 0, ...partial };
}

describe('formatSubTaskTrace 子任务执行轨迹排版', () => {
  it('完整链路：指令 → 调用 → 结果合并到同一行 → 最终回复', () => {
    const rows: SubTaskTraceRow[] = [
      row({ id: 'm1', role: 'user', content: '去抖音找置顶入口', subAgentName: '浏览器操作助手' }),
      row({ id: 'm2', role: 'assistant', toolCallsJson: JSON.stringify([{ id: 'c1', function: { name: 'browser_run_script', arguments: { script: 'document.querySelector("...").click()' } } }]) }),
      row({ id: 'm3', role: 'tool', content: 'Executed in page. Result: null' }),
      row({ id: 'm4', role: 'assistant', content: '结论：PC 网页版无置顶入口' }),
    ];
    const out = formatSubTaskTrace(rows);
    expect(out).toContain('浏览器操作助手');
    expect(out).toContain('[任务指令] 去抖音找置顶入口');
    expect(out).toContain('#1 [调用] browser_run_script(script=document.querySelector("...").click())');
    // 工具结果合并进调用行
    expect(out).toContain('#1 [调用] browser_run_script(script=document.querySelector("...").click()) → Executed in page. Result: null');
    expect(out).toContain('[assistant] 结论：PC 网页版无置顶入口');
    expect(out).toContain('共 1 步');
  });

  it('超长内容按上限截断并带省略标记', () => {
    const rows: SubTaskTraceRow[] = [
      row({ id: 'm1', role: 'user', content: 'x'.repeat(2000) }),
    ];
    const out = formatSubTaskTrace(rows);
    expect(out.length).toBeLessThan(1000);
    expect(out).toContain('…');
  });

  it('maxSteps 截断：保留最近步骤，前段标省略', () => {
    const rows: SubTaskTraceRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(row({ id: `a${i}`, role: 'assistant', toolCallsJson: JSON.stringify([{ id: `c${i}`, function: { name: 'browser_click', arguments: { selector: `#btn${i}` } } }]) }));
      rows.push(row({ id: `t${i}`, role: 'tool', content: `result ${i}` }));
    }
    const out = formatSubTaskTrace(rows, 4);
    expect(out).toContain('前段步骤已截断');
    expect(out).toContain('#10');
    expect(out).not.toContain('#1 [调用]');
  });

  it('空消息流返回空串（runId 无记录场景由调用方兜底文案）', () => {
    expect(formatSubTaskTrace([])).toBe('');
  });

  it('损坏的 tool_calls_json 不抛错，按无调用处理', () => {
    const rows: SubTaskTraceRow[] = [
      row({ id: 'm1', role: 'assistant', toolCallsJson: '{broken json' }),
      row({ id: 'm2', role: 'assistant', content: 'done' }),
    ];
    const out = formatSubTaskTrace(rows);
    expect(out).toContain('[assistant] done');
    expect(out).not.toContain('[调用]');
  });
});