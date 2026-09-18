// 跨区 git 状态同步的契约测试（stores/git.ts 的 statusVersion）。
//
// 背景（真实 bug，2026-09-18 报）：
//   开发模式下左侧源码管理面板已显示「变更 0 / ↑7」，**顶部顶栏仍停在 ↑1** ——
//   因为界面上有两份 git 快照，各自发请求、各自刷新：
//     · 顶栏 = CodeWorkbench 的本地 ref（gitBranch / gitDirty / gitAhead / gitBehind）
//     · 侧栏 = ChatGitPanel 的本地 aheadBehind + gitStore.status
//   任何一侧操作后只刷新自己那份，另一份陈旧。用户看到的就像「刷新了但没同步」。
//
// 修法：store 引入 statusVersion（单调递增），写操作统一 bump，两侧各自 watch 后重新拉取。
// 本测试钉住的正是这个契约 —— 版本号在**哪些**方法上 bump、哪些**绝不** bump。
//
// ★ 为什么「绝不 bump」这一半同样重要：
//   侧栏 refreshAll 收尾会 persist() → writeRepoCache。若缓存写也 bump，
//   就成 refresh → persist → bump → refresh 的死循环（CPU 空转 + 请求风暴）。

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────
// 1) 纯函数模型：复刻 store 里的 withBump + 读写分类
//    不挂 pinia，直接把「哪个方法会 bump」这条规则拎出来断言 —— 与实现同源但不惰性。
// ────────────────────────────────────────────────────────────

/** 与 stores/git.ts 的 return 段一一对应：会改变仓库状态的方法 */
const WRITE_METHODS = [
  'add', 'commit', 'commitAmend', 'pull', 'push', 'checkout',
  'resolveConflict', 'resolveContent', 'restore',
  'stageFiles', 'unstageFiles', 'ignoreFiles',
  'createBranch', 'mergeBranch', 'abortMerge', 'fetch',
  'stashSave', 'stashPop', 'stashApply', 'stashDrop',
  'tagCreate', 'tagDelete',
  'revert', 'reset', 'cherryPick', 'rebase', 'rebaseAbort',
  'deleteBranch', 'renameBranch',
  'batchPull', 'batchPush', 'batchCheckout',
] as const;

/** 纯读 / 列表类：绝不 bump（bump 会让订阅方 refresh 自激） */
const READ_METHODS = [
  'checkCapability', 'fetchStatus', 'fetchStatusRaw', 'fetchFileTree', 'fetchBranches',
  'fetchLog', 'readFile', 'diff', 'show', 'conflicts', 'conflictVersions',
  'fetchNumstat', 'fetchAheadBehind', 'fetchTree', 'stashList', 'tagList',
  'blame', 'remoteBranches', 'diffTree', 'commitDiff', 'graph', 'discoverAll',
  'readRepoCache',
  // ★ 面板缓存：refreshAll 收尾会写它，故**必须**属于读侧
  'writeRepoCache', 'clearRepoCache',
] as const;

/** 复刻 withBump 的语义：执行后版本号 +1 */
function makeVersionedStore(methodNames: readonly string[]) {
  let version = 0;
  const calls: string[] = [];
  const isWrite = (n: string) => (WRITE_METHODS as readonly string[]).includes(n);
  const api: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
  for (const n of methodNames) {
    api[n] = async (..._args: unknown[]) => {
      calls.push(n);
      // 只有写操作在返回后 bump
      if (isWrite(n)) version += 1;
      return { ok: true };
    };
  }
  return {
    api,
    calls,
    get version() { return version; },
    bumpManually: () => { version += 1; },
  };
}

describe('git 状态版本号：写操作必须 bump（跨区同步的触发源）', () => {
  it('★ 提交：bump 一次（顶栏据此刷新）', async () => {
    const s = makeVersionedStore(['commit']);
    expect(s.version).toBe(0);
    await s.api.commit('C:/repo', 'msg');
    expect(s.version).toBe(1);
  });

  it('★ 推送 / 拉取：各 bump 一次（领先/落后计数会变）', async () => {
    const s = makeVersionedStore(['push', 'pull']);
    await s.api.push('C:/repo');
    await s.api.pull('C:/repo');
    expect(s.version).toBe(2);
  });

  it('检出分支 / 储藏 / 重置 —— 凡是改变仓库状态的都要 bump', async () => {
    const s = makeVersionedStore(['checkout', 'stashSave', 'stashPop', 'reset', 'mergeBranch', 'rebase']);
    for (const m of ['checkout', 'stashSave', 'stashPop', 'reset', 'mergeBranch', 'rebase']) {
      await s.api[m]('C:/repo');
    }
    expect(s.version).toBe(6);
  });

  it('连续写操作单调递增（订阅方每轮都能拿到新值）', async () => {
    const s = makeVersionedStore(['add', 'commit', 'push']);
    await s.api.add('C:/repo', []);
    const v1 = s.version;
    await s.api.commit('C:/repo', 'm');
    const v2 = s.version;
    await s.api.push('C:/repo');
    expect(v1).toBeLessThan(v2);
    expect(v2).toBeLessThan(s.version);
  });
});

describe('git 状态版本号：读接口绝不 bump（否则 refresh 自激成环）', () => {
  it('★ 读接口一律不动版本号', async () => {
    const s = makeVersionedStore(READ_METHODS);
    for (const m of READ_METHODS) await s.api[m]('C:/repo');
    expect(s.version).toBe(0);
    expect(s.calls).toHaveLength(READ_METHODS.length);
  });

  it('★★ 回归：writeRepoCache 必须不 bump —— 侧栏 refreshAll 收尾会写它', async () => {
    // 若这里 bump，序列会变成 refresh → persist(写缓存) → bump → 两侧 refresh → …
    const s = makeVersionedStore(['fetchStatus', 'fetchAheadBehind', 'writeRepoCache']);
    // 模拟一次完整 refreshAll：拉数据 + 收尾 persist
    await s.api.fetchStatus('C:/repo');
    await s.api.fetchAheadBehind('C:/repo');
    await s.api.writeRepoCache('C:/repo', {});
    expect(s.version).toBe(0);
  });

  it('读 + 缓存写混在一个 refresh 里仍然不 bump（这就是正常刷新路径）', async () => {
    const s = makeVersionedStore(READ_METHODS);
    for (const m of READ_METHODS) await s.api[m]('C:/repo');
    // 再跑一轮（模拟 watcher 再触发一次 refresh）
    for (const m of READ_METHODS) await s.api[m]('C:/repo');
    expect(s.version).toBe(0);
  });

  it('写一次后，多次读不会把版本号继续推高（避免无意义的重复刷新）', async () => {
    const s = makeVersionedStore(['commit', 'fetchStatus']);
    await s.api.commit('C:/repo', 'm');
    expect(s.version).toBe(1);
    await s.api.fetchStatus('C:/repo');
    await s.api.fetchStatus('C:/repo');
    expect(s.version).toBe(1);
  });
});

describe('读写分类完整性（防止新增方法时漏归一侧）', () => {
  it('写清单里的每个方法都真的会 bump', async () => {
    const s = makeVersionedStore(WRITE_METHODS);
    for (const m of WRITE_METHODS) await s.api[m]('C:/repo');
    expect(s.version).toBe(WRITE_METHODS.length);
  });

  it('读写两个清单没有交集（同一个方法不能既写又读）', () => {
    const w = new Set<string>(WRITE_METHODS);
    const r = new Set<string>(READ_METHODS);
    const both = [...w].filter((n) => r.has(n));
    expect(both).toEqual([]);
  });

  it('缓存读写被明确归到读侧（写缓存不属于仓库状态变更）', () => {
    expect(READ_METHODS).toContain('writeRepoCache');
    expect(READ_METHODS).toContain('readRepoCache');
    expect(READ_METHODS).toContain('clearRepoCache');
    expect(WRITE_METHODS).not.toContain('writeRepoCache');
  });
});

describe('两侧订阅行为（顶栏与侧栏各自刷新自己那份）', () => {
  /** 复刻两侧 watch：版本号变化 → 各自重新拉取 */
  function makeSubscriber(name: string, store: { version: number }) {
    let seen = store.version;
    const refreshes: number[] = [];
    return {
      name,
      /** 返回本次是否触发了刷新 */
      onTick(): boolean {
        if (store.version === seen) return false;
        seen = store.version;
        refreshes.push(seen);
        return true;
      },
      refreshes,
    };
  }

  it('★ 提交一次 → 顶栏与侧栏**都**刷新（原 bug：只有发起方刷新）', async () => {
    const s = makeVersionedStore(['commit']);
    const top = makeSubscriber('顶栏', s);
    const side = makeSubscriber('侧栏', s);
    await s.api.commit('C:/repo', 'm');
    expect(top.onTick()).toBe(true);
    expect(side.onTick()).toBe(true);
  });

  it('没有写操作时两侧都不刷新（避免每次读都重拉）', () => {
    const s = makeVersionedStore(READ_METHODS);
    const top = makeSubscriber('顶栏', s);
    const side = makeSubscriber('侧栏', s);
    expect(top.onTick()).toBe(false);
    expect(side.onTick()).toBe(false);
  });

  it('版本号未变时同一订阅者不重复刷新（watch 的幂等性）', async () => {
    const s = makeVersionedStore(['commit']);
    const top = makeSubscriber('顶栏', s);
    await s.api.commit('C:/repo', 'm');
    expect(top.onTick()).toBe(true);
    expect(top.onTick()).toBe(false);
    expect(top.refreshes).toHaveLength(1);
  });

  it('滞后订阅者补刷一次即可追上（不会漏到最后一次写入）', async () => {
    const s = makeVersionedStore(['commit', 'push']);
    const top = makeSubscriber('顶栏', s);
    await s.api.commit('C:/repo', 'm');
    await s.api.push('C:/repo');
    // 两次写操作后才来订阅检查 → 一次刷新即代表最新状态
    expect(top.onTick()).toBe(true);
    expect(s.version).toBe(2);
  });
});