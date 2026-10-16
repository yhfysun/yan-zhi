// 会话生命周期（归档 / 回收站）**接线守门**测试 —— 防"改了一半"回归。
//
// ★ 为什么需要它（行为级覆盖见 apps/server/test/conversation-lifecycle.test.ts，
//   那里证明"跑起来是对的"；这里证明"每一处接线都还在"）：
//   本次改动横跨 **两个 schema 定义、一个 shared 类型、一个 store、三处 UI、一条后端收口**。
//   历史上同类事故的形态是：改了 A 处忘了 B 处，两边**都不报错**，只是行为静默不一致：
//     · core 的 conversation 建表漏加列 → 本地模式一查就 no such column；
//     · 侧栏过滤了、工作台没过滤 → 「侧栏没有、工作台还在」的灵异列表；
//     · rowToConv 只认蛇形列名 → 走驼峰通道的会话 archivedAt 恒为 undefined，
//       于是归档会话在主列表里"复活"（且不报错）。
//   这些缺陷只有逐处断言才抓得住。
//
// ★ 手法同 fileWriteAndPreviewFix.test.ts：读源码 + 剥注释后断言。
//   变异验证（2026-10-16 实跑）：把 filteredConversations 的 `!c.archivedAt && !c.deletedAt`
//   删掉 → 本文件 3 条断言变红；把 rowToConv 的 archivedAt 映射删掉 → 1 条变红。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥注释（含行注释/块注释）——不断干净会被注释里的示例代码骗到 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const CORE_SCHEMA = strip(readRepo('packages/core/src/db/schema.ts'));
const SERVER_DB = strip(readRepo('apps/server/src/db.ts'));
const SHARED_TYPES = strip(readRepo('packages/shared/src/types/index.ts'));
const CHAT_STORE = strip(readRepo('packages/ui/src/stores/chat.ts'));
const USE_CHAT = strip(readRepo('packages/ui/src/composables/chat/useChat.ts'));
const SIDEBAR = strip(readRepo('packages/ui/src/components/chat/ChatSidebar.vue'));
const TASK_LIST = strip(readRepo('packages/ui/src/components/workbench/TaskListSection.vue'));
const CHAT_VIEW = strip(readRepo('packages/ui/src/views/Chat.vue'));
const INPUT_AREA = strip(readRepo('packages/ui/src/components/chat/ChatInputArea.vue'));
const CONV_ROUTES = strip(readRepo('apps/server/src/routes/conversations.ts'));
const TASK_MANAGER = strip(readRepo('apps/server/src/llm-task-manager.ts'));

const COLS = ['archived_at', 'deleted_at', 'last_activity_at'];

describe('数据层 · 两份 schema 必须同步（本项目最常漏的一处）', () => {
  it('core schema.ts 的迁移块为会话表补上三列（for 循环批量 ALTER 的写法）', () => {
    // 实现是 `for (const col of ['archived_at','deleted_at','last_activity_at'])` 一次性加三列，
    // 断言钉住「循环名单里必须有这三列」+「循环体确实执行 ALTER conversation」两件事。
    expect(CORE_SCHEMA).toMatch(/for \(const col of \['archived_at', 'deleted_at', 'last_activity_at'\]\)/);
    expect(CORE_SCHEMA).toMatch(/ALTER TABLE conversation ADD COLUMN \$\{col\} INTEGER/);
  });

  it('server db.ts 同样补上三列（只改一边 = 一边库有列一边没有）', () => {
    expect(SERVER_DB).toMatch(/for \(const col of \['archived_at', 'deleted_at', 'last_activity_at'\]\)/);
    expect(SERVER_DB).toMatch(/ALTER TABLE conversation ADD COLUMN \$\{col\} INTEGER/);
  });

  it('两边都建了生命周期复合索引（列表默认就按这两列过滤）', () => {
    expect(CORE_SCHEMA).toMatch(/idx_conversation_lifecycle/);
    expect(SERVER_DB).toMatch(/idx_conversation_lifecycle/);
  });

  it('shared 类型把三列暴露给前端（否则 UI 无从判断状态）', () => {
    expect(SHARED_TYPES).toMatch(/archivedAt\?:/);
    expect(SHARED_TYPES).toMatch(/deletedAt\?:/);
    expect(SHARED_TYPES).toMatch(/lastActivityAt\?:/);
  });
});

describe('store · 映射与生命周期口径', () => {
  it('rowToConv 映射三列，且同时认蛇形与驼峰（两种通道都会出现）', () => {
    expect(CHAT_STORE).toMatch(/archivedAt: r\.archived_at \?\? r\.archivedAt/);
    expect(CHAT_STORE).toMatch(/deletedAt: r\.deleted_at \?\? r\.deletedAt/);
    expect(CHAT_STORE).toMatch(/lastActivityAt: r\.last_activity_at \?\? r\.lastActivityAt/);
  });

  it('本地模式的生命周期 SQL 与后端 lifecycleClause 同口径', () => {
    // active 分支是关键：写错一个 IS NULL，归档会话就会在主列表里复活
    expect(CHAT_STORE).toMatch(/active: 'deleted_at IS NULL AND archived_at IS NULL'/);
    expect(CHAT_STORE).toMatch(/archived: 'deleted_at IS NULL AND archived_at IS NOT NULL'/);
    expect(CHAT_STORE).toMatch(/trashed: 'deleted_at IS NOT NULL'/);
  });

  it('删除是软删（UPDATE deleted_at）；只有 purgeConversation 允许真删（唯一出口）', () => {
    expect(CHAT_STORE).toMatch(/UPDATE conversation SET deleted_at = \?/);
    // 软删的两个入口（单删/批删）函数体内不许出现真删 —— 否则"删除"又变回不可恢复
    for (const fn of ['async function deleteConversation(', 'async function deleteConversations(']) {
      const start = CHAT_STORE.indexOf(fn);
      expect(start, `找不到 ${fn}`).toBeGreaterThan(-1);
      const body = CHAT_STORE.slice(start, start + 1200);
      expect(body, `${fn} 里出现了真删 —— 删除必须进回收站`).not.toMatch(/DELETE FROM conversation/i);
    }
    // 本地模式（桌面端无后端）的永久删除仍需要真删 —— 它必须住在 purgeConversation 里
    const purge = CHAT_STORE.indexOf('async function purgeConversation(');
    expect(CHAT_STORE.slice(purge, purge + 900)).toMatch(/DELETE FROM conversation/);
  });

  it('归档/回收站用独立拉取函数，不覆盖 store.conversations 主数组', () => {
    expect(CHAT_STORE).toMatch(/loadConversationsByScope/);
    // 该函数体内不允许出现 conversations.value = （那会把归档会话塞进主列表）
    const fn = CHAT_STORE.slice(CHAT_STORE.indexOf('async function loadConversationsByScope'));
    const end = fn.indexOf('\n  }');
    expect(fn.slice(0, end)).not.toMatch(/conversations\.value =/);
  });
});

describe('UI · 两处列表同口径 + 归档只读', () => {
  it('侧栏 filteredConversations 排除归档与已删除（前端第二道）', () => {
    expect(USE_CHAT).toMatch(/!c\.archivedAt && !c\.deletedAt/);
  });

  it('工作台 TaskListSection 同样排除（漏这处 = 侧栏没有、工作台还在）', () => {
    expect(TASK_LIST).toMatch(/!c\.archivedAt && !c\.deletedAt/);
  });

  it('侧栏有归档入口、已归档分组与回收站（三个消费点都要接线）', () => {
    expect(SIDEBAR).toMatch(/archiveConv\(conv, true\)/);
    expect(SIDEBAR).toMatch(/archivedConversations/);
    expect(SIDEBAR).toMatch(/trashedConversations/);
    expect(SIDEBAR).toMatch(/restoreConv\(conv\)/);
    expect(SIDEBAR).toMatch(/purgeConv\(conv\)/);
  });

  it('Chat 视图有归档只读横幅，输入区据此禁用', () => {
    expect(CHAT_VIEW).toMatch(/conv-archived-banner/);
    expect(CHAT_VIEW).toMatch(/unarchiveCurrent/);
    expect(INPUT_AREA).toMatch(/:disabled="currentConvArchived"/);
    expect(INPUT_AREA).toMatch(/该会话已归档（只读）/);
  });
});

describe('后端收口 · 两条 SQL 分支与任务入口', () => {
  it('列表路由两条 SQL 分支都带 lifecycle 过滤（历史上两条 SQL 各写一遍）', () => {
    const get = CONV_ROUTES.slice(CONV_ROUTES.indexOf("router.get('/'"));
    const body = get.slice(0, get.indexOf('\nrouter.'));
    const occurrences = body.match(/\$\{life\}/g) || [];
    expect(occurrences.length, '两条 SQL 分支都要拼上 lifecycle 过滤').toBe(2);
  });

  it('createTask 拦归档/回收站会话（覆盖前端 SSE / IM / 定时任务全部入口）', () => {
    expect(TASK_MANAGER).toMatch(/CONVERSATION_ARCHIVED/);
    expect(TASK_MANAGER).toMatch(/CONVERSATION_TRASHED/);
  });

  it('发消息接口对 user 角色拦归档会话，但不拦 assistant 回执', () => {
    const post = CONV_ROUTES.slice(CONV_ROUTES.indexOf("router.post('/:id/messages'"));
    const body = post.slice(0, post.indexOf('\nrouter.') > 0 ? post.indexOf('\nrouter.') : undefined);
    expect(body).toMatch(/CONVERSATION_ARCHIVED/);
    expect(body).toMatch(/role === 'user'/);
  });
});
