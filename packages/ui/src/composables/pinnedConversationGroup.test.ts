/**
 * 会话置顶分组 —— 守门测试。
 *
 * ★★★ 为什么钉（issues/会话置顶入口隐蔽-20260919 的「缺失项 1」）：
 *   用户曾反馈「会话列表没有星标功能」。排查发现**功能完整可用** ——
 *   hover 星标、右键菜单、持久化、`pinned DESC` 排序、星形标记全都有；
 *   缺的只是**视觉分区**：置顶项混在普通会话里，看不出"这些是置顶的"。
 *   issue 原话：「功能存在但不可发现 ≈ 功能不存在」。
 *
 * 本测试钉住「置顶分组」这条，防止后续重构把分区又去掉（那种改动**不报错**，
 * 只表现为"用户又说找不到置顶"——最难查的一类回归）。
 *
 * 判据（缺任一条，分组就形同虚设）：
 *   ① 有独立的「置顶」分组标题，且**只在有置顶项时渲染**（无置顶不占位）；
 *   ② 置顶组用 `pinnedRootConversations`、主列表用 `unpinnedRootConversations`
 *      —— 两者互补，**同一个会话不能出现在两处**（重复展示比不分组更糟）；
 *   ③ 分组内仍有「取消置顶」入口（否则置顶进去就出不来）。
 *
 * ★★★ 第二处必须同步（2026-10-09 实测漏改）：
 *   issue 备注原话「同类实现参考 TaskListSection.vue 也已接好 pinned…若改造需同步两处，
 *   **避免只有侧边栏生效**」。第一版我只改了 ChatSidebar → 工作台任务列表里置顶仍是
 *   "混在普通任务里"（用户视角：改了但没生效）。
 *   ⇒ 本测试同时钉住两处，防再次只改一处。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIDEBAR = readFileSync(resolve(__dirname, '../components/chat/ChatSidebar.vue'), 'utf8');
const USECHAT = readFileSync(resolve(__dirname, 'chat/useChat.ts'), 'utf8');
// ★ 第二处（issue 备注明确要求同步）：工作台任务列表。上轮只改了侧边栏，这处漏了。
const TASKLIST = readFileSync(resolve(__dirname, '../components/workbench/TaskListSection.vue'), 'utf8');

describe('会话置顶分组', () => {
  it('★★ 有「置顶」分组标题，且仅在存在置顶项时渲染（无置顶不占位）', () => {
    // 分组容器带 tree-pinned 类，且 v-if 绑在置顶列表长度上
    expect(SIDEBAR).toMatch(/class="tree-node tree-pinned"/);
    expect(SIDEBAR).toMatch(/v-if="pinnedRootConversations\.length > 0"/);
    // 分组标题文案
    expect(SIDEBAR).toMatch(/tree-node-label">置顶</);
  });

  it('★★ 置顶组与主列表互补：同一会话不得出现两次', () => {
    // 置顶组用 pinnedRootConversations
    expect(SIDEBAR).toMatch(/v-for="conv in pinnedRootConversations"/);
    // 主列表必须用 unpinned 版（若仍用 rootConversations，置顶项会在两处重复）
    expect(SIDEBAR).toMatch(/v-for="conv in unpinnedRootConversations"/);
    // 反向：主列表**不得**用未过滤的 rootConversations 渲染行
    expect(SIDEBAR).not.toMatch(/v-for="conv in rootConversations"/);
  });

  it('★ 分组数据本身是「根级 + 已置顶」的交集（空间内置顶不抽出来，避免重复）', () => {
    // pinnedRootConversations 必须基于 rootConversations（根级）再筛 pinned
    const i = USECHAT.indexOf('const pinnedRootConversations');
    expect(i).toBeGreaterThan(0);
    const body = USECHAT.slice(i, i + 240);
    expect(body).toMatch(/rootConversations\.value\.filter/);
    expect(body).toMatch(/\.pinned/);
    // unpinned 与 pinned 必须互补（同一套过滤条件取反）
    const j = USECHAT.indexOf('const unpinnedRootConversations');
    expect(j).toBeGreaterThan(0);
    expect(USECHAT.slice(j, j + 200)).toMatch(/!c\.pinned/);
  });

  it('★ 分组可折叠（与空间分组同形态，长列表时不占屏）', () => {
    expect(SIDEBAR).toMatch(/togglePinnedCollapse/);
    expect(USECHAT).toMatch(/pinnedCollapsed/);
    expect(USECHAT).toMatch(/const togglePinnedCollapse/);
  });

  it('★ 分组内仍能「取消置顶」（否则置顶进去就出不来）', () => {
    // 取置顶组那段，确认里面有取消置顶的按钮
    const start = SIDEBAR.indexOf('tree-node tree-pinned');
    expect(start).toBeGreaterThan(0);
    const seg = SIDEBAR.slice(start, start + 3000);
    expect(seg).toMatch(/rows\.togglePinned\(conv\)/);
    expect(seg).toMatch(/取消置顶/);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 第二处：工作台任务列表（issues 备注明确写了「若改造需同步两处，
  // 避免只有侧边栏生效」—— 第一版确实只改了侧边栏，这处漏了）。
  // ══════════════════════════════════════════════════════════════════════════
  it('★★ 任务列表（TaskListSection）也有置顶分组，且只在有置顶项时插入', () => {
    expect(TASKLIST).toMatch(/__pinned__/);
    expect(TASKLIST).toMatch(/title: '置顶'/);
    // 只在有置顶项时插入（无置顶不占位）
    expect(TASKLIST).toMatch(/if \(pinnedConvs\.length > 0\)/);
  });

  it('★★ 任务列表：置顶项必须从原组排除（否则同一任务在置顶组与原组各出现一次）', () => {
    // ★★★ 断言必须查**语义**而不是"函数被调用"（2026-10-09 变异验证抓到本测试的漏洞）：
    //   第一版只断言 `unpinned(...)` 出现在原组调用处 —— 但变异把 `unpinned` 的**实现**
    //   改成恒等返回（不过滤），调用处一字未改，测试**照样绿**（8 passed，漏检）。
    //   ⇒ 必须直接断言 unpinned 的定义体里含 pinned 过滤。
    const def = TASKLIST.match(/const unpinned = \(list: any\[\]\) =>[^\n]*/);
    expect(def, '★ 未找到 unpinned 定义').toBeTruthy();
    expect(def![0], '★ unpinned 的定义里没有过滤掉已置顶项（恒等返回 = 置顶项会重复出现）')
      .toMatch(/!?c\.pinned/);
    // 且必须在两处原组（未归类 / 各空间）都被使用
    expect(TASKLIST).toMatch(/unpinned\(convs\.value\.filter\(\(c\) => !c\.spaceId\)\)/);
    expect(TASKLIST).toMatch(/unpinned\(convs\.value\.filter\(\(c\) => c\.spaceId === sp\.id\)\)/);
  });

  it('★ 任务列表：进某空间（有 spaceId 过滤）时不抽置顶组（与「当前目录」语义冲突）', () => {
    // pinnedConvs 只在无 sid 时收集
    expect(TASKLIST).toMatch(/const pinnedConvs = sid \? \[\] : convs\.value\.filter/);
  });
});