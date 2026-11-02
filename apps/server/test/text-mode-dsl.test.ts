/**
 * 文本模式降级（P5.2）：DSL 走 [TOOL_CALL]，arguments 支持嵌套对象/数组。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTextModeToolCalls } from '../src/llm-task-manager.js';

const SRC = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');

describe('文本模式工具调用', () => {
  it('嵌套 intent 原样解析（数据查询 DSL）', () => {
    const r = parseTextModeToolCalls(
      '先查一下。\n[TOOL_CALL]{"name":"api_data_query","arguments":{"ontology":"orders","intent":{"dimensions":["region"],"measures":[{"name":"amount","agg":"sum"}],"limit":10}}}[/TOOL_CALL]',
    );
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('api_data_query');
    const args = JSON.parse(r.toolCalls[0].arguments);
    expect(args.intent).toMatchObject({
      dimensions: ['region'],
      measures: [{ name: 'amount', agg: 'sum' }],
      limit: 10,
    });
    expect(r.cleanedContent).not.toContain('[TOOL_CALL]');
  });

  it('多次调用与嵌套数组', () => {
    const r = parseTextModeToolCalls(
      '[TOOL_CALL]{"name":"a","arguments":{"rows":[[1,2],[3,4]]}}[/TOOL_CALL] [TOOL_CALL]{"name":"b","arguments":{"x":{"y":{"z":1}}}}[/TOOL_CALL]',
    );
    expect(r.toolCalls.map((t) => t.name)).toEqual(['a', 'b']);
    expect(JSON.parse(r.toolCalls[0].arguments).rows).toEqual([[1, 2], [3, 4]]);
  });

  it('文本模式提示词包含嵌套参数示例（两处注入同口径）', () => {
    expect(SRC).toContain('TEXT_MODE_NESTED_HINT');
    // 所有文本模式注入点都应引用同一常量（主循环 + 子智能体）
    expect((SRC.match(/\$\{TEXT_MODE_NESTED_HINT\}/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(SRC).toContain('api_data_query');
  });
});
