import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const APP = read('App.vue');
const CHAT_TOPBAR = read('components/chat/ChatTopbar.vue');
const MODE_SWITCH = read('components/MobileModeSwitch.vue');
const LEAD_TOGGLE = read('components/workbench/LeadToggle.vue');
const WORKSPACE_SWITCH = read('components/workbench/WorkspaceModeSwitch.vue');
const LEARNING = read('views/LearningV2.vue');

describe('移动端统一导航与返回路径', () => {
  it('聊天页“更多”与非聊天页共用右侧抽屉', () => {
    const mobileTopbar = CHAT_TOPBAR.slice(
      CHAT_TOPBAR.indexOf('<div v-if="isMobile"'),
      CHAT_TOPBAR.indexOf('<div v-else class="chat-topbar"'),
    );
    expect(mobileTopbar).toContain('aria-label="更多"');
    expect(mobileTopbar).toContain('@click="openMobileNavDrawer"');
    expect(mobileTopbar).not.toContain('<el-dropdown');
    expect(APP).toContain('mobileNavDrawerOpen');
    expect(APP).toContain('openMobileNavDrawer');
  });

  it('模式选择抽屉停在 TabBar 上方，第五个模式也完整可点', () => {
    expect(MODE_SWITCH).not.toContain('mode-pill-caret');
    expect(MODE_SWITCH).not.toContain('<ArrowDown');
    expect(MODE_SWITCH).toMatch(
      /\.mode-sheet-mask\s*\{[^}]*padding-bottom:\s*calc\(56px \+ env\(safe-area-inset-bottom/,
    );
    expect(MODE_SWITCH).toMatch(
      /\.mode-sheet\s*\{[^}]*max-height:\s*min\(78dvh, calc\(100dvh - 72px - env\(safe-area-inset-bottom/,
    );
  });

  it('移动工作台把 AI/人工切换收口到顶部，不再使用右下角悬浮按钮', () => {
    const mobileTopbar = APP.slice(
      APP.indexOf('<header v-if="mobileShellAsRoot'),
      APP.indexOf('</header>', APP.indexOf('<header v-if="mobileShellAsRoot')),
    );
    expect(mobileTopbar).toContain('<WorkspaceModeSwitch />');
    expect(CHAT_TOPBAR).toContain('<WorkspaceModeSwitch');
    expect(WORKSPACE_SWITCH).toMatch(
      /@media \(max-width: 900px\), \(hover: none\)[\s\S]*?min-width:\s*48px/,
    );
    expect(LEAD_TOGGLE).toMatch(/\.lead-toggle-wrap\s*\{[^}]*display:\s*none/);
    expect(LEAD_TOGGLE).not.toContain('display: block');
  });

  it('从阅读器返回时保留图书馆，而不是掉回学科总览', () => {
    const start = LEARNING.indexOf('function openReadingBook');
    const end = LEARNING.indexOf('function closeReadingBook', start);
    const openReader = LEARNING.slice(start, end);
    expect(openReader).toContain('readerOpen.value = true');
    expect(openReader).not.toContain('libraryOpen.value = false');
  });
});
