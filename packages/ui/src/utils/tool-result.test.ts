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
import { parseToolResultContent, parseToolResultContentCached, buildToolResultIndex } from './tool-result';

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

  it('★ content 是字符串而非数组（2026-10-21 白屏回归）→ 原字符串即展示文本，不再抛错', () => {
    // 现场脏数据形态：{"content":"- [2026-10-14] 📌铁律 | …"} —— 旧代码 `"xxx".length` 为真
    // 走 .filter 直接 TypeError ⇒ toolResultIndex computed 首求值抛错 ⇒ .value 恒 undefined
    // ⇒ isToolResultDone "reading 'has'" ⇒ 渲染树整棵挂 = 白屏。
    const raw = JSON.stringify({ content: '- [2026-10-14] 📌铁律 | 抖音发布页不存草稿' });
    expect(parseToolResultContent(raw)).toEqual({
      content: '- [2026-10-14] 📌铁律 | 抖音发布页不存草稿',
      isError: false,
    });
    // 非数组对象 content 同样不抛，落到 stringify 分支
    const obj = parseToolResultContent(JSON.stringify({ content: { a: 1 } }));
    expect(obj.isError).toBe(false);
    expect(typeof obj.content).toBe('string');
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

describe('parseToolResultContentCached（每帧重建的解析缓存，Task #9）', () => {
  it('命中缓存：同一 raw 串返回同一对象引用（零重复解析）', () => {
    const raw = JSON.stringify({ content: [{ type: 'text', text: 'cached' }] });
    const a = parseToolResultContentCached(raw);
    const b = parseToolResultContentCached(raw);
    expect(a).toBe(b); // 引用相等 ⇒ 命中
    expect(a.content).toBe('cached');
  });

  it('空值直通不进缓存', () => {
    expect(parseToolResultContentCached('')).toEqual({ content: null, isError: false });
    expect(parseToolResultContentCached(null)).toEqual({ content: null, isError: false });
    expect(parseToolResultContentCached(undefined)).toEqual({ content: null, isError: false });
  });

  it('与无缓存版语义一致（逐分支抽查）', () => {
    const samples = [
      '这不是 JSON{',
      JSON.stringify({ isError: true, content: [{ type: 'text', text: 'boom' }] }),
      JSON.stringify({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }),
      JSON.stringify({ content: [{ type: 'image', url: 'x' }] }),
      JSON.stringify({ foo: 1 }),
      '"纯字符串"',
    ];
    for (const s of samples) {
      expect(parseToolResultContentCached(s)).toEqual(parseToolResultContent(s));
    }
  });
});
