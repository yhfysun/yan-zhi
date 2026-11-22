// 浏览器「全屏实况只留画面」锚点（2026-11-22 用户实报：全屏了但四周一圈壳）：
//   展开态隐藏 chrome（标签栏/工具条/收藏栏）+ 顶缘唤出 + OS 全屏 + 页面 HTML 全屏联动。
//   三段链路（渲染层联动 → preload 通道 → 主进程事件/IPC）缺一段功能就不成立。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const PRELOAD = readFileSync(resolve(REPO, 'apps/desktop/preload.cjs'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');

describe('全屏实况：chrome 默认滑出屏幕外', () => {
  it('★ skin 的 .right-panel 带 backdrop-filter → fixed 包含块困在右栏：展开时 shell 必须 Teleport 到 body', () => {
    expect(PANEL).toContain('<Teleport to="body" :disabled="!shellTeleport">');
    const at = PANEL.indexOf('const shellTeleport');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 300);
    expect(body).toContain('browserExpanded.value && isElectron && !isWebviewEngine.value');
    // webview 引擎搬动 = <webview> 重挂载 = 页面重载，必须禁止
    expect(body).toContain('!isWebviewEngine.value');
    // 搬动后两端强同步 bounds（右栏矩形 → 整窗矩形）
    expect(PANEL).toMatch(/watch\(shellTeleport[\s\S]{0,120}syncBrowserViewBounds\(true\)/);
  });

  it('★ 全屏态不再只属于 preview：游戏窗(scope=game)//browser(scope=page) 用本地态，按钮不再是空操作', () => {
    expect(PANEL).toContain('const localExpanded = ref(false)');
    expect(PANEL).toMatch(/get: \(\) => \(isPreviewScope \? chatStore\.browserExpanded : localExpanded\.value\)/);
    expect(PANEL).toMatch(/set: \(v: boolean\) => \{ if \(isPreviewScope\) chatStore\.browserExpanded = v; else localExpanded\.value = v; \}/);
  });

  it('★ 非 Teleport 场景（游戏窗）展开：shell 留常规流不盖执行条，html 根挂类隐藏应用标题栏', () => {
    // fixed 铺满只对 teleported（preview）生效
    expect(PANEL).toMatch(/\.browser-shell\.shell-teleported\.shell-expanded \{\s*\n\s*position: fixed;/);
    expect(PANEL).not.toMatch(/\.browser-shell\.shell-expanded \{\s*\n\s*position: fixed;/);
    expect(PANEL).toContain(":global(html.yz-browser-fs .title-bar) { display: none !important; }");
    expect(PANEL).toContain("document.documentElement.classList.toggle('yz-browser-fs'");
  });

  it('展开态标签栏/工具条绝对定位并滑出，仅 fs-chrome-revealed 时滑入', () => {
    expect(PANEL).toMatch(/\.browser-shell\.shell-expanded \.browser-tabbar,\s*\n\s*\.browser-shell\.shell-expanded \.browser-toolbar \{/);
    expect(PANEL).toContain('transform: translateY(-110%)');
    // ★ 两条都必须锚 top:0：工具条高度是内容自适应（padding+按钮 ≈52px、窄面板换行更高），
    //   锚 top:36px + translateY(-110%) 只滑 1.1×自身高 < -(36+自身高) ⇒ 上沿残留（2026-11-22 实报）
    expect(PANEL).toMatch(/\.browser-shell\.shell-expanded \.browser-tabbar,\s*\n\s*\.browser-shell\.shell-expanded \.browser-toolbar \{\s*\n\s*position: absolute;\s*\n\s*left: 0; right: 0; top: 0;/);
    // 唤出：标签栏归位、工具条落在固定 36px 高的标签栏正下方（各自 transform，不允许合写 translateY(0)）
    expect(PANEL).toMatch(/\.browser-shell\.shell-expanded\.fs-chrome-revealed \.browser-tabbar \{ transform: translateY\(0\); \}/);
    expect(PANEL).toMatch(/\.browser-shell\.shell-expanded\.fs-chrome-revealed \.browser-toolbar \{ transform: translateY\(36px\); \}/);
  });

  it('★ BrowserView 原生图层恒在 DOM 之上：唤出 chrome 时 bounds 必须给视口让位', () => {
    const at = PANEL.indexOf('function runBoundsSync');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, PANEL.indexOf('function syncBrowserViewBounds', at));
    expect(body).toContain('browserExpanded.value && fsChromeRevealed.value');
    expect(body).toContain('viewTop += chromeH');
    expect(body).toContain('viewH -= chromeH');
    // 唤出/收起都要强同步一次，否则让位/复原不生效
    expect(PANEL).toMatch(/watch\(fsChromeRevealed[\s\S]{0,200}syncBrowserViewBounds\(true\)/);
  });

  it('收藏栏展开态直接隐藏；接管条不被隐藏（agent 任务中暂停/停止始终可见）', () => {
    expect(PANEL).toMatch(/\.browser-shell\.shell-expanded \.bookmarks-bar \{ display: none; \}/);
    expect(PANEL).not.toMatch(/shell-expanded[^}]*\.agent-takeover-bar[^}]*\{[^}]*display: none/);
  });

  it('顶缘唤出热区 + chrome 悬停保活，离开延迟收起（避免热区→chrome 间隙闪隐）', () => {
    expect(PANEL).toContain('class="fs-hover-strip" @mouseenter="fsChromeShow" @mouseleave="fsChromeScheduleHide"');
    expect(PANEL).toContain('function fsChromeShow');
    expect(PANEL).toContain('function fsChromeScheduleHide');
    expect(PANEL).toContain('fsChromeRevealed.value = false');
  });
});

describe('全屏实况：窗口 OS 全屏联动', () => {
  it('展开/收起时经 window-set-fullscreen 同步窗口全屏态', () => {
    expect(PANEL).toContain('electronAPI?.setFullScreen?.(!!v)');
    expect(PRELOAD).toContain("setFullScreen: (fs) => ipcRenderer.invoke('window-set-fullscreen', !!fs)");
    expect(MAIN).toContain("ipcMain.handle('window-set-fullscreen'");
    expect(MAIN).toMatch(/window-set-fullscreen[\s\S]{0,200}w\.setFullScreen\(!!fs\)/);
  });

  it('全屏态不落盘窗口尺寸（否则重启后窗口按全屏尺寸打开）', () => {
    const at = MAIN.indexOf('const scheduleSaveWinState');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = MAIN.slice(at, MAIN.indexOf('};', at));
    expect(body).toContain('isFullScreen()');
  });
});

describe('全屏实况：页面 HTML 全屏联动', () => {
  it('主进程广播 guest 的 enter/leave-html-full-screen', () => {
    expect(MAIN).toContain("wc.on('enter-html-full-screen'");
    expect(MAIN).toContain("wc.on('leave-html-full-screen'");
    expect(MAIN).toContain("send('browserView:htmlFullscreen', tabId, true)");
    expect(MAIN).toContain("send('browserView:htmlFullscreen', tabId, false)");
    expect(PRELOAD).toContain("ipcRenderer.on('browserView:htmlFullscreen', h)");
  });

  it('渲染层自动带入展开/退出，退出不计为"用户手动收起"；两引擎共用 onGuestHtmlFullscreen 唯一实现', () => {
    expect(PANEL).toContain('api.browserView.onHtmlFullscreen');
    expect(PANEL).toContain('function onGuestHtmlFullscreen');
    expect(PANEL).toContain('htmlFsAuto = true');
    expect(PANEL).toContain('htmlFsAuto = false');
    const at = PANEL.indexOf('function onGuestHtmlFullscreen');
    const body = PANEL.slice(at, PANEL.indexOf('watch(browserExpanded', at));
    expect(body).toContain('chatStore.browserUserDismissed = false');
    // webview 引擎（游戏窗默认引擎）：元素事件绑定在 onWebviewReady，dataset 防重
    expect(PANEL).toContain("el.addEventListener('enter-html-full-screen'");
    expect(PANEL).toContain("el.addEventListener('leave-html-full-screen'");
    expect(PANEL).toContain('el.dataset.yzFsBound');
    // BrowserView 广播路径收敛到同一实现（不允许平行实现漂移）
    expect(PANEL).toMatch(/onHtmlFullscreen\(aliveGuard\([\s\S]{0,120}onGuestHtmlFullscreen\(on\)/);
  });
});

describe('全屏实况：guest 焦点下的 Esc 收起', () => {
  it('主进程转发 guest Esc（不 preventDefault），渲染层展开态收起', () => {
    expect(MAIN).toContain("send('browserView:hostEsc', tabId)");
    expect(PRELOAD).toContain("ipcRenderer.on('browserView:hostEsc', h)");
    expect(PANEL).toContain('api.browserView.onHostEsc');
    const at = PANEL.indexOf('api.browserView.onHostEsc');
    const body = PANEL.slice(at, at + 300);
    expect(body).toContain('if (browserExpanded.value) toggleExpanded()');
  });
});
