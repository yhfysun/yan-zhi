// 命令审批闸门 UI 契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 守护的东西：
//   ① 待批准条必须渲染在 el-tabs **之外** —— 助手正卡在等人点头，用户切到哪个 Tab 都得看得见；
//   ② 只显示 pending，已决的不该继续霸占界面；
//   ③ 轮询要随组件卸载停掉（否则切走页面还在后台打接口）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));

describe('OpsConsole · 待批准命令条', () => {
  it('有批准/拒绝两个按钮，绑到 decideApproval', () => {
    expect(CONSOLE).toMatch(/@click="decideApproval\(a, true\)"/);
    expect(CONSOLE).toMatch(/@click="decideApproval\(a, false\)"/);
    expect(CONSOLE).toMatch(/>批准</);
    expect(CONSOLE).toMatch(/>拒绝</);
  });

  it('★ 渲染在 el-tabs 之外（任何 Tab 下都必须看得见）', () => {
    const bannerAt = CONSOLE.indexOf('ops-approvals');
    const tabsAt = CONSOLE.indexOf('<el-tabs v-model="mode"');
    expect(bannerAt).toBeGreaterThanOrEqual(0);
    expect(tabsAt).toBeGreaterThan(bannerAt);
    // 只保留工作区内的那一个渲染点，别在某个 Tab 里再复制一份
    expect((CONSOLE.match(/class="ops-approvals"/g) ?? [])).toHaveLength(1);
  });

  it('只显示 pending（已批准/已拒绝的不该继续霸占界面）', () => {
    const fn = CONSOLE.match(/async function loadApprovals\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 loadApprovals').toBeTruthy();
    expect(fn![0]).toMatch(/a\.status === 'pending'/);
  });

  it('★ 决策必须显式传 approve 布尔值（缺省当成「批准」是最危险的默认）', () => {
    const fn = CONSOLE.match(/async function decideApproval\(row: ApprovalRow, approve: boolean\)[\s\S]*?\n\}/);
    expect(fn, '找不到 decideApproval').toBeTruthy();
    expect(fn![0]).toMatch(/api\.post\(`\/plugin\/ops-shell\/approvals\/\$\{row\.id\}`, \{ approve \}\)/);
    // 决策后本地立即移除，避免重复点击
    expect(fn![0]).toMatch(/filter\(\(a\) => a\.id !== row\.id\)/);
  });

  it('轮询随组件卸载停掉', () => {
    expect(CONSOLE).toMatch(/startVisiblePolling\(loadApprovals/);
    const un = CONSOLE.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\);/);
    expect(un, '找不到 onUnmounted').toBeTruthy();
    expect(un![0]).toMatch(/approvalPoll\(\)/);
  });
});
