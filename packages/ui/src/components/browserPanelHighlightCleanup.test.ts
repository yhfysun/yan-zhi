// 元素编号层（橙色描边 + 编号）「任务停了必须消失」的守门测试 —— 防 2026-10-23 用户二次实报回归。
//
// 背景（用户原话）：「任务停了这些中间层没有去掉啊。。上次不是说过这个问题？」
//
// 根因（三处叠加，任何一处漏了编号框就会永驻页面）：
//   ① 主进程的 `highlightEnabled` 是模块级全局：只要它没被清零，之后每次导航（main.cjs 4911）
//      与新开页（main.cjs 2254）都会**重新画回来**，用户看到的就是"越点越多"；
//   ② 渲染层的开闸有三条路径（任务开始 / 面板挂载或切 tab / guest 就绪），
//      其中两条此前不置 `highlightAuto` ⇒ 任务结束时 watcher 的 `highlightAuto` 判据不成立 → 不关；
//   ③ 关闸只遍历面板本地 `tabs` 逐个发 IPC，面板卸掉或状态一漂移就漏关。
//
// 修法：主进程提供 `highlightOffAll`（按自己的 tab 表全量清 + 清零全局开关），
//   任务收尾由 useChat 单例统一调（不依赖面板是否还挂着），面板自身也补 auto 标记与卸载清理。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const USE_CHAT = readFileSync(resolve(REPO, 'packages/ui/src/composables/chat/useChat.ts'), 'utf8');
const STORE = readFileSync(resolve(REPO, 'packages/ui/src/stores/chat.ts'), 'utf8');
const MAIN = readFileSync(resolve(REPO, 'apps/desktop/main.cjs'), 'utf8');
const PRELOAD = readFileSync(resolve(REPO, 'apps/desktop/preload.cjs'), 'utf8');

/** 按大括号配平截取具名函数源码（函数体里的 `{` 不会误伤） */
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

describe('编号层收尾清理 · 渲染层', () => {
  it('关闸走主进程全量清理（不再只遍历本地 tabs）', () => {
    const body = fnSource(PANEL, 'applyHighlight');
    const offBranch = body.slice(0, body.indexOf('if (!activeTabId'));
    expect(offBranch, '★ 关闸必须调 highlightOffAll，否则面板漏关一次 = 编号框永驻').toContain('highlightOffAll');
  });

  it('面板卸载时必须收掉编号层', () => {
    const at = PANEL.indexOf('onUnmounted(');
    expect(at).toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, PANEL.indexOf('});', at) + 3);
    expect(body, '★ 卸载后没人再发 off → 主进程会一直重画').toContain('applyHighlight(false');
  });

  it('所有自动开路径都记 highlightAuto（否则任务收尾关不掉）', () => {
    const watchTab = PANEL.slice(PANEL.indexOf('watch(activeTabId'), PANEL.indexOf('watch(() => chatStore.browserTaskActive'));
    expect(watchTab, '切 tab/挂载补一层属于自动开').toContain('highlightAuto.value = true');
    const ready = PANEL.slice(PANEL.indexOf('function onWebviewReady'), PANEL.indexOf('function onWebviewReady') + 2000);
    expect(ready, 'guest 就绪补一层同样属于自动开').toContain('highlightAuto.value = true');
  });

  it('任务收尾由 useChat 单例兜底清理，且尊重用户手动开', () => {
    expect(USE_CHAT, '★ 收尾必须清编号层（面板可能已卸载）').toContain('highlightOffAll');
    expect(USE_CHAT).toContain('browserHighlightManual');
    const hook = USE_CHAT.slice(USE_CHAT.indexOf('store.onTaskFinished('));
    expect(hook.slice(0, 1500)).toContain('highlightOffAll');
    expect(STORE, '状态必须放 store（面板局部状态会随卸载丢失）').toContain('browserHighlightManual');
  });

  // ★ 2026-10-23 用户实报「暂停的时候这些也都要隐藏啊」：暂停 = 用户接管页面，
  //   给 agent 定位用的编号框必须收起；恢复执行后再按原状态补回来。
  it('★ 暂停时必须收起编号层，恢复后补回', () => {
    const at = PANEL.indexOf('watch(() => chatStore.browserPaused');
    expect(at, '缺少暂停 watcher').toBeGreaterThanOrEqual(0);
    const body = PANEL.slice(at, at + 900);
    expect(body, '暂停必须关层').toContain('applyHighlight(false');
    expect(body, '恢复执行要补回').toContain('applyHighlight(true');
  });
});

describe('编号层收尾清理 · 主进程', () => {
  it('关闸分支不依赖页面助手（助手缺失也要能删掉残留覆盖层）', () => {
    const body = fnSource(MAIN, 'runHighlight');
    const offAt = body.indexOf('if(off){');
    const helperAt = body.indexOf('var A=window.__yzAssistant');
    expect(offAt, '缺少 off 分支').toBeGreaterThanOrEqual(0);
    expect(helperAt, '缺少助手检查').toBeGreaterThanOrEqual(0);
    expect(offAt, '★ 助手检查写在 off 之前 → 未注入时返回错误，残留层永远删不掉').toBeLessThan(helperAt);
  });

  it('提供全量关闸并清零全局开关', () => {
    const body = fnSource(MAIN, 'runHighlightOffAll');
    expect(body).toContain('highlightEnabled = false');
    expect(body, '按主进程自己的 tab 表清（含不在面板列表里的页）').toContain('allGuestWebContents');
  });

  it('preload 暴露 browserView:highlightOffAll', () => {
    expect(PRELOAD).toContain('browserView:highlightOffAll');
    expect(MAIN, '主进程必须真的接上这个通道').toContain("ipcMain.handle('browserView:highlightOffAll'");
  });

  // ★ 2026-10-23 用户口径：「pageAgent 任务一断这些就没了，一启动又出来」——
  //   编号层是"agent 正在操作"的指示，不是整任务的装饰；停手必须自动收起，
  //   而且导航重画不能把它又画回来（否则用户自己点页面时橙框永驻）。
  it('★ 编号层跟随 pageAgent 动作：停手自动收起、下次动作再亮', () => {
    expect(MAIN).toContain('HIGHLIGHT_ACTION_IDLE_MS');
    expect(MAIN).toContain('function scheduleHighlightIdleHide');
    expect(MAIN, '动作到达时要重置空闲计时').toMatch(/if \(highlightEnabled\) scheduleHighlightIdleHide\(\)/);
    expect(MAIN, '导航/新开页的重画必须尊重"空闲已收起"').not.toMatch(/if \(highlightEnabled\) runHighlight/);
  });
});
