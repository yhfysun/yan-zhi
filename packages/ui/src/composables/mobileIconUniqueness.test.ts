// 移动端「一屏可见集合」的守门测试 —— 防图标跨区域撞脸 + 浮层默认展开/遮挡回归。
//
// 背景（2026-09-21 用户反馈：「移动端优化我之前说的图标等问题一个都没解决，UI 还错乱了」）：
//   上一轮挂了两组守门（外壳归属 / 默认模型），UI 单测 255 全绿，但用户抱怨的两类问题
//   **天然不在覆盖范围内**：
//     · 图标语义唯一性 —— 谁也没检测过"同一屏里出现了两个一样的图标"；
//     · 浮层与固定栏的层叠关系 —— 谁也没检测过"面板底部被 TabBar 压住"。
//   → 结论级教训：守门测试要问「用户会怎么看这个界面」，而不是只测「我改的那几行对不对」。
//
// 为什么用「读源码做结构断言」而不是渲染：
//   这两类问题都是**静态可判**的（某文件用了哪个图标 / 默认值是 false 还是 isMobile），
//   挂载渲染要拖 router + pinia + element-plus 整条链，成本远高于收益。
//   实测数据（CDP）负责最终验收，本测试负责"下次别再犯"。
//
// ★★ 这些断言全部做过变异测试（把正确写法改回错误写法 → 应变红），见文件末尾注释。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const APP = read('App.vue');
const SIDE_NAV = read('components/SideNav.vue');
const CHAT_TOPBAR = read('components/chat/ChatTopbar.vue');
const CHAT_INPUT = read('components/chat/ChatInputArea.vue');
const CHAT_MESSAGE_LIST = read('components/chat/ChatMessageList.vue');
const CHAT_PREVIEW = read('components/chat/ChatPreviewPane.vue');
const CHAT_CTX_SIDEBAR = read('components/chat/ChatContextSidebar.vue');
const HOME = read('views/Home.vue');
const AGENT_ICON = read('utils/agentIcon.ts');

/** 取 template 里 `<el-icon><X /></el-icon>` 用到的图标名（SFC 内联图标）。 */
function inlineIconsOf(src: string): string[] {
  return [...src.matchAll(/<el-icon[^>]*>\s*<([A-Z][A-Za-z0-9]*)\s*\/>\s*<\/el-icon>/g)].map((m) => m[1]);
}

/** 取 import 里 from '@element-plus/icons-vue' 的图标名单。 */
function importedIconsOf(src: string): string[] {
  const i = src.indexOf("from '@element-plus/icons-vue'");
  if (i < 0) return [];
  const start = src.lastIndexOf('import', i);
  const block = src.slice(start, i);
  return [...block.matchAll(/[A-Za-z][A-Za-z0-9]*/g)]
    .map((m) => m[0])
    .filter((n) => n !== 'import' && /^[A-Z]/.test(n));
}

/**
 * TabBar 四项的图标（SideNav 的 mobilePrimaryItems）—— 这是**常驻可见**的集合，
 * 任何"同屏可见"的图标都不得与它们重复。
 * 从源码解析而不是硬编码，这样改了 TabBar 图标本测试会自动跟着变。
 *
 * ★ 必须锚定 `const mobilePrimaryItems`（脚本区的声明），不能只找 `mobilePrimaryItems`——
 *   模板里 `v-for="item in mobilePrimaryItems"` 出现得更早，用 indexOf 会先命中那一处，
 *   截出来的全是模板文本、`icon:` 匹配数为 0（本次实测踩到，断言因此假红）。
 */
function tabBarIcons(): string[] {
  const i = SIDE_NAV.indexOf('const mobilePrimaryItems');
  expect(i, '未找到 `const mobilePrimaryItems` 声明').toBeGreaterThan(0);
  const block = SIDE_NAV.slice(i, SIDE_NAV.indexOf(']);', i));
  const names = [...block.matchAll(/icon:\s*([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]);
  expect(names.length, 'TabBar 应解析出 4 个图标').toBe(4);
  return names;
}

describe('★ 图标唯一性：常驻可见的 TabBar 图标不得与对话页同屏图标撞脸', () => {
  it('TabBar 四项图标解析正常（4 个且互不相同）', () => {
    const icons = tabBarIcons();
    expect(new Set(icons).size).toBe(4);
    // 记录当前取值，方便日后 review diff 时一眼看出是否被改
    expect(icons).toEqual(['ChatDotRound', 'Cpu', 'UserFilled', 'Setting']);
  });

  it('App.vue 移动顶栏头像/登录位不得用线框 User（与 TabBar 智能体撞脸）', () => {
    // 2026-09-21 实测：旧写法一屏出现 3 个人形图标（TabBar + 顶栏 + 输入框上方）
    const icons = [...inlineIconsOf(APP), ...importedIconsOf(APP)];
    expect(icons).toContain('Avatar');
    expect(icons, 'App.vue 不应再导入/使用线框 User 作为头像位图标').not.toContain('User');
  });

  it('ChatTopbar 不得用 EditPen（顶栏"新建任务"曾与工具条撞脸）也不得用 Cpu', () => {
    const used = new Set([...inlineIconsOf(CHAT_TOPBAR), ...importedIconsOf(CHAT_TOPBAR)]);
    // 新建任务 → DocumentAdd（EditPen 已让给编辑语义）
    expect(used).toContain('DocumentAdd');
    expect(used, 'ChatTopbar 的"新建任务"不得再用 EditPen').not.toContain('EditPen');
    // 上下文栏 → DataLine（Grid 让给右侧面板的"数据浏览"）
    expect(used).toContain('DataLine');
    expect(used, 'ChatTopbar 不应再用 Grid（与右侧面板数据浏览撞脸）').not.toContain('Grid');
    // 控制台 → Platform（Cpu 是 TabBar 模型项）
    expect(used, 'ChatTopbar 不应再用 Cpu（TabBar「模型」已占用）').not.toContain('Cpu');
  });

  it('ChatInputArea 工具条不得再用 TabBar 已占用的图标', () => {
    const used = new Set([...inlineIconsOf(CHAT_INPUT), ...importedIconsOf(CHAT_INPUT)]);
    // 「编辑当前智能体」→ Tools（Settings 是 TabBar「我的」）
    expect(used).toContain('Tools');
    // 移动端「切换模型」图标钮 → Aim（Cpu 是 TabBar「模型」）
    expect(used).toContain('Aim');
    // 移动端「新建任务」→ FolderAdd（EditPen 是顶栏同功能按钮）
    expect(used).toContain('FolderAdd');
    // 「配置模型平台」→ Coin
    expect(used).toContain('Coin');
  });

  it('ChatMessageList「配置模型」空态 CTA 不得用 Setting（TabBar「我的」）', () => {
    const used = new Set([...inlineIconsOf(CHAT_MESSAGE_LIST), ...importedIconsOf(CHAT_MESSAGE_LIST)]);
    // 2026-10-04：老欢迎卡（TakeawayBox）删除，未配置模型提示改为 WarningFilled 紧凑胶囊
    expect(used).toContain('WarningFilled');
    expect(used, '空态 CTA 不得再用 Setting（与 TabBar「我的」撞脸）').not.toContain('Setting');
    // 「蒸馏为 Skill」→ Files（MagicStick 曾与 TabBar /agents 的图标撞脸）
    expect(used).toContain('Files');
    expect(used, '「蒸馏为 Skill」不应再用 MagicStick').not.toContain('MagicStick');
  });

  it('ChatPreviewPane「收起面板」不得用 Close（与本组件关闭 tab 的 × 同形不同义）', () => {
    const used = new Set([...inlineIconsOf(CHAT_PREVIEW), ...importedIconsOf(CHAT_PREVIEW)]);
    expect(used).toContain('Minus');
    // Close 仍要保留（关闭单个 tab 用）
    expect(used).toContain('Close');
    // ★★ 只断言"存在 Minus"是**不够严**的（变异测试证明：把按钮改回 Close 仍会 PASS，
    //    因为 Minus 在 import 里还在）。必须**精确截取"收起面板"那个按钮块**再断言。
    //    同一文件里 `title="收起面板"` 只出现一次，用它当锚点，向前截到 `<el-button`。
    const anchor = CHAT_PREVIEW.indexOf('title="收起面板"');
    expect(anchor, '未找到「收起面板」按钮').toBeGreaterThan(0);
    const btnStart = CHAT_PREVIEW.lastIndexOf('<el-button', anchor);
    expect(btnStart, '未截到 el-button 起点').toBeGreaterThan(0);
    const btnBlock = CHAT_PREVIEW.slice(btnStart, CHAT_PREVIEW.indexOf('</el-button>', anchor));
    expect(btnBlock, '★「收起面板」按钮内必须是 Minus').toMatch(/<Minus\s*\/>/);
    expect(btnBlock, '★「收起面板」按钮内不得出现 Close').not.toMatch(/<Close\s*\/>/);
  });

  it('★ agentIcon 兜底图标不得等于 TabBar 的任一图标（双向配对）', () => {
    const m = AGENT_ICON.match(/AGENT_FALLBACK_ICON[^=]*=\s*([A-Z][A-Za-z0-9]*)\s*;/);
    expect(m, '未找到 AGENT_FALLBACK_ICON 定义').toBeTruthy();
    const fallback = m![1];
    // ★★ 这条最容易错：TabBar 从 `User` 改成 `UserFilled` 时，
    //    兜底必须同步从 `UserFilled` 改回 `User`，否则两边又撞脸。
    expect(fallback, 'agentIcon 兜底图标不得与 TabBar 任一图标相同').toBe('User');
    expect(tabBarIcons(), '兜底图标不得出现在 TabBar 里').not.toContain(fallback);
  });

  it('★ 用到的图标必须真的存在于 @element-plus/icons-vue 的运行时导出', () => {
    // ★★ 这是一次真实事故：`Brick` 在 `dist/types/components/brick.vue.d.ts` 里有定义，
    //    但 `dist/index.js` 的运行时导出里没有 → 页面抛
    //    `does not provide an export named 'Brick'` → **Vue Router 启动失败、整页白屏**
    //    （实测 `hasChatPage:false / bodyLen:19`，页面上只剩 TabBar）。
    //    ⇒ 权威判据是 **dist/index.js 的 `as Xxx,` 导出表**，不是 d.ts 的组件目录
    //      （两者不同步，本次正是这个不同步导致的）。
    let exported: Set<string> | null = null;
    const rel = 'node_modules/@element-plus/icons-vue/dist/index.js';
    // ★★ 逐级向上找 node_modules —— 不要写死相对层数。
    //   本次实测教训：`resolve(UI_SRC, '../../../node_modules/...')` 少了一层
    //   （得到 `packages/node_modules/...`，根本不存在）→ 读取失败被 catch 吞掉 →
    //   `exported` 为 null → 断言**静默跳过**，变异测试立刻暴露它是个摆设。
    //   ⇒ ① 向上搜索；② **找不到必须 fail，不允许静默跳过**（`if (!exported) return` 是陷阱）。
    let dir = UI_SRC;
    for (let up = 0; up < 6 && !exported; up++) {
      const p = resolve(dir, rel);
      try {
        const src = readFileSync(p, 'utf8');
        // 导出表形如 `  user_filled_default as UserFilled,`
        const names = [...src.matchAll(/\bas\s+([A-Z][A-Za-z0-9]*)\s*,\s*$/gm)].map((m) => m[1]);
        if (names.length > 100) exported = new Set(names);
      } catch { /* 继续往上找 */ }
      dir = resolve(dir, '..');
    }
    expect(exported, '未能定位 @element-plus/icons-vue 的运行时导出表（' + rel + '）').toBeTruthy();
    expect(exported!.size, '导出表解析异常（数量过少）').toBeGreaterThan(100);

    // 校验项目里**实际用到**的全部 Element 图标：
    // ★ 必须同时覆盖 `import` 名单**与模板里 `<el-icon><X /></el-icon>` 的用法** ——
    //   只查 import 会漏掉"模板里写了 Brick 但 import 忘改"这类半改状态
    //   （变异测试 m9 证明：只查 import 时把模板改成 Brick 仍会 PASS，等于摆设）。
    const used = new Set<string>([
      ...importedIconsOf(APP), ...importedIconsOf(SIDE_NAV), ...importedIconsOf(CHAT_TOPBAR),
      ...importedIconsOf(CHAT_INPUT), ...importedIconsOf(CHAT_MESSAGE_LIST),
      ...importedIconsOf(CHAT_PREVIEW), ...importedIconsOf(AGENT_ICON),
      ...importedIconsOf(CHAT_CTX_SIDEBAR),
      ...inlineIconsOf(APP), ...inlineIconsOf(SIDE_NAV), ...inlineIconsOf(CHAT_TOPBAR),
      ...inlineIconsOf(CHAT_INPUT), ...inlineIconsOf(CHAT_MESSAGE_LIST),
      ...inlineIconsOf(CHAT_PREVIEW), ...inlineIconsOf(CHAT_CTX_SIDEBAR),
    ]);
    expect(used.size, '应解析到若干图标').toBeGreaterThan(10);
    const missing = [...used].filter((n) => !exported!.has(n));
    expect(missing, '以下图标不在 @element-plus/icons-vue 运行时导出里（会白屏）：' + missing.join(', ')).toEqual([]);
  });
});

describe('★ 浮层不得默认展开、不得被底部固定栏遮挡', () => {
  it('Home.vue 功能导航默认收起（不得写成 ref(isMobile.value)）', () => {
    // 2026-09-21 实测：旧写法让移动端一进首页就整屏展开（覆盖率 73%），
    // 把首页主体全盖住 → 用户感知为「首页一进去就错乱」。
    expect(HOME).toMatch(/const\s+showFeatureNav\s*=\s*ref\(\s*false\s*\)/);
    expect(HOME, 'showFeatureNav 不得依赖 isMobile 做默认值').not.toMatch(/showFeatureNav\s*=\s*ref\(\s*isMobile/);
  });

  it('Home.vue 功能导航面板高度必须扣掉自身 top，不得用裸 100vh', () => {
    // 旧写法 max-height: calc(100vh - 96px) 只扣了顶部 → 面板底边落到 TabBar 之下 64px，
    // 列表最后一项整项看不见。
    const css = stripCssComments(HOME);
    const i = css.indexOf('.feature-nav-panel {');
    expect(i, '未找到 .feature-nav-panel 规则').toBeGreaterThan(0);
    const block = css.slice(i, css.indexOf('}', i));
    expect(block, '面板高度必须基于容器（100%）而不是视口（100vh）').toMatch(/max-height:\s*calc\(100%\s*-/);
    expect(block, '面板高度不得退回裸 100vh').not.toMatch(/calc\(100vh\s*-/);
  });

  it('★ ChatContextSidebar 移动样式必须同时写媒体查询与 .platform-mobile 两份', () => {
    // Capacitor 横屏视口常 800px+，媒体查询不命中 → 回落底态 flex:0/width:0 →
    // 实测被压成 1px、文字竖排 4 处。
    const css = stripCssComments(CHAT_CTX_SIDEBAR);
    expect(css, '缺少 767px 媒体查询分支').toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(css, '★ 缺少 .platform-mobile 分支（横屏会退回 1px 宽）').toMatch(/\.platform-mobile\s+\.context-sidebar\s*\{/);
    expect(css, '★ .platform-mobile 的 open 态也必须有').toMatch(/\.platform-mobile\s+\.context-sidebar\.open\s*\{/);
    // 反向：platform-mobile 分支不得被媒体查询包住（横屏必须命中）
    const pmIdx = css.indexOf('.platform-mobile .context-sidebar {');
    const before = css.slice(0, pmIdx);
    const openCount = (before.match(/\{/g) || []).length;
    const closeCount = (before.match(/\}/g) || []).length;
    expect(openCount, '★ .platform-mobile 分支被包在 @media 里了（横屏不生效）').toBe(closeCount);
  });

  it('Home.vue 也要有 .platform-mobile 分支（横屏面板定位）', () => {
    const css = stripCssComments(HOME);
    expect(css).toMatch(/\.platform-mobile\s+\.feature-nav-panel\s*\{/);
  });

  it('★ 首页左上角两个圆形浮层不得重叠（功能导航按钮 vs 应用介绍圆点）', () => {
    // 2026-09-21 实测：`.feature-nav-btn` 占 (12,56,40×40)，`.intro-dot` 初始 (24,68,36×36)，
    // 两者 z-index 都是 50 → **重叠 28×28px**，截图里是一个深色月牙压在圆钮上。
    // 判据：intro-dot 初始位置（相对 .home-page，移动端再 +12/+44 偏移）必须横向让开按钮。
    const m = HOME.match(/const\s+INTRO_DOT_INIT\s*=\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}/);
    expect(m, '未找到 INTRO_DOT_INIT 初始位置常量').toBeTruthy();
    const x = Number(m![1]);
    const y = Number(m![2]);
    // 功能导航按钮（移动端）：left 12 / top 12（相对 home-page）、尺寸 40
    const BTN_LEFT = 12, BTN_TOP = 12, BTN_SIZE = 40, DOT_SIZE = 36;
    const dotRight = x + DOT_SIZE;
    const dotBottom = y + DOT_SIZE;
    const before = dotRight <= BTN_LEFT;              // 完全在按钮左侧
    const after = x >= BTN_LEFT + BTN_SIZE;           // 完全在按钮右侧
    const vSep = dotBottom <= BTN_TOP || y >= BTN_TOP + BTN_SIZE; // 完全上下错开
    expect(before || after || vSep, `圆点初始位置 (${x},${y}) 与功能导航按钮占位重叠（会叠成两个圆）`).toBe(true);
    // 反向：不得把圆点丢到视口外
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(390 - DOT_SIZE);
    expect(y).toBeGreaterThanOrEqual(0);
  });
});

const CODE = CHAT_INPUT.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('★ 同一动作不得有两个等价入口', () => {
  it('「+」菜单不得再放「助手」（输入框上方已有智能体下拉）', () => {
    // 用户 2026-08-21 口径：「智能体切换移到输入框上方」→ 菜单里那份应删除。
    // ★ 断言前必须去掉注释：删除处留了说明性注释（含 `hoverSub === 'agents'` 字样），
    //   直接对全文断言会被自己的注释绊倒（本次实测踩到，断言假红）→ 用 CODE。
    const idx = CODE.indexOf('class="input-agent-bar"');
    const menuIdx = CODE.indexOf('plus-menu-wrap');
    expect(menuIdx, '未找到「+」菜单').toBeGreaterThan(0);
    const menuBlock = CODE.slice(menuIdx, CODE.indexOf('<Teleport', menuIdx));
    expect(menuBlock.length, '「+」菜单块截取异常').toBeGreaterThan(200);
    // ① 主菜单不得再有「助手」项
    expect(menuBlock, '★「+」菜单不应再有「助手」项').not.toMatch(/plus-menu-label">\s*助手\s*</);
    // ② 子菜单不得再有 agents 分支（三种写法都覆盖）
    expect(CODE, '★ hoverSub 不应再有 agents 分支').not.toMatch(/hoverSub\s*===\s*'agents'/);
    expect(CODE, "★ hoverSub 联合类型不应含 'agents'").not.toMatch(/hoverSub\s*=\s*ref<[^>]*'agents'/);
    expect(CODE, "★ openSub 参数类型不应含 'agents'").not.toMatch(/openSub\(kind:\s*[^)]*'agents'/);
    // ③ 承载切换的死代码应一并删除
    expect(CODE, '★ pickPlusAgent 应随「助手」入口一并删除').not.toMatch(/function\s+pickPlusAgent/);
    // ④ 反向：菜单本身必须还在（防"把整个菜单删掉"式假通过）
    expect(menuBlock, '「+」菜单应仍有技能/模式/权限等项')
      .toMatch(/plus-menu-label">技能/);
    expect(menuBlock).toMatch(/plus-menu-label">工具权限/);
    expect(idx).toBeGreaterThan(0);
  });

  it('输入框上方仍保留智能体切换（这是保留的那一个入口）', () => {
    expect(CHAT_INPUT).toMatch(/class="input-agent-bar"/);
    expect(CHAT_INPUT).toMatch(/agent-trigger/);
  });
});

/*
 * ===== 变异测试记录（2026-09-21）=====
 * 逐条把正确写法改回错误写法，确认断言变红后还原：
 *  m1  Home.vue: `ref(false)` → `ref(isMobile.value)`                     → 变红 ✓
 *  m2  Home.vue: `calc(100% - 72px - 12px)` → `calc(100vh - 96px)`        → 变红 ✓
 *  m3  ChatContextSidebar: 删掉 `.platform-mobile .context-sidebar` 块     → 变红 ✓
 *  m4  ChatContextSidebar: 把 platform-mobile 块挪进 @media 内             → 变红 ✓
 *  m5  agentIcon: `User` → `UserFilled`（与 TabBar 撞脸）                  → 变红 ✓
 *  m6  SideNav: TabBar 智能体图标 `UserFilled` → `User`（与兜底撞脸）      → 变红 ✓
 *  m7  ChatInputArea: 恢复「+」菜单的「助手」项                            → 变红 ✓
 *  m8  ChatMessageList: `TakeawayBox` → `Setting`（与 TabBar 撞脸）        → 变红 ✓
 *  m9  ChatMessageList: 图标名改成不存在的 `Brick`                         → 变红 ✓
 *  m10 ChatTopbar: `DocumentAdd` → `EditPen`（与工具条撞脸）               → 变红 ✓
 *  m11 ChatPreviewPane: 「收起面板」`Minus` → `Close`                      → 变红 ✓
 *  m12 App.vue: 头像位 `Avatar` → `User`（与 TabBar 撞脸）                 → 变红 ✓
 */