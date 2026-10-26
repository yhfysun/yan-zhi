/**
 * 浏览器工具的**执行通道**必须逐个可解释（守门测试）。
 *
 * 背景（2026-10-26 实报「抖音发布页表单反复填了 4 分半还没完」）：
 *   直连档下所有 `browser_*` 都被当成 action 透传给主进程，而 `run_recipe` 是**编排层**
 *   （内部还要再发一整套 navigate/upload/fill_form/click/读页），不在
 *   `DESKTOP_BROWSER_ACTIONS` 里 ⇒ 桥回「不支持的浏览器 action: run_recipe」。
 *   于是为"填→读→再填"造的确定性配方**在所有智能体里都挂得到、调不动**。
 *   当时**没有任何测试**比对「工具注册表」与「桌面能力清单」这两个面 ⇒ 谁都能静默漏。
 *
 * 本文件钉两件事：
 *   ① 每个浏览器工具要么是桌面 action，要么在下表里**写明理由**（漏一个即红）；
 *   ② `browser_run_recipe` 走「服务端编排 + 子动作逐个走桥」，且特判必须在桥分发之前。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BROWSER_TOOL_NAMES } from '@yan-zhi/core';

const REPO = resolve(__dirname, '..', '..', '..');
const LTM = readFileSync(resolve(REPO, 'apps/server/src/llm-task-manager.ts'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');

/** 工具名 → 桌面 action 名（与 browser-bridge.ts 的 TOOL_ACTION_ALIASES 同口径） */
const TOOL_ACTION_ALIASES: Record<string, string> = { press_key: 'press' };

function desktopActions(): Set<string> {
  const i = MAIN.indexOf('const DESKTOP_BROWSER_ACTIONS = [');
  expect(i, '★ 锚点缺失：DESKTOP_BROWSER_ACTIONS').toBeGreaterThan(-1);
  const end = MAIN.indexOf('];', i);
  return new Set((MAIN.slice(i, end).match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')));
}

/**
 * 明确**不是**桌面页面动作的浏览器工具 —— 每个都必须写清理由。
 * 新增工具时：要么它能在桌面执行（进 DESKTOP_BROWSER_ACTIONS），要么在这里交代它走哪条路。
 * ★ 标「已知缺口」的是**还没改造**的：直连档下它们仍会被桥拒，别把它当"已修好"。
 */
const NOT_DESKTOP_ACTIONS: Record<string, string> = {
  browser_open_external: '打开系统默认浏览器，不是页面动作（已知缺口：桥里没有对应 action）',
  browser_login_saved: '用已保存密码登录，本身不是单个页面动作（已知缺口：走服务端 /login-saved 流程）',
  browser_run_recipe: '编排器：内部再发一整套动作 —— 已改造为服务端编排 + 子动作逐个走桥（见本文件下半）',
};

describe('浏览器工具的执行通道必须逐个可解释', () => {
  it('★★★ 每个 browser_* 要么是桌面 action，要么在下表里写明理由', () => {
    const actions = desktopActions();
    const unclassified = (BROWSER_TOOL_NAMES as string[])
      .filter((n) => !actions.has(TOOL_ACTION_ALIASES[n.slice('browser_'.length)] || n.slice('browser_'.length)))
      .filter((n) => !NOT_DESKTOP_ACTIONS[n]);
    expect(
      unclassified,
      `★ 这些工具既不是桌面 action、也没登记执行通道 → 直连档下桥会判「不支持的 action」：${unclassified.join(', ')}`,
    ).toEqual([]);
  });

  it('★ 例外表里已修好的那条必须真有对应实现（防"登记了却没修"）', () => {
    expect(LTM).toMatch(/exec === 'bridge' && toolName === 'browser_run_recipe'/);
  });
});

describe('browser_run_recipe 直连档路由', () => {
  it('★★★ 桥分发之前必须有 run_recipe 特判', () => {
    const special = LTM.indexOf("exec === 'bridge' && toolName === 'browser_run_recipe'");
    const bridgeCall = LTM.indexOf('callBrowserBridge(task.conversationId, toolName');
    expect(special, '★ 缺特判 → 配方被当普通 action 透传，桌面端不可用').toBeGreaterThan(-1);
    expect(bridgeCall, '★ 锚点缺失：桥分发调用').toBeGreaterThan(-1);
    expect(special, '★ 特判必须在通用桥分发之前（否则永远走不到）').toBeLessThan(bridgeCall);
  });

  it('★★ 子动作逐个走桥，而不是回落服务端 Playwright', () => {
    expect(LTM, '★ 子动作没有走桥 → 会分裂出第二个浏览器').toMatch(
      /callBrowserBridgeRaw\(task\.conversationId, subTool/,
    );
    expect(LTM, '★ 未把桥的 {error} 转异常 → 配方会把失败当成功').toMatch(
      /if \(raw\?\.error && !raw\?\.timedOut\) throw new Error/,
    );
  });

  it('★★ 编排器用的是工具自身的执行体（唯一实现，不另写一份步骤逻辑）', () => {
    expect(LTM).toMatch(/BrowserRunRecipeTool\.run\(args, api\)/);
  });
});
