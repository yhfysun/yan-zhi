// 浏览器操作「会话级串行」——回归测试（2026-10-09）。
//
// 背景（真缺陷）：浏览器是**单活动页状态机**（前端每 scope 单值 / 主进程 activeTabId 全局单值 /
// 服务端 Playwright 进程级单值）。同一会话里多个 pageAgent 或一批并发 browser_* 同时操作会互相抢页，
// 表现为「多个 pageAgent 只有一个在动 / 结果错乱」。会话级串行是修复手段。
//
// 这里钉住四件事：
//   1) 同一会话的操作**严格按序**（后一个不抢跑）；
//   2) 不同会话**互不阻塞**（隔离粒度 = 会话，与 scope/锚定 tab 口径一致）；
//   3) 前一个**失败也放行**（不卡死整条链）；
//   4) 无 convId 时**不串行**（退化旧行为，不制造无主队列）。

import { describe, it, expect } from 'vitest';
import { chainBrowserOp, dropBrowserOpChain, type BrowserOpChains } from './browser-op-queue';

const tick = () => new Promise((r) => setTimeout(r, 5));

function makeDeferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { p, resolve, reject };
}

describe('chainBrowserOp · 会话级串行', () => {
  it('★ 同一会话：严格按序，后一个不抢跑', async () => {
    const chains: BrowserOpChains = new Map();
    const order: string[] = [];
    const gate = makeDeferred();

    const p1 = chainBrowserOp(chains, 'convA', async () => { order.push('a1:start'); await gate.p; order.push('a1:end'); });
    const p2 = chainBrowserOp(chains, 'convA', async () => { order.push('a2:start'); order.push('a2:end'); });

    await tick();
    expect(order).toEqual(['a1:start']); // a2 必须等 a1，尚未开始
    gate.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['a1:start', 'a1:end', 'a2:start', 'a2:end']);
  });

  it('★ 不同会话：互不阻塞（隔离粒度 = 会话）', async () => {
    const chains: BrowserOpChains = new Map();
    const order: string[] = [];
    const holdA = makeDeferred();

    const pa = chainBrowserOp(chains, 'convA', async () => { order.push('A:start'); await holdA.p; order.push('A:end'); });
    const pb = chainBrowserOp(chains, 'convB', async () => { order.push('B:run'); });

    await pb; // B 不应被 A 挡住
    expect(order).toContain('B:run');
    expect(order).not.toContain('A:end');
    holdA.resolve();
    await pa;
    expect(order).toEqual(['A:start', 'B:run', 'A:end']);
  });

  it('★ 前一个失败也放行（不卡死整条链）', async () => {
    const chains: BrowserOpChains = new Map();
    const order: string[] = [];

    const p1 = chainBrowserOp(chains, 'convA', async () => { throw new Error('boom'); });
    const p2 = chainBrowserOp(chains, 'convA', async () => { order.push('after-fail'); });

    await expect(p1).rejects.toThrow('boom');
    await p2;
    expect(order).toEqual(['after-fail']);
  });

  it('失败不会变成 unhandledRejection（链尾吞错）', async () => {
    const chains: BrowserOpChains = new Map();
    await chainBrowserOp(chains, 'convA', async () => { throw new Error('x'); }).catch(() => {});
    // 链尾必须是「已解决」的 promise，后续排队者才能安全接上
    await expect(chains.get('convA')).resolves.toBeUndefined();
  });

  it('★ 无 convId：不串行（直接执行，不制造无主队列）', async () => {
    const chains: BrowserOpChains = new Map();
    const order: string[] = [];
    const gate = makeDeferred();

    const p1 = chainBrowserOp(chains, undefined, async () => { order.push('1:start'); await gate.p; });
    const p2 = chainBrowserOp(chains, undefined, async () => { order.push('2:run'); });

    await p2; // 第二个不该被第一个挡住
    expect(order).toEqual(['1:start', '2:run']);
    expect(chains.size).toBe(0); // 没有建任何键
    gate.resolve();
    await p1;
  });

  it('dropBrowserOpChain：会话清理由此清理，不接新活', async () => {
    const chains: BrowserOpChains = new Map();
    await chainBrowserOp(chains, 'convA', async () => {});
    expect(chains.has('convA')).toBe(true);
    dropBrowserOpChain(chains, 'convA');
    expect(chains.has('convA')).toBe(false);
  });
});