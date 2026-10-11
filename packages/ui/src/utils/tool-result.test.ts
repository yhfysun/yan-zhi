// 工具结果解析 + 索引的守门测试 —— 防 2026-10-11 卡顿修复的语义回归。
//
// 背景：`getToolResult` / `isToolError` 原为「每次调用都 find() 全表 + JSON.parse」，
//   被模板高频调用（每帧数百次）⇒ 任务运行时页面卡死。
//   修法：一次遍历建 `callId -> {content,isError}` 索引（`buildToolResultIndex`），
//   热函数降为 O(1)。**索引结果必须与旧实现逐条一致**，否则会改变 UI 显示。
//
// 本测试两类：
//   ① 纯函数等价性 —— `parseToolResultContent` 覆盖旧 `getToolResult`/`isToolError` 的所有分支
//   ② 索引行为 —— 首个优先 / 跳过非 tool / 跳过无 id

import { describe, it, expect } from 'vitest';
import { parseToolResultContent, buildToolResultIndex } from './tool-result';

describe('parseToolResultContent（分支等价性）', () => {
  it('空 / null / undefined → content=null, isError=false', () => {
    expect(parseToolResultContent('')).toEqual({ content: null, isError: false });
    expect(parseToolResultContent(null)).toEqual({ content: null, isError: false });
    expect(parseToolResultContent(undefined)).toEqual({ content: null, isError: false });
  });

  it('★ 非法 JSON → 原样返回 content，isError=false（旧 catch 分支）', () => {
    const raw = '这不是 JSON{';
    expect(parseToolResultContent(raw)).toEqual({ content: raw, isError: false });
  });

  it('★ isError=true → stringify(parsed, 2) 且 isError=true', () => {
    const parsed = { isError: true, content: [{ type: 'text', text: 'boom' }] };
    const r = parseToolResultContent(JSON.stringify(parsed));
    expect(r.isError).toBe(true);
    expect(r.content).toBe(JSON.stringify(parsed, null, 2));
  });

  it('★ content 有 text 块 → 各 text 以 \\n 连接', () => {
    const parsed = { content: [{ type: 'text', text: '第一行' }, { type: 'text', text: '第二行' }] };
    expect(parseToolResultContent(JSON.stringify(parsed))).toEqual({ content: '第一行\n第二行', isError: false });
  });

  it('★ 有 content 但无 text 块 → 回退整个 JSON 串', () => {
    const parsed = { content: [{ type: 'image', url: 'x' }] };
    const r = parseToolResultContent(JSON.stringify(parsed));
    expect(r.isError).toBe(false);
    expect(r.content).toBe(JSON.stringify(parsed, null, 2));
  });

  it('★ parsed 是 JSON 字符串（"\\"hello\\""）→ 返回该字符串本身', () => {
    expect(parseToolResultContent(JSON.stringify('hello'))).toEqual({ content: 'hello', isError: false });
  });

  it('★ 其它对象 → stringify(parsed, 2)', () => {
    const parsed = { foo: 1, bar: [1, 2] };
    expect(parseToolResultContent(JSON.stringify(parsed))).toEqual({
      content: JSON.stringify(parsed, null, 2),
      isError: false,
    });
  });

  it('数字 / 布尔等标量 JSON → stringify', () => {
    expect(parseToolResultContent('42')).toEqual({ content: '42', isError: false });
  });
});

describe('buildToolResultIndex（索引行为）', () => {
  const mk = (over: any) => ({ role: 'tool', toolCallId: 'c1', content: '{}', ...over });

  it('按 toolCallId 建索引', () => {
    const idx = buildToolResultIndex([
      mk({ toolCallId: 'c1', content: JSON.stringify({ content: [{ type: 'text', text: 'A' }] }) }),
      mk({ toolCallId: 'c2', content: JSON.stringify({ content: [{ type: 'text', text: 'B' }] }) }),
    ]);
    expect(idx.get('c1')!.content).toBe('A');
    expect(idx.get('c2')!.content).toBe('B');
  });

  it('★ 跳过非 tool 角色（不污染索引）', () => {
    const idx = buildToolResultIndex([
      { role: 'assistant', toolCallId: 'x', content: '{}' } as any,
      mk({ toolCallId: 'c1' }),
    ]);
    expect(idx.has('x')).toBe(false);
    expect(idx.has('c1')).toBe(true);
  });

  it('★ 跳过没有 toolCallId 的消息', () => {
    const idx = buildToolResultIndex([mk({ toolCallId: undefined })]);
    expect(idx.size).toBe(0);
  });

  it('★ 同 id 重复 → 保留首个（与 Array.find 语义一致）', () => {
    const idx = buildToolResultIndex([
      mk({ toolCallId: 'dup', content: JSON.stringify({ content: [{ type: 'text', text: 'FIRST' }] }) }),
      mk({ toolCallId: 'dup', content: JSON.stringify({ content: [{ type: 'text', text: 'SECOND' }] }) }),
    ]);
    expect(idx.get('dup')!.content).toBe('FIRST');
  });

  it('★ isError 单独可查（供 isToolError 用）', () => {
    const idx = buildToolResultIndex([
      mk({ toolCallId: 'ok', content: JSON.stringify({ content: [{ type: 'text', text: 'fine' }] }) }),
      mk({ toolCallId: 'bad', content: JSON.stringify({ isError: true, content: [] }) }),
    ]);
    expect(idx.get('ok')!.isError).toBe(false);
    expect(idx.get('bad')!.isError).toBe(true);
  });

  it('★ 空 content → content=null（模板据此显示 running 态）', () => {
    const idx = buildToolResultIndex([mk({ toolCallId: 'empty', content: '' })]);
    expect(idx.get('empty')).toEqual({ content: null, isError: false });
  });
});
