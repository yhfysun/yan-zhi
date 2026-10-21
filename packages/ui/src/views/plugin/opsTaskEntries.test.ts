/**
 * 运维控制台：工作目录入口 / 历史任务入口 / 任务归属模式 —— 守门测试（2026-10-21）。
 *
 * 用户实报两条：
 *   ① 「可以切换目录的没了？」—— 输入框工具条没有工作目录入口（主对话有，运维没有）；
 *   ② 「还有历史任务按钮啊，现在发送后这个任务就没了？也没有那个列表能看到啊」
 *
 * ② 的根因不是列表组件缺失，而是**会话建错了模式**：
 *   POST /conversations 不传 mode 时后端默认落 'office'，而运维任务列表按 activeMode='ops'
 *   过滤 → 会话永远查不到，观感就是「发完就没了」。会话按模式隔离是既定设计，必须显式声明。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONSOLE = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
/** 剥注释：注释里写着旧实现字样会把 not.toMatch 误伤（项目既有坑） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE = strip(CONSOLE);

const ROUTE = readFileSync(
  resolve(__dirname, '../../../../../apps/server/src/routes/conversations.ts'), 'utf8',
);

describe('输入框工具条 · 工作目录入口', () => {
  it('工具条里有工作目录按钮，且用的是同一个 WorkspaceDirDialog', () => {
    expect(CODE).toContain('class="ops-dir-btn"');
    expect(CODE).toContain("import WorkspaceDirDialog from '../../components/WorkspaceDirDialog.vue'");
    expect(CODE).toMatch(/<WorkspaceDirDialog v-model="showDirPicker"/);
  });

  it('按钮显示末级目录名，完整路径进 title（工具条只有 32px 高）', () => {
    expect(CODE).toContain('workspaceDirName');
    expect(CODE).toMatch(/title="`工作目录：\$\{workspaceDirLabel\}/);
  });

  it('选定目录写回全局设置（与主对话同一份，不另起一套）', () => {
    const fn = CODE.slice(CODE.indexOf('function onWorkspaceDirSelected'), CODE.indexOf('function onWorkspaceDirSelected') + 400);
    expect(fn).toContain('settingsStore.settings.workspaceDir = dir');
    // 不允许在运维页自己造一份目录设置
    expect(CODE).not.toMatch(/opsWorkspaceDir/);
  });
});

describe('历史任务入口', () => {
  it('顶栏有常驻「历史任务」按钮，控制左栏任务段显隐', () => {
    expect(CODE).toMatch(/title="历史任务"/);
    expect(CODE).toMatch(/@click="toggleTaskList"/);
    expect(CODE).toMatch(/v-show="taskListVisible" class="ops-side-tasks"/);
  });

  it('任务段仍渲染「全部会话」视图（space-id=null），四模式同构', () => {
    expect(CODE).toMatch(/<TaskListSection :space-id="null" \/>/);
  });

  it('展开时重拉列表；挂载时也兜底重拉（App 只在切模式时拉）', () => {
    expect(CODE).toMatch(/if \(taskListVisible\.value\) void refreshTaskList\(\)/);
    const onMounted = CODE.slice(CODE.indexOf('onMounted(() => {'), CODE.indexOf('onMounted(() => {') + 700);
    expect(onMounted, '★ 运维页挂载没有兜底重拉，直开本页时列表可能是别的模式的空数据')
      .toContain('refreshTaskList()');
  });
});

describe('运维会话必须建在 ops 模式（否则任务列表查不到）', () => {
  it('ensureWinConversation 显式下发 mode: ops', () => {
    const fn = CODE.slice(
      CODE.indexOf('async function ensureWinConversation'),
      CODE.indexOf('async function ensureWinConversation') + 1400,
    );
    expect(fn, '★★ 建会话没带 mode → 后端落 office，运维任务列表永远查不到这条').toMatch(/mode: 'ops'/);
  });

  it('后端默认值确认：不传 mode 会落 office（本测试的前提，变了要重新评估）', () => {
    expect(ROUTE, '★ 后端默认 mode 逻辑变了，需复核本测试前提')
      .toMatch(/VALID_MODES\.has\(String\(mode\)\)\s*\?\s*String\(mode\)\s*:\s*'office'/);
    expect(ROUTE, "★ 合法 mode 里必须包含 'ops'").toMatch(/VALID_MODES = new Set\(\[[^\]]*'ops'/);
  });

  it('新会话建好后立刻刷新任务列表（不必等切模式）', () => {
    const fn = CODE.slice(
      CODE.indexOf('async function ensureWinConversation'),
      CODE.indexOf('async function ensureWinConversation') + 1400,
    );
    expect(fn).toContain('refreshTaskList()');
  });
});
