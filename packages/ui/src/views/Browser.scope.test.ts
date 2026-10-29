// 游戏窗 scope 与显式移交的守门测试（2026-10-29）。
//
// 为什么用静态断言：这两处一旦退回"写死 page / 不传 scope"，表现是
// 「游戏窗看得见页面，agent 却操作不到」且**不报错**（最难查的一类）。
// 会话层能真跑的部分见 apps/desktop/test/browser-handoff.test.cjs。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const BROWSER = readFileSync(resolve(REPO, 'packages/ui/src/views/Browser.vue'), 'utf8');
const GAME_BAR = readFileSync(
  resolve(REPO, 'packages/ui/src/components/browser/GameControlBar.vue'),
  'utf8'
);

describe('游戏窗 scope', () => {
  it('Browser.vue 按 isGameWindow 切换 game/page，并传给面板与执行条', () => {
    expect(BROWSER).toContain("from '../utils/modeWindow'");
    expect(BROWSER).toMatch(/isGameWindow\(\)\s*\?\s*'game'\s*:\s*'page'/);
    expect(BROWSER).toMatch(/<BrowserPanel\s+:scope="scope"/);
    expect(BROWSER).toMatch(/<GameControlBar[^>]*:scope="scope"/);
  });

  it('执行条不再把 ensureActiveTab 写死成 page', () => {
    expect(GAME_BAR).not.toMatch(/ensureActiveTab\('page'\)/);
    expect(GAME_BAR).toMatch(/ensureActiveTab\(wantScope\.value\)/);
  });

  it('执行条的「交给智能体代玩」只在游戏窗出现', () => {
    expect(GAME_BAR).toMatch(/v-if="isGame"[\s\S]{0,400}toggleHandoff/);
    expect(GAME_BAR).toContain("api.handoff?.({ tabId: id })");
    expect(GAME_BAR).toContain("api.handoffRelease?.");
  });
});
