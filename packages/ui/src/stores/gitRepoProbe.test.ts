/**
 * 「目录不是 Git 仓库」短路 —— 守门测试（2026-10-16）。
 *
 * ★★★ 背景（用户实报）：工作目录落在一个**普通文件夹**（新建的小说目录）时，一次进入
 *   `/dev` 页控制台齐刷刷四条 400：
 *     GET /api/git/status?repo=C%3A%5C…   400
 *     GET /api/git/branches?repo=C%3A%5C… 400
 *     GET /api/git/conflicts?repo=C%3A%5C… 400
 *     GET /api/git/log?repo=C%3A%5C…      400
 *   （侧栏还要多打 numstat/aheadBehind/remoteBranches/tagList/stashList/graph —— 共 9 条）
 *   根因不是这些接口坏了，而是 simple-git 抛 `fatal: not a git repository`，路由统一转 400。
 *
 * 修法：加一个探针（后端 `GET /git/isRepo`，复用 discover 的 rev-parse），
 *   三个消费者（顶栏 CodeWorkbench / 侧栏 ChatGitPanel / 插件页 GitExplorer）
 *   在拉数据**之前**先探针，明确「不是仓库」就整块短路，只留一个「初始化仓库」的出口。
 *
 * ★ 本测试钉住三件事：
 *   ① 探针是**三态**：true/false 是后端明确回答，null 是探测失败 —— 两者绝不可混淆
 *      （把"后端没起来"当成"不是仓库"会让 Git 区凭空消失，是最坏的误伤）；
 *   ② `initRepo` 必须 bump statusVersion（探针结论翻面后，两侧都得重拉）；
 *   ③ 三个消费者真的都接上了短路，而不是只有一个改了（漏改一处 = 那处照旧刷 400）。
 *
 * ★ 为什么"读源码断言"那一组：判据是"探针调用是否排在拉数据之前"这种**顺序性**事实，
 *   真跑要起 Vue 组件 + pinia + 后端。同口径见 stores/gitSync.test.ts、router/coldStartRouteSync.test.ts。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001',
  buildRequestHeaders: () => ({}),
}));

import { api } from '../api/client';
import { probeGitRepo, shouldSkipGitRead, useGitStore } from './git';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('probeGitRepo：三态探针', () => {
  it('后端答 isRepo:false → 返回 false（调用方据此短路），并打到 /git/isRepo 且带编码后的路径', async () => {
    get.mockResolvedValueOnce({ data: { isRepo: false, root: null } });
    expect(await probeGitRepo('C:\\Users\\x\\小说推文\\第一本')).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
    const url = String(get.mock.calls[0][0]);
    expect(url.startsWith('/git/isRepo?repo=')).toBe(true);
    expect(url).toContain(encodeURIComponent('C:\\Users\\x\\小说推文\\第一本'));
  });

  it('后端答 isRepo:true → 返回 true（照常拉数据）', async () => {
    get.mockResolvedValueOnce({ data: { isRepo: true, root: 'C:\\repo' } });
    expect(await probeGitRepo('C:\\repo')).toBe(true);
  });

  it('★★ 请求失败（ApiError，如后端未就绪）→ null，**不是** false', async () => {
    // 若这里返回 false，冷启动那几秒会把"后端还没监听"显示成"这个目录不是 Git 仓库"
    get.mockResolvedValueOnce({ error: 'NETWORK_UNREACHABLE', status: 0 });
    expect(await probeGitRepo('C:\\repo')).toBeNull();
  });

  it('空路径直接 false（没有目录就谈不上仓库），且一个请求都不发', async () => {
    expect(await probeGitRepo('')).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('shouldSkipGitRead：只有"明确不是仓库"才短路', () => {
  it('false → 短路', () => {
    expect(shouldSkipGitRead(false)).toBe(true);
  });

  it('★ true → 不短路（是仓库，正常拉）', () => {
    expect(shouldSkipGitRead(true)).toBe(false);
  });

  it('★★ null（探测失败）→ 不短路：未知 ≠ 不是仓库', () => {
    expect(shouldSkipGitRead(null)).toBe(false);
  });
});

describe('initRepo：改变仓库状态，必须 bump（两侧据此重新探针 + 重拉）', () => {
  it('打 POST /git/init，且 statusVersion +1', async () => {
    post.mockResolvedValueOnce({ data: { ok: true } });
    const store = useGitStore();
    const before = store.statusVersion;
    await store.initRepo('C:\\repo');
    expect(post).toHaveBeenCalledWith('/git/init', { repo: 'C:\\repo' });
    expect(store.statusVersion).toBe(before + 1);
  });

  it('失败也 bump（失败时更需要让两侧回到真实状态，与 withBump 的既有口径一致）', async () => {
    post.mockResolvedValueOnce({ error: '初始化失败', status: 400 });
    const store = useGitStore();
    const before = store.statusVersion;
    await store.initRepo('C:\\repo');
    expect(store.statusVersion).toBe(before + 1);
  });
});

describe('三个消费者都接上了短路（读源码断言，防只改一处）', () => {
  const UI = resolve(__dirname, '..');
  const read = (p: string) => readFileSync(resolve(UI, p), 'utf8');

  /** 去注释：说明性注释里同样会出现接口名，留着会把"注释提到"误当成"代码在用" */
  const strip = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  const CONSUMERS = [
    ['views/CodeWorkbench.vue', '顶栏 Git 区'],
    ['components/chat/ChatGitPanel.vue', '侧栏源码管理面板'],
    ['views/plugin/GitExplorer.vue', '插件 Git 探索页'],
  ] as const;

  it.each(CONSUMERS)('%s（%s）：探针排在拉数据之前，且有短路分支', (file) => {
    const s = strip(read(file));
    const probeAt = s.indexOf('probeGitRepo(');
    expect(probeAt, `${file} 没有调用探针`).toBeGreaterThanOrEqual(0);
    expect(s, `${file} 没有接短路判定`).toContain('shouldSkipGitRead(probe)');

    // 第一个"真的去拉 Git 数据"的位置（两种写法：store 方法 / 直接拼 URL）
    const readMarks = ['fetchStatus(', '/git/status?repo=']
      .map((m) => s.indexOf(m))
      .filter((i) => i >= 0);
    expect(readMarks.length, `${file} 里找不到拉数据的调用，断言失去意义`).toBeGreaterThan(0);
    const firstRead = Math.min(...readMarks);
    expect(probeAt, `${file} 把探针放在了拉数据之后 —— 那样 400 已经打出去了`).toBeLessThan(firstRead);
  });

  it.each(CONSUMERS)('%s（%s）：非仓库时给了「初始化」出口，而不是只把按钮 disable', (file) => {
    const s = read(file);
    expect(s).toContain('initRepo');
    expect(s).toContain('初始化');
  });
});
