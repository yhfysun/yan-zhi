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
 *   ③ 分组内仍有「取消置顶」入口（否则置顶进去就出不来）；
 *   ④ ★★★ 置顶组必须在「任务」根节点【之外】（见文件末尾那条回归测试的注释 ——
 *      2026-10-09 用户实测「置顶点了没用」的根因就是它被放进了可折叠的根节点里）。
 *
 * ★★★ 第二处必须同步（2026-10-09 实测漏改）：
 *   issue 备注原话「同类实现参考 TaskListSection.vue 也已接好 pinned…若改造需同步两处，
 *   **避免只有侧边栏生效**」。第一版我只改了 ChatSidebar → 工作台任务列表里置顶仍是
 *   "混在普通任务里"（用户视角：改了但没生效）。
 *   ⇒ 本测试同时钉住两处，防再次只改一处。
 *
 * ★★★ 教训（2026-10-09 二次实测）：
 *   「分组补上了」≠「用户点置顶有反馈」。上轮 8 条测试全绿，用户却仍实测「点了没用」——
 *   因为测试只钉了**存在性**，没钉**位置**：把整块搬进折叠容器里，测试照样绿。
 *   ⇒ 守门测试要钉**用户可感知的语义**（"折叠时还在不在"），不是"代码里有没有这段"。
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
  // ★★★ 回归防线（2026-10-09 用户实测「置顶点了没用」的根因，必钉）：
  //   置顶组 v1 被塞进「任务」根节点的折叠容器 `.tree-children`（v-show="!rootCollapsed"）里。
  //   而 rootCollapsed 持久化在 localStorage:yz_conv_root_collapsed —— 用户把「任务」收起来后，
  //   置顶组跟着父容器一起 display:none：**数据写进库了，界面毫无变化**。
  //   实测：折叠态点置顶 → PATCH 200、库里 pinned=1，但置顶组 0x0 被隐藏 →
  //   用户看到「点了没反应」。这类回归**不报错、不抛异常**，只表现为"用户又说置顶没用"。
  //
  //   ★ 为什么上面 5 条测试漏检了它：那 5 条只断言"分组存在 / 数据互补 / 可折叠"，
  //     **没有一条钉住它在 DOM 中的位置** —— 所以把整块搬进折叠容器里，测试照样全绿。
  //     ⇒ 必须钉「置顶组在根节点**之外**」这个语义。
  // ══════════════════════════════════════════════════════════════════════════
  it('★★★ 置顶组必须在「任务」根节点【之外】（否则根节点一折叠，置顶就整个消失）', () => {
    const pinnedAt = SIDEBAR.indexOf('class="tree-node tree-pinned"');
    const rootAt = SIDEBAR.indexOf('class="tree-node tree-root"');
    expect(pinnedAt, '未找到置顶组容器').toBeGreaterThan(0);
    expect(rootAt, '未找到「任务」根节点').toBeGreaterThan(0);
    // 置顶组排在根节点**之前** ⇒ 二者是 .conv-tree 下的平级顶层节点，不是 root 的子内容
    expect(pinnedAt, '★ 置顶组被放到了「任务」根节点之后/之内 —— 根节点折叠时它会被一起隐藏（用户实测的「置顶点了没用」）')
      .toBeLessThan(rootAt);

    // 反向钉死：根节点的折叠子容器（v-show="!rootCollapsed"…）里**不得**出现置顶组。
    const collapseGate = SIDEBAR.indexOf('v-show="!rootCollapsed"');
    expect(collapseGate).toBeGreaterThan(0);
    const rootFirstChild = SIDEBAR.indexOf('v-for="conv in unpinnedRootConversations"');
    expect(rootFirstChild, '未找到根节点主列表').toBeGreaterThan(collapseGate);
    const insideRootChildren = SIDEBAR.slice(collapseGate, rootFirstChild);
    expect(insideRootChildren, '★ 置顶组出现在根节点的折叠容器内 —— 必须移到外面（与「任务」平级）')
      .not.toMatch(/tree-pinned/);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 视觉语义：置顶「状态标记」必须是**实心星**（2026-10-09 用户实测追问：
  //   「置顶状态选中了星星还是空心的？」）。
  //
  // ★ 为什么是实心：element-plus 的 `Star` 是**空心线框星**（SVG 路径含外轮廓 + 内部挖空
  //   两个子路径），`StarFilled` 才是实心。置顶是**状态**，实心 = "已选中"，
  //   空心 = "未选中/可点击"—— 用空心星表达"已置顶"在语义上是反的，观感也很弱。
  // ★ 但**入口/标题**保留空心 Star（不是状态标记）：
  //   · 分组标题「置顶」的图标要与同级的「任务」/各空间图标统一为线框风格；
  //   · 右键菜单项是"置顶 ⇄ 取消置顶"双向入口，不是状态指示。
  // ══════════════════════════════════════════════════════════════════════════
  it('★★ 置顶行的状态星标必须是实心 StarFilled（空心 Star 表达"已置顶"是反语义）', () => {
    // 列表行里的状态标记：pin-icon / tls-pin 必须用 StarFilled
    const statusStars = [
      /<el-icon class="pin-icon"[^>]*><StarFilled \/><\/el-icon>/,   // 侧栏置顶组行 / 主列表行
      /<el-icon v-if="c\.pinned" class="tls-pin"><StarFilled \/><\/el-icon>/, // 工作台列表行
    ];
    expect(SIDEBAR, '★ 侧栏置顶行的状态星标必须是 StarFilled（空心 = 看不出"已置顶"）')
      .toMatch(statusStars[0]);
    expect(TASKLIST, '★ 工作台任务列表置顶行的状态星标必须是 StarFilled')
      .toMatch(statusStars[1]);
    // 反向：置顶**状态标记**处不得再出现空心 Star
    expect(SIDEBAR, '★ 状态标记处仍是空心 Star —— 置顶后看不出被选中').not.toMatch(/class="pin-icon"[^>]*><Star \/><\/el-icon>/);
    expect(TASKLIST, '★ 状态标记处仍是空心 Star').not.toMatch(/class="tls-pin"><Star \/><\/el-icon>/);
    // 两边都必须真的 import 了 StarFilled（漏 import 会编译报错，这里提前兜住）
    expect(SIDEBAR).toMatch(/import[\s\S]{0,200}StarFilled[\s\S]{0,200}from '@element-plus\/icons-vue'/);
    expect(TASKLIST).toMatch(/import[\s\S]{0,200}StarFilled[\s\S]{0,200}from '@element-plus\/icons-vue'/);
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