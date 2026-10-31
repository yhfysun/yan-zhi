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
    // title 挂在外层 wrap 上（按钮右侧还要挂清空 ×，两者共用同一个提示）
    expect(CODE).toMatch(/title="`工作目录：\$\{workspaceDirLabel \|\| '未设置'\}`"/);
  });

  it('★ 已设置目录时可清空（此前设了就撤不掉）', () => {
    expect(CODE, '★ 缺清空入口：用户只能去设置页手动删').toMatch(/v-if="workspaceDirLabel"[\s\S]{0,240}清空工作目录/);
    expect(CODE).toContain('clearWorkspaceDirFromOps');
    // 必须复用主对话的 clearWorkspaceDir，不另起一套清理逻辑
    const fn = CODE.slice(CODE.indexOf('async function clearWorkspaceDirFromOps'), CODE.indexOf('async function clearWorkspaceDirFromOps') + 500);
    expect(fn).toContain('useChat().clearWorkspaceDir()');
  });

  it('选定目录写回全局设置（与主对话同一份，不另起一套）', () => {
    const fn = CODE.slice(CODE.indexOf('function onWorkspaceDirSelected'), CODE.indexOf('function onWorkspaceDirSelected') + 400);
    expect(fn).toContain('settingsStore.settings.workspaceDir = dir');
    // 不允许在运维页自己造一份目录设置
    expect(CODE).not.toMatch(/opsWorkspaceDir/);
  });
});

describe('服务器当前目录（远端 pwd）', () => {
  it('窗口头显示当前目录，可点开切换', () => {
    expect(CODE, '★ 用户实报「服务器当前路径没有显示」').toContain('ops-cwd-chip');
    expect(CODE).toMatch(/\{\{ w\.remoteCwd \|\| '…' \}\}/);
    expect(CODE).toContain('gotoRemoteDir');
  });

  it('解析提示符而不是发 pwd（不在终端留用户没敲过的命令）', () => {
    expect(CODE).toMatch(/import \{ parsePromptCwd, applyPromptCwd[^}]*\} from '\.\/remote-cwd'/);
    // ★ 解析的是累积缓冲尾部（PTY 分片会把一行提示符切碎，逐帧解析永远认不出）
    expect(CODE).toMatch(/parsePromptCwd\(tail\)/);
  });

  it('服务端随 ready 下发初始 pwd，作为相对提示符的基准', () => {
    expect(CODE).toMatch(/if \(msg\.cwd\) \{ w\.remoteCwd = msg\.cwd/);
  });
});

describe('★ 执行模式不得伪装成普通输入框（用户输入 ll 被当命令）', () => {
  it('占位文案明确说明「不经模型」', () => {
    const fn = CODE.slice(CODE.indexOf('function chatPlaceholder'), CODE.indexOf('function chatPlaceholder') + 700);
    expect(fn, '★ 执行模式文案必须点明直连终端').toMatch(/不经模型/);
    expect(fn, '★ Agent 模式文案要引导"描述要做什么"').toMatch(/描述你要做的事/);
  });

  it('执行模式有独立视觉（警告色边框 + 等宽字体）', () => {
    expect(CODE).toMatch(/'is-exec-mode': \(w\.chatMode \|\| 'agent'\) === 'exec'/);
    expect(CODE).toMatch(/\.ops-chat-input\.is-exec-mode \{[^}]*border-color/);
    expect(CODE).toMatch(/\.ops-chat-input\.is-exec-mode :deep\(\.el-textarea__inner\) \{ font-family: Consolas/);
  });

  it('「/ 直连终端」这个隐形规则有可见提示', () => {
    expect(CODE).toContain('ops-slash-hint');
    expect(CODE).toMatch(/以 \/ 开头都会直接发到终端/);
  });
});

describe('工具长输出折叠后，命令与输出视觉分离', () => {
  it('步骤卡里命令用 osc-cmd（左侧强调条），与输出区分', () => {
    const STEP = readFileSync(resolve(__dirname, '../../components/ops/OpsStepCards.vue'), 'utf8');
    expect(STEP).toMatch(/v-if="commandOf\(s\.argsText\)"/);
    expect(STEP).toMatch(/\.osc-cmd \{[^}]*border-left/);
  });
});

describe('历史任务入口', () => {
  it('顶栏有常驻「历史任务」按钮，控制左栏任务段显隐', () => {
    expect(CODE).toMatch(/title="历史任务"/);
    expect(CODE).toMatch(/@click="toggleTaskList"/);
    expect(CODE).toMatch(/v-show="taskListVisible" class="ops-side-tasks"/);
  });

  it('任务段仍渲染「全部会话」视图（space-id=null），四模式同构', () => {
    expect(CODE).toMatch(/<TaskListSection :space-id="null"/);
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
    // 2026-10-31 同步：合法判定收敛到 isValidMode()（内置白名单 ∪ 运行时插件模式），
    //   默认回落仍是 'office'。
    expect(ROUTE, '★ 后端默认 mode 逻辑变了，需复核本测试前提')
      .toMatch(/isValidMode\(String\(mode\)\)\s*\?\s*String\(mode\)\s*:\s*'office'/);
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
