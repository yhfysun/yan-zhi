/**
 * 页面就绪闸守门测试（2026-10-26）。
 *
 * ★★★ 背景（用户报"智能体跑任务还是很困难"，实测日志 + CDP 量测）：
 *   旧闸的判据是 `wc.isLoading()`（含所有子资源），等的却是 `dom-ready`（≈DOMContentLoaded）。
 *   抖音创作者中心这类 SPA 的 load 永远等不到，而 dom-ready **早已触发过** ⇒ await 里的事件
 *   永远不再来 ⇒ 每个动作固定睡满 8000ms。实测 run_script 8217/9750/8374/8012ms、
 *   close_tab 11030ms，全是白等；同页 CDP 实测文档仅 852 节点、扫描 0.1ms，
 *   readyState 长期停在 "interactive" —— 慢的**不是**读页，是这个闸。
 *
 *   同一次故障里 navigate 后立刻 get_page_content：8s 闸 + 15s 超时 = 26.8s 换一个错误，
 *   两个 highlight 注入（3s 上限）同时超时 —— 两条独立的 executeJavaScript 同时饿死，
 *   说明卡的是**主线程**而非单个工具 ⇒ 闸里必须补"主线程响应探测"。
 *
 * 本测试钉住三件事，防止无声退回：
 *   ① 判据必须是 isLoadingMainFrame（不是 isLoading）；
 *   ② 不依赖文档的 tab 管理动作不得等待；
 *   ③ 必须有主线程探测（executeJavaScript('1') 探针）。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const idx = mainSrc.indexOf('const NO_SETTLE_ACTIONS =');
const body = idx > -1 ? mainSrc.slice(Math.max(0, idx - 1200), idx + 3000) : '';

describe('页面就绪闸（前置等待）', () => {
  test('能定位到就绪闸代码（改写后本测试需同步）', () => {
    assert.ok(body.length > 1500, '未定位到 NO_SETTLE_ACTIONS 就绪闸段');
  });

  test('★ 判据必须是主框架加载，不能是 isLoading()', () => {
    assert.match(body, /isLoadingMainFrame\(\)/,
      '★ 必须用 isLoadingMainFrame —— 用 isLoading() 会让 SPA 的子资源加载永远命中，每个动作白等 8s');
    assert.ok(!/loadingNow\s*=\s*!!wc\.isLoading\(\)/.test(body),
      '★ 旧判据 wc.isLoading() 不得残留（dom-ready 早已触发，等它等于固定睡满上限）');
  });

  test('★ 不依赖页面文档的 tab 管理动作不得等待', () => {
    for (const act of ['new_tab', 'switch_tab', 'close_tab', 'get_tabs']) {
      assert.ok(
        new RegExp(`NO_SETTLE_ACTIONS\\s*=\\s*new Set\\(\\[[^\\]]*'${act}'`).test(body),
        `★ ${act} 不需要页面文档，不得进就绪闸（实测 close_tab 为此白等 8s）`
      );
    }
    assert.match(body, /!NO_SETTLE_ACTIONS\.has\(action\)/,
      '★ 闸必须按 NO_SETTLE_ACTIONS 放行，否则集合白加');
  });

  test('★ 必须有主线程响应探测（否则真动作被排进饱和队列后饿死）', () => {
    assert.match(body, /executeJavaScript\('1'\)/,
      '★ 探针必须是极短脚本——它会被排到主线程队尾，"答得快"才等于"现在能跑真动作"');
    assert.match(body, /PROBE_MS/, '探针要有单次上限，不能无限等');
    assert.match(body, /deadline/, '探测循环必须受总时限约束，不能靠探针自己收敛');
  });

  test('★ fast 动作（实时/游戏）不得进闸（否则每步白等最多 8s）', () => {
    assert.match(body, /!args\?\.fast/,
      '★ 闸必须认 args.fast —— 代玩/实时循环每一步都要求毫秒级，8s 的就绪等待会直接把游戏卡死');
  });
});
