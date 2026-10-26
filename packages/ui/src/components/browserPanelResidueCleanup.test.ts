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

describe('编号层重画判据 · 主进程', () => {
  it('判据 = 意图 && 未空闲收起 && 最近确有 pageAgent 动作', () => {
    const body = fnSource(MAIN, 'highlightShouldPaint');
    expect(body).toContain('highlightEnabled');
    expect(body).toContain('highlightIdleHidden');
    expect(body, '★ 必须看动作新鲜度，不能只看开关').toContain('lastBrowserActionAt');
    expect(body).toContain('HIGHLIGHT_ACTION_IDLE_MS');
  });

  it('dom-ready / 导航完成 / 新开页三处重画都问 highlightShouldPaint', () => {
    const uses = (MAIN.match(/highlightShouldPaint\(\)/g) || []).length;
    expect(uses, '定义 1 处 + 三个重画时机各 1 处').toBeGreaterThanOrEqual(4);
    expect(MAIN, '★ 仍按旧判据重画 ⇒ agent 停手后刷新页面又画回满屏橙框')
      .not.toMatch(/if \(highlightEnabled && !highlightIdleHidden/);
  });

  it('关闸顺带清截图标注层（同色同形，用户分不出是哪套）', () => {
    const body = fnSource(MAIN, 'runHighlight');
    expect(body).toContain('__yz_annotate_overlay');
  });
});
