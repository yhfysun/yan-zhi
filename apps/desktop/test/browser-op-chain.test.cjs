/**
 * 桥路径「同 tab 动作串行」行为测试（2026-10-14）。
 *
 * ★ 为什么必须是行为测试而不是源码断言：这里防的两件事 —— **串行顺序**、**排队上限放行** ——
 *   都是运行时语义，源码里看着对、跑起来不对是完全可能的（尤其"链尾上限"这种 Promise 竞速）。
 *   主进程 main.cjs 需要 Electron 才能加载，故实现抽到 browser-op-chain.cjs 后在此真跑。
 *
 * 背景（实测）：桥路径此前全链路零串行，而上层超时是 Promise.race（不中断正在跑的动作），
 * 实测 ≥30s 的动作 98 次 ⇒ 超时后模型立刻发下一个动作时，两个动作在同一 guest 上并发执行。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const { chainTabAction, DEFAULT_MAX_WAIT_MS } = require(path.join(DESKTOP, 'browser-op-chain.cjs'));

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
/** 可手动放行的闸门 */
function gate() {
  let release;
  const p = new Promise((r) => { release = r; });
  return { p, release };
}

describe('chainTabAction · 同 tab 串行', () => {
  test('★ 同 key 串行：后一个必须等前一个结束才开始', async () => {
    const chains = new Map();
    const order = [];
    const g = gate();
    const p1 = chainTabAction(chains, 't1', async () => { order.push('a:start'); await g.p; order.push('a:end'); });
    const p2 = chainTabAction(chains, 't1', async () => { order.push('b:start'); });
    await tick();
    assert.deepEqual(order, ['a:start'], '★ b 不该在 a 结束前开始（这正是并发打架的形态）');
    g.release();
    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['a:start', 'a:end', 'b:start']);
  });

  test('不同 key 并行：不同标签页不该互相阻塞', async () => {
    const chains = new Map();
    const order = [];
    const g = gate();
    const p1 = chainTabAction(chains, 't1', async () => { order.push('a:start'); await g.p; });
    p1.catch(() => {});
    const p2 = chainTabAction(chains, 't2', async () => { order.push('b:start'); });
    await tick();
    assert.deepEqual(order, ['a:start', 'b:start'], '不同 tab 应并行');
    g.release();
    await Promise.all([p1, p2]);
  });

  test('★ 前一个动作抛错不阻断链：调用方拿得到错误，后续动作照常执行', async () => {
    const chains = new Map();
    await assert.rejects(chainTabAction(chains, 't1', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await chainTabAction(chains, 't1', async () => 'ok'), 'ok');
  });

  test('★★ 排队上限：前一个永不结束也放行下一个（防死锁）', async () => {
    const chains = new Map();
    chainTabAction(chains, 't1', () => new Promise(() => {}), 30); // 永不 settle（模拟 guest 挂死）
    const t0 = Date.now();
    const v = await chainTabAction(chains, 't1', async () => 'released', 30);
    assert.equal(v, 'released', '★ 上限到点必须放行 —— 否则一个挂死动作会把该 tab 永久卡死');
    assert.ok(Date.now() - t0 < 1000, `放行应在上限附近，实测 ${Date.now() - t0}ms`);
  });

  test('key 为空 → 不排队、直接执行，且不在链表留条目', async () => {
    const chains = new Map();
    const order = [];
    const g = gate();
    const p1 = chainTabAction(chains, '', async () => { order.push('a'); await g.p; });
    p1.catch(() => {});
    const p2 = chainTabAction(chains, '', async () => { order.push('b'); });
    await tick(10);
    assert.deepEqual(order, ['a', 'b'], '空 key 表示不排队');
    assert.equal(chains.size, 0, '空 key 不该产生链条目（否则内存只增不减）');
    g.release();
    await Promise.all([p1, p2]);
  });

  test('默认排队上限与注释一致（20s）', () => {
    assert.equal(DEFAULT_MAX_WAIT_MS, 20000, '默认值改动需同步 main.cjs 的注释口径');
  });
});
