/**
 * 消息分页接口守门测试（2026-10-11，2026-10-24 改口径）。
 *
 * 背景（10-11）：会话 f0a901e3 实测 403 条消息 / 122,079 字符全量返回，
 *   是「任务一运行页面就卡死」的主链路之一（渲染主线程被大列表 + 每帧全量
 *   重建拖死，IPC 事件迟到 34 秒而超时窗口只有 8 秒）。分页是根治的第一环。
 *
 * 背景（10-24，用户实报「怎么还是拉取所有消息？工具执行详情不能算到页面显示消息里面」）：
 *   分页的**计数单位**错了 —— `limit` 数原始行，被海量子智能体/工具执行明细占满，
 *   首屏一条 user 都没有（会话 d2f1c43a：2098 行里 1862 行是明细）。
 *   ⇒ 计数改成「页面显示消息」（user 气泡 + 无工具调用的 assistant），
 *     返回仍含中间步骤/工具回执（工具卡片要用），但**不下发子智能体明细**。
 *
 * ★ 手法：读源码断言（与 conversation-delete-cleanup 同一套路）。
 *   行为级不变量见 conversation-messages-pagination.integration.test.ts。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..', 'src');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');

/** 剥掉行注释与块注释（断源码前必做：注释撞词会假红/假绿） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('GET /:id/messages · 分页协议（防大会话全量拉取复发）', () => {
  const CONV = stripComments(read('routes/conversations.ts'));
  const start = CONV.indexOf("router.get('/:id/messages'");
  const nextRouter = CONV.indexOf('\nrouter.', start + 1);
  const body = CONV.slice(start, nextRouter > 0 ? nextRouter : undefined);

  it('无 limit 参数时保持全量旧行为（向后兼容）', () => {
    expect(body).toMatch(/limitRaw === undefined/);
    // 全量分支也必须带确定性排序（同毫秒消息次序稳定）
    expect(body).toMatch(/ORDER BY created_at ASC, id ASC/);
  });

  it('limit 校验存在且有上界（防 limit=1e9 变相全量）', () => {
    expect(body).toMatch(/limit > 500/);
    expect(body).toMatch(/Number\.isInteger\(limit\)/);
  });

  it('★ 计数单位是「页面显示消息」：user + 无 toolCalls 的 assistant', () => {
    // 口径常量在模块级（路由体只引用 DISPLAY_MESSAGE_SQL）
    expect(CONV).toMatch(/const DISPLAY_MESSAGE_SQL = `\$\{TOP_LEVEL_SQL\} AND \(role = 'user' OR \(role = 'assistant'/);
    expect(CONV).toMatch(/tool_calls_json IS NULL OR tool_calls_json = '' OR tool_calls_json = '\[\]'/);
    expect(body).toMatch(/DISPLAY_MESSAGE_SQL/); // 计数/取行都走它
  });

  it('★ 子智能体明细不下发：顶层口径（parent_tool_call_id 为空）', () => {
    expect(CONV).toMatch(/const TOP_LEVEL_SQL = "\(parent_tool_call_id IS NULL OR parent_tool_call_id = ''\)"/);
    expect(body).toMatch(/LIMIT 1 OFFSET \?/); // 窗口下界按"显示消息"取
  });

  it('向前翻页游标必须是 (created_at, id) 组合键（单时间戳游标同毫秒会漏消息）', () => {
    expect(body).toMatch(/created_at < \? OR \(created_at = \? AND id < \?\)/);
    expect(body).toMatch(/beforeId/);
    // before 与 beforeId 必须成对（防半游标）
    expect(body).toMatch(/before 与 beforeId 必须成对提供/);
  });

  it('hasMore 按"还有更早的显示消息"判定（明细行不充数）', () => {
    expect(body).toMatch(/SELECT 1 FROM message WHERE conversation_id = \? AND \$\{DISPLAY_MESSAGE_SQL\}/);
  });

  it('★ 首屏不夹带执行明细：返回行只取显示消息，过程规模单独下发（roundMeta）', () => {
    // 返回内容用 DISPLAY_MESSAGE_SQL（不是 TOP_LEVEL_SQL）—— 中间步骤/工具回执只在展开时拉
    expect(body).toMatch(/const where: string\[\] = \['conversation_id = \?', DISPLAY_MESSAGE_SQL\]/);
    expect(body).toMatch(/roundMeta/);
  });

  it('★ 按需接口在位：单轮执行详情 / 单个子智能体内部步骤', () => {
    const ROUND = CONV.indexOf("router.get('/:id/messages/round/:userMessageId'");
    expect(ROUND).toBeGreaterThan(0);
    const roundBody = CONV.slice(ROUND, CONV.indexOf("router.get('/:id/messages/sub-agent/"));
    expect(roundBody).toMatch(/role = 'user'/);
    expect(roundBody).toMatch(/\$\{TOP_LEVEL_SQL\}/);
    expect(CONV).toMatch(/router\.get\('\/:id\/messages\/sub-agent\/:toolCallId'/);
    expect(CONV).toMatch(/parent_tool_call_id = \?/);
  });

  it('响应携带 hasMore 与 oldestCursor（前端翻页依赖）', () => {
    expect(body).toMatch(/hasMore/);
    expect(body).toMatch(/oldestCursor/);
    expect(body).toMatch(/createdAt: oldest\.created_at/);
  });
});

describe('分页索引（防全表扫描回归）', () => {
  it('message 表存在 (conversation_id, created_at, id) 组合索引', () => {
    expect(stripComments(read('db.ts'))).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_message_conv_created ON message\(conversation_id, created_at, id\)/,
    );
  });
});
