/**
 * 运维会话 ↔ 服务器绑定 + AI 模式执行不跳视图（2026-10-21 用户实报）。
 *
 * 实报两条：
 *   ① 「点击会话应该自动打开上次的服务器啊，会话是跟着服务器走的啊」——
 *      点任务列表行只走全局 chat.selectConv，运维窗口毫无反应。
 *   ② 「ai 模式下执行命令也是在聊天里面展示命令结果啊，而不是跳到命令模式」——
 *      execDirect 无条件 switchWinView(w,'term')，用户在执行模式敲命令，界面直接被切走。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONSOLE = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE = strip(CONSOLE);

const TASK_LIST = readFileSync(resolve(__dirname, '../../components/workbench/TaskListSection.vue'), 'utf8');
const CONV_ROUTE = readFileSync(resolve(__dirname, '../../../../../apps/server/src/routes/conversations.ts'), 'utf8');
const DB = readFileSync(resolve(__dirname, '../../../../../apps/server/src/db.ts'), 'utf8');
const CHAT_STORE = readFileSync(resolve(__dirname, '../../stores/chat.ts'), 'utf8');

describe('会话跟着服务器走 —— 数据层', () => {
  it('conversation 表新增 ops_connection_id（增量迁移，旧库不缺列）', () => {
    expect(DB, '★ 缺列迁移：会话记不住是哪台服务器').toContain("ADD COLUMN ops_connection_id TEXT");
    expect(DB).toMatch(/pragma_table_info\('conversation'\)/);
  });

  it('POST /conversations 接受 opsConnectionId 并落库', () => {
    expect(CONV_ROUTE).toContain('opsConnectionId');
    expect(CONV_ROUTE).toMatch(/ops_connection_id/);
    // 白名单化：非字符串一律 null，长度封顶
    expect(CONV_ROUTE).toMatch(/typeof opsConnectionId === 'string'[\s\S]{0,120}slice\(0, 128\)/);
  });

  it('PATCH 支持改绑（窗口切连接时同步）', () => {
    expect(CONV_ROUTE).toMatch(/req\.body\.opsConnectionId !== undefined[\s\S]{0,300}sets\.push\('ops_connection_id = \?'\)/);
  });

  it('rowToConv 映射到前端类型（蛇形/驼峰都认）', () => {
    expect(CHAT_STORE).toMatch(/opsConnectionId: r\.ops_connection_id \?\? r\.opsConnectionId \?\? null/);
    expect(CHAT_STORE).toMatch(/releaseProjectId: r\.release_project_id \?\? r\.releaseProjectId \?\? null/);
  });
});

describe('会话跟着服务器走 —— 交互', () => {
  it('任务行点击交给父级接管（不硬编码 selectConv）', () => {
    expect(TASK_LIST).toMatch(/onOpen\?: \(convId: string\) => void/);
    const fn = TASK_LIST.slice(TASK_LIST.indexOf('function onRowClick'), TASK_LIST.indexOf('function onRowClick') + 300);
    expect(fn, '★ 父级传了 onOpen 就必须走它').toMatch(/if \(props\.onOpen\) \{ props\.onOpen\(c\.id\); return; \}/);
  });

  it('运维页把行点击接到「打开会话 + 打开服务器」', () => {
    expect(CODE).toMatch(/<TaskListSection :space-id="null" :on-open="onTaskRowOpen"/);
    expect(CODE).toContain('openConvFromTaskList');
  });

  it('打开会话时按绑定连接找/建窗口，而不是只切全局 currentConvId', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvFromTaskList'), CODE.indexOf('async function openConvFromTaskList') + 2600);
    expect(fn).toMatch(/conv\.opsConnectionId/);
    expect(fn).toMatch(/windows\.value\.find\(\(w\) => w\.conversationId === convId\)/);
    // 复用窗口的选择收口到 pickWindow（按连接 id 找，优先空闲）
    expect(fn).toMatch(/pickWindow\(conn\.id\)/);
    const pick = CODE.slice(CODE.indexOf('const pickWindow'), CODE.indexOf('const pickWindow') + 400);
    expect(pick).toMatch(/x\.connectionId === connId2/);
  });

  it('连接已被删除时明确提示，不静默开空窗口', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvFromTaskList'), CODE.indexOf('async function openConvFromTaskList') + 2000);
    expect(fn).toMatch(/绑定的服务器已删除/);
  });

  it('★★ 老会话 + 没有激活窗口时不得静默返回（用户实报「点击无用」）', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvFromTaskList'), CODE.indexOf('async function openConvFromTaskList') + 2600);
    // 旧写法 `if (w) {...} return;` 在无窗口时什么都不做 —— 那条路径必须消失
    expect(fn, '★ 无激活窗口时仍直接 return：点了看着没反应').not.toMatch(/if \(w\) \{ await openConvOnWindow\(w, conv\); activateWindow\(w\.id\); \}\s*return;/);
    // 兜底：唯一连接 → 直接为它开窗并挂上会话
    expect(fn).toMatch(/connections\.value\.length === 1/);
    // 多个连接且无激活窗口 → 明确提示，而不是无声失败
    expect(fn).toMatch(/请先在左侧资源里选一个连接再打开/);
  });

  it('窗口正忙时要么让开、要么给出提示（不静默吞掉点击）', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvOnWindow'), CODE.indexOf('async function openConvOnWindow') + 900);
    expect(fn, '★ chatStreaming 时直接 return = 点了没反应').not.toMatch(/if \(w\.chatStreaming\) return; \/\/ 有任务在跑/);
    expect(fn).toMatch(/该服务器上还有任务在运行/);
  });

  it('打开会话要切到对话视图（否则消息载入了却看不见）', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvOnWindow'), CODE.indexOf('async function openConvOnWindow') + 900);
    expect(fn).toMatch(/if \(w\.view !== 'chat'\) \{ w\.view = 'chat'; \}/);
  });

  it('复用窗口优先选空闲的，不抢正在跑任务的窗口', () => {
    const fn = CODE.slice(CODE.indexOf('const pickWindow'), CODE.indexOf('const pickWindow') + 400);
    expect(fn).toMatch(/!x\.chatStreaming && !x\.conversationId/);
  });

  it('老会话（未记连接）建会话时按当前窗口补齐', () => {
    const fn = CODE.slice(CODE.indexOf('async function ensureWinConversation'), CODE.indexOf('async function ensureWinConversation') + 1600);
    expect(fn).toMatch(/!conv\.opsConnectionId && w\.connectionId/);
    expect(fn).toMatch(/opsConnectionId: w\.connectionId/);
  });
});

describe('AI 模式执行命令不得跳走视图', () => {
  it('execDirect 不再无条件切到 term', () => {
    const fn = CODE.slice(CODE.indexOf('async function execDirect'), CODE.indexOf('async function execDirect') + 1200);
    expect(fn, '★ 仍是无条件 switchWinView → 在聊天里执行会跳走')
      .toMatch(/const stayInChat = w\.view === 'chat'/);
    expect(fn).toMatch(/if \(!stayInChat && w\.view !== 'term'\) switchWinView\(w, 'term'\)/);
  });

  it('留在聊天时把这次执行记成一轮（用户命令 + 结果气泡）', () => {
    const fn = CODE.slice(CODE.indexOf('async function execDirect'), CODE.indexOf('async function execDirect') + 2600);
    expect(fn).toMatch(/w\.chatMessages\.push/);
    expect(fn).toMatch(/role: 'user', content: command/);
    expect(fn).toMatch(/exec: true/);
    expect(fn).toMatch(/finishRound/);
  });

  it('失败/取消也要在聊天里留痕（不静默）', () => {
    expect(CODE).toMatch(/finishRound\('用户取消执行', true\)/);
    expect(CODE).toMatch(/finishRound\(err\.message, true\)/);
  });

  it('★ 隐藏容器里开终端要临时解除 display:none 才能量到尺寸', () => {
    expect(CODE).toContain('function pendingUnhide');
    const fn = CODE.slice(CODE.indexOf('async function openTerminal'), CODE.indexOf('async function openTerminal') + 2600);
    expect(fn).toContain('pendingUnhide(el)');
    expect(fn, '★ 量完必须还原，否则终端一直不可见').toMatch(/restores\(\)/);
  });
});

describe('点击态：运维用窗口会话 id 高亮，不靠全局 currentConvId', () => {
  it('TaskListSection 支持外部 activeConvId', () => {
    expect(TASK_LIST).toMatch(/activeConvId\?: string/);
    expect(TASK_LIST, '★ 仍只读 chatStore.currentConvId → 运维点会话行永不高亮')
      .toMatch(/c\.id === \(props\.activeConvId \|\| chatStore\.currentConvId\)/);
  });

  it('运维页把当前窗口的会话 id 传进去', () => {
    expect(CODE).toMatch(/:active-conv-id="activeWin\?\.conversationId \|\| ''"/);
  });

  it('active 态有可见样式（不只是改字色）', () => {
    expect(TASK_LIST).toMatch(/\.tls-item\.active \{[^}]*background/);
  });
});

describe('行尾操作按钮不得挤压标题（用户实报「名词就显示一个字」）', () => {
  const CSS = readFileSync(resolve(__dirname, '../../styles/task-row.css'), 'utf8');

  it('操作组脱离文档流，显隐都不参与宽度分配', () => {
    const block = CSS.slice(CSS.indexOf('.task-row-actions {'), CSS.indexOf('.task-row-act {'));
    expect(block, '★ 仍用 opacity 隐性占位 → 窄栏里标题被挤成一个字').toMatch(/position: absolute/);
    expect(block).toMatch(/visibility:\s*hidden/);
    // 绝对定位后必须有定位基准
    expect(CSS).toMatch(/\.conv-item,\s*\n?\.tls-item \{ position: relative; \}/);
  });

  it('标题有省略号兜底，长标题不会撑破行', () => {
    expect(TASK_LIST).toMatch(/\.tls-label \{[\s\S]{0,160}text-overflow: ellipsis/);
  });
});

describe('AI 模式下的直接执行 = 命令行（完整显示，不折叠）', () => {
  it('exec 消息不再挂 toolCalls（否则被步骤卡折叠）', () => {
    const fn = CODE.slice(CODE.indexOf('async function execDirect'), CODE.indexOf('async function execDirect') + 2000);
    expect(fn, '★ 仍走工具步骤卡 → 输出又被折叠成"展开输出"').not.toMatch(/name: 'terminal_exec'/);
    expect(fn).toMatch(/exec: true/);
    expect(fn).toMatch(/execCommand: command/);
  });

  it('结果直接写进正文（失败也保留原始输出）', () => {
    const fn = CODE.slice(CODE.indexOf('async function execDirect'), CODE.indexOf('async function execDirect') + 2400);
    expect(fn).toMatch(/msg\.content = failed \? `执行失败：\$\{out\}` : out/);
  });

  it('渲染成终端块：$ 命令 + <pre> 原文，等宽不折行', () => {
    expect(CODE).toMatch(/class="ops-exec-block"/);
    expect(CODE).toMatch(/class="ops-exec-out">\{\{ ex\.output \}\}/);
    // 只取主区域那一条规则（不含 .ops-exec-block-sm 变体，折叠条允许限高）
    const css = CODE.slice(CODE.indexOf('.ops-exec-out {'), CODE.indexOf('.ops-exec-pending {'));
    expect(css).toMatch(/white-space: pre/);
    expect(css, '★ 不允许给主区域的输出限高（就是不要折叠）').not.toMatch(/max-height/);
  });
});

describe('服务器当前目录 chip 必须真的看得见、点得动（用户两次实报）', () => {
  it('★★ chip 不得只在命令视图显示（AI 模式下也要有）', () => {
    const at = CODE.indexOf('<el-popover');
    const seg = CODE.slice(at, at + 260);
    expect(seg, '★ v-if 限制 w.view === term → 对话视图完全没有目录入口')
      .not.toMatch(/v-if="w\.view === 'term' &&/);
    expect(seg).toMatch(/connOf\(w\) && connType/);
  });

  it('★★ AI 模式也要后台建终端（否则拿不到 pwd / 提示符）', () => {
    const fn = CODE.slice(CODE.indexOf('function openConnection'), CODE.indexOf('function openConnection') + 1500);
    expect(fn, '★ 只在 term 视图 openTerminal → 对话模式下 remoteCwd 永远空')
      .not.toMatch(/if \(w\.view === 'term'\) void openTerminal\(w\);/);
    expect(fn).toMatch(/void openTerminal\(w\);/);
  });

  it('★ 提示符解析基于累积缓冲尾部（PTY 分片会把一行切碎）', () => {
    const fn = CODE.slice(CODE.indexOf('function accumulateOutput'), CODE.indexOf('function accumulateOutput') + 1200);
    expect(fn, '★ 只解析本帧 text → 提示符被切片就永远认不出来').toMatch(/parsePromptCwd\(tail\)/);
    expect(fn).toMatch(/slice\(-400\)/);
  });

  it('chip 不会被连接信息挤成 0 宽（flex 不收缩 + 实体底色）', () => {
    const css = CODE.slice(CODE.indexOf('.ops-cwd-chip {'), CODE.indexOf('.ops-cwd-chip {') + 700);
    expect(css, '★ 可收缩 → 被 user@host 挤没，看起来"没有路径"').toMatch(/flex: 0 0 auto/);
    expect(css, '★ 透明背景看着像注释，不像可点入口').toMatch(/background: color-mix/);
    // 连接信息让位
    const connCss = CODE.slice(CODE.indexOf('.ops-win-conn {'), CODE.indexOf('.ops-win-conn {') + 300);
    expect(connCss).toMatch(/max-width: 40%/);
  });

  it('切目录走 transport.send 真实字节，并等提示符确认', () => {
    const fn = CODE.slice(CODE.indexOf('async function gotoRemoteDir'), CODE.indexOf('async function gotoRemoteDir') + 1800);
    expect(fn, '★ 用 term.paste 会被 bracketed paste 影响').not.toMatch(/term\.paste\(/);
    expect(fn).toMatch(/h\.transport\.send\(`cd \$\{quoteForShell\(target\)\}\\r`\)/);
    expect(fn, '★ 失败必须如实告知，不能一律报成功').toMatch(/切换失败，仍在/);
  });

  it('后台建连不弹「已自动执行默认命令」打扰对话', () => {
    expect(CODE).toMatch(/msg\.autoRun && msg\.defaultCommand && w\.view === 'term'/);
  });
});
