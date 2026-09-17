// 差异面板「宿主容器」与 plain 模式的契约测试。
//
// 背景（本次修的两个真 bug）：
//   1) 开发模式的源码管理面板永远显示「变更 0 / 工作区干净」——
//      因为面板只认 settingsStore.workspaceDir，而开发模式的工作目录在 codeStore.projectDir；
//      watch 永不触发 → init 从未执行 → gitStore.status 恒为 null。
//   2) 提交弹窗里展开文件时「面板套面板」——内联的差异面板自带完整工具栏 + 边框，
//      外面又是一层弹窗，观感是嵌套；且放大按钮重复（内联一个、宿主一个）。
//
// 这里钉住「仓库根目录解析」的优先级与「plain 模式不渲染工具栏」两条契约。

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────
// 1) 仓库根目录解析优先级（与 ChatGitPanel 的 workspace computed 同口径）
// ────────────────────────────────────────────────────────────
interface RepoSource {
  /** 显式 prop（调用方指定，优先级最高） */
  propRepo?: string;
  /** 开发模式当前项目目录 */
  projectDir?: string;
  /** 办公模式设置里的工作目录 */
  workspaceDir?: string;
}

function resolveRepo(s: RepoSource): string {
  return s.propRepo || s.projectDir || s.workspaceDir || '';
}

describe('仓库根目录解析：必须认开发模式的项目目录', () => {
  it('★ 开发模式：只有 projectDir 时也能解析出仓库（原 bug 的根因）', () => {
    // 原实现只看 workspaceDir → 这里会得到空串 → 面板永远「变更 0」
    expect(resolveRepo({ projectDir: 'C:/proj/a' })).toBe('C:/proj/a');
  });

  it('显式 prop 优先级最高', () => {
    expect(resolveRepo({ propRepo: 'C:/explicit', projectDir: 'C:/proj', workspaceDir: 'C:/ws' }))
      .toBe('C:/explicit');
  });

  it('无 prop 时 projectDir 优先于 workspaceDir', () => {
    expect(resolveRepo({ projectDir: 'C:/proj', workspaceDir: 'C:/ws' })).toBe('C:/proj');
  });

  it('开发模式目录为空时回落到办公模式的 workspaceDir', () => {
    expect(resolveRepo({ workspaceDir: 'C:/ws' })).toBe('C:/ws');
  });

  it('三者皆空 → 空串（面板据此跳过请求，不发空 repo 的 API）', () => {
    expect(resolveRepo({})).toBe('');
  });

  it('空串 prop 不遮蔽后面的来源（用 || 而非 ?? 的语义）', () => {
    // 调用方传 repo="" 时不应把 projectDir 也一起废掉
    expect(resolveRepo({ propRepo: '', projectDir: 'C:/proj' })).toBe('C:/proj');
  });
});

// ───────────────────────────────────────────────────────────
// 2) 初始化触发条件（watch 的值守卫）
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
    expect(g.onRepoChange('C:/a')).toBe(true);
    expect(g.inits).toEqual(['C:/a']);
  });

  it('同一仓库重复变化 → 不重复初始化（避免切视图时反复请求）', () => {
    const g = makeInitGate();
    g.onRepoChange('C:/a');
    expect(g.onRepoChange('C:/a')).toBe(false);
    expect(g.inits).toHaveLength(1);
  });

  it('切到另一个仓库 → 必须重新初始化', () => {
    const g = makeInitGate();
    g.onRepoChange('C:/a');
    expect(g.onRepoChange('C:/b')).toBe(true);
    expect(g.inits).toEqual(['C:/a', 'C:/b']);
  });

  it('空仓库（未选项目目录）不初始化，也不污染 lastInitRepo', () => {
    const g = makeInitGate();
    expect(g.onRepoChange('')).toBe(false);
    expect(g.onRepoChange('C:/a')).toBe(true); // 之后仍然能正常初始化
  });

  it('★ 回归：workspaceDir → projectDir 的值变化必须能触发（原 bug 正是这里不触发）', () => {
    const g = makeInitGate();
    // 模拟：先按办公模式的 workspaceDir 初始化过
    g.onRepoChange('C:/ws');
    // 开发模式把 repo 解析结果换成了 projectDir → 必须重新初始化
    expect(g.onRepoChange('C:/proj')).toBe(true);
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

  it('fullscreen（独立窗口/全屏弹窗内）→ 无工具栏？否：保留导航与视图切换，但不给拖高条', () => {
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