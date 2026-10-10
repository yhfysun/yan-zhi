/**
 * 双链路语义收敛（B6，2026-10-09）守门测试。
 *
 * 背景（实测）：同一工具在**桌面 CDP 链路**与**服务端 Playwright 链路**行为不一致 ——
 *   `browser_get_page_content` 的 `interactive` 元素对象：
 *     · 服务端（`browser.ts:1115`）= `{index, ref, tag, selector, text}` —— **有 selector**
 *     · 桌面（`main.cjs` 的 `get_page_content` 分支）= `{index, tag, text, axRole, ...}`
 *       —— **没有 selector**
 *   而它的**同族**动作 `get_page_info`（桌面 `main.cjs:2803`）**一直都有** `selector:A.genSel(el)`；
 *   工具描述与提示词也都承诺"元素含 selector 可直接作为 selector 参数"。
 *   ⇒ 后果：同一 prompt 在桌面端拿不到 selector（只能靠 index，SPA 重渲染后 index 失效只好重读页），
 *     服务端却拿得到 —— 同工具两执行链行为不一致，是最难查的一类 bug。
 *
 * 本测试钉：
 *   ① 桌面 `get_page_content` 的返回对象含 `selector:A.genSel(el)`；
 *   ② 与同族 `get_page_info` 用**同一个** genSel（不另造选择器生成器）；
 *   ③ 服务端侧同样有 selector（防反向漂移）；
 *   ④ ★★★ 模板串安全：`get_page_content` 所在的 `executeJavaScript` 模板串内
 *      **不得出现反引号**（注释里写 `` `foo` `` 会提前闭合模板串 —— 本次真踩：
 *      报 `missing ) after argument list`，且报错行指向完全无关的位置）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const MAIN = read('apps/desktop/main.cjs');
const SERVER = read('apps/server/src/routes/browser.ts');

/** 去掉注释行（★ 断言"代码里有没有某内容"时必须先剥注释，否则会被注释满足 —— 本项目多次踩） */
function stripComments(s: string): string {
  return s.replace(/^\s*\/\/.*$/gm, '');
}

/** 截取 `case '<name>': {` 起到下一个 `case '` 的片段（**第一个**匹配） */
function caseBody(src: string, caseName: string): string {
  const i = src.indexOf(`case '${caseName}': {`);
  expect(i, `锚点不存在：case '${caseName}'`).toBeGreaterThan(-1);
  const rest = src.slice(i);
  const next = rest.indexOf("\n      case '", 1);
  return next > 0 ? rest.slice(0, next) : rest.slice(0, 8000);
}

/**
 * ★ 截取**含指定内容**的那个 case 片段。
 * ★★ 为什么需要：`main.cjs` 里 `case 'get_page_info'` **出现了两次**（:1808 与 :2775，
 *    后者是含 genSel 的那份）—— `caseBody` 只取第一个 → 断言锚错（本次真踩，假红）。
 *    ⇒ 按"caseName + 必须含某内容"定位，避免同名单多处时的歧义。
 */
function caseBodyContaining(src: string, caseName: string, mustContain: string): string {
  let from = 0;
  for (;;) {
    const i = src.indexOf(`case '${caseName}': {`, from);
    if (i === -1) break;
    const rest = src.slice(i);
    const next = rest.indexOf("\n      case '", 1);
    const body = next > 0 ? rest.slice(0, next) : rest.slice(0, 8000);
    if (body.includes(mustContain)) return body;
    from = i + 1;
  }
  expect(false, `未找到含「${mustContain}」的 case '${caseName}'`).toBe(true);
  return '';
}

describe('① 桌面 get_page_content 必须含 selector', () => {
  it('★★★ interactive 元素对象必须带 selector', () => {
    // ★★★ 必须**先剥注释**再断言：本分支上方有解释性注释里也写了
    //   `selector:A.genSel(el)`（说明"要补什么"）—— 不剥注释的话，把真实代码行删掉
    //   （变异验证做过）断言仍被**注释**满足 → 假绿。本项目多次踩"注释满足断言"。
    const body = stripComments(caseBody(MAIN, 'get_page_content'));
    expect(body, '★ 桌面 get_page_content 的元素对象仍无 selector → 与同族 get_page_info 及服务端不一致')
      .toMatch(/selector:\s*A\.genSel\(el\)/);
  });

  it('★★★ 必须与 get_page_info 用**同一个**生成器（不另造）', () => {
    // ★ 用 caseBodyContaining —— `case 'get_page_info'` 在 main.cjs 里有**两份**，
    //   含 genSel 的是 :2775 那份（`caseBody` 只取第一个会锚错，本次真踩）。
    const info = stripComments(caseBodyContaining(MAIN, 'get_page_info', 'genSel'));
    const content = stripComments(caseBody(MAIN, 'get_page_content'));
    expect(info, '★ get_page_info 的 selector 生成器变了').toMatch(/A\.genSel\(el\)/);
    expect(content, '★ get_page_content 用了另一个生成器（两处会漂移）').toMatch(/A\.genSel\(el\)/);
    // 两处都不得自己实现一个 genSel 变体
    expect(content, '★ get_page_content 内联了自己写选择器的逻辑').not.toMatch(/querySelector.*:nth-child/);
  });

  it('★★ 返回的 hint 不得承诺不存在的字段（或承诺了就要给）', () => {
    const body = stripComments(caseBody(MAIN, 'get_page_content'));
    // 已有 hint 说 index 可直接用于 browser_click/browser_type —— 这是对的（工具确实支持 index）
    expect(body, '★ hint 与实现不符').toMatch(/index 字段/);
  });
});

describe('② 服务端侧同字段（防反向漂移）', () => {
  it('★★ 服务端 get_page_info 的元素对象必须含 selector', () => {
    // browser.ts:1115 处
    expect(SERVER, '★ 服务端侧丢了 selector（反过来了）').toMatch(/selector:\s*R\.genSel\(el\)/);
  });

  it('★★ 两链路字段名必须一致（selector 而非 selectorHint 之类）', () => {
    expect(SERVER, '★ 服务端字段名漂移').toMatch(/\bselector:\s*R\.genSel/);
    expect(MAIN, '★ 桌面字段名漂移').toMatch(/\bselector:\s*A\.genSel/);
  });
});

describe('③ ★★★ 模板串安全（本次真踩的坑）', () => {
  it('get_page_content 的 executeJavaScript 模板串内不得出现反引号', () => {
    const body = caseBody(MAIN, 'get_page_content');
    // 该分支形态：`return await wc.executeJavaScript(`(function(){ ... })()`);`
    // ★ 止锚点用 `})()`);`（**不是** `)`);` —— 第一版写错导致"锚点缺失"假红）
    const start = body.indexOf('executeJavaScript(`');
    const end = body.indexOf('})()`);', start);
    expect(start, '★ 锚点缺失：executeJavaScript 模板串起').toBeGreaterThan(-1);
    expect(end, '★ 锚点缺失：模板串止').toBeGreaterThan(start);
    const tpl = body.slice(start, end);
    const ticks = (tpl.match(/`/g) || []).length;
    // 只应有一个开头的反引号（`(` 之后）；出现第二个 = 有嵌套反引号 → 提前闭合
    expect(ticks, '★ 模板串内出现反引号 → 提前闭合（报 missing ) after argument list，且报错行指向无关位置）')
      .toBe(1);
  });

  it('get_page_info 的模板串同样不得含反引号（同族一致性）', () => {
    const body = caseBodyContaining(MAIN, 'get_page_info', 'genSel');
    const start = body.indexOf('executeJavaScript(`');
    if (start === -1) return; // 该分支可能不走模板串
    const end = body.indexOf('})()`);', start);
    if (end < 0) return;
    const tpl = body.slice(start, end);
    expect((tpl.match(/`/g) || []).length, '★ get_page_info 模板串含反引号').toBe(1);
  });
});