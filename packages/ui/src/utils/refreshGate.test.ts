// 刷新合并闸门的单元测试（utils/refreshGate.ts）。
//
// 为什么值得单独钉：跨区 git 同步（顶栏 / 侧栏两份快照都订阅 statusVersion）之后，
// 「一次写操作」会从多条路触发同一个刷新函数 —— 操作方自己的收尾刷新 + 跨区 watch。
// 不合并的话同一份数据会被请求多遍；而合并写错则会出现两类更隐蔽的问题：
//   1) 提前 resolve → 调用方 await 之后读到**上一轮**的值
//      （真实后果：拉取后的冲突提示不弹了）；
//   2) 把并发中的调用整个丢掉 → 用户点的那次刷新没生效。
// 所以这里重点钉住「合并但绝不丢语义」。
//
// 用 deferred 手工控制执行时机，避免依赖真实计时器。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRefreshGate } from './refreshGate';

/** 可手动放行的 Promise */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('刷新闸门：并发合并', () => {
  it('★ 并发调用只执行一次（另一路合并进来）', async () => {
    const d = deferred();
    const fn = vi.fn(() => d.promise);
    const gate = createRefreshGate(fn, 'test');
    const a = gate();
    const b = gate();
    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve();
    await Promise.all([a, b]);
    // 补跑一次（b 留下了 pending），故总共 2 次：1 次首发 + 1 次合并补跑
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('★ 并发调用方在**整轮结束后**才 resolve（不能提前返回，否则读到旧值）', async () => {
    const first = deferred();
    const second = deferred();
    let call = 0;
    const fn = vi.fn(() => (++call === 1 ? first.promise : second.promise));
    const gate = createRefreshGate(fn, 'test');

    const a = gate();
    const b = gate();
    let bDone = false;
    void b.then(() => { bDone = true; });

    first.resolve();
    await first.promise;
    // 首发结束后进入补跑（第二轮回调），此时 b 仍不应 resolve
    await Promise.resolve();
    expect(bDone).toBe(false);

    second.resolve();
    await a; await b;
    expect(bDone).toBe(true);
  });

  it('运行期间来 N 次调用 → 只补跑 1 次（不是 N 次）', async () => {
    const d = deferred();
    const fn = vi.fn(() => d.promise);
    const gate = createRefreshGate(fn, 'test');
    const all = [gate(), gate(), gate(), gate(), gate()];
    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve();
    // 首发 1 次 + 合并补跑 1 次（第二次补跑时 d 已 resolve，立即完成）
    await Promise.all(all);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('串行调用（无重叠）每次都执行，不合并', async () => {
    const fn = vi.fn(async () => {});
    const gate = createRefreshGate(fn, 'test');
    await gate();
    await gate();
    await gate();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('busy 在执行期间为 true，结束后为 false', async () => {
    const d = deferred();
    const gate = createRefreshGate(() => d.promise, 'test');
    expect(gate.busy).toBe(false);
    const p = gate();
    expect(gate.busy).toBe(true);
    d.resolve();
    await p;
    expect(gate.busy).toBe(false);
  });
});

describe('刷新闸门：错误处理（不静默、不连坐）', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('★ 刷新失败必须 warn（不许静默吞错）', async () => {
    const gate = createRefreshGate(async () => { throw new Error('boom'); }, 'PanelX');
    await gate();
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toContain('PanelX');
  });

  it('★ 失败不把 rejection 抛给合并调用方（否则变成未处理拒绝）', async () => {
    const d = deferred();
    let call = 0;
    const gate = createRefreshGate(async () => {
      call += 1;
      if (call === 1) { await d.promise; throw new Error('first fails'); }
    }, 'test');
    const a = gate();
    const b = gate(); // 合并进同一轮，不应因第一轮失败而 reject
    d.resolve();
    await expect(Promise.all([a, b])).resolves.toBeDefined();
  });

  it('一轮失败后闸门仍可用（running 复位，不会卡死）', async () => {
    let call = 0;
    const gate = createRefreshGate(async () => { call += 1; if (call === 1) throw new Error('x'); }, 'test');
    await gate();
    expect(gate.busy).toBe(false);
    await gate(); // 第二次正常执行
    expect(call).toBe(2);
  });
});

describe('force 语义在合并时取并集（ChatGitPanel 的用法）', () => {
  /** 复刻面板里 refreshAll(force) → 闸门的桥接 */
  function makeForceGate(inner: (force: boolean) => Promise<void>) {
    let pendingForce = false;
    const cycle = createRefreshGate(async () => {
      const f = pendingForce;
      pendingForce = false;
      await inner(f);
    }, 'test');
    return (force = false) => { if (force) pendingForce = true; return cycle(); };
  }

  it('普通调用不带 force', async () => {
    const seen: boolean[] = [];
    const gate = makeForceGate(async (f) => { seen.push(f); });
    await gate();
    expect(seen).toEqual([false]);
  });

  it('★ force 调用不会被普通并发调用吞掉（补跑那次带 force）', async () => {
    const seen: boolean[] = [];
    const d = deferred();
    let call = 0;
    const gate = makeForceGate(async (f) => {
      seen.push(f);
      call += 1;
      if (call === 1) await d.promise; // 让第一轮挂住，制造并发
    });
    const a = gate(false);  // 先来一个普通刷新（挂住）
    const b = gate(true);   // 期间来了强制刷新 → 应体现在补跑那次
    d.resolve();
    await Promise.all([a, b]);
    expect(seen).toEqual([false, true]);
  });

  it('多个 force 并发仍只补跑一次，且带 force', async () => {
    const seen: boolean[] = [];
    const d = deferred();
    let call = 0;
    const gate = makeForceGate(async (f) => {
      seen.push(f); call += 1;
      if (call === 1) await d.promise;
    });
    const all = [gate(true), gate(true), gate(false), gate(true)];
    d.resolve();
    await Promise.all(all);
    expect(seen).toEqual([true, true]);
  });
});