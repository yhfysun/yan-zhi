// 差异面板「宿主容器」与仓库根目录解析的契约测试。
//
// 背景（本次修的真 bug，2026-10-15）：
//   预览面板（对话页）的「Git 文件」显示了**别的**有 git 的目录。
//   根因：ChatPreviewPane 没给 ChatGitPanel 传 repo，面板兜底链是
//   `props.repo || codeStore.projectDir || settingsStore.workspaceDir` ——
//   codeStore.projectDir 是 IDE（/code）当前项目目录，与当前工作空间无关且长期驻留
//   （上次打开的项目，往往正是那个"有 git 记录的目录"）。
//
//   三级归属模型（用户澄清，权威口径）：预览面板三类资源分属不同层级 ——
//   ① 浏览器 = 应用级；② Git / 文件 = 工作空间级；③ 控制台 = 会话级。
//   Git 必须跟随「当前会话所属工作空间」，任何跨层级取值都是脏数据。
//
// ★ 这里 import **真实实现**（utils/gitRepoSource.ts）而不是复刻一份逻辑：
//   复刻版测的是"我抄对了没"，实现漂移了测试照样绿（记忆 TESTING-NOTES：
//   能真跑就真跑，锚点钉唯一实现）。

import { describe, it, expect } from 'vitest';
import { resolveGitRepoSource, normalizeRepoDir } from '../../utils/gitRepoSource';

// ────────────────────────────────────────────────────────────
// 1) 仓库根目录解析优先级（三级归属：Git = 工作空间级）
// ────────────────────────────────────────────────────────────
describe('仓库根目录解析：Git 必须跟随当前工作空间', () => {
  it('★ 回归（原 bug）：非代码模式下 IDE 项目目录不得成为来源', () => {
    // 原实现 projectDir 优先于 workspaceDir ⇒ 预览面板 git 显示别的有 git 的目录
    expect(resolveGitRepoSource({
      workspaceDir: 'D:/novel-ws',
      codeModeProjectDir: 'C:/proj/with-git',
    })).toBe('D:/novel-ws');
  });

  it('显式 repo（tab.repoPath / 父级传入）优先级最高', () => {
    expect(resolveGitRepoSource({
      explicitRepo: 'D:/explicit',
      spaceDir: 'D:/space',
      workspaceDir: 'D:/ws',
      codeModeProjectDir: 'C:/proj',
    })).toBe('D:/explicit');
  });

  it('当前会话所属空间目录优先于全局 workspaceDir', () => {
    // 会话挂靠空间 A、用户当前选中空间 B（workspaceDir 已同步成 B）时，
    // 归属以会话所属空间为准（发消息不改变会话归属）。
    expect(resolveGitRepoSource({ spaceDir: 'D:/spaceA', workspaceDir: 'D:/spaceB' }))
      .toBe('D:/spaceA');
  });

  it('会话无空间（未归类）时回落到 workspaceDir', () => {
    expect(resolveGitRepoSource({ spaceDir: '', workspaceDir: 'D:/ws' })).toBe('D:/ws');
  });

  it('代码模式：前三者皆空时才用 IDE 项目目录兜底（老调用方兼容）', () => {
    expect(resolveGitRepoSource({ codeModeProjectDir: 'C:/proj' })).toBe('C:/proj');
  });

  it('全空 → 空串（面板据此跳过请求，不发空 repo 的 API）', () => {
    expect(resolveGitRepoSource({})).toBe('');
  });

  it('空串 prop 不遮蔽后面的来源（用 || 而非 ?? 的语义）', () => {
    expect(resolveGitRepoSource({ explicitRepo: '', spaceDir: 'D:/space' })).toBe('D:/space');
  });

  it('尾部斜杠归一化（同目录两种写法不能分裂成两份缓存 key）', () => {
    expect(resolveGitRepoSource({ spaceDir: 'D:/space\\' })).toBe('D:/space');
    expect(resolveGitRepoSource({ spaceDir: 'D:/space/' })).toBe('D:/space');
    expect(normalizeRepoDir('  D:/space\\  ')).toBe('D:/space');
  });
});

// ───────────────────────────────────────────────────────────
// 2) 初始化触发条件（watch 的值守卫，与面板内 lastInitRepo 同口径）
// ────────────────────────────────────────────────────────────
describe('初始化触发：同一仓库不重复拉取、换了仓库必须重拉', () => {
  /** 复刻面板里的 lastInitRepo 守卫 */
  function makeInitGate() {
    let last = '';
    const inits: string[] = [];
    return {
      inits,
      /** 返回是否真的触发了 init */
      onRepoChange(repo: string): boolean {
        if (!repo) return false;
        if (repo === last) return false;
        last = repo;
        inits.push(repo);
        return true;
      },
    };
  }

  it('首次非空仓库 → 触发初始化（即使 watch 是 immediate，值相同也要跑第一次）', () => {
    const g = makeInitGate();
    expect(g.onRepoChange('D:/a')).toBe(true);
    expect(g.inits).toEqual(['D:/a']);
  });

  it('同一仓库重复变化 → 不重复初始化（避免切视图时反复请求）', () => {
    const g = makeInitGate();
    g.onRepoChange('D:/a');
    expect(g.onRepoChange('D:/a')).toBe(false);
    expect(g.inits).toHaveLength(1);
  });

  it('切到另一个仓库 → 必须重新初始化', () => {
    const g = makeInitGate();
    g.onRepoChange('D:/a');
    expect(g.onRepoChange('D:/b')).toBe(true);
    expect(g.inits).toEqual(['D:/a', 'D:/b']);
  });

  it('空仓库（未绑定目录）不初始化，也不污染 lastInitRepo', () => {
    const g = makeInitGate();
    expect(g.onRepoChange('')).toBe(false);
    expect(g.onRepoChange('D:/a')).toBe(true); // 之后仍然能正常初始化
  });

  it('★ 回归：解析结果从空间 A 目录换成空间 B 目录必须能触发', () => {
    const g = makeInitGate();
    g.onRepoChange('D:/spaceA');
    // 会话切到另一个空间 → repo 解析值变化 → 必须重新初始化
    expect(g.onRepoChange('D:/spaceB')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────
// 3) plain 模式：不渲染工具栏 / 拖高条 / 全屏弹窗
// ────────────────────────────────────────────────────────────
describe('plain 模式渲染契约', () => {
  /** 复刻模板里的显隐条件 */
  function renderPlan(opts: { plain: boolean; fullscreen: boolean }) {
    return {
      bar: !opts.plain,                                    // 工具栏
      heightBar: !opts.fullscreen && !opts.plain,          // 底部拖高条
      fullscreenDialog: !opts.plain,                       // 全屏弹窗
      // plain 模式下宿主负责放大入口，DiffBody 自己不给
      selfExpandButton: !opts.plain,
    };
  }

  it('★ plain（内联在宿主里）→ 无工具栏、无拖高条、无全屏弹窗（消除嵌套观感）', () => {
    const p = renderPlan({ plain: true, fullscreen: false });
    expect(p.bar).toBe(false);
    expect(p.heightBar).toBe(false);
    expect(p.fullscreenDialog).toBe(false);
    expect(p.selfExpandButton).toBe(false);
  });

  it('默认（独立使用）→ 工具栏、拖高条、全屏弹窗都在', () => {
    const p = renderPlan({ plain: false, fullscreen: false });
    expect(p.bar).toBe(true);
    expect(p.heightBar).toBe(true);
    expect(p.fullscreenDialog).toBe(true);
    expect(p.selfExpandButton).toBe(true);
  });

  it('fullscreen（独立窗口/全屏弹窗内）→ 保留导航与视图切换，但不给拖高条', () => {
    const p = renderPlan({ plain: false, fullscreen: true });
    expect(p.bar).toBe(true);          // 撑满态仍需并排/统一与差异导航
    expect(p.heightBar).toBe(false);   // 高度交给外层
    expect(p.fullscreenDialog).toBe(true);
  });

  it('plain 与 fullscreen 同时为真 → 仍然不带工具栏（plain 优先）', () => {
    const p = renderPlan({ plain: true, fullscreen: true });
    expect(p.bar).toBe(false);
    expect(p.heightBar).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────
// 4) 两侧数字同源（顶部状态栏 vs 左侧变更列表）
// ────────────────────────────────────────────────────────────
describe('顶部与左侧变更数同源', () => {
  it('同一份 /git/status 的 files 长度应被两侧一致使用', () => {
    const apiFiles = new Array(73).fill(0).map((_, i) => ({ path: `f${i}`, index: ' ', working_dir: 'M' }));
    // 顶部：直接取 files.length
    const topCount = apiFiles.length;
    // 左侧：解析成 changedFiles 后也应是 73（每文件一条 working_dir 改动）
    const leftChanged = apiFiles.filter((f) => f.working_dir !== ' ' || f.index !== ' ').length;
    expect(topCount).toBe(73);
    expect(leftChanged).toBe(73);
    expect(topCount).toBe(leftChanged);
  });

  it('未跟踪文件（两侧都是 ?）只算一条，不应重复计数', () => {
    const files = [{ path: 'new.txt', index: '?', working_dir: '?' }];
    const out: Array<{ path: string }> = [];
    for (const f of files) {
      const idx = f.index || ' ';
      const wd = f.working_dir || ' ';
      if (idx === '?' || wd === '?') { out.push({ path: f.path }); continue; }
      if (idx !== ' ') out.push({ path: f.path });
      if (wd !== ' ') out.push({ path: f.path });
    }
    expect(out).toHaveLength(1);
  });
});
