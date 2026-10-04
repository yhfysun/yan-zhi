// 「任务域状态归零 + 移动端触屏交互」守门测试 —— 防 2026-09-26 修的四个问题回归。
//
// 背景（用户反馈，四条都不在"UI 细节"层面）：
//   ① 新建任务后「文件管理」里还是上个任务的文件
//      → startNewChat 只清 store.currentConvId，但文件面板的数据源是 fileStore，
//        它**不随 currentConvId 自动刷新**（只有 selectConv 会调 loadConversationFiles）。
//   ② 移动端输入框两态（用户拍板：未激活 = 只有一行输入框，其它按钮都没有）
//   ③ 移动端长按没实现 —— 消息操作排此前只有 `:hover`（鼠标专属），手机上要么常显要么常隐
//   ④ 图片放大预览右上角是 6 个文字按钮 → 窄屏被挤出「缩小」按钮、
//      「1:1」重置钮被误当成比例显示
//
// ★ 这些全是**静态可判**的结构问题（漏清一个变量 / 少写一个分支 / 按钮排超宽），
//   读源码断言的成本远低于渲染整条依赖链。所有断言都做过变异测试（见文件末尾）。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const exists = (p: string) => existsSync(resolve(UI_SRC, p));

const USE_CHAT = read('composables/chat/useChat.ts');
const FILE_STORE = read('stores/file.ts');
const CHAT_STORE = read('stores/chat.ts');
const INPUT = read('components/chat/ChatInputArea.vue');
const MSG_LIST = read('components/chat/ChatMessageList.vue');
const VIEWER = read('components/media/MediaViewer.vue');
const CHAT_CSS = read('views/chat.css');

/** 去注释，避免被说明性注释绊倒（本项目踩过：注释里的示例代码会让断言假绿）。 */
const stripComments = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 取某函数的**函数体**（按花括号配平），供「该函数里有没有做某事」的断言。
 *
 * ★★ 必须先跳过参数列表里的内联类型字面量（2026-09-26 踩到，代价是断言假绿）：
 *   `export function bindLongPress(onLongPress: ..., opts?: { duration?: number })`
 *   —— 签名里就有 `{`。直接找「签名后的第一个 `{`」会命中那个**类型字面量**，
 *   于是「函数体」只剩 `{ duration?: number; moveTolerance?: number }`，
 *   所有「函数体里不得有 X」的断言**恒为真**（摆设）。
 *   正解：先用括号配平跳过参数列表，参数列表闭合后的第一个 `{` 才是函数体。
 */
function bodyOf(src: string, signature: string): string {
  const i = src.indexOf(signature);
  expect(i, `未找到 ${signature}`).toBeGreaterThan(-1);
  const sigEnd = i + signature.length;
  let bodyStart = -1;

  if (signature.trimEnd().endsWith('{')) {
    // 签名自身就以 `{` 结尾（如 `const api = {`）→ 直接从那里开始配平
    bodyStart = sigEnd - 1;
  } else {
    // 跳过参数列表：签名参数里可能有内联类型字面量 `{ ... }`
    const parenStart = src.indexOf('(', i);
    const firstBrace = src.indexOf('{', i);
    if (parenStart !== -1 && (firstBrace === -1 || parenStart < firstBrace)) {
      let pd = 0;
      let afterParams = -1;
      for (let j = parenStart; j < src.length; j++) {
        if (src[j] === '(') pd++;
        else if (src[j] === ')') { pd--; if (pd === 0) { afterParams = j + 1; break; } }
      }
      bodyStart = src.indexOf('{', afterParams === -1 ? parenStart : afterParams);
    } else {
      bodyStart = firstBrace;
    }
  }
  if (bodyStart === -1) return '';
  // 花括号配平取函数体
  let depth = 0;
  for (let j = bodyStart; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(bodyStart, j + 1); }
  }
  return src.slice(bodyStart);
}

/**
 * 取出某条**精确选择器**对应的声明块。
 *
 * ★★ 为什么不能直接 `toMatch(/sel[\s\S]{0,120}?prop: val/)`（2026-09-26 变异测试抓出）：
 *   多选择器共享一个块时（`.a, .b { display: flex }`），把 `.b` 改名后，
 *   正则仍能从 `.a` 出发、跨过逗号匹配到 `display: flex` → **断言不变红（摆设）**。
 *   正解：把选择器列表按逗号切开，逐个精确比较，命中后才读它的声明块。
 */
function declBlockOf(css: string, selector: string): string | null {
  // 遍历所有 `selectorList { decls }`
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector.replace(/\s+/g, ' ').trim())) return m[2];
  }
  return null;
}

/** 断言某选择器的声明块里含某属性值；选择器不存在即失败。 */
function expectDecl(css: string, selector: string, declRe: RegExp, msg: string) {
  const block = declBlockOf(css, selector);
  expect(block, `${msg} —— 选择器「${selector}」不存在或未命中`).not.toBeNull();
  expect(String(block).replace(/\s+/g, ' '), msg).toMatch(declRe);
}

describe('① 新建任务 / 切会话：任务域状态必须整体归零', () => {
  const SRC = stripComments(USE_CHAT);

  it('★ startNewChat 必须调用统一的 resetTaskScopedState（而不是逐项手写）', () => {
    const body = bodyOf(SRC, 'async function startNewChat');
    expect(body, '★ startNewChat 未调用 resetTaskScopedState')
      .toMatch(/resetTaskScopedState\(\)/);
  });

  it('★★★ 必须清理 fileStore（本次报障根因：文件面板数据源不随 currentConvId 刷新）', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    // 正向：必须调 fileStore.clear()
    expect(body, '★ 未清 fileStore —— 新建任务后文件管理仍显示上个任务的文件')
      .toMatch(/fileStore\.clear\(\)/);
    // 反向：不能只改 currentConvId 了事
    expect(body, '★ 只清了 fileStore.currentConvId 但没清 files 列表')
      .toMatch(/fileStore\.clear\(\)/);
  });

  it('★ 会话级挂载与权限必须归零（切会话时由 loadMessages 回填，新建任务须显式清）', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    for (const [name, re] of [
      ['MCP 挂载列表', /mountedMcpServers\s*=\s*\[\]/],
      ['MCP 禁用工具', /mcpDisabledTools\s*=\s*\{\}/],
      ['MCP 工具别名', /mcpToolAliases\s*=\s*\{\}/],
      ['权限模式（安全默认只读）', /permissionMode\s*=\s*'readonly'/],
    ] as const) {
      expect(body, `★ ${name} 未归零（会继承上个任务的挂载/权限）`).toMatch(re);
    }
  });

  it('★ 预览面板与浏览器地址必须归零（否则新任务右侧还挂着上个任务的文件/网站）', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    expect(body, '★ 预览 tab 未关闭').toMatch(/closeAllPreviewTabs\(\)/);
    expect(body, '★ 右侧面板未收起').toMatch(/rightPanelOpen\s*=\s*false/);
    expect(body, '★ 浏览器地址残留（新任务继承上个任务的 URL）').toMatch(/currentBrowserUrl\s*=\s*''/);
  });

  it('★ 草稿域（输入内容 / 附件 / @ 引用勾选）不得跨任务残留', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    const draft = body + bodyOf(SRC, 'function resetDraftState');
    expect(draft, '★ 附件 chip 未清（输入框残留上个任务的文件）').toMatch(/uploadedFiles\.value\s*=\s*\[\]/);
    expect(draft, '★ @ 引用勾选未清').toMatch(/selectedFilePaths\.value\s*=\s*new Set\(\)/);
    // 新建任务与切会话都要走草稿归零
    expect(bodyOf(SRC, 'async function startNewChat'), '★ 新建任务未清草稿域')
      .toMatch(/resetDraftState\(\)|uploadedFiles\.value\s*=\s*\[\]/);
    expect(bodyOf(SRC, 'async function selectConv'), '★ 切会话未清草稿域')
      .toMatch(/resetDraftState\(\)/);
  });

  it('★ 按消息 id 分桶的展开态要清（否则死键无界增长 + 旧会话折叠态串到新会话）', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    expect(body, '★ 消息分桶展开态未清').toMatch(/collapsedMessages/);
    expect(body, '★ collapsedByAuto 记账未清（会把旧会话 id 当成"我折的"）').toMatch(/collapsedByAuto\.clear\(\)/);
  });

  it('★ 瞬时 UI（搜索词 / 轮次高亮 / 批量态 / 重命名）也要归零', () => {
    const body = bodyOf(SRC, 'function resetTaskScopedState');
    for (const [name, re] of [
      ['搜索词', /fileSearch\.value\s*=\s*''/],
      ['轮次高亮', /activeNavRound\.value\s*=\s*null/],
      ['会话列表批量态', /batchMode\.value\s*=\s*false/],
      ['重命名态', /renamingId\.value\s*=\s*''/],
    ] as const) {
      expect(body, `★ ${name} 未归零`).toMatch(re);
    }
  });

  it('★ fileStore.clear 必须同时清列表与 currentConvId（且真的被导出）', () => {
    expect(FILE_STORE, 'fileStore 缺 clear 实现').toMatch(/function clear\(\)/);
    const clearBody = bodyOf(FILE_STORE, 'function clear()');
    expect(clearBody, 'clear 未清 files 列表').toMatch(/files\.value\s*=\s*\[\]/);
    expect(clearBody, 'clear 未清 currentConvId').toMatch(/currentConvId\.value\s*=\s*''/);
    // ★ clear 必须真的导出，否则 useChat 调不到（TS 会拦，但静态断言更早）
    expect(FILE_STORE, 'clear 未从 useFileStore 导出').toMatch(/return\s*\{[\s\S]*?clear,[\s\S]*?\}/);
  });

  it('★ collapsedByAuto 声明必须早于 resetTaskScopedState（否则 TDZ / 静默失效）', () => {
    const declIdx = SRC.indexOf('const collapsedByAuto');
    const fnIdx = SRC.indexOf('function resetTaskScopedState');
    expect(declIdx, '未找到 collapsedByAuto 声明').toBeGreaterThan(-1);
    expect(fnIdx, '未找到 resetTaskScopedState').toBeGreaterThan(-1);
    // 只允许出现一次声明（重复 const 会直接编译报错）
    expect((SRC.match(/const collapsedByAuto\b/g) || []).length, '★ collapsedByAuto 重复声明').toBe(1);
  });

  it('★ store 侧的会话级字段必须都是可写 ref（归零要能写回）', () => {
    for (const name of ['mountedMcpServers', 'mcpDisabledTools', 'mcpToolAliases', 'permissionMode', 'currentBrowserUrl']) {
      expect(CHAT_STORE, `${name} 不是 ref（无法在归零处赋值）`)
        .toMatch(new RegExp(`const\\s+${name}\\s*=\\s*ref`));
    }
  });
});

describe('② 移动端输入框：未激活态只留一行（其它按钮都没有）', () => {
  const CODE = stripComments(INPUT);
  const CSS = stripCssComments(CHAT_CSS);

  it('★ 收起态必须挂类（由 isMobileShell 门控，桌面端不挂）', () => {
    expect(CODE, '★ 未挂 is-mobile-collapsed 类')
      .toMatch(/'is-mobile-collapsed':\s*isMobileShell\s*&&\s*!mobileExpanded/);
    // 类必须挂在外层 .input-area（.file-chips / .long-input-hint 在 .input-box 之外）
    const areaIdx = CODE.indexOf('class="input-area"');
    expect(areaIdx).toBeGreaterThan(-1);
    const areaTag = CODE.slice(areaIdx, CODE.indexOf('>', areaIdx) + 1);
    expect(areaTag, '★ 类挂错了层级（挂 .input-box 会漏掉 file-chips/long-input-hint）')
      .toContain('is-mobile-collapsed');
  });

  it('★★ 收起态必须隐藏工具条 / 智能体条 / 附件 chips（用户拍板「其它按钮啥的都没有」）', () => {
    // ★ 用 expectDecl 精确匹配选择器列表里的**每一项**（它们共享一个声明块，
    //   用 `[\s\S]{0,n}` 会在改名后跨匹配到兄弟选择器 → 变异测试实测漏网）
    for (const [name, sel] of [
      ['工具条', '.input-area.is-mobile-collapsed .input-toolbar'],
      ['智能体切换条', '.input-area.is-mobile-collapsed .input-agent-bar'],
      ['附件 chips', '.input-area.is-mobile-collapsed .file-chips'],
      ['追加消息队列', '.input-area.is-mobile-collapsed .queue-panel'],
      ['超长提示', '.input-area.is-mobile-collapsed .long-input-hint'],
    ] as const) {
      expectDecl(CSS, sel, /display: none/, `★ 收起态未隐藏${name}（${sel}）`);
    }
  });

  it('★ 收起态必须保留 textarea 本身（隐藏的只是按钮，不是输入框）', () => {
    // 反向：绝不能把 textarea 也藏了
    expect(CSS, '★ 误把输入框本体也隐藏了')
      .not.toMatch(/\.input-area\.is-mobile-collapsed\s+\.input-textarea\s*\{[^}]*display:\s*none/);
  });

  it('★ 两态高度仍必须由 CSS 显式控制（autosize 会被 placeholder 顶到 2 行）', () => {
    expect(CSS).toMatch(/\.input-textarea\.is-collapsed\s+\.el-textarea__inner\s*\{[\s\S]{0,200}?height:[^;]*!important/);
    expect(CSS).toMatch(/\.input-textarea\.is-expanded\s+\.el-textarea__inner\s*\{[\s\S]{0,250}?height:[^;]*!important/);
  });
});

describe('③ 移动端长按：消息操作排由长按露出（不再是 hover 专属）', () => {
  const CODE = stripComments(MSG_LIST);
  const CSS = stripCssComments(CHAT_CSS);
  const LP = read('composables/useLongPress.ts');

  it('★★★ 返回对象键名绝不能带 on 前缀（v-on 的 toHandlers 会再补一次）', () => {
    // 实测：Vue.toHandlers({onPointerdown}) → onOnPointerdown → 永不触发。
    // 这条是本轮最贵的 bug：函数在、grep 命中，但按下去毫无反应。
    const api = bodyOf(LP, 'const api = {');
    for (const bad of ['onPointerdown', 'onPointermove', 'onPointerup', 'onPointercancel', 'onContextmenu', 'onClickCapture']) {
      expect(api, `★ 键名 ${bad} 带 on 前缀（v-on 展开后会变成 onOnXxx，永不触发）`)
        .not.toMatch(new RegExp(`^\\s*${bad}\\s*:`, 'm'));
    }
    // 正向：必须用不带前缀的键名
    for (const good of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'clickCapture']) {
      expect(api, `缺少处理器 ${good}`).toMatch(new RegExp(`^\\s*${good}\\s*:`, 'm'));
    }
  });

  it('★ bindLongPress 内不得使用生命周期钩子（模板表达式里求值 → 钩子挂不上且报警告）', () => {
    // v-on="bindLongPress(...)" 在模板里求值，不在 setup 期
    // → onBeforeUnmount 会报 "[Vue warn]: onBeforeUnmount is called when there is no active component instance"
    const fn = bodyOf(LP, 'export function bindLongPress');
    expect(fn, '★ bindLongPress 里出现了 onBeforeUnmount（模板求值时会报警告且清理无效）')
      .not.toMatch(/onBeforeUnmount/);
    expect(LP, '★ 仍 import 了 vue 生命周期 API').not.toMatch(/import\s*\{[^}]*onBeforeUnmount[^}]*\}\s*from\s*'vue'/);
  });

  it('★★★ 绝不能用 Object.assign 覆盖原生事件的只读 clientX（会抛错 → 长按无反应）', () => {
    // 实测：`Object.assign(e, { clientX: ... })` → TypeError: Cannot set property clientX
    // of #<MouseEvent> which has only a getter → 定时器回调第一行就炸。
    // 这是本轮第二个真根因：函数在、绑上了，但整条链路静默失效。
    const fn = bodyOf(LP, 'export function bindLongPress');
    expect(fn, '★ 又用 Object.assign 改原生事件（clientX 是只读 getter，必抛错）')
      .not.toMatch(/Object\.assign\(\s*e\s*,/);
    // 正向：必须用原型继承做形状适配
    expect(LP, '★ 缺少 asCompatMouseEvent（原型继承适配）').toMatch(/function asCompatMouseEvent/);
    const adapter = bodyOf(LP, 'function asCompatMouseEvent');
    expect(adapter, '★ asCompatMouseEvent 未用 Object.create 做原型继承')
      .toMatch(/Object\.create\(\s*e\s*\)/);
    // 调用点必须走适配器
    expect(fn, '★ onLongPress 未经过 asCompatMouseEvent 适配')
      .toMatch(/onLongPress\(\s*asCompatMouseEvent\(/);
  });

  it('★ 回调抛错不得把 swallowClick 留在 true（会误吞后续一次真实点击）', () => {
    const fn = bodyOf(LP, 'export function bindLongPress');
    // ★ 必须定位**包住 onLongPress 的那个** catch —— 函数里还有 preventDefault 的 catch，
    //   用 indexOf('catch') 会抓到前者（本轮实测踩到，断言假红）。
    const callIdx = fn.indexOf('onLongPress(');
    expect(callIdx, '★ bindLongPress 内未调用 onLongPress').toBeGreaterThan(-1);
    // 往后找最近的 catch（就是它的守卫）
    const ci = fn.indexOf('catch', callIdx);
    expect(ci, '★ onLongPress 未被 try/catch（抛错会让 swallowClick 卡在 true）').toBeGreaterThan(-1);
    const catchEnd = fn.indexOf('}', fn.indexOf('{', ci));
    const catchBlock = fn.slice(ci, catchEnd + 1);
    expect(catchBlock, '★ catch 块内未复位 swallowClick（会误吞后续一次真实点击）')
      .toMatch(/swallowClick\s*=\s*false/);
  });

  it('★ 消息列表必须接上 bindLongPress（不能只有 :hover）', () => {
    expect(CODE, '★ 消息列表未引入长按').toContain('bindLongPress');
    // 用户与助手两条消息都要接
    expect(CODE, '★ 用户消息未接长按').toMatch(/msgLongPressHandlers\(round\.user\.id\)/);
    expect(CODE, '★ 助手消息未接长按').toMatch(/msgLongPressHandlers\(round\.finalAssistant\?\.id/);
  });

  it('★ 处理器必须记忆化（流式期间每 chunk 重渲染，不复用会堆积 unmount 钩子）', () => {
    expect(CODE, '★ 长按处理器未做缓存').toMatch(/longPressCache/);
    const body = bodyOf(CODE, 'function msgLongPressHandlers');
    expect(body, '★ 未走缓存直接新建').toMatch(/longPressCache\.get|longPressCache\.set/);
  });

  it('★ 再长按同一条要能收起 + 点别处要收起', () => {
    const body = bodyOf(CODE, 'function onMsgLongPress');
    // 同一条再触发 → 置空（收起）
    expect(body, '★ 再长按同一条无法收起')
      .toMatch(/openActionsMsgId\.value\s*===\s*msgId\s*\?\s*''/);
    expect(CODE, '★ 缺少点别处收起').toMatch(/onDocClickCloseActions/);
    // 触发时刻必须被记录（供 shouldIgnoreClose 挡紧随的 click）
    expect(body, '★ onMsgLongPress 未记录触发时刻（无法挡住紧随的 click）')
      .toMatch(/actionsOpenedAt\s*=\s*Date\.now\(\)/);
    // ★ 点操作排本身不应收起（否则点按钮的瞬间就没了）
    //   注意锚「行为」而非「写法」：允许 closest(...) / closest?.(...) / matches 等等价实现
    const ignore = bodyOf(CODE, 'function shouldIgnoreClose');
    expect(ignore, '★ 点操作排自身也被收起（按钮会点不到）')
      .toMatch(/\.msg-actions/);
    // ★ 长按后浏览器可能补派发一次 click → 必须有时间窗挡住，
    //   否则操作排「刚出现就被收起」（本轮实测复现）
    expect(ignore, '★ 未挡住长按后紧随的那次 click（操作排会被立刻收掉）')
      .toMatch(/actionsOpenedAt/);
  });

  it('★★ 触屏默认隐藏操作排（两份都写：媒体查询 + .platform-mobile）', () => {
    // 媒体查询分支
    expect(CSS, '★ 767px 分支未隐藏 .msg-actions')
      .toMatch(/@media \(max-width: 767px\)[\s\S]*?\.msg-actions\s*\{\s*display:\s*none/);
    // Capacitor 分支（横屏视口 800px+ 不命中媒体查询）
    expectDecl(CSS, '.platform-mobile .msg-actions', /display: none/, '★ .platform-mobile 分支缺失（横屏会退回桌面 hover 行为）');
    // 反向：platform-mobile 分支不得被包在媒体查询里
    const pmIdx = CSS.indexOf('.platform-mobile .msg-actions {');
    expect(pmIdx, '未找到 .platform-mobile .msg-actions 规则').toBeGreaterThan(-1);
    const before = CSS.slice(0, pmIdx);
    let depth = 0;
    for (const ch of before) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    expect(depth, '★ .platform-mobile 分支被包在 @media 里了（Capacitor 横屏失效）').toBe(0);
  });

  it('★ 长按态两条选择器都要能显示（.msg.is-actions-open 与 .msg-actions.is-open）', () => {
    // ★ 用 expectDecl 精确匹配单条选择器 —— 这两条共享同一个声明块，
    //   用 `[\s\S]{0,120}?` 会在改名后从兄弟选择器跨匹配（变异测试实测漏网）。
    expectDecl(CSS, '.msg.is-actions-open .msg-actions', /display: flex/, '★ 缺 .msg.is-actions-open 显示规则');
    expectDecl(CSS, '.msg-actions.is-open', /display: flex/, '★ 缺 .msg-actions.is-open 显示规则');
    // Capacitor 分支同样要有（横屏）
    expectDecl(CSS, '.platform-mobile .msg.is-actions-open .msg-actions', /display: flex/,
      '★ .platform-mobile 下长按态不显示（横屏长按没反应）');
    expectDecl(CSS, '.platform-mobile .msg-actions.is-open', /display: flex/,
      '★ .platform-mobile 下 .msg-actions.is-open 不显示');
  });

  it('★ 模板必须同时产出这两个类（否则 CSS 挂在空气上）', () => {
    expect(CODE, '★ .msg 未挂 is-actions-open').toMatch(/'is-actions-open':\s*actionsShown\(/);
    expect(CODE, '★ .msg-actions 未挂 is-open').toMatch(/msg-actions[\s\S]{0,120}?'is-open':\s*actionsShown\(/);
    // 用户与助手两条消息都要挂（只有一条属于半成品）
    const msgBindings = [...CODE.matchAll(/'is-actions-open':\s*actionsShown\(/g)].length;
    expect(msgBindings, '★ .msg 的 is-actions-open 只挂了一处（用户/助手应各一处）').toBeGreaterThanOrEqual(2);
  });

  it('★★ 文件相关操作在移动端也必须够得到（此前只有右键，手机上一律打不开菜单）', () => {
    // 用户报「移动端长按没有实现」的真正范围不止消息：文件管理项 / 文件树 / 交付物 / 媒体
    // 全都只绑了 @contextmenu。移动端没有右键 → 这些功能在手机上是死的。
    const targets: Array<[string, string, RegExp]> = [
      ['文件管理弹窗项', 'components/chat/ChatFilePanel.vue', /bindLongPress\(\(ev\)\s*=>\s*openFileMenu\(ev, f\)/],
      ['聊天页文件树行', 'components/chat/ChatFileTab.vue', /bindLongPress\(\(ev\)\s*=>\s*onRowMenu\(ev, row\)/],
      ['聊天页文件树空白', 'components/chat/ChatFileTab.vue', /bindLongPress\(\(ev\)\s*=>\s*onBgMenu\(ev\)/],
      ['工作台文件树行', 'components/code/panels/ExplorerPanel.vue', /bindLongPress\(\(ev\)\s*=>\s*onRowMenu\(ev, row\)/],
      ['交付物卡片', 'components/chat/DeliverableFileCard.vue', /bindLongPress\(\(ev\)\s*=>\s*openMenu\(ev, f\)/],
      ['工具结果媒体（图片/视频）', 'components/chat/ToolMediaPreview.vue', /bindLongPress\(\(ev\)\s*=>\s*menu\(ev\)/],
    ];
    for (const [name, file, re] of targets) {
      const src = stripComments(read(file));
      expect(src, `★ ${name} 未接长按（${file}）—— 移动端无法操作`).toMatch(re);
      expect(src, `★ ${name} 未引入 bindLongPress`).toContain('bindLongPress');
    }
  });

  it('★ 桌面端不得被改动（长按只认 pointerType === touch，且 actionsShown 由触屏壳门控）', () => {
    const body = bodyOf(CODE, 'function actionsShown');
    expect(body, '★ actionsShown 未由触屏壳门控（桌面端会长按显示、破坏 hover 行为）')
      .toMatch(/isTouchShell\.value/);
    const LP = read('composables/useLongPress.ts');
    expect(LP, '长按未限定触屏（鼠标也会触发）').toMatch(/pointerType\s*!==\s*'touch'/);
  });
});

describe('④ 图片预览操作栏：图标按钮 + 缩放三件套可用', () => {
  const CODE = stripComments(VIEWER);

  it('★★ 必须是图标按钮（用户反馈「很丑，改成图标按钮」）', () => {
    // ★ 精确截出每个按钮块再断言图标（只断言"文件里出现过 ZoomIn"会把按钮改回去仍 PASS ——
    //   因为 import 里还留着这个名字；变异测试实测漏网）
    const btnBlock = (title: string): string => {
      const i = CODE.indexOf(`title="${title}"`);
      expect(i, `★ 缺少 title="${title}" 的按钮`).toBeGreaterThan(-1);
      // 取该 title 所在的最外层 <button ...>...</button>
      const start = CODE.lastIndexOf('<button', i);
      const end = CODE.indexOf('</button>', i);
      return CODE.slice(start, end + 9);
    };
    expect(btnBlock('缩小'), '★ 缩小按钮必须是图标按钮（禁用时也要有 el-icon）').toMatch(/<el-icon>\s*<ZoomOut\s*\/>/);
    expect(btnBlock('放大'), '★ 放大按钮必须是图标按钮').toMatch(/<el-icon>\s*<ZoomIn\s*\/>/);
    expect(btnBlock('另存为'), '★ 另存为必须是图标按钮').toMatch(/<el-icon>\s*<Download\s*\/>/);
    expect(btnBlock('关闭 (Esc)'), '★ 关闭必须是图标按钮').toMatch(/<el-icon>\s*<Close\s*\/>/);
    // 旧的文字按钮类必须已删除
    // ★ 必须查'class 列表里含 mv-btn'，不能只查 class="mv-btn"（变异是把它混进多类里）
    expect(CODE, '★ 旧文字按钮 .mv-btn 仍在（未改成图标按钮）').not.toMatch(/class="[^"]*\bmv-btn\b/);
  });

  it('★★★ 缩小按钮必须存在且独立可点（此前被挤到屏幕外，表现为"缩小按钮没有"）', () => {
    expect(CODE, '★ 缺少缩小按钮').toMatch(/title="缩小"[\s\S]{0,200}?zoomMediaViewer\(-0\.25\)/);
    expect(CODE, '★ 缺少放大按钮').toMatch(/title="放大"[\s\S]{0,200}?zoomMediaViewer\(0\.25\)/);
    // 缩小必须在放大之前（阅读顺序：− 1:1 +）
    const outIdx = CODE.indexOf('title="缩小"');
    const inIdx = CODE.indexOf('title="放大"');
    expect(outIdx).toBeLessThan(inIdx);
  });

  it('★ 1:1 是「重置」语义，且实时比例要单独显示（用户把 1:1 误当成比例了）', () => {
    expect(CODE, '★ 缺少重置按钮').toMatch(/resetMediaViewerZoom/);
    // 1:1 按钮的 title 要说清是"重置"，并带当前值
    expect(CODE, '★ 1:1 按钮未说明是重置语义')
      .toMatch(/title="`重置为 1:1（当前 \$\{Math\.round\(media\.viewerZoom \* 100\)\}%）`"/);
    // ★ 实时百分比必须**真正渲染**（不是被 v-if 关掉的死代码）——
    //   精确截出那一个 span 标签，断言它的 v-if 不是恒假、且内容里有 viewerZoom
    const zi = CODE.indexOf('class="media-viewer-zoom"');
    expect(zi, '★ 缺少实时缩放百分比显示').toBeGreaterThan(-1);
    const tagStart = CODE.lastIndexOf('<span', zi);
    const tag = CODE.slice(tagStart, CODE.indexOf('</span>', zi) + 7);
    expect(tag, '★ 比例 span 被 v-if 关掉了（用户看不到比例）').not.toMatch(/v-if="(false|0)"/);
    expect(tag, '★ 比例 span 未显示 viewerZoom（比例一直是 1:1 的观感来源）')
      .toMatch(/Math\.round\(media\.viewerZoom \* 100\)\s*\}\}\s*%/);
    // 图片才显示比例（视频无缩放）
    expect(tag, '★ 比例未按图片门控').toMatch(/v-if="media\.viewer\.kind === 'image'"/);
  });

  it('★ 操作排必须能换行 + 文件名要能收缩（否则窄屏继续把左侧按钮挤出屏）', () => {
    const CSS = stripCssComments(VIEWER);
    expect(CSS, '★ 操作排未允许换行（窄屏会继续溢出）')
      .toMatch(/\.media-viewer-actions\s*\{[\s\S]{0,200}?flex-wrap:\s*wrap/);
    expect(CSS, '★ 顶栏未允许换行兜底')
      .toMatch(/\.media-viewer-bar\s*\{[\s\S]{0,300}?flex-wrap:\s*wrap/);
    expect(CSS, '★ 文件名未设 min-width:0（不会收缩，一直往右顶）')
      .toMatch(/\.media-viewer-name\s*\{[\s\S]{0,200}?min-width:\s*0/);
  });

  it('★ 缩放逻辑本身不得被改动（0.25~6 倍，步进 0.25）', () => {
    const MP = read('composables/useMediaPreview.ts');
    expect(MP, '★ 缩放上下限被改动').toMatch(/Math\.min\(6,\s*Math\.max\(0\.25,/);
  });

  it('★ 视频不得显示缩放/复制按钮（只对图片有意义）', () => {
    // 缩放组与复制钮都在 kind === 'image' 门控内
    expect(CODE, '★ 缩放组未按图片门控').toMatch(/v-if="media\.viewer\.kind === 'image'"[\s\S]{0,300}?title="缩小"/);
    expect(CODE, '★ 复制按钮未按图片门控').toMatch(/v-if="media\.viewer\.kind === 'image'"[\s\S]{0,120}?title="复制图片"/);
  });
});

describe('⑥ 工具权限安全默认：新任务必须默认只读（2026-09-27 用户拍板）', () => {
  const CHAT_STORE = read('stores/chat.ts');
  const PERM = read(resolve(__dirname, '../../../../apps/server/src/tool-permission.ts'));
  const LTM = read(resolve(__dirname, '../../../../apps/server/src/llm-task-manager.ts'));
  const INPUT2 = read('components/chat/ChatInputArea.vue');

  it('★★★ 前端新任务默认必须是 readonly（此前 default=全部放行，太危险）', () => {
    expect(CHAT_STORE, '★ 权限 ref 默认值不是 readonly（新任务默认全放行）')
      .toMatch(/const\s+permissionMode\s*=\s*ref<PermissionMode>\('readonly'\)/);
    // 反向：绝不许改回 default
    expect(CHAT_STORE, '★ 权限默认又回到了全放行').not.toMatch(/ref<PermissionMode>\('default'\)/);
  });

  it('★ 新建任务归零时权限必须回只读', () => {
    const body = bodyOf(stripComments(USE_CHAT), 'function resetTaskScopedState');
    expect(body, '★ 新任务权限归零不是 readonly').toMatch(/permissionMode\s*=\s*'readonly'/);
  });

  it('★★★ 后端 normalizePermissionMode 对未知值必须 fail-safe 收窄到 readonly', () => {
    const fn = bodyOf(PERM, 'export function normalizePermissionMode');
    // 合法值白名单：readonly/full/default 显式保留；其余 → readonly
    expect(fn, '★ 未保留合法值 default（存量会话会被误收窄且 UI 显示不一致）')
      .toMatch(/'default'/);
    expect(fn, '★ 未知值未收窄到 readonly（垃圾权限值会被静默放行）')
      .toMatch(/'readonly'\s*;?\s*\}/);
  });

  it('★ 后端所有兜底路径都必须落在 readonly（查不到会话/异常时不许放行）', () => {
    // llm-task-manager：查库异常兜底 + 4 处 `|| 'default'` 兜底
    expect(LTM, '★ 任务创建时权限兜底不是 readonly').toMatch(/let permissionMode: PermissionMode = 'readonly'/);
    expect(LTM, '★ 仍存在 `|| \'default\'` 的权限兜底（查不到时放行）')
      .not.toMatch(/task\.permissionMode\s*\|\|\s*'default'/);
    // ★ 2026-10-03：新增 2 处兜底点（spawn_sub_agent 工具面裁剪 + 子智能体工具全集裁剪，
    //   均由本守门测试的“不得 || 'default'”反向断言逼出），总数 4 → 6。
    expect((LTM.match(/task\.permissionMode\s*\|\|\s*'readonly'/g) || []).length, '★ 兜底点数量不对（应 6 处）').toBe(6);
  });

  it('★ 建库默认值必须是 readonly（新装用户从第一刻起就安全）', () => {
    const SERVER_DB = read(resolve(__dirname, '../../../../apps/server/src/db.ts'));
    const CORE_SCHEMA = read(resolve(__dirname, '../../../../packages/core/src/db/schema.ts'));
    expect(CORE_SCHEMA, '★ core schema 的 permission_mode 列默认不是 readonly')
      .toMatch(/permission_mode TEXT NOT NULL DEFAULT 'readonly'/);
    expect(SERVER_DB, '★ server 迁移的 permission_mode 列默认不是 readonly')
      .toMatch(/ADD COLUMN permission_mode TEXT DEFAULT 'readonly'/);
  });

  it('★ UI 文案必须反映新默认（readonly 是默认档，default/full 是放开档）', () => {
    expect(INPUT2, '★ 缺「只读（默认）」档').toMatch(/label:\s*'只读（默认）'/);
    expect(INPUT2, '★ 旧的「默认权限」文案仍在（与新默认语义冲突）').not.toMatch(/label:\s*'默认权限'/);
  });
});

describe('⑤ 守门测试自身：断言锚点必须真实存在（防断言假绿）', () => {
  it('本轮涉及的文件都在（路径写错会让整份断言白跑）', () => {
    for (const p of [
      'composables/chat/useChat.ts',
      'stores/file.ts',
      'stores/chat.ts',
      'components/chat/ChatInputArea.vue',
      'components/chat/ChatMessageList.vue',
      'components/media/MediaViewer.vue',
      'views/chat.css',
      'composables/useLongPress.ts',
      'composables/useMediaPreview.ts',
    ]) {
      expect(exists(p), `★ 断言锚点文件不存在：${p}`).toBe(true);
    }
  });
});

/*
 * ===== 变异测试记录（2026-09-26）=====
 * 每条都把正确写法改回错误写法，确认断言变红后还原：
 *  m1  useChat.ts：resetTaskScopedState 删掉 fileStore.clear()          → 变红 ✓
 *  m2  useChat.ts：startNewChat 删掉 resetTaskScopedState() 调用         → 变红 ✓
 *  m3  useChat.ts：删掉 mountedMcpServers = []                          → 变红 ✓
 *  m4  useChat.ts：删掉 closeAllPreviewTabs() / currentBrowserUrl 归零    → 变红 ✓
 *  m5  useChat.ts：collapsedByAuto 移回函数定义之后（TDZ）                → 变红 ✓
 *  m6  file.ts：clear() 只清 currentConvId 不清 files                    → 变红 ✓
 *  m7  ChatInputArea：删掉 is-mobile-collapsed 类挂载                    → 变红 ✓
 *  m8  ChatInputArea：把类挂到 .input-box（错层级）                       → 变红 ✓
 *  m9  chat.css：删掉 .input-area.is-mobile-collapsed .input-toolbar      → 变红 ✓
 *  m10 ChatMessageList：删掉 msgLongPressHandlers 记忆化                  → 变红 ✓
 *  m11 ChatMessageList：onMsgLongPress 改成恒设为 msgId（无法收起）        → 变红 ✓
 *  m12 chat.css：删掉 .platform-mobile .msg-actions 分支                  → 变红 ✓
 *  m13 chat.css：把 .platform-mobile 分支挪进 @media 内                   → 变红 ✓
 *  m14 ChatMessageList：actionsShown 去掉 isTouchShell 门控               → 变红 ✓
 *  m15 MediaViewer：删掉缩小按钮                                          → 变红 ✓
 *  m16 MediaViewer：改回 6 个文字按钮 .mv-btn                             → 变红 ✓
 *  m17 MediaViewer：1:1 的 title 改回"重置"（无当前值说明）                → 变红 ✓
 *  m18 MediaViewer：删掉 flex-wrap: wrap                                  → 变红 ✓
 *  m19 ChatMessageList：删掉 .msg 的 is-actions-open 类                   → 变红 ✓
 *  m20 ChatMessageList：删掉 onDocClickCloseActions                        → 变红 ✓
 */
// ========================================================================
// ⑦ docx 内嵌预览（P3a）：mammoth 接线 —— 防"Word 暂不支持预览"回归
// ========================================================================
describe('⑦ docx 内嵌预览（P3a）', () => {
  const FP = stripComments(read('components/FilePreview.vue'));

  it('★ .docx 必须走 extractDocxHtml 渲染，不得再落「暂不支持」', () => {
    expect(FP, '★ 未引入 extractDocxHtml').toMatch(/import\s*\{[^}]*extractDocxHtml[^}]*\}\s*from\s*'@yan-zhi\/core'/);
    expect(FP, '★ loadFile 里没有 docx 渲染分支').toMatch(/extractDocxHtml\(/);
    // 模板里必须有 word 渲染分支（v-html）
    expect(FP, '★ 模板缺 .fp-docx 渲染分支').toMatch(/kind === 'word'/);
    expect(FP, '★ word 分支未用 v-html 渲染 docxHtml').toMatch(/v-html="docxHtml"/);
    // 旧的"Word 文档暂不支持内嵌预览"文案必须消失
    expect(FP, '★ 旧「Word 文档暂不支持内嵌预览」文案仍在').not.toMatch(/Word 文档暂不支持内嵌预览/);
  });

  it('★ 旧版 .doc 与超大文件必须降级（mammoth 不认 BIFF；50MB 上限）', () => {
    const load = bodyOf(FP, 'async function loadFile()');
    expect(load, '★ .doc 未单独降级（mammoth 解不了 BIFF 旧格式）')
      .toMatch(/e !== 'docx'/);
    expect(FP, '★ 缺少体积上限常量').toMatch(/DOCX_INLINE_MAX\s*=\s*50\s*\*\s*1024\s*\*\s*1024/);
    expect(load, '★ 超限未降级为本机打开').toMatch(/DOCX_INLINE_MAX/);
  });

  it('★ v-html 前必须净化（剥脚本类标签与 on* 内联事件）', () => {
    expect(FP, '★ 缺少 sanitizeDocxHtml 净化函数').toMatch(/function sanitizeDocxHtml/);
    const fn = bodyOf(FP, 'function sanitizeDocxHtml');
    expect(fn, '★ 未剥离 script/iframe 等标签').toMatch(/querySelectorAll\('script/);
    expect(fn, '★ 未剥离 on* 内联事件属性').toMatch(/startsWith\('on'\)/);
    // 渲染前必须先净化
    expect(FP, '★ docxHtml 赋值未经净化').toMatch(/sanitizeDocxHtml\(html\)/);
  });

  it('★ 渲染样式：A4 纸感页面 + 表格/图片排版', () => {
    const css = read('components/FilePreview.vue');
    expect(css, '★ 缺 .fp-docx 容器样式').toMatch(/\.fp-docx\s*\{/);
    expect(css, '★ 缺 .fp-docx-page 页面样式').toMatch(/\.fp-docx-page\s*\{/);
    expect(css, '★ 表格无边框样式').toMatch(/\.fp-docx-page :deep\(td\)/);
    expect(css, '★ 图片未限宽（会撑破页面）').toMatch(/\.fp-docx-page :deep\(img\)/);
  });
});

/**
 * 任务右键「打开目录」（2026-09-27 用户要求）。
 *
 * 判据：任务跑完的产物落在 `.yan-zhi/tasks/<convId>/...`，用户要能**从任务直接打开那个目录**。
 * 此前只有"打开某个文件的预览 → 再点打开目录"这条路，任务本身没有入口。
 */
describe('任务右键菜单：打开目录', () => {
  const SIDEBAR = read('components/chat/ChatSidebar.vue');

  it('★ 右键菜单必须有「打开目录」项', () => {
    expect(SIDEBAR, '★★ 任务右键菜单缺「打开目录」（用户去文件夹拿产物没有入口）').toMatch(/openConvDir\(ctxMenu\.conv\)/);
    expect(SIDEBAR, '★ 菜单项文字不对（用户认不出这是"打开目录"）').toMatch(/>\s*打开目录\s*</);
  });

  it('★★ 目录必须问服务端解析，不能前端自己拼（产物根是服务端算的）', () => {
    const fn = USE_CHAT.slice(USE_CHAT.indexOf('async function openConvDir'), USE_CHAT.indexOf('async function deleteSpaceConfirm'));
    expect(fn, '★★ 前端自己拼目录（与服务端产物根不一致 → 打开错目录）').toMatch(/artifact-dir\?category=deliverable/);
    // ★ 必须 ensure=1：任务还没产出文件时目录可能不存在，"打开目录"要能开出空目录而不是报错
    expect(fn, '★★ 未带 ensure=1（空任务打开会失败）').toMatch(/ensure=1/);
  });

  it('★ 非桌面端要给出可读提示，不静默失败', () => {
    const fn = USE_CHAT.slice(USE_CHAT.indexOf('async function openConvDir'), USE_CHAT.indexOf('async function deleteSpaceConfirm'));
    expect(fn, '★ 缺 electronAPI 判定（Web/移动端会静默无效）').toMatch(/electron\?\.shell\?\.showItemInFolder/);
    expect(fn, '★ 缺"仅桌面端支持"提示').toMatch(/仅桌面端支持/);
    expect(fn, '★ 缺失败提示（用户不知道点了有没有生效）').toMatch(/打开目录失败/);
  });
});

/**
 * 空间（目录）右键「打开目录」+ 右键子菜单样式（2026-09-27）。
 *
 * ★ 两个都是真实缺陷：
 *   ① 我先只给**任务**加了「打开目录」，但用户要的是**空间（目录）节点**的右键 ——
 *      空间对象自带 `dirPath`，更直。两处都要有。
 *   ② 右键子菜单（「移动到空间」的二级列表）**一条样式都没匹配上** ——
 *      主菜单项的选择器是 `.ctx-menu > *`（直接子元素），而子菜单项隔了一层
 *      （`.ctx-menu > li > ul.ctx-submenu > li`）→ 裸 li：行高塌陷、无圆角、无 hover。
 */
describe('空间右键「打开目录」+ 子菜单样式', () => {
  const SIDEBAR = read('components/chat/ChatSidebar.vue');
  const CSS = read('views/chat.css');

  it('★★ 空间（目录）右键菜单必须有「打开目录」（用户报的就是这里）', () => {
    // 空间菜单块（spaceMenuTarget）里要有 打开目录，且传空间自己的 dirPath
    const start = SIDEBAR.indexOf('v-if="spaceMenuTarget"');
    const end = SIDEBAR.indexOf('treeMenu.visible');
    const block = SIDEBAR.slice(start, end > 0 ? end : undefined);
    expect(block, '★★ 空间右键缺「打开目录」（用户报"任务列表里面目录右击"没有）')
      .toMatch(/openPathInSystem\(spaceMenuTarget\.space\.dirPath,\s*true\)/);
    expect(block, '★ 菜单项文字不对').toMatch(/>\s*打开目录\s*</);
  });

  it('★ 空间没绑定目录时要给可读提示（不能静默无反应）', () => {
    const fn = USE_CHAT.slice(USE_CHAT.indexOf('async function openPathInSystem'), USE_CHAT.indexOf('function tryParseSnapshot'));
    expect(fn, '★ 空路径直接 return（用户点了没任何反应）').toMatch(/未绑定本地目录/);
    expect(fn, '★ 目录用 openPath 直接打开（showItemInFolder 是"在父目录中选中"）').toMatch(/shell\?\.openPath/);
  });

  it('★★ 右键子菜单项必须有样式（此前一条都没匹配上 = 子菜单很丑）', () => {
    // 主菜单项样式
    expect(CSS, '★ 主菜单项样式丢了').toMatch(/\.ctx-menu > \* \{/);
    // ★ 子菜单项必须有属于自己的规则（不能只靠 `.ctx-menu > *`，它匹配不到隔层）
    expect(CSS, '★★ 子菜单项无样式规则（裸 li：行高塌陷/无圆角/无 hover）')
      .toMatch(/\.ctx-menu \.ctx-submenu > li \{/);
    expect(CSS, '★ 子菜单项缺 hover').toMatch(/\.ctx-submenu > li:hover/);
    expect(CSS, '★ 子菜单图标缺尺寸约束（会跟字号乱跑）').toMatch(/\.ctx-submenu > li > \.el-icon/);
    // 不可点的提示项要排除 hover（否则看着像能点）
    expect(CSS, '★ 子菜单的"暂无空间"提示未排除 hover').toMatch(/\.ctx-submenu > li\.disabled-hint:hover/);
  });
});
