/**
 * 工具发现体系接线回归测试（2026-10-22）。
 *
 * 为什么值得测（每条都对应一次真实故障）：
 *   1) **白名单漏登** —— `SUPPORTED_API_TOOLS` 是全链路唯一闸门
 *      （mcp/index listAllTools → buildToolsForBackend）。实测发现 16 个工具
 *      只在注册表、不在白名单：`music_compose`、`media_install_singing`、14 个 api_git_*。
 *      症状是「让模型配个 BGM / 拉个代码，它说没这个工具」——**不报错，能力静默消失**。
 *      本文件第 1 条断言就是反向扫描，专治这个（此前只有正向测试，所以漏了）。
 *
 *   2) **分类缺失** —— 用户明确要求「每个工具都要有分类」。
 *      没分类的工具在分类浏览里根本不出现，等于对模型不可见。
 *
 *   3) **单类超 20** —— 用户明确要求「每类最多 20 个」。
 *      一屏 26 个工具（git 改造前），模型反而选不准。
 *
 *   4) **查得到但调不动** —— 改造前 `get_api_tools` 返回注册表全量、不看白名单。
 *      模型查到 `music_compose` 的 schema → 调用 → 落 core registry →
 *      报「内置工具不存在」→ 反复重试烧 token。这比"查不到"更坏。
 *      现在每条带 `executable`，false 时明确告知别调。
 *
 *   5) **内置清单硬编码** —— `api_builtin_tool_list` 曾硬编码 8 条，
 *      实际内置工具 58 个。模型问「有哪些文件工具」只看得到 file_read/file_write，
 *      于是以为没这个能力。现在反射真实注册表。
 *
 * 只 import 纯数据模块（不 import db），避免打开 SQLite。
 */
import { describe, it, expect } from 'vitest';
import {
  TOOL_CATEGORIES,
  TOOL_CATEGORY,
  MAX_TOOLS_PER_CATEGORY,
  categoryOf,
  groupByCategory,
  paginate,
} from '@yan-zhi/shared';
import { initApiToolRegistry, getApiToolRegistry } from '@yan-zhi/core';

const registryNames = (() => {
  initApiToolRegistry();
  const out: string[] = [];
  for (const tools of getApiToolRegistry().values()) for (const t of tools) out.push(t.name);
  return out;
})();

/** 从源文件读白名单（不 import executor：它会连带打开 db / better-sqlite3）。 */
function readWhitelist(): Set<string> {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.resolve(__dirname, '../src/mcp/api-tool-executor.ts'), 'utf-8');
  const m = src.match(/export const SUPPORTED_API_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) throw new Error('未找到 SUPPORTED_API_TOOLS 定义（重命名了？同步改本测试）');
  return new Set([...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));
}

const whitelist = readWhitelist();

describe('工具发现体系 · 分类完整性', () => {
  it('注册表里每个工具都有分类（用户要求：每个工具都要有分类）', () => {
    const missing = registryNames.filter((n) => categoryOf(n) === null);
    expect(missing, `未归类工具：${missing.join(', ')}`).toEqual([]);
  });

  it('TOOL_CATEGORY 里不登记不存在的工具（防手滑写错名）', () => {
    const known = new Set(registryNames);
    // 内置工具名不在注册表里，属于正常；这里只校验「api_ 前缀」的拼写
    const ghosts = Object.keys(TOOL_CATEGORY).filter(
      (n) => n.startsWith('api_') && !known.has(n) && !whitelist.has(n),
    );
    expect(ghosts, `表里有但工具不存在：${ghosts.join(', ')}`).toEqual([]);
  });

  it('任何分类成员数不超过 MAX_TOOLS_PER_CATEGORY（用户要求：每类最多 20）', () => {
    const cnt = new Map<string, number>();
    for (const n of registryNames) {
      const c = categoryOf(n);
      if (c) cnt.set(c, (cnt.get(c) ?? 0) + 1);
    }
    const over = [...cnt.entries()].filter(([, v]) => v > MAX_TOOLS_PER_CATEGORY);
    expect(
      over.map(([c, v]) => `${c}=${v}`),
      `超过 ${MAX_TOOLS_PER_CATEGORY} 的分类必须拆子类`,
    ).toEqual([]);
  });

  it('每个分类都是 TOOL_CATEGORIES 的成员（防新增时忘了加枚举）', () => {
    const valid = new Set<string>(TOOL_CATEGORIES);
    const bad = Object.entries(TOOL_CATEGORY)
      .filter(([, c]) => !valid.has(c))
      .map(([n, c]) => `${n}→${c}`);
    expect(bad).toEqual([]);
  });
});

describe('工具发现体系 · 白名单接线', () => {
  it('注册表里每个工具都在 SUPPORTED_API_TOOLS 里（治「写了工具但模型看不见」）', () => {
    const missing = registryNames.filter((n) => !whitelist.has(n));
    expect(
      missing,
      `这些工具在注册表里但不在白名单，模型侧完全看不到：\n  ${missing.join('\n  ')}` +
      '\n★ 修法：把名字加进 apps/server/src/mcp/api-tool-executor.ts 的 SUPPORTED_API_TOOLS',
    ).toEqual([]);
  });

  it('音乐三件套确实在白名单（2026-10-22 修复的具体回归点）', () => {
    for (const n of ['music_compose', 'music_generate', 'media_install_singing']) {
      expect(whitelist.has(n), `${n} 不在白名单`).toBe(true);
    }
  });

  it('git 写/进阶工具全在白名单（用户要求全开，靠授权卡兜底而非白名单收窄）', () => {
    const gitWrite = [
      'api_git_fetch', 'api_git_stash_save', 'api_git_stash_pop',
      'api_git_tag_create', 'api_git_tag_delete', 'api_git_revert',
      'api_git_reset', 'api_git_cherry_pick', 'api_git_rebase',
      'api_git_merge', 'api_git_remote_branches',
    ];
    for (const n of gitWrite) expect(whitelist.has(n), `${n} 不在白名单`).toBe(true);
  });

  it('工具发现三件套在白名单（否则模型查不到详情/搜不到工具）', () => {
    for (const n of ['api_tool_detail', 'api_tool_search']) {
      expect(whitelist.has(n), `${n} 不在白名单`).toBe(true);
    }
  });
});

describe('工具发现体系 · 分页', () => {
  const all = registryNames.map((n) => ({ name: n, source: 'api' as const }));

  it('默认页大小不超过上限', () => {
    const pg = paginate(all, 1);
    expect(pg.pageSize).toBeLessThanOrEqual(MAX_TOOLS_PER_CATEGORY);
  });

  it('总页数与总数自洽', () => {
    const pg = paginate(all, 1, 10);
    expect(pg.total).toBe(all.length);
    expect(pg.totalPages).toBe(Math.ceil(all.length / 10));
  });

  it('越界页码自动收敛（模型传 page=999 不该报错）', () => {
    const pg = paginate(all, 999, 10);
    expect(pg.page).toBe(pg.totalPages);
    expect(pg.items.length).toBeGreaterThan(0);
  });

  it('pageSize 超过上限时被截断', () => {
    const pg = paginate(all, 1, 9999);
    expect(pg.pageSize).toBe(MAX_TOOLS_PER_CATEGORY);
  });

  it('页码为 0 或负数时收敛到 1', () => {
    expect(paginate(all, 0, 10).page).toBe(1);
    expect(paginate(all, -5, 10).page).toBe(1);
  });
});

describe('工具发现体系 · 分组', () => {
  it('分组结果保持 TOOL_CATEGORIES 的展示顺序', () => {
    const groups = groupByCategory(registryNames.map((n) => ({ name: n, source: 'api' as const })));
    const idx = groups.map((g) => TOOL_CATEGORIES.indexOf(g.category));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('分组不丢工具（未归类的除外，且此处应无未归类）', () => {
    const groups = groupByCategory(registryNames.map((n) => ({ name: n, source: 'api' as const })));
    const n = groups.reduce((s, g) => s + g.tools.length, 0);
    expect(n).toBe(registryNames.filter((x) => categoryOf(x) !== null).length);
  });
});
