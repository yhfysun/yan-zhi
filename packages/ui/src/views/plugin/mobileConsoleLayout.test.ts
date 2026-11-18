import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEC = readFileSync(resolve(__dirname, 'SecConsole.vue'), 'utf8');
const APP = readFileSync(resolve(__dirname, '../../App.vue'), 'utf8');
const SHELL = readFileSync(resolve(__dirname, '../../components/console/ConsoleShell.vue'), 'utf8');
const LIBRARY_CSS = readFileSync(
  resolve(__dirname, '../../components/learning/v2/learning-library.css'),
  'utf8',
);

describe('移动控制台布局契约', () => {
  it('安全终端随内容展开，高级折叠区不能与扫描卡叠层', () => {
    expect(SEC).toContain('class="sec-pane sec-pane-run"');
    expect(SEC).toMatch(/\.sec-pane-run\s*\{[^}]*flex:\s*0 0 auto[^}]*overflow:\s*visible/);
  });

  it('安全四段导航在移动端完整等宽显示', () => {
    expect(APP).toMatch(
      /\.platform-mobile \.sec-console \.sec-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    );
    expect(APP).toMatch(/\.platform-mobile \.sec-console \.sec-tab-name\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('移动端不挂本机终端，隐藏组件不得自动请求 local-console', () => {
    expect(SEC).toContain("item.value !== 'tty'");
    expect(SEC).toContain("mobileShell.value && tab.value === 'tty'");
    const CONSOLE = readFileSync(resolve(__dirname, '../../components/chat/ChatConsolePanel.vue'), 'utf8');
    expect(CONSOLE).toContain('useMobileShell');
    expect(CONSOLE).toContain('if (!mobileShell.value && !sessions.value.length)');
  });

  it('移动安全报告导出不依赖 WebView 剪贴板权限', () => {
    expect(SEC).toContain('isCapacitor');
    expect(SEC).toContain("downloadBase64(base64Utf8(d.text), d.filename, 'text/markdown')");
  });

  it('移动结果页导出操作两列排布，说明不得竖排或裁切按钮', () => {
    expect(SEC).toContain('sec-findings-head');
    expect(SEC).toContain('sec-findings-actions');
    expect(SEC).toMatch(
      /\.sec-findings-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(SEC).toMatch(
      /\.sec-findings-head \.sec-frame-hint\s*\{[\s\S]*?white-space:\s*normal/,
    );
  });

  it('安全移动工作区整体滚动，任务、授权和事件不会被压成细条', () => {
    expect(APP).toMatch(
      /\.platform-mobile \.sec-console \.sec-grid\s*\{[^}]*overflow-y:\s*auto/,
    );
    expect(APP).toMatch(
      /\.platform-mobile \.sec-console \.sec-ws\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/,
    );
  });

  it('资源列表把手是可访问控件，并在移动端提供文字标签', () => {
    expect(SHELL).toContain(':aria-expanded="!collapsed"');
    expect(SHELL).toContain('cs-aside-toggle-label');
    expect(APP).toMatch(
      /\.platform-mobile \.console-shell \.cs-aside-toggle\s*\{[^}]*bottom:\s*12px[^}]*width:\s*76px[^}]*height:\s*44px/,
    );
  });

  it('移动端书架封面收紧高度，避免两列卡片占满首屏', () => {
    expect(LIBRARY_CSS).toContain('.ll-card-grid.view-card .ll-book-cover-title');
    expect(LIBRARY_CSS).toMatch(
      /\.ll-card-grid\.view-card \.ll-book-cover\s*\{[^}]*max-height:\s*176px/,
    );
  });
});
