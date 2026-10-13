// pageAgent 失效 + IPC 监听器泄漏的守门测试（2026-10-11）—— 防回归。
//
// 背景（用户实报）：「浏览器页面怎么是主页？不是智能体要打开的页面，现在 pageAgent 完全没用了」
//   主进程日志铁证：
//     [browser-action] 已广播 tabCreated: url=https://example.com/ scope=preview tab=tab-1
//     [browser-action] 自建后等待 guest: tab=tab-1 scope=preview wc=NULL(8s 超时)
//   渲染层日志铁证：
//     MaxListenersExceededWarning: 11 browserView:tabCreated listeners added
//
// 两个叠加的 bug：
//   ① **决定性命中**：`componentAlive` 是**模块级** let，`onUnmounted` 置 false 后
//      `onMounted` **没有重置回 true** ⇒ 组件第 2 次挂载后所有 `aliveGuard(...)` 短路
//      ⇒ `onTabCreated` 永不执行 ⇒ `<webview>` 壳建不出 ⇒ `waitForGuest` 必超时
//      ⇒ 浏览器停在主页、pageAgent 全挂。
//   ② 监听器泄漏：preload 的 on* 只 `ipcRenderer.on` 不注销 ⇒ 每次挂载 +11 个监听器。
//
// 修法：① `onMounted` 顶部 `componentAlive = true`；② preload 的 on* 返回 unsubscribe，
//   组件用 `trackIpc(...)` 收集、`onUnmounted` 逐个调用。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/components → 上溯 4 层到 repo 根
const REPO = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const PANEL = read('packages/ui/src/components/BrowserPanel.vue');
const PRELOAD = read('apps/desktop/preload.cjs');

describe('① componentAlive 必须在 onMounted 重置（否则第 2 次挂载后监听器全短路）', () => {
  it('★★★ onMounted 顶部有 componentAlive = true', () => {
    // 取 onMounted(async () => { ... 的前若干行，确认重置在挂载回调里
    const i = PANEL.indexOf('onMounted(async () => {');
    expect(i, '未找到 onMounted(async () => {').toBeGreaterThanOrEqual(0);
    const head = PANEL.slice(i, i + 1200);
    expect(head, '★ onMounted 未重置 componentAlive —— 组件第 2 次挂载后所有 aliveGuard 监听器会失效（pageAgent 全挂）')
      .toMatch(/componentAlive\s*=\s*true/);
  });

  it('★ componentAlive 声明为模块级 let（可被赋值）', () => {
    expect(PANEL).toMatch(/let\s+componentAlive\s*=\s*true/);
  });

  it('★ onUnmounted 仍置 false（逻辑门保留）', () => {
    const i = PANEL.lastIndexOf('onUnmounted(');
    const block = PANEL.slice(i, i + 900);
    expect(block).toMatch(/componentAlive\s*=\s*false/);
  });
});

describe('①b ★★★ 监听器注册必须早于 onMounted 里的 await（否则一抛异常就全跳过）', () => {
  it('★★★ onTabCreated 的注册位置早于 await newTab()/switchTab()', () => {
    const mountedIdx = PANEL.indexOf('onMounted(async () => {');
    expect(mountedIdx).toBeGreaterThanOrEqual(0);
    const mountedBody = PANEL.slice(mountedIdx, mountedIdx + 60000);

    const regIdx = mountedBody.indexOf('onTabCreated');
    expect(regIdx, '未找到 onTabCreated 注册').toBeGreaterThanOrEqual(0);

    // await newTab() / await switchTab() 的位置
    const awaitTabIdx = Math.min(
      ...[mountedBody.indexOf('await newTab()'), mountedBody.indexOf('await switchTab(')]
        .filter((x) => x >= 0),
    );
    expect(awaitTabIdx, '未找到 await newTab()/switchTab()').toBeGreaterThanOrEqual(0);

    expect(
      regIdx,
      '★★★ onTabCreated 注册在 await newTab()/switchTab() 之后 —— ' +
      '一旦建 tab 抛异常/挂起，注册被跳过 ⇒ wc=NULL(8s 超时) ⇒ pageAgent 全挂（2026-10-11 实锤）',
    ).toBeLessThan(awaitTabIdx);
  });

  it('★★ fetchData / startDailyAnalysisScheduler 也不得阻断注册（应在注册之后或已 try/catch）', () => {
    const mountedIdx = PANEL.indexOf('onMounted(async () => {');
    const mountedBody = PANEL.slice(mountedIdx, mountedIdx + 60000);
    const regIdx = mountedBody.indexOf('onTabCreated');
    const fetchIdx = mountedBody.indexOf('fetchData()');
    if (fetchIdx >= 0) {
      // fetchData 若在注册之前，必须包在 try/catch 里
      const before = mountedBody.slice(0, fetchIdx);
      const lastLine = before.split('\n').slice(-3).join('\n');
      expect(
        lastLine.includes('try {') || fetchIdx > regIdx,
        '★ fetchData() 未 try/catch 且位于注册之前 —— 异常会阻断监听器注册',
      ).toBe(true);
    }
  });
});

describe('② IPC 监听器必须可注销（防累积泄漏）', () => {
  it('★★★ preload 的 11 个 on* 全部返回 unsubscribe', () => {
    const onNames = [
      'onNavigated', 'onLoaded', 'onCrashed', 'onTabActivated', 'onTabCreated',
      'onTabClosed', 'onTitleUpdated', 'onResync', 'onCursor', 'onOpenTab', 'onForceOpen',
    ];
    for (const n of onNames) {
      const i = PRELOAD.indexOf(`${n}: (callback) => {`);
      expect(i, `未找到 preload.${n}`).toBeGreaterThanOrEqual(0);
      // 取该函数体（到下一个 "  }," 或 "  }" 结束）
      const body = PRELOAD.slice(i, i + 600);
      const endIdx = Math.min(
        ...[body.indexOf('    },') , body.indexOf('  },')].filter(x => x > 0),
      );
      const fn = endIdx > 0 ? body.slice(0, endIdx) : body;
      expect(fn, `★ preload.${n} 未返回 unsubscribe（泄漏风险）`)
        .toMatch(/return\s*\(\s*\)\s*=>\s*ipcRenderer\.removeListener/);
    }
  });

  it('★★★ BrowserPanel 用 trackIpc 收集 unsubscribe', () => {
    expect(PANEL).toMatch(/function\s+trackIpc\s*\(/);
    expect(PANEL).toMatch(/ipcOffs\.push/);
    // 11 处 on* 调用都被 trackIpc 包裹
    const wrapped = (PANEL.match(/trackIpc\(/g) || []).length;
    expect(wrapped, 'trackIpc 出现次数应 ≥12（11 处调用 + 1 处定义）').toBeGreaterThanOrEqual(12);
  });

  it('★★★ onUnmounted 逐个调用 ipcOffs 里的 unsubscribe', () => {
    const i = PANEL.lastIndexOf('onUnmounted(');
    const block = PANEL.slice(i, i + 1200);
    expect(block, '★ onUnmounted 未调用 ipcOffs 里的 off —— 监听器仍会泄漏')
      .toMatch(/for\s*\(const\s+off\s+of\s+ipcOffs\)/);
  });

  it('★ preload 不得提供 offAll（两实例并存时会误清对方监听）', () => {
    expect(PRELOAD, '★ offAll 会清掉另一 BrowserPanel 实例的监听器（preview + /browser 并存场景）')
      .not.toMatch(/offAll\s*:/);
  });
});

describe('③ showHome 与 <webview> 渲染的耦合', () => {
  it('★ 2026-10-12 P1-B：viewport 必须用 v-show（元素常驻）—— v-else 会在 showHome 翻转时销毁并重建 <webview>', () => {
    expect(PANEL).toMatch(/v-if="showHome"/);
    // 关键回归守卫：viewport 用 v-show="!showHome"（元素常驻、只切 display），
    // 不得退回 v-else —— 那会在 showHome 翻转（agent 建 tab 时 url 为空会频繁触发）时
    // 销毁重建整个 viewport（含全部 <webview>）⇒ guest 监听器堆在旧 WebContents 上不释放
    // （实测 MaxListenersExceededWarning: 11 did-stop-loading listeners）。
    expect(PANEL, '★ viewport 退回 v-else 会在 showHome 翻转时销毁重建 <webview> → guest 监听器泄漏')
      .toMatch(/v-show="!showHome" class="browser-viewport"/);
    expect(PANEL, '★ 不应再有 v-else class="browser-viewport"').not.toMatch(/v-else class="browser-viewport"/);
    // <webview> 仍应在 browser-viewport 内
    const homeIdx = PANEL.indexOf('v-if="showHome"');
    const viewportIdx = PANEL.indexOf('class="browser-viewport"');
    const webviewIdx = PANEL.indexOf('<webview');
    expect(viewportIdx).toBeGreaterThan(homeIdx);
    expect(webviewIdx).toBeGreaterThan(viewportIdx);
  });
});
