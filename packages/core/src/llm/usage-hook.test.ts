import { describe, it, expect } from 'vitest';
import { withUsageHook, type UsageMeta } from './usage-hook.js';
import type { TokenUsageDetail } from '@yan-zhi/shared';

/**
 * 用量钩子的判据（2026-10-18）—— 每条都对应一种**真实会咬人**的故障：
 *
 * ① 一次调用只回调一次：流式路径 usage 会在多个 chunk 重复出现（网关实现各异），
 *    逐 chunk 回调 ⇒ 同一笔钱记两遍 ⇒ 金额翻倍且不报错。
 * ② 取最后一份 detail：三个协议都只在收敛帧（response.completed / message_delta /
 *    末 chunk）带完整 usage，中途帧可能是旧值。
 * ③ 中途抛错不回调：失败尝试（含故障转移前那次）没有可信 usage，
 *    估一笔钱出来只会污染阈值判据 —— 宁可漏一笔，不可错一笔。
 * ④ 回调自身抛错不炸流：记账是旁路，生成的现场比一笔钱更要紧。
 * ⑤ 不传回调零开销直通：主链路（连通性测试等不记账的调用）不受影响。
 */

const D = (inputTokens: number, outputTokens: number): TokenUsageDetail => ({
  inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens,
});

async function* chunksOf(items: any[]): AsyncIterable<any> {
  for (const it of items) yield it;
}

async function collect(iter: AsyncIterable<any>): Promise<any[]> {
  const out: any[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

const META: UsageMeta = { platformId: 'p1', modelId: 'mock-chat-v1' };

describe('withUsageHook：一次调用只回调一次', () => {
  it('多个 chunk 带 usage（含重复）⇒ 只回调一次，取最后一份', async () => {
    const calls: Array<{ d?: TokenUsageDetail; m: UsageMeta }> = [];
    const stream = withUsageHook(chunksOf([
      { delta: { content: 'a' } },
      { delta: { content: 'b' }, usage: { promptTokens: 10, detail: D(5, 1) } },
      { delta: { content: 'c' }, usage: { promptTokens: 10, detail: D(5, 1) } }, // 网关重发
      { delta: { content: 'd' }, usage: { promptTokens: 20, detail: D(15, 2) } }, // 末帧真值
    ]), (d, m) => calls.push({ d, m }), META);

    const out = await collect(stream);
    expect(out.length, 'chunk 必须原样透传').toBe(4);
    expect(calls.length, '★ 多次 usage 不得多次回调（重复计费）').toBe(1);
    expect(calls[0].d).toEqual(D(15, 2));
    expect(calls[0].m).toEqual(META);
  });

  it('整条流没有 usage ⇒ 回调一次且 detail 为 undefined（调用方走估算）', async () => {
    const calls: any[] = [];
    await collect(withUsageHook(chunksOf([{ delta: { content: 'a' } }]), (d) => calls.push(d), META));
    expect(calls).toEqual([undefined]);
  });

  it('usage 在但没有 detail（旧端点）⇒ 同样按缺失处理', async () => {
    const calls: any[] = [];
    await collect(withUsageHook(chunksOf([{ usage: { promptTokens: 10 } }]), (d) => calls.push(d), META));
    expect(calls).toEqual([undefined]);
  });
});

describe('withUsageHook：失败尝试不回调', () => {
  it('流中途抛错 ⇒ 不回调（错误原样向上抛）', async () => {
    const calls: any[] = [];
    async function* boom(): AsyncIterable<any> {
      yield { delta: { content: '半个字' }, usage: { detail: D(1, 1) } };
      throw new Error('上游掐断');
    }
    await expect(collect(withUsageHook(boom(), (d) => calls.push(d), META))).rejects.toThrow('上游掐断');
    expect(calls.length, '★ 失败Attempt不得记账（无可信 usage）').toBe(0);
  });
});

describe('withUsageHook：旁路隔离', () => {
  it('回调自身抛错 ⇒ 不炸流（chunk 全部透传）', async () => {
    const stream = withUsageHook(
      chunksOf([{ delta: { content: 'a' }, usage: { detail: D(1, 1) } }, { delta: { content: 'b' } }]),
      () => { throw new Error('账本写不进去'); },
      META,
    );
    const out = await collect(stream);
    expect(out.length).toBe(2);
  });

  it('不传回调 ⇒ 零开销直通（内容逐字不变）', async () => {
    const out = await collect(withUsageHook(chunksOf([{ delta: { content: 'x' } }, { delta: { content: 'y' } }]), undefined, META));
    expect(out.map((c) => c.delta.content).join('')).toBe('xy');
  });
});
