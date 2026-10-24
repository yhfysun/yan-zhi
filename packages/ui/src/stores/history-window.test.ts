/**
 * 历史窗口驻留不变量行为测试（2026-10-24）
 *
 * 用户实报：「跑着跑着历史都没了？用户发出的任务也没了？」
 * 实证（会话 d2f1c43a + 主进程日志）：
 *   · 2098 行里 1862 行是子智能体/工具执行明细，页面上真正显示的消息只有 13 条；
 *   · 看门狗两次自动重载（15:18 / 15:21）；
 *   · 驻留裁剪按行数切头部，把"用户刚发的任务"一起切走，且游标不跟着走。
 *
 * 分页口径已在服务端按「页面显示消息」修正（见 conversation-messages-pagination 测试），
 * 这里只钉客户端的两条驻留判据（纯函数，真跑行为，不做源码 grep）：
 *   ① 裁剪不能切掉最新一轮的轮头；
 *   ② 裁剪后翻页游标必须对齐到新的头（否则被裁掉的那段永远取不回来）。
 */
import { describe, it, expect } from 'vitest';
import type { Role } from '@yan-zhi/shared';
import {
  trimStartIndex,
  syncPagingAfterTrim,
  type PagingStateLike,
} from './history-window';

const M = (role: Role, over: Record<string, unknown> = {}) => ({ id: `${role}-${Math.random().toString(36).slice(2, 8)}`, role, ...over });

/** 造 n 条子智能体消息（parentToolCallId 非空） */
const subs = (n: number, role: Role = 'assistant') => Array.from({ length: n }, (_, i) => M(role, { parentToolCallId: 'call_x', id: `s${i}` }));

describe('trimStartIndex：裁剪必须保留最新一轮', () => {
  it('不超上限 → 一条都不裁', () => {
    const msgs = [M('user'), ...subs(10)];
    expect(trimStartIndex(msgs, 600)).toBe(0);
  });

  it('没有 user 的长数组 → 纯按条数裁（没有轮头可保）', () => {
    const msgs = subs(1000);
    expect(trimStartIndex(msgs, 600)).toBe(400);
  });

  it('★ 长任务：最新一轮的轮头在很早的位置 → 不能切到它之后', () => {
    // 复刻实况：user 在第 180 条，之后 1835 条子消息
    const msgs = [M('user', { id: 'u0' }), ...subs(180), M('user', { id: 'u1' }), ...subs(1835)];
    const from = trimStartIndex(msgs, 600);
    expect(from).toBe(181);                       // = 最新 user 的下标，不是 2017-600
    expect(msgs[from].role).toBe('user');
    expect((msgs[from] as any).id).toBe('u1');
  });

  it('轮头很靠后（多轮会话）→ 仍按条数上限裁，且最新一轮完整保留', () => {
    const msgs = [...subs(900), M('user', { id: 'uLast' }), ...subs(50)];
    const from = trimStartIndex(msgs, 200);
    expect(from).toBe(751);                        // 951 - 200：按条数裁，轮头（900）仍在窗口内
    const kept = msgs.slice(from);
    expect(kept.some((m) => m.role === 'user' && (m as any).id === 'uLast')).toBe(true);
  });
});

describe('syncPagingAfterTrim：裁剪后游标对齐到新头', () => {
  const paging = (): PagingStateLike => ({ hasMore: false, loading: false, cursor: { createdAt: 1, id: 'old' } });

  it('裁掉了东西 → 游标改成新头，且 hasMore 置真', () => {
    const p = paging();
    syncPagingAfterTrim(p, 12, { createdAt: 12345, id: 'newhead' } as any);
    expect(p.cursor).toEqual({ createdAt: 12345, id: 'newhead' });
    expect(p.hasMore).toBe(true);
  });

  it('没裁（dropped=0）→ 游标保持原样，不能平白多出一页', () => {
    const p = paging();
    syncPagingAfterTrim(p, 0, { createdAt: 9, id: 'x' } as any);
    expect(p.cursor).toEqual({ createdAt: 1, id: 'old' });
    expect(p.hasMore).toBe(false);
  });

  it('新头缺失 → 不动游标（防脏下标）', () => {
    const p = paging();
    syncPagingAfterTrim(p, 5, undefined);
    expect(p.cursor).toEqual({ createdAt: 1, id: 'old' });
  });
});
