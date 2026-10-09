/**
 * 子任务执行详情单测（2026-10-09）。
 * 锁 formatSubTaskTrace 的排版契约：指令行/调用行/结果合并/截断/封顶。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.ok(out.includes('浏览器操作助手'));
    assert.ok(out.includes('[任务指令] 去抖音找置顶入口'));
    assert.ok(out.includes('#1 [调用] browser_run_script(script=document.querySelector("...").click())'));
    // 工具结果合并进调用行
    assert.ok(out.includes('#1 [调用] browser_run_script(script=document.querySelector("...").click()) → Executed in page. Result: null'));
    assert.ok(out.includes('[assistant] 结论：PC 网页版无置顶入口'));
    assert.ok(out.includes('共 1 步'));
  });

  it('超长内容按上限截断并带省略标记', () => {
    const rows: SubTaskTraceRow[] = [
      row({ id: 'm1', role: 'user', content: 'x'.repeat(2000) }),
    ];
    const out = formatSubTaskTrace(rows);
    assert.ok(out.length < 1000);
    assert.ok(out.includes('…'));
  });

  it('maxSteps 截断：保留最近步骤，前段标省略', () => {
    const rows: SubTaskTraceRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(row({ id: `a${i}`, role: 'assistant', toolCallsJson: JSON.stringify([{ id: `c${i}`, function: { name: 'browser_click', arguments: { selector: `#btn${i}` } } }]) }));
      rows.push(row({ id: `t${i}`, role: 'tool', content: `result ${i}` }));
    }
    const out = formatSubTaskTrace(rows, 4);
    assert.ok(out.includes('前段步骤已截断'));
    assert.ok(out.includes('#10'));
    assert.ok(!out.includes('#1 [调用]'));
  });

  it('空消息流返回空串（runId 无记录场景由调用方兜底文案）', () => {
    assert.equal(formatSubTaskTrace([]), '');
  });

  it('损坏的 tool_calls_json 不抛错，按无调用处理', () => {
    const rows: SubTaskTraceRow[] = [
      row({ id: 'm1', role: 'assistant', toolCallsJson: '{broken json' }),
      row({ id: 'm2', role: 'assistant', content: 'done' }),
    ];
    const out = formatSubTaskTrace(rows);
    assert.ok(out.includes('[assistant] done'));
    assert.ok(!out.includes('[调用]'));
  });
});
