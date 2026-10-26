// 浏览器面板「照参考客户端接入」的交互锚点（2026-10-24）：
//   地址栏联想（OmniboxSuggest）、状态点相位配色（AgentStatusBar）、截图当前页（capture 菜单）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const PRELOAD = readFileSync(resolve(REPO, 'apps/desktop/preload.cjs'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');

describe('地址栏联想', () => {
  it('输入即出候选，↑↓ 选择、Esc 收起、回车直达', () => {
    expect(PANEL).toContain('class="omnibox-panel"');
    expect(PANEL).toContain('function onUrlKeydown');
    expect(PANEL).toContain("e.key === 'ArrowDown'");
    expect(PANEL).toContain("e.key === 'ArrowUp'");
    expect(PANEL).toContain("e.key === 'Escape'");
  });

  it('下拉项用 mousedown.prevent，避免输入框 blur 先关掉下拉', () => {
    expect(PANEL).toMatch(/class="omnibox-panel" @mousedown\.prevent/);
  });

  it('★ 失焦不收起、不丢 hover 高亮（用户口径：点别处也保留）', () => {
    const at = PANEL.indexOf('function onUrlBlur');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, PANEL.indexOf('\n}', at) + 2);
    expect(body, '失焦不能关下拉').not.toContain('omniboxClosed.value = true');
    expect(body, '失焦不能清 hover 高亮').not.toContain('omniboxActive.value = -1');
    // 但仍要收掉聚焦样式（下拉打开时由 urlFocused || omniboxOpen 维持）
    expect(body).toContain('urlFocused.value = false');
  });

  it('Esc / 选中一项 / 回车导航才收起', () => {
    expect(PANEL).toContain('function closeOmnibox');
    expect(PANEL).toMatch(/function pickOmnibox[\s\S]{0,120}closeOmnibox\(\)/);
    const at = PANEL.indexOf('function onUrlKeydown');
    const body = PANEL.slice(at, at + 900);
    expect(body).toContain("e.key === 'Escape'");
    expect(body).toContain('closeOmnibox()');
  });
});

describe('状态点相位配色', () => {
  it('思考蓝 / 执行紫 / 重试黄 / 暂停灰，且由 activityPhase 驱动', () => {
    for (const c of ['dot-thinking', 'dot-executing', 'dot-retrying', 'dot-paused']) {
      expect(PANEL, `缺少 ${c}`).toContain('.' + c);
    }
    expect(PANEL).toContain("'dot-' + activityPhase");
  });
});

describe('截图当前页', () => {
  it('面板入口 → preload 通道 → 主进程落盘，三段都要在', () => {
    expect(PANEL).toContain('command="capture"');
    expect(PANEL).toContain('async function captureCurrentPage');
    expect(PRELOAD).toContain('browserView:captureTab');
    expect(MAIN).toContain("ipcMain.handle('browserView:captureTab'");
  });
});

describe('录屏入口（复用 screen_record 管线）', () => {
  it('更多菜单可开始/停止，走 screenRecord.start/stop', () => {
    expect(PANEL).toContain('command="record"');
    expect(PANEL).toContain('async function toggleRecording');
    expect(PANEL).toContain('screenRecord.start({ fps: 15 })');
    expect(PANEL).toContain('screenRecord.stop({ recordId })');
  });

  it('主进程 outPath 可选，默认落到视频目录（渲染层拿不到系统路径）', () => {
    expect(MAIN).toContain('YanZhi-Recordings');
    expect(MAIN).toMatch(/outPath\s*=\s*path\.join\(dir/);
  });
});
