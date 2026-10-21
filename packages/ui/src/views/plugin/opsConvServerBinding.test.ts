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
    expect(CODE).toMatch(/<TaskListSection :space-id="null" :on-open="onTaskRowOpen" \/>/);
    expect(CODE).toContain('openConvFromTaskList');
  });

  it('打开会话时按绑定连接找/建窗口，而不是只切全局 currentConvId', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvFromTaskList'), CODE.indexOf('async function openConvFromTaskList') + 2000);
    expect(fn).toMatch(/conv\.opsConnectionId/);
    expect(fn).toMatch(/windows\.value\.find\(\(w\) => w\.conversationId === convId\)/);
    expect(fn).toMatch(/connectionId === conn\.id/);
  });

  it('连接已被删除时明确提示，不静默开空窗口', () => {
    const fn = CODE.slice(CODE.indexOf('async function openConvFromTaskList'), CODE.indexOf('async function openConvFromTaskList') + 2000);
    expect(fn).toMatch(/绑定的服务器已删除/);
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
    expect(fn).toMatch(/toolCalls: \[\{ id: `\$\{roundMsgId\}-c`, name: 'terminal_exec'/);
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
