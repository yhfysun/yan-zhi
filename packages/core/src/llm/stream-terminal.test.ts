/**
 * parseSSE 流收尾判定（2026-10-09，P0 实据修复）。
 *
 * 背景：上游/代理常用 TCP FIN 半途关闭 SSE，此时 `reader.read()` 是**正常 resolve**（不抛错）。
 *   旧实现只看 `done` 就结束 → 半截流被当成正常收尾：content 空、reasoning 一半，
 *   调用方却 emit task:completed（实测库内 12 条 assistant 记录正是此形状）。
 *
 * 本测试钉住：**见到 finish_reason 或 [DONE] 才算收尾（terminated:true）；
 *   二者皆无的"正常结束"必须标 terminated:false**，供上层走续写/报错而不是当完成。
 */
import { describe, it, expect } from 'vitest';
import { parseSSE } from './stream';

function streamOf(s: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode(s)); c.close(); },
  });
}

/** 逐行拼 SSE 帧 */
function frames(lines: string[]): string {
  return lines.join('\n');
}

describe('parseSSE 收尾判定（terminated）', () => {
  it('见到 finish_reason 的帧 → 末帧 terminated:true', async () => {
    const s = streamOf(frames([
      'data: {"choices":[{"delta":{"content":"你好"}}]}',
      '',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      '',
    ]));
    const chunks = [];
    for await (const c of parseSSE(s)) chunks.push(c);
    expect(chunks.at(-1), '★ 有 finish_reason 却判未收尾').toEqual({ terminated: true });
  });

  it('见到 data: [DONE] → 末帧 terminated:true', async () => {
    const s = streamOf(frames([
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      '',
      'data: [DONE]',
      '',
    ]));
    const chunks = [];
    for await (const c of parseSSE(s)) chunks.push(c);
    expect(chunks.at(-1)).toEqual({ terminated: true });
  });

  it('★★ 流正常结束但既无 finish_reason 也无 [DONE] → terminated:false（=被掐断）', async () => {
    // 这正是"卡死"的形状：reasoning 吐到一半，代理 FIN 关流
    const s = streamOf(frames([
      'data: {"choices":[{"delta":{"reasoning_content":"I have the full source above"}}]}',
      '',
    ]));
    const chunks = [];
    for await (const c of parseSSE(s)) chunks.push(c);
    expect(chunks.at(-1), '★ 半截流（无终态）被判成了正常收尾 —— 这正是"卡死"的根因')
      .toEqual({ terminated: false });
  });

  it('内容分片照常透传（新增末帧不破坏既有解析）', async () => {
    const s = streamOf(frames([
      'data: {"choices":[{"delta":{"content":"A"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"B"}}]}',
      '',
      'data: [DONE]',
      '',
    ]));
    const chunks = [];
    for await (const c of parseSSE(s)) chunks.push(c);
    const text = chunks.map((c: any) => c.delta?.content || '').join('');
    expect(text).toBe('AB');
    expect(chunks.at(-1)).toEqual({ terminated: true });
  });

  it('tool_calls 终态同样算收尾（finish_reason=tool_calls）', async () => {
    const s = streamOf(frames([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"t1","function":{"name":"file_read","arguments":"{}"}}]}}]}',
      '',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
      '',
    ]));
    const chunks = [];
    for await (const c of parseSSE(s)) chunks.push(c);
    expect(chunks.at(-1)).toEqual({ terminated: true });
  });
});