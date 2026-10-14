/**
 * navigate 的 force 刷新闸门守门测试（2026-10-14）。
 *
 * ★★★ 背景：用户实报「表单都填好了又去刷新页面重新填写」。
 *   抖音发布/编辑页**不存草稿**，刷新即清空已填内容。同 URL 重复导航此前已有守卫
 *   （`alreadyOpen`，见 navigate 分支内注释），但 **`force:true` 是唯一能绕过它的出口** ——
 *   而经验档里曾**明确教**模型"页面卡住就用 browser_navigate 带 force:true 强制刷新"，
 *   等于官方指路去清空表单。
 *
 * 修法：同 URL + force + 页面上还有未提交的已填字段 → **拒绝**，并给出不破坏页面的出路。
 * ★ 关键边界：只在"同 URL 刷新"这一种情形拦 —— **导航去别的页面不拦**
 *   （提交后跳下一步时表单残留值不该成为障碍）。本测试专门钉住这条边界，
 *   防止将来有人把守卫放宽成"只要有已填字段就不许导航"，那会破坏正常流程。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');

/**
 * 取 navigate 分支正文。
 * ★ 锚点唯一性：`case 'navigate'` 只应有一处；若将来出现第二处，本函数会取到第一个、
 *   断言可能错位 —— 故额外要求体内含 `alreadyOpen`（同 URL 守卫的唯一标志）。
 */
function navigateCaseBody(src) {
  let from = 0;
  for (;;) {
    const i = src.indexOf("case 'navigate':", from);
    if (i < 0) return '';
    const seg = src.slice(i, i + 12000);
    if (seg.includes('alreadyOpen')) return seg;
    from = i + 1;
  }
}

const body = navigateCaseBody(mainSrc);

describe('navigate 分支：force 刷新不得清空已填表单', () => {
  test('能定位到 navigate 分支（改名/改写后本测试需同步）', () => {
    assert.ok(body.length > 1000, "未定位到含 alreadyOpen 的 case 'navigate' 分支");
  });

  test('★ 同 URL + force 时必须探测"已填字段"', () => {
    const forceIdx = body.indexOf('args.force === true');
    assert.ok(forceIdx > -1, '★ 缺"force + 同 URL"这一支的判断');
    const probe = body.slice(forceIdx, forceIdx + 1600);
    assert.match(probe, /querySelectorAll\(['"]input, textarea, \[contenteditable="true"\]['"]\)/,
      '★ 必须探测 input / textarea / contenteditable 的已填值');
    assert.match(probe, /readOnly === true \|\| el\.disabled === true/, '只读/禁用控件不该算"已填"（否则误拦）');
  });

  test('★ 拒绝文案要说清三件事：拒绝刷新、页面不存草稿、改走提交或读页', () => {
    const idx = body.indexOf('拒绝刷新');
    assert.ok(idx > -1, '★ 缺「拒绝刷新」的返回');
    const msg = body.slice(idx, idx + 900);
    assert.match(msg, /不存草稿/, '要说清根因：该页面不存草稿，刷新即清空');
    assert.match(msg, /browser_get_page_content/, '要给出不破坏页面的出路');
    assert.match(msg, /不要重复传 force:true/, '要写明"别重复试同一招"，否则模型会反复重试');
  });

  test('★★ 边界：只在同 URL 刷新时拦，导航去别的页面不拦', () => {
    const forceIdx = body.indexOf('args.force === true');
    const cond = body.slice(Math.max(0, forceIdx - 120), forceIdx + 200);
    assert.match(cond, /normUrl\(curUrl\) === normUrl\(cleanUrl\)/,
      '★ 必须限定"目标 URL 与当前 URL 相同" —— 放宽成"有已填字段就不许导航"会破坏正常流程（提交后跳下一步）');
  });

  test('同 URL 守卫的提示文案不再主动劝模型用 force:true（那是去清空表单）', () => {
    const idx = body.indexOf('alreadyOpen');
    assert.ok(idx > -1, '未找到 alreadyOpen 返回');
    const note = body.slice(idx, idx + 600);
    assert.ok(
      !/若确需强制刷新请传 force:true/.test(note),
      '★ 原文案在主动邀请 force 刷新 —— 与"提交前绝不刷新"的目标相悖，应改为指向 DOM 读取',
    );
  });
});
