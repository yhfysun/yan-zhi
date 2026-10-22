/**
 * SSE 重连游标：必须按事件 `seq` 重放，不能用数组下标（2026-10-15 修，根因）。
 *
 * ★★★ 现场（live DB 侧证 + 代码走读）：`subscribe` 此前是
 *   `for (let i = since; i < task.events.length; i++)` —— `since` 当**数组下标**用；
 *   而前端传的 `taskEventCounts` 是"**累计收到多少条**"。两者只在"缓冲从未被裁剪"时相等。
 *
 *   `emit` 在 `task.events.length > MAX_EVENTS(10000)` 时会 `splice(0, 超出量)` 丢最旧事件，
 *   而 `chunk` 事件是**每个流式增量一条** —— 长任务必然越过 10000。一旦裁剪：
 *     · 轻微：重放窗口整体错位（漏/重若干事件）；
 *     · 严重：客户端游标（条数）> 缓冲长度 → 循环**一次都不执行** → 断连期间事件**一条不补**。
 *       若漏掉的是一条 `tool:execute` → 工具永不执行 → 无人 POST 结果 → 该步一直等到超时
 *       （用户看到的"卡住不动 / 任务跑不完"）。
 *
 * 本测试用**纯函数 `eventsSince`** 直接构造"已裁剪的缓冲 + 客户端游标"，钉住：
 *   ① 正常（未裁剪）语义按 seq 增量重放；
 *   ② 裁剪后仍能正确续传（这是本次修复的核心）；
 *   ③ 旧实现会返回空集的那种情形，新实现必须非空（防回退）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventsSince, dropResolvedToolExecutes } from '../src/llm-task-manager.js';

/** 造一个「已被 emit 裁剪过」的事件缓冲：seq 从 from 到 to 连续。 */
function trimmedBuffer(from: number, to: number): Array<{ type: string; seq: number }> {
  const out: Array<{ type: string; seq: number }> = [];
  for (let s = from; s <= to; s++) out.push({ type: 'chunk', seq: s });
  return out;
}

describe('SSE 重连游标：按 seq 重放（2026-10-15）', () => {
  it('since=0 → 全量重放（与旧行为一致，兼容现有全部调用方）', () => {
    const buf = trimmedBuffer(1, 50);
    expect(eventsSince(buf as any, 0).length).toBe(50);
  });

  it('未裁剪时：只重放 seq > since 的事件', () => {
    const buf = trimmedBuffer(1, 100);
    const got = eventsSince(buf as any, 90);
    expect(got.length).toBe(10);
    expect(got[0].seq).toBe(91);
    expect(got[got.length - 1].seq).toBe(100);
  });

  it('★★ 裁剪后仍能正确续传（本次修复的核心）', () => {
    // 缓冲已被裁剪：只剩 seq 9001..10000；客户端游标 = 它收到的最后一个 seq 9500
    const buf = trimmedBuffer(9001, 10000);
    const got = eventsSince(buf as any, 9500);
    expect(got.length).toBe(500);
    expect(got[0].seq).toBe(9501);
    expect(got[got.length - 1].seq).toBe(10000);
  });

  it('★★ 防回退：旧「下标游标」会返回空集的那种情形，新实现必须非空', () => {
    // 旧实现：since(9500) >= events.length(1000) → 循环不执行 → 0 条（= 丢事件 → 卡住）
    // 新实现：seq 语义 → 拿到 9501..10000 共 500 条
    const buf = trimmedBuffer(9001, 10000);
    const oldImplementationCount = Math.max(0, buf.length - 9500); // 旧语义下就是 0
    expect(oldImplementationCount, '前提：旧语义在此情形确实返回空集').toBe(0);
    expect(eventsSince(buf as any, 9500).length).toBeGreaterThan(0);
  });

  it('客户端游标已是最新 → 不重放任何东西（幂等，不重复执行工具）', () => {
    const buf = trimmedBuffer(9001, 10000);
    expect(eventsSince(buf as any, 10000).length).toBe(0);
    expect(eventsSince(buf as any, 99999).length).toBe(0);
  });

  it('非法/负数游标按 0 处理（全量重放，绝不静默丢帧）', () => {
    const buf = trimmedBuffer(1, 10);
    expect(eventsSince(buf as any, -5).length).toBe(10);
    expect(eventsSince(buf as any, NaN).length).toBe(10);
  });

  it('缺失 seq 的事件按 seq=0：since=0 时保留，since>0 时跳过（防御性）', () => {
    const buf = [{ type: 'x' }, { type: 'y', seq: 2 }] as any;
    expect(eventsSince(buf, 0).length).toBe(2);
    expect(eventsSince(buf, 1).length).toBe(1);
  });

  it('★ subscribe 必须真的走 eventsSince（纯函数不能被架空）', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');
    const at = src.indexOf('export function subscribe(');
    const body = src.slice(at, at + 400);
    expect(body, 'subscribe 未使用 eventsSince —— 判据可能又被写回下标语义').toMatch(/eventsSince\(\s*task\.events\s*,\s*since\s*\)/);
    expect(body, 'subscribe 里不应再出现按下标迭代的重放').not.toMatch(/for \(let i = since;/);
  });
});

describe('重放去僵尸弹窗：已答过的 tool:execute 不再重放（2026-10-21）', () => {
  const ev = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({ seq, type, ...extra }) as any;

  it('pending 里的调用保留，已回收的剔除', () => {
    const buf = [
      ev(1, 'chunk'),
      ev(2, 'tool:execute', { callId: 'call_answered', toolName: 'confirm_user' }),
      ev(3, 'tool:result', { callId: 'call_answered' }),
      ev(4, 'tool:execute', { callId: 'call_waiting', toolName: 'ask_user' }),
    ];
    const got = dropResolvedToolExecutes(buf, (id) => id === 'call_waiting');
    expect(got.map((e: any) => e.seq)).toEqual([1, 3, 4]);
  });

  it('非 tool:execute 事件一律保留（正文与工具结果不能丢）', () => {
    const buf = [ev(1, 'chunk'), ev(2, 'tool:result', { callId: 'x' }), ev(3, 'message:updated')];
    expect(dropResolvedToolExecutes(buf, () => false).length).toBe(3);
  });

  it('缺 callId 的 tool:execute 保留（防御：判据不足时不擅自丢弃）', () => {
    const buf = [ev(1, 'tool:execute', { toolName: 'x' })];
    expect(dropResolvedToolExecutes(buf, () => false).length).toBe(1);
  });

  it('★ subscribe 必须真的走 dropResolvedToolExecutes（包装不能被绕开）', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');
    const at = src.indexOf('export function subscribe(');
    const body = src.slice(at, at + 400);
    expect(body, 'subscribe 重放未过滤已回收的 tool:execute —— 复活成僵尸向导').toMatch(
      /dropResolvedToolExecutes\(\s*eventsSince\(/,
    );
  });
});