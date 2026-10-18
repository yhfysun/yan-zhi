/**
 * 分级 microcompact（capStaleToolResults 三档）—— 真跑验证（2026-10-18）。
 *
 * ★ 对齐 Claude Code microcompact 的「越老越狠」：保留窗口内原文、次新区 8KB、
 *   陈旧区 2KB。开发长任务里几十条陈旧 file_read/stdout 是上下文膨胀的头号来源。
 *
 * ★ 变异验证：把 `staleMaxChars` 分支去掉（恒用 maxChars）⇒ 用例 ② 打红；
 *   把 `i >= boundary` 原文保护去掉 ⇒ 用例 ① 打红。
 */
import { describe, it, expect } from 'vitest';
import {
  capStaleToolResults,
  COMPRESS_TOOL_CAP_CHARS,
  COMPRESS_STALE_TOOL_CAP_CHARS,
} from './window.js';

/** 单条超长工具结果 */
function toolMsg(id: string, chars: number): any {
  return { id, conversationId: 'c', role: 'tool', content: 'x'.repeat(chars), createdAt: 0 };
}
function userMsg(id: string): any {
  return { id, conversationId: 'c', role: 'user', content: `msg-${id}`, createdAt: 0 };
}

describe('capStaleToolResults 三档分级（对齐 Claude Code microcompact）', () => {
  it('★ 三档边界：保留窗口原文 / 次新 8KB / 陈旧 2KB', () => {
    // 30 条 20KB 的 tool 结果，keepRecent=6
    //   → [0,12) 陈旧区(2KB)、[12,24) 次新区(8KB)、[24,30) 保留窗口(原文)
    const messages: any[] = [];
    for (let i = 0; i < 30; i++) messages.push(toolMsg(`t${i}`, 20 * 1024));

    const out = capStaleToolResults(messages, 6) as any[];

    // 结构零破坏：条数与 id 顺序不变（tool 配对不可能被破坏的前提）
    expect(out.map((m) => m.id)).toEqual(messages.map((m) => m.id));

    // ① 保留窗口：原文不动
    for (let i = 24; i < 30; i++) {
      expect(out[i].content.length, `保留窗口 t${i} 必须原文`).toBe(20 * 1024);
    }
    // ② 次新区：8KB（capLongText 产出恰好 ≈ max）
    for (let i = 12; i < 24; i++) {
      expect(out[i].content.length, `次新区 t${i} 应裁到 8KB 档`)
        .toBeLessThanOrEqual(COMPRESS_TOOL_CAP_CHARS);
      expect(out[i].content.length).toBeGreaterThan(COMPRESS_STALE_TOOL_CAP_CHARS);
    }
    // ③ 陈旧区：2KB —— 这一级是本次的收益所在（此前恒 8KB）
    for (let i = 0; i < 12; i++) {
      expect(out[i].content.length, `陈旧区 t${i} 应裁到 2KB 档`)
        .toBeLessThanOrEqual(COMPRESS_STALE_TOOL_CAP_CHARS);
    }
    // 裁剪标记在（模型仍知道"结果被截断了"）
    expect(out[0].content).toContain('已压缩：原文');
  });

  it('★ 非 tool 消息（user/assistant）永不裁剪', () => {
    const messages = [userMsg('u0'), toolMsg('t0', 30 * 1024), userMsg('u1')];
    const out = capStaleToolResults(messages, 0) as any[]; // keepRecent=0 ⇒ 全部进陈旧区
    expect(out[0].content).toBe('msg-u0');
    expect(out[2].content).toBe('msg-u1');
    expect(out[1].content.length).toBeLessThanOrEqual(COMPRESS_STALE_TOOL_CAP_CHARS);
  });

  it('★ 幂等：已裁过的结果再跑一遍是 no-op（返回原引用）', () => {
    const messages: any[] = [];
    for (let i = 0; i < 30; i++) messages.push(toolMsg(`t${i}`, 20 * 1024));
    const once = capStaleToolResults(messages, 6);
    const twice = capStaleToolResults(once, 6);
    expect(twice).toBe(once); // 无变化返回原引用
  });

  it('★ token 收益：显著优于旧"单档 8KB"口径（长任务不膨胀的主因）', () => {
    const messages: any[] = [];
    for (let i = 0; i < 30; i++) messages.push(toolMsg(`t${i}`, 20 * 1024));
    const out = capStaleToolResults(messages, 6);
    const total = (arr: any[]) => arr.reduce((s, m) => s + m.content.length, 0);
    // 旧口径 = 保留窗口原文 + 其余一律 8KB
    const oldTier = 6 * 20 * 1024 + 24 * COMPRESS_TOOL_CAP_CHARS;
    expect(total(out), '分级后必须明显小于旧单档口径（12 条陈旧结果 8KB→2KB）')
      .toBeLessThan(oldTier * 0.85);
  });
});
