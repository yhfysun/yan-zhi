import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 浏览器页面收拾 —— 权限边界 + 收尾自动关闭的防回归测试（2026-10-08 立项，2026-10-09 升级）。
 *
 * 用户原话：「pageAgent 执行完了不会关闭页面？」→「子智能体运行任务完后代理的页面自动关闭，
 * 智能体接下来去其他任务，页面不能不关啊」。
 * 取向（用户拍板，2026-10-09 升级）：
 *   ① 模型收尾时仍应自己收拾（提示词引导 + 批量 close_tab）；
 *   ② **任务收尾兜底自动关**：agent 开的页面（agentOpened）主进程统一关闭 ——
 *      取代旧的"只弹提示"方案（实测页面照样堆积）；
 *   ③ **权限边界**：agent 只能关自己开的 tab，用户手开的一律关不掉（执行侧强制）；
 *   ④ 主进程关闭必须广播 tabClosed，渲染层摘壳（防 webview 引擎幽灵壳）。
 *
 * ★ 断言基于真实源码（不做模块导入，避免 better-sqlite3 ABI 不匹配）。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const mainSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/desktop/main.cjs'), 'utf8');
const chatSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/stores/chat.ts'), 'utf8');
const useChatSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/composables/chat/useChat.ts'), 'utf8');
const browserToolSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/core/src/tool/builtin/browser/index.ts'), 'utf8');
const taskMgrSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/llm-task-manager.ts'), 'utf8');

function sliceFrom(src: string, startMarker: string, length = 2000): string {
  const i = src.indexOf(startMarker);
  return i < 0 ? '' : src.slice(i, i + length);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('权限边界：agent 只能关闭自己打开的 tab（执行侧强制）', () => {
  /**
   * ★ 这是安全边界，必须做在主进程 —— 只靠提示词约束不构成权限
   *   （模型可能传错 tabId，或被页面内容诱导去关用户的页）。
   */

  it('tab 归属标记 agentOpened 存在，且 UI 创建路径默认 false', () => {
    expect(mainSrc).toContain('agentOpened');
    // ★ 2026-10-10（执行面直连化）：`ipcMain.handle('browserView:createTab')` 已收窄为
    //   **一行委托** `createBrowserTab(scope)` —— 因为该实现现在有第二个调用方
    //   （`browserView:action` 的"会话首次 navigate 自建 guest"分支，防两处实现漂移）。
    //   断言语义不变（"UI/用户创建路径必须显式置 agentOpened:false"），锚点随之移到
    //   **唯一实现** `createBrowserTab` 上。**锚点缺失即红**，防止有人又改成别处。
    const fn = sliceFrom(mainSrc, 'function createBrowserTab(', 1200);
    expect(fn, '★ 锚点缺失：createBrowserTab（tab 创建唯一实现）').toContain('agentOpened');
    expect(fn).toMatch(/agentOpened:\s*false/);
  });

  it('agent 的 new_tab 路径（browserView:action）必须置 agentOpened: true', () => {
    const fn = sliceFrom(mainSrc, "case 'new_tab': {", 1200);
    expect(fn).toMatch(/agentOpened:\s*true/);
  });

  it('close_tab（agent 通道）必须拒绝非 agentOpened 的 tab', () => {
    const fn = sliceFrom(mainSrc, "case 'close_tab': {", 1200);
    expect(fn, 'close_tab 缺权限闸门').toMatch(/meta\.agentOpened\s*!==\s*true/);
    expect(fn, '拒绝时应返回 error 而不是静默关闭').toMatch(/return\s*\{\s*error:/);
  });

  it('拒绝文案必须告诉模型"别再试"（防止反复重试白烧步数）', () => {
    const fn = sliceFrom(mainSrc, "case 'close_tab': {", 1200);
    expect(fn).toMatch(/请勿再次尝试|不要再次/);
  });

  it('用户关 tab 的 IPC 路径（browserView:closeTab）不受闸门影响', () => {
    // 用户路径走 closeTabById，不经过 case 'close_tab' —— 两者必须是不同入口
    expect(mainSrc).toMatch(/ipcMain\.handle\('browserView:closeTab'/);
    const uiPath = sliceFrom(mainSrc, "ipcMain.handle('browserView:closeTab'", 200);
    expect(uiPath, '用户路径不得被 agentOpened 闸门拦截').not.toContain('agentOpened');
  });

  it('get_tabs 必须把 agentOpened 暴露给模型（事前可见）', () => {
    const fn = sliceFrom(mainSrc, "case 'get_tabs': {", 700);
    expect(fn).toMatch(/agentOpened:\s*t\.agentOpened\s*===\s*true/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('工具层：browser_close_tab 支持批量（收尾一次关多个）', () => {
  it('inputSchema 提供 tabIds 数组参数', () => {
    const fn = sliceFrom(browserToolSrc, 'export class BrowserCloseTabTool', 2500);
    expect(fn).toContain('tabIds');
    expect(fn).toMatch(/type:\s*'array'/);
  });

  it('保留单个 tabId 参数（向后兼容）', () => {
    const fn = sliceFrom(browserToolSrc, 'export class BrowserCloseTabTool', 2500);
    expect(fn).toContain('tabId');
  });

  it('工具描述必须写明"只能关自己开的"（与执行侧闸门口径一致）', () => {
    const fn = sliceFrom(browserToolSrc, 'export class BrowserCloseTabTool', 2500);
    expect(fn).toMatch(/任务收尾/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('提示词：收尾必做"收拾页面"，且讲清权限边界', () => {
  it('存在"浏览器页面收拾"段落', () => {
    expect(taskMgrSrc).toContain('## 浏览器页面收拾');
  });

  it('段落要求先 get_tabs 再批量 close（给出可执行步骤）', () => {
    const seg = sliceFrom(taskMgrSrc, '## 浏览器页面收拾', 1200);
    expect(seg).toContain('browser_get_tabs');
    expect(seg).toContain('browser_close_tab');
    expect(seg).toContain('agentOpened');
  });

  it('段落区分"该关的中间页"与"该留的成果页"', () => {
    const seg = sliceFrom(taskMgrSrc, '## 浏览器页面收拾', 1200);
    expect(seg).toMatch(/保留/);
    expect(seg).toMatch(/权限边界/);
  });

  it('段落仅在 includeUiTools 时注入（不污染非交互场景）', () => {
    const seg = taskMgrSrc.slice(Math.max(0, taskMgrSrc.indexOf('## 浏览器页面收拾') - 1200), taskMgrSrc.indexOf('## 浏览器页面收拾'));
    expect(seg).toContain('opts?.includeUiTools');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('前端记账：agent 开过的 tab 按会话累积，收尾提示后可清', () => {
  it('store 提供按会话的 agent tab 记账', () => {
    expect(chatSrc).toContain('agentOpenedTabs');
    expect(chatSrc).toMatch(/function\s+markAgentOpenedTab\(/);
    expect(chatSrc).toMatch(/function\s+remainingAgentOpenedTabs\(/);
    expect(chatSrc).toMatch(/function\s+clearAgentOpenedTabs\(/);
  });

  it('agent 开 tab 的两条路径都要登记（openInNewTab / navigate）', () => {
    expect(chatSrc).toContain('markAgentOpenedTab(ctx?.convId');
  });

  it('剩余 tab 检测必须只算"仍存在的"（已关掉的不计入提示）', () => {
    const fn = sliceFrom(chatSrc, 'function remainingAgentOpenedTabs(', 900);
    expect(fn).toMatch(/alive\.has/);
  });

  it('收尾提示必须"先取快照后清理"（否则永远读到空）', () => {
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 1800);
    const snapshotIdx = fn.indexOf('remainingAgentOpenedTabs');
    const clearIdx = fn.indexOf('clearAgentOpenedTabs');
    expect(snapshotIdx, '未取残留快照').toBeGreaterThan(-1);
    expect(clearIdx, '未清理记账').toBeGreaterThan(-1);
    expect(snapshotIdx, '取快照必须在清理之前').toBeLessThan(clearIdx);
  });

  it('收尾自动关：调用主进程 closeAgentTabs（只关 agent 开的，双保险）', () => {
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 2200);
    expect(fn).toContain('closeAgentTabs');
  });

  it('收尾自动关后给用户一条知会（已自动关闭 N 个）', () => {
    // ★ 窗口 2200 → 3600（2026-10-10）：新增「按会话关闭」分支（closeConvTabs，优先于
    //   旧 closeAgentTabs 分支）把回退文案推到了原窗口之外 —— 属**锚点窗口偏移**，
    //   不是行为变化（回退路径仍在；已逐行核对源码）。
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 3600);
    expect(fn).toContain('ElMessage');
    expect(fn).toMatch(/已自动关闭/);
    // 退回路径（无 Electron API）保留旧明示文案
    expect(fn).toMatch(/保留在预览面板|可自行关闭/);
  });

  it('收尾自动关：桥档优先按会话关闭 + 保留 agentOpened 兜底（2026-10-10）', () => {
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 3600);
    // 桥档下渲染层 agentOpened 记账恒为空 ⇒ 必须有按会话的入口
    expect(fn, '★ 缺按会话关闭（桥档下页面堆积）').toMatch(/closeConvTabs/);
    expect(fn, '★ 缺 agentOpened 兜底').toMatch(/closeAgentTabs/);
  });

  it('主进程必须有 closeAgentTabs IPC，且按 agentOpened===true 过滤', () => {
    expect(mainSrc).toMatch(/ipcMain\.handle\('browserView:closeAgentTabs'/);
    const fn = sliceFrom(mainSrc, "ipcMain.handle('browserView:closeAgentTabs'", 700);
    expect(fn).toMatch(/agentOpened\s*===\s*true/);
  });

  it('主进程关 tab 必须广播 tabClosed（渲染层摘壳，防幽灵壳）', () => {
    expect(mainSrc).toContain('browserView:tabClosed');
    const closeFn = sliceFrom(mainSrc, 'function closeTabById(', 2200);
    expect(closeFn).toContain('broadcastTabClosed(');
  });

  it('preload 暴露 closeAgentTabs 与 onTabClosed', () => {
    const preloadSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/desktop/preload.cjs'), 'utf8');
    expect(preloadSrc).toContain("invoke('browserView:closeAgentTabs')");
    expect(preloadSrc).toContain("ipcRenderer.on('browserView:tabClosed'");
  });

  it('BrowserPanel 监听 tabClosed 摘除 tab 壳', () => {
    const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
    expect(panelSrc).toContain('onTabClosed');
  });

  it('新任务开头清空记账（resetTaskScopedState）', () => {
    const fn = sliceFrom(useChatSrc, 'function resetTaskScopedState', 2500);
    expect(fn).toContain('clearAgentOpenedTabs');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('接管条活性门控：pageAgent 结束后「Agent 接管中」不能一直挂着', () => {
  it('store 记录浏览器工具活性时间戳（watch browserSteps 收口，不逐点插桩）', () => {
    expect(chatSrc).toContain('lastBrowserToolAt');
    expect(chatSrc).toContain('BROWSER_LIVE_GRACE_MS');
  });

  it('store 有残留自愈巡检：浏览器超宽限主动查服务端活动任务并清残留运行态', () => {
    expect(chatSrc).toContain('sweepStaleBrowserTakeover');
    const fn = sliceFrom(chatSrc, 'async function sweepStaleBrowserTakeover(', 1800);
    // 只取本函数体（到下一个函数声明为止），避免断言被后续定义污染
    const body = fn.slice(0, fn.indexOf('async function callLlm') > 0 ? fn.indexOf('async function callLlm') : fn.length);
    // ★★★ 2026-10-11 契约更新：宽限常量从内联的 `120000` 抽到独立纯函数文件
    //   `stores/stale-run-sweep.ts`（BROWSER_SWEEP_GRACE_MS = 30000，120s → 30s）。
    //   动机（用户实报「没有任务，禁用标志也一直存在着」）：120s 宽限意味着
    //   跑过浏览器工具的会话，任务结束后最长 120s 禁用标志都挂着不掉。
    //   ⇒ 这里改钉"判定来自纯函数"，而不是钉那个数字（数字在纯函数文件里，由 ui 测试钉住）。
    expect(body, '★ 未走纯函数判定 → 判定不可单测、易回退').toMatch(/shouldSweepConv/);
    expect(body).toMatch(/llm\/tasks\/active/);
    expect(body).toMatch(/emitTaskFinished/);
    // 只清残留，不做 SSE 重连重订（长任务编排间隙浏览器空闲是常态，重订会抖动流）
    expect(body).not.toContain('reconnect');
    // ★ 纯函数文件必须存在且导出判定与常量
    const sweepSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/stores/stale-run-sweep.ts'), 'utf8');
    expect(sweepSrc).toMatch(/export function shouldSweepConv\(/);
    expect(sweepSrc).toMatch(/export const BROWSER_SWEEP_GRACE_MS\s*=\s*30000/);
  });

  it('BrowserPanel 接管条带活性门控 + 暂停态例外', () => {
    const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
    expect(panelSrc).toContain('browserLiveFresh');
    expect(panelSrc).toContain('nowTick');
    // 暂停态必须例外：条子要露「已暂停 · 你已接管页面」和恢复按钮
    const fn = sliceFrom(panelSrc, 'const browserLiveFresh', 400);
    expect(fn).toMatch(/pausedNow/);
  });
});
