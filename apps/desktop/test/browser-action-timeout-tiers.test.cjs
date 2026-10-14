/**
 * 浏览器动作超时分档守门测试（2026-10-14）。
 *
 * ★★★ 背景：用户要求"先量排队耗时，再决定怎么改"。量出来的结论（三份主进程日志
 *   共 1330 次真实动作，按"桥墙钟"分档统计）：
 *     · 成功动作耗时 p50=538ms / p90=9.9s / p95=14.3s / p99=23.9s；
 *     · **一旦超过 20s 几乎注定拿不到结果**：20~30s 档 63 次只成功 11 次（17%），
 *       ≥30s 档 98 次只成功 6 次（6%）；
 *     · ≥20s 的 161 次占全部墙钟 **59.9%（88 分钟）**，其中 **76 次是超时白等（49.4 分钟）**；
 *     · **不存在"排队"**：桥路径无队列（bridge 每请求独立 await runAction），
 *       仅 8% 的动作出现过 8s"前置等待"。
 *   ⇒ 默认档 30s → 15s（省约 30.4 分钟白等，仅截断 30 次本来会成功的动作）。
 *
 * 本测试钉住三档与文案，防止"数据依据还在注释里、档位已被无声改回"。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const idx = mainSrc.indexOf('const SLOW_ACTIONS =');
const body = idx > -1 ? mainSrc.slice(idx, idx + 4200) : '';

describe('浏览器动作超时分档', () => {
  test('能定位到超时分档代码（改写后本测试需同步）', () => {
    assert.ok(body.length > 1000, '未定位到 SLOW_ACTIONS 超时分档段');
  });

  test('★ 三档并存：慢档 60s / 导航档 30s / 默认档 15s', () => {
    assert.match(body, /SLOW_ACTIONS\s*=\s*new Set\(\['upload'[^\]]*'screenshot'[^\]]*\]\)/, '慢档应含 upload + screenshot');
    assert.match(body, /NAV_ACTIONS\s*=\s*new Set\(\['navigate'\]\)/, '★ navigate 必须单列一档（慢站导航实测常 14.5s，不能跟默认档一起压到 15s）');
    assert.match(body, /SLOW_ACTIONS\.has\(action\)\s*\?\s*60000/, '慢档应为 60000ms');
    assert.match(body, /NAV_ACTIONS\.has\(action\)\s*\?\s*30000/, '导航档应为 30000ms');
    assert.match(body, /:\s*15000\b/, '★ 默认档应为 15000ms —— 这是按实测（p95=14.3s、超 20s 成功率仅 17%）定的，改回 30000 需重新量数据');
  });

  test('★ 超时文案：要"改道"而不是引导原地重试', () => {
    const at = body.indexOf('内未返回');
    const msg = at > -1 ? body.slice(at, at + 1100) : '';
    assert.match(msg, /不要原地重试同一动作/, '★ 必须明确禁止原地重试（旧文案"改用 browser_wait_for 等待后，再读同一个"正是在引导重试）');
    assert.ok(!/等待页面就绪后，再用 browser_get_page_content 读取当前内容/.test(msg),
      '★ 旧的"等一会儿再读同一个"措辞不得残留');
    assert.match(msg, /browser_run_script/, '改道要给出"只取需要的字段"这条低成本出路');
    assert.match(msg, /停下汇报/, '连续两次同一动作失败要能收敛到汇报，而不是无限换招');
  });

  test('★ 超时文案要与"提交前绝不刷新"一致（不得让人去刷新"恢复"）', () => {
    const at = body.indexOf('内未返回');
    const msg = at > -1 ? body.slice(at, at + 1100) : '';
    assert.match(msg, /不要用刷新/, '★ 超时后的指引必须点明：已填内容刷新即丢，不要用刷新恢复');
  });
});
