// 「壳在、guest 已死」必须能换一个全新 webview 的守门测试（2026-10-29）—— 防回归。
//
// 背景（支付宝小游戏排障实测）：页面卡在加载态，主进程日志反复出现
//   `已广播 tabCreated: tab=tab-4 attempt=1..6` → 渲染层六次都是「已存在，跳过」
//   → `自建后等待 guest: wc=NULL(30s 超时)` → navigate 失败。
//
// 根因：`onTabCreated` 只判 **tab 壳**是否在，不看 guest 死活。guest 一旦死掉
//   （渲染进程崩溃 / 被主进程空闲休眠 / 被重载拖到无响应），壳还在 ⇒ 永远复用死元素
//   ⇒ 没有任何入口能把它换成新 guest。
//
// 修法：
//   ① `isGuestAlive()` 按 `getWebContentsId()` 判活（元素在但 guest 已销毁时返回 0）；
//   ② 壳在但 guest 死 → `reviveGuest()` 递增 `webviewGen`（模板 key 变化 ⇒ 强制重建元素）；
//   ③ 模板 `v-for` 的 key 必须带 `webviewGen`，否则代次变了元素也不重建（等于没修）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/components → 上溯 4 层到 repo 根
const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');

/** 取 `async function <name>(` 起、到下一个顶层 `async function` / 文件尾之间的函数体 */
function asyncFnBody(name: string): string {
  const start = PANEL.indexOf(`async function ${name}(`);
  expect(start, `未找到 async function ${name}(`).toBeGreaterThanOrEqual(0);
  const rest = PANEL.slice(start + 1);
  const next = rest.search(/\nasync function \w+\(/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

describe('★★★ 壳在但 guest 已死时必须重建 webview（否则 waitForGuest 30s 超时）', () => {
  it('webview 模板的 v-for key 带 webviewGen —— 否则代次递增不会重建元素', () => {
    const m = PANEL.match(/<template v-for="t in tabs" :key="([^"]+)">/);
    expect(m, '未找到 tabs 的 v-for 模板').not.toBeNull();
    expect(
      m![1],
      '★ tabs 的 v-for key 不含 webviewGen —— 递增代次也不会重建 <webview>，' +
      '「壳在、guest 死」的 tab 依然拿不回页面',
    ).toMatch(/webviewGen/);
  });

  it('onTabCreated：壳存在时先判 guest 存活，死了走重建而不是直接 return', () => {
    const start = PANEL.indexOf('onTabCreated?.(');
    expect(start, '未找到 onTabCreated 处理器').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(start, start + 4000);
    const existsIdx = body.indexOf('if (tabs.value.some(t => t.id === tid)) {');
    expect(existsIdx, 'onTabCreated 里未找到「壳是否已存在」的判断').toBeGreaterThanOrEqual(0);
    const after = body.slice(existsIdx, existsIdx + 1600);
    expect(after, '★ 壳存在时没有判 guest 存活（isGuestAlive）—— 死壳会被当成活页跳过').toMatch(/isGuestAlive\(/);
    expect(after, '★ guest 已死时没有调用 reviveGuest —— 主进程重播的 tabCreated 依然被跳过').toMatch(/reviveGuest\(/);
  });

  it('isGuestAlive 必须查 getWebContentsId（元素在 ≠ guest 活）', () => {
    const start = PANEL.indexOf('function isGuestAlive(');
    expect(start, '未找到 isGuestAlive').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(start, start + 700);
    expect(
      body,
      '★ isGuestAlive 没查 getWebContentsId —— 元素存在但 guest 已销毁时返回 0，' +
      '只看 webviewEls.has() 会把死壳当活页（就是这次 30s 超时的根因）',
    ).toMatch(/getWebContentsId/);
  });

  it('reviveGuest 递增 webviewGen 并清掉旧元素登记（否则新元素复用旧引用）', () => {
    const body = asyncFnBody('reviveGuest');
    expect(body, '★ reviveGuest 未递增 webviewGen —— 代次不变则元素不重建').toMatch(/webviewGen\.value\s*=/);
    expect(body, '★ reviveGuest 未清 webviewEls —— 旧元素引用残留会被当成本 tab 的活元素').toMatch(/webviewEls\.delete\(tabId\)/);
  });
});
