/**
 * 工作流引擎「显式并行分支」测试（2026-10-08）。
 *
 * 语义（用户口径）：不是"所有节点都并行"，而是**图上明确画出的分支**并行 ——
 * 一个节点 fan-out 到多个子节点时它们同时跑，跑完汇合给下游 join 节点。
 *
 * 守住：
 *   1) concurrency>1：fan-out 的两个分支**真的同时执行**（用会合点证明，而非只看结果）；
 *   2) 有依赖的 join 节点等两个分支都完成才跑（不抢跑）；
 *   3) condition 的 true/false 互斥分支不会让 join 死锁（未走的分支不阻塞）；
 *   4) concurrency=1（默认）仍严格串行、顺序不变。
 */
import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from './engine.js';

/** 会合点：两个分支各自"报到"，并等对方报到 —— 只有真并发才会同时满足 */
function makeRendezvous() {
  let sigB!: () => void, sigC!: () => void;
  const bArrived = new Promise<void>((r) => { sigB = r; });
  const cArrived = new Promise<void>((r) => { sigC = r; });
  return { signalB: sigB, signalC: sigC, waitB: bArrived, waitC: cArrived };
}
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('超时：分支未并发')), ms))]);

function mkAgent(nodes: Array<{ id: string; type?: string }>, edges: Array<[string, string, string?]>) {
  return {
    id: 'agent_par',
    workflow: {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type || 'test', config: { id: n.id } })),
      edges: edges.map(([source, target, sourceHandle]) => ({ source, target, ...(sourceHandle ? { sourceHandle } : {}) })),
    },
  } as any;
}

describe('引擎 · 显式并行分支', () => {
  it('fan-out 两分支真并发（会合点证明），join 等齐后才跑', async () => {
    const eng = new WorkflowEngine();
    const done: string[] = [];
    const rdv = makeRendezvous();
    const t0 = Date.now();
    const times: Record<string, number> = {};

    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>) {
        const id = String(config.id);
        times[id] = Date.now() - t0;
        if (id === 'b') { rdv.signalB(); await withTimeout(rdv.waitC, 2000); }
        if (id === 'c') { rdv.signalC(); await withTimeout(rdv.waitB, 2000); }
        done.push(id);
        return { output: id };
      },
    });

    // a → (b, c) → d
    const agent = mkAgent([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
    await eng.run(agent, {}, { concurrency: 4 });

    expect(done[0]).toBe('a');           // 入口先跑
    expect(done[done.length - 1]).toBe('d'); // join 最后
    expect(new Set(done)).toEqual(new Set(['a', 'b', 'c', 'd']));
    // b、c 的开始时间差应远小于它们的执行时长（>0 的会合等待）→ 证明并发
    expect(Math.abs(times.b - times.c)).toBeLessThan(500);
  });

  it('condition 互斥分支 + 汇合不死锁（未走的分支不阻塞 join）', async () => {
    const eng = new WorkflowEngine();
    const done: string[] = [];
    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>) {
        done.push(String(config.id));
        // a 输出 matched=false → 只走 false 分支
        if (config.id === 'cond') return { output: { matched: false } };
        return { output: config.id };
      },
    });

    // a → cond --true--> bt --> jx ; cond --false--> bf --> jx
    const agent = mkAgent(
      [{ id: 'a' }, { id: 'cond' }, { id: 'bt' }, { id: 'bf' }, { id: 'jx' }],
      [['a', 'cond'], ['cond', 'bt', 'true'], ['cond', 'bf', 'false'], ['bt', 'jx'], ['bf', 'jx']],
    );
    const res = await eng.run(agent, {}, { concurrency: 4 });

    expect(done).toContain('bf');       // 走了 false 分支
    expect(done).not.toContain('bt');   // true 分支没走
    expect(done[done.length - 1]).toBe('jx'); // join 仍然跑到了（没死锁）
    expect(res).toEqual({}); // 没有 output 节点
  });

  it('concurrency=1（默认）：严格串行、顺序不变', async () => {
    const eng = new WorkflowEngine();
    const done: string[] = [];
    eng.register({
      type: 'test',
      async execute(config: Record<string, unknown>) { done.push(String(config.id)); return { output: config.id }; },
    });
    // 线性链：顺序必须 a,b,c
    await eng.run(mkAgent([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [['a', 'b'], ['b', 'c']]), {});
    expect(done).toEqual(['a', 'b', 'c']);
  });
});