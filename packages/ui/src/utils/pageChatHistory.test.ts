// 页面内对话「历史」纯逻辑的守门测试（P3-5）。
//
// 为什么必须真跑：这里每一条写错都是**静默错行为**，而且只在特定数据下才现形 ——
//   ① 站点取错来源（用标题里的 host 而不是落库的 source_meta）⇒ 用户改过名、或被 LLM
//      自动改过标题的会话在列表里"没有站点"，"只看本站"筛出来空空如也；
//   ② 坏 id / 坏 JSON 没兜住 ⇒ 历史列表整块渲染崩，且只有那一条脏数据的用户能复现；
//   ③ 本地面板提示（"已停止""执行期间新增了标签页"）混进蒸馏素材 ⇒ 用户存出来的技能里
//      多出一条莫名其妙的运维步骤（这个错误在技能里看起来完全合理，最难发现）。

import { describe, it, expect } from 'vitest';
import {
  distillMessagesOf, filterSessions, formatSessionTime, toSession, toSessions,
  type PageChatSession,
} from './pageChatHistory';

/** 服务端 `SELECT * FROM conversation` 的形态（蛇形字段） */
function row(p: Record<string, unknown> = {}) {
  return {
    id: 'c_1',
    title: '浏览器 · example.com',
    source: 'browser-page',
    source_meta_json: JSON.stringify({ url: 'https://example.com/a?x=1', host: 'example.com', scope: 'page' }),
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_600_000,
    ...p,
  };
}

function session(p: Partial<PageChatSession> = {}): PageChatSession {
  return { id: 'c_x', title: 't', url: '', host: '', scope: '', createdAt: 0, updatedAt: 0, ...p };
}

describe('toSession / toSessions：会话行 → 展示行', () => {
  it('取出落库时的 url / host / scope（不是从标题里猜）', () => {
    const s = toSession(row({ title: '被用户改过的名字' }));
    expect(s.host).toBe('example.com');
    expect(s.url).toBe('https://example.com/a?x=1');
    expect(s.scope).toBe('page');
    expect(s.createdAt).toBe(1_700_000_000_000);
    expect(s.updatedAt).toBe(1_700_000_600_000);
  });

  it('没有 source_meta 时站点为空（不抛）；只有 url 时从 url 兜底', () => {
    expect(toSession(row({ source_meta_json: null })).host).toBe('');
    expect(toSession(row({ source_meta_json: '{坏 JSON' })).host).toBe('');
    expect(toSession(row({ source_meta_json: JSON.stringify({ url: 'https://a.b.c/p' }) })).host).toBe('a.b.c');
  });

  it('updated_at 缺失时回落 created_at（老数据不显示 1970）', () => {
    expect(toSession(row({ updated_at: undefined })).updatedAt).toBe(1_700_000_000_000);
  });

  it('丢掉没有 id 的坏行；非数组一律空列表', () => {
    expect(toSessions([row(), row({ id: '' }), null]).map((s) => s.id)).toEqual(['c_1']);
    expect(toSessions(null)).toEqual([]);
    expect(toSessions({ data: [] })).toEqual([]);
  });
});

describe('filterSessions：搜索 + 只看本站', () => {
  const list = [
    session({ id: 'a', title: '提取本页表格', host: 'taobao.com' }),
    session({ id: 'b', title: '浏览器 · example.com', host: 'example.com' }),
    session({ id: 'c', title: 'TAOBAO 比价', host: 'jd.com' }),
  ];

  it('关键词同时匹配标题与站点，大小写不敏感', () => {
    expect(filterSessions(list, '表格').map((s) => s.id)).toEqual(['a']);
    expect(filterSessions(list, 'TAOBAO').map((s) => s.id)).toEqual(['a', 'c']);
    expect(filterSessions(list, 'example.com').map((s) => s.id)).toEqual(['b']);
  });

  it('空关键词返回全部；只看本站按 host 精确过滤', () => {
    expect(filterSessions(list).length).toBe(3);
    expect(filterSessions(list, '', 'taobao.com').map((s) => s.id)).toEqual(['a']);
    // ★ 关键词与本站过滤是"与"关系：命中标题但不在本站 ⇒ 仍然筛掉
    //   （注意别拿 'b' 当关键词 —— 'taobao.com' 里本来就有字母 b，会命中站点而非标题）
    expect(filterSessions(list, '比价', 'taobao.com')).toEqual([]);
  });
});

describe('distillMessagesOf：蒸馏素材只留真正的对话', () => {
  it('丢掉面板本地提示（error 气泡）与空白消息，并去掉首尾空白', () => {
    const out = distillMessagesOf([
      { id: '1', role: 'user', content: ' 这页第一条热搜是什么 ', createdAt: 1 },
      { id: '2', role: 'assistant', content: '答案', createdAt: 2 },
      { id: '3', role: 'assistant', content: '已停止本次执行。', createdAt: 3, error: true },
      { id: '4', role: 'assistant', content: '   ', createdAt: 4 },
    ]);
    expect(out).toEqual([
      { role: 'user', content: '这页第一条热搜是什么' },
      { role: 'assistant', content: '答案' },
    ]);
  });

  it('空数组 / undefined 都安全', () => {
    expect(distillMessagesOf([])).toEqual([]);
    expect(distillMessagesOf(undefined as any)).toEqual([]);
  });
});

describe('formatSessionTime：列表里那行小字', () => {
  it('0 返回空串；同年不显示年份；跨年显示年份', () => {
    expect(formatSessionTime(0)).toBe('');
    const now = new Date('2026-10-16T12:00:00').getTime();
    const sameYear = new Date('2026-03-05T09:07:00').getTime();
    const otherYear = new Date('2025-03-05T09:07:00').getTime();
    expect(formatSessionTime(sameYear, now)).toBe('3月5日 09:07');
    expect(formatSessionTime(otherYear, now)).toBe('2025年3月5日');
  });
});
