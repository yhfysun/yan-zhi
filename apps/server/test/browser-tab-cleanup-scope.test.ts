import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 浏览器页面收拾 —— 权限边界 + 收尾提示的防回归测试（2026-10-08）。
 *
 * 用户原话：「pageAgent 执行完了不会关闭页面？」
 * 取向（用户拍板）：
 *   ① **不写死自动关**，而是把"收拾页面"变成模型收尾时的明确动作（提示词引导）；
 *   ② **权限边界**：agent 只能关自己开的 tab，用户手开的一律关不掉（执行侧强制）；
 *   ③ 模型没关干净时，给用户一条明示（不替用户决定关掉可能有用的页）。
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
    // browserView:createTab（渲染层/用户路径）必须显式置 false
    const fn = sliceFrom(mainSrc, "ipcMain.handle('browserView:createTab'", 1200);
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

  it('残留提示是给用户的明示（不自动关，符合方案 B）', () => {
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 1800);
    expect(fn).toContain('ElMessage');
    expect(fn).toMatch(/保留在预览面板|可自行关闭/);
    // 绝不能自动关 —— 那会让用户丢页面
    expect(fn).not.toMatch(/closeAllPreviewTabs|closePreviewTab\(/);
  });

  it('新任务开头清空记账（resetTaskScopedState）', () => {
    const fn = sliceFrom(useChatSrc, 'function resetTaskScopedState', 2500);
    expect(fn).toContain('clearAgentOpenedTabs');
  });
});
