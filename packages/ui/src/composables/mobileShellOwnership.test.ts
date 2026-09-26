// 移动外壳「归谁渲染」的守门测试 —— 防「双标题栏 / 双套导航」回归。
//
// 背景（2026-09-20 修的适配 bug）：
//   `useMobileShell()` 是「视口窄 **或** Capacitor」的并集，这点没错（Capacitor 横屏要保 TabBar）。
//   但桌面端与 Web 端的根组件（apps/desktop|web/src/App.vue）**无条件**渲染 WebTopBar（36px），
//   而共享壳 packages/ui/App.vue 在视口 <768px 时也切进「移动外壳」——
//   于是窄窗口里同时出现两套顶部导航 + 两套底部导航：
//     · `.mobile-topbar`（48px，标题）被外层 `.title-bar`（36px）压住，文字重叠；
//     · `.tab-bar` 与 52px dock 指向同一批路由，语义重复；
//     · `@media(max-width:767px)` 里给 `.main-content` 留了 48px 顶 + 56px 底，
//       而真正在位的 WebTopBar 只有 36px，顶部多留 12px 白、底部白留 56px。
//
// 修正口径（本测试钉住的契约）：
//   1) **自绘顶栏/底栏只归 Capacitor 端** —— 桌面/Web 的窄窗只是窄窗降级，不是移动端。
//   2) `isMobile`（并集语义）保留给「按触摸交互渲染」用（TabBar 项筛选、插件 when='mobile'）。
//   3) 内容区留白只由 `.platform-mobile` 承担，**不能**再出现在媒体查询里。
//
// 为什么用「读源码做结构断言」而不是渲染组件：本页面的 bug 是**模板门控条件写错**
// 与**样式作用域放错**，两者都是静态结构问题；挂载渲染要拖进 WebTopBar / router / pinia
// 一整条依赖链，成本远高于收益，且本仓已有同类先例（snip-overlay 的 CSS 解析守门）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');

const APP = read('App.vue');
const SIDE_NAV = read('components/SideNav.vue');

/** 去掉 CSS 注释，避免注释里的示例代码/历史说明干扰断言。 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('移动外壳归属：自绘顶栏/底栏仅 Capacitor 端', () => {
  it('App.vue：mobile-topbar 由 mobileShellAsRoot 门控，不得用 isMobile', () => {
    // 找出 mobile-topbar 那一行，断言它的 v-if 条件
    const line = APP.split('\n').find((l) => l.includes('class="mobile-topbar"'));
    expect(line, '未找到 .mobile-topbar 的模板节点').toBeTruthy();
    expect(line).toContain('mobileShellAsRoot');
    // ★ 关键：绝不能是裸 isMobile（那会让桌面/Web 窄窗也画这条栏）
    expect(line).not.toMatch(/v-if="isMobile[\s&]/);
    expect(line).not.toMatch(/v-if="isMobile"/);
  });

  it('App.vue：mobileShellAsRoot 取自平台（Capacitor），不是视口宽度', () => {
    // 必须存在该常量定义，且值来自 usePlatform 的 isMobile
    expect(APP).toMatch(/const\s+mobileShellAsRoot\s*=\s*isMobilePlatform\s*;/);
    expect(APP).toMatch(/isMobile:\s*isMobilePlatform/);
    // 反向：不允许它退化成 useMobileShell / useIsMobile 的返回值
    expect(APP).not.toMatch(/const\s+mobileShellAsRoot\s*=\s*use(MobileShell|IsMobile)/);
  });

  it('App.vue：isMobile 仍保留并集语义（Capacitor 横屏的 TabBar/触摸形态不能丢）', () => {
    expect(APP).toMatch(/const\s+isMobile\s*=\s*useMobileShell\(\)/);
  });

  it('SideNav.vue：tab-bar 由平台门控（platformMobile），不得用 isMobile', () => {
    const line = SIDE_NAV.split('\n').find((l) => l.includes('class="tab-bar"'));
    expect(line, '未找到 .tab-bar 的模板节点').toBeTruthy();
    // tab-bar 是 `<nav v-if="...">`，条件在上一行可能出现；两行合起来找
    const idx = SIDE_NAV.indexOf('class="tab-bar"');
    const around = SIDE_NAV.slice(Math.max(0, idx - 200), idx + 40);
    expect(around).toContain('platformMobile');
    expect(around).not.toMatch(/v-if="isMobile"/);
    // 平台 isMobile 必须从 usePlatform 解构出来
    expect(SIDE_NAV).toMatch(/isMobile:\s*platformMobile/);
  });

  it('App.vue：.main-content 的 48px/56px 外壳留白只在 .platform-mobile，媒体查询里不许有', () => {
    const css = stripCssComments(APP);

    // 取出所有 @media (max-width: 767px) 块
    const blocks: string[] = [];
    const re = /@media\s*\(max-width:\s*767px\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      let i = m.index + m[0].length - 1;
      let depth = 0;
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') { depth--; if (depth === 0) break; }
      }
      blocks.push(css.slice(start, i + 1));
    }
    expect(blocks.length, '未找到 767px 媒体查询块').toBeGreaterThan(0);

    // ★ 只针对「内容区」留白断言。
    //   弹窗（.el-overlay-dialog）的 48/56 是**弹窗避让**，居中后多 12px 边距无害，
    //   不在本契约范围内 —— 本契约管的是「内容区凭空多出一截空白 + 底栏白留」。
    for (const b of blocks) {
      const mcRules = b.match(/\.main-content[^{]*\{[^}]*\}/g) || [];
      for (const r of mcRules) {
        expect(r, '767px 媒体查询给 .main-content 加了 48px 顶留白（桌面/Web 窄窗会多出一截空白）')
          .not.toMatch(/calc\(48px\s*\+\s*env/);
        expect(r, '767px 媒体查询给 .main-content 加了 56px 底留白（TabBar 不在这端渲染，会白留一截）')
          .not.toMatch(/calc\(56px\s*\+\s*env/);
      }
    }

    // 正向：Capacitor 分支必须对 .main-content 施加这两条留白（横屏视口宽也要生效）
    expect(css).toMatch(/\.platform-mobile\s+\.main-content\s*\{[\s\S]*?calc\(48px\s*\+\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/\.platform-mobile\s+\.main-content\s*\{[\s\S]*?calc\(56px\s*\+\s*env\(safe-area-inset-bottom/);
  });

  it('App.vue：.platform-mobile 的留白分支不得被媒体查询包裹（横屏必须命中）', () => {
    const css = stripCssComments(APP);
    // 找到 .platform-mobile .main-content 规则的位置，确认它不在任何 @media 块内
    const ruleIdx = css.indexOf('.platform-mobile .main-content {');
    expect(ruleIdx, '未找到 .platform-mobile .main-content 规则').toBeGreaterThan(-1);
    // 统计该位置之前未闭合的 @media 块数
    const before = css.slice(0, ruleIdx);
    const opens = (before.match(/@media[^{]*\{/g) || []).length;
    let closes = 0;
    const re = /@media\s*\([^)]*\)\s*\{/g;
    let m: RegExpExecArray | null;
    // 简化：用花括号净深度判断（样式表里 @media 之外没有裸花括号块）
    let depth = 0;
    for (const ch of before) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    expect(depth, '.platform-mobile 留白被包在 @media 里了（Capacitor 横屏会失效）').toBe(0);
    expect(opens).toBeGreaterThanOrEqual(0);
    expect(closes).toBe(0);
  });

  it('App.vue：外壳高度必须走变量，留白与栏高同源', () => {
    const css = stripCssComments(APP);
    // 变量定义必须存在（.app-shell 上）
    expect(css, '缺少 --mobile-topbar-h 定义').toMatch(/--mobile-topbar-h:\s*44px/);
    expect(css, '缺少 --mobile-tabbar-h 定义').toMatch(/--mobile-tabbar-h:\s*56px/);
    // 顶栏与底部留白都必须消费变量 —— 写死数值就是「改栏高忘改留白」的复发路径
    expect(css, '.mobile-topbar 高度没走变量')
      .toMatch(/\.mobile-topbar\s*\{[\s\S]*?height:\s*var\(--mobile-topbar-h/);
    expect(css, '.platform-mobile 顶部留白没走变量')
      .toMatch(/padding-top:\s*calc\(var\(--mobile-topbar-h[\s\S]*?env\(safe-area-inset-top/);
    expect(css, '.platform-mobile 底部留白没走变量')
      .toMatch(/padding-bottom:\s*calc\(var\(--mobile-tabbar-h[\s\S]*?env\(safe-area-inset-bottom/);
    // TabBar 高度同样走变量（在 SideNav 里）
    const side = stripCssComments(SIDE_NAV);
    expect(side, '.tab-bar 高度没走变量')
      .toMatch(/\.tab-bar\s*\{[\s\S]*?height:\s*var\(--mobile-tabbar-h/);
  });

  it('App.vue：移动端隐藏页内大标题（避免与顶栏标题重复）', () => {
    const css = stripCssComments(APP);
    expect(css, '缺少 .platform-mobile .page-title 隐藏规则（会与顶栏标题同屏重复）')
      .toMatch(/\.platform-mobile\s+\.page-title\s*\{\s*display:\s*none/);
    // ★ 副标题必须保留：那是有信息量的说明文字，不是重复
    expect(css, '误把 .page-sub 也隐藏了（副标题应保留）')
      .not.toMatch(/\.platform-mobile\s+\.page-sub\s*\{\s*display:\s*none/);
  });

  it('SideNav.vue：TabBar 四项为 任务/模型平台/智能体平台/我的（key 不得用 path）', () => {
    // 用户拍板（2026-09-21）：底部四项 = 任务 / 模型平台 / 智能体平台 / 我的
    for (const label of ['任务', '模型平台', '智能体平台', '我的']) {
      expect(SIDE_NAV, `TabBar 缺少「${label}」项`).toContain(`label: '${label}'`);
    }
    // 已移除的项不得复活（文件/消息曾是旧方案）
    expect(SIDE_NAV, 'TabBar 又出现「文件」项（已改为模型平台/智能体平台）')
      .not.toContain("label: '文件'");
    // ★ 两项的 path 都是空串（「我的」无路由），若拿 path 当 v-for key 会撞车少渲染一项
    expect(SIDE_NAV, 'TabBar 的 v-for key 必须用 item.key')
      .toMatch(/:key="item\.key"/);
  });
});

describe('移动端输入框：工具条精简 + 可展开', () => {
  const CHAT_CSS2 = stripCssComments(read('views/chat.css'));
  const INPUT = read('components/chat/ChatInputArea.vue');

  it('★ 移动端隐藏右侧的权限胶囊与模型胶囊（功能已搬走）', () => {
    // 媒体查询分支
    expect(CHAT_CSS2, '767px 分支未隐藏 perm-select-btn')
      .toMatch(/@media \(max-width: 767px\)[\s\S]*?\.perm-select-btn\s*\{\s*display:\s*none/);
    expect(CHAT_CSS2, '767px 分支未隐藏 model-select-btn')
      .toMatch(/@media \(max-width: 767px\)[\s\S]*?\.model-select-btn\s*\{\s*display:\s*none/);
    // Capacitor 分支（横屏兜底）
    expect(CHAT_CSS2, 'platform-mobile 分支未隐藏两个胶囊（横屏会退回两行按钮）')
      .toMatch(/\.platform-mobile \.toolbar-right > \.perm-select-btn[\s\S]{0,200}?display:\s*none/);
  });

  it('★ 权限已收进 + 菜单（不得再有独立的移动端权限按钮）', () => {
    expect(INPUT, '+ 菜单缺少「工具权限」项（用户拍板权限收进加号）')
      .toMatch(/plus-menu-label">工具权限/);
    // 复用同一个 store.permissionMode，不另建状态
    expect(INPUT).toMatch(/PERMISSION_OPTIONS[\s\S]{0,400}?onPermissionChange/);
  });

  it('★ 移动端有独立的「切换模型」按钮（右侧胶囊隐藏后的唯一入口）', () => {
    expect(INPUT, 'toolbar-mobile-selects 缺移动端模型按钮')
      .toMatch(/mobile-model-btn/);
    // ★★ 契约已更新（2026-09-22）：移动端与桌面端**不能共用** visible。
    //   旧断言写的是"与桌面端模型浮层共用同一 visible，避免两种真相"——那个口径
    //   恰恰制造了「点一次弹两个窗」：el-popover 内容 Teleport 到 body，
    //   不受父容器 display:none 影响，两个 popover 共用 visible 就会同时打开。
    //   现在移动端用独立的 mobileModelPopOpen，且两者 v-if 互斥。
    expect(INPUT, '移动端模型钮应绑 mobileModelPopOpen')
      .toMatch(/v-model:visible="mobileModelPopOpen"[\s\S]{0,400}?mobile-model-btn/);
    // 反向：移动端按钮不能再绑桌面端那个 visible
    expect(INPUT, '移动端模型钮不得绑桌面端 modelPopOpen')
      .not.toMatch(/v-model:visible="modelPopOpen"[\s\S]{0,400}?mobile-model-btn/);
    // 两个入口必须 v-if 互斥（只靠 CSS 隐藏无效）
    expect(INPUT, 'toolbar-mobile-selects 应只在移动壳下渲染').toMatch(/v-if="isMobileShell"[\s\S]{0,80}?toolbar-mobile-selects/);
    expect(INPUT, '桌面端模型胶囊应在非移动壳下渲染').toMatch(/v-if="!isMobileShell"[\s\S]{0,120}?modelPopOpen/);
  });

  it('★ 输入框默认 1 行、聚焦后展开；桌面端恒定 3~12 行', () => {
    expect(INPUT, '未定义 inputAutosize').toMatch(/const inputAutosize = computed/);
    // 移动端收起态是 1 行
    expect(INPUT, '收起态不是 1 行').toMatch(/minRows:\s*1,\s*maxRows:\s*1/);
    // 桌面端保持 3~12
    expect(INPUT, '桌面端行数被改动（应恒为 3~12）').toMatch(/minRows:\s*3,\s*maxRows:\s*12/);
    // 聚焦/失焦钩子接上了
    expect(INPUT).toMatch(/@focus="onInputFocus"/);
    expect(INPUT).toMatch(/@blur="onInputBlur"/);
    // 移动判定必须含 Capacitor 平台分支（否则横屏视口 800px+ 判不出移动端）
    // 注：源码里 isNativePlatform 在前、matchMedia 在后，断言要按实际顺序写
    expect(INPUT, '移动判定只看视口宽度（Capacitor 横屏会失效）')
      .toMatch(/isNativePlatform[\s\S]{0,200}?matchMedia\('\(max-width: 767px\)'\)/);
    expect(INPUT, '移动判定缺 Capacitor 平台分支').toMatch(/=== 'mobile'/);
  });

  it('★ 两态高度由 CSS 控制（autosize 会被 placeholder 顶到 2 行）', () => {
    // 模板要挂 is-collapsed / is-expanded 两个类
    expect(INPUT, '模板未挂 is-collapsed').toMatch(/'is-collapsed':\s*isMobileShell/);
    expect(INPUT, '模板未挂 is-expanded').toMatch(/'is-expanded':\s*isMobileShell/);
    // CSS 两态都要有显式高度，且必须 !important（Element 会内联 height 覆盖）
    expect(CHAT_CSS2, 'CSS 缺 is-collapsed 高度规则')
      .toMatch(/\.input-textarea\.is-collapsed\s+\.el-textarea__inner\s*\{[\s\S]{0,200}?height:[^;]*!important/);
    expect(CHAT_CSS2, 'CSS 缺 is-expanded 高度规则（展开态会比收起还矮）')
      .toMatch(/\.input-textarea\.is-expanded\s+\.el-textarea__inner\s*\{[\s\S]{0,250}?height:[^;]*!important/);
  });

  it('★ 移动端用短占位文案（长文案在 1 行高里会被裁半截）', () => {
    expect(INPUT, '未定义 inputPlaceholder').toMatch(/const inputPlaceholder = computed/);
    // 移动端分支必须是短文案
    expect(INPUT, '移动端占位文案仍是长串（会被裁切）')
      .toMatch(/if\s*\(isMobileShell\.value\)\s*return\s+isCodeMode\s*\?\s*'[^']{0,12}…'/);
    // 桌面端长文案保留
    expect(INPUT, '桌面端占位文案被误删').toMatch(/Enter 发送，Shift\+Enter 换行/);
  });
});

describe('对话页移动端布局：输入框与消息区不得重叠', () => {
  const CHAT_CSS = stripCssComments(read('views/chat.css'));

  it('App.vue：对话页必须保留 TabBar 底部留白（否则输入框要用 sticky 硬抬）', () => {
    const css = stripCssComments(APP);
    // ★ 精确到 is-chat 那一个块（`[^}]*` 会跨块边界吃到后面的 .main-content.full）
    const start = css.search(/\.platform-mobile\s+\.main-content\.is-chat\s*\{/);
    expect(start, '未找到 .platform-mobile .main-content.is-chat 规则').toBeGreaterThan(-1);
    const rest = css.slice(start);
    const block = rest.slice(0, rest.indexOf('}') + 1);
    // ★ 关键：padding-bottom 必须消费 --mobile-tabbar-h 变量。
    //   一旦变成 0，输入框就只能靠 sticky 抬 → 必然与消息区重叠（实测 56px）。
    //   （只断言「含变量」即可：若被改成 0，这一条直接不成立。）
    expect(block, '对话页底部留白没走 --mobile-tabbar-h 变量（改成 0 会让输入框与消息区重叠）')
      .toMatch(/padding-bottom:\s*calc\(var\(--mobile-tabbar-h/);
    // 反向再钉一次：绝不能是归零
    expect(block, '对话页的 padding-bottom 被归零了（输入框会与消息区重叠）')
      .not.toMatch(/padding-bottom:\s*0\s*!important/);
  });

  it('chat.css：移动端输入框不得用 sticky 抬（会与消息区重叠）', () => {
    // ★ 精确取**移动端主布局**那块的 .input-area。
    //   chat.css 里有多个 767px 媒体块（第一个只管 .msg-image），
    //   用 indexOf 会切到错的那个 —— 用 .chat-page { flex-direction: column } 作为锚点。
    const anchor = CHAT_CSS.search(/\.chat-page\s*\{\s*flex-direction:\s*column/);
    expect(anchor, '未找到移动端主布局块（.chat-page flex-direction: column）').toBeGreaterThan(-1);
    const mob = CHAT_CSS.slice(anchor);
    const i = mob.search(/\.input-area\s*\{/);
    expect(i, '移动端未定义 .input-area').toBeGreaterThan(-1);
    const block = mob.slice(i, mob.indexOf('}', i) + 1);
    expect(block, '移动端 .input-area 又用回 position:sticky 了（该靠外壳留白让位，不是吸附）')
      .not.toMatch(/position:\s*sticky/);
    // 正向：必须有 flex:none（静态流里不许被压缩）
    expect(block, '移动端 .input-area 缺 flex:none（会被消息区挤压）')
      .toMatch(/flex:\s*none/);
  });

  it('chat.css：消息区不得再靠超大底部留白给重叠打补丁', () => {
    // 140px 是历史补丁值，必须已清理
    expect(CHAT_CSS, '消息区仍有 calc(140px + ...) 的历史补丁留白')
      .not.toMatch(/calc\(140px\s*\+/);
  });

  it('chat.css：必须有 platform-mobile 分支（Capacitor 横屏 767px 媒体查询不命中）', () => {
    // ★ 横屏视口常 800px+，只挂 max-width:767px 会让移动外壳配桌面布局
    // 精确取 platform-mobile 的 .chat-page 块
    const i = CHAT_CSS.search(/\.platform-mobile\s+\.chat-page\s*\{/);
    expect(i, 'chat.css 缺 .platform-mobile .chat-page 规则（Capacitor 横屏会退回桌面布局）')
      .toBeGreaterThan(-1);
    const block = CHAT_CSS.slice(i, CHAT_CSS.indexOf('}', i) + 1);
    expect(block, '.platform-mobile .chat-page 没设 flex-direction: column')
      .toMatch(/flex-direction:\s*column/);
    // 侧栏抽屉（横屏不许常驻）
    const j = CHAT_CSS.search(/\.platform-mobile\s+\.sidebar\s*\{/);
    expect(j, 'platform-mobile 分支缺侧栏抽屉规则（横屏侧栏会常驻）').toBeGreaterThan(-1);
    expect(CHAT_CSS.slice(j, CHAT_CSS.indexOf('}', j) + 1)).toMatch(/position:\s*fixed/);
  });
});