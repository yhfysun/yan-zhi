/**
 * 上下文压缩「覆盖范围」契约测试（2026-10-03）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 守护的根因（实测）：
 *   写侧 `coveredIds` 曾只含「中间被摘要段」，把 keepFirst 头部排除在外（每轮原文重发）
 *   → 覆盖段从 idx=keepFirst 起；读侧按「从 idx 0 起的前缀」校验 → 第 0 条即 mismatch
 *   → 摘要每轮判废、每步全量重压（单会话实测 111 条摘要、每步 25s+）。
 *
 * 统一契约（本测试守护）：**覆盖段恒为「从会话首条起的连续前缀」**，
 * 写侧 `coveredIdsForCompression` 产出、读侧 `isCoveredPrefix` 校验，二者共用同一语义——
 * 一旦有人再让覆盖段跳过头部，第 ① 组用例立刻变红。
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import type { Message } from '@yan-zhi/shared';
import {
  coveredIdsForCompression,
  isCoveredPrefix,
  isIdPrefix,
  isSyntheticMessageId,
  SYNTHETIC_MESSAGE_IDS,
  ContextWindow,
} from './window';

/** 造一条最小消息（测试只关心 id/role，其余字段用不到） */
function msg(id: string, role: Message['role'] = 'user'): Message {
  return { id, conversationId: 'c1', role, content: 'x'.repeat(50), createdAt: 0 } as Message;
}

/** 造一段会话：m0..m{n-1}，偶数 user、奇数 assistant */
function history(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => msg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant'));
}

describe('合成消息 id 单一清单', () => {
  it('core 是唯一定义处，且覆盖 sys / summary / __summary__', () => {
    expect(SYNTHETIC_MESSAGE_IDS.has('sys')).toBe(true);
    expect(SYNTHETIC_MESSAGE_IDS.has('summary')).toBe(true);
    expect(SYNTHETIC_MESSAGE_IDS.has('__summary__')).toBe(true);
    expect(isSyntheticMessageId('summary')).toBe(true);
    expect(isSyntheticMessageId('msg_abc')).toBe(false);
  });
});

describe('写侧：coveredIdsForCompression 从会话首条起连续产出', () => {
  it('① 覆盖段必须从首条（m0）开始（若跳过头部则本断言变红）', () => {
    const all = history(10);
    // 新语义：头部 hEnd=2 也并入被摘要段 → 被摘要段 = m0..m5
    const toCompress = all.slice(0, 6);
    const covered = coveredIdsForCompression(toCompress);

    expect(covered[0]).toBe('m0'); // ← 旧实现（只传 m2..m5）会得到 'm2'，此处即红
    expect(covered).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
    expect(isCoveredPrefix(covered, all.map((m) => m.id))).toBe(true);
  });

  it('② 剔除合成消息 id（summary / __summary__ / sys 混入会整段失效）', () => {
    const consumed = [msg('m0'), msg('summary', 'system'), msg('m1'), msg('__summary__', 'system'), msg('sys', 'system'), msg('m2')];
    expect(coveredIdsForCompression(consumed)).toEqual(['m0', 'm1', 'm2']);
  });

  it('③ 顺序原样保留（读侧依赖连续前缀）', () => {
    expect(coveredIdsForCompression([msg('a'), msg('b'), msg('c')])).toEqual(['a', 'b', 'c']);
  });

  it('④ 空 id 被丢弃', () => {
    const consumed = [{ ...msg(''), id: undefined } as any, msg('m1')];
    expect(coveredIdsForCompression(consumed)).toEqual(['m1']);
  });
});

describe('读侧：isCoveredPrefix 严格从 idx=0 起逐项比对', () => {
  it('覆盖段是消息列表前缀 → 有效', () => {
    expect(isCoveredPrefix(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });
  it('覆盖段与列表相同 → 有效', () => {
    expect(isCoveredPrefix(['a', 'b'], ['a', 'b'])).toBe(true);
  });
  it('从 idx=1 起（旧 bug 形态）→ 无效', () => {
    expect(isCoveredPrefix(['b', 'c'], ['a', 'b', 'c'])).toBe(false);
  });
  it('空覆盖 → 无效', () => {
    expect(isCoveredPrefix([], ['a', 'b'])).toBe(false);
  });
  it('覆盖比历史还长 → 无效', () => {
    expect(isCoveredPrefix(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });
  it('列表为空 → 无效', () => {
    expect(isCoveredPrefix(['a'], [])).toBe(false);
  });
});

describe('isIdPrefix：前缀语义的唯一实现', () => {
  it.each([
    [['a'], ['a', 'b'], true],
    [['a', 'b'], ['a', 'b'], true],
    [['a', 'b'], ['a'], false],
    [['b'], ['a', 'b'], false],
    [[], ['a'], true],
    [['a'], [], false],
  ])('%j 是否为 %j 的前缀 → %s', (prev, cur, expected) => {
    expect(isIdPrefix(prev as string[], cur as string[])).toBe(expected);
  });
});

describe('ContextWindow.compress 真实链路：写读闭环', () => {
  it('压缩后 onCompressed.coveredIds 从首条起连续，且能被读侧前缀校验命中', async () => {
    const all = history(60);
    // 触发阈值调小，强制压缩；无摘要模型 → 走 fallback（不影响 coveredIds 断言）
    const cw = ContextWindow.forBudget(200, 6, 2);
    let captured: string[] = [];
    const out = await cw.compress(all, {
      onCompressed: (info) => { captured = info.coveredIds; },
      summaryTimeoutMs: 1, // 立刻超时 → fallback，避免真实 LLM
    });

    // ① 覆盖段从会话首条起、连续
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toBe('m0');
    expect(isCoveredPrefix(captured, all.map((m) => m.id))).toBe(true);

    // ② 返回的消息里含一条 summary 合成消息 + 保留窗口
    expect(out.some((m) => m.id === 'summary')).toBe(true);
    // ③ 覆盖段之外的（保留窗口）应仍在 out 里（以 id 计）
    const keptIds = out.map((m) => m.id).filter((id) => id !== 'summary');
    expect(keptIds.length).toBeGreaterThan(0);
    // ④ 读侧下一步取增量 = all.slice(covered.length)，不应与覆盖段重叠
    const fresh = all.slice(captured.length);
    expect(fresh.every((m) => !captured.includes(m.id))).toBe(true);
  });

  it('keepFirst>0 不改变「覆盖段从 0 起」这一契约', async () => {
    const all = history(60);
    for (const kf of [0, 2, 4]) {
      const cw = ContextWindow.forBudget(200, 6, kf);
      let captured: string[] = [];
      await cw.compress(all, {
        onCompressed: (info) => { captured = info.coveredIds; },
        summaryTimeoutMs: 1,
      });
      expect(captured[0], `keepFirst=${kf}`).toBe('m0');
      expect(isCoveredPrefix(captured, all.map((m) => m.id)), `keepFirst=${kf}`).toBe(true);
    }
  });
});

describe('写读闭环：连续多步压缩，摘要可被复用', () => {
  it('第 2 步的前缀比对必须命中第 1 步写下的覆盖段（旧 bug 下为 false）', () => {
    const step1All = history(10);
    const step1Covered = coveredIdsForCompression(step1All.slice(0, 6)); // m0..m5
    const step2All = history(12);
    expect(isCoveredPrefix(step1Covered, step2All.map((m) => m.id))).toBe(true);
    expect(step2All.slice(step1Covered.length).map((m) => m.id)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11']);
  });

  it('跨步合并（旧覆盖段 + 本段覆盖）后仍是连续前缀', () => {
    const all = history(16);
    const prevCovered = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'];
    const step2Covered = coveredIdsForCompression(all.slice(0, 10)); // m0..m9
    const merged = [...prevCovered, ...step2Covered.filter((x) => !prevCovered.includes(x))];
    expect(merged).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
    expect(isCoveredPrefix(merged, all.map((m) => m.id))).toBe(true);
  });
});