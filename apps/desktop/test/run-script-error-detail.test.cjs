/**
 * run_script 失败取证守门测试（2026-10-15）。
 *
 * ★★★ 背景（live DB `server-data/data.db` 实测，10-14 19:03 之后的时间窗）：
 *   当前最高频的浏览器失败是 `Script failed to execute, this normally means an error was
 *   thrown. Check the renderer console for the error.` —— **单一文案 12 次**（46 条错误里
 *   占 26%）。根因不是脚本本身，而是**报错丢信息**：`executeJavaScript` 的 rejection
 *   message 对页面内异常只给这一句通用文案，而**模型看不到 renderer console**，
 *   于是它只知道"失败了"、不知道"哪一行、什么错"，只能换着选择器盲试
 *   —— 这正是用户说的"步骤不准、重复操作多"。
 *
 * 修法：失败后把同一段脚本再在**页面内 try/catch** 里跑一次，把真实的 message/stack
 *   当**正常返回值**取回（成功路径完全不变 —— 只在已失败后走）。
 *
 * 本测试钉两件事（源码断言 + **真实行为**断言）：
 *   ① 成功路径未被改动（返回值形状、autoWrap 容错仍在）；
 *   ② 取证探测**真的**能把页面异常文本取回来 —— 用 `node:vm` 实跑探测模板，
 *      而不是只 regex 匹配源码（只匹配源码的测试改坏了也不会红，等于没测）。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSrc = fs.readFileSync(path.resolve(__dirname, '..', 'main.cjs'), 'utf8');
const caseIdx = mainSrc.indexOf("case 'run_script'");
const body = caseIdx > -1 ? mainSrc.slice(caseIdx, caseIdx + 4200) : '';

/** 从源码里取出探测模板字符串（`const probe = `...`;` 的内容），用于真实执行。 */
function probeTemplate() {
  const m = mainSrc.match(/const probe = `([\s\S]*?)`;\n/);
  assert.ok(m, '★ 未找到 run_script 失败取证探测模板（probe）—— 被删或改写了？');
  return m[1];
}

/** 用给定脚本内容实跑探测模板，返回它取回的异常文本（'' = 未捕获到异常）。 */
function runProbe(script) {
  const template = probeTemplate();
  // 模板在 main.cjs 里是**模板字面量**，源码中的 `\n` 由运行时解释成换行；
  // 这里取出的是源码原字符，直接当代码跑会被当成非法 token —— 故先还原换行，**再**注入脚本
  // （顺序不能反：先注入会让被测脚本自身的 `\n` 一起被还原）。
  const code = template.replace(/\\n/g, '\n').replace('${script}', script);
  const sandbox = {};
  vm.createContext(sandbox);
  return vm.runInContext(code, sandbox, { timeout: 2000 });
}

describe('run_script 失败取证（2026-10-15）', () => {
  test('能定位到 run_script 分支（改写后本测试需同步）', () => {
    assert.ok(body.length > 800, '未定位到 case run_script 段');
  });

  test('★ 成功路径未被改动：仍返回 {result, url} 且保留裸 return 自动包裹', () => {
    assert.match(body, /const r = await wc\.executeJavaScript\(script, false\)/, '成功路径仍应执行原始脚本（不套信封）');
    assert.match(body, /result: r === undefined \? null : r/, '成功返回值形状必须保持（bridge 按此 JSON 化 result）');
    assert.match(body, /_autoWrapped/, '裸 return 自动包裹容错必须保留');
  });

  test('★ 失败时必须做页面内二次取证，而不是只回 Electron 的通用文案', () => {
    assert.match(body, /const probe = `/, '缺少失败取证探测');
    assert.match(body, /catch \(e\) \{ return String\(\(e && \(e\.stack \|\| e\.message\)\) \|\| e\); \}/,
      '探测必须在页面内 try/catch 并回传真实 message/stack');
    assert.match(body, /脚本执行抛错：/, '错误文案必须带上真实异常（否则模型仍只能盲试）');
  });

  test('★ 取证必须限时（2s）—— 探测本身不能拖慢动作', () => {
    assert.match(body, /Promise\.race\(/, '探测必须竞速限时');
    assert.match(body, /setTimeout\(\(\) => r\(''\), 2000\)/, '取证上限应为 2000ms');
  });

  test('★ 真实行为：页面抛出的异常能被取回（不是只匹配源码）', () => {
    const got = runProbe("throw new Error('boom-xyz');");
    assert.match(String(got), /boom-xyz/, `探测未取回真实异常文本，实际拿到: ${JSON.stringify(got)}`);
  });

  test('★ 真实行为：运行期 SyntaxError 能被取回（如 JSON.parse 受非法文本）', () => {
    const got = runProbe("JSON.parse('{oops');");
    assert.match(String(got), /SyntaxError/, `运行期 SyntaxError 未被取回，实际拿到: ${JSON.stringify(got)}`);
  });

  test('★ 已声明的边界：注入脚本的**解析期**错误探测取不回（探测自身编译失败 → 调用方退回原文案）', () => {
    // 注入的脚本文本会成为探测自身的源码，编译期即失败，内层 try/catch 捕不到。
    // 这不是缺陷退化 —— 探测失败时 `detail` 留空，主流程退回 Electron 原始文案，与修复前一致。
    assert.throws(() => runProbe('const a = ;'), '解析期错误应让探测自身抛错（而非静默返回）');
  });

  test('★ 真实行为：正常脚本不产生误报（探测返回空串）', () => {
    assert.strictEqual(runProbe('const a = 1;'), '', '正常脚本不应被判为异常');
  });
});