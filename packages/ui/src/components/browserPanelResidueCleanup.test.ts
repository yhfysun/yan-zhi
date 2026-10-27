// 「任务停了，浏览器还留着残留」的守门测试（2026-10-24 用户实报：
// 「任务我都停止了浏览器还这样？」—— 页面满载编号框 + 一直转圈「正在加载...」）。
//
// 两处根因：
//   ① 暂停恢复 watcher：onTaskFinished 顺带清 pausedConvIds ⇒ 它收到 paused→false，
//      误当成"恢复执行"，把编号层又画回来；此后没有任何 watcher 会再关它 ⇒ 永驻；
//   ② loading 遮罩：webview 引擎的导航只靠 guest 的 did-start/did-stop-loading 收尾，
//      事件一漏就永远转圈。
// 以及用户拍板的判据：「刷新页面时就应该判断有没有 pageAgent 在操作」——
//   重画时机改问 highlightShouldPaint（意图 && 未空闲收起 && 最近确有动作）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');
const PRELOAD = readFileSync(resolve(REPO, 'apps/desktop/preload.cjs'), 'utf8');
const USE_CHAT = readFileSync(resolve(REPO, 'packages/ui/src/composables/chat/useChat.ts'), 'utf8');

/** 按大括号配平截取具名函数源码 */
function fnSource(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `未找到 function ${name}(`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`function ${name} 大括号未配平`);
}

describe('pause 标记被收尾清掉时，不能把编号层画回来', () => {
  it('★ 恢复分支必须校验任务仍在跑、agent 仍在操作', () => {
    const at = PANEL.indexOf('watch(() => chatStore.browserPaused');
    expect(at, '缺少暂停 watcher').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 2000);
    expect(body, '★ 不校验 agentOperating → 任务收尾清 paused 时会把编号层重新画上，且再没人关')
      .toMatch(/if \(!agentOperating\.value\) return;/);
  });

  it('暂停接管时蒙版也要收掉（蒙版 = agent 在操作的标识）', () => {
    const at = PANEL.indexOf('watch(() => chatStore.browserPaused');
    const body = PANEL.slice(at, at + 500);
    expect(body).toContain('forceFinishLoading');
  });

  it('编号层 watcher 覆盖"层开着但 auto 标记已丢"的漂移态', () => {
    const at = PANEL.indexOf('watch(() => chatStore.browserTaskActive');
    const body = PANEL.slice(at, at + 900);
    expect(body, '★ 只认 highlightAuto ⇒ 状态漂移后编号框永驻').toContain('!chatStore.browserHighlightManual');
  });
});

describe('加载遮罩看门狗', () => {
  it('loading 置真即起表，超时强制收尾（webview 导航没有 15s 兜底）', () => {
    expect(PANEL).toContain('LOADING_WATCHDOG_MS');
    const at = PANEL.indexOf('watch(loading,');
    expect(at, '缺少 loading 看门狗').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 700);
    expect(body).toContain('setTimeout');
    expect(body).toContain('forceFinishLoading');
  });

  it('任务结束立刻收掉转圈', () => {
    const at = PANEL.indexOf('watch(convTaskRunning,');
    expect(at, '★ 任务收尾不收 loading → 用户看到"任务停了还在转圈"').toBeGreaterThanOrEqual(0);
    expect(PANEL.slice(at, at + 300)).toContain('forceFinishLoading');
  });

  it('强制收尾同时清激活 tab 的 loading 标记，卸载时清表', () => {
    expect(fnSource(PANEL, 'forceFinishLoading')).toContain('activeTab.value.loading = false');
    const at = PANEL.indexOf('onUnmounted(');
    expect(PANEL.slice(at, at + 600)).toContain('clearLoadingWatchdog');
  });
});

describe('pageAgent 收工后不残留鼠标 / 最小化提示', () => {
  // ★ 2026-10-27 用户实报：「pageAgent 停止了鼠标还在」「页面打开着，最小化还弹浏览器任务运行中」。
  //   根因：光标的可见性少了一条活性判据（输入锁/编号层早就按 45s 空闲判活），
  //   主进程的最小化提示又按「10 分钟内有过动作」判 —— 两者都看不到"浏览器侧已收工"。
  it('★ 虚拟鼠标必须有活性判据（否则主任务等模型期间常驻）', () => {
    const at = PANEL.indexOf('const agentCursorVisible = computed(');
    expect(at, '缺少 agentCursorVisible').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 600);
    expect(body, '★ 光标不判活性 → pageAgent 收工后一直挂在页面上')
      .toContain('browserIdleNow.value');
  });

  it('★ agentOperating（编号层/蒙版判据）同样要收工即失效', () => {
    const at = PANEL.indexOf('const agentOperating = computed(');
    expect(at, '缺少 agentOperating').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 500);
    expect(body, '★ 缺空闲判据 → 收工后切 tab 又把编号层画回来')
      .toContain('browserIdleNow.value');
  });

  it('空闲时告知主进程清掉"最近有动作"（最小化提示按它判）', () => {
    expect(PANEL, '缺少空闲通知').toContain('browserView?.agentIdle?.()');
    expect(PRELOAD, 'preload 未暴露 agentIdle').toContain("ipcRenderer.send('browserView:agentIdle')");
    expect(MAIN, '主进程未处理 agentIdle').toMatch(/ipcMain\.on\('browserView:agentIdle'/);
    const at = MAIN.indexOf("ipcMain.on('browserView:agentIdle'");
    const body = MAIN.slice(at, at + 700);
    expect(body, '★ 动作在途时不得清（那一刻确实还在自动化）').toContain('tabActionBusy.size');
    expect(body).toContain('lastBrowserActionAt = 0');
  });

  it('任务收尾也补一次通知（面板可能已卸载/还不到空闲宽限）', () => {
    const at = USE_CHAT.indexOf('store.onTaskFinished(async (convId)');
    expect(at, '缺少收尾钩子').toBeGreaterThanOrEqual(0);
    const body = USE_CHAT.slice(at, at + 2200);
    expect(body, '★ 收尾不清 → 刚结束就最小化仍弹窗').toContain('browserView?.agentIdle?.()');
  });
});

describe('编号层重画判据 · 主进程', () => {
  it('判据 = 意图 && 未空闲收起 && 最近确有 pageAgent 动作', () => {
    const body = fnSource(MAIN, 'highlightShouldPaint');
    expect(body).toContain('highlightEnabled');
    expect(body).toContain('highlightIdleHidden');
    expect(body, '★ 必须看动作新鲜度，不能只看开关').toContain('lastHighlightActionAt');
    expect(body).toContain('HIGHLIGHT_ACTION_IDLE_MS');
  });

  // ★ 2026-10-26 用户实报：「用户可以操作也有蒙版？红框？」——
  //   面板发来的 highlight on 此前**直接画**（不过闸、不起表），任务转去做别的事后无人再关。
  it('★ 渲染层发来的 highlight on 也必须过空闲闸，并武装计时', () => {
    const at = MAIN.indexOf("case 'highlight': {");
    expect(at, '缺少 highlight 分支').toBeGreaterThanOrEqual(0);
    const body = MAIN.slice(at, at + 1400);
    expect(body, '★ 自动开必须重新武装空闲计时').toContain('scheduleHighlightIdleHide()');
    expect(body, '★ 自动开必须问 highlightShouldPaint').toContain('highlightShouldPaint()');
    expect(body, '★ 手动开（persist）才常驻').toContain('highlightPersist');
  });

  it('★ 编号层活性对两条执行路径都记账（桥 convId / SSE __workspaceDir）', () => {
    const body = fnSource(MAIN, 'runBrowserAction');
    expect(body, 'SSE 委托路径 convId=null，只认 convId 会让编号层永远不亮').toContain('__workspaceDir');
    expect(body).toContain('lastHighlightActionAt = Date.now()');
  });

  it('★ guest 就绪补层不得只看 browserTaskActive（暂停/非操作态会把橙框画回来）', () => {
    const at = PANEL.indexOf('function onWebviewReady');
    const body = PANEL.slice(at, at + 2000);
    expect(body, 'guest 就绪补层必须走 agentOperating 闸').toContain('agentOperating.value');
  });

  it('★ 编号层/蒙版只画预览空间，不碰 /browser 独立页', () => {
    const body = fnSource(MAIN, 'scheduleHighlightIdleHide');
    expect(body, '★ 按 allGuestWebContents 画 ⇒ 用户自己的 /browser 页也满屏橙框，看起来像"任务跑到浏览器页"')
      .not.toContain('allGuestWebContents');
    expect(body).toContain('previewGuestWebContents');
    const helper = fnSource(MAIN, 'previewGuestWebContents');
    expect(helper, '预览空间判据必须走 isPreviewScope').toContain('isPreviewScope');
  });

  it('dom-ready / 导航完成 / 新开页三处重画都问 highlightShouldPaint', () => {
    const uses = (MAIN.match(/highlightShouldPaint\(\)/g) || []).length;
    expect(uses, '定义 1 处 + 四个判据点各 1 处').toBeGreaterThanOrEqual(4);
    expect(MAIN, '★ 仍按旧判据重画 ⇒ agent 停手后刷新页面又画回满屏橙框')
      .not.toMatch(/if \(highlightEnabled && !highlightIdleHidden/);
  });

  it('关闸顺带清截图标注层（同色同形，用户分不出是哪套）', () => {
    const body = fnSource(MAIN, 'runHighlight');
    expect(body).toContain('__yz_annotate_overlay');
  });
});
