// 非 Git 目录的状态卫生 —— 守门测试（2026-10-16）。
//
// ★★★ 背景（用户实报）：「这个目录都没有用 git 初始化管理，左边的还有这玩意？」——
//   截图里左侧源码管理面板显示着 `master` / `变更 1` / `已暂存 1`（文件是
//   `数据快照分析助手_提示词_v2.md`），而打开的目录（小说推文\第一本）里根本没有 `.git`。
//
// ★ 根因（实测复现）：`gitStore.status` 是**全局单槽**。先看过仓库 A（文档\chat_excel，
//   master、已暂存 1 个文件），再打开非 Git 目录 B 时：
//     ① 没有任何一处清空这个单槽 ⇒ 面板仍从 `gitStore.status` 渲染出 A 的变更列表
//        （旁证：B 的 .yan-zhi/git-cache.json 里被写进了 `current:"master"` 与 A 的文件）；
//     ② 面板 persist() 又把这份值写进 **B 自己的** 缓存 ⇒ 下次打开 B 仍显示 A 的变更，
//        一个从没有过 .git 的目录被"永久"贴上别的仓库的状态。
//
// 本文件钉住打断这条链的两处（探针本身的三态与短路接线在 gitRepoProbe.test.ts）：
//   · `clearRepoState()`：切到非 Git 目录时清空单槽 —— 且**不能 bump**（不是仓库状态变更）；
//   · `sanitizeSnapshotForPersist()`：落盘前净化 —— 探针说"不是仓库"时仓库数据一律不写进缓存，
//     但**目录身份 activeRepo 要保留**（清的是仓库数据，不是"这个面板属于哪个目录"）。
//   两条口径都要求 `null`（探测失败）原样放行：未知 ≠ 不是仓库。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 只关心 store 的状态语义，不拉真实依赖链（同 distillDraftPersistence.test.ts 的做法）
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001',
  buildRequestHeaders: () => ({}),
}));

import { useGitStore, sanitizeSnapshotForPersist } from './git';

/** 仓库 A 的一份真实形态残留（master + 一个已暂存文件） */
function poisonedSnapshot() {
  return {
    activeRepo: 'C:\\Users\\yhfys\\Desktop\\小说推文\\第一本',
    status: {
      current: 'master',
      files: [{ path: '数据快照分析助手_提示词_v2.md', index: 'A', working_dir: ' ' }],
      staged: ['数据快照分析助手_提示词_v2.md'],
    },
    branches: ['master'],
    currentBranch: 'master',
    numstat: [{ path: '数据快照分析助手_提示词_v2.md', added: 12, deleted: 0 }],
    aheadBehind: { ahead: 1, behind: 2 },
    remoteBranches: ['origin/master'],
    tags: ['v1'],
    stash: ['stash@{0}: WIP'],
    graph: [{ hash: 'abc1234', subject: '别的仓库的提交' }],
    repoSummaries: [{ path: 'C:\\other', name: 'other', branch: 'main', changes: 3 }],
    log: { total: 1 },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('clearRepoState：切到"不是仓库"的目录时清空单槽', () => {
  it('★ 回归：清掉上一个仓库的 status / 分支 / log / 文件树（面板不再渲染出别人的变更）', () => {
    const store = useGitStore();
    store.status = { current: 'master', files: [{ path: 'x.md', index: 'A', working_dir: ' ' }] };
    store.branches = ['master'];
    store.log = { total: 1 };
    store.fileTree = [{ name: 'x.md', path: 'x.md', type: 'file' }];

    store.clearRepoState();

    expect(store.status).toBeNull();
    expect(store.branches).toEqual([]);
    expect(store.log).toBeNull();
    expect(store.fileTree).toEqual([]);
  });

  it('★ 不 bump 版本号：清空只是"当前视图没数据"，不是仓库状态变更（bump 会让两侧白刷一轮）', () => {
    const store = useGitStore();
    const before = store.statusVersion;
    store.status = { current: 'master' };
    store.clearRepoState();
    expect(store.statusVersion).toBe(before);
  });

  it('清空后仍可正常写入（只是清数据，不把 store 置为不可用）', () => {
    const store = useGitStore();
    store.clearRepoState();
    store.status = { current: 'main' };
    expect(store.status).toEqual({ current: 'main' });
  });
});

describe('sanitizeSnapshotForPersist：落盘前净化缓存', () => {
  it('★★ 回归（原 bug 的持久化半边）：探针说"不是仓库"时，仓库数据一律不写进缓存', () => {
    const out = sanitizeSnapshotForPersist(poisonedSnapshot(), false);
    expect(out.status).toBeNull();
    expect(out.log).toBeNull();
    expect(out.branches).toEqual([]);
    expect(out.currentBranch).toBe('');
    expect(out.numstat).toEqual([]);
    expect(out.aheadBehind).toEqual({ ahead: 0, behind: 0 });
    expect(out.remoteBranches).toEqual([]);
    expect(out.tags).toEqual([]);
    expect(out.stash).toEqual([]);
    expect(out.graph).toEqual([]);
    expect(out.repoSummaries).toEqual([]);
  });

  it('★ 目录身份（activeRepo）必须保留：清的是"仓库数据"，不是"这个面板属于哪个目录"', () => {
    expect(sanitizeSnapshotForPersist(poisonedSnapshot(), false).activeRepo)
      .toBe('C:\\Users\\yhfys\\Desktop\\小说推文\\第一本');
  });

  it('是仓库（true）→ 原样返回，一个字段都不动', () => {
    const snap = poisonedSnapshot();
    expect(sanitizeSnapshotForPersist(snap, true)).toBe(snap);
  });

  it('★ 探测失败（null）→ 原样返回：一次网络抖动不得清空用户的面板数据', () => {
    const snap = poisonedSnapshot();
    expect(sanitizeSnapshotForPersist(snap, null)).toBe(snap);
  });
});

describe('侧栏面板真的接上了这两处（读源码断言，防"修了 store 却没接线"）', () => {
  const UI = resolve(__dirname, '..');
  const strip = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const panel = strip(readFileSync(resolve(UI, 'components/chat/ChatGitPanel.vue'), 'utf8'));

  it('短路时清空全局单槽（否则上一个仓库的变更列表会留在面板上）', () => {
    expect(panel).toContain('clearRepoState()');
  });

  it('落盘走净化（否则脏数据会被写进本目录缓存，下次打开又回来）', () => {
    expect(panel).toContain('sanitizeSnapshotForPersist(');
  });

  it('★ 恢复缓存前先探针：不是仓库就不套用缓存数据（缓存里可能存着别的仓库的 status）', () => {
    const probeAt = panel.indexOf('probeGitRepo(');
    const applyAt = panel.indexOf('applySnapshot(');
    expect(probeAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeGreaterThanOrEqual(0);
    expect(probeAt).toBeLessThan(applyAt);
  });
});
