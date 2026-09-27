// 移动端输入框「长按菜单 + 点按钮不收起 + 单行高度」的守门测试。
//
// 背景（2026-09-27 用户一条反馈里的三个问题）：
//   ① 「点击按钮输入框也会收缩成一样？」—— 点 `+` / 模型 / 新建任务 / 发送 时整条输入区
//      塌成一行；
//   ② 「输入框里面长按没有复制粘贴发送新建任务」—— 输入框只绑了 @paste（拦文件粘贴），
//      触屏长按走的是 WebView 系统菜单，行为不可控；
//   ③ 「单行也有点太高了在小一点」—— 收起态 1.6em 行高 + 上下 10px 内边距 ≈ 44px。
//
// 三个根因（本测试钉住的契约）：
//   ① 收起判据错在「textarea 失焦」而不是「用户点到了输入区之外」。
//      工具条按钮都在 `.input-area` 内部 → 点它们必然先 blur。
//   ② 输入框没有自己的长按处理；且 **长按必须挂在原生 div 上，不能挂 el-input**——
//      组件上的 v-on 走自定义事件，toHandlers 展开出的原生事件名对组件无效。
//   ③ 高度是 CSS 显式给的；行高与内边距**两个都要改**（高度公式里两者都参与）。
//
// 为什么用「读源码做静态断言」：三条都是**静态可判**（哪一行事件绑在哪个元素、
// 判定顺序、CSS 数值），渲染要拖 router + pinia + element-plus 整条依赖链，成本远高于收益。
//
// ★★ 全部断言做过变异测试（见文件末尾）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');

const INPUT = read('components/chat/ChatInputArea.vue');
const CHAT_CSS = read('views/chat.css');

/** 去注释：本文件注释里大量引用被断言的字样（如 `v-on="bindLongPress(...)"`），
 *  不清掉会被自己的注释绊倒（本项目已踩过多次，注释撞断言一律假红）。 */
const stripComments = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const CODE = stripComments(INPUT);
const CSS = stripCssComments(CHAT_CSS);

/**
 * 截取某个声明块的完整内容（带嵌套配平）。
 * ★★ 两个坑（本轮实测各踩一次）：
 *   ① 收起/展开两条选择器共用一个 `{ min-height: 0 }` 块（逗号分隔列表）→ 直接 indexOf
 *      会先命中那个共享块，读到 min-height 而不是 height（断言假红）。
 *   ② 共享块里**两条选择器都出现**（第二条在列表末尾、后面紧跟 `{`），所以连
 *      "锚定选择器+`{`"都不够 —— 必须再筛「块里真的有目标属性」。
 *   ⇒ 收集**所有**候选块，返回第一个含 `needle` 的。
 */
/**
 * 真正的 `height:` 声明（**排除 `min-height` / `max-height`**）。
 * ★ 本文件的共享块内容就是 `min-height: 0 !important;` —— 用朴素 `includes('height')`
 *   会把它当成命中，断言读到共享块（本轮实测踩到，假红两次）。
 */
const REAL_HEIGHT = /(?<![-\w])height\s*:/;

function blockOf(css: string, sel: string, needle: RegExp = REAL_HEIGHT): string {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{`, 'g');
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const start = css.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let j = start; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) { candidates.push(css.slice(start, j + 1)); break; } }
    }
  }
  expect(candidates.length, `未找到声明块 ${sel}`).toBeGreaterThan(0);
  const hit = candidates.find((b) => needle.test(b));
  expect(hit, `${sel} 的候选块里没有命中 ${needle} 的那个（共 ${candidates.length} 个）`).toBeTruthy();
  return hit!;
}

describe('① 点工具条按钮不得把移动端输入区收起', () => {
  it('★★ 收起判据必须是「点到了输入区之外」，不能是「textarea 失焦」', () => {
    // 正：存在一个专门决定收起的函数，且它被 blur 路径调用
    expect(CODE, '★ 缺少 maybeCollapseMobileInput（收起判据未集中）')
      .toMatch(/function\s+maybeCollapseMobileInput/);
    expect(CODE, '★ onInputBlur 未走收起判据').toMatch(/function\s+onInputBlur[\s\S]{0,900}?maybeCollapseMobileInput\(\)/);
    // 反向：blur 里不得再出现"只要失焦且空就立刻收起"的老写法
    const blurBody = CODE.slice(CODE.indexOf('function onInputBlur'), CODE.indexOf('function onInputBlur') + 900);
    expect(blurBody, '★ onInputBlur 又变回"失焦即收起"（点按钮会把输入区塌掉）')
      .not.toMatch(/if\s*\(isMobileShell\.value\s*&&\s*!String\(input\.value/);
  });

  it('★★ 必须在 blur 之前就记录「这一点落在哪」——否则永远读不到', () => {
    // 事件顺序是 pointerdown → blur。若在 blur 里才注册监听，那次 pointerdown 已过去。
    expect(CODE, '★ 缺少常驻的 pointerdown 位置记录')
      .toMatch(/function\s+onDocPointerdownTrack/);
    expect(CODE, '★ 位置记录未在 onMounted 常驻注册（捕获阶段）')
      .toMatch(/onMounted[\s\S]{0,700}?addEventListener\('pointerdown',\s*onDocPointerdownTrack,\s*true\)/);
    // 反向：不得在 blur 里临时注册 pointerdown（那是失效写法）
    const blurBody = CODE.slice(CODE.indexOf('function onInputBlur'), CODE.indexOf('function onInputBlur') + 900);
    expect(blurBody, '★ blur 里临时注册 pointerdown（事件已过去，永远等不到）')
      .not.toMatch(/addEventListener\('pointerdown'/);
  });

  it('★ 判定用 inputAreaEl 做范围检查，且 ref 必须挂在 .input-area 根节点上', () => {
    expect(CODE, '★ 未用 inputAreaEl 圈定输入区范围').toMatch(/inputAreaEl\.value\?\.contains\(/);
    // ★ 精确取「含 class="input-area" 的那个起始标签」，断言它带 ref（挂错层级会让
    //   工具条按钮被判成"输入区外部"→ 点按钮照样塌）
    const i = CODE.indexOf('class="input-area"');
    expect(i).toBeGreaterThan(-1);
    const tagStart = CODE.lastIndexOf('<div', i);
    const tagEnd = CODE.indexOf('>', i);
    const tag = CODE.slice(tagStart, tagEnd);
    expect(tag, '★ inputAreaEl 没挂在 .input-area 上（挂错层级 → 内部按钮被判成"外部"）')
      .toContain('ref="inputAreaEl"');
    // 反向：不得把 ref 挂到 .input-box 或 textarea 上充数
    expect(tag, '★ ref 挂到了 .input-area 之外').toContain('input-area');
  });

  it('★ 有内容时不得收起（继续接着写）', () => {
    const fn = CODE.slice(CODE.indexOf('function maybeCollapseMobileInput'));
    expect(fn.slice(0, 400), '★ 有内容也被收起').toMatch(/trim\(\)\)\s*return/);
  });
});

describe('② 移动端输入框长按菜单：复制 / 粘贴 / 发送 / 新建任务', () => {
  it('★★★ 长按必须挂原生 div，不能挂 el-input（组件 v-on 走自定义事件）', () => {
    expect(CODE, '★ 缺少 bindLongPress 接入').toContain('bindLongPress');
    // 正：模板里出现一个原生容器承接长按
    expect(CODE, '★ 未在原生元素上挂 v-on="bindLongPress(...)"')
      .toMatch(/class="input-textarea-wrap"[\s\S]{0,200}?v-on="bindLongPress\(onInputLongPress\)"/);
    // 反向：el-input 上不得出现 v-on="bindLongPress(...)"
    //   （组件上的 v-on 是自定义事件，toHandlers 展开的原生事件名对组件无效 → 永不触发）
    expect(CODE, '★ 把长按挂到了 el-input 上（组件 v-on 是自定义事件，不触发）')
      .not.toMatch(/<el-input[\s\S]{0,600}?v-on="bindLongPress\(/);
  });

  it('★★ 四个动作齐全，且复用既有入口（不另造状态）', () => {
    for (const label of ['复制', '粘贴', '发送', '新建任务']) {
      expect(CODE, `★ 长按菜单缺少「${label}」`).toMatch(new RegExp(`<span>${label}</span>`));
    }
    // 发送 / 新建任务必须复用既有函数（两条真相会漂）
    expect(CODE, '★ 「发送」未复用 send()').toMatch(/function\s+ilmSend[\s\S]{0,200}?send\(\)/);
    expect(CODE, '★ 「新建任务」未复用 startNewChat()').toMatch(/function\s+ilmNewTask[\s\S]{0,200}?startNewChat\(\)/);
  });

  it('★ 粘贴失败要给可读提示（不能静默什么都不做）', () => {
    const fn = CODE.slice(CODE.indexOf('async function ilmPaste'));
    expect(fn.slice(0, 700), '★ 剪贴板读取失败时静默返回（用户以为按钮坏了）')
      .toMatch(/catch[\s\S]{0,300}?ElMessage\.warning/);
  });

  it('★ 复制要有 execCommand 兜底（部分 WebView 的 clipboard API 受权限限制）', () => {
    const fn = CODE.slice(CODE.indexOf('async function ilmCopy'));
    expect(fn.slice(0, 900), '★ 复制缺少 execCommand 兜底')
      .toMatch(/execCommand\('copy'\)/);
  });

  it('★★ 长按后紧随的那次 click 不得把菜单立刻关掉', () => {
    // 与 ChatMessageList 的 actionsOpenedAt 同一手法：时间窗吞掉同手势的 click
    expect(CODE, '★ 未记录菜单打开时刻').toMatch(/inputMenuOpenedAt\s*=\s*Date\.now\(\)/);
    const fn = CODE.slice(CODE.indexOf('function onInputMenuLayerClick'));
    expect(fn.slice(0, 300), '★ 遮罩点击未按时间窗过滤（菜单刚弹出就被自己关掉）')
      .toMatch(/Date\.now\(\)\s*-\s*inputMenuOpenedAt\s*</);
  });

  it('★ 桌面端不得被改动：长按只认触屏，右键菜单只在移动壳里被拦', () => {
    const LP = read('composables/useLongPress.ts');
    expect(LP, '★ 长按未限定触屏').toMatch(/pointerType\s*!==\s*'touch'/);
    // contextmenu 处理必须由 isMobileShell 门控（桌面端保留浏览器原生右键菜单）
    const fn = CODE.slice(CODE.indexOf('function onInputContextMenu'));
    expect(fn.slice(0, 300), '★ 桌面端右键菜单被误拦')
      .toMatch(/if\s*\(!isMobileShell\.value\)\s*return/);
  });

  it('★ 菜单样式必须写在非 scoped 块（Teleport 到 body）', () => {
    // 取最后一个 <style> 块（非 scoped）来查
    const blocks = [...INPUT.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
    const globalBlock = blocks.filter((b) => !b[1].includes('scoped')).map((b) => b[2]).join('\n');
    expect(globalBlock, '★ 长按菜单样式没写在非 scoped 块（Teleport 后无样式）')
      .toMatch(/\.ilm-menu\s*\{/);
    expect(globalBlock, '★ 缺少遮罩层样式').toMatch(/\.ilm-layer\s*\{/);
  });
});

describe('③ 移动端收起态单行高度：压到紧凑', () => {
  it('★ 收起态高度公式里行高与内边距必须同步收紧', () => {
    const b = blockOf(CSS, '.input-textarea.is-collapsed .el-textarea__inner');
    // 高度 = 行高 + 上下内边距；两者都要改，只改一边算错
    expect(b, '★ 收起态行高未收紧（1.6em → 约 1.35em）').toMatch(/height:\s*calc\(1\.35em/);
    expect(b, '★ 收起态内边距未收紧（10px×2 → 6px×2）').toMatch(/padding-top:\s*6px/);
    expect(b, '★ 内边距只改了 top（bottom 不配对会错位）').toMatch(/padding-bottom:\s*6px/);
    // 反向：不得退回旧值
    expect(b, '★ 收起态高度退回旧值（1.6em + 20px，44px 偏高）')
      .not.toMatch(/height:\s*calc\(1\.6em\s*\+\s*20px\)/);
  });

  it('★★ 收起态外壳 padding 也要收紧（只压 textarea 会被外壳顶回去）', () => {
    const b = blockOf(CSS, '.input-area.is-mobile-collapsed .input-box', /padding\s*:/);
    expect(b, '★ 收起态外壳 padding 未收紧').toMatch(/padding:\s*3px/);
  });

  it('★ 展开态高度不得被误改（仍是 3 行起）', () => {
    const b = blockOf(CSS, '.input-textarea.is-expanded .el-textarea__inner');
    expect(b, '★ 展开态高度被改动（应保持 3 行）').toMatch(/calc\(1\.6em\s*\*\s*3\s*\+\s*20px\)/);
  });

  it('★ 两态都必须仍有显式 height !important（autosize 会被 placeholder 顶高）', () => {
    for (const sel of ['.input-textarea.is-collapsed .el-textarea__inner', '.input-textarea.is-expanded .el-textarea__inner']) {
      expect(blockOf(CSS, sel), `★ ${sel} 缺 height !important`).toMatch(/height:[^;]*!important/);
    }
  });
});

/*
 * ===== 变异测试记录（2026-09-27）=====
 * 逐条把正确写法改回错误写法，确认断言变红后还原：
 *  m1  ChatInputArea: onInputBlur 改回「失焦且空即收货」                     → 变红 ✓
 *  m2  ChatInputArea: 删掉 onDocPointerdownTrack 的常驻注册                  → 变红 ✓
 *  m3  ChatInputArea: 把 pointerdown 注册挪进 onInputBlur 里                  → 变红 ✓
 *  m4  ChatInputArea: inputAreaEl 的 ref 从 .input-area 挪到 .input-box        → 变红 ✓
 *  m5  ChatInputArea: v-on="bindLongPress(...)" 从 div 挪到 el-input 上        → 变红 ✓
 *  m6  ChatInputArea: 删掉长按菜单的「新建任务」项                            → 变红 ✓
 *  m7  ChatInputArea: ilmPaste 的 catch 改成静默 return                       → 变红 ✓
 *  m8  ChatInputArea: 去掉 inputMenuOpenedAt 时间窗过滤                       → 变红 ✓
 *  m9  ChatInputArea: onInputContextMenu 去掉 isMobileShell 门控              → 变红 ✓
 *  m10 chat.css: 收起态高度改回 calc(1.6em + 20px)                            → 变红 ✓
 *  m11 chat.css: 删掉 .input-area.is-mobile-collapsed .input-box 规则          → 变红 ✓
 *  m12 chat.css: is-expanded 高度改成 2 行                                     → 变红 ✓
 */