/**
 * 消息分页接口守门测试（2026-10-11）。
 *
 * 背景：会话 f0a901e3 实测 403 条消息 / 122,079 字符全量返回，
 *   是「任务一运行页面就卡死」的主链路之一（渲染主线程被大列表 + 每帧全量
 *   重建拖死，IPC 事件迟到 34 秒而超时窗口只有 8 秒）。分页是根治的第一环。
 *
 * ★ 手法：读源码断言（与 conversation-delete-cleanup 同一套路）。
 *   路由逻辑用 mock db 拉起 express 的集成收益不成正比，这里守的是
 *   「分页协议接线 + 游标组合键 + 索引」没被后人顺手删掉。
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

  it('向前翻页游标必须是 (created_at, id) 组合键（单时间戳游标同毫秒会漏消息）', () => {
    expect(body).toMatch(/created_at < \? OR \(created_at = \? AND id < \?\)/);
    expect(body).toMatch(/beforeId/);
    // before 与 beforeId 必须成对（防半游标）
    expect(body).toMatch(/before 与 beforeId 必须成对提供/);
  });

  it('取页用 DESC + 多取一条判 hasMore，返回前反转回 ASC（响应顺序与全量一致）', () => {
    expect(body).toMatch(/ORDER BY created_at DESC, id DESC LIMIT \?/);
    expect(body).toMatch(/const fetchLimit = limit \+ 1/);
    expect(body).toMatch(/const hasMore = rows\.length > limit/);
    expect(body).toMatch(/rows\.reverse\(\)/);
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
