/**
 * 原生弹窗处理（B4，2026-10-09）守门测试。
 *
 * 背景（实测）：桌面端此前**无任何 dialog 处理**（grep 确认），也无 `disableDialogs`。
 *   页面弹 `window.alert/confirm/prompt` 时会**同步阻塞该 renderer 的 JS 执行** →
 *   pageAgent 后续所有 `executeJavaScript` / `capturePage` 一起挂起到 18s 总闸（甚至永久）
 *   —— 用户体感是"浏览器工具突然全部卡死"。
 * ★ 为什么服务端没这问题：Playwright **未注册 dialog handler 时会自动 dismiss**，
 *   同一页面在服务端链路正常 ⇒ 两链路行为不一致（B6/B7 同族）。
 *
 * 修法：用 Electron 官方 webPreferences 字段 `disableDialogs`（"disable dialogs completely"），
 *   而不是自己猜 API（本项目踩过"臆造 API"）。语义与服务端"自动 dismiss"对齐。
 *
 * 本测试钉：
 *   ① 两处 guest 创建路径**都必须**加（BrowserView 引擎 + webview 引擎的 will-attach-webview）；
 *      ★ 只加一处会漏掉整个引擎 —— 两引擎并存是本项目既定设计。
 *   ② 用的是**官方字段** `disableDialogs`（不是臆造的事件/方法）；
 *   ③ 不得影响应用**自己的**窗口（子窗口/框选窗）—— 那些是本应用 UI，弹确认框是合理的；
 *   ④ 不得残留臆造 API（如 `wc.on('dialog')` —— Electron 的 webContents **没有**该事件）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const MAIN = read('apps/desktop/main.cjs');

describe('① 两处 guest 路径都必须禁用原生弹窗', () => {
  it('★★★ BrowserView 引擎（createBrowserViewFor）必须禁用', () => {
    const i = MAIN.indexOf('function createBrowserViewFor');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = MAIN.slice(i, i + 2000);
    expect(body, '★ BrowserView guest 未禁用原生弹窗 → alert/confirm 会阻塞 renderer')
      .toMatch(/disableDialogs:\s*true/);
  });

  it('★★★ webview 引擎（will-attach-webview）必须禁用', () => {
    const i = MAIN.indexOf("on('will-attach-webview'");
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = MAIN.slice(i, i + 900);
    expect(body, '★ webview guest 未禁用 → 只改了 BrowserView 那处，整个 webview 引擎漏掉')
      .toMatch(/disableDialogs\s*=\s*true/);
  });

  it('★★ 两处都必须真的写进 webPreferences（不是写在别处）', () => {
    const assigned = (MAIN.match(/disableDialogs(:\s*true|\s*=\s*true)/g) || []).length;
    expect(assigned, `★ disableDialogs 赋值只有 ${assigned} 处（应 2 处：两引擎各一）`).toBe(2);
  });
});

describe('② 用官方字段，不自造 API', () => {
  it('★★★ 不得出现臆造的 webContents dialog 事件监听', () => {
    // Electron 的 webContents **没有** 'dialog' 事件（那是 Playwright/CDP 的能力）
    expect(MAIN, "★ 出现 wc.on('dialog') —— Electron webContents 无此事件（臆造 API）")
      .not.toMatch(/\.on\(\s*'dialog'/);
  });

  it('★★ 不得出现 Electron 不存在的 dialog 相关方法调用', () => {
    expect(MAIN, '★ 出现臆造的 setDialogHandler 之类').not.toMatch(/setDialogHandler|onDialog\(/);
  });
});

describe('③ 不得误伤应用自身窗口', () => {
  it('★★ 子窗口（BrowserWindow 承载应用 UI）不应被禁用弹窗', () => {
    // 子窗口的 webPreferences 里有 preload.cjs（承载应用 UI）—— 它弹确认框是正常交互
    const i = MAIN.indexOf("preload: path.join(__dirname, 'preload.cjs')");
    expect(i, '★ 锚点缺失：子窗口 preload').toBeGreaterThan(-1);
    // 取该 webPreferences 块（向后 400 字符）
    const body = MAIN.slice(i, i + 400);
    expect(body, '★ 误伤了应用子窗口（会把应用自己的确认框也吞掉）').not.toMatch(/disableDialogs/);
  });

  it('★★ 框选窗（snip-preload）不应被禁用', () => {
    const i = MAIN.indexOf("preload: path.join(__dirname, 'snip-preload.cjs')");
    expect(i, '★ 锚点缺失：框选窗 preload').toBeGreaterThan(-1);
    const body = MAIN.slice(i, i + 300);
    expect(body, '★ 误伤了框选窗').not.toMatch(/disableDialogs/);
  });
});

describe('④ 与服务端语义对齐（防反向漂移）', () => {
  it('★★ 服务端不需要改（Playwright 未注册 handler 时自动 dismiss）—— 但必须有说明', () => {
    const BROWSER = read('apps/server/src/routes/browser.ts');
    // 服务端不该出现"自己注册 dialog handler"的代码（没必要时不要加，避免两链路反向漂移）
    expect(BROWSER, '★ 服务端自行注册了 dialog handler（Playwright 默认已 dismiss，重复实现会漂移）')
      .not.toMatch(/\.on\('dialog'/);
  });

  it('★★ 桌面侧的改动必须写明"与服务端对齐"的理由（防后人以为多余而删掉）', () => {
    const i = MAIN.indexOf('disableDialogs: true');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const before = MAIN.slice(Math.max(0, i - 1400), i);
    expect(before, '★ 未写明"与服务端 Playwright 自动 dismiss 对齐"的理由').toMatch(/Playwright|自动 dismiss|对齐/);
  });
});