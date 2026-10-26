// 浏览器面板「照参考客户端接入」的交互锚点（2026-10-24）：
//   地址栏联想（OmniboxSuggest）、状态点相位配色（AgentStatusBar）、截图当前页（capture 菜单）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const INPUT = readFileSync(resolve(REPO, 'packages/ui/src/components/chat/ChatInputArea.vue'), 'utf8');
const REC_STORE = readFileSync(resolve(REPO, 'packages/ui/src/stores/screen-recorder.ts'), 'utf8');
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

describe('选区录屏（像独立录屏软件）', () => {
  it('★ 截图下拉里直接有录屏入口（不只藏在浏览器「更多」里）', () => {
    expect(INPUT).toContain('command="record"');
    expect(INPUT).toContain('screenRecorder.toggle()');
    expect(INPUT).toContain("useScreenRecorderStore");
    // 录制中要有可见标识，否则用户不知道在录
    expect(INPUT).toContain('shot-rec-dot');
  });

  it('两个入口共用同一份全局状态（否则 A 处开始、B 处停不掉）', () => {
    expect(REC_STORE).toContain("defineStore('screen-recorder'");
    expect(PANEL).toContain('useScreenRecorderStore');
  });

  it('菜单框选区域 → 选择显示器 → getDisplayMedia 录制 → 主进程落盘', () => {
    expect(PANEL).toContain('command="record"');
    expect(REC_STORE).toContain("mode: 'region'");
    expect(REC_STORE).toContain('startRegionRecording');
    expect(REC_STORE).toContain('screenRecord.selectDisplay');
    expect(PRELOAD).toContain('screen-record:select-display');
    expect(PRELOAD).toContain('screen-record:save-blob');
    expect(MAIN).toContain("ipcMain.handle('screen-record:save-blob'");
  });

  it('主进程按选区所在显示器授权采集，并落到视频目录', () => {
    expect(MAIN).toContain('snipCaptureDisplayId');
    expect(MAIN).toContain('YanZhi-Recordings');
    expect(MAIN).toContain("mode === 'region'");
  });
});
