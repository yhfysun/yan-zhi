// 上下文估算的回归测试 —— 守一个**系统性低估 bug**（2026-09-29 发现）。
//
// ★ 被修的缺陷：`estimateTokens` 旧实现在非中文部分按 `\s+` 切词、每词只算 0.25 token。
//   代码 / JSON / 日志 / base64 / 长路径**几乎不含空格** → 整段被当成"1 个词" →
//   实测 `'x'.repeat(20000)` 只算 **1 token**（真实约 5000）→ 低估约 **5000 倍**。
//
// ★ 为什么这是"压缩永不触发"的真正主因（比阈值口径错误更根本）：
//   压缩判据 `tokenCount(messages) > maxTokens` 用的就是这个函数；长任务里绝大部分内容
//   是中文对话 + 英文代码/工具输出，而其中**代码/工具输出几乎全是无空格长串** →
//   估算值远低于真实值 → 阈值永远达不到 → 上下文无限膨胀 → 上游 400。
//
// ★ 手法：断言真实量级（"至少多少 token"），而不是精确值 —— 估算函数本就允许误差，
//   但**低估一个数量级**是不可接受的。
import { describe, expect, it } from 'vitest';
import { estimateTokens } from '@yan-zhi/shared';

describe('estimateTokens：不得对无空格文本严重低估', () => {
  it('★ 20000 字符无空格 ASCII（代码/base64/日志形态）→ 必须达到千级，不能是 1', () => {
    const n = estimateTokens('x'.repeat(20_000));
    // 真实约 5000（4 字符/token）；修复前是 1
    expect(n).toBeGreaterThan(3000);
    expect(n).toBeLessThan(8000);
  });

  it('★ 紧凑 JSON（无空格）也要被正确计价', () => {
    const json = JSON.stringify({ code: 'x'.repeat(4_000), path: '/a/b/c/d/e/f' });
    const n = estimateTokens(json);
    expect(n).toBeGreaterThan(800);
  });

  it('中文按 1.5 字/token（原口径保持）', () => {
    expect(estimateTokens('你好世界')).toBe(6);
    expect(estimateTokens('中文'.repeat(100))).toBe(300);
  });

  it('中英混合：两者分别计价，不互相吞掉', () => {
    // 100 中文（150）+ 400 ASCII 字母（100）= 250
    const n = estimateTokens('中'.repeat(100) + 'a'.repeat(400));
    expect(n).toBe(250);
  });

  it('空串 → 0（不能返回 NaN）', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('单调性：更长的文本必须估出更多 token（这是压缩判据成立的前提）', () => {
    let prev = 0;
    for (const len of [10, 100, 1_000, 10_000, 50_000]) {
      const n = estimateTokens('z'.repeat(len));
      expect(n).toBeGreaterThan(prev);
      prev = n;
    }
  });

  it('反例对照：旧口径对同一输入只算 1 —— 固定根因，防止回退', () => {
    const oldEstimate = (text: string) => {
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const words = text.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
      return Math.ceil(cjk * 1.5 + words * 0.25);
    };
    expect(oldEstimate('x'.repeat(20_000))).toBe(1);
    expect(estimateTokens('x'.repeat(20_000))).toBeGreaterThan(1000);
  });

  it('非 ASCII（日文/emoji）也被计价，不被漏算', () => {
    expect(estimateTokens('ひらがな'.repeat(100))).toBe(400);
    expect(estimateTokens('🎉'.repeat(100))).toBe(100);
  });
});