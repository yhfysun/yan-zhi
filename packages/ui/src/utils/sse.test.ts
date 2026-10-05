import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractSsePayloads, parseSseJson, consumeSseStream } from './sse';

describe('extractSsePayloads', () => {
  it('完整帧 → 抽出 data 载荷，rest 为空', () => {
    const r = extractSsePayloads('data: {"type":"chunk"}\n\n');
    expect(r.payloads).toEqual(['{"type":"chunk"}']);
    expect(r.rest).toBe('');
  });

  it('跨 chunk 粘包：多帧一次抽出，不完整帧留在 rest', () => {
    const r = extractSsePayloads('data: a\n\ndata: b\n\ndata: c');
    expect(r.payloads).toEqual(['a', 'b']);
    expect(r.rest).toBe('data: c');
  });

  it('帧内多行：取第一条 data: 行，忽略其他字段行', () => {
    const r = extractSsePayloads('event: message\ndata: hello\nid: 1\n\n');
    expect(r.payloads).toEqual(['hello']);
  });

  it('注释帧（:connected 等）不投递', () => {
    const r = extractSsePayloads('data: :connected\n\ndata: real\n\n');
    expect(r.payloads).toEqual(['real']);
  });

  it('无 data 行的帧跳过；payload 裁剪首尾空白', () => {
    const r = extractSsePayloads('event: ping\n\ndata:   spaced  \n\n');
    expect(r.payloads).toEqual(['spaced']);
  });

  it('base64 载荷不受 trim 影响（前后无空白原样返回）', () => {
    const b64 = 'aGVsbG8=';
    const r = extractSsePayloads(`data: ${b64}\n\n`);
    expect(r.payloads).toEqual([b64]);
  });
});

describe('parseSseJson', () => {
  it('合法 JSON 解析成功', () => {
    expect(parseSseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it('非法 JSON 返回 null 不抛错', () => {
    expect(parseSseJson('not-json')).toBeNull();
  });
});

/**
 * consumeSseStream 的停止契约 —— 2026-10-04 的真实事故回归测试。
 *
 * 事故：聊天主链路把 `task:completed` 的事件处理器写成裸 `return`（= undefined），
 * 而本函数的契约是「回调返回 **false** 才停止读取」。服务端 sseStream 从不 res.end()，
 * 于是流永久挂起 → 回调所在的 await 链不返回 → 上层 finally 不清理运行态 →
 * 表现为「回答已完整输出却一直显示『任务运行中』」。
 *
 * 这两条用例把契约钉死：返回 false 必须停止（且不投递后续帧），返回 undefined 必须继续。
 */
describe('consumeSseStream 停止契约', () => {
  /** 构造一个把所有帧一次性推入、且**永不 close** 的流（复刻服务端不 res.end() 的行为） */
  function neverClosingStream(frames: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(enc.encode(f));
        // 刻意不调用 controller.close()
      },
    });
  }

  it('回调返回 false → 立即停止读取并正常返回（流永不 close 也不会挂起）', async () => {
    const delivered: string[] = [];
    const stream = neverClosingStream(['data: A\n\n', 'data: B\n\n']);
    // 500ms 守卫：若契约被破坏（流挂起），本用例应当失败而不是永久卡住
    const done = await Promise.race([
      consumeSseStream(stream, (p) => { delivered.push(p); return false; }).then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('timeout'), 500)),
    ]);
    expect(done).toBe('resolved');
    // 停止后不得再投递后续帧
    expect(delivered).toEqual(['A']);
  });

  it('回调返回 undefined/false 混用 → 仅 false 触发停止，undefined 继续投递', async () => {
    const delivered: string[] = [];
    const stream = neverClosingStream(['data: A\n\n', 'data: B\n\n', 'data: STOP\n\n', 'data: C\n\n']);
    const done = await Promise.race([
      consumeSseStream(stream, (p) => {
        delivered.push(p);
        return p === 'STOP' ? false : undefined;
      }).then(() => 'resolved'),
      new Promise<string>((r) => setTimeout(() => r('timeout'), 500)),
    ]);
    expect(done).toBe('resolved');
    // A、B 继续投递；STOP 停止；C 不再投递
    expect(delivered).toEqual(['A', 'B', 'STOP']);
  });
});

/**
 * 调用点守门：聊天主链路的收尾事件必须满足上面的契约。
 * 读源码断言成本极低，且能钉死「谁把 return false 改回裸 return」这类静默回归
 * （与 taskScopedStateAndMobileTouch.test.ts 同一约定）。
 */
describe('聊天主链路 SSE 收尾事件守门', () => {
  const CHAT_STORE = readFileSync(resolve(__dirname, '../stores/chat.ts'), 'utf8');

  it('task:completed / task:aborted 处理器返回 false（裸 return 会让流永久挂起）', () => {
    for (const evt of ['task:completed', 'task:aborted']) {
      const line = CHAT_STORE.match(new RegExp(`case '${evt}':[^\\n]*`))?.[0] || '';
      expect(line, `未找到 ${evt} 处理器`).not.toBe('');
      expect(line, `${evt} 必须 return false —— 裸 return(=undefined) 不满足停止契约`).toContain('return false');
    }
  });
});
