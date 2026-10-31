/**
 * 输入框「下一步建议」ghost · 源码守门测试（2026-10-31）。
 *
 * ui 包挂载成本高（同 input-send-affordance.test.ts 的口径），这里走源码静态断言，
 * 守的是**交互契约**而不是实现细节：
 *   ① 只在「桌面端 + 非归档 + 空闲 + 输入为空 + 建议属于当前会话」时显示；
 *   ② Tab 优先接受建议（preventDefault，不再走命令补全）；Esc 可忽略；
 *   ③ 有 ghost 时 placeholder 让位（否则两层灰字叠在一起）；
 *   ④ 设置开关关闭后前端完全不请求。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = readFileSync(resolve(__dirname, '../../components/chat/ChatInputArea.vue'), 'utf8');
const SETTINGS = readFileSync(resolve(__dirname, '../../stores/settings.ts'), 'utf8');
const SETTINGS_VIEW = readFileSync(resolve(__dirname, '../../views/Settings.vue'), 'utf8');

describe('ghost 显示判据', () => {
  it('★ 六项判据齐备：桌面 / 非归档 / 非流式 / 输入为空 / 有建议 / 会话匹配', () => {
    const i = INPUT.indexOf('const ghostVisible = computed');
    expect(i, '★ 找不到 ghostVisible').toBeGreaterThan(-1);
    const body = INPUT.slice(i, i + 420);
    expect(body).toMatch(/!isMobileShell\.value/);
    expect(body).toMatch(/!currentConvArchived\.value/);
    expect(body).toMatch(/!store\.streaming/);
    expect(body).toMatch(/!input\.value\.trim\(\)/);
    expect(body).toMatch(/nextSuggestion\.value/);
    expect(body, '★ 没校验建议归属会话（会串会话）').toMatch(/suggestionConvId\.value === store\.currentConvId/);
  });

  it('★ 有 ghost 时 placeholder 让位', () => {
    expect(INPUT).toMatch(/:placeholder="ghostVisible \? '' : inputPlaceholder"/);
  });
});

describe('键盘交互', () => {
  it('★ Tab 优先接受建议并 preventDefault', () => {
    const i = INPUT.indexOf('function onTab(');
    expect(i, '★ 找不到 onTab').toBeGreaterThan(-1);
    const body = INPUT.slice(i, i + 420);
    expect(body, '★ Tab 未优先处理 ghost').toMatch(/ghostVisible\.value/);
    expect(body).toMatch(/e\.preventDefault\(\)/);
    expect(body).toMatch(/acceptSuggestion\(\)/);
  });

  it('★ Esc 清掉建议', () => {
    const i = INPUT.indexOf('function onEsc(');
    expect(i, '★ 找不到 onEsc').toBeGreaterThan(-1);
    expect(INPUT.slice(i, i + 160)).toMatch(/clearSuggestion\(\)/);
  });

  it('★ 接受建议=填入输入框 + 光标到末尾（不直接发送，回车走原路径）', () => {
    const i = INPUT.indexOf('async function acceptSuggestion(');
    expect(i, '★ 找不到 acceptSuggestion').toBeGreaterThan(-1);
    const body = INPUT.slice(i, i + 520);
    expect(body).toMatch(/input\.value = text/);
    expect(body).toMatch(/setSelectionRange/);
    expect(body, '★ 接受建议时不应直接发送').not.toMatch(/\bsend\(\)/);
  });
});

describe('成本与设置开关', () => {
  it('★ 关闭开关后不发请求', () => {
    const i = INPUT.indexOf('async function prefetchSuggestion(');
    expect(i, '★ 找不到 prefetchSuggestion').toBeGreaterThan(-1);
    expect(INPUT.slice(i, i + 320)).toMatch(/nextStepSuggest === false/);
  });

  it('★ 设置项默认开启，设置页有开关', () => {
    expect(SETTINGS, '★ AppSettings 缺 nextStepSuggest 字段').toMatch(/nextStepSuggest: boolean/);
    expect(SETTINGS, '★ 默认值不是开启').toMatch(/nextStepSuggest: true/);
    expect(SETTINGS_VIEW).toMatch(/v-model="nextStepSuggest"/);
    expect(SETTINGS_VIEW).toMatch(/watch\(nextStepSuggest,/);
    expect(SETTINGS_VIEW).toMatch(/update\(\{ nextStepSuggest: v \}\)/);
  });
});
